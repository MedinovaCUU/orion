import {
  extractPlaneacionMeta,
  stripPlaneacionMeta,
  type EquipmentSummary,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';
import { isMeaningfulServiceReportMaterialItem, type ServiceReportMaterialItem } from './gs1DataMatrix';
import {
  deriveEngineerIdentifier,
  getAssignedPlannedTicketCandidates,
  type TravelFormData,
  type TravelPriority,
  type TravelServiceType,
  type TravelTripType,
} from './travelPlanner';

export type ServiceReportMode = 'servicio' | 'remoto';
export type ServiceReportStatus = 'borrador' | 'registrado' | 'requiere_visita';
export type SpecialClientCode = '' | 'falcon' | 'centrum' | 'genesis';

export interface ClientServiceUnitSummary {
  id?: string;
  client_id?: number | null;
  equipment_id?: string | null;
  numero_serie: string;
  cliente?: string | null;
  persona_contacto?: string | null;
  unidad_negocio?: string | null;
  analizador?: string | null;
}

export interface ServiceReportFormData {
  reportType: ServiceReportMode;
  engineerId: string;
  engineerName: string;
  employeeNumber: string;
  serviceTicketId: string;
  relatedTravelRequestId: string;
  clientId?: number | null;
  clientName: string;
  serviceType: TravelServiceType;
  priority: TravelPriority;
  tripType: TravelTripType;
  reportReference: string;
  serviceReference: string;
  subject: string;
  callDate: string;
  serviceDate: string;
  startedAt: string;
  endedAt: string;
  equipmentId: string;
  equipmentSerial: string;
  equipmentName: string;
  siteAddress: string;
  siteContact: string;
  sitePhone: string;
  diagnosticCode: string;
  diagnosticLabel: string;
  solutionCode: string;
  solutionLabel: string;
  comments: string;
  solution: string;
  clientComments: string;
  softwareVersion: string;
  firmwareVersion: string;
  serviceSoftwareVersion: string;
  baselineSoftwareVersion: string;
  baselineFirmwareVersion: string;
  versionDiscrepancyExplanation: string;
  isSoftwareCase: boolean;
  requiresTravelPlanning: boolean;
  requiresFlight: boolean;
  requiresCar: boolean;
  specialClientCode: SpecialClientCode;
  specialReferenceValue: string;
  businessUnitName: string;
  specialUserName: string;
  attachmentBucket: string;
  attachmentPath: string;
  attachmentFilename: string;
  signatureDataUrl: string;
  clientSignatureDataUrl: string;
  materialsUsed: ServiceReportMaterialItem[];
  sourcePlanningTicketId: string;
}

export type ServiceReportVersionField = 'software' | 'firmware' | 'service_software';
export type ServiceReportVersionIssueCode = 'missing' | 'unreliable' | 'changed';

export interface ServiceReportVersionGuardItem {
  field: ServiceReportVersionField;
  issueCode: ServiceReportVersionIssueCode;
  baselineValue: string;
  reportedValue: string;
  message: string;
}

export interface ServiceReportVersionGuard {
  hasAlert: boolean;
  requiresExplanation: boolean;
  items: ServiceReportVersionGuardItem[];
}

const MONTH_INDEX: Record<string, number> = {
  ENERO: 0,
  ENE: 0,
  FEBRERO: 1,
  FEB: 1,
  MARZO: 2,
  MAR: 2,
  ABRIL: 3,
  ABR: 3,
  MAYO: 4,
  MAY: 4,
  JUNIO: 5,
  JUN: 5,
  JULIO: 6,
  JUL: 6,
  AGOSTO: 7,
  AGO: 7,
  SEPTIEMBRE: 8,
  SEP: 8,
  SETIEMBRE: 8,
  OCTUBRE: 9,
  OCT: 9,
  NOVIEMBRE: 10,
  NOV: 10,
  DICIEMBRE: 11,
  DIC: 11,
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeVersionToken = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .trim()
    .toUpperCase();

const normalizeVersionForCompare = (value: string) =>
  value
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase();

const UNRELIABLE_VERSION_TOKENS = new Set([
  '',
  'NA',
  'N/A',
  'ND',
  'NODATA',
  'SINVERSION',
  'SINVERSIONCAPTURADA',
  'DESCONOCIDO',
  'PENDIENTE',
  'NOAPLICA',
  'SINDATO',
  'NOTAVAILABLE',
]);

const UNRELIABLE_ADDRESS_TOKENS = [
  'na',
  'n/a',
  'nd',
  'sin direccion',
  'sin dirección',
  'pendiente',
  'desconocido',
  'por definir',
  'por confirmar',
  'no aplica',
  'domicilio pendiente',
];

const SERVICE_REPORT_ADDRESS_ALERT_MESSAGE =
  'Estos datos permiten el correcto funcionamiento de toda la empresa, por favor, escribe la dirección correctamente, tu trabajo influye mucho en el desarrollo de la organización. Ejemplo: Av. Insurgentes Sur 1234, Col. Del Valle, CP 03100, Benito Juárez, Ciudad de México, CDMX.';

const pad = (value: number) => value.toString().padStart(2, '0');

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const currentTime = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const hashHex = (input: string, salt: string) => {
  let hash = 2166136261;
  const seed = `${salt}:${input}`;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
};

const toIsoDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parsePlanningDateText = (value: string | null | undefined, referenceDate = new Date()) => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const numericMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numericMatch) {
    const [, dayText, monthText, yearText] = numericMatch;
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
    const date = new Date(year, Number(monthText) - 1, Number(dayText), 12, 0, 0);
    return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
  }

  const normalizedUpper = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const textualMatch = normalizedUpper.match(
    /(\d{1,2})(?:\s+AL\s+\d{1,2})?.*?(ENERO|ENE|FEBRERO|FEB|MARZO|MAR|ABRIL|ABR|MAYO|MAY|JUNIO|JUN|JULIO|JUL|AGOSTO|AGO|SEPTIEMBRE|SEP|SETIEMBRE|OCTUBRE|OCT|NOVIEMBRE|NOV|DICIEMBRE|DIC)(?:.*?(\d{2,4}))?/,
  );
  if (!textualMatch) {
    return null;
  }

  const [, dayText, monthToken, yearText] = textualMatch;
  const monthIndex = MONTH_INDEX[monthToken];
  if (monthIndex === undefined) {
    return null;
  }

  const year = yearText ? (yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)) : referenceDate.getFullYear();
  const date = new Date(year, monthIndex, Number(dayText), 12, 0, 0);
  return Number.isNaN(date.getTime()) ? null : toIsoDate(date);
};

const parsePlannedServiceType = (ticketSubject: string): TravelServiceType => {
  const normalized = normalizeText(ticketSubject.replace('[PLAN]', ''));
  if (normalized.includes('prevent')) return 'preventivo';
  if (normalized.includes('correct')) return 'correctivo';
  if (normalized.includes('instal')) return 'instalacion';
  if (normalized.includes('capacit')) return 'capacitacion';
  if (normalized.includes('emerg') || normalized.includes('falla')) return 'emergencia';
  return 'otro';
};

const buildSiteAddress = (equipment?: EquipmentSummary) =>
  [
    equipment?.direccion,
    equipment?.colonia ? `Col. ${equipment.colonia}` : '',
    equipment?.codigo_postal ? `CP ${equipment.codigo_postal}` : '',
    equipment?.municipio,
    equipment?.ciudad,
    equipment?.estado,
    equipment?.pais,
  ]
    .filter(Boolean)
    .join(', ');

export const resolveSpecialClientCodeFromName = (clientName: string): SpecialClientCode => {
  const normalized = normalizeText(clientName);

  if (!normalized) {
    return '';
  }

  if (normalized.includes('falcon')) {
    return 'falcon';
  }

  if (normalized.includes('centrum promotora internacional') || normalized.includes('centrum')) {
    return 'centrum';
  }

  if (
    normalized.includes('genesis healthcare advicers') ||
    normalized.includes('generis healthcare advicers') ||
    normalized.includes('genesis') ||
    normalized.includes('generis')
  ) {
    return 'genesis';
  }

  return '';
};

export const getSpecialClientReferenceLabel = (code: SpecialClientCode) => {
  if (code === 'falcon') return 'No. de reporte Falcon';
  if (code === 'centrum') return 'Ticket Zendesk';
  if (code === 'genesis') return 'Numero de reporte';
  return 'Referencia externa';
};

export const createEmptyServiceReportForm = (mode: ServiceReportMode): ServiceReportFormData => ({
  reportType: mode,
  engineerId: '',
  engineerName: '',
  employeeNumber: '',
  serviceTicketId: '',
  relatedTravelRequestId: '',
  clientId: null,
  clientName: '',
  serviceType: 'correctivo',
  priority: 'media',
  tripType: 'redondo',
  reportReference: '',
  serviceReference: '',
  subject: '',
  callDate: todayIso(),
  serviceDate: todayIso(),
  startedAt: currentTime(),
  endedAt: currentTime(),
  equipmentId: '',
  equipmentSerial: '',
  equipmentName: '',
  siteAddress: '',
  siteContact: '',
  sitePhone: '',
  diagnosticCode: '',
  diagnosticLabel: '',
  solutionCode: '',
  solutionLabel: '',
  comments: '',
  solution: '',
  clientComments: '',
  softwareVersion: '',
  firmwareVersion: '',
  serviceSoftwareVersion: '',
  baselineSoftwareVersion: '',
  baselineFirmwareVersion: '',
  versionDiscrepancyExplanation: '',
  isSoftwareCase: false,
  requiresTravelPlanning: false,
  requiresFlight: false,
  requiresCar: false,
  specialClientCode: '',
  specialReferenceValue: '',
  businessUnitName: '',
  specialUserName: '',
  attachmentBucket: '',
  attachmentPath: '',
  attachmentFilename: '',
  signatureDataUrl: '',
  clientSignatureDataUrl: '',
  materialsUsed: [],
  sourcePlanningTicketId: '',
});

export const findEquipmentBySerial = (equipments: EquipmentSummary[], serial: string) => {
  const normalizedSerial = serial.trim().toUpperCase();
  if (!normalizedSerial) {
    return undefined;
  }

  return equipments.find((equipment) => equipment.numero_serie.trim().toUpperCase() === normalizedSerial);
};

export const findClientServiceUnit = (
  units: ClientServiceUnitSummary[],
  serial: string,
  clientId?: number | null,
) => {
  const normalizedSerial = serial.trim().toUpperCase();
  if (!normalizedSerial) {
    return undefined;
  }

  const directMatch =
    units.find(
      (unit) =>
        unit.numero_serie.trim().toUpperCase() === normalizedSerial &&
        clientId !== undefined &&
        clientId !== null &&
        unit.client_id === clientId,
    ) ||
    units.find((unit) => unit.numero_serie.trim().toUpperCase() === normalizedSerial);

  return directMatch;
};

export const hydrateServiceReportForm = (
  form: ServiceReportFormData,
  engineer: ProfileSummary | undefined,
  equipment: EquipmentSummary | undefined,
  unit?: ClientServiceUnitSummary,
): ServiceReportFormData => {
  const nextClientName = equipment?.clientes?.razon_social || unit?.cliente || form.clientName;
  const nextSiteContact = unit?.persona_contacto || equipment?.clientes?.persona_contacto || form.siteContact;
  const nextSitePhone = equipment?.clientes?.telefono || form.sitePhone;
  const nextEquipmentName = equipment?.modelo || unit?.analizador || form.equipmentName;
  const nextBusinessUnit = unit?.unidad_negocio || form.businessUnitName;
  const nextSpecialClientCode = resolveSpecialClientCodeFromName(nextClientName);

  return {
    ...form,
    engineerId: engineer?.id || form.engineerId,
    engineerName: engineer?.nombre_completo || form.engineerName,
    employeeNumber: deriveEngineerIdentifier(engineer, form.employeeNumber),
    clientId: equipment?.clientes?.id ?? unit?.client_id ?? form.clientId ?? null,
    clientName: nextClientName,
    equipmentId: equipment?.id || unit?.equipment_id || form.equipmentId,
    equipmentSerial: equipment?.numero_serie || unit?.numero_serie || form.equipmentSerial,
    equipmentName: nextEquipmentName,
    siteAddress: buildSiteAddress(equipment) || form.siteAddress,
    siteContact: nextSiteContact,
    sitePhone: nextSitePhone,
    softwareVersion: equipment ? equipment.software || '' : form.softwareVersion,
    firmwareVersion: equipment ? equipment.firmware || '' : form.firmwareVersion,
    serviceSoftwareVersion: form.serviceSoftwareVersion,
    baselineSoftwareVersion: equipment ? equipment.software || '' : form.baselineSoftwareVersion,
    baselineFirmwareVersion: equipment ? equipment.firmware || '' : form.baselineFirmwareVersion,
    businessUnitName: nextBusinessUnit,
    specialUserName: nextSiteContact || form.specialUserName,
    specialClientCode: nextSpecialClientCode || form.specialClientCode,
  };
};

export const resolveServiceReportId = (form: ServiceReportFormData) => {
  const anchorDate = form.serviceDate || form.callDate || todayIso();
  const serialChunk =
    (form.equipmentSerial || form.equipmentName || 'GEN').replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'GEN';
  const baseSeed = form.serviceTicketId.trim()
    ? `service-report:${form.reportType}:${form.serviceTicketId.trim().toLowerCase()}`
    : `service-report:${form.reportType}:${serialChunk}:${anchorDate}:${normalizeText(form.subject || 'reporte')}`;
  const hex = `${hashHex(baseSeed, 'a')}${hashHex(baseSeed, 'b')}${hashHex(baseSeed, 'c')}${hashHex(baseSeed, 'd')}`;

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `a${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
};

export const resolveServiceReportReference = (form: ServiceReportFormData) => {
  if (form.reportReference.trim()) {
    return form.reportReference.trim();
  }

  const prefix = form.reportType === 'servicio' ? 'RPT-SRV' : 'RPT-REM';
  const dateChunk = (form.serviceDate || form.callDate || todayIso()).replaceAll('-', '');
  const serialChunk =
    (form.equipmentSerial || form.equipmentName || 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase() || 'GEN';
  return `${prefix}-${serialChunk}-${dateChunk}`;
};

export const buildServiceReportFromPlannedTicket = (
  plannedTicket: PendingServiceTicket,
  engineer: ProfileSummary | undefined,
  equipments: EquipmentSummary[],
  units: ClientServiceUnitSummary[],
  mode: ServiceReportMode,
): ServiceReportFormData => {
  const meta = extractPlaneacionMeta(plannedTicket.descripcion) || {};
  const plannedDate =
    parsePlanningDateText(meta.fecha_acordada, new Date()) || parsePlanningDateText(meta.fecha_tentativa, new Date()) || todayIso();
  const equipment = plannedTicket.numero_serie_equipo
    ? findEquipmentBySerial(equipments, plannedTicket.numero_serie_equipo)
    : undefined;
  const unit = findClientServiceUnit(units, plannedTicket.numero_serie_equipo || '', equipment?.clientes?.id);
  const baseForm = hydrateServiceReportForm(createEmptyServiceReportForm(mode), engineer, equipment, unit);
  const cleanDescription = stripPlaneacionMeta(plannedTicket.descripcion).trim();
  const serviceType = parsePlannedServiceType(plannedTicket.asunto);

  return {
    ...baseForm,
    serviceTicketId: plannedTicket.id,
    sourcePlanningTicketId: plannedTicket.id,
    serviceType,
    subject:
      cleanDescription ||
      plannedTicket.asunto.replace('[PLAN]', '').trim() ||
      (mode === 'servicio' ? 'Reporte de servicio presencial' : 'Reporte remoto de soporte'),
    serviceDate: plannedDate,
    callDate: plannedDate,
    serviceReference: `TKT-${plannedTicket.id.substring(0, 8).toUpperCase()}`,
    comments: mode === 'servicio' ? cleanDescription : baseForm.comments,
    requiresTravelPlanning: Boolean(meta.requiere_vuelos || meta.requiere_auto),
    requiresFlight: Boolean(meta.requiere_vuelos),
    requiresCar: Boolean(meta.requiere_auto),
  };
};

export const getLinkedServiceReportCandidates = (
  plannedTickets: PendingServiceTicket[],
  engineer: ProfileSummary | undefined,
) =>
  getAssignedPlannedTicketCandidates(plannedTickets, engineer).filter(
    (candidate) => typeof candidate.meta.service_report_id === 'string' && candidate.meta.service_report_id.trim().length > 0,
  );

export const getInitialServiceReportValues = (
  mode: ServiceReportMode,
  engineers: ProfileSummary[],
  equipments: EquipmentSummary[],
  plannedTickets: PendingServiceTicket[],
  units: ClientServiceUnitSummary[],
  preferredEngineerId?: string,
) => {
  const defaultEngineer = engineers.find((engineer) => engineer.id === preferredEngineerId) || engineers[0];
  const closestPlanned = getAssignedPlannedTicketCandidates(plannedTickets, defaultEngineer).find(
    (candidate) => !candidate.meta.service_report_id,
  );
  const baseForm = hydrateServiceReportForm(createEmptyServiceReportForm(mode), defaultEngineer, undefined);

  if (!closestPlanned) {
    return baseForm;
  }

  return buildServiceReportFromPlannedTicket(closestPlanned.ticket, defaultEngineer, equipments, units, mode);
};

export const buildServiceReportPayload = (
  form: ServiceReportFormData,
  status: ServiceReportStatus,
  createdBy: string | null,
) => {
  const versionGuard = getServiceReportVersionGuard(form);
  const meaningfulMaterials = form.materialsUsed.filter(isMeaningfulServiceReportMaterialItem);

  return {
    report_type: form.reportType,
    status,
    engineer_id: form.engineerId || createdBy,
    client_id: form.clientId ?? null,
    service_ticket_id: form.serviceTicketId || null,
    related_travel_request_id: form.relatedTravelRequestId || null,
    equipment_id: form.equipmentId || null,
    employee_number: form.employeeNumber,
    engineer_name: form.engineerName,
    service_type: form.serviceType,
    priority: form.priority,
    report_reference: resolveServiceReportReference(form),
    service_reference: form.serviceReference || null,
    subject: form.subject,
    call_date: form.callDate || null,
    service_date: form.serviceDate || null,
    started_at: form.startedAt || null,
    ended_at: form.endedAt || null,
    client_name: form.clientName,
    business_unit_name: form.businessUnitName || null,
    site_address: form.siteAddress || null,
    site_contact: form.siteContact || form.specialUserName || null,
    site_phone: form.sitePhone || null,
    equipment_serial: form.equipmentSerial || null,
    equipment_name: form.equipmentName || null,
    diagnostic_code: form.diagnosticCode || null,
    diagnostic_label: form.diagnosticLabel || null,
    solution_code: form.solutionCode || null,
    solution_label: form.solutionLabel || null,
    comments: form.comments || null,
    solution: form.solution || null,
    client_comments: form.clientComments || null,
    software_version: form.softwareVersion || null,
    firmware_version: form.firmwareVersion || null,
    service_software_version: form.serviceSoftwareVersion || null,
    requires_travel_planning: form.requiresTravelPlanning,
    requires_flight: form.requiresFlight,
    requires_car: form.requiresCar,
    trip_type: form.tripType,
    special_client_code: form.specialClientCode || null,
    special_reference_label: form.specialClientCode ? getSpecialClientReferenceLabel(form.specialClientCode) : null,
    special_reference_value: form.specialReferenceValue || null,
    attachment_bucket: form.attachmentBucket || null,
    attachment_path: form.attachmentPath || null,
    attachment_filename: form.attachmentFilename || null,
    signature_data_url: form.signatureDataUrl || null,
    client_signature_data_url: form.clientSignatureDataUrl || null,
    report_payload: {
      form: {
        ...form,
        materialsUsed: meaningfulMaterials,
      },
      sourcePlanningTicketId: form.sourcePlanningTicketId || null,
      versionControl: {
        baselineSoftwareVersion: form.baselineSoftwareVersion || null,
        baselineFirmwareVersion: form.baselineFirmwareVersion || null,
        discrepancyExplanation: form.versionDiscrepancyExplanation || null,
        guard: versionGuard,
      },
      materialsSummary: {
        total: meaningfulMaterials.length,
        matchedCatalog: meaningfulMaterials.filter((item) => item.catalogMatched).length,
        refs: meaningfulMaterials.map((item) => item.referenceCode).filter(Boolean),
        lots: meaningfulMaterials.map((item) => item.lotNumber).filter(Boolean),
      },
    },
    created_by: createdBy,
    updated_by: createdBy,
    updated_at: new Date().toISOString(),
  };
};

export const buildTravelSeedFromServiceReport = (
  form: ServiceReportFormData,
): Partial<TravelFormData> => ({
  engineerId: form.engineerId,
  engineerName: form.engineerName,
  employeeNumber: form.employeeNumber,
  serviceTicketId: form.serviceTicketId,
  serviceType: form.serviceType,
  clientName: form.clientName,
  clientId: form.clientId ?? null,
  departureDate: form.serviceDate || form.callDate,
  returnDate: form.tripType === 'redondo' ? form.serviceDate || form.callDate : '',
  priority: form.priority,
  justification: form.subject || form.comments,
  serviceReference: form.serviceReference,
  equipment: form.equipmentName,
  equipmentSerial: form.equipmentSerial,
  siteAddress: form.siteAddress,
  siteContact: form.siteContact || form.specialUserName,
  sitePhone: form.sitePhone,
  tripType: form.tripType,
  serviceStartDate: form.serviceDate || form.callDate,
  serviceStartTime: form.startedAt || '09:00',
  serviceEndDate: form.serviceDate || form.callDate,
  serviceEndTime: form.endedAt || '17:00',
  adminComments: [form.comments, form.solution].filter(Boolean).join(' | '),
  requiresFlight: form.requiresFlight,
  requiresCar: form.requiresCar,
});

export const getServiceReportAddressAlert = (siteAddress: string) => {
  const trimmed = siteAddress.trim();

  if (!trimmed) {
    return SERVICE_REPORT_ADDRESS_ALERT_MESSAGE;
  }

  const normalized = normalizeText(trimmed);
  if (UNRELIABLE_ADDRESS_TOKENS.some((token) => normalized.includes(token))) {
    return SERVICE_REPORT_ADDRESS_ALERT_MESSAGE;
  }

  const wordCount = trimmed.split(/\s+/).filter(Boolean).length;
  const hasStreetSignal = /(calle|av\.?|avenida|blvd\.?|boulevard|carretera|km\b|col\.?|colonia|cp\b|c\.p\.|no\.?|num\.?|número|manzana|lote|int\.?|ext\.?|sur|norte|oriente|poniente|esquina|privada)/i.test(
    trimmed,
  );
  const hasDigit = /\d/.test(trimmed);
  const hasComma = trimmed.includes(',');

  if (trimmed.length < 18 || wordCount < 4 || (!hasStreetSignal && !hasDigit && !hasComma)) {
    return SERVICE_REPORT_ADDRESS_ALERT_MESSAGE;
  }

  return null;
};

export const shouldRequestVersions = (form: ServiceReportFormData) => {
  if (form.isSoftwareCase) {
    return true;
  }

  const combined = normalizeText(
    [form.subject, form.diagnosticLabel, form.comments, form.solution].filter(Boolean).join(' | '),
  );

  return [
    'software',
    'firmware',
    'actualiz',
    'usb',
    'comunicacion',
    'conexion',
    'lis',
    'interfaz',
  ].some((token) => combined.includes(token));
};

export const isUnreliableServiceReportVersion = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }

  const normalizedToken = normalizeVersionToken(trimmed);
  return UNRELIABLE_VERSION_TOKENS.has(normalizedToken);
};

export const getServiceReportVersionGuard = (form: ServiceReportFormData): ServiceReportVersionGuard => {
  const items: ServiceReportVersionGuardItem[] = [];
  const shouldCheck =
    shouldRequestVersions(form) ||
    Boolean(form.softwareVersion.trim()) ||
    Boolean(form.firmwareVersion.trim()) ||
    Boolean(form.serviceSoftwareVersion.trim()) ||
    Boolean(form.baselineSoftwareVersion.trim()) ||
    Boolean(form.baselineFirmwareVersion.trim());

  if (!shouldCheck) {
    return {
      hasAlert: false,
      requiresExplanation: false,
      items,
    };
  }

  const inspectField = (
    field: ServiceReportVersionField,
    baselineValue: string,
    reportedValue: string,
    label: string,
  ) => {
    const baseline = baselineValue.trim();
    const reported = reportedValue.trim();

    if (!reported) {
      if (baseline) {
        items.push({
          field,
          issueCode: 'missing',
          baselineValue: baseline,
          reportedValue: '',
          message: `La versión de ${label} ya existía como "${baseline}" y el reporte la está dejando vacía.`,
        });
      }
      return;
    }

    if (isUnreliableServiceReportVersion(reported)) {
      items.push({
        field,
        issueCode: 'unreliable',
        baselineValue: baseline,
        reportedValue: reported,
        message: `La versión de ${label} reportada como "${reported}" no es válida para trazabilidad regulatoria.`,
      });
      return;
    }

    if (baseline && normalizeVersionForCompare(baseline) !== normalizeVersionForCompare(reported)) {
      items.push({
        field,
        issueCode: 'changed',
        baselineValue: baseline,
        reportedValue: reported,
        message: `La versión de ${label} no coincide con el historial del equipo. Antes: "${baseline}". Ahora: "${reported}".`,
      });
    }
  };

  inspectField('software', form.baselineSoftwareVersion, form.softwareVersion, 'software');
  inspectField('firmware', form.baselineFirmwareVersion, form.firmwareVersion, 'firmware');

  if (form.serviceSoftwareVersion.trim() && isUnreliableServiceReportVersion(form.serviceSoftwareVersion)) {
    items.push({
      field: 'service_software',
      issueCode: 'unreliable',
      baselineValue: '',
      reportedValue: form.serviceSoftwareVersion.trim(),
      message: `La versión de software de servicio reportada como "${form.serviceSoftwareVersion.trim()}" no es válida para trazabilidad regulatoria.`,
    });
  }

  return {
    hasAlert: items.length > 0,
    requiresExplanation: items.length > 0,
    items,
  };
};

export const validateServiceReportDraft = (form: ServiceReportFormData) => {
  const errors: string[] = [];

  if (!form.engineerName.trim()) {
    errors.push('No se detecto el ingeniero del reporte.');
  }

  if (!form.equipmentSerial.trim() && !form.clientName.trim()) {
    errors.push('Captura al menos el numero de serie o el cliente antes de guardar.');
  }

  if (form.reportType === 'servicio') {
    const addressAlert = getServiceReportAddressAlert(form.siteAddress);
    if (addressAlert) {
      errors.push(addressAlert);
    }
  }

  const versionGuard = getServiceReportVersionGuard(form);
  if (versionGuard.requiresExplanation && !form.versionDiscrepancyExplanation.trim()) {
    errors.push('Debes explicar por qué no coinciden las versiones o por qué la captura no es confiable antes de guardar.');
  }

  return errors;
};

export const validateServiceReportSubmit = (form: ServiceReportFormData) => {
  const errors: string[] = [];
  const versionGuard = getServiceReportVersionGuard(form);

  if (!form.engineerName.trim()) errors.push('No se detecto el ingeniero del reporte.');
  if (!form.equipmentSerial.trim()) errors.push('Debes capturar el numero de serie.');
  if (!form.clientName.trim()) errors.push('Debes capturar el cliente o unidad medica.');

  if (form.reportType === 'servicio') {
    if (!form.serviceDate) errors.push('Debes capturar la fecha de la visita.');
    const addressAlert = getServiceReportAddressAlert(form.siteAddress);
    if (addressAlert) {
      errors.push(addressAlert);
    }
    if (!form.solution.trim() && !form.comments.trim()) {
      errors.push('Debes capturar actividades realizadas, hallazgos o solucion.');
    }
    if (!form.signatureDataUrl.trim()) {
      errors.push('Debes capturar la firma del ingeniero antes de registrar el reporte de servicio.');
    }
    if (!form.clientSignatureDataUrl.trim()) {
      errors.push('Debes capturar la firma del cliente antes de registrar el reporte de servicio.');
    }
  } else {
    if (!form.callDate) errors.push('Debes capturar la fecha de la llamada.');
    if (!form.subject.trim()) errors.push('Debes capturar el asunto del soporte remoto.');
    if (!form.diagnosticCode.trim()) errors.push('Debes seleccionar el codigo de averia o diagnostico.');
    if (!form.solution.trim() && !form.comments.trim()) {
      errors.push('Debes capturar comentarios o solucion del soporte remoto.');
    }
    if (form.specialClientCode && !form.specialReferenceValue.trim()) {
      errors.push(`Debes capturar ${getSpecialClientReferenceLabel(form.specialClientCode)}.`);
    }
    if (form.specialClientCode && !form.businessUnitName.trim()) {
      errors.push('Debes capturar la unidad medica / unidad de negocio del reporte especial.');
    }
  }

  if (form.startedAt && form.endedAt && form.endedAt < form.startedAt) {
    errors.push('La hora final no puede ser anterior a la hora inicial.');
  }

  if (versionGuard.requiresExplanation && !form.versionDiscrepancyExplanation.trim()) {
    errors.push('Debes explicar por qué no coinciden las versiones o por qué la captura no es confiable antes de registrar el reporte.');
  }

  return errors;
};
