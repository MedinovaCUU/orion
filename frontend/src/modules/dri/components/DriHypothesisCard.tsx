import DriChecklist from './DriChecklist';
import type { KeyboardEvent } from 'react';
import type { DriHypothesisResult } from '../types/dri.types';

const severityTone = {
  low: 'neutral',
  medium: 'amber',
  high: 'teal',
  critical: 'red',
} as const;

export default function DriHypothesisCard({
  hypothesis,
  selected,
  onSelect,
}: {
  hypothesis: DriHypothesisResult;
  selected: boolean;
  onSelect: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      className={`dri-hypothesis-card ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <div className="dri-hypothesis-card__summary-grid">
        <div className="dri-hypothesis-card__overview">
          <div className="dri-inline-badges">
            <span className={`dri-badge dri-badge--${severityTone[hypothesis.severity]}`}>{hypothesis.severity}</span>
            <span className="dri-badge dri-badge--neutral">{hypothesis.suspectedSubsystem}</span>
            <span className="dri-badge dri-badge--neutral">{hypothesis.invasivenessLevel}</span>
          </div>
          <h4>{hypothesis.title}</h4>
          <p>{hypothesis.explanation}</p>
        </div>
        <div className="dri-hypothesis-card__scores">
          <strong>{Math.round(hypothesis.probabilityScore)}</strong>
          <span>prob.</span>
          <small>{Math.round(hypothesis.confidenceScore)} conf.</small>
        </div>

        <div className="dri-hypothesis-card__evidence-panel">
          <strong>A favor</strong>
          <ul className="dri-action-list">
            {hypothesis.evidenceFor.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>

        <div className="dri-hypothesis-card__evidence-panel">
          <strong>En contra</strong>
          <ul className="dri-action-list">
            {hypothesis.evidenceAgainst.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
      </div>

      <div className="dri-hypothesis-card__footer">
        <div className="dri-hypothesis-card__next-test">
          <strong>Siguiente prueba</strong>
          <p>{hypothesis.recommendedNextTest || 'Sin prueba sugerida.'}</p>
        </div>
        {hypothesis.warningText ? <div className="dri-warning-inline">{hypothesis.warningText}</div> : null}
      </div>

      <DriChecklist steps={hypothesis.checklist} />
    </article>
  );
}
