import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tcoetmkdirgvweqvrdzn.supabase.co';
const supabaseAnonKey = 'sb_publishable_4auIo4JL0y9_1eYR0ZiRnw_zkH6iQGJ';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const tables = ['patients', 'appointments', 'billings', 'treatments', 'seance_motifs', 'expenses', 'profiles'];
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      console.log(`Table ${table}: Error - ${error.message}`);
    } else {
      console.log(`Table ${table}: Exists (Data length: ${data.length})`);
    }
  }
}
run();
