import EmptyState from './EmptyState';
import WeekColumn from './WeekColumn';
import type { PlannedService, WeekBucket } from '../types/servicePlanning.types';

interface WeeklyBoardProps {
  weeks: WeekBucket[];
  onOpenService: (service: PlannedService) => void;
}

export default function WeeklyBoard({ weeks, onOpenService }: WeeklyBoardProps) {
  if (weeks.length === 0) {
    return <EmptyState title="Sin servicios en este periodo" description="Ajusta los filtros o cambia de mes para ver otra ventana operativa." />;
  }

  return (
    <section className="planning-weekly-board">
      {weeks.map((bucket) => (
        <WeekColumn key={bucket.key} bucket={bucket} onOpenService={onOpenService} />
      ))}
    </section>
  );
}
