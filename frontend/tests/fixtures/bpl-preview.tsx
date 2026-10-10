// Vista previa local de la sección BPL con datos de ejemplo; no forma parte de las rutas de la aplicación.
import { createRoot } from 'react-dom/client';
import BplStatusSection from '../../src/modules/equipment-monitoring/BplStatusSection';
import { buildBplSerialSummary, normalizeBplEvent, type BplEvent, type BplEventRow } from '../../src/modules/equipment-monitoring/bplEvents';
import {
  groupReactionReplicates,
  latestReactionGroupByTest,
  prepareReactionReplicates,
  type BplReactionIndexRow,
  type BplReactionReplicate,
} from '../../src/modules/equipment-monitoring/bplReactionCurves';
import type { BplReactionCurvesState } from '../../src/modules/equipment-monitoring/useBplReactionCurves';
import { buildBplDemoRows } from './bplDemoData.mjs';
import '../../src/index.css';
import '../../src/modules/equipment-monitoring/equipmentMonitoring.css';

const serial = '834009999';
const demoRows = buildBplDemoRows({ serial, marker: { demo: true } }) as { statusRows: BplEventRow[]; curveRows: BplReactionIndexRow[] };
const statusRows: BplEventRow[] = demoRows.statusRows.map((row, index) => ({ id: index + 1, ...row }));
const curveRows: BplReactionIndexRow[] = demoRows.curveRows.map((row, index) => ({ id: 100 + index, ...row }));

const events = statusRows.map(normalizeBplEvent).filter((event): event is BplEvent => Boolean(event));
const summary = buildBplSerialSummary(serial, events);
const replicates: BplReactionReplicate[] = prepareReactionReplicates(curveRows);
const groups = groupReactionReplicates(replicates);
const reaction: BplReactionCurvesState = {
  groups,
  latestByTest: latestReactionGroupByTest(groups),
  loading: false,
  loadingPoints: false,
  error: null,
  ensureGroupPoints: async () => {},
};

// Página de prueba sin exportaciones: Fast Refresh no aplica aquí.
// eslint-disable-next-line react-refresh/only-export-components
function App() {
  return (
    <div className="equipment-monitor" style={{ padding: '1.5rem', maxWidth: '1320px', margin: '0 auto' }}>
      <aside className="equipment-monitor__focus-panel" style={{ display: 'grid', gap: '1rem' }}>
        <div className="equipment-monitor__focus-overview">
          <div className="equipment-monitor__focus-identity">
            <div className="equipment-monitor__focus-pills">
              <div className="equipment-monitor__status-pill equipment-monitor__status-pill--ok">Operativo</div>
              <div className="equipment-monitor__bpl-pill" data-tone={summary.tone}>Vista previa · datos de ejemplo</div>
            </div>
            <h3>Laboratorio de prueba local</h3>
            <p className="equipment-monitor__focus-subtitle">{serial} · BA400</p>
          </div>
        </div>
        <div className="equipment-monitor__focus-layout">
          <BplStatusSection serial={serial} overview={summary} detail={summary} loading={false} error={null} reaction={reaction} />
        </div>
      </aside>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
