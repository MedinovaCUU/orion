import { BA400_PART_BY_ID } from '../dri/model3d/ba400Mapping';

export interface MonitoringAlarm {
  id: number;
  codigo_error?: string | null;
  descripcion_error?: string | null;
  seccion_error?: string | null;
  tipo_mensaje?: string | null;
  detected_at?: string | null;
  created_at?: string | null;
}

export const isBa400Serial = (serial: string) => /^83400\d+$/.test(serial.replace(/\s/g, ''));

/**
 * Referencias de conjunto, no diagnósticos de refacción averiada.
 * Fuente de códigos: tools/ba400-log-monitor/error-catalog.json (catálogo BAX00).
 * Fuente geométrica: catálogo BA400 usado por DRI. Solo códigos explícitos;
 * no se infieren piezas buscando palabras en descripciones ni por rangos numéricos.
 * Los errores de placa, software o causas ambiguas quedan sin ubicación 3D.
 */
export const BA400_ALARM_LOCATIONS = [
  { codes: ['70'], partId: 'tapa_sup', label: 'Tapa principal' },
  { codes: ['100', '101', '102', '103', '200', '201', '202', '203'], partId: 'brazo_r1', label: 'Brazo / dispensación R1' },
  { codes: ['110', '111', '112', '113', '210', '211', '212', '213'], partId: 'brazo_r2', label: 'Brazo / dispensación R2' },
  { codes: ['120', '121', '122', '123', '220', '223'], partId: 'brazo_s', label: 'Brazo / dispensación de muestra' },
  { codes: ['130', '131', '132', '133'], partId: 'brazo_a1', label: 'Agitación A1' },
  { codes: ['140', '141', '142', '143'], partId: 'brazo_a2', label: 'Agitación A2' },
  { codes: ['300'], partId: 'rotor_rea', label: 'Rotor de reactivos' },
  { codes: ['301', '302', '303'], partId: 'frio_rea', label: 'Refrigeración de reactivos' },
  { codes: ['305'], partId: 'tapa_rea', label: 'Tapa de reactivos' },
  { codes: ['310', '311'], partId: 'lector_rea', label: 'Lector de reactivos' },
  { codes: ['350'], partId: 'rotor_mue', label: 'Rotor de muestras' },
  { codes: ['355'], partId: 'tapa_mue', label: 'Tapa de muestras' },
  { codes: ['360', '361'], partId: 'lector_mue', label: 'Lector de muestras' },
  { codes: ['500', '501', '553'], partId: 'rotor_rxn', label: 'Conjunto del rotor de reacciones' },
  { codes: ['502', '504', '520'], partId: 'cabezal_lav', label: 'Estación de lavado' },
  { codes: ['510', '511', '512'], partId: 'cuba_rxn', label: 'Conjunto térmico de reacciones' },
  { codes: ['541', '550', '551', '552'], partId: 'rotor_pm', label: 'Rotor de metacrilato' },
];

export function resolveBa400Alarm(alarm: MonitoringAlarm) {
  const raw = String(alarm.codigo_error ?? '').trim();
  const match = /^(?:E:?)?(\d+)$/i.exec(raw);
  const code = match ? String(Number(match[1])) : null;
  const location = code ? BA400_ALARM_LOCATIONS.find(item => item.codes.includes(code)) : undefined;
  // Si cambia el catálogo, no se debe colocar un marcador sobre una pieza inexistente.
  return location && BA400_PART_BY_ID.has(location.partId) ? location : null;
}

export function alarmTone(alarm: MonitoringAlarm): 'fatal' | 'warning' | 'unknown' {
  const tone = alarm.tipo_mensaje?.toLowerCase();
  return tone === 'fatal' || tone === 'warning' ? tone : 'unknown';
}

export function alarmKey(alarm: MonitoringAlarm) {
  // El ID de las filas de estado es sintético y puede cambiar entre refrescos.
  return `${alarm.codigo_error ?? 'sin-codigo'}|${alarm.seccion_error ?? ''}|${alarm.descripcion_error ?? ''}`;
}
