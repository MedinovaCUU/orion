import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import DriDashboard from './components/DriDashboard';
import SatReportImporter from '../sat-report/SatReportImporter';
import { loadLatestEquipmentQc, loadLatestSatReport } from '../sat-report/satReportData';
import type { SatReportSummary } from '../sat-report/satReportTypes';
import { BPL_TONE_LABELS, type BplSerialSummary } from '../equipment-monitoring/bplEvents';
import { loadBplSerialEvents } from '../equipment-monitoring/bplEventsData';
import './dri.css';

type BplLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const formatBplDate = (value: string | null) => {
  if (!value) return 'sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

export default function DriPage({
  subPermissions,
  previewMode = false,
}: {
  subPermissions?: string[];
  previewMode?: boolean;
}) {
  const [searchParams] = useSearchParams();
  // Monitoreo llega con `?serial=...&bpl=apply` para abrir el caso ya cargado con la evidencia del equipo.
  const requestedSerial = searchParams.get('serial')?.trim() || '';
  const requestedAutoApply = searchParams.get('bpl') === 'apply';
  const [satContext, setSatContext] = useState<SatReportSummary | null>(null);
  const [applySatContext, setApplySatContext] = useState(false);
  const [bplSerialInput, setBplSerialInput] = useState(requestedSerial);
  const [bplSummary, setBplSummary] = useState<BplSerialSummary | null>(null);
  const [bplState, setBplState] = useState<BplLoadState>('idle');
  const [bplError, setBplError] = useState<string | null>(null);
  const [bplContext, setBplContext] = useState<{ summary: BplSerialSummary; token: number } | null>(null);

  // Con `autoApply` (llegada desde Monitoreo) la evidencia se proyecta sobre el caso sin un clic adicional.
  const loadBpl = useCallback(async (serial: string, autoApply = false) => {
    const trimmed = serial.trim();
    if (!trimmed) return;
    setBplState('loading');
    setBplError(null);
    const result = await loadBplSerialEvents(trimmed);
    if (result.error) {
      setBplSummary(null);
      setBplError(`No fue posible leer la evidencia BPL: ${result.error}`);
      setBplState('error');
      return;
    }
    if (!result.summary) {
      setBplSummary(null);
      setBplState('empty');
      return;
    }
    setBplSummary(result.summary);
    setBplState('ready');
    if (autoApply) {
      setBplContext({ summary: result.summary, token: Date.now() });
    }
  }, []);

  useEffect(() => {
    if (previewMode) return;
    let active = true;
    void loadLatestSatReport().then(async (summary) => {
      if (!summary) {
        if (active) setSatContext(null);
        return;
      }
      const qcResults = await loadLatestEquipmentQc(summary.serialNumber);
      if (active) setSatContext({ ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] });
    });
    return () => {
      active = false;
    };
  }, [previewMode]);

  useEffect(() => {
    // La página se monta de nuevo en cada cambio de pestaña, así que el estado inicial ya trae la serie pedida.
    // La lectura se difiere un tick para no disparar estado de forma síncrona dentro del efecto.
    if (previewMode || !requestedSerial) return;
    const timer = window.setTimeout(() => {
      void loadBpl(requestedSerial, requestedAutoApply);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadBpl, previewMode, requestedAutoApply, requestedSerial]);

  const bplHeadline = bplSummary
    ? `${bplSummary.serial} · ${BPL_TONE_LABELS[bplSummary.tone]} · ${bplSummary.events.length} eventos`
    : bplState === 'loading'
      ? 'Leyendo blancos, calibraciones y controles del equipo…'
      : bplState === 'empty'
        ? `Sin eventos BPL recientes para ${bplSerialInput.trim() || 'la serie indicada'}`
        : bplState === 'error'
          ? 'La evidencia BPL no respondió'
          : 'Trae blancos, calibraciones y QC reales del equipo al diagnóstico';

  return (
    <>
      {!previewMode ? <section className="dri-sat-context card">
        <div>
          <span>Contexto SAT</span>
          <strong>
            {satContext
              ? `${satContext.equipmentModel} · ${satContext.serialNumber} · ${satContext.findings.distinctLots} lotes detectados`
              : 'Carga un reporte real para preparar el diagnóstico'}
          </strong>
          <p>
            Serie, fechas, lotes, calibraciones, controles y eventos se incorporan como evidencia; no se convierten automáticamente en una falla confirmada.
          </p>
        </div>
        <div className="dri-sat-context__actions">
          {satContext ? (
            <button type="button" className="sat-importer__compact-trigger" onClick={() => setApplySatContext(true)} disabled={applySatContext}>
              {applySatContext ? 'Contexto aplicado' : 'Aplicar al diagnóstico'}
            </button>
          ) : null}
          <SatReportImporter
            compact
            onImported={(summary) => {
              void loadLatestEquipmentQc(summary.serialNumber).then((qcResults) => {
                setSatContext({ ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] });
                setApplySatContext(true);
              });
            }}
          />
        </div>
      </section> : null}
      {!previewMode ? <section className="dri-bpl-context card" data-state={bplState}>
        <div>
          <span className="dri-bpl-context__eyebrow">Contexto BPL · monitor BA400</span>
          <strong>{bplHeadline}</strong>
          {bplSummary ? (
            <div className="dri-bpl-context__stats">
              <span className="dri-bpl-context__stat" data-tone="rejected"><i />{bplSummary.rejectedTests.length} pruebas con rechazo</span>
              <span className="dri-bpl-context__stat" data-tone="pending"><i />{bplSummary.pendingTests.length} pendientes</span>
              <span className="dri-bpl-context__stat" data-tone="accepted"><i />{bplSummary.acceptedTests.length} aceptadas</span>
              <span className="dri-bpl-context__stat"><i />Último evento {formatBplDate(bplSummary.lastEventAt)}</span>
            </div>
          ) : null}
          <p>
            {bplError ||
              'La evaluación del propio analizador (aceptado/rechazado) se proyecta como pruebas fallidas y correctas, con lotes, reglas Westgard y curvas; no sustituye el criterio del ingeniero.'}
          </p>
        </div>
        <div className="dri-bpl-context__actions">
          <input
            className="input-field"
            value={bplSerialInput}
            placeholder="Serie 8340…"
            aria-label="Serie del equipo para evidencia BPL"
            onChange={(event) => setBplSerialInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void loadBpl(bplSerialInput);
            }}
          />
          <button
            type="button"
            className="sat-importer__compact-trigger"
            onClick={() => void loadBpl(bplSerialInput)}
            disabled={bplState === 'loading' || !bplSerialInput.trim()}
          >
            {bplState === 'loading' ? 'Leyendo…' : 'Leer evidencia BPL'}
          </button>
          {bplSummary ? (
            <button
              type="button"
              className="sat-importer__compact-trigger"
              onClick={() => setBplContext({ summary: bplSummary, token: Date.now() })}
            >
              {bplContext?.summary === bplSummary ? 'Volver a aplicar' : 'Aplicar al diagnóstico'}
            </button>
          ) : null}
        </div>
      </section> : null}
      <DriDashboard
        subPermissions={subPermissions}
        satContext={applySatContext ? satContext : null}
        bplContext={bplContext}
        previewMode={previewMode}
      />
    </>
  );
}
