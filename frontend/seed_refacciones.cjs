const xlsx = require('xlsx');
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // Bypass RLS

async function seed() {
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Extrayendo Refacciones del catálogo descriptivo 2025...");
    const wb = xlsx.readFile('../refacciones_spare_parts_2025_con_paginas.xlsx');
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = xlsx.utils.sheet_to_json(ws, { header: 1 });

    const arr = [];
    for (const row of raw) {
        if (!Array.isArray(row) || row.length < 2) continue;
        const codigo = row[1];
        if (!codigo || codigo === 'Número de parte') continue;
        
        let desc = row[2] || '';
        if (row[3]) desc += ` - ${row[3]}`;
        if (row[5] && row[5] !== 'N/D') desc += ` (Pág: ${row[5]})`;
        if (row[0]) desc += ` [${row[0]}]`;

        arr.push({ 
            codigo_refaccion: String(codigo).trim(), 
            descripcion: desc.trim().substring(0, 500),
            equipo: row[0] ? String(row[0]).trim() : null,
            nombre: row[2] ? String(row[2]).trim() : null,
            desc_breve: row[3] ? String(row[3]).trim() : null,
            pagina_manual: row[5] ? String(row[5]).trim() : null
        });
    }

    console.log(`Encontradas ${arr.length} refacciones descriptivas. Actualizando (Upsert).`);
    for (let i = 0; i < arr.length; i += 100) {
        const { error } = await supabase.from('refacciones_catalogo').upsert(arr.slice(i, i + 100), { onConflict: 'codigo_refaccion' });
        if (error) console.error("Error upserting:", error.message);
    }
    
    console.log("✅ Catálogo de refacciones actualizado exitosamente con la nueva inteligencia descriptiva.");
}

seed().catch(console.error);
