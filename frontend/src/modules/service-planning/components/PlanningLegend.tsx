const items = [
  { label: 'Preventivo', tone: 'preventivo' },
  { label: 'Correctivo', tone: 'correctivo' },
  { label: 'Capacitación', tone: 'capacitacion' },
  { label: 'Recapacitación', tone: 'recapacitacion' },
  { label: 'Instalación', tone: 'instalacion' },
  { label: 'Comodato', tone: 'comodato' },
  { label: 'Garantía', tone: 'garantia' },
  { label: 'Requiere pago', tone: 'requiere_pago' },
  { label: 'Ya realizado', tone: 'realizado' },
  { label: 'Crítico', tone: 'critico' },
];

export default function PlanningLegend() {
  return (
    <section className="planning-legend">
      {items.map((item) => (
        <span key={item.label} className={`planning-legend__item planning-legend__item--${item.tone}`}>
          <i />
          {item.label}
        </span>
      ))}
    </section>
  );
}
