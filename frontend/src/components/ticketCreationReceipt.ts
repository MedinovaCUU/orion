export function ticketCreationMessage(receipt: { numero_caso?: string | null; responsable?: string | null } | null): string {
  const confirmed = receipt?.numero_caso ? `Ticket ${receipt.numero_caso} levantado correctamente.` : 'Ticket levantado correctamente.';
  if (!receipt) return `${confirmed} No fue posible consultar la asignación; revisa el seguimiento del ticket.`;
  return `${confirmed} ${receipt.responsable ? `Dará seguimiento: ${receipt.responsable}.` : 'Pendiente de asignación; todavía no hay un responsable designado.'}`;
}
