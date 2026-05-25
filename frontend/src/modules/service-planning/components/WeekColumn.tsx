import { useState } from 'react';
import ServiceCard from './ServiceCard';
import type { PlannedService, WeekBucket } from '../types/servicePlanning.types';

interface WeekColumnProps {
  bucket: WeekBucket;
  onOpenService: (service: PlannedService) => void;
}

const DEFAULT_VISIBLE = 4;

export default function WeekColumn({ bucket, onOpenService }: WeekColumnProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleServices = expanded ? bucket.services : bucket.services.slice(0, DEFAULT_VISIBLE);
  const remaining = Math.max(0, bucket.services.length - DEFAULT_VISIBLE);

  return (
    <section className="planning-week-column">
      <header className="planning-week-column__header">
        <div className="planning-week-column__title">
          <h3>{bucket.label.toUpperCase()}</h3>
        </div>
        <span className="planning-week-column__count">{bucket.total} servicios</span>
      </header>

      <div className="planning-week-column__list">
        {visibleServices.map((service) => (
          <ServiceCard key={service.id} service={service} onOpen={onOpenService} />
        ))}
      </div>

      {remaining > 0 ? (
        <button type="button" className="planning-week-column__more" onClick={() => setExpanded((current) => !current)}>
          {expanded ? 'Compactar semana' : `+ ${remaining} servicio${remaining === 1 ? '' : 's'} más`}
        </button>
      ) : null}
    </section>
  );
}
