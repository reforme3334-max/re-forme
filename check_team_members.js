import { createClient } from '@supabase/supabase-js';
const supabaseUrl = 'https://tcoetmkdirgvweqvrdzn.supabase.co';
const supabaseAnonKey = 'sb_publishable_4auIo4JL0y9_1eYR0ZiRnw_zkH6iQGJ';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Querying table team_members...');
  const { data, error } = await supabase.from('team_members').select('*');
  if (error) {
    console.error('Query failed:', error.message);
  } else {
    console.log('team_members content:', data);
  }
}

run();
