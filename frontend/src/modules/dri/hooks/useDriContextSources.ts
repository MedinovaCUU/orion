import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SatReportSummary } from '../../sat-report/satReportTypes';
import { loadLatestSatReport } from '../../sat-report/satReportData';
import { BPL_TONE_LABELS, type BplSerialSummary } from '../../equipment-monitoring/bplEvents';
import { loadBplSerialEvents } from '../../equipment-monitoring/bplEventsData';
import { loadLatestSatReportForSerial, loadMonitoringContextForSerial, withLatestQc } from '../driContextData';
import type { DriCaseFormState, DriCatalog } from '../types/dri.types';
import {
  applyFormPatch,
  chainReceiptsAfterRemoval,
  describePatchReceipt,
  DRI_SOURCE_LABELS,
  revertFormPatch,
  type DriPatchReceipt,
  type DriSourceKind,
} from '../utils/contextSources';
import {
  buildAdvisoryFormPatch,
  buildBplFormPatch,
  buildMonitoringFormPatch,
  buildSatFormPatch,
  type DriAdvisoryCase,
  type DriMonitoringContext,
  type DriSourceBuild,
} from '../utils/sourcePatches';
import type { DriContextSourcesApi, DriSourceSnapshot, DriSourceStatus } from '../components/driWorkbench.types';

/**
 * Estado de las fuentes de contexto del caso (SAT, BPL, Monitoreo, Asesoría).
 * Vive solo en memoria: al recargar la página ninguna fuente queda aplicada hasta volver a
 * pulsar "Aplicar al diagnóstico". Aplicar y quitar usan el álgebra reversible de contextSources.ts.
 */

interface SourceRecord<TData> {
  status: DriSourceStatus;
  data: TData | null;
  receipt: DriPatchReceipt | null;
  error: string | null;
  loadedAt: string | null;
  /** Se aplica en cuanto haya catálogo y parche (llegadas desde Monitoreo, importación SAT, asesoría). */
  autoApply: boolean;
}

const emptyRecord = <TData,>(): SourceRecord<TData> => ({ status: 'idle', data: null, receipt: null, error: null, loadedAt: null, autoApply: false });

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'sin fecha';
  return new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
};

const KINDS: DriSourceKind[] = ['sat', 'bpl', 'monitoring', 'advisory'];

const ADVISORY_STATUS_LABELS: Record<string, string> = {
  solicitada: 'Solicitada',
  en_revision: 'En revisión',
  asesorada: 'Asesorada',
  cerrada: 'Cerrada',
};
const advisoryStatusLabel = (status: string) => ADVISORY_STATUS_LABELS[status] || status.replace(/_/g, ' ');

export function useDriContextSources({
  catalog,
  form,
  setForm,
  enabled = true,
  onFormProjected,
}: {
  catalog: DriCatalog | null;
  form: DriCaseFormState;
  setForm: (updater: (current: DriCaseFormState) => DriCaseFormState) => void;
  /** En modo demo/preview las fuentes remotas no se consultan. */
  enabled?: boolean;
  /** Aviso al contenedor cuando una fuente altera el formulario (para invalidar resultados fijados). */
  onFormProjected?: (kind: DriSourceKind, action: 'applied' | 'removed') => void;
}): DriContextSourcesApi {
  const [sat, setSat] = useState<SourceRecord<SatReportSummary>>(emptyRecord);
  const [bpl, setBpl] = useState<SourceRecord<BplSerialSummary>>(emptyRecord);
  const [monitoring, setMonitoring] = useState<SourceRecord<DriMonitoringContext>>(emptyRecord);
  const [advisory, setAdvisory] = useState<SourceRecord<DriAdvisoryCase>>(emptyRecord);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  // El formulario más reciente, para aplicar/revertir desde callbacks asíncronos sin cierres obsoletos.
  const formRef = useRef(form);
  formRef.current = form;
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  // Generación de la captura: Reiniciar/Demo la incrementan y las lecturas en vuelo dejan de aplicarse solas.
  const generationRef = useRef(0);

  const builds = useMemo<Record<DriSourceKind, DriSourceBuild | null>>(
    () => ({
      sat: catalog && sat.data ? buildSatFormPatch(sat.data, catalog) : null,
      bpl: catalog && bpl.data ? buildBplFormPatch(bpl.data, catalog) : null,
      monitoring: monitoring.data ? buildMonitoringFormPatch(monitoring.data) : null,
      advisory: catalog && advisory.data ? buildAdvisoryFormPatch(advisory.data, catalog) : null,
    }),
    [advisory.data, bpl.data, catalog, monitoring.data, sat.data],
  );
  const buildsRef = useRef(builds);
  buildsRef.current = builds;

  const setters = useMemo(
    () => ({ sat: setSat, bpl: setBpl, monitoring: setMonitoring, advisory: setAdvisory }) as Record<
      DriSourceKind,
      (updater: (current: SourceRecord<unknown>) => SourceRecord<unknown>) => void
    >,
    [],
  );
  const records = useMemo(() => ({ sat, bpl, monitoring, advisory }) as Record<DriSourceKind, SourceRecord<unknown>>, [advisory, bpl, monitoring, sat]);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  /** Revierte el recibo de una fuente y encadena los recibos de las demás para que no resuciten sus valores. */
  const revertReceipt = useCallback(
    (kind: DriSourceKind, receipt: DriPatchReceipt) => {
      const next = revertFormPatch(formRef.current, receipt);
      formRef.current = next;
      setForm(() => next);
      KINDS.forEach((other) => {
        if (other === kind) return;
        setters[other]((current) => (current.receipt ? { ...current, receipt: chainReceiptsAfterRemoval(current.receipt, receipt) } : current));
      });
    },
    [setForm, setters],
  );

  const remove = useCallback(
    (kind: DriSourceKind) => {
      const record = recordsRef.current[kind];
      if (!record.receipt) return;
      revertReceipt(kind, record.receipt);
      setters[kind]((current) => ({ ...current, status: current.data ? 'available' : 'idle', receipt: null, autoApply: false }));
      setLastMessage(`${DRI_SOURCE_LABELS[kind]} retirado del diagnóstico; la captura manual se conserva.`);
      onFormProjected?.(kind, 'removed');
    },
    [onFormProjected, revertReceipt, setters],
  );

  const apply = useCallback(
    (kind: DriSourceKind) => {
      const build = buildsRef.current[kind];
      const record = recordsRef.current[kind];
      if (!build || !record.data) return;
      // Volver a aplicar: primero se retira lo anterior para no acumular bloques ni recibos.
      if (record.receipt) revertReceipt(kind, record.receipt);
      const { form: next, receipt } = applyFormPatch(formRef.current, build.patch);
      formRef.current = next;
      setForm(() => next);
      setters[kind]((current) => ({ ...current, status: 'applied', receipt, autoApply: false }));
      setLastMessage([describePatchReceipt(receipt), ...build.notes].join(' '));
      onFormProjected?.(kind, 'applied');
    },
    [onFormProjected, revertReceipt, setForm, setters],
  );

  // Aplicación diferida: la fuente llegó antes que el catálogo o pidió aplicarse sola.
  useEffect(() => {
    KINDS.forEach((kind) => {
      const record = records[kind];
      if (record.autoApply && record.status === 'available' && builds[kind]) apply(kind);
    });
  }, [apply, builds, records]);

  const dismiss = useCallback(
    (kind: DriSourceKind) => {
      if (recordsRef.current[kind].receipt) remove(kind);
      setters[kind](() => ({ ...emptyRecord(), status: 'dismissed' }));
      setLastMessage(`${DRI_SOURCE_LABELS[kind]} descartado de esta sesión.`);
    },
    [remove, setters],
  );

  /**
   * Una lectura nueva que no corresponde a lo aplicado (otra serie, sin datos) retira primero la proyección
   * anterior: nunca queda contenido de una fuente en el formulario sin un recibo que permita quitarlo.
   */
  const releaseStaleReceipt = useCallback(
    (kind: DriSourceKind) => {
      const record = recordsRef.current[kind];
      if (!record.receipt) return;
      revertReceipt(kind, record.receipt);
      setters[kind]((current) => ({ ...current, receipt: null }));
      setLastMessage(`${DRI_SOURCE_LABELS[kind]} anterior retirado del diagnóstico: la nueva lectura no corresponde a lo que estaba aplicado.`);
      onFormProjected?.(kind, 'removed');
    },
    [onFormProjected, revertReceipt, setters],
  );

  const loadSat = useCallback(
    async (serial?: string, options: { autoApply?: boolean } = {}) => {
      if (!enabled) return;
      const generation = generationRef.current;
      setSat((current) => ({ ...current, status: current.receipt ? 'applied' : 'loading', error: null }));
      try {
        const trimmed = serial?.trim() || '';
        const result = trimmed ? await loadLatestSatReportForSerial(trimmed) : { summary: null, error: null };
        let summary = result.summary;
        if (!summary && !trimmed) {
          const latest = await loadLatestSatReport();
          summary = latest ? await withLatestQc(latest) : null;
        }
        if (result.error) {
          setSat((current) => ({ ...current, status: current.receipt ? 'applied' : 'error', error: result.error }));
          return;
        }
        const current = recordsRef.current.sat as SourceRecord<SatReportSummary>;
        const sameSerial = !trimmed || current.data?.serialNumber.trim() === trimmed;
        if (current.receipt && sameSerial) {
          // Un reporte ya aplicado de la misma serie no se sustituye en silencio por otro: se conserva aplicado.
          const same = summary && current.data?.sha256 === summary.sha256;
          const stamp = (value: SatReportSummary | null | undefined) => value?.reportGeneratedAt || value?.findings.dateTo || '';
          const newer = Boolean(summary && stamp(summary) > stamp(current.data));
          setSat((record) => ({
            ...record,
            status: 'applied',
            error:
              !same && summary
                ? newer
                  ? `Hay un reporte más reciente de ${summary.serialNumber} (${formatDate(summary.reportGeneratedAt)}); quita el actual para cargarlo.`
                  : `El último reporte guardado de ${summary.serialNumber} (${formatDate(summary.reportGeneratedAt)}) es anterior al aplicado; se conserva el aplicado.`
                : null,
          }));
          return;
        }
        // Otra serie (llegada desde Monitoreo con otro equipo): la proyección del reporte anterior —serie, fecha,
        // lotes y botellas— ya no describe el caso; se retira igual que BPL y Monitoreo.
        if (current.receipt) releaseStaleReceipt('sat');
        setSat((record) => ({
          ...record,
          status: summary ? 'available' : 'empty',
          data: summary,
          loadedAt: new Date().toISOString(),
          error: null,
          autoApply: Boolean(options.autoApply) && Boolean(summary) && generation === generationRef.current && summary?.serialNumber.trim() === trimmed,
        }));
      } catch (error) {
        setSat((current) => ({ ...current, status: current.receipt ? 'applied' : 'error', error: error instanceof Error ? error.message : 'No se pudo leer el reporte SAT.' }));
      }
    },
    [enabled, releaseStaleReceipt],
  );

  const acceptImportedSat = useCallback(
    (summary: SatReportSummary) => {
      releaseStaleReceipt('sat');
      setSat(() => ({ status: 'available', data: summary, receipt: null, error: null, loadedAt: new Date().toISOString(), autoApply: true }));
    },
    [releaseStaleReceipt],
  );

  const loadBpl = useCallback(
    async (serial: string, options: { autoApply?: boolean } = {}) => {
      const trimmed = serial.trim();
      if (!enabled || !trimmed) return;
      const generation = generationRef.current;
      setBpl((current) => ({ ...current, status: current.receipt ? 'applied' : 'loading', error: null }));
      const result = await loadBplSerialEvents(trimmed);
      if (result.error) {
        setBpl((current) => ({ ...current, status: current.receipt ? 'applied' : 'error', error: `No fue posible leer la evidencia BPL: ${result.error}` }));
        return;
      }
      const current = recordsRef.current.bpl as SourceRecord<BplSerialSummary>;
      const stillApplied = Boolean(current.receipt && result.summary && current.data?.serial === result.summary.serial);
      if (current.receipt && !stillApplied) releaseStaleReceipt('bpl');
      setBpl((record) => ({
        status: result.summary ? (stillApplied ? 'applied' : 'available') : 'empty',
        data: result.summary,
        receipt: stillApplied ? record.receipt : null,
        error: null,
        loadedAt: new Date().toISOString(),
        autoApply: Boolean(options.autoApply) && Boolean(result.summary) && !stillApplied && generation === generationRef.current,
      }));
    },
    [enabled, releaseStaleReceipt],
  );

  const loadMonitoring = useCallback(
    async (serial: string, options: { autoApply?: boolean } = {}) => {
      const trimmed = serial.trim();
      if (!enabled || !trimmed) return;
      const generation = generationRef.current;
      setMonitoring((current) => ({ ...current, status: current.receipt ? 'applied' : 'loading', error: null }));
      try {
        const context = await loadMonitoringContextForSerial(trimmed);
        const hasData = Boolean(context.equipment || context.currentState || context.recentErrors.length);
        const current = recordsRef.current.monitoring as SourceRecord<DriMonitoringContext>;
        const stillApplied = Boolean(current.receipt && hasData && current.data?.serial === context.serial);
        if (current.receipt && !stillApplied) releaseStaleReceipt('monitoring');
        setMonitoring((record) => ({
          status: hasData ? (stillApplied ? 'applied' : 'available') : 'empty',
          data: hasData ? context : null,
          receipt: stillApplied ? record.receipt : null,
          error: context.warnings.length && !hasData ? context.warnings.join(' ') : null,
          loadedAt: context.loadedAt,
          autoApply: Boolean(options.autoApply) && hasData && !stillApplied && generation === generationRef.current,
        }));
      } catch (error) {
        setMonitoring((current) => ({ ...current, status: current.receipt ? 'applied' : 'error', error: error instanceof Error ? error.message : 'Monitoreo no respondió.' }));
      }
    },
    [enabled, releaseStaleReceipt],
  );

  const loadAllForSerial = useCallback(
    async (serial: string, options: { apply?: 'none' | 'bpl' | 'all' } = {}) => {
      const mode = options.apply || 'none';
      await Promise.all([
        loadMonitoring(serial, { autoApply: mode === 'all' }),
        loadBpl(serial, { autoApply: mode === 'bpl' || mode === 'all' }),
        // Solo se proyecta sin clic un reporte de la misma serie; nunca el último global de otro equipo.
        loadSat(serial, { autoApply: mode === 'all' }),
      ]);
    },
    [loadBpl, loadMonitoring, loadSat],
  );

  const acceptAdvisory = useCallback(
    (advisoryCase: DriAdvisoryCase) => {
      if (!enabled) return;
      releaseStaleReceipt('advisory');
      setAdvisory(() => ({ status: 'available', data: advisoryCase, receipt: null, error: null, loadedAt: new Date().toISOString(), autoApply: true }));
    },
    [enabled, releaseStaleReceipt],
  );

  const applyAllAvailable = useCallback(() => {
    KINDS.forEach((kind) => {
      const record = recordsRef.current[kind];
      if (record.status === 'available' && buildsRef.current[kind]) apply(kind);
    });
  }, [apply]);

  const clearAll = useCallback(() => {
    generationRef.current += 1;
    KINDS.forEach((kind) => {
      setters[kind]((current) => ({
        ...current,
        status: current.data ? 'available' : current.status === 'applied' || current.status === 'loading' ? 'idle' : current.status,
        receipt: null,
        autoApply: false,
      }));
    });
  }, [setters]);

  const snapshot = <TData,>(kind: DriSourceKind, record: SourceRecord<TData>, headline: string, details: string[]): DriSourceSnapshot<TData> => ({
    kind,
    status: record.status,
    data: record.data,
    build: builds[kind],
    receipt: record.receipt,
    error: record.error,
    loadedAt: record.loadedAt,
    headline,
    details,
  });

  const satSnapshot = snapshot(
    'sat',
    sat,
    sat.data
      ? `${sat.data.equipmentModel} · ${sat.data.serialNumber} · ${formatDate(sat.data.reportGeneratedAt)}`
      : sat.status === 'loading'
        ? 'Buscando el último reporte SAT…'
        : sat.status === 'empty'
          ? 'Sin reportes SAT para esta serie'
          : sat.status === 'error'
            ? 'El reporte SAT no respondió'
            : sat.status === 'dismissed'
              ? 'Reporte descartado en esta sesión'
              : 'Importa un reporte SAT o carga el último de la serie',
    sat.data
      ? [
          ...(form.serialNumber.trim() && sat.data.serialNumber.trim() !== form.serialNumber.trim()
            ? [`Otro equipo: el reporte es de la serie ${sat.data.serialNumber}; aplicarlo cambiará la serie del caso.`]
            : []),
          `${sat.data.findings.distinctTests} pruebas · ${sat.data.findings.distinctLots} lotes · ${sat.data.findings.errorCount} errores`,
          `${sat.data.qcResults?.length || 0} controles recientes`,
          ...(builds.sat?.notes || []),
          ...(sat.error ? [sat.error] : []),
        ]
      : sat.error
        ? [sat.error]
        : [],
  );

  const bplSnapshot = snapshot(
    'bpl',
    bpl,
    bpl.data
      ? `${bpl.data.serial} · ${BPL_TONE_LABELS[bpl.data.tone]} · ${bpl.data.events.length} eventos`
      : bpl.status === 'loading'
        ? 'Leyendo blancos, calibraciones y controles…'
        : bpl.status === 'empty'
          ? 'Sin eventos BPL recientes para la serie'
          : bpl.status === 'error'
            ? 'La evidencia BPL no respondió'
            : 'Blancos, calibraciones y QC reales del equipo',
    bpl.data
      ? [
          `${bpl.data.rejectedTests.length} con rechazo · ${bpl.data.pendingTests.length} pendientes · ${bpl.data.acceptedTests.length} aceptadas`,
          `Último evento ${formatDate(bpl.data.lastEventAt)}`,
          ...(builds.bpl?.notes || []),
          ...(bpl.error ? [bpl.error] : []),
        ]
      : bpl.error
        ? [bpl.error]
        : [],
  );

  const monitoringSnapshot = snapshot(
    'monitoring',
    monitoring,
    monitoring.data
      ? `${monitoring.data.equipment?.model || 'Equipo'} · ${monitoring.data.equipment?.clientName || monitoring.data.serial}`
      : monitoring.status === 'loading'
        ? 'Consultando identidad y alarmas…'
        : monitoring.status === 'empty'
          ? 'La serie no aparece en Monitoreo'
          : monitoring.status === 'error'
            ? 'Monitoreo no respondió'
            : 'Identidad, alarmas activas y últimos eventos',
    monitoring.data ? [...(builds.monitoring?.notes || []), ...(monitoring.error ? [monitoring.error] : [])] : monitoring.error ? [monitoring.error] : [],
  );

  const advisorySnapshot = snapshot(
    'advisory',
    advisory,
    advisory.data
      ? `${advisory.data.ticket?.asunto || advisory.data.area} · ${advisoryStatusLabel(advisory.data.status)}`
      : advisory.status === 'dismissed'
        ? 'Asesoría descartada en esta sesión'
        : 'Trae un caso difícil desde Asesorías',
    advisory.data
      ? [
          `${advisory.data.requesterName || 'solicitante no registrado'} · ${formatDate(advisory.data.createdAt)}`,
          ...(builds.advisory?.notes || []),
        ]
      : [],
  );

  const appliedKinds = KINDS.filter((kind) => records[kind].status === 'applied');
  const availableKinds = KINDS.filter((kind) => records[kind].status === 'available');
  const busy = KINDS.some((kind) => records[kind].status === 'loading');

  return {
    sat: satSnapshot,
    bpl: bplSnapshot,
    monitoring: monitoringSnapshot,
    advisory: advisorySnapshot,
    loadSat,
    acceptImportedSat,
    loadBpl,
    loadMonitoring,
    loadAllForSerial,
    acceptAdvisory,
    apply,
    remove,
    dismiss,
    applyAllAvailable,
    clearAll,
    appliedKinds,
    availableKinds,
    busy,
    lastMessage,
  };
}
