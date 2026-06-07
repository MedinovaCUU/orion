import type { DriDiagnosticCaseRecord, DriEngineLogEntry, DriEvidenceRow } from '../types/dri.types';

export default function DriEvidencePanel({
  evidenceRows,
  logs,
  history,
}: {
  evidenceRows: DriEvidenceRow[];
  logs: DriEngineLogEntry[];
  history: DriDiagnosticCaseRecord[];
}) {
  return (
    <div className="dri-evidence-grid">
      <section className="dri-panel dri-panel--trace">
        <div className="dri-panel__head">
          <div>
            <span className="dri-panel__eyebrow">Lectura guiada del caso</span>
            <h3>Evidencia relacional</h3>
          </div>
        </div>
        <div className="dri-table-wrapper">
          <table className="dri-table">
            <thead>
              <tr>
                <th>Señal</th>
                <th>Categoría</th>
                <th>Score</th>
                <th>A favor</th>
                <th>En contra</th>
              </tr>
            </thead>
            <tbody>
              {evidenceRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.category}</td>
                  <td>{Math.round(row.score)}</td>
                  <td>{row.evidenceFor}</td>
                  <td>{row.evidenceAgainst}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dri-panel dri-panel--trace">
        <div className="dri-panel__head">
          <div>
            <span className="dri-panel__eyebrow">Auditoría</span>
            <h3>Logging técnico</h3>
          </div>
        </div>
        <div className="dri-log-list">
          {logs.slice(0, 18).map((log) => (
            <article key={`${log.runId}-${log.namespace}-${log.step}-${log.message}`} className={`dri-log-entry dri-log-entry--${log.level}`}>
              <strong>{log.namespace}</strong>
              <p>{log.message}</p>
              <small>{log.step}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="dri-panel dri-panel--trace">
        <div className="dri-panel__head">
          <div>
            <span className="dri-panel__eyebrow">Trazabilidad</span>
            <h3>Casos guardados</h3>
          </div>
        </div>
        <div className="dri-history-list">
          {history.slice(0, 8).map((item) => (
            <article key={item.id} className="dri-history-card">
              <div>
                <strong>{item.caseCode}</strong>
                <p>{item.equipmentModel} · {item.serialNumber}</p>
                <small>{item.caseSummary || 'Sin resumen'}</small>
              </div>
              <span className="dri-mini-badge">{item.eventType}</span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
