import { supabase } from '../supabaseClient';
import type { KpiDataset, KpiRecord, KpiSummary, SlaPolicy } from './serviceKpiModel';
import type { PartsLabData } from './partsAnalytics';
import type { LateInfo } from './lateCauses';

type RpcFilters = Record<string, string | number>;
const message = (error: { message?: string } | null, fallback: string) => error?.message || fallback;

export interface KpiOptions { people: Array<{ id: string; name: string; team: string }>; clients: string[]; platforms: string[]; serials: string[]; statuses: string[] }
export interface RecordsQuery { dataset: KpiDataset; filters: RpcFilters; match: Record<string, unknown>; search: string; sort: string; desc: boolean }

export async function fetchKpiSummary(filters: RpcFilters) {
  const { data, error } = await supabase.rpc('get_service_kpi_summary', { p_filters: filters });
  if (error) throw new Error(message(error, 'No fue posible calcular los indicadores.'));
  return data as KpiSummary;
}

export async function fetchPartsLab(filters: RpcFilters) {
  const { data, error } = await supabase.rpc('get_service_parts_lab', { p_filters: filters });
  if (error) throw new Error(message(error, 'No fue posible cargar el análisis de refacciones.'));
  const lab = data as PartsLabData | null;
  if (!lab?.period || !Array.isArray(lab.services) || !Array.isArray(lab.lines)) throw new Error('El servidor no devolvió el análisis de refacciones.');
  return lab;
}

export async function fetchLateCauses(ticketIds: string[]) {
  if (!ticketIds.length) return [] as LateInfo[];
  const { data, error } = await supabase.rpc('get_ticket_late_causes', { p_ticket_ids: ticketIds });
  if (error) throw new Error(message(error, 'No fue posible consultar las causas de los cierres fuera de plazo.'));
  if (!Array.isArray(data)) throw new Error('El servidor no devolvió las causas de los cierres fuera de plazo.');
  return data as LateInfo[];
}

export async function fetchKpiOptions() {
  const { data, error } = await supabase.rpc('get_service_kpi_options');
  if (error) throw new Error(message(error, 'No fue posible cargar las opciones de filtro.'));
  return data as KpiOptions;
}

export async function fetchKpiRecords(query: RecordsQuery, offset: number, limit: number) {
  const { data, error } = await supabase.rpc('get_service_kpi_records', {
    p_dataset: query.dataset, p_filters: query.filters, p_match: query.match, p_search: query.search || null,
    p_sort: query.sort, p_desc: query.desc, p_offset: offset, p_limit: limit,
  });
  if (error) throw new Error(message(error, 'No fue posible consultar los registros.'));
  return data as { total: number; rows: KpiRecord[] };
}

// Exports page through the same RPC as the table, so the file holds exactly the filtered rows.
export async function fetchAllKpiRecords(query: RecordsQuery) {
  const rows: KpiRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await fetchKpiRecords(query, offset, 1000);
    rows.push(...page.rows);
    if (page.rows.length < 1000 || rows.length >= page.total) return { total: page.total, rows };
  }
}

export async function saveSlaPolicy(policy: Partial<SlaPolicy> & { name: string; target_hours: number }) {
  const { id, ...values } = policy;
  const result = id
    ? await supabase.from('ticket_sla_policies').update(values).eq('id', id)
    : await supabase.from('ticket_sla_policies').insert(values);
  if (result.error) throw new Error(message(result.error, 'No se pudo guardar la regla de plazo.'));
}

export async function deleteSlaPolicy(id: string) {
  const result = await supabase.from('ticket_sla_policies').delete().eq('id', id);
  if (result.error) throw new Error(message(result.error, 'No se pudo eliminar la regla de plazo.'));
}

export async function loadKpiSettings() {
  const { data, error } = await supabase.from('service_kpi_settings').select('timezone,recurrence_days,min_sample,capture_since').maybeSingle();
  if (error) throw new Error(message(error, 'No se pudieron cargar los parámetros.'));
  return data as { timezone: string; recurrence_days: number; min_sample: number; capture_since: string } | null;
}

export async function saveKpiSettings(values: { timezone: string; recurrence_days: number; min_sample: number }) {
  const { error } = await supabase.from('service_kpi_settings').update(values).eq('id', true);
  if (error) throw new Error(message(error, 'No se pudieron guardar los parámetros.'));
}
