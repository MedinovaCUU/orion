import catalog from './ba400Parts.generated.json';
import type { DriEquipmentModel, DriHypothesisResult } from '../types/dri.types';

export const BA400_PARTS = catalog;
export const BA400_PART_BY_ID = new Map(catalog.map(part => [part.id, part]));
export type Ba400Part = (typeof catalog)[number];

/** Curated location anchors, not a bill of defective parts. No fuzzy matching.
 * Source: ba400.rules.ts candidate assemblies + supplied componentes.json.
 * Missing/ambiguous replacements deliberately stay outside this table. */
export const BA400_RULE_LOCATIONS = [
  { ruleId: 'ba400_optical_photometry', partIds: ['banco_opt'], serviceCodes: ['AC16614'],
    scope: 'Banco óptico: referencia del conjunto fotométrico. DRI no identifica aquí un filtro específico.' },
  { ruleId: 'ba400_r2_dispensing', partIds: ['brazo_r2'], serviceCodes: [],
    scope: 'Brazo R2 identificado en el catálogo. Bombas, válvulas y agitador requieren identificación adicional.' },
  { ruleId: 'ba400_temperature', partIds: ['rotor_pm', 'frio_rea'], serviceCodes: [],
    scope: 'Ubicaciones de reacción y refrigeración citadas por la regla. No identifica un sensor térmico averiado.' },
  { ruleId: 'ba400_wash_carryover', partIds: ['cabezal_lav', 'rotor_pm'], serviceCodes: [],
    scope: 'Cabezal de lavado y rotor de 120 pocillos: referencias de ubicación del lavado y las cubetas.' },
] as const;

export interface Ba400Association {
  partId: string;
  basis: 'service_code' | 'rule_location';
  source: string;
  scope: string;
}
export function resolveBa400Finding(platform: DriEquipmentModel, finding: DriHypothesisResult | null) {
  const associations = new Map<string, Ba400Association>();
  if (platform !== 'BA400' || !finding) return { associations: [], pending: [] as string[] };
  // A code must occupy the entire structured candidate entry. Never scan prose.
  for (const code of finding.candidateParts) {
    for (const part of catalog.filter(p => p.serviceCode && p.serviceCode === code)) {
      associations.set(part.id, { partId: part.id, basis: 'service_code', source: code,
        scope: `Código de servicio exacto ${code} proporcionado por DRI.` });
    }
  }
  for (const location of BA400_RULE_LOCATIONS) {
    if (!finding.matchedRuleIds.includes(location.ruleId)) continue;
    // Fail closed if the catalog changes a declared service identity.
    if (!location.serviceCodes.every(code => location.partIds.some(id => BA400_PART_BY_ID.get(id)?.serviceCode === code))) continue;
    for (const id of location.partIds) {
      if (BA400_PART_BY_ID.has(id) && !associations.has(id)) {
        associations.set(id, { partId: id, basis: 'rule_location', source: location.ruleId, scope: location.scope });
      }
    }
  }
  const pending = finding.candidateParts.filter(candidate => !catalog.some(p => p.serviceCode && p.serviceCode === candidate));
  return { associations: [...associations.values()], pending };
}

export const DRI_FINDING_STATUS = {
  generated: 'Sospecha · sin confirmar', reviewed: 'Sospecha revisada · sin confirmar',
  confirmed: 'Hallazgo confirmado por DRI', discarded: 'Hipótesis descartada',
} as const;

/** Explicit shell inventory. Hide only owned meshes, never transform ancestors. */
export const BA400_COVER_IDS = [
  'tapa_sup', 'tapa_dos', 'tapa_mue', 'tapa_rea', 'tapa_rxn', 'tapa_opt',
  'ise_tapa_01', 'ise_tapa_02', 'ise_tapa_03', 'ventana_dos',
  'panel_der', 'panel_izq', 'panel_post', 'puerta_der', 'puerta_izq', 'frente', 'plexi',
] as const;
