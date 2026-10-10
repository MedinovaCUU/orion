import { memo, startTransition, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import SatReportImporter from '../sat-report/SatReportImporter';
import { useMonitorLive } from './monitorLiveStore';
import { INTEGER_FORMATTER, formatRelativeTime, showMonitoringErrorCodes } from './monitorFormat';
import { EQUIPMENT_FILTER_OPTIONS, type EquipmentFilter, type MonitoringSummary } from './monitoringDerivations';
import { REFRESH_INTERVAL_MS } from './useMonitoringSnapshot';

const NOTICE_DISMISS_MS = 8000;

const formatAgo = (iso: string | null, now: number) => {
  if (!iso) return 'sin dato';
  const elapsed = now - Date.parse(iso);
  if (!Number.isFinite(elapsed)) return 'sin dato';
  if (elapsed < 60_000) return `hace ${Math.max(0, Math.round(elapsed / 1000))} s`;
  return formatRelativeTime(iso);
};

/** Píldora en vivo con anillo de 30 s. Es el único suscriptor del store: un tick no rerenderiza el resto. */
function LiveReadout() {
  const live = useMonitorLive();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const refreshedMs = live.refreshedAt ? Date.parse(live.refreshedAt) : Number.NaN;
  const progress = Number.isFinite(refreshedMs) ? Math.min(1, Math.max(0, (now - refreshedMs) / REFRESH_INTERVAL_MS)) : 0;
  const realtime = formatAgo(live.lastRealtimeEventAt, now);

  return (
    <div
      className="equipment-monitor__live"
      data-refreshing={live.refreshing ? 'true' : undefined}
      title={`Última señal realtime: ${realtime}`}
      style={{ '--mon-progress': progress } as CSSProperties}
    >
      <span className="equipment-monitor__live-pill">
        <i className="equipment-monitor__live-ring" aria-hidden="true" />
        <b>{live.refreshing ? 'Actualizando' : 'En línea'}</b>
      </span>
      <span className="equipment-monitor__live-readings">
        <span>Refresco {formatAgo(live.refreshedAt, now)}</span>
        <i aria-hidden="true">·</i>
        <span>Realtime {realtime}</span>
      </span>
    </div>
  );
}

function ActionsMenu({
  onRefresh,
  showSimulatedCoverage,
  onToggleSimulatedCoverage,
}: {
  onRefresh: () => Promise<void>;
  showSimulatedCoverage: boolean;
  onToggleSimulatedCoverage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Patrón de botón de menú: foco al primer elemento al abrir, flechas para moverse y vuelta al disparador al cerrar.
  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open) return undefined;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') || []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (index: number) => items[(index + items.length) % items.length]?.focus({ preventScroll: true });
    switch (event.key) {
      case 'Escape':
        // Cierra solo el menú: el explorador 3D no debe reaccionar a este Escape.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        break;
      case 'ArrowDown':
        event.preventDefault();
        focusAt(current + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusAt(current - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusAt(0);
        break;
      case 'End':
        event.preventDefault();
        focusAt(items.length - 1);
        break;
      case 'Tab':
        close(false);
        break;
      default:
        break;
    }
  };

  return (
    <div className="equipment-monitor__actions" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="equipment-monitor__actions-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        Acciones
        <i aria-hidden="true" />
      </button>
      {open ? (
        <div id={menuId} ref={menuRef} role="menu" className="equipment-monitor__actions-menu" aria-label="Acciones del monitoreo" onKeyDown={onMenuKeyDown}>
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              close(true);
              void onRefresh();
            }}
          >
            <span>Actualizar ahora</span>
            <small>Vuelve a leer el corte completo</small>
          </button>
          <button type="button" role="menuitemcheckbox" tabIndex={-1} aria-checked={showSimulatedCoverage} onClick={onToggleSimulatedCoverage}>
            <span>Cobertura simulada</span>
            <small>Ciudades y arcos de demostración en el globo</small>
            <i aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

const SUMMARY_CARDS: Array<{ key: keyof MonitoringSummary; modifier: string; tone: string; label: string; title?: string }> = [
  { key: 'total', modifier: 'neutral', tone: 'muted', label: 'Equipos totales' },
  { key: 'fatal', modifier: 'fatal', tone: 'fatal', label: 'Fatales activos' },
  { key: 'warning', modifier: 'warning', tone: 'warning', label: 'Warnings activos' },
  { key: 'telemetryLive', modifier: 'info', tone: 'ok', label: 'Telemetría viva < 24h' },
  { key: 'bplRejected', modifier: 'bpl', tone: 'rejected', label: 'BPL con rechazo', title: 'Equipos con blancos, calibraciones o controles rechazados vigentes' },
];

interface MonitorCommandStripProps {
  search: string;
  onSearchChange: (value: string) => void;
  filter: EquipmentFilter;
  onFilterChange: (value: EquipmentFilter) => void;
  summary: MonitoringSummary;
  loadError: string | null;
  loadNotice: string | null;
  onDismissNotice: () => void;
  onRefresh: () => Promise<void>;
  onSatImported: () => void;
  showSimulatedCoverage: boolean;
  onToggleSimulatedCoverage: () => void;
}

/** Franja de mando: identidad, estado en vivo, búsqueda, filtro segmentado, acciones y cinco KPIs. */
export default memo(function MonitorCommandStrip({
  search,
  onSearchChange,
  filter,
  onFilterChange,
  summary,
  loadError,
  loadNotice,
  onDismissNotice,
  onRefresh,
  onSatImported,
  showSimulatedCoverage,
  onToggleSimulatedCoverage,
}: MonitorCommandStripProps) {
  // Eco inmediato del buscador; el filtrado real se propaga como transición para no frenar el tecleo.
  const [draft, setDraft] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    setDraft(search);
  }

  useEffect(() => {
    if (!loadNotice) return undefined;
    const timer = window.setTimeout(onDismissNotice, NOTICE_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [loadNotice, onDismissNotice]);

  const empty = summary.total === 0;
  const telemetryRatio = summary.total ? summary.telemetryLive / summary.total : 0;

  return (
    <header className="equipment-monitor__command">
      <div className="equipment-monitor__command-row">
        <div className="equipment-monitor__identity">
          <span className="equipment-monitor__eyebrow">Monitoreo en vivo</span>
          <h2>
            <span className="equipment-monitor__title-long">Red global de equipos Orion</span>
            <span className="equipment-monitor__title-short">Monitoreo</span>
          </h2>
        </div>
        <LiveReadout />
        <div className="equipment-monitor__search">
          <input
            className="input-field"
            type="search"
            value={draft}
            aria-label="Buscar equipo"
            placeholder={showMonitoringErrorCodes ? 'Buscar serie, cliente, ciudad, estado o código de error' : 'Buscar serie, cliente, ciudad o estado'}
            onChange={(event) => {
              const value = event.target.value;
              setDraft(value);
              startTransition(() => onSearchChange(value));
            }}
          />
        </div>
        <div className="equipment-monitor__filter" role="group" aria-label="Filtrar por estado">
          {EQUIPMENT_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              data-tone={option.value === 'fatal' || option.value === 'warning' ? option.value : undefined}
              aria-pressed={filter === option.value}
              onClick={() => onFilterChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="equipment-monitor__tool">
          <SatReportImporter compact onImported={onSatImported} />
        </div>
        <ActionsMenu onRefresh={onRefresh} showSimulatedCoverage={showSimulatedCoverage} onToggleSimulatedCoverage={onToggleSimulatedCoverage} />
      </div>

      {/* Totales del catálogo cargado. Orden DOM etiqueta → valor; el valor se muestra arriba por CSS. */}
      <section className="equipment-monitor__summary-grid" aria-label="Indicadores del corte">
        {SUMMARY_CARDS.map((card) => {
          const value = summary[card.key];
          return (
            <article
              key={card.key}
              className={`equipment-monitor__summary-card equipment-monitor__summary-card--${card.modifier}`}
              data-tone={card.tone}
              data-active={!empty && value > 0}
              title={card.title}
              style={card.key === 'telemetryLive' ? ({ '--mon-progress': telemetryRatio } as CSSProperties) : undefined}
            >
              <span className="equipment-monitor__summary-label">{card.label}</span>
              <strong>{empty ? '—' : INTEGER_FORMATTER.format(value)}</strong>
              {card.key === 'telemetryLive' ? <i className="equipment-monitor__summary-ring" aria-hidden="true" /> : null}
            </article>
          );
        })}
      </section>

      {loadError ? (
        <div className="equipment-monitor__banner equipment-monitor__banner--error" role="alert">
          {loadError}
        </div>
      ) : null}
      {loadNotice ? (
        <div className="equipment-monitor__banner" role="status">
          <span>{loadNotice}</span>
          <button type="button" onClick={onDismissNotice} aria-label="Descartar aviso">
            ×
          </button>
        </div>
      ) : null}
    </header>
  );
});
