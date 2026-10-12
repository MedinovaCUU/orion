import type { DriLotFinding, DriLotInUse } from '../types/dri.types';
import { formatLocalDate } from '../utils/lotDates';

/**
 * Lote en uso de un reactivo del caso: frasco abierto en la fecha del evento (SAT), hechos del IFU vigente
 * para ese lote y del certificado de análisis (einfo.bio) y los hallazgos que alimentan al motor.
 */
interface DriReagentLotCardProps {
  /** Lotes en uso del reactivo (R1/R2) ya evaluados con `assessReagentLots`. */
  lots: DriLotInUse[];
  /** Lote cuyos límites del IFU ya muestra la cabecera de la ficha (no se repiten aquí). */
  headerFactsKey: string | null;
  reagentCode: string;
  /** El caso trae botellas del SAT: sin ellas el bloque no se muestra. */
  hasBottles: boolean;
}

// Rojo = fuera de especificación (el motor lo trata como causa de lote); ámbar = vigilar.
const RISK_TYPES: DriLotFinding['type'][] = ['expired', 'blank_out_of_coa', 'onboard_exceeded'];
const WATCH_TYPES: DriLotFinding['type'][] = ['near_expiry', 'lot_change'];

const isRisk = (finding: DriLotFinding) => RISK_TYPES.includes(finding.type) && finding.score >= 66 && finding.observed;

const riskOf = (findings: DriLotFinding[]): 'high' | 'watch' | 'none' => {
  if (findings.some(isRisk)) return 'high';
  if (findings.some((finding) => WATCH_TYPES.includes(finding.type) || RISK_TYPES.includes(finding.type))) return 'watch';
  return 'none';
};

const badgeClass = (finding: DriLotFinding) =>
  isRisk(finding)
    ? 'dri-badge dri-badge--red'
    : WATCH_TYPES.includes(finding.type) || RISK_TYPES.includes(finding.type)
      ? 'dri-badge dri-badge--amber'
      : 'dri-badge dri-badge--neutral';

/** Números con la convención es-MX de toda la ficha (separador de miles y punto decimal). */
const formatNumber = (value: number | null | undefined, unit?: string | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const magnitude = Math.abs(value);
  const decimals = magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : magnitude >= 1 ? 2 : 3;
  return `${value.toLocaleString('es-MX', { maximumFractionDigits: decimals })}${unit ? ` ${unit}` : ''}`;
};

const expiryLabel = (lot: DriLotInUse) => {
  const date = formatLocalDate(lot.expiresAt) || lot.expiresAt;
  const source = lot.expirySource === 'coa' ? ' (CoA)' : '';
  if (lot.daysToExpiry === null) return `Cad. ${date}${source}`;
  if (lot.daysToExpiry < 0) return `Caducó ${date}${source} · hace ${Math.abs(lot.daysToExpiry)} d`;
  return `Cad. ${date}${source} · ${lot.daysToExpiry} d`;
};

/** Días a bordo del frasco el día del evento contra los que admite el IFU del lote. */
const onboardLabel = (lot: DriLotInUse) => {
  const hours = lot.facts?.ifu?.onboardStability?.hours;
  if (!hours) return lot.facts?.ifu?.onboardStability?.text ? 'Ver IFU' : null;
  const days = Math.round(hours / 24);
  const base = lot.daysOnboard === null ? `${days} d` : `${lot.daysOnboard} / ${days} d`;
  // Reactivo de trabajo preparado (ALT/AST con fosfato de piridoxal): estabilidad propia, mucho más corta.
  const working = (lot.facts?.ifu?.onboardStability?.workingReagents || []).filter((item) => typeof item.hours === 'number');
  return working.length ? `${base} · preparado ${working.map((item) => `${Math.round((item.hours as number) / 24)} d`).join(' / ')}` : base;
};

const USAGE_LABELS: Record<DriLotInUse['usage'], string | null> = {
  observed: null,
  last_known: 'último lote registrado: el SAT no lo muestra en uso el día del evento',
  stopped: 'el SAT muestra que dejó de usarse más de 14 días antes del evento',
};

/** CV total máximo de las filas de suero/plasma (las de orina/LCR no describen el uso habitual). */
const precisionLabel = (lot: DriLotInUse) => {
  const rows = (lot.facts?.ifu?.precision || []).filter((row) => !row.matrix || row.matrix === 'serum' || row.matrix === 'plasma');
  const cvs = rows.map((row) => row.totalCv ?? row.repeatabilityCv).filter((value): value is number => typeof value === 'number');
  if (!cvs.length) return null;
  return `CV total ≤ ${formatNumber(Math.max(...cvs))} %`;
};

/**
 * Blanco de reactivo: el sentido del límite sale del certificado (máximo en reactivos crecientes, mínimo en los
 * de NADH decrecientes) y el valor de fábrica solo se muestra junto a su propia especificación.
 */
const blankLabel = (lot: DriLotInUse) => {
  const coa = lot.facts?.coa?.controlData.find((row) => /REAGENT ABSORBANCE/i.test(row.name)) || null;
  const parameters = (lot.facts?.ifu?.parameters || {}) as Record<string, unknown>;
  const reaction = parameters.reactionType as Record<string, unknown> | undefined;
  const decreasing = typeof reaction?.ba400 === 'string' && /decrec/i.test(reaction.ba400);
  const limit = parameters.blankAbsorbanceLimit as Record<string, unknown> | undefined;
  const ifuLimit = limit && typeof limit.ba400 === 'number' ? limit.ba400 : null;
  const coaMin = typeof coa?.specMin === 'number' && coa.specMin > 0 ? coa.specMin : null;
  const coaMax = typeof coa?.specMax === 'number' ? coa.specMax : null;
  const below = coaMin !== null && coaMax === null ? true : coaMax !== null ? false : decreasing;
  const parts: string[] = [];
  if (ifuLimit !== null) parts.push(`IFU ${below ? '≥' : '≤'} ${formatNumber(ifuLimit)} Abs`);
  if (coa && typeof coa.result === 'number' && (coaMax !== null || coaMin !== null)) {
    parts.push(`CoA ${formatNumber(coa.result)} (${coaMax !== null ? `máx. ${formatNumber(coaMax)}` : `mín. ${formatNumber(coaMin)}`})`);
  }
  return parts.length ? parts.join(' · ') : null;
};

const codesLabel = (codes: string[] | undefined) => (codes && codes.length ? codes.join(' · ') : null);

export default function DriReagentLotCard({ lots, headerFactsKey, reagentCode, hasBottles }: DriReagentLotCardProps) {
  if (!hasBottles) {
    return null;
  }

  return (
    <div className="dri-reagent-detail__group dri-lot" data-testid="dri-reagent-lot">
      <span className="dri-panel__eyebrow">Lote en uso · SAT + einfo.bio</span>
      {!lots.length ? (
        <p className="dri-lot__empty">Sin frascos de este reactivo pipeteados hasta la fecha del evento en el reporte SAT.</p>
      ) : (
        lots.map((lot) => {
          const ifu = lot.facts?.ifu || null;
          // Los límites del lote que gobierna la cabecera ya se ven arriba; aquí solo los de otro lote (p. ej. R2 de otro producto).
          const showLimits = Boolean(ifu) && lot.facts?.key !== headerFactsKey;
          const productLabel = lot.facts
            ? `${lot.facts.productCode} · ${lot.facts.productLot}${lot.facts.componentMatchConfirmed ? '' : ' (inferido por caducidad)'}`
            : 'sin ficha einfo';
          const facts: Array<[string, string | null]> = [
            ['Producto / lote', productLabel],
            ['IFU del lote', ifu ? `${ifu.ifuCode || 's/n'}${ifu.ifuDate ? ` · ${ifu.ifuDate}` : ''}` : null],
            ['Límite detección', showLimits ? formatNumber(ifu?.detectionLimit?.value, ifu?.detectionLimit?.unit) : null],
            ['Límite linealidad', showLimits ? formatNumber(ifu?.linearityLimit?.value, ifu?.linearityLimit?.unit) : null],
            ['Estabilidad a bordo', onboardLabel(lot)],
            ['Blanco de reactivo', blankLabel(lot)],
            ['Precisión IFU', precisionLabel(lot)],
            ['Calibradores', codesLabel(ifu?.calibratorCodes)],
            ['Controles', codesLabel(ifu?.controlCodes)],
          ];
          const usage = [
            lot.opening.firstSeenAt ? `Frasco abierto ${formatLocalDate(lot.opening.firstSeenAt)}` : null,
            lot.opening.lastSeenAt ? `último pipeteo ${formatLocalDate(lot.opening.lastSeenAt)}` : null,
            `${lot.bottle.pipettingCount.toLocaleString('es-MX')} pipeteos del lote`,
            `${lot.bottle.bottleCount} frasco${lot.bottle.bottleCount === 1 ? '' : 's'}`,
            lot.previousLot ? `antes lote ${lot.previousLot}${lot.lotChangedDaysBefore !== null ? ` (cambio hace ${lot.lotChangedDaysBefore} d)` : ''}` : null,
            USAGE_LABELS[lot.usage],
          ].filter(Boolean);
          return (
            <article
              key={`${lot.reagentId}-${lot.role}`}
              className="dri-lot-card"
              data-risk={riskOf(lot.findings)}
              data-expired={lot.findings.some((finding) => finding.type === 'expired' && isRisk(finding)) ? 'true' : undefined}
              data-role={lot.role}
            >
              <header className="dri-lot-card__head">
                <strong>
                  {lot.role} · lote {lot.bottle.lot}
                </strong>
                <span className="dri-lot-card__expiry">{expiryLabel(lot)}</span>
                {lot.facts ? (
                  <a className="dri-lot-card__link" href={lot.facts.sourceUrl} target="_blank" rel="noreferrer">
                    Documentos del lote en einfo.bio ↗
                  </a>
                ) : null}
              </header>
              <dl className="dri-lot-card__facts">
                {facts
                  .filter((entry): entry is [string, string] => Boolean(entry[1]))
                  .map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
              <p className="dri-lot-card__usage">{usage.join(' · ')}</p>
              {lot.findings.length ? (
                <ul className="dri-lot-card__findings" aria-label={`Hallazgos del lote ${lot.bottle.lot} (${reagentCode} ${lot.role})`}>
                  {lot.findings.map((finding) => (
                    <li key={finding.id} className="dri-lot-finding">
                      <span className={badgeClass(finding)}>
                        {finding.title.replace(`${reagentCode} ${lot.role} · `, '').replace(`${reagentCode} · `, '')}
                      </span>
                      <span className="dri-lot-finding__text">{finding.explanation}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          );
        })
      )}
    </div>
  );
}
