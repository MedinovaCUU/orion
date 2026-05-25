import type { CSSProperties } from 'react';
import PlanningIcon from './PlanningIcon';

interface KpiCardProps {
  label: string;
  value: number;
  tone?: 'neutral' | 'red' | 'cyan' | 'amber' | 'green' | 'violet';
  icon: 'calendar' | 'shield' | 'wrench' | 'cap' | 'refresh' | 'briefcase' | 'coin' | 'check' | 'alert' | 'user';
}

const toneMap: Record<NonNullable<KpiCardProps['tone']>, string> = {
  neutral: 'var(--planning-silver)',
  red: 'var(--planning-red)',
  cyan: 'var(--planning-cyan)',
  amber: 'var(--planning-amber)',
  green: 'var(--planning-green)',
  violet: 'var(--planning-violet)',
};

export default function KpiCard({ label, value, tone = 'neutral', icon }: KpiCardProps) {
  return (
    <article className={`planning-kpi-card planning-kpi-card--${tone}`} style={{ '--planning-kpi-accent': toneMap[tone] } as CSSProperties}>
      <div className="planning-kpi-card__icon">
        <PlanningIcon name={icon} />
      </div>
      <div className="planning-kpi-card__body">
        <strong>{value.toLocaleString('es-MX')}</strong>
        <p>{label}</p>
      </div>
    </article>
  );
}
