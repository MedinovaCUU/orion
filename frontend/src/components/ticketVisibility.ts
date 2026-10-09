import { extractPlaneacionMeta, type PlanningMetadata } from './servicesPlanning.ts';

export interface TicketVisibilityRecord {
  id: string;
  user_id: string | null;
  descripcion: string | null;
}

export interface TicketViewer {
  userId: string | null;
  role: string | null | undefined;
  fullName: string | null | undefined;
  assignedTicketIds: ReadonlySet<string>;
}

export const EMPTY_TICKET_VIEWER: TicketViewer = { userId: null, role: null, fullName: null, assignedTicketIds: new Set() };

// Only administrators see the whole inbox; everyone else sees the cases tied to them.
export const viewerSeesAllTickets = (role: string | null | undefined) => role === 'admin';

const personKey = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// Planning stores people as "Nombre Uno / Nombre Dos"; companions may arrive as an array.
const splitPeople = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.flatMap(splitPeople);
  if (typeof value !== 'string') return [];
  return value.split(/\/|,|;|\sy\s/gi).map((part) => part.trim()).filter(Boolean);
};

// People named by the planning metadata: responsible engineers plus companions. Null for support cases.
export const planningPeopleOnTicket = (description: string | null | undefined) => {
  const meta = extractPlaneacionMeta(description) as (PlanningMetadata & { companions_csv?: unknown }) | null;
  if (!meta) return null;
  return [...splitPeople(meta.ingeniero_csv), ...splitPeople(meta.companions_csv)];
};

// A case belongs to the viewer when it is explicitly assigned, was registered under their user
// (own support cases and planning where they lead), or the planning names them by profile name.
export const isTicketVisibleToViewer = (ticket: TicketVisibilityRecord, viewer: TicketViewer) => {
  if (viewerSeesAllTickets(viewer.role)) return true;
  if (!viewer.userId) return false;
  if (viewer.assignedTicketIds.has(ticket.id) || ticket.user_id === viewer.userId) return true;
  const viewerKey = personKey(viewer.fullName);
  if (!viewerKey) return false;
  const people = planningPeopleOnTicket(ticket.descripcion);
  return Boolean(people?.some((person) => personKey(person) === viewerKey));
};

export const filterTicketsForViewer = <T extends TicketVisibilityRecord>(tickets: T[], viewer: TicketViewer) =>
  viewerSeesAllTickets(viewer.role) ? tickets : tickets.filter((ticket) => isTicketVisibleToViewer(ticket, viewer));
