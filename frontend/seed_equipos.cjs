const xlsx = require('xlsx');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz';

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function parseDateExcel(excelDate) {
    if (!excelDate || excelDate === '0000-00-00') return null;
    if (typeof excelDate === 'number') {
        const d = new Date(Math.round((excelDate - 25569) * 86400 * 1000));
        return isNaN(d) ? null : d.toISOString().split('T')[0];
    }
    // Try parse string
    const d = new Date(excelDate);
    return isNaN(d) ? null : d.toISOString().split('T')[0];
}

async function run() {
  console.log('Fetching existing profiles for mapping...');
  const { data: profiles } = await supabase.from('profiles').select('*');
  const profileMap = {};
  if (profiles) {
      profiles.forEach(p => {
          profileMap[p.nombre_completo.toLowerCase()] = p.id;
      });
  }

  console.log('Reading Clientes-2.xlsx...');
  const wbClientes = xlsx.readFile('../Clientes-2.xlsx');
  const rowsClientes = xlsx.utils.sheet_to_json(wbClientes.Sheets[wbClientes.SheetNames[0]]);
  console.log(`Found ${rowsClientes.length} clientes. Inserting...`);
  
  const clientInsertions = [];
  const clientMapByNombre = {};
  for (const c of rowsClientes) {
      if (!c['Razón social']) continue;
      clientInsertions.push({
          id_original: c['ID'] ? c['ID'].toString() : null,
          razon_social: c['Razón social']
      });
  }
  const { data: insertedClientes, error: errorClientes } = await supabase.from('clientes').upsert(clientInsertions, { onConflict: 'id_original' }).select();
  if (errorClientes) console.error(errorClientes);
  
  if (insertedClientes) {
      insertedClientes.forEach(ic => {
          clientMapByNombre[ic.razon_social.toLowerCase()] = ic.id;
      });
  }

  console.log('Reading Asignación de Equipos.xlsx...');
  const wbEquipos = xlsx.readFile('../Asignación de Equipos.xlsx');
  const rowsEquipos = xlsx.utils.sheet_to_json(wbEquipos.Sheets[wbEquipos.SheetNames[0]]);
  console.log(`Found ${rowsEquipos.length} equipos. Seeding...`);

  const equiposInsertions = [];
  for (const row of rowsEquipos) {
      if (!row['Id'] || !row['No. Serie']) continue;

      let cliente_id = null;
      if (row['Cliente'] && clientMapByNombre[row['Cliente'].toLowerCase()]) {
          cliente_id = clientMapByNombre[row['Cliente'].toLowerCase()];
      }

      let emp_asigna = null;
      if (row['Asigna']) {
         const cleanAsigna = String(row['Asigna']).toLowerCase().trim();
         emp_asigna = profileMap[cleanAsigna] || null;
         if (!emp_asigna) {
             for (const [k, v] of Object.entries(profileMap)) {
                 if (k.includes(cleanAsigna) || cleanAsigna.includes(k) || cleanAsigna.split(' ')[0] === k.split(' ')[0]) {
                     emp_asigna = v;
                     break;
                 }
             }
         }
      }
      
      let emp_retira = null;
      if (row['Retira']) {
         const cleanRetira = String(row['Retira']).toLowerCase().trim();
         emp_retira = profileMap[cleanRetira] || null;
         if (!emp_retira) {
             for (const [k, v] of Object.entries(profileMap)) {
                 if (k.includes(cleanRetira) || cleanRetira.includes(k) || cleanRetira.split(' ')[0] === k.split(' ')[0]) {
                     emp_retira = v;
                     break;
                 }
             }
         }
      }

      let dInicio = await parseDateExcel(row['Fecha inicio']);
      let dFin = await parseDateExcel(row['Fecha fin']);
      let dTermino = null;
      
      if (dInicio) {
          const dt = new Date(dInicio);
          dt.setFullYear(dt.getFullYear() + 2);
          dTermino = dt.toISOString().split('T')[0];
      }

      equiposInsertions.push({
          id: row['Id'].toString(),
          numero_serie: row['No. Serie'].toString(),
          cliente_id: cliente_id,
          fecha_inicio: dInicio,
          termino_garantia: dTermino,
          empleado_asignado: emp_asigna,
          doc_asignacion: row['Doc asignación'] === 'Ver Doc',
          fecha_fin: dFin,
          empleado_retira: emp_retira,
          doc_terminacion: row['Doc termino'] === 'Ver Doc'
      });
  }
  
  console.log('Upserting Equipos...');
  const { error: eqError } = await supabase.from('equipos').upsert(equiposInsertions);
  if (eqError) console.error('Error inserting equipos:', eqError.message);
  else console.log('Successfully seeded all equipos!');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
