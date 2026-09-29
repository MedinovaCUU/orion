type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): RecordValue[] => Array.isArray(value) ? value.map(object) : [];
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const area = (value: unknown) => {
  const details = object(value);
  const address = object(details.postalAddress);
  return list(details.serviceArea).map(item => text(item.description)).filter(Boolean).join(', ') ||
    [address.cityName, address.countryCode].filter(Boolean).join(', ');
};

// MyDHL returns request status (Success) separately from physical shipment events.
export function normalizeMyDhlShipment(payload: unknown, trackingNumber: string): RecordValue | null {
  const shipment = list(object(payload).shipments).find(item => text(item.shipmentTrackingNumber) === trackingNumber);
  if (!shipment || text(shipment.status).toLowerCase() !== 'success') return null;
  const normalizeEvents = (source: unknown) => list(source).map(event => {
    const offset = text(event.GMTOffset);
    const timestamp = `${text(event.date)}T${text(event.time)}${offset}`;
    return {
      description: text(event.description),
      timestamp: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timestamp) ? timestamp : '',
      location: { address: { addressLocality: area(event) } },
      typeCode: text(event.typeCode),
      signedBy: text(event.signedBy),
      remark: text(event.remark),
    };
  }).filter(event => event.timestamp).sort((left, right) => {
    const a = Date.parse(left.timestamp);
    const b = Date.parse(right.timestamp);
    return Number.isFinite(a) && Number.isFinite(b) ? b - a : right.timestamp.localeCompare(left.timestamp);
  });
  const events = normalizeEvents(shipment.events);
  const latest = events[0];
  if (!latest) return null;
  const code = latest.typeCode;
  const statusCode = code === 'OK' ? 'delivered' : code === 'WC' ? 'out-for-delivery' :
    ['PU', 'PL', 'AF', 'AR', 'DF'].includes(code) ? 'transit' : '';
  return {
    id: trackingNumber,
    service: 'DHL Express',
    estimatedDeliveryDate: text(shipment.estimatedDeliveryDate),
    status: { ...latest, statusCode },
    origin: { address: { addressLocality: area(shipment.shipperDetails) } },
    destination: { address: { addressLocality: area(shipment.receiverDetails) } },
    details: {
      totalNumberOfPieces: shipment.numberOfPieces,
      weight: { value: shipment.totalWeight, unitText: shipment.unitOfMeasurements === 'imperial' ? 'lb' : shipment.unitOfMeasurements === 'metric' ? 'kg' : '' },
      description: text(shipment.description),
      references: list(shipment.shipperReferences).map(ref => ({ type: ref.typeCode, value: ref.value })),
      consignee: { name: text(object(shipment.receiverDetails).name) },
      proofOfDelivery: { signatory: latest.signedBy },
    },
    pieces: list(shipment.pieces).map(piece => {
      const dimensions = object(piece.dimensions);
      const unit = piece.unitOfMeasurements === 'metric' ? 'kg' : piece.unitOfMeasurements === 'imperial' ? 'lb' : '';
      const sizeUnit = piece.unitOfMeasurements === 'metric' ? 'cm' : piece.unitOfMeasurements === 'imperial' ? 'in' : '';
      return {
        trackingNumber: text(piece.trackingNumber), number: piece.number,
        weightText: typeof piece.weight === 'number' ? `${piece.weight} ${unit}`.trim() : '',
        dimensionsText: [dimensions.length, dimensions.width, dimensions.height].every(value => typeof value === 'number')
          ? `${dimensions.length} × ${dimensions.width} × ${dimensions.height} ${sizeUnit}`.trim() : '',
        events: normalizeEvents(piece.events),
      };
    }),
    events,
  };
}

export async function fetchMyDhlTracking(number: string, username: string, password: string) {
  const params = new URLSearchParams({ trackingView: 'all-checkpoints-with-remarks', levelOfDetail: 'all', requestGMTOffsetPerEvent: 'true' });
  const response = await fetch(`https://express.api.dhl.com/mydhlapi/shipments/${encodeURIComponent(number)}/tracking?${params}`, {
    headers: { Authorization: `Basic ${btoa(`${username}:${password}`)}`, Accept: 'application/json', 'Accept-Language': 'spa' },
    signal: AbortSignal.timeout(20000),
    redirect: 'error',
  });
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'DHL no autorizó la credencial MyDHL. Requiere revisión del administrador.'
      : response.status === 429 ? 'DHL solicita esperar antes de volver a consultar.'
      : response.status === 404 ? 'DHL no encontró información para esta guía.'
      : `DHL no pudo responder a la consulta (HTTP ${response.status}).`;
    throw new Error(message);
  }
  return normalizeMyDhlShipment(await response.json(), number);
}
