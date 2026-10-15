import type { EquipmentSummary, ProfileSummary } from '../../../components/servicesPlanning';
import { formatPlanningPersonName, normalizeServiceType, normalizeText, SERVICE_TYPE_LABELS, STATUS_LABELS } from '../helpers/normalizeService';
import { createPeopleResolver } from '../helpers/planningPeople';
import type { ServicePriority, ServiceStatus, ServiceType } from '../types/servicePlanning.types';
import type { CustomColumn } from './planningBackend';
import { SERVICE_STATUSES, type FieldValue, type PlanningField, type PlanningRecord, type PlanningValues } from './planningRecord';
import { formatShortIso, parseLooseDate } from './planningWeeks';

// What each column shows, how it is edited and how typed or pasted text becomes a value.

export type ColumnKind = 'select' | 'combo' | 'text' | 'date' | 'person' | 'people' | 'multi' | 'readonly' | 'boolean' | 'number';

export interface ColumnOption {
  value: string;
  label: string;
  hint?: string;
}

export interface OptionsSource {
  people: string[];
  platforms: string[];
  localities: string[];
  equipments: EquipmentSummary[];
}

export type ParseResult = { value: FieldValue } | { error: string };

export interface GridColumn {
  id: string;
  field: PlanningField | null;
  label: string;
  kind: ColumnKind;
  width: number;
  required?: boolean;
  freeText?: boolean;
  hiddenByDefault?: boolean;
  options?: (source: OptionsSource, values: PlanningValues) => ColumnOption[];
  format: (values: PlanningValues, record?: PlanningRecord | null) => string;
  parse: (text: string, context: ParseContext) => ParseResult;
}

export interface ParseContext {
  profiles: ProfileSummary[];
  referenceDate?: string;
}

const TYPE_ORDER: ServiceType[] = ['preventivo', 'correctivo', 'instalacion', 'capacitacion', 'recapacitacion', 'ingenieria_soporte'];
export const TYPE_LABELS: Record<ServiceType, string> = { ...SERVICE_TYPE_LABELS, capacitacion: 'Capacitación', recapacitacion: 'Recapacitación', instalacion: 'Instalación', ingenieria_soporte: 'Ingeniería / soporte' };
const PRIORITY_LABELS: Record<ServicePriority, string> = { critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja' };
export const DAY_OPTIONS = ['LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB', 'LUN-MAR', 'MAR-MIE', 'MIE-JUE', 'JUE-VIE', 'LUN-MIE', 'MIE-VIE', 'LUN-VIE'];

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const fold = (text: string) => normalizeText(text);

const splitList = (text: string) =>
  text
    .split(/\s*(?:\/|,|;|\+|&|\n|\s+y\s+|\s+con\s+)\s*/i)
    .map(clean)
    .filter(Boolean);

const resolverCache = new WeakMap<ProfileSummary[], ReturnType<typeof createPeopleResolver>>();
const resolverFor = (profiles: ProfileSummary[]) => {
  let resolver = resolverCache.get(profiles);
  if (!resolver) {
    resolver = createPeopleResolver(profiles);
    resolverCache.set(profiles, resolver);
  }
  return resolver;
};

export const resolvePerson = (text: string, profiles: ProfileSummary[]) => {
  const [name] = resolverFor(profiles).engineers([clean(text)]);
  return name || clean(text);
};

const parseType = (text: string): ParseResult => {
  const folded = fold(text);
  if (!folded) return { error: 'Indica el tipo de servicio.' };
  const exact = TYPE_ORDER.find((type) => fold(TYPE_LABELS[type]) === folded || type === folded.replace(/\s+/g, '_'));
  if (exact) return { value: exact };
  if (/^(mp|mtto|mant|prev)/.test(folded)) return { value: 'preventivo' };
  if (/^(mc|corr|falla)/.test(folded)) return { value: 'correctivo' };
  if (/^(inst)/.test(folded)) return { value: 'instalacion' };
  if (/^(recap)/.test(folded)) return { value: 'recapacitacion' };
  if (/^(cap|curso|entren)/.test(folded)) return { value: 'capacitacion' };
  if (/(soporte|ingenier|visita)/.test(folded)) return { value: 'ingenieria_soporte' };
  return { value: normalizeServiceType(text) };
};

const parseStatuses = (text: string): ParseResult => {
  const tokens = splitList(text);
  if (!tokens.length) return { value: [] };
  const values: ServiceStatus[] = [];
  for (const token of tokens) {
    const folded = fold(token);
    const match = SERVICE_STATUSES.find((status) => status === folded.replace(/\s+/g, '_') || fold(STATUS_LABELS[status]) === folded || fold(STATUS_LABELS[status]).startsWith(folded));
    if (!match) return { error: `Estado no reconocido: ${token}` };
    if (!values.includes(match)) values.push(match);
  }
  return { value: values };
};

const parseDate = (text: string, context: ParseContext): ParseResult => {
  if (!clean(text)) return { value: '' };
  const iso = parseLooseDate(text, context.referenceDate);
  return iso ? { value: iso } : { error: `Fecha no válida: ${text}` };
};

const peopleOptions = (source: OptionsSource) => source.people.map((name) => ({ value: name, label: formatPlanningPersonName(name) || name }));

export const BASE_COLUMNS: GridColumn[] = [
  {
    id: 'serviceType',
    field: 'serviceType',
    label: 'Servicio',
    kind: 'select',
    width: 132,
    required: true,
    options: () => TYPE_ORDER.map((type) => ({ value: type, label: TYPE_LABELS[type] })),
    format: (values) => TYPE_LABELS[values.serviceType] || values.serviceType,
    parse: parseType,
  },
  {
    id: 'platform',
    field: 'platform',
    label: 'Plataforma',
    kind: 'combo',
    width: 112,
    freeText: true,
    options: (source) => source.platforms.map((platform) => ({ value: platform, label: platform })),
    format: (values) => values.platform,
    parse: (text) => ({ value: clean(text).toUpperCase() }),
  },
  {
    id: 'locality',
    field: 'locality',
    label: 'Localidad / cliente',
    kind: 'combo',
    width: 230,
    required: true,
    freeText: true,
    options: (source) => source.localities.map((locality) => ({ value: locality, label: locality })),
    format: (values) => values.locality,
    parse: (text) => (clean(text) ? { value: clean(text) } : { error: 'La localidad es obligatoria.' }),
  },
  {
    id: 'serialNumber',
    field: 'serialNumber',
    label: 'N/S',
    kind: 'combo',
    width: 124,
    freeText: true,
    options: (source, values) => {
      const platform = fold(values.platform);
      return source.equipments
        .filter((equipment) => !platform || fold(equipment.modelo || '').includes(platform) || platform.includes(fold(equipment.modelo || '')))
        .map((equipment) => ({
          value: equipment.numero_serie,
          label: equipment.numero_serie,
          hint: [equipment.modelo, equipment.clientes?.razon_social, equipment.ciudad].filter(Boolean).join(' · '),
        }));
    },
    format: (values) => values.serialNumber,
    parse: (text) => {
      const value = clean(text).toUpperCase();
      return { value: /^(NA|N\/A|PENDIENTE|-+)$/.test(value) ? '' : value };
    },
  },
  {
    id: 'observations',
    field: 'observations',
    label: 'Observaciones',
    kind: 'text',
    width: 260,
    format: (values) => values.observations,
    parse: (text) => ({ value: clean(text) }),
  },
  {
    id: 'engineer',
    field: 'engineer',
    label: 'Ingeniero',
    kind: 'person',
    width: 150,
    options: peopleOptions,
    format: (values) => formatPlanningPersonName(values.engineer) || values.engineer,
    parse: (text, context) => {
      const [first, ...rest] = splitList(text);
      if (!first) return { value: '' };
      if (rest.length) return { error: 'Un solo ingeniero responsable; el resto va en Acompañantes.' };
      return { value: resolvePerson(first, context.profiles) };
    },
  },
  {
    id: 'companions',
    field: 'companions',
    label: 'Acompañantes',
    kind: 'people',
    width: 170,
    options: peopleOptions,
    format: (values) => values.companions.map((name) => formatPlanningPersonName(name) || name).join(', '),
    parse: (text, context) => ({ value: splitList(text).filter((token) => !/^(NA|N\/A|-+)$/i.test(token)).map((token) => resolvePerson(token, context.profiles)) }),
  },
  {
    id: 'scheduledDate',
    field: 'scheduledDate',
    label: 'Fecha',
    kind: 'date',
    width: 108,
    format: (values) => formatShortIso(values.scheduledDate),
    parse: parseDate,
  },
  {
    id: 'scheduledEndDate',
    field: 'scheduledEndDate',
    label: 'Fecha fin',
    kind: 'date',
    width: 108,
    hiddenByDefault: true,
    format: (values) => formatShortIso(values.scheduledEndDate),
    parse: parseDate,
  },
  {
    id: 'days',
    field: 'days',
    label: 'Días',
    kind: 'combo',
    width: 92,
    freeText: true,
    options: () => DAY_OPTIONS.map((day) => ({ value: day, label: day })),
    format: (values) => values.days,
    parse: (text) => ({ value: clean(text).toUpperCase() }),
  },
  {
    id: 'statuses',
    field: 'statuses',
    label: 'Estado',
    kind: 'multi',
    width: 150,
    options: () => SERVICE_STATUSES.map((status) => ({ value: status, label: STATUS_LABELS[status] })),
    format: (values) => values.statuses.map((status) => STATUS_LABELS[status] || status).join(', '),
    parse: parseStatuses,
  },
  {
    id: 'priority',
    field: 'priority',
    label: 'Prioridad',
    kind: 'select',
    width: 96,
    hiddenByDefault: true,
    options: () => (['critica', 'alta', 'media', 'baja'] as ServicePriority[]).map((priority) => ({ value: priority, label: PRIORITY_LABELS[priority] })),
    format: (values) => PRIORITY_LABELS[values.priority] || values.priority,
    parse: (text) => {
      const folded = fold(text);
      const match = (Object.keys(PRIORITY_LABELS) as ServicePriority[]).find((priority) => priority === folded || fold(PRIORITY_LABELS[priority]) === folded);
      return match ? { value: match } : { error: `Prioridad no reconocida: ${text}` };
    },
  },
  {
    id: 'ticket',
    field: null,
    label: 'Ticket',
    kind: 'readonly',
    width: 104,
    hiddenByDefault: true,
    format: (_values, record) => (record ? record.ticketNumber || `TKT-${record.id.slice(0, 8).toUpperCase()}` : ''),
    parse: () => ({ error: 'Columna de solo lectura.' }),
  },
  {
    id: 'updated',
    field: null,
    label: 'Última modificación',
    kind: 'readonly',
    width: 168,
    hiddenByDefault: true,
    format: (_values, record) => {
      if (!record) return '';
      const date = new Date(record.updatedAt);
      const stamp = Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      return [stamp, formatPlanningPersonName(record.updatedBy) || record.updatedBy].filter(Boolean).join(' · ');
    },
    parse: () => ({ error: 'Columna de solo lectura.' }),
  },
];

const TRUE_WORDS = /^(si|sí|x|true|1|yes|ok)$/i;

export const customColumnToGrid = (column: CustomColumn): GridColumn => {
  const field = `custom:${column.key}` as PlanningField;
  const read = (values: PlanningValues) => values.custom[column.key] || '';
  const base = { id: field, field, label: column.label, width: column.width || 140, required: column.required };
  switch (column.dataType) {
    case 'number':
      return {
        ...base,
        kind: 'number',
        format: read,
        parse: (text) => {
          const value = clean(text).replace(/\s/g, '').replace(',', '.');
          if (!value) return { value: '' };
          return Number.isFinite(Number(value)) ? { value: String(Number(value)) } : { error: `${column.label}: número no válido` };
        },
      };
    case 'date':
      return { ...base, kind: 'date', format: (values) => formatShortIso(read(values)), parse: parseDate };
    case 'boolean':
      return {
        ...base,
        kind: 'boolean',
        options: () => [{ value: 'Sí', label: 'Sí' }, { value: '', label: 'No' }],
        format: read,
        parse: (text) => ({ value: TRUE_WORDS.test(clean(text)) ? 'Sí' : '' }),
      };
    case 'select':
      return {
        ...base,
        kind: 'select',
        options: () => column.options.map((option) => ({ value: option, label: option })),
        format: read,
        parse: (text) => {
          if (!clean(text)) return { value: '' };
          const match = column.options.find((option) => fold(option) === fold(text));
          return match ? { value: match } : { error: `${column.label}: «${text}» no es una opción` };
        },
      };
    default:
      return { ...base, kind: 'text', format: read, parse: (text) => ({ value: clean(text) }) };
  }
};

export const DEFAULT_PINNED = ['serviceType'];

export const buildOptionsSource = (records: PlanningRecord[], profiles: ProfileSummary[], equipments: EquipmentSummary[]): OptionsSource => {
  const collect = (values: string[]) => Array.from(new Set(values.map(clean).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'es'));
  const staff = profiles.filter((profile) => profile.nombre_completo && (profile.rol === 'admin' || profile.rol === 'tecnico' || profile.employee_type || profile.recibe_tickets));
  return {
    people: collect([...staff.map((profile) => profile.nombre_completo || ''), ...records.flatMap((record) => [record.values.engineer, ...record.values.companions])]),
    platforms: collect([...equipments.map((equipment) => (equipment.modelo || '').toUpperCase()), ...records.map((record) => record.values.platform.toUpperCase())]),
    localities: collect([...records.map((record) => record.values.locality), ...equipments.map((equipment) => equipment.clientes?.razon_social || '')]),
    equipments,
  };
};
