import KpiCard from './KpiCard';
import type { ServicePlanningKpis } from '../types/servicePlanning.types';

interface KpiStripProps {
  kpis: ServicePlanningKpis;
}

export default function KpiStrip({ kpis }: KpiStripProps) {
  return (
    <section className="planning-kpi-strip">
      <KpiCard label="Total servicios" value={kpis.totalServices} tone="neutral" icon="calendar" />
      <KpiCard label="Preventivos" value={kpis.preventiveCount} tone="cyan" icon="shield" />
      <KpiCard label="Correctivos" value={kpis.correctiveCount} tone="red" icon="wrench" />
      <KpiCard label="Capacitaciones" value={kpis.trainingCount} tone="cyan" icon="cap" />
      <KpiCard label="Recapacitaciones" value={kpis.retrainingCount} tone="violet" icon="refresh" />
      <KpiCard label="Instalaciones" value={kpis.installationCount} tone="amber" icon="briefcase" />
      <KpiCard label="Pendientes de pago" value={kpis.pendingPaymentCount} tone="amber" icon="coin" />
      <KpiCard label="Ya realizados" value={kpis.completedCount} tone="green" icon="check" />
      <KpiCard label="Críticos" value={kpis.criticalCount} tone="red" icon="alert" />
      <KpiCard label="Sin asignar" value={kpis.unassignedCount} tone="neutral" icon="user" />
    </section>
  );
}
