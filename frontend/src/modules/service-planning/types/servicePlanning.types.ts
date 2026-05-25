export type ServiceType =
  | 'preventivo'
  | 'correctivo'
  | 'capacitacion'
  | 'recapacitacion'
  | 'instalacion'
  | 'ingenieria_soporte';

export type ServiceStatus =
  | 'programado'
  | 'pendiente'
  | 'confirmado'
  | 'requiere_pago'
  | 'realizado'
  | 'bloqueado'
  | 'critico'
  | 'garantia'
  | 'comodato'
  | 'sin_asignar';

export type ServicePriority = 'baja' | 'media' | 'alta' | 'critica';

export type ServiceSource = 'manual' | 'excel_import' | 'ticket' | 'orion';

export type ServicePlanningRole = 'admin' | 'coordinador' | 'ingeniero' | 'visor';

export type ServicePlanningSection =
  | 'resumen'
  | 'calendario'
  | 'tabla'
  | 'ingenieros'
  | 'alertas'
  | 'reportes'
  | 'configuracion';

export interface PlannedServiceTrace {
  source: ServiceSource;
  importedFromExcel: boolean;
  importBatchId?: string;
  sourceFileName?: string;
  createdBy?: string;
  updatedBy?: string;
  assignedBy?: string;
  createdAt: string;
  updatedAt: string;
  lastStatusChangeAt?: string;
}

export interface PlannedServiceLinks {
  ticketId?: string;
  originalTicketId: string;
  linkedTravelRequestId?: string;
  linkedTravelStatus?: string;
  linkedServiceReportId?: string;
  linkedServiceReportStatus?: string;
}

export interface PlannedServiceFlags {
  requiresFlight: boolean;
  requiresCar: boolean;
  missingScheduledDay: boolean;
  missingEngineer: boolean;
  missingSerial: boolean;
  isCritical: boolean;
  isBlocked: boolean;
  isCompleted: boolean;
  requiresPayment: boolean;
}

export interface PlannedService {
  id: string;
  month: string;
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  scheduledDate?: string;
  scheduledDay?: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialNumber?: string;
  observations?: string;
  rawObservations?: string;
  status: ServiceStatus[];
  priority: ServicePriority;
  responsibleEngineers: string[];
  companions: string[];
  customer?: string;
  city?: string;
  state?: string;
  source: ServiceSource;
  trace: PlannedServiceTrace;
  links: PlannedServiceLinks;
  flags: PlannedServiceFlags;
  ticketStatus?: string;
  travelPriority?: string;
}

export interface ServicePlanningFilters {
  month: string;
  weekLabel: string;
  serviceType: 'all' | ServiceType;
  platform: string;
  engineer: string;
  companion: string;
  status: 'all' | ServiceStatus | 'missing_day';
  locality: string;
  priority: 'all' | ServicePriority;
  source: 'all' | ServiceSource;
  search: string;
  onlyMine: boolean;
}

export interface ServicePlanningKpis {
  totalServices: number;
  preventiveCount: number;
  correctiveCount: number;
  trainingCount: number;
  retrainingCount: number;
  installationCount: number;
  engineeringSupportCount: number;
  pendingPaymentCount: number;
  completedCount: number;
  criticalCount: number;
  warrantyCount: number;
  comodatoCount: number;
  unassignedCount: number;
  blockedCount: number;
  confirmedCount: number;
  servicesByEngineer: EngineerLoadSummary[];
  servicesByPlatform: Array<{ label: string; total: number }>;
  servicesByWeek: Array<{ label: string; total: number }>;
  servicesByStatus: Array<{ label: string; total: number }>;
  servicesBySource: Array<{ label: string; total: number }>;
  upcomingServices: PlannedService[];
}

export interface WeekBucket {
  key: string;
  label: string;
  month: string;
  weekStart: string;
  weekEnd: string;
  services: PlannedService[];
  scheduledServices: PlannedService[];
  unscheduledServices: PlannedService[];
  total: number;
  criticalCount: number;
  pendingPaymentCount: number;
  completedCount: number;
}

export interface EngineerLoadSummary {
  engineer: string;
  total: number;
  critical: number;
  corrective: number;
  preventive: number;
  pending: number;
  completed: number;
  loadRatio: number;
  overload: boolean;
  services: PlannedService[];
}

export interface AlertSummary {
  key:
    | 'critical'
    | 'payment'
    | 'blocked'
    | 'missing_day'
    | 'missing_engineer'
    | 'completed'
    | 'missing_serial';
  title: string;
  description: string;
  count: number;
  tone: 'critical' | 'warning' | 'success' | 'neutral';
  services: PlannedService[];
}

export interface ImportPreviewItem {
  id: string;
  locality: string;
  platform: string;
  serialNumber?: string;
  status: 'valid' | 'warning' | 'error';
  message: string;
}

export interface ImportPreviewState {
  sourceFileName: string;
  detectedRows: number;
  validRows: number;
  warningRows: number;
  errorRows: number;
  duplicates: number;
  items: ImportPreviewItem[];
}

export interface QuickCreateDraft {
  weekLabel: string;
  scheduledDate: string;
  scheduledDay: string;
  serviceType: ServiceType;
  platform: string;
  locality: string;
  serialNumber: string;
  observations: string;
  responsibleEngineers: string;
  companions: string;
  priority: ServicePriority;
  source: ServiceSource;
}

export interface ServicePlanningPermissions {
  canCreate: boolean;
  canEditAll: boolean;
  canDelete: boolean;
  canImport: boolean;
  canExport: boolean;
  canEditStatus: boolean;
}

export interface ServiceDetailUpdate {
  scheduledDate?: string;
  scheduledDay?: string;
  serviceType?: ServiceType;
  platform?: string;
  locality?: string;
  serialNumber?: string;
  observations?: string;
  responsibleEngineers?: string[];
  companions?: string[];
  priority?: ServicePriority;
  source?: ServiceSource;
}
