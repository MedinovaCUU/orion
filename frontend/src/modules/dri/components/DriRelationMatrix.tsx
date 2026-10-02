import type { DriRelationSignal } from '../types/dri.types';

export default function DriRelationMatrix({
  signals,
  onSelectSignal,
}: {
  signals: DriRelationSignal[];
  onSelectSignal?: (signal: DriRelationSignal) => void;
}) {
  return (
    <div className="dri-relation-matrix">
      {signals.slice(0, 12).map((signal) => (
        <button
          key={signal.id}
          type="button"
          className="dri-relation-card"
          onClick={() => onSelectSignal?.(signal)}
        >
          <div className="dri-relation-card__meta">
            <span className="dri-mini-badge">{signal.category}</span>
            <strong>{Math.round(signal.suspicionScore)}</strong>
          </div>
          <h4>{signal.label}</h4>
          {signal.category === 'service' ? (
            <p>
              {signal.label.startsWith('Servicio ajustado')
                ? 'Ajuste aplicado · evidencia parcial del sistema evaluado'
                : 'Prueba anormal · potencia el sistema evaluado'}
            </p>
          ) : (
            <p>
              Fallidas {Math.round(signal.failedCoverage * 100)}% · Correctas {Math.round(signal.correctCoverage * 100)}%
            </p>
          )}
        </button>
      ))}
    </div>
  );
}
