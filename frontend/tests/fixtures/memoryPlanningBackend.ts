import type { CustomColumn, GridSettings, PlanningBackend, PlanningChange, SavedView, UpdateResult } from '../../src/modules/service-planning/grid/planningBackend';
import type { PlanningAbsence } from '../../src/modules/service-planning/grid/planningAbsences';
import type { ChangeRequest } from '../../src/modules/service-planning/grid/planningApprovals';
import type { PlanningTicketRow, TicketWritePayload } from '../../src/modules/service-planning/grid/planningRecord';

// Test double of the planning tables: same contract as the Supabase backend (version check, history,
// change notifications to other tabs), stored in localStorage so a reload keeps what was saved.

const KEY = 'pgrid-memory';
type Store = { rows: PlanningTicketRow[]; history: PlanningChange[]; columns: CustomColumn[]; settings: GridSettings; views: SavedView[]; seq: number; absences?: PlanningAbsence[]; requests?: ChangeRequest[] };

// Like the database seed: Sofía approves and is notified, the owner approves without notifications.
const APPROVERS = [
  { userId: 'p6', name: 'Sofia Ceballos', notify: true },
  { userId: 'p1', name: 'Ricardo Montañez', notify: false },
];

const read = (): Store => {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    // fall through to an empty store
  }
  return { rows: [], history: [], columns: [], settings: {}, views: [], seq: 0 };
};
const write = (store: Store) => localStorage.setItem(KEY, JSON.stringify(store));

// The same field keys the database trigger logs (supabase/migrations/20261015010000_planning_grid.sql).
const line = (description: string | null, label: string) => ((description || '').split('[METADATA_PLANEACION]')[0].match(new RegExp(`${label}: ([^\n]*)`)) || [])[1] || null;
const metaOf = (description: string | null) => {
  try {
    return JSON.parse((description || '').split('[METADATA_PLANEACION]')[1] || '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
};
const text = (value: unknown) => (value == null || value === '' ? null : Array.isArray(value) ? value.join(', ') || null : String(value));
const fieldValues = (row: PlanningTicketRow): Record<string, string | null> => {
  const meta = metaOf(row.descripcion);
  return {
    tipo: text(meta.service_type),
    plataforma: text(row.asunto.replace(/^\[PLAN\]\s*/, '').split(' - ')[1]),
    localidad: line(row.descripcion, 'Cliente/Localidad'),
    observaciones: line(row.descripcion, 'Observaciones'),
    numero_serie: text(row.numero_serie_equipo),
    ingeniero: text(meta.ingeniero_csv),
    acompanantes: text(meta.companions_csv),
    semana: text(meta.fecha_tentativa),
    fecha_programada: text(meta.scheduled_date),
    dias: text(meta.scheduled_day),
    estados: text(meta.status_values),
  };
};
const delay = () => new Promise((resolve) => setTimeout(resolve, 25));

export interface MemoryControls {
  failNext: number;
  actorName: string;
  externalEdit: (id: string, change: (row: PlanningTicketRow) => PlanningTicketRow, actorName?: string, notify?: boolean) => void;
  rows: () => PlanningTicketRow[];
  absences: () => PlanningAbsence[];
  requests: () => ChangeRequest[];
}

export const resetMemoryStore = (rows: PlanningTicketRow[], absences: PlanningAbsence[] = []) => write({ rows, history: [], columns: [], settings: {}, views: [], seq: 0, absences });

export const createMemoryBackend = (actorName: string): { backend: PlanningBackend; controls: MemoryControls } => {
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(KEY) : null;
  const listeners = new Set<(ids: string[]) => void>();
  const absenceListeners = new Set<() => void>();
  const requestListeners = new Set<() => void>();
  const isApprover = APPROVERS.some((approver) => approver.name === actorName);
  channel?.addEventListener('message', (event) => {
    if (event.data === 'requests') requestListeners.forEach((listener) => listener());
    else if (event.data === 'absences') absenceListeners.forEach((listener) => listener());
    else listeners.forEach((listener) => listener(event.data as string[]));
  });
  const announceAbsences = () => channel?.postMessage('absences');
  const announceRequests = () => {
    channel?.postMessage('requests');
    requestListeners.forEach((listener) => listener());
  };
  const visible = (request: ChangeRequest) => isApprover || request.requestedBy === actorName;
  const announce = (ids: string[]) => channel?.postMessage(ids);

  const log = (store: Store, row: PlanningTicketRow, action: PlanningChange['action'], who: string, field: string | null = null, oldValue: string | null = null, newValue: string | null = null) => {
    store.seq += 1;
    store.history.unshift({ id: store.seq, ticketId: row.id, ticketSubject: row.asunto, changedAt: new Date().toISOString(), changedBy: null, changedByName: who, action, field, oldValue, newValue, version: row.planning_version ?? null });
  };

  const controls: MemoryControls = {
    failNext: 0,
    actorName,
    externalEdit(id, change, who = 'Diego Garcia Garcia', notify = true) {
      const store = read();
      const index = store.rows.findIndex((row) => row.id === id);
      if (index < 0) return;
      const before = store.rows[index];
      const after = { ...change(before), planning_version: (before.planning_version || 1) + 1 };
      store.rows[index] = after;
      log(store, after, 'update', who, 'externo', null, null);
      write(store);
      if (!notify) return; // the live notification is late: the next save must detect the conflict
      announce([id]);
      listeners.forEach((listener) => listener([id]));
    },
    rows: () => read().rows,
    absences: () => read().absences || [],
    requests: () => read().requests || [],
  };

  const backend: PlanningBackend = {
    capabilities: { versioning: true, history: true, realtime: true, customColumns: true, sharedSettings: true, absences: true, approvals: !new URLSearchParams(location.search).has('noapprovals') },
    async loadAll() {
      await delay();
      return read().rows;
    },
    async loadByIds(ids) {
      await delay();
      return read().rows.filter((row) => ids.includes(row.id));
    },
    async update(id: string, expectedVersion: number | null, payload: TicketWritePayload): Promise<UpdateResult> {
      await delay();
      if (controls.failNext > 0) {
        controls.failNext -= 1;
        return { status: 'error', message: 'Sin conexión (prueba)' };
      }
      const store = read();
      const index = store.rows.findIndex((row) => row.id === id);
      if (index < 0) return { status: 'deleted' };
      const current = store.rows[index];
      if (expectedVersion !== null && current.planning_version !== expectedVersion) return { status: 'conflict', row: current };
      const next = { ...current, ...payload, planning_version: (current.planning_version || 1) + 1 } as PlanningTicketRow;
      store.rows[index] = next;
      const before = fieldValues(current);
      const after = fieldValues(next);
      Object.keys(after).forEach((field) => {
        if (before[field] !== after[field]) log(store, next, 'update', controls.actorName, field, before[field], after[field]);
      });
      write(store);
      announce([id]);
      return { status: 'ok', row: next };
    },
    async insert(payloads) {
      await delay();
      if (controls.failNext > 0) {
        controls.failNext -= 1;
        throw new Error('Sin conexión (prueba)');
      }
      const store = read();
      const created = payloads.map((payload) => ({
        id: crypto.randomUUID(),
        creado_en: new Date().toISOString(),
        numero_caso: null,
        planning_version: 1,
        ...payload,
      })) as PlanningTicketRow[];
      store.rows.push(...created);
      created.forEach((row) => log(store, row, 'insert', controls.actorName));
      write(store);
      announce(created.map((row) => row.id));
      return created;
    },
    async remove(ids) {
      await delay();
      const store = read();
      const removed = store.rows.filter((row) => ids.includes(row.id));
      store.rows = store.rows.filter((row) => !ids.includes(row.id));
      removed.forEach((row) => log(store, row, 'delete', controls.actorName));
      write(store);
      announce(ids);
      return removed.map((row) => row.id);
    },
    async history(ticketId) {
      await delay();
      return read().history.filter((change) => change.ticketId === ticketId);
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    async listAbsences() {
      await delay();
      return read().absences || [];
    },
    async saveAbsence(input) {
      await delay();
      if (controls.failNext > 0) {
        controls.failNext -= 1;
        return { status: 'error', message: 'Sin conexión (prueba)' };
      }
      const store = read();
      const list = store.absences || [];
      const now = new Date().toISOString();
      const fields = { personId: input.personId ?? null, personName: input.personName, kind: input.kind, startDate: input.startDate, endDate: input.endDate, note: input.note || '', updatedByName: input.actorName, updatedAt: now, orionEditedAt: now };
      let saved: PlanningAbsence;
      if (!input.id) {
        saved = { id: crypto.randomUUID(), source: 'orion', sheetKey: null, sheetSyncedAt: null, version: 1, createdByName: input.actorName, ...fields };
        list.push(saved);
      } else {
        const index = list.findIndex((entry) => entry.id === input.id);
        if (index < 0 || (typeof input.version === 'number' && list[index].version !== input.version)) return { status: 'conflict', absence: index < 0 ? null : list[index] };
        saved = { ...list[index], ...fields, version: list[index].version + 1 };
        list[index] = saved;
      }
      store.absences = list;
      write(store);
      announceAbsences();
      return { status: 'ok', absence: saved };
    },
    async deleteAbsence(id) {
      await delay();
      const store = read();
      store.absences = (store.absences || []).filter((entry) => entry.id !== id);
      write(store);
      announceAbsences();
    },
    subscribeAbsences(onChange) {
      absenceListeners.add(onChange);
      return () => absenceListeners.delete(onChange);
    },
    async loadApprovalContext() {
      if (!backend.capabilities.approvals) return { enabled: false, isApprover: true, approvers: [] };
      return { enabled: true, isApprover, approvers: APPROVERS };
    },
    async listRequests() {
      await delay();
      return (read().requests || []).filter(visible);
    },
    async requestsForTicket(ticketId) {
      await delay();
      return (read().requests || []).filter((request) => request.ticketId === ticketId && visible(request));
    },
    async saveRequest(request) {
      await delay();
      const store = read();
      const list = store.requests || [];
      const now = new Date().toISOString();
      let saved: ChangeRequest;
      if (request.id) {
        const index = list.findIndex((entry) => entry.id === request.id && entry.status === 'pending' && entry.requestedBy === actorName);
        if (index < 0) throw new Error('La solicitud ya no está pendiente.');
        saved = { ...list[index], payload: request.payload, summary: request.summary, targetLabel: request.targetLabel, baseVersion: request.baseVersion ?? null, updatedAt: now };
        list[index] = saved;
      } else {
        saved = {
          id: crypto.randomUUID(), kind: request.kind, ticketId: request.ticketId ?? null, absenceId: request.absenceId ?? null, payload: request.payload,
          baseVersion: request.baseVersion ?? null, summary: request.summary, targetLabel: request.targetLabel, status: 'pending', requestedBy: actorName,
          requestedByName: request.requestedByName, requestedAt: now, updatedAt: now, reviewedByName: null, reviewedAt: null, reviewNote: null,
        };
        list.push(saved);
      }
      store.requests = list;
      write(store);
      announceRequests();
      return saved;
    },
    async reviewRequest(id, status, options) {
      await delay();
      if (!isApprover && status !== 'cancelled') throw new Error('Solo quien aprueba la planeación puede decidir.');
      const store = read();
      const list = store.requests || [];
      const index = list.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error('No existe la solicitud.');
      const now = new Date().toISOString();
      list[index] = { ...list[index], status, reviewedByName: options.reviewedByName, reviewedAt: status === 'pending' ? null : now, reviewNote: options.note || null, updatedAt: now };
      store.requests = list;
      write(store);
      announceRequests();
      return list[index];
    },
    subscribeRequests(onChange) {
      requestListeners.add(onChange);
      return () => requestListeners.delete(onChange);
    },
    async listCustomColumns() {
      return read().columns;
    },
    async saveCustomColumn(column) {
      const store = read();
      const saved: CustomColumn = { ...column, id: column.id || crypto.randomUUID(), archivedAt: null };
      store.columns = [...store.columns.filter((entry) => entry.id !== saved.id), saved];
      write(store);
      return saved;
    },
    async archiveCustomColumn(id) {
      const store = read();
      store.columns = store.columns.filter((entry) => entry.id !== id);
      write(store);
    },
    async loadSettings() {
      return read().settings;
    },
    async saveSettings(settings) {
      const store = read();
      store.settings = settings;
      write(store);
    },
    async listViews() {
      return read().views;
    },
    async saveView(view) {
      const store = read();
      const saved: SavedView = { ...view, id: view.id || crypto.randomUUID() };
      store.views = [...store.views.filter((entry) => entry.id !== saved.id && entry.name !== saved.name), saved];
      write(store);
      return saved;
    },
    async deleteView(id) {
      const store = read();
      store.views = store.views.filter((entry) => entry.id !== id);
      write(store);
    },
  };
  return { backend, controls };
};
