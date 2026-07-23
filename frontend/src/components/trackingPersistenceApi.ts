import { getValidatedUser, supabase } from '../supabaseClient';
import { coerceTrackingEntry, type TrackingEntry } from './orionTracking';

const TRACKING_TABLE = 'shipping_trackings';

interface ShippingTrackingRow {
  id: string;
  user_id: string;
  tracking_number: string;
  carrier: TrackingEntry['carrier'];
  status: TrackingEntry['status'];
  fulfillment_state: TrackingEntry['fulfillmentState'];
  payload: Record<string, unknown>;
  last_lookup_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudTrackingSnapshot {
  entries: TrackingEntry[];
  userId: string;
}

const toShippingTrackingRow = (entry: TrackingEntry, userId: string): ShippingTrackingRow => ({
  id: entry.id,
  user_id: userId,
  tracking_number: entry.trackingNumber,
  carrier: entry.carrier,
  status: entry.status,
  fulfillment_state: entry.fulfillmentState,
  payload: entry as unknown as Record<string, unknown>,
  last_lookup_at: entry.lastLookupAt || null,
  created_at: entry.createdAt,
  updated_at: entry.updatedAt,
});

const fromShippingTrackingRow = (row: ShippingTrackingRow) =>
  coerceTrackingEntry({
    ...row.payload,
    id: row.id,
    trackingNumber: row.tracking_number,
    carrier: row.carrier,
    status: row.status,
    fulfillmentState: row.fulfillment_state,
    lastLookupAt: row.last_lookup_at || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

export const loadCloudTrackingEntries = async (): Promise<CloudTrackingSnapshot> => {
  const user = await getValidatedUser();
  if (!user) {
    throw new Error('No hay una sesión válida para recuperar los trackings guardados.');
  }

  const { data, error } = await supabase
    .from(TRACKING_TABLE)
    .select(
      'id, user_id, tracking_number, carrier, status, fulfillment_state, payload, last_lookup_at, created_at, updated_at',
    )
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`No fue posible recuperar los trackings de Supabase: ${error.message}`);
  }

  return {
    userId: user.id,
    entries: (data || [])
      .map((row) => fromShippingTrackingRow(row as ShippingTrackingRow))
      .filter((entry): entry is TrackingEntry => Boolean(entry)),
  };
};

export const replaceCloudTrackingEntries = async (userId: string, entries: TrackingEntry[]) => {
  if (entries.length > 0) {
    const { error: upsertError } = await supabase
      .from(TRACKING_TABLE)
      .upsert(entries.map((entry) => toShippingTrackingRow(entry, userId)), {
        onConflict: 'user_id,tracking_number',
      });

    if (upsertError) {
      throw new Error(`No fue posible guardar los trackings en Supabase: ${upsertError.message}`);
    }
  }

  const { data: persistedRows, error: selectError } = await supabase
    .from(TRACKING_TABLE)
    .select('id, tracking_number')
    .eq('user_id', userId);

  if (selectError) {
    throw new Error(`No fue posible verificar los trackings guardados: ${selectError.message}`);
  }

  const activeTrackingNumbers = new Set(entries.map((entry) => entry.trackingNumber));
  const staleIds = (persistedRows || [])
    .filter((row) => !activeTrackingNumbers.has(String(row.tracking_number || '')))
    .map((row) => String(row.id));

  if (staleIds.length === 0) {
    return;
  }

  const { error: deleteError } = await supabase
    .from(TRACKING_TABLE)
    .delete()
    .eq('user_id', userId)
    .in('id', staleIds);

  if (deleteError) {
    throw new Error(`No fue posible retirar trackings eliminados de Supabase: ${deleteError.message}`);
  }
};
