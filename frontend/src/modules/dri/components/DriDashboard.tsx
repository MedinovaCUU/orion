import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { DRI_GRAPH_CONFIG } from './DriGraph3D';
import DriAdvisoryPicker from './DriAdvisoryPicker';
import DriCommandStrip from './DriCommandStrip';
import DriContrastMatrix from './DriContrastMatrix';
import DriEvidencePanel from './DriEvidencePanel';
import DriHypothesisDock from './DriHypothesisDock';
import DriInputPanel from './DriInputPanel';
import DriRelationStage from './DriRelationStage';
import DriSourcesStrip from './DriSourcesStrip';
import Ba400DiagnosticViewer from '../model3d/Ba400DiagnosticViewer';
import { getLocalDriCatalog, loadDriCatalog, loadDriHistory, persistDriCase, uploadDriEvidenceAsset } from '../driData';
import { toLocalIsoDate } from '../utils/lotDates';
import { DRI_VALIDATION_FIXTURES, runDriEngine, runDriValidationFixtures } from '../driEngine';
import { useDriContextSources } from '../hooks/useDriContextSources';
import {
  buildReagentSearchText,
  getCanonicalReagentKey,
  getReagentDisplayCode,
  getReagentDisplayName,
  reagentSelectionScore,
} from '../knowledge/reagentIdentity';
import { buildReagentProfiles } from '../knowledge/reagentRelations';
import {
  buildBa400HierarchyGraph,
  DRI_REAGENT_STATE_COLORS,
  getBa400SystemNodeIdsForSignal,
  getDriDifferentialVisualStrength,
  getDriSignalCategoryColor,
} from '../knowledge/ba400SubsystemHierarchy';
import { buildObservationBlockFromEvidence, runDriEvidenceOcr } from '../utils/driEvidenceOcr';
import { createDriLogger, withQuietDriLogging } from '../utils/driLogging';
import { assessQcReference, findQcReferenceById, getMatchingQcReferences } from '../utils/qcReferenceUtils';
import { DRI_SOURCE_LABELS } from '../utils/contextSources';
import { getValidatedSession } from '../../../supabaseClient';
import type {
  DriCaseFormState,
  DriCatalog,
  DriDiagnosticCaseRecord,
  DriEngineResult,
  DriEvidenceArtifact,
  DriGraphEdge,
  DriGraphNode,
  DriHypothesisResult,
  DriQcAssessment,
  DriQcReference,
  DriRelationSignal,
  DriReagent,
  DriReagentMeasurementInput,
  DriReagentProfile,
  DriServiceTestInput,
} from '../types/dri.types';
import type { DriLiveState, DriReagentState, DriShellControls } from './driWorkbench.types';
import { PanelLoader } from '../../../components/OrionLoader';
import '../dri.workbench.css';

const createEmptyReagentMeasurement = (reagentId: string): DriReagentMeasurementInput => ({
  reagentId,
  obtainedValue: '',
  blankAbsorbance: '',
  selectedQcReferenceId: null,
  expectedValue: null,
  unit: null,
  blankUnit: 'A',
  source: 'manual',
  updatedAt: null,
});

const createInitialFormState = (): DriCaseFormState => ({
  equipmentModel: 'BA400',
  serialNumber: '',
  eventDate: toLocalIsoDate(new Date().toISOString()) || '',
  eventType: 'qc_out_of_range',
  failureDirection: 'high',
  reagentLot: '',
  controlLot: '',
  calibratorLot: '',
  calibratorName: '',
  controlLevel: 'not_applicable',
  selectedQcReferenceId: '',
  expectedValue: '',
  obtainedValue: '',
  reagentExpiryDate: '',
  reagentOpenedAt: '',
  ambientTemperatureC: '',
  observations: '',
  failedReagentIds: [],
  correctReagentIds: [],
  reagentMeasurements: {},
  serviceTests: [],
  evidenceItems: [],
  signals: {
    intermittentPattern: false,
    normalCurvesObserved: false,
    opticalRejectObserved: false,
    waterSensitivePattern: false,
  },
  bplEvidence: null,
});

const reagentNodeId = (reagentId: string, kind: 'failed' | 'correct') => `reagent:${reagentId}:${kind}`;
const signalNodeId = (signalId: string) => `signal:${signalId}`;
const serviceTestPriority: Record<DriServiceTestInput['result'], number> = {
  not_run: 0,
  normal: 1,
  passed: 1,
  adjusted: 2,
  abnormal: 3,
  failed: 3,
};

const escapeForRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const trimFileExtension = (value: string) => value.replace(/\.[a-z0-9]+$/i, '').trim();

const replaceObservationBlock = (observations: string, itemId: string, nextBlock: string) => {
  const withoutExisting = observations
    .replace(new RegExp(`\\[DRI_OCR:${escapeForRegex(itemId)}\\][^\\n]*(?:\\n|$)`, 'g'), '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!nextBlock.trim()) {
    return withoutExisting;
  }

  return [withoutExisting, nextBlock.trim()].filter(Boolean).join('\n\n').trim();
};

const mergeServiceTests = (currentTests: DriServiceTestInput[], incomingTests: DriEvidenceArtifact['derivedData']) => {
  if (!incomingTests?.serviceTests.length) {
    return currentTests;
  }

  return incomingTests.serviceTests.reduce<DriServiceTestInput[]>((accumulator, incoming) => {
    const existingIndex = accumulator.findIndex((test) => test.utilityId === incoming.utilityId);
    if (existingIndex === -1) {
      accumulator.push({
        id: crypto.randomUUID(),
        utilityId: incoming.utilityId,
        label: incoming.label,
        result: incoming.result,
        observedValue: '',
        notes: incoming.notes,
      });
      return accumulator;
    }

    const current = accumulator[existingIndex];
    const nextResult =
      serviceTestPriority[incoming.result] >= serviceTestPriority[current.result]
        ? incoming.result
        : current.result;
    const nextNotes = [current.notes, incoming.notes].filter(Boolean).join(' | ').slice(0, 500);
    accumulator[existingIndex] = {
      ...current,
      label: current.label || incoming.label,
      result: nextResult,
      notes: nextNotes,
    };
    return accumulator;
  }, [...currentTests]);
};

const mergeEvidenceInsights = (current: DriCaseFormState, item: DriEvidenceArtifact): DriCaseFormState => {
  const observationBlock = buildObservationBlockFromEvidence(item);
  const derivedSignals = item.derivedData?.signalPatch || {};

  return {
    ...current,
    serviceTests: mergeServiceTests(current.serviceTests, item.derivedData),
    signals: {
      intermittentPattern: current.signals.intermittentPattern || Boolean(derivedSignals.intermittentPattern),
      normalCurvesObserved: current.signals.normalCurvesObserved || Boolean(derivedSignals.normalCurvesObserved),
      opticalRejectObserved: current.signals.opticalRejectObserved || Boolean(derivedSignals.opticalRejectObserved),
      waterSensitivePattern: current.signals.waterSensitivePattern || Boolean(derivedSignals.waterSensitivePattern),
    },
    observations: replaceObservationBlock(current.observations, item.id, observationBlock),
  };
};

interface DriEvidenceTaskState {
  busy: boolean;
  message: string;
  error: string | null;
}

const DEMO_ACCOUNT_EMAIL = 'rmontanez@biosystems.com.mx';
const ANCHOR_EVENT_TYPES = new Set<DriCaseFormState['eventType']>([
  'dilution_error',
  'non_linear',
  'poor_repeatability',
  'incoherent_result',
]);

// Misma regla que la clasificación de controles y las botellas del SAT (knowledge/reagentIdentity.ts).
const scoreReagentProfileForSelection = (profile: DriReagentProfile) => reagentSelectionScore(profile.legacy);

const dedupeProfilesByCanonicalKey = (profiles: DriReagentProfile[]) => {
  const canonicalProfiles = new Map<string, DriReagentProfile>();

  profiles.forEach((profile) => {
    const displayCodeKey = getReagentDisplayCode(profile.legacy).trim().toUpperCase();
    const canonicalKey = displayCodeKey || getCanonicalReagentKey(profile.legacy);
    const existing = canonicalProfiles.get(canonicalKey);
    if (!existing) {
      canonicalProfiles.set(canonicalKey, profile);
      return;
    }

    const nextScore = scoreReagentProfileForSelection(profile);
    const currentScore = scoreReagentProfileForSelection(existing);
    if (nextScore > currentScore || (nextScore === currentScore && profile.id.localeCompare(existing.id) < 0)) {
      canonicalProfiles.set(canonicalKey, profile);
    }
  });

  return Array.from(canonicalProfiles.values()).sort((left, right) => {
    const codeCompare = getReagentDisplayCode(left.legacy).localeCompare(getReagentDisplayCode(right.legacy), 'es', {
      sensitivity: 'base',
    });
    if (codeCompare !== 0) {
      return codeCompare;
    }

    return getReagentDisplayName(left.legacy).localeCompare(getReagentDisplayName(right.legacy), 'es', {
      sensitivity: 'base',
    });
  });
};

const GRAPH_SIGNAL_QUOTAS: Partial<Record<DriRelationSignal['category'], number>> = {
  wavelength: 12,
  reaction: 2,
  technique: 3,
  trend: 2,
  scheme: 2,
  r2: 1,
  temperature: 2,
  storage: 2,
  water: 2,
  contamination: 2,
  blank: 2,
  service: 2,
};

const isBroadContextSignal = (signal: DriRelationSignal, selectedCount: number) => {
  const totalCoverage =
    selectedCount > 0
      ? (signal.relatedReagentIds.length + signal.contrastReagentIds.length) / selectedCount
      : 0;

  const isSharedTechnique =
    ['reaction', 'technique', 'scheme'].includes(signal.category) &&
    totalCoverage > 0.58 &&
    signal.correctCoverage > 0.22;

  const weakContrast =
    ['reaction', 'technique', 'scheme'].includes(signal.category) &&
    signal.failedCoverage > 0.35 &&
    signal.failedCoverage - signal.correctCoverage < 0.16;

  return isSharedTechnique || weakContrast;
};

const scoreSignalForGraph = (signal: DriRelationSignal, selectedCount: number) => {
  const broadContextPenalty = isBroadContextSignal(signal, selectedCount) ? 140 : 0;
  return (
    signal.suspicionScore * 0.58 +
    signal.relatedReagentIds.length * 18 +
    signal.failedCoverage * 34 -
    signal.correctCoverage * 8 -
    broadContextPenalty
  );
};

const selectGraphSignals = (signals: DriRelationSignal[], selectedCount: number) => {
  if (!signals.length) return [];

  const perCategory = new Map<DriRelationSignal['category'], DriRelationSignal[]>();
  signals.forEach((signal) => {
    const bucket = perCategory.get(signal.category) || [];
    bucket.push(signal);
    perCategory.set(signal.category, bucket);
  });

  perCategory.forEach((bucket) => {
    bucket.sort((left, right) => scoreSignalForGraph(right, selectedCount) - scoreSignalForGraph(left, selectedCount));
  });

  const wavelengthCount = perCategory.get('wavelength')?.length || 0;
  const maxSignals = Math.min(56, Math.max(20, wavelengthCount + Math.ceil(selectedCount * 0.7)));
  const picked: DriRelationSignal[] = [];
  const used = new Set<string>();

  (perCategory.get('wavelength') || []).forEach((signal) => {
    if (!used.has(signal.id) && picked.length < maxSignals) {
      used.add(signal.id);
      picked.push(signal);
    }
  });

  // Todas las pruebas de servicio deben llegar al cálculo visual de sus sistemas,
  // aunque después no se representen como factores independientes en la esfera.
  (perCategory.get('service') || []).forEach((signal) => {
    if (!used.has(signal.id)) {
      used.add(signal.id);
      picked.push(signal);
    }
  });

  Object.entries(GRAPH_SIGNAL_QUOTAS).forEach(([category, quota]) => {
    if (category === 'wavelength' || category === 'service') {
      return;
    }
    const bucket = perCategory.get(category as DriRelationSignal['category']) || [];
    bucket.slice(0, quota).forEach((signal) => {
      if (!used.has(signal.id) && picked.length < maxSignals && !isBroadContextSignal(signal, selectedCount)) {
        used.add(signal.id);
        picked.push(signal);
      }
    });
  });

  signals
    .slice()
    .sort((left, right) => scoreSignalForGraph(right, selectedCount) - scoreSignalForGraph(left, selectedCount))
    .forEach((signal) => {
      if (!used.has(signal.id) && picked.length < maxSignals && !isBroadContextSignal(signal, selectedCount)) {
        used.add(signal.id);
        picked.push(signal);
      }
    });

  return picked;
};

const pickDemoReagentIds = (catalog: DriCatalog, equipmentModel: DriCaseFormState['equipmentModel']) => {
  const visibleReagents = catalog.reagents.filter((reagent) => !reagent.platforms?.length || reagent.platforms.includes(equipmentModel));
  const entries = visibleReagents.map((reagent) => ({
    id: reagent.id,
    code: getReagentDisplayCode(reagent).toUpperCase(),
    name: getReagentDisplayName(reagent).toUpperCase(),
  }));

  const findIds = (desiredCodes: string[], max: number) => {
    const picked: string[] = [];

    desiredCodes.forEach((desired) => {
      const match = entries.find(
        (entry) =>
          !picked.includes(entry.id) &&
          (entry.code === desired ||
            entry.code.startsWith(`${desired} `) ||
            entry.name === desired ||
            entry.name.includes(desired)),
      );
      if (match) {
        picked.push(match.id);
      }
    });

    if (picked.length < max) {
      entries.forEach((entry) => {
        if (picked.length >= max || picked.includes(entry.id)) {
          return;
        }
        picked.push(entry.id);
      });
    }

    return picked.slice(0, max);
  };

  const failed = findIds(['GLU', 'CHOL', 'LDH', 'MG', 'UREA'], 5);
  const correct = findIds(['ALT', 'AST', 'ALB', 'ADA', 'URIC'], 5).filter((id) => !failed.includes(id));

  return { failed, correct };
};

const inferGraphFactorTier = (signal: DriRelationSignal, index: number) => {
  if (['reaction', 'technique', 'trend', 'scheme', 'r2'].includes(signal.category)) {
    return 1;
  }
  if (['wavelength', 'blank', 'service', 'control'].includes(signal.category)) {
    return 2;
  }
  if (index < 4) {
    return 1;
  }
  if (index < 10) {
    return 2;
  }
  return 3;
};

const buildDemoFormState = (catalog: DriCatalog): DriCaseFormState => {
  const { failed, correct } = pickDemoReagentIds(catalog, 'BA400');
  const reagentMeasurements = [...failed, ...correct].reduce<Record<string, DriReagentMeasurementInput>>((accumulator, reagentId) => {
    accumulator[reagentId] = createEmptyReagentMeasurement(reagentId);
    return accumulator;
  }, {});

  return {
    equipmentModel: 'BA400',
    serialNumber: '8340-DEMO-01',
    eventDate: toLocalIsoDate(new Date().toISOString()) || '',
    eventType: 'qc_out_of_range',
    failureDirection: 'high',
    reagentLot: 'BA400-RGT-2406A',
    controlLot: '0004',
    calibratorLot: 'CAL-BA400-014',
    calibratorName: 'Multi calibrador BAx00',
    controlLevel: 'level_1',
    selectedQcReferenceId: '',
    expectedValue: '39.7',
    obtainedValue: '53.0',
    // Fechas relativas: la demo no debe disparar por sí sola la señal de estabilidad a bordo.
    reagentExpiryDate: new Date(Date.now() + 120 * 86_400_000).toISOString().slice(0, 10),
    reagentOpenedAt: new Date(Date.now() - 9 * 86_400_000).toISOString().slice(0, 10),
    ambientTemperatureC: '27.4',
    observations:
      'Demo BA400: los controles de GLU, CHOL, LDH, MG y UREA salen altos y fuera de rechazo. ALT, AST, ALB, ADA y URIC permanecen correctas. Photometry mostró deriva leve y Washing station dejó duda de arrastre. Curvas mayormente aceptables, sin rechazo óptico continuo.',
    failedReagentIds: failed,
    correctReagentIds: correct,
    reagentMeasurements,
    serviceTests: [
      {
        id: crypto.randomUUID(),
        utilityId: 'photometry',
        label: 'Photometry',
        result: 'abnormal',
        observedValue: 'Deriva 340/505 nm',
        notes: 'Baseline y repetibilidad con dispersión leve en fotometría.',
      },
      {
        id: crypto.randomUUID(),
        utilityId: 'washing_station',
        label: 'Washing station',
        result: 'adjusted',
        observedValue: 'Lavado ajustado',
        notes: 'Se detectó sospecha de carryover bajo y se corrigió prime.',
      },
      {
        id: crypto.randomUUID(),
        utilityId: 'thermostatting',
        label: 'Thermostatting',
        result: 'normal',
        observedValue: '37.0 °C',
        notes: 'Rotor estable durante corrida de verificación.',
      },
      {
        id: crypto.randomUUID(),
        utilityId: 'motors_valves_pumps',
        label: 'Motors, valves and pumps',
        result: 'normal',
        observedValue: 'Sin fuga',
        notes: 'Pipeteo y válvulas sin anomalía evidente.',
      },
      {
        id: crypto.randomUUID(),
        utilityId: 'level_detection',
        label: 'Level detection',
        result: 'normal',
        observedValue: 'OK',
        notes: 'Detección de nivel consistente en muestra y reactivo.',
      },
    ],
    evidenceItems: [
      {
        id: crypto.randomUUID(),
        type: 'manual',
        title: 'Observación de campo',
        value: 'QC alto multianalito',
        note: 'Se confirma patrón compartido en analitos UV y de punto final con control nivel I.',
        sourceStatus: 'user_captured',
        sourceReference: 'Demo local DRI',
      },
      {
        id: crypto.randomUUID(),
        type: 'service_note',
        title: 'Resumen de utilidades',
        value: 'Photometry anormal + washing adjusted',
        note: 'La demo busca mostrar contraste entre hipótesis óptica, lavado y factores compartidos.',
        sourceStatus: 'rule_inferred',
        sourceReference: 'Demo local DRI',
      },
    ],
    signals: {
      intermittentPattern: false,
      normalCurvesObserved: true,
      opticalRejectObserved: false,
      waterSensitivePattern: true,
    },
  };
};

const shuffleIds = (ids: string[]) => {
  const pool = [...ids];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool;
};

const buildFullRandomDemoFormState = (
  catalog: DriCatalog,
  profiles: DriReagentProfile[],
  equipmentModel: DriCaseFormState['equipmentModel'],
): DriCaseFormState => {
  const visibleIds = profiles
    .filter((profile) => profile.platforms.value.length === 0 || profile.platforms.value.includes(equipmentModel))
    .map((profile) => profile.id);
  const randomizedIds = shuffleIds(visibleIds);
  const midpoint = Math.max(1, Math.floor(randomizedIds.length / 2));
  const failedReagentIds = randomizedIds.slice(0, midpoint);
  const correctReagentIds = randomizedIds.slice(midpoint);

  const baseDemo = buildDemoFormState(catalog);
  return {
    ...baseDemo,
    serialNumber: `${equipmentModel}-DEMO-FULL`,
    observations:
      'Demo DRI completo: todos los reactivos visibles del modelo activo fueron repartidos al azar entre fallidas y correctas para estresar el grafo relacional y la lectura por factores compartidos.',
    failedReagentIds,
    correctReagentIds,
    selectedQcReferenceId: '',
    expectedValue: '',
    obtainedValue: '',
    controlLot: '',
    controlLevel: 'not_applicable',
    reagentMeasurements: randomizedIds.reduce<Record<string, DriReagentMeasurementInput>>((accumulator, reagentId) => {
      accumulator[reagentId] = createEmptyReagentMeasurement(reagentId);
      return accumulator;
    }, {}),
  };
};

type DriDockTab = 'caso' | 'hipotesis' | 'contraste' | 'evidencia';

const formSignature = (form: DriCaseFormState) => JSON.stringify(form);

export default function DriDashboard({
  subPermissions = ['captura', 'grafo', 'diagnostico'],
  previewMode = false,
  requestedSerial = '',
  requestedApply = 'none',
}: {
  subPermissions?: string[];
  previewMode?: boolean;
  /** Serie pedida por URL (llegada desde Monitoreo). */
  requestedSerial?: string;
  /** Qué fuentes se proyectan sin clic adicional al llegar con una serie. */
  requestedApply?: 'none' | 'bpl' | 'all';
}) {
  const canCapture = subPermissions.includes('captura');
  const canViewGraph = subPermissions.includes('grafo');
  const canViewDiagnosis = subPermissions.includes('diagnostico');
  const [catalog, setCatalog] = useState<DriCatalog | null>(null);
  const [catalogSource, setCatalogSource] = useState('Cargando');
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<DriDiagnosticCaseRecord[]>([]);
  const [form, setForm] = useState<DriCaseFormState>(() => createInitialFormState());
  /** Resultado fijado (guardado, demo o "localizar"): alimenta el explorador 3D y no cambia con cada tecla. */
  const [committedAnalysis, setCommittedAnalysis] = useState<DriEngineResult | null>(null);
  /** Firma del formulario con el que se fijó el resultado: "Fijar lectura viva" solo aparece si cambió. */
  const [committedSignature, setCommittedSignature] = useState<string | null>(null);
  const [activeCase, setActiveCase] = useState<DriDiagnosticCaseRecord | null>(null);
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedReagentId, setSelectedReagentId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedHypothesisKey, setSelectedHypothesisKey] = useState<string | null>(null);
  const [spatialSelectionVersion, setSpatialSelectionVersion] = useState(0);
  const [demoActive, setDemoActive] = useState(false);
  const [focusedSystemKey, setFocusedSystemKey] = useState<string | null>(null);
  const [graphMultiSelect, setGraphMultiSelect] = useState(false);
  const [graphShellControls, setGraphShellControls] = useState<DriShellControls>(() => ({ ...DRI_GRAPH_CONFIG.layout.defaultRadii }));
  const [dockTab, setDockTab] = useState<DriDockTab>('caso');
  const [explorerOpen, setExplorerOpen] = useState(previewMode);
  const [advisoryPickerOpen, setAdvisoryPickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const [evidenceTasks, setEvidenceTasks] = useState<Record<string, DriEvidenceTaskState>>({});
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const deferredForm = useDeferredValue(form);
  const explorerRef = useRef<HTMLElement>(null);

  const invalidateCommitted = useCallback(() => {
    setCommittedAnalysis(null);
    setCommittedSignature(null);
    setActiveCase(null);
    setSavedSignature(null);
  }, []);

  const sources = useDriContextSources({
    catalog,
    form,
    setForm,
    enabled: !previewMode,
    // La procedencia de demo solo se pierde con «Reiniciar»; aplicar o quitar fuentes no la cambia.
    onFormProjected: () => invalidateCommitted(),
  });

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setLoading(true);
      if (previewMode) {
        const localCatalog = getLocalDriCatalog();
        const demoForm = buildDemoFormState(localCatalog);
        const result = runDriEngine(demoForm, localCatalog);
        setCatalog(localCatalog); setCatalogSource('Catálogo documental local'); setHistory([]);
        setForm(demoForm); setCommittedAnalysis(result); setDemoActive(true);
        setSelectedHypothesisKey(result.hypotheses.find(h => h.matchedRuleIds.includes('ba400_optical_photometry'))?.key || result.hypotheses[0]?.key || null);
        setLoading(false);
        return;
      }
      const [catalogResult, historyResult, session] = await Promise.all([loadDriCatalog(), loadDriHistory(), getValidatedSession()]);
      if (!mounted) return;
      setCatalog(catalogResult.catalog);
      setCatalogSource(catalogResult.sourceLabel);
      setCatalogWarning(catalogResult.warning);
      setHistory(historyResult);
      setSessionEmail(session?.user.email?.toLowerCase() || null);
      setLoading(false);
    }
    void hydrate();
    return () => {
      mounted = false;
    };
  }, [previewMode]);

  // Llegada desde Monitoreo (`?serial=…`): la serie entra al caso y las fuentes se buscan de inmediato.
  // Sin serie, se deja disponible (no aplicado) el último reporte SAT importado.
  const requestedKey = `${requestedSerial}|${requestedApply}`;
  const handledRequestRef = useRef<string | null>(null);
  useEffect(() => {
    if (previewMode || loading || !catalog || handledRequestRef.current === requestedKey) return;
    handledRequestRef.current = requestedKey;
    const serial = requestedSerial.trim();
    if (serial) {
      setForm((current) => ({ ...current, serialNumber: serial }));
      void sources.loadAllForSerial(serial, { apply: requestedApply });
    } else {
      void sources.loadSat();
    }
    // `sources` cambia en cada render; la petición solo se atiende una vez por clave.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, loading, previewMode, requestedApply, requestedKey, requestedSerial]);

  const profiles = useMemo(() => (catalog ? buildReagentProfiles(catalog) : []), [catalog]);
  const supportedProfiles = useMemo(() => {
    const compatibleProfiles = profiles.filter(
      (profile) => profile.platforms.value.length === 0 || profile.platforms.value.includes(form.equipmentModel),
    );
    return dedupeProfilesByCanonicalKey(compatibleProfiles);
  }, [form.equipmentModel, profiles]);
  const supportedProfileById = useMemo(
    () => new Map(supportedProfiles.map((profile) => [profile.id, profile])),
    [supportedProfiles],
  );
  const reagentById = useMemo(() => new Map((catalog?.reagents || []).map((reagent) => [reagent.id, reagent])), [catalog?.reagents]);
  const reagentLabel = useCallback((reagentId: string) => {
    const reagent = reagentById.get(reagentId);
    return reagent ? getReagentDisplayCode(reagent) : reagentId;
  }, [reagentById]);
  const reagentName = useCallback((reagentId: string) => {
    const reagent = reagentById.get(reagentId);
    return reagent ? getReagentDisplayName(reagent) : reagentId;
  }, [reagentById]);
  const isReagentVisible = useCallback((reagentId: string) => supportedProfileById.has(reagentId), [supportedProfileById]);

  /** Motor en vivo: se recalcula (sin eco en consola) con cada cambio del caso. */
  const analysis = useMemo<DriEngineResult | null>(() => {
    if (!catalog || !deferredForm.failedReagentIds.length) return null;
    return withQuietDriLogging(() => runDriEngine(deferredForm, catalog));
  }, [catalog, deferredForm]);
  const previousAnalysisRef = useRef<DriEngineResult | null>(null);
  const [previousAnalysis, setPreviousAnalysis] = useState<DriEngineResult | null>(null);
  useEffect(() => {
    // El delta compara contra el resultado vivo anterior, no contra el fijado.
    setPreviousAnalysis(previousAnalysisRef.current);
    previousAnalysisRef.current = analysis;
  }, [analysis]);

  const liveState: DriLiveState = !analysis ? 'empty' : savedSignature && savedSignature === formSignature(form) && activeCase ? 'saved' : 'live';

  const filteredReagents = useMemo(() => {
    const base = supportedProfiles.map((profile) => profile.legacy);
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((reagent) => buildReagentSearchText(reagent).includes(needle));
  }, [deferredSearch, supportedProfiles]);

  const selectedReagent = useMemo<DriReagent | null>(
    () =>
      filteredReagents.find((reagent) => reagent.id === selectedReagentId) ||
      catalog?.reagents.find((reagent) => reagent.id === selectedReagentId) ||
      null,
    [catalog?.reagents, filteredReagents, selectedReagentId],
  );

  const selectedReagentProfile = useMemo<DriReagentProfile | null>(
    () => (selectedReagentId ? supportedProfileById.get(selectedReagentId) || null : null),
    [selectedReagentId, supportedProfileById],
  );

  const qcReferenceReagentIds = useMemo(
    () =>
      form.failedReagentIds.length
        ? form.failedReagentIds
        : selectedReagentId
          ? [selectedReagentId]
          : [],
    [form.failedReagentIds, selectedReagentId],
  );

  const caseReagentIds = useMemo(
    () => Array.from(new Set([...form.failedReagentIds, ...form.correctReagentIds])),
    [form.correctReagentIds, form.failedReagentIds],
  );

  const qcReferenceOptions = useMemo(
    () => (catalog ? getMatchingQcReferences(catalog, form, qcReferenceReagentIds) : []),
    [catalog, form, qcReferenceReagentIds],
  );

  const caseQcReferenceOptions = useMemo(
    () => (catalog && caseReagentIds.length ? getMatchingQcReferences(catalog, form, caseReagentIds) : []),
    [catalog, caseReagentIds, form],
  );

  const selectedQcReference = useMemo<DriQcReference | null>(() => {
    if (!catalog) return null;
    if (form.selectedQcReferenceId) {
      return findQcReferenceById(catalog, form.selectedQcReferenceId);
    }
    if (qcReferenceOptions.length === 1 && qcReferenceReagentIds.length === 1) {
      return qcReferenceOptions[0];
    }
    return null;
  }, [catalog, form.selectedQcReferenceId, qcReferenceOptions, qcReferenceReagentIds.length]);

  const reagentQcReferenceById = useMemo(() => {
    const map = new Map<string, DriQcReference>();
    if (!catalog) {
      return map;
    }

    caseReagentIds.forEach((reagentId) => {
      // Un control importado trae la referencia de su lote en uso (target ± SD del equipo): esa manda.
      const carried = form.reagentMeasurements[reagentId]?.qcReference;
      if (carried) {
        map.set(reagentId, carried);
        return;
      }
      const explicitReferenceId =
        form.reagentMeasurements[reagentId]?.selectedQcReferenceId ||
        (selectedQcReference?.reagentId === reagentId ? selectedQcReference.id : '');
      const explicitReference = explicitReferenceId ? findQcReferenceById(catalog, explicitReferenceId) : null;
      if (explicitReference) {
        map.set(reagentId, explicitReference);
        return;
      }

      const fallbackReference = caseQcReferenceOptions.find((reference) => reference.reagentId === reagentId) || null;
      if (fallbackReference) {
        map.set(reagentId, fallbackReference);
      }
    });

    return map;
  }, [catalog, caseQcReferenceOptions, caseReagentIds, form.reagentMeasurements, selectedQcReference]);

  const reagentQcAssessmentById = useMemo(() => {
    const map = new Map<string, DriQcAssessment>();
    caseReagentIds.forEach((reagentId) => {
      const reference = reagentQcReferenceById.get(reagentId);
      if (!reference) {
        return;
      }
      const measurement = form.reagentMeasurements[reagentId];
      const obtainedValue =
        measurement?.obtainedValue ||
        (caseReagentIds.length === 1 && reagentId === form.failedReagentIds[0] ? form.obtainedValue : '');
      const assessment = assessQcReference(reference, obtainedValue, { assumeNeutralWhenMissing: true });
      if (assessment) {
        map.set(reagentId, assessment);
      }
    });
    return map;
  }, [caseReagentIds, form.failedReagentIds, form.obtainedValue, form.reagentMeasurements, reagentQcReferenceById]);

  const qcAssessment = useMemo(
    () =>
      selectedQcReference
        ? assessQcReference(
            selectedQcReference,
            form.reagentMeasurements[selectedQcReference.reagentId]?.obtainedValue || form.obtainedValue,
            { assumeNeutralWhenMissing: true },
          )
        : null,
    [form.obtainedValue, form.reagentMeasurements, selectedQcReference],
  );

  const selectedHypothesis = useMemo(
    () => analysis?.hypotheses.find((hypothesis) => hypothesis.key === selectedHypothesisKey) || analysis?.hypotheses[0] || null,
    [analysis?.hypotheses, selectedHypothesisKey],
  );
  const committedFinding = useMemo<DriHypothesisResult | null>(
    () =>
      committedAnalysis?.hypotheses.find((hypothesis) => hypothesis.key === selectedHypothesisKey) ||
      committedAnalysis?.hypotheses[0] ||
      null,
    [committedAnalysis?.hypotheses, selectedHypothesisKey],
  );

  const graphSelectedProfiles = useMemo(
    () =>
      [...form.failedReagentIds, ...form.correctReagentIds]
        .map((id) => supportedProfileById.get(id))
        .filter((profile): profile is DriReagentProfile => Boolean(profile)),
    [form.correctReagentIds, form.failedReagentIds, supportedProfileById],
  );

  const topGraphSignals = useMemo(
    () =>
      analysis
        ? selectGraphSignals(
            analysis.relationSignals,
            form.failedReagentIds.length + form.correctReagentIds.length,
          )
        : [],
    [analysis, form.correctReagentIds.length, form.failedReagentIds.length],
  );

  const hierarchyGraph = useMemo(
    () =>
      form.equipmentModel === 'BA400'
        ? buildBa400HierarchyGraph({
            profiles: graphSelectedProfiles,
            signals: topGraphSignals,
          })
        : { nodes: [], edges: [] },
    [form.equipmentModel, graphSelectedProfiles, topGraphSignals],
  );

  const graphSystemPills = useMemo(
    () =>
      analysis
        ? hierarchyGraph.nodes
            .filter((node) => node.type === 'ambient_factor' && node.tier === 1)
            .map((node) => ({
              key: String(node.clusterKey || '').replace(/^ambient:/, ''),
              label: node.label,
            }))
        : [],
    [analysis, hierarchyGraph.nodes],
  );

  const graphNodes = useMemo<DriGraphNode[]>(() => {
    if (!analysis || !catalog) return [];
    const nodes: DriGraphNode[] = [];
    form.failedReagentIds.forEach((id) => {
      const reagent = reagentById.get(id);
      if (!reagent) return;
      nodes.push({
        id: reagentNodeId(id, 'failed'),
        label: getReagentDisplayCode(reagent),
        subtitle: getReagentDisplayName(reagent),
        type: 'failed_reagent',
        clusterKey: 'failed',
        color: DRI_REAGENT_STATE_COLORS.failed,
        emphasis: 1.08,
        associationCount: 1,
        associationStrength: 0.72,
        orbit: 'failed',
        tier: 3,
      });
    });
    form.correctReagentIds.forEach((id) => {
      const reagent = reagentById.get(id);
      if (!reagent) return;
      nodes.push({
        id: reagentNodeId(id, 'correct'),
        label: getReagentDisplayCode(reagent),
        subtitle: getReagentDisplayName(reagent),
        type: 'correct_reagent',
        clusterKey: 'correct',
        color: DRI_REAGENT_STATE_COLORS.correct,
        emphasis: 0.98,
        associationCount: 1,
        associationStrength: 0.68,
        orbit: 'correct',
        tier: 3,
      });
    });
    topGraphSignals.forEach((signal, index) => {
      if (signal.category === 'service') return;
      const associationCount = signal.relatedReagentIds.length + signal.contrastReagentIds.length;
      const differentialBalance = signal.failedCoverage - signal.correctCoverage;
      const differentialStrength = getDriDifferentialVisualStrength(signal.failedCoverage, signal.correctCoverage);
      const signedBalance = `${differentialBalance >= 0 ? '+' : ''}${Math.round(differentialBalance * 100)}%`;
      nodes.push({
        id: signalNodeId(signal.id),
        label: signal.label,
        subtitle: `${signal.category} · +${signal.relatedReagentIds.length} fallidas · −${signal.contrastReagentIds.length} correctas · balance ${signedBalance}`,
        type: 'factor',
        clusterKey: signal.category,
        color: getDriSignalCategoryColor(signal.category),
        emphasis: 0.55 + differentialStrength * 2.35,
        associationCount,
        associationStrength: differentialStrength,
        orbit: 'diagnostic',
        tier: inferGraphFactorTier(signal, index),
      });
    });
    return [...nodes, ...hierarchyGraph.nodes];
  }, [analysis, catalog, form.correctReagentIds, form.failedReagentIds, hierarchyGraph.nodes, reagentById, topGraphSignals]);

  const graphEdges = useMemo<DriGraphEdge[]>(() => {
    if (!analysis) return [];
    const edges = topGraphSignals.flatMap((signal) => {
      if (signal.category === 'service') return [];
      const edges: DriGraphEdge[] = [];
      signal.relatedReagentIds.forEach((id) => {
        edges.push({
          id: `${id}-${signal.id}-failed`,
          sourceId: reagentNodeId(id, 'failed'),
          targetId: signalNodeId(signal.id),
          color: getDriSignalCategoryColor(signal.category),
          weight: Math.max(1, signal.suspicionScore / 34),
          relationType: signal.category,
          opacity: 0.88,
          arcBias: 0.32,
        });
      });
      signal.contrastReagentIds.forEach((id) => {
        edges.push({
          id: `${id}-${signal.id}-correct`,
          sourceId: reagentNodeId(id, 'correct'),
          targetId: signalNodeId(signal.id),
          color: '#6b8297',
          weight: 1,
          relationType: signal.category,
          opacity: 0.34,
          arcBias: -0.28,
        });
      });
      return edges;
    });

    return [
      ...edges,
      ...hierarchyGraph.edges,
    ];
  }, [analysis, hierarchyGraph.edges, topGraphSignals]);

  const graphNodeById = useMemo(() => new Map(graphNodes.map((node) => [node.id, node])), [graphNodes]);
  const selectedNode = selectedNodeId ? graphNodeById.get(selectedNodeId) || null : null;
  const selectedSignal = useMemo(
    () =>
      selectedNodeId?.startsWith('signal:')
        ? analysis?.relationSignals.find((signal) => signal.id === selectedNodeId.replace('signal:', '')) || null
        : null,
    [analysis?.relationSignals, selectedNodeId],
  );
  const selectedSignalId = selectedSignal?.id || null;

  const fixtureResults = useMemo(() => (catalog ? runDriValidationFixtures(catalog) : []), [catalog]);

  /** Qué campos y reactivos siguen tal como los escribió una fuente (para marcar su procedencia en la captura). */
  const sourceReceipts = [sources.sat.receipt, sources.bpl.receipt, sources.monitoring.receipt, sources.advisory.receipt];
  const provenance = useMemo(() => {
    const byField = new Map<string, string>();
    const byReagent = new Map<string, string>();
    sourceReceipts.forEach((receipt) => {
      if (!receipt) return;
      const label = `Desde ${DRI_SOURCE_LABELS[receipt.sourceKind]} · ${receipt.label}`;
      receipt.fields.forEach((field) => {
        if (String(form[field.key] ?? '') === field.applied) byField.set(field.key, label);
      });
      receipt.reagentStates.forEach((state) => {
        const current = form.failedReagentIds.includes(state.reagentId) ? 'failed' : form.correctReagentIds.includes(state.reagentId) ? 'correct' : 'none';
        if (state.applied !== 'none' && current === state.applied) byReagent.set(state.reagentId, label);
      });
    });
    return { byField, byReagent };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, ...sourceReceipts]);

  useEffect(() => {
    if (!qcReferenceOptions.length) {
      if (form.selectedQcReferenceId) {
        setForm((current) => ({ ...current, selectedQcReferenceId: '' }));
      }
      return;
    }

    if (
      form.selectedQcReferenceId &&
      !qcReferenceOptions.some((reference) => reference.id === form.selectedQcReferenceId)
    ) {
      setForm((current) => ({ ...current, selectedQcReferenceId: '' }));
      return;
    }

    if (!form.selectedQcReferenceId && qcReferenceOptions.length === 1 && qcReferenceReagentIds.length === 1) {
      const [reference] = qcReferenceOptions;
      setForm((current) => {
        const existing = current.reagentMeasurements[reference.reagentId];
        // Una medición importada por una fuente se deja intacta: así "Quitar del diagnóstico" la reconoce y la retira.
        const measurements =
          existing?.source === 'auto_import'
            ? current.reagentMeasurements
            : {
                ...current.reagentMeasurements,
                [reference.reagentId]: {
                  ...(existing || createEmptyReagentMeasurement(reference.reagentId)),
                  selectedQcReferenceId: reference.id,
                  expectedValue: existing?.expectedValue || String(reference.targetValue),
                  unit: existing?.unit || reference.unit || null,
                  updatedAt: existing?.updatedAt || new Date().toISOString(),
                },
              };
        return {
          ...current,
          selectedQcReferenceId: reference.id,
          expectedValue: current.expectedValue || String(reference.targetValue),
          controlLot: current.controlLot || reference.lot || '',
          reagentMeasurements: measurements,
        };
      });
    }
  }, [form.selectedQcReferenceId, qcReferenceOptions, qcReferenceReagentIds.length]);

  const handleFormChange = <K extends keyof DriCaseFormState>(field: K, value: DriCaseFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    if (field === 'equipmentModel' || field === 'serialNumber') {
      // Cambiar equipo o serie invalida el resultado fijado para evitar asociaciones cruzadas en el explorador.
      invalidateCommitted();
      setSelectedHypothesisKey(null);
    }
  };

  const handleToggleSignal = (field: keyof DriCaseFormState['signals']) => {
    setForm((current) => ({ ...current, signals: { ...current.signals, [field]: !current.signals[field] } }));
  };

  const setReagentState = (reagentId: string, state: DriReagentState) => {
    setSelectedReagentId(reagentId);
    setForm((current) => {
      const failedSet = new Set(current.failedReagentIds);
      const correctSet = new Set(current.correctReagentIds);
      failedSet.delete(reagentId);
      correctSet.delete(reagentId);
      if (state === 'failed') failedSet.add(reagentId);
      if (state === 'correct') correctSet.add(reagentId);
      return { ...current, failedReagentIds: Array.from(failedSet), correctReagentIds: Array.from(correctSet) };
    });
  };

  const handleReagentCycle = (reagentId: string) => {
    setSelectedReagentId(reagentId);
    setForm((current) => {
      const failedSet = new Set(current.failedReagentIds);
      const correctSet = new Set(current.correctReagentIds);
      if (correctSet.has(reagentId)) {
        correctSet.delete(reagentId);
        failedSet.add(reagentId);
      } else if (failedSet.has(reagentId)) {
        failedSet.delete(reagentId);
      } else {
        correctSet.add(reagentId);
      }
      return {
        ...current,
        failedReagentIds: Array.from(failedSet),
        correctReagentIds: Array.from(correctSet),
      };
    });
  };

  const updateReagentMeasurement = (reagentId: string, patch: Partial<DriReagentMeasurementInput>) => {
    setForm((current) => {
      const existing = current.reagentMeasurements[reagentId] || createEmptyReagentMeasurement(reagentId);
      return {
        ...current,
        reagentMeasurements: {
          ...current.reagentMeasurements,
          [reagentId]: {
            ...existing,
            ...patch,
            reagentId,
            source: patch.source || existing.source || 'manual',
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  };

  const handleToggleGraphNode = (nodeId: string) => {
    setSelectedNodeIds((current) => {
      const exists = current.includes(nodeId);
      const next = graphMultiSelect
        ? exists
          ? current.filter((id) => id !== nodeId)
          : [...current, nodeId]
        : exists && current.length === 1
          ? []
          : [nodeId];

      setSelectedNodeId((previous) => {
        if (!next.length) {
          return null;
        }
        if (next.includes(nodeId)) {
          return nodeId;
        }
        if (previous && next.includes(previous)) {
          return previous;
        }
        return next[next.length - 1] || null;
      });

      return next;
    });
  };

  const clearGraphSelection = () => {
    setSelectedNodeIds([]);
    setSelectedNodeId(null);
  };

  const selectSignalInGraph = (signal: DriRelationSignal | null) => {
    if (!signal) {
      clearGraphSelection();
      return;
    }
    if (signal.category === 'service' && form.equipmentModel === 'BA400') {
      const systemNodeIds = getBa400SystemNodeIdsForSignal(signal);
      setSelectedNodeId(systemNodeIds[0] || null);
      setSelectedNodeIds(systemNodeIds);
      return;
    }
    const nodeId = signalNodeId(signal.id);
    setSelectedNodeId(nodeId);
    setSelectedNodeIds([nodeId]);
  };

  const updateGraphShellControl = (field: keyof DriShellControls, value: number) => {
    setGraphShellControls((current) => ({ ...current, [field]: value }));
  };

  /** Fija el resultado vivo para el explorador 3D (sin guardar). */
  const commitLiveAnalysis = (hypothesisKey?: string | null) => {
    if (!catalog || !form.failedReagentIds.length) return null;
    const result = runDriEngine(form, catalog);
    const signature = formSignature(form);
    startTransition(() => {
      setCommittedAnalysis(result);
      setCommittedSignature(signature);
      setSelectedHypothesisKey(hypothesisKey || result.hypotheses[0]?.key || null);
      setSpatialSelectionVersion((version) => version + 1);
    });
    return result;
  };

  const openExplorerAt = (hypothesis: DriHypothesisResult) => {
    commitLiveAnalysis(hypothesis.key);
    setExplorerOpen(true);
    window.setTimeout(() => {
      explorerRef.current?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
    }, 60);
  };

  const handleAnalyze = async () => {
    if (!catalog || !form.serialNumber.trim() || !form.failedReagentIds.length) return;
    setSaving(true);
    setPersistWarning(null);
    const result = runDriEngine(form, catalog);
    const signature = formSignature(form);
    startTransition(() => {
      setCommittedAnalysis(result);
      setCommittedSignature(signature);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
      setSpatialSelectionVersion((version) => version + 1);
    });
    setExplorerOpen(true);
    if (previewMode || demoActive) {
      setPersistWarning('Prueba local: el diagnóstico no se guarda en producción.');
      setSaving(false);
      return;
    }
    const persisted = await persistDriCase(form, result);
    setActiveCase(persisted.caseRecord);
    setSavedSignature(formSignature(form));
    setPersistWarning(persisted.persistWarning);
    setHistory((current) => [persisted.caseRecord, ...current.filter((item) => item.id !== persisted.caseRecord.id)].slice(0, 24));
    setSaving(false);
  };

  const loadDemoForm = (demoForm: DriCaseFormState) => {
    if (!catalog) return;
    setDemoActive(true);
    setSpatialSelectionVersion(0);
    setPersistWarning(null);
    setEvidenceTasks({});
    setSearch('');
    sources.clearAll();
    setSelectedReagentId(demoForm.failedReagentIds[0] || demoForm.correctReagentIds[0] || null);
    setForm(demoForm);
    const result = runDriEngine(demoForm, catalog);
    const signature = formSignature(demoForm);
    startTransition(() => {
      setCommittedAnalysis(result);
      setCommittedSignature(signature);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
    });
    setActiveCase(null);
    setSavedSignature(null);
    setExplorerOpen(true);
  };

  const handleLoadDemo = () => {
    if (!catalog) return;
    const baseDemo = buildDemoFormState(catalog);
    const demoReferences = getMatchingQcReferences(catalog, baseDemo, baseDemo.failedReagentIds);
    const selectedReference =
      demoReferences.find((reference) => reference.controlLevel === 'level_1') || demoReferences[0] || null;

    loadDemoForm({
      ...baseDemo,
      selectedQcReferenceId: selectedReference?.id || '',
      expectedValue: selectedReference ? String(selectedReference.targetValue) : baseDemo.expectedValue,
      controlLot: selectedReference?.lot || baseDemo.controlLot,
      reagentMeasurements: selectedReference
        ? {
            ...baseDemo.reagentMeasurements,
            [selectedReference.reagentId]: {
              ...(baseDemo.reagentMeasurements[selectedReference.reagentId] || createEmptyReagentMeasurement(selectedReference.reagentId)),
              selectedQcReferenceId: selectedReference.id,
              expectedValue: String(selectedReference.targetValue),
              unit: selectedReference.unit || null,
            },
          }
        : baseDemo.reagentMeasurements,
    });
  };

  const handleLoadFullDemo = () => {
    if (!catalog) return;
    loadDemoForm(buildFullRandomDemoFormState(catalog, supportedProfiles, form.equipmentModel));
  };

  const handleReset = () => {
    setEvidenceTasks({});
    invalidateCommitted();
    setSelectedHypothesisKey(null);
    setDemoActive(false);
    setSelectedReagentId(null);
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
    setPersistWarning(null);
    sources.clearAll();
    setForm(createInitialFormState());
  };

  const applyQcReference = (reference: DriQcReference) => {
    setSelectedReagentId(reference.reagentId);
    setForm((current) => ({
      ...current,
      selectedQcReferenceId: reference.id,
      expectedValue: ANCHOR_EVENT_TYPES.has(current.eventType) ? String(reference.targetValue) : current.expectedValue,
      controlLot: current.controlLot || reference.lot || '',
      reagentMeasurements: {
        ...current.reagentMeasurements,
        [reference.reagentId]: {
          ...(current.reagentMeasurements[reference.reagentId] || createEmptyReagentMeasurement(reference.reagentId)),
          selectedQcReferenceId: reference.id,
          expectedValue: String(reference.targetValue),
          unit: reference.unit || null,
          source: current.reagentMeasurements[reference.reagentId]?.source || 'manual',
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  };

  const addServiceTest = () =>
    setForm((current) => ({
      ...current,
      serviceTests: [
        ...current.serviceTests,
        { id: crypto.randomUUID(), utilityId: 'photometry', label: 'Photometry', result: 'not_run', observedValue: '', notes: '' },
      ],
    }));

  const updateServiceTest = (id: string, patch: Partial<DriServiceTestInput>) =>
    setForm((current) => ({
      ...current,
      serviceTests: current.serviceTests.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));

  const removeServiceTest = (id: string) =>
    setForm((current) => ({ ...current, serviceTests: current.serviceTests.filter((item) => item.id !== id) }));

  const addEvidenceItem = () =>
    setForm((current) => ({
      ...current,
      evidenceItems: [
        ...current.evidenceItems,
        { id: crypto.randomUUID(), type: 'manual', title: '', value: '', note: '' },
      ],
    }));

  const updateEvidenceItem = (id: string, patch: Partial<DriEvidenceArtifact>) => {
    if (patch.type) {
      setEvidenceTasks((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }

    setForm((current) => {
      let typeChanged = false;
      const nextItems = current.evidenceItems.map((item) => {
        if (item.id !== id) {
          return item;
        }

        const nextType = patch.type && patch.type !== item.type;
        typeChanged = Boolean(nextType);
        if (!nextType) {
          return { ...item, ...patch };
        }

        return {
          ...item,
          ...patch,
          value: patch.value ?? '',
          note: patch.note ?? item.note,
          fileName: null,
          fileBucket: null,
          filePath: null,
          fileUrl: null,
          mimeType: null,
          capturedAt: null,
          ocrText: null,
          ocrSummary: null,
          derivedData: null,
          sourceStatus: 'user_captured' as const,
          sourceReference: null,
        };
      });

      return {
        ...current,
        evidenceItems: nextItems,
        observations: typeChanged ? replaceObservationBlock(current.observations, id, '') : current.observations,
      };
    });
  };

  const removeEvidenceItem = (id: string) => {
    setEvidenceTasks((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setForm((current) => ({
      ...current,
      evidenceItems: current.evidenceItems.filter((item) => item.id !== id),
      observations: replaceObservationBlock(current.observations, id, ''),
    }));
  };

  const handleEvidenceFile = async (id: string, file: File) => {
    const item = form.evidenceItems.find((candidate) => candidate.id === id);
    if (!item || !file) {
      return;
    }

    const logger = createDriLogger(`evidence-${id}`, form.equipmentModel, []);
    setEvidenceTasks((current) => ({
      ...current,
      [id]: { busy: true, message: 'Subiendo archivo y leyendo OCR…', error: null },
    }));

    logger.info('UI', 'evidence-start', 'Iniciando carga de evidencia técnica.', {
      evidenceId: id,
      type: item.type,
      fileName: file.name,
      mimeType: file.type,
    });

    try {
      const [uploadOutcome, ocrOutcome] = await Promise.allSettled([
        uploadDriEvidenceAsset({
          file,
          equipmentModel: form.equipmentModel,
          serialNumber: form.serialNumber,
          evidenceType: item.type,
        }),
        runDriEvidenceOcr(file, (progress, status) => {
          setEvidenceTasks((current) => ({
            ...current,
            [id]: {
              busy: true,
              message: `${status} · ${Math.round(progress * 100)}%`,
              error: null,
            },
          }));
        }).catch((error) => {
          logger.warn('UI', 'evidence-ocr-warning', 'El OCR de la evidencia técnica no logró extraer datos útiles.', {
            evidenceId: id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }),
      ]);

      const uploadResult = uploadOutcome.status === 'fulfilled' ? uploadOutcome.value : null;
      const ocrResult = ocrOutcome.status === 'fulfilled' ? ocrOutcome.value : null;

      if (uploadOutcome.status === 'rejected') {
        logger.warn('UI', 'evidence-upload-warning', 'El archivo no se pudo subir a Supabase, pero se conservará la lectura local.', {
          evidenceId: id,
          error: uploadOutcome.reason instanceof Error ? uploadOutcome.reason.message : String(uploadOutcome.reason),
        });
      }

      if (!uploadResult && !ocrResult) {
        throw uploadOutcome.status === 'rejected'
          ? uploadOutcome.reason
          : new Error('No se pudo procesar la evidencia técnica.');
      }

      setForm((current) => {
        const existing = current.evidenceItems.find((candidate) => candidate.id === id);
        if (!existing) {
          return current;
        }

        const nextItem: DriEvidenceArtifact = {
          ...existing,
          ...(uploadResult || {}),
          fileName: uploadResult?.fileName || file.name,
          mimeType: uploadResult?.mimeType || file.type || null,
          capturedAt: new Date().toISOString(),
          title: existing.title || trimFileExtension(file.name),
          value: ocrResult?.summary[0] || existing.value || file.name,
          ocrText: ocrResult?.rawText || null,
          ocrSummary: ocrResult?.summary || null,
          derivedData: ocrResult?.derivedData || null,
          sourceStatus: ocrResult ? 'rule_inferred' : 'user_captured',
          sourceReference: ocrResult?.sourceReference || 'DRI upload',
        };

        const nextForm = {
          ...current,
          evidenceItems: current.evidenceItems.map((candidate) => (candidate.id === id ? nextItem : candidate)),
        };

        return ocrResult ? mergeEvidenceInsights(nextForm, nextItem) : nextForm;
      });

      setEvidenceTasks((current) => ({
        ...current,
        [id]: {
          busy: false,
          message: ocrResult?.summary.length
            ? uploadResult
              ? `OCR listo · ${ocrResult.summary.length} hallazgo(s)`
              : `OCR listo · ${ocrResult.summary.length} hallazgo(s), sin subida remota`
            : uploadResult
              ? 'Archivo cargado'
              : '',
          error:
            uploadOutcome.status === 'rejected'
              ? uploadOutcome.reason instanceof Error
                ? uploadOutcome.reason.message
                : 'No se pudo subir el archivo a Supabase.'
              : null,
        },
      }));

      logger.success('UI', 'evidence-complete', 'Evidencia técnica cargada y procesada.', {
        evidenceId: id,
        summary: ocrResult?.summary || [],
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No se pudo cargar la evidencia técnica.';
      setEvidenceTasks((current) => ({
        ...current,
        [id]: {
          busy: false,
          message: '',
          error: message,
        },
      }));
      logger.error('UI', 'evidence-error', 'La carga de evidencia técnica falló.', {
        evidenceId: id,
        error: message,
      });
    }
  };

  if (loading || !catalog) {
    return (
      <div className="dri-shell">
        <div className="dri-loading card"><PanelLoader title="Preparando DRI" subtitle="Conocimiento BA400 y trazabilidad diagnóstica." /></div>
      </div>
    );
  }

  const showDemoButton = previewMode || sessionEmail === DEMO_ACCOUNT_EMAIL;
  const caseCode = activeCase?.caseCode || (committedAnalysis ? `DRI-${committedAnalysis.runId.slice(0, 8).toUpperCase()}` : null);
  const appliedSourceLabels = sources.appliedKinds.map((kind) => DRI_SOURCE_LABELS[kind]);
  const stageCounts = {
    failed: form.failedReagentIds.length,
    correct: form.correctReagentIds.length,
    factors: graphNodes.filter((node) => node.type === 'factor').length,
    systems: graphSystemPills.length,
  };
  const dockTabs: Array<{ key: DriDockTab; label: string; count?: number | null; visible: boolean }> = [
    { key: 'caso', label: 'Caso', visible: canCapture },
    { key: 'hipotesis', label: 'Hipótesis', count: analysis ? analysis.hypotheses.length : null, visible: canViewDiagnosis },
    { key: 'contraste', label: 'Contraste', count: analysis?.contrast ? analysis.contrast.exonerations.length : null, visible: canViewGraph },
    { key: 'evidencia', label: 'Evidencia', visible: canViewDiagnosis },
  ];
  const visibleDockTabs = dockTabs.filter((tab) => tab.visible);
  const activeDockTab = visibleDockTabs.some((tab) => tab.key === dockTab) ? dockTab : visibleDockTabs[0]?.key || 'caso';

  return (
    <div className="dri-shell dri-workbench" data-live={liveState}>
      <DriCommandStrip
        equipmentModel={form.equipmentModel}
        onEquipmentChange={(model) => handleFormChange('equipmentModel', model)}
        serial={form.serialNumber}
        onSerialChange={(serial) => handleFormChange('serialNumber', serial)}
        canCapture={canCapture}
        catalogSource={catalogSource}
        visibleReagents={supportedProfiles.length}
        liveState={liveState}
        hypothesisCount={analysis?.hypotheses.length || 0}
        caseCode={caseCode}
        appliedSources={appliedSourceLabels}
        bplEventCount={form.bplEvidence ? form.bplEvidence.eventCount : null}
        showDemo={showDemoButton}
        onLoadDemo={handleLoadDemo}
        onLoadFullDemo={handleLoadFullDemo}
        onReset={handleReset}
        onGenerate={() => void handleAnalyze()}
        canGenerate={Boolean(form.serialNumber.trim() && form.failedReagentIds.length)}
        saving={saving}
        onSearchSources={() => void sources.loadAllForSerial(form.serialNumber, { apply: 'none' })}
        sourcesBusy={sources.busy}
      />

      {catalogWarning ? <div className="dri-alert dri-alert--warning">{catalogWarning}</div> : null}
      {persistWarning ? <div className="dri-alert dri-alert--warning">{persistWarning}</div> : null}
      {sources.lastMessage ? <div className="dri-alert dri-alert--info">{sources.lastMessage}</div> : null}

      <div className="dri-workbench__stage">
        {canViewGraph ? (
            <DriRelationStage
              nodes={graphNodes}
              edges={graphEdges}
              selectedNodeIds={selectedNodeIds}
              onToggleNode={handleToggleGraphNode}
              onClearSelection={clearGraphSelection}
              focusedSystemKey={focusedSystemKey}
              onFocusSystem={setFocusedSystemKey}
              systemPills={graphSystemPills}
              multiSelect={graphMultiSelect}
              onToggleMultiSelect={() => setGraphMultiSelect((current) => !current)}
              shellControls={graphShellControls}
              onShellControlChange={updateGraphShellControl}
              onResetShellControls={() => setGraphShellControls({ ...DRI_GRAPH_CONFIG.layout.defaultRadii })}
              analysis={analysis}
              selectedSignal={selectedSignal}
              selectedNode={selectedNode}
              counts={stageCounts}
              liveState={liveState}
              caseCode={caseCode}
              isDemo={demoActive}
              reagentLabel={reagentLabel}
            />
          ) : null}
      </div>

      {canCapture ? (
        <DriSourcesStrip
          sources={sources}
          serial={form.serialNumber}
          previewMode={previewMode}
          onImportSat={sources.acceptImportedSat}
          onOpenAdvisoryPicker={() => setAdvisoryPickerOpen(true)}
        />
      ) : null}

      <section className="dri-workbench__panel" aria-label="Herramientas del caso">
          <div className="dri-dock-tabs" role="tablist">
            {visibleDockTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeDockTab === tab.key}
                className={`dri-dock-tab ${activeDockTab === tab.key ? 'is-active' : ''}`}
                onClick={() => setDockTab(tab.key)}
                title={tab.key === 'contraste' && tab.count !== null && tab.count !== undefined ? `${tab.count} factores con menos peso (sin descartar)` : undefined}
              >
                {tab.label}
                {tab.count !== null && tab.count !== undefined ? <b className="dri-dock-tab__count">{tab.count}</b> : null}
              </button>
            ))}
          </div>

          {activeDockTab === 'caso' && canCapture ? (
            <DriInputPanel
              embedded
              form={form}
              filteredReagents={filteredReagents}
              qcReferenceOptions={qcReferenceOptions}
              selectedQcReference={selectedQcReference}
              qcAssessment={qcAssessment}
              reagentMeasurements={form.reagentMeasurements}
              reagentQcReferenceById={reagentQcReferenceById}
              reagentQcAssessmentById={reagentQcAssessmentById}
              search={search}
              onSearchChange={setSearch}
              onFormChange={handleFormChange}
              onToggleSignal={handleToggleSignal}
              onCycleReagent={handleReagentCycle}
              onUpdateReagentMeasurement={updateReagentMeasurement}
              onApplyQcReference={applyQcReference}
              onAnalyze={() => void handleAnalyze()}
              onLoadDemo={handleLoadDemo}
              onLoadFullDemo={handleLoadFullDemo}
              showDemoButton={showDemoButton}
              canAnalyze={Boolean(form.serialNumber.trim() && form.failedReagentIds.length)}
              saving={saving}
              onAddServiceTest={addServiceTest}
              onUpdateServiceTest={updateServiceTest}
              onRemoveServiceTest={removeServiceTest}
              onAddEvidenceItem={addEvidenceItem}
              onUpdateEvidenceItem={updateEvidenceItem}
              onRemoveEvidenceItem={removeEvidenceItem}
              onSelectEvidenceFile={handleEvidenceFile}
              evidenceTasks={evidenceTasks}
              selectedReagent={selectedReagent}
              selectedReagentProfile={selectedReagentProfile}
              onReset={handleReset}
              provenance={provenance}
            />
          ) : null}

          {activeDockTab === 'hipotesis' && canViewDiagnosis ? (
            <DriHypothesisDock
              analysis={analysis}
              previousAnalysis={previousAnalysis}
              selectedHypothesisKey={selectedHypothesis?.key || null}
              onSelectHypothesis={(key) => {
                setSelectedHypothesisKey(key);
                setSpatialSelectionVersion((version) => version + 1);
              }}
              onLocateInExplorer={openExplorerAt}
              explorerAvailable={canViewDiagnosis && form.equipmentModel === 'BA400'}
              liveState={liveState}
              caseCode={caseCode}
              saving={saving}
              canSave={canCapture && Boolean(form.serialNumber.trim() && form.failedReagentIds.length)}
              isDemo={previewMode || demoActive}
              onSave={() => void handleAnalyze()}
              reagentLabel={reagentLabel}
              isReagentVisible={isReagentVisible}
              onSetReagentState={setReagentState}
              readOnly={!canCapture}
            />
          ) : null}

          {activeDockTab === 'contraste' && canViewGraph ? (
            <DriContrastMatrix
              analysis={analysis}
              failedReagentIds={form.failedReagentIds}
              correctReagentIds={form.correctReagentIds}
              reagentLabel={reagentLabel}
              reagentName={reagentName}
              isReagentVisible={isReagentVisible}
              onSetReagentState={setReagentState}
              readOnly={!canCapture}
              selectedSignalId={selectedSignalId}
              onSelectSignal={(signalId) => selectSignalInGraph(signalId ? analysis?.relationSignals.find((signal) => signal.id === signalId) || null : null)}
            />
          ) : null}

          {activeDockTab === 'evidencia' && canViewDiagnosis ? (
            <div className="dri-dock-section">
              {analysis ? (
                <DriEvidencePanel evidenceRows={analysis.evidenceRows} logs={analysis.logs} history={history} />
              ) : (
                <div className="dri-empty-state">La evidencia relacional aparece cuando el caso tiene pruebas fallidas.</div>
              )}
              <div className="dri-side-block">
                <span className="dri-side-block__label">Fixtures de validación</span>
                <strong>{fixtureResults.filter((result) => result.passed).length} / {fixtureResults.length} escenarios</strong>
                <p>Los fixtures cubren 340 nm, R2, dilución, temperatura, control, linealidad, interferencias, pruebas de servicio y contraste 505 nm.</p>
                <ul className="dri-fixture-list">
                  {fixtureResults.map((result) => (
                    <li key={result.id} data-passed={result.passed}>
                      <span className={`dri-mini-badge ${result.passed ? 'is-pass' : 'is-fail'}`}>{result.passed ? 'pasa' : 'falla'}</span>
                      <span className="dri-fixture-list__title">{result.id} · {result.title}</span>
                      {showDemoButton ? (
                        <button
                          type="button"
                          className="dri-ghost-button"
                          onClick={() => {
                            const fixture = DRI_VALIDATION_FIXTURES.find((item) => item.id === result.id);
                            if (fixture) loadDemoForm({ ...fixture.input, serialNumber: `${fixture.input.serialNumber}-${fixture.id.toUpperCase()}` });
                          }}
                        >
                          Cargar en el caso
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
      </section>

      {canViewDiagnosis ? (
        <section ref={explorerRef} className="dri-explorer" data-open={explorerOpen} aria-label="Explorador 3D del equipo">
          <div className="dri-explorer__bar">
            <div>
              <span className="dri-panel__eyebrow">Localización espacial</span>
              <strong>{committedAnalysis ? `${committedAnalysis.hypotheses.length} hallazgos fijados${caseCode ? ` · ${caseCode}` : ''}` : 'Sin diagnóstico fijado: explora el equipo o fija un hallazgo desde Hipótesis'}</strong>
            </div>
            <div className="dri-explorer__actions">
              {analysis && committedSignature !== formSignature(form) ? (
                <button type="button" className="dri-pill-button" onClick={() => { commitLiveAnalysis(selectedHypothesis?.key); setExplorerOpen(true); }}>
                  Fijar lectura viva
                </button>
              ) : null}
              <button type="button" className="dri-pill-button" aria-expanded={explorerOpen} onClick={() => setExplorerOpen((current) => !current)}>
                {explorerOpen ? 'Ocultar explorador 3D' : 'Abrir explorador 3D'}
              </button>
            </div>
          </div>
          {explorerOpen ? (
            <Ba400DiagnosticViewer
              equipment={form.equipmentModel}
              serialNumber={form.serialNumber}
              analysis={committedAnalysis?.platform === form.equipmentModel ? committedAnalysis : null}
              selectedFinding={committedAnalysis?.platform === form.equipmentModel ? committedFinding : null}
              selectionVersion={spatialSelectionVersion}
              onSelectFinding={(key) => { setSelectedHypothesisKey(key); setSpatialSelectionVersion(v => v + 1); }}
              onEquipmentChange={canCapture ? model => handleFormChange('equipmentModel', model) : undefined}
              fixtureLabel={demoActive ? 'Demostración del motor DRI' : null}
            />
          ) : null}
        </section>
      ) : null}

      <DriAdvisoryPicker
        open={advisoryPickerOpen}
        onClose={() => setAdvisoryPickerOpen(false)}
        onSelect={(advisoryCase) => {
          setAdvisoryPickerOpen(false);
          sources.acceptAdvisory(advisoryCase);
          setDockTab('caso');
        }}
        serialHint={form.serialNumber}
      />
    </div>
  );
}
