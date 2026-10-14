// Reliability lab domain: reconditioning episodes, comparison cohorts, follow-up after delivery and the findings
// behind every chart. Everything derives from get_reliability_lab() facts; nothing is imputed. Pure functions:
// tests/reliability-analytics.test.mjs (synthetic fixture) and the local real-data check.
import {
  atRiskAt, bootstrapMeanCumulative, bootstrapRateRatio, coxPH, fisherExact, gammaSample, kaplanMeier, logRank, mantelHaenszelRate,
  meanCumulative, medianSurvival, permutationRateRatio, poissonRate, quantile, rateRatio, riskDifference, seededRandom, spearman,
  survivalAt, weibull, wilson,
  type CoxFit, type KmCurve, type Proportion, type Rate, type Ratio, type SurvivalItem, type WeibullFit,
} from './reliabilityStats.ts';

// ── Payload of get_reliability_lab() ─────────────────────────────────────────────────────────────────────────
export interface LabService {
  id: string; history_id: string | null; ref: string; day: string; day_end: string | null; kind: string; serial_key: string; serial: string | null;
  model: string | null; client: string | null; sector: string | null; minutes: number | null; ticket_id: string | null; note: string | null;
  parts: Array<[string, number]>;
}
export interface LabTicket { id: string; folio: string | null; serial_key: string; opened_at: string; closed_at: string | null; status: string; subject: string | null }
export interface LabEquipment { serial_key: string; model: string | null; client: string | null; assigned_on: string | null; ended_on: string | null; warranty_until: string | null }
export interface CapturedEpisode {
  id: string; serial_key: string; serial_raw: string | null; platform: string | null; started_on: string; finished_on: string | null; history_service_ids: string[];
  scope: string; release_result: string; release_notes: string | null; budget_requested_mxn: number | null; budget_approved_mxn: number | null;
  budget_source: string | null; notes: string | null; created_by_name?: string | null; created_at: string; updated_at: string;
}
export interface CapturedDecision {
  id: string; episode_id: string; component_code: string | null; component_name: string; subsystem: string | null; criticality: string; condition: string;
  condition_evidence: string | null; recommendation: string; recommended_by_name?: string | null; recommended_on: string | null; estimated_cost_mxn: number | null;
  cost_source: string | null; authorization_status: string; authorization_reason: string | null; authorization_detail: string | null;
  authorized_by_name?: string | null; authorized_on: string | null; action_taken: string; action_evidence: string | null; residual_risk: string; created_at: string;
}
export interface CapturedTest {
  id: string; episode_id: string; criterion: string; specification: string | null; spec_source: string | null; result: string; measured_value: string | null;
  tested_on: string | null; notes: string | null;
}
export interface CapturedLink {
  id: string; episode_id: string; failure_service_id: string | null; failure_ticket_id: string | null; decision_id: string | null; component_code: string | null;
  relation: string; evidence: string | null; assessed_by_name?: string | null; assessed_on: string | null;
}
export interface CapturedCost {
  id: string; serial_key: string; episode_id: string | null; service_id: string | null; ticket_id: string | null; phase: string; category: string;
  amount_mxn: number; nature: string; source_document: string | null; occurred_on: string; notes: string | null;
}
export interface LabPayload {
  generated_at: string; services: LabService[]; tickets: LabTicket[]; equipment: LabEquipment[]; catalog: Record<string, string>;
  episodes: CapturedEpisode[]; decisions: CapturedDecision[]; tests: CapturedTest[]; links: CapturedLink[]; costs: CapturedCost[];
}

// ── Labels ───────────────────────────────────────────────────────────────────────────────────────────────────
export const kindLabels: Record<string, string> = {
  correctivo: 'Correctivo', preventivo: 'Preventivo', instalacion: 'Instalación', reacondicionamiento: 'Reacondicionamiento', retiro: 'Retiro',
  visita: 'Visita', otro: 'Otro servicio', sin_clasificar: 'Sin clasificar',
};
export const cohortLabels = { reacondicionado: 'Reacondicionados', primera_instalacion: 'Primera instalación', reinstalado: 'Reinstalados sin reacondicionar' } as const;
export type Cohort = keyof typeof cohortLabels;
export type Level = 'sostenida' | 'indicio' | 'sin_diferencia' | 'insuficiente' | 'sin_datos';
export const levelLabels: Record<Level, string> = {
  sostenida: 'Diferencia sostenida', indicio: 'Indicio no concluyente', sin_diferencia: 'Sin diferencia detectada',
  insuficiente: 'EVIDENCIA INSUFICIENTE PARA ESTABLECER UNA CONCLUSIÓN', sin_datos: 'SIN DATOS REGISTRADOS',
};
export const levelHelp: Record<Level, string> = {
  sostenida: 'El IC 95 % excluye «sin diferencia» en el análisis crudo, en el ajustado por modelo y en la verificación robusta por equipo.',
  indicio: 'Hay una diferencia apreciable, pero al menos uno de los análisis no la distingue del azar con estos datos.',
  sin_diferencia: 'Los datos son compatibles con que no haya diferencia. No demuestra que los grupos sean iguales.',
  insuficiente: 'Menos de 10 equipos por grupo o menos de 10 eventos en total: cualquier conclusión sería artificialmente precisa.',
  sin_datos: 'La información necesaria aún no se registra en Orion. Se habilita al capturarla.',
};
export const relationLabels: Record<string, string> = {
  mismo_componente: 'Falla del mismo componente', subsistema_relacionado: 'Subsistema relacionado', sin_relacion: 'Sin relación técnica documentada',
  no_determinada: 'Relación causal no determinada',
};

// ── Dates ────────────────────────────────────────────────────────────────────────────────────────────────────
const DAY = 86400000;
export const toDay = (iso: string | null | undefined) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return match ? Date.UTC(+match[1], +match[2] - 1, +match[3]) / DAY : null;
};
// Ticket timestamps → calendar day in America/Chihuahua (UTC−6 all year since 2022).
export const timestampDay = (iso: string | null | undefined) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Math.floor((t - 6 * 3600000) / DAY) : null; };
export const isoOfDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
export const formatDay = (day: number | null) => (day === null ? 'Sin fecha' : new Date(day * DAY).toLocaleDateString('es-MX', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' }));

// Same families as service_platform_family() in the parts lab.
export function platformOf(model: string | null | undefined): string | null {
  const v = (model || '').toUpperCase().replace(/[\s./_-]/g, '');
  if (!v) return null;
  const families: Array<[RegExp, string]> = [[/OSMOSIS/, 'Ósmosis'], [/DESTILAD/, 'Destilador'], [/BTS350/, 'BTS350'], [/BTS/, 'BTS'], [/IPRO2/, 'IPRO2'],
    [/IPRO/, 'IPRO'], [/SPICA/, 'SPICA'], [/IMLD/, 'IMLD'], [/BA400/, 'BA400'], [/BA200/, 'BA200'], [/A15C/, 'A15C'], [/A15/, 'A15'], [/A25/, 'A25'], [/Y15/, 'Y15']];
  for (const [pattern, family] of families) if (pattern.test(v)) return family;
  return (model || '').trim().toUpperCase();
}
export const ANALYZERS = ['A15', 'A15C', 'A25', 'BA200', 'BA400'];

// Phrases in the reconditioning report that say the job was not closed as the protocol expects.
const CAVEATS: Array<[RegExp, string]> = [
  [/proceso incomplet|reacondicionamiento incomplet|queda incomplet|trabajo incomplet/i, 'Proceso incompleto'],
  [/queda a cargo|queda pendiente|quedan pendientes/i, 'Trabajo pendiente o transferido'],
  [/no se realiz\w*\s+(las\s+|la\s+)?prueba|sin pruebas|no se prob/i, 'Pruebas no realizadas'],
  [/a petici[oó]n de/i, 'Alcance decidido por un tercero'],
  [/faltan?\s+(las?\s+|los?\s+)?(piezas?|refacci|repuestos?)|faltante de (piezas|refacci)|no hay (piezas|refacci)|sin (piezas|refacci)|no se cuenta con (la |el |las |los )?(piezas?|refacci)|en espera de (piezas?|refacci)|pendiente de (piezas?|refacci)/i, 'Faltan piezas'],
  [/(requiere|se recomienda|se sugiere|recomendable)\s+(el\s+|la\s+)?(cambi|reemplaz|sustitu)/i, 'Cambio recomendado sin ejecutar'],
  [/no se (cambi|reemplaz|sustitu)|se reutiliz/i, 'Pieza no sustituida'],
];
export const caveatsOf = (text: string) => CAVEATS.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);

// ── Model ────────────────────────────────────────────────────────────────────────────────────────────────────
export interface PartLine { code: string; qty: number; name: string | null }
export interface Episode {
  id: string; serialKey: string; serial: string; platform: string | null; start: number; end: number; ordinal: number;
  records: LabService[]; parts: PartLine[]; partsQty: number; codes: Set<string>; caveats: string[];
  kitCoverage: number | null; kitMissing: string[];
  priorKind: string | null; priorFailures365: number; priorExposure: number;
  delivery: number | null; deliverySource: 'instalacion' | 'asignacion' | null; deliveryRef: string | null; destination: string | null; internal: boolean;
  stop: number; stopReason: StopReason;
  captured: CapturedEpisode | null; decisions: CapturedDecision[]; tests: CapturedTest[]; links: CapturedLink[]; costs: CapturedCost[];
}
export type StopReason = 'corte' | 'nuevo_reacondicionamiento' | 'retiro';
export const stopLabels: Record<StopReason, string> = { corte: 'Seguimiento abierto al corte', nuevo_reacondicionamiento: 'Termina en otro reacondicionamiento', retiro: 'Termina con el retiro del equipo' };
export interface Unit {
  id: string; cohort: Cohort; serialKey: string; serial: string; platform: string | null; sector: string; client: string | null; internal: boolean;
  t0: number; t0Source: 'instalacion' | 'asignacion'; stop: number; stopReason: StopReason; episode: Episode | null;
}
export interface KitEntry { code: string; name: string | null; share: number; episodes: number }
export interface LabModel {
  cutDay: number; payload: LabPayload; bySerial: Map<string, LabService[]>; ticketsBySerial: Map<string, Array<{ day: number; ticket: LabTicket }>>;
  equipment: Map<string, LabEquipment>; platformBySerial: Map<string, string | null>; sectorBySerial: Map<string, string>;
  episodes: Episode[]; units: Unit[]; kits: Map<string, KitEntry[]>; catalog: Record<string, string>; historyStartDay: number;
}
export interface BuildOptions { cutDay: number; episodeGap?: number; deliveryWindow?: number; historyStart?: string; kitShare?: number; kitMinEpisodes?: number }

const isInternal = (client: string | null) => /^\s*bio\s*systems\b/i.test(client || '');
const NO_CODE = 'Sin código';

export function buildModel(payload: LabPayload, options: BuildOptions): LabModel {
  const { cutDay } = options; const episodeGap = options.episodeGap ?? 60; const deliveryWindow = options.deliveryWindow ?? 365;
  const historyStartDay = toDay(options.historyStart ?? '2023-03-01')!;
  const kitShare = options.kitShare ?? 0.2; const kitMinEpisodes = options.kitMinEpisodes ?? 5;
  const bySerial = new Map<string, LabService[]>();
  for (const service of payload.services) {
    if (!service.serial_key || toDay(service.day) === null) continue;
    const list = bySerial.get(service.serial_key) || []; list.push(service); bySerial.set(service.serial_key, list);
  }
  for (const list of bySerial.values()) list.sort((a, b) => toDay(a.day)! - toDay(b.day)! || a.id.localeCompare(b.id));
  const ticketsBySerial = new Map<string, Array<{ day: number; ticket: LabTicket }>>();
  for (const ticket of payload.tickets) {
    const day = timestampDay(ticket.opened_at); if (day === null || !ticket.serial_key) continue;
    const list = ticketsBySerial.get(ticket.serial_key) || []; list.push({ day, ticket }); ticketsBySerial.set(ticket.serial_key, list);
  }
  const equipment = new Map(payload.equipment.map(e => [e.serial_key, e]));
  const platformBySerial = new Map<string, string | null>(); const sectorBySerial = new Map<string, string>();
  const serials = new Set([...bySerial.keys(), ...payload.episodes.map(e => e.serial_key)]);
  for (const serial of serials) {
    const services = bySerial.get(serial) || [];
    const model = equipment.get(serial)?.model || [...services].reverse().find(s => s.model)?.model
      || payload.episodes.find(e => e.serial_key === serial)?.platform || null;
    platformBySerial.set(serial, platformOf(model));
    const sector = [...services].reverse().find(s => s.sector === 'gobierno' || s.sector === 'particular')?.sector;
    sectorBySerial.set(serial, sector || 'sin_dato');
  }

  // 1. Episodes: reconditioning records of one serial separated by at most `episodeGap` days are one job.
  type Draft = { serialKey: string; start: number; end: number; records: LabService[]; captured: CapturedEpisode | null };
  const drafts: Draft[] = [];
  for (const [serialKey, services] of bySerial) {
    let current: Draft | null = null;
    for (const service of services.filter(s => s.kind === 'reacondicionamiento')) {
      const day = toDay(service.day)!; const end = Math.max(day, toDay(service.day_end) ?? day);
      if (current && day - current.end <= episodeGap) { current.end = Math.max(current.end, end); current.records.push(service); }
      else { current = { serialKey, start: day, end, records: [service], captured: null }; drafts.push(current); }
    }
  }
  // Captured episodes attach to the derived one they document (shared record or overlapping dates); otherwise they stand alone.
  for (const captured of payload.episodes) {
    const start = toDay(captured.started_on)!; const end = toDay(captured.finished_on) ?? start;
    const match = drafts.find(d => d.serialKey === captured.serial_key && !d.captured && (
      d.records.some(r => r.history_id && captured.history_service_ids.includes(r.history_id)) || (start <= d.end + 30 && end >= d.start - 30)));
    if (match) { match.captured = captured; match.start = Math.min(match.start, start); match.end = Math.max(match.end, end); }
    else drafts.push({ serialKey: captured.serial_key, start, end, records: [], captured });
  }
  drafts.sort((a, b) => a.serialKey.localeCompare(b.serialKey) || a.start - b.start);

  const partName = (code: string) => payload.catalog[code] || null;
  const episodes: Episode[] = drafts.map((draft, index) => {
    const services = bySerial.get(draft.serialKey) || [];
    const sameSerial = drafts.filter(d => d.serialKey === draft.serialKey);
    const ordinal = sameSerial.indexOf(draft) + 1;
    const next = sameSerial[ordinal]?.start ?? null;
    const quantities = new Map<string, number>();
    for (const record of draft.records) for (const [code, qty] of record.parts) quantities.set(code, (quantities.get(code) || 0) + (Number(qty) || 0));
    const parts = [...quantities].map(([code, qty]) => ({ code, qty, name: partName(code) })).sort((a, b) => b.qty - a.qty || a.code.localeCompare(b.code));
    const text = [draft.records.map(r => r.note || '').join(' '), draft.captured?.notes || '', draft.captured?.release_notes || ''].join(' ');
    const before = services.filter(s => toDay(s.day)! < draft.start);
    const firstDay = services.length ? toDay(services[0].day)! : draft.start;
    const priorFailures365 = before.filter(s => s.kind === 'correctivo' && toDay(s.day)! >= draft.start - 365).length;
    const limit = next ?? Infinity;
    const install = services.find(s => s.kind === 'instalacion' && toDay(s.day)! > draft.end && toDay(s.day)! < limit && toDay(s.day)! - draft.end <= deliveryWindow);
    const eq = equipment.get(draft.serialKey); const assigned = toDay(eq?.assigned_on);
    const assignment = assigned !== null && assigned > draft.end && assigned < limit && assigned - draft.end <= deliveryWindow ? assigned : null;
    const installDay = install ? toDay(install.day)! : null;
    let delivery: number | null = null; let deliverySource: Episode['deliverySource'] = null;
    if (installDay !== null && (assignment === null || installDay <= assignment)) { delivery = installDay; deliverySource = 'instalacion'; }
    else if (assignment !== null) { delivery = assignment; deliverySource = 'asignacion'; }
    const destination = deliverySource === 'instalacion' ? install?.client || eq?.client || null : deliverySource === 'asignacion' ? eq?.client || null : null;
    const retiro = delivery === null ? null : services.find(s => s.kind === 'retiro' && toDay(s.day)! > delivery! && toDay(s.day)! < limit);
    const candidates: Array<[number, StopReason]> = [[cutDay, 'corte']];
    if (next !== null) candidates.push([next, 'nuevo_reacondicionamiento']);
    if (retiro) candidates.push([toDay(retiro.day)!, 'retiro']);
    candidates.sort((a, b) => a[0] - b[0]);
    const serial = draft.records.find(r => r.serial)?.serial || draft.captured?.serial_raw || draft.serialKey;
    const id = draft.captured?.id && !draft.records.length ? `cap:${draft.captured.id}` : `${draft.serialKey}@${isoOfDay(draft.start)}`;
    const own = (list: Array<{ episode_id: string | null }>) => draft.captured ? list.filter(x => x.episode_id === draft.captured!.id) : [];
    void index;
    return {
      id, serialKey: draft.serialKey, serial, platform: platformBySerial.get(draft.serialKey) ?? platformOf(draft.captured?.platform), start: draft.start, end: draft.end, ordinal,
      records: draft.records, parts, partsQty: parts.reduce((sum, p) => sum + p.qty, 0), codes: new Set(parts.map(p => p.code).filter(code => code !== NO_CODE)),
      caveats: caveatsOf(text), kitCoverage: null, kitMissing: [],
      priorKind: before.length ? before[before.length - 1].kind : null, priorFailures365, priorExposure: Math.min(365, Math.max(0, draft.start - firstDay)),
      delivery, deliverySource, deliveryRef: install && deliverySource === 'instalacion' ? install.ref : null, destination, internal: isInternal(destination),
      stop: candidates[0][0], stopReason: candidates[0][1],
      captured: draft.captured, decisions: own(payload.decisions) as CapturedDecision[], tests: own(payload.tests) as CapturedTest[],
      links: own(payload.links) as CapturedLink[], costs: own(payload.costs) as CapturedCost[],
    };
  });

  // 2. Observed kit per platform: codes replaced in ≥ kitShare of that platform's reconditionings. It is what the
  //    workshop actually does, not the manufacturer's protocol; the official list replaces it once captured.
  const kits = new Map<string, KitEntry[]>();
  const byPlatform = new Map<string, Episode[]>();
  for (const episode of episodes) if (episode.platform && episode.records.length) byPlatform.set(episode.platform, [...(byPlatform.get(episode.platform) || []), episode]);
  for (const [platform, list] of byPlatform) {
    if (list.length < kitMinEpisodes) continue;
    const counts = new Map<string, number>();
    for (const episode of list) for (const code of episode.codes) counts.set(code, (counts.get(code) || 0) + 1);
    const entries = [...counts].filter(([, n]) => n / list.length >= kitShare).map(([code, n]) => ({ code, name: partName(code), share: n / list.length, episodes: n }))
      .sort((a, b) => b.share - a.share || a.code.localeCompare(b.code));
    kits.set(platform, entries);
  }
  for (const episode of episodes) {
    const kit = episode.platform ? kits.get(episode.platform) : undefined;
    if (!kit?.length) continue;
    episode.kitCoverage = kit.filter(k => episode.codes.has(k.code)).length / kit.length;
    episode.kitMissing = kit.filter(k => !episode.codes.has(k.code)).map(k => k.code);
  }

  // 3. Units under follow-up. Reconditioned: from delivery. First installation: the serial's first record is its
  //    installation (no earlier history since historyStart). Reinstalled: installed again with history but no reconditioning.
  const units: Unit[] = [];
  for (const episode of episodes) {
    if (episode.delivery === null || episode.stop <= episode.delivery) continue;
    units.push({ id: `rec:${episode.id}`, cohort: 'reacondicionado', serialKey: episode.serialKey, serial: episode.serial, platform: episode.platform,
      sector: sectorBySerial.get(episode.serialKey) || 'sin_dato', client: episode.destination, internal: episode.internal,
      t0: episode.delivery, t0Source: episode.deliverySource!, stop: episode.stop, stopReason: episode.stopReason, episode });
  }
  for (const [serialKey, services] of bySerial) {
    const install = services.find(s => s.kind === 'instalacion'); if (!install) continue;
    const t0 = toDay(install.day)!;
    if (episodes.some(e => e.serialKey === serialKey && e.start <= t0)) continue;
    const prior = services.filter(s => toDay(s.day)! < t0);
    const cohort: Cohort = prior.length ? 'reinstalado' : 'primera_instalacion';
    if (cohort === 'primera_instalacion' && t0 < historyStartDay) continue;
    const nextEpisode = episodes.find(e => e.serialKey === serialKey && e.start > t0)?.start ?? null;
    const retiro = services.find(s => s.kind === 'retiro' && toDay(s.day)! > t0 && (nextEpisode === null || toDay(s.day)! < nextEpisode));
    const candidates: Array<[number, StopReason]> = [[cutDay, 'corte']];
    if (nextEpisode !== null) candidates.push([nextEpisode, 'nuevo_reacondicionamiento']);
    if (retiro) candidates.push([toDay(retiro.day)!, 'retiro']);
    candidates.sort((a, b) => a[0] - b[0]);
    if (candidates[0][0] <= t0) continue;
    units.push({ id: `${cohort === 'reinstalado' ? 'rei' : 'new'}:${serialKey}`, cohort, serialKey, serial: install.serial || serialKey,
      platform: platformBySerial.get(serialKey) ?? null, sector: sectorBySerial.get(serialKey) || 'sin_dato', client: install.client,
      internal: isInternal(install.client), t0, t0Source: 'instalacion', stop: candidates[0][0], stopReason: candidates[0][1], episode: null });
  }
  return { cutDay, payload, bySerial, ticketsBySerial, equipment, platformBySerial, sectorBySerial, episodes, units, kits, catalog: payload.catalog, historyStartDay };
}

// ── Follow-up ────────────────────────────────────────────────────────────────────────────────────────────────
export interface LabSettings {
  horizon: number; failureKinds: string[]; platforms: string[] | null; includeInternal: boolean; partsThreshold: number; fromYear: number | null;
}
export const defaultSettings: LabSettings = { horizon: 365, failureKinds: ['correctivo'], platforms: ANALYZERS, includeInternal: false, partsThreshold: 3, fromYear: null };
export interface FailureEvent { service: LabService; offset: number }
export interface FollowUp {
  unit: Unit; fu: number; complete: boolean; failures: FailureEvent[]; first: number | null; tickets: number[]; ticketIds: string[];
  interventions: FailureEvent[]; partsAfter: Array<{ code: string; qty: number; offset: number; service: LabService }>;
}
export function followUp(model: LabModel, unit: Unit, settings: LabSettings): FollowUp {
  const end = Math.min(unit.stop, model.cutDay, unit.t0 + settings.horizon);
  const fu = Math.max(0, end - unit.t0);
  const window = (model.bySerial.get(unit.serialKey) || []).filter(s => { const d = toDay(s.day)!; return d >= unit.t0 && d < unit.t0 + fu; });
  const failures = window.filter(s => settings.failureKinds.includes(s.kind)).map(service => ({ service, offset: toDay(service.day)! - unit.t0 }));
  const interventions = window.filter(s => s.kind === 'correctivo' || s.kind === 'visita').map(service => ({ service, offset: toDay(service.day)! - unit.t0 }));
  const tickets = (model.ticketsBySerial.get(unit.serialKey) || []).filter(t => t.day >= unit.t0 && t.day < unit.t0 + fu);
  return {
    unit, fu, complete: unit.t0 + settings.horizon <= Math.min(unit.stop, model.cutDay), failures, first: failures.length ? failures[0].offset : null,
    tickets: tickets.map(t => t.day - unit.t0), ticketIds: tickets.map(t => t.ticket.id), interventions,
    partsAfter: failures.flatMap(f => f.service.parts.map(([code, qty]) => ({ code, qty: Number(qty) || 0, offset: f.offset, service: f.service }))),
  };
}
const survivalItem = (f: FollowUp, group = 0, stratum?: string, x?: number[]): SurvivalItem => ({ t: f.first ?? f.fu, event: f.first !== null, group, stratum, x });
const years = (days: number) => days / 365.25;

// ── Verdicts ─────────────────────────────────────────────────────────────────────────────────────────────────
// «Sostenida» needs the crude AND model-adjusted intervals to exclude 1 in the same direction, and — when there is one —
// the unit-level robust check (cluster bootstrap interval or within-model permutation) to agree: repeated events of a
// few analyzers must not manufacture significance.
export type RobustCheck = { low: number; high: number } | { p: number } | null | undefined;
export function ratioVerdict(nA: number, nB: number, events: number, crude: Ratio | null, adjusted: Ratio | null | undefined, robust?: RobustCheck): Level {
  if (nA < 10 || nB < 10 || events < 10 || !crude) return 'insuficiente';
  const excludes = (r: Ratio) => r.low > 1 || r.high < 1;
  const sameDirection = !adjusted || Math.sign(Math.log(adjusted.ratio)) === Math.sign(Math.log(crude.ratio));
  const robustAgrees = !robust || ('p' in robust ? robust.p < 0.025 : robust.low > 1 || robust.high < 1);
  if (excludes(crude) && (!adjusted || excludes(adjusted)) && sameDirection && robustAgrees) return 'sostenida';
  if (excludes(crude) || (adjusted && excludes(adjusted)) || crude.ratio >= 1.5 || crude.ratio <= 1 / 1.5) return 'indicio';
  return 'sin_diferencia';
}
export function proportionVerdict(a: Proportion | null, b: Proportion | null): Level {
  if (!a || !b || a.n < 10 || b.n < 10 || a.k + b.k < 5) return 'insuficiente';
  const diff = riskDifference(a, b);
  if (diff.low > 0 || diff.high < 0) return 'sostenida';
  if (Math.abs(diff.d) >= 0.05) return 'indicio';
  return 'sin_diferencia';
}

// ── Analysis ─────────────────────────────────────────────────────────────────────────────────────────────────
export interface CohortSummary {
  cohort: Cohort; follow: FollowUp[]; units: number; events: number; failures: number; exposureYears: number; rate: Rate | null;
  mtbfDays: { value: number; low: number; high: number } | null; km: KmCurve; milestones: Array<{ t: number; step: ReturnType<typeof survivalAt>; atRisk: number }>;
  median: number | null; tickets: Rate | null; weibull: WeibullFit | null; mcf: ReturnType<typeof meanCumulative>; mcfBand: ReturnType<typeof bootstrapMeanCumulative>;
}
export interface EarlyWindow { days: number; recon: Proportion | null; first: Proportion | null; diff: ReturnType<typeof riskDifference> | null; p: number | null; level: Level }
export interface DoseGroup { label: string; follow: FollowUp[]; rate: Rate | null; firstYear: Proportion | null; km: KmCurve; medianParts: number | null }
export interface ComponentRow {
  code: string; name: string | null; lines: number; qty: number; units: number; replacedAtRecon: number; inKit: boolean; platforms: string[];
  medianOffset: number | null; firstInstallLines: number;
}
export interface Finding { id: string; question: string; answer: string; level: Level; detail?: string; exploratory?: boolean }
export interface Analysis {
  settings: LabSettings; recon: CohortSummary; first: CohortSummary; reinstall: CohortSummary;
  comparison: { logrank: ReturnType<typeof logRank>; logrankStrat: ReturnType<typeof logRank>; cox: CoxFit | null; coxStrat: CoxFit | null;
    rr: Ratio | null; rrBoot: ReturnType<typeof bootstrapRateRatio>; rrMH: Ratio | null; level: Level; survivalLevel: Level;
    tickets: { rr: Ratio | null; rrMH: Ratio | null; rrBoot: ReturnType<typeof bootstrapRateRatio>; level: Level } };
  early: EarlyWindow[];
  dose: { low: DoseGroup; high: DoseGroup; rr: Ratio | null; rrMH: Ratio | null; permutation: ReturnType<typeof permutationRateRatio>; logrankStrat: ReturnType<typeof logRank>;
    coxStrat: CoxFit | null; spearman: ReturnType<typeof spearman>; level: Level; byPlatform: Array<{ platform: string; low: Rate | null; high: Rate | null; nLow: number; nHigh: number }> };
  points: Array<{ episode: Episode; follow: FollowUp; ratePerYear: number }>;
  components: ComponentRow[]; componentTotals: { lines: number; notReplaced: number; share: Proportion | null; kitNotReplaced: number; within90: number };
  heat: { platforms: string[]; codes: string[]; cells: Array<[number, number, number, number]>; exposureByPlatform: Record<string, number> };
  byPlatform: Array<{ platform: string; recon: { units: number; rate: Rate | null; early90: Proportion | null }; first: { units: number; rate: Rate | null; early90: Proportion | null } }>;
  repeat: { recon: Proportion | null; first: Proportion | null };
  duration: { recon: { median: number | null; p90: number | null; n: number }; first: { median: number | null; p90: number | null; n: number } };
  comparability: { sector: Record<Cohort, Record<string, number>>; platforms: Record<Cohort, Record<string, number>>; priorFailureRate: Rate | null };
  quality: { episodes: number; delivered: number; byInstall: number; byAssignment: number; notDelivered: number; internal: number; incomplete90: number;
    capturedEpisodes: number; decisions: number; tests: number; links: number; costs: number; firstYearStart: string; recordsWithoutParts: number; correctives: number };
  trd: { recommended: number; executed: number; rejected: number; postponed: number; pending: number; rate: Proportion | null; level: Level };
  costs: { total: number; proven: number; estimated: number; byPhase: Record<string, number>; episodesWithBudget: number; level: Level };
  rqi: Array<{ episode: Episode; follow: FollowUp | null; failure90: boolean | null; interventions90: number | null; tickets90: number | null; parts90: number | null;
    release: string; rejected: number; recommended: number; cost90: number | null; definitive: boolean }>;
  findings: Finding[];
}

const pct = (value: number) => `${(value * 100).toFixed(value < 0.1 && value > 0 ? 1 : 0)} %`;
const fmt = (value: number, digits = 2) => value.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const ci = (low: number, high: number, digits = 2) => `IC 95 % ${fmt(low, digits)}–${fmt(high, digits)}`;
const propText = (p: Proportion) => `${p.k} de ${p.n} (${pct(p.p)}; IC 95 % ${pct(p.low)}–${pct(p.high)})`;

function summarize(model: LabModel, cohort: Cohort, follow: FollowUp[], settings: LabSettings): CohortSummary {
  const items = follow.map(f => survivalItem(f)); const km = kaplanMeier(items);
  const failures = follow.reduce((sum, f) => sum + f.failures.length, 0); const exposure = years(follow.reduce((sum, f) => sum + f.fu, 0));
  const rate = poissonRate(failures, exposure);
  const ticketRate = poissonRate(follow.reduce((sum, f) => sum + f.tickets.length, 0), exposure);
  const recurrent = follow.map(f => ({ events: f.failures.map(e => e.offset), exposure: f.fu }));
  const grid = [30, 90, 180, 365].filter(t => t <= settings.horizon);
  const fit = km.events >= 10 ? weibull(items) : null;
  void model;
  return {
    cohort, follow, units: follow.length, events: km.events, failures, exposureYears: exposure, rate,
    mtbfDays: rate && failures > 0 ? { value: 365.25 / rate.rate, low: 365.25 / rate.high, high: rate.low > 0 ? 365.25 / rate.low : Infinity } : null,
    km, milestones: [0, ...grid].map(t => ({ t, step: survivalAt(km, t), atRisk: atRiskAt(items, t) })), median: medianSurvival(km),
    tickets: ticketRate, weibull: fit, mcf: meanCumulative(recurrent), mcfBand: bootstrapMeanCumulative(recurrent, grid),
  };
}
const early = (follow: FollowUp[], days: number) => {
  const eligible = follow.filter(f => (f.first !== null && f.first < days) || f.fu >= days);
  return wilson(eligible.filter(f => f.first !== null && f.first < days).length, eligible.length);
};
type Events = (f: FollowUp) => number;
const failureCount: Events = f => f.failures.length;
const ticketCount: Events = f => f.tickets.length;
const strataUnits = (follow: FollowUp[], group: boolean, events: Events = failureCount) => follow.map(f => ({ events: events(f), exposure: years(f.fu), stratum: f.unit.platform || 'sin_modelo', group }));
const mhByPlatform = (a: FollowUp[], b: FollowUp[], events: Events = failureCount) => {
  const platforms = [...new Set([...a, ...b].map(f => f.unit.platform || 'sin_modelo'))];
  return mantelHaenszelRate(platforms.map(p => {
    const x = a.filter(f => (f.unit.platform || 'sin_modelo') === p); const y = b.filter(f => (f.unit.platform || 'sin_modelo') === p);
    return { a: x.reduce((s, f) => s + events(f), 0), ta: years(x.reduce((s, f) => s + f.fu, 0)), b: y.reduce((s, f) => s + events(f), 0), tb: years(y.reduce((s, f) => s + f.fu, 0)) };
  }));
};
const crudeRatio = (a: FollowUp[], b: FollowUp[], events: Events = failureCount) => rateRatio(a.reduce((s, f) => s + events(f), 0), years(a.reduce((s, f) => s + f.fu, 0)),
  b.reduce((s, f) => s + events(f), 0), years(b.reduce((s, f) => s + f.fu, 0)));
const minutesSummary = (follow: FollowUp[]) => {
  const values = follow.flatMap(f => f.failures.map(e => e.service.minutes).filter((m): m is number => typeof m === 'number' && m > 0));
  return { median: quantile(values, 0.5), p90: quantile(values, 0.9), n: values.length };
};
const repeatShare = (follow: FollowUp[]) => {
  let k = 0; let n = 0;
  for (const f of follow) f.failures.forEach((event, i) => {
    if (event.offset + 30 > f.fu && i === f.failures.length - 1) return; // window not observed
    n++; if (f.failures.slice(i + 1).some(next => next.offset - event.offset <= 30)) k++;
  });
  return wilson(k, n);
};

export function analyze(model: LabModel, settings: LabSettings): Analysis {
  const inScope = (unit: Unit) => (settings.includeInternal || !unit.internal) && (!settings.platforms || settings.platforms.includes(unit.platform || ''))
    && (settings.fromYear === null || new Date(unit.t0 * DAY).getUTCFullYear() >= settings.fromYear);
  const follow = model.units.filter(inScope).map(unit => followUp(model, unit, settings)).filter(f => f.fu > 0);
  const recon = follow.filter(f => f.unit.cohort === 'reacondicionado'); const first = follow.filter(f => f.unit.cohort === 'primera_instalacion');
  const reinstall = follow.filter(f => f.unit.cohort === 'reinstalado');
  const R = summarize(model, 'reacondicionado', recon, settings); const F = summarize(model, 'primera_instalacion', first, settings);
  const I = summarize(model, 'reinstalado', reinstall, settings);

  // Reconditioned vs first installation.
  const pair = [...recon.map(f => survivalItem(f, 1, f.unit.platform || 'sin_modelo', [1])), ...first.map(f => survivalItem(f, 0, f.unit.platform || 'sin_modelo', [0]))];
  const plain = pair.map(({ stratum, ...rest }) => { void stratum; return rest; });
  const rr = crudeRatio(recon, first); const rrMH = mhByPlatform(recon, first);
  const cox = coxPH(plain); const coxStrat = coxPH(pair);
  const asRatio = (fit: CoxFit | null): Ratio | null => fit ? { ratio: fit.hr[0], low: fit.low[0], high: fit.high[0], p: fit.p[0], corrected: false } : null;
  const comparison = {
    logrank: logRank(plain), logrankStrat: logRank(pair), cox, coxStrat, rr, rrBoot: bootstrapRateRatio(strataUnits(recon, true), strataUnits(first, false)), rrMH,
    level: ratioVerdict(recon.length, first.length, R.failures + F.failures, rr, rrMH, bootstrapRateRatio(strataUnits(recon, true), strataUnits(first, false))),
    survivalLevel: ratioVerdict(recon.length, first.length, R.events + F.events, asRatio(cox), asRatio(coxStrat)),
    tickets: (() => {
      const crude = crudeRatio(recon, first, ticketCount); const mh = mhByPlatform(recon, first, ticketCount);
      const total = recon.concat(first).reduce((sum, f) => sum + f.tickets.length, 0);
      const boot = bootstrapRateRatio(strataUnits(recon, true, ticketCount), strataUnits(first, false, ticketCount));
      return { rr: crude, rrMH: mh, rrBoot: boot, level: ratioVerdict(recon.length, first.length, total, crude, mh, boot) };
    })(),
  };
  const earlyWindows = [7, 30, 90].filter(d => d <= settings.horizon).map(days => {
    const a = early(recon, days); const b = early(first, days);
    return { days, recon: a, first: b, diff: a && b ? riskDifference(a, b) : null, p: a && b ? fisherExact(a.k, a.n - a.k, b.k, b.n - b.k) : null, level: proportionVerdict(a, b) };
  });

  // Dose–response inside the reconditioned cohort: parts replaced during the job vs what happens after delivery.
  const isLow = (f: FollowUp) => (f.unit.episode?.partsQty ?? 0) < settings.partsThreshold;
  const lowF = recon.filter(isLow); const highF = recon.filter(f => !isLow(f));
  const group = (label: string, list: FollowUp[]): DoseGroup => ({
    label, follow: list, rate: poissonRate(list.reduce((s, f) => s + f.failures.length, 0), years(list.reduce((s, f) => s + f.fu, 0))),
    firstYear: wilson(list.filter(f => f.first !== null).length, list.length), km: kaplanMeier(list.map(f => survivalItem(f))),
    medianParts: quantile(list.map(f => f.unit.episode?.partsQty ?? 0), 0.5),
  });
  const doseItems = recon.map(f => survivalItem(f, isLow(f) ? 1 : 0, f.unit.platform || 'sin_modelo', [isLow(f) ? 1 : 0]));
  const doseRR = crudeRatio(lowF, highF); const doseMH = mhByPlatform(lowF, highF);
  const permutation = permutationRateRatio(recon.map(f => ({ events: f.failures.length, exposure: years(f.fu), stratum: f.unit.platform || 'sin_modelo', group: isLow(f) })));
  const points = recon.map(f => ({ episode: f.unit.episode!, follow: f, ratePerYear: f.failures.length / Math.max(years(f.fu), 1 / 365.25) }));
  const platformsInRecon = [...new Set(recon.map(f => f.unit.platform || 'sin_modelo'))].sort();
  const dose = {
    low: group(`Menos de ${settings.partsThreshold} piezas`, lowF), high: group(`${settings.partsThreshold} piezas o más`, highF), rr: doseRR, rrMH: doseMH, permutation,
    logrankStrat: logRank(doseItems), coxStrat: coxPH(doseItems),
    spearman: spearman(points.map(p => p.episode.partsQty), points.map(p => p.ratePerYear)),
    level: ratioVerdict(lowF.length, highF.length, lowF.concat(highF).reduce((s, f) => s + f.failures.length, 0), doseRR, doseMH, permutation ? { p: permutation.p } : null),
    byPlatform: platformsInRecon.map(platform => {
      const l = lowF.filter(f => (f.unit.platform || 'sin_modelo') === platform); const h = highF.filter(f => (f.unit.platform || 'sin_modelo') === platform);
      const r = (list: FollowUp[]) => poissonRate(list.reduce((s, f) => s + f.failures.length, 0), years(list.reduce((s, f) => s + f.fu, 0)));
      return { platform, low: r(l), high: r(h), nLow: l.length, nHigh: h.length };
    }),
  };

  // Components that failed after delivery: were they replaced during the job? Are they in the platform's observed kit?
  const rows = new Map<string, ComponentRow>(); const unitsByCode = new Map<string, Set<string>>(); const offsets = new Map<string, number[]>();
  let lines = 0; let notReplaced = 0; let kitNotReplaced = 0; let within90 = 0;
  for (const f of recon) for (const line of f.partsAfter) {
    if (line.code === NO_CODE) continue;
    const episode = f.unit.episode!; const kit = (episode.platform && model.kits.get(episode.platform)) || [];
    const inKit = kit.some(k => k.code === line.code); const replaced = episode.codes.has(line.code);
    const row = rows.get(line.code) || { code: line.code, name: model.catalog[line.code] || null, lines: 0, qty: 0, units: 0, replacedAtRecon: 0, inKit, platforms: [], medianOffset: null, firstInstallLines: 0 };
    row.lines++; row.qty += line.qty; if (replaced) row.replacedAtRecon++; row.inKit = row.inKit || inKit;
    if (episode.platform && !row.platforms.includes(episode.platform)) row.platforms.push(episode.platform);
    rows.set(line.code, row);
    unitsByCode.set(line.code, (unitsByCode.get(line.code) || new Set()).add(f.unit.id));
    offsets.set(line.code, [...(offsets.get(line.code) || []), line.offset]);
    lines++; if (!replaced) { notReplaced++; if (inKit) kitNotReplaced++; } if (line.offset < 90) within90++;
  }
  for (const f of first) for (const line of f.partsAfter) { const row = rows.get(line.code); if (row) row.firstInstallLines++; }
  for (const row of rows.values()) { row.units = unitsByCode.get(row.code)?.size || 0; row.medianOffset = quantile(offsets.get(row.code) || [], 0.5); }
  const components = [...rows.values()].sort((a, b) => b.units - a.units || b.lines - a.lines || a.code.localeCompare(b.code));

  // Heat map: replacements after delivery per 100 equipment-years of each platform's reconditioned exposure.
  const exposureByPlatform: Record<string, number> = {};
  for (const f of recon) { const p = f.unit.platform || 'sin_modelo'; exposureByPlatform[p] = (exposureByPlatform[p] || 0) + years(f.fu); }
  const heatCodes = components.slice(0, 14).map(c => c.code); const heatPlatforms = platformsInRecon;
  const cells: Array<[number, number, number, number]> = [];
  heatCodes.forEach((code, y) => heatPlatforms.forEach((platform, x) => {
    const count = recon.filter(f => (f.unit.platform || 'sin_modelo') === platform).reduce((s, f) => s + f.partsAfter.filter(l => l.code === code).length, 0);
    if (count) cells.push([x, y, count, exposureByPlatform[platform] ? (100 * count) / exposureByPlatform[platform] : 0]);
  }));

  const platformsAll = [...new Set(follow.filter(f => f.unit.cohort !== 'reinstalado').map(f => f.unit.platform || 'sin_modelo'))].sort();
  const byPlatform = platformsAll.map(platform => {
    const part = (list: FollowUp[]) => { const l = list.filter(f => (f.unit.platform || 'sin_modelo') === platform);
      return { units: l.length, rate: poissonRate(l.reduce((s, f) => s + f.failures.length, 0), years(l.reduce((s, f) => s + f.fu, 0))), early90: settings.horizon >= 90 ? early(l, 90) : null }; };
    return { platform, recon: part(recon), first: part(first) };
  });

  const mix = (list: FollowUp[], key: (f: FollowUp) => string) => list.reduce<Record<string, number>>((acc, f) => { const k = key(f); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  const priorExposure = recon.reduce((s, f) => s + (f.unit.episode?.priorExposure || 0), 0);
  const comparability = {
    sector: { reacondicionado: mix(recon, f => f.unit.sector), primera_instalacion: mix(first, f => f.unit.sector), reinstalado: mix(reinstall, f => f.unit.sector) },
    platforms: { reacondicionado: mix(recon, f => f.unit.platform || 'sin_modelo'), primera_instalacion: mix(first, f => f.unit.platform || 'sin_modelo'), reinstalado: mix(reinstall, f => f.unit.platform || 'sin_modelo') },
    priorFailureRate: poissonRate(recon.reduce((s, f) => s + (f.unit.episode?.priorFailures365 || 0), 0), years(priorExposure)),
  };

  const scopeEpisodes = model.episodes.filter(e => !settings.platforms || settings.platforms.includes(e.platform || ''));
  const delivered = scopeEpisodes.filter(e => e.delivery !== null);
  const followByEpisode = new Map(recon.map(f => [f.unit.episode!.id, f]));
  const allDecisions = scopeEpisodes.flatMap(e => e.decisions);
  const recommended = allDecisions.filter(d => d.recommendation === 'sustituir' || d.recommendation === 'reparar');
  const rejected = recommended.filter(d => d.authorization_status === 'rechazada').length; const postponed = recommended.filter(d => d.authorization_status === 'pospuesta').length;
  const decided = recommended.filter(d => d.authorization_status !== 'pendiente' && d.authorization_status !== 'no_aplica');
  const allCosts = model.payload.costs.filter(c => !settings.platforms || settings.platforms.includes(model.platformBySerial.get(c.serial_key) || ''));
  const byPhase = allCosts.reduce<Record<string, number>>((acc, c) => { acc[c.phase] = (acc[c.phase] || 0) + Number(c.amount_mxn); return acc; }, {});
  const correctiveServices = [...model.bySerial.values()].flat().filter(s => s.kind === 'correctivo');
  const quality = {
    episodes: scopeEpisodes.length, delivered: delivered.length, byInstall: delivered.filter(e => e.deliverySource === 'instalacion').length,
    byAssignment: delivered.filter(e => e.deliverySource === 'asignacion').length, notDelivered: scopeEpisodes.length - delivered.length,
    internal: delivered.filter(e => e.internal).length, incomplete90: recon.filter(f => f.fu < 90 && f.first === null).length,
    capturedEpisodes: scopeEpisodes.filter(e => e.captured).length, decisions: allDecisions.length, tests: scopeEpisodes.reduce((s, e) => s + e.tests.length, 0),
    links: scopeEpisodes.reduce((s, e) => s + e.links.length, 0), costs: allCosts.length, firstYearStart: isoOfDay(model.historyStartDay),
    recordsWithoutParts: correctiveServices.filter(s => !s.parts.length).length, correctives: correctiveServices.length,
  };
  const trd = {
    recommended: recommended.length, executed: recommended.filter(d => d.action_taken === 'sustituido' || d.action_taken === 'reparado').length, rejected, postponed,
    pending: recommended.filter(d => d.authorization_status === 'pendiente').length, rate: wilson(rejected + postponed, decided.length),
    level: (recommended.length ? (decided.length >= 10 ? 'indicio' : 'insuficiente') : 'sin_datos') as Level,
  };
  const costs = {
    total: allCosts.reduce((s, c) => s + Number(c.amount_mxn), 0), proven: allCosts.filter(c => c.nature === 'comprobado').reduce((s, c) => s + Number(c.amount_mxn), 0),
    estimated: allCosts.filter(c => c.nature === 'estimado').reduce((s, c) => s + Number(c.amount_mxn), 0), byPhase,
    episodesWithBudget: scopeEpisodes.filter(e => e.captured && e.captured.budget_requested_mxn !== null && e.captured.budget_approved_mxn !== null).length,
    level: (allCosts.length ? 'insuficiente' : 'sin_datos') as Level,
  };
  const rqi = scopeEpisodes.map(episode => {
    const f = followByEpisode.get(episode.id) || null; const definitive = !!f && (f.fu >= 90 || (f.first !== null && f.first < 90));
    const in90 = <T extends { offset: number }>(list: T[]) => list.filter(x => x.offset < 90);
    const rec = episode.decisions.filter(d => d.recommendation === 'sustituir' || d.recommendation === 'reparar');
    const cost90 = f && episode.costs.length ? episode.costs.filter(c => { const d = toDay(c.occurred_on); return d !== null && d >= f.unit.t0 && d < f.unit.t0 + 90; })
      .reduce((s, c) => s + Number(c.amount_mxn), 0) : null;
    return {
      episode, follow: f, definitive, failure90: f ? (f.first !== null && f.first < 90 ? true : f.fu >= 90 ? false : null) : null,
      interventions90: f && definitive ? in90(f.interventions).length : null, tickets90: f && definitive ? f.tickets.filter(t => t < 90).length : null,
      parts90: f && definitive ? in90(f.partsAfter).reduce((s, l) => s + l.qty, 0) : null, release: episode.captured?.release_result || 'sin_registro',
      rejected: rec.filter(d => d.authorization_status === 'rechazada' || d.authorization_status === 'pospuesta').length, recommended: rec.length, cost90,
    };
  }).sort((a, b) => b.episode.start - a.episode.start);

  const analysis: Analysis = {
    settings, recon: R, first: F, reinstall: I, comparison, early: earlyWindows, dose, points, components,
    componentTotals: { lines, notReplaced, share: wilson(notReplaced, lines), kitNotReplaced, within90 }, heat: { platforms: heatPlatforms, codes: heatCodes, cells, exposureByPlatform },
    byPlatform, repeat: { recon: repeatShare(recon), first: repeatShare(first) }, duration: { recon: minutesSummary(recon), first: minutesSummary(first) },
    comparability, quality, trd, costs, rqi, findings: [],
  };
  analysis.findings = findingsOf(analysis);
  return analysis;
}

// ── Strategic questions answered only with computed results ───────────────────────────────────────────────────
function findingsOf(a: Analysis): Finding[] {
  const out: Finding[] = []; const h = a.settings.horizon;
  const e90 = a.early.find(w => w.days === 90) || a.early[a.early.length - 1];
  {
    const rr = a.comparison.rr; const mh = a.comparison.rrMH;
    const parts = [
      a.recon.rate && a.first.rate ? `Correctivos por equipo-año (calendario): reacondicionados ${fmt(a.recon.rate.rate)} (${ci(a.recon.rate.low, a.recon.rate.high)}; ${a.recon.units} equipos, ${fmt(a.recon.exposureYears, 1)} equipos-año) frente a primera instalación ${fmt(a.first.rate.rate)} (${ci(a.first.rate.low, a.first.rate.high)}; ${a.first.units} equipos, ${fmt(a.first.exposureYears, 1)} equipos-año).` : '',
      rr ? `Razón de tasas ${fmt(rr.ratio)} (${ci(rr.low, rr.high)}).` : '',
      mh ? `Ajustada por modelo (Mantel–Haenszel): ${fmt(mh.ratio)} (${ci(mh.low, mh.high)}).` : '',
      a.comparison.rrBoot ? `Intervalo robusto por equipo (bootstrap): ${fmt(a.comparison.rrBoot.low)}–${fmt(a.comparison.rrBoot.high)}.` : '',
    ].filter(Boolean);
    out.push({ id: 'tasa', question: '¿Los equipos reacondicionados presentan una mayor tasa de fallas que los nuevos?', answer: parts.join(' ') || 'Sin equipos suficientes en el filtro.', level: a.comparison.level,
      detail: 'La comparación es con equipos cuya primera aparición en el historial es su instalación. Las poblaciones difieren en clientes y sector (ver «Comparabilidad»); el ajuste solo controla el modelo.' });
  }
  if (e90) {
    out.push({ id: 'temprana', question: `¿Fallan más en los primeros ${e90.days} días?`, level: e90.level,
      answer: e90.recon && e90.first && e90.diff ? `Con correctivo en los primeros ${e90.days} días: reacondicionados ${propText(e90.recon)}; primera instalación ${propText(e90.first)}. Diferencia ${fmt(e90.diff.d * 100, 1)} puntos (IC 95 % ${fmt(e90.diff.low * 100, 1)} a ${fmt(e90.diff.high * 100, 1)}); prueba exacta de Fisher p = ${fmt(e90.p ?? 1, 3)}.` : 'Sin equipos con la ventana completa.',
      detail: 'Solo cuentan los equipos con la ventana completa observada o con una falla dentro de ella; los demás no se suponen sin falla.' });
  }
  {
    const t = a.comparison.tickets;
    out.push({ id: 'soporte', question: '¿Generan más demanda de soporte para el cliente?', level: t.level,
      answer: [
        a.recon.tickets && a.first.tickets ? `Tickets de soporte por equipo-año: reacondicionados ${fmt(a.recon.tickets.rate)} (${ci(a.recon.tickets.low, a.recon.tickets.high)}) frente a primera instalación ${fmt(a.first.tickets.rate)} (${ci(a.first.tickets.low, a.first.tickets.high)}).` : '',
        t.rr ? `Razón ${fmt(t.rr.ratio)} (${ci(t.rr.low, t.rr.high)}).` : '', t.rrMH ? `Ajustada por modelo ${fmt(t.rrMH.ratio)} (${ci(t.rrMH.low, t.rrMH.high)}).` : '',
        t.rrBoot ? `Intervalo robusto por equipo (bootstrap): ${fmt(t.rrBoot.low)}–${fmt(t.rrBoot.high)}.` : '',
      ].filter(Boolean).join(' '),
      detail: 'Un ticket es una solicitud del cliente (falla, duda de uso o configuración), no necesariamente una falla del equipo. Es la medida disponible más cercana a la carga que percibe el cliente.' });
  }
  {
    const s = (summary: CohortSummary, t: number) => summary.milestones.find(m => m.t === t)?.step;
    const marks = [30, 90, 180, 365].filter(t => t <= h).map(t => { const x = s(a.recon, t); const y = s(a.first, t);
      return `${t} d: ${x ? pct(x.s) : 'sin estimación'} frente a ${y ? pct(y.s) : 'sin estimación'}`; }).join(' · ');
    const cox = a.comparison.coxStrat;
    out.push({ id: 'supervivencia', question: '¿Cuánto tiempo transcurre entre la instalación y la primera falla?', level: a.comparison.survivalLevel,
      answer: `Probabilidad de seguir sin correctivo (Kaplan–Meier), reacondicionados frente a primera instalación — ${marks}. Mediana: ${a.recon.median !== null ? `${a.recon.median} d` : 'no alcanzada'} frente a ${a.first.median !== null ? `${a.first.median} d` : 'no alcanzada'}.${cox ? ` Riesgo relativo de primera falla (Cox estratificado por modelo): ${fmt(cox.hr[0])} (${ci(cox.low[0], cox.high[0])}).` : ''}${a.comparison.logrank ? ` Log-rank p = ${fmt(a.comparison.logrank.p, 3)}.` : ''}` });
  }
  {
    const d = a.dose; const mh = d.rrMH;
    out.push({ id: 'piezas', question: '¿Existe relación entre lo que se invierte en piezas durante el reacondicionamiento y la confiabilidad posterior?', level: d.level,
      answer: [
        d.low.rate && d.high.rate ? `${d.low.label}: ${fmt(d.low.rate.rate)} correctivos por equipo-año (${ci(d.low.rate.low, d.low.rate.high)}; ${d.low.follow.length} equipos); ${d.high.label.toLowerCase()}: ${fmt(d.high.rate.rate)} (${ci(d.high.rate.low, d.high.rate.high)}; ${d.high.follow.length} equipos).` : '',
        d.low.firstYear && d.high.firstYear ? `Con al menos un correctivo en el seguimiento: ${propText(d.low.firstYear)} frente a ${propText(d.high.firstYear)}.` : '',
        mh ? `Razón ajustada por modelo ${fmt(mh.ratio)} (${ci(mh.low, mh.high)}).` : '',
        d.permutation ? `Permutación dentro de cada modelo (robusta a fallas repetidas): p = ${fmt(d.permutation.p, 3)} (una cola).` : '',
      ].filter(Boolean).join(' '),
      detail: 'Hoy la inversión solo puede medirse en piezas registradas (no hay precios ni presupuestos capturados). Asociación observada, no prueba causal: los equipos en peor estado pueden recibir más piezas y aun así fallar más.' });
  }
  {
    const t = a.componentTotals;
    out.push({ id: 'componentes', question: '¿Qué componentes fallan y cuáles pudieron haberse reemplazado durante el reacondicionamiento?', level: t.lines >= 10 ? 'indicio' : 'insuficiente', exploratory: true,
      answer: t.share ? `En los correctivos posteriores a la entrega se sustituyeron ${t.lines} líneas de piezas; ${t.notReplaced} (${pct(t.share.p)}; IC 95 % ${pct(t.share.low)}–${pct(t.share.high)}) no se habían cambiado en el reacondicionamiento y ${t.kitNotReplaced} pertenecen al kit que el taller cambia habitualmente en ese modelo. ${t.within90} ocurrieron en los primeros 90 días.${a.components[0] ? ` Más frecuente: ${a.components[0].code}${a.components[0].name ? ` (${a.components[0].name})` : ''}.` : ''}` : 'Sin piezas registradas en correctivos posteriores.',
      detail: 'Que una pieza no se haya cambiado y falle después no prueba que cambiarla lo habría evitado: la relación la documenta un ingeniero en «Registro».' });
  }
  out.push({ id: 'costo', question: '¿Cuánto cuesta realmente ahorrar en refacciones si después se requieren visitas?', level: a.costs.level,
    answer: a.costs.total ? `Costos capturados: $${fmt(a.costs.total, 0)} (comprobados $${fmt(a.costs.proven, 0)}, estimados $${fmt(a.costs.estimated, 0)}). ${a.costs.episodesWithBudget} episodios con presupuesto solicitado y aprobado.` : 'Orion no registra todavía precios de piezas, viáticos ni presupuestos solicitados/aprobados. Se responde al capturarlos en «Registro»; mientras tanto el «Laboratorio de decisión» calcula escenarios con supuestos explícitos.' });
  out.push({ id: 'indisponibilidad', question: '¿Cuántas horas de indisponibilidad generan los equipos reacondicionados?', level: 'sin_datos',
    answer: `No se registra el tiempo fuera de servicio. Dato parcial disponible: duración registrada de los correctivos — mediana ${a.duration.recon.median !== null ? `${fmt(a.duration.recon.median / 60, 1)} h` : 'sin dato'} (${a.duration.recon.n} servicios) en reacondicionados y ${a.duration.first.median !== null ? `${fmt(a.duration.first.median / 60, 1)} h` : 'sin dato'} (${a.duration.first.n}) en primera instalación. Es tiempo de intervención, no de indisponibilidad.` });
  {
    const rows = a.byPlatform.filter(p => p.recon.units >= 5);
    out.push({ id: 'modelos', question: '¿Qué modelos presentan mayor riesgo?', level: rows.some(r => r.recon.units >= 10 && r.first.units >= 10) ? 'indicio' : 'insuficiente', exploratory: true,
      answer: rows.length ? rows.map(r => `${r.platform}: ${r.recon.rate ? fmt(r.recon.rate.rate) : '—'} reacondicionados (${r.recon.units} eq.) frente a ${r.first.rate ? fmt(r.first.rate.rate) : '—'} primera instalación (${r.first.units} eq.)`).join(' · ') + ' correctivos por equipo-año.' : 'Ningún modelo alcanza 5 equipos reacondicionados con seguimiento.',
      detail: 'Análisis exploratorio por modelo, sin corrección por comparaciones múltiples: sirve para priorizar, no para concluir.' });
  }
  out.push({ id: 'trd', question: '¿Cuántas recomendaciones técnicas no se ejecutaron y qué pasó después?', level: a.trd.level,
    answer: a.trd.recommended ? `${a.trd.recommended} recomendaciones registradas: ${a.trd.rejected} rechazadas, ${a.trd.postponed} pospuestas, ${a.trd.pending} pendientes de decisión.${a.trd.rate ? ` Tasa de rechazo o aplazamiento ${propText(a.trd.rate)}.` : ''}` : 'Aún no se registran recomendaciones ni autorizaciones. Sin ese registro, una pieza negada no deja rastro en ningún sistema.' });
  return out;
}

// ── Decision lab: Monte Carlo over the observed failure rates (Jeffreys posterior) and explicit cost assumptions ──
export interface ScenarioInput { visitCost: number; partCost: number; partsPerCorrective: number; extraParts: number; newUnitPrice: number | null; years: number; draws?: number; seed?: number }
export interface ScenarioResult { key: 'A' | 'B' | 'C' | 'D'; label: string; available: boolean; reason?: string; upfront: number; rate: Rate | null;
  correctives: { median: number; low: number; high: number } | null; total: { median: number; low: number; high: number } | null; samples: number[] }
export function simulateScenarios(a: Analysis, input: ScenarioInput) {
  const draws = input.draws ?? 10000; const random = seededRandom(input.seed ?? 42);
  const sample = (rate: Rate | null) => rate ? Array.from({ length: draws }, () => gammaSample(rate.events + 0.5, random) / rate.exposure) : null;
  const perCorrective = input.visitCost + input.partsPerCorrective * input.partCost;
  const summary = (values: number[]) => ({ median: quantile(values, 0.5)!, low: quantile(values, 0.05)!, high: quantile(values, 0.95)! });
  const build = (key: ScenarioResult['key'], label: string, rate: Rate | null, upfront: number, reason?: string): ScenarioResult => {
    const lambdas = rate && rate.exposure > 0 ? sample(rate) : null;
    if (!lambdas) return { key, label, available: false, reason: reason || 'Sin exposición observada', upfront, rate, correctives: null, total: null, samples: [] };
    const correctives = lambdas.map(l => l * input.years); const totals = correctives.map(c => upfront + c * perCorrective);
    return { key, label, available: true, upfront, rate, correctives: summary(correctives), total: summary(totals), samples: totals };
  };
  const A = build('A', 'A · Inversión mínima (como los reacondicionamientos con pocas piezas)', a.dose.low.rate, 0);
  const B = build('B', 'B · Protocolo observado (como los reacondicionamientos con más piezas)', a.dose.high.rate, input.extraParts * input.partCost);
  const C: ScenarioResult = { key: 'C', label: 'C · Reacondicionamiento integral', available: false, reason: 'No hay episodios registrados con alcance «integral»; se habilita al capturarlos.', upfront: 0, rate: null, correctives: null, total: null, samples: [] };
  const D = input.newUnitPrice ? build('D', 'D · Sustitución por un equipo nuevo', a.first.rate, input.newUnitPrice) : { ...C, key: 'D' as const, label: 'D · Sustitución por un equipo nuevo', reason: 'Captura el precio del equipo nuevo para evaluarlo.' };
  const diff = A.available && B.available ? A.samples.map((x, i) => x - B.samples[i]) : null;
  return { scenarios: [A, B, C, D], difference: diff ? { ...summary(diff), pBCheaper: diff.filter(v => v > 0).length / diff.length } : null, perCorrective };
}
