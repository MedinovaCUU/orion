# DHL reconciliation - September 14, 2026

## Evidence

Compared 25 unique guides from the supplied MyDHL screenshots against the
Push snapshot table and per-user shipping rows. Read-only API checks were used;
no shipment states were manufactured from screenshots.

The following 15 guides already existed in Push and in both the owner and Cesar
profiles, with normalized status `en_transito`:

```
5159131950 4036533561 4036521683 4036510424 4036477852
4036472053 7423502332 2620111395 2620104631 7728432121
2620030195 7728402824 2619970592 6205075494 4294084701
```

In this sample, event-to-webhook receipt latency was approximately 7 to 25
minutes. This is observed latency, not a delivery guarantee. Browser refresh
every 15 seconds reads Supabase, not the MyDHL account shipment list.

## Guides without shipment checkpoints

The MyDHL API returned `Success` with zero events for these guides, which the
screenshots label ready to ship:

```
2620060542 7728414186 8363001511 8362997090
4289681690 9280402541 7424126360
```

It returned `No data found` for `5445285484` and `1395035751`.
These results do not establish cancellation, delivery, or physical collection.
Account drafts/labels cannot be assumed to be discoverable through the Push
event feed. Automatic coverage of every MyDHL label remains unverified.

For `6898188054`, the API returned five events, ending August 26 with code `CS`
and description "This is final status for this shipment tracking number."
That text alone is not proof of delivery; it disagrees with the screenshot's
general in-transit label and requires DHL clarification if still operational.

## Deployment regression

Prior isolated-worktree builds used committed HEAD only. Local full-width,
monitoring and model improvements were still uncommitted, so those builds
excluded them. The local source was not deleted. Publish only after the desired
source changes and their dependencies are committed. Check deployed CSS and JS
against the newly built assets, not merely whether the Pages job is green.

The UI now exposes the most recent cloud list read, its count, read errors,
and a manual list reload. The shipment search shows filtered and total counts.
