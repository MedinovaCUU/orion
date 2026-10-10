import { memo, useState } from 'react';
import AppLinkButton from './AppLinkButton';
import { BPL_TONE_LABELS } from './bplEvents';
import { INTEGER_FORMATTER, formatDateTime } from './monitorFormat';
import type { MonitoringEquipment } from './monitoringDerivations';

const PAGE_SIZE = 40;

const PriorityRow = memo(function PriorityRow({
  equipment,
  selected,
  onSelect,
}: {
  equipment: MonitoringEquipment;
  selected: boolean;
  onSelect: (equipmentId: string) => void;
}) {
  const consumption = equipment.reagentSummary?.pruebas_registradas;
  return (
    <button type="button" data-tone={equipment.status} data-ba400={equipment.isBa400 ? 'true' : undefined} aria-pressed={selected} onClick={() => onSelect(equipment.id)}>
      <span className="equipment-priority__row">
        <strong>{equipment.serial}</strong>
        <b>{equipment.errorSource === 'none' ? 'Sin estado' : equipment.status.toUpperCase()}</b>
      </span>
      <span className="equipment-priority__line">
        {equipment.model} · {equipment.clientName}
      </span>
      <span className="equipment-priority__line equipment-priority__line--data">
        {equipment.priorityAlarmCount} alarmas {equipment.status === 'ok' ? 'activas' : equipment.status} ·{' '}
        {consumption == null ? 'Sin reporte mensual' : `${INTEGER_FORMATTER.format(Number(consumption))} pruebas/mes`}
      </span>
      {equipment.bpl && equipment.bpl.tone !== 'none' ? (
        <span className="equipment-priority__bpl" data-tone={equipment.bpl.tone}>
          {BPL_TONE_LABELS[equipment.bpl.tone]}
          {equipment.bpl.rejectedTests.length ? ` · ${equipment.bpl.rejectedTests.slice(0, 3).join(', ')}` : ''}
        </span>
      ) : null}
      <small>
        {equipment.lastErrorAt ? formatDateTime(equipment.lastErrorAt) : 'Sin eventos reportados'}
        {equipment.errorSource === 'history' ? ' · Historial' : ''}
      </small>
    </button>
  );
});

/** Riel de prioridad: Fatal → Warning → OK · alarmas del nivel → pruebas del mes → fecha. */
export default memo(function EquipmentPriorityRail({
  equipments,
  selectedEquipmentId,
  onSelect,
  onClearFilters,
  monthLabel,
  inspecting = false,
  inspected = null,
  onCloseInspection,
}: {
  equipments: MonitoringEquipment[];
  selectedEquipmentId: string | null;
  onSelect: (equipmentId: string) => void;
  onClearFilters: () => void;
  monthLabel: string;
  inspecting?: boolean;
  /** Equipo con el explorador 3D abierto: el pie del riel lo resume y ofrece cerrar o saltar a DRI. */
  inspected?: MonitoringEquipment | null;
  onCloseInspection?: () => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const visible = equipments.length > limit ? equipments.slice(0, limit) : equipments;

  return (
    <aside className="equipment-priority" aria-label="Equipos por prioridad" data-inspecting={inspecting ? 'true' : undefined}>
      <header title="Orden: Fatal → Warning → OK · alarmas del nivel → pruebas del mes → fecha">
        <strong>Equipos por prioridad</strong>
        <span className="equipment-priority__count">{equipments.length}</span>
        <small>{monthLabel}</small>
      </header>
      <div className="equipment-priority__list">
        {visible.map((equipment) => (
          <PriorityRow key={equipment.id} equipment={equipment} selected={selectedEquipmentId === equipment.id} onSelect={onSelect} />
        ))}
        {equipments.length > limit ? (
          <button type="button" className="equipment-priority__more" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
            Mostrar más · {equipments.length - limit} restantes
          </button>
        ) : null}
        {!equipments.length ? (
          <div className="equipment-priority__empty mon-brackets">
            <span className="mon-brackets__i" aria-hidden="true" />
            <p>Sin equipos con los filtros actuales.</p>
            <button type="button" className="mon-chip" data-tone="ok" onClick={onClearFilters}>
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </div>
      {inspected ? (
        <footer className="equipment-priority__inspecting" aria-label="Equipo en exploración 3D">
          <span className="equipment-priority__inspecting-eyebrow">Explorando en 3D</span>
          <strong>{inspected.clientName}</strong>
          <span className="equipment-priority__inspecting-line">
            {inspected.serial} · {inspected.model}
          </span>
          <div className="equipment-priority__inspecting-facts">
            <span className="mon-chip" data-tone={inspected.status}>
              {inspected.errorSource === 'none' ? 'Sin estado' : inspected.status.toUpperCase()}
            </span>
            <span>{inspected.currentErrors.length} alarmas vigentes</span>
            {inspected.bpl && inspected.bpl.tone !== 'none' ? (
              <span className="equipment-priority__inspecting-bpl" data-tone={inspected.bpl.tone}>
                {BPL_TONE_LABELS[inspected.bpl.tone]}
              </span>
            ) : null}
          </div>
          <small>
            {inspected.lastErrorAt ? `Último evento: ${formatDateTime(inspected.lastErrorAt)}` : 'Sin eventos reportados'}
            {inspected.hasSupabaseSignal ? ' · señal reciente' : ' · sin señal reciente'}
          </small>
          <div className="equipment-priority__inspecting-actions">
            <button type="button" onClick={onCloseInspection}>
              Cerrar explorador
            </button>
            <AppLinkButton to={`/dashboard?tab=dri&serial=${encodeURIComponent(inspected.serial)}&bpl=apply`} className="equipment-priority__link" title="Abrir el diagnóstico DRI con esta serie">
              Diagnosticar en DRI
            </AppLinkButton>
          </div>
        </footer>
      ) : null}
    </aside>
  );
});
