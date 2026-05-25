import { createPortal } from 'react-dom';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { refaccionesImageManifest, type RefaccionImageEntry } from '../data/refaccionesImageManifest';
import type { EquipmentSummary, ProfileSummary } from './servicesPlanning';
import {
  getSparePartsRequestEmailDisabledMessage,
  isSparePartsRequestEmailEnabled,
  sendSparePartRequestEmail,
} from './sparePartsEmailApi';
import './Refacciones.css';

type RequestPriority = 'baja' | 'media' | 'alta' | 'critica';
type DestinationMode = 'sitio' | 'ingeniero' | 'almacen';
type AlertTone = 'error' | 'success' | 'info';

interface SparePartCatalogEntry {
  codigo_refaccion: string;
  equipo?: string | null;
  nombre?: string | null;
  desc_breve?: string | null;
  pagina_manual?: string | number | null;
  descripcion?: string | null;
}

interface SparePartRequestLine {
  id: string;
  code: string;
  description: string;
  quantity: number;
  equipmentFamily: string;
  notes: string;
  imageUrl: string;
  imageLabel: string;
  pageManual: string;
  source: 'catalogo' | 'manual';
}

interface ManualLineDraft {
  code: string;
  description: string;
  equipmentFamily: string;
  quantity: number;
}

interface SparePartRequestRow {
  id: string;
  user_id: string | null;
  engineer_name?: string | null;
  employee_number?: string | null;
  ticket_reference?: string | null;
  equipo_id?: string | null;
  equipo_serie?: string | null;
  equipo_modelo?: string | null;
  cliente_id?: number | null;
  cliente_nombre?: string | null;
  contacto_sitio?: string | null;
  telefono_contacto?: string | null;
  direccion_sitio?: string | null;
  ciudad_destino?: string | null;
  estado_destino?: string | null;
  prioridad?: string | null;
  requerida_para?: string | null;
  motivo_solicitud?: string | null;
  observaciones?: string | null;
  destino_entrega?: string | null;
  destino_entrega_detalle?: string | null;
  nombre_pieza?: string | null;
  cantidad?: number | null;
  estado_solicitud?: string | null;
  fecha_solicitud?: string | null;
  email_enviado_en?: string | null;
  lineas_solicitud?: unknown;
  snapshot_solicitud?: unknown;
}

interface SparePartAlert {
  tone: AlertTone;
  title: string;
  messages: string[];
}

interface FormState {
  ticketReference: string;
  equipmentSerial: string;
  equipmentModel: string;
  clientName: string;
  clientContact: string;
  clientPhone: string;
  siteAddress: string;
  destinationCity: string;
  destinationState: string;
  neededByDate: string;
  priority: RequestPriority;
  reason: string;
  observations: string;
  destinationMode: DestinationMode;
  destinationDetail: string;
}

const PRIORITY_OPTIONS: Array<{ value: RequestPriority; label: string; helper: string }> = [
  { value: 'critica', label: 'Crítica', helper: 'Equipo detenido o riesgo directo de incumplimiento.' },
  { value: 'alta', label: 'Alta', helper: 'Servicio comprometido en corto plazo.' },
  { value: 'media', label: 'Media', helper: 'Reposición operativa normal con fecha objetivo.' },
  { value: 'baja', label: 'Baja', helper: 'Reabasto preventivo o stock de seguridad.' },
];

const DESTINATION_OPTIONS: Array<{ value: DestinationMode; label: string; helper: string }> = [
  { value: 'sitio', label: 'Entregar en sitio', helper: 'Pensado para servicio en campo o atención programada.' },
  { value: 'ingeniero', label: 'Entregar al ingeniero', helper: 'Entrega directa al responsable técnico.' },
  { value: 'almacen', label: 'Entregar en almacén', helper: 'Reabasto central o resguardo previo.' },
];

const PRIORITY_BADGE_LABELS: Record<RequestPriority, string> = {
  critica: 'Crítica',
  alta: 'Alta',
  media: 'Media',
  baja: 'Baja',
};

const DESTINATION_BADGE_LABELS: Record<DestinationMode, string> = {
  sitio: 'Entregar en sitio',
  ingeniero: 'Entregar al ingeniero',
  almacen: 'Entregar en almacén',
};

const todayIso = () => new Date().toISOString().slice(0, 10);
const BASE_URL = import.meta.env.BASE_URL || '/';
const EQUIPMENT_SELECT_BASE =
  'id, numero_serie, modelo, pais, estado, ciudad, colonia, direccion, codigo_postal, clientes(id, razon_social, persona_contacto, telefono)';
const EQUIPMENT_SELECT_WITH_MUNICIPIO =
  'id, numero_serie, modelo, pais, estado, ciudad, municipio, colonia, direccion, codigo_postal, clientes(id, razon_social, persona_contacto, telefono)';

const normalizeText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();

const createEmptyForm = (): FormState => ({
  ticketReference: '',
  equipmentSerial: '',
  equipmentModel: '',
  clientName: '',
  clientContact: '',
  clientPhone: '',
  siteAddress: '',
  destinationCity: '',
  destinationState: '',
  neededByDate: todayIso(),
  priority: 'media',
  reason: '',
  observations: '',
  destinationMode: 'sitio',
  destinationDetail: '',
});

const buildEquipmentAddress = (equipment?: EquipmentSummary) =>
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

const resolveAssetUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }

  return `${BASE_URL}${trimmed.replace(/^\/+/, '')}`;
};

const buildCatalogDescription = (entry: SparePartCatalogEntry, imageEntry?: RefaccionImageEntry) =>
  entry.descripcion?.trim() ||
  [entry.nombre, entry.desc_breve]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' · ') ||
  imageEntry?.inferredDescription?.trim() ||
  'Pendiente de cruce con Spare Parts';

const buildCatalogFamily = (entry: SparePartCatalogEntry, imageEntry?: RefaccionImageEntry) =>
  entry.equipo?.trim() ||
  imageEntry?.inferredDescription
    ?.split(' - ')
    .slice(0, -1)
    .join(' - ')
    .trim() ||
  'Sin familia';

const resolveImageEntry = (code: string) => refaccionesImageManifest[code.trim().toUpperCase()] as RefaccionImageEntry | undefined;

const fetchSparePartsEquipments = async () => {
  const preferredResponse = await supabase.from('equipos').select(EQUIPMENT_SELECT_WITH_MUNICIPIO);

  if (!preferredResponse.error) {
    return preferredResponse;
  }

  const missingMunicipio =
    /column .*municipio does not exist/i.test(preferredResponse.error.message) ||
    /equipos\.municipio/i.test(preferredResponse.error.message);

  if (!missingMunicipio) {
    return preferredResponse;
  }

  return supabase.from('equipos').select(EQUIPMENT_SELECT_BASE);
};

const getRequestLines = (request: SparePartRequestRow): SparePartRequestLine[] => {
  if (Array.isArray(request.lineas_solicitud)) {
    return request.lineas_solicitud
      .map((raw, index) => {
        if (!raw || typeof raw !== 'object') {
          return null;
        }

        const line = raw as Record<string, unknown>;
        return {
          id: `${request.id}-${index}`,
          code: String(line.code || ''),
          description: String(line.description || ''),
          quantity: Number(line.quantity) || 1,
          equipmentFamily: String(line.equipmentFamily || ''),
          notes: String(line.notes || ''),
          imageUrl: String(line.imageUrl || ''),
          imageLabel: String(line.imageLabel || ''),
          pageManual: String(line.pageManual || ''),
          source: String(line.source || 'manual') === 'catalogo' ? 'catalogo' : 'manual',
        } satisfies SparePartRequestLine;
      })
      .filter((line): line is SparePartRequestLine => {
        if (!line) {
          return false;
        }

        return Boolean(line.description || line.code);
      });
  }

  if (request.nombre_pieza) {
    return [
      {
        id: `${request.id}-legacy`,
        code: '',
        description: request.nombre_pieza,
        quantity: Number(request.cantidad) || 1,
        equipmentFamily: request.equipo_modelo || '',
        notes: '',
        imageUrl: '',
        imageLabel: '',
        pageManual: '',
        source: 'manual',
      },
    ];
  }

  return [];
};

const getStatusLabel = (status: string | null | undefined) => {
  const normalized = normalizeText(status);
  if (normalized === 'APROBADA') return 'Aprobada';
  if (normalized === 'RECHAZADA') return 'Rechazada';
  if (normalized === 'ENTREGADA') return 'Entregada';
  return 'Pendiente';
};

const getStatusTone = (status: string | null | undefined) => {
  const normalized = normalizeText(status);
  if (normalized === 'APROBADA') return 'approved';
  if (normalized === 'RECHAZADA') return 'rejected';
  if (normalized === 'ENTREGADA') return 'delivered';
  return 'pending';
};

const formatDateLabel = (value: string | null | undefined) => {
  if (!value) {
    return 'Sin fecha';
  }

  const [year, month, day] = value.slice(0, 10).split('-');
  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
};

const buildSearchScore = (
  entry: SparePartCatalogEntry,
  query: string,
  imageEntry?: RefaccionImageEntry,
) => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) {
    return 0;
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const code = normalizeText(entry.codigo_refaccion);
  const equipment = normalizeText(entry.equipo);
  const name = normalizeText(entry.nombre);
  const shortDescription = normalizeText(entry.desc_breve);
  const description = normalizeText(entry.descripcion);
  const imageDescription = normalizeText(imageEntry?.inferredDescription);

  let score = 0;

  if (code === normalizedQuery) score += 180;
  if (code.startsWith(normalizedQuery)) score += 120;
  if (code.includes(normalizedQuery)) score += 90;
  if (equipment.includes(normalizedQuery)) score += 75;
  if (name.includes(normalizedQuery)) score += 70;
  if (shortDescription.includes(normalizedQuery)) score += 60;
  if (description.includes(normalizedQuery)) score += 55;
  if (imageDescription.includes(normalizedQuery)) score += 40;

  score += tokens.reduce((acc, token) => {
    let tokenScore = 0;
    if (code.includes(token)) tokenScore += 20;
    if (equipment.includes(token)) tokenScore += 14;
    if (name.includes(token)) tokenScore += 12;
    if (shortDescription.includes(token) || description.includes(token)) tokenScore += 10;
    if (imageDescription.includes(token)) tokenScore += 6;
    return acc + tokenScore;
  }, 0);

  return score;
};

export default function Refacciones() {
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [requests, setRequests] = useState<SparePartRequestRow[]>([]);
  const [catalog, setCatalog] = useState<SparePartCatalogEntry[]>([]);
  const [equipments, setEquipments] = useState<EquipmentSummary[]>([]);
  const [form, setForm] = useState<FormState>(createEmptyForm);
  const [lines, setLines] = useState<SparePartRequestLine[]>([]);
  const [manualLine, setManualLine] = useState<ManualLineDraft>({
    code: '',
    description: '',
    equipmentFamily: '',
    quantity: 1,
  });
  const [catalogSearch, setCatalogSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [activeCatalogCode, setActiveCatalogCode] = useState('');
  const [activePreviewVariant, setActivePreviewVariant] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submittingMode, setSubmittingMode] = useState<'save' | 'notify' | null>(null);
  const [modalAlert, setModalAlert] = useState<SparePartAlert | null>(null);

  const deferredCatalogSearch = useDeferredValue(catalogSearch.trim());
  const normalizedHistorySearch = normalizeText(historySearch);
  const emailEnabled = isSparePartsRequestEmailEnabled();

  const selectedEquipment = useMemo(() => {
    const serial = normalizeText(form.equipmentSerial);
    if (!serial) {
      return undefined;
    }

    return equipments.find((equipment) => normalizeText(equipment.numero_serie) === serial);
  }, [equipments, form.equipmentSerial]);

  const matchingEquipmentSuggestions = useMemo(() => {
    const serial = normalizeText(form.equipmentSerial);
    if (!serial || selectedEquipment) {
      return [];
    }

    return equipments
      .filter((equipment) => {
        const equipmentSerial = normalizeText(equipment.numero_serie);
        const clientName = normalizeText(equipment.clientes?.razon_social);
        const model = normalizeText(equipment.modelo);
        return equipmentSerial.includes(serial) || clientName.includes(serial) || model.includes(serial);
      })
      .slice(0, 5);
  }, [equipments, form.equipmentSerial, selectedEquipment]);

  const quickSuggestions = useMemo(() => {
    const equipmentHint = normalizeText(selectedEquipment?.modelo || form.equipmentModel);
    const fromEquipment =
      equipmentHint
        ? catalog.filter((entry) => normalizeText(entry.equipo).includes(equipmentHint)).slice(0, 6)
        : [];

    if (fromEquipment.length > 0) {
      return fromEquipment;
    }

    const frequency = new Map<string, number>();
    requests.forEach((request) => {
      getRequestLines(request).forEach((line) => {
        if (line.code) {
          frequency.set(line.code, (frequency.get(line.code) || 0) + line.quantity);
        }
      });
    });

    return [...catalog]
      .sort((left, right) => (frequency.get(right.codigo_refaccion) || 0) - (frequency.get(left.codigo_refaccion) || 0))
      .slice(0, 6);
  }, [catalog, requests, selectedEquipment?.modelo, form.equipmentModel]);

  const catalogResults = useMemo(() => {
    const equipmentHint = normalizeText(selectedEquipment?.modelo || form.equipmentModel);
    const baseResults = [...catalog];

    if (!deferredCatalogSearch) {
      return baseResults
        .filter((entry) => !equipmentHint || normalizeText(entry.equipo).includes(equipmentHint))
        .slice(0, 12);
    }

    return baseResults
      .map((entry) => ({
        entry,
        score: buildSearchScore(entry, deferredCatalogSearch, resolveImageEntry(entry.codigo_refaccion)),
      }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 12)
      .map((item) => item.entry);
  }, [catalog, deferredCatalogSearch, form.equipmentModel, selectedEquipment?.modelo]);

  const activeCatalogEntry = useMemo(
    () => catalogResults.find((entry) => entry.codigo_refaccion === activeCatalogCode) || catalogResults[0],
    [activeCatalogCode, catalogResults],
  );

  const activeImageEntry = useMemo(
    () => (activeCatalogEntry ? resolveImageEntry(activeCatalogEntry.codigo_refaccion) : undefined),
    [activeCatalogEntry],
  );

  const activeImageVariant =
    activeImageEntry?.variants[Math.min(activePreviewVariant, Math.max(0, (activeImageEntry?.variants.length || 1) - 1))] ||
    activeImageEntry?.variants[0];

  const visibleRequests = useMemo(() => {
    if (!normalizedHistorySearch) {
      return requests;
    }

    return requests.filter((request) => {
      const haystack = normalizeText(
        [
          request.ticket_reference,
          request.equipo_serie,
          request.cliente_nombre,
          request.engineer_name,
          getRequestLines(request)
            .map((line) => `${line.code} ${line.description}`)
            .join(' '),
        ].join(' '),
      );

      return haystack.includes(normalizedHistorySearch);
    });
  }, [normalizedHistorySearch, requests]);

  useEffect(() => {
    if (!modalAlert) {
      return undefined;
    }

    const duration = Math.min(9200, 3200 + Math.max(0, modalAlert.messages.length - 1) * 1500);
    const timer = window.setTimeout(() => setModalAlert(null), duration);
    return () => window.clearTimeout(timer);
  }, [modalAlert]);

  useEffect(() => {
    if (!activeCatalogEntry) {
      setActivePreviewVariant(0);
      return;
    }

    setActiveCatalogCode(activeCatalogEntry.codigo_refaccion);
    setActivePreviewVariant(0);
  }, [activeCatalogEntry?.codigo_refaccion]);

  useEffect(() => {
    if (!selectedEquipment) {
      return;
    }

    setForm((current) => ({
      ...current,
      equipmentModel: current.equipmentModel || selectedEquipment.modelo || '',
      clientName: current.clientName || selectedEquipment.clientes?.razon_social || '',
      clientContact: current.clientContact || selectedEquipment.clientes?.persona_contacto || '',
      clientPhone: current.clientPhone || selectedEquipment.clientes?.telefono || '',
      siteAddress: current.siteAddress || buildEquipmentAddress(selectedEquipment),
      destinationCity: current.destinationCity || selectedEquipment.ciudad || '',
      destinationState: current.destinationState || selectedEquipment.estado || '',
    }));
  }, [selectedEquipment]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setLoading(false);
          setModalAlert({
            tone: 'error',
            title: 'Sesión no disponible',
            messages: ['Vuelve a iniciar sesión para registrar solicitudes de refacciones.'],
          });
        }
        return;
      }

      const [profileResponse, requestsResponse, catalogResponse, equipmentsResponse] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, nombre_completo, employee_number, telefono, territorio, rol, recibe_tickets')
          .eq('id', user.id)
          .maybeSingle(),
        supabase.from('refacciones_solicitudes').select('*').order('fecha_solicitud', { ascending: false }).limit(60),
        supabase.from('refacciones_catalogo').select('*').order('codigo_refaccion', { ascending: true }),
        fetchSparePartsEquipments(),
      ]);

      if (cancelled) {
        return;
      }

      if (profileResponse.data) {
        setProfile(profileResponse.data as ProfileSummary);
      } else {
        setProfile({
          id: user.id,
          nombre_completo: user.email || 'Ingeniero',
          employee_number: '',
          telefono: '',
          rol: 'tecnico',
        });
      }

      if (requestsResponse.data) {
        setRequests(requestsResponse.data as SparePartRequestRow[]);
      }

      if (catalogResponse.data) {
        setCatalog(catalogResponse.data as SparePartCatalogEntry[]);
      }

      if (equipmentsResponse.data) {
        setEquipments(equipmentsResponse.data as EquipmentSummary[]);
      }

      const errors = [
        profileResponse.error?.message,
        requestsResponse.error?.message,
        catalogResponse.error?.message,
        equipmentsResponse.error?.message,
      ].filter(Boolean);

      if (errors.length > 0) {
        setModalAlert({
          tone: 'error',
          title: 'Carga parcial del módulo',
          messages: errors as string[],
        });
      }

      setLoading(false);
    };

    void fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  const setFormField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const hydrateFromEquipment = (equipment: EquipmentSummary) => {
    setForm((current) => ({
      ...current,
      equipmentSerial: equipment.numero_serie,
      equipmentModel: equipment.modelo || '',
      clientName: equipment.clientes?.razon_social || current.clientName,
      clientContact: equipment.clientes?.persona_contacto || current.clientContact,
      clientPhone: equipment.clientes?.telefono || current.clientPhone,
      siteAddress: buildEquipmentAddress(equipment) || current.siteAddress,
      destinationCity: equipment.ciudad || current.destinationCity,
      destinationState: equipment.estado || current.destinationState,
      destinationDetail:
        current.destinationMode === 'sitio' && !current.destinationDetail
          ? equipment.clientes?.razon_social || equipment.ciudad || ''
          : current.destinationDetail,
    }));
  };

  const addCatalogLine = (entry: SparePartCatalogEntry) => {
    const imageEntry = resolveImageEntry(entry.codigo_refaccion);
    const primaryVariant = imageEntry?.variants[0];
    const existingIndex = lines.findIndex((line) => normalizeText(line.code) === normalizeText(entry.codigo_refaccion));

    if (existingIndex >= 0) {
      setLines((current) =>
        current.map((line, index) =>
          index === existingIndex ? { ...line, quantity: Math.max(1, line.quantity + 1) } : line,
        ),
      );
      return;
    }

    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        code: entry.codigo_refaccion,
        description: buildCatalogDescription(entry, imageEntry),
        quantity: 1,
        equipmentFamily: buildCatalogFamily(entry, imageEntry),
        notes: '',
        imageUrl: primaryVariant?.url || '',
        imageLabel: primaryVariant?.label || imageEntry?.inferredDescription || '',
        pageManual: String(entry.pagina_manual || ''),
        source: 'catalogo',
      },
    ]);
  };

  const addManualLine = () => {
    if (!manualLine.description.trim()) {
      setModalAlert({
        tone: 'error',
        title: 'Partida manual incompleta',
        messages: ['Captura al menos una descripción clara para la refacción o consumible requerido.'],
      });
      return;
    }

    setLines((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        code: manualLine.code.trim(),
        description: manualLine.description.trim(),
        quantity: Math.max(1, Number(manualLine.quantity) || 1),
        equipmentFamily: manualLine.equipmentFamily.trim(),
        notes: '',
        imageUrl: '',
        imageLabel: '',
        pageManual: '',
        source: 'manual',
      },
    ]);

    setManualLine({
      code: '',
      description: '',
      equipmentFamily: manualLine.equipmentFamily || form.equipmentModel,
      quantity: 1,
    });
  };

  const updateLine = (lineId: string, updates: Partial<SparePartRequestLine>) => {
    setLines((current) => current.map((line) => (line.id === lineId ? { ...line, ...updates } : line)));
  };

  const removeLine = (lineId: string) => {
    setLines((current) => current.filter((line) => line.id !== lineId));
  };

  const validateRequest = () => {
    const issues: string[] = [];

    if (!profile?.nombre_completo?.trim()) {
      issues.push('No se encontró el perfil del ingeniero con sesión activa.');
    }

    if (!form.ticketReference.trim() && !form.equipmentSerial.trim()) {
      issues.push('Captura al menos ticket/folio o número de serie para que administración ubique el caso.');
    }

    if (!form.neededByDate) {
      issues.push('Define la fecha en la que la refacción debe estar disponible.');
    }

    if (!form.reason.trim()) {
      issues.push('Describe el motivo operativo de la solicitud.');
    }

    if (lines.length === 0) {
      issues.push('Agrega al menos una partida de refacción o consumible.');
    }

    lines.forEach((line, index) => {
      if (!line.description.trim() && !line.code.trim()) {
        issues.push(`La partida ${index + 1} no tiene código ni descripción.`);
      }

      if (!Number.isFinite(line.quantity) || line.quantity < 1) {
        issues.push(`La partida ${index + 1} debe tener una cantidad válida.`);
      }
    });

    return issues;
  };

  const refreshRequests = async () => {
    const { data, error } = await supabase
      .from('refacciones_solicitudes')
      .select('*')
      .order('fecha_solicitud', { ascending: false })
      .limit(60);

    if (!error && data) {
      setRequests(data as SparePartRequestRow[]);
    }
  };

  const buildEmailItems = () =>
    lines.map((line) => ({
      code: line.code,
      description: line.description,
      quantity: line.quantity,
      equipmentFamily: line.equipmentFamily,
      notes: line.notes,
    }));

  const handleSubmit = async (mode: 'save' | 'notify') => {
    const issues = validateRequest();
    if (issues.length > 0) {
      setModalAlert({
        tone: 'error',
        title: 'Solicitud incompleta',
        messages: issues,
      });
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setModalAlert({
        tone: 'error',
        title: 'Sesión no disponible',
        messages: ['Vuelve a iniciar sesión antes de guardar la solicitud.'],
      });
      return;
    }

    const cleanedLines = lines.map((line) => ({
      code: line.code.trim(),
      description: line.description.trim(),
      quantity: Math.max(1, Number(line.quantity) || 1),
      equipmentFamily: line.equipmentFamily.trim(),
      notes: line.notes.trim(),
      imageUrl: line.imageUrl,
      imageLabel: line.imageLabel,
      pageManual: line.pageManual,
      source: line.source,
    }));

    const equipment = selectedEquipment;
    const isoNow = new Date().toISOString();

    const insertPayload = {
      user_id: user.id,
      engineer_name: profile?.nombre_completo?.trim() || '',
      employee_number: profile?.employee_number?.trim() || '',
      ticket_reference: form.ticketReference.trim(),
      equipo_id: equipment?.id || null,
      equipo_serie: form.equipmentSerial.trim(),
      equipo_modelo: form.equipmentModel.trim(),
      cliente_id: equipment?.clientes?.id ?? null,
      cliente_nombre: form.clientName.trim(),
      contacto_sitio: form.clientContact.trim(),
      telefono_contacto: form.clientPhone.trim(),
      direccion_sitio: form.siteAddress.trim(),
      ciudad_destino: form.destinationCity.trim(),
      estado_destino: form.destinationState.trim(),
      prioridad: form.priority,
      requerida_para: form.neededByDate,
      motivo_solicitud: form.reason.trim(),
      observaciones: form.observations.trim(),
      destino_entrega: form.destinationMode,
      destino_entrega_detalle: form.destinationDetail.trim(),
      nombre_pieza: cleanedLines[0]?.description || cleanedLines[0]?.code || null,
      cantidad: cleanedLines[0]?.quantity || 1,
      lineas_solicitud: cleanedLines,
      snapshot_solicitud: {
        source: 'refacciones_dashboard',
        createdAt: isoNow,
        engineer: {
          id: profile?.id || user.id,
          name: profile?.nombre_completo || '',
          employeeNumber: profile?.employee_number || '',
          phone: profile?.telefono || '',
        },
        equipment: {
          id: equipment?.id || null,
          serial: form.equipmentSerial.trim(),
          model: form.equipmentModel.trim(),
        },
        client: {
          id: equipment?.clientes?.id ?? null,
          name: form.clientName.trim(),
          contact: form.clientContact.trim(),
          phone: form.clientPhone.trim(),
          address: form.siteAddress.trim(),
          city: form.destinationCity.trim(),
          state: form.destinationState.trim(),
        },
        logistics: {
          priority: form.priority,
          neededByDate: form.neededByDate,
          destinationMode: form.destinationMode,
          destinationDetail: form.destinationDetail.trim(),
        },
        narrative: {
          reason: form.reason.trim(),
          observations: form.observations.trim(),
        },
        items: cleanedLines,
      },
      actualizado_en: isoNow,
    };

    setSubmittingMode(mode);

    try {
      const { data: created, error: insertError } = await supabase
        .from('refacciones_solicitudes')
        .insert(insertPayload)
        .select('*')
        .single();

      if (insertError || !created) {
        throw new Error(insertError?.message || 'No fue posible guardar la solicitud de refacciones.');
      }

      let emailMessage = '';
      let tone: AlertTone = 'success';

      if (mode === 'notify') {
        if (emailEnabled) {
          try {
            await sendSparePartRequestEmail({
              requestId: created.id,
              engineerName: profile?.nombre_completo?.trim() || '',
              employeeNumber: profile?.employee_number?.trim() || '',
              engineerPhone: profile?.telefono?.trim() || '',
              ticketReference: form.ticketReference.trim(),
              equipmentSerial: form.equipmentSerial.trim(),
              equipmentModel: form.equipmentModel.trim(),
              clientName: form.clientName.trim(),
              clientContact: form.clientContact.trim(),
              clientPhone: form.clientPhone.trim(),
              siteAddress: form.siteAddress.trim(),
              destinationCity: form.destinationCity.trim(),
              destinationState: form.destinationState.trim(),
              priority: form.priority,
              neededByDate: form.neededByDate,
              destinationMode: form.destinationMode,
              destinationDetail: form.destinationDetail.trim(),
              reason: form.reason.trim(),
              observations: form.observations.trim(),
              items: buildEmailItems(),
            });

            await supabase
              .from('refacciones_solicitudes')
              .update({ email_enviado_en: isoNow, actualizado_en: isoNow })
              .eq('id', created.id);

            emailMessage = 'El correo administrativo de refacciones salió correctamente con todas las partidas.';
          } catch (error) {
            tone = 'info';
            emailMessage = error instanceof Error ? error.message : 'La solicitud quedó guardada, pero el correo no pudo salir.';
          }
        } else {
          tone = 'info';
          emailMessage = getSparePartsRequestEmailDisabledMessage();
        }
      }

      await refreshRequests();
      setLines([]);
      setCatalogSearch('');
      setManualLine({
        code: '',
        description: '',
        equipmentFamily: '',
        quantity: 1,
      });
      setForm(createEmptyForm());

      setModalAlert({
        tone,
        title: mode === 'notify' ? 'Solicitud registrada y procesada' : 'Solicitud guardada',
        messages:
          mode === 'notify'
            ? [
                'La solicitud quedó registrada con contexto operativo, cliente, equipo y partidas.',
                emailMessage || 'La notificación por correo quedó completada.',
              ]
            : [
                'La solicitud quedó guardada en la base de datos con todas las partidas capturadas.',
                'Todavía no se notificó por correo al flujo administrativo.',
              ],
      });
    } catch (error) {
      setModalAlert({
        tone: 'error',
        title: 'No fue posible registrar la solicitud',
        messages: [error instanceof Error ? error.message : 'Error inesperado en la captura de refacciones.'],
      });
    } finally {
      setSubmittingMode(null);
    }
  };

  if (loading) {
    return (
      <div className="spare-parts-loading">
        <div className="spare-parts-loading__orb" />
        <div>
          <strong>Cargando mesa de refacciones</strong>
          <p>Perfil, catálogo, equipos y solicitudes recientes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="spare-parts-shell">
      {!emailEnabled && (
        <section className="spare-parts-inline-notice">
          <strong>Correo administrativo temporalmente desactivado</strong>
          <p>
            El flujo principal no se rompe: puedes guardar la solicitud y reintentar la notificación cuando la
            Edge Function esté habilitada.
          </p>
        </section>
      )}

      <div className="spare-parts-layout">
        <section className="spare-parts-panel spare-parts-panel--context">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Contexto operativo</span>
              <h3>Quién pide la pieza y para qué servicio</h3>
            </div>
            <div className="spare-parts-profile-chip">
              <strong>{profile?.nombre_completo || 'Ingeniero sin perfil'}</strong>
              <span>{profile?.employee_number || 'Sin número interno'} · {profile?.telefono || 'Sin teléfono'}</span>
            </div>
          </div>

          <div className="spare-parts-form-grid spare-parts-form-grid--4">
            <label className="spare-parts-field">
              <span>Ticket / folio</span>
              <input
                className="input-field"
                value={form.ticketReference}
                onChange={(event) => setFormField('ticketReference', event.target.value)}
                placeholder="Ej. TKT-BA400-USB-0427"
              />
            </label>

            <label className="spare-parts-field">
              <span>Fecha requerida</span>
              <input
                className="input-field"
                type="date"
                value={form.neededByDate}
                onChange={(event) => setFormField('neededByDate', event.target.value)}
              />
            </label>

            <label className="spare-parts-field">
              <span>Urgencia</span>
              <select
                className="input-field"
                value={form.priority}
                onChange={(event) => setFormField('priority', event.target.value as RequestPriority)}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="spare-parts-field">
              <span>Destino de entrega</span>
              <select
                className="input-field"
                value={form.destinationMode}
                onChange={(event) => setFormField('destinationMode', event.target.value as DestinationMode)}
              >
                {DESTINATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="spare-parts-pill-row">
            <span className={`spare-parts-priority-pill spare-parts-priority-pill--${form.priority}`}>
              Urgencia {PRIORITY_BADGE_LABELS[form.priority]}
            </span>
            <span className="spare-parts-meta-pill">{DESTINATION_BADGE_LABELS[form.destinationMode]}</span>
            <span className="spare-parts-meta-pill">
              {PRIORITY_OPTIONS.find((option) => option.value === form.priority)?.helper}
            </span>
          </div>

          <label className="spare-parts-field">
            <span>Motivo operativo</span>
            <textarea
              className="input-field spare-parts-textarea spare-parts-textarea--medium"
              value={form.reason}
              onChange={(event) => setFormField('reason', event.target.value)}
              placeholder="Describe por qué se requieren estas refacciones, qué equipo está comprometido y qué impacto operativo existe."
            />
          </label>

          <label className="spare-parts-field">
            <span>Observaciones para administración / almacén</span>
            <textarea
              className="input-field spare-parts-textarea"
              value={form.observations}
              onChange={(event) => setFormField('observations', event.target.value)}
              placeholder="Restricciones de entrega, validaciones con el cliente, guía de embarque previa, horario o cualquier aclaración útil."
            />
          </label>
        </section>

        <section className="spare-parts-panel spare-parts-panel--equipment">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Equipo y destino</span>
              <h3>Serie, cliente y datos de entrega</h3>
            </div>
            <div className="spare-parts-panel__helper">
              Si escribes una serie existente, el módulo arrastra cliente, contacto y sitio para evitar capturas
              repetidas.
            </div>
          </div>

          <div className="spare-parts-form-grid spare-parts-form-grid--3">
            <label className="spare-parts-field">
              <span>Número de serie</span>
              <input
                className="input-field"
                value={form.equipmentSerial}
                onChange={(event) => setFormField('equipmentSerial', event.target.value)}
                placeholder="Ej. 834000262"
                list="spare-parts-serials"
              />
              <datalist id="spare-parts-serials">
                {equipments.slice(0, 500).map((equipment) => (
                  <option key={equipment.id || equipment.numero_serie} value={equipment.numero_serie}>
                    {equipment.modelo || 'Equipo'} · {equipment.clientes?.razon_social || 'Cliente'}
                  </option>
                ))}
              </datalist>
            </label>

            <label className="spare-parts-field">
              <span>Modelo / plataforma</span>
              <input
                className="input-field"
                value={form.equipmentModel}
                onChange={(event) => setFormField('equipmentModel', event.target.value)}
                placeholder="Ej. BA400"
              />
            </label>

            <label className="spare-parts-field">
              <span>Detalle del destino</span>
              <input
                className="input-field"
                value={form.destinationDetail}
                onChange={(event) => setFormField('destinationDetail', event.target.value)}
                placeholder={
                  form.destinationMode === 'sitio'
                    ? 'Laboratorio, recepción, turno o persona que recibe'
                    : form.destinationMode === 'ingeniero'
                      ? 'Ciudad, paquetería o punto de encuentro'
                      : 'Sucursal, almacén o ubicación interna'
                }
              />
            </label>
          </div>

          {matchingEquipmentSuggestions.length > 0 && (
            <div className="spare-parts-suggestions">
              {matchingEquipmentSuggestions.map((equipment) => (
                <button
                  key={equipment.id || equipment.numero_serie}
                  type="button"
                  className="spare-parts-suggestion"
                  onClick={() => hydrateFromEquipment(equipment)}
                >
                  <strong>{equipment.numero_serie}</strong>
                  <span>{equipment.modelo || 'Equipo'} · {equipment.clientes?.razon_social || 'Cliente'}</span>
                </button>
              ))}
            </div>
          )}

          <div className="spare-parts-form-grid spare-parts-form-grid--2">
            <label className="spare-parts-field">
              <span>Cliente / hospital / laboratorio</span>
              <input
                className="input-field"
                value={form.clientName}
                onChange={(event) => setFormField('clientName', event.target.value)}
                placeholder="Cliente asociado al equipo"
              />
            </label>

            <label className="spare-parts-field">
              <span>Contacto en sitio</span>
              <input
                className="input-field"
                value={form.clientContact}
                onChange={(event) => setFormField('clientContact', event.target.value)}
                placeholder="Persona que recibirá o valida la pieza"
              />
            </label>

            <label className="spare-parts-field">
              <span>Teléfono de contacto</span>
              <input
                className="input-field"
                value={form.clientPhone}
                onChange={(event) => setFormField('clientPhone', event.target.value)}
                placeholder="Celular o conmutador"
              />
            </label>

            <label className="spare-parts-field">
              <span>Ciudad / estado</span>
              <input
                className="input-field"
                value={[form.destinationCity, form.destinationState].filter(Boolean).join(', ')}
                onChange={(event) => {
                  const [city, state] = event.target.value.split(',');
                  setForm((current) => ({
                    ...current,
                    destinationCity: city?.trim() || '',
                    destinationState: state?.trim() || '',
                  }));
                }}
                placeholder="Ciudad, Estado"
              />
            </label>
          </div>

          <label className="spare-parts-field">
            <span>Dirección</span>
            <textarea
              className="input-field spare-parts-textarea"
              value={form.siteAddress}
              onChange={(event) => setFormField('siteAddress', event.target.value)}
              placeholder="Dirección útil para entrega, paquetería o referencia en sitio."
            />
          </label>
        </section>

        <section className="spare-parts-panel spare-parts-panel--catalog">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Catálogo inteligente</span>
              <h3>Busca por código, descripción, plataforma o imagen</h3>
            </div>
            <div className="spare-parts-panel__helper">
              Si ya elegiste una serie, primero te proponemos piezas compatibles con esa plataforma.
            </div>
          </div>

          <div className="spare-parts-quick-row">
            {quickSuggestions.map((entry) => (
              <button
                key={`quick-${entry.codigo_refaccion}`}
                type="button"
                className="spare-parts-quick-chip"
                onClick={() => {
                  setCatalogSearch(entry.codigo_refaccion);
                  setActiveCatalogCode(entry.codigo_refaccion);
                }}
              >
                <strong>{entry.codigo_refaccion}</strong>
                <span>{entry.nombre || entry.desc_breve || entry.equipo || 'Referencia'}</span>
              </button>
            ))}
          </div>

          <label className="spare-parts-field">
            <span>Buscar refacción</span>
            <input
              className="input-field"
              value={catalogSearch}
              onChange={(event) => setCatalogSearch(event.target.value)}
              placeholder="Código, descripción, familia BA400, bomba, rotor, jeringa, probe..."
            />
          </label>

          <div className="spare-parts-catalog-grid">
            <div className="spare-parts-results">
              {catalogResults.length === 0 ? (
                <div className="spare-parts-empty-copy">
                  No hubo coincidencias directas. Puedes usar la partida manual si la pieza aún no está catalogada.
                </div>
              ) : (
                catalogResults.map((entry) => {
                  const imageEntry = resolveImageEntry(entry.codigo_refaccion);
                  const imageUrl = imageEntry?.variants[0]?.url || '';
                  const isActive = entry.codigo_refaccion === activeCatalogEntry?.codigo_refaccion;

                  return (
                    <button
                      key={entry.codigo_refaccion}
                      type="button"
                      className={`spare-parts-result-card ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveCatalogCode(entry.codigo_refaccion)}
                    >
                        <div className="spare-parts-result-card__media">
                        {imageUrl ? <img src={resolveAssetUrl(imageUrl)} alt={imageEntry?.inferredDescription || entry.codigo_refaccion} /> : <span>Sin vista</span>}
                      </div>
                      <div className="spare-parts-result-card__copy">
                        <strong>{entry.codigo_refaccion}</strong>
                        <h4>{entry.nombre || entry.desc_breve || imageEntry?.inferredDescription || 'Refacción BioSystems'}</h4>
                        <p>{buildCatalogDescription(entry, imageEntry)}</p>
                        <div className="spare-parts-result-card__meta">
                          <span>{buildCatalogFamily(entry, imageEntry)}</span>
                          {entry.pagina_manual ? <span>Manual {entry.pagina_manual}</span> : null}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="spare-parts-preview-card">
              {activeCatalogEntry ? (
                <>
                  <div className="spare-parts-preview-card__hero">
                    <div>
                      <span className="spare-parts-panel__eyebrow">Preview seleccionado</span>
                      <h4>{activeCatalogEntry.codigo_refaccion}</h4>
                      <p>{activeCatalogEntry.nombre || activeCatalogEntry.desc_breve || 'Refacción BioSystems'}</p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => addCatalogLine(activeCatalogEntry)}>
                      Agregar partida
                    </button>
                  </div>

                  <div className="spare-parts-preview-card__image">
                    {activeImageVariant ? (
                      <img src={resolveAssetUrl(activeImageVariant.url)} alt={activeImageVariant.label} />
                    ) : (
                      <div className="spare-parts-preview-card__placeholder">No hay imagen cargada para este código.</div>
                    )}
                  </div>

                  {activeImageEntry && activeImageEntry.variants.length > 1 && (
                    <div className="spare-parts-preview-card__thumbs">
                      {activeImageEntry.variants.map((variant, index) => (
                        <button
                          key={variant.fileName}
                          type="button"
                          className={`spare-parts-preview-card__thumb ${index === activePreviewVariant ? 'active' : ''}`}
                          onClick={() => setActivePreviewVariant(index)}
                        >
                          <img src={resolveAssetUrl(variant.url)} alt={variant.label} />
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="spare-parts-preview-card__details">
                    <div>
                      <span>Descripción útil</span>
                      <strong>{buildCatalogDescription(activeCatalogEntry, activeImageEntry)}</strong>
                    </div>
                    <div>
                      <span>Familia / compatibilidad</span>
                      <strong>{buildCatalogFamily(activeCatalogEntry, activeImageEntry)}</strong>
                    </div>
                    <div>
                      <span>Referencia manual</span>
                      <strong>{activeCatalogEntry.pagina_manual || 'Sin página registrada'}</strong>
                    </div>
                  </div>
                </>
              ) : (
                <div className="spare-parts-empty-copy">
                  Selecciona una coincidencia del catálogo para ver imagen, compatibilidad y cargarla a la solicitud.
                </div>
              )}

              <div className="spare-parts-manual-card">
                <div className="spare-parts-manual-card__header">
                  <div>
                    <span className="spare-parts-panel__eyebrow">Partida manual</span>
                    <h4>Cuando la pieza no aparece todavía en el catálogo</h4>
                  </div>
                </div>

                <div className="spare-parts-form-grid spare-parts-form-grid--2">
                  <label className="spare-parts-field">
                    <span>Código manual</span>
                    <input
                      className="input-field"
                      value={manualLine.code}
                      onChange={(event) => setManualLine((current) => ({ ...current, code: event.target.value }))}
                      placeholder="Código externo o referencia libre"
                    />
                  </label>

                  <label className="spare-parts-field">
                    <span>Cantidad</span>
                    <input
                      className="input-field"
                      type="number"
                      min={1}
                      value={manualLine.quantity}
                      onChange={(event) =>
                        setManualLine((current) => ({
                          ...current,
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                    />
                  </label>
                </div>

                <label className="spare-parts-field">
                  <span>Descripción manual</span>
                  <textarea
                    className="input-field spare-parts-textarea"
                    value={manualLine.description}
                    onChange={(event) => setManualLine((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Describe claramente la pieza, kit o consumible que no está en catálogo."
                  />
                </label>

                <label className="spare-parts-field">
                  <span>Compatibilidad / familia</span>
                  <input
                    className="input-field"
                    value={manualLine.equipmentFamily}
                    onChange={(event) =>
                      setManualLine((current) => ({ ...current, equipmentFamily: event.target.value }))
                    }
                    placeholder="BA400, A25, kit ISE, accesorio general..."
                  />
                </label>

                <button type="button" className="button-primary inactive" onClick={addManualLine}>
                  Agregar manual
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="spare-parts-panel spare-parts-panel--lines">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Partidas capturadas</span>
              <h3>Lista lista para surtido</h3>
            </div>
            <div className="spare-parts-panel__helper">
              Ajusta cantidades, agrega notas por partida y elimina ruido antes de mandar el correo.
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="spare-parts-empty-copy">
              Todavía no hay partidas cargadas. Elige desde catálogo o agrega una partida manual.
            </div>
          ) : (
            <div className="spare-parts-lines">
              {lines.map((line, index) => (
                <article key={line.id} className="spare-parts-line-card">
                  <div className="spare-parts-line-card__media">
                    {line.imageUrl ? <img src={resolveAssetUrl(line.imageUrl)} alt={line.imageLabel || line.description} /> : <span>Manual</span>}
                  </div>
                  <div className="spare-parts-line-card__body">
                    <div className="spare-parts-line-card__headline">
                      <div>
                        <strong>
                          {index + 1}. {line.code || 'Sin código'}
                        </strong>
                        <h4>{line.description}</h4>
                      </div>
                      <button type="button" className="spare-parts-link-button" onClick={() => removeLine(line.id)}>
                        Quitar
                      </button>
                    </div>

                    <div className="spare-parts-form-grid spare-parts-form-grid--3">
                      <label className="spare-parts-field">
                        <span>Cantidad</span>
                        <input
                          className="input-field"
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(line.id, { quantity: Math.max(1, Number(event.target.value) || 1) })
                          }
                        />
                      </label>

                      <label className="spare-parts-field">
                        <span>Compatibilidad</span>
                        <input
                          className="input-field"
                          value={line.equipmentFamily}
                          onChange={(event) => updateLine(line.id, { equipmentFamily: event.target.value })}
                          placeholder="Familia o equipo compatible"
                        />
                      </label>

                      <label className="spare-parts-field">
                        <span>Referencia manual</span>
                        <input
                          className="input-field"
                          value={line.pageManual}
                          onChange={(event) => updateLine(line.id, { pageManual: event.target.value })}
                          placeholder="Página, diagrama o nota de catálogo"
                        />
                      </label>
                    </div>

                    <label className="spare-parts-field">
                      <span>Nota por partida</span>
                      <textarea
                        className="input-field spare-parts-textarea spare-parts-textarea--small"
                        value={line.notes}
                        onChange={(event) => updateLine(line.id, { notes: event.target.value })}
                        placeholder="Ej. enviar con tubing completo, revisar revisión, incluir sello, solo si no hay equivalente."
                      />
                    </label>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="spare-parts-panel spare-parts-panel--summary">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Resumen administrativo</span>
              <h3>Lo que se va a mandar por correo</h3>
            </div>
            <div className="spare-parts-panel__helper">
              Esta vista resume el contexto que recibirá administración para surtir o coordinar la entrega sin pedir más
              capturas.
            </div>
          </div>

          <div className="spare-parts-summary-grid">
            <div className="spare-parts-summary-card">
              <span>Ingeniero solicitante</span>
              <strong>{profile?.nombre_completo || 'Sin perfil'}</strong>
              <p>{profile?.employee_number || 'Sin número'} · {profile?.telefono || 'Sin teléfono'}</p>
            </div>
            <div className="spare-parts-summary-card">
              <span>Equipo / serie</span>
              <strong>{form.equipmentModel || 'Sin modelo'}</strong>
              <p>{form.equipmentSerial || 'Sin serie capturada'}</p>
            </div>
            <div className="spare-parts-summary-card">
              <span>Cliente / sitio</span>
              <strong>{form.clientName || 'Sin cliente'}</strong>
              <p>{form.destinationCity || 'Sin ciudad'}{form.destinationState ? `, ${form.destinationState}` : ''}</p>
            </div>
            <div className="spare-parts-summary-card">
              <span>Partidas</span>
              <strong>{lines.length}</strong>
              <p>{lines.reduce((acc, line) => acc + line.quantity, 0)} unidad(es) totales</p>
            </div>
          </div>

          <div className="spare-parts-summary-list">
            {lines.length === 0 ? (
              <div className="spare-parts-empty-copy">Todavía no hay partidas para resumir.</div>
            ) : (
              lines.map((line) => (
                <div key={`summary-${line.id}`} className="spare-parts-summary-list__item">
                  <strong>{line.code || 'Manual'} · {line.quantity} pza(s)</strong>
                  <span>{line.description}</span>
                </div>
              ))
            )}
          </div>

          <div className="spare-parts-actions">
            <button
              type="button"
              className="button-primary inactive"
              disabled={Boolean(submittingMode)}
              onClick={() => void handleSubmit('save')}
            >
              {submittingMode === 'save' ? 'Guardando...' : 'Guardar sin notificar'}
            </button>
            <button
              type="button"
              className="button-primary"
              disabled={Boolean(submittingMode)}
              onClick={() => void handleSubmit('notify')}
            >
              {submittingMode === 'notify' ? 'Procesando correo...' : 'Guardar y notificar'}
            </button>
          </div>
        </section>

        <section className="spare-parts-panel spare-parts-panel--history">
          <div className="spare-parts-panel__header">
            <div>
              <span className="spare-parts-panel__eyebrow">Seguimiento</span>
              <h3>Solicitudes recientes</h3>
            </div>
            <label className="spare-parts-field spare-parts-field--compact">
              <span>Filtrar</span>
              <input
                className="input-field"
                value={historySearch}
                onChange={(event) => setHistorySearch(event.target.value)}
                placeholder="Ticket, serie, cliente o código"
              />
            </label>
          </div>

          {visibleRequests.length === 0 ? (
            <div className="spare-parts-empty-copy">
              No hay solicitudes visibles con ese filtro.
            </div>
          ) : (
            <div className="spare-parts-history-list">
              {visibleRequests.map((request) => {
                const requestLines = getRequestLines(request);
                const totalUnits = requestLines.reduce((acc, line) => acc + line.quantity, 0);
                const firstCodes = requestLines
                  .slice(0, 3)
                  .map((line) => line.code || line.description)
                  .filter(Boolean);

                return (
                  <article key={request.id} className="spare-parts-history-card">
                    <div className="spare-parts-history-card__top">
                      <div>
                        <span className={`spare-parts-status-pill spare-parts-status-pill--${getStatusTone(request.estado_solicitud)}`}>
                          {getStatusLabel(request.estado_solicitud)}
                        </span>
                        <h4>{request.ticket_reference || request.equipo_serie || 'Solicitud sin referencia visible'}</h4>
                        <p>
                          {request.cliente_nombre || 'Cliente por validar'} · {request.equipo_modelo || 'Modelo sin capturar'}
                        </p>
                      </div>
                      <div className="spare-parts-history-card__meta">
                        <strong>{totalUnits} pza(s)</strong>
                        <span>{formatDateLabel(request.fecha_solicitud)}</span>
                      </div>
                    </div>

                    <div className="spare-parts-history-card__chips">
                      {firstCodes.map((label) => (
                        <span key={`${request.id}-${label}`} className="spare-parts-meta-pill">
                          {label}
                        </span>
                      ))}
                      {request.email_enviado_en ? (
                        <span className="spare-parts-meta-pill success">Correo enviado</span>
                      ) : (
                        <span className="spare-parts-meta-pill warning">Pendiente de correo</span>
                      )}
                    </div>

                    <p className="spare-parts-history-card__notes">
                      {request.motivo_solicitud || 'Sin motivo capturado.'}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalAlert &&
        createPortal(
          <div className="spare-alert-overlay" onClick={() => setModalAlert(null)}>
            <div className={`spare-alert-card ${modalAlert.tone}`} onClick={(event) => event.stopPropagation()}>
              <div className="spare-alert-kicker">
                {modalAlert.tone === 'error' ? 'Atención' : modalAlert.tone === 'success' ? 'Completado' : 'Aviso'}
              </div>
              <h3>{modalAlert.title}</h3>
              <div className="spare-alert-messages">
                {modalAlert.messages.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
              <button type="button" className="spare-alert-close" onClick={() => setModalAlert(null)}>
                Continuar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
