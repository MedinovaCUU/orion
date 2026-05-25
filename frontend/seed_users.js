import * as xlsx from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function run() {
  console.log('Reading Excel file...');
  const workbook = xlsx.readFile('../Empleados.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet);

  console.log(`Found ${rows.length} rows.`);

  for (const emp of rows) {
    if (!emp.email || !emp.password) {
      console.log(`Skipping row without email or password: ${emp.full_name}`);
      continue;
    }

    console.log(`Creating user for: ${emp.email}`);
    const { data: userResp, error: authError } = await supabase.auth.admin.createUser({
      email: emp.email,
      password: emp.password.toString(), // ensure string
      email_confirm: true,
      user_metadata: {
        full_name: emp.full_name
      }
    });

    if (authError) {
      console.error(`Error creating ${emp.email}: ${authError.message}`);
      // Usually "User already exists" is common, but let's continue
      continue;
    }

    const userId = userResp.user.id;
    const role = emp.es_admin === true || emp.es_admin === 'true' ? 'admin' : 'tecnico';

    console.log(`User created. Upserting public.profile for ${emp.full_name} as ${role}`);
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      nombre_completo: emp.full_name,
      rol: role
    });

    if (profileError) {
      console.error(`Error inserting profile for ${emp.email}: ${profileError.message}`);
    } else {
      console.log(`Successfully seeded ${emp.email}`);
    }
  }

  console.log('Finished seeding users.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
