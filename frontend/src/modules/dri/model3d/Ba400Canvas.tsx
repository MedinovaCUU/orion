import modelInfo from './ba400Model.generated.json';
import { useEffect, useRef, useState } from 'react';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createBa400Scene, disposeModel } from './ba400Scene';
import type { Ba400View } from './ba400Scene';
import { clearBa400ModelCache, subscribeModelProgress } from './ba400ModelCache';
import { acquireBa400Model, releaseBa400Model } from './ba400PreparedModel';
import { OrionLoader } from '../../../components/OrionLoader';

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
    let model: GLTF | null = null;
    const unsubscribe = subscribeModelProgress(setProgress);
    // Devuelve la reserva del modelo residente y libera la escena; el modelo solo se destruye si este visor es su único dueño.
    const teardown = () => {
      const retainModel = model ? releaseBa400Model(model) : false;
      if (sceneRef.current) { sceneRef.current.dispose({ retainModel }); sceneRef.current = null; }
      else if (model && !retainModel) disposeModel(model.scene);
      model = null;
    };
    const fail = (message: string) => {
      if (!active) return;
      teardown();
      setError(message); setPhase('error'); latest.current.onReady(false);
    };
    void (async () => {
      try {
        // Fases medibles con performance.measure('ba400:acquire' | 'ba400:scene' | 'ba400:view').
        performance.mark('ba400:acquire:start');
        const gltf = await acquireBa400Model();
        performance.measure('ba400:acquire', 'ba400:acquire:start');
        if (!active || !hostRef.current) { if (!releaseBa400Model(gltf)) disposeModel(gltf.scene); return; }
        model = gltf;
        setPhase('preparing');
        performance.mark('ba400:scene:start');
        sceneRef.current = createBa400Scene(hostRef.current, gltf, id => latest.current.onPick(id), fail);
        performance.measure('ba400:scene', 'ba400:scene:start');
        performance.mark('ba400:view:start');
        sceneRef.current.setView(latest.current.view);
        performance.measure('ba400:view', 'ba400:view:start');
        setPhase('ready'); latest.current.onReady(true);
      } catch (cause) {
        fail(cause instanceof Error ? cause.message : 'No se pudo abrir el modelo 3D.');
      }
    })();
    return () => {
      active = false; unsubscribe();
      teardown();
    };
  }, [attempt]);
  return <>
    <div ref={hostRef} className="ba400-canvas" data-testid="ba400-canvas" data-state={phase} />
    {phase === 'loading' || phase === 'preparing' ? <div className="ba400-loading" role="status">
      <OrionLoader size={84} />
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
