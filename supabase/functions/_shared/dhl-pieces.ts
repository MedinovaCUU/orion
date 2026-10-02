type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const ids = (value: unknown) => [...new Set(array(value).map(text).filter(Boolean))];
const positive = (value: unknown): number | null => {
  const number = typeof value === 'number' || typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
};
export interface DhlPieceEvent {
  label: string;
  timestamp: string;
  location: string;
  note: string;
  statusCode: string;
}
export interface DhlPiece {
  id: string;
  number: string;
  weight: string;
  dimensions: string;
  events: DhlPieceEvent[];
}
export interface DhlShipmentDetails {
  pieceCount: number | null;
  pieces: DhlPiece[];
  weight: string;
  description: string;
  references: string[];
}
const event = (value: unknown): DhlPieceEvent => {
  const source = record(value);
  return {
    label: text(source.description) || text(source.label),
    timestamp: text(source.timestamp),
    location: text(record(record(source.location).address).addressLocality) || text(source.location),
    note: [text(source.remark), text(source.nextSteps), text(source.note)].filter(Boolean).join(' · '),
    statusCode: text(source.statusCode) || text(source.typeCode),
  };
};
export const mergeDhlPieceEvents = (old: unknown, incoming: unknown): DhlPieceEvent[] => {
  const unique = new Map<string, DhlPieceEvent>();
  for (const raw of [...array(old), ...array(incoming)]) {
    const item = event(raw);
    if (!item.label && !item.statusCode) continue;
    unique.set(JSON.stringify(item), item);
  }
  return [...unique.values()].sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
};
export function readDhlShipmentDetails(value: unknown): DhlShipmentDetails | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = record(value);
  const pieces = array(source.pieces).map(record).filter(piece => text(piece.id)).map(piece => ({
    id: text(piece.id), number: text(piece.number), weight: text(piece.weight), dimensions: text(piece.dimensions),
    events: mergeDhlPieceEvents([], piece.events),
  }));
  const count = positive(source.pieceCount);
  return { pieces, pieceCount: count && Number.isInteger(count) ? count : null, weight: text(source.weight), description: text(source.description), references: ids(source.references) };
}
export function normalizeDhlDetails(shipment: RecordValue, previous?: unknown): DhlShipmentDetails {
  const old = readDhlShipmentDetails(previous);
  const details = record(shipment.details);
  const pieces = new Map((old?.pieces || []).map(piece => [piece.id, piece]));
  const ensure = (id: string): DhlPiece => {
    if (!pieces.has(id)) pieces.set(id, { id, number: '', weight: '', dimensions: '', events: [] });
    return pieces.get(id)!;
  };
  for (const id of ids(details.pieceIds)) ensure(id);
  for (const raw of array(shipment.pieces)) {
    const piece = record(raw);
    const id = text(piece.trackingNumber) || text(piece.id);
    if (!id) continue;
    const current = ensure(id);
    current.number = String(piece.number || current.number);
    current.weight = text(piece.weightText) || current.weight;
    current.dimensions = text(piece.dimensionsText) || current.dimensions;
    current.events = mergeDhlPieceEvents(current.events, piece.events);
  }
  // A shipment-level event is not evidence that every individual piece moved.
  for (const raw of [...array(shipment.events), shipment.status]) {
    const item = record(raw);
    for (const id of ids(item.pieceIds)) {
      const piece = ensure(id);
      piece.events = mergeDhlPieceEvents(piece.events, [item]);
    }
  }
  const count = positive(details.totalNumberOfPieces ?? shipment.numberOfPieces);
  const weight = record(details.weight);
  const weightValue = positive(weight.value);
  const references = array(details.references).map(value => {
    const ref = record(value);
    return [text(ref.type), text(ref.number) || text(ref.value)].filter(Boolean).join(': ');
  }).filter(Boolean);
  return {
    pieceCount: count && Number.isInteger(count) ? count : old?.pieceCount ?? null,
    pieces: [...pieces.values()],
    weight: weightValue ? `${weightValue} ${text(weight.unitText) === 'metric' ? 'kg' : text(weight.unitText)}`.trim() : old?.weight || '',
    description: text(details.description) || text(shipment.description) || old?.description || '',
    references: references.length ? references : old?.references || [],
  };
}
export function dhlPieceStatus(piece: DhlPiece): string {
  const code = piece.events[0]?.statusCode.toLowerCase();
  if (code === 'delivered' || code === 'ok') return 'Entregado';
  if (code === 'out-for-delivery' || code === 'wc') return 'En reparto';
  if (['transit', 'pu', 'pl', 'af', 'ar', 'df'].includes(code || '')) return 'En tránsito';
  if (code === 'failure') return 'Incidencia';
  if (code === 'pre-transit') return 'Registrado';
  return piece.events[0]?.label || 'Sin movimiento individual informado';
}
