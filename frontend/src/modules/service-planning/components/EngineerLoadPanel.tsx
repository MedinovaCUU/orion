import { formatPlanningPersonName } from '../helpers/normalizeService';
import type { EngineerLoadSummary } from '../types/servicePlanning.types';

interface EngineerLoadPanelProps {
  engineers: EngineerLoadSummary[];
}

export default function EngineerLoadPanel({ engineers }: EngineerLoadPanelProps) {
  return (
    <section className="planning-panel planning-panel--list">
      <div className="planning-panel__header">
        <div>
          <h3>Servicios por ingeniero</h3>
        </div>
        <span className="planning-panel__meta">Total</span>
      </div>

      <div className="planning-engineer-table">
        {engineers.map((engineer) => (
          <article key={engineer.engineer} className="planning-engineer-row">
            <strong>{formatPlanningPersonName(engineer.engineer)}</strong>
            <div className="planning-engineer-row__bar">
              <span style={{ width: `${Math.max(engineer.loadRatio * 100, 8)}%` }} />
            </div>
            <span>{engineer.total}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
