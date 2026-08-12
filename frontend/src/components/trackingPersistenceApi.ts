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
  refresh_requested_at?: string | null;
  last_agent_id?: string | null;
  last_agent_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CloudTrackingSnapshot {
  entries: TrackingEntry[];
  userId: string;
  queuedEntryIds: string[];
}

export interface TrackingAgentHealth {
  agentId: string;
  hostname: string;
  version: string;
  status: 'online' | 'busy' | 'degraded' | 'offline';
  currentTrackingNumber: string;
  lastError: string;
  lastSeenAt: string;
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
      'id, user_id, tracking_number, carrier, status, fulfillment_state, payload, last_lookup_at, refresh_requested_at, last_agent_id, last_agent_seen_at, created_at, updated_at',
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
    queuedEntryIds: (data || [])
      .filter((row) => Boolean((row as ShippingTrackingRow).refresh_requested_at))
      .map((row) => String((row as ShippingTrackingRow).id)),
  };
};

export const requestCloudTrackingRefresh = async (entryId: string) => {
  const { data, error } = await supabase.rpc('request_shipping_tracking_refresh', {
    p_tracking_id: entryId,
  });

  if (error) {
    throw new Error(`No fue posible solicitar la actualización: ${error.message}`);
  }

  return String(data || new Date().toISOString());
};

export const loadTrackingAgentHealth = async (): Promise<TrackingAgentHealth | null> => {
  const { data, error } = await supabase
    .from('tracking_agents')
    .select('agent_id, hostname, version, status, current_tracking_number, last_error, last_seen_at')
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`No fue posible leer el estado del agente DHL: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return {
    agentId: String(data.agent_id || ''),
    hostname: String(data.hostname || ''),
    version: String(data.version || ''),
    status: data.status as TrackingAgentHealth['status'],
    currentTrackingNumber: String(data.current_tracking_number || ''),
    lastError: String(data.last_error || ''),
    lastSeenAt: String(data.last_seen_at || ''),
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
