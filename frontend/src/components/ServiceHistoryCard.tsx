import { useState } from 'react';
import {
  historyFacts,
  historyRecordKind,
  historyRecordRef,
  historyTypeLabel,
  reflowText,
  scheduleSummary,
  trainingTopics,
  type ServiceHistoryRow,
} from './serviceHistoryRecord';

interface ServiceHistoryCardRow extends ServiceHistoryRow {
  cda?: string | null;
  cds?: string | null;
  detalle_averia?: string | null;
  detalle_solucion?: string | null;
  diagnostico?: string | null;
  trabajo_realizado?: string | null;
  profiles?: { nombre_completo?: string | null } | null;
  averias_catalogo?: { detalle_averia?: string | null } | null;
  soluciones_catalogo?: { detalle_solucion?: string | null } | null;
  servicios_refacciones?: Array<{
    cantidad: number;
    refacciones_catalogo?: { codigo_refaccion?: string | null; descripcion?: string | null } | null;
  }> | null;
}

const ACCENT: Record<string, string> = {
  servicio: 'var(--primary-color)',
  capacitacion: 'var(--success-color)',
  llamada: 'var(--warning-color)',
};

const panelStyle = {
  marginTop: '0.85rem',
  padding: '0.75rem 0.9rem',
  borderRadius: '14px',
  border: '1px solid rgba(124, 136, 149, 0.14)',
  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(244, 247, 250, 0.78))',
} as const;

const labelStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-secondary)',
  display: 'block',
  fontWeight: 700,
  letterSpacing: '0.02em',
  marginBottom: '0.3rem',
} as const;

function LongText({ label, value }: { label: string; value: string }) {
  const [open, setOpen] = useState(false);
  const long = value.length > 280 || value.split('\n').length > 4;
  return (
    <div style={panelStyle}>
      <span style={labelStyle}>{label}</span>
      <p
        style={{
          margin: 0,
          fontSize: '0.84rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-line',
          color: 'var(--text-primary)',
          ...(long && !open
            ? { display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' }
            : {}),
        }}
      >
        {reflowText(value)}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          style={{
            marginTop: '0.35rem',
            padding: 0,
            border: 'none',
            background: 'none',
            color: 'var(--primary-color)',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {open ? 'Ver menos' : 'Ver completo'}
        </button>
      )}
    </div>
  );
}

export function ServiceHistoryCard({ serv }: { serv: ServiceHistoryCardRow }) {
  const kind = historyRecordKind(serv);
  const typeLabel = historyTypeLabel(serv);
  const schedule = scheduleSummary(serv);
  const topics = trainingTopics(serv);
  const facts = historyFacts(serv);
  const showCodes = kind === 'servicio' || Boolean(serv.cda || serv.cds);
  const averia = serv.detalle_averia || serv.averias_catalogo?.detalle_averia || 'Avería de texto libre';
  const solucion = serv.detalle_solucion || serv.soluciones_catalogo?.detalle_solucion || 'Solución de texto libre';

  return (
    <div
      style={{
        background:
          'radial-gradient(circle at top right, rgba(var(--clinical-rgb), 0.08), transparent 28%), linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(245, 248, 251, 0.82))',
        padding: '1rem',
        borderRadius: '18px',
        border: '1px solid var(--surface-outline)',
        borderLeft: `4px solid ${ACCENT[kind]}`,
        boxShadow: 'var(--surface-shadow)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '0.95rem' }}>
          <span style={{ color: 'var(--primary-color)', marginRight: '0.5rem' }}># {historyRecordRef(serv)}</span>| {schedule.dates}
        </strong>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {kind === 'capacitacion' ? 'Asesor' : 'Ingeniero'}: {serv.profiles?.nombre_completo || 'Sin perfil en Orion'}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.5rem' }}>
        {typeLabel && (
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '0.15rem 0.55rem',
              borderRadius: '999px',
              color: 'var(--text-primary)',
              border: `1px solid ${ACCENT[kind]}`,
              background: 'rgba(255, 255, 255, 0.7)',
            }}
          >
            {typeLabel}
          </span>
        )}
        {(schedule.hours || schedule.duration) && (
          <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            {[schedule.hours, schedule.duration && `Duración ${schedule.duration}`].filter(Boolean).join(' · ')}
            {schedule.multiDay && schedule.duration ? ' (incluye días completos)' : ''}
          </span>
        )}
      </div>

      {serv.motivo && (
        <p style={{ margin: '0.6rem 0 0', fontWeight: 500, fontSize: '0.9rem' }}>
          Motivo / Asunto: <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>{serv.motivo}</span>
        </p>
      )}

      {showCodes && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginTop: '0.85rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--error-color)', display: 'block', fontWeight: 'bold' }}>
              Avería [CDA: {serv.cda || '—'}]
            </span>
            <span style={{ fontSize: '0.85rem' }}>{averia}</span>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', color: 'var(--success-color)', display: 'block', fontWeight: 'bold' }}>
              Solución [CDS: {serv.cds || '—'}]
            </span>
            <span style={{ fontSize: '0.85rem' }}>{solucion}</span>
          </div>
        </div>
      )}

      {serv.diagnostico && <LongText label={kind === 'llamada' ? 'Categoría reportada' : 'Diagnóstico del ingeniero'} value={serv.diagnostico} />}
      {serv.trabajo_realizado && (
        <LongText label={kind === 'capacitacion' ? 'Comentarios del asesor' : kind === 'llamada' ? 'Atención brindada' : 'Trabajo realizado'} value={serv.trabajo_realizado} />
      )}

      {topics && (
        <div style={panelStyle}>
          <span style={labelStyle}>Temas vistos</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
            {topics.covered.map((topic) => (
              <span
                key={topic}
                style={{ fontSize: '0.76rem', padding: '0.12rem 0.5rem', borderRadius: '999px', background: 'rgba(var(--success-rgb), 0.12)', color: 'var(--text-primary)' }}
              >
                {topic}
              </span>
            ))}
          </div>
          {topics.pending.length > 0 && (
            <p style={{ margin: '0.45rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>No vistos: {topics.pending.join(', ')}</p>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <dl style={{ ...panelStyle, display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr', gap: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
          {facts.map((fact) => (
            <div key={fact.label} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{fact.label}</dt>
              <dd style={{ margin: 0, whiteSpace: 'pre-line' }}>{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {serv.servicios_refacciones && serv.servicios_refacciones.length > 0 && (
        <div style={panelStyle}>
          <span style={labelStyle}>Refacciones utilizadas</span>
          <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
            {serv.servicios_refacciones.map((sr, idx) => (
              <li key={idx}>
                <strong>[{sr.refacciones_catalogo?.codigo_refaccion}]</strong> x{sr.cantidad} - {sr.refacciones_catalogo?.descripcion}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
