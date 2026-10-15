import { supabase } from '../../../supabaseClient';
import { extractPlaneacionMeta, type ProfileSummary } from '../../../components/servicesPlanning';
import { buildPlanningSubject, normalizeText, serializePlanningDescription } from './normalizeService';
import { foldText, type SheetActivity } from './planningSheet';
import { buildRowKey, createPeopleResolver, looseKey } from './planningPeople';
import { fetchPlanningSheet, planningSheetTabUrl, type PlanningSheetSnapshot } from './planningSheetSource';
import type { ServiceType } from '../types/servicePlanning.types';
import { ABSENCE_SHORT, sheetNoteToAbsences, type AbsenceKind } from '../grid/planningAbsences';
import { mondayOf } from '../grid/planningWeeks';

const PLANNING_SYNC_ALLOWED_NAMES = ['ricardo montanez', 'ricardo montanez miranda'];
const PLANNING_TIME_ZONE = 'America/Ciudad_Juarez';
const PAGE_SIZE = 1000;
const CHUNK_SIZE = 20;
const SHEET_CREATED_FROM = 'service_planning_sheet_sync';

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
  /** Activities edited in Orion after the last sync: the sheet's version is reported, never applied silently. */
  protectedRows: PlanningSyncChange[];
  /** TXT, vacations… written as notes in the sheet, as dated absences per person. */
  absences: AbsenceSyncSummary;
  unchanged: number;
  alreadyClosed: number;
  cancelledInSheet: number;
  pastWeeksSkipped: number;
  dryRun: boolean;
};

export type AbsenceSyncSummary = {
  available: boolean;
  added: string[];
  removed: string[];
  protectedRows: string[];
  /** Notes about someone being away that name nobody (not imported). */
  unrecognised: string[];
  /** Imported with the name the sheet uses, but nobody in Orion has that profile. */
  withoutProfile: string[];
};

type RunPlanningSyncInput = {
  actorName: string;
  profiles: ProfileSummary[];
  dryRun?: boolean;
  snapshot?: PlanningSheetSnapshot;
  /** Activities edited in Orion for which the user chose the sheet's version anyway. */
  useSheetFor?: string[];
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

const todayInPlanningZone = () => new Date().toLocaleDateString('en-CA', { timeZone: PLANNING_TIME_ZONE });

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

// Protected transition (owner, 2026-10-14): once someone edits an activity in Orion after the last sync,
// Sincronizar no longer overwrites or deletes it; it lists what the sheet says so a person decides.
const editedInOrion = (meta: Record<string, unknown>) => {
  const edited = typeof meta.orion_edited_at === 'string' ? meta.orion_edited_at : '';
  const synced = typeof meta.sheet_synced_at === 'string' ? meta.sheet_synced_at : '';
  return Boolean(edited) && (!synced || edited > synced);
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
  useSheetFor = [],
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
    protectedRows: [],
    absences: { available: true, added: [], removed: [], protectedRows: [], unrecognised: [], withoutProfile: [] },
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
  const isProtected = (row: ExistingPlanning) => editedInOrion(row.meta) && !useSheetFor.includes(row.id);

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
      if (match && match.estado !== 'cerrado') {
        if (isProtected(match)) summary.protectedRows.push(describe(match, activity.week.weekLabel, 'Cancelada en la hoja, pero se editó en Orion'));
        else removals.push({ row: match, reason: 'Cancelada en la planeación oficial' });
      }
      continue;
    }

    if (match?.estado === 'cerrado') {
      summary.alreadyClosed += 1;
      continue;
    }

    // The workbook writes the whole crew in the engineer cell ("MARTHA / FRANCISCO"):
    // the first one is responsible and the rest go along as companions.
    const [lead, ...crew] = people.engineers(activity.engineerTokens);
    const engineers = lead ? [lead] : [];
    const { people: companionPeople, notes: companionNotes } = people.companions(activity.companionTokens);
    const companions = Array.from(new Set([...crew, ...companionPeople])).filter((name) => name !== lead);
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
        JSON.stringify(previous.companions_csv || []) !== JSON.stringify(companions) ? 'acompañantes' : '',
        (previous.scheduled_day || null) !== (metadata.scheduled_day || null) ? 'días' : '',
        activity.status === 'pospuesto' ? 'pospuesta' : '',
      ].filter(Boolean);
      if (isProtected(match)) {
        summary.protectedRows.push(describe(match, activity.week.weekLabel, `Se editó en Orion; en la hoja cambió: ${changes.join(', ') || 'detalles'}`));
        continue;
      }
      updates.push({ row: match, payload, change: describe({ id: match.id, ...payload }, activity.week.weekLabel, changes.join(', ') || 'detalles') });
    } else {
      inserts.push({ ...payload, estado: 'abierto' });
      const crewLabel = [engineers.join(' / '), companions.length ? `con ${companions.join(', ')}` : ''].filter(Boolean).join(' ');
      summary.inserted.push(describe(payload, activity.week.weekLabel, crewLabel));
    }
  }

  // Leftovers: workbook rows of the weeks just read that the workbook no longer has.
  for (const row of existing) {
    if (consumed.has(row.id) || row.estado === 'cerrado' || !cameFromSheet(row.meta)) continue;
    const weekEnd = typeof row.meta.week_end === 'string' ? row.meta.week_end : '';
    const weekLabel = typeof row.meta.fecha_tentativa === 'string' ? row.meta.fecha_tentativa : '';
    if (!weekEnd || weekEnd < today || !coveredWeeks.has(foldText(weekLabel))) continue;
    if (isProtected(row)) {
      summary.protectedRows.push(describe(row, weekLabel, 'Ya no está en la hoja, pero se editó en Orion'));
      continue;
    }
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

  summary.absences = await syncAbsences(snapshot, profiles, today, dryRun, auditName, now);
  return summary;
};

type ExistingAbsence = {
  id: string;
  sheet_key: string | null;
  person_name: string;
  kind: AbsenceKind;
  start_date: string;
  end_date: string;
  sheet_synced_at: string | null;
  orion_edited_at: string | null;
};

const absenceLabel = (absence: { kind: AbsenceKind; personName: string; startDate: string; endDate: string }) =>
  `${ABSENCE_SHORT[absence.kind]} · ${absence.personName} · ${absence.startDate === absence.endDate ? absence.startDate : `${absence.startDate} al ${absence.endDate}`}`;

const AWAY_WORDS = /\b(TXT|VAC|VACACIONES|INCAPACIDAD|PERMISO|DESCANSO|CUMPLE\w*|SEMANA SANTA)\b/;

// Notes in the weeks the sheet still lists (current week onward) become absences; ones it no longer has are
// removed, except those someone edited in Orion afterwards (protected, like activities).
const syncAbsences = async (
  snapshot: PlanningSheetSnapshot,
  profiles: ProfileSummary[],
  today: string,
  dryRun: boolean,
  auditName: string,
  now: string,
): Promise<AbsenceSyncSummary> => {
  const result: AbsenceSyncSummary = { available: true, added: [], removed: [], protectedRows: [], unrecognised: [], withoutProfile: [] };
  const coveredWeeks = new Set(snapshot.weeks.filter((week) => week.weekEnd >= today).map((week) => week.weekStart));
  const notes = (snapshot.notes || []).filter((note) => note.week.weekEnd >= today);
  const candidates = notes.flatMap((note) => {
    const found = sheetNoteToAbsences(note, profiles);
    if (!found.length && AWAY_WORDS.test(foldText(note.text))) result.unrecognised.push(`${note.week.weekLabel.toLowerCase()}: ${note.text}`);
    return found;
  });

  const { data, error } = await supabase
    .from('planning_absences')
    .select('id, sheet_key, person_name, kind, start_date, end_date, sheet_synced_at, orion_edited_at')
    .eq('source', 'sheet');
  if (error) {
    if (/does not exist|schema cache|could not find/i.test(error.message || '') || ['42P01', 'PGRST205'].includes((error as { code?: string }).code || '')) {
      return { ...result, available: false };
    }
    throw new Error(error.message || 'No fue posible leer las ausencias.');
  }
  const existing = (data || []) as ExistingAbsence[];
  const known = new Set(existing.map((row) => row.sheet_key));
  const wanted = new Set(candidates.map((candidate) => candidate.sheetKey));

  const toAdd = candidates.filter((candidate) => !known.has(candidate.sheetKey));
  result.added = toAdd.map(absenceLabel);
  result.withoutProfile = toAdd.filter((candidate) => !candidate.personId).map(absenceLabel);

  const gone = existing.filter((row) => row.sheet_key && !wanted.has(row.sheet_key) && coveredWeeks.has(mondayOf(row.start_date)));
  const editedInOrion = (row: ExistingAbsence) => Boolean(row.orion_edited_at) && (!row.sheet_synced_at || (row.orion_edited_at as string) > row.sheet_synced_at);
  const toRemove = gone.filter((row) => !editedInOrion(row));
  const describeRow = (row: ExistingAbsence) => absenceLabel({ kind: row.kind, personName: row.person_name, startDate: row.start_date, endDate: row.end_date });
  result.removed = toRemove.map(describeRow);
  result.protectedRows = gone.filter(editedInOrion).map((row) => `${describeRow(row)} (ya no está en la hoja, pero se editó en Orion)`);

  if (!dryRun) {
    if (toAdd.length) {
      const { error: insertError } = await supabase.from('planning_absences').upsert(
        toAdd.map((candidate) => ({
          person_id: candidate.personId ?? null,
          person_name: candidate.personName,
          kind: candidate.kind,
          start_date: candidate.startDate,
          end_date: candidate.endDate,
          note: candidate.note || null,
          source: 'sheet',
          sheet_key: candidate.sheetKey,
          sheet_synced_at: now,
          created_by_name: auditName,
          updated_by_name: auditName,
        })),
        { onConflict: 'sheet_key', ignoreDuplicates: true },
      );
      if (insertError) throw new Error(insertError.message || 'No fue posible guardar las ausencias de la hoja.');
    }
    if (toRemove.length) {
      const { error: deleteError } = await supabase.from('planning_absences').delete().in('id', toRemove.map((row) => row.id));
      if (deleteError) throw new Error(deleteError.message || 'No fue posible retirar ausencias.');
    }
  }
  return result;
};
