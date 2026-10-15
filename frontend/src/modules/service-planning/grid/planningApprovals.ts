import { formatPlanningPersonName } from '../helpers/normalizeService';
import { ABSENCE_SHORT, describeAbsenceDates, type AbsenceInput } from './planningAbsences';
import { BASE_COLUMNS, TYPE_LABELS } from './planningColumns';
import { applyPatchToValues, type FieldValue, type PlanningField, type PlanningPatch, type PlanningRecord, type PlanningValues } from './planningRecord';
import type { PlanningWeek } from './planningWeeks';

// Change requests: only the planning approvers (Sofía Ceballos, and the owner) change the master table
// directly. Anyone else's change is sent as a request; an approver approves it (it is then applied on top
// of the current data) or rejects it. Requests are also the evidence of who asked for what and who decided.

export type ChangeRequestKind = 'update' | 'insert' | 'delete' | 'absence_insert' | 'absence_update' | 'absence_delete';
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'failed';

export interface UpdatePayload {
  fields: Partial<Record<PlanningField, FieldValue>>;
  week?: PlanningWeek;
  order?: number;
}
export interface InsertPayload {
  week: PlanningWeek;
  values: PlanningValues;
}
export interface AbsencePayload {
  input: AbsenceInput;
}

export interface ChangeRequest {
  id: string;
  kind: ChangeRequestKind;
  ticketId: string | null;
  absenceId: string | null;
  payload: Record<string, unknown>;
  baseVersion: number | null;
  summary: string;
  targetLabel: string;
  status: ChangeRequestStatus;
  requestedBy: string | null;
  requestedByName: string;
  requestedAt: string;
  updatedAt: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface Approver {
  userId: string;
  name: string;
  notify: boolean;
}

export interface ApprovalContext {
  /** False while the database update with requests is missing: everyone keeps editing as before. */
  enabled: boolean;
  isApprover: boolean;
  approvers: Approver[];
}

export type NewChangeRequest = Pick<ChangeRequest, 'kind' | 'payload' | 'summary' | 'targetLabel'> & {
  id?: string;
  ticketId?: string | null;
  absenceId?: string | null;
  baseVersion?: number | null;
  requestedByName: string;
};

export const STATUS_TEXT: Record<ChangeRequestStatus, string> = {
  pending: 'Por aprobar',
  approved: 'Aprobado',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  failed: 'No se pudo aplicar',
};

export const notifiedApproverName = (context: ApprovalContext) => {
  const names = context.approvers.filter((approver) => approver.notify).map((approver) => formatPlanningPersonName(approver.name) || approver.name);
  return names.length ? names.join(' o ') : 'la persona que aprueba la planeación';
};

// ----- payload helpers -----
export const updatePayload = (request: ChangeRequest): UpdatePayload => {
  const payload = request.payload as Partial<UpdatePayload>;
  return { fields: (payload.fields || {}) as UpdatePayload['fields'], week: payload.week, order: payload.order };
};

export const toPatch = (payload: UpdatePayload): PlanningPatch => ({
  ...payload.fields,
  ...(payload.week ? { week: payload.week } : {}),
  ...(typeof payload.order === 'number' ? { order: payload.order } : {}),
});

export const mergeUpdatePayload = (current: UpdatePayload, patch: PlanningPatch): UpdatePayload => {
  const fields = { ...current.fields };
  let week = current.week;
  let order = current.order;
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'week') week = value as PlanningWeek;
    else if (key === 'order') order = value as number;
    else if (value !== undefined) fields[key as PlanningField] = value as FieldValue;
  }
  return { fields, ...(week ? { week } : {}), ...(typeof order === 'number' ? { order } : {}) };
};

// ----- human text (what the approver reads and what stays as evidence) -----
const COLUMN_BY_FIELD = new Map(BASE_COLUMNS.filter((column) => column.field).map((column) => [column.field as string, column]));

const fieldText = (field: string, values: PlanningValues) => {
  const column = COLUMN_BY_FIELD.get(field);
  if (column) return column.format(values) || 'vacío';
  if (field.startsWith('custom:')) return values.custom[field.slice(7)] || 'vacío';
  return '';
};

const fieldLabel = (field: string, customLabels: Record<string, string> = {}) =>
  COLUMN_BY_FIELD.get(field)?.label || (field.startsWith('custom:') ? customLabels[field.slice(7)] || field.slice(7) : field);

export const recordLabel = (values: PlanningValues, week?: PlanningWeek) =>
  [values.platform, values.locality || 'sin localidad', week ? week.label.toLowerCase() : ''].filter(Boolean).join(' · ');

/** "Fecha: 15/10/2026 → 16/10/2026" for each proposed field, against the current values. */
export const describeUpdate = (current: PlanningValues, payload: UpdatePayload, currentWeek?: PlanningWeek, customLabels?: Record<string, string>) => {
  const proposed = applyPatchToValues(current, payload.fields);
  const lines = Object.keys(payload.fields).map((field) => {
    const before = fieldText(field, current);
    const after = fieldText(field, proposed);
    return `${fieldLabel(field, customLabels)}: ${before} → ${after}`;
  });
  if (payload.week && payload.week.start !== currentWeek?.start) lines.unshift(`Semana: ${currentWeek ? currentWeek.label.toLowerCase() : '—'} → ${payload.week.label.toLowerCase()}`);
  if (!lines.length && typeof payload.order === 'number') lines.push('Cambio de orden dentro de la semana');
  return lines;
};

export const describeInsert = (payload: InsertPayload) => {
  const { values, week } = payload;
  return [
    `Nueva actividad: ${TYPE_LABELS[values.serviceType]} · ${values.platform || 'sin plataforma'} · ${values.locality}`,
    `Semana ${week.label.toLowerCase()}${values.scheduledDate ? ` · ${values.scheduledDate.split('-').reverse().join('/')}` : values.days ? ` · ${values.days}` : ''}`,
    values.engineer ? `Ingeniero: ${formatPlanningPersonName(values.engineer) || values.engineer}${values.companions.length ? ` con ${values.companions.map((name) => formatPlanningPersonName(name) || name).join(', ')}` : ''}` : 'Sin ingeniero',
  ];
};

export const describeAbsenceInput = (input: AbsenceInput) =>
  `${ABSENCE_SHORT[input.kind]} de ${formatPlanningPersonName(input.personName) || input.personName} (${describeAbsenceDates(input)})${input.note ? ` · ${input.note}` : ''}`;

export const describeRequest = (request: ChangeRequest, record?: PlanningRecord | null) => {
  switch (request.kind) {
    case 'update':
      return record ? describeUpdate(record.values, updatePayload(request), record.week) : [request.summary];
    case 'insert':
      return describeInsert(request.payload as unknown as InsertPayload);
    case 'delete':
      return [`Eliminar: ${request.targetLabel}`];
    case 'absence_insert':
      return [`Nueva ausencia: ${describeAbsenceInput((request.payload as unknown as AbsencePayload).input)}`];
    case 'absence_update':
      return [`Cambiar ausencia a: ${describeAbsenceInput((request.payload as unknown as AbsencePayload).input)}`];
    case 'absence_delete':
      return [`Eliminar ausencia: ${request.targetLabel}`];
    default:
      return [request.summary];
  }
};
