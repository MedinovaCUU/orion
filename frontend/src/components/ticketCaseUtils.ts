export interface CaseNumberRecord {
  id: string;
  numero_caso?: string | null;
}

export const formatCaseNumber = (ticket: CaseNumberRecord) =>
  ticket.numero_caso || ticket.id.slice(0, 6).toUpperCase();
