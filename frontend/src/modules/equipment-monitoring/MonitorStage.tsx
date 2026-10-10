import { memo, useCallback, useEffect, useRef, useState } from 'react';
import Ba400AlarmPanel from './Ba400AlarmPanel';
import EquipmentPriorityRail from './EquipmentPriorityRail';
import GlobalEquipmentGlobe, { type GlobeEquipmentNode } from './GlobalEquipmentGlobe';
import type { MonitoringEquipment } from './monitoringDerivations';

const LEGEND = [
  { tone: 'muted', label: 'Sin señal' },
  { tone: 'supremo', label: 'Supremo' },
  { tone: 'ok', label: 'OK' },
  { tone: 'warning', label: 'Warning' },
  { tone: 'fatal', label: 'Fatal' },
];

interface MonitorStageProps {
  globeEquipments: GlobeEquipmentNode[];
  countryEquipments: GlobeEquipmentNode[];
  selectedEquipmentId: string | null;
  onSelectEquipment: (equipmentId: string | null) => void;
  priorityEquipments: MonitoringEquipment[];
  monthLabel: string;
  onClearFilters: () => void;
  /** BA400 con el explorador 3D abierto; null en reposo. */
  inspecting: MonitoringEquipment | null;
  refreshedAt: string | null;
  showCodes: boolean;
  onCloseInspection: () => void;
  showSimulatedCoverage: boolean;
}

/**
 * Escenario instrumental: el globo ocupa todo el escenario; el riel de prioridad flota a la izquierda
 * en cristal oscuro y, al inspeccionar un BA400, el explorador 3D aparece sobre el globo (que queda
 * en pausa y difuminado). Las capas se colocan por rejilla superpuesta, no por posicionamiento absoluto.
 */
export default memo(function MonitorStage({
  globeEquipments,
  countryEquipments,
  selectedEquipmentId,
  onSelectEquipment,
  priorityEquipments,
  monthLabel,
  onClearFilters,
  inspecting,
  refreshedAt,
  showCodes,
  onCloseInspection,
  showSimulatedCoverage,
}: MonitorStageProps) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  // Pantalla completa del escenario (globo + riel + explorador). iOS Safari no la expone: el botón no aparece.
  const [fullscreenAvailable] = useState(() => typeof document !== 'undefined' && Boolean(document.fullscreenEnabled));
  const [isFullscreen, setIsFullscreen] = useState(false);
  const inspectingNow = Boolean(inspecting);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(workspaceRef.current) && document.fullscreenElement === workspaceRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const node = workspaceRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void node.requestFullscreen().catch(() => {});
  }, []);

  return (
    <section className="equipment-monitor__map-panel" aria-label="Escenario operativo">
      <div ref={workspaceRef} className={`equipment-monitor__spatial-workspace${inspectingNow ? ' is-inspecting' : ''}`}>
        <EquipmentPriorityRail
          equipments={priorityEquipments}
          selectedEquipmentId={selectedEquipmentId}
          onSelect={onSelectEquipment}
          onClearFilters={onClearFilters}
          monthLabel={monthLabel}
          inspecting={inspectingNow}
          inspected={inspecting}
          onCloseInspection={onCloseInspection}
        />
        <GlobalEquipmentGlobe
          paused={inspectingNow}
          showSimulatedCoverage={showSimulatedCoverage}
          equipments={globeEquipments}
          countryEquipments={countryEquipments}
          selectedEquipmentId={selectedEquipmentId}
          onSelectEquipment={onSelectEquipment}
        />
        {inspecting ? (
          <Ba400AlarmPanel key={inspecting.id} equipment={inspecting} refreshedAt={refreshedAt} showCodes={showCodes} onClose={onCloseInspection} />
        ) : null}
        {/* Barra inferior del escenario: leyenda de estados y pantalla completa, fuera del lienzo para no tapar el HUD. */}
        <div className="equipment-monitor__stage-bar">
          <div className="equipment-monitor__legend" aria-label="Leyenda de estados">
            {LEGEND.map((item) => (
              <span key={item.tone}>
                <i className={`equipment-monitor__legend-dot equipment-monitor__legend-dot--${item.tone}`} data-tone={item.tone} /> {item.label}
              </span>
            ))}
          </div>
          {fullscreenAvailable ? (
            <button
              type="button"
              className="equipment-monitor__fullscreen"
              aria-pressed={isFullscreen}
              aria-label={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
              onClick={toggleFullscreen}
            >
              {/* Icono de esquinas: hacia fuera para ampliar, hacia dentro para salir. */}
              <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {isFullscreen ? (
                  <>
                    <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
                  </>
                ) : (
                  <>
                    <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" />
                  </>
                )}
              </svg>
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
});
