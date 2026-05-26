import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing from env variables.');
}

type StorageAdapter = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const createMemoryStorage = (): StorageAdapter => {
  const store = new Map<string, string>();

  return {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
};

const resolveSupabaseStorage = (): StorageAdapter => {
  if (typeof window === 'undefined') {
    return createMemoryStorage();
  }

  try {
    const candidate = window.localStorage;
    const probeKey = '__orion_supabase_storage_probe__';
    candidate.setItem(probeKey, '1');
    candidate.removeItem(probeKey);
    return candidate;
  } catch {
    return createMemoryStorage();
  }
};

const authStorage = resolveSupabaseStorage();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: authStorage,
  },
});

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

const withTimeout = async <T>(task: Promise<T>, timeoutMs = 5000): Promise<T | null> => {
  return Promise.race<T | null>([
    task,
    new Promise<null>((resolve) => {
      window.setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
};

export const getValidatedSession = async () => {
  const sessionResult = await withTimeout(supabase.auth.getSession());

  if (!sessionResult) {
    return null;
  }

  const {
    data: { session },
    error: sessionError,
  } = sessionResult;

  if (sessionError) {
    if (isRecoverableAuthStorageError(sessionError)) {
      await clearBrokenLocalSession();
    }
    return null;
  }

  if (!session) {
    return null;
  }

  const userResult = await withTimeout(supabase.auth.getUser());

  if (!userResult) {
    return null;
  }

  const {
    data: { user },
    error: userError,
  } = userResult;

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
