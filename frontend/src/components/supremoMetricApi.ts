import { supabase } from '../supabaseClient';

// "Supremo en visitas presenciales": every in-person visit is compared with the Supremo registry of its
// serial number. The server freezes each outcome at the visit deadline (visit day + grace days).
export type SupremoOutcome = 'positiva' | 'negativa' | 'pendiente' | 'anulada' | 'sin_serie';
export type SupremoReason = 'ya_registrado' | 'registrado_en_plazo' | 'sin_registro' | 'id_invalido' | 'deshabilitado' | 'fuera_de_catalogo' | 'justificada' | 'sin_serie';
export interface SupremoRatio { num: number; den: number; pct: number | null }
export interface SupremoSettings {
  active: boolean; effective_from: string; grace_days: number; history_since: string; reason: string | null;
  updated_at: string; updated_by_name: string | null; timezone: string;
}
export interface SupremoVisit {
  visit_id: string; visit_date: string; deadline: string; serial: string | null; serial_key: string | null; platform: string | null; client: string | null;
  sources: string; kinds: string[]; ticket_id: string | null; folio: string | null; participant_ids: string[]; participant_names: string | null;
  unmatched_names: string | null; outcome: SupremoOutcome; reason: SupremoReason; detail: string; in_catalog: boolean; equipment_id: string | null;
  supremo_id: string | null; exemption_id: string | null; exemption_justification: string | null; exemption_by: string | null; exemption_at: string | null;
}
export interface SupremoPerson { id: string; name: string; team: string | null; positive: number; negative: number; pending: number; voided: number; compliance: SupremoRatio }
export interface SupremoMetric {
  settings: SupremoSettings;
  totals?: { visits: number; positive: number; already: number; installed: number; negative: number; pending: number; voided: number; no_serial: number };
  compliance?: SupremoRatio;
  people?: SupremoPerson[];
  visits?: SupremoVisit[];
}
export interface SupremoExemption {
  id: string; serial: string; serial_key: string; equipment_id: string | null; model: string | null; client: string | null; justification: string;
  created_at: string; created_by_name: string | null; revoked_at: string | null; revoked_by_name: string | null; revoke_reason: string | null;
}
export interface EquipmentSupremoStatus {
  active: boolean; serial_key?: string; in_catalog?: boolean; equipment_id?: string | null; model?: string | null; registered?: boolean;
  supremo_id?: string | null; enabled?: boolean; exempt?: boolean; grace_days?: number;
}

export const SUPREMO_VISITS_LIMIT = 500;
export const isValidSupremoId = (value: string) => /^\d{9}$/.test(value.replace(/\s/g, ''));
export const formatSupremoId = (value: string | null | undefined) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length === 9 ? digits.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3') : String(value || '');
};

const call = async <T>(name: string, args: Record<string, unknown>, fallback: string) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || fallback);
  return data as T;
};

export const fetchSupremoMetric = (filters: Record<string, string | number>) =>
  call<SupremoMetric>('get_supremo_metric', { p_filters: filters }, 'No fue posible calcular la métrica de Supremo.');
export const fetchSupremoExemptions = () =>
  call<SupremoExemption[]>('get_supremo_exemptions', {}, 'No fue posible cargar las justificaciones de Supremo.');
export const saveSupremoSettings = (values: { active: boolean; effective_from: string; grace_days: number; reason: string }) =>
  call<SupremoSettings>('set_supremo_metric_settings', {
    p_active: values.active, p_effective_from: values.effective_from, p_grace_days: values.grace_days, p_reason: values.reason.trim() || null,
  }, 'No se pudo guardar la configuración de la métrica de Supremo.');
export const justifySupremoExemption = (serial: string, justification: string) =>
  call<string>('justify_supremo_exemption', { p_serial: serial, p_justification: justification }, 'No se pudo registrar la justificación.');
export const revokeSupremoExemption = (id: string, reason: string) =>
  call<null>('revoke_supremo_exemption', { p_id: id, p_reason: reason }, 'No se pudo revocar la justificación.');
export const fetchEquipmentSupremoStatus = (serial: string) =>
  call<EquipmentSupremoStatus>('get_equipment_supremo_status', { p_serial: serial }, 'No fue posible consultar Supremo para este equipo.');
export const registerEquipmentSupremo = (serial: string, supremoId: string) =>
  call<EquipmentSupremoStatus>('register_equipment_supremo', { p_serial: serial, p_supremo_id: supremoId }, 'No se pudo registrar Supremo en el equipo.');
