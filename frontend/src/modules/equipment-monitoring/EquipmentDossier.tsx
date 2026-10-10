import { memo, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Loader } from '../../components/OrionLoader';
import { getPublicAssetUrl } from '../../components/publicAssetUrl';
import AlarmAntecedents from './AlarmAntecedents';
import AppLinkButton from './AppLinkButton';
import BplStatusSection from './BplStatusSection';
import CollapsibleSection from './CollapsibleSection';
import { ReactionSparkline } from './ReactionCurveChart';
import { ba400AlarmLocationLabel } from './ba400AlarmMapping';
import { BPL_TONE_LABELS, normalizeBplTestKey } from './bplEvents';
import {
  CURRENT_REAGENT_BUCKET_MONTH,
  formatBucketMonth,
  formatCurrency,
  formatDateTime,
  formatInteger,
  formatMonitoringErrorLabel,
  formatRelativeTime,
  readNumericValue,
  showMonitoringTestPricing,
} from './monitorFormat';
import { coerceStatus, getEventTimestamp, getStatusLabel, normalizeSerial, type EquipmentErrorRow, type MonitoringEquipment } from './monitoringDerivations';
import { useMonitorBplVersion } from './monitorLiveStore';
import { useBplReactionCurves, type BplReactionCurvesState } from './useBplReactionCurves';
import { useEquipmentDetail } from './useEquipmentDetail';
import { useSupremoLaunch } from './useSupremoLaunch';

const SUPREMO_ICON_URL = getPublicAssetUrl('supremo_icon.png');
const VISIBLE_ERRORS = 4;
const CONSUMPTION_PAGE = 24;
const NAV_ITEMS = [
  { id: 'monitor-status', label: 'Estado' },
  { id: 'monitor-bpl', label: 'BPL' },
  { id: 'monitor-tests', label: 'Consumos' },
  { id: 'monitor-support', label: 'Insumos' },
];

type EquipmentDetail = ReturnType<typeof useEquipmentDetail>;

/** Navegación por anclas pegajosa; la sección activa se sigue con IntersectionObserver. */
function DossierNav({ rootRef }: { rootRef: RefObject<HTMLElement | null> }) {
  const [active, setActive] = useState(NAV_ITEMS[0].id);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-dossier-section]'));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((left, right) => left.boundingClientRect.top - right.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [rootRef]);

  return (
    <nav className="equipment-monitor__focus-nav" aria-label="Secciones del equipo">
      {NAV_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={active === item.id ? 'true' : undefined}
          onClick={() => {
            setActive(item.id);
            rootRef.current?.querySelector<HTMLElement>(`#${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function EventCard({ row, equipment, history, compact = false }: { row: EquipmentErrorRow; equipment: MonitoringEquipment; history: EquipmentErrorRow[]; compact?: boolean }) {
  const level = coerceStatus(row.tipo_mensaje);
  return (
    <article className={`equipment-monitor__event-card${compact ? ' equipment-monitor__event-card--compact' : ''}`} data-tone={level}>
      <div className="equipment-monitor__event-head">
        {compact ? (
          <strong>{formatMonitoringErrorLabel(row.codigo_error, 'Evento reciente')}</strong>
        ) : (
          <span className={`equipment-monitor__event-level equipment-monitor__event-level--${level}`}>{row.tipo_mensaje || 'ok'}</span>
        )}
        <span>{compact ? formatRelativeTime(getEventTimestamp(row)) : formatDateTime(getEventTimestamp(row))}</span>
      </div>
      {compact ? null : <strong>{formatMonitoringErrorLabel(row.codigo_error, 'Evento técnico')}</strong>}
      <p>{row.descripcion_error || 'Sin descripción registrada.'}</p>
      {equipment.isBa400 ? <AlarmAntecedents alarm={row} history={history} /> : null}
      <small className="equipment-monitor__alarm-location">{equipment.isBa400 ? ba400AlarmLocationLabel(row) : 'Sin ubicación 3D definida para este modelo'}</small>
      {compact ? null : <small>{[row.seccion_error, row.monitor_name, row.machine_name].filter(Boolean).join(' · ')}</small>}
    </article>
  );
}

/** Estado: ubicación, errores vigentes (4 + "Ver más") e historial reciente en tira. */
function StatusSection({ equipment, history }: { equipment: MonitoringEquipment; history: EquipmentErrorRow[] }) {
  const [showAllErrors, setShowAllErrors] = useState(false);
  const errors = showAllErrors ? equipment.currentErrors : equipment.currentErrors.slice(0, VISIBLE_ERRORS);
  const hiddenErrors = equipment.currentErrors.length - errors.length;

  return (
    <section id="monitor-status" className="equipment-monitor__focus-section equipment-monitor__focus-section--status" data-dossier-section>
      <div className="equipment-monitor__focus-section--location">
        <div className="equipment-monitor__section-head">
          <h4>Ubicación</h4>
          {equipment.geoPrecision ? <span className="equipment-monitor__section-count">{equipment.geoPrecision}</span> : null}
        </div>
        <p className="equipment-monitor__focus-location">{equipment.address || 'Dirección no registrada.'}</p>
        <p className="equipment-monitor__focus-location">
          {[equipment.city, equipment.municipality, equipment.normalizedState, equipment.postalCode].filter(Boolean).join(' · ') || 'Sin ciudad, estado o código postal.'}
        </p>
        {equipment.geoDisplayName ? (
          <p className="equipment-monitor__focus-location equipment-monitor__focus-location--geo">
            Precisión geográfica: {equipment.geoDisplayName}
            {equipment.geoPrecision ? ` · ${equipment.geoPrecision}` : ''}
          </p>
        ) : null}
        {equipment.geoPoint ? (
          <p className="equipment-monitor__focus-coords">
            {equipment.geoPoint.latitude.toFixed(3)}, {equipment.geoPoint.longitude.toFixed(3)}
          </p>
        ) : null}
      </div>

      <div className="equipment-monitor__status-main">
        <div className="equipment-monitor__focus-section--errors">
          <div className="equipment-monitor__section-head">
            <h4>Errores vigentes</h4>
            <span className="equipment-monitor__section-count">{equipment.currentErrors.length}</span>
          </div>
          {errors.length ? (
            <div className="equipment-monitor__event-list">
              {errors.map((row) => (
                <EventCard key={row.id} row={row} equipment={equipment} history={history} />
              ))}
            </div>
          ) : (
            <div className="equipment-monitor__empty-state">
              {equipment.hasSupabaseSignal
                ? 'No hay warnings ni fatales vigentes para esta serie en el último corte.'
                : 'Esta serie todavía no ha reportado estado ni errores desde Supabase.'}
            </div>
          )}
          {hiddenErrors > 0 ? (
            <button type="button" className="equipment-monitor__more" onClick={() => setShowAllErrors(true)}>
              Ver {hiddenErrors} más
            </button>
          ) : null}
        </div>

        <div className="equipment-monitor__focus-section--history">
          <div className="equipment-monitor__section-head">
            <h4>Historial reciente</h4>
            <span className="equipment-monitor__section-count">{equipment.recentErrors.length}</span>
          </div>
          {equipment.recentErrors.length ? (
            <div className="equipment-monitor__event-list equipment-monitor__event-list--compact">
              {equipment.recentErrors.map((row) => (
                <EventCard key={`history-${row.id}`} row={row} equipment={equipment} history={history} compact />
              ))}
            </div>
          ) : (
            <div className="equipment-monitor__empty-state">No existe historial de errores para esta serie.</div>
          )}
        </div>
      </div>
    </section>
  );
}

/** Consumos: KPIs siempre visibles; meses y desglose por prueba dentro del cuerpo plegable. */
function TestsSection({
  detail,
  reaction,
  onOpen,
}: {
  detail: EquipmentDetail;
  reaction: BplReactionCurvesState;
  onOpen: (open: boolean) => void;
}) {
  const [page, setPage] = useState(1);
  const { summaryDisplay, summary, hasMonthData, monthRows, peakTests, bucketMonth, selectBucketMonth, reagentRows, loadingRows, rowsError } = detail;
  const visibleRows = reagentRows.slice(0, page * CONSUMPTION_PAGE);
  const hiddenRows = reagentRows.length - visibleRows.length;
  const summaryLine = summaryDisplay
    ? `${formatInteger(summaryDisplay.pruebas_registradas)} pruebas · ${formatInteger(summaryDisplay.muestras_paciente)} pacientes · ${formatBucketMonth(summaryDisplay.bucket_month)}`
    : 'Sin consumo cargado para esta serie';

  return (
    <CollapsibleSection
      id="monitor-tests"
      className="equipment-monitor__focus-section--tests"
      title="Pruebas registradas"
      summary={summaryLine}
      onOpen={onOpen}
      head={
        summaryDisplay ? (
          <div className="equipment-monitor__focus-kpis">
            <div className="equipment-monitor__focus-kpi">
              <span>Pruebas totales</span>
              <strong>{formatInteger(summaryDisplay.pruebas_registradas)}</strong>
            </div>
            <div className="equipment-monitor__focus-kpi">
              <span>Muestras de paciente</span>
              <strong>{formatInteger(summaryDisplay.muestras_paciente)}</strong>
            </div>
            <div className="equipment-monitor__focus-kpi">
              <span>{showMonitoringTestPricing ? 'Valor estimado' : 'Pruebas distintas'}</span>
              <strong>
                {showMonitoringTestPricing ? formatCurrency(summaryDisplay.valor_estimado_total_con_iva) : formatInteger(summaryDisplay.pruebas_distintas)}
              </strong>
            </div>
            <div className="equipment-monitor__focus-kpi">
              <span>Último registro del mes</span>
              <strong>{formatDateTime(summaryDisplay.last_event_at)}</strong>
            </div>
          </div>
        ) : null
      }
    >
      {summaryDisplay ? (
        <>
          <p className="equipment-monitor__focus-location">
            Mes seleccionado: {formatBucketMonth(summaryDisplay.bucket_month)}
            {summaryDisplay.bucket_month === CURRENT_REAGENT_BUCKET_MONTH ? ' · corte actual' : ' · histórico'}
            {' · '}
            {showMonitoringTestPricing
              ? `${formatInteger(summaryDisplay.pruebas_distintas_con_precio)} pruebas con precio y ${formatInteger(summaryDisplay.pruebas_distintas_sin_precio)} sin precio catalogado.`
              : `${formatInteger(summaryDisplay.pruebas_distintas)} pruebas distintas registradas en el mes.`}
          </p>
          {!hasMonthData ? <div className="equipment-monitor__empty-state">No hay actividad registrada para {formatBucketMonth(summaryDisplay.bucket_month)}.</div> : null}
          {showMonitoringTestPricing &&
          readNumericValue(summaryDisplay.valor_estimado_total_con_iva_min) > 0 &&
          readNumericValue(summaryDisplay.valor_estimado_total_con_iva_max) > readNumericValue(summaryDisplay.valor_estimado_total_con_iva_min) ? (
            <p className="equipment-monitor__focus-location">
              Rango estimado con IVA: {formatCurrency(summaryDisplay.valor_estimado_total_con_iva_min)} a {formatCurrency(summaryDisplay.valor_estimado_total_con_iva_max)}
            </p>
          ) : null}
          {monthRows.length ? (
            <div className="equipment-monitor__monthly-history">
              <strong>Meses disponibles</strong>
              <div className="equipment-monitor__monthly-history-list">
                {monthRows.map((row) => {
                  const activityLevel = Math.round((readNumericValue(row.pruebas_registradas) / peakTests) * 100);
                  return (
                    <button
                      type="button"
                      key={`${row.numero_serie}-${row.bucket_month}`}
                      className={`equipment-monitor__monthly-history-card${row.bucket_month === bucketMonth ? ' equipment-monitor__monthly-history-card--selected' : ''}`}
                      aria-pressed={row.bucket_month === bucketMonth}
                      onClick={() => {
                        selectBucketMonth(row.bucket_month);
                        setPage(1);
                      }}
                    >
                      <div className="equipment-monitor__event-head">
                        <strong>{formatBucketMonth(row.bucket_month)}</strong>
                        <span>{showMonitoringTestPricing ? formatCurrency(row.valor_estimado_total_con_iva) : `${formatInteger(row.pruebas_registradas)} pruebas`}</span>
                      </div>
                      <div className="equipment-monitor__consumption-metrics">
                        <span>{formatInteger(row.pruebas_registradas)} pruebas</span>
                        <span>{formatInteger(row.muestras_paciente)} pacientes</span>
                        <span>{formatInteger(row.pruebas_distintas)} distintas</span>
                        {showMonitoringTestPricing ? <span>{formatInteger(row.pruebas_distintas_con_precio)} con precio</span> : null}
                      </div>
                      <div className="equipment-monitor__monthly-history-bar" aria-hidden="true">
                        <span style={{ width: `${activityLevel}%` }} />
                      </div>
                      <small>Último registro: {formatDateTime(row.last_event_at)}</small>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="equipment-monitor__empty-state">
          Esta serie todavía no tiene consumo cargado en <code>v_equipment_reagent_consumption_summary</code>.
        </div>
      )}

      {loadingRows ? (
        <div className="equipment-monitor__empty-state">
          <Loader label="Cargando detalle de pruebas…" />
        </div>
      ) : rowsError ? (
        <div className="equipment-monitor__empty-state">{rowsError}</div>
      ) : reagentRows.length ? (
        <div className="equipment-monitor__consumption-list">
          <p className="equipment-monitor__focus-location">
            {showMonitoringTestPricing
              ? `Desglose de ${formatBucketMonth(bucketMonth)}. Las tarjetas marcadas como Sin precio son las que faltan por catalogar o corregir.`
              : `Desglose de ${formatBucketMonth(bucketMonth)} por prueba registrada.`}
          </p>
          {visibleRows.map((row) => {
            const hasPrice = Boolean(row.tiene_precio);
            const latestCurve = reaction.latestByTest.get(normalizeBplTestKey(row.test_name));
            return (
              <article
                key={`${row.numero_serie}-${row.bucket_month}-${row.test_name}`}
                className={`equipment-monitor__consumption-card${showMonitoringTestPricing && !hasPrice ? ' equipment-monitor__consumption-card--muted' : ''}`}
              >
                <div className="equipment-monitor__event-head">
                  <strong>{row.test_name}</strong>
                  <span>{showMonitoringTestPricing ? (hasPrice ? formatCurrency(row.valor_estimado_total_con_iva) : 'Sin precio') : `${formatInteger(row.pruebas_registradas)} pruebas`}</span>
                </div>
                <p>
                  {row.reactivo_codigo_referencia
                    ? `${row.reactivo_codigo_referencia} · ${row.reactivo_descripcion_referencia || row.descripcion_catalogo_normalizada || 'Catálogo'}`
                    : showMonitoringTestPricing
                      ? 'Sin reactivo/precio catalogado para esta prueba.'
                      : 'Sin referencia catalogada para esta prueba.'}
                </p>
                <div className="equipment-monitor__consumption-metrics">
                  <span>{formatInteger(row.pruebas_registradas)} pruebas</span>
                  <span>{formatInteger(row.muestras_paciente)} pacientes</span>
                  <span>{formatInteger(row.calibraciones)} calibraciones</span>
                  <span>{formatInteger(row.controles)} controles</span>
                </div>
                {latestCurve ? <ReactionSparkline group={latestCurve} /> : null}
                <small>
                  {row.presentacion_referencia ? `${row.presentacion_referencia} · rendimiento ${formatInteger(row.rendimiento_referencia)}` : 'Sin presentación de referencia'}
                  {showMonitoringTestPricing &&
                  readNumericValue(row.valor_estimado_total_con_iva_min) > 0 &&
                  readNumericValue(row.valor_estimado_total_con_iva_max) > readNumericValue(row.valor_estimado_total_con_iva_min)
                    ? ` · rango ${formatCurrency(row.valor_estimado_total_con_iva_min)} a ${formatCurrency(row.valor_estimado_total_con_iva_max)}`
                    : ''}
                </small>
              </article>
            );
          })}
          {hiddenRows > 0 ? (
            <button type="button" className="equipment-monitor__more" onClick={() => setPage((value) => value + 1)}>
              Ver más · {hiddenRows} pruebas restantes
            </button>
          ) : null}
        </div>
      ) : summary ? (
        <div className="equipment-monitor__empty-state">
          No hay filas detalladas para esta serie en {formatBucketMonth(bucketMonth)} dentro de <code>v_equipment_reagent_consumption_detail</code>.
        </div>
      ) : null}
    </CollapsibleSection>
  );
}

const ELECTRODES: Array<{ label: string; key: 'ref_electrode' | 'na_electrode' | 'k_electrode' | 'cl_electrode' | 'li_electrode' }> = [
  { label: 'REF', key: 'ref_electrode' },
  { label: 'Na', key: 'na_electrode' },
  { label: 'K', key: 'k_electrode' },
  { label: 'Cl', key: 'cl_electrode' },
  { label: 'Li', key: 'li_electrode' },
];

function SupportSection({ equipment, defaultOpen }: { equipment: MonitoringEquipment; defaultOpen: boolean }) {
  const telemetry = equipment.telemetry;
  const electrodesPresent = telemetry ? ELECTRODES.filter((item) => Boolean(telemetry[item.key])).length : 0;
  const rotorChanges = equipment.rotorSummary?.rotor_change_count;
  const summaryLine = [
    telemetry ? `ISE ${electrodesPresent}/${ELECTRODES.length} electrodos` : 'Sin telemetría de insumos',
    rotorChanges == null ? 'rotor sin resumen' : `rotor ${formatInteger(rotorChanges)} cambios`,
  ].join(' · ');

  return (
    <CollapsibleSection id="monitor-support" className="equipment-monitor__focus-section--support" title="Insumos y rotores" summary={summaryLine} defaultOpen={defaultOpen}>
      <div className="equipment-monitor__support-grid">
        <div className="equipment-monitor__support-block">
          <h5>Telemetría de insumos</h5>
          {telemetry ? (
            <>
              <div className="equipment-monitor__tag-list">
                <span className={`equipment-monitor__tag${telemetry.pack_ise_sn ? '' : ' equipment-monitor__tag--muted'}`}>Pack ISE: {telemetry.pack_ise_sn || 'N/D'}</span>
                {ELECTRODES.map((item) => (
                  <span key={item.key} className={`equipment-monitor__tag${telemetry[item.key] ? '' : ' equipment-monitor__tag--muted'}`}>
                    {item.label}: {telemetry[item.key] || 'N/D'}
                  </span>
                ))}
              </div>
              <p className="equipment-monitor__focus-location">Último evento de consumo: {formatDateTime(telemetry.ultimo_evento_consumo_at)}</p>
            </>
          ) : (
            <div className="equipment-monitor__empty-state">
              Esta serie todavía no reporta estado en <code>estado_insumos_equipo_actual</code>.
            </div>
          )}
        </div>
        <div className="equipment-monitor__support-block">
          <h5>Consumo de rotores</h5>
          {equipment.rotorSummary ? (
            <div className="equipment-monitor__rotor-card">
              <strong>{equipment.rotorSummary.rotor_change_count} cambios</strong>
              <span>{formatBucketMonth(equipment.rotorSummary.bucket_month)}</span>
              <small>Último cambio: {formatDateTime(equipment.rotorSummary.last_change_at)}</small>
            </div>
          ) : (
            <div className="equipment-monitor__empty-state">No hay resumen de rotor cargado para esta serie.</div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
}

interface DossierBodyProps {
  equipment: MonitoringEquipment;
  inspecting: boolean;
  onOpenInspection: (equipmentId: string) => void;
  onCloseInspection: () => void;
}

function DossierBody({ equipment, inspecting, onOpenInspection, onCloseInspection }: DossierBodyProps) {
  const rootRef = useRef<HTMLElement>(null);
  const [testsOpen, setTestsOpen] = useState(false);
  const [supportDefaultOpen] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 960px)').matches);
  const detail = useEquipmentDetail(equipment, { loadReagentRows: testsOpen });
  // El índice de curvas se renueva solo si cambia la evidencia BPL de la serie o llega un aviso de la tabla BPL.
  const bplVersion = useMonitorBplVersion();
  const bplMarker = equipment.bpl ? `${equipment.bpl.lastDetectedAt || ''}|${equipment.bpl.lastEventAt || ''}|${equipment.bpl.events.length}` : 'none';
  const reaction = useBplReactionCurves(equipment.serial, `${bplMarker}|${bplVersion}`);
  const supremo = useSupremoLaunch(equipment);
  const history = useMemo(() => [...equipment.alarmHistory, ...equipment.currentErrors], [equipment.alarmHistory, equipment.currentErrors]);
  const bplDetail = detail.bplDetail && detail.bplDetail.serial === normalizeSerial(equipment.serial) ? detail.bplDetail : null;
  const driHref = `/dashboard?tab=dri&serial=${encodeURIComponent(equipment.serial)}&bpl=apply`;

  return (
    <aside ref={rootRef} className="equipment-monitor__focus-panel" aria-label={`Expediente del equipo ${equipment.serial}`}>
      <div className="equipment-monitor__focus-overview">
        <div className="equipment-monitor__focus-identity">
          <div className="equipment-monitor__focus-pills">
            <div className={`equipment-monitor__status-pill equipment-monitor__status-pill--${equipment.markerTone}`} data-tone={equipment.markerTone}>
              {getStatusLabel(equipment)}
            </div>
            {equipment.bpl && equipment.bpl.tone !== 'none' ? (
              <div className="equipment-monitor__bpl-pill" data-tone={equipment.bpl.tone}>
                {BPL_TONE_LABELS[equipment.bpl.tone]}
              </div>
            ) : null}
            {equipment.isBa400 ? <div className="equipment-monitor__model-pill">Modelo 3D disponible</div> : null}
          </div>
          <h3>{equipment.clientName}</h3>
          <p className="equipment-monitor__focus-subtitle">
            {equipment.serial} · {equipment.model}
          </p>
        </div>

        <div className="equipment-monitor__focus-actions-stack">
          <div className="equipment-monitor__focus-actions">
            {equipment.isBa400 ? (
              inspecting ? (
                <button type="button" className="button-primary inactive" onClick={onCloseInspection}>
                  Cerrar explorador
                </button>
              ) : (
                <button type="button" className="button-primary" onClick={() => onOpenInspection(equipment.id)}>
                  Explorar alarmas en 3D
                </button>
              )
            ) : null}
            <button
              type="button"
              className={`button-primary${supremo.enabled && equipment.hasSupremoLink ? '' : ' inactive'}`}
              onClick={() => void supremo.launch()}
              disabled={supremo.launching || !supremo.enabled || !equipment.hasSupremoLink}
            >
              <img src={SUPREMO_ICON_URL} alt="" className="equipment-monitor__focus-action-icon" />
              {supremo.launching ? 'Abriendo Supremo...' : equipment.hasSupremoLink ? 'Conectar con Supremo' : 'Supremo no configurado'}
            </button>
            <AppLinkButton to={driHref} className="button-primary inactive equipment-monitor__dri-link" title="Abrir el diagnóstico DRI con esta serie">
              Diagnosticar en DRI
            </AppLinkButton>
          </div>
          {supremo.feedback ? (
            <p className={`equipment-monitor__focus-feedback equipment-monitor__focus-feedback--${supremo.feedback.tone}`}>{supremo.feedback.message}</p>
          ) : null}
        </div>

        <div className="equipment-monitor__focus-meta">
          <div>
            <span>Estado</span>
            <strong>{equipment.normalizedState || 'Sin dato'}</strong>
          </div>
          <div>
            <span>Ciudad</span>
            <strong>{equipment.city || equipment.municipality || 'Sin dato'}</strong>
          </div>
          <div>
            <span>Último error</span>
            <strong>{formatDateTime(equipment.lastErrorAt)}</strong>
          </div>
          <div>
            <span>Señal de telemetría</span>
            <strong>{formatDateTime(equipment.telemetry?.updated_at)}</strong>
          </div>
          <div>
            <span>Precisión geográfica</span>
            <strong>{equipment.geoPrecision || (equipment.geoPoint ? 'Estatal' : 'Sin dato')}</strong>
          </div>
        </div>
      </div>

      <DossierNav rootRef={rootRef} />

      <div className="equipment-monitor__focus-layout">
        <StatusSection equipment={equipment} history={history} />
        <div id="monitor-bpl" className="equipment-monitor__dossier-anchor" data-dossier-section>
          <BplStatusSection serial={equipment.serial} overview={equipment.bpl} detail={bplDetail} loading={detail.loadingBpl} error={detail.bplError} reaction={reaction} />
        </div>
        <TestsSection detail={detail} reaction={reaction} onOpen={setTestsOpen} />
        <SupportSection equipment={equipment} defaultOpen={supportDefaultOpen} />
      </div>
    </aside>
  );
}

/** Expediente del equipo seleccionado. Se remonta por id: el estado de detalle no se filtra entre equipos. */
export default memo(function EquipmentDossier({
  equipment,
  inspecting,
  onOpenInspection,
  onCloseInspection,
}: {
  equipment: MonitoringEquipment | null;
  inspecting: boolean;
  onOpenInspection: (equipmentId: string) => void;
  onCloseInspection: () => void;
}) {
  if (!equipment) {
    return (
      <aside className="equipment-monitor__focus-panel equipment-monitor__focus-panel--empty" aria-label="Expediente del equipo">
        <div className="equipment-monitor__empty-state equipment-monitor__empty-state--instrument">
          <span className="mon-reticle" aria-hidden="true" />
          <strong>Selecciona un equipo en el globo o en la lista</strong>
          <p>El expediente muestra ubicación, errores vigentes, evidencia BPL, consumos e insumos de la serie elegida.</p>
        </div>
      </aside>
    );
  }
  return <DossierBody key={equipment.id} equipment={equipment} inspecting={inspecting} onOpenInspection={onOpenInspection} onCloseInspection={onCloseInspection} />;
});
