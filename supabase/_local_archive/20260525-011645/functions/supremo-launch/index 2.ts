import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import bcrypt from 'npm:bcryptjs@2.4.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

interface LaunchBody {
  equipmentId?: string;
}

type ProfileRole = 'admin' | 'tecnico' | string;

interface OtpAttemptResult {
  launchUrl: string;
  manualPasswordRequired: boolean;
  usedOtp: boolean;
  otpError?: string | null;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });

const toRecord = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : null);
const toStringValue = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const sanitizeSupremoId = (value: string) => value.replace(/\s+/g, '');

const ensureRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) {
    throw new Error(`missing_${name.toLowerCase()}_env`);
  }
  return value;
};

const buildEquipmentLabel = (equipment: Record<string, unknown>) => {
  const alias = toStringValue(equipment.supremo_alias);
  const model = toStringValue(equipment.modelo);
  const serial = toStringValue(equipment.numero_serie);
  const clientRecord = toRecord(equipment.clientes);
  const clientName = toStringValue(clientRecord?.razon_social);

  if (alias) {
    return alias;
  }

  return [model || 'Equipo', serial, clientName].filter(Boolean).join(' · ');
};

const createSupremoOtp = async (apiKey: string, sharedPassword: string) => {
  const bcpassword = await bcrypt.hash(sharedPassword, 10);

  const response = await fetch('https://api.services.nanosystems.com/supremo/addPassphrase/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ bcpassword }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`supremo_otp_request_failed:${response.status}:${JSON.stringify(payload)}`);
  }

  const otp = toStringValue(toRecord(payload)?.otp);
  if (!otp) {
    throw new Error('supremo_otp_missing_in_response');
  }

  return otp;
};

const createLaunchPayload = async (
  supremoId: string,
  sharedPassword: string,
  supremoApiKey: string,
): Promise<OtpAttemptResult> => {
  const baseLaunchUrl = `supremo://${encodeURIComponent(supremoId)}`;

  if (!sharedPassword || !supremoApiKey) {
    return {
      launchUrl: baseLaunchUrl,
      manualPasswordRequired: true,
      usedOtp: false,
      otpError: null,
    };
  }

  try {
    const otp = await createSupremoOtp(supremoApiKey, sharedPassword);
    return {
      launchUrl: `${baseLaunchUrl}?otp=${encodeURIComponent(otp)}`,
      manualPasswordRequired: false,
      usedOtp: true,
      otpError: null,
    };
  } catch (error) {
    return {
      launchUrl: baseLaunchUrl,
      manualPasswordRequired: true,
      usedOtp: false,
      otpError: error instanceof Error ? error.message : 'otp_generation_failed',
    };
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  try {
    const supabaseUrl = ensureRequiredEnv('SUPABASE_URL');
    const supabaseAnonKey = ensureRequiredEnv('SUPABASE_ANON_KEY');
    const supabaseServiceRoleKey = ensureRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
    const authHeader = request.headers.get('Authorization') ?? '';

    if (!authHeader.trim()) {
      return json({ error: 'missing_authorization_header' }, 401);
    }

    const body = (await request.json().catch(() => null)) as LaunchBody | null;
    const equipmentId = toStringValue(body?.equipmentId);
    if (!equipmentId) {
      return json({ error: 'missing_equipment_id' }, 400);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
      return json({ error: 'unauthorized_user' }, 401);
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('rol')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return json({ error: 'profile_lookup_failed' }, 403);
    }

    const role = toStringValue((profile as { rol?: ProfileRole } | null)?.rol);
    if (!['admin', 'tecnico'].includes(role)) {
      return json({ error: 'insufficient_role' }, 403);
    }

    const { data: equipment, error: equipmentError } = await serviceClient
      .from('equipos')
      .select('id, numero_serie, modelo, supremo_id, supremo_alias, supremo_enabled, clientes(razon_social)')
      .eq('id', equipmentId)
      .single();

    if (equipmentError || !equipment) {
      return json({ error: 'equipment_not_found' }, 404);
    }

    const supremoId = sanitizeSupremoId(toStringValue((equipment as Record<string, unknown>).supremo_id));
    const supremoEnabled = Boolean((equipment as Record<string, unknown>).supremo_enabled);

    if (!supremoEnabled) {
      return json({ error: 'supremo_access_disabled_for_equipment' }, 400);
    }

    if (!supremoId) {
      return json({ error: 'missing_supremo_id_for_equipment' }, 400);
    }

    const sharedPassword = Deno.env.get('SUPREMO_SHARED_PASSWORD')?.trim() || '';
    const supremoApiKey = Deno.env.get('SUPREMO_API_KEY')?.trim() || '';
    const launchPayload = await createLaunchPayload(supremoId, sharedPassword, supremoApiKey);

    return json({
      ok: true,
      launchUrl: launchPayload.launchUrl,
      equipmentLabel: buildEquipmentLabel(equipment as Record<string, unknown>),
      supremoId,
      manualPasswordRequired: launchPayload.manualPasswordRequired,
      launchPassword: sharedPassword || null,
      usedOtp: launchPayload.usedOtp,
      otpError: launchPayload.otpError || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unexpected_supremo_launch_error';
    return json({ error: message }, 500);
  }
});
