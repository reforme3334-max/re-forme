import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://tcoetmkdirgvweqvrdzn.supabase.co';
export const supabaseAnonKey = 'sb_publishable_4auIo4JL0y9_1eYR0ZiRnw_zkH6iQGJ';

/**
 * Custom fetch with automatic retry on transient network errors ("TypeError: Failed to fetch")
 * caused by brief connection drops, tab wake-ups, or mobile network handoffs.
 */
const resilientFetch: typeof fetch = async (input, init) => {
  const maxRetries = 3;
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fetch(input, init);
    } catch (err: any) {
      lastError = err;
      // Don't retry if the request was explicitly aborted
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
  global: {
    fetch: resilientFetch,
  },
});

