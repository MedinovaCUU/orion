import { normalizeDhlPushStatus } from './dhl-status.ts';

for (const [input, expected] of [
  [{ status: 'WC', statusCode: 'transit', description: 'WITH DELIVERING COURIER' }, 'en_reparto'],
  [{ status: 'CC', statusCode: 'transit', description: 'AWAITING CONSIGNEE COLLECTION' }, 'en_reparto'],
  [{ status: 'OK', description: 'DELIVERY' }, 'entregado'],
  [{ statusCode: 'delivered', description: 'Envío entregado' }, 'entregado'],
  [{ description: 'Not delivered' }, 'incidencia'],
  [{ description: 'ON HOLD' }, 'incidencia'],
  [{ statusCode: 'transit', nextSteps: 'Shipment will be delivered tomorrow' }, 'en_transito'],
  [{ description: 'SHIPMENT ACCEPTANCE' }, 'en_transito'],
] as const) {
  Deno.test(JSON.stringify(input), () => {
    const actual = normalizeDhlPushStatus(input);
    if (actual !== expected) throw new Error(`Expected ${expected}, got ${actual}`);
  });
}
