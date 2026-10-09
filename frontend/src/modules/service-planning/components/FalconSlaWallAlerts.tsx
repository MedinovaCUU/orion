import type { FalconWallAlertRow } from '../helpers/falconWallAlerts';

const MAX_VISIBLE = 6;

// Silent, non-blocking strip for shared screens: no audio, no modal, nothing to acknowledge.
export default function FalconSlaWallAlerts({ rows }: { rows: FalconWallAlertRow[] }) {
  if (rows.length === 0) return null;
  const visible = rows.slice(0, MAX_VISIBLE);
  const hidden = rows.length - visible.length;
  const breached = rows.filter((row) => row.thresholdKey === 'breached').length;
  return (
    <section className="wall-sla" role="status" aria-live="polite" aria-label="Alertas de tiempo Falcon">
      <div className="wall-sla__head">
        <span className="wall-sla__eyebrow">Alertas de tiempo · Falcon</span>
        <strong>{rows.length} {rows.length === 1 ? 'ticket' : 'tickets'} por vencer o vencidos</strong>
        {breached > 0 && <span className="wall-sla__count">{breached} vencido{breached === 1 ? '' : 's'}</span>}
        <small>Solo visual · sin sonido</small>
      </div>
      <div className="wall-sla__items">
        {visible.map((row) => (
          <article key={row.id} className={`wall-sla__item wall-sla__item--${row.sla.severity} wall-sla__item--${row.thresholdKey}`}>
            <span className="wall-sla__label">{row.thresholdLabel}</span>
            <strong className="wall-sla__timer">{row.timerLabel}</strong>
            <span className="wall-sla__subject">{row.subject}</span>
            <small className="wall-sla__meta">
              <b>{row.engineerName || 'Sin asignar'}</b> · {row.locationLabel || 'Ubicación no identificada'} · {row.sla.scopeLabel}
            </small>
          </article>
        ))}
        {hidden > 0 && <article className="wall-sla__item wall-sla__item--more"><strong>+{hidden}</strong><span>más en seguimiento</span></article>}
      </div>
    </section>
  );
}
