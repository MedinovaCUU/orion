export const canOpenTicketControl = (role: string | null | undefined) => role === 'admin';
// Explicit assignments only: creator, role, territory and equipment ownership
// are not reliable evidence that the user is responsible for this ticket.
export function assignedAlertEntries<T extends { id: string }>(entries: T[], assignedIds: ReadonlySet<string>, userId: string | null) {
  return userId ? entries.filter(entry => assignedIds.has(entry.id)) : [];
}
