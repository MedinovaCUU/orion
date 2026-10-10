import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import BrandLockup from '../../components/BrandLockup';
import AlertsList from './AlertsList';
import EquipmentDossier from './EquipmentDossier';
import MonitorCommandStrip from './MonitorCommandStrip';
import MonitorStage from './MonitorStage';
import type { GlobeEquipmentNode } from './GlobalEquipmentGlobe';
import { CURRENT_REAGENT_BUCKET_MONTH, formatBucketMonth, showMonitoringErrorCodes } from './monitorFormat';
import {
  buildEquipmentList,
  filterEquipments,
  sortByPriority,
  summarizeEquipments,
  toGlobeEquipmentNode,
  type EquipmentFilter,
  type MonitoringEquipment,
} from './monitoringDerivations';
import { useMonitoringSnapshot } from './useMonitoringSnapshot';
import './equipmentMonitoring.css';

const SIMULATED_STORAGE_KEY = 'orion.monitor.simulated';

// Misma clave y formato ('true'/'false') que el chip "Cobertura simulada" del HUD del globo.
const readSimulatedPreference = () => {
  try {
    return window.localStorage.getItem(SIMULATED_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
};

const writeSimulatedPreference = (value: boolean) => {
  try {
    window.localStorage.setItem(SIMULATED_STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Sin almacenamiento disponible: la preferencia vive solo en la sesión.
  }
};

/**
 * Selección visible: la explícita mientras exista en el catálogo (aunque el filtro o el buscador la
 * oculten, para no desmontar el explorador 3D ni ignorar un clic en Alertas activas); sin selección
 * explícita, el primer fatal, warning, ubicable o el primero del filtro.
 */
const resolveSelectedEquipment = (
  filtered: MonitoringEquipment[],
  index: ReadonlyMap<string, MonitoringEquipment>,
  selectedId: string | null,
) => {
  if (selectedId) {
    const explicit = index.get(selectedId);
    if (explicit) return explicit;
  }
  if (!filtered.length) return null;
  return (
    filtered.find((equipment) => equipment.status === 'fatal') ||
    filtered.find((equipment) => equipment.status === 'warning') ||
    filtered.find((equipment) => Boolean(equipment.geoPoint)) ||
    filtered[0]
  );
};

/**
 * Compositor del módulo de monitoreo: carga el corte (conjuntos caliente/frío), deriva las listas
 * y reparte el estado entre la franja de mando, el escenario (riel + globo + explorador 3D),
 * el expediente del equipo y la lista de alertas.
 */
export default function EquipmentMonitoring({ subPermissions = ['mapa', 'alertas'] }: { subPermissions?: string[] }) {
  // Permisos de presentación: la autorización real de lectura/escritura depende además de Supabase.
  const canViewMap = subPermissions.includes('mapa');
  const canViewAlerts = subPermissions.includes('alertas');
  const { snapshot, loading, loadError, loadNotice, setLoadNotice, refresh } = useMonitoringSnapshot();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<EquipmentFilter>('all');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<string | null>(null);
  const [alarmPanelEquipmentId, setAlarmPanelEquipmentId] = useState<string | null>(null);
  const [showSimulatedCoverage, setShowSimulatedCoverage] = useState(readSimulatedPreference);
  // Retrasa el filtrado costoso respecto a la escritura para mantener fluido el buscador.
  const deferredSearch = useDeferredValue(search);

  const equipments = useMemo(() => (snapshot ? buildEquipmentList(snapshot) : []), [snapshot]);
  const hasBa400Equipment = useMemo(() => equipments.some((equipment) => equipment.isBa400), [equipments]);

  useEffect(() => {
    // Precalienta código y modelo desde el inicio si hay BA400 en el catálogo: el explorador debe abrir sin espera.
    // Solo se omite con ahorro de datos, red lenta o poca memoria (el modelo residente pesa ~160 MiB en heap).
    if (!canViewMap || !hasBa400Equipment) return undefined;
    // Sin Network Information API (Safari, Firefox) no se asume red rápida: ahí solo precalientan los equipos
    // de puntero fino (escritorio); los teléfonos cargan el modelo al abrir el explorador.
    const runtime = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string }; deviceMemory?: number };
    const { connection } = runtime;
    const goodNetwork = connection
      ? !connection.saveData && (connection.effectiveType ? connection.effectiveType === '4g' : true)
      : window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!goodNetwork || (runtime.deviceMemory ?? 8) < 4) return undefined;
    let cancelled = false;
    const run = () => {
      void Promise.all([import('../dri/model3d/Ba400Canvas'), import('../dri/model3d/ba400PreparedModel')])
        .then(([, cache]) => {
          if (!cancelled) return cache.prepareBa400Model();
          return undefined;
        })
        .catch(() => {
          // La carga interactiva conserva su aviso y reintento si la precarga falla.
        });
    };
    // Safari no expone requestIdleCallback; en ese caso se difiere con un temporizador corto.
    const useIdle = 'requestIdleCallback' in window;
    const handle: number = useIdle ? window.requestIdleCallback(run, { timeout: 2000 }) : window.setTimeout(run, 350);
    return () => {
      cancelled = true;
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [canViewMap, hasBa400Equipment]);

  const equipmentIndex = useMemo(() => new Map(equipments.map((equipment) => [equipment.id, equipment] as const)), [equipments]);
  const filteredEquipments = useMemo(() => filterEquipments(equipments, filter, deferredSearch), [deferredSearch, equipments, filter]);
  const selectedEquipment = useMemo(
    () => resolveSelectedEquipment(filteredEquipments, equipmentIndex, selectedEquipmentId),
    [filteredEquipments, equipmentIndex, selectedEquipmentId],
  );
  // El explorador 3D sigue a la selección: se cierra solo si la serie deja de estar seleccionada o no es BA400.
  const alarmPanelEquipment =
    canViewMap && alarmPanelEquipmentId && selectedEquipment && selectedEquipment.id === alarmPanelEquipmentId && selectedEquipment.isBa400 ? selectedEquipment : null;

  // Una selección explícita abre el visor, incluso si el BA400 no tiene alarmas.
  const selectMonitoringEquipment = useCallback(
    (equipmentId: string | null) => {
      setSelectedEquipmentId(equipmentId);
      const equipment = equipmentId ? equipmentIndex.get(equipmentId) : null;
      setAlarmPanelEquipmentId(canViewMap && equipment?.isBa400 ? equipment.id : null);
    },
    [canViewMap, equipmentIndex],
  );
  const openAlarmPanel = useCallback((equipmentId: string) => setAlarmPanelEquipmentId(equipmentId), []);
  const closeAlarmPanel = useCallback(() => setAlarmPanelEquipmentId(null), []);
  const clearFilters = useCallback(() => {
    setFilter('all');
    setSearch('');
  }, []);
  const dismissNotice = useCallback(() => setLoadNotice(null), [setLoadNotice]);
  const onSatImported = useCallback(() => {
    setLoadNotice('Reporte SAT incorporado. Actualizando consumos y trazabilidad del equipo.');
    void refresh();
  }, [refresh, setLoadNotice]);
  const setSimulatedCoverage = useCallback((value: boolean) => {
    writeSimulatedPreference(value);
    setShowSimulatedCoverage(value);
  }, []);
  const toggleSimulatedCoverage = useCallback(() => setSimulatedCoverage(!showSimulatedCoverage), [setSimulatedCoverage, showSimulatedCoverage]);

  const summary = useMemo(() => summarizeEquipments(equipments), [equipments]);
  const criticalEquipments = useMemo(() => equipments.filter((equipment) => equipment.status !== 'ok').slice(0, 8), [equipments]);
  const priorityEquipments = useMemo(() => sortByPriority(filteredEquipments), [filteredEquipments]);
  const allGlobeEquipments = useMemo(
    () => equipments.map(toGlobeEquipmentNode).filter((equipment): equipment is GlobeEquipmentNode => Boolean(equipment)),
    [equipments],
  );
  const globeEquipments = useMemo(
    () => filteredEquipments.map(toGlobeEquipmentNode).filter((equipment): equipment is GlobeEquipmentNode => Boolean(equipment)),
    [filteredEquipments],
  );
  const monthLabel = formatBucketMonth(CURRENT_REAGENT_BUCKET_MONTH);

  if (loading && !snapshot) {
    return (
      <div className="equipment-monitor equipment-monitor--loading">
        <BrandLockup
          variant="loading"
          eyebrow="Monitoreo Orion"
          title="Levantando red global y telemetría"
          subtitle="Cargando equipos, ciudades y señales operativas para construir el globo Orion."
        />
      </div>
    );
  }

  return (
    <div className="equipment-monitor">
      <MonitorCommandStrip
        search={search}
        onSearchChange={setSearch}
        filter={filter}
        onFilterChange={setFilter}
        summary={summary}
        loadError={loadError}
        loadNotice={loadNotice}
        onDismissNotice={dismissNotice}
        onRefresh={refresh}
        onSatImported={onSatImported}
        showSimulatedCoverage={showSimulatedCoverage}
        onToggleSimulatedCoverage={toggleSimulatedCoverage}
      />

      {canViewMap ? (
        <>
          <MonitorStage
            globeEquipments={globeEquipments}
            countryEquipments={allGlobeEquipments}
            selectedEquipmentId={selectedEquipment?.id ?? null}
            onSelectEquipment={selectMonitoringEquipment}
            priorityEquipments={priorityEquipments}
            monthLabel={monthLabel}
            onClearFilters={clearFilters}
            inspecting={alarmPanelEquipment}
            refreshedAt={snapshot?.refreshedAt || null}
            showCodes={showMonitoringErrorCodes}
            onCloseInspection={closeAlarmPanel}
            showSimulatedCoverage={showSimulatedCoverage}
          />
          <EquipmentDossier
            equipment={selectedEquipment}
            inspecting={Boolean(alarmPanelEquipment)}
            onOpenInspection={openAlarmPanel}
            onCloseInspection={closeAlarmPanel}
          />
        </>
      ) : null}

      {canViewAlerts ? <AlertsList equipments={criticalEquipments} onSelect={selectMonitoringEquipment} /> : null}
    </div>
  );
}
