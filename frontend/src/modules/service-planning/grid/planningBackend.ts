import type { AbsenceInput, PlanningAbsence } from './planningAbsences';
import type { PlanningTicketRow, TicketWritePayload } from './planningRecord';

// Everything the grid needs from storage. The Supabase implementation talks to the real tables; tests use an
// in-memory one with the same behavior (versions, history, change notifications).

export interface PlanningChange {
  id: string | number;
  ticketId: string;
  ticketSubject: string | null;
  changedAt: string;
  changedBy: string | null;
  changedByName: string | null;
  action: 'insert' | 'update' | 'delete';
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  version: number | null;
}

export type UpdateResult =
  | { status: 'ok'; row: PlanningTicketRow }
  | { status: 'conflict'; row: PlanningTicketRow }
  | { status: 'deleted' }
  | { status: 'forbidden'; message: string }
  | { status: 'error'; message: string };

export type AbsenceSaveResult =
  | { status: 'ok'; absence: PlanningAbsence }
  | { status: 'conflict'; absence: PlanningAbsence | null }
  | { status: 'error'; message: string };

export interface CustomColumn {
  id: string;
  key: string;
  label: string;
  dataType: 'text' | 'number' | 'date' | 'boolean' | 'select';
  options: string[];
  required: boolean;
  width: number | null;
  position: number;
  archivedAt: string | null;
}

export interface GridSettings {
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  hiddenColumns?: string[];
  pinnedColumns?: string[];
  conflictRules?: { sameLocalityIsConflict?: boolean; includeCompanions?: boolean; enabled?: boolean };
  lastViewId?: string | null;
}

export interface SavedView {
  id: string;
  name: string;
  config: SavedViewConfig;
}

export interface SavedViewConfig {
  search?: string;
  filters?: Record<string, string[]>;
  dateFrom?: string;
  dateTo?: string;
  onlyMine?: boolean;
  onlyOpen?: boolean;
  layout?: 'table' | 'calendar';
  hiddenColumns?: string[];
}

export interface PlanningBackend {
  /** Versions are enforced by the database (false while its migration is not applied). */
  readonly capabilities: { versioning: boolean; history: boolean; realtime: boolean; customColumns: boolean; sharedSettings: boolean; absences: boolean };
  loadAll(): Promise<PlanningTicketRow[]>;
  loadByIds(ids: string[]): Promise<PlanningTicketRow[]>;
  update(id: string, expectedVersion: number | null, payload: TicketWritePayload): Promise<UpdateResult>;
  insert(payloads: Array<TicketWritePayload & { estado: string; user_id: string | null }>): Promise<PlanningTicketRow[]>;
  remove(ids: string[]): Promise<string[]>;
  history(ticketId: string): Promise<PlanningChange[]>;
  /** Calls back with the ticket ids someone changed; returns the unsubscribe function. */
  subscribe(onChange: (ticketIds: string[]) => void): () => void;
  listAbsences(): Promise<PlanningAbsence[]>;
  /** Creates (no id) or updates (id + version) an absence; the update only applies over that version. */
  saveAbsence(input: AbsenceInput & { id?: string; version?: number; actorName: string }): Promise<AbsenceSaveResult>;
  deleteAbsence(id: string): Promise<void>;
  /** Calls back when someone adds, changes or removes an absence. */
  subscribeAbsences(onChange: () => void): () => void;
  listCustomColumns(): Promise<CustomColumn[]>;
  saveCustomColumn(column: Omit<CustomColumn, 'id' | 'archivedAt'> & { id?: string }): Promise<CustomColumn>;
  archiveCustomColumn(id: string): Promise<void>;
  loadSettings(): Promise<GridSettings>;
  saveSettings(settings: GridSettings): Promise<void>;
  listViews(): Promise<SavedView[]>;
  saveView(view: Omit<SavedView, 'id'> & { id?: string }): Promise<SavedView>;
  deleteView(id: string): Promise<void>;
}

export const PLANNING_COLUMNS = 'id, user_id, asunto, descripcion, estado, creado_en, numero_serie_equipo, numero_caso';
