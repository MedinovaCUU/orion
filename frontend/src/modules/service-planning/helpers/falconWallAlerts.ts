import type { EquipmentSummary, PendingServiceTicket } from '../../../components/servicesPlanning';
import { getFalconTicketSla, type FalconTicketSla } from '../../../components/ticketIntake';
import {
  FALCON_THRESHOLD_LABELS,
  FALCON_THRESHOLD_PRIORITY,
  getFalconThresholdKey,
  type FalconAlertThresholdKey,
} from '../../../components/falconSlaThresholds';

export interface FalconTrackedTicket {
  ticket: PendingServiceTicket;
  equipment?: EquipmentSummary | null;
  locationLabel: string;
}

export interface FalconWallAlertRow {
  id: string;
  subject: string;
  locationLabel: string;
  engineerName: string | null;
  thresholdKey: FalconAlertThresholdKey;
  thresholdLabel: string;
  sla: FalconTicketSla;
  /** "HH:MM:SS" left, or how long ago the SLA expired. */
  timerLabel: string;
}

const pad = (value: number) => String(value).padStart(2, '0');
const formatElapsed = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const time = `${pad(Math.floor((total % 86400) / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
  return days > 0 ? `${days}d ${time}` : time;
};

// Silent counterpart of the personal Falcon alarms: every tracked ticket that is inside an
// alert threshold, most urgent first. Not filtered by assignee, because the wall is shared.
export function buildFalconWallAlerts(
  entries: FalconTrackedTicket[],
  assigneeNames: Record<string, string>,
  nowMs: number,
): FalconWallAlertRow[] {
  return entries
    .flatMap((entry) => {
      if ((entry.ticket.estado || '').trim().toLowerCase() === 'cerrado') return [];
      const sla = getFalconTicketSla(entry.ticket, entry.equipment ?? undefined, nowMs);
      if (!sla) return [];
      const thresholdKey = getFalconThresholdKey(sla.remainingMs);
      if (!thresholdKey) return [];
      return [{
        id: entry.ticket.id,
        subject: entry.ticket.asunto,
        locationLabel: entry.locationLabel,
        engineerName: assigneeNames[entry.ticket.id] || null,
        thresholdKey,
        thresholdLabel: FALCON_THRESHOLD_LABELS[thresholdKey],
        sla,
        timerLabel: sla.remainingMs > 0 ? sla.countdownLabel : `hace ${formatElapsed(-sla.remainingMs)}`,
      }];
    })
    .sort((a, b) => FALCON_THRESHOLD_PRIORITY[a.thresholdKey] - FALCON_THRESHOLD_PRIORITY[b.thresholdKey] || a.sla.remainingMs - b.sla.remainingMs);
}
