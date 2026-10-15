import { supabase } from '../../../supabaseClient';
import {
  PLANNING_COLUMNS,
  type CustomColumn,
  type GridSettings,
  type PlanningBackend,
  type PlanningChange,
  type SavedView,
  type UpdateResult,
} from './planningBackend';
import type { AbsenceKind, PlanningAbsence } from './planningAbsences';
import type { ApprovalContext, ChangeRequest } from './planningApprovals';
import type { PlanningTicketRow, TicketWritePayload } from './planningRecord';

const PAGE_SIZE = 1000;
const PLANNING_MARKER = '%[METADATA_PLANEACION]%';

type PostgrestLikeError = { code?: string; message?: string } | null;

// The migration that adds versions, history and saved views may not be applied yet: the grid then keeps
// working with what exists (no version check, local preferences) and says so, instead of failing.
const isMissingSchema = (error: PostgrestLikeError) =>
  Boolean(error) &&
  (['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error?.code || '') ||
    /does not exist|schema cache|could not find/i.test(error?.message || ''));

const localKey = (name: string, userId: string | null) => `orion.planning-grid.${name}.${userId || 'anon'}`;
const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeLocal = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Preferences are a convenience; private windows may refuse storage.
  }
};

const toChange = (row: Record<string, unknown>): PlanningChange => ({
  id: row.id as number,
  ticketId: row.ticket_id as string,
  ticketSubject: (row.ticket_subject as string) ?? null,
  changedAt: row.changed_at as string,
  changedBy: (row.changed_by as string) ?? null,
  changedByName: (row.changed_by_name as string) ?? null,
  action: row.action as PlanningChange['action'],
  field: (row.field as string) ?? null,
  oldValue: (row.old_value as string) ?? null,
  newValue: (row.new_value as string) ?? null,
  version: (row.version as number) ?? null,
});

const ABSENCE_COLUMNS = 'id, person_id, person_name, kind, start_date, end_date, note, source, sheet_key, sheet_synced_at, orion_edited_at, version, created_by_name, updated_by_name, updated_at';

export const toAbsence = (row: Record<string, unknown>): PlanningAbsence => ({
  id: row.id as string,
  personId: (row.person_id as string) ?? null,
  personName: row.person_name as string,
  kind: row.kind as AbsenceKind,
  startDate: row.start_date as string,
  endDate: row.end_date as string,
  note: (row.note as string) || '',
  source: (row.source as 'orion' | 'sheet') || 'orion',
  sheetKey: (row.sheet_key as string) ?? null,
  sheetSyncedAt: (row.sheet_synced_at as string) ?? null,
  orionEditedAt: (row.orion_edited_at as string) ?? null,
  version: (row.version as number) ?? 1,
  createdByName: (row.created_by_name as string) ?? null,
  updatedByName: (row.updated_by_name as string) ?? null,
  updatedAt: (row.updated_at as string) ?? null,
});

const REQUEST_COLUMNS = 'id, kind, ticket_id, absence_id, payload, base_version, summary, target_label, status, requested_by, requested_by_name, requested_at, updated_at, reviewed_by_name, reviewed_at, review_note';
const DECIDED_WINDOW_DAYS = 30;

const toRequest = (row: Record<string, unknown>): ChangeRequest => ({
  id: row.id as string,
  kind: row.kind as ChangeRequest['kind'],
  ticketId: (row.ticket_id as string) ?? null,
  absenceId: (row.absence_id as string) ?? null,
  payload: (row.payload as Record<string, unknown>) || {},
  baseVersion: (row.base_version as number) ?? null,
  summary: (row.summary as string) || '',
  targetLabel: (row.target_label as string) || '',
  status: row.status as ChangeRequest['status'],
  requestedBy: (row.requested_by as string) ?? null,
  requestedByName: (row.requested_by_name as string) || 'Alguien',
  requestedAt: row.requested_at as string,
  updatedAt: (row.updated_at as string) || (row.requested_at as string),
  reviewedByName: (row.reviewed_by_name as string) ?? null,
  reviewedAt: (row.reviewed_at as string) ?? null,
  reviewNote: (row.review_note as string) ?? null,
});

const toColumn = (row: Record<string, unknown>): CustomColumn => ({
  id: row.id as string,
  key: row.key as string,
  label: row.label as string,
  dataType: row.data_type as CustomColumn['dataType'],
  options: Array.isArray(row.options) ? (row.options as unknown[]).map(String) : [],
  required: Boolean(row.required),
  width: (row.width as number) ?? null,
  position: (row.position as number) ?? 0,
  archivedAt: (row.archived_at as string) ?? null,
});

export const createSupabasePlanningBackend = async (userId: string | null): Promise<PlanningBackend> => {
  // Probe once which parts of the schema exist.
  const [versionProbe, historyProbe, columnsProbe, settingsProbe, absencesProbe, requestsProbe] = await Promise.all([
    supabase.from('tickets').select('planning_version').limit(1),
    supabase.from('planning_changes').select('id').limit(1),
    supabase.from('planning_custom_columns').select('id').limit(1),
    supabase.from('planning_user_settings').select('user_id').limit(1),
    supabase.from('planning_absences').select('id').limit(1),
    supabase.from('planning_change_requests').select('id').limit(1),
  ]);
  const capabilities = {
    versioning: !isMissingSchema(versionProbe.error),
    history: !isMissingSchema(historyProbe.error),
    realtime: !isMissingSchema(historyProbe.error),
    customColumns: !isMissingSchema(columnsProbe.error),
    sharedSettings: !isMissingSchema(settingsProbe.error),
    absences: !isMissingSchema(absencesProbe.error),
    approvals: !isMissingSchema(requestsProbe.error),
  };
  const columns = capabilities.versioning ? `${PLANNING_COLUMNS}, planning_version` : PLANNING_COLUMNS;

  const loadByIds = async (ids: string[]) => {
    const rows: PlanningTicketRow[] = [];
    for (let index = 0; index < ids.length; index += 100) {
      const { data, error } = await supabase.from('tickets').select(columns).in('id', ids.slice(index, index + 100));
      if (error) throw new Error(error.message);
      rows.push(...((data || []) as unknown as PlanningTicketRow[]));
    }
    return rows;
  };

  const backend: PlanningBackend = {
    capabilities,

    async loadAll() {
      const rows: PlanningTicketRow[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('tickets')
          .select(columns)
          .like('descripcion', PLANNING_MARKER)
          .order('id')
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message || 'No se pudo leer la planeación.');
        rows.push(...((data || []) as unknown as PlanningTicketRow[]));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    },

    loadByIds,

    async update(id: string, expectedVersion: number | null, payload: TicketWritePayload): Promise<UpdateResult> {
      let query = supabase.from('tickets').update(payload).eq('id', id);
      if (capabilities.versioning && expectedVersion !== null) query = query.eq('planning_version', expectedVersion);
      const { data, error } = await query.select(columns);
      if (error) return { status: 'error', message: error.message || 'No se pudo guardar.' };
      if (data && data.length === 1) return { status: 'ok', row: data[0] as unknown as PlanningTicketRow };
      // Nothing updated: someone changed it first, it was deleted, or this user may not edit it.
      const [current] = await loadByIds([id]).catch(() => [] as PlanningTicketRow[]);
      if (!current) return { status: 'deleted' };
      if (capabilities.versioning && current.planning_version !== expectedVersion) return { status: 'conflict', row: current };
      return { status: 'forbidden', message: 'Tu usuario no puede modificar esta actividad.' };
    },

    async insert(payloads) {
      const { data, error } = await supabase.from('tickets').insert(payloads).select(columns);
      if (error) throw new Error(error.message || 'No se pudo crear la actividad.');
      return (data || []) as unknown as PlanningTicketRow[];
    },

    async remove(ids: string[]) {
      const { data, error } = await supabase.from('tickets').delete().in('id', ids).select('id');
      if (error) throw new Error(error.message || 'No se pudo eliminar.');
      return (data || []).map((row) => (row as { id: string }).id);
    },

    async history(ticketId: string) {
      if (!capabilities.history) return [];
      const { data, error } = await supabase
        .from('planning_changes')
        .select('id, ticket_id, ticket_subject, changed_at, changed_by, changed_by_name, action, field, old_value, new_value, version')
        .eq('ticket_id', ticketId)
        .order('changed_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data || []).map((row) => toChange(row as Record<string, unknown>));
    },

    subscribe(onChange) {
      if (!capabilities.realtime) return () => undefined;
      const channel = supabase
        .channel(`planning-grid-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'planning_changes' }, (payload) => {
          const ticketId = (payload.new as { ticket_id?: string }).ticket_id;
          if (ticketId) onChange([ticketId]);
        })
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },

    async listAbsences() {
      if (!capabilities.absences) return [];
      const rows: PlanningAbsence[] = [];
      for (let from = 0; ; from += PAGE_SIZE) {
        const { data, error } = await supabase.from('planning_absences').select(ABSENCE_COLUMNS).order('start_date').order('id').range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(error.message);
        rows.push(...(data || []).map((row) => toAbsence(row as Record<string, unknown>)));
        if (!data || data.length < PAGE_SIZE) return rows;
      }
    },

    async saveAbsence(input) {
      if (!capabilities.absences) return { status: 'error', message: 'Falta actualizar la base de datos para guardar ausencias.' };
      const now = new Date().toISOString();
      const row = {
        person_id: input.personId ?? null,
        person_name: input.personName,
        kind: input.kind,
        start_date: input.startDate,
        end_date: input.endDate,
        note: input.note || null,
        updated_by_name: input.actorName,
      };
      if (!input.id) {
        const { data, error } = await supabase
          .from('planning_absences')
          .insert({ ...row, source: 'orion', created_by_name: input.actorName, orion_edited_at: now })
          .select(ABSENCE_COLUMNS)
          .single();
        if (error) return { status: 'error', message: error.message };
        return { status: 'ok', absence: toAbsence(data as Record<string, unknown>) };
      }
      let query = supabase.from('planning_absences').update({ ...row, orion_edited_at: now }).eq('id', input.id);
      if (typeof input.version === 'number') query = query.eq('version', input.version);
      const { data, error } = await query.select(ABSENCE_COLUMNS);
      if (error) return { status: 'error', message: error.message };
      if (data && data.length === 1) return { status: 'ok', absence: toAbsence(data[0] as Record<string, unknown>) };
      const { data: current } = await supabase.from('planning_absences').select(ABSENCE_COLUMNS).eq('id', input.id).maybeSingle();
      return { status: 'conflict', absence: current ? toAbsence(current as Record<string, unknown>) : null };
    },

    async deleteAbsence(id: string) {
      const { data, error } = await supabase.from('planning_absences').delete().eq('id', id).select('id');
      if (error) throw new Error(error.message);
      // RLS answers a forbidden delete with zero rows, not an error.
      if (!data?.length) throw new Error('no tienes permiso para eliminarla o ya no existe');
    },

    subscribeAbsences(onChange) {
      if (!capabilities.absences) return () => undefined;
      const channel = supabase
        .channel(`planning-absences-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_absences' }, () => onChange())
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },

    async loadApprovalContext(): Promise<ApprovalContext> {
      if (!capabilities.approvals) return { enabled: false, isApprover: true, approvers: [] };
      const [{ data: approvers, error }, { data: isApprover }] = await Promise.all([
        supabase.from('planning_approvers').select('user_id, notify, profiles(nombre_completo)'),
        supabase.rpc('is_planning_approver'),
      ]);
      if (error) return { enabled: false, isApprover: true, approvers: [] };
      return {
        enabled: true,
        isApprover: isApprover === true,
        approvers: (approvers || []).map((row) => {
          const entry = row as unknown as { user_id: string; notify: boolean; profiles: { nombre_completo: string | null } | null };
          return { userId: entry.user_id, notify: Boolean(entry.notify), name: entry.profiles?.nombre_completo || 'Aprobador' };
        }),
      };
    },

    async listRequests() {
      if (!capabilities.approvals) return [];
      const since = new Date(Date.now() - DECIDED_WINDOW_DAYS * 86400000).toISOString();
      const { data, error } = await supabase
        .from('planning_change_requests')
        .select(REQUEST_COLUMNS)
        .or(`status.eq.pending,updated_at.gte.${since}`)
        .order('requested_at', { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data || []).map((row) => toRequest(row as Record<string, unknown>));
    },

    async requestsForTicket(ticketId: string) {
      if (!capabilities.approvals) return [];
      const { data, error } = await supabase.from('planning_change_requests').select(REQUEST_COLUMNS).eq('ticket_id', ticketId).order('requested_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return (data || []).map((row) => toRequest(row as Record<string, unknown>));
    },

    async saveRequest(request) {
      const row = {
        kind: request.kind,
        ticket_id: request.ticketId ?? null,
        absence_id: request.absenceId ?? null,
        payload: request.payload,
        base_version: request.baseVersion ?? null,
        summary: request.summary.slice(0, 2000),
        target_label: request.targetLabel,
        requested_by_name: request.requestedByName,
      };
      const { data, error } = request.id
        ? await supabase.from('planning_change_requests').update(row).eq('id', request.id).eq('status', 'pending').select(REQUEST_COLUMNS).single()
        : await supabase.from('planning_change_requests').insert(row).select(REQUEST_COLUMNS).single();
      if (error) throw new Error(error.message);
      return toRequest(data as Record<string, unknown>);
    },

    async reviewRequest(id, status, options) {
      const { data, error } = await supabase
        .from('planning_change_requests')
        .update({ status, reviewed_by_name: options.reviewedByName, review_note: options.note || null, applied_result: options.appliedResult || null })
        .eq('id', id)
        .select(REQUEST_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      return toRequest(data as Record<string, unknown>);
    },

    subscribeRequests(onChange) {
      if (!capabilities.approvals) return () => undefined;
      const channel = supabase
        .channel(`planning-requests-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'planning_change_requests' }, () => onChange())
        .subscribe();
      return () => {
        void supabase.removeChannel(channel);
      };
    },

    async listCustomColumns() {
      if (!capabilities.customColumns) return readLocal<CustomColumn[]>(localKey('columns', null), []);
      const { data, error } = await supabase.from('planning_custom_columns').select('*').is('archived_at', null).order('position');
      if (error) throw new Error(error.message);
      return (data || []).map((row) => toColumn(row as Record<string, unknown>));
    },

    async saveCustomColumn(column) {
      const row = {
        key: column.key,
        label: column.label,
        data_type: column.dataType,
        options: column.options,
        required: column.required,
        width: column.width,
        position: column.position,
        updated_at: new Date().toISOString(),
      };
      if (!capabilities.customColumns) {
        const list = readLocal<CustomColumn[]>(localKey('columns', null), []);
        const saved: CustomColumn = { ...column, id: column.id || column.key, archivedAt: null };
        writeLocal(localKey('columns', null), [...list.filter((entry) => entry.id !== saved.id), saved]);
        return saved;
      }
      const { data, error } = column.id
        ? await supabase.from('planning_custom_columns').update(row).eq('id', column.id).select('*').single()
        : await supabase.from('planning_custom_columns').insert(row).select('*').single();
      if (error) throw new Error(error.message);
      return toColumn(data as Record<string, unknown>);
    },

    async archiveCustomColumn(id: string) {
      if (!capabilities.customColumns) {
        const list = readLocal<CustomColumn[]>(localKey('columns', null), []);
        writeLocal(localKey('columns', null), list.filter((entry) => entry.id !== id));
        return;
      }
      const { error } = await supabase.from('planning_custom_columns').update({ archived_at: new Date().toISOString() }).eq('id', id);
      if (error) throw new Error(error.message);
    },

    async loadSettings() {
      if (!capabilities.sharedSettings || !userId) return readLocal<GridSettings>(localKey('settings', userId), {});
      const { data, error } = await supabase.from('planning_user_settings').select('grid').eq('user_id', userId).maybeSingle();
      if (error) return readLocal<GridSettings>(localKey('settings', userId), {});
      return ((data as { grid?: GridSettings } | null)?.grid || {}) as GridSettings;
    },

    async saveSettings(settings: GridSettings) {
      writeLocal(localKey('settings', userId), settings);
      if (!capabilities.sharedSettings || !userId) return;
      await supabase.from('planning_user_settings').upsert({ user_id: userId, grid: settings, updated_at: new Date().toISOString() });
    },

    async listViews() {
      if (!capabilities.sharedSettings || !userId) return readLocal<SavedView[]>(localKey('views', userId), []);
      const { data, error } = await supabase.from('planning_saved_views').select('id, name, config').order('name');
      if (error) return readLocal<SavedView[]>(localKey('views', userId), []);
      return (data || []) as SavedView[];
    },

    async saveView(view) {
      if (!capabilities.sharedSettings || !userId) {
        const list = readLocal<SavedView[]>(localKey('views', userId), []);
        const saved: SavedView = { ...view, id: view.id || `local-${Date.now()}` };
        writeLocal(localKey('views', userId), [...list.filter((entry) => entry.id !== saved.id && entry.name !== saved.name), saved]);
        return saved;
      }
      const row = { name: view.name, config: view.config, updated_at: new Date().toISOString() };
      const { data, error } = view.id
        ? await supabase.from('planning_saved_views').update(row).eq('id', view.id).select('id, name, config').single()
        : await supabase.from('planning_saved_views').upsert({ ...row, user_id: userId }, { onConflict: 'user_id,name' }).select('id, name, config').single();
      if (error) throw new Error(error.message);
      return data as SavedView;
    },

    async deleteView(id: string) {
      if (!capabilities.sharedSettings || !userId) {
        const list = readLocal<SavedView[]>(localKey('views', userId), []);
        writeLocal(localKey('views', userId), list.filter((entry) => entry.id !== id));
        return;
      }
      const { error } = await supabase.from('planning_saved_views').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
  };

  return backend;
};
