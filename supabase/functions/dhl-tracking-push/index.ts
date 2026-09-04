import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

type JsonRecord = Record<string, unknown>;

interface ShippingTrackingRow {
  id: string;
  status: string;
  fulfillment_state: string;
  payload: JsonRecord | null;
}

const DHL_API_BASE = Deno.env.get('DHL_PUSH_API_BASE')?.trim() || 'https://api-eu.dhl.com/tracking/push/v1';
const DHL_API_KEY = Deno.env.get('DHL_PUSH_API_KEY')?.trim() || '';
const DHL_ACCOUNT_ID = Deno.env.get('DHL_PUSH_ACCOUNT_ID')?.trim() || 'BIOSIMEX';
const DHL_WEBHOOK_TOKEN = Deno.env.get('DHL_PUSH_WEBHOOK_TOKEN')?.trim() || '';
const DHL_WEBHOOK_HEADER = 'x-orion-dhl-token';

const compact = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const asRecord = (value: unknown): JsonRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const trackingNumber = (value: unknown) => compact(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 100);
const normalized = (value: unknown) =>
  compact(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const jsonResponse = (status: number, payload: unknown) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

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

const redactSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactSecrets);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as JsonRecord).map(([key, child]) => {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('secret') ||
        normalizedKey.includes('token') ||
        normalizedKey === 'authorization' ||
        normalizedKey === 'apikey' ||
        normalizedKey === 'api_key'
      ) {
        return [key, '[REDACTED]'];
      }
      return [key, redactSecrets(child)];
    }),
  );
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const safeTimestamp = (value: unknown) => {
  const text = compact(value);
  return text && !Number.isNaN(Date.parse(text)) ? new Date(text).toISOString() : null;
};

const subscriptionIdFrom = (payload: JsonRecord) => {
  const explicit = compact(payload.subscriptionId || payload.subscriptionID || payload.id);
  if (/^[0-9a-f-]{20,}$/i.test(explicit)) {
    return explicit;
  }

  const self = compact(payload.self);
  const match = self.match(/\/subscription\/([0-9a-f-]{20,})(?:[/?#]|$)/i);
  return match?.[1] || '';
};

const subscriptionStatus = (scope: string) => {
  if (scope === 'subscription.validate') return 'validation_received';
  if (scope === 'subscription.activate') return 'awaiting_business_approval';
  if (scope === 'subscription.ready' || scope === 'subscription.push') return 'active';
  if (scope === 'subscription.delete' || scope === 'subscription.deleted') return 'deleted';
  return 'unknown';
};

const normalizeStatus = (status: JsonRecord) => {
  const text = normalized(
    [
      status.simplifiedStatus,
      status.divisionalStatus,
      status.statusCode,
      status.status,
      status.description,
      status.remark,
      status.nextSteps,
    ].join(' '),
  );

  if (text.includes('delivered') || text.includes('entregado') || text.includes('signed')) return 'entregado';
  if (
    text.includes('out for delivery') ||
    text.includes('with delivery courier') ||
    text.includes('en reparto') ||
    text.includes('disponible para recolectar') ||
    text.includes('ready for collection')
  ) {
    return 'en_reparto';
  }
  if (
    text.includes('failure') ||
    text.includes('exception') ||
    text.includes('failed') ||
    text.includes('incidencia') ||
    text.includes('demora') ||
    text.includes('retenido')
  ) {
    return 'incidencia';
  }
  if (
    text.includes('transit') ||
    text.includes('processed') ||
    text.includes('departed') ||
    text.includes('arrived') ||
    text.includes('picked up') ||
    text.includes('transito')
  ) {
    return 'en_transito';
  }
  if (
    text.includes('pre-transit') ||
    text.includes('pre transit') ||
    text.includes('label created') ||
    text.includes('information received') ||
    text.includes('informacion recibida')
  ) {
    return 'etiqueta_generada';
  }
  return 'pendiente_consulta';
};

const locationFrom = (status: JsonRecord) => {
  const location = asRecord(status.location);
  const address = asRecord(location.address || status.address);
  return compact(
    [address.addressLocality, address.addressRegion, address.postalCode, address.countryCode]
      .filter(Boolean)
      .join(', '),
  );
};

const localityFrom = (value: unknown) => {
  const object = asRecord(value);
  const address = asRecord(object.address || object);
  return compact([address.addressLocality, address.addressRegion, address.countryCode].filter(Boolean).join(', '));
};

const deliveryProofName = (shipment: JsonRecord) => {
  const details = asRecord(shipment.details);
  const proof = asRecord(details.proofOfDelivery);
  const signed = asRecord(proof.signed || proof.signatory);
  return compact(signed.name || [signed.givenName, signed.familyName].filter(Boolean).join(' ') || proof.signatory);
};

const mergeTimeline = (current: unknown, event: JsonRecord) => {
  const rows = [event, ...asArray(current).map(asRecord)];
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const key = `${compact(row.timestamp)}|${compact(row.label)}|${compact(row.location)}`;
      if (!key.replaceAll('|', '') || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 100);
};

const buildSnapshot = (shipment: JsonRecord, currentPayload: JsonRecord, receivedAt: string) => {
  const status = asRecord(shipment.status);
  const normalizedStatus = normalizeStatus(status);
  const eventAt = safeTimestamp(status.timestamp) || receivedAt;
  const description = compact(status.description || status.status || status.divisionalStatus || status.simplifiedStatus);
  const remark = compact(status.remark);
  const nextSteps = compact(status.nextSteps);
  const location = locationFrom(status);
  const event = {
    label: description || remark || 'Actualización recibida de DHL',
    location,
    timestamp: eventAt,
    note: [remark, nextSteps].filter(Boolean).join(' · '),
  };
  const rawSummary = JSON.stringify(redactSecrets(shipment), null, 2).slice(0, 6000);

  return {
    carrier: 'dhl',
    trackingNumber: trackingNumber(shipment.id || shipment.trackingNumber),
    status: normalizedStatus,
    fulfillmentState: normalizedStatus === 'entregado' ? 'entregado' : 'pendiente',
    portalStatusText: description || remark || 'Actualización recibida de DHL.',
    lastEventLabel: remark || description || 'Actualización recibida de DHL',
    lastEventAt: eventAt,
    estimatedDelivery: compact(
      shipment.estimatedTimeOfDelivery || shipment.estimatedDeliveryDate || asRecord(shipment.delivery).estimated,
    ).slice(0, 100),
    recipient: deliveryProofName(shipment) || compact(asRecord(asRecord(shipment.details).consignee).name),
    origin: localityFrom(shipment.origin),
    destination: localityFrom(shipment.destination),
    serviceType: compact(shipment.service || asRecord(asRecord(shipment.details).product).productName),
    deliveryProofName: deliveryProofName(shipment),
    timeline: mergeTimeline(currentPayload.timeline, event),
    rawEvidenceText: rawSummary,
    lookupError: '',
    lastLookupAt: receivedAt,
    updatedAt: receivedAt,
    dhlAttribution: 'Delivered by Deutsche Post DHL Group',
  };
};

const activateSubscription = async (subscriptionId: string, secret: string) => {
  if (!DHL_API_KEY) {
    throw new Error('Falta DHL_PUSH_API_KEY para activar la suscripción.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${DHL_API_BASE}/subscription/${encodeURIComponent(subscriptionId)}`, {
      method: 'POST',
      headers: {
        'DHL-API-Key': DHL_API_KEY,
        'DHL-API-Hook-Secret': secret,
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = compact(await response.text()).slice(0, 1000);
      throw new Error(`DHL rechazó la activación (${response.status})${detail ? `: ${detail}` : '.'}`);
    }
  } finally {
    clearTimeout(timeout);
  }
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse(405, { ok: false, error: 'Método no permitido.' });
  }
  if (!DHL_WEBHOOK_TOKEN) {
    return jsonResponse(503, { ok: false, error: 'El webhook no está configurado.' });
  }

  const suppliedToken = compact(request.headers.get(DHL_WEBHOOK_HEADER));
  if (!suppliedToken || !timingSafeEqual(DHL_WEBHOOK_TOKEN, suppliedToken)) {
    return jsonResponse(401, { ok: false, error: 'Credencial de webhook inválida.' });
  }

  const rawBody = await request.text();
  if (!rawBody || rawBody.length > 1_000_000) {
    return jsonResponse(400, { ok: false, error: 'Notificación vacía o demasiado grande.' });
  }

  let payload: JsonRecord;
  try {
    payload = asRecord(JSON.parse(rawBody));
  } catch {
    return jsonResponse(400, { ok: false, error: 'La notificación no contiene JSON válido.' });
  }

  if (normalized(payload.scope) === 'orion.health') {
    return jsonResponse(200, { ok: true, service: 'dhl-tracking-push' });
  }

  const supabaseUrl = compact(Deno.env.get('SUPABASE_URL'));
  const serviceRoleKey = compact(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(503, { ok: false, error: 'Supabase no está configurado.' });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();
  const scope = normalized(payload.scope) || 'subscription.push';
  const subscriptionId = subscriptionIdFrom(payload);
  const safePayload = redactSecrets(payload) as JsonRecord;
  const eventHash = await sha256(rawBody);
  const shipments = asArray(payload.shipments).map(asRecord);
  const firstTrackingNumber = trackingNumber(shipments[0]?.id || shipments[0]?.trackingNumber) || null;

  try {
    const { error: eventError } = await client.from('dhl_push_events').upsert(
      {
        event_hash: eventHash,
        subscription_id: subscriptionId || null,
        scope,
        tracking_number: firstTrackingNumber,
        occurred_at: safeTimestamp(asRecord(shipments[0]?.status).timestamp),
        payload: safePayload,
        received_at: now,
      },
      { onConflict: 'event_hash', ignoreDuplicates: true },
    );
    if (eventError) throw eventError;

    if (subscriptionId) {
      const selfUrl = compact(payload.self);
      const hookUri = compact(asRecord(payload.hook).uri);
      const status = subscriptionStatus(scope);
      const { data: existingSubscription, error: subscriptionReadError } = await client
        .from('dhl_push_subscriptions')
        .select('status, self_url, hook_uri, expires_at, activated_at')
        .eq('subscription_id', subscriptionId)
        .maybeSingle();
      if (subscriptionReadError) throw subscriptionReadError;

      const activationAlreadyAccepted = ['activation_requested', 'awaiting_business_approval', 'active'].includes(
        compact(existingSubscription?.status),
      );
      const effectiveStatus =
        scope === 'subscription.validate' && activationAlreadyAccepted
          ? compact(existingSubscription?.status)
          : status === 'unknown' && existingSubscription?.status
            ? compact(existingSubscription.status)
            : status;
      const { error: subscriptionError } = await client.from('dhl_push_subscriptions').upsert(
        {
          subscription_id: subscriptionId,
          account_id: compact(payload.accountID) || DHL_ACCOUNT_ID,
          service: compact(payload.service) || 'express',
          scope,
          status: effectiveStatus,
          self_url: selfUrl || existingSubscription?.self_url || `${DHL_API_BASE}/subscription/${subscriptionId}`,
          hook_uri: hookUri || existingSubscription?.hook_uri || null,
          expires_at: safeTimestamp(payload.expires) || existingSubscription?.expires_at || null,
          activated_at: status === 'active' ? now : existingSubscription?.activated_at || null,
          last_notification_at: now,
          last_error: null,
          metadata: safePayload,
          updated_at: now,
        },
        { onConflict: 'subscription_id' },
      );
      if (subscriptionError) throw subscriptionError;

      if (scope === 'subscription.validate' && !activationAlreadyAccepted) {
        const hookSecret = compact(payload.secret || request.headers.get('DHL-API-Hook-Secret'));
        if (!hookSecret) {
          throw new Error('DHL no envió el secreto temporal de activación.');
        }

        const { error: activationStartError } = await client
          .from('dhl_push_subscriptions')
          .update({ status: 'activation_requested', activation_requested_at: now, updated_at: now })
          .eq('subscription_id', subscriptionId);
        if (activationStartError) throw activationStartError;

        await activateSubscription(subscriptionId, hookSecret);
        const { error: activationUpdateError } = await client
          .from('dhl_push_subscriptions')
          .update({
            status: 'awaiting_business_approval',
            updated_at: now,
          })
          .eq('subscription_id', subscriptionId);
        if (activationUpdateError) throw activationUpdateError;
      }
    }

    for (const shipment of shipments) {
      const number = trackingNumber(shipment.id || shipment.trackingNumber);
      if (!number) continue;

      const { data: currentSnapshot, error: snapshotReadError } = await client
        .from('dhl_push_shipments')
        .select('payload, last_event_at, status, fulfillment_state')
        .eq('tracking_number', number)
        .maybeSingle();
      if (snapshotReadError) throw snapshotReadError;

      const snapshot = buildSnapshot(shipment, asRecord(currentSnapshot?.payload), now);
      const currentEventAt = safeTimestamp(currentSnapshot?.last_event_at);
      if (currentEventAt && Date.parse(currentEventAt) > Date.parse(snapshot.lastEventAt)) {
        continue;
      }
      if (currentSnapshot?.status === 'entregado') {
        snapshot.status = 'entregado';
        snapshot.fulfillmentState = 'entregado';
      }
      const { error: snapshotError } = await client.from('dhl_push_shipments').upsert(
        {
          tracking_number: number,
          status: snapshot.status,
          fulfillment_state: snapshot.fulfillmentState,
          payload: snapshot,
          last_event_at: snapshot.lastEventAt,
          received_at: now,
          updated_at: now,
        },
        { onConflict: 'tracking_number' },
      );
      if (snapshotError) throw snapshotError;

      const { data: trackingRows, error: trackingReadError } = await client
        .from('shipping_trackings')
        .select('id, status, fulfillment_state, payload')
        .eq('carrier', 'dhl')
        .eq('tracking_number', number);
      if (trackingReadError) throw trackingReadError;

      for (const row of (trackingRows || []) as ShippingTrackingRow[]) {
        const currentPayload = asRecord(row.payload);
        const mergedSnapshot = {
          ...snapshot,
          timeline: mergeTimeline(currentPayload.timeline, asRecord(snapshot.timeline[0])),
        };
        const keepDelivered = row.status === 'entregado';
        const { error: trackingUpdateError } = await client
          .from('shipping_trackings')
          .update({
            status: keepDelivered ? 'entregado' : snapshot.status,
            fulfillment_state: keepDelivered ? 'entregado' : snapshot.fulfillmentState,
            payload: { ...currentPayload, ...mergedSnapshot },
            last_lookup_at: now,
            updated_at: now,
            refresh_requested_at: null,
            refresh_requested_by: null,
            agent_lock_id: null,
            agent_lock_until: null,
            last_agent_id: 'dhl-push',
            last_agent_seen_at: now,
          })
          .eq('id', row.id);
        if (trackingUpdateError) throw trackingUpdateError;
      }
    }

    const { error: processedError } = await client
      .from('dhl_push_events')
      .update({ processed_at: now, processing_error: null })
      .eq('event_hash', eventHash);
    if (processedError) throw processedError;

    return jsonResponse(200, {
      ok: true,
      subscriptionId: subscriptionId || null,
      scope,
      shipmentsProcessed: shipments.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible procesar la notificación de DHL.';
    await client
      .from('dhl_push_events')
      .update({ processing_error: message.slice(0, 2000) })
      .eq('event_hash', eventHash);
    if (subscriptionId) {
      await client
        .from('dhl_push_subscriptions')
        .update({ status: 'failed', last_error: message.slice(0, 2000), updated_at: now })
        .eq('subscription_id', subscriptionId);
    }
    return jsonResponse(500, { ok: false, error: message });
  }
});
