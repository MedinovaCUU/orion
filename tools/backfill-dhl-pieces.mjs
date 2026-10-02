import { normalizeDhlDetails } from '../supabase/functions/_shared/dhl-pieces.ts';

const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY outside source control.');
const apply = process.argv.includes('--apply');
async function request(path, body) {
  const response = await fetch(`${base}/rest/v1/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`Supabase HTTP ${response.status}`);
  return response.json();
}
async function pages(table, query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const page = await request(`${table}?${query}&limit=500&offset=${offset}`);
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}
const snapshots = await pages('dhl_push_shipments', 'select=tracking_number,received_at,payload&order=tracking_number');
let enriched = 0, skippedConcurrent = 0, pieceCount = 0;
for (const snapshot of snapshots) {
  const query = new URLSearchParams({ select: 'payload', order: 'received_at.asc,event_hash.asc', payload: `cs.${JSON.stringify({ shipments: [{ id: snapshot.tracking_number }] })}` });
  const events = await pages('dhl_push_events', query);
  let details = snapshot.payload.shipmentDetails;
  for (const row of events) for (const shipment of row.payload.shipments || []) {
    if (shipment.id === snapshot.tracking_number) details = normalizeDhlDetails(shipment, details);
  }
  if (!details || !details.pieces.length && !details.pieceCount) continue;
  pieceCount += details.pieces.length;
  if (apply) {
    const updated = await request('rpc/backfill_dhl_piece_details', { guide: snapshot.tracking_number, expected_received_at: snapshot.received_at, details });
    if (!updated) { skippedConcurrent++; continue; }
  }
  enriched++;
}
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', snapshots: snapshots.length, enriched, pieceCount, skippedConcurrent }));
