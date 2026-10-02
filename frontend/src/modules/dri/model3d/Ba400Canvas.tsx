import modelInfo from './ba400Model.generated.json';
import { useEffect, useRef, useState } from 'react';
import { createBa400Scene, disposeModel } from './ba400Scene';
import type { Ba400View } from './ba400Scene';
import { clearBa400ModelCache, subscribeModelProgress } from './ba400ModelCache';
import { takeBa400Model } from './ba400PreparedModel';

export default function Ba400Canvas({ view, onPick, onReady }: {
  view: Ba400View; onPick: (id: string) => void; onReady: (ready: boolean) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ReturnType<typeof createBa400Scene> | null>(null);
  const latest = useRef({ view, onPick, onReady });
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState<'loading' | 'preparing' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => { latest.current = { view, onPick, onReady }; sceneRef.current?.setView(view); }, [view, onPick, onReady]);
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeModelProgress(setProgress);
    const fail = (message: string) => {
      if (!active) return;
      sceneRef.current?.dispose(); sceneRef.current = null;
      setError(message); setPhase('error'); latest.current.onReady(false);
    };
    void (async () => {
      let gltf;
      try {
        gltf = await takeBa400Model();
        if (active) setPhase('preparing');
        if (!active) { disposeModel(gltf.scene); return; }
        if (!hostRef.current) { disposeModel(gltf.scene); return; }
        sceneRef.current = createBa400Scene(hostRef.current, gltf, id => latest.current.onPick(id), fail);
        sceneRef.current.setView(latest.current.view);
        setPhase('ready'); latest.current.onReady(true);
      } catch (cause) {
        if (gltf && !sceneRef.current) disposeModel(gltf.scene);
        fail(cause instanceof Error ? cause.message : 'No se pudo abrir el modelo 3D.');
      }
    })();
    return () => {
      active = false; unsubscribe();
      sceneRef.current?.dispose(); sceneRef.current = null;
    };
  }, [attempt]);
  return <>
    <div ref={hostRef} className="ba400-canvas" data-testid="ba400-canvas" data-state={phase} />
    {phase === 'loading' || phase === 'preparing' ? <div className="ba400-loading" role="status">
      <span className="ba400-loader-orbit" aria-hidden="true" />
      <strong>{phase === 'preparing' ? `Preparando ${modelInfo.partCount} componentes` : 'Cargando el BA400'}</strong>
      <progress max={100} value={progress} aria-label="Descarga del modelo BA400" />
      <span>{phase === 'preparing' ? 'Creando la escena 3D…' : `${Math.round(progress)} % · ${(modelInfo.bytes / 1048576).toFixed(1)} MiB`}</span>
    </div> : null}
    {phase === 'error' ? <div className="ba400-loading ba400-load-error" role="alert">
      <strong>No se pudo abrir el visor</strong><p>{error}</p>
      <span>El resultado diagnóstico se conserva.</span>
      <button type="button" onClick={() => { clearBa400ModelCache(); setPhase('loading'); setProgress(0); setAttempt(n => n + 1); }}>Reintentar carga</button>
    </div> : null}
  </>;
}
