import { extractPlaneacionMeta, type EquipmentSummary, type ProfileSummary } from '../../../components/servicesPlanning';
import {
  buildPlanningSubject,
  isExternalProviderName,
  mapPendingTicketToPlannedService,
  normalizePersonName,
  normalizeServiceType,
  normalizeText,
  serializePlanningDescription,
} from '../helpers/normalizeService';
import type { PlannedService, ServicePriority, ServiceStatus, ServiceType } from '../types/servicePlanning.types';
import { addDays, daysBetween, isIsoDate, weekFromMonday, weekLabel, weekOfDate, mondayOf, type PlanningWeek } from './planningWeeks';

// One planning activity = one ticket. Its attributes live in the ticket's planning metadata; this module
// turns a ticket into editable values and back, touching only the keys of the fields that changed.

export interface PlanningTicketRow {
  id: string;
  user_id: string | null;
  asunto: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  numero_serie_equipo: string | null;
  numero_caso?: string | null;
  planning_version?: number | null;
}

export interface PlanningValues {
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialNumber: string;
  observations: string;
  engineer: string;
  companions: string[];
  scheduledDate: string;
  scheduledEndDate: string;
  days: string;
  statuses: ServiceStatus[];
  priority: ServicePriority;
  custom: Record<string, string>;
}

export type BaseField = Exclude<keyof PlanningValues, 'custom'>;
export type PlanningField = BaseField | `custom:${string}`;
export type FieldValue = string | string[];

export interface PlanningRecord {
  id: string;
  version: number | null;
  estado: string;
  closed: boolean;
  createdAt: string;
  ticketNumber: string | null;
  row: PlanningTicketRow;
  meta: Record<string, unknown>;
  week: PlanningWeek;
  values: PlanningValues;
  service: PlannedService;
  createdBy: string;
  updatedBy: string;
  updatedAt: string;
  fromSheet: boolean;
  order: number | null;
}

export interface PlanningContext {
  profiles: ProfileSummary[];
  equipments?: EquipmentSummary[];
  actorName: string;
  actorId?: string | null;
  now?: string;
}

export const SERVICE_STATUSES: ServiceStatus[] = [
  'programado', 'pendiente', 'confirmado', 'requiere_pago', 'realizado', 'bloqueado', 'critico', 'garantia', 'comodato',
];
const PRIORITIES: ServicePriority[] = ['critica', 'alta', 'media', 'baja'];

const cleanText = (value: unknown) => (typeof value === 'string' ? value : '').replace(/\s+/g, ' ').trim();
const text = (value: unknown) => (typeof value === 'string' ? value : '');

export const isCustomField = (field: PlanningField): field is `custom:${string}` => field.startsWith('custom:');

const descriptionLine = (description: string | null, label: string) => {
  const body = (description || '').split('[METADATA_PLANEACION]')[0];
  const line = body.split('\n').find((entry) => normalizeText(entry).startsWith(normalizeText(`${label}:`)));
  return line ? cleanText(line.slice(line.indexOf(':') + 1)) : '';
};

const subjectParts = (subject: string) =>
  subject
    .replace(/^\s*\[PLAN\]\s*/i, '')
    .split(' - ')
    .map((part) => cleanText(part));

const peopleFrom = (value: unknown, profiles: ProfileSummary[]) => {
  const list = Array.isArray(value) ? value.map((entry) => text(entry)) : text(value).split(/\s*[/,]\s*/);
  return list.map((entry) => normalizePersonName(entry, profiles)).filter(Boolean);
};

const unique = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeText(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const recordWeek = (meta: Record<string, unknown>, service: PlannedService, scheduledDate: string): PlanningWeek => {
  if (isIsoDate(meta.week_start) && isIsoDate(meta.week_end)) {
    const start = meta.week_start;
    const end = meta.week_end;
    return { start, end, label: cleanText(meta.fecha_tentativa) || weekLabel(start, end), monthKey: end.slice(0, 7) };
  }
  if (scheduledDate) return weekOfDate(scheduledDate);
  if (isIsoDate(service.weekStart) && isIsoDate(service.weekEnd)) {
    return { start: service.weekStart, end: service.weekEnd, label: weekLabel(service.weekStart, service.weekEnd), monthKey: service.weekEnd.slice(0, 7) };
  }
  return weekFromMonday(mondayOf(service.trace.createdAt.slice(0, 10)));
};

export const toPlanningRecord = (row: PlanningTicketRow, profiles: ProfileSummary[], equipments: EquipmentSummary[] = []): PlanningRecord => {
  const meta = (extractPlaneacionMeta(row.descripcion) || {}) as Record<string, unknown>;
  const service = mapPendingTicketToPlannedService(
    { id: row.id, user_id: row.user_id, asunto: row.asunto, descripcion: row.descripcion, estado: row.estado, creado_en: row.creado_en, numero_serie_equipo: row.numero_serie_equipo },
    equipments,
    profiles,
  );
  const parts = subjectParts(row.asunto || '');
  const engineers = peopleFrom(meta.ingeniero_csv, profiles);
  const scheduledDate = isIsoDate(meta.scheduled_date) ? meta.scheduled_date : '';
  const customRaw = meta.custom_fields && typeof meta.custom_fields === 'object' ? (meta.custom_fields as Record<string, unknown>) : {};
  const storedStatuses = Array.isArray(meta.status_values) ? meta.status_values : [];
  const priorityRaw = normalizeText(text(meta.priority_csv));

  const values: PlanningValues = {
    serviceType: typeof meta.service_type === 'string' ? normalizeServiceType(meta.service_type) : service.serviceType,
    platform: parts.length >= 3 ? parts[1] : service.platform === 'MULTIPLE' ? '' : service.platform,
    locality: descriptionLine(row.descripcion, 'Cliente/Localidad') || (parts.length >= 3 ? parts.slice(2).join(' - ') : service.locality),
    serialNumber: cleanText(row.numero_serie_equipo),
    observations: descriptionLine(row.descripcion, 'Observaciones'),
    engineer: engineers[0] || '',
    // The workbook writes the crew in the engineer cell: everyone after the first goes along as companion.
    companions: unique([...engineers.slice(1), ...peopleFrom(meta.companions_csv, profiles)]),
    scheduledDate,
    scheduledEndDate: isIsoDate(meta.scheduled_end_date) ? meta.scheduled_end_date : '',
    days: cleanText(meta.scheduled_day) || (scheduledDate ? '' : cleanText(meta.fecha_acordada)),
    statuses: storedStatuses.filter((status): status is ServiceStatus => SERVICE_STATUSES.includes(status as ServiceStatus)),
    priority: (PRIORITIES.find((priority) => priority === priorityRaw) || service.priority) as ServicePriority,
    custom: Object.fromEntries(Object.entries(customRaw).map(([key, value]) => [key, value == null ? '' : String(value)])),
  };
  if (values.locality === 'LOCALIDAD POR DEFINIR' || values.locality === 'Localidad por definir') values.locality = '';
  if (values.platform === 'MULTIPLE' && !parts[1]) values.platform = '';

  return {
    id: row.id,
    version: typeof row.planning_version === 'number' ? row.planning_version : null,
    estado: row.estado,
    closed: row.estado === 'cerrado',
    createdAt: row.creado_en,
    ticketNumber: row.numero_caso || null,
    row,
    meta,
    week: recordWeek(meta, service, scheduledDate),
    values,
    service,
    createdBy: text(meta.created_by_name),
    updatedBy: text(meta.updated_by_name),
    updatedAt: text(meta.updated_at) || row.creado_en,
    fromSheet: Boolean(meta.source_row_key) || text(meta.created_from) === 'service_planning_sheet_sync',
    order: typeof meta.grid_order === 'number' ? meta.grid_order : null,
  };
};

export const getFieldValue = (record: PlanningRecord | { values: PlanningValues }, field: PlanningField): FieldValue => {
  if (isCustomField(field)) return record.values.custom[field.slice(7)] || '';
  return record.values[field] as FieldValue;
};

export const sameValue = (left: FieldValue | undefined, right: FieldValue | undefined) =>
  JSON.stringify(left ?? '') === JSON.stringify(right ?? '');

export type PlanningPatch = Partial<Record<PlanningField, FieldValue>> & { week?: PlanningWeek; order?: number };

export const applyPatchToValues = (values: PlanningValues, patch: PlanningPatch): PlanningValues => {
  const next: PlanningValues = { ...values, custom: { ...values.custom } };
  for (const [field, value] of Object.entries(patch)) {
    if (field === 'week' || field === 'order' || value === undefined) continue;
    if (field.startsWith('custom:')) next.custom[field.slice(7)] = String(value);
    else (next as unknown as Record<string, FieldValue>)[field] = value as FieldValue;
  }
  return next;
};

const profileFor = (name: string, profiles: ProfileSummary[]) =>
  profiles.find((profile) => normalizeText(profile.nombre_completo || '') === normalizeText(name)) || null;

const writeWeek = (meta: Record<string, unknown>, week: PlanningWeek) => {
  meta.week_start = week.start;
  meta.week_end = week.end;
  meta.fecha_tentativa = week.label;
  meta.planning_month_key = week.monthKey;
};

const writeField = (meta: Record<string, unknown>, field: PlanningField, values: PlanningValues) => {
  switch (field) {
    case 'serviceType':
      meta.service_type = values.serviceType;
      break;
    case 'engineer':
      meta.ingeniero_csv = values.engineer;
      break;
    case 'companions':
      meta.companions_csv = values.companions;
      break;
    case 'scheduledDate':
      meta.scheduled_date = values.scheduledDate || null;
      meta.fecha_acordada = values.scheduledDate || values.days || null;
      break;
    case 'scheduledEndDate':
      meta.scheduled_end_date = values.scheduledEndDate || null;
      break;
    case 'days':
      meta.scheduled_day = values.days || null;
      meta.fecha_acordada = values.scheduledDate || values.days || null;
      break;
    case 'statuses':
      meta.status_values = values.statuses;
      break;
    case 'priority':
      meta.priority_csv = values.priority;
      break;
    default:
      if (isCustomField(field)) {
        const custom = { ...((meta.custom_fields as Record<string, unknown>) || {}) };
        const key = field.slice(7);
        if (values.custom[key]) custom[key] = values.custom[key];
        else delete custom[key];
        meta.custom_fields = custom;
      }
  }
};

export interface TicketWritePayload {
  asunto?: string;
  descripcion: string;
  numero_serie_equipo?: string | null;
  user_id?: string | null;
}

// Rebuilds the ticket columns from the stored ticket plus the patched fields only.
export const buildUpdatePayload = (record: PlanningRecord, patch: PlanningPatch, ctx: PlanningContext, extraMeta: Record<string, unknown> = {}): TicketWritePayload => {
  const now = ctx.now || new Date().toISOString();
  const values = applyPatchToValues(record.values, patch);
  const meta: Record<string, unknown> = { ...record.meta };
  const fields = Object.keys(patch).filter((key) => key !== 'week' && key !== 'order') as PlanningField[];
  fields.forEach((field) => writeField(meta, field, values));
  const week = patch.week || (fields.includes('scheduledDate') && values.scheduledDate && !(values.scheduledDate >= record.week.start && values.scheduledDate <= addDays(record.week.start, 6)) ? weekOfDate(values.scheduledDate) : null);
  if (week) writeWeek(meta, week);
  if (typeof patch.order === 'number') meta.grid_order = patch.order;

  const edited = new Set(Array.isArray(meta.orion_edited_fields) ? (meta.orion_edited_fields as string[]) : []);
  fields.forEach((field) => edited.add(field));
  if (week) edited.add('week');
  meta.orion_edited_fields = Array.from(edited);
  meta.orion_edited_at = now;
  meta.updated_by_name = ctx.actorName;
  meta.updated_at = now;
  Object.assign(meta, extraMeta);

  const payload: TicketWritePayload = { descripcion: serializePlanningDescription(values.locality, values.observations, meta) };
  if (fields.some((field) => field === 'serviceType' || field === 'platform' || field === 'locality')) {
    payload.asunto = buildPlanningSubject(values.serviceType, values.platform, values.locality);
  }
  if (fields.includes('serialNumber')) payload.numero_serie_equipo = cleanText(values.serialNumber) || null;
  if (fields.includes('engineer')) {
    const lead = profileFor(values.engineer, ctx.profiles);
    payload.user_id = lead && !isExternalProviderName(values.engineer) ? lead.id : null;
  }
  return payload;
};

export const emptyValues = (): PlanningValues => ({
  serviceType: 'preventivo',
  platform: '',
  locality: '',
  serialNumber: '',
  observations: '',
  engineer: '',
  companions: [],
  scheduledDate: '',
  scheduledEndDate: '',
  days: '',
  statuses: [],
  priority: 'media',
  custom: {},
});

export const buildInsertPayload = (values: PlanningValues, week: PlanningWeek, ctx: PlanningContext, order?: number, extraMeta: Record<string, unknown> = {}) => {
  const now = ctx.now || new Date().toISOString();
  const resolvedWeek = values.scheduledDate && !(values.scheduledDate >= week.start && values.scheduledDate <= addDays(week.start, 6)) ? weekOfDate(values.scheduledDate) : week;
  const meta: Record<string, unknown> = {
    requires_flight: false,
    requiere_vuelos: false,
    requires_car: false,
    requiere_auto: false,
    source: 'orion',
    created_from: 'service_planning_grid',
    created_by_name: ctx.actorName,
    assigned_by_name: ctx.actorName,
    ...extraMeta,
  };
  if (typeof order === 'number') meta.grid_order = order;
  writeWeek(meta, resolvedWeek);
  (['serviceType', 'engineer', 'companions', 'scheduledDate', 'scheduledEndDate', 'days', 'statuses', 'priority'] as PlanningField[]).forEach((field) => writeField(meta, field, values));
  Object.keys(values.custom).forEach((key) => writeField(meta, `custom:${key}`, values));
  meta.orion_edited_fields = ['created'];
  meta.orion_edited_at = now;
  meta.updated_by_name = ctx.actorName;
  meta.updated_at = now;
  const lead = values.engineer ? profileFor(values.engineer, ctx.profiles) : null;
  return {
    user_id: lead?.id || ctx.actorId || null,
    numero_serie_equipo: cleanText(values.serialNumber) || null,
    asunto: buildPlanningSubject(values.serviceType, values.platform, values.locality),
    descripcion: serializePlanningDescription(values.locality, values.observations, meta),
    estado: 'abierto' as const,
  };
};

// Moving keeps the weekday: an activity on Wednesday stays on Wednesday of the target week.
export const movePatch = (record: PlanningRecord, target: PlanningWeek): PlanningPatch => {
  const delta = daysBetween(record.week.start, target.start);
  const patch: PlanningPatch = { week: target };
  if (record.values.scheduledDate) patch.scheduledDate = addDays(record.values.scheduledDate, delta);
  if (record.values.scheduledEndDate) patch.scheduledEndDate = addDays(record.values.scheduledEndDate, delta);
  return patch;
};

export const isRequiredMissing = (values: PlanningValues) => !cleanText(values.locality);
