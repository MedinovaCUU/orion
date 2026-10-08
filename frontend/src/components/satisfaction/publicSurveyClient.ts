import { createClient } from '@supabase/supabase-js';
// Survey links are capabilities. They never need an account or a saved user session.
export const publicSurveyClient = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'orion-public-survey' },
});
