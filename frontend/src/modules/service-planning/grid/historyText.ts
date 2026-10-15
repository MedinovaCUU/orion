import { formatPlanningPersonName, STATUS_LABELS } from '../helpers/normalizeService';
import type { CustomColumn, PlanningChange } from './planningBackend';
import { TYPE_LABELS } from './planningColumns';
import { formatShortIso } from './planningWeeks';

// "Ricardo modificó la fecha programada de 15/10/2026 a 16/10/2026", from one planning_changes row.

const FIELD_LABELS: Record<string, string> = {
  tipo: 'el tipo de servicio',
  plataforma: 'la plataforma',
  localidad: 'la localidad',
  observaciones: 'las observaciones',
  numero_serie: 'el número de serie',
  ingeniero: 'el ingeniero',
  acompanantes: 'los acompañantes',
  semana: 'la semana',
  fecha_programada: 'la fecha programada',
  fecha_fin: 'la fecha de finalización',
  dias: 'los días',
  estados: 'el estado',
  prioridad: 'la prioridad',
  estado_ticket: 'el estado del ticket',
};

const showValue = (field: string, value: string | null) => {
  if (value === null || value === '') return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatShortIso(value);
  if (field === 'tipo') return TYPE_LABELS[value as keyof typeof TYPE_LABELS] || value;
  if (field === 'estados') return value.split(', ').map((status) => STATUS_LABELS[status as keyof typeof STATUS_LABELS] || status).join(', ');
  if (field === 'ingeniero' || field === 'acompanantes') return value.split(/\s*[/,]\s*/).map((name) => formatPlanningPersonName(name) || name).join(', ');
  return value;
};

export const describeChange = (change: PlanningChange, customColumns: CustomColumn[] = []) => {
  const who = formatPlanningPersonName(change.changedByName) || change.changedByName || 'Alguien';
  if (change.action === 'insert') return `${who} creó la actividad`;
  if (change.action === 'delete') return `${who} eliminó la actividad`;
  const field = change.field || '';
  const label = field.startsWith('custom:')
    ? `«${customColumns.find((column) => column.key === field.slice(7))?.label || field.slice(7)}»`
    : FIELD_LABELS[field] || field;
  const before = showValue(field, change.oldValue);
  const after = showValue(field, change.newValue);
  if (!before) return `${who} agregó ${label}: ${after}`;
  if (!after) return `${who} quitó ${label} (${before})`;
  return `${who} modificó ${label} de ${before} a ${after}`;
};

