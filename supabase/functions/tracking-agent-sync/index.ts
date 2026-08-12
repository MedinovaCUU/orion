import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-tracking-agent-token',
  'Access-Control-Max-Age': '86400',
};

type AgentAction = 'heartbeat' | 'claim' | 'report' | 'download';

interface AgentRequest {
  action?: AgentAction;
  agentId?: string;
  hostname?: string;
  version?: string;
  status?: 'online' | 'busy' | 'degraded' | 'offline';
  currentTrackingNumber?: string;
  error?: string;
  limit?: number;
  jobId?: string;
  result?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  fileName?: string;
}

interface ShippingTrackingRow {
  id: string;
  user_id: string;
  tracking_number: string;
  carrier: string | null;
  status: string;
  fulfillment_state: string;
  payload: Record<string, unknown> | null;
  refresh_requested_at: string | null;
}

const TRACKING_STATUSES = new Set([
  'capturado',
  'pendiente_consulta',
  'etiqueta_generada',
  'en_transito',
  'en_reparto',
  'entregado',
  'incidencia',
]);

const jsonRes = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });

const compact = (value: unknown) => String(value || '').trim();

const safeAgentId = (value: unknown) => compact(value).replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120);

const timingSafeEqual = (left: string, right: string) => {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let mismatch = leftBytes.length ^ rightBytes.length;

  for (let index = 0; index < length; index += 1) {
    mismatch |= (leftBytes[index] || 0) ^ (rightBytes[index] || 0);
  }

  return mismatch === 0;
};

const normalizeTimeline = (value: unknown) =>
  Array.isArray(value)
    ? value.slice(0, 100).map((event) => {
        const item = event && typeof event === 'object' ? (event as Record<string, unknown>) : {};
        return {
          label: compact(item.label).slice(0, 1000),
          location: compact(item.location).slice(0, 500),
          timestamp: compact(item.timestamp).slice(0, 100),
          note: compact(item.note).slice(0, 2000),
        };
      })
    : [];

const buildUpdatedPayload = (
  row: ShippingTrackingRow,
  result: Record<string, unknown>,
  lookedUpAt: string,
) => {
  const current = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const resultStatus = compact(result.status);
  const status = TRACKING_STATUSES.has(resultStatus) ? resultStatus : row.status;
  const success = result.ok === true && TRACKING_STATUSES.has(resultStatus);

  if (!success) {
    return {
      ...current,
      lookupError: compact(result.error || 'DHL no devolvió un estado utilizable.').slice(0, 2000),
      lastLookupAt: lookedUpAt,
      updatedAt: lookedUpAt,
    };
  }

  const fulfillmentState = status === 'entregado' ? 'entregado' : 'pendiente';
  const useResult = (key: string, fallback = '') => compact(result[key]) || compact(current[key]) || fallback;

  return {
    ...current,
    carrier: 'dhl',
    trackingNumber: row.tracking_number,
    status,
    fulfillmentState,
    portalStatusText: useResult('portalStatusText'),
    lastEventLabel: useResult('lastEventLabel', useResult('portalStatusText')),
    lastEventAt: useResult('lastEventAt'),
    estimatedDelivery: useResult('estimatedDelivery'),
    recipient: useResult('recipient'),
    origin: useResult('origin'),
    destination: useResult('destination'),
    serviceType: useResult('serviceType'),
    deliveryProofName: useResult('deliveryProofName'),
    timeline: normalizeTimeline(result.timeline),
    rawEvidenceText: useResult('rawSummary', compact(current.rawEvidenceText)).slice(0, 6000),
    lookupError: '',
    lastLookupAt: lookedUpAt,
    updatedAt: lookedUpAt,
  };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return jsonRes(204, {});
  }

  if (request.method !== 'POST') {
    return jsonRes(405, { ok: false, error: 'Método no permitido.' });
  }

  const configuredToken = compact(Deno.env.get('TRACKING_AGENT_TOKEN'));
  const suppliedToken = compact(request.headers.get('x-tracking-agent-token'));
  if (!configuredToken || !suppliedToken || !timingSafeEqual(configuredToken, suppliedToken)) {
    return jsonRes(401, { ok: false, error: 'Credencial de agente inválida.' });
  }

  let body: AgentRequest;
  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return jsonRes(400, { ok: false, error: 'El cuerpo no contiene JSON válido.' });
  }

  const agentId = safeAgentId(body.agentId);
  if (!agentId) {
    return jsonRes(400, { ok: false, error: 'Falta agentId.' });
  }

  const supabaseUrl = compact(Deno.env.get('SUPABASE_URL'));
  const serviceRoleKey = compact(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonRes(500, { ok: false, error: 'El backend del agente no tiene acceso a Supabase.' });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  try {
    if (body.action === 'download') {
      const fileName = compact(body.fileName);
      if (!/^[A-Za-z0-9_.-]+\.zip$/.test(fileName)) {
        return jsonRes(400, { ok: false, error: 'Nombre de instalador inválido.' });
      }

      const { data, error } = await serviceClient.storage
        .from('tracking-agent-installers')
        .createSignedUrl(fileName, 24 * 60 * 60, { download: fileName });

      if (error || !data?.signedUrl) {
        throw error || new Error('No fue posible crear el enlace privado del instalador.');
      }

      return jsonRes(200, {
        ok: true,
        signedUrl: data.signedUrl,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    if (body.action === 'heartbeat') {
      const { error } = await serviceClient.from('tracking_agents').upsert({
        agent_id: agentId,
        hostname: compact(body.hostname || agentId).slice(0, 200),
        version: compact(body.version || 'unknown').slice(0, 50),
        status: body.status || 'online',
        current_tracking_number: compact(body.currentTrackingNumber).slice(0, 100) || null,
        last_error: compact(body.error).slice(0, 2000) || null,
        last_seen_at: now,
        metadata: body.metadata || {},
      });

      if (error) {
        throw error;
      }

      return jsonRes(200, { ok: true, serverTime: now });
    }

    if (body.action === 'claim') {
      const { data, error } = await serviceClient.rpc('claim_dhl_tracking_jobs', {
        p_agent_id: agentId,
        p_limit: Math.max(1, Math.min(Number(body.limit) || 5, 20)),
      });

      if (error) {
        throw error;
      }

      const jobs = ((data || []) as ShippingTrackingRow[]).map((row) => ({
        id: row.id,
        trackingNumber: row.tracking_number,
        carrier: row.carrier,
        manualRefresh: Boolean(row.refresh_requested_at),
      }));

      return jsonRes(200, { ok: true, jobs, serverTime: now });
    }

    if (body.action === 'report') {
      const jobId = compact(body.jobId);
      if (!jobId || !body.result || typeof body.result !== 'object') {
        return jsonRes(400, { ok: false, error: 'El reporte requiere jobId y result.' });
      }

      const { data: row, error: fetchError } = await serviceClient
        .from('shipping_trackings')
        .select('id, user_id, tracking_number, carrier, status, fulfillment_state, payload, refresh_requested_at')
        .eq('id', jobId)
        .eq('agent_lock_id', agentId)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }
      if (!row) {
        return jsonRes(409, { ok: false, error: 'El trabajo expiró o fue reclamado por otro agente.' });
      }

      const typedRow = row as ShippingTrackingRow;
      const result = body.result;
      const payload = buildUpdatedPayload(typedRow, result, now);
      const resultStatus = compact(result.status);
      const succeeded = result.ok === true && TRACKING_STATUSES.has(resultStatus);
      const status = succeeded ? resultStatus : typedRow.status;
      const fulfillmentState = succeeded
        ? status === 'entregado'
          ? 'entregado'
          : 'pendiente'
        : typedRow.fulfillment_state;

      const { error: updateError } = await serviceClient
        .from('shipping_trackings')
        .update({
          status,
          fulfillment_state: fulfillmentState,
          payload,
          last_lookup_at: now,
          updated_at: now,
          refresh_requested_at: null,
          refresh_requested_by: null,
          agent_lock_id: null,
          agent_lock_until: null,
          last_agent_id: agentId,
          last_agent_seen_at: now,
        })
        .eq('id', jobId)
        .eq('agent_lock_id', agentId);

      if (updateError) {
        throw updateError;
      }

      return jsonRes(200, { ok: true, status, fulfillmentState, serverTime: now });
    }

    return jsonRes(400, { ok: false, error: 'Acción de agente no reconocida.' });
  } catch (error) {
    return jsonRes(500, {
      ok: false,
      error: error instanceof Error ? error.message : 'No fue posible completar la operación del agente.',
    });
  }
});
