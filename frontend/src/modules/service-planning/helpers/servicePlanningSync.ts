import { supabase } from '../../../supabaseClient';
import { extractPlaneacionMeta, type ProfileSummary } from '../../../components/servicesPlanning';
import { buildPlanningSubject, normalizeText, serializePlanningDescription } from './normalizeService';
import { foldText, type SheetActivity } from './planningSheet';
import { fetchPlanningSheet, planningSheetTabUrl, type PlanningSheetSnapshot } from './planningSheetSource';
import type { ServiceType } from '../types/servicePlanning.types';

const PLANNING_SYNC_ALLOWED_NAMES = ['ricardo montanez', 'ricardo montanez miranda'];
const PLANNING_TIME_ZONE = 'America/Ciudad_Juarez';
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 20;
const SHEET_CREATED_FROM = 'service_planning_sheet_sync';

// How the workbook names people; anything else is matched against the staff profiles.
const PERSON_ALIAS_MAP: Record<string, string> = {
  ALFREDO: 'Alfredo Acevedo',
  ANGEL: 'Luis Angel Perez',
  BENJA: 'Benjamin Martinez',
  BENJAMIN: 'Benjamin Martinez',
  CARLOS: 'Carlos Muniz',
  CHITALA: 'Miguel Chitala',
  'D. GARCIA': 'Diego Garcia Garcia',
  DIEGO: 'Diego Garcia Garcia',
  'DIEGO G': 'Diego Garcia Garcia',
  'DIEGO GARCIA': 'Diego Garcia Garcia',
  EDUARDO: 'Eduardo Ignacio Bautista',
  ERICK: 'Erick Duran',
  FCO: 'Francisco',
  FRANCISCO: 'Francisco',
  GARCIA: 'Diego Garcia Garcia',
  GUILLERMO: 'Guillermo Martinez',
  HECTOR: 'Hector Cortes',
  IVONNE: 'Ivonne Jaramillo',
  LALO: 'Eduardo Ignacio Bautista',
  MARTHA: 'Martha Carbajal',
  MEMO: 'Guillermo Martinez',
  MONTANEZ: 'Ricardo Montanez',
  NAVARRO: 'Diego Navarro',
  OLIVIA: 'Olivia Angulo',
  RICARDO: 'Ricardo Montanez',
  'RICARDO M': 'Ricardo Montanez',
  'RICARDO V': 'Ricardo Vilchis',
  'RICARDO VILCHYS': 'Ricardo Vilchis',
  VILCHIS: 'Ricardo Vilchis',
};

// Words that make a companion cell a note ("PAGADO", "SE CAMBIA A NOV") rather than a person.
const NOTE_WORDS = /\b(PAGAD\w*|PENDIENTE|CAMBI\w*|RUTA|EQUIPOS?|SE|NOV\w*|DIAS?|PREVENTIVOS?|CANCELAD\w*|POSPUEST\w*|COMODATOS?|GARANTIA|CORRECTIVO|FALCON)\b|\d/;

// Statuses Orion owns; the sheet never removes them.
const ORION_STATUSES = new Set(['realizado', 'confirmado', 'programado']);

export type PlanningSyncChange = {
  id?: string;
  weekLabel: string;
  subject: string;
  serial: string | null;
  detail?: string;
};

export type ServicePlanningSyncSummary = {
  sheetTitle: string;
  readTabs: string[];
  fetchedAt: string;
  sheetActivities: number;
  inserted: PlanningSyncChange[];
  updated: PlanningSyncChange[];
  removed: PlanningSyncChange[];
  flagged: PlanningSyncChange[];
  unchanged: number;
  alreadyClosed: number;
  cancelledInSheet: number;
  pastWeeksSkipped: number;
  dryRun: boolean;
};

type RunPlanningSyncInput = {
  actorName: string;
  profiles: ProfileSummary[];
  dryRun?: boolean;
  snapshot?: PlanningSheetSnapshot;
};

type ExistingPlanningRow = {
  id: string;
  estado: string | null;
  descripcion: string | null;
  asunto: string | null;
  numero_serie_equipo: string | null;
};

type ExistingPlanning = ExistingPlanningRow & { meta: Record<string, unknown>; key: string };

const cleanText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

const titleCase = (value: string) =>
  cleanText(value)
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`);

const todayInPlanningZone = () => new Date().toLocaleDateString('en-CA', { timeZone: PLANNING_TIME_ZONE });

// One activity = same week, same subject (type, platform, locality) and same serial.
// Punctuation is ignored so "H, GRAL IGUALA" and "H. GRAL IGUALA" are the same place.
const buildRowKey = (weekLabel: string, subject: string | null | undefined, serial: string | null | undefined) =>
  [foldText(weekLabel), foldText(subject || '').replace(/[^A-Z0-9]/g, ''), foldText(serial || '').replace(/[^A-Z0-9]/g, '')].join('|');

const looseKey = (key: string) => key.split('|').slice(0, 2).join('|');

const createPeopleResolver = (profiles: ProfileSummary[]) => {
  const named = profiles.filter((profile) => cleanText(profile.nombre_completo));
  const byName = new Map(named.map((profile) => [normalizeText(profile.nombre_completo || ''), profile]));
  const byToken = new Map<string, ProfileSummary[]>();
  for (const profile of named) {
    for (const token of new Set(normalizeText(profile.nombre_completo || '').split(' '))) {
      byToken.set(token, [...(byToken.get(token) || []), profile]);
    }
  }

  const resolve = (raw: string) => {
    const folded = foldText(raw);
    if (!folded) return null;
    const alias = PERSON_ALIAS_MAP[folded];
    const exact = byName.get(normalizeText(alias || raw));
    if (exact) return exact.nombre_completo || null;
    if (alias) return alias;
    const tokenMatches = byToken.get(normalizeText(raw));
    return tokenMatches?.length === 1 ? tokenMatches[0].nombre_completo || null : null;
  };

  return {
    profileFor: (name: string) => byName.get(normalizeText(name)) || null,
    engineers: (tokens: string[]) =>
      tokens
        .filter((token) => !/^(PENDIENTE|NA|N\/A|POR DEFINIR)$/.test(foldText(token)))
        .map((token) => resolve(token) || titleCase(token))
        .filter(Boolean),
    // Companion cells mix people and notes; unknown two- or three-word names are kept as external people.
    companions: (tokens: string[]) => {
      const people: string[] = [];
      const notes: string[] = [];
      for (const token of tokens) {
        const person = resolve(token);
        const folded = foldText(token);
        if (person) people.push(person);
        else if (!NOTE_WORDS.test(folded) && /^[A-Z]+(?: [A-Z]+){1,2}$/.test(folded)) people.push(titleCase(token));
        else notes.push(cleanText(token));
      }
      return { people, notes };
    },
  };
};

const statusValuesFromSheet = (activity: SheetActivity, text: string, hasEngineer: boolean) => {
  const normalized = normalizeText(text);
  const statuses = new Set<string>();
  if (normalized.includes('requiere pago') || normalized.includes('requieren pago') || normalized.includes('pendiente pago')) statuses.add('requiere_pago');
  if (normalized.includes('comodato')) statuses.add('comodato');
  if (normalized.includes('garantia')) statuses.add('garantia');
  if (normalized.includes('falcon')) statuses.add('critico');
  if (normalized.includes('pendiente')) statuses.add('pendiente');
  if (activity.status === 'pospuesto') statuses.add('bloqueado');
  if (!hasEngineer) statuses.add('sin_asignar');
  return Array.from(statuses);
};

const priorityFromSheet = (serviceType: ServiceType, text: string) => {
  const normalized = normalizeText(text);
  if (normalized.includes('falcon')) return 'critica';
  if (serviceType === 'correctivo') return 'alta';
  return 'media';
};

const loadExistingPlanning = async () => {
  const rows: ExistingPlanningRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('tickets')
      .select('id, estado, descripcion, asunto, numero_serie_equipo')
      .like('descripcion', '%[METADATA_PLANEACION]%')
      .order('id')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      throw new Error(error.message || 'No fue posible leer la planeación actual.');
    }

    rows.push(...((data || []) as ExistingPlanningRow[]));
    if (!data || data.length < PAGE_SIZE) {
      return rows;
    }
  }
};

const toExisting = (row: ExistingPlanningRow): ExistingPlanning => {
  const meta = (extractPlaneacionMeta(row.descripcion) || {}) as Record<string, unknown>;
  const storedKey = typeof meta.source_row_key === 'string' ? meta.source_row_key : '';
  const weekLabel = typeof meta.fecha_tentativa === 'string' ? meta.fecha_tentativa : '';
  return { ...row, meta, key: storedKey || buildRowKey(weekLabel, row.asunto, row.numero_serie_equipo) };
};

// Rows the workbook put in Orion (any import or this sync), as opposed to rows created inside Orion.
const cameFromSheet = (meta: Record<string, unknown>) => {
  const createdFrom = typeof meta.created_from === 'string' ? meta.created_from : '';
  const batch = typeof meta.import_batch_id === 'string' ? meta.import_batch_id : '';
  return Boolean(meta.source_row_key) || createdFrom.startsWith('service_planning_sync') || createdFrom === SHEET_CREATED_FROM || (batch !== '' && !batch.startsWith('manual-import'));
};

const describe = (row: { id?: string; asunto: string | null; numero_serie_equipo: string | null }, weekLabel: string, detail?: string): PlanningSyncChange => ({
  id: row.id,
  weekLabel,
  subject: cleanText(row.asunto),
  serial: row.numero_serie_equipo,
  detail,
});

export const canAccessPlanningSync = (currentUserName: string) => {
  const normalized = normalizeText(currentUserName);
  return PLANNING_SYNC_ALLOWED_NAMES.some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed} `),
  );
};

// Makes Orion match the official workbook from the current week onward: adds what is missing,
// updates what changed there, and removes what the workbook no longer has (or cancelled).
// Past weeks and closed activities are history and are never touched.
export const syncServicePlanningFromSheet = async ({
  actorName,
  profiles,
  dryRun = false,
  snapshot: providedSnapshot,
}: RunPlanningSyncInput): Promise<ServicePlanningSyncSummary> => {
  if (!canAccessPlanningSync(actorName)) {
    throw new Error('Tu perfil no tiene habilitada la sincronizacion de planeacion.');
  }

  const snapshot = providedSnapshot || (await fetchPlanningSheet({ force: true }));
  const people = createPeopleResolver(profiles);
  const auditName = cleanText(actorName) || 'Service Planning Sync';
  const now = new Date().toISOString();
  const today = todayInPlanningZone();
  const batchId = `hoja-oficial-${Date.now()}`;

  const upcoming = snapshot.activities.filter((activity) => activity.week.weekEnd >= today);
  const coveredWeeks = new Set(snapshot.weeks.filter((week) => week.weekEnd >= today).map((week) => foldText(week.weekLabel)));

  const existing = (await loadExistingPlanning()).map(toExisting);
  const byKey = new Map<string, ExistingPlanning[]>();
  const byLooseKey = new Map<string, ExistingPlanning[]>();
  for (const row of existing) {
    byKey.set(row.key, [...(byKey.get(row.key) || []), row]);
    byLooseKey.set(looseKey(row.key), [...(byLooseKey.get(looseKey(row.key)) || []), row]);
  }
  // A closed twin wins: that activity already happened or was closed, it must not come back.
  for (const rows of [...byKey.values(), ...byLooseKey.values()]) {
    rows.sort((left, right) => Number(right.estado === 'cerrado') - Number(left.estado === 'cerrado'));
  }

  const summary: ServicePlanningSyncSummary = {
    sheetTitle: snapshot.title,
    readTabs: snapshot.readTabs,
    fetchedAt: snapshot.fetchedAt,
    sheetActivities: upcoming.length,
    inserted: [],
    updated: [],
    removed: [],
    flagged: [],
    unchanged: 0,
    alreadyClosed: 0,
    cancelledInSheet: 0,
    pastWeeksSkipped: snapshot.activities.length - upcoming.length,
    dryRun,
  };

  const inserts: Array<Record<string, unknown>> = [];
  const updates: Array<{ row: ExistingPlanning; payload: Record<string, unknown>; change: PlanningSyncChange }> = [];
  const removals: Array<{ row: ExistingPlanning; reason: string }> = [];
  const consumed = new Set<string>();

  for (const activity of upcoming) {
    const asunto = buildPlanningSubject(activity.serviceType, activity.platform, activity.locality);
    const key = buildRowKey(activity.week.weekLabel, asunto, activity.serial);
    // Same activity with the serial missing on one side (the workbook often says "NA") is still the same activity.
    const match =
      (byKey.get(key) || []).find((row) => !consumed.has(row.id)) ||
      (byLooseKey.get(looseKey(key)) || []).find(
        (row) => !consumed.has(row.id) && (!activity.serial || !row.key.split('|')[2]),
      );
    if (match) consumed.add(match.id);

    if (activity.status === 'cancelado') {
      summary.cancelledInSheet += 1;
      if (match && match.estado !== 'cerrado') removals.push({ row: match, reason: 'Cancelada en la planeación oficial' });
      continue;
    }

    if (match?.estado === 'cerrado') {
      summary.alreadyClosed += 1;
      continue;
    }

    const engineers = people.engineers(activity.engineerTokens);
    const { people: companions, notes: companionNotes } = people.companions(activity.companionTokens);
    const sheetNotes = [...companionNotes, activity.rowNote].filter(Boolean);
    const serialNote = !activity.serial && activity.serialText && !/^(NA|N\/A|PENDIENTE)$/i.test(activity.serialText) ? `NS en la hoja: ${activity.serialText}` : '';
    const observationText = [activity.observations, ...sheetNotes, serialNote, activity.daysText ? `Días: ${activity.daysText}` : '']
      .filter(Boolean)
      .join(' · ');
    const statuses = statusValuesFromSheet(activity, [activity.observations, ...sheetNotes].join(' '), engineers.length > 0);
    const leadProfile = engineers[0] ? people.profileFor(engineers[0]) : null;
    const fingerprint = JSON.stringify([
      asunto,
      activity.serial,
      activity.locality,
      observationText,
      engineers,
      companions,
      activity.daysText,
      activity.scheduledDate,
      activity.status,
      activity.rawType,
    ]);

    const previous = match?.meta || {};
    if (match && previous.sheet_fingerprint === fingerprint) {
      summary.unchanged += 1;
      continue;
    }

    const keptStatuses = (Array.isArray(previous.status_values) ? previous.status_values : []).filter(
      (status): status is string => typeof status === 'string' && ORION_STATUSES.has(status),
    );
    const metadata = {
      ...previous,
      fecha_tentativa: activity.week.weekLabel,
      week_start: activity.week.weekStart,
      week_end: activity.week.weekEnd,
      planning_month_key: activity.week.monthKey,
      fecha_acordada: activity.daysText || previous.fecha_acordada || null,
      scheduled_date: activity.scheduledDate || previous.scheduled_date || null,
      scheduled_day: activity.daysText || previous.scheduled_day || null,
      raw_type_label: activity.rawType || null,
      requires_flight: previous.requires_flight ?? false,
      requiere_vuelos: previous.requiere_vuelos ?? false,
      requires_car: previous.requires_car ?? false,
      requiere_auto: previous.requiere_auto ?? false,
      service_type: activity.serviceType,
      priority_csv: previous.priority_csv || priorityFromSheet(activity.serviceType, observationText),
      source: 'excel_import',
      companions_csv: companions,
      status_values: Array.from(new Set([...keptStatuses, ...statuses])),
      created_by_name: previous.created_by_name || auditName,
      updated_by_name: auditName,
      assigned_by_name: auditName,
      created_from: previous.created_from || SHEET_CREATED_FROM,
      updated_at: now,
      import_batch_id: previous.import_batch_id || batchId,
      source_file_name: snapshot.title,
      source_sheet_url: planningSheetTabUrl(activity.gid),
      source_row_key: key,
      ingeniero_csv: engineers.join(' / '),
      sheet_tab: activity.tab,
      sheet_row: activity.sheetRow,
      sheet_color: activity.color,
      sheet_type_label: activity.rawType || null,
      sheet_serial_text: activity.serialText || null,
      sheet_days: activity.daysText || null,
      sheet_notes: sheetNotes,
      sheet_status: activity.status,
      sheet_engineers_raw: activity.engineerTokens,
      sheet_companions_raw: activity.companionTokens,
      sheet_synced_at: now,
      sheet_fingerprint: fingerprint,
    };
    const payload = {
      user_id: leadProfile?.id || null,
      numero_serie_equipo: activity.serial || match?.numero_serie_equipo || null,
      asunto,
      descripcion: serializePlanningDescription(activity.locality, observationText, metadata),
    };

    if (match) {
      const changes = [
        cleanText(match.asunto) !== asunto ? 'actividad' : '',
        cleanText(String(previous.ingeniero_csv || '')) !== engineers.join(' / ') ? 'ingenieros' : '',
        (previous.scheduled_day || null) !== (metadata.scheduled_day || null) ? 'días' : '',
        activity.status === 'pospuesto' ? 'pospuesta' : '',
      ].filter(Boolean);
      updates.push({ row: match, payload, change: describe({ id: match.id, ...payload }, activity.week.weekLabel, changes.join(', ') || 'detalles') });
    } else {
      inserts.push({ ...payload, estado: 'abierto' });
      summary.inserted.push(describe(payload, activity.week.weekLabel, engineers.join(' / ')));
    }
  }

  // Leftovers: workbook rows of the weeks just read that the workbook no longer has.
  for (const row of existing) {
    if (consumed.has(row.id) || row.estado === 'cerrado' || !cameFromSheet(row.meta)) continue;
    const weekEnd = typeof row.meta.week_end === 'string' ? row.meta.week_end : '';
    const weekLabel = typeof row.meta.fecha_tentativa === 'string' ? row.meta.fecha_tentativa : '';
    if (!weekEnd || weekEnd < today || !coveredWeeks.has(foldText(weekLabel))) continue;
    removals.push({ row, reason: 'Ya no está en la planeación oficial' });
  }

  if (!dryRun) {
    for (let index = 0; index < inserts.length; index += CHUNK_SIZE) {
      const { error } = await supabase.from('tickets').insert(inserts.slice(index, index + CHUNK_SIZE));
      if (error) throw new Error(error.message || 'No fue posible agregar la planeación nueva.');
    }
    for (const { row, payload } of updates) {
      const { error } = await supabase.from('tickets').update(payload).eq('id', row.id);
      if (error) throw new Error(error.message || 'No fue posible actualizar la planeación.');
    }
  }
  summary.updated = updates.map((entry) => entry.change);

  for (const { row, reason } of removals) {
    const weekLabel = typeof row.meta.fecha_tentativa === 'string' ? row.meta.fecha_tentativa : '';
    const statuses = Array.isArray(row.meta.status_values) ? row.meta.status_values : [];
    // Work already attached (trip, report, done) stays; it is only marked so someone decides.
    const hasWork = Boolean(row.meta.travel_request_id || row.meta.service_report_id) || statuses.includes('realizado');
    if (!hasWork && !dryRun) {
      const { error } = await supabase.from('tickets').delete().eq('id', row.id);
      if (!error) {
        summary.removed.push(describe(row, weekLabel, reason));
        continue;
      }
    } else if (!hasWork) {
      summary.removed.push(describe(row, weekLabel, reason));
      continue;
    }

    if (row.meta.sheet_status !== 'retirada') {
      const metadata = {
        ...row.meta,
        status_values: Array.from(new Set([...statuses.filter((status): status is string => typeof status === 'string'), 'bloqueado'])),
        sheet_status: 'retirada',
        sheet_synced_at: now,
        updated_at: now,
        updated_by_name: auditName,
      };
      const description = String(row.descripcion || '');
      const previousObservations = cleanText(description.match(/Observaciones:\s*([^\n]*)/)?.[1] || '');
      const observations = [`${reason}; revisar antes de cerrar.`, previousObservations].filter(Boolean).join(' · ');
      if (!dryRun) {
        const locality = cleanText(description.match(/Cliente\/Localidad:\s*([^\n]*)/)?.[1] || '');
        const { error } = await supabase
          .from('tickets')
          .update({ descripcion: serializePlanningDescription(locality, observations, metadata) })
          .eq('id', row.id);
        if (error) throw new Error(error.message || 'No fue posible marcar la planeación retirada.');
      }
      summary.flagged.push(describe(row, weekLabel, reason));
    }
  }

  return summary;
};
