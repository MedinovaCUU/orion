import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import jsPDF from 'jspdf';
import { splitServiceCatalog, type ServiceCatalogRow } from './serviceCatalog';
import { createSupremoLaunchSession } from './supremoApi';
import { getSupremoShowroomPreset, normalizeSerialLookup } from './supremoPresets';
import { getPublicAssetUrl } from './publicAssetUrl';
import {
  getEquipmentTrainingExamDefinition,
  type EquipmentTrainingExamDefinition,
} from './equipmentTrainingExams';

interface SupremoDraftState {
  enabled: boolean;
  supremoAlias: string;
  supremoId: string;
}

interface InlineFeedback {
  message: string;
  tone: 'error' | 'success';
}

interface EquipmentTrainingAttemptRecord {
  id: string;
  equipo_id: string;
  participant_name: string;
  participant_role: string | null;
  participant_company: string | null;
  score: number;
  total_questions: number;
  passed: boolean;
  question_bank_code: string;
  created_at: string;
}

interface TrainingExamModalState {
  definition: EquipmentTrainingExamDefinition;
  participantName: string;
  participantRole: string;
  participantCompany: string;
  answers: Record<string, number>;
  submitting: boolean;
  validationMessage: string | null;
  result: {
    score: number;
    total: number;
    passed: boolean;
  } | null;
}

interface SupremoModalState {
  title: string;
  message: string;
  tone: 'error' | 'warning';
  details: string[];
}

const SUPREMO_LAUNCH_TIMEOUT_MS = 1800;
const SUPREMO_ICON_URL = getPublicAssetUrl('supremo_icon.png');
const DOCUMENTOS_BUCKET = 'documentos';

const sanitizeSupremoId = (value: string) => value.replace(/[^\d]/g, '').trim();
const sanitizeFileName = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g, '-');
const buildPublicDocumentUrl = (path: string) =>
  `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${DOCUMENTOS_BUCKET}/${path}`;

const attemptSupremoClientLaunch = async (launchUrl: string) =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    let timeoutId = 0;

    const finalize = (didOpen: boolean) => {
      if (settled) {
        return;
      }

      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('blur', handleBlur, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      resolve(didOpen);
    };

    const handleBlur = () => finalize(true);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        finalize(true);
      }
    };

    window.addEventListener('blur', handleBlur, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);

    try {
      window.location.assign(launchUrl);
    } catch {
      finalize(false);
      return;
    }

    timeoutId = window.setTimeout(() => {
      finalize(document.hidden || !document.hasFocus());
    }, SUPREMO_LAUNCH_TIMEOUT_MS);
  });

const getInitialSupremoDraft = (equipo: any): SupremoDraftState => {
  const preset = getSupremoShowroomPreset(equipo?.numero_serie);

  return {
    enabled: typeof equipo?.supremo_enabled === 'boolean' ? equipo.supremo_enabled : Boolean(preset),
    supremoAlias: String(equipo?.supremo_alias || preset?.alias || '').trim(),
    supremoId: sanitizeSupremoId(String(equipo?.supremo_id || preset?.supremoId || '')),
  };
};

const EyeIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
  </svg>
);

const InstallationIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14.7 6.3a4.5 4.5 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4.5 4.5 0 0 0 5.4-5.4l-2.4 2.4-3-3 2.4-2.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const TrainingDocumentIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 4 4 8l8 4 8-4-8-4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 10.5V14c0 1.4 1.8 2.5 4 2.5s4-1.1 4-2.5v-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 9v5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const ExamIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M9 4h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M10 2h4v4h-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
    <path d="M7 6.5h10A1.5 1.5 0 0 1 18.5 8v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V8A1.5 1.5 0 0 1 7 6.5Z" stroke="currentColor" strokeWidth="1.8" />
    <path d="m9.5 14 1.6 1.6 3.4-3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function Equipos() {
  const [equipos, setEquipos] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal State
  const [terminarModalOpen, setTerminarModalOpen] = useState(false);
  const [selectedEquipo, setSelectedEquipo] = useState<any>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Detalles Modal State
  const [detallesModalOpen, setDetallesModalOpen] = useState(false);
  const [detallesEquipo, setDetallesEquipo] = useState<any>(null);

  // Historial de Servicios State
  const [showServicios, setShowServicios] = useState(false);
  const [equipoServicios, setEquipoServicios] = useState<any[]>([]);
  const [loadingServicios, setLoadingServicios] = useState(false);
  const serviciosRequestIdRef = useRef(0);

  const [catalogoAverias, setCatalogoAverias] = useState<any[]>([]);
  const [catalogoSoluciones, setCatalogoSoluciones] = useState<any[]>([]);
  const [supremoDraft, setSupremoDraft] = useState<SupremoDraftState>({
    enabled: false,
    supremoAlias: '',
    supremoId: '',
  });
  const [savingSupremoConfig, setSavingSupremoConfig] = useState(false);
  const [launchingSupremo, setLaunchingSupremo] = useState(false);
  const [supremoFeedback, setSupremoFeedback] = useState<InlineFeedback | null>(null);
  const [supremoModal, setSupremoModal] = useState<SupremoModalState | null>(null);
  const [documentFeedback, setDocumentFeedback] = useState<InlineFeedback | null>(null);
  const [uploadingDocumentKind, setUploadingDocumentKind] = useState<'instalacion' | 'capacitacion' | null>(null);
  const [trainingExamAttempts, setTrainingExamAttempts] = useState<EquipmentTrainingAttemptRecord[]>([]);
  const [loadingTrainingExamAttempts, setLoadingTrainingExamAttempts] = useState(false);
  const [trainingExamModal, setTrainingExamModal] = useState<TrainingExamModalState | null>(null);
  const trainingExamRequestIdRef = useRef(0);
  const instalacionInputRef = useRef<HTMLInputElement | null>(null);
  const capacitacionInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchEquipos();
    supabase
      .from('catalogo_servicio')
      .select('catalog_kind, catalog_code, catalog_type, catalog_detail, category_code')
      .then(({ data }) => {
        if (!data) {
          return;
        }

        const { averias, soluciones } = splitServiceCatalog(data as ServiceCatalogRow[]);
        setCatalogoAverias(averias);
        setCatalogoSoluciones(soluciones);
      });
  }, []);

  useEffect(() => {
    if (!detallesModalOpen && !terminarModalOpen && !supremoModal && !trainingExamModal) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [detallesModalOpen, terminarModalOpen, supremoModal, trainingExamModal]);

  const resetServiciosState = () => {
    serviciosRequestIdRef.current += 1;
    setShowServicios(false);
    setEquipoServicios([]);
    setLoadingServicios(false);
  };

  const closeDetallesModal = () => {
    setDetallesModalOpen(false);
    setDetallesEquipo(null);
    setSupremoDraft({
      enabled: false,
      supremoAlias: '',
      supremoId: '',
    });
    setSupremoFeedback(null);
    setSupremoModal(null);
    setDocumentFeedback(null);
    setUploadingDocumentKind(null);
    setTrainingExamAttempts([]);
    setLoadingTrainingExamAttempts(false);
    setTrainingExamModal(null);
    trainingExamRequestIdRef.current += 1;
    resetServiciosState();
  };

  const openDetallesModal = (equipo: any) => {
    resetServiciosState();
    setDetallesEquipo(equipo);
    setSupremoDraft(getInitialSupremoDraft(equipo));
    setSupremoFeedback(null);
    setSupremoModal(null);
    setDocumentFeedback(null);
    setUploadingDocumentKind(null);
    setTrainingExamAttempts([]);
    setTrainingExamModal(null);
    setDetallesModalOpen(true);
    void fetchTrainingExamAttempts(equipo.id);
  };

  const fetchEquipoServicios = async (numero_serie: string) => {
    const requestId = ++serviciosRequestIdRef.current;
    setLoadingServicios(true);
    const { data, error } = await supabase
      .from('servicios_historial')
      .select(`
              *,
              profiles (nombre_completo),
              servicios_refacciones (
                  cantidad,
                  refacciones_catalogo (descripcion, codigo_refaccion)
              )
          `)
      .eq('no_serie', numero_serie)
      .order('fecha_servicio', { ascending: false })
      .order('creado_en', { ascending: false });

    if (requestId !== serviciosRequestIdRef.current) {
      return;
    }

    if (!error && data) {
      const mappedData = data.map((d: any) => ({
        ...d,
        averias_catalogo: catalogoAverias.find(a => a.cda === d.cda) || null,
        soluciones_catalogo: catalogoSoluciones.find(s => s.cds === d.cds) || null
      }));
      setEquipoServicios(mappedData);
    }
    if (error) console.error("Error fetching historial:", error);

    setLoadingServicios(false);
  };

  async function fetchEquipos() {
    setLoading(true);
    const { data } = await supabase
      .from('equipos')
      .select('*, clientes(*), asigna:profiles!equipos_empleado_asignado_fkey(nombre_completo), retira:profiles!equipos_empleado_retira_fkey(nombre_completo)')
      .order('creado_en', { ascending: false });

    if (data) {
      setEquipos(data);
    }
    setLoading(false);
  }

  const syncEquipoInState = (equipoId: string, nextFields: Record<string, unknown>) => {
    setEquipos((current) =>
      current.map((item) => (item.id === equipoId ? { ...item, ...nextFields } : item)),
    );
    setDetallesEquipo((current: any) => (current?.id === equipoId ? { ...current, ...nextFields } : current));
    setSelectedEquipo((current: any) => (current?.id === equipoId ? { ...current, ...nextFields } : current));
  };

  const fetchTrainingExamAttempts = async (equipoId: string) => {
    const requestId = ++trainingExamRequestIdRef.current;
    setLoadingTrainingExamAttempts(true);

    const { data, error } = await supabase
      .from('equipo_capacitacion_examenes')
      .select('id,equipo_id,participant_name,participant_role,participant_company,score,total_questions,passed,question_bank_code,created_at')
      .eq('equipo_id', equipoId)
      .order('created_at', { ascending: false })
      .limit(8);

    if (requestId !== trainingExamRequestIdRef.current) {
      return;
    }

    if (error) {
      console.error('Error fetching training exam attempts:', error);
      setTrainingExamAttempts([]);
      setLoadingTrainingExamAttempts(false);
      return;
    }

    setTrainingExamAttempts((data as EquipmentTrainingAttemptRecord[] | null) || []);
    setLoadingTrainingExamAttempts(false);
  };

  const uploadEquipmentDocument = async (kind: 'instalacion' | 'capacitacion', providedFile?: File | null) => {
    if (!detallesEquipo) {
      return;
    }

    const file = providedFile || null;
    if (!file) {
      setDocumentFeedback({
        tone: 'error',
        message: `Selecciona primero el PDF de ${kind === 'instalacion' ? 'instalación' : 'capacitación'}.`,
      });
      return;
    }

    setUploadingDocumentKind(kind);
    setDocumentFeedback(null);

    const { data: currentUserResp } = await supabase.auth.getUser();
    const uid = currentUserResp.user?.id || null;
    const safeSerial = sanitizeFileName(normalizeSerialLookup(detallesEquipo.numero_serie || 'equipo'));
    const safeName = sanitizeFileName(file.name);
    const folder = kind === 'instalacion' ? 'instalacion' : 'capacitacion';
    const path = `equipos/${safeSerial}/${folder}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage.from(DOCUMENTOS_BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type || 'application/pdf',
    });

    if (uploadError) {
      setUploadingDocumentKind(null);
      setDocumentFeedback({
        tone: 'error',
        message: `No fue posible subir el PDF: ${uploadError.message}`,
      });
      return;
    }

    const uploadedAt = new Date().toISOString();
    const payload =
      kind === 'instalacion'
        ? {
            doc_instalacion: true,
            doc_instalacion_path: path,
            doc_instalacion_filename: file.name,
            doc_instalacion_uploaded_at: uploadedAt,
            doc_instalacion_uploaded_by: uid,
          }
        : {
            doc_capacitacion: true,
            doc_capacitacion_path: path,
            doc_capacitacion_filename: file.name,
            doc_capacitacion_uploaded_at: uploadedAt,
            doc_capacitacion_uploaded_by: uid,
          };

    const { error: updateError } = await supabase.from('equipos').update(payload).eq('id', detallesEquipo.id);

    setUploadingDocumentKind(null);

    if (updateError) {
      setDocumentFeedback({
        tone: 'error',
        message: `El archivo subió, pero no pudimos registrar el documento en el equipo: ${updateError.message}`,
      });
      return;
    }

    syncEquipoInState(detallesEquipo.id, payload);
    setDocumentFeedback({
      tone: 'success',
      message: `Se registró correctamente el documento de ${kind === 'instalacion' ? 'instalación' : 'capacitación'}.`,
    });
  };

  const openTrainingExam = () => {
    const definition = getEquipmentTrainingExamDefinition(detallesEquipo?.modelo);

    if (!definition) {
      setDocumentFeedback({
        tone: 'error',
        message: `Todavía no existe un examen configurado para el modelo ${detallesEquipo?.modelo || 'sin modelo definido'}.`,
      });
      return;
    }

    setTrainingExamModal({
      definition,
      participantName: '',
      participantRole: '',
      participantCompany: detallesEquipo?.clientes?.razon_social || '',
      answers: {},
      submitting: false,
      validationMessage: null,
      result: null,
    });
  };

  const submitTrainingExam = async () => {
    if (!trainingExamModal || !detallesEquipo) {
      return;
    }

    const participantName = trainingExamModal.participantName.trim();
    if (!participantName) {
      setTrainingExamModal((current) =>
        current
          ? {
              ...current,
              validationMessage: 'Captura el nombre de la persona evaluada antes de guardar el examen.',
            }
          : current,
      );
      return;
    }

    const totalQuestions = trainingExamModal.definition.questions.length;
    const answeredCount = trainingExamModal.definition.questions.filter(
      (question) => typeof trainingExamModal.answers[question.id] === 'number',
    ).length;

    if (answeredCount !== totalQuestions) {
      setTrainingExamModal((current) =>
        current
          ? {
              ...current,
              validationMessage: 'Contesta todas las preguntas antes de finalizar la evaluación.',
            }
          : current,
      );
      return;
    }

    const score = trainingExamModal.definition.questions.reduce((acc, question) => {
      return acc + (trainingExamModal.answers[question.id] === question.correctOptionIndex ? 1 : 0);
    }, 0);
    const passed = score / totalQuestions >= trainingExamModal.definition.passingRatio;

    setTrainingExamModal((current) =>
      current
        ? {
            ...current,
            submitting: true,
            validationMessage: null,
          }
        : current,
    );

    const { data: currentUserResp } = await supabase.auth.getUser();
    const uid = currentUserResp.user?.id || null;

    const answers = trainingExamModal.definition.questions.map((question) => ({
      questionId: question.id,
      prompt: question.prompt,
      selectedOptionIndex: trainingExamModal.answers[question.id],
      selectedOption: question.options[trainingExamModal.answers[question.id]],
      correctOptionIndex: question.correctOptionIndex,
      correctOption: question.options[question.correctOptionIndex],
      correct: trainingExamModal.answers[question.id] === question.correctOptionIndex,
      reference: question.reference,
    }));

    const { error } = await supabase.from('equipo_capacitacion_examenes').insert({
      equipo_id: detallesEquipo.id,
      numero_serie: detallesEquipo.numero_serie || '',
      modelo: detallesEquipo.modelo || null,
      participant_name: participantName,
      participant_role: trainingExamModal.participantRole.trim() || null,
      participant_company: trainingExamModal.participantCompany.trim() || detallesEquipo.clientes?.razon_social || null,
      score,
      total_questions: totalQuestions,
      passed,
      question_bank_code: trainingExamModal.definition.code,
      answers,
      created_by: uid,
    });

    if (error) {
      setTrainingExamModal((current) =>
        current
          ? {
              ...current,
              submitting: false,
              validationMessage: `No fue posible guardar el resultado: ${error.message}`,
            }
          : current,
      );
      return;
    }

    setTrainingExamModal((current) =>
      current
        ? {
            ...current,
            submitting: false,
            result: {
              score,
              total: totalQuestions,
              passed,
            },
          }
        : current,
    );
    setDocumentFeedback({
      tone: 'success',
      message: `Se guardó el examen de capacitación de ${participantName} con ${score}/${totalQuestions} respuestas correctas.`,
    });
    void fetchTrainingExamAttempts(detallesEquipo.id);
  };

  const saveSupremoConfig = async () => {
    if (!detallesEquipo) {
      return;
    }

    const preset = getSupremoShowroomPreset(detallesEquipo.numero_serie);
    const normalizedSupremoId = sanitizeSupremoId(supremoDraft.supremoId || preset?.supremoId || '');
    const normalizedAlias = (supremoDraft.supremoAlias || preset?.alias || '').trim();

    if (supremoDraft.enabled && !normalizedSupremoId) {
      setSupremoFeedback({
        tone: 'error',
        message: 'Define un Supremo ID valido antes de habilitar el acceso remoto.',
      });
      return;
    }

    setSavingSupremoConfig(true);
    setSupremoFeedback(null);

    const payload = {
      supremo_id: normalizedSupremoId || null,
      supremo_alias: normalizedAlias || null,
      supremo_enabled: supremoDraft.enabled,
    };

    const { error } = await supabase.from('equipos').update(payload).eq('id', detallesEquipo.id);

    setSavingSupremoConfig(false);

    if (error) {
      setSupremoFeedback({
        tone: 'error',
        message: `No fue posible guardar la configuracion de Supremo: ${error.message}`,
      });
      return;
    }

    syncEquipoInState(detallesEquipo.id, payload);
    setSupremoDraft({
      enabled: supremoDraft.enabled,
      supremoAlias: normalizedAlias,
      supremoId: normalizedSupremoId,
    });
    setSupremoFeedback({
      tone: 'success',
      message: 'La configuracion de acceso remoto quedo guardada en el equipo.',
    });
  };

  const launchSupremo = async () => {
    if (!detallesEquipo) {
      return;
    }

    setLaunchingSupremo(true);
    setSupremoFeedback(null);
    setSupremoModal(null);

    try {
      const launchSession = await createSupremoLaunchSession(detallesEquipo.id);
      const didOpenClient = await attemptSupremoClientLaunch(launchSession.launchUrl || '');

      if (!didOpenClient) {
        setSupremoModal({
          tone: 'warning',
          title: 'No pudimos confirmar la apertura de Supremo',
          message:
            'Orion intento abrir el cliente local de Supremo, pero esta computadora no cambio de foco ni oculto la ventana. Esto suele pasar cuando Supremo no esta instalado o el sistema bloqueo el protocolo.',
          details: [
            'Verifica que Supremo este instalado en esta computadora.',
            'Confirma que el sistema permita abrir enlaces del tipo supremo://.',
            'Si Supremo abre pero solicita una clave, usa la contrasena compartida configurada para estos equipos.',
          ],
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible iniciar la conexion remota.';
      setSupremoModal({
        tone: 'error',
        title: 'No fue posible iniciar la conexion remota',
        message,
        details: [
          'Revisa que el Supremo ID del equipo este guardado correctamente.',
          'Verifica que Supabase y la Edge Function local sigan activas.',
          'Si el problema continua, intenta guardar la configuracion nuevamente antes de reintentar.',
        ],
      });
    } finally {
      setLaunchingSupremo(false);
    }
  };

  const filteredEquipos = equipos.filter(eq => {
    const term = searchQuery.toLowerCase();
    const matchesSerie = eq.numero_serie?.toLowerCase().includes(term);
    const matchesCliente = eq.clientes?.razon_social?.toLowerCase().includes(term);
    return matchesSerie || matchesCliente;
  });

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3>Buscador de Equipos (Administración)</h3>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <input
          type="text"
          placeholder="Buscar por número de serie o nombre del cliente..."
          className="input-field"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ width: '100%', maxWidth: '600px' }}
        />
      </div>

      {loading ? (
        <p>Cargando lista de asignaciones y clientes...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredEquipos.map(eq => {
            const showroomPreset = getSupremoShowroomPreset(eq.numero_serie);
            const remoteReady = Boolean(sanitizeSupremoId(String(eq.supremo_id || showroomPreset?.supremoId || '')));

            return (
              <div
                key={eq.id}
                style={{ padding: '1.5rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', cursor: 'pointer', transition: 'all 0.2s ease' }}
                className="card-hover"
                onClick={() => openDetallesModal(eq)}
              >
                <div>
                  <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--primary-color)' }}>{eq.clientes?.razon_social || 'Cliente sin registrar en base de datos'}</h4>
                  <p style={{ margin: '0', color: 'var(--text-secondary)' }}><strong>No. Serie:</strong> {eq.numero_serie} {eq.modelo ? `| Modelo: ${eq.modelo}` : ''}</p>
                  <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', fontSize: '0.9rem' }}>
                    <span><strong>Fecha Inicio:</strong> {eq.fecha_inicio || 'N/D'}</span>
                    {!eq.fecha_fin && <span><strong>Término de Servicio Estimado:</strong> {eq.termino_garantia || 'N/D'}</span>}
                    {eq.fecha_fin && <span style={{ color: 'var(--error-color)' }}><strong>Terminó:</strong> {eq.fecha_fin}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', alignItems: 'flex-end', minWidth: '96px', gap: '0.85rem' }}>
                  <div style={{ minHeight: '40px', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', width: '100%' }}>
                    {remoteReady ? (
                      <img
                        src={SUPREMO_ICON_URL}
                        alt="Supremo listo"
                        style={{ width: '30px', height: '30px', objectFit: 'contain', filter: 'drop-shadow(0 10px 18px rgba(18,22,27,0.14))' }}
                      />
                    ) : null}
                  </div>
                  <button
                    className={`button-primary ${eq.fecha_fin ? 'inactive' : ''}`}
                    disabled={eq.fecha_fin ? true : false}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEquipo(eq);
                      setTerminarModalOpen(true);
                    }}
                  >
                    {eq.fecha_fin ? 'Servicio Finalizado' : 'Terminar Servicio'}
                  </button>
                </div>
              </div>
            )
          })}
          {filteredEquipos.length === 0 && <p>No se encontraron equipos que coincidan con "{searchQuery}".</p>}
        </div>
      )}

      {detallesModalOpen && detallesEquipo && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem', backdropFilter: 'blur(5px)' }}
          onClick={closeDetallesModal}
        >
          <div
            className="card card-scroll-shell"
            style={{ maxWidth: '650px', width: 'min(650px, calc(100vw - 2.5rem))', border: '1px solid var(--border-color)', maxHeight: '90vh', padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-scroll-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <h3 style={{ color: 'var(--primary-color)' }}>Detalles Integrales del Equipo</h3>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem' }}
                onClick={closeDetallesModal}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.5rem' }}>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>No. de Serie / Modelo</h4>
                <p style={{ fontWeight: '500', fontSize: '1.1rem', margin: '0' }}>{detallesEquipo.numero_serie}</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--primary-color)', margin: '0' }}>{detallesEquipo.modelo ? `Modelo: ${detallesEquipo.modelo}` : 'Modelo Genérico'}</p>
              </div>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Cliente (Razón Social)</h4>
                <p style={{ fontWeight: '500' }}>{detallesEquipo.clientes?.razon_social || 'Desconocido / N.D.'}</p>
              </div>



              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Fecha de Instalación / Comienzo</h4>
                <p>{detallesEquipo.fecha_inicio || 'N.D.'}</p>
              </div>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Término de Servicio (Estimado)</h4>
                <p>{detallesEquipo.termino_garantia || 'N.D.'}</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Ingeniero que Instaló / Asignó</h4>
                <p style={{ color: 'var(--primary-color)' }}>{detallesEquipo.asigna?.nombre_completo || 'Administración Central'}</p>
              </div>
              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Ingeniero que Retiró</h4>
                <p style={{ color: 'var(--text-secondary)' }}>{detallesEquipo.retira?.nombre_completo || 'Vigente / N.D.'}</p>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Doc. de Asignación / Contrato</h4>
                <span style={{
                  display: 'inline-block',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  background: detallesEquipo.doc_asignacion ? 'var(--success-color)' : 'rgba(255,255,255,0.05)',
                  color: detallesEquipo.doc_asignacion ? '#000' : 'var(--text-secondary)',
                  fontSize: '0.8rem', fontWeight: '500'
                }}>
                  {detallesEquipo.doc_asignacion ? 'Documento Entregado' : 'No Registrado'}
                </span>
              </div>

              <div>
                <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Estado y Fecha Fin</h4>
                {detallesEquipo.fecha_fin ? (
                  <span style={{ color: 'var(--error-color)', fontWeight: 'bold' }}>Finalizado el {detallesEquipo.fecha_fin}</span>
                ) : (
                  <span style={{ color: 'var(--success-color)' }}>Servicio Activo</span>
                )}
              </div>

              {detallesEquipo.fecha_fin && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Doc. Terminación de Servicio / Baja</h4>
                  <span style={{
                    display: 'inline-block',
                    padding: '0.2rem 0.6rem',
                    borderRadius: '4px',
                    background: detallesEquipo.doc_terminacion ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    fontSize: '0.8rem', fontWeight: '500'
                  }}>
                    {detallesEquipo.doc_terminacion ? 'Documento PDF Registrado' : 'No tiene acta / Faltante'}
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              {documentFeedback && (
                <div
                  style={{
                    marginBottom: '1rem',
                    padding: '0.85rem 1rem',
                    borderRadius: '12px',
                    border: `1px solid ${documentFeedback.tone === 'error' ? 'rgba(243, 39, 53, 0.22)' : 'rgba(76, 207, 147, 0.24)'}`,
                    background:
                      documentFeedback.tone === 'error'
                        ? 'linear-gradient(180deg, rgba(255, 245, 246, 0.96), rgba(255, 238, 240, 0.92))'
                        : 'linear-gradient(180deg, rgba(245, 255, 250, 0.96), rgba(238, 252, 244, 0.92))',
                    color: documentFeedback.tone === 'error' ? 'var(--brand-red-ink)' : '#1f7f63',
                    fontSize: '0.9rem',
                  }}
                >
                  {documentFeedback.message}
                </div>
              )}

              <div className="equipment-doc-toolbar">
                <h4 className="equipment-doc-toolbar-title">Documentacion y capacitacion</h4>
                <div className="equipment-doc-toolbar-actions">
                <div className="equipment-doc-action-group equipment-doc-action-group--install">
                  <input
                    ref={instalacionInputRef}
                    type="file"
                    accept="application/pdf"
                    className="equipment-doc-hidden-input"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] || null;
                      if (nextFile) {
                        void uploadEquipmentDocument('instalacion', nextFile);
                      }
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    title={detallesEquipo.doc_instalacion_path ? 'Ver documento de instalación' : 'Cargar documento de instalación'}
                    className={`equipment-doc-action-button equipment-doc-action-button--primary ${
                      detallesEquipo.doc_instalacion ? 'equipment-doc-action-button--loaded-install' : ''
                    }`}
                    disabled={uploadingDocumentKind === 'instalacion'}
                    onClick={() => {
                      if (detallesEquipo.doc_instalacion_path) {
                        window.open(buildPublicDocumentUrl(detallesEquipo.doc_instalacion_path), '_blank', 'noopener,noreferrer');
                        return;
                      }
                      instalacionInputRef.current?.click();
                    }}
                  >
                    {detallesEquipo.doc_instalacion_path ? <EyeIcon size={20} /> : <InstallationIcon size={20} />}
                  </button>
                </div>

                <div className="equipment-doc-action-group equipment-doc-action-group--training">
                  <input
                    ref={capacitacionInputRef}
                    type="file"
                    accept="application/pdf"
                    className="equipment-doc-hidden-input"
                    onChange={(event) => {
                      const nextFile = event.target.files?.[0] || null;
                      if (nextFile) {
                        void uploadEquipmentDocument('capacitacion', nextFile);
                      }
                      event.target.value = '';
                    }}
                  />
                  <button
                    type="button"
                    title={detallesEquipo.doc_capacitacion_path ? 'Ver documento de capacitación' : 'Cargar documento de capacitación'}
                    className={`equipment-doc-action-button equipment-doc-action-button--primary ${
                      detallesEquipo.doc_capacitacion ? 'equipment-doc-action-button--loaded-training' : ''
                    }`}
                    disabled={uploadingDocumentKind === 'capacitacion'}
                    onClick={() => {
                      if (detallesEquipo.doc_capacitacion_path) {
                        window.open(buildPublicDocumentUrl(detallesEquipo.doc_capacitacion_path), '_blank', 'noopener,noreferrer');
                        return;
                      }
                      capacitacionInputRef.current?.click();
                    }}
                  >
                    {detallesEquipo.doc_capacitacion_path ? <EyeIcon size={20} /> : <TrainingDocumentIcon size={20} />}
                  </button>
                  <button
                    type="button"
                    title="Aplicar examen de capacitación"
                    className={`equipment-doc-action-button ${getEquipmentTrainingExamDefinition(detallesEquipo.modelo) ? 'equipment-doc-action-button--loaded-training' : ''}`}
                    disabled={!getEquipmentTrainingExamDefinition(detallesEquipo.modelo)}
                    onClick={openTrainingExam}
                  >
                    <ExamIcon />
                  </button>
                </div>
                </div>
              </div>

              {!loadingTrainingExamAttempts && trainingExamAttempts.length > 0 ? (
                <div className="equipment-training-attempts">
                    {trainingExamAttempts.map((attempt) => (
                      <div
                        key={attempt.id}
                        className="equipment-training-attempt-chip"
                      >
                        <strong className="equipment-training-attempt-name">{attempt.participant_name}</strong>
                        <span className="equipment-training-attempt-role">
                          {attempt.participant_role || 'Sin puesto especificado'}
                        </span>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem', fontSize: '1.1rem' }}>Ubicación Física del Equipo</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                <div>
                  <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>País / Estado</h4>
                  <p style={{ margin: 0, fontWeight: '500' }}>
                    {detallesEquipo.pais || 'N.D.'} {detallesEquipo.estado ? `- ${detallesEquipo.estado}` : ''}
                  </p>
                </div>
                <div>
                  <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Ciudad / Municipio</h4>
                  <p style={{ margin: 0, fontWeight: '500' }}>
                    {detallesEquipo.ciudad || detallesEquipo.municipio ? `${detallesEquipo.ciudad || ''} ${detallesEquipo.municipio ? `(${detallesEquipo.municipio})` : ''}` : 'N.D.'}
                  </p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.3rem' }}>Dirección Completa</h4>
                  <p style={{ margin: 0 }}>
                    <span style={{ fontWeight: '500' }}>{detallesEquipo.direccion || 'Domicilio no registrado'}</span>
                    {detallesEquipo.colonia && <span>, Col. {detallesEquipo.colonia}</span>}
                    {detallesEquipo.codigo_postal && <span>, C.P. {detallesEquipo.codigo_postal}</span>}
                  </p>
                </div>
              </div>
            </div>

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
              <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem', fontSize: '1.1rem' }}>Acceso Remoto Supremo</h4>
              {(() => {
                const showroomPreset = getSupremoShowroomPreset(detallesEquipo.numero_serie);
                const normalizedSerial = normalizeSerialLookup(detallesEquipo.numero_serie);

                return (
                  <>
                    {showroomPreset && (
                      <div style={{ marginBottom: '1rem', padding: '0.9rem 1rem', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(188,17,43,0.08)', color: 'var(--text-secondary)' }}>
                        <strong style={{ color: 'var(--primary-color)' }}>{showroomPreset.alias}</strong>
                        <span style={{ marginLeft: '0.45rem' }}>
                          preset de showroom detectado para la serie {normalizedSerial}. ID sugerido: {showroomPreset.supremoId}
                        </span>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
                      <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Alias remoto</h4>
                        <input
                          type="text"
                          className="input-field"
                          value={supremoDraft.supremoAlias}
                          placeholder="Ej. BA400 Showroom"
                          onChange={(e) => setSupremoDraft((current) => ({ ...current, supremoAlias: e.target.value }))}
                        />
                      </div>
                      <div>
                        <h4 style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', textTransform: 'uppercase', marginBottom: '0.35rem' }}>Supremo ID</h4>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="input-field"
                          value={supremoDraft.supremoId}
                          placeholder="ID de 9 digitos"
                          onChange={(e) =>
                            setSupremoDraft((current) => ({
                              ...current,
                              supremoId: sanitizeSupremoId(e.target.value),
                            }))
                          }
                        />
                      </div>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginTop: '1rem', color: 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={supremoDraft.enabled}
                        onChange={(e) =>
                          setSupremoDraft((current) => ({
                            ...current,
                            enabled: e.target.checked,
                          }))
                        }
                      />
                      Habilitar apertura remota desde Orion para este equipo
                    </label>

                    <p style={{ marginTop: '0.85rem', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                      Si editas el ID o el alias, guarda antes de abrir la sesion para que la Edge Function use el dato correcto.
                    </p>

                    <p style={{ marginTop: '0.55rem', marginBottom: 0, color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                      La apertura actual usa el cliente local de Supremo instalado en esta computadora.
                    </p>

                    {supremoFeedback && (
                      <div
                        style={{
                          marginTop: '1rem',
                          padding: '0.85rem 1rem',
                          borderRadius: '10px',
                          border: `1px solid ${supremoFeedback.tone === 'error' ? 'rgba(255,107,107,0.28)' : 'rgba(46,204,113,0.28)'}`,
                          background: supremoFeedback.tone === 'error' ? 'rgba(255,107,107,0.08)' : 'rgba(46,204,113,0.10)',
                          color: supremoFeedback.tone === 'error' ? 'var(--error-color)' : 'var(--success-color)',
                          fontSize: '0.9rem',
                        }}
                      >
                        {supremoFeedback.message}
                      </div>
                    )}

                    <div style={{ marginTop: '1.25rem', display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
                      <button
                        className="button-primary"
                        disabled={savingSupremoConfig}
                        onClick={saveSupremoConfig}
                      >
                        {savingSupremoConfig ? 'Guardando...' : 'Guardar configuracion'}
                      </button>
                      <button
                        className={`button-primary ${!supremoDraft.enabled || !sanitizeSupremoId(supremoDraft.supremoId) ? 'inactive' : ''}`}
                        disabled={!supremoDraft.enabled || !sanitizeSupremoId(supremoDraft.supremoId) || launchingSupremo}
                        onClick={launchSupremo}
                      >
                        {launchingSupremo ? 'Abriendo Supremo...' : 'Conectar con Supremo'}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

            <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className="button-primary"
                style={{ background: 'var(--text-secondary)', color: 'var(--bg-color)', border: 'none' }}
                onClick={() => {
                  if (!showServicios) {
                    setShowServicios(true);
                    fetchEquipoServicios(detallesEquipo.numero_serie);
                  } else {
                    setShowServicios(false);
                  }
                }}
              >
                {showServicios ? '△ Ocultar Servicios' : '▽ Historial de Servicios'}
              </button>
              <button
                className="button-primary"
                onClick={closeDetallesModal}
              >
                Cerrar Vista
              </button>
            </div>

            {showServicios && (
              <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
                <h4 style={{ color: 'var(--primary-color)', marginBottom: '1rem' }}>Desglose de Servicios Realizados</h4>
                {loadingServicios ? (
                  <p>Cargando historial maestro...</p>
                ) : equipoServicios.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Este equipo no tiene actas ni historial de servicio registrado.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {equipoServicios.map(serv => (
                      <div
                        key={serv.id}
                        style={{
                          background:
                            'radial-gradient(circle at top right, rgba(var(--clinical-rgb), 0.08), transparent 28%), linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(245, 248, 251, 0.82))',
                          padding: '1rem',
                          borderRadius: '18px',
                          border: '1px solid var(--surface-outline)',
                          borderLeft: '4px solid var(--primary-color)',
                          boxShadow: 'var(--surface-shadow)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                          <strong style={{ fontSize: '0.95rem' }}>
                            <span style={{ color: 'var(--primary-color)', marginRight: '0.5rem' }}>
                              {serv.ticket_id ? `# TKT-${serv.ticket_id.substring(0, 8).toUpperCase()}` : (serv.id_legacy ? `# LEG-${serv.id_legacy}` : '# SRV-IND')}
                            </span>
                            | {serv.fecha_servicio || new Date(serv.creado_en).toLocaleDateString()}
                          </strong>
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Ingeniero Asignado: {serv.profiles?.nombre_completo || 'Sistema Histórico (Extendido)'}</span>
                        </div>
                        <p style={{ margin: '0.5rem 0', fontWeight: '500', fontSize: '0.9rem' }}>Motivo / Asunto: <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>{serv.motivo}</span></p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem', marginTop: '1rem' }}>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--error-color)', display: 'block', fontWeight: 'bold' }}>Avería [CDA: {serv.cda}]</span>
                            <span style={{ fontSize: '0.85rem' }}>{serv.averias_catalogo ? serv.averias_catalogo.detalle_averia : 'Avería de Texto Libre'}</span>
                          </div>
                          <div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--success-color)', display: 'block', fontWeight: 'bold' }}>Solución [CDS: {serv.cds}]</span>
                            <span style={{ fontSize: '0.85rem' }}>{serv.soluciones_catalogo ? serv.soluciones_catalogo.detalle_solucion : 'Solución de Texto Libre'}</span>
                          </div>
                        </div>

                        {serv.servicios_refacciones && serv.servicios_refacciones.length > 0 && (
                          <div
                            style={{
                              marginTop: '1rem',
                              padding: '0.85rem 1rem',
                              borderRadius: '14px',
                              border: '1px solid rgba(124, 136, 149, 0.14)',
                              background:
                                'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(244, 247, 250, 0.78))',
                            }}
                          >
                            <strong style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.45rem' }}>Refacciones Utilizadas:</strong>
                            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                              {serv.servicios_refacciones.map((sr: any, idx: number) => (
                                <li key={idx}><strong>[{sr.refacciones_catalogo?.codigo_refaccion}]</strong> x{sr.cantidad} - {sr.refacciones_catalogo?.descripcion}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {supremoModal && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(3,5,8,0.76)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100, padding: '1rem', backdropFilter: 'blur(8px)' }}
          onClick={() => setSupremoModal(null)}
        >
          <div
            className="card"
            style={{ maxWidth: '560px', width: '100%', border: `1px solid ${supremoModal.tone === 'error' ? 'rgba(255,107,107,0.22)' : 'rgba(245,166,35,0.22)'}`, boxShadow: '0 28px 70px rgba(0,0,0,0.34)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <div style={{ display: 'inline-flex', padding: '0.22rem 0.6rem', borderRadius: '999px', background: supremoModal.tone === 'error' ? 'rgba(255,107,107,0.12)' : 'rgba(245,166,35,0.12)', color: supremoModal.tone === 'error' ? 'var(--error-color)' : '#f5a623', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                  {supremoModal.tone === 'error' ? 'Error de lanzamiento' : 'Revision manual'}
                </div>
                <h3 style={{ margin: '0.8rem 0 0.45rem 0', color: 'var(--primary-color)' }}>{supremoModal.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{supremoModal.message}</p>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                onClick={() => setSupremoModal(null)}
              >
                &times;
              </button>
            </div>

            <div style={{ padding: '1rem 1rem 0.9rem 1rem', borderRadius: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ margin: '0 0 0.7rem 0', fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Que revisar
              </p>
              <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {supremoModal.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="button-primary" onClick={() => setSupremoModal(null)}>
                Entendido
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {trainingExamModal && detallesEquipo && createPortal(
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(8, 12, 19, 0.72)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1150,
            padding: '1rem',
            backdropFilter: 'blur(10px)',
            overflow: 'hidden',
            overscrollBehavior: 'contain',
          }}
          onClick={() => setTrainingExamModal(null)}
        >
          <div
            className="card training-exam-modal-shell"
            style={{ maxWidth: '920px', width: 'min(920px, calc(100vw - 2.5rem))', maxHeight: '92vh', padding: 0, overflow: 'hidden', border: '1px solid var(--surface-outline)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="training-exam-modal-scroll">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div
                  style={{
                    display: 'inline-flex',
                    padding: '0.24rem 0.7rem',
                    borderRadius: '999px',
                    background: 'linear-gradient(135deg, rgba(var(--bioprocess-rgb), 0.16), rgba(var(--environmental-blue-rgb), 0.1))',
                    border: '1px solid rgba(var(--bioprocess-rgb), 0.26)',
                    color: '#8b5d17',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  Evaluacion de capacitacion
                </div>
                <h3 style={{ margin: '0.8rem 0 0.35rem 0', color: 'var(--primary-color)' }}>{trainingExamModal.definition.title}</h3>
                <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65 }}>
                  Equipo {detallesEquipo.numero_serie}
                  {detallesEquipo.modelo ? ` · ${detallesEquipo.modelo}` : ''}
                  {' · '}
                  {trainingExamModal.definition.sourceLabel}
                </p>
              </div>
              <button
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                onClick={() => setTrainingExamModal(null)}
              >
                &times;
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Nombre de la persona evaluada
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={trainingExamModal.participantName}
                  onChange={(event) =>
                    setTrainingExamModal((current) =>
                      current
                        ? {
                            ...current,
                            participantName: event.target.value,
                            validationMessage: null,
                          }
                        : current,
                    )
                  }
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Puesto o area
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={trainingExamModal.participantRole}
                  onChange={(event) =>
                    setTrainingExamModal((current) =>
                      current
                        ? {
                            ...current,
                            participantRole: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="Quimico, responsable de proceso, operador..."
                />
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '0.35rem', fontSize: '0.82rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                  Institucion o cliente
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={trainingExamModal.participantCompany}
                  onChange={(event) =>
                    setTrainingExamModal((current) =>
                      current
                        ? {
                            ...current,
                            participantCompany: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="Se autocompleta con el cliente del equipo"
                />
              </div>
            </div>

            {trainingExamModal.validationMessage ? (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '0.85rem 1rem',
                  borderRadius: '12px',
                  border: '1px solid rgba(var(--brand-red-rgb), 0.22)',
                  background: 'linear-gradient(180deg, rgba(255, 245, 246, 0.96), rgba(255, 238, 240, 0.92))',
                  color: 'var(--brand-red-ink)',
                  fontSize: '0.9rem',
                }}
              >
                {trainingExamModal.validationMessage}
              </div>
            ) : null}

            {trainingExamModal.result ? (
              <div
                style={{
                  marginBottom: '1rem',
                  padding: '1rem 1.1rem',
                  borderRadius: '16px',
                  border: `1px solid ${
                    trainingExamModal.result.passed ? 'rgba(var(--food-rgb), 0.26)' : 'rgba(var(--brand-red-rgb), 0.22)'
                  }`,
                  background: trainingExamModal.result.passed
                    ? 'linear-gradient(180deg, rgba(245, 255, 250, 0.96), rgba(238, 252, 244, 0.92))'
                    : 'linear-gradient(180deg, rgba(255, 246, 247, 0.96), rgba(255, 239, 241, 0.92))',
                }}
              >
                <strong style={{ display: 'block', fontSize: '1rem', color: trainingExamModal.result.passed ? '#1f7f63' : 'var(--brand-red-ink)' }}>
                  {trainingExamModal.result.passed ? 'Capacitacion aprobada' : 'Capacitacion con refuerzo requerido'}
                </strong>
                <span style={{ display: 'block', marginTop: '0.35rem', color: 'var(--text-secondary)' }}>
                  Resultado guardado: {trainingExamModal.result.score} de {trainingExamModal.result.total} respuestas correctas.
                </span>
              </div>
            ) : null}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              {trainingExamModal.definition.questions.map((question, index) => (
                <div
                  key={question.id}
                  style={{
                    padding: '1rem',
                    borderRadius: '16px',
                    border: '1px solid var(--surface-outline)',
                    background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(244, 247, 250, 0.82))',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '0.96rem' }}>{index + 1}. {question.prompt}</strong>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>{question.reference}</span>
                  </div>
                  <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.65rem' }}>
                    {question.options.map((option, optionIndex) => {
                      const selected = trainingExamModal.answers[question.id] === optionIndex;
                      return (
                        <button
                          key={`${question.id}-${optionIndex}`}
                          type="button"
                          disabled={Boolean(trainingExamModal.result)}
                          onClick={() =>
                            setTrainingExamModal((current) =>
                              current
                                ? {
                                    ...current,
                                    answers: {
                                      ...current.answers,
                                      [question.id]: optionIndex,
                                    },
                                    validationMessage: null,
                                  }
                                : current,
                            )
                          }
                          style={{
                            textAlign: 'left',
                            padding: '0.8rem 0.9rem',
                            borderRadius: '14px',
                            border: selected ? '1px solid rgba(var(--environmental-blue-rgb), 0.34)' : '1px solid rgba(124, 136, 149, 0.16)',
                            background: selected
                              ? 'linear-gradient(180deg, rgba(var(--environmental-blue-rgb), 0.12), rgba(var(--environmental-blue-rgb), 0.06))'
                              : 'rgba(255, 255, 255, 0.88)',
                            color: 'var(--text-primary)',
                            cursor: trainingExamModal.result ? 'default' : 'pointer',
                            transition: 'transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease',
                            boxShadow: selected ? '0 12px 24px rgba(var(--environmental-blue-rgb), 0.12)' : 'none',
                            opacity: trainingExamModal.result ? 0.88 : 1,
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', gap: '0.85rem', flexWrap: 'wrap' }}>
              <button className="button-primary inactive" onClick={() => setTrainingExamModal(null)}>
                Cerrar
              </button>
              <button
                className="button-primary"
                disabled={trainingExamModal.submitting || Boolean(trainingExamModal.result)}
                onClick={() => void submitTrainingExam()}
              >
                {trainingExamModal.submitting ? 'Guardando evaluacion...' : trainingExamModal.result ? 'Evaluacion guardada' : 'Guardar evaluacion'}
              </button>
            </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {terminarModalOpen && selectedEquipo && createPortal(
        <div
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '1rem' }}
          onClick={() => { setTerminarModalOpen(false); setSelectedEquipo(null); setPdfFile(null); }}
        >
          <div
            className="card"
            style={{ maxWidth: '500px', width: '100%', border: '1px solid var(--border-color)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Terminar Servicio</h3>
            <p><strong>N. Serie:</strong> {selectedEquipo.numero_serie}</p>
            <p><strong>Cliente:</strong> {selectedEquipo.clientes?.razon_social || 'Desconocido'}</p>
            <hr style={{ margin: '1rem 0', borderColor: 'var(--border-color)' }} />

            <p style={{ marginBottom: '1.5rem', fontSize: '0.95rem' }}>Genera un formato prellenado para firma o sube manualmente el Acta de Terminación escaneada (PDF).</p>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', flexDirection: 'column' }}>
              <button
                className="button-primary"
                onClick={async () => {
                  const doc = new jsPDF();
                  doc.text("ACTA DE TERMINACION DE SERVICIO Y RETIRO DE EQUIPO", 20, 20);
                  doc.text(`Fecha: ${new Date().toLocaleDateString()}`, 20, 30);
                  doc.text(`Cliente: ${selectedEquipo.clientes?.razon_social || 'Desconocido'}`, 20, 40);
                  doc.text(`Numero de Serie: ${selectedEquipo.numero_serie}`, 20, 50);
                  doc.text(`Fecha Instalacion: ${selectedEquipo.fecha_inicio || 'N/D'}`, 20, 60);
                  doc.text(`Firma del Cliente: _________________________`, 20, 100);
                  doc.text(`Firma del Tecnico / Representante: _________________________`, 20, 130);
                  doc.save(`Acta_Terminacion_${selectedEquipo.numero_serie}.pdf`);
                }}
              >
                ⬇️ Descargar Formato Prellenado (PDF)
              </button>
              <label style={{ fontWeight: 'bold', marginTop: '1rem' }}>Subir PDF Finalizado:</label>
              <input
                type="file"
                accept="application/pdf"
                className="input-field"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setPdfFile(e.target.files[0]);
                  }
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button
                className="button-primary"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
                onClick={() => { setTerminarModalOpen(false); setSelectedEquipo(null); setPdfFile(null); }}
              >
                Cancelar
              </button>
              <button
                className="button-primary"
                disabled={!pdfFile || uploading}
                onClick={async () => {
                  setUploading(true);
                  const fileName = `terminacion_${selectedEquipo.numero_serie.replace(/\//g, '-')}_${Date.now()}.pdf`;

                  // 1. Upload PDF
                  const { error: uploadError } = await supabase.storage.from('documentos').upload(fileName, pdfFile!);
                  if (uploadError) {
                    alert('Error al subir el archivo a Supabase: ' + uploadError.message);
                    setUploading(false);
                    return;
                  }

                  // 2. Fetch proper UUID for update
                  const currentUserResp = await supabase.auth.getUser();
                  const uid = currentUserResp.data.user?.id;

                  // 3. Update Equipos Table
                  const { error: dbError } = await supabase.from('equipos').update({
                    doc_terminacion: true,
                    fecha_fin: new Date().toISOString().split('T')[0],
                    empleado_retira: uid
                  }).eq('id', selectedEquipo.id);

                  if (dbError) {
                    alert('Error al actualizar registro en base de datos: ' + dbError.message);
                  } else {
                    alert('¡Documento guardado y Servicio Terminado exitosamente!');
                    setTerminarModalOpen(false);
                    setSelectedEquipo(null);
                    setPdfFile(null);
                    fetchEquipos();
                  }
                  setUploading(false);
                }}
              >
                {uploading ? 'Procesando...' : 'Subir y Terminar'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
