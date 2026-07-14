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

export const MODULE_SUBPERMISSIONS = {
  tickets: ['crear', 'seguimiento', 'diagnostico'],
  servicios: ['planeacion', 'viajes', 'reportes'],
  asesoria: ['crear', 'bandeja', 'metricas'],
  trazabilidad: ['tracking', 'eventos_refacciones', 'analitica'],
  refacciones: ['solicitud', 'catalogo', 'historial'],
  inventario: ['captura', 'historial'],
  pno: ['consulta', 'edicion'],
  monitoreo: ['mapa', 'alertas'],
  dri: ['captura', 'grafo', 'diagnostico'],
} as const;

export type ModuleWithSubpermissions = keyof typeof MODULE_SUBPERMISSIONS;
export type SubPermissionKey = (typeof MODULE_SUBPERMISSIONS)[ModuleWithSubpermissions][number];

export const SUBPERMISSION_LABELS: Record<ModuleWithSubpermissions, Record<string, string>> = {
  tickets: {
    crear: 'Crear tickets',
    seguimiento: 'Consultar tickets',
    diagnostico: 'Diagnosticar y cerrar',
  },
  servicios: {
    planeacion: 'Planeación de servicios',
    viajes: 'Solicitudes de viaje',
    reportes: 'Reportes de servicio',
  },
  asesoria: {
    crear: 'Escalar asesorías',
    bandeja: 'Bandeja y seguimiento',
    metricas: 'Métricas y exportaciones',
  },
  trazabilidad: {
    tracking: 'Tracking de paquetería',
    eventos_refacciones: 'Eventos de refacciones',
    analitica: 'Analítica y tableros',
  },
  refacciones: {
    solicitud: 'Solicitud y destino',
    catalogo: 'Catálogo y partidas',
    historial: 'Seguimiento histórico',
  },
  inventario: {
    captura: 'Captura de conteos',
    historial: 'Historial de conteos',
  },
  pno: {
    consulta: 'Consultar biblioteca',
    edicion: 'Crear y editar PNO',
  },
  monitoreo: {
    mapa: 'Mapa y detalle de equipos',
    alertas: 'Alertas y pendientes',
  },
  dri: {
    captura: 'Captura y evidencia',
    grafo: 'Grafo de relaciones',
    diagnostico: 'Hipótesis y diagnóstico',
  },
};

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
  subPermissions: Partial<Record<ModuleWithSubpermissions, string[]>>;
}

export const DEFAULT_USER_ACCESS: UserAccess = {
  modules: DEFAULT_MODULES,
  canReceiveTickets: false,
  canViewRestrictedTutorials: false,
  subPermissions: {},
};

export const coerceModules = (value: unknown): ModuleKey[] => {
  if (!Array.isArray(value)) return [...DEFAULT_MODULES];
  return value.filter((module): module is ModuleKey =>
    typeof module === 'string' && MODULE_KEYS.includes(module as ModuleKey),
  );
};

export const coerceSubPermissions = (value: unknown): UserAccess['subPermissions'] => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.entries(value as Record<string, unknown>).reduce<UserAccess['subPermissions']>((acc, [module, rawKeys]) => {
    if (!(module in MODULE_SUBPERMISSIONS) || !Array.isArray(rawKeys)) return acc;
    const moduleKey = module as ModuleWithSubpermissions;
    const allowed = MODULE_SUBPERMISSIONS[moduleKey] as readonly string[];
    acc[moduleKey] = rawKeys.filter((key): key is string => typeof key === 'string' && allowed.includes(key));
    return acc;
  }, {});
};

export const getModuleSubPermissions = (access: UserAccess, module: ModuleWithSubpermissions) => {
  const configured = access.subPermissions[module];
  return configured ?? [...MODULE_SUBPERMISSIONS[module]];
};

export const canAccessSubPermission = (access: UserAccess, module: ModuleWithSubpermissions, key: string) =>
  access.modules.includes(module) && getModuleSubPermissions(access, module).includes(key);

export const canManageUserPermissions = (userId?: string | null, email?: string | null) => {
  const normalizedEmail = email?.trim().toLocaleLowerCase('en-US') || '';
  return Boolean(
    (userId && PERMISSIONS_OWNER_USER_IDS.includes(userId as (typeof PERMISSIONS_OWNER_USER_IDS)[number])) ||
    (normalizedEmail && PERMISSIONS_OWNER_EMAILS.includes(normalizedEmail as (typeof PERMISSIONS_OWNER_EMAILS)[number])),
  );
};
