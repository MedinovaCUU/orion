interface EmptyStateProps {
  title: string;
  description: string;
}

export default function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <section className="planning-empty-state">
      <span className="planning-eyebrow">Sin resultados</span>
      <h3>{title}</h3>
      <p>{description}</p>
    </section>
  );
}
