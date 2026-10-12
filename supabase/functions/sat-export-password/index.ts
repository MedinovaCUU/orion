import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

/**
 * Contraseña de exportación de los reportes SAT (.A400). Vive como secreto del proyecto (`SAT_EXPORT_PASSWORD`,
 * `supabase secrets set`) y solo se entrega a un usuario con sesión de Orion o al servicio de controles (llave de
 * servicio). Así no queda escrita en el código de la aplicación ni en el repositorio.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

const jwtRole = (token: string) => {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')));
    return typeof decoded.role === 'string' ? decoded.role : null;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const password = Deno.env.get('SAT_EXPORT_PASSWORD')?.trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!password) return json({ error: 'sat_export_password_not_configured' }, 500);

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return json({ error: 'missing_authorization_header' }, 401);

  // El servicio de controles llama con la llave de servicio; la aplicación, con la sesión del usuario. La pasarela
  // ya verificó la firma del JWT (verify_jwt), así que basta leer su rol.
  if ((serviceKey && token === serviceKey) || jwtRole(token) === 'service_role') return json({ password });

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await authClient.auth.getUser();
  if (error || !data.user) return json({ error: 'unauthorized' }, 401);
  return json({ password });
});
