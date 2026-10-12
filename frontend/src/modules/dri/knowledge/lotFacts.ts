import generated from './einfoLotFacts.generated.json';
import type { DriCaseReagentBottle, DriLotFacts } from '../types/dri.types';

/**
 * Hechos por lote de reactivo descargados de einfo.bio con `tools/einfo-lot-intelligence/einfo-lot-facts.mjs`
 * (IFU vigente para el lote, certificado de análisis con lotes de componente y datos de control).
 * El archivo generado se regenera con cada SAT nuevo; aquí solo se consulta. Las reglas de fecha (lote activo,
 * caducidad, estabilidad) viven en `utils/lotIntelligence.ts`.
 */
interface GeneratedLotFacts {
  schemaVersion: string;
  generatedAt: string | null;
  products?: Record<string, { code: string; title: string | null; activeLot: string | null }>;
  lots: Record<string, Partial<DriLotFacts> & { key: string | null; techniqueCode: string; componentLot: string; expiresAt: string | null }>;
  controls?: Record<string, unknown>;
}

const data = generated as unknown as GeneratedLotFacts;

const monthKey = (value: string | null | undefined) => (value ? value.slice(0, 7) : null);

/** Lotes con documentación resuelta (los no resueltos se guardan bajo `unmatched:` y se omiten). */
export const listLotFacts = (): DriLotFacts[] =>
  Object.values(data.lots || {}).filter((entry): entry is DriLotFacts => Boolean(entry && entry.key && entry.productCode));

const index = new Map<string, DriLotFacts>();
listLotFacts().forEach((facts) => {
  const byBottle = `${facts.techniqueCode}|${facts.componentLot}|${monthKey(facts.expiresAt)}`;
  const existing = index.get(byBottle);
  // Si dos lotes de producto (21xxx y 23xxx) comparten lote de componente y mes, gana el confirmado por el CoA.
  if (!existing || (!existing.componentMatchConfirmed && facts.componentMatchConfirmed)) index.set(byBottle, facts);
  index.set(facts.key, facts);
});

/** Hechos del lote de una botella: misma técnica, mismo lote de componente y mismo mes de caducidad. */
export const findLotFacts = (bottle: Pick<DriCaseReagentBottle, 'techniqueCode' | 'lot' | 'expiresAt'>): DriLotFacts | null =>
  index.get(`${bottle.techniqueCode}|${bottle.lot}|${monthKey(bottle.expiresAt)}`) || null;

export const getLotFactsByKey = (key: string | null | undefined): DriLotFacts | null => (key ? index.get(key) || null : null);

export const lotFactsGeneratedAt = () => data.generatedAt;

/** Entradas de controles (hojas de valores 18009/18010…) del archivo generado, tal cual. */
export const listControlFacts = () => Object.values(data.controls || {});
