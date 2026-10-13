// Parts lab math: pure functions over the services and part lines returned by get_service_parts_lab.
// A service is one field-service record (not merged by day), like the parts control workbook.

export type Sector = 'gobierno' | 'particular';
export interface PartService {
  id: string; source: string; day: string; kind: string; ticket_id: string | null; folio: string | null; ref: string;
  serial: string | null; platform: string | null; client: string | null; sector: Sector | null; sector_inferred: boolean;
  people: string | null; parts: number;
}
export type PartLine = [serviceId: string, code: string, qty: number];
export interface PartsLabData { period: { from: string; to: string; timezone: string }; services: PartService[]; lines: PartLine[]; codes: Record<string, string> }

// Fixed categorical order (validated palette slots 1–6); everything else folds into «Otros» in gray.
export const KINDS = ['preventivo', 'correctivo', 'visita', 'instalacion', 'reacondicionamiento', 'retiro', 'otro'] as const;
export type KindKey = typeof KINDS[number];
export const kindLabels: Record<KindKey, string> = {
  preventivo: 'Preventivo', correctivo: 'Correctivo', visita: 'Visita', instalacion: 'Instalación', reacondicionamiento: 'Reacondicionamiento', retiro: 'Retiro', otro: 'Otros',
};
export const kindColors: Record<KindKey, string> = {
  preventivo: '#2a78d6', correctivo: '#eb6834', visita: '#1baf7a', instalacion: '#eda100', reacondicionamiento: '#e87ba4', retiro: '#008300', otro: '#9fb3bd',
};
export const SECTORS = ['gobierno', 'particular', 'sin_dato'] as const;
export type SectorKey = typeof SECTORS[number];
export const sectorLabels: Record<SectorKey, string> = { gobierno: 'Gobierno', particular: 'Particular', sin_dato: 'Sin sector' };
export const sectorColors: Record<SectorKey, string> = { gobierno: '#4a3aa7', particular: '#9085e9', sin_dato: '#c5d2d8' };

export const kindOf = (kind: string): KindKey => ((KINDS as readonly string[]).includes(kind) && kind !== 'otro' ? kind as KindKey : 'otro');
export const sectorOf = (service: PartService): SectorKey => service.sector || 'sin_dato';
export const monthOf = (day: string) => day.slice(0, 7);
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export const monthLabel = (key: string, withYear = false) => `${MONTHS[Number(key.slice(5, 7)) - 1]}${withYear ? ` ${key.slice(2, 4)}` : ''}`;

/** Every calendar month of the period, so empty months still show as zero. */
export function monthsBetween(from: string, to: string) {
  const result: string[] = [];
  let year = Number(from.slice(0, 4)); let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4)); const endMonth = Number(to.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1; if (month > 12) { month = 1; year += 1; }
  }
  return result;
}

export interface LabFilter { sector: SectorKey | 'todos'; platform: string }
export function filterServices(services: PartService[], filter: LabFilter) {
  return services.filter(service => (filter.sector === 'todos' || sectorOf(service) === filter.sector) && (!filter.platform || service.platform === filter.platform));
}

/** Part lines of the given services, with their kind attached. */
export function linesOf(lines: PartLine[], services: PartService[]) {
  const byId = new Map(services.map(service => [service.id, service]));
  return lines.flatMap(([serviceId, code, qty]) => {
    const service = byId.get(serviceId);
    return service ? [{ service, code, qty: Number(qty) || 0 }] : [];
  });
}

export const ratio = (num: number, den: number) => (den ? num / den : null);

export interface UsageRow { kind: KindKey; services: number; withParts: number; share: number | null; parts: number; perService: number | null; gobierno: number; particular: number }
/** The workbook's «Ratio a Sep» and «Pzas.» tables: services, services with parts, parts and parts per service with parts. */
export function usageByKind(services: PartService[]): UsageRow[] {
  return KINDS.map(kind => {
    const list = services.filter(service => kindOf(service.kind) === kind);
    const withParts = list.filter(service => service.parts > 0);
    const parts = withParts.reduce((sum, service) => sum + service.parts, 0);
    return {
      kind, services: list.length, withParts: withParts.length, share: ratio(withParts.length, list.length), parts, perService: ratio(parts, withParts.length),
      gobierno: list.filter(service => service.sector === 'gobierno').length, particular: list.filter(service => service.sector === 'particular').length,
    };
  }).filter(row => row.services > 0);
}

export function totals(services: PartService[], lines: PartLine[]) {
  const withParts = services.filter(service => service.parts > 0);
  const parts = withParts.reduce((sum, service) => sum + service.parts, 0);
  const used = linesOf(lines, services);
  const byCode = new Map<string, number>();
  for (const line of used) byCode.set(line.code, (byCode.get(line.code) || 0) + line.qty);
  const ranked = [...byCode.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top5 = ranked.slice(0, 5).reduce((sum, [, qty]) => sum + qty, 0);
  return {
    services: services.length, withParts: withParts.length, share: ratio(withParts.length, services.length), parts, perService: ratio(parts, withParts.length),
    codes: ranked.length, top: ranked[0] || null, top5Share: ratio(top5, parts),
    gobierno: services.filter(service => service.sector === 'gobierno').length, particular: services.filter(service => service.sector === 'particular').length,
    inferred: services.filter(service => service.sector_inferred).length, noSector: services.filter(service => !service.sector).length,
  };
}

/** Count of services per month, split by kind or by sector. */
export function servicesByMonth(services: PartService[], months: string[], by: 'kind' | 'sector') {
  const keys: string[] = by === 'kind' ? [...KINDS] : [...SECTORS];
  const index = new Map(months.map((month, i) => [month, i]));
  const counts = Object.fromEntries(keys.map(key => [key, months.map(() => 0)])) as Record<string, number[]>;
  for (const service of services) {
    const i = index.get(monthOf(service.day));
    if (i === undefined) continue;
    counts[by === 'kind' ? kindOf(service.kind) : sectorOf(service)][i] += 1;
  }
  return keys.filter(key => counts[key].some(Boolean)).map(key => ({ key, values: counts[key] }));
}

/** Share of each kind's services that used parts, month by month (null where the kind had no services). */
export function monthlyShare(services: PartService[], months: string[]) {
  return KINDS.map(kind => {
    const values = months.map(month => {
      const list = services.filter(service => kindOf(service.kind) === kind && monthOf(service.day) === month);
      const withParts = list.filter(service => service.parts > 0).length;
      return { n: list.length, withParts, share: ratio(withParts, list.length) };
    });
    return { kind, values };
  }).filter(row => row.values.some(value => value.withParts > 0));
}

export interface ParetoRow { code: string; qty: number; services: number; share: number; cumulative: number }
/** Codes by quantity with their cumulative share of all parts (the classic 80/20 reading). */
export function pareto(lines: PartLine[], services: PartService[], kind: KindKey | 'todos'): ParetoRow[] {
  const scoped = kind === 'todos' ? services : services.filter(service => kindOf(service.kind) === kind);
  const qty = new Map<string, number>(); const users = new Map<string, Set<string>>();
  for (const line of linesOf(lines, scoped)) {
    qty.set(line.code, (qty.get(line.code) || 0) + line.qty);
    if (!users.has(line.code)) users.set(line.code, new Set());
    users.get(line.code)!.add(line.service.id);
  }
  const total = [...qty.values()].reduce((sum, value) => sum + value, 0);
  let running = 0;
  return [...qty.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([code, value]) => {
    running += value;
    return { code, qty: value, services: users.get(code)!.size, share: total ? value / total : 0, cumulative: total ? running / total : 0 };
  });
}

/** Quantity per code and month for the most used codes. */
export function codeMonthMatrix(lines: PartLine[], services: PartService[], months: string[], top = 15) {
  const codes = pareto(lines, services, 'todos').slice(0, top).map(row => row.code);
  const index = new Map(months.map((month, i) => [month, i]));
  const cells = new Map<string, number>();
  for (const line of linesOf(lines, services)) {
    const i = index.get(monthOf(line.service.day));
    if (i === undefined || !codes.includes(line.code)) continue;
    const key = `${line.code}|${i}`;
    cells.set(key, (cells.get(key) || 0) + line.qty);
  }
  return { codes, cells: [...cells.entries()].map(([key, value]) => { const [code, i] = key.split('|'); return [Number(i), codes.indexOf(code), value] as [number, number, number]; }) };
}

/** Platform → kind → code flows of parts, folding small codes into «Otras refacciones». */
export function partFlows(lines: PartLine[], services: PartService[], topCodes = 12) {
  const used = linesOf(lines, services);
  const top = new Set(pareto(lines, services, 'todos').slice(0, topCodes).map(row => row.code));
  const links = new Map<string, number>();
  const add = (source: string, target: string, value: number) => { const key = `${source}\u0000${target}`; links.set(key, (links.get(key) || 0) + value); };
  for (const line of used) {
    const platform = `P:${line.service.platform || 'Sin plataforma'}`;
    const kind = `K:${kindOf(line.service.kind)}`;
    const code = `C:${top.has(line.code) ? line.code : 'Otras refacciones'}`;
    add(platform, kind, line.qty); add(kind, code, line.qty);
  }
  const nodes = new Set<string>();
  const list = [...links.entries()].filter(([, value]) => value > 0).map(([key, value]) => { const [source, target] = key.split('\u0000'); nodes.add(source); nodes.add(target); return { source, target, value }; });
  return { nodes: [...nodes], links: list };
}

/** Services per platform and month split by sector: the workbook's «Preventivos»/«Correctivos» sheets. */
export function platformMonthTable(services: PartService[], months: string[], kind: KindKey | 'todos') {
  const scoped = kind === 'todos' ? services : services.filter(service => kindOf(service.kind) === kind);
  const platforms = [...new Set(scoped.map(service => service.platform || 'Sin plataforma'))];
  const rows = platforms.map(platform => {
    const mine = scoped.filter(service => (service.platform || 'Sin plataforma') === platform);
    const cells = months.map(month => {
      const inMonth = mine.filter(service => monthOf(service.day) === month);
      return { gobierno: inMonth.filter(service => service.sector === 'gobierno').length, particular: inMonth.filter(service => service.sector === 'particular').length, total: inMonth.length };
    });
    return { platform, cells, total: mine.length };
  }).sort((a, b) => b.total - a.total || a.platform.localeCompare(b.platform));
  const footer = months.map((_, i) => ({
    gobierno: rows.reduce((sum, row) => sum + row.cells[i].gobierno, 0), particular: rows.reduce((sum, row) => sum + row.cells[i].particular, 0), total: rows.reduce((sum, row) => sum + row.cells[i].total, 0),
  }));
  return { rows, footer, total: scoped.length };
}
