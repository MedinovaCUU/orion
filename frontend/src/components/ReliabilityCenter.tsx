import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { PanelLoader } from './OrionLoader';
import { fetchReliabilityLab, LabUnavailableError } from './reliabilityApi';
import { ANALYZERS, analyze, buildModel, defaultSettings, timestampDay, type LabPayload, type LabSettings } from './reliabilityAnalytics';
import { openReliabilityReport } from './reliabilityReport';
import { Segmented } from './ReliabilityPanels';
import ReliabilityCapture from './ReliabilityCapture';
import { ComponentsView, DecisionView, DoseView, LifelineView, MethodView, SummaryView, SurvivalView } from './ReliabilityViews';
import './ReliabilityCenter.css';

// ORION | Reliability Intelligence — evaluates each reconditioning with exposure-adjusted rates, survival curves and
// documented decisions. Admin only (the RPC enforces it too).
type Section = 'resumen' | 'supervivencia' | 'piezas' | 'componentes' | 'vida' | 'registro' | 'decision' | 'metodo';
const SECTIONS: Array<[Section, string, string]> = [
  ['resumen', 'Resumen ejecutivo', 'Veredictos e indicadores'], ['supervivencia', 'Supervivencia', 'Kaplan–Meier, Weibull, MCF'],
  ['piezas', 'Piezas y confiabilidad', 'Inversión vs fallas'], ['componentes', 'Componentes', 'Pareto, mapa y matriz'],
  ['vida', 'Línea de vida', 'Expediente por equipo'], ['registro', 'Registro', 'Decisiones y liberación'],
  ['decision', 'Decisión y costos', 'Costo de ahorrar y escenarios'], ['metodo', 'Método y datos', 'Definiciones y límites'],
];

export default function ReliabilityCenter({ initialPayload }: { initialPayload?: LabPayload }) {
  const [authorized, setAuthorized] = useState<boolean | null>(initialPayload ? true : null);
  useEffect(() => {
    if (initialPayload) return;
    let active = true;
    void supabase.rpc('is_admin').then(({ data, error }) => { if (active) setAuthorized(!error && data === true); });
    return () => { active = false; };
  }, [initialPayload]);
  if (authorized !== true) return <p role="status" className="rel-gate">{authorized === null ? 'Verificando acceso…' : 'La inteligencia de reacondicionamientos es exclusiva para administradores.'}</p>;
  return <ReliabilityLab initialPayload={initialPayload} />;
}

function ReliabilityLab({ initialPayload }: { initialPayload?: LabPayload }) {
  const [payload, setPayload] = useState<LabPayload | null>(initialPayload ?? null);
  const [error, setError] = useState<{ message: string; missing: boolean } | null>(null);
  const [loading, setLoading] = useState(!initialPayload);
  const load = useCallback(async () => {
    if (initialPayload) return;
    setLoading(true);
    try { setPayload(await fetchReliabilityLab()); setError(null); }
    catch (cause) { setError({ message: (cause as Error).message, missing: cause instanceof LabUnavailableError }); }
    finally { setLoading(false); }
  }, [initialPayload]);
  useEffect(() => { void load(); }, [load]);

  const [settings, setSettings] = useState<LabSettings>(defaultSettings);
  const [section, setSection] = useState<Section>('resumen');
  const [selected, setSelected] = useState<string | null>(null);
  const [episodeId, setEpisodeId] = useState<string | null>(null);
  const [reportError, setReportError] = useState('');
  const cutDay = useMemo(() => timestampDay(new Date().toISOString())!, []);
  const model = useMemo(() => (payload ? buildModel(payload, { cutDay }) : null), [payload, cutDay]);
  const analysis = useMemo(() => (model ? analyze(model, settings) : null), [model, settings]);
  const platforms = useMemo(() => {
    const present = new Set(model?.episodes.map(e => e.platform).filter((p): p is string => !!p));
    return [...ANALYZERS.filter(p => present.has(p)), ...[...present].filter(p => !ANALYZERS.includes(p)).sort()];
  }, [model]);
  const years = useMemo(() => [...new Set(model?.units.map(u => new Date(u.t0 * 86400000).getUTCFullYear()) || [])].sort(), [model]);
  const togglePlatform = (platform: string) => setSettings(s => {
    const current = s.platforms ?? platforms; const next = current.includes(platform) ? current.filter(p => p !== platform) : [...current, platform];
    return { ...s, platforms: next.length ? next : current };
  });
  const select = (id: string | null) => { setSelected(id); if (id) setSection('vida'); };
  const capture = (id: string) => { setEpisodeId(id); setSection('registro'); };
  const report = () => { if (!analysis || !model || !payload) return; setReportError(''); openReliabilityReport(analysis, model, payload.generated_at).catch(cause => setReportError((cause as Error).message)); };

  return <section className="rel-center" aria-label="Inteligencia de reacondicionamientos">
    <header className="rel-header">
      <div><span className="rel-eyebrow">ORION / RELIABILITY INTELLIGENCE</span><h2>Inteligencia de reacondicionamientos</h2>
        <p>Cada reacondicionamiento, su evidencia. Cada conclusión, su intervalo de confianza.</p></div>
      <div className="rel-header-actions">
        {payload && <span className="rel-live">Datos al {new Date(payload.generated_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</span>}
        <button type="button" onClick={() => void load()} disabled={loading}>{loading ? 'Consultando…' : 'Actualizar'}</button>
        <button type="button" className="rel-brand" onClick={report} disabled={!analysis}>Informe PDF</button>
      </div>
    </header>
    {reportError && <p role="alert" className="rel-error">{reportError}</p>}
    {error ? <div className="rel-empty"><strong>{error.missing ? 'Módulo pendiente de activar' : 'No se pudo consultar el laboratorio'}</strong><p>{error.message}</p></div>
      : !analysis || !model ? <PanelLoader eyebrow="Confiabilidad" title="Reuniendo reacondicionamientos" subtitle="Servicios de campo, piezas y tickets de soporte" />
        : <>
          <div className="rel-controls" role="group" aria-label="Filtros del análisis">
            <div><span>Horizonte</span><Segmented label="Horizonte" value={settings.horizon} onChange={horizon => setSettings(s => ({ ...s, horizon }))} options={[[30, '30 d'], [90, '90 d'], [180, '180 d'], [365, '365 d']]} /></div>
            <div><span>Falla</span><Segmented label="Definición de falla" value={settings.failureKinds.join('+')} onChange={v => setSettings(s => ({ ...s, failureKinds: v.split('+') }))}
              options={[['correctivo', 'Correctivo'], ['correctivo+visita', 'Correctivo o visita']]} /></div>
            <div><span>Modelos</span><div className="rel-chips">{platforms.map(p => <button key={p} type="button" aria-pressed={(settings.platforms ?? platforms).includes(p)} onClick={() => togglePlatform(p)}>{p}</button>)}</div></div>
            <label><span>Umbral de piezas</span><input type="number" min={1} max={12} value={settings.partsThreshold} onChange={e => setSettings(s => ({ ...s, partsThreshold: Math.min(12, Math.max(1, Number(e.target.value) || 1)) }))} /></label>
            <label><span>Entregas desde</span><select value={settings.fromYear ?? ''} onChange={e => setSettings(s => ({ ...s, fromYear: e.target.value ? Number(e.target.value) : null }))}><option value="">Todo el historial</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select></label>
            <label className="rel-check"><input type="checkbox" checked={settings.includeInternal} onChange={e => setSettings(s => ({ ...s, includeInternal: e.target.checked }))} /> Incluir destinos internos</label>
          </div>
          <nav className="rel-sections" aria-label="Secciones">{SECTIONS.map(([key, label, hint]) => <button key={key} type="button" aria-pressed={section === key} onClick={() => setSection(key)}><strong>{label}</strong><small>{hint}</small></button>)}</nav>
          <div className="rel-body">
            {section === 'resumen' && <SummaryView a={analysis} onSection={s => setSection(s as Section)} />}
            {section === 'supervivencia' && <SurvivalView a={analysis} />}
            {section === 'piezas' && <DoseView a={analysis} model={model} onSelect={select} />}
            {section === 'componentes' && <ComponentsView a={analysis} model={model} />}
            {section === 'vida' && <LifelineView a={analysis} model={model} selected={selected} onSelect={setSelected} onCapture={capture} />}
            {section === 'registro' && <ReliabilityCapture model={model} episodeId={episodeId} onEpisode={setEpisodeId} onSaved={load} />}
            {section === 'decision' && <DecisionView a={analysis} model={model} />}
            {section === 'metodo' && <MethodView a={analysis} />}
          </div>
        </>}
  </section>;
}
