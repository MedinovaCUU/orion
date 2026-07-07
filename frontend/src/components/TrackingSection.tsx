import { useEffect, useMemo, useRef, useState } from 'react';
import './TrackingSection.css';
import {
  applyTrackingPortalSnapshot,
  TRACKING_CARRIER_META,
  TRACKING_STATUS_LABELS,
  TRACKING_STATUS_ORDER,
  buildTrackingEntriesFromText,
  formatTrackingDate,
  formatTrackingDateTime,
  loadTrackingEntries,
  mergeTrackingEntries,
  runTrackingOcr,
  saveTrackingEntries,
  upsertTrackingEntries,
  type TrackingCarrier,
  type TrackingCarrierChoice,
  type TrackingCaptureSource,
  type TrackingEntry,
  type TrackingStatus,
} from './orionTracking';
import {
  lookupTrackingInCarrierPortal,
  supportsLivePortalLookup,
  type TrackingLookupResponse,
} from './trackingStatusApi';

type TrackingNoticeTone = 'success' | 'warning' | 'error';

interface TrackingNotice {
  tone: TrackingNoticeTone;
  message: string;
}

interface TrackingLookupTarget {
  carrier: TrackingCarrier | null;
  trackingNumber: string;
}

interface TrackingLookupOutcome {
  outcome: 'updated' | 'warning' | 'error' | 'manual_only' | 'skipped';
  message: string;
}

const FULFILLMENT_RING_RADIUS = 62;
const FULFILLMENT_RING_CIRCUMFERENCE = 2 * Math.PI * FULFILLMENT_RING_RADIUS;
const SOURCE_LABELS: Record<TrackingCaptureSource, string> = {
  manual: 'Manual',
  ocr: 'OCR',
  camera: 'Cámara',
};
const TRACKING_STATUS_INPUT_OPTIONS: Array<{ value: TrackingStatus | 'auto'; label: string }> = [
  { value: 'auto', label: 'Auto por OCR' },
  ...TRACKING_STATUS_ORDER.map((status) => ({ value: status, label: TRACKING_STATUS_LABELS[status] })),
];
const TRACKING_CARRIER_OPTIONS: Array<{ value: TrackingCarrierChoice; label: string }> = [
  { value: 'auto', label: 'Auto detectar' },
  { value: 'dhl', label: 'DHL' },
  { value: 'estafeta', label: 'Estafeta' },
  { value: 'tresguerras', label: 'Tresguerras' },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

const isPastEstimatedDelivery = (entry: TrackingEntry) =>
  Boolean(entry.estimatedDelivery) && entry.fulfillmentState !== 'entregado' && entry.estimatedDelivery < todayIso();

const pctFormatter = new Intl.NumberFormat('es-MX', {
  style: 'percent',
  maximumFractionDigits: 0,
});

const compactFormatter = new Intl.NumberFormat('es-MX');

const buildLookupKey = (carrier: TrackingCarrier | null, trackingNumber: string) =>
  `${carrier || 'sin-carrier'}:${trackingNumber}`;

const matchesLookupTarget = (entry: TrackingEntry, target: TrackingLookupTarget) =>
  entry.trackingNumber === target.trackingNumber && (entry.carrier === target.carrier || !entry.carrier || !target.carrier);

export default function TrackingSection() {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const rowImportInputRef = useRef<HTMLInputElement | null>(null);
  const rowCameraInputRef = useRef<HTMLInputElement | null>(null);

  const [entries, setEntries] = useState<TrackingEntry[]>(() => loadTrackingEntries());
  const [manualPayload, setManualPayload] = useState('');
  const [preferredCarrier, setPreferredCarrier] = useState<TrackingCarrierChoice>('auto');
  const [manualOrderReference, setManualOrderReference] = useState('');
  const [manualRecipient, setManualRecipient] = useState('');
  const [manualEstimatedDelivery, setManualEstimatedDelivery] = useState('');
  const [manualStatus, setManualStatus] = useState<TrackingStatus | 'auto'>('auto');
  const [manualNotes, setManualNotes] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatus, setOcrStatus] = useState('');
  const [lookupBusyKeys, setLookupBusyKeys] = useState<string[]>([]);
  const [notice, setNotice] = useState<TrackingNotice | null>(null);
  const [rowImportTargetId, setRowImportTargetId] = useState<string | null>(null);

  useEffect(() => {
    saveTrackingEntries(entries);
  }, [entries]);

  const sortedEntries = useMemo(
    () => [...entries].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    [entries],
  );

  const metrics = useMemo(() => {
    const total = sortedEntries.length;
    const delivered = sortedEntries.filter((entry) => entry.fulfillmentState === 'entregado').length;
    const pending = total - delivered;
    const inTransit = sortedEntries.filter(
      (entry) => entry.status === 'en_transito' || entry.status === 'en_reparto',
    ).length;
    const incidents = sortedEntries.filter((entry) => entry.status === 'incidencia').length;
    const overdue = sortedEntries.filter((entry) => isPastEstimatedDelivery(entry)).length;
    const unresolvedCarrier = sortedEntries.filter((entry) => !entry.carrier).length;
    const fulfillmentRate = total > 0 ? delivered / total : 0;
    const deliveredOffset = FULFILLMENT_RING_CIRCUMFERENCE * (1 - fulfillmentRate);

    return {
      total,
      delivered,
      pending,
      inTransit,
      incidents,
      overdue,
      unresolvedCarrier,
      fulfillmentRate,
      deliveredOffset,
    };
  }, [sortedEntries]);

  const carrierRows = useMemo(() => {
    const totals = new Map<TrackingCarrier, { total: number; delivered: number }>();

    sortedEntries.forEach((entry) => {
      if (!entry.carrier) {
        return;
      }

      const current = totals.get(entry.carrier) || { total: 0, delivered: 0 };
      current.total += 1;
      if (entry.fulfillmentState === 'entregado') {
        current.delivered += 1;
      }
      totals.set(entry.carrier, current);
    });

    return (Object.keys(TRACKING_CARRIER_META) as TrackingCarrier[])
      .map((carrier) => {
        const bucket = totals.get(carrier) || { total: 0, delivered: 0 };
        return {
          carrier,
          total: bucket.total,
          delivered: bucket.delivered,
          pending: bucket.total - bucket.delivered,
          share: metrics.total > 0 ? bucket.total / metrics.total : 0,
          deliveryRate: bucket.total > 0 ? bucket.delivered / bucket.total : 0,
        };
      })
      .sort((left, right) => right.total - left.total);
  }, [metrics.total, sortedEntries]);

  const statusRows = useMemo(
    () =>
      TRACKING_STATUS_ORDER.map((status) => {
        const total = sortedEntries.filter((entry) => entry.status === status).length;
        return {
          status,
          total,
          share: metrics.total > 0 ? total / metrics.total : 0,
        };
      }).sort((left, right) => right.total - left.total),
    [metrics.total, sortedEntries],
  );

  const atRiskEntries = useMemo(
    () =>
      sortedEntries.filter((entry) => entry.status === 'incidencia' || isPastEstimatedDelivery(entry)).slice(0, 3),
    [sortedEntries],
  );

  const liveLookupCount = useMemo(
    () => sortedEntries.filter((entry) => entry.carrier && supportsLivePortalLookup(entry.carrier)).length,
    [sortedEntries],
  );

  const clearManualComposer = () => {
    setManualPayload('');
    setManualOrderReference('');
    setManualRecipient('');
    setManualEstimatedDelivery('');
    setManualStatus('auto');
    setManualNotes('');
  };

  const pushNotice = (tone: TrackingNoticeTone, message: string) => {
    setNotice({ tone, message });
  };

  const updateEntriesByTarget = (target: TrackingLookupTarget, updater: (entry: TrackingEntry) => TrackingEntry) => {
    setEntries((current) =>
      current.map((entry) => (matchesLookupTarget(entry, target) ? updater(entry) : entry)),
    );
  };

  const buildPortalSnapshot = (entry: TrackingEntry, response: TrackingLookupResponse) => {
    const lookedUpAt = new Date().toISOString();
    const fallbackStatus = response.status || entry.status;

    return {
      status: fallbackStatus,
      fulfillmentState:
        response.fulfillmentState || (fallbackStatus === 'entregado' ? 'entregado' : 'pendiente'),
      portalStatusText: response.portalStatusText || response.lastEventLabel || entry.portalStatusText,
      lastEventLabel: response.lastEventLabel || response.portalStatusText || entry.lastEventLabel,
      lastEventAt: response.lastEventAt || entry.lastEventAt,
      estimatedDelivery: response.estimatedDelivery || entry.estimatedDelivery,
      recipient: response.recipient || entry.recipient,
      origin: response.origin || entry.origin,
      destination: response.destination || entry.destination,
      serviceType: response.serviceType || entry.serviceType,
      deliveryProofName: response.deliveryProofName || entry.deliveryProofName,
      timeline: response.timeline || [],
      rawSummary: response.rawSummary || entry.rawEvidenceText,
      lookupError: '',
      lookedUpAt,
    };
  };

  const markLookupFailure = (target: TrackingLookupTarget, message: string) => {
    const stampedAt = new Date().toISOString();
    updateEntriesByTarget(target, (entry) => ({
      ...entry,
      lookupError: message,
      lastLookupAt: stampedAt,
      updatedAt: stampedAt,
    }));
  };

  const summarizeLookupOutcomes = (outcomes: TrackingLookupOutcome[]) => {
    const updated = outcomes.filter((outcome) => outcome.outcome === 'updated').length;
    const warnings = outcomes.filter((outcome) => outcome.outcome === 'warning').length;
    const errors = outcomes.filter((outcome) => outcome.outcome === 'error').length;
    const manualOnly = outcomes.filter((outcome) => outcome.outcome === 'manual_only').length;
    const skipped = outcomes.filter((outcome) => outcome.outcome === 'skipped').length;

    if (updated > 0 && warnings === 0 && errors === 0 && manualOnly === 0) {
      return {
        tone: 'success' as const,
        message: `Consulta viva lista. ${updated} tracking(s) quedaron sincronizados con su portal.`,
      };
    }

    if (updated > 0) {
      return {
        tone: 'warning' as const,
        message: `Consulta parcial. ${updated} actualizado(s), ${warnings + errors + manualOnly + skipped} pendiente(s) por revisar.`,
      };
    }

    if (errors > 0) {
      return {
        tone: 'error' as const,
        message: outcomes.find((outcome) => outcome.outcome === 'error')?.message || 'La consulta viva no devolvió resultados utilizables.',
      };
    }

    return {
      tone: 'warning' as const,
      message:
        outcomes.find((outcome) => outcome.outcome === 'manual_only' || outcome.outcome === 'warning')?.message ||
        'No hubo cambios nuevos desde el portal.',
    };
  };

  const runLookupForTarget = async (target: TrackingLookupTarget): Promise<TrackingLookupOutcome> => {
    if (!target.carrier) {
      return {
        outcome: 'skipped',
        message: `${target.trackingNumber} no tiene mensajería definida todavía.`,
      };
    }

    if (!supportsLivePortalLookup(target.carrier)) {
      const message = `La consulta viva de ${TRACKING_CARRIER_META[target.carrier].label} no está disponible en esta configuración.`;
      markLookupFailure(target, message);
      return { outcome: 'manual_only', message };
    }

    try {
      const response = await lookupTrackingInCarrierPortal(target.carrier, target.trackingNumber);
      const message =
        response.error || response.note || `No hubo una respuesta utilizable para ${target.trackingNumber}.`;

      if (!response.ok || !response.status) {
        markLookupFailure(target, message);
        return {
          outcome: response.lookupMode === 'manual_only' ? 'manual_only' : 'warning',
          message,
        };
      }

      updateEntriesByTarget(target, (entry) => applyTrackingPortalSnapshot(entry, buildPortalSnapshot(entry, response)));

      return {
        outcome: 'updated',
        message: `${target.trackingNumber} actualizado a ${response.portalStatusText || TRACKING_STATUS_LABELS[response.status]}.`,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : `No fue posible consultar ${target.trackingNumber} en este momento.`;
      markLookupFailure(target, message);
      return {
        outcome: 'error',
        message,
      };
    }
  };

  const refreshTrackingTargets = async (
    targets: TrackingLookupTarget[],
    mode: 'manual' | 'auto' = 'manual',
  ) => {
    const dedupedTargets = Array.from(
      new Map(
        targets
          .filter((target) => target.trackingNumber)
          .map((target) => [buildLookupKey(target.carrier, target.trackingNumber), target]),
      ).values(),
    );

    if (dedupedTargets.length === 0) {
      if (mode === 'manual') {
        pushNotice('warning', 'No hay trackings con un método de consulta vivo listo para ejecutar.');
      }
      return;
    }

    const busyKeys = dedupedTargets.map((target) => buildLookupKey(target.carrier, target.trackingNumber));
    setLookupBusyKeys((current) => Array.from(new Set([...current, ...busyKeys])));

    try {
      const outcomes: TrackingLookupOutcome[] = [];

      for (const target of dedupedTargets) {
        outcomes.push(await runLookupForTarget(target));
      }

      const summary = summarizeLookupOutcomes(outcomes);
      if (mode === 'manual' || outcomes.some((outcome) => outcome.outcome !== 'updated')) {
        pushNotice(summary.tone, summary.message);
      } else if (outcomes.some((outcome) => outcome.outcome === 'updated')) {
        pushNotice('success', summary.message);
      }
    } finally {
      setLookupBusyKeys((current) => current.filter((key) => !busyKeys.includes(key)));
    }
  };

  const queueLookupForEntries = (incoming: TrackingEntry[], mode: 'manual' | 'auto' = 'auto') => {
    void refreshTrackingTargets(
      incoming.map((entry) => ({
        carrier: entry.carrier,
        trackingNumber: entry.trackingNumber,
      })),
      mode,
    );
  };

  const handleManualAdd = () => {
    const incoming = buildTrackingEntriesFromText(manualPayload, {
      preferredCarrier,
      source: 'manual',
      orderReference: manualOrderReference,
      recipient: manualRecipient,
      estimatedDelivery: manualEstimatedDelivery,
      status: manualStatus,
      notes: manualNotes,
    });

    if (incoming.length === 0) {
      pushNotice(
        'error',
        'No encontré guías válidas. Usa 10 dígitos para DHL/Estafeta, 22 dígitos para guía Estafeta o un talón tipo GPE00486943.',
      );
      return;
    }

    setEntries((current) => upsertTrackingEntries(current, incoming));
    clearManualComposer();
    pushNotice('success', `Se agregaron o actualizaron ${incoming.length} tracking(s) al tablero fulfillment.`);
    queueLookupForEntries(incoming);
  };

  const updateEntry = (entryId: string, updater: (entry: TrackingEntry) => TrackingEntry) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...updater(entry),
              updatedAt: new Date().toISOString(),
            }
          : entry,
      ),
    );
  };

  const handleImportFiles = async (
    files: FileList | null,
    source: TrackingCaptureSource,
    rowTargetId?: string | null,
  ) => {
    const fileList = Array.from(files || []);
    if (fileList.length === 0) {
      return;
    }

    setOcrBusy(true);
    setOcrProgress(0);
    setOcrStatus(source === 'camera' ? 'Procesando captura de cámara' : 'Procesando evidencia OCR');

    try {
      const importedEntries: TrackingEntry[] = [];
      let emptyReads = 0;

      for (let index = 0; index < fileList.length; index += 1) {
        const file = fileList[index];
        const rawText = await runTrackingOcr(file, (progress, status) => {
          const overallProgress = (index + progress) / Math.max(1, fileList.length);
          setOcrProgress(overallProgress);
          setOcrStatus(`${status} · ${file.name}`);
        });

        const nextEntries = buildTrackingEntriesFromText(rawText, {
          preferredCarrier,
          source,
          orderReference: manualOrderReference,
          recipient: manualRecipient,
          estimatedDelivery: manualEstimatedDelivery,
          status: manualStatus,
          notes: manualNotes,
        });

        if (nextEntries.length === 0) {
          emptyReads += 1;
          continue;
        }

        importedEntries.push(...nextEntries);
      }

      if (rowTargetId) {
        const currentEntry = entries.find((entry) => entry.id === rowTargetId);
        const matchingIncoming = importedEntries.find((entry) => entry.trackingNumber === currentEntry?.trackingNumber);

        if (!currentEntry || !matchingIncoming) {
          pushNotice('warning', 'El OCR no encontró la misma guía del registro seleccionado. No se sobrescribió el tracking.');
          return;
        }

        setEntries((current) =>
          current.map((entry) => (entry.id === rowTargetId ? mergeTrackingEntries(entry, matchingIncoming) : entry)),
        );
        pushNotice('success', `Se actualizó ${currentEntry.trackingNumber} con una nueva lectura OCR.`);
        queueLookupForEntries(
          [
            {
              ...currentEntry,
              ...matchingIncoming,
              carrier: matchingIncoming.carrier || currentEntry.carrier,
            },
          ],
          'auto',
        );
        return;
      }

      if (importedEntries.length === 0) {
        pushNotice(
          'warning',
          emptyReads > 0
            ? 'Se leyó la evidencia, pero no se pudieron identificar guías rastreables. Intenta con una captura más cerrada o define la mensajería manualmente.'
            : 'No se encontraron datos nuevos para importar.',
        );
        return;
      }

      setEntries((current) => upsertTrackingEntries(current, importedEntries));
      pushNotice(
        'success',
        `OCR listo. Se agregaron o actualizaron ${importedEntries.length} tracking(s)${emptyReads ? ` y ${emptyReads} evidencia(s) no arrojaron guía.` : ''}.`,
      );
      queueLookupForEntries(importedEntries);
    } catch (error) {
      pushNotice(
        'error',
        error instanceof Error ? error.message : 'No se pudo procesar la captura. Intenta de nuevo con otra imagen.',
      );
    } finally {
      setOcrBusy(false);
      setOcrProgress(0);
      setOcrStatus('');
      setRowImportTargetId(null);
      if (importInputRef.current) importInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      if (rowImportInputRef.current) rowImportInputRef.current.value = '';
      if (rowCameraInputRef.current) rowCameraInputRef.current.value = '';
    }
  };

  const handleCopyTrackingNumber = async (trackingNumber: string) => {
    try {
      await navigator.clipboard.writeText(trackingNumber);
      pushNotice('success', `Guía ${trackingNumber} copiada al portapapeles.`);
    } catch {
      pushNotice('warning', 'No pude copiar la guía automáticamente. Puedes copiarla manualmente desde la tarjeta.');
    }
  };

  const handleOpenCarrierPortal = (entry: TrackingEntry) => {
    if (!entry.carrier) {
      pushNotice('warning', 'Define primero la mensajería para abrir el portal correcto.');
      return;
    }

    window.open(TRACKING_CARRIER_META[entry.carrier].portalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleClearBoard = () => {
    if (!window.confirm('Esto vaciará el tablero local de tracking en este navegador.')) {
      return;
    }

    setEntries([]);
    pushNotice('success', 'El tablero local de tracking quedó limpio.');
  };

  const handleRefreshAll = () => {
    void refreshTrackingTargets(
      sortedEntries.map((entry) => ({
        carrier: entry.carrier,
        trackingNumber: entry.trackingNumber,
      })),
      'manual',
    );
  };

  return (
    <section className="tracking-section">
      {notice ? <div className={`tracking-notice tracking-notice--${notice.tone}`}>{notice.message}</div> : null}

      <div className="tracking-grid tracking-grid--top">
        <article className="tracking-panel tracking-panel--composer">
          <div className="tracking-panel__header">
            <div>
              <span className="tracking-panel__eyebrow">Captura</span>
              <h4>Alta de tracking por manual, OCR o cámara</h4>
            </div>
            <p>Sirve para subir una sola guía o un lote pequeño sin depender todavía de APIs externas.</p>
          </div>

          <div className="tracking-composer">
            <label className="tracking-field tracking-field--full">
              <span>Guía(s) o texto a procesar</span>
              <textarea
                className="input-field tracking-textarea"
                value={manualPayload}
                onChange={(event) => setManualPayload(event.target.value)}
                placeholder={'Ejemplo:\nDHL 1492322090\n5132157796\nGPE00486943'}
              />
            </label>

            <div className="tracking-composer__grid">
              <label className="tracking-field">
                <span>Mensajería</span>
                <select className="input-field" value={preferredCarrier} onChange={(event) => setPreferredCarrier(event.target.value as TrackingCarrierChoice)}>
                  {TRACKING_CARRIER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tracking-field">
                <span>Pedido / referencia</span>
                <input
                  className="input-field"
                  value={manualOrderReference}
                  onChange={(event) => setManualOrderReference(event.target.value)}
                  placeholder="PO, folio interno o MAT"
                />
              </label>

              <label className="tracking-field">
                <span>Destinatario</span>
                <input
                  className="input-field"
                  value={manualRecipient}
                  onChange={(event) => setManualRecipient(event.target.value)}
                  placeholder="Cliente, persona o unidad"
                />
              </label>

              <label className="tracking-field">
                <span>Entrega estimada</span>
                <input
                  type="date"
                  className="input-field"
                  value={manualEstimatedDelivery}
                  onChange={(event) => setManualEstimatedDelivery(event.target.value)}
                />
              </label>

              <label className="tracking-field">
                <span>Estado inicial</span>
                <select className="input-field" value={manualStatus} onChange={(event) => setManualStatus(event.target.value as TrackingStatus | 'auto')}>
                  {TRACKING_STATUS_INPUT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="tracking-field">
                <span>Nota operativa</span>
                <input
                  className="input-field"
                  value={manualNotes}
                  onChange={(event) => setManualNotes(event.target.value)}
                  placeholder="Cliente espera ocurre, guía parcial, etc."
                />
              </label>
            </div>

            {ocrBusy ? (
              <div className="tracking-ocr-progress">
                <div className="tracking-ocr-progress__bar">
                  <div style={{ width: `${Math.max(ocrProgress * 100, 3)}%` }} />
                </div>
                <span>{ocrStatus || `Procesando ${Math.round(ocrProgress * 100)}%`}</span>
              </div>
            ) : null}

            <div className="tracking-composer__actions">
              <button type="button" className="button-primary" onClick={handleManualAdd} disabled={ocrBusy}>
                Agregar tracking
              </button>
              <button type="button" className="button-primary inactive" onClick={() => importInputRef.current?.click()} disabled={ocrBusy}>
                Importar OCR
              </button>
              <button type="button" className="button-primary inactive" onClick={() => cameraInputRef.current?.click()} disabled={ocrBusy}>
                Abrir cámara
              </button>
              <button type="button" className="button-primary inactive" onClick={clearManualComposer} disabled={ocrBusy}>
                Limpiar captura
              </button>
            </div>

            <div className="tracking-composer__tips">
              <span>DHL: screenshots con “Número de guía aérea” y “Estado”.</span>
              <span>Estafeta: guía de 10 o 22 dígitos.</span>
              <span>Tresguerras: talón alfanumérico tipo GPE00486943.</span>
              <span>Consulta viva: levanta el relay local del navegador para resumir cada portal dentro de Orion.</span>
            </div>
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="image/*,text/plain"
            multiple
            hidden
            onChange={(event) => void handleImportFiles(event.target.files, 'ocr')}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => void handleImportFiles(event.target.files, 'camera')}
          />
        </article>

        <article className="tracking-panel tracking-panel--fulfillment">
          <div className="tracking-panel__header">
            <div>
              <span className="tracking-panel__eyebrow">Modo fulfillment</span>
              <h4>Dona de entregados vs pendientes</h4>
            </div>
            <p>Lectura rápida del cierre logístico actual, enfocada en lo que ya llegó y lo que todavía exige seguimiento.</p>
          </div>

          <div className="tracking-fulfillment">
            <div className="tracking-fulfillment__ring">
              <svg viewBox="0 0 180 180" className="tracking-fulfillment__svg" aria-hidden="true">
                <circle cx="90" cy="90" r={FULFILLMENT_RING_RADIUS} className="tracking-fulfillment__track" />
                <circle
                  cx="90"
                  cy="90"
                  r={FULFILLMENT_RING_RADIUS}
                  className="tracking-fulfillment__progress"
                  strokeDasharray={FULFILLMENT_RING_CIRCUMFERENCE}
                  strokeDashoffset={metrics.deliveredOffset}
                />
              </svg>
              <div className="tracking-fulfillment__center">
                <span>Fulfillment</span>
                <strong>{pctFormatter.format(metrics.fulfillmentRate)}</strong>
                <small>{metrics.total > 0 ? `${metrics.delivered}/${metrics.total} entregados` : 'Sin tracking'}</small>
              </div>
            </div>

            <div className="tracking-fulfillment__legend">
              <article>
                <span className="tracking-dot tracking-dot--delivered" />
                <div>
                  <strong>{metrics.delivered}</strong>
                  <small>Entregados</small>
                </div>
              </article>
              <article>
                <span className="tracking-dot tracking-dot--pending" />
                <div>
                  <strong>{metrics.pending}</strong>
                  <small>Pendientes</small>
                </div>
              </article>
              <article>
                <span className="tracking-dot tracking-dot--alert" />
                <div>
                  <strong>{metrics.incidents + metrics.overdue}</strong>
                  <small>Con riesgo operativo</small>
                </div>
              </article>
            </div>
          </div>

          <div className="tracking-risk-list">
            {atRiskEntries.length === 0 ? (
              <div className="tracking-empty-copy">Sin focos rojos por ahora. El tablero no detecta incidencias ni entregas vencidas.</div>
            ) : (
              atRiskEntries.map((entry) => (
                <article key={entry.id} className="tracking-risk-card">
                  <strong>{entry.trackingNumber}</strong>
                  <span>{entry.carrier ? TRACKING_CARRIER_META[entry.carrier].label : 'Mensajería por definir'}</span>
                  <p>
                    {entry.status === 'incidencia'
                      ? entry.lastEventLabel || 'Incidencia detectada'
                      : `ETA comprometida para ${formatTrackingDate(entry.estimatedDelivery)}`}
                  </p>
                </article>
              ))
            )}
          </div>
        </article>
      </div>

      <div className="tracking-kpi-grid">
        <article className="tracking-kpi-card">
          <span>Trackings activos</span>
          <strong>{compactFormatter.format(metrics.total)}</strong>
          <small>Todos los registros vigentes en esta sesión local</small>
        </article>
        <article className="tracking-kpi-card">
          <span>En tránsito</span>
          <strong>{compactFormatter.format(metrics.inTransit)}</strong>
          <small>Guías moviéndose entre origen, hub o reparto</small>
        </article>
        <article className="tracking-kpi-card tracking-kpi-card--warning">
          <span>ETA vencida</span>
          <strong>{compactFormatter.format(metrics.overdue)}</strong>
          <small>Promesas de entrega ya fuera de fecha</small>
        </article>
        <article className="tracking-kpi-card tracking-kpi-card--critical">
          <span>Sin mensajería definida</span>
          <strong>{compactFormatter.format(metrics.unresolvedCarrier)}</strong>
          <small>Entradas que requieren clasificar portal antes de operar</small>
        </article>
      </div>

      <div className="tracking-grid tracking-grid--middle">
        <article className="tracking-panel">
          <div className="tracking-panel__header">
            <div>
              <span className="tracking-panel__eyebrow">Estados</span>
              <h4>Mapa de estatus de todos los tracking</h4>
            </div>
            <p>Resume en qué etapa está cada envío para que el operador detecte acumulaciones sin abrir cada portal.</p>
          </div>

          <div className="tracking-status-stack">
            {statusRows.map((row) => (
              <div key={row.status} className="tracking-status-row">
                <div className="tracking-status-row__copy">
                  <strong>{TRACKING_STATUS_LABELS[row.status]}</strong>
                  <span>{compactFormatter.format(row.total)} guía(s)</span>
                </div>
                <div className="tracking-status-row__bar">
                  <div className={`tracking-status-row__fill tracking-status-row__fill--${row.status}`} style={{ width: `${Math.max(row.share * 100, row.total > 0 ? 6 : 0)}%` }} />
                </div>
                <b>{pctFormatter.format(row.share)}</b>
              </div>
            ))}
          </div>
        </article>

        <article className="tracking-panel">
          <div className="tracking-panel__header">
            <div>
              <span className="tracking-panel__eyebrow">Mensajerías</span>
              <h4>Carga por carrier y cierre relativo</h4>
            </div>
            <p>Permite ver rápidamente si el backlog se concentra en DHL, Estafeta o Tresguerras.</p>
          </div>

          <div className="tracking-carrier-stack">
            {carrierRows.map((row) => (
              <div key={row.carrier} className={`tracking-carrier-row tracking-carrier-row--${TRACKING_CARRIER_META[row.carrier].accentClass}`}>
                <div className="tracking-carrier-row__copy">
                  <strong>{TRACKING_CARRIER_META[row.carrier].label}</strong>
                  <span>{TRACKING_CARRIER_META[row.carrier].hint}</span>
                </div>
                <div className="tracking-carrier-row__meta">
                  <span>{compactFormatter.format(row.total)} total</span>
                  <span>{pctFormatter.format(row.deliveryRate)} entregado</span>
                </div>
                <div className="tracking-carrier-row__bar">
                  <div style={{ width: `${Math.max(row.share * 100, row.total > 0 ? 8 : 0)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="tracking-panel tracking-panel--records">
        <div className="tracking-panel__header">
          <div>
            <span className="tracking-panel__eyebrow">Operación viva</span>
            <h4>Estado de todos los tracking capturados</h4>
          </div>
          <p>Cada tarjeta se puede corregir, reclasificar o actualizar con un nuevo screenshot OCR sin salir de Orion.</p>
        </div>

        <div className="tracking-records__toolbar">
          <span>{metrics.total > 0 ? `${metrics.total} tracking(s) cargados` : 'Sin tracking cargados todavía'}</span>
          <div className="tracking-records__toolbar-actions">
            <button
              type="button"
              className="button-primary inactive"
              onClick={handleRefreshAll}
              disabled={metrics.total === 0 || ocrBusy || lookupBusyKeys.length > 0 || liveLookupCount === 0}
            >
              {lookupBusyKeys.length > 0 ? 'Consultando...' : 'Actualizar todos'}
            </button>
            <button type="button" className="button-primary inactive" onClick={handleClearBoard} disabled={metrics.total === 0 || ocrBusy}>
              Vaciar tablero local
            </button>
          </div>
        </div>

        {sortedEntries.length === 0 ? (
          <div className="tracking-empty-state">
            <strong>No hay tracking activos.</strong>
            <p>Empieza pegando una guía, subiendo un screenshot del portal o capturando una foto desde la cámara del móvil.</p>
          </div>
        ) : (
          <div className="tracking-record-list">
            {sortedEntries.map((entry) => {
              const lookupKey = buildLookupKey(entry.carrier, entry.trackingNumber);
              const lookupBusy = lookupBusyKeys.includes(lookupKey);
              const liveLookupAvailable = entry.carrier ? supportsLivePortalLookup(entry.carrier) : false;
              const showPortalBlock = Boolean(entry.portalStatusText || entry.timeline.length || entry.lookupError || entry.serviceType);

              return (
                <article key={entry.id} className={`tracking-record tracking-record--${entry.status}`}>
                  <div className="tracking-record__summary">
                    <div className="tracking-record__eyebrow">
                      <span>{entry.orderReference || 'Sin pedido'}</span>
                      <span>{SOURCE_LABELS[entry.source]}</span>
                    </div>
                    <strong>{entry.trackingNumber}</strong>
                    <p>{entry.recipient || entry.destination || 'Sin destinatario todavía'}</p>
                  </div>

                  <div className="tracking-record__status">
                    <span className={`tracking-status-chip tracking-status-chip--${entry.status}`}>
                      {TRACKING_STATUS_LABELS[entry.status]}
                    </span>
                    <small>{entry.carrier ? TRACKING_CARRIER_META[entry.carrier].label : 'Carrier por definir'}</small>
                    {entry.portalStatusText ? <p className="tracking-record__portal-copy">{entry.portalStatusText}</p> : null}
                  </div>

                  <div className="tracking-record__meta">
                    <label className="tracking-mini-field">
                      <span>Mensajería</span>
                      <select
                        className="input-field"
                        value={entry.carrier || ''}
                        onChange={(event) =>
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            carrier: event.target.value ? (event.target.value as TrackingCarrier) : null,
                          }))
                        }
                      >
                        <option value="">Por definir</option>
                        {(Object.keys(TRACKING_CARRIER_META) as TrackingCarrier[]).map((carrier) => (
                          <option key={carrier} value={carrier}>
                            {TRACKING_CARRIER_META[carrier].label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="tracking-mini-field">
                      <span>Estado</span>
                      <select
                        className="input-field"
                        value={entry.status}
                        onChange={(event) =>
                          updateEntry(entry.id, (current) => {
                            const nextStatus = event.target.value as TrackingStatus;
                            return {
                              ...current,
                              status: nextStatus,
                              fulfillmentState: nextStatus === 'entregado' ? 'entregado' : 'pendiente',
                              lastEventLabel: TRACKING_STATUS_LABELS[nextStatus],
                            };
                          })
                        }
                      >
                        {TRACKING_STATUS_ORDER.map((status) => (
                          <option key={status} value={status}>
                            {TRACKING_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="tracking-mini-field">
                      <span>ETA</span>
                      <input
                        type="date"
                        className="input-field"
                        value={entry.estimatedDelivery}
                        onChange={(event) =>
                          updateEntry(entry.id, (current) => ({
                            ...current,
                            estimatedDelivery: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>

                  {showPortalBlock ? (
                    <div className="tracking-record__portal">
                      <div className="tracking-record__portal-header">
                        <strong>{entry.lastEventLabel || entry.portalStatusText || 'Sin lectura viva todavía'}</strong>
                        <span>
                          {entry.serviceType || 'Portal sin servicio detectado'}
                          {entry.lastLookupAt ? ` · Portal ${formatTrackingDateTime(entry.lastLookupAt)}` : ''}
                        </span>
                      </div>

                      {entry.lookupError ? <div className="tracking-record__lookup-error">{entry.lookupError}</div> : null}

                      {entry.timeline.length > 0 ? (
                        <div className="tracking-record__timeline">
                          {entry.timeline.slice(0, 3).map((event, index) => (
                            <article key={`${entry.id}-${event.timestamp}-${index}`} className="tracking-record__timeline-item">
                              <strong>{event.label || 'Evento sin descripción'}</strong>
                              <span>{event.location || 'Ubicación no disponible'}</span>
                              <small>{event.timestamp ? formatTrackingDateTime(event.timestamp) : 'Sin hora visible'}</small>
                            </article>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="tracking-record__footer">
                    <div className="tracking-record__dates">
                      <span>{entry.estimatedDelivery ? `ETA ${formatTrackingDate(entry.estimatedDelivery)}` : 'ETA no definida'}</span>
                      <span>{`Actualizado ${formatTrackingDateTime(entry.updatedAt)}`}</span>
                    </div>

                    <div className="tracking-record__actions">
                      <button type="button" className="button-primary inactive" onClick={() => void handleCopyTrackingNumber(entry.trackingNumber)}>
                        Copiar guía
                      </button>
                      <button type="button" className="button-primary inactive" onClick={() => handleOpenCarrierPortal(entry)}>
                        Abrir portal
                      </button>
                      <button
                        type="button"
                        className="button-primary inactive"
                        onClick={() =>
                          void refreshTrackingTargets(
                            [
                              {
                                carrier: entry.carrier,
                                trackingNumber: entry.trackingNumber,
                              },
                            ],
                            'manual',
                          )
                        }
                        disabled={ocrBusy || lookupBusy || !entry.carrier || !liveLookupAvailable}
                      >
                        {lookupBusy ? 'Consultando...' : liveLookupAvailable ? 'Consultar portal' : 'Consulta no disponible'}
                      </button>
                      <button
                        type="button"
                        className="button-primary inactive"
                        onClick={() => {
                          setRowImportTargetId(entry.id);
                          rowImportInputRef.current?.click();
                        }}
                        disabled={ocrBusy}
                      >
                        Actualizar OCR
                      </button>
                      <button
                        type="button"
                        className="button-primary inactive"
                        onClick={() => {
                          setRowImportTargetId(entry.id);
                          rowCameraInputRef.current?.click();
                        }}
                        disabled={ocrBusy}
                      >
                        Cámara
                      </button>
                      <button
                        type="button"
                        className="button-primary inactive tracking-record__delete"
                        onClick={() => setEntries((current) => current.filter((candidate) => candidate.id !== entry.id))}
                        disabled={ocrBusy}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <input
          ref={rowImportInputRef}
          type="file"
          accept="image/*,text/plain"
          hidden
          onChange={(event) => void handleImportFiles(event.target.files, 'ocr', rowImportTargetId)}
        />
        <input
          ref={rowCameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => void handleImportFiles(event.target.files, 'camera', rowImportTargetId)}
        />
      </article>
    </section>
  );
}
