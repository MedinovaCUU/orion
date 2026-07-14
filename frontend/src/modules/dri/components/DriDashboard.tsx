import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import DriGraph3D from './DriGraph3D';
import DriEvidencePanel from './DriEvidencePanel';
import DriHypothesisCard from './DriHypothesisCard';
import DriInputPanel from './DriInputPanel';
import DriRelationMatrix from './DriRelationMatrix';
import { loadDriCatalog, loadDriHistory, persistDriCase, uploadDriEvidenceAsset } from '../driData';
import { runDriEngine, runDriValidationFixtures } from '../driEngine';
import {
  buildReagentSearchText,
  getCanonicalReagentKey,
  getReagentDisplayCode,
  getReagentDisplayName,
} from '../knowledge/reagentIdentity';
import { buildReagentProfiles } from '../knowledge/reagentRelations';
import { buildBa400HierarchyGraph } from '../knowledge/ba400SubsystemHierarchy';
import { buildObservationBlockFromEvidence, runDriEvidenceOcr } from '../utils/driEvidenceOcr';
import { createDriLogger } from '../utils/driLogging';
import { assessQcReference, findQcReferenceById, getMatchingQcReferences } from '../utils/qcReferenceUtils';
import { getValidatedSession } from '../../../supabaseClient';
import type {
  DriCaseFormState,
  DriCatalog,
  DriDiagnosticCaseRecord,
  DriEngineResult,
  DriEvidenceArtifact,
  DriGraphEdge,
  DriGraphNode,
  DriQcAssessment,
  DriQcReference,
  DriRelationSignal,
  DriReagent,
  DriReagentMeasurementInput,
  DriReagentProfile,
  DriServiceTestInput,
} from '../types/dri.types';

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
  eventDate: new Date().toISOString().slice(0, 10),
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

const signalColor = (signal: DriRelationSignal) => {
  if (signal.category === 'wavelength') return '#efbf69';
  if (signal.category === 'reaction') return '#4fd0d7';
  if (signal.category === 'technique') return '#38c5d3';
  if (signal.category === 'trend') return '#5fd4ea';
  if (signal.category === 'scheme' || signal.category === 'r2') return '#76bee8';
  if (signal.category === 'temperature') return '#ff9b68';
  if (signal.category === 'storage') return '#f6a67c';
  if (signal.category === 'water') return '#79d9c1';
  if (signal.category === 'contamination') return '#6fd2b3';
  if (signal.category === 'blank') return '#d9aa78';
  if (signal.category === 'service') return '#ff676f';
  return '#9cb1c9';
};

const DEMO_ACCOUNT_EMAIL = 'rmontanez@biosystems.com.mx';
const ANCHOR_EVENT_TYPES = new Set<DriCaseFormState['eventType']>([
  'dilution_error',
  'non_linear',
  'poor_repeatability',
  'incoherent_result',
]);

const scoreReagentProfileForSelection = (profile: DriReagentProfile, canonicalKey: string) => {
  const metadata = (profile.legacy.metadata || {}) as Record<string, unknown>;
  const syntheticFromContext = Boolean(metadata.syntheticFromContext);
  let score = 0;

  if (!syntheticFromContext) {
    score += 120;
  }
  if (profile.id === canonicalKey) {
    score += 40;
  }
  if (profile.primaryWavelengthNm.value !== null) {
    score += 30;
  }
  if (profile.legacy.readMode) {
    score += 20;
  }
  if (profile.legacy.reagentType) {
    score += 20;
  }
  if (profile.legacy.reportedMethod) {
    score += 20;
  }
  if (String(profile.legacy.sourceStatus || '').toLowerCase().includes('ifu')) {
    score += 10;
  }

  return score;
};

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

    const nextScore = scoreReagentProfileForSelection(profile, canonicalKey);
    const currentScore = scoreReagentProfileForSelection(existing, canonicalKey);
    if (nextScore > currentScore) {
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

  Object.entries(GRAPH_SIGNAL_QUOTAS).forEach(([category, quota]) => {
    if (category === 'wavelength') {
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
    eventDate: new Date().toISOString().slice(0, 10),
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
    reagentExpiryDate: '2026-12-31',
    reagentOpenedAt: '2026-06-01',
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

export default function DriDashboard({ subPermissions = ['captura', 'grafo', 'diagnostico'] }: { subPermissions?: string[] }) {
  const canCapture = subPermissions.includes('captura');
  const canViewGraph = subPermissions.includes('grafo');
  const canViewDiagnosis = subPermissions.includes('diagnostico');
  const [catalog, setCatalog] = useState<DriCatalog | null>(null);
  const [catalogSource, setCatalogSource] = useState('Cargando');
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<DriDiagnosticCaseRecord[]>([]);
  const [form, setForm] = useState<DriCaseFormState>(() => createInitialFormState());
  const [analysis, setAnalysis] = useState<DriEngineResult | null>(null);
  const [activeCase, setActiveCase] = useState<DriDiagnosticCaseRecord | null>(null);
  const [search, setSearch] = useState('');
  const [selectedReagentId, setSelectedReagentId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedHypothesisKey, setSelectedHypothesisKey] = useState<string | null>(null);
  const [focusedSystemKey, setFocusedSystemKey] = useState<string | null>(null);
  const [graphMultiSelect, setGraphMultiSelect] = useState(false);
  const [graphShellControls, setGraphShellControls] = useState({
    systemCoreRadius: 0.98,
    systemStep: 0.98,
    factorBaseRadius: 4.18,
    factorStep: 1.18,
    reagentRadius: 8.88,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const [evidenceTasks, setEvidenceTasks] = useState<Record<string, DriEvidenceTaskState>>({});
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setLoading(true);
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
  }, []);

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
      hierarchyGraph.nodes
        .filter((node) => node.type === 'ambient_factor' && node.tier === 1)
        .map((node) => ({
          key: String(node.clusterKey || '').replace(/^ambient:/, ''),
          label: node.label,
        })),
    [hierarchyGraph.nodes],
  );

  const graphNodes = useMemo<DriGraphNode[]>(() => {
    if (!analysis || !catalog) return [];
    const reagentById = new Map(catalog.reagents.map((reagent) => [reagent.id, reagent]));
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
        color: '#cf6d73',
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
        color: '#4fc3b0',
        emphasis: 0.98,
        associationCount: 1,
        associationStrength: 0.68,
        orbit: 'correct',
        tier: 3,
      });
    });
    const maxSignalScore = Math.max(...topGraphSignals.map((signal) => signal.suspicionScore), 1);
    topGraphSignals.forEach((signal, index) => {
      nodes.push({
        id: signalNodeId(signal.id),
        label: signal.label,
        subtitle: `${signal.category} · score ${Math.round(signal.suspicionScore)}`,
        type: 'factor',
        clusterKey: signal.category,
        color: signalColor(signal),
        emphasis: 0.82 + signal.suspicionScore / 44,
        associationCount: signal.relatedReagentIds.length + signal.contrastReagentIds.length,
        associationStrength: signal.suspicionScore / maxSignalScore,
        orbit: 'diagnostic',
        tier: inferGraphFactorTier(signal, index),
      });
    });
    return [...nodes, ...hierarchyGraph.nodes];
  }, [analysis, catalog, form.correctReagentIds, form.failedReagentIds, hierarchyGraph.nodes, topGraphSignals]);

  const graphEdges = useMemo<DriGraphEdge[]>(() => {
    if (!analysis) return [];
    const edges = topGraphSignals.flatMap((signal) => {
      const edges: DriGraphEdge[] = [];
      signal.relatedReagentIds.forEach((id) => {
        edges.push({
          id: `${id}-${signal.id}-failed`,
          sourceId: reagentNodeId(id, 'failed'),
          targetId: signalNodeId(signal.id),
          color: signalColor(signal),
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
  }, [analysis, form.correctReagentIds.length, form.failedReagentIds.length, hierarchyGraph.edges, topGraphSignals]);

  const selectedSignal = useMemo(
    () =>
      selectedNodeId?.startsWith('signal:')
        ? analysis?.relationSignals.find((signal) => signal.id === selectedNodeId.replace('signal:', '')) || null
        : null,
    [analysis?.relationSignals, selectedNodeId],
  );

  const fixtureResults = useMemo(() => (catalog ? runDriValidationFixtures(catalog) : []), [catalog]);

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
      setForm((current) => ({
        ...current,
        selectedQcReferenceId: reference.id,
        expectedValue: current.expectedValue || String(reference.targetValue),
        controlLot: current.controlLot || reference.lot || '',
        reagentMeasurements: {
          ...current.reagentMeasurements,
          [reference.reagentId]: {
            ...(current.reagentMeasurements[reference.reagentId] || createEmptyReagentMeasurement(reference.reagentId)),
            selectedQcReferenceId: reference.id,
            expectedValue: current.reagentMeasurements[reference.reagentId]?.expectedValue || String(reference.targetValue),
            unit: current.reagentMeasurements[reference.reagentId]?.unit || reference.unit || null,
            updatedAt: current.reagentMeasurements[reference.reagentId]?.updatedAt || new Date().toISOString(),
          },
        },
      }));
    }
  }, [form.selectedQcReferenceId, qcReferenceOptions, qcReferenceReagentIds.length]);

  const handleFormChange = <K extends keyof DriCaseFormState>(field: K, value: DriCaseFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleToggleSignal = (field: keyof DriCaseFormState['signals']) => {
    setForm((current) => ({ ...current, signals: { ...current.signals, [field]: !current.signals[field] } }));
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

  const updateGraphShellControl = (field: keyof typeof graphShellControls, value: number) => {
    setGraphShellControls((current) => ({ ...current, [field]: value }));
  };

  const handleGraphShellControlInput = (field: keyof typeof graphShellControls, rawValue: string) => {
    updateGraphShellControl(field, Number(rawValue));
  };

  const handleAnalyze = async () => {
    if (!catalog || !form.serialNumber.trim() || !form.failedReagentIds.length) return;
    setSaving(true);
    setPersistWarning(null);
    const result = runDriEngine(form, catalog);
    startTransition(() => {
      setAnalysis(result);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
    });
    const persisted = await persistDriCase(form, result);
    setActiveCase(persisted.caseRecord);
    setPersistWarning(persisted.persistWarning);
    setHistory((current) => [persisted.caseRecord, ...current.filter((item) => item.id !== persisted.caseRecord.id)].slice(0, 24));
    setSaving(false);
  };

  const handleLoadDemo = () => {
    if (!catalog) {
      return;
    }

    const baseDemo = buildDemoFormState(catalog);
    const demoReferences = getMatchingQcReferences(catalog, baseDemo, baseDemo.failedReagentIds);
    const selectedReference =
      demoReferences.find((reference) => reference.controlLevel === 'level_1') || demoReferences[0] || null;

    const demoForm: DriCaseFormState = {
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
    };

    setPersistWarning(null);
    setEvidenceTasks({});
    setSearch('');
    setSelectedReagentId(demoForm.failedReagentIds[0] || demoForm.correctReagentIds[0] || null);
    setForm(demoForm);

    const result = runDriEngine(demoForm, catalog);
    startTransition(() => {
      setAnalysis(result);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
    });
    setActiveCase(null);
  };

  const handleLoadFullDemo = () => {
    if (!catalog) {
      return;
    }

    const demoForm = buildFullRandomDemoFormState(catalog, supportedProfiles, form.equipmentModel);

    setPersistWarning(null);
    setEvidenceTasks({});
    setSearch('');
    setSelectedReagentId(demoForm.failedReagentIds[0] || demoForm.correctReagentIds[0] || null);
    setForm(demoForm);

    const result = runDriEngine(demoForm, catalog);
    startTransition(() => {
      setAnalysis(result);
      setSelectedNodeId(null);
      setSelectedNodeIds([]);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
    });
    setActiveCase(null);
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
        <div className="dri-loading card">Preparando DRI, conocimiento BA400 y trazabilidad diagnóstica.</div>
      </div>
    );
  }

  return (
    <div className="dri-shell">
      <section className="dri-hero card">
        <div className="dri-hero__identity">
          <div>
            <div className="dri-hero__eyebrow">DRI · Diagnóstico por Relaciones Inteligentes</div>
            <h2>Radar diferencial para BA400 y futuras especializaciones</h2>
            <p>
              Cruza fallidas, correctas, factores compartidos, utilidades del programa de servicio y evidencia del ingeniero para priorizar hipótesis sin caer en prueba y error.
            </p>
          </div>
        </div>
        <div className="dri-hero__status">
          <span className="dri-badge dri-badge--teal">{catalogSource}</span>
          <span className="dri-badge dri-badge--neutral">{supportedProfiles.length} reactivos visibles</span>
          {analysis ? <span className="dri-badge dri-badge--amber">{analysis.hypotheses.length} hipótesis</span> : null}
        </div>
      </section>

      {catalogWarning ? <div className="dri-alert dri-alert--warning">{catalogWarning}</div> : null}
      {persistWarning ? <div className="dri-alert dri-alert--warning">{persistWarning}</div> : null}

      <div className="dri-stack">
        {canCapture ? <DriInputPanel
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
          onAnalyze={handleAnalyze}
          onLoadDemo={handleLoadDemo}
          onLoadFullDemo={handleLoadFullDemo}
          showDemoButton={sessionEmail === DEMO_ACCOUNT_EMAIL}
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
          onReset={() => {
            setEvidenceTasks({});
            setSelectedReagentId(null);
            setSelectedNodeId(null);
            setSelectedNodeIds([]);
            setForm(createInitialFormState());
          }}
        /> : null}

        {canViewGraph ? <section className="dri-panel dri-panel--graph">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Grafo de reactivos y factores</span>
              <h3>Relaciones activas del caso</h3>
            </div>
            {analysis ? (
              <div className="dri-inline-badges">
                {analysis.topSubsystems.slice(0, 3).map((item) => (
                  <span key={item.subsystem} className="dri-badge dri-badge--neutral">
                    {item.subsystem} · {Math.round(item.score)}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <div className="dri-graph-controls">
            <div className="dri-graph-controls__systems">
              <button
                type="button"
                className={`dri-pill-button ${focusedSystemKey === null ? 'is-active' : ''}`}
                onClick={() => setFocusedSystemKey(null)}
              >
                Todos
              </button>
              {graphSystemPills.map((system) => (
                <button
                  key={system.key}
                  type="button"
                  className={`dri-pill-button ${focusedSystemKey === system.key ? 'is-active' : ''}`}
                  onClick={() => setFocusedSystemKey((current) => (current === system.key ? null : system.key))}
                >
                  {system.label}
                </button>
              ))}
              <button
                type="button"
                className={`dri-pill-button ${graphMultiSelect ? 'is-active' : ''}`}
                onClick={() => setGraphMultiSelect((current) => !current)}
              >
                Selección múltiple
              </button>
              <button type="button" className="dri-pill-button" onClick={clearGraphSelection}>
                Limpiar selección
              </button>
            </div>
            <div className="dri-graph-controls__sliders">
              <label className="dri-graph-slider">
                <span>Núcleo</span>
                <strong>{graphShellControls.systemCoreRadius.toFixed(2)}</strong>
                <input
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.02"
                  value={graphShellControls.systemCoreRadius}
                  onChange={(event) => handleGraphShellControlInput('systemCoreRadius', event.currentTarget.value)}
                  onInput={(event) => handleGraphShellControlInput('systemCoreRadius', event.currentTarget.value)}
                />
              </label>
              <label className="dri-graph-slider">
                <span>Separación estratos</span>
                <strong>{graphShellControls.systemStep.toFixed(2)}</strong>
                <input
                  type="range"
                  min="0.7"
                  max="1.5"
                  step="0.02"
                  value={graphShellControls.systemStep}
                  onChange={(event) => handleGraphShellControlInput('systemStep', event.currentTarget.value)}
                  onInput={(event) => handleGraphShellControlInput('systemStep', event.currentTarget.value)}
                />
              </label>
              <label className="dri-graph-slider">
                <span>Base factores</span>
                <strong>{graphShellControls.factorBaseRadius.toFixed(2)}</strong>
                <input
                  type="range"
                  min="3.2"
                  max="5.6"
                  step="0.02"
                  value={graphShellControls.factorBaseRadius}
                  onChange={(event) => handleGraphShellControlInput('factorBaseRadius', event.currentTarget.value)}
                  onInput={(event) => handleGraphShellControlInput('factorBaseRadius', event.currentTarget.value)}
                />
              </label>
              <label className="dri-graph-slider">
                <span>Paso factores</span>
                <strong>{graphShellControls.factorStep.toFixed(2)}</strong>
                <input
                  type="range"
                  min="0.75"
                  max="1.6"
                  step="0.02"
                  value={graphShellControls.factorStep}
                  onChange={(event) => handleGraphShellControlInput('factorStep', event.currentTarget.value)}
                  onInput={(event) => handleGraphShellControlInput('factorStep', event.currentTarget.value)}
                />
              </label>
              <label className="dri-graph-slider">
                <span>Radio reactivos</span>
                <strong>{graphShellControls.reagentRadius.toFixed(2)}</strong>
                <input
                  type="range"
                  min="7.2"
                  max="11.4"
                  step="0.02"
                  value={graphShellControls.reagentRadius}
                  onChange={(event) => handleGraphShellControlInput('reagentRadius', event.currentTarget.value)}
                  onInput={(event) => handleGraphShellControlInput('reagentRadius', event.currentTarget.value)}
                />
              </label>
            </div>
          </div>
          <div className="dri-graph-stage">
            <DriGraph3D
              nodes={graphNodes}
              edges={graphEdges}
              selectedNodeIds={selectedNodeIds}
              onToggleNode={handleToggleGraphNode}
              focusedSystemKey={focusedSystemKey}
              shellControls={graphShellControls}
            />
          </div>
          {analysis ? (
            <>
              <div className="dri-case-ribbon">
                <span>Señales faltantes: {analysis.missingEvidence.length ? analysis.missingEvidence.join(' · ') : 'Sin vacíos críticos'}</span>
                <strong>{activeCase?.caseCode || `DRI-${analysis.runId.slice(0, 8).toUpperCase()}`}</strong>
              </div>
              <DriRelationMatrix
                signals={analysis.relationSignals}
                onSelectSignal={(signalId) => {
                  const nodeId = signalNodeId(signalId);
                  setSelectedNodeId(nodeId);
                  setSelectedNodeIds([nodeId]);
                }}
              />
            </>
          ) : (
            <div className="dri-empty-state">Selecciona fallidas y correctas, luego genera el diagnóstico diferencial.</div>
          )}
        </section> : null}

        {canViewDiagnosis ? <section className="dri-panel dri-panel--side">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Lectura guiada del caso</span>
              <h3>Ranking diagnóstico y trazabilidad clínica técnica</h3>
            </div>
          </div>

          {selectedSignal ? (
            <div className="dri-side-block">
              <span className="dri-side-block__label">Relación seleccionada</span>
              <strong>{selectedSignal.label}</strong>
              <p>{selectedSignal.evidenceFor[0]}</p>
              <p>{selectedSignal.evidenceAgainst[0]}</p>
            </div>
          ) : null}

          {analysis ? (
            <div className="dri-hypothesis-list">
              {analysis.hypotheses.map((hypothesis) => (
                <DriHypothesisCard
                  key={hypothesis.key}
                  hypothesis={hypothesis}
                  selected={selectedHypothesis?.key === hypothesis.key}
                  onSelect={() => setSelectedHypothesisKey(hypothesis.key)}
                />
              ))}
            </div>
          ) : (
            <div className="dri-empty-state">Todavía no hay hipótesis generadas para este caso.</div>
          )}

          <div className="dri-side-block">
            <span className="dri-side-block__label">Fixtures de validación</span>
            <strong>{fixtureResults.filter((result) => result.passed).length} / {fixtureResults.length} escenarios</strong>
            <p>Los fixtures cubren 340 nm, R2, dilución, temperatura, control, linealidad, interferencias y pruebas de servicio.</p>
          </div>
        </section> : null}

        {canViewDiagnosis && analysis ? (
          <DriEvidencePanel evidenceRows={analysis.evidenceRows} logs={analysis.logs} history={history} />
        ) : null}
      </div>
    </div>
  );
}
