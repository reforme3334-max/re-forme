import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const supabaseUrl = env.match(/VITE_SUPABASE_URL=(.*)/)[1];
const supabaseKey = env.match(/VITE_SUPABASE_ANON_KEY=(.*)/)[1];

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('appointments').select('*').limit(1);
  if (error) {
    console.log('Error fetching appointments:', error.message);
  } else if (data && data.length > 0) {
    console.log('Columns in appointments:', Object.keys(data[0]));
  } else {
    console.log('No data in appointments table to check columns.');
  }
}
run();
