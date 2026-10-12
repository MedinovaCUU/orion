import { useEffect, useRef, useState } from 'react';
import SatReportImporter, { type SatImportDescription } from '../../sat-report/SatReportImporter';
import { loadLatestEquipmentQc } from '../../sat-report/satReportData';
import type { SatPersistResult, SatReportSummary } from '../../sat-report/satReportTypes';
import { describePatchReceipt, DRI_SOURCE_LABELS, type DriSourceKind } from '../utils/contextSources';
import type { DriSourceSnapshot, DriSourceStatus, DriSourcesStripProps } from './driWorkbench.types';
import '../dri.sources.css';

/**
 * Tira de fuentes de evidencia: cuatro tarjetas instrumentadas (SAT, BPL, Monitoreo, Asesoría) con
 * estado legible, procedencia y acciones aplicar / quitar / volver a aplicar / descartar. El estado vive
 * en el hook del contenedor; aquí solo se proyecta y se disparan sus acciones.
 */

const KINDS: DriSourceKind[] = ['sat', 'bpl', 'monitoring', 'advisory'];
/** Cada cuánto se busca el resultado del servicio de controles y cuánto se le espera. */
const QC_POLL_MS = 15_000;
const QC_WAIT_MS = 10 * 60_000;

const STATUS_LABELS: Record<DriSourceStatus, string> = {
  idle: 'Sin cargar',
  loading: 'Leyendo…',
  available: 'Disponible',
  applied: 'Aplicado al diagnóstico',
  empty: 'Sin datos',
  error: 'Error',
  dismissed: 'Descartado',
};

const SOURCE_HINTS: Record<DriSourceKind, string> = {
  sat: 'Archivo de servicio del equipo',
  bpl: 'Blancos, calibraciones y controles',
  monitoring: 'Identidad y alarmas en vivo',
  advisory: 'Caso escalado por un técnico',
};

const DISMISS_CONFIRM_MS = 4000;

const stampFormatter = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

const formatStamp = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : stampFormatter.format(parsed);
};

const isLoaded = (status: DriSourceStatus) => status === 'available' || status === 'applied';

export default function DriSourcesStrip({ sources, serial, previewMode, onImportSat, onOpenAdvisoryPicker }: DriSourcesStripProps) {
  // La serie BPL sigue a la del caso hasta que el usuario escribe algo distinto.
  const [typedBplSerial, setTypedBplSerial] = useState<string | null>(null);
  const bplSerial = typedBplSerial ?? serial;
  const monitoringSerial = (serial.trim() || bplSerial).trim();

  // Descartar pide confirmación en línea: un segundo clic dentro de la ventana de confirmación.
  const [pendingDismiss, setPendingDismiss] = useState<DriSourceKind | null>(null);
  const dismissTimer = useRef<number | null>(null);

  const clearDismissTimer = () => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  };

  useEffect(
    () => () => {
      if (dismissTimer.current !== null) window.clearTimeout(dismissTimer.current);
    },
    [],
  );

  const requestDismiss = (kind: DriSourceKind) => {
    clearDismissTimer();
    if (pendingDismiss === kind) {
      setPendingDismiss(null);
      sources.dismiss(kind);
      return;
    }
    setPendingDismiss(kind);
    dismissTimer.current = window.setTimeout(() => {
      dismissTimer.current = null;
      setPendingDismiss(null);
    }, DISMISS_CONFIRM_MS);
  };

  /**
   * Controles del .bak: el servicio de controles los extrae después de guardar el SAT. Mientras tanto la tarjeta
   * espera y, en cuanto aparecen los resultados ligados a esta importación, vuelve a aplicar el SAT con ellos.
   */
  const [qcWatch, setQcWatch] = useState<{
    serial: string;
    importId: string;
    since: number;
    summary: SatReportSummary;
    status: 'waiting' | 'done' | 'timeout';
    count: number;
  } | null>(null);

  // Se lee por referencia: el sondeo no debe reiniciarse cada vez que el contenedor vuelve a renderizar.
  const onImportSatRef = useRef(onImportSat);
  useEffect(() => {
    onImportSatRef.current = onImportSat;
  }, [onImportSat]);

  useEffect(() => {
    if (!qcWatch || qcWatch.status !== 'waiting') return undefined;
    let cancelled = false;
    const tick = async () => {
      const results = await loadLatestEquipmentQc(qcWatch.serial);
      if (cancelled) return;
      const fresh = results.filter((result) => result.sourceImportId === qcWatch.importId);
      if (fresh.length) {
        setQcWatch((current) => (current ? { ...current, status: 'done', count: fresh.length } : current));
        onImportSatRef.current({ ...qcWatch.summary, qcResults: results });
        return;
      }
      if (Date.now() - qcWatch.since > QC_WAIT_MS) setQcWatch((current) => (current ? { ...current, status: 'timeout' } : current));
    };
    const timer = window.setInterval(() => void tick(), QC_POLL_MS);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [qcWatch]);

  const handleSatImported = (summary: SatReportSummary, persistence: SatPersistResult) => {
    // En demostración no se consulta Supabase: el reporte se aplica tal cual al caso local.
    if (previewMode) {
      onImportSat(summary);
      return;
    }
    void loadLatestEquipmentQc(summary.serialNumber).then((qcResults) => {
      const linked = persistence.importId ? qcResults.filter((result) => result.sourceImportId === persistence.importId) : [];
      onImportSat({ ...summary, qcResults: qcResults.length ? qcResults : summary.qcResults || [] });
      // Si el SAT trae .bak y sus controles aún no están extraídos, se espera al servicio de controles.
      if (summary.coverage.hasDatabaseBackup && persistence.importId && persistence.storedParts && !linked.length) {
        setQcWatch({ serial: summary.serialNumber, importId: persistence.importId, since: Date.now(), summary, status: 'waiting', count: 0 });
      } else {
        setQcWatch(null);
      }
    });
  };

  /** Qué recibió el caso de DRI y qué hacer después; se muestra al final del importador. */
  const describeSatForDri = (summary: SatReportSummary): SatImportDescription => {
    const bottles = summary.reagentBottles?.length || 0;
    const hasQc = Boolean(summary.qcResults?.length);
    return {
      loaded: [
        `DRI: el caso tomó la serie ${summary.serialNumber}, la fecha del reporte, el lote de control y el calibrador${bottles ? ', y los lotes de reactivo con su ficha de einfo.bio' : ''}.`,
      ],
      next: hasQc
        ? ['Revisa en la pestaña Caso las pruebas marcadas como fallidas y correctas; el mapa y las hipótesis ya se recalcularon.']
        : summary.coverage.hasDatabaseBackup && !previewMode
          ? [
              'Los controles del respaldo .bak se aplicarán solos al caso en cuanto el servicio de controles los extraiga; la tarjeta SAT muestra el avance.',
              'Si ya sabes qué falló, puedes marcarlo en la pestaña Caso mientras tanto.',
            ]
          : [
            'En la pestaña Caso marca qué pruebas fallaron y cuáles salieron bien: sin eso el mapa de relaciones y las hipótesis no cambian.',
            bottles ? 'El filtro «Solo pruebas del SAT» deja en la lista únicamente las pruebas que corrió el equipo.' : '',
            bottles ? 'Al elegir una prueba, su ficha muestra el lote en uso, la caducidad y las alertas de lote.' : '',
          ].filter(Boolean),
    };
  };

  const appliedCount = sources.appliedKinds.length;
  const availableCount = sources.availableKinds.length;
  const remoteTitle = previewMode ? 'No disponible en modo demostración' : undefined;

  const renderLoaderActions = (kind: DriSourceKind, source: DriSourceSnapshot<unknown>) => {
    const loading = source.status === 'loading';
    switch (kind) {
      case 'sat':
        return (
          <>
            <SatReportImporter
              compact
              persist={!previewMode}
              label={previewMode ? 'Importar SAT (solo esta sesión)' : 'Importar reporte SAT'}
              onImported={handleSatImported}
              describe={describeSatForDri}
            />
            {qcWatch ? (
              <p className="dri-src-card__qc" data-status={qcWatch.status} aria-live="polite">
                {qcWatch.status === 'waiting'
                  ? 'Extrayendo los controles del respaldo .bak; se aplicarán solos al caso.'
                  : qcWatch.status === 'done'
                    ? `Controles del equipo aplicados: ${qcWatch.count} resultados del respaldo .bak.`
                    : 'El servicio de controles no respondió en 10 minutos: revisa que esté encendido (tools/sat-qc-extractor/sat-qc-worker.mjs).'}
              </p>
            ) : null}
            {serial.trim() ? (
              <button
                type="button"
                className="dri-pill-button"
                onClick={() => void sources.loadSat(serial)}
                disabled={loading || previewMode}
                title={remoteTitle}
              >
                Último de la serie
              </button>
            ) : null}
          </>
        );
      case 'bpl':
        return (
          <>
            <label className="dri-src-field">
              <span className="dri-src-field__label">Serie</span>
              <input
                className="input-field"
                value={bplSerial}
                onChange={(event) => setTypedBplSerial(event.target.value)}
                placeholder="Serie 8340…"
                aria-label="Serie del equipo para evidencia BPL"
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <button
              type="button"
              className="dri-pill-button"
              onClick={() => void sources.loadBpl(bplSerial)}
              disabled={loading || previewMode || !bplSerial.trim()}
              title={remoteTitle}
            >
              Leer evidencia BPL
            </button>
          </>
        );
      case 'monitoring':
        return (
          <button
            type="button"
            className="dri-pill-button"
            onClick={() => void sources.loadMonitoring(monitoringSerial)}
            disabled={loading || previewMode || !monitoringSerial}
            title={remoteTitle}
          >
            Consultar Monitoreo
          </button>
        );
      case 'advisory':
        return (
          <button type="button" className="dri-pill-button" onClick={onOpenAdvisoryPicker} disabled={previewMode} title={remoteTitle}>
            Traer caso de asesoría
          </button>
        );
      default:
        return null;
    }
  };

  const renderStateActions = (kind: DriSourceKind, source: DriSourceSnapshot<unknown>) => {
    const label = DRI_SOURCE_LABELS[kind];
    const confirming = pendingDismiss === kind;
    return (
      <>
        {source.status === 'available' && source.build ? (
          <button type="button" className="dri-pill-button dri-src-btn--apply" onClick={() => sources.apply(kind)}>
            Aplicar al diagnóstico
          </button>
        ) : null}
        {source.status === 'applied' ? (
          <>
            <button type="button" className="dri-ghost-button" onClick={() => sources.remove(kind)}>
              Quitar del diagnóstico
            </button>
            <button type="button" className="dri-ghost-button" onClick={() => sources.apply(kind)}>
              Volver a aplicar
            </button>
          </>
        ) : null}
        {source.data ? (
          <button
            type="button"
            className={`dri-ghost-button dri-src-btn--dismiss${confirming ? ' is-confirming' : ''}`}
            onClick={() => requestDismiss(kind)}
            aria-label={confirming ? `Confirmar descarte de ${label}` : `Descartar ${label}`}
            aria-live={confirming ? 'polite' : undefined}
          >
            {confirming ? '¿Seguro?' : 'Descartar'}
          </button>
        ) : null}
      </>
    );
  };

  return (
    <section className="dri-sources" aria-label="Fuentes de evidencia del caso">
      {KINDS.map((kind, index) => {
        const source = sources[kind] as DriSourceSnapshot<unknown>;
        const stamp = source.loadedAt ? formatStamp(source.loadedAt) : null;
        const receiptLine = source.status === 'applied' && source.receipt ? describePatchReceipt(source.receipt) : null;
        const details = source.details.slice(0, 3);
        const statusLabel = STATUS_LABELS[source.status];
        return (
          <article
            key={kind}
            className="dri-source-card dri-src-card"
            data-status={source.status}
            data-kind={kind}
            data-loaded={isLoaded(source.status) ? 'true' : 'false'}
            aria-label={`${DRI_SOURCE_LABELS[kind]}: ${statusLabel}`}
          >
            <header className="dri-src-card__head">
              <span className="dri-src-card__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="dri-src-card__title">
                <span className="dri-panel__eyebrow">{DRI_SOURCE_LABELS[kind]}</span>
                <span className="dri-src-card__hint">{SOURCE_HINTS[kind]}</span>
              </div>
              <span className="dri-src-status" data-status={source.status}>
                <span className="dri-src-status__ring" aria-hidden="true" />
                <span className="dri-src-status__label" aria-live="polite">
                  {statusLabel}
                </span>
              </span>
            </header>

            <div className="dri-src-card__rule" aria-hidden="true" />

            <p className="dri-src-card__headline">{source.headline}</p>

            {details.length ? (
              <ul className="dri-src-card__details">
                {details.map((line, lineIndex) => (
                  <li key={`${lineIndex}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : null}

            {stamp || receiptLine ? (
              <div className="dri-src-card__provenance">
                {stamp ? <span className="dri-src-card__stamp">Leído {stamp}</span> : null}
                {receiptLine ? <span className="dri-src-card__receipt">{receiptLine}</span> : null}
              </div>
            ) : null}

            <div className="dri-source-card__actions dri-src-card__actions">
              {renderLoaderActions(kind, source)}
              {renderStateActions(kind, source)}
            </div>
          </article>
        );
      })}

      <footer className="dri-src-bar" aria-label="Resumen de fuentes">
        <div className="dri-src-bar__meter" aria-hidden="true">
          {KINDS.map((kind) => (
            <span key={kind} className="dri-src-bar__tick" data-status={sources[kind].status} />
          ))}
        </div>
        <div className="dri-src-bar__copy">
          <span className="dri-src-bar__count">
            {appliedCount} de {KINDS.length} fuentes aplicadas
            {availableCount ? ` · ${availableCount} disponible${availableCount === 1 ? '' : 's'}` : ''}
          </span>
          <p className="dri-src-bar__note">
            {previewMode
              ? 'Modo demostración: las fuentes remotas no se consultan. Al recargar la página ninguna fuente queda aplicada hasta volver a pulsar Aplicar.'
              : 'Al recargar la página ninguna fuente queda aplicada hasta volver a pulsar Aplicar.'}
          </p>
        </div>
        {availableCount >= 1 ? (
          <button type="button" className="dri-pill-button dri-src-btn--apply" onClick={sources.applyAllAvailable} disabled={sources.busy}>
            Aplicar todo lo detectado
          </button>
        ) : null}
      </footer>
    </section>
  );
}
