const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

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

  console.log(`Found ${rows.length} rows. Fetching current users from auth.users...`);

  const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) {
      console.error(listError);
      return;
  }
  const users = usersData.users;

  for (const emp of rows) {
    if (!emp.email || !emp.cellphone) continue;

    // Supabase usually expects E.164 format for phones if SMS auth is configured.
    // Assuming these are Mexico numbers (10 digits), we prepend +52 in string format.
    let phoneStr = emp.cellphone.toString().trim();
    if (!phoneStr.startsWith('+')) {
        phoneStr = '+52' + phoneStr;
    }

    const existingUser = users.find(u => u.email === emp.email);
    if (existingUser) {
        console.log(`Updating phone for ${emp.email} to ${phoneStr}...`);
        const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
            phone: phoneStr
        });

        if (error) {
            console.error(`Error updating phone for ${emp.email}: ${error.message} (Perhaps invalid format)`);
        } else {
            console.log(`Successfully updated ${emp.email}`);
        }
    }
  }

  console.log('Finished updating phones.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
