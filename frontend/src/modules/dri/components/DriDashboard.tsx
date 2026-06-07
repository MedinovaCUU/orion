import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import DriGraph3D from './DriGraph3D';
import DriEvidencePanel from './DriEvidencePanel';
import DriHypothesisCard from './DriHypothesisCard';
import DriInputPanel from './DriInputPanel';
import DriRelationMatrix from './DriRelationMatrix';
import { loadDriCatalog, loadDriHistory, persistDriCase, uploadDriEvidenceAsset } from '../driData';
import { runDriEngine, runDriValidationFixtures } from '../driEngine';
import { buildReagentProfiles } from '../knowledge/reagentRelations';
import { buildObservationBlockFromEvidence, runDriEvidenceOcr } from '../utils/driEvidenceOcr';
import { createDriLogger } from '../utils/driLogging';
import { assessQcReference, findQcReferenceById, getMatchingQcReferences } from '../utils/qcReferenceUtils';
import type {
  DriCaseFormState,
  DriCatalog,
  DriDiagnosticCaseRecord,
  DriEngineResult,
  DriEvidenceArtifact,
  DriGraphEdge,
  DriGraphNode,
  DriQcReference,
  DriRelationSignal,
  DriServiceTestInput,
} from '../types/dri.types';

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
  if (signal.category === 'scheme' || signal.category === 'r2') return '#76bee8';
  if (signal.category === 'temperature') return '#ff9b68';
  if (signal.category === 'water') return '#79d9c1';
  if (signal.category === 'service') return '#ff676f';
  return '#9cb1c9';
};

export default function DriDashboard() {
  const [catalog, setCatalog] = useState<DriCatalog | null>(null);
  const [catalogSource, setCatalogSource] = useState('Cargando');
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<DriDiagnosticCaseRecord[]>([]);
  const [form, setForm] = useState<DriCaseFormState>(() => createInitialFormState());
  const [analysis, setAnalysis] = useState<DriEngineResult | null>(null);
  const [activeCase, setActiveCase] = useState<DriDiagnosticCaseRecord | null>(null);
  const [search, setSearch] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedHypothesisKey, setSelectedHypothesisKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const [evidenceTasks, setEvidenceTasks] = useState<Record<string, DriEvidenceTaskState>>({});
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let mounted = true;
    async function hydrate() {
      setLoading(true);
      const [catalogResult, historyResult] = await Promise.all([loadDriCatalog(), loadDriHistory()]);
      if (!mounted) return;
      setCatalog(catalogResult.catalog);
      setCatalogSource(catalogResult.sourceLabel);
      setCatalogWarning(catalogResult.warning);
      setHistory(historyResult);
      setLoading(false);
    }
    void hydrate();
    return () => {
      mounted = false;
    };
  }, []);

  const profiles = useMemo(() => (catalog ? buildReagentProfiles(catalog) : []), [catalog]);
  const supportedProfiles = useMemo(
    () => profiles.filter((profile) => profile.platforms.value.length === 0 || profile.platforms.value.includes(form.equipmentModel)),
    [form.equipmentModel, profiles],
  );
  const supportedIds = useMemo(() => new Set(supportedProfiles.map((profile) => profile.id)), [supportedProfiles]);

  const filteredReagents = useMemo(() => {
    if (!catalog) return [];
    const base = catalog.reagents.filter((reagent) => supportedIds.has(reagent.id));
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) return base;
    return base.filter((reagent) => `${reagent.id} ${reagent.name} ${reagent.reportedMethod || ''}`.toLowerCase().includes(needle));
  }, [catalog, deferredSearch, supportedIds]);

  const qcReferenceOptions = useMemo(
    () => (catalog ? getMatchingQcReferences(catalog, form) : []),
    [catalog, form],
  );

  const selectedQcReference = useMemo<DriQcReference | null>(() => {
    if (!catalog) return null;
    if (form.selectedQcReferenceId) {
      return findQcReferenceById(catalog, form.selectedQcReferenceId);
    }
    if (qcReferenceOptions.length === 1 && form.failedReagentIds.length === 1) {
      return qcReferenceOptions[0];
    }
    return null;
  }, [catalog, form.failedReagentIds.length, form.selectedQcReferenceId, qcReferenceOptions]);

  const qcAssessment = useMemo(
    () => assessQcReference(selectedQcReference, form.obtainedValue),
    [form.obtainedValue, selectedQcReference],
  );

  const selectedHypothesis = useMemo(
    () => analysis?.hypotheses.find((hypothesis) => hypothesis.key === selectedHypothesisKey) || analysis?.hypotheses[0] || null,
    [analysis?.hypotheses, selectedHypothesisKey],
  );

  const graphNodes = useMemo<DriGraphNode[]>(() => {
    if (!analysis || !catalog) return [];
    const reagentById = new Map(catalog.reagents.map((reagent) => [reagent.id, reagent]));
    const nodes: DriGraphNode[] = [];
    form.failedReagentIds.forEach((id) => {
      const reagent = reagentById.get(id);
      if (!reagent) return;
      nodes.push({ id: reagentNodeId(id, 'failed'), label: reagent.id, subtitle: reagent.name, type: 'failed_reagent', color: '#cf6d73', emphasis: 1.1, associationCount: 1, associationStrength: 0.72 });
    });
    form.correctReagentIds.forEach((id) => {
      const reagent = reagentById.get(id);
      if (!reagent) return;
      nodes.push({ id: reagentNodeId(id, 'correct'), label: reagent.id, subtitle: reagent.name, type: 'correct_reagent', color: '#4fc3b0', emphasis: 0.98, associationCount: 1, associationStrength: 0.68 });
    });
    const maxSignalScore = Math.max(...analysis.relationSignals.slice(0, 10).map((signal) => signal.suspicionScore), 1);
    analysis.relationSignals.slice(0, 10).forEach((signal) => {
      nodes.push({
        id: signalNodeId(signal.id),
        label: signal.label,
        subtitle: `${signal.category} · score ${Math.round(signal.suspicionScore)}`,
        type: 'factor',
        color: signalColor(signal),
        emphasis: 0.82 + signal.suspicionScore / 44,
        associationCount: signal.relatedReagentIds.length + signal.contrastReagentIds.length,
        associationStrength: signal.suspicionScore / maxSignalScore,
      });
    });
    return nodes;
  }, [analysis, catalog, form.correctReagentIds, form.failedReagentIds]);

  const graphEdges = useMemo<DriGraphEdge[]>(() => {
    if (!analysis) return [];
    return analysis.relationSignals.slice(0, 10).flatMap((signal) => {
      const edges: DriGraphEdge[] = [];
      signal.relatedReagentIds.forEach((id) => {
        edges.push({
          id: `${id}-${signal.id}-failed`,
          sourceId: reagentNodeId(id, 'failed'),
          targetId: signalNodeId(signal.id),
          color: signalColor(signal),
          weight: Math.max(1, signal.suspicionScore / 34),
          relationType: signal.category,
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
        });
      });
      return edges;
    });
  }, [analysis]);

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

    if (!form.selectedQcReferenceId && qcReferenceOptions.length === 1 && form.failedReagentIds.length === 1) {
      const [reference] = qcReferenceOptions;
      setForm((current) => ({
        ...current,
        selectedQcReferenceId: reference.id,
        expectedValue: current.expectedValue || String(reference.targetValue),
        controlLot: current.controlLot || reference.lot || '',
      }));
    }
  }, [form.failedReagentIds.length, form.selectedQcReferenceId, qcReferenceOptions]);

  const handleFormChange = <K extends keyof DriCaseFormState>(field: K, value: DriCaseFormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleToggleSignal = (field: keyof DriCaseFormState['signals']) => {
    setForm((current) => ({ ...current, signals: { ...current.signals, [field]: !current.signals[field] } }));
  };

  const handleReagentCycle = (reagentId: string) => {
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

  const handleAnalyze = async () => {
    if (!catalog || !form.serialNumber.trim() || !form.failedReagentIds.length) return;
    setSaving(true);
    setPersistWarning(null);
    const result = runDriEngine(form, catalog);
    startTransition(() => {
      setAnalysis(result);
      setSelectedNodeId(result.relationSignals[0] ? signalNodeId(result.relationSignals[0].id) : null);
      setSelectedHypothesisKey(result.hypotheses[0]?.key || null);
    });
    const persisted = await persistDriCase(form, result);
    setActiveCase(persisted.caseRecord);
    setPersistWarning(persisted.persistWarning);
    setHistory((current) => [persisted.caseRecord, ...current.filter((item) => item.id !== persisted.caseRecord.id)].slice(0, 24));
    setSaving(false);
  };

  const applyQcReference = (reference: DriQcReference) => {
    setForm((current) => ({
      ...current,
      selectedQcReferenceId: reference.id,
      expectedValue: String(reference.targetValue),
      controlLot: current.controlLot || reference.lot || '',
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
        <DriInputPanel
          form={form}
          filteredReagents={filteredReagents}
          qcReferenceOptions={qcReferenceOptions}
          selectedQcReference={selectedQcReference}
          qcAssessment={qcAssessment}
          search={search}
          onSearchChange={setSearch}
          onFormChange={handleFormChange}
          onToggleSignal={handleToggleSignal}
          onCycleReagent={handleReagentCycle}
          onApplyQcReference={applyQcReference}
          onAnalyze={handleAnalyze}
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
          onReset={() => {
            setEvidenceTasks({});
            setForm(createInitialFormState());
          }}
        />

        <section className="dri-panel dri-panel--graph">
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
          <div className="dri-graph-stage">
            <DriGraph3D nodes={graphNodes} edges={graphEdges} selectedNodeId={selectedNodeId} onSelectNode={setSelectedNodeId} />
          </div>
          {analysis ? (
            <>
              <div className="dri-case-ribbon">
                <span>Señales faltantes: {analysis.missingEvidence.length ? analysis.missingEvidence.join(' · ') : 'Sin vacíos críticos'}</span>
                <strong>{activeCase?.caseCode || `DRI-${analysis.runId.slice(0, 8).toUpperCase()}`}</strong>
              </div>
              <DriRelationMatrix
                signals={analysis.relationSignals}
                onSelectSignal={(signalId) => setSelectedNodeId(signalNodeId(signalId))}
              />
            </>
          ) : (
            <div className="dri-empty-state">Selecciona fallidas y correctas, luego genera el diagnóstico diferencial.</div>
          )}
        </section>

        <section className="dri-panel dri-panel--side">
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
            <p>Los fixtures cubren 340 nm, R2, dilución, temperatura, control y pruebas de servicio.</p>
          </div>
        </section>

        {analysis ? (
          <DriEvidencePanel evidenceRows={analysis.evidenceRows} logs={analysis.logs} history={history} />
        ) : null}
      </div>
    </div>
  );
}
