# MyDHL Express tracking

## Temporary Unified Push mode

Set the backend secret `DHL_LOOKUP_PROVIDER=push` to serve the latest stored
`dhl_push_shipments` notification, without making MyDHL requests. Missing
notifications produce an explicit pending-notification error. Manual refresh in
this mode only reads received notifications; it cannot force DHL to send an event.
Set the secret back to `mydhl` to restore direct MyDHL requests. Do not delete
either integration's credentials.

Push recipient names come from `details.receiver.name`, with `details.consignee.name`
as a fallback. The delivery signatory remains separate from the recipient.
Migration `20260911003000_restore_dhl_push_recipients.sql` recovers receiver names
from original notifications and fills missing saved tracking recipients without
replacing already entered names.

## Direct MyDHL mode

Production tracking uses MyDHL REST with HTTP Basic authentication. Configure
`DHL_MYDHL_USERNAME` and `DHL_MYDHL_PASSWORD` as Supabase secrets only. Do not put
them in Vite variables, source files, artifacts, or GitHub Pages.

Official reference: https://developer.dhl.com/api-reference/dhl-express-mydhl-api

The frontend defaults to `VITE_DHL_LOOKUP_MODE=mydhl`. Set it to `agent` only to
restore the existing Windows agent flow. Unified Push credentials and subscription
are independent and remain unchanged. Existing Unified Pull is a backend fallback
only when MyDHL credentials are absent.

The visible dashboard refreshes pending shipments every five minutes by default.
Delivered shipments are skipped automatically and can still be refreshed manually.
This frontend timer does not run when the dashboard is closed or hidden. Push
continues to receive carrier events independently. This change does not create a
server-side polling scheduler or promise unlimited usage.

The adapter uses physical checkpoints, never request status `Success`, to classify
delivery. Unknown checkpoints retain the carrier description without claiming
delivery. Estimated arrival is shown only when supplied by DHL or previously
entered by the operator. No delivery estimate is inferred from travel time.

Run adapter regression tests with Node 24:

```sh
node --test supabase/functions/resolve-shipping-tracking/mydhl.test.ts
```
