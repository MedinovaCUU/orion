// The inbox only downloads its working set; older cases are searched on the server one page at a
// time (supabase/migrations/20261013070000_ticket_archive_search.sql).
export const TICKET_INBOX_DAYS = 30;
export const ARCHIVE_PAGE_SIZE = 20;
export const ARCHIVE_MIN_QUERY = 2;

export type ArchiveStatus = 'todos' | 'abiertos' | 'cerrados';
export type ArchiveScope = 'todos' | 'soporte' | 'planeacion';

export interface ArchiveCriteria {
  query: string;
  status: ArchiveStatus;
  scope: ArchiveScope;
  from: string;
  to: string;
}

export const EMPTY_ARCHIVE_CRITERIA: ArchiveCriteria = { query: '', status: 'todos', scope: 'todos', from: '', to: '' };

// Open cases plus anything opened, updated or closed since this instant stay in the inbox.
export const inboxSince = (nowMs = Date.now()) => new Date(nowMs - TICKET_INBOX_DAYS * 86_400_000).toISOString();

// A search runs once there is something to look for; browsing the whole archive is an explicit choice.
export const archiveHasCriteria = (criteria: ArchiveCriteria) =>
  criteria.query.trim().length >= ARCHIVE_MIN_QUERY
  || criteria.status !== 'todos' || criteria.scope !== 'todos' || Boolean(criteria.from || criteria.to);

export const archiveDatesInvalid = (criteria: ArchiveCriteria) => Boolean(criteria.from && criteria.to && criteria.from > criteria.to);

export const archiveRpcArgs = (criteria: ArchiveCriteria, page: number) => ({
  p_query: criteria.query.trim().length >= ARCHIVE_MIN_QUERY ? criteria.query.trim() : null,
  p_status: criteria.status,
  p_scope: criteria.scope,
  p_from: criteria.from || null,
  p_to: criteria.to || null,
  p_limit: ARCHIVE_PAGE_SIZE,
  p_offset: Math.max(0, page - 1) * ARCHIVE_PAGE_SIZE,
});

export const archivePageCount = (total: number) => Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));

// PostgREST answers PGRST202 when the function is not deployed yet (migration pending).
export const isMissingRpc = (error: { code?: string } | null | undefined) => error?.code === 'PGRST202' || error?.code === '42883';

export interface ArchiveRow<T> {
  ticket: T;
  total_count: number | string;
}

export const unpackArchiveRows = <T>(rows: ArchiveRow<T>[] | null | undefined) => ({
  tickets: (rows || []).map((row) => row.ticket),
  total: Number(rows?.[0]?.total_count ?? 0),
});
