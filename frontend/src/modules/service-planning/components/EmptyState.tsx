import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <section className="planning-empty-state">
      <span className="planning-eyebrow">Sin resultados</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="planning-empty-state__action">{action}</div> : null}
    </section>
  );
}
