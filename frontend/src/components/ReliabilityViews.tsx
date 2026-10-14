import { useMemo, useState } from 'react';
import {
  cohortLabels, formatDay, kindLabels, levelLabels, relationLabels, simulateScenarios, stopLabels, toDay,
  type Analysis, type CohortSummary, type FollowUp, type LabModel, type Level,
} from './reliabilityAnalytics';
import { poissonRate, quantile } from './reliabilityStats';
import {
  COLORS, doseScatterOption, forestOption, heatOption, histogramOption, kmOption, lifelineOption, mcfOption, paretoOption, sankeyOption, waterfallOption,
  weibullPlotOption, type DoseMetric, type ForestRow,
} from './reliabilityCharts';
import { EmptyState, KpiCard, LevelBadge, Panel, Segmented, StatLine } from './ReliabilityPanels';
import { moneyText, numText, pctText, propCi, rateCi } from './reliabilityFormat';

const cohortColor = (c: keyof typeof cohortLabels) => COLORS[c];
const years = (days: number) => days / 365.25;
const period = (a: Analysis) => `Entregas desde ${a.quality.firstYearStart} (primera instalación) o desde el reacondicionamiento registrado; seguimiento hasta ${a.settings.horizon} días o el corte.`;
const failureName = (a: Analysis) => (a.settings.failureKinds.includes('visita') ? 'correctivo o visita' : 'correctivo');

// ── Resumen ejecutivo ─────────────────────────────────────────────────────────────────────────────────────────
export function SummaryView({ a, onSection }: { a: Analysis; onSection: (section: string) => void }) {
  const e90 = a.early.find(w => w.days === 90) || null; const e30 = a.early.find(w => w.days === 30) || null;
  const s90 = (s: CohortSummary) => s.milestones.find(m => m.t === 90)?.step ?? null;
  const headline = ['tasa', 'temprana', 'soporte', 'piezas'].map(id => a.findings.find(f => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f);
  const adverse = (id: string) => id === 'piezas' ? (a.dose.rrMH?.ratio ?? 1) > 1 : id === 'tasa' ? (a.comparison.rr?.ratio ?? 1) > 1
    : id === 'soporte' ? (a.comparison.tickets.rr?.ratio ?? 1) > 1 : (e90?.diff?.d ?? 0) > 0;
  return <>
    <div className="rel-verdicts">{headline.map(f => <article key={f.id} className="rel-verdict">
      <LevelBadge level={f.level} adverse={adverse(f.id)} /><h4>{f.question}</h4><p>{f.answer}</p>
    </article>)}</div>
    <div className="rel-kpis">
      <KpiCard label={`Falla temprana (≤ ${e90 ? 90 : e30?.days ?? 30} días)`} value={pctText((e90 || e30)?.recon?.p)} sub={propCi((e90 || e30)?.recon ?? null)}
        compare={<>Primera instalación: <b>{pctText((e90 || e30)?.first?.p)}</b> · {propCi((e90 || e30)?.first ?? null)}</>} quality="confirmado"
        method={{ formula: `Equipos con ≥ 1 ${failureName(a)} antes del día ${e90 ? 90 : 30} ÷ equipos con esa ventana completa o con falla dentro de ella`, unit: 'Proporción de equipos (intervalo de Wilson)', denominator: 'Equipos reacondicionados entregados', period: period(a), missing: 'Equipos sin ventana completa y sin falla se excluyen, no se suponen sanos.' }} />
      <KpiCard label="Supervivencia a 90 días" value={pctText(s90(a.recon)?.s)} sub={s90(a.recon) ? `IC 95 % ${pctText(s90(a.recon)!.low)}–${pctText(s90(a.recon)!.high)}` : 'Seguimiento insuficiente'}
        compare={<>Primera instalación: <b>{pctText(s90(a.first)?.s)}</b></>} quality="confirmado"
        method={{ formula: 'Kaplan–Meier: Π (1 − fallas/en riesgo) hasta el día 90', unit: 'Probabilidad de seguir sin falla', denominator: 'Equipos en riesgo en cada día (censura al corte, al retiro o al siguiente reacondicionamiento)', period: period(a), missing: 'Censura a la derecha; nunca se extrapola más allá del último día observado.' }} />
      <KpiCard label="Correctivos por equipo-año" value={numText(a.recon.rate?.rate)} sub={rateCi(a.recon.rate)} compare={<>Primera instalación: <b>{numText(a.first.rate?.rate)}</b> · {rateCi(a.first.rate)}</>} quality="confirmado"
        method={{ formula: 'λ = fallas ÷ exposición', unit: 'Eventos por equipo-año CALENDARIO (no horas de operación)', denominator: 'Suma de días observados de cada equipo ÷ 365.25', period: period(a), missing: 'Intervalo exacto de Poisson (Garwood). Se cuentan eventos, no equipos.' }} />
      <KpiCard label="Tiempo calendario entre fallas" value={a.recon.mtbfDays ? `${numText(a.recon.mtbfDays.value, 0)} d` : '—'} sub={a.recon.mtbfDays ? `IC 95 % ${numText(a.recon.mtbfDays.low, 0)}–${Number.isFinite(a.recon.mtbfDays.high) ? numText(a.recon.mtbfDays.high, 0) : '∞'} d` : 'Sin fallas'}
        compare={<>Primera instalación: <b>{a.first.mtbfDays ? `${numText(a.first.mtbfDays.value, 0)} d` : '—'}</b></>} quality="parcial"
        method={{ formula: 'MTBF calendario = días de exposición ÷ fallas = 365.25 ÷ λ', unit: 'Días calendario (no son horas de operación: Orion no las registra)', denominator: 'Fallas en el seguimiento', period: period(a), missing: 'No equivale al MTBF de ingeniería basado en horas de funcionamiento.' }} />
      <KpiCard label="Reintervención ≤ 30 días" value={pctText(a.repeat.recon?.p)} sub={propCi(a.repeat.recon)} compare={<>Primera instalación: <b>{pctText(a.repeat.first?.p)}</b> · Primera solución definitiva {pctText(a.repeat.recon ? 1 - a.repeat.recon.p : null)}</>} quality="confirmado"
        method={{ formula: 'Correctivos seguidos de otro correctivo del mismo equipo en ≤ 30 días ÷ correctivos con esos 30 días observados', unit: 'Proporción de intervenciones', denominator: 'Correctivos en el seguimiento', period: period(a), missing: 'El último correctivo sin 30 días observados se excluye.' }} />
      <KpiCard label="Duración registrada de correctivos" value={a.duration.recon.median !== null ? `${numText(a.duration.recon.median / 60, 1)} h` : '—'} sub={`Mediana · P90 ${a.duration.recon.p90 !== null ? `${numText(a.duration.recon.p90 / 60, 1)} h` : '—'} · ${a.duration.recon.n} servicios`}
        compare={<>Primera instalación: <b>{a.duration.first.median !== null ? `${numText(a.duration.first.median / 60, 1)} h` : '—'}</b></>} quality="parcial"
        method={{ formula: 'Mediana de la duración capturada en el reporte de cada correctivo', unit: 'Horas de intervención registradas', denominator: 'Correctivos con duración capturada', period: period(a), missing: 'No separa diagnóstico, espera de piezas, traslado ni verificación: NO es MTTR ni indisponibilidad.' }} />
      <KpiCard label="Piezas posteriores no cambiadas al reacondicionar" value={pctText(a.componentTotals.share?.p)} sub={propCi(a.componentTotals.share)} compare={<>{a.componentTotals.kitNotReplaced} del kit habitual del modelo · {a.componentTotals.within90} en los primeros 90 días</>} quality="confirmado" tone="risk"
        method={{ formula: 'Líneas de piezas sustituidas en correctivos posteriores cuyo código no se cambió en el reacondicionamiento ÷ líneas sustituidas', unit: 'Proporción de líneas de piezas', denominator: 'Piezas con código en correctivos posteriores a la entrega', period: period(a), missing: 'Piezas sin código se excluyen. No implica causalidad.' }} />
      <KpiCard label="Tickets de soporte por equipo-año" value={numText(a.recon.tickets?.rate)} sub={rateCi(a.recon.tickets)} compare={<>Primera instalación: <b>{numText(a.first.tickets?.rate)}</b></>} quality="confirmado"
        method={{ formula: 'Tickets de soporte con la serie del equipo ÷ exposición', unit: 'Tickets por equipo-año calendario', denominator: 'Mismos días observados que las fallas', period: period(a), missing: 'Solo tickets con serie registrada; excluye planeación.' }} />
      <KpiCard label="Recomendaciones técnicas rechazadas" value={a.trd.rate ? pctText(a.trd.rate.p) : '—'} sub={a.trd.recommended ? `${a.trd.rejected + a.trd.postponed} de ${a.trd.recommended} recomendaciones` : 'Se registran en «Registro»'} quality={a.trd.recommended ? 'confirmado' : 'sin_datos'}
        method={{ formula: '(Rechazadas + pospuestas) ÷ recomendaciones con decisión', unit: 'Proporción de recomendaciones', denominator: 'Recomendaciones de sustituir o reparar con autorización registrada', period: 'Episodios con registro', missing: 'Las pendientes de decisión no entran al denominador.' }} />
      <KpiCard label="Liberación sin retrabajo (first-pass yield)" value={a.quality.tests ? '—' : '—'} sub={a.quality.tests ? `${a.quality.tests} pruebas registradas` : 'Requiere pruebas de liberación registradas'} quality={a.quality.tests ? 'parcial' : 'sin_datos'}
        method={{ formula: 'Episodios liberados con todas las pruebas aprobadas al primer intento ÷ episodios liberados', unit: 'Proporción de episodios', denominator: 'Episodios con matriz de liberación', period: 'Episodios con registro', missing: 'Una prueba sin criterio documentado queda «pendiente de definición» y no cuenta como aprobada.' }} />
      <KpiCard label="Costo de la no calidad (COPQ)" value={a.costs.total ? moneyText(a.costs.total) : '—'} sub={a.costs.total ? `Comprobado ${moneyText(a.costs.proven)} · estimado ${moneyText(a.costs.estimated)}` : 'Sin costos capturados'} quality={a.costs.total ? 'parcial' : 'sin_datos'}
        method={{ formula: 'Σ costos de correctivos, retrabajos y logística posteriores a la entrega', unit: 'MXN', denominator: '—', period: 'Costos registrados', missing: 'Comprobados y estimados se muestran por separado; el daño reputacional no se monetiza.' }} />
      <KpiCard label="Disponibilidad técnica" value="—" sub="Orion no registra horas fuera de servicio" quality="sin_datos"
        method={{ formula: 'Tiempo operativo ÷ (tiempo operativo + indisponibilidad)', unit: 'Proporción de tiempo', denominator: 'Tiempo calendario de cada instalación', period: '—', missing: 'Requiere registrar inicio y fin de cada paro.' }} />
    </div>
    <section className="rel-block">
      <header><h3>Preguntas estratégicas</h3><span>Respuestas generadas por reglas a partir de los resultados calculados; sin IA generativa ni cifras inventadas.</span></header>
      <ol className="rel-findings">{a.findings.map(f => <li key={f.id}>
        <div><LevelBadge level={f.level} adverse={adverse(f.id)} />{f.exploratory && <span className="rel-chip">Exploratorio</span>}</div>
        <h4>{f.question}</h4><p>{f.answer}</p>{f.detail && <small>{f.detail}</small>}
      </li>)}</ol>
    </section>
    <section className="rel-block">
      <header><h3>Comparabilidad de las poblaciones</h3><span>Antes de comparar hay que ver si se parecen. El ajuste estadístico solo controla el modelo.</span></header>
      <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Cohorte</th><th>Equipos</th><th>Gobierno</th><th>Particular</th><th>Sin sector</th><th>Modelos</th></tr></thead><tbody>
        {(['reacondicionado', 'primera_instalacion', 'reinstalado'] as const).map(c => { const s = a.comparability.sector[c]; const total = Object.values(s).reduce((x, y) => x + y, 0);
          return <tr key={c}><td><span className="rel-dot" style={{ background: cohortColor(c) }} />{cohortLabels[c]}</td><td>{total}</td><td>{pctText(total ? (s.gobierno || 0) / total : null)}</td><td>{pctText(total ? (s.particular || 0) / total : null)}</td><td>{pctText(total ? (s.sin_dato || 0) / total : null)}</td>
            <td>{Object.entries(a.comparability.platforms[c]).sort((x, y) => y[1] - x[1]).map(([p, n]) => `${p} ${n}`).join(' · ')}</td></tr>; })}
      </tbody></table></div>
      <p className="rel-note">Antes del reacondicionamiento, los mismos equipos tenían {numText(a.comparability.priorFailureRate?.rate)} correctivos por equipo-año ({rateCi(a.comparability.priorFailureRate)}) en los 365 días previos con historial.
        Distribuidores que atienden sus propios equipos registran menos correctivos en Orion: si un grupo tiene más equipos en distribuidores, su tasa parece menor.</p>
      <button type="button" className="rel-link" onClick={() => onSection('metodo')}>Ver método, calidad de datos y limitaciones →</button>
    </section>
  </>;
}

// ── Supervivencia ─────────────────────────────────────────────────────────────────────────────────────────────
export function SurvivalView({ a }: { a: Analysis }) {
  const [showReinstall, setShowReinstall] = useState(false);
  const groups = showReinstall ? [a.recon, a.first, a.reinstall] : [a.recon, a.first];
  const option = useMemo(() => kmOption((showReinstall ? [a.recon, a.first, a.reinstall] : [a.recon, a.first]).map(g => ({ name: cohortLabels[g.cohort], color: cohortColor(g.cohort), curve: g.km })), a.settings.horizon), [a, showReinstall]);
  const wOption = useMemo(() => weibullPlotOption([a.recon, a.first].map(g => ({ name: cohortLabels[g.cohort], color: cohortColor(g.cohort), curve: g.km, beta: g.weibull?.beta, eta: g.weibull?.eta }))), [a]);
  const mOption = useMemo(() => mcfOption([a.recon, a.first].map(g => ({ name: cohortLabels[g.cohort], color: cohortColor(g.cohort), points: g.mcf.points, band: g.mcfBand })), a.settings.horizon), [a]);
  const c = a.comparison;
  return <>
    <Panel wide title="Probabilidad de seguir sin falla después de la entrega" file="ORION_supervivencia_reacondicionados" label="Curvas de Kaplan–Meier por cohorte" height={340}
      note={`Kaplan–Meier con banda de confianza del 95 % (log −log). Evento: primer ${failureName(a)}. Marcas verticales: equipos censurados. Cada curva termina en su último día observado.`}
      option={option} tools={<label className="rel-check"><input type="checkbox" checked={showReinstall} onChange={e => setShowReinstall(e.target.checked)} /> Reinstalados</label>}>
      <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Cohorte</th>{groups[0].milestones.map(m => <th key={m.t}>Día {m.t}</th>)}<th>Mediana</th></tr></thead><tbody>
        {groups.map(g => <tr key={g.cohort}><td><span className="rel-dot" style={{ background: cohortColor(g.cohort) }} />{cohortLabels[g.cohort]}</td>
          {g.milestones.map(m => <td key={m.t}>{m.step ? <><b>{pctText(m.step.s)}</b><small>{pctText(m.step.low)}–{pctText(m.step.high)}</small></> : <small>Sin estimación</small>}<small>{m.atRisk} en riesgo</small></td>)}
          <td>{g.median !== null ? `${g.median} d` : 'No alcanzada'}</td></tr>)}
      </tbody></table></div>
      <StatLine items={[
        ['Log-rank', c.logrank ? `χ² ${numText(c.logrank.chi2)} · p ${numText(c.logrank.p, 3)}` : '—'],
        ['Log-rank estratificado por modelo', c.logrankStrat ? `χ² ${numText(c.logrankStrat.chi2)} · p ${numText(c.logrankStrat.p, 3)}` : '—'],
        ['Cox (Efron), estratificado por modelo', c.coxStrat ? `HR ${numText(c.coxStrat.hr[0])} · IC 95 % ${numText(c.coxStrat.low[0])}–${numText(c.coxStrat.high[0])}` : 'Sin estimación finita'],
        ['Eventos', `${a.recon.events} / ${a.recon.units} reacondicionados · ${a.first.events} / ${a.first.units} primera instalación`],
        ['Nivel de evidencia', levelLabels[c.survivalLevel]],
      ]} />
    </Panel>
    <div className="rel-grid">
      <Panel title="Análisis Weibull del tiempo hasta la primera falla" file="ORION_weibull" label="Gráfica de probabilidad Weibull" option={wOption}
        note="Puntos: Kaplan–Meier en escala Weibull. Línea: ajuste por máxima verosimilitud con censura. Una recta indica que el modelo describe los datos.">
        <WeibullTable groups={[a.recon, a.first]} />
      </Panel>
      <Panel title="Fallas recurrentes: función media acumulada" file="ORION_mcf" label="Función media acumulada de correctivos" option={mOption}
        note="Correctivos acumulados por equipo (estimador de Nelson). Barras: bootstrap 95 % por equipo. Se corta donde quedan menos de 5 equipos en observación.">
        <StatLine items={[['Reacondicionados', `${a.recon.failures} correctivos en ${numText(a.recon.exposureYears, 1)} eq-año`], ['Primera instalación', `${a.first.failures} correctivos en ${numText(a.first.exposureYears, 1)} eq-año`]]} />
      </Panel>
    </div>
  </>;
}
function WeibullTable({ groups }: { groups: CohortSummary[] }) {
  return <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Cohorte</th><th>β (forma)</th><th>η (escala)</th><th>β = 1 (exponencial)</th><th>Ajuste</th><th>Lectura</th></tr></thead><tbody>
    {groups.map(g => { const w = g.weibull;
      if (!w) return <tr key={g.cohort}><td>{cohortLabels[g.cohort]}</td><td colSpan={5}>{levelLabels.insuficiente} ({g.events} eventos; se requieren 10)</td></tr>;
      const adequate = w.insideBand >= 0.9 && w.maxGap <= 0.1;
      const reading = !adequate ? 'Ajuste no adecuado: β no se interpreta' : w.betaHigh !== null && w.betaHigh < 1 ? 'Riesgo decreciente: dominan las fallas tempranas' : w.betaLow !== null && w.betaLow > 1 ? 'Riesgo creciente (no prueba desgaste por sí solo)' : 'Riesgo constante no descartado';
      return <tr key={g.cohort}><td><span className="rel-dot" style={{ background: COLORS[g.cohort] }} />{cohortLabels[g.cohort]}</td><td><b>{numText(w.beta)}</b><small>{w.betaLow !== null ? numText(w.betaLow) : '—'}–{w.betaHigh !== null ? numText(w.betaHigh) : '—'}</small></td>
        <td>{numText(w.eta, 0)} d</td><td>p {numText(w.pExponential, 3)}</td><td>{pctText(w.insideBand)} dentro de la banda KM · desvío máx. {pctText(w.maxGap, 1)}</td><td>{reading}</td></tr>; })}
  </tbody></table></div>;
}

// ── Piezas y confiabilidad ────────────────────────────────────────────────────────────────────────────────────
export function DoseView({ a, model, onSelect }: { a: Analysis; model: LabModel; onSelect: (unitId: string) => void }) {
  const [metric, setMetric] = useState<DoseMetric>('rate');
  const scatter = useMemo(() => doseScatterOption(a.points, a.settings.partsThreshold, metric), [a, metric]);
  const bucketOption = useMemo(() => {
    const buckets: Array<[string, (n: number) => boolean, boolean]> = [['0 piezas', n => n === 0, true], ['1 pieza', n => n === 1, true], ['2 piezas', n => n === 2, true], ['3–4 piezas', n => n >= 3 && n <= 4, false], ['5 o más', n => n >= 5, false]];
    const rows = buckets.map(([label, test, low]): ForestRow | null => {
      const list = a.points.filter(p => test(p.episode.partsQty));
      const r = poissonRate(list.reduce((s, p) => s + p.follow.failures.length, 0), years(list.reduce((s, p) => s + p.follow.fu, 0)));
      return r ? { label: `${label} · ${list.length} eq.`, value: r.rate, low: r.low, high: r.high, color: low ? COLORS.low : COLORS.high, detail: `${r.events} correctivos en ${numText(r.exposure, 1)} equipos-año` } : null;
    }).filter((r): r is ForestRow => r !== null);
    return forestOption(rows, { axisName: 'Correctivos por equipo-año (IC 95 % exacto)' });
  }, [a]);
  const d = a.dose;
  const km = useMemo(() => kmOption([{ name: a.dose.low.label, color: COLORS.low, curve: a.dose.low.km }, { name: a.dose.high.label, color: COLORS.high, curve: a.dose.high.km }], a.settings.horizon), [a]);
  const caveated = model.episodes.filter(e => e.caveats.length && (!a.settings.platforms || a.settings.platforms.includes(e.platform || '')));
  return <>
    <div className="rel-verdict rel-verdict--inline"><LevelBadge level={d.level} adverse={(d.rrMH?.ratio ?? 1) > 1} /><p>{a.findings.find(f => f.id === 'piezas')?.answer}</p></div>
    <Panel wide title="Inversión en piezas frente a confiabilidad posterior" file="ORION_piezas_vs_confiabilidad" label="Dispersión de piezas sustituidas contra fallas posteriores" height={360}
      note={`Cada punto es un reacondicionamiento entregado. Color: grupo de piezas; forma: modelo (● A15, ○ A15C, ■ A25, ▲ BA200, ◆ BA400). ${metric === 'rate' ? 'Solo equipos con ≥ 90 días observados (una falla en pocos días inflaría la tasa).' : ''} Haz clic en un punto para abrir su expediente.`}
      option={scatter} handlers={{ click: event => { const p = (event.data as { p?: { follow: FollowUp } })?.p; if (p) onSelect(p.follow.unit.id); } }}
      tools={<Segmented label="Métrica" value={metric} onChange={setMetric} options={[['rate', 'Tasa anual'], ['count', 'Correctivos'], ['first', 'Días a 1.ª falla']]} />} />
    <div className="rel-grid">
      <Panel title="Tasa de correctivos por cantidad de piezas" file="ORION_tasa_por_piezas" label="Tasa por grupo de piezas con intervalo" option={bucketOption} height={260}
        note="Gradiente dosis–respuesta: si menos piezas se asocia con más fallas, las tasas bajan de arriba hacia abajo." />
      <Panel title="Supervivencia por grupo de piezas" file="ORION_supervivencia_por_piezas" label="Kaplan–Meier por grupo de piezas" option={km} height={260}
        note={`Umbral: ${a.settings.partsThreshold} piezas (configurable arriba).`} />
    </div>
    <section className="rel-block">
      <header><h3>Contraste estadístico</h3><span>Ajustado por modelo; robusto a fallas repetidas del mismo equipo.</span></header>
      <StatLine items={[
        [d.low.label, `${rateCi(d.low.rate)} · ${d.low.follow.length} equipos · mediana ${numText(d.low.medianParts, 0)} piezas`],
        [d.high.label, `${rateCi(d.high.rate)} · ${d.high.follow.length} equipos · mediana ${numText(d.high.medianParts, 0)} piezas`],
        ['Razón de tasas cruda', d.rr ? `${numText(d.rr.ratio)} · IC 95 % ${numText(d.rr.low)}–${numText(d.rr.high)}` : '—'],
        ['Mantel–Haenszel por modelo', d.rrMH ? `${numText(d.rrMH.ratio)} · IC 95 % ${numText(d.rrMH.low)}–${numText(d.rrMH.high)} · p ${numText(d.rrMH.p, 3)}` : '—'],
        ['Permutación dentro de cada modelo', d.permutation ? `p ${numText(d.permutation.p, 3)} (una cola, ${d.permutation.permutations} permutaciones)` : '—'],
        ['Cox estratificado (1.ª falla)', d.coxStrat ? `HR ${numText(d.coxStrat.hr[0])} · IC 95 % ${numText(d.coxStrat.low[0])}–${numText(d.coxStrat.high[0])}` : '—'],
        ['Spearman piezas ↔ tasa (exploratorio)', d.spearman ? `ρ ${numText(d.spearman.rho)} · p ${numText(d.spearman.p, 3)} · n ${d.spearman.n}` : '—'],
      ]} />
      <div className="rel-table-scroll"><table className="rel-table rel-table--compact"><thead><tr><th>Modelo</th><th>{d.low.label}</th><th>{d.high.label}</th></tr></thead><tbody>
        {d.byPlatform.map(p => <tr key={p.platform}><td>{p.platform}</td><td>{p.low ? `${numText(p.low.rate)} (${p.nLow} eq.)` : `— (${p.nLow} eq.)`}</td><td>{p.high ? `${numText(p.high.rate)} (${p.nHigh} eq.)` : `— (${p.nHigh} eq.)`}</td></tr>)}
      </tbody></table></div>
      <p className="rel-note">Confusión posible: un equipo en peor estado puede recibir más piezas y aun así fallar más (sesgo hacia «sin diferencia»), o los equipos con pocas piezas pueden ir a clientes de mayor uso. Para separar causa de asociación se necesita registrar la condición inicial y las recomendaciones (pestaña «Registro»).</p>
    </section>
    <section className="rel-block">
      <header><h3>Kit observado por modelo</h3><span>Piezas que el taller cambia en ≥ 20 % de los reacondicionamientos de ese modelo. No es el protocolo del fabricante: se sustituye al capturar el oficial.</span></header>
      <div className="rel-kits">{[...model.kits].filter(([p]) => !a.settings.platforms || a.settings.platforms.includes(p)).map(([platform, kit]) => <article key={platform}><h4>{platform}</h4>
        {kit.length ? <ul>{kit.map(k => <li key={k.code}><b>{k.code}</b> {k.name || ''}<span>{pctText(k.share)}</span></li>)}</ul> : <p>Sin piezas recurrentes.</p>}</article>)}</div>
    </section>
    {caveated.length > 0 && <section className="rel-block">
      <header><h3>Reportes con salvedades escritas</h3><span>Frases del propio reporte de reacondicionamiento que indican un trabajo no cerrado.</span></header>
      <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Equipo</th><th>Reacondicionado</th><th>Salvedades</th><th>Después de la entrega</th></tr></thead><tbody>
        {caveated.map(e => { const unit = a.recon.follow.find(f => f.unit.episode?.id === e.id);
          return <tr key={e.id}><td><b>{e.platform}</b> · {e.serial}</td><td>{formatDay(e.start)}</td><td>{e.caveats.map(c => <span key={c} className="rel-chip rel-chip--risk">{c}</span>)}</td>
            <td>{unit ? `${unit.failures.length} correctivos en ${unit.fu} días` : e.delivery === null ? 'Sin entrega confirmada' : 'Fuera del filtro'}</td></tr>; })}
      </tbody></table></div>
    </section>}
  </>;
}

// ── Componentes ───────────────────────────────────────────────────────────────────────────────────────────────
export function ComponentsView({ a, model }: { a: Analysis; model: LabModel }) {
  const [mode, setMode] = useState<'count' | 'rate'>('rate');
  const pareto = useMemo(() => paretoOption(a.components), [a]);
  const heat = useMemo(() => heatOption(a.heat, model.catalog, mode), [a, model, mode]);
  const decisions = model.episodes.flatMap(e => e.decisions.map(d => ({ e, d })));
  if (!a.components.length) return <EmptyState title="Sin piezas sustituidas después de la entrega">Con el filtro actual ningún correctivo posterior registra piezas con código.</EmptyState>;
  return <>
    <div className="rel-grid">
      <Panel title="Pareto de piezas sustituidas después de la entrega" file="ORION_pareto_componentes" label="Pareto de componentes" option={pareto} height={320}
        note="Participación real de cada código (sin suponer 80/20) y acumulado, en el mismo eje. Azul intenso: pieza del kit habitual del modelo." />
      <Panel title="Mapa de calor por modelo" file="ORION_mapa_calor_componentes" label="Mapa de calor de componentes por modelo" option={heat} height={320}
        note={mode === 'rate' ? 'Sustituciones por 100 equipos-año de reacondicionados de cada modelo: un modelo con más equipos no parece peor solo por ser más numeroso.' : 'Conteo absoluto de sustituciones.'}
        tools={<Segmented label="Valor" value={mode} onChange={setMode} options={[['rate', 'Tasa'], ['count', 'Conteo']]} />} />
    </div>
    <section className="rel-block">
      <header><h3>Matriz de componentes que fallaron después de la entrega</h3><span>{a.componentTotals.lines} sustituciones · {a.componentTotals.notReplaced} con código no cambiado en el reacondicionamiento</span></header>
      <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Código</th><th>Descripción</th><th>Equipos</th><th>Sustituciones</th><th>¿Se cambió al reacondicionar?</th><th>Kit habitual</th><th>Mediana de días</th><th>Modelos</th><th>En primera instalación</th></tr></thead><tbody>
        {a.components.map(c => <tr key={c.code}><td><b>{c.code}</b></td><td>{c.name || 'Sin descripción'}</td><td>{c.units}</td><td>{c.lines}</td>
          <td>{c.replacedAtRecon ? `Sí en ${c.replacedAtRecon} de ${c.lines}` : <span className="rel-chip rel-chip--risk">No</span>}</td><td>{c.inKit ? 'Sí' : 'No'}</td>
          <td>{c.medianOffset !== null ? `${numText(c.medianOffset, 0)} d` : '—'}</td><td>{c.platforms.join(', ')}</td><td>{c.firstInstallLines}</td></tr>)}
      </tbody></table></div>
      <p className="rel-note">La relación entre una pieza no cambiada y su falla posterior queda «no determinada» hasta que un ingeniero la documente con evidencia en «Registro» (mismo componente, subsistema relacionado o sin relación).</p>
    </section>
    <section className="rel-block">
      <header><h3>Decisiones por componente</h3><span>Condición → recomendación → autorización → acción → resultado posterior.</span></header>
      {decisions.length ? <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Equipo</th><th>Componente</th><th>Condición</th><th>Recomendación</th><th>Autorización</th><th>Acción</th><th>Resultado posterior</th></tr></thead><tbody>
        {decisions.map(({ e, d }) => { const link = e.links.find(l => l.decision_id === d.id);
          return <tr key={d.id}><td>{e.platform} · {e.serial}</td><td><b>{d.component_code || ''}</b> {d.component_name}</td><td>{d.condition.replace(/_/g, ' ')}</td><td>{d.recommendation}</td>
            <td>{d.authorization_status}{d.authorization_reason ? ` · ${d.authorization_reason.replace(/_/g, ' ')}` : ''}</td><td>{d.action_taken}</td><td>{link ? relationLabels[link.relation] : 'Sin evaluación'}</td></tr>; })}
      </tbody></table></div> : <EmptyState title={levelLabels.sin_datos}>Ninguna recomendación ni autorización registrada todavía. Este cuadro se llena desde «Registro» y es la base del índice de recomendaciones no ejecutadas.</EmptyState>}
    </section>
  </>;
}

// ── Línea de vida y expediente ────────────────────────────────────────────────────────────────────────────────
export function LifelineView({ a, model, selected, onSelect, onCapture }: { a: Analysis; model: LabModel; selected: string | null; onSelect: (id: string | null) => void; onCapture: (episodeId: string) => void }) {
  const [cohort, setCohort] = useState<'reacondicionado' | 'primera_instalacion'>('reacondicionado');
  const follow = cohort === 'reacondicionado' ? a.recon.follow : a.first.follow;
  const option = useMemo(() => lifelineOption(follow, a.settings.horizon, selected), [follow, a.settings.horizon, selected]);
  const height = Math.max(300, Math.min(follow.length, 60) * 19 + 80);
  const current = [...a.recon.follow, ...a.first.follow, ...a.reinstall.follow].find(f => f.unit.id === selected) || null;
  const rows = [...follow].sort((x, y) => (x.first ?? 1e9) - (y.first ?? 1e9) || y.fu - x.fu);
  return <>
    <Panel wide title="Línea de vida de cada equipo después de la entrega" file="ORION_linea_de_vida" label="Línea de tiempo por equipo" option={option} height={height}
      note="Gris: reacondicionamiento (hasta 60 días antes de la entrega). ◇ Entrega. ● rojo: correctivo · ● naranja: visita · ▲ ticket de soporte. Ordenado por primera falla. Haz clic en una fila para abrir el expediente."
      handlers={{ click: event => {
        const data = event.data as unknown[];
        const index = event.componentType === 'yAxis' ? rows.findIndex(f => `${f.unit.platform || '—'} · ${f.unit.serial}` === event.value)
          : Array.isArray(data) ? (event.seriesName === 'Seguimiento' ? data[0] : data[1]) as number : -1;
        if (rows[index]) onSelect(rows[index].unit.id);
      } }}
      tools={<Segmented label="Cohorte" value={cohort} onChange={setCohort} options={[['reacondicionado', 'Reacondicionados'], ['primera_instalacion', 'Primera instalación']]} />} />
    {current ? <Dossier follow={current} model={model} onClose={() => onSelect(null)} onCapture={onCapture} /> : <p className="rel-note">Selecciona un equipo para ver su expediente técnico longitudinal.</p>}
  </>;
}
export function Dossier({ follow, model, onClose, onCapture }: { follow: FollowUp; model: LabModel; onClose: () => void; onCapture: (episodeId: string) => void }) {
  const u = follow.unit; const e = u.episode; const services = model.bySerial.get(u.serialKey) || []; const tickets = model.ticketsBySerial.get(u.serialKey) || [];
  const episodes = model.episodes.filter(x => x.serialKey === u.serialKey);
  return <section className="rel-dossier" aria-label={`Expediente ${u.serial}`}>
    <header><div><span className="rel-eyebrow">EXPEDIENTE TÉCNICO · {cohortLabels[u.cohort].toUpperCase()}</span><h3>{u.platform} · {u.serial}</h3>
      <p>{u.client || 'Destino sin registro'} · sector {u.sector.replace('_', ' ')} · entrega {formatDay(u.t0)} ({u.t0Source === 'instalacion' ? 'reporte de instalación' : 'fecha de asignación del equipo'}) · {follow.fu} días observados · {stopLabels[u.stopReason]}</p></div>
      <div className="rel-dossier-actions">{e && <button type="button" onClick={() => onCapture(e.id)}>Registrar decisiones de este episodio</button>}<button type="button" onClick={onClose}>Cerrar</button></div></header>
    {e && <div className="rel-dossier-grid">
      <article><h4>Reacondicionamiento {e.ordinal > 1 ? `n.º ${e.ordinal}` : ''}</h4><p>{formatDay(e.start)}{e.end !== e.start ? ` – ${formatDay(e.end)}` : ''} · {e.records.length} registros · {e.partsQty} piezas</p>
        {e.caveats.length > 0 && <p>{e.caveats.map(c => <span key={c} className="rel-chip rel-chip--risk">{c}</span>)}</p>}
        <ul className="rel-parts">{e.parts.map(p => <li key={p.code}><b>{p.code}</b> {p.name || ''} <span>× {p.qty}</span></li>)}</ul>
        {e.kitMissing.length > 0 && <p className="rel-note">Del kit habitual del modelo no se cambiaron: {e.kitMissing.map(code => `${code}${model.catalog[code] ? ` (${model.catalog[code]})` : ''}`).join(', ')}.</p>}
        {e.records.map(r => <blockquote key={r.id}><small>{r.ref} · {formatDay(toDay(r.day))}</small>{r.note || 'Sin texto en el reporte.'}</blockquote>)}
        <p className="rel-note">Historial previo: último servicio «{e.priorKind ? kindLabels[e.priorKind] || e.priorKind : 'sin registro'}»; {e.priorFailures365} correctivos en los 365 días anteriores.</p></article>
      <article><h4>Registro de decisiones</h4>{e.captured ? <p>Alcance {e.captured.scope.replace('_', ' ')} · liberación {e.captured.release_result.replace(/_/g, ' ')} · {e.decisions.length} componentes · {e.tests.length} pruebas · {e.costs.length} costos</p>
        : <p>Sin registro estructurado: no se sabe qué se recomendó ni qué se negó.</p>}</article>
    </div>}
    <h4>Eventos del equipo</h4>
    <ol className="rel-events">{[
      ...services.map(s => ({ day: toDay(s.day)!, kind: s.kind, title: `${kindLabels[s.kind] || s.kind} · ${s.ref}`, text: s.note, parts: s.parts, client: s.client })),
      ...tickets.map(t => ({ day: t.day, kind: 'ticket', title: `Ticket ${t.ticket.folio || ''}`, text: t.ticket.subject, parts: [] as Array<[string, number]>, client: null })),
    ].sort((x, y) => x.day - y.day).map((ev, i) => <li key={i} className={`rel-event rel-event--${ev.kind}${ev.day >= u.t0 && ev.day < u.t0 + follow.fu ? ' is-window' : ''}`}>
      <time>{formatDay(ev.day)}{ev.day >= u.t0 ? ` · día ${ev.day - u.t0}` : ''}</time><strong>{ev.title}</strong>{ev.client && <small>{ev.client}</small>}
      {ev.text && <p>{ev.text}</p>}{ev.parts.length > 0 && <p className="rel-parts-inline">{ev.parts.map(([code, qty]) => `${code}${model.catalog[code] ? ` (${model.catalog[code]})` : ''} × ${qty}`).join(' · ')}</p>}
    </li>)}</ol>
    {episodes.length > 1 && <p className="rel-note">Este equipo tiene {episodes.length} episodios de reacondicionamiento; cada uno se analiza por separado.</p>}
  </section>;
}

// ── Decisión y costos ─────────────────────────────────────────────────────────────────────────────────────────
export function DecisionView({ a, model }: { a: Analysis; model: LabModel }) {
  const correctiveParts = a.recon.follow.flatMap(f => f.failures.map(x => x.service.parts.reduce((s, [, q]) => s + (Number(q) || 0), 0)));
  const observedPerCorrective = correctiveParts.length ? correctiveParts.reduce((s, v) => s + v, 0) / correctiveParts.length : 1;
  const extraDefault = Math.max(1, Math.round((a.dose.high.medianParts ?? 3) - (a.dose.low.medianParts ?? 1)));
  const [visitCost, setVisitCost] = useState(8000); const [partCost, setPartCost] = useState(2500); const [extraParts, setExtraParts] = useState(extraDefault);
  const [perCorrective, setPerCorrective] = useState(Math.round(observedPerCorrective * 10) / 10); const [newPrice, setNewPrice] = useState<number | ''>(''); const [horizonYears, setHorizonYears] = useState(1);
  const sim = useMemo(() => simulateScenarios(a, { visitCost, partCost, partsPerCorrective: perCorrective, extraParts, newUnitPrice: newPrice === '' ? null : newPrice, years: horizonYears }),
    [a, visitCost, partCost, perCorrective, extraParts, newPrice, horizonYears]);
  const sensitivity = useMemo(() => [0.5, 1, 2].map(v => [0.5, 1, 2].map(p => simulateScenarios(a, { visitCost: visitCost * v, partCost: partCost * p, partsPerCorrective: perCorrective, extraParts, newUnitPrice: null, years: horizonYears, draws: 3000, seed: 9 }).difference?.pBCheaper ?? null)),
    [a, visitCost, partCost, perCorrective, extraParts, horizonYears]);
  const hist = useMemo(() => histogramOption(sim.difference ? sim.scenarios[0].samples.map((x, i) => x - sim.scenarios[1].samples[i]) : [], 'Costo A − costo B'), [sim]);
  const budgeted = useMemo(() => model.episodes.filter(e => e.captured && (e.captured.budget_requested_mxn !== null || e.costs.length)), [model]);
  const decisions = model.episodes.flatMap(e => e.decisions.map(d => ({ e, d })));
  const sankey = useMemo(() => {
    const flows = new Map<string, number>(); const add = (src: string, dst: string) => flows.set(`${src}→${dst}`, (flows.get(`${src}→${dst}`) || 0) + 1);
    for (const e of model.episodes) for (const d of e.decisions) {
      const cond = `Condición: ${d.condition.replace(/_/g, ' ')}`; const rec = `Recomendación: ${d.recommendation}`; const auth = `Autorización: ${d.authorization_status}`; const act = `Acción: ${d.action_taken}`;
      const link = e.links.find(l => l.decision_id === d.id); const unit = a.recon.follow.find(f => f.unit.episode?.id === e.id);
      const outcome = link ? relationLabels[link.relation] : unit ? (unit.failures.length ? 'Falla posterior (relación sin evaluar)' : unit.complete ? 'Sin falla observada' : 'Seguimiento incompleto') : 'Sin entrega en el filtro';
      add(cond, rec); add(rec, auth); add(auth, act); add(act, outcome);
    }
    return sankeyOption([...flows].map(([k, value]) => { const [source, target] = k.split('→'); return { source, target, value }; }));
  }, [a, model]);
  const [waterfallEpisode, setWaterfallEpisode] = useState<string>('');
  const wEpisode = useMemo(() => budgeted.find(e => e.id === waterfallEpisode) || budgeted[0], [budgeted, waterfallEpisode]);
  const wSteps = useMemo(() => wEpisode ? ['reacondicionamiento', 'instalacion', 'correctivo', 'preventivo', 'logistica', 'otro'].map(phase => {
    const list = wEpisode.costs.filter(c => c.phase === phase); const value = list.reduce((s, c) => s + Number(c.amount_mxn), 0);
    return { label: phase, value, nature: (list.every(c => c.nature === 'comprobado') ? 'comprobado' : list.every(c => c.nature === 'estimado') ? 'estimado' : 'mixto') as 'comprobado' | 'estimado' | 'mixto' };
  }).filter(s => s.value > 0) : [], [wEpisode]);
  const waterfall = useMemo(() => waterfallOption(wSteps), [wSteps]);
  const num = (value: number, set: (v: number) => void, label: string, step = 100) => <label>{label}<input type="number" min={0} step={step} value={value} onChange={e => set(Math.max(0, Number(e.target.value) || 0))} /></label>;
  return <>
    <section className="rel-block">
      <header><h3>Costo de ahorrar</h3><span>Presupuesto solicitado vs aprobado y lo que costó después. Observado no es lo mismo que evitable.</span></header>
      {budgeted.length ? <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Equipo</th><th>Solicitado</th><th>Aprobado</th><th>Ahorro inicial</th><th>Costos posteriores comprobados</th><th>Estimados</th><th>Ligados a recomendaciones no ejecutadas</th></tr></thead><tbody>
        {budgeted.map(e => { const after = e.costs.filter(c => e.delivery !== null && (toDay(c.occurred_on) ?? 0) >= e.delivery); const proven = after.filter(c => c.nature === 'comprobado').reduce((s, c) => s + Number(c.amount_mxn), 0);
          const est = after.filter(c => c.nature === 'estimado').reduce((s, c) => s + Number(c.amount_mxn), 0);
          const linkedServices = new Set(e.links.filter(l => (l.relation === 'mismo_componente' || l.relation === 'subsistema_relacionado') && e.decisions.some(d => d.id === l.decision_id && (d.authorization_status === 'rechazada' || d.authorization_status === 'pospuesta'))).map(l => l.failure_service_id));
          const linked = after.filter(c => c.service_id && linkedServices.has(c.service_id)).reduce((s, c) => s + Number(c.amount_mxn), 0);
          const saving = e.captured!.budget_requested_mxn !== null && e.captured!.budget_approved_mxn !== null ? e.captured!.budget_requested_mxn - e.captured!.budget_approved_mxn : null;
          return <tr key={e.id}><td>{e.platform} · {e.serial}</td><td>{moneyText(e.captured!.budget_requested_mxn)}</td><td>{moneyText(e.captured!.budget_approved_mxn)}</td><td>{moneyText(saving)}</td><td>{moneyText(proven)}</td><td>{moneyText(est)}</td><td>{moneyText(linked)}</td></tr>; })}
      </tbody></table></div> : <EmptyState title={levelLabels.sin_datos}>Ningún episodio tiene presupuesto ni costos capturados. Al registrar en «Registro» el presupuesto técnico solicitado, el aprobado y los costos posteriores (con comprobante), este cuadro muestra el ahorro inicial frente a lo que costó después, separando lo comprobado de lo estimado.</EmptyState>}
    </section>
    <div className="rel-grid">
      <Panel title="Cascada de costos del episodio" file="ORION_cascada_costos" label="Cascada de costos" option={wSteps.length ? waterfall : null} height={280}
        note="Barras rayadas: costos estimados. El presupuesto del episodio no se suma (evita doble contabilización)."
        tools={budgeted.length > 1 ? <select aria-label="Episodio" value={wEpisode?.id || ''} onChange={e => setWaterfallEpisode(e.target.value)}>{budgeted.map(e => <option key={e.id} value={e.id}>{e.platform} · {e.serial}</option>)}</select> : undefined}>
        {!wSteps.length && <EmptyState title={levelLabels.sin_datos}>Sin costos capturados.</EmptyState>}
      </Panel>
      <Panel title="Flujo de decisiones técnicas" file="ORION_sankey_decisiones" label="Diagrama Sankey de decisiones" option={decisions.length ? sankey : null} height={280}
        note="Asociaciones observadas, no causalidad demostrada.">
        {!decisions.length && <EmptyState title={levelLabels.sin_datos}>Sin recomendaciones registradas.</EmptyState>}
      </Panel>
    </div>
    <section className="rel-block rel-lab">
      <header><h3>Laboratorio de decisión</h3><span>Simulación Monte Carlo (10 000 escenarios) sobre las tasas observadas con su incertidumbre (posterior de Jeffreys) y costos que tú defines.</span></header>
      <div className="rel-lab-inputs">
        {num(visitCost, setVisitCost, 'Costo por visita correctiva (MXN) — supuesto', 500)}
        {num(partCost, setPartCost, 'Costo promedio por pieza (MXN) — supuesto', 100)}
        {num(perCorrective, setPerCorrective, `Piezas por correctivo (observado ${numText(observedPerCorrective, 1)})`, 0.1)}
        {num(extraParts, setExtraParts, 'Piezas adicionales del escenario B', 1)}
        <label>Equipo nuevo (MXN, opcional)<input type="number" min={0} step={1000} value={newPrice} onChange={e => setNewPrice(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))} /></label>
        <label>Horizonte<select value={horizonYears} onChange={e => setHorizonYears(Number(e.target.value))}><option value={1}>1 año</option><option value={2}>2 años</option><option value={3}>3 años</option></select></label>
      </div>
      <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Escenario</th><th>Inversión inicial</th><th>Tasa observada</th><th>Correctivos esperados</th><th>Costo total proyectado (mediana)</th><th>Intervalo 90 %</th></tr></thead><tbody>
        {sim.scenarios.map(s => <tr key={s.key}><td><b>{s.label}</b></td>{s.available ? <><td>{moneyText(s.upfront)}</td><td>{rateCi(s.rate)}</td><td>{numText(s.correctives!.median, 2)} <small>({numText(s.correctives!.low, 2)}–{numText(s.correctives!.high, 2)})</small></td>
          <td><b>{moneyText(s.total!.median)}</b></td><td>{moneyText(s.total!.low)} – {moneyText(s.total!.high)}</td></> : <td colSpan={5}><span className="rel-chip">{s.reason}</span></td>}</tr>)}
      </tbody></table></div>
      {sim.difference && <div className="rel-grid">
        <Panel title="Diferencia de costo A − B" file="ORION_montecarlo_a_menos_b" label="Distribución simulada de la diferencia de costos" option={hist} height={240}
          note={`Probabilidad de que B (más piezas) resulte más barato que A: ${pctText(sim.difference.pBCheaper)} · mediana ${moneyText(sim.difference.median)} (90 %: ${moneyText(sim.difference.low)} a ${moneyText(sim.difference.high)}). Azul: B más barato.`} />
        <figure className="rel-panel"><figcaption><div><strong>Sensibilidad</strong><span>Probabilidad de que B sea más barato al variar los supuestos.</span></div></figcaption>
          <table className="rel-table rel-table--compact rel-sensitivity"><thead><tr><th>Visita ↓ · Pieza →</th>{[0.5, 1, 2].map(p => <th key={p}>{moneyText(partCost * p)}</th>)}</tr></thead><tbody>
            {[0.5, 1, 2].map((v, i) => <tr key={v}><th>{moneyText(visitCost * v)}</th>{sensitivity[i].map((value, j) => <td key={j} style={{ background: value === null ? undefined : `rgba(42,120,214,${0.08 + 0.5 * value})` }}>{pctText(value)}</td>)}</tr>)}
          </tbody></table></figure>
      </div>}
      <p className="rel-note"><b>Supuestos:</b> A y B usan las tasas observadas de los reacondicionamientos con menos y con más piezas; suponer que la diferencia se debe a las piezas no está demostrado (es una asociación). Costos de visita y pieza: supuestos del usuario hasta que existan costos capturados. C (integral) requiere episodios registrados con ese alcance. Ningún resultado es una certeza financiera.</p>
    </section>
    <DecisionMatrix a={a} />
  </>;
}

function DecisionMatrix({ a }: { a: Analysis }) {
  const [watch, setWatch] = useState(1); const [act, setAct] = useState(3);
  const rows = a.recon.follow.filter(f => f.fu >= 90).map(f => ({ f, rate: f.failures.length / years(f.fu), parts: f.partsAfter.reduce((s, l) => s + l.qty, 0) }));
  const classOf = (rate: number): [string, string] => rate >= act ? ['Evaluar sustitución de componentes críticos o del equipo', 'critical'] : rate >= watch ? ['Intensificar seguimiento', 'warning'] : ['Mantener en operación', 'good'];
  const median = quantile(rows.map(r => r.rate), 0.5);
  return <section className="rel-block">
    <header><h3>Matriz de decisión de equipos</h3><span>Recomendaciones según reglas visibles y configurables; nunca órdenes automáticas.</span></header>
    <div className="rel-lab-inputs"><label>Intensificar seguimiento desde (correctivos/año)<input type="number" min={0} step={0.5} value={watch} onChange={e => setWatch(Number(e.target.value) || 0)} /></label>
      <label>Evaluar sustitución desde (correctivos/año)<input type="number" min={0} step={0.5} value={act} onChange={e => setAct(Number(e.target.value) || 0)} /></label>
      <p className="rel-note">Mediana actual: {numText(median)} correctivos por equipo-año. Los umbrales por defecto (1 y 3) son un punto de partida editable, no un estándar técnico ni contractual.</p></div>
    <div className="rel-table-scroll"><table className="rel-table"><thead><tr><th>Equipo</th><th>Destino</th><th>Días observados</th><th>Correctivos/año</th><th>Piezas posteriores</th><th>Clasificación sugerida</th></tr></thead><tbody>
      {rows.sort((x, y) => y.rate - x.rate).map(({ f, rate, parts }) => { const [label, tone] = classOf(rate);
        return <tr key={f.unit.id}><td><b>{f.unit.platform}</b> · {f.unit.serial}</td><td>{f.unit.client || '—'}</td><td>{f.fu}</td><td>{numText(rate)}</td><td>{parts}</td><td><span className={`rel-status rel-status--${tone}`}>{label}</span></td></tr>; })}
    </tbody></table></div>
  </section>;
}

// ── Método y datos ────────────────────────────────────────────────────────────────────────────────────────────
export function MethodView({ a }: { a: Analysis }) {
  const q = a.quality;
  const levels: Array<[string, string, boolean]> = [
    ['1 · Descriptiva', 'Tasas, proporciones y conteos verificables, cada uno con su denominador.', true],
    ['2 · Diagnóstica', 'Asociaciones (piezas ↔ fallas, componentes, modelos) marcadas como exploratorias cuando corresponde.', true],
    ['3 · Modelado estadístico', 'Kaplan–Meier, log-rank, Cox estratificado, Mantel–Haenszel, permutación, Weibull y MCF con intervalos.', true],
    ['4 · Predicción', `No habilitada: hay ${a.recon.follow.filter(f => f.complete).length} reacondicionamientos con ${a.settings.horizon} días completos; un modelo predictivo validado en el tiempo requiere varios cientos y registro de condición inicial.`, false],
    ['5 · Optimización de decisiones', 'Laboratorio de escenarios con supuestos explícitos y sensibilidad; sin costos reales capturados no se optimiza.', false],
  ];
  return <>
    <section className="rel-block"><header><h3>Calidad de los datos en este filtro</h3><span>Lo confirmado, lo inferido y lo que falta, con números.</span></header>
      <StatLine items={[
        ['Episodios de reacondicionamiento', `${q.episodes} (registros a ≤ 60 días se agrupan como un trabajo)`],
        ['Con entrega confirmada', `${q.delivered}: ${q.byInstall} por reporte de instalación, ${q.byAssignment} por fecha de asignación del equipo`],
        ['Sin entrega en 365 días', `${q.notDelivered} — excluidos del seguimiento (en almacén, demostración o sin registro)`],
        ['Destino interno (Biosystems)', `${q.internal} — excluidos salvo que se incluyan arriba`],
        ['Sin ventana de 90 días', `${q.incomplete90} reacondicionados sin falla y con menos de 90 días observados`],
        ['Correctivos sin piezas registradas', `${q.recordsWithoutParts} de ${q.correctives} en todo el historial`],
        ['Registros estructurados', `${q.capturedEpisodes} episodios · ${q.decisions} decisiones · ${q.tests} pruebas · ${q.links} relaciones · ${q.costs} costos`],
      ]} /></section>
    <section className="rel-block"><header><h3>Definiciones</h3></header>
      <dl className="rel-defs">
        <dt>Episodio</dt><dd>Registros «Reacondicionamiento» de una misma serie separados por ≤ 60 días. Un equipo puede tener varios episodios y cada uno se analiza por separado.</dd>
        <dt>Entrega (día 0)</dt><dd>Primer reporte de instalación posterior al episodio (≤ 365 días) o, si no existe, la fecha de asignación del equipo al cliente actual. La fuente queda visible en cada expediente.</dd>
        <dt>Seguimiento</dt><dd>Del día 0 hasta el horizonte elegido, el corte, el retiro o el siguiente reacondicionamiento (lo que ocurra primero). Se censura, nunca se rellena.</dd>
        <dt>Falla</dt><dd>Servicio de campo clasificado como {failureName(a)} con la serie del equipo. Una falla no es lo mismo que una visita ni prueba relación causal con una decisión previa.</dd>
        <dt>Primera instalación</dt><dd>Serie cuyo primer registro en el historial (desde {q.firstYearStart}) es su instalación y que nunca se reacondicionó antes. Es la mejor aproximación disponible a «equipo nuevo».</dd>
        <dt>Exposición</dt><dd>Días calendario observados ÷ 365.25. Orion no registra horas de operación ni pruebas procesadas por equipo para todos los modelos; ninguna métrica se presenta como horas operativas.</dd>
        <dt>Kit observado</dt><dd>Piezas cambiadas en ≥ 20 % de los reacondicionamientos de un modelo (con ≥ 5 episodios). Describe la práctica del taller; no sustituye al «Refurbish Register» del fabricante.</dd>
      </dl></section>
    <section className="rel-block"><header><h3>Niveles de evidencia</h3></header>
      <ul className="rel-levels">{(['sostenida', 'indicio', 'sin_diferencia', 'insuficiente', 'sin_datos'] as Level[]).map(level => <li key={level}><LevelBadge level={level} /><span>{({ sostenida: 'El IC 95 % excluye «sin diferencia» en el análisis crudo y en el ajustado por modelo, en la misma dirección, y la verificación robusta por equipo (bootstrap o permutación) coincide.', indicio: 'Diferencia ≥ 50 % en tasas (o ≥ 5 puntos en proporciones) o significativa en un solo análisis.', sin_diferencia: 'Compatible con no diferencia. No demuestra igualdad.', insuficiente: '< 10 equipos por grupo o < 10 eventos en total.', sin_datos: 'La información no se registra todavía.' } as Record<Level, string>)[level]}</span></li>)}</ul>
      <p className="rel-note">Un valor p no es el tamaño del efecto ni la probabilidad de que una hipótesis sea cierta. Las comparaciones por modelo y por componente son exploratorias: con muchas comparaciones algunas parecerán significativas por azar.</p></section>
    <section className="rel-block"><header><h3>Arquitectura analítica progresiva</h3></header>
      <ul className="rel-ladder">{levels.map(([title, text, on]) => <li key={title} className={on ? 'is-on' : ''}><strong>{title}</strong><span>{text}</span></li>)}</ul></section>
    <section className="rel-block"><header><h3>Limitaciones</h3></header>
      <ul className="rel-limits">
        <li>Las cohortes no son aleatorias: reacondicionados y nuevos van a clientes, sectores y usos distintos. El ajuste por modelo no corrige el resto.</li>
        <li>Correctivos atendidos por distribuidores o terceros no siempre llegan al historial: la tasa observada es un mínimo.</li>
        <li>El historial estructurado empieza en 2023; un equipo «nuevo» puede haber tenido vida previa no registrada.</li>
        <li>La inversión se mide en piezas registradas, no en pesos; {q.recordsWithoutParts} correctivos no registran piezas.</li>
        <li>No hay datos de indisponibilidad, horas de operación, costos ni recomendaciones negadas anteriores a este módulo.</li>
        <li>Nada aquí usa datos de pacientes ni resultados clínicos.</li>
      </ul></section>
  </>;
}
