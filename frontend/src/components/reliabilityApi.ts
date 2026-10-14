// Reads and writes for the reliability lab. Reads go through get_reliability_lab() (admin only); captures are plain
// inserts/updates on the refurbishment tables — RLS, the authorization guard and the audit trigger live in the database
// (migration 20261013170000), so the browser never decides who authorized what.
import { supabase } from '../supabaseClient';
import type { LabPayload } from './reliabilityAnalytics';

export class LabUnavailableError extends Error {}

export async function fetchReliabilityLab(): Promise<LabPayload> {
  const { data, error } = await supabase.rpc('get_reliability_lab');
  if (error) {
    if (error.code === 'PGRST202' || /get_reliability_lab/.test(error.message) && /not find|does not exist/i.test(error.message)) {
      throw new LabUnavailableError('Falta aplicar la migración 20261013170000_reliability_intelligence en la base de datos.');
    }
    throw new Error(error.message);
  }
  return data as LabPayload;
}

export interface AuditEntry { table: string; row_id: string; action: string; at: string; actor: string | null; old: Record<string, unknown> | null; new: Record<string, unknown> | null }
export async function fetchAudit(rowIds: string[]): Promise<AuditEntry[]> {
  if (!rowIds.length) return [];
  const { data, error } = await supabase.rpc('get_reliability_audit', { p_row_ids: rowIds });
  if (error) throw new Error(error.message);
  return (data as AuditEntry[]) || [];
}

export type CaptureTable = 'refurbishment_episodes' | 'refurbishment_component_decisions' | 'refurbishment_acceptance_tests' | 'reliability_failure_links' | 'reliability_costs';

const friendly = (message: string) => {
  if (/Solo un administrador/.test(message)) return message;
  if (/refurbishment_component_decisions_check|authorization_reason/.test(message)) return 'Un rechazo o aplazamiento necesita su motivo.';
  if (/refurbishment_acceptance_tests_check/.test(message)) return 'Para aprobar o reprobar una prueba registra el criterio y su documento de origen.';
  if (/reliability_failure_links_check/.test(message)) return 'Afirmar o descartar una relación exige evidencia escrita; si no la hay, déjala como «no determinada».';
  if (/reliability_costs_document_once/.test(message)) return 'Ese comprobante ya está registrado en esa categoría (se evita la doble contabilización).';
  if (/duplicate key.*serial_key, started_on/.test(message)) return 'Ya existe un episodio de ese equipo con la misma fecha de inicio.';
  return message;
};

export async function insertRow<T extends Record<string, unknown>>(table: CaptureTable, row: T) {
  const { data, error } = await supabase.from(table).insert(row).select('id').single();
  if (error) throw new Error(friendly(error.message));
  return (data as { id: string }).id;
}
export async function updateRow<T extends Record<string, unknown>>(table: CaptureTable, id: string, patch: T) {
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) throw new Error(friendly(error.message));
}
