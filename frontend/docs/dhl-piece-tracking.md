# DHL piece-level tracking

Orion retains the master waybill as the shipment record. Piece IDs are children,
not additional orders, and therefore do not inflate shipment dashboard totals.

## Sources

- Unified Push: `details.totalNumberOfPieces`, `details.pieceIds`,
  `events[].pieceIds` and `status.pieceIds`.
- MyDHL: `levelOfDetail=all`, `trackingView=all-checkpoints-with-remarks`,
  GMT offsets requested; `pieces[].trackingNumber` and each piece's own events.
- Reference: https://developer.dhl.com/api-reference/shipment-tracking-unified-push
- MyDHL schema: https://developer.dhl.com/sites/default/files/2026-09/dpdhl-express-api-3.3.2.yaml

The active provider is not changed. Push remains automatic. The enhanced MyDHL
query is used when MyDHL is the configured provider.

## Data integrity

Only events explicitly linked to a piece apply to that piece. Shipment-wide
delivery does not manufacture individual delivery confirmations. The UI warns
when shipment delivery and individual evidence differ. This change does not
rewrite overall shipment status or change retention/assignment permissions.

Piece histories merge without duplication, retain pieces absent from partial
updates, and sort by event timestamp, so late notifications do not become the
latest piece status. Unknown piece counts remain unknown, not zero or one.
Optional weight, dimensions, references and description are shown only when
provided. These fields do not constitute temperature monitoring.

Structured data lives in `payload.shipmentDetails` in both `dhl_push_shipments`
and `shipping_trackings`, under the existing per-user access policies. The
frontend preserves it through loading, local storage and tracking refreshes.

## Recover existing records

Run Node 24+ with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` supplied securely:

```
node tools/backfill-dhl-pieces.mjs
node tools/backfill-dhl-pieces.mjs --apply
```

The first command is read-only. The second enriches existing snapshots from saved
notifications. Its service-only RPC modifies only `shipmentDetails`, with a
received timestamp guard against simultaneous incoming webhook changes.
Run it again if it reports concurrent skips. It does not recreate purged history.
