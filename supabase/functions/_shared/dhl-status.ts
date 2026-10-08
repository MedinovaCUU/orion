export function normalizeDhlPushStatus(status: Record<string, unknown>) {
  const code = String(status.status || '').toUpperCase();
  const text = [status.simplifiedStatus, status.divisionalStatus, status.statusCode, status.description]
    .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/not delivered|no entregado|delivery failed|unsuccessful|failure|exception/.test(text)) return 'incidencia';
  if (code === 'OK' || /\bdelivered\b|\bentregado\b/.test(text)) return 'entregado';
  if (['WC', 'CC'].includes(code) || /with delivering courier|with delivery courier|out.for.delivery|awaiting consignee collection|ready for collection|en reparto|disponible para recolectar/.test(text)) return 'en_reparto';
  if (/on hold|failed|incidencia|incidente|contacte a dhl|demora|retenido/.test(text)) return 'incidencia';
  if (/pre.transit|label created|information received|informacion recibida|guia.*cread|aun no ha sido recolectado/.test(text)) return 'etiqueta_generada';
  if (/transit|processed|depart|arriv|picked up|shipment pickup|shipment acceptance|transito/.test(text)) return 'en_transito';
  return 'pendiente_consulta';
}
