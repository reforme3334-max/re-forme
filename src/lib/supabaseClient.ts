import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tcoetmkdirgvweqvrdzn.supabase.co';
const supabaseAnonKey = 'sb_publishable_4auIo4JL0y9_1eYR0ZiRnw_zkH6iQGJ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
