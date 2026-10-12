import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { loadSatExportPassword, persistSatReport } from './satReportData';
import { parseSatReport, SatPasswordRequiredError } from './satReportParser';
import type { SatPersistResult, SatReportSummary } from './satReportTypes';
import './satReportImporter.css';

/**
 * Importador SAT en un solo paso: se elige (o se suelta) el archivo y el resto ocurre solo. La contraseña de
 * exportación es un secreto de Supabase que Orion obtiene con la sesión del usuario, así que no se pide; solo sin
 * sesión (modo demostración) o si el secreto falta se pide a mano. El análisis y el guardado corren seguidos y el
 * diálogo termina con un resumen de lo que quedó cargado y lo que falta.
 */
export interface SatImportDescription {
  /** Lo que el módulo anfitrión aprovechó (p. ej. lo que DRI proyectó al caso). */
  loaded?: string[];
  /** Qué hacer ahora en el módulo anfitrión. */
  next?: string[];
}

interface SatReportImporterProps {
  onImported?: (summary: SatReportSummary, persistence: SatPersistResult) => void;
  compact?: boolean;
  /** false: analiza y entrega el resumen sin escribir en Supabase (modo demostración). */
  persist?: boolean;
  /** Líneas propias del módulo anfitrión para el resumen final. */
  describe?: (summary: SatReportSummary, persistence: SatPersistResult) => SatImportDescription;
  label?: string;
}

type Stage = 'closed' | 'password' | 'working' | 'done' | 'error';

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex ? 1 : 0)} ${units[unitIndex]}`;
};

const formatDate = (value: string | null) =>
  value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';

const formatDay = (value: string | null) => (value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(new Date(value)) : 'sin fecha');

const formatMonth = (bucket: string) => {
  const match = bucket.match(/^(\d{4})(\d{2})$/);
  if (!match) return bucket;
  return new Intl.DateTimeFormat('es-MX', { month: 'short', year: 'numeric' }).format(new Date(Number(match[1]), Number(match[2]) - 1, 1));
};

const count = (value: number) => value.toLocaleString('es-MX');

/** Resumen genérico de lo que el SAT aportó; el anfitrión agrega sus propias líneas. */
const describeImport = (summary: SatReportSummary, persistence: SatPersistResult) => {
  const loaded: string[] = [];
  const missing: string[] = [];
  const months = [...new Set(summary.consumption.map((row) => row.bucketMonth))].sort();
  if (persistence.persisted) {
    if (months.length) {
      loaded.push(`Monitoreo: ${count(months.length)} meses de consumo por prueba (${formatMonth(months[0])} a ${formatMonth(months[months.length - 1])}).`);
    }
    if (summary.rotors.length) loaded.push(`Monitoreo: ${count(summary.findings.rotorChangeCount)} cambios de rotor en ${count(summary.rotors.length)} meses.`);
  } else {
    missing.push('No se guardó en Monitoreo: el modo demostración solo analiza el archivo en esta sesión.');
  }
  const errors = summary.events.filter((event) => event.category === 'error').length;
  const warnings = summary.events.filter((event) => event.category === 'warning').length;
  if (summary.events.length) {
    loaded.push(`Bitácora del ${formatDay(summary.reportGeneratedAt || summary.findings.dateTo)}: ${count(errors)} errores y ${count(warnings)} avisos.`);
  }
  if (summary.reagentBottles?.length) {
    loaded.push(`${count(summary.reagentBottles.length)} frascos de reactivo con lote y caducidad leídos del código de barras.`);
  }
  if (persistence.persisted && persistence.storedParts) {
    loaded.push(persistence.storedParts > 1 ? `Archivo original guardado en ${persistence.storedParts} partes.` : 'Archivo original guardado.');
  }
  if (!summary.qcResults?.length) {
    if (!summary.coverage.hasDatabaseBackup) missing.push('Resultados de control: este SAT no los incluye.');
    else if (!persistence.persisted) missing.push('Resultados de control: están en el respaldo .bak y solo se extraen al guardar el SAT en Orion.');
    else if (!persistence.storedParts) missing.push('Resultados de control: no se pudo guardar el original, así que el servicio de controles no puede extraerlos del .bak. Vuelve a importar el archivo.');
    else missing.push('Resultados de control: se están extrayendo del respaldo .bak en el servicio de controles (suele tardar uno o dos minutos).');
  }
  if (persistence.warning) missing.push(persistence.warning);
  return { loaded, missing };
};

export default function SatReportImporter({ onImported, compact = false, persist = true, describe, label = 'Importar reporte SAT' }: SatReportImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [manualPassword, setManualPassword] = useState('');
  const [passwordHint, setPasswordHint] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>('closed');
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<SatReportSummary | null>(null);
  const [persistence, setPersistence] = useState<SatPersistResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = stage === 'working';
  /** Abre el selector de archivos; se limpia antes para que elegir el mismo archivo vuelva a disparar la importación. */
  const pickFile = () => {
    if (inputRef.current) {
      inputRef.current.value = '';
      inputRef.current.click();
    }
  };

  const reset = useCallback(() => {
    setFile(null);
    setManualPassword('');
    setPasswordHint(null);
    setSummary(null);
    setPersistence(null);
    setProgress(0);
    setProgressMessage('');
    setError(null);
    setShowDetail(false);
  }, []);

  const close = useCallback(() => {
    if (busy) return;
    setStage('closed');
    window.setTimeout(reset, 180);
  }, [busy, reset]);

  useEffect(() => {
    if (stage === 'closed') return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [stage, close]);

  /** Analiza, guarda y entrega al anfitrión sin pasos intermedios. */
  const run = useCallback(
    async (selected: File, typedPassword = '') => {
      setStage('working');
      setError(null);
      setProgress(2);
      setProgressMessage('Abriendo el reporte SAT');
      // La contraseña viene del secreto de Supabase; la escrita a mano solo existe sin sesión o sin secreto.
      const password = typedPassword || (await loadSatExportPassword()) || '';
      let parsed: SatReportSummary;
      try {
        parsed = await parseSatReport(selected, password, (message, percent) => {
          setProgressMessage(message);
          setProgress(Math.min(Math.round(percent * (persist ? 0.6 : 0.96)), persist ? 60 : 96));
        });
      } catch (caught) {
        if (caught instanceof SatPasswordRequiredError && !password) {
          setPasswordHint(null);
          setStage('password');
          return;
        }
        if (caught instanceof SatPasswordRequiredError && typedPassword) {
          setPasswordHint('La contraseña no abrió el archivo. Revísala y vuelve a intentarlo.');
          setStage('password');
          return;
        }
        setError(
          caught instanceof SatPasswordRequiredError
            ? 'No se pudo abrir el archivo con la contraseña de exportación guardada en Orion. Comprueba que sea un SAT exportado por el equipo (.A400, .A200 o .A15) y que no esté dañado.'
            : caught instanceof Error
              ? caught.message
              : 'No fue posible leer el archivo SAT.',
        );
        setStage('error');
        return;
      }
      setSummary(parsed);

      let result: SatPersistResult = { importId: null, storagePath: null, storedParts: 0, persisted: false, warning: null };
      if (persist) {
        try {
          result = await persistSatReport(selected, parsed, (message, percent) => {
            setProgressMessage(message);
            setProgress(60 + Math.round(percent * 0.4));
          });
        } catch (caught) {
          result = {
            importId: null,
            storagePath: null,
            storedParts: 0,
            persisted: false,
            warning: `El archivo se analizó, pero no pudo guardarse en Monitoreo: ${caught instanceof Error ? caught.message : 'error desconocido'}. El caso de DRI sí lo recibe.`,
          };
        }
      }
      setPersistence(result);
      setProgress(100);
      setProgressMessage('Listo');
      setStage('done');
      onImported?.(parsed, result);
    },
    [onImported, persist],
  );

  const start = (selected: File | null) => {
    // Se vacía el control para que volver a elegir el mismo archivo (reintento) dispare otra importación.
    if (inputRef.current) inputRef.current.value = '';
    if (!selected) return;
    reset();
    setFile(selected);
    void run(selected);
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (!file || !manualPassword.trim()) return;
    void run(file, manualPassword.trim());
  };

  useEffect(() => {
    if (stage === 'password') passwordRef.current?.focus();
  }, [stage]);

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    if (busy) return;
    start(event.dataTransfer.files?.[0] || null);
  };

  const description = summary && persistence ? describeImport(summary, persistence) : null;
  const host = summary && persistence && describe ? describe(summary, persistence) : null;

  return (
    <>
      <span
        className={`sat-importer__trigger-zone${dragging ? ' is-dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!dragging) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <input
          ref={inputRef}
          className="sat-importer__file-input"
          type="file"
          accept=".A400,.A200,.A15,application/zip"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => start(event.target.files?.[0] || null)}
        />
        <button
          type="button"
          className={compact ? 'sat-importer__compact-trigger' : 'button-primary chip'}
          onClick={pickFile}
          disabled={busy}
          title="Elige o suelta aquí el archivo .A400"
        >
          {dragging ? 'Suelta el archivo SAT' : label}
        </button>
      </span>

      {stage !== 'closed'
        ? createPortal(
            <div className="sat-importer__backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
              <section
                className={`sat-importer__dialog ${showDetail ? '' : 'sat-importer__dialog--compact'}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="sat-importer-title"
                aria-busy={busy}
              >
                <header className="sat-importer__header">
                  <div>
                    <span className="sat-importer__eyebrow">Reporte SAT</span>
                    <h2 id="sat-importer-title">
                      {stage === 'done' && summary ? `${summary.equipmentModel} · serie ${summary.serialNumber}` : file ? file.name : 'Importar reporte SAT'}
                    </h2>
                    <p>
                      {stage === 'done' && summary
                        ? `Generado ${formatDate(summary.reportGeneratedAt)}${file ? ` · ${formatBytes(file.size)}` : ''}`
                        : file
                          ? formatBytes(file.size)
                          : ''}
                    </p>
                  </div>
                  <button type="button" className="sat-importer__close" onClick={close} disabled={busy} aria-label="Cerrar importador">
                    ×
                  </button>
                </header>

                <div className="sat-importer__flow">
                  {stage === 'password' ? (
                    <form className="sat-importer__step" onSubmit={submitPassword}>
                      <strong>Falta la contraseña de exportación</strong>
                      <p>Sin sesión de Orion (modo demostración) no se puede leer la contraseña guardada en Supabase. Escríbela para abrir el archivo en esta sesión; no se guarda.</p>
                      <label className="sat-importer__password">
                        <span>Contraseña de exportación</span>
                        <input
                          ref={passwordRef}
                          className="input-field"
                          type="password"
                          autoComplete="off"
                          value={manualPassword}
                          onChange={(event) => setManualPassword(event.target.value)}
                        />
                      </label>
                      {passwordHint ? <div className="sat-importer__notice sat-importer__notice--error">{passwordHint}</div> : null}
                      <div className="sat-importer__step-actions">
                        <button type="submit" className="button-primary" disabled={!manualPassword.trim()}>
                          Abrir e importar
                        </button>
                        <button type="button" className="sat-importer__secondary" onClick={close}>
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : null}

                  {stage === 'working' ? (
                    <div className="sat-importer__step" aria-live="polite">
                      <strong>Importando…</strong>
                      <div className="sat-importer__progress">
                        <div>
                          <span style={{ width: `${progress}%` }} />
                        </div>
                        <p>{progressMessage}</p>
                      </div>
                      <p className="sat-importer__fine">No cierres esta ventana; con archivos grandes el guardado puede tardar unos minutos.</p>
                    </div>
                  ) : null}

                  {stage === 'error' ? (
                    <div className="sat-importer__step">
                      <div className="sat-importer__notice sat-importer__notice--error">{error}</div>
                      <div className="sat-importer__step-actions">
                        <button type="button" className="button-primary" onClick={pickFile}>
                          Elegir otro archivo
                        </button>
                        <button type="button" className="sat-importer__secondary" onClick={close}>
                          Cerrar
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {stage === 'done' && summary && description ? (
                    <div className="sat-importer__result">
                      <section className="sat-importer__result-block" data-tone="ok">
                        <h3>Quedó cargado</h3>
                        <ul>
                          {[...(host?.loaded || []), ...description.loaded].map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </section>
                      {description.missing.length ? (
                        <section className="sat-importer__result-block" data-tone="pending">
                          <h3>Falta</h3>
                          <ul>
                            {description.missing.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      {host?.next?.length ? (
                        <section className="sat-importer__result-block" data-tone="next">
                          <h3>Siguiente paso</h3>
                          <ul>
                            {host.next.map((line) => (
                              <li key={line}>{line}</li>
                            ))}
                          </ul>
                        </section>
                      ) : null}
                      <div className="sat-importer__step-actions">
                        <button type="button" className="button-primary" onClick={close}>
                          Listo
                        </button>
                        <button type="button" className="sat-importer__secondary" onClick={() => setShowDetail((value) => !value)}>
                          {showDetail ? 'Ocultar detalle técnico' : 'Ver detalle técnico'}
                        </button>
                      </div>
                      {showDetail ? <SatTechnicalDetail summary={summary} /> : null}
                    </div>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

/** Detalle técnico del SAT (identidad, conteos, cobertura, lotes y eventos) para quien lo necesite. */
function SatTechnicalDetail({ summary }: { summary: SatReportSummary }) {
  return (
    <div className="sat-importer__preview">
      <div className="sat-importer__identity">
        <div><span>Equipo</span><strong>{summary.equipmentModel}</strong></div>
        <div><span>Número de serie</span><strong>{summary.serialNumber}</strong></div>
        <div><span>Generado</span><strong>{formatDate(summary.reportGeneratedAt)}</strong></div>
        <div><span>Versión</span><strong>{summary.softwareVersion || 'No expuesta'}</strong></div>
      </div>
      <div className="sat-importer__metrics">
        <article><span>Pruebas</span><strong>{summary.findings.distinctTests}</strong></article>
        <article><span>Lotes</span><strong>{summary.findings.distinctLots}</strong></article>
        <article><span>Códigos de barras</span><strong>{summary.findings.distinctBarcodes}</strong></article>
        <article><span>Controles pipeteados</span><strong>{summary.findings.qcEventCount}</strong></article>
        <article><span>Calibraciones</span><strong>{summary.findings.calibrationEventCount}</strong></article>
        <article><span>Rotores</span><strong>{summary.findings.rotorChangeCount}</strong></article>
        <article className={summary.findings.errorCount ? 'is-alert' : ''}><span>Eventos error</span><strong>{summary.findings.errorCount}</strong></article>
      </div>
      <section className="sat-importer__coverage">
        <div>
          <strong>Cobertura</strong>
          <span>
            {summary.coverage.processedFiles} de {summary.coverage.totalFiles} archivos · {formatBytes(summary.coverage.processedBytes)}
          </span>
        </div>
        <div className="sat-importer__coverage-bar">
          <span style={{ width: `${Math.max(5, Math.round((summary.coverage.processedFiles / Math.max(1, summary.coverage.totalFiles)) * 100))}%` }} />
        </div>
        {summary.coverage.deferredReasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
      </section>
      <div className="sat-importer__tables">
        <section>
          <h3>Eventos para diagnóstico</h3>
          <div className="sat-importer__event-list">
            {summary.events
              .filter((event) => event.category !== 'operation')
              .slice(-25)
              .reverse()
              .map((event, index) => (
                <article key={`${event.sourceFile}-${event.occurredAt}-${index}`} data-category={event.category}>
                  <span>{event.category}</span>
                  <p>{event.message}</p>
                  <small>
                    {formatDate(event.occurredAt)} · {event.sourceFile}
                  </small>
                </article>
              ))}
            {!summary.events.length ? <p>No se detectaron mensajes diagnósticos en los XML procesados.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
