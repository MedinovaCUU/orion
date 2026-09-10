# MyDHL Express tracking

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
