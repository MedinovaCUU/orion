export const MODULE_KEYS = [
  'tickets',
  'servicios',
  'asesoria',
  'trazabilidad',
  'refacciones',
  'inventario',
  'tutoriales',
  'pno',
  'equipos',
  'monitoreo',
  'dri',
  'permisos',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const DEFAULT_MODULES: ModuleKey[] = ['tickets', 'tutoriales'];

export const MODULE_LABELS: Record<ModuleKey, string> = {
  tickets: 'Tickets',
  servicios: 'Planeación',
  asesoria: 'Asesoría',
  trazabilidad: 'Trazabilidad',
  refacciones: 'Refacciones',
  inventario: 'Inventario',
  tutoriales: 'Tutoriales',
  pno: 'PNO',
  equipos: 'Equipos',
  monitoreo: 'Monitoreo',
  dri: 'DRI',
  permisos: 'Permisos',
};

export interface UserAccess {
  modules: ModuleKey[];
  canReceiveTickets: boolean;
  canViewRestrictedTutorials: boolean;
}

export const DEFAULT_USER_ACCESS: UserAccess = {
  modules: DEFAULT_MODULES,
  canReceiveTickets: false,
  canViewRestrictedTutorials: false,
};

export const coerceModules = (value: unknown): ModuleKey[] => {
  if (!Array.isArray(value)) return [...DEFAULT_MODULES];
  return value.filter((module): module is ModuleKey =>
    typeof module === 'string' && MODULE_KEYS.includes(module as ModuleKey),
  );
};
