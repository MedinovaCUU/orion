import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReliabilityCenter from '../../src/components/ReliabilityCenter';
import type { LabPayload } from '../../src/components/reliabilityAnalytics';
import '../../src/index.css';
// @ts-expect-error plain-JS fixture generator shared with the node tests
import { syntheticLab, withCapturedEpisode } from './syntheticReliability.mjs';

// Isolated reliability lab. Default: DATOS FICTICIOS. `?real` loads the local, git-ignored export of production facts
// (tests/fixtures/reliability-lab-real.local.json) to review the screens with real numbers without the migration.
function Fixture() {
  const real = new URLSearchParams(location.search).has('real');
  const [payload, setPayload] = useState<LabPayload | null>(real ? null : withCapturedEpisode(syntheticLab()) as LabPayload);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!real) return;
    fetch(`${import.meta.env.BASE_URL}tests/fixtures/reliability-lab-real.local.json`).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))).then(setPayload).catch(e => setError(String(e)));
  }, [real]);
  return <main style={{ maxWidth: 1440, margin: '0 auto' }}>
    <p style={{ font: '12px sans-serif', color: '#5a7280', margin: '0 0 10px' }} data-testid="fixture-source">{real ? 'Datos reales locales (no se publican)' : 'DATOS FICTICIOS — generados para pruebas'}</p>
    {error ? <p role="alert">{error}</p> : payload ? <ReliabilityCenter initialPayload={payload} /> : <p>Cargando…</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
