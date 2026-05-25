import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing from env variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

const INVALID_REFRESH_TOKEN_PATTERNS = [
  'invalid refresh token',
  'refresh token not found',
  'invalid jwt',
  'jwt expired',
];

export const isRecoverableAuthStorageError = (error: unknown) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' && error && 'message' in error
          ? String((error as { message?: unknown }).message || '')
          : '';

  const normalizedMessage = message.trim().toLowerCase();
  return INVALID_REFRESH_TOKEN_PATTERNS.some((pattern) => normalizedMessage.includes(pattern));
};

export const clearBrokenLocalSession = async () => {
  await supabase.auth.signOut({ scope: 'local' });
};

export const getValidatedSession = async () => {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    if (isRecoverableAuthStorageError(sessionError)) {
      await clearBrokenLocalSession();
    }
    return null;
  }

  if (!session) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    if (isRecoverableAuthStorageError(userError)) {
      await clearBrokenLocalSession();
      return null;
    }

    return session;
  }

  if (!user) {
    await clearBrokenLocalSession();
    return null;
  }

  return session;
};
