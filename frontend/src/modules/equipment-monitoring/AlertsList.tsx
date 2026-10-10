import { memo } from 'react';
import type { MonitoringEquipment } from './monitoringDerivations';

/** Lista breve de equipos con warning o fatal (hasta ocho); punto de entrada para el permiso "alertas". */
export default memo(function AlertsList({ equipments, onSelect }: { equipments: MonitoringEquipment[]; onSelect: (equipmentId: string) => void }) {
  return (
    <section className="equipment-monitor__lists-grid" aria-label="Alertas activas">
      <div className="equipment-monitor__list-panel">
        <div className="equipment-monitor__list-header">
          <h3>Alertas activas</h3>
          <span>{equipments.length} equipos con warning o fatal</span>
        </div>
        {equipments.length ? (
          <div className="equipment-monitor__list-items">
            {equipments.map((equipment) => (
              <button
                key={`critical-${equipment.id}-${equipment.serial}`}
                type="button"
                className="equipment-monitor__list-item"
                data-tone={equipment.status}
                onClick={() => onSelect(equipment.id)}
              >
                <div>
                  <strong>{equipment.clientName}</strong>
                  <p>
                    {equipment.serial} · {equipment.model}
                  </p>
                </div>
                <span className={`equipment-monitor__event-level equipment-monitor__event-level--${equipment.status}`}>{equipment.status}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="equipment-monitor__empty-state">No hay alertas activas en este corte.</div>
        )}
      </div>
    </section>
  );
});
