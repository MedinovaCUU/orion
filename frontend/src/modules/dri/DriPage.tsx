import { startTransition, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import DriGraph3D from './components/DriGraph3D';
import { loadDriCatalog, loadDriHistory, persistDriCase } from './driData';
import { runDriEngine } from './driEngine';
import type {
  DriCatalog,
  DriCaseFormState,
  DriDiagnosticCaseRecord,
  DriEngineResult,
  DriEvidenceRow,
  DriFactor,
  DriFactorAggregate,
  DriFactorLink,
  DriGraphEdge,
  DriGraphNode,
  DriHypothesisResult,
  DriOutcomeType,
  DriReagent,
} from './driTypes';
import {
  DRI_EQUIPMENT_OPTIONS,
  DRI_EVENT_OPTIONS,
  DRI_FAILURE_OPTIONS,
} from './driTypes';
import './dri.css';

const createInitialFormState = (): DriCaseFormState => ({
  equipmentModel: 'BA400',
  serialNumber: '',
  eventDate: new Date().toISOString().slice(0, 10),
  eventType: 'qc_out_of_range',
  failureDirection: 'high',
  reagentLot: '',
  controlLot: '',
  calibratorLot: '',
  observations: '',
  failedReagentIds: [],
  correctReagentIds: [],
  signals: {
    intermittentPattern: false,
    normalCurvesObserved: false,
    opticalRejectObserved: false,
    waterSensitivePattern: false,
  },
});

const relationEdgeColor = (relationType: string) => {
  if (relationType.includes('filtro')) {
    return '#b59d63';
  }

  if (relationType.includes('metodo')) {
    return '#6caeb7';
  }

  if (relationType.includes('tipo')) {
    return '#8ca2b6';
  }

  return '#b89180';
};

const hexToRgb = (hex: string) => {
  const sanitized = hex.replace('#', '');
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => char + char)
          .join('')
      : sanitized;

  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0'))
    .join('')}`;

const mixColors = (from: string, to: string, ratio: number) => {
  const safeRatio = Math.max(0, Math.min(1, ratio));
  const start = hexToRgb(from);
  const end = hexToRgb(to);

  return rgbToHex({
    r: start.r + (end.r - start.r) * safeRatio,
    g: start.g + (end.g - start.g) * safeRatio,
    b: start.b + (end.b - start.b) * safeRatio,
  });
};

const getSaturatedNodeColor = (accent: string, associationCount: number, maxAssociationCount: number) => {
  const normalized = maxAssociationCount > 0 ? associationCount / maxAssociationCount : 0;
  const boosted = Math.pow(normalized, 0.74);
  const ratio = 0.14 + boosted * 0.86;
  return mixColors('#c9d2da', accent, ratio);
};

const reagentNodeId = (reagentId: string, kind: DriOutcomeType) => `reagent:${reagentId}:${kind}`;
const factorNodeId = (factorId: string) => `factor:${factorId}`;

const formatOptionLabel = (value: string, options: Array<{ value: string; label: string }>) =>
  options.find((option) => option.value === value)?.label || value;

const buildSummaryActions = (hypotheses: DriHypothesisResult[]) =>
  Array.from(new Set(hypotheses.flatMap((hypothesis) => hypothesis.confirmatoryActions))).slice(0, 6);

function StatusBadge({
  tone,
  children,
}: {
  tone: 'neutral' | 'teal' | 'amber' | 'red';
  children: ReactNode;
}) {
  return <span className={`dri-badge dri-badge--${tone}`}>{children}</span>;
}

function SignalToggle({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`dri-signal ${active ? 'is-active' : ''}`} onClick={onClick}>
      <span className="dri-signal__dot" />
      {label}
    </button>
  );
}

function ModuleGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3.5 18.2 6v6c0 4.1-2.4 7-6.2 8.5C8.2 19 5.8 16.1 5.8 12V6L12 3.5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 12.2h7M12 8.7v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export default function DriPage() {
  const [catalog, setCatalog] = useState<DriCatalog | null>(null);
  const [catalogSource, setCatalogSource] = useState<string>('Cargando');
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<DriDiagnosticCaseRecord[]>([]);
  const [form, setForm] = useState<DriCaseFormState>(() => createInitialFormState());
  const [search, setSearch] = useState('');
  const [analysis, setAnalysis] = useState<DriEngineResult | null>(null);
  const [activeCase, setActiveCase] = useState<DriDiagnosticCaseRecord | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [persistWarning, setPersistWarning] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      setLoading(true);
      const [catalogResult, historyResult] = await Promise.all([loadDriCatalog(), loadDriHistory()]);
      if (!mounted) {
        return;
      }

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

  const reagentById = useMemo(
    () => new Map((catalog?.reagents || []).map((reagent) => [reagent.id, reagent])),
    [catalog],
  );

  const factorById = useMemo(
    () => new Map((catalog?.factors || []).map((factor) => [factor.id, factor])),
    [catalog],
  );

  const linksByReagentId = useMemo(() => {
    const map = new Map<string, DriFactorLink[]>();
    (catalog?.links || []).forEach((link) => {
      const existing = map.get(link.reagentId) ?? [];
      existing.push(link);
      map.set(link.reagentId, existing);
    });
    return map;
  }, [catalog?.links]);

  const filteredReagents = useMemo(() => {
    const base = catalog?.reagents || [];
    const needle = deferredSearch.trim().toLowerCase();
    if (!needle) {
      return base;
    }

    return base.filter((reagent) => {
      const haystack = `${reagent.id} ${reagent.name} ${reagent.reportedMethod || ''} ${reagent.reagentType || ''}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [catalog?.reagents, deferredSearch]);

  const graphNodes = useMemo<DriGraphNode[]>(() => {
    if (!catalog || !analysis) {
      return [];
    }

    const baseNodes: DriGraphNode[] = [];
    const selectedReagentFromNode =
      selectedNodeId?.startsWith('reagent:') ? selectedNodeId.split(':')[1] : null;
    const selectedExtraFactors = selectedReagentFromNode
      ? (linksByReagentId.get(selectedReagentFromNode) || []).map((link) => link.factorId)
      : [];
    const visibleFactorIds = Array.from(
      new Set([
        ...analysis.factorAggregates.slice(0, 10).map((aggregate) => aggregate.factorId),
        ...selectedExtraFactors,
      ]),
    );
    const visibleFactorIdSet = new Set(visibleFactorIds);
    const factorAssociationCount = new Map(
      analysis.factorAggregates.map((aggregate) => [
        aggregate.factorId,
        aggregate.failedCount + aggregate.correctCount,
      ]),
    );
    const reagentAssociationCount = (reagentId: string) =>
      (linksByReagentId.get(reagentId) || []).filter((link) => visibleFactorIdSet.has(link.factorId)).length;
    const factorAssociationCounts = visibleFactorIds.map((factorId) => factorAssociationCount.get(factorId) || 0);
    const maxFactorAssociationCount = Math.max(...factorAssociationCounts, 1);

    form.failedReagentIds.forEach((reagentId) => {
      const reagent = reagentById.get(reagentId);
      if (!reagent) {
        return;
      }

      const associationCount = reagentAssociationCount(reagentId);

      baseNodes.push({
        id: reagentNodeId(reagentId, 'failed'),
        label: reagent.id,
        subtitle: reagent.name,
        type: 'failed_reagent',
        color: '#d88f87',
        emphasis: 1.2,
        associationCount,
        associationStrength: 0.68,
      });
    });

    form.correctReagentIds.forEach((reagentId) => {
      const reagent = reagentById.get(reagentId);
      if (!reagent) {
        return;
      }

      const associationCount = reagentAssociationCount(reagentId);

      baseNodes.push({
        id: reagentNodeId(reagentId, 'correct'),
        label: reagent.id,
        subtitle: reagent.name,
        type: 'correct_reagent',
        color: '#7fcfbc',
        emphasis: 0.95,
        associationCount,
        associationStrength: 0.68,
      });
    });

    visibleFactorIds.forEach((factorId) => {
      const factor = factorById.get(factorId);
      const aggregate = analysis.factorAggregates.find((item) => item.factorId === factorId);
      if (!factor) {
        return;
      }

      const associationCount = factorAssociationCount.get(factorId) || 0;
      const associationStrength = associationCount / maxFactorAssociationCount;

      baseNodes.push({
        id: factorNodeId(factorId),
        label: factor.label,
        subtitle: `${factor.factorType} · score ${aggregate?.suspicionScore ?? 0}`,
        type: 'factor',
        color: getSaturatedNodeColor('#c4a35a', associationCount, maxFactorAssociationCount),
        emphasis: aggregate ? Math.max(0.8, aggregate.suspicionScore / 32, 0.75 + associationCount * 0.08) : 0.8,
        associationCount,
        associationStrength,
      });
    });

    return baseNodes;
  }, [analysis, catalog, factorById, form.correctReagentIds, form.failedReagentIds, linksByReagentId, reagentById, selectedNodeId]);

  const graphEdges = useMemo<DriGraphEdge[]>(() => {
    if (!catalog || !analysis) {
      return [];
    }

    const visibleNodeIds = new Set(graphNodes.map((node) => node.id));
    const visibleFactorIds = new Set(
      graphNodes.filter((node) => node.type === 'factor').map((node) => node.id.replace('factor:', '')),
    );

    return catalog.links
      .filter((link) => {
        const reagentKind = form.failedReagentIds.includes(link.reagentId)
          ? 'failed'
          : form.correctReagentIds.includes(link.reagentId)
            ? 'correct'
            : null;

        if (!reagentKind || !visibleFactorIds.has(link.factorId)) {
          return false;
        }

        return visibleNodeIds.has(reagentNodeId(link.reagentId, reagentKind)) && visibleNodeIds.has(factorNodeId(link.factorId));
      })
      .map((link) => {
        const reagentKind = form.failedReagentIds.includes(link.reagentId) ? 'failed' : 'correct';
        return {
          id: `${link.reagentId}-${link.factorId}-${link.relationType}`,
          sourceId: reagentNodeId(link.reagentId, reagentKind),
          targetId: factorNodeId(link.factorId),
          color: relationEdgeColor(link.relationType),
          weight: link.weight,
          relationType: link.relationType,
        };
      });
  }, [analysis, catalog, form.correctReagentIds, form.failedReagentIds, graphNodes]);

  const selectedFactor = useMemo<DriFactor | null>(() => {
    if (!selectedNodeId?.startsWith('factor:')) {
      return null;
    }

    return factorById.get(selectedNodeId.replace('factor:', '')) || null;
  }, [factorById, selectedNodeId]);

  const selectedReagent = useMemo<DriReagent | null>(() => {
    if (!selectedNodeId?.startsWith('reagent:')) {
      return null;
    }

    const parts = selectedNodeId.split(':');
    return reagentById.get(parts[1]) || null;
  }, [reagentById, selectedNodeId]);

  const selectedAggregate = useMemo<DriFactorAggregate | null>(() => {
    if (!analysis || !selectedFactor) {
      return null;
    }

    return analysis.factorAggregates.find((aggregate) => aggregate.factorId === selectedFactor.id) || null;
  }, [analysis, selectedFactor]);

  const selectedRelatedFactors = useMemo(() => {
    if (!analysis || !selectedReagent) {
      return [];
    }

    const factorIds = new Set((linksByReagentId.get(selectedReagent.id) || []).map((link) => link.factorId));
    return analysis.factorAggregates.filter((aggregate) => factorIds.has(aggregate.factorId)).slice(0, 8);
  }, [analysis, linksByReagentId, selectedReagent]);

  const relatedHistory = useMemo(() => {
    if (!selectedNodeId) {
      return history.slice(0, 8);
    }

    if (selectedReagent) {
      return history.filter((record) => record.items.some((item) => item.reagentId === selectedReagent.id)).slice(0, 8);
    }

    if (selectedFactor) {
      const reagentIds = new Set(
        (catalog?.links || [])
          .filter((link) => link.factorId === selectedFactor.id)
          .map((link) => link.reagentId),
      );

      return history.filter((record) => record.items.some((item) => reagentIds.has(item.reagentId))).slice(0, 8);
    }

    return history.slice(0, 8);
  }, [catalog?.links, history, selectedFactor, selectedNodeId, selectedReagent]);

  const recommendedActions = useMemo(
    () => buildSummaryActions(analysis?.hypotheses || []),
    [analysis?.hypotheses],
  );

  const handleOutcomeToggle = (reagentId: string, outcome: DriOutcomeType) => {
    setForm((current) => {
      const failedSet = new Set(current.failedReagentIds);
      const correctSet = new Set(current.correctReagentIds);

      if (outcome === 'failed') {
        if (failedSet.has(reagentId)) {
          failedSet.delete(reagentId);
        } else {
          failedSet.add(reagentId);
          correctSet.delete(reagentId);
        }
      } else {
        if (correctSet.has(reagentId)) {
          correctSet.delete(reagentId);
        } else {
          correctSet.add(reagentId);
          failedSet.delete(reagentId);
        }
      }

      return {
        ...current,
        failedReagentIds: Array.from(failedSet),
        correctReagentIds: Array.from(correctSet),
      };
    });
  };

  const handleAnalyze = async () => {
    if (!catalog || !form.serialNumber.trim() || form.failedReagentIds.length === 0) {
      return;
    }

    setSaving(true);
    setPersistWarning(null);
    const engineResult = runDriEngine(form, catalog);

    startTransition(() => {
      setAnalysis(engineResult);
      const nextSelectedNode =
        engineResult.factorAggregates[0]
          ? factorNodeId(engineResult.factorAggregates[0].factorId)
          : form.failedReagentIds[0]
            ? reagentNodeId(form.failedReagentIds[0], 'failed')
            : null;
      setSelectedNodeId(nextSelectedNode);
    });

    const persisted = await persistDriCase(form, engineResult);
    setActiveCase(persisted.caseRecord);
    setPersistWarning(persisted.persistWarning);
    setHistory((current) => [persisted.caseRecord, ...current.filter((item) => item.id !== persisted.caseRecord.id)].slice(0, 24));
    setSaving(false);
  };

  const caseMetrics = useMemo(
    () => ({
      failedCount: form.failedReagentIds.length,
      correctCount: form.correctReagentIds.length,
      factorCount: analysis?.factorAggregates.length || 0,
      topScore: analysis?.hypotheses[0]?.score || 0,
    }),
    [analysis?.factorAggregates.length, analysis?.hypotheses, form.correctReagentIds.length, form.failedReagentIds.length],
  );

  const canAnalyze = Boolean(catalog && form.serialNumber.trim() && form.failedReagentIds.length > 0);

  if (loading || !catalog) {
    return (
      <div className="dri-shell">
        <div className="dri-loading card">Preparando DRI, catálogo relacional y capa de diagnóstico.</div>
      </div>
    );
  }

  return (
    <div className="dri-shell">
      <section className="dri-hero card">
        <div className="dri-hero__identity">
          <span className="dri-hero__glyph">
            <ModuleGlyph />
          </span>
          <div>
            <div className="dri-hero__eyebrow">DRI · Diagnóstico Relacional Inteligente</div>
            <h2>Diagnóstico diferencial para QC, blancos, calibraciones y curvas</h2>
            <p>
              Relaciona reactivos, filtros, técnicas y riesgos operativos para generar hipótesis ponderadas y explicables
              sobre BA400, BA200 y A15.
            </p>
          </div>
        </div>

        <div className="dri-hero__status">
          <StatusBadge tone="teal">{catalogSource}</StatusBadge>
          <StatusBadge tone="neutral">{catalog.reagents.length} reactivos</StatusBadge>
          <StatusBadge tone="neutral">{catalog.factors.length} factores</StatusBadge>
          {analysis ? <StatusBadge tone="amber">{analysis.hypotheses.length} hipótesis</StatusBadge> : null}
        </div>
      </section>

      {catalogWarning ? <div className="dri-alert dri-alert--warning">{catalogWarning}</div> : null}
      {persistWarning ? <div className="dri-alert dri-alert--warning">{persistWarning}</div> : null}

      <div className="dri-grid">
        <section className="dri-panel dri-panel--form">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Caso nuevo</span>
              <h3>Registrar escenario</h3>
            </div>
            <button type="button" className="dri-ghost-button" onClick={() => setForm(createInitialFormState())}>
              Reiniciar
            </button>
          </div>

          <div className="dri-form-grid">
            <label className="dri-field">
              <span>Modelo</span>
              <select
                className="input-field"
                value={form.equipmentModel}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    equipmentModel: event.target.value as DriCaseFormState['equipmentModel'],
                  }))
                }
              >
                {DRI_EQUIPMENT_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="dri-field">
              <span>No. de serie</span>
              <input
                className="input-field"
                value={form.serialNumber}
                onChange={(event) => setForm((current) => ({ ...current, serialNumber: event.target.value }))}
                placeholder="8340..."
              />
            </label>

            <label className="dri-field">
              <span>Fecha</span>
              <input
                type="date"
                className="input-field"
                value={form.eventDate}
                onChange={(event) => setForm((current) => ({ ...current, eventDate: event.target.value }))}
              />
            </label>

            <label className="dri-field">
              <span>Tipo de evento</span>
              <select
                className="input-field"
                value={form.eventType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    eventType: event.target.value as DriCaseFormState['eventType'],
                  }))
                }
              >
                {DRI_EVENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="dri-field">
              <span>Dirección de falla</span>
              <select
                className="input-field"
                value={form.failureDirection}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    failureDirection: event.target.value as DriCaseFormState['failureDirection'],
                  }))
                }
              >
                {DRI_FAILURE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="dri-field">
              <span>Lote de reactivo</span>
              <input
                className="input-field"
                value={form.reagentLot}
                onChange={(event) => setForm((current) => ({ ...current, reagentLot: event.target.value }))}
                placeholder="RGT-..."
              />
            </label>

            <label className="dri-field">
              <span>Lote de control</span>
              <input
                className="input-field"
                value={form.controlLot}
                onChange={(event) => setForm((current) => ({ ...current, controlLot: event.target.value }))}
                placeholder="CTRL-..."
              />
            </label>

            <label className="dri-field">
              <span>Lote de calibrador</span>
              <input
                className="input-field"
                value={form.calibratorLot}
                onChange={(event) => setForm((current) => ({ ...current, calibratorLot: event.target.value }))}
                placeholder="CAL-..."
              />
            </label>
          </div>

          <div className="dri-signals">
            <SignalToggle
              active={form.signals.intermittentPattern}
              label="Intermitente"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  signals: { ...current.signals, intermittentPattern: !current.signals.intermittentPattern },
                }))
              }
            />
            <SignalToggle
              active={form.signals.normalCurvesObserved}
              label="Curvas normales"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  signals: { ...current.signals, normalCurvesObserved: !current.signals.normalCurvesObserved },
                }))
              }
            />
            <SignalToggle
              active={form.signals.opticalRejectObserved}
              label="Rechazo óptico"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  signals: { ...current.signals, opticalRejectObserved: !current.signals.opticalRejectObserved },
                }))
              }
            />
            <SignalToggle
              active={form.signals.waterSensitivePattern}
              label="Sensibles a agua"
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  signals: { ...current.signals, waterSensitivePattern: !current.signals.waterSensitivePattern },
                }))
              }
            />
          </div>

          <label className="dri-field">
            <span>Observaciones</span>
            <textarea
              className="input-field dri-textarea"
              value={form.observations}
              onChange={(event) => setForm((current) => ({ ...current, observations: event.target.value }))}
              placeholder="Alarmas, comportamiento de curva, mantenimiento reciente, carryover, agua, cubeta, R2..."
            />
          </label>

          <div className="dri-picker">
            <div className="dri-picker__head">
              <div>
                <span className="dri-panel__eyebrow">Reactivos del caso</span>
                <h4>Marca fallidas y correctas</h4>
              </div>
              <input
                className="input-field dri-picker__search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar reactivo, código, técnica..."
              />
            </div>

            <div className="dri-selected-strips">
              <div className="dri-selected-strip">
                <span>Fallidas</span>
                <div>
                  {form.failedReagentIds.length > 0 ? (
                    form.failedReagentIds.map((id) => <StatusBadge key={id} tone="red">{id}</StatusBadge>)
                  ) : (
                    <StatusBadge tone="neutral">Sin seleccionar</StatusBadge>
                  )}
                </div>
              </div>
              <div className="dri-selected-strip">
                <span>Correctas</span>
                <div>
                  {form.correctReagentIds.length > 0 ? (
                    form.correctReagentIds.map((id) => <StatusBadge key={id} tone="teal">{id}</StatusBadge>)
                  ) : (
                    <StatusBadge tone="neutral">Sin contraste</StatusBadge>
                  )}
                </div>
              </div>
            </div>

            <div className="dri-reagent-list">
              {filteredReagents.map((reagent) => {
                const failedActive = form.failedReagentIds.includes(reagent.id);
                const correctActive = form.correctReagentIds.includes(reagent.id);
                return (
                  <div key={reagent.id} className={`dri-reagent-row ${failedActive ? 'is-failed' : correctActive ? 'is-correct' : ''}`}>
                    <div>
                      <strong>{reagent.id}</strong>
                      <p>{reagent.name}</p>
                      <small>{reagent.reportedMethod || reagent.reagentType || 'Sin método cargado'}</small>
                    </div>
                    <div className="dri-reagent-row__actions">
                      <button
                        type="button"
                        className={`dri-pill-button dri-pill-button--danger ${failedActive ? 'is-active' : ''}`}
                        onClick={() => handleOutcomeToggle(reagent.id, 'failed')}
                      >
                        Falla
                      </button>
                      <button
                        type="button"
                        className={`dri-pill-button dri-pill-button--success ${correctActive ? 'is-active' : ''}`}
                        onClick={() => handleOutcomeToggle(reagent.id, 'correct')}
                      >
                        Correcta
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="dri-case-metrics">
            <div>
              <span>Fallidas</span>
              <strong>{caseMetrics.failedCount}</strong>
            </div>
            <div>
              <span>Correctas</span>
              <strong>{caseMetrics.correctCount}</strong>
            </div>
            <div>
              <span>Factores</span>
              <strong>{caseMetrics.factorCount}</strong>
            </div>
            <div>
              <span>Top score</span>
              <strong>{caseMetrics.topScore || '—'}</strong>
            </div>
          </div>

          <button type="button" className="button-primary dri-submit" disabled={!canAnalyze || saving} onClick={handleAnalyze}>
            {saving ? 'Generando y guardando…' : 'Generar diagnóstico'}
          </button>
        </section>

        <section className="dri-panel dri-panel--graph">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Mapa relacional 3D</span>
              <h3>Grafo de reactivos y factores</h3>
            </div>
            <div className="dri-legend">
              <StatusBadge tone="red">Fallidas</StatusBadge>
              <StatusBadge tone="teal">Correctas</StatusBadge>
              <StatusBadge tone="amber">Factores</StatusBadge>
            </div>
          </div>

          <div className="dri-graph-stage">
            <DriGraph3D
              nodes={graphNodes}
              edges={graphEdges}
              selectedNodeId={selectedNodeId}
              onSelectNode={setSelectedNodeId}
            />
          </div>

          <div className="dri-case-ribbon">
            <span>{analysis ? 'Caso analizado' : 'Esperando caso'}</span>
            <strong>
              {activeCase?.caseCode || 'DRI local'} · {formatOptionLabel(form.eventType, DRI_EVENT_OPTIONS)} ·{' '}
              {formatOptionLabel(form.failureDirection, DRI_FAILURE_OPTIONS)}
            </strong>
          </div>
        </section>

        <aside className="dri-panel dri-panel--side">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Panel lateral</span>
              <h3>Lectura guiada del caso</h3>
            </div>
          </div>

          <div className="dri-side-block">
            <span className="dri-side-block__label">Elemento seleccionado</span>
            {selectedReagent ? (
              <>
                <strong>{selectedReagent.id} · {selectedReagent.name}</strong>
                <p>{selectedReagent.reportedMethod || selectedReagent.reagentType || 'Sin dato metodológico cargado.'}</p>
                <div className="dri-inline-badges">
                  {selectedRelatedFactors.slice(0, 5).map((aggregate) => (
                    <StatusBadge key={aggregate.factorId} tone="amber">
                      {aggregate.label}
                    </StatusBadge>
                  ))}
                </div>
              </>
            ) : selectedFactor ? (
              <>
                <strong>{selectedFactor.label}</strong>
                <p>{selectedFactor.description || 'Sin descripción técnica registrada.'}</p>
                <div className="dri-inline-badges">
                  <StatusBadge tone="amber">{selectedFactor.factorType}</StatusBadge>
                  {selectedAggregate ? <StatusBadge tone="neutral">score {selectedAggregate.suspicionScore}</StatusBadge> : null}
                </div>
                <small>
                  {selectedFactor.confidence} · {selectedFactor.sourceType} · {selectedFactor.sourceReference}
                </small>
              </>
            ) : (
              <p>Selecciona un nodo del grafo para inspeccionar reactivos, factores y casos históricos relacionados.</p>
            )}
          </div>

          <div className="dri-side-block">
            <span className="dri-side-block__label">Hipótesis activas</span>
            {analysis?.hypotheses.length ? (
              <div className="dri-hypothesis-list">
                {analysis.hypotheses.slice(0, 5).map((hypothesis) => (
                  <button
                    type="button"
                    key={hypothesis.key}
                    className="dri-hypothesis-card"
                    onClick={() => {
                      const firstFactor = hypothesis.supportingFactorIds[0];
                      setSelectedNodeId(firstFactor ? factorNodeId(firstFactor) : null);
                    }}
                  >
                    <div>
                      <strong>{hypothesis.title}</strong>
                      <p>{hypothesis.evidenceFor[0] || 'Sin evidencia resumida.'}</p>
                    </div>
                    <StatusBadge tone={hypothesis.score >= 72 ? 'red' : hypothesis.score >= 56 ? 'amber' : 'neutral'}>
                      {hypothesis.score}
                    </StatusBadge>
                  </button>
                ))}
              </div>
            ) : (
              <p>Genera un diagnóstico para ver hipótesis activas.</p>
            )}
          </div>

          <div className="dri-side-block">
            <span className="dri-side-block__label">Acciones recomendadas</span>
            {recommendedActions.length ? (
              <ul className="dri-action-list">
                {recommendedActions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            ) : (
              <p>Las acciones confirmatorias aparecerán al generar hipótesis.</p>
            )}
          </div>

          <div className="dri-side-block">
            <span className="dri-side-block__label">Casos históricos</span>
            {relatedHistory.length ? (
              <div className="dri-history-list">
                {relatedHistory.map((record) => (
                  <button
                    key={record.id}
                    type="button"
                    className="dri-history-card"
                    onClick={() => {
                      setActiveCase(record);
                      const firstFailed = record.items.find((item) => item.outcomeType === 'failed');
                      if (firstFailed) {
                        setSelectedNodeId(reagentNodeId(firstFailed.reagentId, 'failed'));
                      }
                    }}
                  >
                    <strong>{record.caseCode}</strong>
                    <p>{record.serialNumber} · {formatOptionLabel(record.eventType, DRI_EVENT_OPTIONS)}</p>
                    <small>{record.hypotheses[0]?.title || 'Sin hipótesis persistida'} </small>
                  </button>
                ))}
              </div>
            ) : (
              <p>No hay casos históricos ligados al nodo seleccionado.</p>
            )}
          </div>
        </aside>
      </div>

      <div className="dri-bottom-grid">
        <section className="dri-panel dri-panel--evidence">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Evidencia</span>
              <h3>Tabla de factores y peso diferencial</h3>
            </div>
            {activeCase ? <StatusBadge tone="neutral">{activeCase.caseCode}</StatusBadge> : null}
          </div>

          {analysis?.evidenceRows.length ? (
            <div className="dri-table-wrapper">
              <table className="dri-table">
                <thead>
                  <tr>
                    <th>Factor</th>
                    <th>Tipo</th>
                    <th>Fallidas</th>
                    <th>Correctas</th>
                    <th>Peso</th>
                    <th>Score</th>
                    <th>A favor</th>
                    <th>En contra</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.evidenceRows.slice(0, 12).map((row: DriEvidenceRow) => (
                    <tr key={row.id} onClick={() => setSelectedNodeId(factorNodeId(row.factorId))}>
                      <td>{row.label}</td>
                      <td>{row.factorType}</td>
                      <td>{Math.round(row.failedCoverage * 100)}%</td>
                      <td>{Math.round(row.correctCoverage * 100)}%</td>
                      <td>{row.meanLinkWeight}</td>
                      <td>{row.suspicionScore}</td>
                      <td>{row.evidenceFor}</td>
                      <td>{row.evidenceAgainst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="dri-empty-state">La tabla de evidencia aparecerá después de generar el diagnóstico.</div>
          )}
        </section>

        <section className="dri-panel dri-panel--trace">
          <div className="dri-panel__head">
            <div>
              <span className="dri-panel__eyebrow">Logging</span>
              <h3>Traza del motor</h3>
            </div>
            {analysis ? <StatusBadge tone="teal">{analysis.logs.length} eventos</StatusBadge> : null}
          </div>

          {analysis?.logs.length ? (
            <div className="dri-log-list">
              {analysis.logs.slice(0, 14).map((log) => (
                <div key={`${log.step}-${log.message}`} className={`dri-log-entry dri-log-entry--${log.level}`}>
                  <div>
                    <strong>{log.step}</strong>
                    <p>{log.message}</p>
                  </div>
                  <small>{Object.keys(log.details).join(' · ') || 'sin payload adicional'}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="dri-empty-state">Los logs de cálculo aparecerán cuando corras el motor.</div>
          )}
        </section>
      </div>
    </div>
  );
}
