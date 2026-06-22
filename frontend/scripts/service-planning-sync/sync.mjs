#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.resolve(__dirname, '../..');
const DATASET_DIR = path.join(FRONTEND_DIR, 'public', 'service-planning-sync', 'datasets');
const METADATA_DELIMITER = '[METADATA_PLANEACION]';
const CHUNK_SIZE = 20;

const SERVICE_TYPE_LABELS = {
  preventivo: 'Preventivo',
  correctivo: 'Correctivo',
  capacitacion: 'Capacitacion',
  recapacitacion: 'Recapacitacion',
  instalacion: 'Instalacion',
  ingenieria_soporte: 'Ingenieria / Soporte',
};

const MONTH_INDEX = {
  ENERO: 0,
  ENE: 0,
  FEBRERO: 1,
  FEB: 1,
  MARZO: 2,
  MAR: 2,
  ABRIL: 3,
  ABR: 3,
  MAYO: 4,
  MAY: 4,
  JUNIO: 5,
  JUN: 5,
  JULIO: 6,
  JUL: 6,
  AGOSTO: 7,
  AGO: 7,
  SEPTIEMBRE: 8,
  SEP: 8,
  SETIEMBRE: 8,
  OCTUBRE: 9,
  OCT: 9,
  NOVIEMBRE: 10,
  NOV: 10,
  DICIEMBRE: 11,
  DIC: 11,
};

const MONTH_NAMES = [
  'ENERO',
  'FEBRERO',
  'MARZO',
  'ABRIL',
  'MAYO',
  'JUNIO',
  'JULIO',
  'AGOSTO',
  'SEPTIEMBRE',
  'OCTUBRE',
  'NOVIEMBRE',
  'DICIEMBRE',
];

const PERSON_ALIAS_MAP = {
  ALFREDO: 'Alfredo Acevedo',
  ANGEL: 'Luis Angel Perez',
  BENJA: 'Benjamin Martinez',
  BENJAMIN: 'Benjamin Martinez',
  'BENJAMIN MARTINEZ': 'Benjamin Martinez',
  CARLOS: 'Carlos Muniz',
  CHITALA: 'Miguel Chitala',
  'D. GARCIA': 'Diego Garcia Garcia',
  'DIEGO G': 'Diego Garcia Garcia',
  'DIEGO GARCIA': 'Diego Garcia Garcia',
  'DIEGO GARCIA GARCIA': 'Diego Garcia Garcia',
  EDUARDO: 'Eduardo Ignacio Bautista',
  ERICK: 'Erick Duran',
  'ERICK DURAN': 'Erick Duran',
  FRANCISCO: 'Francisco',
  GUILLERMO: 'Guillermo Martinez',
  HECTOR: 'Hector Cortes',
  IVONNE: 'Ivonne Jaramillo',
  LALO: 'Eduardo Ignacio Bautista',
  MARTHA: 'Martha Carbajal',
  MEMO: 'Guillermo Martinez',
  MONTANEZ: 'Ricardo Montanez',
  'RICARDO M': 'Ricardo Montanez',
  'RICARDO MONTAÑEZ': 'Ricardo Montanez',
  'RICARDO MONTANEZ': 'Ricardo Montanez',
  'RICARDO VILCHIS': 'Ricardo Vilchis',
  VILCHIS: 'Ricardo Vilchis',
  OLIVIA: 'Olivia Angulo',
  PENDIENTE: 'PENDIENTE',
  RICARDO: 'Ricardo Montanez',
  'RICARDO VILCHYS': 'Ricardo Vilchis',
};

const VALID_SERVICE_TYPES = new Set(Object.keys(SERVICE_TYPE_LABELS));

const cleanText = (value) => (value ?? '').toString().replace(/\s+/g, ' ').trim();

const normalizeText = (value) =>
  cleanText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const toIsoDate = (date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatMonthKey = (dateIso) => dateIso.slice(0, 7);

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
  return `${lines.join('\n')}\n\n${METADATA_DELIMITER} ${JSON.stringify(metadata)}`;
};

const listDatasets = () =>
  fs
    .readdirSync(DATASET_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.replace(/\.json$/i, ''))
    .sort();

const readArgs = () => {
  const raw = process.argv.slice(2);
  const args = {
    apply: false,
    dryRun: false,
    listDatasets: false,
    dataset: '',
    input: '',
    projectRef: '',
    url: '',
    serviceRoleKey: '',
  };

  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    const next = raw[index + 1];
    if (token === '--apply') {
      args.apply = true;
      continue;
    }
    if (token === '--dry-run') {
      args.dryRun = true;
      continue;
    }
    if (token === '--list-datasets') {
      args.listDatasets = true;
      continue;
    }
    if (token === '--dataset' && next) {
      args.dataset = next;
      index += 1;
      continue;
    }
    if (token === '--input' && next) {
      args.input = next;
      index += 1;
      continue;
    }
    if (token === '--project-ref' && next) {
      args.projectRef = next;
      index += 1;
      continue;
    }
    if (token === '--url' && next) {
      args.url = next;
      index += 1;
      continue;
    }
    if (token === '--service-role-key' && next) {
      args.serviceRoleKey = next;
      index += 1;
      continue;
    }
  }

  if (!args.apply) {
    args.dryRun = true;
  }

  return args;
};

const loadEnvFiles = () => {
  for (const envName of ['.env.local', '.env.production', '.env']) {
    const envPath = path.join(FRONTEND_DIR, envName);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
    }
  }
};

const resolveInputPath = (args) => {
  if (args.input) {
    return path.isAbsolute(args.input) ? args.input : path.resolve(process.cwd(), args.input);
  }

  if (args.dataset) {
    return path.join(DATASET_DIR, `${args.dataset}.json`);
  }

  throw new Error('Debes indicar --dataset <nombre> o --input <ruta>.');
};

const inferProjectRefFromUrl = (url) => {
  const match = cleanText(url).match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return match?.[1] || '';
};

const discoverServiceRoleKey = (projectRef) => {
  const raw = execSync(`supabase projects api-keys --project-ref ${projectRef} -o json`, {
    cwd: FRONTEND_DIR,
    encoding: 'utf8',
  });
  const keys = JSON.parse(raw);
  const legacyServiceRole = keys.find(
    (entry) =>
      entry &&
      entry.id === 'service_role' &&
      typeof entry.api_key === 'string' &&
      entry.api_key.split('.').length === 3,
  );

  if (!legacyServiceRole?.api_key) {
    throw new Error(
      'No se pudo descubrir una service_role utilizable via Supabase CLI. Usa --service-role-key o SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  return legacyServiceRole.api_key;
};

const parseWeekLabel = (rawWeek, fallbackYear) => {
  const normalized = cleanText(rawWeek).toUpperCase();
  const match = normalized.match(
    /^(\d{1,2})\s+AL\s+(\d{1,2})(?:\s+DE)?\s+(ENERO|ENE|FEBRERO|FEB|MARZO|MAR|ABRIL|ABR|MAYO|MAY|JUNIO|JUN|JULIO|JUL|AGOSTO|AGO|SEPTIEMBRE|SEP|SETIEMBRE|OCTUBRE|OCT|NOVIEMBRE|NOV|DICIEMBRE|DIC)(?:\s+(\d{2,4}))?$/i,
  );

  if (!match) {
    throw new Error(`Semana invalida: "${rawWeek}"`);
  }

  const startDay = Number(match[1]);
  const endDay = Number(match[2]);
  const monthIndex = MONTH_INDEX[match[3].toUpperCase()];
  const endYear = match[4] ? (match[4].length === 2 ? 2000 + Number(match[4]) : Number(match[4])) : fallbackYear;
  const endDate = new Date(endYear, monthIndex, endDay, 12, 0, 0);
  const startDate = new Date(endYear, monthIndex, startDay, 12, 0, 0);

  if (startDay > endDay) {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  return {
    weekLabel: `${`${startDay}`.padStart(2, '0')} AL ${`${endDay}`.padStart(2, '0')} ${MONTH_NAMES[monthIndex]}`,
    weekStart: toIsoDate(startDate),
    weekEnd: toIsoDate(endDate),
    planningMonthKey: `${endYear}-${`${monthIndex + 1}`.padStart(2, '0')}`,
  };
};

const cleanSerial = (value) => {
  const cleaned = cleanText(value);
  const normalized = normalizeText(cleaned);
  if (!cleaned || normalized === 'na' || normalized === 'n/a' || normalized === 'pendiente') {
    return '';
  }
  return cleaned;
};

const buildCanonicalName = (rawName, profilesByNormalizedName) => {
  const cleaned = cleanText(rawName);
  if (!cleaned) return '';
  const alias = PERSON_ALIAS_MAP[cleaned.toUpperCase()] || cleaned;
  const directProfile = profilesByNormalizedName.get(normalizeText(alias));
  return directProfile?.nombre_completo || alias;
};

const toCanonicalPeople = (values, profilesByNormalizedName) =>
  (Array.isArray(values) ? values : [])
    .map((value) => buildCanonicalName(value, profilesByNormalizedName))
    .filter(Boolean);

const priorityFromRow = (serviceType, observations) => {
  const normalized = normalizeText(observations);
  if (normalized.includes('falcon')) return 'critica';
  if (serviceType === 'correctivo') return 'alta';
  return 'media';
};

const statusValuesFromRow = (observations, hasEngineer, explicitPending = false) => {
  const normalized = normalizeText(observations);
  const statuses = new Set();
  if (normalized.includes('requiere pago') || normalized.includes('requieren pago')) statuses.add('requiere_pago');
  if (normalized.includes('realizado')) statuses.add('realizado');
  if (normalized.includes('comodato')) statuses.add('comodato');
  if (normalized.includes('garantia')) statuses.add('garantia');
  if (normalized.includes('falcon')) statuses.add('critico');
  if (explicitPending || normalized.includes('pendiente')) statuses.add('pendiente');
  if (!hasEngineer) statuses.add('sin_asignar');
  return Array.from(statuses);
};

const validateDataset = (dataset) => {
  if (!dataset || typeof dataset !== 'object') {
    throw new Error('El dataset no es un objeto JSON valido.');
  }

  if (!Array.isArray(dataset.rows)) {
    throw new Error('El dataset debe incluir un arreglo "rows".');
  }

  if (dataset.rows.length === 0 && (!Array.isArray(dataset.replaceWeeks) || dataset.replaceWeeks.length === 0)) {
    throw new Error('El dataset debe incluir filas en "rows" o semanas en "replaceWeeks".');
  }
};

const summarizeRowsByWeek = (rows) =>
  rows.reduce((accumulator, row) => {
    accumulator[row.weekLabel] = (accumulator[row.weekLabel] || 0) + 1;
    return accumulator;
  }, {});

const run = async () => {
  loadEnvFiles();
  const args = readArgs();

  if (args.listDatasets) {
    console.log(JSON.stringify({ datasets: listDatasets() }, null, 2));
    return;
  }

  const inputPath = resolveInputPath(args);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`No existe el dataset: ${inputPath}`);
  }

  const dataset = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  validateDataset(dataset);

  const supabaseUrl = args.url || process.env.VITE_SUPABASE_URL || '';
  if (!supabaseUrl) {
    throw new Error('No se encontro VITE_SUPABASE_URL. Usa --url o define el env.');
  }

  const projectRef = args.projectRef || inferProjectRefFromUrl(supabaseUrl);
  if (!projectRef) {
    throw new Error('No se pudo inferir el project ref de Supabase.');
  }

  const serviceRoleKey =
    args.serviceRoleKey ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    discoverServiceRoleKey(projectRef);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, nombre_completo');

  if (profilesError) {
    throw profilesError;
  }

  const profilesByNormalizedName = new Map(
    (profiles || []).map((profile) => [normalizeText(profile.nombre_completo || ''), profile]),
  );

  const baseYear = Number(dataset.year) || new Date().getFullYear();
  const normalizedRows = dataset.rows.map((row, index) => {
    const weekInfo = parseWeekLabel(row.week, baseYear);
    const serviceType = cleanText(row.serviceType);
    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      throw new Error(`Fila ${index + 1}: serviceType invalido "${row.serviceType}"`);
    }

    const engineers = toCanonicalPeople(row.engineers, profilesByNormalizedName);
    const companions = toCanonicalPeople(row.companions, profilesByNormalizedName);
    const observations = cleanText(row.observations);
    const scheduledDay = cleanText(row.scheduledDay);
    const priority = priorityFromRow(serviceType, observations);
    const statuses = statusValuesFromRow(observations, engineers.length > 0, Boolean(row.explicitPending));
    const leadEngineer = engineers[0] || '';
    const leadProfile = leadEngineer ? profilesByNormalizedName.get(normalizeText(leadEngineer)) : null;

    const metadata = {
      fecha_tentativa: weekInfo.weekLabel,
      fecha_acordada: cleanText(row.scheduledDate) || scheduledDay || null,
      scheduled_date: cleanText(row.scheduledDate) || null,
      scheduled_day: scheduledDay || null,
      week_start: weekInfo.weekStart,
      week_end: weekInfo.weekEnd,
      planning_month_key: weekInfo.planningMonthKey,
      raw_type_label: cleanText(row.rawTypeLabel) || null,
      requires_flight: false,
      requiere_vuelos: false,
      requires_car: false,
      requiere_auto: false,
      service_type: serviceType,
      priority_csv: priority,
      source: 'excel_import',
      companions_csv: companions,
      status_values: statuses,
      created_by_name: cleanText(dataset.auditName) || 'Service Planning Sync',
      updated_by_name: cleanText(dataset.auditName) || 'Service Planning Sync',
      assigned_by_name: cleanText(dataset.auditName) || 'Service Planning Sync',
      created_from: 'service_planning_sync',
      updated_at: new Date().toISOString(),
      import_batch_id: `${cleanText(dataset.name || path.basename(inputPath, '.json'))}-${Date.now()}`,
      source_file_name: cleanText(dataset.sourceFileName) || path.basename(inputPath),
      ingeniero_csv: engineers.join(' / '),
    };

    return {
      weekLabel: weekInfo.weekLabel,
      payload: {
        user_id: leadProfile?.id || null,
        numero_serie_equipo: cleanSerial(row.serial) || null,
        asunto: buildSubject(serviceType, row.platform, row.locality),
        descripcion: serializeDescription(row.locality, observations, metadata),
        estado: 'abierto',
      },
    };
  });

  const replaceWeeks = Array.from(
    new Set(
      (Array.isArray(dataset.replaceWeeks) ? dataset.replaceWeeks : dataset.rows.map((row) => row.week)).map((week) =>
        parseWeekLabel(week, baseYear).weekLabel,
      ),
    ),
  ).sort();

  const { data: existingRows, error: existingError } = await supabase
    .from('tickets')
    .select('id, descripcion')
    .neq('estado', 'cerrado')
    .like('descripcion', `%${METADATA_DELIMITER}%`);

  if (existingError) {
    throw existingError;
  }

  const replaceWeekSet = new Set(replaceWeeks);
  const deleteIds = (existingRows || [])
    .filter((row) => {
      const metaRaw = row.descripcion.split(METADATA_DELIMITER)[1]?.trim();
      if (!metaRaw) return false;
      try {
        const meta = JSON.parse(metaRaw);
        return replaceWeekSet.has(cleanText(meta?.fecha_tentativa).toUpperCase());
      } catch {
        return false;
      }
    })
    .map((row) => row.id);

  const summary = {
    dataset: cleanText(dataset.name || path.basename(inputPath, '.json')),
    source: inputPath,
    replaceWeeks,
    weeksWithRows: summarizeRowsByWeek(normalizedRows),
    availabilityNotes: Array.isArray(dataset.availabilityNotes) ? dataset.availabilityNotes.length : 0,
    deleteCount: deleteIds.length,
    insertCount: normalizedRows.length,
    mode: args.apply ? 'apply' : 'dry-run',
  };

  if (!args.apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabase.from('tickets').delete().in('id', deleteIds);
    if (deleteError) {
      throw deleteError;
    }
  }

  const payloads = normalizedRows.map((entry) => entry.payload);
  for (let index = 0; index < payloads.length; index += CHUNK_SIZE) {
    const chunk = payloads.slice(index, index + CHUNK_SIZE);
    const { error: insertError } = await supabase.from('tickets').insert(chunk);
    if (insertError) {
      throw insertError;
    }
  }

  console.log(JSON.stringify(summary, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
