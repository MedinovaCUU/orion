import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { persistSatReport } from './satReportData';
import { parseSatReport, SatPasswordRequiredError } from './satReportParser';
import type { SatPersistResult, SatReportSummary } from './satReportTypes';
import './satReportImporter.css';

interface SatReportImporterProps {
  onImported?: (summary: SatReportSummary, persistence: SatPersistResult) => void;
  compact?: boolean;
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex ? 1 : 0)} ${units[unitIndex]}`;
};

const formatDate = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : 'Sin fecha';

export default function SatReportImporter({ onImported, compact = false }: SatReportImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [summary, setSummary] = useState<SatReportSummary | null>(null);
  const [persistence, setPersistence] = useState<SatPersistResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('Esperando archivo SAT');
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    setPassword('');
    setSummary(null);
    setPersistence(null);
    setProgress(0);
    setProgressMessage('Esperando archivo SAT');
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setOpen(false);
    window.setTimeout(reset, 180);
  }, [busy, reset]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, busy, close]);

  const chooseFile = (selected: File | null) => {
    setFile(selected);
    setSummary(null);
    setPersistence(null);
    setError(null);
    setProgress(0);
    setProgressMessage(selected ? 'Listo para abrir el contenedor cifrado' : 'Esperando archivo SAT');
  };

  const process = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setPersistence(null);
    try {
      const parsed = await parseSatReport(file, password, (message, percent) => {
        setProgressMessage(message);
        setProgress(Math.min(percent, 96));
      });
      setSummary(parsed);
      setProgress(100);
      setProgressMessage('Vista previa lista; revisa antes de guardar');
    } catch (caught) {
      setProgress(0);
      setError(
        caught instanceof SatPasswordRequiredError
          ? caught.message
          : caught instanceof Error
            ? caught.message
            : 'No fue posible procesar el archivo SAT.',
      );
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file || !summary) return;
    setBusy(true);
    setError(null);
    try {
      const result = await persistSatReport(file, summary, (message, percent) => {
        setProgressMessage(message);
        setProgress(percent);
      });
      setPersistence(result);
      onImported?.(summary, result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No fue posible guardar los datos normalizados.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={compact ? 'sat-importer__compact-trigger' : 'button-primary chip'}
        onClick={() => setOpen(true)}
      >
        Importar reporte SAT
      </button>

      {open ? createPortal(
        <div className="sat-importer__backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
          <section className="sat-importer__dialog" role="dialog" aria-modal="true" aria-labelledby="sat-importer-title">
            <header className="sat-importer__header">
              <div>
                <span className="sat-importer__eyebrow">Ingesta diagnóstica</span>
                <h2 id="sat-importer-title">Importar reporte SAT</h2>
                <p>El archivo se analiza de forma selectiva; la contraseña nunca se guarda.</p>
              </div>
              <button type="button" className="sat-importer__close" onClick={close} disabled={busy} aria-label="Cerrar importador">
                ×
              </button>
            </header>

            <div className="sat-importer__body">
              <div className="sat-importer__controls">
                <label className="sat-importer__dropzone">
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".A400,.A200,.A15,application/zip"
                    onChange={(event) => chooseFile(event.target.files?.[0] || null)}
                  />
                  <span className="sat-importer__drop-icon">SAT</span>
                  <strong>{file ? file.name : 'Selecciona el archivo intacto'}</strong>
                  <small>{file ? `${formatBytes(file.size)} · no se modifica el original` : 'A400, A200 o A15'}</small>
                </label>

                <label className="sat-importer__password">
                  <span>Contraseña de exportación</span>
                  <input
                    className="input-field"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Necesaria porque el SAT está cifrado"
                  />
                </label>

                <div className="sat-importer__progress" aria-live="polite">
                  <div><span style={{ width: `${progress}%` }} /></div>
                  <p>{progressMessage}</p>
                </div>

                {error ? <div className="sat-importer__notice sat-importer__notice--error">{error}</div> : null}
                {persistence?.persisted ? (
                  <div className="sat-importer__notice sat-importer__notice--success">
                    Datos incorporados a Monitoreo y DRI.{persistence.warning ? ` ${persistence.warning}` : ''}
                  </div>
                ) : null}

                <div className="sat-importer__actions">
                  {!summary ? (
                    <button type="button" className="button-primary" onClick={() => void process()} disabled={!file || busy}>
                      {busy ? 'Procesando…' : 'Abrir y analizar'}
                    </button>
                  ) : (
                    <button type="button" className="button-primary" onClick={() => void save()} disabled={busy || persistence?.persisted}>
                      {busy ? 'Guardando…' : persistence?.persisted ? 'Importación guardada' : 'Confirmar e incorporar datos'}
                    </button>
                  )}
                  <button type="button" className="sat-importer__secondary" onClick={reset} disabled={busy || !file}>
                    Cambiar archivo
                  </button>
                </div>
              </div>

              <div className="sat-importer__preview">
                {!summary ? (
                  <div className="sat-importer__empty">
                    <strong>Qué se aprovechará</strong>
                    <ul>
                      <li>Serie, modelo, versión y fecha del equipo.</li>
                      <li>Consumos mensuales por prueba y clase de muestra.</li>
                      <li>Calibraciones, controles, lotes, alarmas y eventos.</li>
                      <li>Archivo original cifrado y vínculo con la evidencia.</li>
                    </ul>
                  </div>
                ) : (
                  <>
                    <div className="sat-importer__identity">
                      <div><span>Equipo</span><strong>{summary.equipmentModel}</strong></div>
                      <div><span>Número de serie</span><strong>{summary.serialNumber}</strong></div>
                      <div><span>Generado</span><strong>{formatDate(summary.reportGeneratedAt)}</strong></div>
                      <div><span>Versión</span><strong>{summary.softwareVersion || 'No expuesta'}</strong></div>
                    </div>

                    <div className="sat-importer__metrics">
                      <article><span>Pruebas</span><strong>{summary.findings.distinctTests}</strong></article>
                      <article><span>Lotes</span><strong>{summary.findings.distinctLots}</strong></article>
                      <article><span>Barcodes</span><strong>{summary.findings.distinctBarcodes}</strong></article>
                      <article><span>Controles</span><strong>{summary.findings.qcEventCount}</strong></article>
                      <article><span>Calibraciones</span><strong>{summary.findings.calibrationEventCount}</strong></article>
                      <article><span>Rotores</span><strong>{summary.findings.rotorChangeCount}</strong></article>
                      <article className={summary.findings.errorCount ? 'is-alert' : ''}><span>Eventos error</span><strong>{summary.findings.errorCount}</strong></article>
                    </div>

                    <section className="sat-importer__coverage">
                      <div>
                        <strong>Cobertura inmediata</strong>
                        <span>{summary.coverage.processedFiles} de {summary.coverage.totalFiles} archivos · {formatBytes(summary.coverage.processedBytes)}</span>
                      </div>
                      <div className="sat-importer__coverage-bar">
                        <span style={{ width: `${Math.max(5, Math.round((summary.coverage.processedFiles / summary.coverage.totalFiles) * 100))}%` }} />
                      </div>
                      {summary.coverage.deferredReasons.map((reason) => <p key={reason}>{reason}</p>)}
                    </section>

                    <div className="sat-importer__tables">
                      <section>
                        <h3>Evidencia de lotes</h3>
                        <div className="sat-importer__table-scroll">
                          <table>
                            <thead><tr><th>Tipo</th><th>Nombre</th><th>Lote / identificador</th><th>Último uso</th></tr></thead>
                            <tbody>
                              {summary.lots.slice(0, 40).map((lot) => (
                                <tr key={`${lot.kind}-${lot.name}-${lot.lot}`}>
                                  <td>{lot.kind === 'barcode' ? 'identificador' : lot.kind}</td><td>{lot.name}</td><td>{lot.lot}</td><td>{formatDate(lot.lastSeenAt)}</td>
                                </tr>
                              ))}
                              {!summary.lots.length ? <tr><td colSpan={4}>Los lotes no están expuestos en los CSV legibles.</td></tr> : null}
                            </tbody>
                          </table>
                        </div>
                      </section>

                      <section>
                        <h3>Eventos para diagnóstico</h3>
                        <div className="sat-importer__event-list">
                          {summary.events.slice(-25).reverse().map((event, index) => (
                            <article key={`${event.sourceFile}-${event.occurredAt}-${index}`} data-category={event.category}>
                              <span>{event.category}</span>
                              <p>{event.message}</p>
                              <small>{formatDate(event.occurredAt)} · {event.sourceFile}</small>
                            </article>
                          ))}
                          {!summary.events.length ? <p>No se detectaron mensajes diagnósticos en los XML procesados.</p> : null}
                        </div>
                      </section>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}
