/**
 * Elección del lote de producto de einfo.bio para un grupo de botellas del SAT (técnica, lote de componente y
 * mes de caducidad). Función pura: no descarga nada; recibe los candidatos ya leídos (con su CoA parseado).
 *
 * Reglas:
 *  - se consideran todos los candidatos (21TTT y 23TTT) con caducidad en el mismo mes que la botella;
 *  - un CoA con lista de componentes que incluye el lote de la botella confirma el candidato;
 *  - un CoA con lista de componentes que NO lo incluye lo descarta (nunca se elige un candidato contradicho);
 *  - se prefiere un candidato confirmado (el primero en el orden recibido: 21TTT antes que 23TTT);
 *  - solo sin confirmados se acepta "por caducidad" un candidato sin componentes legibles, y únicamente si es
 *    el único del mes que no está contradicho (con dos o más no hay forma de distinguirlos).
 */

export const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : null);

const normalizeLot = (lot) => String(lot ?? '').trim().toUpperCase();

/** Lotes de componente impresos en el CoA (sin vacíos). */
export const coaComponentLots = (coa) => (coa?.components || []).map((component) => normalizeLot(component.lot)).filter(Boolean);

/** 'confirmed' | 'contradicted' | 'unknown' para un CoA frente al lote de componente de la botella. */
export const componentVerdict = (bottleLot, coa) => {
  const lots = coaComponentLots(coa);
  if (!lots.length) return 'unknown';
  return lots.includes(normalizeLot(bottleLot)) ? 'confirmed' : 'contradicted';
};

/**
 * @param {{ lot: string, expiresAt: string }} group  lote de componente y caducidad de la botella
 * @param {Array<{ productCode: string, productLot: string, expiresAt: string | null, coa: object | null }>} candidates
 * @returns {{ match: object | null, basis: 'component' | 'expiry' | null, reason: string, evaluated: object[] }}
 */
export const chooseLotMatch = (group, candidates) => {
  const month = monthKey(group.expiresAt);
  const evaluated = (candidates || []).map((candidate) => {
    const verdict = monthKey(candidate.expiresAt) === month ? componentVerdict(group.lot, candidate.coa) : 'other_month';
    return { candidate, verdict };
  });
  const summary = evaluated.map(({ candidate, verdict }) => ({
    productCode: candidate.productCode,
    productLot: candidate.productLot,
    expiresAt: candidate.expiresAt || null,
    verdict,
    componentLots: [...new Set(coaComponentLots(candidate.coa))],
  }));
  const confirmed = evaluated.filter((item) => item.verdict === 'confirmed');
  if (confirmed.length) {
    return { match: confirmed[0].candidate, basis: 'component', reason: confirmed.length > 1 ? 'several_component_confirmed' : 'component_confirmed', evaluated: summary };
  }
  const unknown = evaluated.filter((item) => item.verdict === 'unknown');
  if (unknown.length === 1) return { match: unknown[0].candidate, basis: 'expiry', reason: 'only_same_month_lot_without_components', evaluated: summary };
  if (unknown.length > 1) return { match: null, basis: null, reason: 'ambiguous_same_month_lots', evaluated: summary };
  if (evaluated.some((item) => item.verdict === 'contradicted')) return { match: null, basis: null, reason: 'contradicted_by_coa', evaluated: summary };
  return { match: null, basis: null, reason: 'no_same_month_lot', evaluated: summary };
};
