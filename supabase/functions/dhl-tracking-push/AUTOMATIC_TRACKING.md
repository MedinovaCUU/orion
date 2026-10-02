# Automatic DHL tracking

The snapshot table is populated by the existing account Push subscription. A
database trigger inserts each newly notified guide into shipping_trackings for
approved dhl_tracking_subscribers. Registration does not depend on an open browser.
DHL must send a first notification; this is not a guarantee of notification at
label creation time.

Warehouse membership is controlled by user_module_permissions.is_warehouse.
Saving this flag in Permissions enables the tracking subpermission, subscribes
the user and imports existing unexpired snapshots. Revocation removes automatic
copies except explicitly assigned guides. The existing permissions owner remains
subscribed independently of the warehouse flag. Cesar Ibarra was explicitly
enrolled at the user's request; other staff must be marked by administration.

The owner-only assign_dhl_tracking RPC assigns a received guide to a specific
profile and grants tracking access without subscribing that person to the whole
account feed. Duplicate assignment is idempotent. Assignments are removed with
their expired snapshot.

Delivered snapshots have a stable delivered_at timestamp. The server job runs
every 15 minutes and deletes DHL tracking rows, matching event records, assignments
and snapshots once delivery is at least seven days old. Browser restoration guards
prevent old delivered copies from returning. Pending shipments are not purged.
Managed rows are protected against bulk deletion by outdated browser clients.

Transactional probes in migrations verify import fan-out, duplicate notifications,
retention, assignment authorization and preservation of individual assignments
when warehouse membership is revoked. Test fixture changes roll back.
