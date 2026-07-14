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
export const PERMISSIONS_OWNER_USER_IDS = ['2a87dde5-76ef-4365-8690-870efc7d9d82'] as const;
export const PERMISSIONS_OWNER_EMAILS = ['rmontanez@biosystems.com.mx'] as const;

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

export const canManageUserPermissions = (userId?: string | null, email?: string | null) => {
  const normalizedEmail = email?.trim().toLocaleLowerCase('en-US') || '';
  return Boolean(
    (userId && PERMISSIONS_OWNER_USER_IDS.includes(userId as (typeof PERMISSIONS_OWNER_USER_IDS)[number])) ||
    (normalizedEmail && PERMISSIONS_OWNER_EMAILS.includes(normalizedEmail as (typeof PERMISSIONS_OWNER_EMAILS)[number])),
  );
};
