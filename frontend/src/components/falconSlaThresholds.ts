// Falcon SLA alert thresholds shared by the audible personal alerts (FalconSlaAlerts)
// and the silent wall strip on the live planning board.
export type FalconAlertThresholdKey = '8h' | '4h' | '1h' | '30m' | '10m' | 'breached';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const FALCON_THRESHOLD_LABELS: Record<FalconAlertThresholdKey, string> = {
  '8h': 'Quedan 8 horas',
  '4h': 'Quedan 4 horas',
  '1h': 'Queda 1 hora',
  '30m': 'Quedan 30 minutos',
  '10m': 'Quedan 10 minutos',
  breached: 'SLA vencido',
};

export const FALCON_THRESHOLD_ACTIONS: Record<FalconAlertThresholdKey, string> = {
  '8h': 'Prepara seguimiento y confirma la ruta de atención.',
  '4h': 'Escala el seguimiento y valida que el cierre no se desvíe.',
  '1h': 'Prioriza este ticket y confirma disponibilidad inmediata.',
  '30m': 'Última ventana operativa antes del incumplimiento.',
  '10m': 'Cierre inminente. Atiende y escala en este momento.',
  breached: 'Incumplimiento activo. Escala de inmediato.',
};

// Lower number = more urgent.
export const FALCON_THRESHOLD_PRIORITY: Record<FalconAlertThresholdKey, number> = {
  breached: 0,
  '10m': 1,
  '30m': 2,
  '1h': 3,
  '4h': 4,
  '8h': 5,
};

export const getFalconThresholdKey = (remainingMs: number): FalconAlertThresholdKey | null => {
  if (remainingMs <= 0) return 'breached';
  if (remainingMs <= 10 * MINUTE_MS) return '10m';
  if (remainingMs <= 30 * MINUTE_MS) return '30m';
  if (remainingMs <= HOUR_MS) return '1h';
  if (remainingMs <= 4 * HOUR_MS) return '4h';
  if (remainingMs <= 8 * HOUR_MS) return '8h';
  return null;
};

export const isFullscreenFalconThreshold = (thresholdKey: FalconAlertThresholdKey) =>
  thresholdKey === '30m' || thresholdKey === '10m' || thresholdKey === 'breached';
