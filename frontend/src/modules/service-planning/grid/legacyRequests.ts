import type { EquipmentSummary, PendingServiceTicket, ProfileSummary } from '../../../components/servicesPlanning';
import { normalizeServiceType, splitPeople } from '../helpers/normalizeService';
import { parseSheetWeekLabel } from '../helpers/planningSheet';
import type { QuickCreateDraft, ServiceDetailUpdate } from '../types/servicePlanning.types';
import { describeInsert, describeUpdate, recordLabel, type NewChangeRequest, type UpdatePayload } from './planningApprovals';
import { emptyValues, getFieldValue, sameValue, toPlanningRecord, type FieldValue, type PlanningField, type PlanningTicketRow, type PlanningValues } from './planningRecord';
import { todayIso, weekOfDate } from './planningWeeks';

const asRow = (ticket: PendingServiceTicket): PlanningTicketRow => ({
  id: ticket.id,
  user_id: ticket.user_id,
  asunto: ticket.asunto,
  descripcion: ticket.descripcion,
  estado: ticket.estado,
  creado_en: ticket.creado_en,
  numero_serie_equipo: ticket.numero_serie_equipo ?? null,
  numero_caso: null,
  planning_version: null,
});

// The older Planeación screens (activity drawer, "Nueva actividad", live board editing) send the same
// change requests as the master table when the user is not an approver.

export const requestFromServiceUpdate = (
  ticket: PendingServiceTicket,
  updates: ServiceDetailUpdate,
  profiles: ProfileSummary[],
  equipments: EquipmentSummary[],
  actorName: string,
): NewChangeRequest | null => {
  const record = toPlanningRecord(asRow(ticket), profiles, equipments);
  const proposed: Partial<Record<PlanningField, FieldValue>> = {};
  const offer = (field: PlanningField, value: FieldValue | undefined) => {
    if (value === undefined) return;
    if (!sameValue(getFieldValue(record, field), value)) proposed[field] = value;
  };
  offer('scheduledDate', updates.scheduledDate);
  offer('days', updates.scheduledDay);
  offer('serviceType', updates.serviceType);
  offer('platform', updates.platform);
  offer('locality', updates.locality);
  offer('serialNumber', updates.serialNumber);
  offer('observations', updates.observations);
  offer('priority', updates.priority);
  if (updates.responsibleEngineers) {
    const [lead = '', ...crew] = updates.responsibleEngineers;
    offer('engineer', lead);
    offer('companions', Array.from(new Set([...crew, ...(updates.companions || record.values.companions)])));
  } else {
    offer('companions', updates.companions);
  }
  if (!Object.keys(proposed).length) return null;
  const payload: UpdatePayload = { fields: proposed };
  return {
    kind: 'update',
    ticketId: ticket.id,
    payload: payload as unknown as Record<string, unknown>,
    baseVersion: null,
    summary: describeUpdate(record.values, payload, record.week).join(' · '),
    targetLabel: recordLabel(record.values, record.week),
    requestedByName: actorName,
  };
};

export const requestFromQuickCreate = (draft: QuickCreateDraft, profiles: ProfileSummary[], actorName: string): NewChangeRequest => {
  const engineers = splitPeople(draft.responsibleEngineers, profiles);
  const values: PlanningValues = {
    ...emptyValues(),
    serviceType: normalizeServiceType(draft.serviceType),
    platform: draft.platform.trim().toUpperCase(),
    locality: draft.locality.trim(),
    serialNumber: draft.serialNumber.trim().toUpperCase(),
    observations: draft.observations.trim(),
    engineer: engineers[0] || '',
    companions: Array.from(new Set([...engineers.slice(1), ...splitPeople(draft.companions, profiles)])),
    scheduledDate: draft.scheduledDate || '',
    days: draft.scheduledDay || '',
    priority: draft.priority,
  };
  const today = todayIso();
  const fromLabel = draft.weekLabel ? parseSheetWeekLabel(draft.weekLabel.toUpperCase(), Number(today.slice(0, 4)), null) : null;
  const week = values.scheduledDate
    ? weekOfDate(values.scheduledDate)
    : fromLabel
      ? { start: fromLabel.weekStart, end: fromLabel.weekEnd, label: fromLabel.weekLabel, monthKey: fromLabel.monthKey }
      : weekOfDate(today);
  return {
    kind: 'insert',
    payload: { week, values } as unknown as Record<string, unknown>,
    summary: describeInsert({ week, values }).join(' · '),
    targetLabel: recordLabel(values, week),
    requestedByName: actorName,
  };
};

export const requestFromDelete = (ticket: PendingServiceTicket, profiles: ProfileSummary[], actorName: string): NewChangeRequest => {
  const record = toPlanningRecord(asRow(ticket), profiles);
  const label = recordLabel(record.values, record.week);
  return { kind: 'delete', ticketId: ticket.id, payload: {}, baseVersion: null, summary: `Eliminar ${label}`, targetLabel: label, requestedByName: actorName };
};
