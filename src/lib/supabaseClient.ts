import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://tcoetmkdirgvweqvrdzn.supabase.co';
export const supabaseAnonKey = 'sb_publishable_4auIo4JL0y9_1eYR0ZiRnw_zkH6iQGJ';

const AUTH_STORAGE_KEY = 'sb-tcoetmkdirgvweqvrdzn-auth-token';

export function clearStoredAuthSession() {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    window.localStorage.removeItem(`${AUTH_STORAGE_KEY}-user`);
    window.localStorage.removeItem(`${AUTH_STORAGE_KEY}-code-verifier`);
  } catch {
    // Ignore storage access errors
  }
}

let inFlightStorageRefresh: Promise<string | null> | null = null;

/**
 * Custom storage adapter that validates and refreshes expired stored sessions
 * before GoTrueClient's internal recovery runs, preventing unhandled
 * `AuthApiError: Invalid Refresh Token: Refresh Token Not Found` console errors
 * when a stale session exists in localStorage.
 */
const safeAuthStorage = {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return null;
    }
    if (!raw || key !== AUTH_STORAGE_KEY) return raw;

    let session: any;
    try {
      session = JSON.parse(raw);
    } catch {
      clearStoredAuthSession();
      return null;
    }

    if (
      !session ||
      typeof session !== 'object' ||
      !session.access_token ||
      !session.refresh_token ||
      typeof session.expires_at !== 'number'
    ) {
      clearStoredAuthSession();
      return null;
    }

    // If token is still valid beyond GoTrue's 90s expiry margin, return immediately
    const msUntilExpiry = session.expires_at * 1000 - Date.now();
    if (msUntilExpiry >= 120_000) {
      return raw;
    }

    // Proactively validate/refresh expired token once (deduplicated across concurrent reads)
    if (!inFlightStorageRefresh) {
      inFlightStorageRefresh = (async () => {
        try {
          const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=UTF-8',
              apikey: supabaseAnonKey,
              'X-Supabase-Api-Version': '2024-01-01',
            },
            body: JSON.stringify({ refresh_token: session.refresh_token }),
          });

          if (response.ok) {
            const refreshed = await response.json();
            if (refreshed && refreshed.access_token && refreshed.refresh_token) {
              const expiresAt =
                refreshed.expires_at ??
                Math.round(Date.now() / 1000) + (refreshed.expires_in || 3600);
              const nextSession = { ...session, ...refreshed, expires_at: expiresAt };
              const serialized = JSON.stringify(nextSession);
              try {
                window.localStorage.setItem(key, serialized);
              } catch {
                // Ignore quota errors
              }
              return serialized;
            }
          }

          if (response.status === 400 || response.status === 401 || response.status === 403) {
            clearStoredAuthSession();
            return null;
          }

          return raw;
        } catch {
          // Network offline or transient error: preserve raw session
          return raw;
        } finally {
          inFlightStorageRefresh = null;
        }
      })();
    }

    return inFlightStorageRefresh;
  },

  setItem(key: string, value: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage quota errors
    }
  },

  removeItem(key: string): void {
    if (typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  },
};

/**
 * Custom fetch with automatic retry on transient network errors ("TypeError: Failed to fetch")
 * and graceful cleanup if a refresh token is revoked while the app is open.
 */
const resilientFetch: typeof fetch = async (input, init) => {
  const maxRetries = 3;
  let lastError: any;
  const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const isRefreshRequest =
    requestUrl.includes('/auth/v1/token') && requestUrl.includes('grant_type=refresh_token');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(input, init);

      if (isRefreshRequest && (response.status === 400 || response.status === 401 || response.status === 403)) {
        clearStoredAuthSession();
        if (
          typeof window !== 'undefined' &&
          window.location.hash !== '#login' &&
          !window.location.hash.includes('type=recovery')
        ) {
          window.location.hash = 'login';
        }
      }

      return response;
    } catch (err: any) {
      lastError = err;
      if (err?.name === 'AbortError') {
        throw err;
      }
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 350));
      }
    }
  }

  throw lastError;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storageKey: AUTH_STORAGE_KEY,
    storage: typeof window !== 'undefined' ? safeAuthStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    lock: async (_name, _acquireTimeout, fn) => await fn(),
  },
  global: {
    fetch: resilientFetch,
  },
});


