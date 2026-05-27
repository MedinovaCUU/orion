const xlsx = require('xlsx');
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseKey = "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz"; // Bypass RLS
const supabaseUrlRef = "http://127.0.0.1:54321";

async function seed() {
    if (!supabaseUrlRef || !supabaseKey) {
        console.error("No se encontraron las variables VITE_SUPABASE... en el entorno.");
        return;
    }

    const supabase = createClient(supabaseUrlRef, supabaseKey);

    console.log("=== 1. Procesando Catálogos de Averías y Soluciones ===");
    const wbTablas = xlsx.readFile('../Copia de Tablas tipo avería nueva Env_ITv3_MX (002).xlsx');
    const wsTablas = wbTablas.Sheets[wbTablas.SheetNames[0]];
    const dataTablas = xlsx.utils.sheet_to_json(wsTablas);

    const averiasMap = new Map();
    const solucionesMap = new Map();
    const averiasPrefixMap = new Map();
    const solucionesPrefixMap = new Map();

    const registerPrefixReference = (map, code, categoryCode, catalogType) => {
        const prefix = String(code || '').trim().substring(0, 2).toUpperCase();
        if (!prefix) {
            return;
        }

        const nextCategoryCode = categoryCode && categoryCode !== 'ND' ? String(categoryCode).trim() : null;
        const nextCatalogType = catalogType && catalogType !== 'Sin Tipo' ? String(catalogType).trim() : null;
        const current = map.get(prefix) || {};

        map.set(prefix, {
            categoryCode: current.categoryCode || nextCategoryCode || null,
            catalogType: current.catalogType || nextCatalogType || null,
        });
    };

    const fillMissingCatalogShape = (map, code, categoryCode, catalogType) => {
        const prefix = String(code || '').trim().substring(0, 2).toUpperCase();
        const reference = map.get(prefix);

        return {
            categoryCode:
                categoryCode && String(categoryCode).trim() !== '' && String(categoryCode).trim() !== 'ND'
                    ? String(categoryCode).trim()
                    : reference?.categoryCode || 'ND',
            catalogType:
                catalogType && String(catalogType).trim() !== '' && String(catalogType).trim() !== 'Sin Tipo'
                    ? String(catalogType).trim()
                    : reference?.catalogType || 'Sin Tipo',
        };
    };

    for (const row of dataTablas) {
        if (row['CDA']) {
            const cda = String(row['CDA']).trim();
            const cta = row['CTA'] ? String(row['CTA']).trim() : 'ND';
            const tipoAveria = row['Tipo de avería'] ? String(row['Tipo de avería']).trim() : 'Sin Tipo';
            registerPrefixReference(averiasPrefixMap, cda, cta, tipoAveria);
            averiasMap.set(cda, {
                cda,
                cta,
                tipo_averia: tipoAveria,
                detalle_averia: (row['Detalle  avería'] || row['Detalle avería']) ? String(row['Detalle  avería'] || row['Detalle avería']).trim() : 'Sin Detalle'
            });
        }
        if (row['CDS']) {
            const cds = String(row['CDS']).trim();
            const cts = row['CTS'] ? String(row['CTS']).trim() : 'ND';
            const tipoSolucion = row['Tipo Solución'] ? String(row['Tipo Solución']).trim() : 'Sin Tipo';
            registerPrefixReference(solucionesPrefixMap, cds, cts, tipoSolucion);
            solucionesMap.set(cds, {
                cds,
                cts,
                tipo_solucion: tipoSolucion,
                detalle_solucion: row['Detalle solución'] ? String(row['Detalle solución']).trim() : 'Sin Detalle'
            });
        }
    }

    averiasMap.forEach((value, key) => {
        const inferred = fillMissingCatalogShape(averiasPrefixMap, value.cda, value.cta, value.tipo_averia);
        averiasMap.set(key, {
            ...value,
            cta: inferred.categoryCode,
            tipo_averia: inferred.catalogType,
        });
    });

    solucionesMap.forEach((value, key) => {
        const inferred = fillMissingCatalogShape(solucionesPrefixMap, value.cds, value.cts, value.tipo_solucion);
        solucionesMap.set(key, {
            ...value,
            cts: inferred.categoryCode,
            tipo_solucion: inferred.catalogType,
        });
    });

    console.log(`- Encontradas ${averiasMap.size} averías maestras y ${solucionesMap.size} soluciones.`);
    const catalogEntries = [
        ...Array.from(averiasMap.values()).map(a => ({
            catalog_kind: 'averia',
            catalog_code: a.cda,
            category_code: a.cta,
            catalog_type: a.tipo_averia,
            catalog_detail: a.detalle_averia,
        })),
        ...Array.from(solucionesMap.values()).map(s => ({
            catalog_kind: 'solucion',
            catalog_code: s.cds,
            category_code: s.cts,
            catalog_type: s.tipo_solucion,
            catalog_detail: s.detalle_solucion,
        })),
    ];
    const { error: errCatalog } = await supabase
        .from('catalogo_servicio')
        .upsert(catalogEntries, { onConflict: 'catalog_kind,catalog_code' });
    if (errCatalog) console.error("Error subiendo catálogo unificado:", errCatalog);

    console.log(`✔️ Catálogos subidos.`);

    console.log("=== 2. Extrayendo Refacciones y Servicios Históricos ===");
    
    // FETCH PROFILES FOR ENGINEER MAPPING
    const { data: profilesData } = await supabase.from('profiles').select('id, nombre_completo');
    const profilesMap = new Map();
    if (profilesData) {
        profilesData.forEach(p => {
             // Normalize to handle minor spelling differences
             profilesMap.set(p.nombre_completo.toLowerCase().trim(), p.id);
        });
    }

    const wbServicios = xlsx.readFile('../Servicios_analizado.xlsx');
    const wsServicios = wbServicios.Sheets[wbServicios.SheetNames[0]];
    const rawServicios = xlsx.utils.sheet_to_json(wsServicios, { range: 1 });

    const refaccionesMap = new Set();
    const listadoServicios = [];

    // Filter valid historical inputs: Needs at least No_serie and a Valid Issue code
    const valids = rawServicios.filter(r => r['No_serie']);
    console.log(`Analizando ${valids.length} servicios con No_Serie de las actas históricas...`);

    for (let row of valids) {
        let refs = [];
        for (let i = 1; i <= 8; i++) {
            const refCode = row[`REF_${i}`];
            const cant = row[`Cant.${i}`] || 1;
            if (refCode && String(refCode).trim() !== '') {
                refaccionesMap.add(String(refCode).trim());
                refs.push({ codigo: String(refCode).trim(), cantidad: parseInt(cant) || 1 });
            }
        }

        let fechaParsed = null;
        if (row['Fecha']) {
            let n = Number(row['Fecha']);
            try {
                if (!isNaN(n)) fechaParsed = new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                else fechaParsed = new Date(row['Fecha']).toISOString().split('T')[0];
            } catch(e) { fechaParsed = null; }
        }

        const noSerieRaw = String(row['No_serie']).trim();
        let techId = null;
        if (row['Nombre']) {
            const cleanName = String(row['Nombre']).toLowerCase().trim();
            techId = profilesMap.get(cleanName) || null;
            
            // Fuzzy match check
            if (!techId) {
                 for (const [k, v] of profilesMap.entries()) {
                     if (k.includes(cleanName) || cleanName.includes(k)) {
                         techId = v;
                         break;
                     }
                 }
            }
        }

        listadoServicios.push({
            no_serie: noSerieRaw,
            id_legacy: parseInt(row['Id']) || null,
            cda: row['Código Avería'] || null,
            cds: row['Código Solución'] || null,
            motivo: row['Asunto'] || 'Servicio Histórico',
            tecnico_id: techId,
            refs_utilizadas: refs,
            fecha: fechaParsed
        });
    }

    console.log(`- Identificados ${refaccionesMap.size} códigos únicos de refacciones.`);
    const refArray = Array.from(refaccionesMap).map(cod => ({ codigo_refaccion: cod, descripcion: 'Pendiente de cruce con Spare Parts' }));
    
    // Subir refacciones_catalogo
    for (let i = 0; i < refArray.length; i += 100) {
        await supabase.from('refacciones_catalogo').upsert(refArray.slice(i, i + 100));
    }
    console.log(`✔️ Refacciones subidas.`);

    // Before inserting services... wait! The Teams historical CSV might contain serial numbers NOT in 'equipos'.
    // If we try to insert a foreign key pointing to a missing equipo, it throws an error.
    // Solution: Upsert generic equipment objects first for those missing.
    const uniqueSeries = Array.from(new Set(listadoServicios.map(s => s.no_serie)));
    const chunks = [];
    for (let i=0; i<uniqueSeries.length; i+=100) chunks.push(uniqueSeries.slice(i, i+100));
    
    // Check existing
    const { data: existingEquiposData } = await supabase.from('equipos').select('numero_serie');
    const existingEquipos = new Set(existingEquiposData?.map(e => e.numero_serie) || []);
    const missingEquipos = uniqueSeries.filter(s => !existingEquipos.has(s));

    if (missingEquipos.length > 0) {
        console.log(`Subiendo ${missingEquipos.length} equipos fantasma al inventario para tolerar llaves primarias:`);
        const pbsEquipos = missingEquipos.map(s => ({ numero_serie: s, cliente: 'Dato de archivo histórico' }));
        for (let i = 0; i < pbsEquipos.length; i+=50) {
            await supabase.from('equipos').upsert(pbsEquipos.slice(i, i+50), { onConflict: 'numero_serie' });
        }
    }

    console.log("=== 3. Construyendo Histórico Relacional ===");
    let succesCount = 0;
    
    // Let's filter out invalid cda or cds just in case foreign keys clash if they contain random garbage
    const allAverias = new Set(averiasMap.keys());
    const allSols = new Set(solucionesMap.keys());

    for (let s of listadoServicios) {
        let validCda = allAverias.has(s.cda) ? s.cda : null;
        let validCds = allSols.has(s.cds) ? s.cds : null;

        const { data: sData, error: sErr } = await supabase.from('servicios_historial').insert({
            no_serie: s.no_serie,
            id_legacy: s.id_legacy,
            tecnico_id: s.tecnico_id,
            cda: validCda,
            cds: validCds,
            motivo: s.motivo,
            fecha_servicio: s.fecha
        }).select('id').single();

        if (sErr) {
             console.log("Error inserting history:", sErr.message);
        } else if (sData && s.refs_utilizadas.length > 0) {
             const refsPayload = s.refs_utilizadas.map(r => ({
                 servicio_id: sData.id,
                 codigo_refaccion: r.codigo,
                 cantidad: r.cantidad
             }));
             await supabase.from('servicios_refacciones').insert(refsPayload);
             succesCount++;
        }
    }

    console.log(`✅ ¡MIGRACIÓN DE DATOS SEMILLA FINALIZADA! Se enlazaron ${succesCount} servicios con refacciones completas.`);
}

seed().catch(console.error);
