import { supabase } from '../../../supabaseClient';
import { extractPlaneacionMeta, type ProfileSummary } from '../../../components/servicesPlanning';
import { buildPlanningSubject, normalizeText, serializePlanningDescription } from './normalizeService';
import type { ServiceType } from '../types/servicePlanning.types';

const PLANNING_SYNC_ALLOWED_NAMES = ['ricardo montanez', 'ricardo montanez miranda'];
const PLANNING_SYNC_DATASET_BASE_PATH = `${import.meta.env.BASE_URL}service-planning-sync/datasets`;
const CHUNK_SIZE = 20;

const MONTH_INDEX: Record<string, number> = {
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
] as const;

const PERSON_ALIAS_MAP: Record<string, string> = {
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
  'RICARDO VILCHYS': 'Ricardo Vilchis',
  VILCHIS: 'Ricardo Vilchis',
  OLIVIA: 'Olivia Angulo',
  PENDIENTE: 'PENDIENTE',
  RICARDO: 'Ricardo Montanez',
};

const VALID_SERVICE_TYPES = new Set<ServiceType>([
  'preventivo',
  'correctivo',
  'capacitacion',
  'recapacitacion',
  'instalacion',
  'ingenieria_soporte',
]);

type PlanningSyncDatasetRow = {
  week: string;
  serviceType: ServiceType;
  rawTypeLabel?: string;
  platform: string;
  locality: string;
  serial?: string;
  observations?: string;
  engineers?: string[];
  companions?: string[];
  scheduledDate?: string;
  scheduledDay?: string;
  explicitPending?: boolean;
};

type PlanningSyncAvailabilityNote = {
  week: string;
  dateLabel: string;
  type: string;
  person: string;
};

type PlanningSyncDataset = {
  name?: string;
  year?: number;
  auditName?: string;
  sourceFileName?: string;
  sourceSheetUrl?: string;
  replaceWeeks?: string[];
  availabilityNotes?: PlanningSyncAvailabilityNote[];
  rows: PlanningSyncDatasetRow[];
};

export type ServicePlanningSyncSummary = {
  dataset: string;
  replaceWeeks: string[];
  weeksWithRows: Record<string, number>;
  availabilityNotes: number;
  deleteCount: number;
  insertCount: number;
  mode: 'apply';
};

type RunPlanningSyncInput = {
  datasetName: string;
  actorName: string;
  profiles: ProfileSummary[];
};

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

const toIsoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const buildCanonicalName = (rawName: string, profilesByNormalizedName: Map<string, ProfileSummary>) => {
  const cleaned = cleanText(rawName);
  if (!cleaned) {
    return '';
  }

  const alias = PERSON_ALIAS_MAP[cleaned.toUpperCase()] || cleaned;
  const matchedProfile = profilesByNormalizedName.get(normalizeText(alias));
  return matchedProfile?.nombre_completo || alias;
};

const toCanonicalPeople = (values: string[] | undefined, profilesByNormalizedName: Map<string, ProfileSummary>) =>
  (Array.isArray(values) ? values : [])
    .map((value) => buildCanonicalName(value, profilesByNormalizedName))
    .filter(Boolean);

const cleanSerial = (value: string | undefined) => {
  const cleaned = cleanText(value);
  const normalized = normalizeText(cleaned);
  if (!cleaned || normalized === 'na' || normalized === 'n/a' || normalized === 'pendiente') {
    return '';
  }
  return cleaned;
};

const priorityFromRow = (serviceType: ServiceType, observations: string) => {
  const normalized = normalizeText(observations);
  if (normalized.includes('falcon')) {
    return 'critica';
  }
  if (serviceType === 'correctivo') {
    return 'alta';
  }
  return 'media';
};

const statusValuesFromRow = (observations: string, hasEngineer: boolean, explicitPending = false) => {
  const normalized = normalizeText(observations);
  const statuses = new Set<string>();

  if (normalized.includes('requiere pago') || normalized.includes('requieren pago') || normalized.includes('pendiente pago')) {
    statuses.add('requiere_pago');
  }
  if (normalized.includes('realizado')) {
    statuses.add('realizado');
  }
  if (normalized.includes('comodato')) {
    statuses.add('comodato');
  }
  if (normalized.includes('garantia')) {
    statuses.add('garantia');
  }
  if (normalized.includes('falcon')) {
    statuses.add('critico');
  }
  if (explicitPending || normalized.includes('pendiente')) {
    statuses.add('pendiente');
  }
  if (!hasEngineer) {
    statuses.add('sin_asignar');
  }

  return Array.from(statuses);
};

const parseWeekLabel = (rawWeek: string, fallbackYear: number) => {
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

const summarizeRowsByWeek = (rows: Array<{ weekLabel: string }>) =>
  rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[row.weekLabel] = (accumulator[row.weekLabel] || 0) + 1;
    return accumulator;
  }, {});

const loadDataset = async (datasetName: string) => {
  const datasetPath = `${PLANNING_SYNC_DATASET_BASE_PATH}/${datasetName}.json`;
  const response = await fetch(datasetPath, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`No fue posible cargar el dataset "${datasetName}".`);
  }

  return (await response.json()) as PlanningSyncDataset;
};

export const canAccessPlanningSync = (currentUserName: string) => {
  const normalized = normalizeText(currentUserName);
  return PLANNING_SYNC_ALLOWED_NAMES.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed} `),
  );
};

export const syncServicePlanningDataset = async ({
  datasetName,
  actorName,
  profiles,
}: RunPlanningSyncInput): Promise<ServicePlanningSyncSummary> => {
  if (!canAccessPlanningSync(actorName)) {
    throw new Error('Tu perfil no tiene habilitada la sincronizacion de planeacion.');
  }

  const dataset = await loadDataset(datasetName);
  if (!Array.isArray(dataset.rows)) {
    throw new Error('El dataset no contiene filas validas.');
  }

  const baseYear = Number(dataset.year) || new Date().getFullYear();
  const datasetLabel = cleanText(dataset.name) || datasetName;
  const profilesByNormalizedName = new Map(
    profiles
      .filter((profile) => cleanText(profile.nombre_completo))
      .map((profile) => [normalizeText(profile.nombre_completo || ''), profile]),
  );
  const importBatchId = `${datasetLabel}-${Date.now()}`;
  const auditName = cleanText(actorName) || cleanText(dataset.auditName) || 'Service Planning Sync';

  const normalizedRows = dataset.rows.map((row, index) => {
    const serviceType = cleanText(row.serviceType) as ServiceType;
    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      throw new Error(`Fila ${index + 1}: serviceType invalido "${row.serviceType}"`);
    }

    const weekInfo = parseWeekLabel(row.week, baseYear);
    const engineers = toCanonicalPeople(row.engineers, profilesByNormalizedName);
    const companions = toCanonicalPeople(row.companions, profilesByNormalizedName);
    const leadEngineer = engineers[0] || '';
    const leadProfile = leadEngineer ? profilesByNormalizedName.get(normalizeText(leadEngineer)) : null;
    const observations = cleanText(row.observations);
    const scheduledDate = cleanText(row.scheduledDate);
    const scheduledDay = cleanText(row.scheduledDay);
    const priority = priorityFromRow(serviceType, observations);
    const statuses = statusValuesFromRow(observations, engineers.length > 0, Boolean(row.explicitPending));
    const metadata = {
      fecha_tentativa: weekInfo.weekLabel,
      fecha_acordada: scheduledDate || scheduledDay || null,
      scheduled_date: scheduledDate || null,
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
      created_by_name: auditName,
      updated_by_name: auditName,
      assigned_by_name: auditName,
      created_from: 'service_planning_sync_button',
      updated_at: new Date().toISOString(),
      import_batch_id: importBatchId,
      source_file_name: cleanText(dataset.sourceFileName) || `${datasetName}.json`,
      source_sheet_url: cleanText(dataset.sourceSheetUrl) || null,
      ingeniero_csv: engineers.join(' / '),
    };

    return {
      weekLabel: weekInfo.weekLabel,
      payload: {
        user_id: leadProfile?.id || null,
        numero_serie_equipo: cleanSerial(row.serial) || null,
        asunto: buildPlanningSubject(serviceType, row.platform, row.locality),
        descripcion: serializePlanningDescription(row.locality, observations, metadata),
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
    .select('id, descripcion, estado')
    .neq('estado', 'cerrado')
    .like('descripcion', '%[METADATA_PLANEACION]%');

  if (existingError) {
    throw new Error(existingError.message || 'No fue posible leer la planeacion actual.');
  }

  const replaceWeekSet = new Set(replaceWeeks.map((week) => cleanText(week).toUpperCase()));
  const deleteIds = (existingRows || [])
    .filter((row) => {
      const meta = extractPlaneacionMeta(row.descripcion);
      return meta?.fecha_tentativa ? replaceWeekSet.has(cleanText(meta.fecha_tentativa).toUpperCase()) : false;
    })
    .map((row) => row.id);

  if (deleteIds.length > 0) {
    const { error: deleteError } = await supabase.from('tickets').delete().in('id', deleteIds);
    if (deleteError) {
      throw new Error(deleteError.message || 'No fue posible limpiar la planeacion previa.');
    }
  }

  const payloads = normalizedRows.map((entry) => entry.payload);
  for (let index = 0; index < payloads.length; index += CHUNK_SIZE) {
    const chunk = payloads.slice(index, index + CHUNK_SIZE);
    const { error: insertError } = await supabase.from('tickets').insert(chunk);
    if (insertError) {
      throw new Error(insertError.message || 'No fue posible insertar la nueva planeacion.');
    }
  }

  return {
    dataset: datasetLabel,
    replaceWeeks,
    weeksWithRows: summarizeRowsByWeek(normalizedRows),
    availabilityNotes: Array.isArray(dataset.availabilityNotes) ? dataset.availabilityNotes.length : 0,
    deleteCount: deleteIds.length,
    insertCount: normalizedRows.length,
    mode: 'apply',
  };
};
