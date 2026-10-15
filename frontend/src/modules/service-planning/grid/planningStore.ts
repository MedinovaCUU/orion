import type { PlanningBackend } from './planningBackend';
import {
  applyPatchToValues,
  buildInsertPayload,
  buildUpdatePayload,
  emptyValues,
  getFieldValue,
  isRequiredMissing,
  movePatch,
  sameValue,
  toPlanningRecord,
  type FieldValue,
  type PlanningContext,
  type PlanningField,
  type PlanningPatch,
  type PlanningRecord,
  type PlanningTicketRow,
  type PlanningValues,
} from './planningRecord';
import type { PlanningWeek } from './planningWeeks';

// Optimistic editing with per-row save queues. A save always carries the version the user edited; when someone
// else saved first, fields they did not touch are merged automatically and fields both changed become a
// conflict the user resolves. Nothing is overwritten silently and typed values are never dropped.

export type RowSaveStatus = 'idle' | 'pending' | 'saving' | 'error' | 'conflict';

export interface FieldConflict {
  field: PlanningField;
  mine: FieldValue;
  theirs: FieldValue;
  by: string;
}

export interface RowState {
  pending: PlanningPatch;
  inflight: PlanningPatch | null;
  base: Partial<Record<PlanningField, FieldValue>>;
  status: RowSaveStatus;
  error?: string;
  conflicts: FieldConflict[];
  attempts: number;
}

export interface DraftRow {
  id: string;
  week: PlanningWeek;
  values: PlanningValues;
  order: number;
  status: 'editing' | 'saving' | 'error';
  error?: string;
}

export interface StoreNotice {
  id: number;
  tone: 'info' | 'error';
  text: string;
}

export interface PlanningSnapshot {
  loading: boolean;
  loadError: string | null;
  records: Map<string, PlanningRecord>;
  rowStates: Map<string, RowState>;
  drafts: DraftRow[];
  lastSavedAt: string | null;
  notices: StoreNotice[];
  remoteChangedIds: Set<string>;
  canUndo: boolean;
}

type UndoEntry =
  | { kind: 'edit'; id: string; field: PlanningField; before: FieldValue }
  | { kind: 'insert'; ids: string[] }
  | { kind: 'delete'; rows: Array<{ week: PlanningWeek; values: PlanningValues }> }
  | { kind: 'move'; id: string; patch: PlanningPatch };

const SAVE_DELAY_MS = 120;
const RETRY_DELAYS_MS = [2000, 6000, 15000];

const emptyRowState = (): RowState => ({ pending: {}, inflight: null, base: {}, status: 'idle', conflicts: [], attempts: 0 });

export class PlanningStore {
  private snapshot: PlanningSnapshot = {
    loading: true,
    loadError: null,
    records: new Map(),
    rowStates: new Map(),
    drafts: [],
    lastSavedAt: null,
    notices: [],
    remoteChangedIds: new Set(),
    canUndo: false,
  };
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private undoStack: UndoEntry[] = [];
  private draftCounter = 0;
  private noticeCounter = 0;
  private remoteQueue = new Set<string>();
  private remoteTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private changeListeners = new Set<() => void>();
  readonly backend: PlanningBackend;
  private ctx: PlanningContext;

  constructor(backend: PlanningBackend, ctx: PlanningContext) {
    this.backend = backend;
    this.ctx = ctx;
  }

  // ----- subscription (useSyncExternalStore) -----
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  /** Called after any persisted change, so other Planeación views can refresh. */
  onPersisted(listener: () => void) {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  private set(partial: Partial<PlanningSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial, canUndo: this.undoStack.length > 0 };
    this.listeners.forEach((listener) => listener());
  }

  private persisted() {
    this.changeListeners.forEach((listener) => listener());
  }

  setContext(ctx: PlanningContext) {
    const profilesChanged = ctx.profiles !== this.ctx.profiles || ctx.equipments !== this.ctx.equipments;
    this.ctx = ctx;
    if (profilesChanged && this.snapshot.records.size) {
      const records = new Map<string, PlanningRecord>();
      this.snapshot.records.forEach((record, id) => records.set(id, toPlanningRecord(record.row, ctx.profiles, ctx.equipments)));
      this.set({ records });
    }
  }

  // ----- loading and live updates -----
  async load() {
    this.set({ loading: true, loadError: null });
    try {
      const rows = await this.backend.loadAll();
      const records = new Map<string, PlanningRecord>();
      rows.forEach((row) => records.set(row.id, this.toRecord(row)));
      this.set({ loading: false, records });
    } catch (error) {
      this.set({ loading: false, loadError: error instanceof Error ? error.message : 'No se pudo leer la planeación.' });
    }
    if (!this.unsubscribe) this.unsubscribe = this.backend.subscribe((ids) => this.queueRemote(ids));
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.timers.forEach((timer) => clearTimeout(timer));
    if (this.remoteTimer) clearTimeout(this.remoteTimer);
  }

  private toRecord(row: PlanningTicketRow) {
    return toPlanningRecord(row, this.ctx.profiles, this.ctx.equipments);
  }

  private queueRemote(ids: string[]) {
    ids.forEach((id) => this.remoteQueue.add(id));
    if (this.remoteTimer) return;
    this.remoteTimer = setTimeout(() => {
      this.remoteTimer = null;
      const batch = Array.from(this.remoteQueue);
      this.remoteQueue.clear();
      void this.applyRemote(batch);
    }, 250);
  }

  async refreshIds(ids: string[]) {
    await this.applyRemote(ids);
  }

  private async applyRemote(ids: string[]) {
    let rows: PlanningTicketRow[];
    try {
      rows = await this.backend.loadByIds(ids);
    } catch {
      return; // The next change or a reload brings it; nothing local is lost.
    }
    const records = new Map(this.snapshot.records);
    const remoteChangedIds = new Set(this.snapshot.remoteChangedIds);
    const found = new Set(rows.map((row) => row.id));
    let changed = false;
    for (const row of rows) {
      if (!(row.descripcion || '').includes('[METADATA_PLANEACION]')) continue;
      const current = records.get(row.id);
      if (current && current.version !== null && row.planning_version != null && row.planning_version <= current.version) continue;
      if (current && current.version === null && current.row.descripcion === row.descripcion && current.row.asunto === row.asunto && current.row.estado === row.estado) continue;
      const state = this.snapshot.rowStates.get(row.id);
      records.set(row.id, this.toRecord(row));
      if (current && !state?.inflight) remoteChangedIds.add(row.id);
      changed = true;
    }
    for (const id of ids) {
      if (found.has(id) || !records.has(id)) continue;
      const record = records.get(id)!;
      const state = this.snapshot.rowStates.get(id);
      records.delete(id);
      changed = true;
      if (state && Object.keys(state.pending).length) {
        // Someone deleted it while this user had unsaved edits: keep them as a new row to save again.
        this.addDraftInternal(record.week, applyPatchToValues(record.values, state.pending), 'Otro usuario eliminó esta actividad; revisa y guarda de nuevo.');
      }
    }
    if (changed) {
      this.set({ records, remoteChangedIds });
      setTimeout(() => {
        const next = new Set(this.snapshot.remoteChangedIds);
        rows.forEach((row) => next.delete(row.id));
        this.set({ remoteChangedIds: next });
      }, 2500);
    }
  }

  // ----- reading -----
  displayValues(record: PlanningRecord): PlanningValues {
    const state = this.snapshot.rowStates.get(record.id);
    if (!state) return record.values;
    return applyPatchToValues(record.values, { ...(state.inflight || {}), ...state.pending });
  }

  // ----- editing existing rows -----
  edit(id: string, field: PlanningField, value: FieldValue, options: { recordUndo?: boolean } = {}) {
    const draft = this.snapshot.drafts.find((entry) => entry.id === id);
    if (draft) {
      this.editDraft(id, field, value);
      return;
    }
    const record = this.snapshot.records.get(id);
    if (!record || record.closed) return;
    const current = getFieldValue({ values: this.displayValues(record) }, field);
    if (sameValue(current, value)) return;
    if (options.recordUndo !== false) this.pushUndo({ kind: 'edit', id, field, before: current });
    const state = { ...(this.snapshot.rowStates.get(id) || emptyRowState()) };
    state.pending = { ...state.pending, [field]: value };
    if (!(field in state.base)) state.base = { ...state.base, [field]: getFieldValue(record, field) };
    state.conflicts = state.conflicts.filter((conflict) => conflict.field !== field);
    if (state.status !== 'saving') state.status = state.conflicts.length ? 'conflict' : 'pending';
    this.setRowState(id, state);
    this.scheduleSave(id);
  }

  move(ids: string[], target: PlanningWeek) {
    ids.forEach((id) => {
      const record = this.snapshot.records.get(id);
      if (!record || record.closed || record.week.start === target.start) return;
      const values = this.displayValues(record);
      const patch = movePatch({ ...record, values }, target);
      this.pushUndo({ kind: 'move', id, patch: movePatch({ ...record, week: target, values: applyPatchToValues(values, patch) }, record.week) });
      this.patch(id, patch);
    });
  }

  reorder(id: string, order: number) {
    this.patch(id, { order });
  }

  private patch(id: string, patch: PlanningPatch) {
    const record = this.snapshot.records.get(id);
    if (!record) return;
    const state = { ...(this.snapshot.rowStates.get(id) || emptyRowState()) };
    for (const [field, value] of Object.entries(patch)) {
      if (field !== 'week' && field !== 'order' && !(field in state.base)) state.base = { ...state.base, [field]: getFieldValue(record, field as PlanningField) };
      state.pending = { ...state.pending, [field]: value };
    }
    if (state.status !== 'saving') state.status = 'pending';
    this.setRowState(id, state);
    this.scheduleSave(id);
  }

  private setRowState(id: string, state: RowState) {
    const rowStates = new Map(this.snapshot.rowStates);
    if (state.status === 'idle' && !Object.keys(state.pending).length && !state.inflight) rowStates.delete(id);
    else rowStates.set(id, state);
    this.set({ rowStates });
  }

  private scheduleSave(id: string, delay = SAVE_DELAY_MS) {
    const existing = this.timers.get(id);
    if (existing) clearTimeout(existing);
    this.timers.set(id, setTimeout(() => {
      this.timers.delete(id);
      void this.flush(id);
    }, delay));
  }

  /** Saves everything pending now (used before leaving the page and by tests). */
  async flushAll() {
    const ids = Array.from(this.snapshot.rowStates.keys());
    await Promise.all(ids.map((id) => this.flush(id)));
  }

  private async flush(id: string): Promise<void> {
    const state = this.snapshot.rowStates.get(id);
    const record = this.snapshot.records.get(id);
    if (!state || !record || state.inflight || state.status === 'conflict' || !Object.keys(state.pending).length) return;
    const inflight = state.pending;
    this.setRowState(id, { ...state, pending: {}, inflight, status: 'saving', error: undefined });
    const payload = buildUpdatePayload(record, inflight, this.ctx);
    const result = await this.backend.update(id, record.version, payload).catch((error: unknown) => ({
      status: 'error' as const,
      message: error instanceof Error ? error.message : 'Sin conexión',
    }));
    const latest = this.snapshot.rowStates.get(id) || emptyRowState();

    if (result.status === 'ok') {
      const records = new Map(this.snapshot.records);
      records.set(id, this.toRecord(result.row));
      const base = { ...latest.base };
      Object.keys(inflight).forEach((field) => {
        if (!(field in latest.pending)) delete base[field as PlanningField];
      });
      const pendingLeft = Object.keys(latest.pending).length > 0;
      this.snapshot = { ...this.snapshot, records };
      this.setRowState(id, { ...latest, inflight: null, base, status: pendingLeft ? 'pending' : 'idle', attempts: 0, error: undefined });
      this.set({ lastSavedAt: new Date().toISOString() });
      this.persisted();
      if (pendingLeft) void this.flush(id);
      return;
    }

    // Put the values back in the queue: whatever happens next, they are not lost.
    const pending = { ...inflight, ...latest.pending };

    if (result.status === 'conflict') {
      const server = this.toRecord(result.row);
      const records = new Map(this.snapshot.records);
      records.set(id, server);
      this.snapshot = { ...this.snapshot, records };
      const conflicts: FieldConflict[] = [];
      for (const field of Object.keys(inflight) as PlanningField[]) {
        if (field === ('week' as PlanningField) || field === ('order' as PlanningField)) continue;
        const theirs = getFieldValue(server, field);
        const base = latest.base[field];
        if (sameValue(theirs, base) || sameValue(theirs, pending[field])) continue;
        conflicts.push({ field, mine: pending[field] as FieldValue, theirs, by: server.updatedBy || 'otro usuario' });
      }
      // Fields the other person did not touch are reapplied on top of their version.
      const base = { ...latest.base };
      Object.keys(pending).forEach((field) => {
        if (!conflicts.some((conflict) => conflict.field === field)) base[field as PlanningField] = getFieldValue(server, field as PlanningField);
      });
      this.setRowState(id, { ...latest, pending, inflight: null, base, conflicts, status: conflicts.length ? 'conflict' : 'pending', error: undefined });
      if (!conflicts.length) void this.flush(id);
      return;
    }

    if (result.status === 'deleted') {
      const records = new Map(this.snapshot.records);
      records.delete(id);
      const rowStates = new Map(this.snapshot.rowStates);
      rowStates.delete(id);
      this.snapshot = { ...this.snapshot, records, rowStates };
      this.addDraftInternal(record.week, applyPatchToValues(record.values, pending), 'Otro usuario eliminó esta actividad; revisa y guarda de nuevo.');
      return;
    }

    const message = result.status === 'forbidden' ? result.message : `No se pudo guardar: ${result.message}`;
    const attempts = latest.attempts + 1;
    this.setRowState(id, { ...latest, pending, inflight: null, status: 'error', error: message, attempts });
    if (result.status === 'error' && attempts <= RETRY_DELAYS_MS.length) {
      this.scheduleSave(id, RETRY_DELAYS_MS[attempts - 1]);
      setTimeout(() => {
        const current = this.snapshot.rowStates.get(id);
        if (current?.status === 'error') this.setRowState(id, { ...current, status: 'pending' });
      }, RETRY_DELAYS_MS[attempts - 1] - 10);
    }
  }

  retry(id: string) {
    const state = this.snapshot.rowStates.get(id);
    if (!state) return;
    this.setRowState(id, { ...state, status: 'pending', attempts: 0, error: undefined });
    void this.flush(id);
  }

  discard(id: string) {
    const rowStates = new Map(this.snapshot.rowStates);
    rowStates.delete(id);
    this.set({ rowStates });
  }

  resolveConflict(id: string, field: PlanningField, choice: 'mine' | 'theirs') {
    const state = this.snapshot.rowStates.get(id);
    const record = this.snapshot.records.get(id);
    if (!state || !record) return;
    const pending = { ...state.pending };
    const base = { ...state.base };
    if (choice === 'theirs') {
      delete pending[field];
      delete base[field];
    } else {
      base[field] = getFieldValue(record, field);
    }
    const conflicts = state.conflicts.filter((conflict) => conflict.field !== field);
    const status: RowSaveStatus = conflicts.length ? 'conflict' : Object.keys(pending).length ? 'pending' : 'idle';
    this.setRowState(id, { ...state, pending, base, conflicts, status });
    if (status === 'pending') void this.flush(id);
  }

  // ----- new rows -----
  private addDraftInternal(week: PlanningWeek, values: PlanningValues, error?: string, order?: number) {
    this.draftCounter += 1;
    const draft: DraftRow = {
      id: `draft-${this.draftCounter}`,
      week,
      values,
      order: order ?? Number.MAX_SAFE_INTEGER - 1000 + this.draftCounter,
      status: error ? 'error' : 'editing',
      error,
    };
    this.set({ drafts: [...this.snapshot.drafts, draft] });
    return draft.id;
  }

  /** `order` places the new row among the week's rows (between two neighbours when inserting). */
  addDraft(week: PlanningWeek, values: Partial<PlanningValues> = {}, order?: number) {
    return this.addDraftInternal(week, { ...emptyValues(), ...values }, undefined, order);
  }

  editDraft(id: string, field: PlanningField, value: FieldValue) {
    this.set({
      drafts: this.snapshot.drafts.map((draft) =>
        draft.id === id ? { ...draft, values: applyPatchToValues(draft.values, { [field]: value }), status: draft.status === 'saving' ? 'saving' : 'editing', error: undefined } : draft,
      ),
    });
  }

  discardDraft(id: string) {
    this.set({ drafts: this.snapshot.drafts.filter((draft) => draft.id !== id) });
  }

  isDraftEmpty(id: string) {
    const draft = this.snapshot.drafts.find((entry) => entry.id === id);
    if (!draft) return true;
    const empty = emptyValues();
    return (Object.keys(empty) as Array<keyof PlanningValues>).every((key) => key === 'serviceType' || key === 'priority' || sameValue(draft.values[key] as FieldValue, empty[key] as FieldValue)) &&
      !Object.values(draft.values.custom).some(Boolean);
  }

  /** Saves the draft when it has what it needs; returns the new activity id. */
  async commitDraft(id: string): Promise<string | null> {
    const draft = this.snapshot.drafts.find((entry) => entry.id === id);
    if (!draft || draft.status === 'saving') return null;
    if (this.isDraftEmpty(id)) {
      this.discardDraft(id);
      return null;
    }
    if (isRequiredMissing(draft.values)) {
      this.updateDraft(id, { status: 'error', error: 'Falta la localidad o cliente.' });
      return null;
    }
    const order = draft.order < Number.MAX_SAFE_INTEGER - 100000 ? draft.order : undefined;
    const [created] = await this.insertValues([{ week: draft.week, values: draft.values, order }], [id]);
    return created || null;
  }

  private updateDraft(id: string, partial: Partial<DraftRow>) {
    this.set({ drafts: this.snapshot.drafts.map((draft) => (draft.id === id ? { ...draft, ...partial } : draft)) });
  }

  /** Inserts several activities at once (paste, duplicate, import). Drafts listed in draftIds are replaced. */
  async insertValues(items: Array<{ week: PlanningWeek; values: PlanningValues; order?: number; meta?: Record<string, unknown> }>, draftIds: string[] = [], options: { recordUndo?: boolean } = {}) {
    draftIds.forEach((id) => this.updateDraft(id, { status: 'saving', error: undefined }));
    const payloads = items.map((item) => buildInsertPayload(item.values, item.week, this.ctx, item.order, item.meta));
    try {
      const rows: PlanningTicketRow[] = [];
      for (let index = 0; index < payloads.length; index += 50) rows.push(...(await this.backend.insert(payloads.slice(index, index + 50))));
      const records = new Map(this.snapshot.records);
      rows.forEach((row) => records.set(row.id, this.toRecord(row)));
      this.set({ records, drafts: this.snapshot.drafts.filter((draft) => !draftIds.includes(draft.id)), lastSavedAt: new Date().toISOString() });
      if (options.recordUndo !== false && rows.length) this.pushUndo({ kind: 'insert', ids: rows.map((row) => row.id) });
      this.persisted();
      return rows.map((row) => row.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo crear.';
      if (draftIds.length) draftIds.forEach((id) => this.updateDraft(id, { status: 'error', error: message }));
      else items.forEach((item) => this.addDraftInternal(item.week, item.values, message));
      return [];
    }
  }

  async duplicate(ids: string[], target?: PlanningWeek) {
    const items = ids
      .map((id) => this.snapshot.records.get(id))
      .filter((record): record is PlanningRecord => Boolean(record))
      .map((record) => {
        const values = this.displayValues(record);
        if (!target) return { week: record.week, values: { ...values, statuses: values.statuses.filter((status) => status !== 'realizado') } };
        const moved = applyPatchToValues(values, movePatch({ ...record, values }, target));
        return { week: target, values: { ...moved, statuses: moved.statuses.filter((status) => status !== 'realizado') } };
      });
    return this.insertValues(items);
  }

  async remove(ids: string[], options: { recordUndo?: boolean } = {}) {
    const records = ids.map((id) => this.snapshot.records.get(id)).filter((record): record is PlanningRecord => Boolean(record) && !record!.closed);
    if (!records.length) return;
    try {
      const removed = await this.backend.remove(records.map((record) => record.id));
      const next = new Map(this.snapshot.records);
      const rowStates = new Map(this.snapshot.rowStates);
      removed.forEach((id) => {
        next.delete(id);
        rowStates.delete(id);
      });
      this.set({ records: next, rowStates, lastSavedAt: new Date().toISOString() });
      if (options.recordUndo !== false) {
        this.pushUndo({ kind: 'delete', rows: records.filter((record) => removed.includes(record.id)).map((record) => ({ week: record.week, values: this.displayValues(record) })) });
      }
      if (removed.length < records.length) this.notify('error', 'Algunas actividades no se pudieron eliminar (permiso o ya no existen).');
      this.persisted();
    } catch (error) {
      this.notify('error', error instanceof Error ? error.message : 'No se pudo eliminar.');
    }
  }

  // ----- undo -----
  private pushUndo(entry: UndoEntry) {
    this.undoStack.push(entry);
    if (this.undoStack.length > 100) this.undoStack.shift();
  }

  async undo() {
    const entry = this.undoStack.pop();
    this.set({});
    if (!entry) return;
    if (entry.kind === 'edit') this.edit(entry.id, entry.field, entry.before, { recordUndo: false });
    else if (entry.kind === 'move') this.patch(entry.id, entry.patch);
    else if (entry.kind === 'insert') await this.remove(entry.ids, { recordUndo: false });
    else await this.insertValues(entry.rows, [], { recordUndo: false });
  }

  // ----- notices -----
  notify(tone: StoreNotice['tone'], text: string) {
    this.noticeCounter += 1;
    const notice = { id: this.noticeCounter, tone, text };
    this.set({ notices: [...this.snapshot.notices, notice].slice(-4) });
    setTimeout(() => this.dismissNotice(notice.id), tone === 'error' ? 9000 : 4000);
  }

  dismissNotice(id: number) {
    this.set({ notices: this.snapshot.notices.filter((notice) => notice.id !== id) });
  }

  // ----- sync indicator -----
  syncSummary() {
    let pending = 0;
    let saving = 0;
    let errors = 0;
    let conflicts = 0;
    this.snapshot.rowStates.forEach((state) => {
      if (state.status === 'pending') pending += 1;
      if (state.status === 'saving') saving += 1;
      if (state.status === 'error') errors += 1;
      if (state.status === 'conflict') conflicts += 1;
    });
    this.snapshot.drafts.forEach((draft) => {
      if (draft.status === 'saving') saving += 1;
      if (draft.status === 'error') errors += 1;
    });
    return { pending, saving, errors, conflicts };
  }
}
