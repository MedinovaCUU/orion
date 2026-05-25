import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const SERVICE_TYPE_LABELS = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  capacitacion: 'Capacitacion',
  recapacitacion: 'Recapacitacion',
  instalacion: 'Instalacion',
  ingenieria_soporte: 'Ingenieria / Soporte',
};

const SOURCE_FILE_NAME = 'captura_actualizada_mayo_junio_2026';
const IMPORT_BATCH_ID = `normalized-may-june-2026-${Date.now()}`;
const AUDIT_NAME = 'Actualizacion planeacion mayo-junio 2026';

const cleanText = (value) => (value ?? '').toString().replace(/\s+/g, ' ').trim();

const normalizeText = (value) =>
  cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const titleCaseWords = (value) =>
  cleanText(value)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toUpperCase() === part && part.length <= 5) {
        return part.toUpperCase();
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');

const normalizePeriodLabel = (value) => {
  const raw = cleanText(value).toUpperCase();
  if (!raw) return '';
  const match = raw.match(/^(\d{1,2})\s+AL\s+(\d{1,2})\s+([A-ZÁÉÍÓÚ/]+)(?:\s+[A-ZÁÉÍÓÚ/]+)?$/u);
  if (!match) {
    return raw;
  }
  const [, start, end, month] = match;
  return `${start.padStart(2, '0')} AL ${end.padStart(2, '0')} ${month}`;
};

const buildSubject = (serviceType, platform, locality) =>
  `[PLAN] ${SERVICE_TYPE_LABELS[serviceType].toUpperCase()} - ${cleanText(platform) || 'MULTIPLE'} - ${cleanText(locality) || 'LOCALIDAD POR DEFINIR'}`;

const serializeDescription = (locality, observations, metadata) => {
  const lines = [];
  if (cleanText(locality)) {
    lines.push(`Cliente/Localidad: ${cleanText(locality)}`);
  }
  if (cleanText(observations)) {
    lines.push(`Observaciones: ${cleanText(observations)}`);
  }
  return `${lines.join('\n')}\n\n[METADATA_PLANEACION] ${JSON.stringify(metadata)}`;
};

const toCsvString = (names) => names.filter(Boolean).join(' / ');

const priorityFromRow = (serviceType, observations) => {
  const normalized = normalizeText(observations);
  if (normalized.includes('falcon')) return 'critica';
  if (serviceType === 'correctivo' || serviceType === 'ingenieria_soporte') return 'alta';
  return 'media';
};

const statusValuesFromRow = (observations, hasEngineer, explicitPending = false) => {
  const normalized = normalizeText(observations);
  const statuses = new Set();
  if (normalized.includes('requiere pago') || normalized.includes('requieren pago')) statuses.add('requiere_pago');
  if (normalized.includes('ya realizado')) statuses.add('realizado');
  if (normalized.includes('comodato')) statuses.add('comodato');
  if (normalized.includes('garantia')) statuses.add('garantia');
  if (normalized.includes('falcon')) statuses.add('critico');
  if (explicitPending || normalized.includes('pendiente')) statuses.add('pendiente');
  if (!hasEngineer) statuses.add('sin_asignar');
  return Array.from(statuses);
};

const profileAliasMap = {
  'ALFREDO': 'Alfredo Acevedo',
  'ANGEL': 'Luis Angel Perez',
  'BENJA': 'Benjamin Martinez',
  'BENJAMIN': 'Benjamin Martinez',
  'CARLOS': 'Carlos Muniz',
  'CHITALA': 'Miguel Chitala',
  'D. GARCIA': 'Diego García García',
  'DIEGO G': 'Diego García García',
  'DIEGO GARCIA': 'Diego García García',
  'DIEGO GARCÍA': 'Diego García García',
  'EDUARDO': 'Eduardo Ignacio Bautista',
  'ERICK DURAN': 'Erick Durán',
  'ERICK DURÁN': 'Erick Durán',
  'FRANCISCO': 'Francisco',
  'GUILLERMO': 'Guillermo Martinez',
  'HECTOR': 'Hector Cortés',
  'HÉCTOR': 'Hector Cortés',
  'IVONNE': 'Ivonne Jaramillo',
  'LALO': 'Eduardo Ignacio Bautista',
  'MARTHA': 'Martha Carbajal',
  'MEMO': 'Guillermo Martinez',
  'MONTAÑEZ': 'Ricardo Montañez',
  'NAVARRO': 'Diego Navarro',
  'OLIVIA': 'Olivia Angulo',
  'RICARDO': 'Ricardo Montañez',
  'RICARDO M': 'Ricardo Montañez',
  'RICARDO MONTAÑEZ': 'Ricardo Montañez',
  'VILCHIS': 'Ricardo Vilchis',
};

const RAW_ROWS = [
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'VINICOLA EL CIELO', serial: '831060535', observations: 'LUN REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'VINICOLA LA CARRODILLA', serial: '831060348', observations: 'LUN REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'UABC', serial: '831060629', observations: 'MAR REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'CORONA DEL VALLE', serial: '831060688', observations: 'MAR REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'WINE FACTORY', serial: '831060926', observations: 'LUN REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'MONTE XANIC', serial: '831060925', observations: 'LUN REQUIERE PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'BODEGA DE SANTO TOMAS', serial: '831060932', observations: 'MIE REQUIEREN PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'SPICA', locality: 'CEVIT', serial: '831000104', observations: 'MIE REQUIEREN PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'Y15', locality: 'BODEGAS RC', serial: '831060994', observations: 'MIE REQUIEREN PAGO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'BAX00', locality: 'Romo Sanfer Lab', serial: '834002818', observations: 'YA REALIZADOS', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'BAX00', locality: 'Romo Sanfer Lab', serial: '832002074', observations: 'YA REALIZADOS', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'SPICA', locality: 'MONTE XANIC', serial: '831000167', observations: 'LUN COMODATO', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'A25', locality: 'TIJUANA', serial: '831014906', observations: 'VIERNES', engineers: ['FRANCISCO', 'GUILLERMO'], companions: ['CARLOS'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'A15', locality: 'CMF FUENTES BROTANTES', serial: '831057575', observations: 'COMODATO', engineers: ['EDUARDO'] },
  { week: '04 AL 08 MAYO', serviceType: 'correctivo', platform: 'BA400', locality: 'RAYMUNDO ABARCA', serial: '834002769', observations: 'COMODATO', engineers: ['EDUARDO'] },
  { week: '04 AL 08 MAYO', serviceType: 'capacitacion', platform: 'BA400', locality: 'Laboratorio Ehrlich', serial: '834000252', observations: 'CAPACITACION', engineers: ['MARTHA'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'CD. JUAREZ Lab Roma', serial: '834002775', observations: 'COMODATO', engineers: ['RICARDO MONTAÑEZ'] },
  { week: '04 AL 08 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'CENTRO MEDICO CD JUAREZ HIAR', serial: '834003038', observations: 'COMODATO', engineers: ['RICARDO MONTAÑEZ'] },
  { week: '04 AL 08 MAYO', serviceType: 'correctivo', platform: 'A15', locality: 'MAZATLAN', serial: '831057945', observations: 'CORRECTIVO', engineers: ['DIEGO GARCIA'] },
  { week: '04 AL 08 MAYO', serviceType: 'correctivo', platform: 'BA400', locality: 'ORIZABA', serial: '834002504', observations: 'FALCON', engineers: ['BENJAMIN'] },
  { week: '04 AL 08 MAYO', serviceType: 'ingenieria_soporte', platform: '', locality: 'GUATEMALA', serial: '', observations: '', engineers: ['HECTOR'] },

  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'AIMSA', serial: '', observations: '', engineers: ['LALO', 'DIEGO G'], companions: ['MARTHA'] },
  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'CDMX GRUPO ARIES', serial: '834002663', observations: 'COMODATO', engineers: ['LALO', 'DIEGO G'], companions: ['MARTHA'], scheduledDay: 'MARTES' },
  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA200', locality: 'H. de la Mujer', serial: '832002185', observations: 'COMODATO', engineers: ['BENJA', 'MEMO'], companions: ['MARTHA'], scheduledDay: 'JUEVES' },
  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'H. de la Mujer', serial: '834002891', observations: 'COMODATO', engineers: ['BENJA', 'MEMO'], companions: ['MARTHA'], scheduledDay: 'JUEVES' },
  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'H. homeopatico', serial: '834001811', observations: 'COMODATO', engineers: ['BENJA', 'MEMO'], companions: ['MARTHA'], scheduledDay: 'VIERNES' },
  { week: '11 AL 15 MAYO', serviceType: 'recapacitacion', platform: 'BA200', locality: 'LABCLIM', serial: '832001963', observations: 'RECAPACITACION', engineers: ['MARTHA'], scheduledDay: 'LUNES-MIERCOLES' },
  { week: '11 AL 15 MAYO', serviceType: 'capacitacion', platform: 'BA400', locality: 'CAD SAN RAFAEL', serial: '834002465', observations: 'COMODATO', engineers: ['VILCHIS'], scheduledDay: 'MIERCOLES Y JUEVES' },
  { week: '11 AL 15 MAYO', serviceType: 'capacitacion', platform: '', locality: 'CAPACITACION', serial: '', observations: 'GDL', engineers: ['FRANCISCO'], companions: ['RICARDO M', 'ERICK DURAN'] },
  { week: '11 AL 15 MAYO', serviceType: 'capacitacion', platform: 'NA', locality: 'CAPACITACION FALCON MDA', serial: '', observations: 'INGENIERIA', engineers: ['HECTOR'] },
  { week: '11 AL 15 MAYO', serviceType: 'preventivo', platform: 'BA200', locality: 'SAN ANGEL, COLIMA', serial: '832002186', observations: 'COMODATO', engineers: ['FRANCISCO'], companions: ['PENDIENTE COLIMA DIA'] },
  { week: '11 AL 15 MAYO', serviceType: 'instalacion', platform: 'BA200', locality: 'MERIDA', serial: '834002884', observations: 'CAPACITACION', engineers: ['CHITALA'] },

  { week: '18 AL 22 MAYO', serviceType: 'preventivo', platform: 'A25', locality: 'ATLAPEXCO LAB IBARRA', serial: '831016238', observations: 'GARANTIA 2', engineers: ['GUILLERMO'] },
  { week: '18 AL 22 MAYO', serviceType: 'capacitacion', platform: '', locality: 'CAPACITACION', serial: '', observations: 'GDL', engineers: ['FRANCISCO'], companions: ['MONTAÑEZ', 'ERICK DURAN'] },
  { week: '18 AL 22 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'LAB ESPINOZA, SONORA', serial: '834003045', observations: 'COMODATO', engineers: ['DIEGO GARCIA'] },
  { week: '18 AL 22 MAYO', serviceType: 'capacitacion', platform: 'BA200', locality: 'LOS CABOS', serial: '832002119', observations: 'CAPACITACION', engineers: ['IVONNE', 'NAVARRO'] },
  { week: '18 AL 22 MAYO', serviceType: 'capacitacion', platform: 'A15', locality: 'COATEPEC, VERACRUZ', serial: '831058007', observations: 'DN SOLUCIONES', engineers: ['RICARDO'] },
  { week: '18 AL 22 MAYO', serviceType: 'capacitacion', platform: 'BA200', locality: 'CHETUMAL', serial: '832002396', observations: 'CAPACITACION', engineers: ['ANGEL'] },

  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'CDMX Lab ADS', serial: '834002885', observations: 'COMODATO', engineers: ['GUILLERMO'] },
  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'CDMX Lab ADS', serial: '834001909', observations: 'COMODATO', engineers: ['GUILLERMO'] },
  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'A15', locality: 'LAB ZEMARLAB, TAPILULA', serial: '83105C1544', observations: '', engineers: ['LALO'] },
  { week: '25 AL 29 MAYO', serviceType: 'capacitacion', platform: 'A15', locality: 'RIO VERDE SLP', serial: '', observations: 'INSTALACION-CAPACITACION', engineers: ['CHITALA'] },
  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'A15', locality: 'SILAO', serial: '831057757', observations: '2 GARANTIA', engineers: ['ERICK DURAN'] },
  { week: '25 AL 29 MAYO', serviceType: 'capacitacion', platform: 'A15', locality: 'CULIACAN', serial: '831057960', observations: 'INSTALACION-CAPACITACION', engineers: ['IVONNE'] },
  { week: '25 AL 29 MAYO', serviceType: 'instalacion', platform: 'A15', locality: 'ATLACOMULCO', serial: '8310507958', observations: 'RETIRO DE VIEJO, INSTALACION DEL NUEVO', engineers: ['VILCHIS'] },
  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'BA400', locality: 'DIVET CDMX', serial: '834001096', observations: 'PAGADO', engineers: ['D. GARCIA'], scheduledDay: 'LUNES' },
  { week: '25 AL 29 MAYO', serviceType: 'recapacitacion', platform: 'BA400', locality: 'ADS', serial: '834002885', observations: 'ANALITOS PARA LAB', engineers: ['OLIVIA'] },
  { week: '25 AL 29 MAYO', serviceType: 'ingenieria_soporte', platform: 'BA400', locality: 'RETIRO EQUIPO MTY', serial: '', observations: 'ORANGELAB', engineers: ['GUILLERMO'], scheduledDay: 'JUEVES' },
  { week: '25 AL 29 MAYO', serviceType: 'preventivo', platform: 'A15', locality: 'MINATITLAN, VER', serial: '831016169', observations: 'PREV Y CORRECTIVO', engineers: ['D. GARCIA'], scheduledDay: 'MAR-VIE' },

  { week: '01 AL 05 JUNIO', serviceType: 'preventivo', platform: 'A15', locality: 'TORREON HOSP UNIVERSIDAD', serial: '83105C1228', observations: 'COMODATO RONUAG', engineers: ['MONTAÑEZ'] },
  { week: '01 AL 05 JUNIO', serviceType: 'capacitacion', platform: 'NA', locality: 'CAPACITACION EL SALVADOR', serial: '', observations: 'GDL', engineers: ['HECTOR'] },
  { week: '01 AL 05 JUNIO', serviceType: 'preventivo', platform: 'BA200', locality: 'ZACALTELCO JUSTINIANO', serial: '832001780', observations: 'REQUIERE PAGO', engineers: ['GUILLERMO'], scheduledDay: 'MARTES' },
  { week: '01 AL 05 JUNIO', serviceType: 'capacitacion', platform: 'A15', locality: 'CD JUAREZ', serial: '831057966', observations: 'PRUEBAS ESPECIALES', engineers: ['IVONNE'] },
  { week: '01 AL 05 JUNIO', serviceType: 'capacitacion', platform: 'TODAS', locality: 'APLICATIVO PARA COMERCIAL', serial: '', observations: 'TEAMS', engineers: ['MARTHA'], scheduledDay: 'MARTES' },
  { week: '01 AL 05 JUNIO', serviceType: 'recapacitacion', platform: 'BA400', locality: 'AIMSA', serial: '', observations: '', engineers: ['OLIVIA'] },
  { week: '01 AL 05 JUNIO', serviceType: 'preventivo', platform: '', locality: 'TECOMAN', serial: '', observations: 'PAGADO', engineers: [] },

  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'IPRO', locality: 'AGUASCALIENTES CAMPESTRE', serial: '841011145', observations: 'REQUIERE PAGO', engineers: ['FRANCISCO'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'BA200', locality: 'SLP LAB', serial: '832001686', observations: 'GARANTIA 1', engineers: ['FRANCISCO'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'A25', locality: 'SLP', serial: '831014886', observations: 'PENDIENTE PAGO', engineers: ['FRANCISCO'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'BA200', locality: 'SANTA FE', serial: '832002109', observations: '', engineers: ['FRANCISCO'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'A15', locality: 'CANCEROLOGIA ACAPULCO', serial: '831056420', observations: 'COMODATO FALCON', engineers: ['ALFREDO'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'Y15', locality: 'Ags Vinicola Sta Elena', serial: '831060567', observations: 'REQUIEREN PAGO', engineers: ['FRANCISCO'], companions: ['CARLOS'] },
  { week: '08 AL 12 JUNIO', serviceType: 'preventivo', platform: 'Y15', locality: 'Ags Vinicola El Secreto', serial: '831060843', observations: 'REQUIEREN PAGO', engineers: ['FRANCISCO'], companions: ['CARLOS'] },

  { week: '15 AL 19 JUNIO', serviceType: 'preventivo', platform: 'A25', locality: 'ATLAPEXCO LAB IBARRA', serial: '831016238', observations: 'GARANTIA 1', engineers: [], explicitPending: true },
  { week: '15 AL 19 JUNIO', serviceType: 'preventivo', platform: 'A25', locality: 'Biomédicos de Mérida', serial: '831057769', observations: 'COMODATO', engineers: [] },
];

const getStatusConfig = () => {
  const raw = execSync('supabase status -o json', { encoding: 'utf8' });
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) {
    throw new Error('No se pudo leer la configuracion local de Supabase.');
  }
  return JSON.parse(raw.slice(jsonStart));
};

const buildCanonicalName = (rawName, profilesByNormalizedName) => {
  const cleaned = cleanText(rawName);
  if (!cleaned) return '';
  const alias = profileAliasMap[cleaned.toUpperCase()] || cleaned;
  const directProfile = profilesByNormalizedName.get(normalizeText(alias));
  return directProfile?.nombre_completo || alias;
};

const run = async () => {
  const status = getStatusConfig();
  const supabase = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, nombre_completo');

  if (profilesError) {
    throw profilesError;
  }

  const profilesByNormalizedName = new Map(
    (profiles || []).map((profile) => [normalizeText(profile.nombre_completo), profile]),
  );

  const normalizedRows = RAW_ROWS.map((row) => {
    const engineers = (row.engineers || [])
      .map((name) => buildCanonicalName(name, profilesByNormalizedName))
      .filter(Boolean);
    const companions = (row.companions || [])
      .map((name) => {
        const cleaned = cleanText(name);
        return cleaned && !/[A-ZÁÉÍÓÚ]/.test(cleaned) ? cleaned : buildCanonicalName(cleaned, profilesByNormalizedName) || cleaned;
      })
      .filter(Boolean);
    const weekLabel = normalizePeriodLabel(row.week);
    const locality = cleanText(row.locality);
    const observations = cleanText(row.observations);
    const platform = cleanText(row.platform);
    const serial = cleanText(row.serial);
    const scheduledDay = cleanText(row.scheduledDay);
    const priority = priorityFromRow(row.serviceType, observations);
    const statuses = statusValuesFromRow(observations, engineers.length > 0, Boolean(row.explicitPending));
    const meta = {
      fecha_tentativa: weekLabel,
      fecha_acordada: scheduledDay || null,
      scheduled_date: null,
      scheduled_day: scheduledDay || null,
      requires_flight: false,
      requiere_vuelos: false,
      requires_car: false,
      requiere_auto: false,
      service_type: row.serviceType,
      priority_csv: priority,
      source: 'excel_import',
      companions_csv: companions,
      status_values: statuses,
      created_by_name: AUDIT_NAME,
      updated_by_name: AUDIT_NAME,
      assigned_by_name: AUDIT_NAME,
      created_from: 'replace_planning_may_june_2026',
      updated_at: new Date().toISOString(),
      import_batch_id: IMPORT_BATCH_ID,
      source_file_name: SOURCE_FILE_NAME,
      ingeniero_csv: toCsvString(engineers),
    };
    const leadEngineer = engineers[0] || '';
    const userId = leadEngineer ? profilesByNormalizedName.get(normalizeText(leadEngineer))?.id || null : null;

    return {
      user_id: userId,
      numero_serie_equipo: serial || null,
      asunto: buildSubject(row.serviceType, platform, locality),
      descripcion: serializeDescription(locality, observations, meta),
      estado: 'abierto',
    };
  });

  const mayJuneFilter = async () =>
    supabase
      .from('tickets')
      .select('id, descripcion')
      .neq('estado', 'cerrado')
      .like('descripcion', '%[METADATA_PLANEACION]%');

  const { data: existingRows, error: existingError } = await mayJuneFilter();
  if (existingError) {
    throw existingError;
  }

  const deleteIds = (existingRows || [])
    .filter((row) => {
      const metaRaw = row.descripcion.split('[METADATA_PLANEACION]')[1]?.trim();
      if (!metaRaw) return false;
      try {
        const meta = JSON.parse(metaRaw);
        const week = cleanText(meta?.fecha_tentativa).toUpperCase();
        return week.includes('MAYO') || week.includes('JUNIO');
      } catch {
        return false;
      }
    })
    .map((row) => row.id);

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabase.from('tickets').delete().in('id', deleteIds);
    if (deleteError) {
      throw deleteError;
    }
  }

  const chunkSize = 20;
  for (let index = 0; index < normalizedRows.length; index += chunkSize) {
    const chunk = normalizedRows.slice(index, index + chunkSize);
    const { error: insertError } = await supabase.from('tickets').insert(chunk);
    if (insertError) {
      throw insertError;
    }
  }

  console.log(
    JSON.stringify(
      {
        deleted_preexisting_may_june: deleteIds.length,
        inserted_normalized_rows: normalizedRows.length,
        batch_id: IMPORT_BATCH_ID,
      },
      null,
      2,
    ),
  );
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
