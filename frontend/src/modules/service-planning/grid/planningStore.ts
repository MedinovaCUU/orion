import type { PlanningBackend } from './planningBackend';
import { describeAbsenceInput, mergeUpdatePayload, notifiedApproverName, recordLabel, describeUpdate, describeInsert, toPatch, updatePayload, STATUS_TEXT, type ApprovalContext, type ChangeRequest, type UpdatePayload } from './planningApprovals';
import { describeAbsence, type AbsenceInput, type PlanningAbsence } from './planningAbsences';
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
  absences: PlanningAbsence[];
  approval: ApprovalContext;
  requests: ChangeRequest[];
}

type UndoEntry =
  | { kind: 'edit'; id: string; field: PlanningField; before: FieldValue }
  | { kind: 'insert'; ids: string[] }
  | { kind: 'delete'; rows: Array<{ week: PlanningWeek; values: PlanningValues }> }
  | { kind: 'move'; id: string; patch: PlanningPatch }
  | { kind: 'absence'; restore: AbsenceInput }
  | { kind: 'absence-created'; id: string };

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
    absences: [],
    approval: { enabled: false, isApprover: true, approvers: [] },
    requests: [],
  };
  private listeners = new Set<() => void>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private undoStack: UndoEntry[] = [];
  private draftCounter = 0;
  private noticeCounter = 0;
  private remoteQueue = new Set<string>();
  private remoteTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribe: (() => void) | null = null;
  private unsubscribeAbsences: (() => void) | null = null;
  private absenceTimer: ReturnType<typeof setTimeout> | null = null;
  private tempCounter = 0;
  private unsubscribeRequests: (() => void) | null = null;
  private requestTimer: ReturnType<typeof setTimeout> | null = null;
  private requestsLoaded = false;
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
    await this.loadAbsences();
    await this.loadApprovals();
    if (!this.unsubscribeAbsences) {
      this.unsubscribeAbsences = this.backend.subscribeAbsences(() => {
        if (this.absenceTimer) clearTimeout(this.absenceTimer);
        this.absenceTimer = setTimeout(() => void this.loadAbsences(), 250);
      });
    }
  }

  // ----- change requests (approval flow) -----
  /** Only approvers save directly; everyone else's changes become requests. */
  get proposing() {
    return this.snapshot.approval.enabled && !this.snapshot.approval.isApprover;
  }

  async loadApprovals() {
    try {
      const approval = await this.backend.loadApprovalContext();
      this.set({ approval });
      await this.loadRequests();
    } catch {
      // Without the approval tables everybody keeps editing as before.
    }
    if (!this.unsubscribeRequests) {
      this.unsubscribeRequests = this.backend.subscribeRequests(() => {
        if (this.requestTimer) clearTimeout(this.requestTimer);
        this.requestTimer = setTimeout(() => void this.loadRequests(), 250);
      });
    }
  }

  async loadRequests() {
    if (!this.snapshot.approval.enabled) return;
    let requests: ChangeRequest[];
    try {
      requests = await this.backend.listRequests();
    } catch {
      return;
    }
    const previous = new Map(this.snapshot.requests.map((request) => [request.id, request]));
    if (this.requestsLoaded) this.announceRequestChanges(previous, requests);
    this.requestsLoaded = true;
    this.set({ requests });
    this.requestsChanged();
  }

  /** Lets the rest of the app (the tab badge) refresh its count. */
  private requestsChanged() {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('planning-requests-changed'));
  }

  private announceRequestChanges(previous: Map<string, ChangeRequest>, next: ChangeRequest[]) {
    const me = this.ctx.actorId || null;
    const myApprover = this.snapshot.approval.approvers.find((approver) => approver.userId === me);
    for (const request of next) {
      const before = previous.get(request.id);
      const mine = (Boolean(me) && request.requestedBy === me) || request.requestedByName === this.ctx.actorName;
      if (mine && before?.status === 'pending' && request.status !== 'pending' && request.status !== 'cancelled') {
        const who = request.reviewedByName || 'Quien aprueba';
        this.notify(request.status === 'approved' ? 'info' : 'error', `${who}: ${STATUS_TEXT[request.status].toLowerCase()} — ${request.summary}${request.reviewNote ? ` («${request.reviewNote}»)` : ''}`);
      }
      // Approvers who get notifications hear about new requests while they have the planning open.
      if (!before && !mine && request.status === 'pending' && this.snapshot.approval.isApprover && myApprover?.notify) {
        this.notify('info', `Nueva solicitud de ${request.requestedByName}: ${request.summary}`);
      }
    }
  }

  /** The current user's pending request of a kind on a ticket. */
  private ownPending(kind: ChangeRequest['kind'], ticketId: string) {
    return this.snapshot.requests.find((request) => request.kind === kind && request.ticketId === ticketId && request.status === 'pending' && (request.requestedBy === (this.ctx.actorId || null) || request.requestedByName === this.ctx.actorName));
  }

  private ownPendingUpdate(ticketId: string): UpdatePayload | null {
    if (!this.proposing) return null;
    const request = this.ownPending('update', ticketId);
    return request ? updatePayload(request) : null;
  }

  isPendingDelete(ticketId: string) {
    return this.proposing && Boolean(this.ownPending('delete', ticketId));
  }

  private upsertRequestLocally(request: ChangeRequest) {
    this.set({ requests: [request, ...this.snapshot.requests.filter((entry) => entry.id !== request.id)] });
    this.requestsChanged();
  }

  private async submitRequest(request: Parameters<PlanningBackend['saveRequest']>[0]) {
    const first = !this.snapshot.requests.some((entry) => entry.status === 'pending' && entry.requestedByName === this.ctx.actorName);
    const saved = await this.backend.saveRequest(request);
    this.upsertRequestLocally(saved);
    if (first) this.notify('info', `Tu cambio quedó pendiente de aprobación de ${notifiedApproverName(this.snapshot.approval)}.`);
    return saved;
  }

  /** The requester withdraws a pending request. */
  async cancelRequest(id: string) {
    try {
      const saved = await this.backend.reviewRequest(id, 'cancelled', { reviewedByName: this.ctx.actorName });
      this.upsertRequestLocally(saved);
    } catch (error) {
      this.notify('error', error instanceof Error ? error.message : 'No se pudo cancelar la solicitud.');
    }
  }

  /** Approver: applies the request on top of the current data, then records the decision. */
  async approveRequest(request: ChangeRequest, note = '') {
    let appliedResult: Record<string, unknown> = {};
    const evidence = { last_request_id: request.id, last_request_by: request.requestedByName, last_request_approved_by: this.ctx.actorName };
    try {
      if (request.kind === 'update') {
        if (!request.ticketId) throw new Error('La solicitud no indica la actividad.');
        const version = await this.applyNow(request.ticketId, toPatch(updatePayload(request)), evidence);
        appliedResult = { ticket_id: request.ticketId, version };
      } else if (request.kind === 'insert') {
        const payload = request.payload as { week: PlanningWeek; values: PlanningValues };
        const ids = await this.insertValues([{ week: payload.week, values: payload.values, meta: { requested_by_name: request.requestedByName, approved_by_name: this.ctx.actorName, approved_request_id: request.id } }], [], { recordUndo: false });
        if (!ids.length) throw new Error('No se pudo crear la actividad.');
        appliedResult = { ticket_id: ids[0] };
      } else if (request.kind === 'delete') {
        if (!request.ticketId) throw new Error('La solicitud no indica la actividad.');
        if (this.snapshot.records.has(request.ticketId)) {
          const before = this.snapshot.records.size;
          await this.remove([request.ticketId], { recordUndo: false });
          if (this.snapshot.records.size === before) throw new Error('No se pudo eliminar.');
        }
        appliedResult = { ticket_id: request.ticketId, deleted: true };
      } else if (request.kind === 'absence_insert' || request.kind === 'absence_update') {
        const input = (request.payload as { input: AbsenceInput }).input;
        const saved = await this.saveAbsence({ ...input, id: request.kind === 'absence_update' ? request.absenceId || undefined : undefined }, { recordUndo: false });
        if (!saved) throw new Error('No se pudo guardar la ausencia.');
        appliedResult = { absence_id: saved.id };
      } else if (request.kind === 'absence_delete') {
        if (request.absenceId) await this.deleteAbsence(request.absenceId, { recordUndo: false });
        appliedResult = { absence_id: request.absenceId, deleted: true };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo aplicar.';
      await this.decide(request, 'failed', message);
      this.notify('error', `No se pudo aplicar la solicitud de ${request.requestedByName}: ${message}`);
      return false;
    }
    await this.decide(request, 'approved', note, appliedResult);
    return true;
  }

  async rejectRequest(request: ChangeRequest, note = '') {
    await this.decide(request, 'rejected', note);
  }

  async retryRequest(request: ChangeRequest) {
    await this.decide(request, 'pending', '');
  }

  private async decide(request: ChangeRequest, status: ChangeRequest['status'], note: string, appliedResult?: Record<string, unknown>) {
    try {
      const saved = await this.backend.reviewRequest(request.id, status, { reviewedByName: this.ctx.actorName, note, appliedResult });
      this.upsertRequestLocally(saved);
    } catch (error) {
      this.notify('error', error instanceof Error ? `No se registró la decisión: ${error.message}` : 'No se registró la decisión.');
    }
  }

  /** Saves a patch right away over the latest version (approvers applying a request). */
  private async applyNow(id: string, patch: PlanningPatch, extraMeta: Record<string, unknown>) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let record = this.snapshot.records.get(id);
      if (!record || attempt > 0) {
        const [row] = await this.backend.loadByIds([id]);
        if (!row) throw new Error('La actividad ya no existe.');
        record = this.toRecord(row);
      }
      const payload = buildUpdatePayload(record, patch, this.ctx, extraMeta);
      const result = await this.backend.update(id, record.version, payload);
      if (result.status === 'ok') {
        const records = new Map(this.snapshot.records);
        records.set(id, this.toRecord(result.row));
        this.set({ records, lastSavedAt: new Date().toISOString() });
        this.persisted();
        return result.row.planning_version ?? null;
      }
      if (result.status !== 'conflict') throw new Error(result.status === 'deleted' ? 'La actividad ya no existe.' : result.message);
    }
    throw new Error('La actividad cambió mientras se aplicaba; intenta de nuevo.');
  }

  /** Proposed absences of the current user, to show them as "por aprobar". */
  proposedAbsences(): Array<PlanningAbsence & { proposal: 'insert' | 'update' | 'delete'; requestId: string }> {
    if (!this.proposing) return [];
    const mine = this.snapshot.requests.filter((request) => request.status === 'pending' && request.kind.startsWith('absence_') && (request.requestedBy === (this.ctx.actorId || null) || request.requestedByName === this.ctx.actorName));
    return mine.flatMap((request) => {
      const input = (request.payload as { input?: AbsenceInput }).input;
      const original = request.absenceId ? this.snapshot.absences.find((absence) => absence.id === request.absenceId) : null;
      const base = original || null;
      const shown = input && request.kind !== 'absence_delete' ? input : base;
      if (!shown) return [];
      return [{
        id: `req:${request.id}`,
        personId: shown.personId ?? null,
        personName: shown.personName,
        kind: shown.kind,
        startDate: shown.startDate,
        endDate: shown.endDate,
        note: shown.note || '',
        source: 'orion' as const,
        sheetKey: null,
        sheetSyncedAt: null,
        orionEditedAt: null,
        version: 0,
        createdByName: request.requestedByName,
        updatedByName: request.requestedByName,
        updatedAt: request.updatedAt,
        proposal: request.kind === 'absence_insert' ? 'insert' as const : request.kind === 'absence_update' ? 'update' as const : 'delete' as const,
        requestId: request.id,
      }];
    });
  }

  // ----- absences (TXT, vacations…) -----
  async loadAbsences() {
    if (!this.backend.capabilities.absences) return;
    try {
      const absences = await this.backend.listAbsences();
      // Keep the ones being saved right now (temporary ids) until the server answers.
      const pending = this.snapshot.absences.filter((absence) => absence.id.startsWith('tmp-'));
      this.set({ absences: [...absences, ...pending] });
    } catch {
      // The next change or a reload brings them; the planning still works without them.
    }
  }

  async saveAbsence(input: AbsenceInput & { id?: string }, options: { recordUndo?: boolean } = {}) {
    if (this.proposing) {
      const target = input.id ? this.snapshot.absences.find((absence) => absence.id === input.id) : null;
      const { id: _ignored, ...plain } = input;
      void _ignored;
      try {
        await this.submitRequest({
          kind: target ? 'absence_update' : 'absence_insert',
          absenceId: target?.id || null,
          payload: { input: plain } as unknown as Record<string, unknown>,
          baseVersion: target?.version ?? null,
          summary: `${target ? 'Cambiar ausencia' : 'Nueva ausencia'}: ${describeAbsenceInput(plain)}`,
          targetLabel: target ? describeAbsence(target) : describeAbsenceInput(plain),
          requestedByName: this.ctx.actorName,
        });
      } catch (error) {
        this.notify('error', error instanceof Error ? `No se envió a aprobación: ${error.message}` : 'No se envió a aprobación.');
      }
      return null;
    }
    const previous = input.id ? this.snapshot.absences.find((absence) => absence.id === input.id) || null : null;
    this.tempCounter += 1;
    const optimistic: PlanningAbsence = {
      id: previous?.id || `tmp-${this.tempCounter}`,
      personId: input.personId ?? null,
      personName: input.personName,
      kind: input.kind,
      startDate: input.startDate,
      endDate: input.endDate,
      note: input.note,
      source: previous?.source || 'orion',
      sheetKey: previous?.sheetKey || null,
      sheetSyncedAt: previous?.sheetSyncedAt || null,
      orionEditedAt: new Date().toISOString(),
      version: previous?.version || 1,
      createdByName: previous?.createdByName || this.ctx.actorName,
      updatedByName: this.ctx.actorName,
      updatedAt: new Date().toISOString(),
    };
    this.set({ absences: [...this.snapshot.absences.filter((absence) => absence.id !== optimistic.id), optimistic] });
    const result = await this.backend
      .saveAbsence({ ...input, id: previous?.id, version: previous?.version, actorName: this.ctx.actorName })
      .catch((error: unknown) => ({ status: 'error' as const, message: error instanceof Error ? error.message : 'Sin conexión' }));
    if (result.status === 'ok') {
      this.set({ absences: [...this.snapshot.absences.filter((absence) => absence.id !== optimistic.id), result.absence], lastSavedAt: new Date().toISOString() });
      if (!previous && options.recordUndo !== false) this.pushUndo({ kind: 'absence-created', id: result.absence.id });
      return result.absence;
    }
    // Back to what the server has; what the user typed goes in the notice so it is not lost.
    this.set({ absences: this.snapshot.absences.filter((absence) => absence.id !== optimistic.id).concat(previous ? [previous] : []) });
    const typed = `${input.kind} ${input.personName} ${input.startDate}${input.endDate !== input.startDate ? ` al ${input.endDate}` : ''}`;
    if (result.status === 'conflict') {
      this.notify('error', `Otro usuario cambió esa ausencia (o no tienes permiso). No se guardó: ${typed}.`);
      void this.loadAbsences();
    } else {
      this.notify('error', `No se guardó la ausencia (${typed}): ${result.message}`);
    }
    return null;
  }

  async deleteAbsence(id: string, options: { recordUndo?: boolean } = {}) {
    const previous = this.snapshot.absences.find((absence) => absence.id === id);
    if (!previous) return;
    if (this.proposing) {
      try {
        await this.submitRequest({
          kind: 'absence_delete',
          absenceId: id,
          payload: {},
          baseVersion: previous.version,
          summary: `Eliminar ausencia: ${describeAbsence(previous)}`,
          targetLabel: describeAbsence(previous),
          requestedByName: this.ctx.actorName,
        });
      } catch (error) {
        this.notify('error', error instanceof Error ? `No se envió a aprobación: ${error.message}` : 'No se envió a aprobación.');
      }
      return;
    }
    this.set({ absences: this.snapshot.absences.filter((absence) => absence.id !== id) });
    try {
      await this.backend.deleteAbsence(id);
      if (options.recordUndo !== false) this.pushUndo({ kind: 'absence', restore: { personId: previous.personId, personName: previous.personName, kind: previous.kind, startDate: previous.startDate, endDate: previous.endDate, note: previous.note } });
      this.set({ lastSavedAt: new Date().toISOString() });
    } catch (error) {
      this.set({ absences: [...this.snapshot.absences, previous] });
      this.notify('error', error instanceof Error ? `No se eliminó la ausencia: ${error.message}` : 'No se eliminó la ausencia.');
    }
  }

  dispose() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.unsubscribeAbsences?.();
    this.unsubscribeAbsences = null;
    this.unsubscribeRequests?.();
    this.unsubscribeRequests = null;
    if (this.requestTimer) clearTimeout(this.requestTimer);
    if (this.absenceTimer) clearTimeout(this.absenceTimer);
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
    const proposal = this.ownPendingUpdate(record.id);
    const base = proposal ? applyPatchToValues(record.values, proposal.fields) : record.values;
    if (!state) return base;
    return applyPatchToValues(base, { ...(state.inflight || {}), ...state.pending });
  }

  /** Fields the current user proposed and are waiting for approval. */
  proposedFields(id: string): string[] {
    const proposal = this.ownPendingUpdate(id);
    return proposal ? [...Object.keys(proposal.fields), ...(proposal.week ? ['week'] : [])] : [];
  }

  /** The record as the user sees it: a pending move already shows the activity in its new week. */
  displayRecord(record: PlanningRecord): PlanningRecord {
    const state = this.snapshot.rowStates.get(record.id);
    const week = state?.pending.week || state?.inflight?.week || this.ownPendingUpdate(record.id)?.week;
    return week && week.start !== record.week.start ? { ...record, week } : record;
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
      const stored = this.snapshot.records.get(id);
      if (!stored || stored.closed) return;
      // From where the user sees it now (a move not yet saved counts).
      const record = this.displayRecord(stored);
      if (record.week.start === target.start) return;
      const values = this.displayValues(stored);
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
    if (this.proposing) {
      // Not saved: sent (or added to the user's pending request for this activity) for approval.
      const existing = this.ownPending('update', id);
      const merged = mergeUpdatePayload(existing ? updatePayload(existing) : { fields: {} }, inflight);
      try {
        await this.submitRequest({
          id: existing?.id,
          kind: 'update',
          ticketId: id,
          payload: merged as unknown as Record<string, unknown>,
          baseVersion: record.version,
          summary: describeUpdate(record.values, merged, record.week).join(' · ') || 'Cambio en la actividad',
          targetLabel: recordLabel(record.values, record.week),
          requestedByName: this.ctx.actorName,
        });
        const latest = this.snapshot.rowStates.get(id) || emptyRowState();
        this.setRowState(id, { ...latest, inflight: null, base: {}, status: Object.keys(latest.pending).length ? 'pending' : 'idle', error: undefined });
        if (Object.keys(latest.pending).length) void this.flush(id);
      } catch (error) {
        const latest = this.snapshot.rowStates.get(id) || emptyRowState();
        this.setRowState(id, { ...latest, pending: { ...inflight, ...latest.pending }, inflight: null, status: 'error', error: `No se envió a aprobación: ${error instanceof Error ? error.message : 'sin conexión'}` });
      }
      return;
    }
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
    if (this.proposing) {
      try {
        const saved: string[] = [];
        for (const item of items) {
          const request = await this.submitRequest({
            kind: 'insert',
            payload: { week: item.week, values: item.values } as unknown as Record<string, unknown>,
            summary: describeInsert({ week: item.week, values: item.values }).join(' · '),
            targetLabel: recordLabel(item.values, item.week),
            requestedByName: this.ctx.actorName,
          });
          saved.push(`req:${request.id}`);
        }
        this.set({ drafts: this.snapshot.drafts.filter((draft) => !draftIds.includes(draft.id)) });
        return saved;
      } catch (error) {
        const message = `No se envió a aprobación: ${error instanceof Error ? error.message : 'sin conexión'}`;
        if (draftIds.length) draftIds.forEach((id) => this.updateDraft(id, { status: 'error', error: message }));
        else items.forEach((item) => this.addDraftInternal(item.week, item.values, message));
        return [];
      }
    }
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
    if (this.proposing) {
      for (const record of records) {
        if (this.ownPending('delete', record.id)) continue;
        try {
          await this.submitRequest({
            kind: 'delete',
            ticketId: record.id,
            payload: {},
            baseVersion: record.version,
            summary: `Eliminar ${recordLabel(record.values, record.week)}`,
            targetLabel: recordLabel(record.values, record.week),
            requestedByName: this.ctx.actorName,
          });
        } catch (error) {
          this.notify('error', error instanceof Error ? `No se envió a aprobación: ${error.message}` : 'No se envió a aprobación.');
        }
      }
      return;
    }
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
    else if (entry.kind === 'absence') await this.saveAbsence(entry.restore, { recordUndo: false });
    else if (entry.kind === 'absence-created') await this.deleteAbsence(entry.id, { recordUndo: false });
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
