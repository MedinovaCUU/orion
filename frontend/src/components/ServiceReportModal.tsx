import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import './TravelPlannerModal.css';
import './ServiceReportModal.css';
import BrandLockup from './BrandLockup';
import Gs1ScannerModal from './Gs1ScannerModal';
import SignaturePad from './SignaturePad';
import type { SolucionCatalogRow } from './serviceCatalog';
import { extractServiceReportTicketFromImage } from './serviceReportTicketOcr';
import {
  createEmptyServiceReportMaterialItem,
  enrichMaterialItemFromReference,
  formatMaterialExpirationLabel,
  isMeaningfulServiceReportMaterialItem,
  resolveMaterialExpirationState,
  type ServiceReportMaterialItem,
} from './gs1DataMatrix';
import {
  METADATA_DELIMITER,
  extractPlaneacionMeta,
  stripPlaneacionMeta,
  type EquipmentSummary,
  type PendingServiceTicket,
  type ProfileSummary,
} from './servicesPlanning';
import {
  buildServiceReportFromPlannedTicket,
  buildServiceReportPayload,
  buildTravelSeedFromServiceReport,
  createEmptyServiceReportForm,
  findClientServiceUnit,
  findEquipmentBySerial,
  getInitialServiceReportValues,
  getServiceReportAddressAlert,
  getLinkedServiceReportCandidates,
  getServiceReportVersionGuard,
  getSpecialClientReferenceLabel,
  hydrateServiceReportForm,
  resolveSpecialClientCodeFromName,
  resolveServiceReportId,
  resolveServiceReportReference,
  shouldRequestVersions,
  validateServiceReportDraft,
  validateServiceReportSubmit,
  type ClientServiceUnitSummary,
  type ServiceReportFormData,
  type ServiceReportMode,
  type ServiceReportStatus,
} from './serviceReports';
import {
  getServiceReportEmailDisabledMessage,
  isServiceReportEmailEnabled,
  sendServiceReportEmail,
} from './serviceReportEmailApi';
import type { TravelFormData } from './travelPlanner';

interface CatalogAveriaOption {
  cda: string;
  detalle_averia: string;
  tipo_averia?: string | null;
  cta?: string | null;
}

interface ServiceReportModalProps {
  isOpen: boolean;
  mode: ServiceReportMode;
  onClose: () => void;
  engineers: ProfileSummary[];
  equipments: EquipmentSummary[];
  plannedTickets: PendingServiceTicket[];
  clientServiceUnits: ClientServiceUnitSummary[];
  averias: CatalogAveriaOption[];
  soluciones: SolucionCatalogRow[];
  initialServiceReportId?: string | null;
  initialPlanningTicketId?: string | null;
  onOpenTravelPlanner?: (seed: Partial<TravelFormData>) => void;
  onSaved?: () => void;
}

type FeedbackTone = 'error' | 'success' | 'info';

interface ModalAlert {
  title: string;
  messages: string[];
  tone: FeedbackTone;
}

interface ServiceReportRow {
  id: string;
  status: ServiceReportStatus;
  report_type: ServiceReportMode;
  report_payload: { form?: ServiceReportFormData } | null;
  service_ticket_id?: string | null;
  related_travel_request_id?: string | null;
  client_id?: number | null;
  engineer_id?: string | null;
  employee_number?: string | null;
  engineer_name?: string | null;
  service_type?: string | null;
  priority?: string | null;
  report_reference?: string | null;
  service_reference?: string | null;
  subject?: string | null;
  call_date?: string | null;
  service_date?: string | null;
  started_at?: string | null;
  ended_at?: string | null;
  client_name?: string | null;
  business_unit_name?: string | null;
  site_address?: string | null;
  site_contact?: string | null;
  site_phone?: string | null;
  equipment_id?: string | null;
  equipment_serial?: string | null;
  equipment_name?: string | null;
  diagnostic_code?: string | null;
  diagnostic_label?: string | null;
  solution_code?: string | null;
  solution_label?: string | null;
  comments?: string | null;
  solution?: string | null;
  client_comments?: string | null;
  software_version?: string | null;
  firmware_version?: string | null;
  service_software_version?: string | null;
  requires_travel_planning?: boolean | null;
  requires_flight?: boolean | null;
  requires_car?: boolean | null;
  trip_type?: string | null;
  special_client_code?: string | null;
  special_reference_value?: string | null;
  attachment_bucket?: string | null;
  attachment_path?: string | null;
  attachment_filename?: string | null;
  signature_data_url?: string | null;
  client_signature_data_url?: string | null;
}

interface PersistReportResult {
  reportId: string;
  form: ServiceReportFormData;
  actorEmail: string;
  actorName: string;
}

interface ServiceReportArtifactsResult {
  emailTo: string;
  emailFailureMessage: string;
  emailSkippedMessage: string;
  pdfFailureMessage: string;
}

const formatDiagnosticOption = (item: Pick<CatalogAveriaOption, 'cda' | 'detalle_averia'>) =>
  [item.cda?.trim(), item.detalle_averia?.trim()].filter(Boolean).join(' - ');

const formatSolutionOption = (item: Pick<SolucionCatalogRow, 'cds' | 'detalle_solucion'>) =>
  [item.cds?.trim(), item.detalle_solucion?.trim()].filter(Boolean).join(' - ');

const formatDiagnosticLookupValue = (code: string, label: string) => {
  const normalizedCode = code.trim();
  const normalizedLabel = label.trim();

  if (normalizedCode && normalizedLabel) {
    return `${normalizedCode} - ${normalizedLabel}`;
  }

  return normalizedCode || normalizedLabel;
};

const formatSolutionLookupValue = (code: string, label: string) => {
  const normalizedCode = code.trim();
  const normalizedLabel = label.trim();

  if (normalizedCode && normalizedLabel) {
    return `${normalizedCode} - ${normalizedLabel}`;
  }

  return normalizedCode || normalizedLabel;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [candidate.message, candidate.details, candidate.hint]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

    if (parts.length > 0) {
      return parts.join(' | ');
    }

    if (typeof candidate.code === 'string' && candidate.code.trim()) {
      return `${fallback} (${candidate.code})`;
    }
  }

  return fallback;
};

const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-');
const mxnFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
};

const blobToBase64 = async (blob: Blob) =>
  await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('No fue posible codificar el PDF.'));
        return;
      }

      const [, base64 = ''] = reader.result.split(',');
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('No fue posible leer el PDF generado.'));
    reader.readAsDataURL(blob);
  });

const buildFallbackForm = (
  mode: ServiceReportMode,
  row: ServiceReportRow,
): ServiceReportFormData => ({
  ...createEmptyServiceReportForm(mode),
  reportType: row.report_type || mode,
  engineerId: row.engineer_id || '',
  engineerName: row.engineer_name || '',
  employeeNumber: row.employee_number || '',
  serviceTicketId: row.service_ticket_id || '',
  relatedTravelRequestId: row.related_travel_request_id || '',
  clientId: row.client_id ?? null,
  serviceType: (row.service_type as ServiceReportFormData['serviceType']) || 'correctivo',
  priority: (row.priority as ServiceReportFormData['priority']) || 'media',
  tripType: (row.trip_type as ServiceReportFormData['tripType']) || 'redondo',
  reportReference: row.report_reference || '',
  serviceReference: row.service_reference || '',
  subject: row.subject || '',
  callDate: row.call_date || '',
  serviceDate: row.service_date || '',
  startedAt: row.started_at || '',
  endedAt: row.ended_at || '',
  clientName: row.client_name || '',
  businessUnitName: row.business_unit_name || '',
  siteAddress: row.site_address || '',
  siteContact: row.site_contact || '',
  sitePhone: row.site_phone || '',
  equipmentId: row.equipment_id || '',
  equipmentSerial: row.equipment_serial || '',
  equipmentName: row.equipment_name || '',
  diagnosticCode: row.diagnostic_code || '',
  diagnosticLabel: row.diagnostic_label || '',
  solutionCode: row.solution_code || '',
  solutionLabel: row.solution_label || '',
  comments: row.comments || '',
  solution: row.solution || '',
  clientComments: row.client_comments || '',
  softwareVersion: row.software_version || '',
  firmwareVersion: row.firmware_version || '',
  serviceSoftwareVersion: row.service_software_version || '',
  baselineSoftwareVersion: '',
  baselineFirmwareVersion: '',
  versionDiscrepancyExplanation: '',
  isSoftwareCase: Boolean(row.software_version || row.firmware_version || row.service_software_version),
  requiresTravelPlanning: Boolean(row.requires_travel_planning),
  requiresFlight: Boolean(row.requires_flight),
  requiresCar: Boolean(row.requires_car),
  specialClientCode: (row.special_client_code as ServiceReportFormData['specialClientCode']) || '',
  specialReferenceValue: row.special_reference_value || '',
  attachmentBucket: row.attachment_bucket || '',
  attachmentPath: row.attachment_path || '',
  attachmentFilename: row.attachment_filename || '',
  signatureDataUrl: row.signature_data_url || '',
  clientSignatureDataUrl: row.client_signature_data_url || '',
  specialUserName: row.site_contact || '',
  sourcePlanningTicketId: '',
});

export default function ServiceReportModal({
  isOpen,
  mode,
  onClose,
  engineers,
  equipments,
  plannedTickets,
  clientServiceUnits,
  averias,
  soluciones,
  initialServiceReportId = null,
  initialPlanningTicketId = null,
  onOpenTravelPlanner,
  onSaved,
}: ServiceReportModalProps) {
  const [formData, setFormData] = useState<ServiceReportFormData>(createEmptyServiceReportForm(mode));
  const [reportId, setReportId] = useState<string | null>(null);
  const [reportStatus, setReportStatus] = useState<ServiceReportStatus>('borrador');
  const [busy, setBusy] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [escalationPanelOpen, setEscalationPanelOpen] = useState(false);
  const [gs1ScannerOpen, setGs1ScannerOpen] = useState(false);
  const [materialScanTargetId, setMaterialScanTargetId] = useState<string | null>(null);
  const [diagnosticLookup, setDiagnosticLookup] = useState('');
  const [solutionLookup, setSolutionLookup] = useState('');
  const [feedback, setFeedback] = useState<{ tone: FeedbackTone; message: string } | null>(null);
  const [modalAlert, setModalAlert] = useState<ModalAlert | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreviewUrl, setAttachmentPreviewUrl] = useState('');

  useEffect(() => {
    if (!attachmentFile) {
      setAttachmentPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(attachmentFile);
    setAttachmentPreviewUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [attachmentFile]);

  useEffect(() => {
    if (!modalAlert) {
      return undefined;
    }

    const duration = Math.min(9000, 3200 + Math.max(0, modalAlert.messages.length - 1) * 1400);
    const timeout = window.setTimeout(() => {
      setModalAlert(null);
    }, duration);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [modalAlert]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    const loadReport = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) {
        return;
      }

      const defaultEngineer = engineers.find((engineer) => engineer.id === user?.id) || engineers[0];
      const baseForm =
        mode === 'servicio'
          ? getInitialServiceReportValues(mode, engineers, equipments, plannedTickets, clientServiceUnits, user?.id)
          : hydrateServiceReportForm(createEmptyServiceReportForm(mode), defaultEngineer, undefined);

      const loadExistingReport = async (targetReportId: string) => {
        const { data, error } = await supabase
          .from('service_reports')
          .select('*')
          .eq('id', targetReportId)
          .maybeSingle();

        if (error || !data || cancelled) {
          return null;
        }

        const row = data as ServiceReportRow;
        const storedForm = row.report_payload?.form;
        const restoredForm = storedForm ? { ...createEmptyServiceReportForm(mode), ...storedForm } : buildFallbackForm(mode, row);

        if (!restoredForm.baselineSoftwareVersion || !restoredForm.baselineFirmwareVersion) {
          const equipment = restoredForm.equipmentSerial ? findEquipmentBySerial(equipments, restoredForm.equipmentSerial) : undefined;
          restoredForm.baselineSoftwareVersion = restoredForm.baselineSoftwareVersion || equipment?.software || '';
          restoredForm.baselineFirmwareVersion = restoredForm.baselineFirmwareVersion || equipment?.firmware || '';
        }

        return {
          id: row.id,
          status: row.status,
          form: restoredForm,
        };
      };

      const explicitPlanningTicket = initialPlanningTicketId
        ? plannedTickets.find((ticket) => ticket.id === initialPlanningTicketId) || null
        : null;

      let restoredForm = baseForm;
      let restoredReportId: string | null = null;
      let restoredStatus: ServiceReportStatus = mode === 'servicio' ? 'borrador' : 'registrado';
      let restoredFeedback: { tone: FeedbackTone; message: string } | null = null;

      if (initialServiceReportId) {
        const explicit = await loadExistingReport(initialServiceReportId);
        if (explicit) {
          restoredForm = explicit.form;
          restoredReportId = explicit.id;
          restoredStatus = explicit.status;
          restoredFeedback = {
            tone: 'info',
            message:
              explicit.status === 'borrador'
                ? 'Se recupero el borrador del reporte de servicio.'
                : 'Se cargo el reporte previamente registrado.',
          };
        }
      }

      if (!restoredReportId && explicitPlanningTicket) {
        const linkedReportId = extractPlaneacionMeta(explicitPlanningTicket.descripcion)?.service_report_id;
        if (linkedReportId) {
          const linked = await loadExistingReport(linkedReportId);
          if (linked) {
            restoredForm = {
              ...linked.form,
              sourcePlanningTicketId: explicitPlanningTicket.id,
            };
            restoredReportId = linked.id;
            restoredStatus = linked.status;
            restoredFeedback = {
              tone: 'info',
              message:
                linked.status === 'borrador'
                  ? 'Se recupero el borrador vinculado a esta planeacion.'
                  : 'Se cargo el reporte registrado para esta planeacion.',
            };
          }
        }
      }

      if (!restoredReportId && explicitPlanningTicket && mode === 'servicio') {
        restoredForm = buildServiceReportFromPlannedTicket(
          explicitPlanningTicket,
          defaultEngineer,
          equipments,
          clientServiceUnits,
          mode,
        );
        restoredFeedback = {
          tone: 'info',
          message: `Se preparo la visita a partir de la planeacion ${explicitPlanningTicket.id.substring(0, 8).toUpperCase()}.`,
        };
      }

      if (!restoredReportId && mode === 'servicio' && !initialPlanningTicketId) {
        for (const candidate of getLinkedServiceReportCandidates(plannedTickets, defaultEngineer)) {
          const linked = await loadExistingReport(candidate.meta.service_report_id as string);
          if (!linked || linked.status !== 'borrador') {
            continue;
          }

          restoredForm = {
            ...linked.form,
            sourcePlanningTicketId: candidate.ticket.id,
          };
          restoredReportId = linked.id;
          restoredStatus = linked.status;
          restoredFeedback = {
            tone: 'info',
            message: `Se recupero un borrador vinculado a la planeacion ${candidate.ticket.id.substring(0, 8).toUpperCase()}.`,
          };
          break;
        }
      }

      if (!cancelled) {
        setFormData(restoredForm);
        setReportId(restoredReportId);
        setReportStatus(restoredStatus);
        setFeedback(restoredFeedback);
        setModalAlert(null);
        setAttachmentFile(null);
        setOcrBusy(false);
        setOcrProgress(0);
        setOcrStatus('');
        setDiagnosticLookup(formatDiagnosticLookupValue(restoredForm.diagnosticCode, restoredForm.diagnosticLabel));
        setSolutionLookup(formatSolutionLookupValue(restoredForm.solutionCode, restoredForm.solutionLabel));
        setEscalationPanelOpen(
          mode === 'remoto' &&
            Boolean(restoredForm.requiresTravelPlanning || restoredForm.requiresFlight || restoredForm.requiresCar),
        );
      }
    };

    void loadReport();

    return () => {
      cancelled = true;
    };
  }, [
    clientServiceUnits,
    engineers,
    equipments,
    initialPlanningTicketId,
    initialServiceReportId,
    isOpen,
    mode,
    plannedTickets,
  ]);

  const engineerOptions = useMemo(
    () =>
      engineers.map((engineer) => ({
        value: engineer.id,
        label: engineer.nombre_completo || 'Ingeniero sin nombre',
      })),
    [engineers],
  );

  const equipmentOptions = useMemo(
    () =>
      equipments.map((equipment) => ({
        value: equipment.numero_serie,
        label: `${equipment.numero_serie}${equipment.modelo ? ` | ${equipment.modelo}` : ''}${
          equipment.clientes?.razon_social ? ` | ${equipment.clientes.razon_social}` : ''
        }`,
      })),
    [equipments],
  );

  const selectedEquipment = useMemo(
    () => findEquipmentBySerial(equipments, formData.equipmentSerial),
    [equipments, formData.equipmentSerial],
  );

  const selectedUnit = useMemo(
    () => findClientServiceUnit(clientServiceUnits, formData.equipmentSerial, formData.clientId),
    [clientServiceUnits, formData.clientId, formData.equipmentSerial],
  );

  const selectedDiagnostic = useMemo(
    () => averias.find((item) => item.cda === formData.diagnosticCode),
    [averias, formData.diagnosticCode],
  );
  const selectedSolution = useMemo(
    () => soluciones.find((item) => item.cds === formData.solutionCode),
    [formData.solutionCode, soluciones],
  );
  const compatibleSolutions = useMemo(() => {
    const diagnosticCategory = selectedDiagnostic?.cta?.trim();
    if (!diagnosticCategory) {
      return soluciones;
    }

    const strictMatches = soluciones.filter((item) => item.cts?.trim() === diagnosticCategory);
    return strictMatches.length > 0 ? strictMatches : soluciones;
  }, [selectedDiagnostic, soluciones]);

  const needsVersionFields = useMemo(() => shouldRequestVersions(formData), [formData]);
  const specialReferenceLabel = getSpecialClientReferenceLabel(formData.specialClientCode);
  const hasSelectedSerial = formData.equipmentSerial.trim().length > 0;
  const shouldShowVersionFields = mode === 'servicio' || mode === 'remoto' || needsVersionFields;
  const shouldShowEscalationSection =
    mode === 'remoto' &&
    (escalationPanelOpen || formData.requiresTravelPlanning || formData.requiresFlight || formData.requiresCar);
  const siteAddressAlert = useMemo(
    () => (mode === 'servicio' ? getServiceReportAddressAlert(formData.siteAddress) : null),
    [formData.siteAddress, mode],
  );
  const versionGuard = useMemo(() => getServiceReportVersionGuard(formData), [formData]);
  const meaningfulMaterialItems = useMemo(
    () => formData.materialsUsed.filter(isMeaningfulServiceReportMaterialItem),
    [formData.materialsUsed],
  );
  const adminRecipients = useMemo(() => engineers.filter((profile) => profile.rol === 'admin'), [engineers]);
  const adminRecipientsLabel = useMemo(() => {
    const names = adminRecipients
      .map((profile) => profile.nombre_completo?.trim() || '')
      .filter((value) => value.length > 0);

    if (names.length === 0) {
      return 'el equipo administrativo configurado';
    }

    if (names.length === 1) {
      return names[0];
    }

    if (names.length === 2) {
      return `${names[0]} y ${names[1]}`;
    }

    return `${names[0]}, ${names[1]} y ${names.length - 2} más`;
  }, [adminRecipients]);

  useEffect(() => {
    if (!selectedDiagnostic || formData.diagnosticLabel === selectedDiagnostic.detalle_averia) {
      return;
    }

    setFormData((current) => ({
      ...current,
      diagnosticLabel: selectedDiagnostic.detalle_averia,
      isSoftwareCase: current.isSoftwareCase || /software|firmware|usb|comunicacion|conexion/i.test(selectedDiagnostic.detalle_averia),
    }));
  }, [formData.diagnosticLabel, selectedDiagnostic]);

  useEffect(() => {
    if (!selectedSolution || formData.solutionLabel === selectedSolution.detalle_solucion) {
      return;
    }

    setFormData((current) => ({
      ...current,
      solutionLabel: selectedSolution.detalle_solucion,
    }));
  }, [formData.solutionLabel, selectedSolution]);

  useEffect(() => {
    if (!formData.diagnosticCode.trim()) {
      return;
    }

    const nextLookup = selectedDiagnostic
      ? formatDiagnosticOption(selectedDiagnostic)
      : formatDiagnosticLookupValue(formData.diagnosticCode, formData.diagnosticLabel);

    setDiagnosticLookup((current) => (current === nextLookup ? current : nextLookup));
  }, [formData.diagnosticCode, formData.diagnosticLabel, selectedDiagnostic]);

  useEffect(() => {
    if (!formData.solutionCode.trim()) {
      return;
    }

    const nextLookup = selectedSolution
      ? formatSolutionOption(selectedSolution)
      : formatSolutionLookupValue(formData.solutionCode, formData.solutionLabel);

    setSolutionLookup((current) => (current === nextLookup ? current : nextLookup));
  }, [formData.solutionCode, formData.solutionLabel, selectedSolution]);

  useEffect(() => {
    const nextCode = resolveSpecialClientCodeFromName(formData.clientName);
    if (!nextCode || nextCode === formData.specialClientCode || formData.specialClientCode) {
      return;
    }

    setFormData((current) => ({
      ...current,
      specialClientCode: nextCode,
    }));
  }, [formData.clientName, formData.specialClientCode]);

  const updateFormField = <K extends keyof ServiceReportFormData>(field: K, value: ServiceReportFormData[K]) => {
    setFormData((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const addManualMaterial = () => {
    const nextItem = createEmptyServiceReportMaterialItem();
    setFormData((current) => ({
      ...current,
      materialsUsed: [...current.materialsUsed, nextItem],
    }));
    setMaterialScanTargetId(nextItem.id);
  };

  const openMaterialScanner = (targetId?: string) => {
    const fallbackTarget =
      targetId ||
      [...formData.materialsUsed].reverse().find((item) => !isMeaningfulServiceReportMaterialItem(item))?.id ||
      formData.materialsUsed.at(-1)?.id ||
      null;

    setMaterialScanTargetId(fallbackTarget);
    setGs1ScannerOpen(true);
  };

  const appendScannedMaterial = (item: ServiceReportMaterialItem) => {
    const targetId = materialScanTargetId;

    setFormData((current) => {
      const fallbackTarget =
        (targetId ? current.materialsUsed.find((entry) => entry.id === targetId) : undefined) ||
        [...current.materialsUsed].reverse().find((entry) => !isMeaningfulServiceReportMaterialItem(entry));

      if (!fallbackTarget) {
        return {
          ...current,
          materialsUsed: [...current.materialsUsed, item],
        };
      }

      return {
        ...current,
        materialsUsed: current.materialsUsed.map((entry) =>
          entry.id === fallbackTarget.id
            ? {
                ...entry,
                ...item,
                id: entry.id,
                quantity: entry.quantity || item.quantity,
                notes: entry.notes || item.notes,
                kind: entry.kind !== 'otro' ? entry.kind : item.kind,
                productName: entry.productName.trim() || item.productName,
              }
            : entry,
        ),
      };
    });
    setMaterialScanTargetId(null);
    setFeedback({
      tone: 'success',
      message: item.catalogMatched
        ? `Insumo reconocido: ${item.productName}. Se capturaron REF ${item.referenceCode}, lote ${item.lotNumber || 'sin lote'} y caducidad.`
        : `Codigo capturado. Se registro REF ${item.referenceCode} con lote ${item.lotNumber || 'sin lote'} para trazabilidad.`,
    });
  };

  const updateMaterialItem = (
    itemId: string,
    field: keyof ServiceReportMaterialItem,
    value: ServiceReportMaterialItem[keyof ServiceReportMaterialItem],
  ) => {
    setFormData((current) => ({
      ...current,
      materialsUsed: current.materialsUsed.map((item) => (item.id === itemId ? { ...item, [field]: value } : item)),
    }));
  };

  const removeMaterialItem = (itemId: string) => {
    setFormData((current) => {
      const remaining = current.materialsUsed.filter((item) => item.id !== itemId);
      return {
        ...current,
        materialsUsed: remaining.length > 0 ? remaining : [createEmptyServiceReportMaterialItem()],
      };
    });
  };

  const hydrateMaterialItemFromReference = async (itemId: string) => {
    const item = formData.materialsUsed.find((entry) => entry.id === itemId);
    if (!item?.referenceCode.trim()) {
      return;
    }

    const enriched = await enrichMaterialItemFromReference(item);
    setFormData((current) => ({
      ...current,
      materialsUsed: current.materialsUsed.map((entry) => (entry.id === itemId ? enriched : entry)),
    }));
  };

  const handleDiagnosticLookupChange = (value: string) => {
    setDiagnosticLookup(value);
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      setFormData((current) => ({
        ...current,
        diagnosticCode: '',
      }));
      return;
    }

    const matchedDiagnostic = averias.find((item) => {
      const optionValue = formatDiagnosticOption(item).toLowerCase();
      return item.cda.toLowerCase() === normalized || optionValue === normalized;
    });

    if (!matchedDiagnostic) {
      setFormData((current) => ({
        ...current,
        diagnosticCode: '',
      }));
      return;
    }

    const nextLookup = formatDiagnosticOption(matchedDiagnostic);
    setDiagnosticLookup(nextLookup);
    setFormData((current) => ({
      ...current,
      diagnosticCode: matchedDiagnostic.cda,
      diagnosticLabel: matchedDiagnostic.detalle_averia,
      isSoftwareCase:
        current.isSoftwareCase || /software|firmware|usb|comunicacion|conexion/i.test(matchedDiagnostic.detalle_averia),
    }));
  };

  const handleSolutionLookupChange = (value: string) => {
    setSolutionLookup(value);
    const normalized = value.trim().toLowerCase();

    if (!normalized) {
      setFormData((current) => ({
        ...current,
        solutionCode: '',
      }));
      return;
    }

    const matchedSolution = compatibleSolutions.find((item) => {
      const optionValue = formatSolutionOption(item).toLowerCase();
      return item.cds.toLowerCase() === normalized || optionValue === normalized;
    });

    if (!matchedSolution) {
      setFormData((current) => ({
        ...current,
        solutionCode: '',
      }));
      return;
    }

    const nextLookup = formatSolutionOption(matchedSolution);
    setSolutionLookup(nextLookup);
    setFormData((current) => ({
      ...current,
      solutionCode: matchedSolution.cds,
      solutionLabel: matchedSolution.detalle_solucion,
    }));
  };

  const showModalAlert = (tone: FeedbackTone, title: string, messages: string[]) => {
    setFeedback(null);
    setModalAlert({ tone, title, messages });
  };

  const storedAttachmentUrl =
    formData.attachmentBucket && formData.attachmentPath
      ? `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${formData.attachmentBucket}/${formData.attachmentPath}`
      : '';

  const mergeContextualForm = (
    current: ServiceReportFormData,
    incoming: Partial<ServiceReportFormData>,
  ): ServiceReportFormData => {
    const candidateSerial = String(incoming.equipmentSerial ?? current.equipmentSerial ?? '').trim();
    const engineer =
      engineers.find((item) => item.id === (incoming.engineerId ?? current.engineerId)) ||
      engineers.find((item) => item.id === current.engineerId);
    const equipment = candidateSerial ? findEquipmentBySerial(equipments, candidateSerial) : undefined;
    const nextClientId =
      incoming.clientId ??
      current.clientId ??
      equipment?.clientes?.id ??
      null;
    const unit = candidateSerial ? findClientServiceUnit(clientServiceUnits, candidateSerial, nextClientId) : undefined;
    const contextualBase = hydrateServiceReportForm(createEmptyServiceReportForm(current.reportType), engineer, equipment, unit);
    const merged = {
      ...contextualBase,
      ...current,
      ...incoming,
    };

    if (incoming.specialClientCode) {
      merged.specialClientCode = incoming.specialClientCode;
    }

    return merged;
  };

  const getAttachmentBlobForExtraction = async () => {
    if (attachmentFile) {
      return attachmentFile;
    }

    if (!storedAttachmentUrl) {
      return null;
    }

    const response = await fetch(storedAttachmentUrl);
    if (!response.ok) {
      throw new Error('No se pudo abrir el adjunto guardado para extraer la informacion.');
    }

    return await response.blob();
  };

  const fetchLatestSiteContact = async (serial: string) => {
    if (!serial) {
      return;
    }

    const { data, error } = await supabase
      .from('tickets')
      .select('nombre_cliente_guest, telefono_cliente_guest')
      .eq('numero_serie_equipo', serial)
      .order('creado_en', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    setFormData((current) => ({
      ...current,
      siteContact: current.siteContact || data.nombre_cliente_guest || current.siteContact,
      sitePhone: current.sitePhone || data.telefono_cliente_guest || current.sitePhone,
      specialUserName: current.specialUserName || data.nombre_cliente_guest || current.specialUserName,
    }));
  };

  const syncEngineer = (engineerId: string) => {
    const engineer = engineers.find((candidate) => candidate.id === engineerId);
    setFormData((current) => {
      const next = hydrateServiceReportForm(current, engineer, selectedEquipment, selectedUnit);
      return {
        ...next,
        softwareVersion: current.softwareVersion,
        firmwareVersion: current.firmwareVersion,
        baselineSoftwareVersion: current.baselineSoftwareVersion || next.baselineSoftwareVersion,
        baselineFirmwareVersion: current.baselineFirmwareVersion || next.baselineFirmwareVersion,
        versionDiscrepancyExplanation: current.versionDiscrepancyExplanation,
      };
    });
  };

  const syncEquipment = (serial: string) => {
    const equipment = findEquipmentBySerial(equipments, serial);
    const unit = findClientServiceUnit(clientServiceUnits, serial, equipment?.clientes?.id);
    setFormData((current) => hydrateServiceReportForm(current, engineers.find((item) => item.id === current.engineerId), equipment, unit));
    if (equipment?.numero_serie) {
      void fetchLatestSiteContact(equipment.numero_serie);
    }
  };

  useEffect(() => {
    if (!selectedEquipment?.numero_serie) {
      return;
    }

    if (formData.siteContact && formData.sitePhone) {
      return;
    }

    void fetchLatestSiteContact(selectedEquipment.numero_serie);
  }, [formData.siteContact, formData.sitePhone, selectedEquipment]);

  useEffect(() => {
    if (!isOpen || mode !== 'servicio' || formData.materialsUsed.length > 0) {
      return;
    }

    setFormData((current) => {
      if (current.materialsUsed.length > 0) {
        return current;
      }

      return {
        ...current,
        materialsUsed: [createEmptyServiceReportMaterialItem()],
      };
    });
  }, [formData.materialsUsed.length, isOpen, mode]);

  const handleExtractAttachment = async () => {
    setFeedback(null);
    setModalAlert(null);
    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus('Preparando adjunto');

    try {
      const blob = await getAttachmentBlobForExtraction();

      if (!blob) {
        showModalAlert('error', 'No hay adjunto para extraer', [
          'Sube primero una imagen del ticket o reabre un reporte que ya tenga el adjunto guardado.',
        ]);
        return;
      }

      const result = await extractServiceReportTicketFromImage(blob, (progress, status) => {
        setOcrProgress(progress);
        setOcrStatus(status);
      });

      setFormData((current) => mergeContextualForm(current, result.extractedFields));

      if (result.extractedFields.equipmentSerial) {
        void fetchLatestSiteContact(result.extractedFields.equipmentSerial);
      }

      setFeedback({
        tone: 'success',
        message:
          result.extractedSummary.length > 0
            ? `Adjunto analizado. Se prellenaron ${result.extractedSummary.join(', ')}.`
            : 'Adjunto analizado. No se detectaron campos confiables para prellenar, pero el texto ya fue procesado.',
      });
    } catch (error) {
      showModalAlert('error', 'No se pudo extraer la informacion del adjunto', [
        getErrorMessage(error, 'No fue posible leer la imagen del ticket. El reporte sigue disponible para captura manual.'),
      ]);
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
      setOcrStatus('');
    }
  };

  const openEscalationSection = () => {
    setEscalationPanelOpen(true);
    if (!formData.requiresTravelPlanning) {
      updateFormField('requiresTravelPlanning', true);
    }
  };

  const hideEscalationSection = () => {
    setEscalationPanelOpen(false);
    setFormData((current) => ({
      ...current,
      requiresTravelPlanning: false,
      requiresFlight: false,
      requiresCar: false,
    }));
  };

  const syncLinkedPlanningTicket = async (
    linkedReportId: string,
    status: ServiceReportStatus,
    nextForm: ServiceReportFormData,
  ) => {
    if (!nextForm.sourcePlanningTicketId) {
      return;
    }

    const cachedTicket = plannedTickets.find((ticket) => ticket.id === nextForm.sourcePlanningTicketId);
    let currentDescription = cachedTicket?.descripcion || '';

    if (!cachedTicket) {
      const { data, error } = await supabase
        .from('tickets')
        .select('descripcion')
        .eq('id', nextForm.sourcePlanningTicketId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      currentDescription = data?.descripcion || '';
    }

    const currentMeta = extractPlaneacionMeta(currentDescription) || {};
    const cleanDescription = stripPlaneacionMeta(currentDescription).trim();
    const nextMeta = {
      ...currentMeta,
      service_report_id: linkedReportId,
      service_report_status: status,
    };
    const nextDescription = cleanDescription
      ? `${cleanDescription}\n\n${METADATA_DELIMITER} ${JSON.stringify(nextMeta)}`
      : `${METADATA_DELIMITER} ${JSON.stringify(nextMeta)}`;

    const { error } = await supabase
      .from('tickets')
      .update({ descripcion: nextDescription })
      .eq('id', nextForm.sourcePlanningTicketId);

    if (error) {
      throw error;
    }
  };

  const uploadAttachment = async (stableReportId: string) => {
    if (!attachmentFile) {
      return {
        attachmentBucket: formData.attachmentBucket,
        attachmentPath: formData.attachmentPath,
        attachmentFilename: formData.attachmentFilename,
      };
    }

    const safeName = sanitizeFileName(attachmentFile.name);
    const path = `service-reports/${stableReportId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from('documentos').upload(path, attachmentFile, {
      upsert: true,
    });

    if (error) {
      throw error;
    }

    setAttachmentFile(null);

    return {
      attachmentBucket: 'documentos',
      attachmentPath: path,
      attachmentFilename: attachmentFile.name,
    };
  };

  const uploadGeneratedPdf = async (stableReportId: string, nextForm: ServiceReportFormData, pdfBlob: Blob) => {
    const { buildServiceReportPdfFileName } = await import('./serviceReportPdf');
    const pdfFileName = buildServiceReportPdfFileName(nextForm);
    const path = `service-reports/${stableReportId}/${sanitizeFileName(pdfFileName)}`;
    const { error } = await supabase.storage.from('documentos').upload(path, pdfBlob, {
      upsert: true,
      contentType: 'application/pdf',
    });

    if (error) {
      throw error;
    }

    return {
      pdfFileName,
      path,
      publicUrl: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/documentos/${path}`,
    };
  };

  const finalizeServiceReportArtifacts = async (
    result: PersistReportResult,
    status: ServiceReportStatus,
  ): Promise<ServiceReportArtifactsResult> => {
    const artifacts: ServiceReportArtifactsResult = {
      emailTo: '',
      emailFailureMessage: '',
      emailSkippedMessage: '',
      pdfFailureMessage: '',
    };

    try {
      const generatedAt = new Date();
      const { generateServiceReportPdf } = await import('./serviceReportPdf');
      const pdf = await generateServiceReportPdf(result.form, {
        status,
        reportId: result.reportId,
        generatedAt,
      });

      downloadBlob(pdf.blob, pdf.fileName);

      let pdfPublicUrl = '';
      try {
        const uploadedPdf = await uploadGeneratedPdf(result.reportId, result.form, pdf.blob);
        pdfPublicUrl = uploadedPdf.publicUrl;
      } catch (uploadError) {
        console.warn('No se pudo subir el PDF del reporte a Storage.', uploadError);
      }

      if (!result.actorEmail.trim()) {
        artifacts.emailSkippedMessage =
          'No se encontro correo autenticado para el usuario que registro el reporte. El PDF se genero y se descargo localmente.';
        return artifacts;
      }

      if (!isServiceReportEmailEnabled()) {
        artifacts.emailSkippedMessage = getServiceReportEmailDisabledMessage();
        return artifacts;
      }

      try {
        const pdfBase64 = await blobToBase64(pdf.blob);
        const emailResponse = await sendServiceReportEmail({
          reportId: result.reportId,
          status,
          reportReference: resolveServiceReportReference(result.form),
          reportTitle: pdf.title,
          generatedAt: generatedAt.toLocaleString('es-MX'),
          generatedByName: result.actorName,
          engineerName: result.form.engineerName,
          engineerEmail: result.actorEmail,
          form: result.form,
          pdfFileName: pdf.fileName,
          pdfBase64,
          pdfPublicUrl,
        });

        artifacts.emailTo = emailResponse.to || result.actorEmail;
      } catch (emailError) {
        artifacts.emailFailureMessage = getErrorMessage(
          emailError,
          'El reporte se guardo y el PDF se genero, pero el correo no pudo enviarse.',
        );
      }

      return artifacts;
    } catch (error) {
      artifacts.pdfFailureMessage = getErrorMessage(
        error,
        'El reporte quedo guardado, pero no fue posible generar el PDF final del servicio.',
      );
      return artifacts;
    }
  };

  const syncServiceReportMaterials = async (serviceReportId: string, nextForm: ServiceReportFormData) => {
    const materialRows = nextForm.materialsUsed
      .filter(isMeaningfulServiceReportMaterialItem)
      .map((item) => ({
        service_report_id: serviceReportId,
        item_id: item.id,
        material_kind: item.kind,
        quantity: item.quantity,
        product_name: item.productName || null,
        raw_scan: item.rawScan || null,
        scan_method: item.scanMethod || null,
        scan_format: item.scanFormat || null,
        gtin: item.gtin || null,
        reference_code: item.referenceCode || null,
        lot_number: item.lotNumber || null,
        expires_on: item.expiresOn || null,
        catalog_code: item.catalogCode || null,
        category_name: item.categoryName || null,
        presentation: item.presentation || null,
        price_mxn: typeof item.priceMxn === 'number' ? item.priceMxn : null,
        catalog_matched: item.catalogMatched,
        scanned_at: item.scannedAt || null,
        notes: item.notes || null,
        metadata: {
          source: 'service_report_modal',
        },
      }));

    const isMissingTableError = (error: unknown) => {
      if (!(error instanceof Error)) {
        return false;
      }

      return /service_report_materials/i.test(error.message) || /schema cache/i.test(error.message);
    };

    try {
      const { error: deleteError } = await supabase
        .from('service_report_materials')
        .delete()
        .eq('service_report_id', serviceReportId);

      if (deleteError) {
        throw deleteError;
      }

      if (materialRows.length === 0) {
        return;
      }

      const { error: insertError } = await supabase.from('service_report_materials').insert(materialRows);
      if (insertError) {
        throw insertError;
      }
    } catch (error) {
      if (isMissingTableError(error)) {
        console.warn('service_report_materials no disponible todavia; el detalle queda guardado en report_payload.', error);
        return;
      }

      console.warn('No se pudo sincronizar el detalle estructurado de materiales del reporte.', error);
    }
  };

  const syncVersionDiscrepancyTrail = async (
    serviceReportId: string,
    status: ServiceReportStatus,
    nextForm: ServiceReportFormData,
    actorId: string | null,
  ) => {
    const guard = getServiceReportVersionGuard(nextForm);
    const nowIso = new Date().toISOString();

    if (!guard.hasAlert) {
      const { error } = await supabase
        .from('service_report_version_alerts')
        .update({
          service_report_status: status,
          is_active: false,
          resolved_at: nowIso,
          resolved_by: actorId,
          updated_at: nowIso,
          guard_snapshot: {
            resolved: true,
            resolvedAt: nowIso,
            reportReference: resolveServiceReportReference(nextForm),
          },
        })
        .eq('service_report_id', serviceReportId);

      if (error) {
        throw error;
      }

      return;
    }

    const softwareIssue = guard.items.find((item) => item.field === 'software');
    const firmwareIssue = guard.items.find((item) => item.field === 'firmware');
    const serviceSoftwareIssue = guard.items.find((item) => item.field === 'service_software');
    const adminNotificationSnapshot = adminRecipients.map((profile) => ({
      id: profile.id,
      nombre_completo: profile.nombre_completo || 'Administrador sin nombre',
    }));

    const { error } = await supabase.from('service_report_version_alerts').upsert(
      {
        service_report_id: serviceReportId,
        service_report_status: status,
        engineer_id: nextForm.engineerId || actorId,
        engineer_name_snapshot: nextForm.engineerName || null,
        equipment_id: nextForm.equipmentId || null,
        equipment_serial: nextForm.equipmentSerial || 'SIN-SERIE',
        software_baseline_version: nextForm.baselineSoftwareVersion || null,
        software_reported_version: nextForm.softwareVersion || null,
        software_issue_code: softwareIssue?.issueCode || null,
        firmware_baseline_version: nextForm.baselineFirmwareVersion || null,
        firmware_reported_version: nextForm.firmwareVersion || null,
        firmware_issue_code: firmwareIssue?.issueCode || null,
        service_software_reported_version: nextForm.serviceSoftwareVersion || null,
        service_software_issue_code: serviceSoftwareIssue?.issueCode || null,
        explanation: nextForm.versionDiscrepancyExplanation.trim(),
        admin_notification_snapshot: adminNotificationSnapshot,
        guard_snapshot: {
          items: guard.items,
          reportReference: resolveServiceReportReference(nextForm),
          serviceTicketId: nextForm.serviceTicketId || null,
          reportType: nextForm.reportType,
          baselineSoftwareVersion: nextForm.baselineSoftwareVersion || null,
          baselineFirmwareVersion: nextForm.baselineFirmwareVersion || null,
          softwareVersion: nextForm.softwareVersion || null,
          firmwareVersion: nextForm.firmwareVersion || null,
          serviceSoftwareVersion: nextForm.serviceSoftwareVersion || null,
        },
        is_active: true,
        resolved_at: null,
        resolved_by: null,
        updated_at: nowIso,
      },
      { onConflict: 'service_report_id' },
    );

    if (error) {
      throw error;
    }
  };

  const persistReport = async (status: ServiceReportStatus): Promise<PersistReportResult> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const stableReportId = reportId || resolveServiceReportId(formData);
    const attachmentData = await uploadAttachment(stableReportId);
    const nextForm = {
      ...formData,
      ...attachmentData,
      reportReference: resolveServiceReportReference(formData),
    };
    const payload = buildServiceReportPayload(nextForm, status, user?.id || null);

    if (reportId) {
      const { error } = await supabase.from('service_reports').update(payload).eq('id', reportId);
      if (error) {
        throw error;
      }
      await syncLinkedPlanningTicket(reportId, status, nextForm);
      await syncServiceReportMaterials(reportId, nextForm);
      await syncVersionDiscrepancyTrail(reportId, status, nextForm, user?.id || null);
      setFormData(nextForm);
      setReportStatus(status);
      return {
        reportId,
        form: nextForm,
        actorEmail: user?.email || '',
        actorName: String(user?.user_metadata?.nombre_completo || nextForm.engineerName || user?.email || 'Ingeniero Orion'),
      };
    }

    const { data, error } = await supabase
      .from('service_reports')
      .upsert({ id: stableReportId, ...payload })
      .select('id')
      .single();
    if (error) {
      throw error;
    }

    const insertedId = data.id as string;
    await syncLinkedPlanningTicket(insertedId, status, nextForm);
    await syncServiceReportMaterials(insertedId, nextForm);
    await syncVersionDiscrepancyTrail(insertedId, status, nextForm, user?.id || null);
    setReportId(insertedId);
    setFormData(nextForm);
    setReportStatus(status);
    return {
      reportId: insertedId,
      form: nextForm,
      actorEmail: user?.email || '',
      actorName: String(user?.user_metadata?.nombre_completo || nextForm.engineerName || user?.email || 'Ingeniero Orion'),
    };
  };

  const handleSaveDraft = async () => {
    const errors = validateServiceReportDraft(formData);
    if (errors.length > 0) {
      showModalAlert('error', 'No se pudo guardar el borrador', errors);
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const persisted = await persistReport('borrador');
      const activeVersionGuard = getServiceReportVersionGuard(persisted.form);
      setFeedback({
        tone: 'success',
        message: activeVersionGuard.hasAlert
          ? `Borrador guardado. La discrepancia de versiones quedó registrada y marcada para notificación administrativa a ${adminRecipientsLabel}.`
          : 'Borrador de reporte guardado. El ingeniero podra retomarlo sin volver a capturar el contexto.',
      });
      onSaved?.();
    } catch (error) {
      showModalAlert('error', 'Error al guardar borrador', [
        getErrorMessage(error, 'No fue posible guardar el borrador del reporte.'),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handlePlanTravel = async () => {
    const errors =
      mode === 'servicio' ? validateServiceReportDraft(formData) : validateServiceReportSubmit(formData);
    if (errors.length > 0) {
      showModalAlert('error', 'Faltan datos para planear el viaje', errors);
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      if (mode === 'servicio') {
        await persistReport('borrador');
      } else {
        await persistReport('requiere_visita');
      }

      onOpenTravelPlanner?.(buildTravelSeedFromServiceReport(formData));
      onSaved?.();
      onClose();
    } catch (error) {
      showModalAlert('error', 'No se pudo abrir la planeacion de viaje', [
        getErrorMessage(error, 'No fue posible preparar el salto al planificador de viaje.'),
      ]);
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async () => {
    const errors = validateServiceReportSubmit(formData);
    if (errors.length > 0) {
      showModalAlert('error', 'Corrige el reporte antes de registrarlo', errors);
      return;
    }

    setBusy(true);
    setFeedback(null);

    try {
      const status: ServiceReportStatus = mode === 'remoto' && formData.requiresTravelPlanning ? 'requiere_visita' : 'registrado';
      const persisted = await persistReport(status);
      const activeVersionGuard = getServiceReportVersionGuard(persisted.form);
      const artifacts = await finalizeServiceReportArtifacts(persisted, status);
      const versionMessage = activeVersionGuard.hasAlert
        ? ` La discrepancia de versiones quedo trazada y se preparo la notificacion para ${adminRecipientsLabel}.`
        : '';
      const outcomeTone: FeedbackTone = artifacts.pdfFailureMessage || artifacts.emailFailureMessage ? 'info' : 'success';
      const baseMessage =
        mode === 'remoto' && formData.requiresTravelPlanning
          ? 'Reporte remoto registrado. El caso quedo marcado para visita presencial.'
          : 'Reporte registrado correctamente.';
      const pdfMessage = artifacts.pdfFailureMessage
        ? ` ${artifacts.pdfFailureMessage}`
        : ' PDF generado y descargado correctamente.';
      const emailMessage = artifacts.pdfFailureMessage
        ? ''
        : artifacts.emailFailureMessage
          ? ` El correo no pudo salir: ${artifacts.emailFailureMessage}`
          : artifacts.emailSkippedMessage
            ? ` ${artifacts.emailSkippedMessage}`
            : ` Correo enviado a ${artifacts.emailTo || persisted.actorEmail}.`;

      setFeedback({
        tone: outcomeTone,
        message: `${baseMessage}${pdfMessage}${emailMessage}${versionMessage}`,
      });
      onSaved?.();
    } catch (error) {
      showModalAlert('error', 'No se pudo registrar el reporte', [
        getErrorMessage(error, 'No fue posible guardar el reporte.'),
      ]);
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return createPortal(
    <div className="travel-modal-overlay" onClick={onClose}>
      <div className="travel-modal-shell service-report-shell" onClick={(event) => event.stopPropagation()}>
        <aside className="travel-modal-sidebar">
          <div className="travel-modal-brand">
            <BrandLockup
              variant="sidebar"
              eyebrow="Orion"
              title={mode === 'servicio' ? 'Reporte Servicio' : 'Reporte Remoto'}
              subtitle={
                mode === 'servicio'
                  ? 'Prepara la visita presencial con el contexto tecnico, firmas y puente directo a la logistica.'
                  : 'Documenta el soporte remoto, genera formatos especiales por cliente y escala a visita si hace falta.'
              }
            />
          </div>

          <div className="travel-step-list">
            <button type="button" className="travel-step-item active">
              <span>1</span>
              <div>
                <strong>{mode === 'servicio' ? 'Visita' : 'Llamada'}</strong>
                <p>{mode === 'servicio' ? 'Contexto presencial, equipo y sitio.' : 'Asunto, serie, diagnostico y solucion.'}</p>
              </div>
            </button>
            <button type="button" className="travel-step-item done">
              <span>2</span>
              <div>
                <strong>{mode === 'servicio' ? 'Evidencia' : 'Escalamiento'}</strong>
                <p>{mode === 'servicio' ? 'Firma, notas y borrador recuperable.' : 'Formato especial, adjunto y agenda de visita.'}</p>
              </div>
            </button>
          </div>

          <div className="travel-sidebar-card">
            <h4>Estado actual</h4>
            <div className="travel-meta-row">
              <span className="travel-meta-pill">{reportStatus === 'borrador' ? 'Borrador' : reportStatus === 'requiere_visita' ? 'Requiere visita' : 'Registrado'}</span>
              {formData.sourcePlanningTicketId && (
                <span className="travel-meta-pill">Planeacion {formData.sourcePlanningTicketId.substring(0, 8).toUpperCase()}</span>
              )}
              {formData.specialClientCode && (
                <span className="travel-meta-pill">{`Formato ${formData.specialClientCode.toUpperCase()}`}</span>
              )}
            </div>
          </div>

        </aside>

        <section className="travel-modal-content">
          <header className="travel-modal-header">
            <div>
              <h2>
                {mode === 'servicio'
                  ? 'Registrar visita presencial y dejarla lista para el ingeniero'
                  : 'Registrar soporte remoto con escalamiento operativo'}
              </h2>
              <p>
                {mode === 'servicio'
                  ? 'Este reporte toma datos del equipo, del cliente y de la planeacion para reducir recaptura y dejar lista la evidencia tecnica.'
                  : 'Este flujo reduce mensajes sueltos: documenta la llamada, agrega referencia externa si aplica y solo escala a viaje cuando realmente se necesita.'}
              </p>
            </div>
            <button type="button" className="travel-close" onClick={onClose}>
              ×
            </button>
          </header>

          <div className="travel-modal-body">
            {feedback && <div className={`travel-banner ${feedback.tone === 'success' ? 'success' : feedback.tone === 'error' ? 'error' : ''}`}>{feedback.message}</div>}

            <datalist id={`service-report-equipment-${mode}`}>
              {equipmentOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>

            <datalist id={`service-report-diagnostics-${mode}`}>
              {averias.map((item) => (
                <option key={item.cda} value={formatDiagnosticOption(item)}>
                  {item.tipo_averia ? `${item.cda} - ${item.detalle_averia} (${item.tipo_averia})` : formatDiagnosticOption(item)}
                </option>
              ))}
            </datalist>

            <datalist id={`service-report-solutions-${mode}`}>
              {compatibleSolutions.map((item) => (
                <option key={item.cds} value={formatSolutionOption(item)}>
                  {item.tipo_solucion ? `${item.cds} - ${item.detalle_solucion} (${item.tipo_solucion})` : formatSolutionOption(item)}
                </option>
              ))}
            </datalist>

            <div className="travel-form-section">
              <h3>{mode === 'servicio' ? 'Responsable y contexto operativo' : 'Llamada y contexto del caso'}</h3>
              <p>
                {mode === 'servicio'
                  ? 'El objetivo es que la visita quede preparada antes de salir a campo.'
                  : 'Documenta lo minimo necesario para que el soporte remoto quede trazable y escalable.'}
              </p>

              <div className="travel-grid-4 travel-grid-tight">
                <div className="travel-field">
                  <label>Ingeniero</label>
                  <select className="input-field" value={formData.engineerId} onChange={(event) => syncEngineer(event.target.value)}>
                    <option value="">Selecciona ingeniero</option>
                    {engineerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="travel-field">
                  <label>Tipo de servicio</label>
                  <select className="input-field" value={formData.serviceType} onChange={(event) => updateFormField('serviceType', event.target.value as ServiceReportFormData['serviceType'])}>
                    <option value="preventivo">Preventivo</option>
                    <option value="correctivo">Correctivo</option>
                    <option value="instalacion">Instalacion</option>
                    <option value="capacitacion">Capacitacion</option>
                    <option value="emergencia">Emergencia</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>

                <div className="travel-field">
                  <label>{mode === 'servicio' ? 'Fecha de visita' : 'Fecha de llamada'}</label>
                  <input
                    className="input-field"
                    type="date"
                    value={mode === 'servicio' ? formData.serviceDate : formData.callDate}
                    onChange={(event) => updateFormField(mode === 'servicio' ? 'serviceDate' : 'callDate', event.target.value)}
                  />
                </div>

                <div className="travel-field">
                  <label>Folio / referencia</label>
                  <input
                    className="input-field"
                    value={formData.serviceReference}
                    placeholder={resolveServiceReportReference(formData)}
                    onChange={(event) => updateFormField('serviceReference', event.target.value)}
                  />
                </div>

                <div className="travel-field">
                  <label>Numero de serie</label>
                  <input
                    className="input-field"
                    list={`service-report-equipment-${mode}`}
                    value={formData.equipmentSerial}
                    placeholder="Escribe o selecciona numero de serie"
                    onChange={(event) => {
                      updateFormField('equipmentSerial', event.target.value);
                      syncEquipment(event.target.value);
                    }}
                  />
                </div>

                <div className="travel-field">
                  <label>Hora inicio</label>
                  <input className="input-field" type="time" value={formData.startedAt} onChange={(event) => updateFormField('startedAt', event.target.value)} />
                </div>

                <div className="travel-field">
                  <label>Hora fin</label>
                  <input className="input-field" type="time" value={formData.endedAt} onChange={(event) => updateFormField('endedAt', event.target.value)} />
                </div>

                {mode === 'servicio' ? (
                  <div className="travel-field travel-span-4">
                    <label>Dirección</label>
                    <textarea
                      className="input-field service-report-textarea service-report-textarea-small"
                      value={formData.siteAddress}
                      placeholder="Calle, número, colonia, código postal, municipio y estado."
                      onChange={(event) => updateFormField('siteAddress', event.target.value)}
                    />
                  </div>
                ) : (
                  <div className="travel-field travel-span-4">
                    <label>Asunto</label>
                    <input
                      className="input-field"
                      value={formData.subject}
                      placeholder="Asunto de la llamada o solicitud remota."
                      onChange={(event) => updateFormField('subject', event.target.value)}
                    />
                  </div>
                )}
              </div>

              {siteAddressAlert && (
                <div className="service-report-guard-card" role="alert" style={{ marginTop: '1rem' }}>
                  <strong>Dirección operativa incompleta o no confiable</strong>
                  <p>{siteAddressAlert}</p>
                </div>
              )}
            </div>

            {hasSelectedSerial && (
              <div className="travel-form-section">
                <h3>Equipo y cliente vinculados</h3>
                <p>Al seleccionar la serie, el sistema carga el analizador y el cliente relacionado para reducir recaptura.</p>

                <div className="travel-grid-2 travel-grid-tight">
                  <div className="travel-field">
                    <label>Cliente / hospital / laboratorio</label>
                    <input className="input-field" value={formData.clientName} onChange={(event) => updateFormField('clientName', event.target.value)} />
                  </div>

                  <div className="travel-field">
                    <label>Analizador / equipo</label>
                    <input className="input-field" value={formData.equipmentName} onChange={(event) => updateFormField('equipmentName', event.target.value)} />
                  </div>
                </div>

                {(selectedEquipment || selectedUnit || formData.siteContact || formData.sitePhone || formData.siteAddress) && (
                  <div className="travel-meta-row" style={{ marginTop: '1rem' }}>
                    {selectedEquipment?.clientes?.razon_social && <span className="travel-meta-pill">{selectedEquipment.clientes.razon_social}</span>}
                    {selectedEquipment?.modelo && <span className="travel-meta-pill">{selectedEquipment.modelo}</span>}
                    {selectedUnit?.unidad_negocio && <span className="travel-meta-pill">{selectedUnit.unidad_negocio}</span>}
                    {formData.siteContact && <span className="travel-meta-pill">{`Contacto ${formData.siteContact}`}</span>}
                    {formData.sitePhone && <span className="travel-meta-pill">{`Tel. ${formData.sitePhone}`}</span>}
                    {selectedEquipment?.software && <span className="travel-meta-pill">{`SW ${selectedEquipment.software}`}</span>}
                    {selectedEquipment?.firmware && <span className="travel-meta-pill">{`FW ${selectedEquipment.firmware}`}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="travel-form-section">
              <h3>{mode === 'servicio' ? 'Diagnostico, actividades y cierre tecnico' : 'Diagnostico y resolucion remota'}</h3>
              <p>La seleccion debe quedar codificada para analisis posterior y para alimentar datos maestros confiables.</p>

              {mode === 'remoto' ? (
                <div className="travel-grid-4 travel-grid-tight">
                  <div className="travel-field travel-span-2">
                    <label>Codigo de averia</label>
                    <input
                      list={`service-report-diagnostics-${mode}`}
                      className="input-field service-report-diagnostic-search"
                      value={diagnosticLookup}
                      placeholder="Busca por codigo o descripcion"
                      autoComplete="off"
                      onChange={(event) => handleDiagnosticLookupChange(event.target.value)}
                    />
                  </div>

                  <div className="travel-field travel-span-2">
                    <label>Detalle del diagnostico</label>
                    <input className="input-field" value={formData.diagnosticLabel} onChange={(event) => updateFormField('diagnosticLabel', event.target.value)} />
                  </div>

                  <div className="travel-field travel-span-2">
                    <label>Codigo de solucion</label>
                    <input
                      list={`service-report-solutions-${mode}`}
                      className="input-field service-report-diagnostic-search"
                      value={solutionLookup}
                      placeholder="Busca por codigo o descripcion"
                      autoComplete="off"
                      onChange={(event) => handleSolutionLookupChange(event.target.value)}
                    />
                  </div>

                  <div className="travel-field travel-span-2">
                    <label>Detalle de la solucion codificada</label>
                    <input className="input-field" value={formData.solutionLabel} onChange={(event) => updateFormField('solutionLabel', event.target.value)} />
                  </div>

                  <div className="travel-field travel-span-4">
                    <label>Solucion o siguiente accion</label>
                    <textarea
                      className="input-field service-report-textarea service-report-textarea-large"
                      value={formData.solution}
                      onChange={(event) => updateFormField('solution', event.target.value)}
                    />
                  </div>

                  <div className="travel-field travel-span-4">
                    <label>Comentarios del soporte remoto</label>
                    <textarea
                      className="input-field service-report-textarea service-report-textarea-small"
                      value={formData.comments}
                      onChange={(event) => updateFormField('comments', event.target.value)}
                    />
                  </div>
                </div>
              ) : (
                <div className="travel-grid-4 travel-grid-tight">
                  <div className="travel-field">
                    <label>Codigo de averia</label>
                    <input
                      list={`service-report-diagnostics-${mode}`}
                      className="input-field service-report-diagnostic-search"
                      value={diagnosticLookup}
                      placeholder="Busca por codigo o descripcion"
                      autoComplete="off"
                      onChange={(event) => handleDiagnosticLookupChange(event.target.value)}
                    />
                  </div>

                  <div className="travel-field travel-span-3">
                    <label>Detalle del diagnostico</label>
                    <input className="input-field" value={formData.diagnosticLabel} onChange={(event) => updateFormField('diagnosticLabel', event.target.value)} />
                  </div>

                  <div className="travel-field">
                    <label>Codigo de solucion</label>
                    <input
                      list={`service-report-solutions-${mode}`}
                      className="input-field service-report-diagnostic-search"
                      value={solutionLookup}
                      placeholder="Busca por codigo o descripcion"
                      autoComplete="off"
                      onChange={(event) => handleSolutionLookupChange(event.target.value)}
                    />
                  </div>

                  <div className="travel-field travel-span-3">
                    <label>Detalle de la solucion codificada</label>
                    <input className="input-field" value={formData.solutionLabel} onChange={(event) => updateFormField('solutionLabel', event.target.value)} />
                  </div>

                  <div className="travel-field travel-span-2">
                    <label>Hallazgos / trabajo realizado</label>
                    <textarea className="input-field" value={formData.comments} onChange={(event) => updateFormField('comments', event.target.value)} />
                  </div>

                  <div className="travel-field travel-span-2">
                    <label>Resultado / solucion aplicada</label>
                    <textarea className="input-field" value={formData.solution} onChange={(event) => updateFormField('solution', event.target.value)} />
                  </div>
                </div>
              )}

              <div className="travel-chip-row" style={{ marginTop: '1rem' }}>
                <button
                  type="button"
                  className={`travel-chip ${formData.isSoftwareCase ? 'active' : ''}`}
                  onClick={() => updateFormField('isSoftwareCase', !formData.isSoftwareCase)}
                >
                  Relacionado con software / firmware
                </button>
              </div>

              {shouldShowVersionFields && (
                <div style={{ marginTop: '1rem' }}>
                  <div className="travel-grid-3 travel-grid-tight">
                    <div className="travel-field">
                      <label>
                        V. software
                        {mode === 'remoto' && <span className="travel-label-optional"> (opcional)</span>}
                      </label>
                      <input
                        className="input-field"
                        value={formData.softwareVersion}
                        placeholder={formData.baselineSoftwareVersion ? `Historial: ${formData.baselineSoftwareVersion}` : 'Captura la versión observada'}
                        onChange={(event) => updateFormField('softwareVersion', event.target.value)}
                      />
                      {formData.baselineSoftwareVersion.trim() && (
                        <div className="service-report-inline-note">
                          Historial previo: <strong>{formData.baselineSoftwareVersion}</strong>
                        </div>
                      )}
                    </div>
                    <div className="travel-field">
                      <label>
                        V. firmware
                        {mode === 'remoto' && <span className="travel-label-optional"> (opcional)</span>}
                      </label>
                      <input
                        className="input-field"
                        value={formData.firmwareVersion}
                        placeholder={formData.baselineFirmwareVersion ? `Historial: ${formData.baselineFirmwareVersion}` : 'Captura la versión observada'}
                        onChange={(event) => updateFormField('firmwareVersion', event.target.value)}
                      />
                      {formData.baselineFirmwareVersion.trim() && (
                        <div className="service-report-inline-note">
                          Historial previo: <strong>{formData.baselineFirmwareVersion}</strong>
                        </div>
                      )}
                    </div>
                    <div className="travel-field">
                      <label>
                        V. software servicio
                        {mode === 'remoto' && <span className="travel-label-optional"> (opcional)</span>}
                      </label>
                      <input
                        className="input-field"
                        value={formData.serviceSoftwareVersion}
                        placeholder="Captura la versión del software de servicio utilizada"
                        onChange={(event) => updateFormField('serviceSoftwareVersion', event.target.value)}
                      />
                    </div>
                  </div>

                  {versionGuard.hasAlert && (
                    <div className="service-report-guard-card" role="alert">
                      <strong>Barrera de trazabilidad de versiones activada</strong>
                      <p>
                        Se detectó una discrepancia contra el historial del equipo o un valor no confiable. Este evento
                        quedará registrado y se preparará una notificación para {adminRecipientsLabel}.
                      </p>
                      <ul>
                        {versionGuard.items.map((item) => (
                          <li key={`${item.field}-${item.issueCode}`}>{item.message}</li>
                        ))}
                      </ul>
                      <div className="travel-field" style={{ marginTop: '0.95rem' }}>
                        <label>Explicación obligatoria de la discrepancia</label>
                        <textarea
                          className="input-field service-report-textarea service-report-textarea-small"
                          value={formData.versionDiscrepancyExplanation}
                          placeholder="Explica por qué la versión no coincide, por qué cambió o por qué no fue posible capturarla con evidencia técnica."
                          onChange={(event) => updateFormField('versionDiscrepancyExplanation', event.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {mode === 'servicio' && (
              <div className="travel-form-section">
                <h3>Reactivos y refacciones utilizadas</h3>
                <p>
                  Escanea el DataMatrix GS1 del empaque BioSystems para capturar REF, GTIN, lote y caducidad. No es
                  obligatorio para cerrar el reporte, pero deja una trazabilidad muy superior para consumos, tendencias
                  y control de material en campo.
                </p>

                {meaningfulMaterialItems.length > 0 && (
                  <div className="travel-meta-row" style={{ marginTop: '1rem' }}>
                    <span className="travel-meta-pill">{`${meaningfulMaterialItems.length} insumo(s)`}</span>
                    <span className="travel-meta-pill">
                      {`${meaningfulMaterialItems.filter((item) => item.catalogMatched).length} reconocido(s) por catalogo`}
                    </span>
                    <span className="travel-meta-pill">
                      {`${meaningfulMaterialItems.filter((item) => resolveMaterialExpirationState(item.expiresOn) === 'caducado').length} caducado(s)`}
                    </span>
                  </div>
                )}

                <div className="service-report-material-list">
                  {formData.materialsUsed.map((item, index) => {
                    const expirationState = resolveMaterialExpirationState(item.expiresOn);
                    const hasContent = isMeaningfulServiceReportMaterialItem(item);
                    const isLastItem = index === formData.materialsUsed.length - 1;
                    return (
                      <article key={item.id} className="service-report-material-card">
                        <div className="service-report-material-card__header">
                            <div>
                              <strong>{item.productName || (item.referenceCode ? `REF ${item.referenceCode}` : 'Nuevo insumo')}</strong>
                              {hasContent && (
                                <div className="travel-meta-row" style={{ marginTop: '0.6rem' }}>
                                {item.referenceCode && <span className="travel-meta-pill">{`REF ${item.referenceCode}`}</span>}
                                {item.lotNumber && <span className="travel-meta-pill">{`Lote ${item.lotNumber}`}</span>}
                                {item.gtin && <span className="travel-meta-pill">{`GTIN ${item.gtin}`}</span>}
                                {item.expiresOn && (
                                  <span className={`travel-meta-pill service-report-material-pill-${expirationState}`}>
                                    {`${formatMaterialExpirationLabel(expirationState)} · ${item.expiresOn}`}
                                  </span>
                                )}
                                {item.catalogMatched && <span className="travel-meta-pill">Catalogado</span>}
                                {typeof item.priceMxn === 'number' && (
                                  <span className="travel-meta-pill">{`Lista ${mxnFormatter.format(item.priceMxn)}`}</span>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="service-report-material-card__actions">
                            <button
                              type="button"
                              className="button-primary inactive service-report-material-camera-button"
                              onClick={() => openMaterialScanner(item.id)}
                              aria-label="Escanear codigo BioSystems"
                              title="Escanear codigo BioSystems"
                            >
                              <span aria-hidden="true">📷</span>
                            </button>
                            {isLastItem && (
                              <button type="button" className="button-primary inactive" onClick={addManualMaterial}>
                                Agregar otro
                              </button>
                            )}
                            <button
                              type="button"
                              className="button-primary inactive service-report-material-remove"
                              onClick={() => removeMaterialItem(item.id)}
                            >
                              Quitar
                            </button>
                          </div>
                        </div>

                        <div className="travel-grid-4 travel-grid-tight">
                          <div className="travel-field travel-span-2">
                            <label>Producto / insumo</label>
                            <input
                              className="input-field"
                              value={item.productName}
                              onChange={(event) => updateMaterialItem(item.id, 'productName', event.target.value)}
                            />
                          </div>

                          <div className="travel-field">
                            <label>Tipo</label>
                            <select
                              className="input-field"
                              value={item.kind}
                              onChange={(event) => updateMaterialItem(item.id, 'kind', event.target.value as ServiceReportMaterialItem['kind'])}
                            >
                              <option value="reactivo">Reactivo</option>
                              <option value="refaccion">Refaccion</option>
                              <option value="consumible">Consumible</option>
                              <option value="control">Control</option>
                              <option value="calibrador">Calibrador</option>
                              <option value="otro">Otro</option>
                            </select>
                          </div>

                          <div className="travel-field">
                            <label>Cantidad</label>
                            <input
                              className="input-field"
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(event) => updateMaterialItem(item.id, 'quantity', Math.max(1, Number(event.target.value) || 1))}
                            />
                          </div>

                          <div className="travel-field">
                            <label>REF</label>
                            <input
                              className="input-field"
                              value={item.referenceCode}
                              onChange={(event) => updateMaterialItem(item.id, 'referenceCode', event.target.value)}
                              onBlur={() => {
                                void hydrateMaterialItemFromReference(item.id);
                              }}
                            />
                          </div>

                          <div className="travel-field">
                            <label>Lote</label>
                            <input
                              className="input-field"
                              value={item.lotNumber}
                              onChange={(event) => updateMaterialItem(item.id, 'lotNumber', event.target.value)}
                            />
                          </div>

                          <div className="travel-field">
                            <label>Caducidad</label>
                            <input
                              className="input-field"
                              type="date"
                              value={item.expiresOn}
                              onChange={(event) => updateMaterialItem(item.id, 'expiresOn', event.target.value)}
                            />
                          </div>

                          <div className="travel-field">
                            <label>Metodo</label>
                            <input className="input-field" value={item.scanMethod} readOnly />
                          </div>

                          <div className="travel-field travel-span-4">
                            <label>Notas del uso</label>
                            <textarea
                              className="input-field travel-compact-textarea"
                              value={item.notes}
                              placeholder="Ejemplo: usado para cambio preventivo, control de reactivo en sitio o material consumido durante la visita."
                              onChange={(event) => updateMaterialItem(item.id, 'notes', event.target.value)}
                            />
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            )}

            {shouldShowEscalationSection && (
              <div className="travel-form-section">
                <h3>Escalamiento a visita</h3>
                <p>El caso ya se considera visita. Define si requiere vuelo o renta y deja lista la continuidad.</p>

                <div className="travel-chip-row">
                  <button
                    type="button"
                    className={`travel-chip ${formData.requiresFlight ? 'active' : ''}`}
                    onClick={() => updateFormField('requiresFlight', !formData.requiresFlight)}
                  >
                    Requiere vuelo
                  </button>
                  <button
                    type="button"
                    className={`travel-chip ${formData.requiresCar ? 'active' : ''}`}
                    onClick={() => updateFormField('requiresCar', !formData.requiresCar)}
                  >
                    Requiere renta automovil
                  </button>
                </div>

                <div className="travel-grid-2 travel-grid-tight" style={{ marginTop: '1rem' }}>
                  <div className="travel-field">
                    <label>Viaje</label>
                    <select className="input-field" value={formData.tripType} onChange={(event) => updateFormField('tripType', event.target.value as ServiceReportFormData['tripType'])}>
                      <option value="redondo">Redondo</option>
                      <option value="solo_ida">Solo ida</option>
                    </select>
                  </div>

                  <div className="travel-field">
                    <label>Referencia de reporte</label>
                    <input className="input-field" value={resolveServiceReportReference(formData)} readOnly />
                  </div>
                </div>
              </div>
            )}

            {formData.specialClientCode && (
              <div className="travel-form-section">
                <h3>{`Formato especial ${formData.specialClientCode.toUpperCase()}`}</h3>
                <p>Este cliente requiere una referencia externa y datos operativos mas estructurados.</p>

                <div className="travel-grid-4 travel-grid-tight">
                  <div className="travel-field">
                    <label>{specialReferenceLabel}</label>
                    <input className="input-field" value={formData.specialReferenceValue} onChange={(event) => updateFormField('specialReferenceValue', event.target.value)} />
                  </div>

                  <div className="travel-field">
                    <label>Usuario</label>
                    <input className="input-field" value={formData.specialUserName} onChange={(event) => updateFormField('specialUserName', event.target.value)} />
                  </div>

                  <div className="travel-field">
                    <label>Unidad medica / negocio</label>
                    <input className="input-field" value={formData.businessUnitName} onChange={(event) => updateFormField('businessUnitName', event.target.value)} />
                  </div>

                  <div className="travel-field">
                    <label>Analizador</label>
                    <input className="input-field" value={formData.equipmentName} onChange={(event) => updateFormField('equipmentName', event.target.value)} />
                  </div>

                  <div className="travel-field travel-span-4">
                    <label>Adjuntar captura del ticket</label>
                    <label className="service-report-upload-card">
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        disabled={ocrBusy}
                        onChange={(event) => setAttachmentFile(event.target.files?.[0] || null)}
                      />
                      <div>
                        <strong>{attachmentFile?.name || formData.attachmentFilename || 'Selecciona una imagen o PDF'}</strong>
                        <span>
                          La captura se guarda como evidencia del caso. Los campos siguen siendo editables para validar la informacion antes de usarla.
                        </span>
                      </div>
                    </label>
                    <div className="service-report-ocr-actions">
                      <button
                        type="button"
                        className="button-primary inactive"
                        onClick={handleExtractAttachment}
                        disabled={ocrBusy}
                      >
                        {ocrBusy ? `Extrayendo ${Math.round(ocrProgress * 100)}%` : 'Extraer datos del adjunto'}
                      </button>
                      <span>
                        {ocrBusy
                          ? ocrStatus || 'Leyendo texto desde la imagen'
                          : 'Usa este apoyo cuando el ticket llegue como captura. Si la lectura falla, el llenado manual sigue disponible.'}
                      </span>
                    </div>
                    {(attachmentPreviewUrl || formData.attachmentPath) && (
                      <div className="service-report-upload-preview">
                        {attachmentPreviewUrl ? (
                          <img src={attachmentPreviewUrl} alt="Vista previa del adjunto" />
                        ) : (
                          <a
                            href={storedAttachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir adjunto guardado
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {mode === 'servicio' && (
              <div className="travel-form-section">
                <h3>Comentarios del cliente</h3>
                <p>Este espacio queda visible en el PDF final para observaciones, conformidad o notas del responsable del sitio.</p>

                <div className="travel-field">
                  <label>Comentarios del cliente</label>
                  <textarea
                    className="input-field service-report-textarea service-report-textarea-small"
                    value={formData.clientComments}
                    placeholder="Ejemplo: equipo recibido conforme, pruebas aceptadas, pendiente seguimiento o cualquier comentario adicional del cliente."
                    onChange={(event) => updateFormField('clientComments', event.target.value)}
                  />
                </div>
              </div>
            )}

            {mode === 'servicio' && (
              <div className="travel-form-section">
                <h3>Firmas regulatorias obligatorias *</h3>
                <p>
                  Estas firmas forman parte de la evidencia regulatoria de la visita. Se conservan en el borrador y
                  ambas son obligatorias antes de registrar el reporte final.
                </p>
                <div className="service-report-signature-grid">
                  <div className="service-report-signature-card">
                    <strong>Firma del ingeniero responsable *</strong>
                    <span>Confirma la ejecucion tecnica y la informacion asentada en el reporte.</span>
                    <SignaturePad
                      value={formData.signatureDataUrl}
                      onChange={(value) => updateFormField('signatureDataUrl', value)}
                    />
                  </div>
                  <div className="service-report-signature-card">
                    <strong>Firma del cliente / responsable del sitio *</strong>
                    <span>Deja constancia de recepcion, validacion de la visita y conformidad del levantamiento.</span>
                    <SignaturePad
                      value={formData.clientSignatureDataUrl}
                      onChange={(value) => updateFormField('clientSignatureDataUrl', value)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="travel-actions">
            <div className="travel-actions-group">
              <button type="button" className="button-primary inactive" onClick={onClose}>
                Cerrar
              </button>
              {mode === 'remoto' && (
                <button
                  type="button"
                  className="button-primary inactive"
                  onClick={shouldShowEscalationSection ? hideEscalationSection : openEscalationSection}
                >
                  {shouldShowEscalationSection ? 'Ocultar visita' : 'Escalar visita'}
                </button>
              )}
              {mode === 'servicio' && (
                <button type="button" className="button-primary inactive" onClick={handleSaveDraft} disabled={busy}>
                  Guardar borrador
                </button>
              )}
            </div>

            <div className="travel-actions-group">
              {mode === 'servicio' && (
                <>
                  <button type="button" className="button-primary inactive" onClick={handlePlanTravel} disabled={busy}>
                    Planear viaje
                  </button>
                  <button type="button" className="button-primary" onClick={handleSubmit} disabled={busy}>
                    {busy ? 'Guardando...' : 'Registrar reporte'}
                  </button>
                </>
              )}

              {mode === 'remoto' && (
                <>
                  {formData.requiresTravelPlanning && (
                    <button type="button" className="button-primary inactive" onClick={handlePlanTravel} disabled={busy}>
                      Registrar y planear cita
                    </button>
                  )}
                  <button type="button" className="button-primary" onClick={handleSubmit} disabled={busy}>
                    {busy ? 'Guardando...' : 'Registrar reporte remoto'}
                  </button>
                </>
              )}
            </div>
          </footer>

          {modalAlert && (
            <div className="travel-alert-overlay" onClick={() => setModalAlert(null)}>
              <div className={`travel-alert-card ${modalAlert.tone}`} onClick={(event) => event.stopPropagation()}>
                <div className="travel-alert-kicker">
                  {modalAlert.tone === 'error' ? 'Atencion' : modalAlert.tone === 'success' ? 'Completado' : 'Aviso'}
                </div>
                <h3>{modalAlert.title}</h3>
                <div className="travel-alert-messages">
                  {modalAlert.messages.map((message) => (
                    <div key={message}>• {message}</div>
                  ))}
                </div>
                <button type="button" className="travel-alert-close" onClick={() => setModalAlert(null)}>
                  Continuar
                </button>
              </div>
            </div>
          )}

          <Gs1ScannerModal
            isOpen={gs1ScannerOpen}
            onClose={() => {
              setGs1ScannerOpen(false);
              setMaterialScanTargetId(null);
            }}
            onDetected={(item) => {
              setGs1ScannerOpen(false);
              appendScannedMaterial(item);
            }}
          />
        </section>
      </div>
    </div>,
    document.body,
  );
}
