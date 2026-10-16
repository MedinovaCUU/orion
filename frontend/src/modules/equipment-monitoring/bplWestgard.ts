/**
 * Reglas Westgard de Orion (criterio del dueño, 2026-10-16). El BA400 solo trae programada la 1-2s y deja
 * muchos controles en PENDING (su módulo de control aún no recibe el valor), así que Orion evalúa cada
 * control con su valor, la media y la DE del lote y la historia del mismo control:
 *
 * - Alerta ligera: 4-1s; los dos niveles más allá de 1 DE del mismo lado el mismo día; 10x o 5x por nivel
 *   del mismo lado sin pasar de 1 DE.
 * - Alarma, no definitiva: 1-2s; 1-3s y R-4s extremo piden repetir el control (una repetición normal la cierra;
 *   en R-4s extremo puede tratarse de viales de nivel intercambiados).
 * - Advertencia: 2-2s; 1-2s en los dos niveles del mismo procesado; R-4s con 1-2s en sentidos opuestos;
 *   10x o 5x por nivel del mismo lado más allá de 1 DE.
 * - Rechazo: una 1-3s o una R-4s que la repetición confirma.
 *
 * La sesión es la sesión de trabajo del BA400 (una corrida); «mismo procesado» es la misma sesión.
 */

export type BplQcSeverity = 'normal' | 'alerta_ligera' | 'alarma' | 'advertencia' | 'rechazo';

export const BPL_QC_SEVERITY_RANK: Record<BplQcSeverity, number> = {
  normal: 0,
  alerta_ligera: 1,
  alarma: 2,
  advertencia: 3,
  rechazo: 4,
};

export const BPL_QC_SEVERITY_LABELS: Record<BplQcSeverity, string> = {
  normal: 'Sin hallazgos Westgard',
  alerta_ligera: 'Alerta ligera',
  alarma: 'Alarma',
  advertencia: 'Advertencia',
  rechazo: 'Rechazo confirmado',
};

export type BplWestgardRuleId = '1-2s' | '1-3s' | '2-2s' | '1-2s-niveles' | 'R-4s' | '4-1s' | '1s-niveles' | '10x' | '5x-niveles';

export const BPL_WESTGARD_RULE_LABELS: Record<BplWestgardRuleId, string> = {
  '1-2s': '1-2s',
  '1-3s': '1-3s',
  '2-2s': '2-2s',
  '1-2s-niveles': '1-2s en ambos niveles',
  'R-4s': 'R-4s',
  '4-1s': '4-1s',
  '1s-niveles': '1 DE en ambos niveles',
  '10x': '10x',
  '5x-niveles': '5x por nivel',
};

/** Un resultado de control listo para evaluar: z contra la media y la DE del lote en uso. */
export interface BplQcPoint {
  key: string;
  testKey: string;
  /** Control y lote normalizados: cada material es una serie («nivel»). */
  materialKey: string;
  /** «nivel 1», «nivel 2» o el nombre del control cuando no se reconoce el nivel. */
  levelLabel: string;
  value: number;
  mean: number;
  sd: number;
  z: number;
  /** Milisegundos del resultado (hora del analizador). */
  at: number;
  /** Día local del resultado (AAAA-MM-DD). */
  day: string;
  sessionKey: string;
}

export type BplWestgardRepeat = 'none' | 'normal' | 'confirmed' | 'abnormal';

export interface BplWestgardFinding {
  rule: BplWestgardRuleId;
  /** Gravedad vigente: una 1-3s o R-4s confirmada por la repetición sube a rechazo. */
  severity: BplQcSeverity;
  /** 1-3s o R-4s extremo que aún no tiene repetición en la sesión. */
  needsRepeat: boolean;
  repeat: BplWestgardRepeat;
  side: 'high' | 'low' | 'both';
  /** Resultados que forman la regla, del más antiguo al que la dispara. */
  pointKeys: string[];
  /** Sesión del resultado que dispara la regla. */
  sessionKey: string;
  at: number;
  /** R-4s extremo cuyos valores coinciden con la media del otro nivel: viales intercambiados. */
  possibleSwap: boolean;
  /** Alarma de la repetición que confirma otra anterior: la descripción prefiere la original. */
  confirmsEarlier?: boolean;
  text: string;
}

export interface BplQcSessionVerdict {
  testKey: string;
  sessionKey: string;
  severity: BplQcSeverity;
  status: 'accepted' | 'pending' | 'rejected';
  needsRepeat: boolean;
  findings: BplWestgardFinding[];
  points: BplQcPoint[];
  /** Resultado que mejor explica el veredicto (el de la regla más grave o el último). */
  representativeKey: string | null;
}

export interface BplWestgardEvaluation {
  findings: BplWestgardFinding[];
  findingsByPoint: Map<string, BplWestgardFinding[]>;
  /** Clave `${testKey}|${sessionKey}`. */
  sessions: Map<string, BplQcSessionVerdict>;
}

type Side = 'high' | 'low';

const sideOf = (z: number): Side | null => (z > 0 ? 'high' : z < 0 ? 'low' : null);

const formatZ = (z: number) => `${z > 0 ? '+' : ''}${new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(z)} DE`;

const sideLabel = (side: Side) => (side === 'high' ? 'arriba' : 'abajo');

/** DE derivada del rango del lote: el BA400 programa mínimo y máximo como media ± 3 DE. */
export const BPL_QC_RANGE_SD_FACTOR = 6;

export const qcTargetFromRange = (min: number | null, max: number | null) => {
  if (min === null || max === null || !(max > min)) return null;
  return { mean: (min + max) / 2, sd: (max - min) / BPL_QC_RANGE_SD_FACTOR };
};

const statusOfFindings = (findings: BplWestgardFinding[]): BplQcSessionVerdict['status'] => {
  if (findings.some((finding) => finding.severity === 'rechazo')) return 'rejected';
  if (findings.some((finding) => finding.needsRepeat || finding.severity === 'advertencia')) return 'pending';
  return 'accepted';
};

const worstSeverity = (findings: BplWestgardFinding[]): BplQcSeverity =>
  findings.reduce<BplQcSeverity>((worst, finding) => (BPL_QC_SEVERITY_RANK[finding.severity] > BPL_QC_SEVERITY_RANK[worst] ? finding.severity : worst), 'normal');

/** Estado de un resultado de control según las reglas en las que participa. */
export const bplQcStatusOfFindings = statusOfFindings;
export const bplQcSeverityOfFindings = worstSeverity;

/** Viales intercambiados: cada valor cae dentro de ±3 DE de la media del otro nivel. */
const looksSwapped = (left: BplQcPoint, right: BplQcPoint) =>
  Math.abs(left.value - right.mean) <= 3 * right.sd && Math.abs(right.value - left.mean) <= 3 * left.sd;

/**
 * Evalúa todas las reglas sobre los resultados de una serie. Cada regla se dispara en el resultado que la
 * completa, mirando solo hacia atrás (como la ve el químico al recibir el control); después, las alarmas que
 * piden repetición se cierran o se confirman con los resultados siguientes de la misma sesión.
 */
export function evaluateBplWestgard(input: BplQcPoint[]): BplWestgardEvaluation {
  const findings: BplWestgardFinding[] = [];
  const points = input.filter((point) => Number.isFinite(point.z) && Number.isFinite(point.at));
  const byTest = new Map<string, BplQcPoint[]>();
  points.forEach((point) => {
    const bucket = byTest.get(point.testKey) || [];
    bucket.push(point);
    byTest.set(point.testKey, bucket);
  });

  byTest.forEach((testPoints) => {
    const sorted = [...testPoints].sort((left, right) => left.at - right.at || left.key.localeCompare(right.key));
    const seriesByMaterial = new Map<string, BplQcPoint[]>();
    const push = (finding: Omit<BplWestgardFinding, 'repeat' | 'sessionKey' | 'at'> & { trigger: BplQcPoint }) => {
      const { trigger, ...rest } = finding;
      findings.push({ ...rest, repeat: 'none', sessionKey: trigger.sessionKey, at: trigger.at });
    };

    sorted.forEach((point) => {
      const series = seriesByMaterial.get(point.materialKey) || [];
      series.push(point);
      seriesByMaterial.set(point.materialKey, series);
      const magnitude = Math.abs(point.z);
      const side = sideOf(point.z);

      // Un solo resultado.
      if (magnitude > 3) {
        push({ trigger: point, rule: '1-3s', severity: 'alarma', needsRepeat: true, side: side || 'high', pointKeys: [point.key], possibleSwap: false, text: `${point.levelLabel} ${formatZ(point.z)} (1-3s): repetir el control` });
      } else if (magnitude > 2) {
        push({ trigger: point, rule: '1-2s', severity: 'alarma', needsRepeat: false, side: side || 'high', pointKeys: [point.key], possibleSwap: false, text: `${point.levelLabel} ${formatZ(point.z)} (1-2s)` });
      }

      if (side) {
        // Mismo nivel, corridas seguidas.
        const previous = series[series.length - 2];
        if (previous && magnitude > 2 && Math.abs(previous.z) > 2 && sideOf(previous.z) === side) {
          push({ trigger: point, rule: '2-2s', severity: 'advertencia', needsRepeat: false, side, pointKeys: [previous.key, point.key], possibleSwap: false, text: `${point.levelLabel}: dos corridas seguidas más allá de 2 DE ${sideLabel(side)} (2-2s)` });
        }
        const lastFour = series.slice(-4);
        if (lastFour.length === 4 && lastFour.every((item) => Math.abs(item.z) > 1 && sideOf(item.z) === side)) {
          push({ trigger: point, rule: '4-1s', severity: 'alerta_ligera', needsRepeat: false, side, pointKeys: lastFour.map((item) => item.key), possibleSwap: false, text: `${point.levelLabel}: cuatro corridas seguidas más allá de 1 DE ${sideLabel(side)} (4-1s)` });
        }
        const lastTen = series.slice(-10);
        if (lastTen.length === 10 && lastTen.every((item) => sideOf(item.z) === side)) {
          const beyondOne = lastTen.every((item) => Math.abs(item.z) > 1);
          push({ trigger: point, rule: '10x', severity: beyondOne ? 'advertencia' : 'alerta_ligera', needsRepeat: false, side, pointKeys: lastTen.map((item) => item.key), possibleSwap: false, text: `${point.levelLabel}: diez corridas seguidas ${sideLabel(side)} de la media${beyondOne ? ' y más allá de 1 DE' : ''} (10x)` });
        }
      }

      // Entre niveles: el último resultado de cada otro control de la misma prueba.
      seriesByMaterial.forEach((otherSeries, otherKey) => {
        if (otherKey === point.materialKey) return;
        const sameSession = [...otherSeries].reverse().find((item) => item.sessionKey === point.sessionKey);
        if (sameSession) {
          const otherMagnitude = Math.abs(sameSession.z);
          const otherSide = sideOf(sameSession.z);
          if (magnitude > 2 && otherMagnitude > 2 && side && otherSide) {
            const pair = [sameSession.key, point.key];
            if (otherSide === side) {
              push({ trigger: point, rule: '1-2s-niveles', severity: 'advertencia', needsRepeat: false, side, pointKeys: pair, possibleSwap: false, text: `Los dos niveles más allá de 2 DE ${sideLabel(side)} en el mismo procesado` });
            } else if (magnitude <= 3 && otherMagnitude <= 3) {
              push({ trigger: point, rule: 'R-4s', severity: 'advertencia', needsRepeat: false, side: 'both', pointKeys: pair, possibleSwap: false, text: `Niveles en sentidos opuestos más allá de 2 DE (R-4s)` });
            } else {
              const possibleSwap = looksSwapped(sameSession, point);
              push({
                trigger: point,
                rule: 'R-4s',
                severity: 'alarma',
                needsRepeat: true,
                side: 'both',
                pointKeys: pair,
                possibleSwap,
                text: `Niveles en sentidos opuestos (R-4s)${possibleSwap ? ': posible intercambio de viales de nivel' : ''}: repetir los controles`,
              });
            }
          }
        }
        const sameDay = [...otherSeries].reverse().find((item) => item.day === point.day);
        if (sameDay && side && magnitude > 1 && Math.abs(sameDay.z) > 1 && sideOf(sameDay.z) === side && !(magnitude > 2 && Math.abs(sameDay.z) > 2)) {
          push({ trigger: point, rule: '1s-niveles', severity: 'alerta_ligera', needsRepeat: false, side, pointKeys: [sameDay.key, point.key], possibleSwap: false, text: `Los dos niveles más allá de 1 DE ${sideLabel(side)} el mismo día` });
        }
        const mineFive = series.slice(-5);
        const otherFive = otherSeries.slice(-5);
        if (side && mineFive.length === 5 && otherFive.length === 5 && [...mineFive, ...otherFive].every((item) => sideOf(item.z) === side)) {
          const beyondOne = [...mineFive, ...otherFive].every((item) => Math.abs(item.z) > 1);
          push({
            trigger: point,
            rule: '5x-niveles',
            severity: beyondOne ? 'advertencia' : 'alerta_ligera',
            needsRepeat: false,
            side,
            pointKeys: [...otherFive, ...mineFive].map((item) => item.key),
            possibleSwap: false,
            text: `Cinco corridas de cada nivel ${sideLabel(side)} de la media${beyondOne ? ' y más allá de 1 DE' : ''}`,
          });
        }
      });
    });

    // Repeticiones: los resultados del mismo control posteriores en la misma sesión cierran o confirman la alarma.
    const pointByKey = new Map(sorted.map((point) => [point.key, point] as const));
    const withoutRepeatRequest = (text: string) => text.replace(/: repetir (el control|los controles)$/, '');
    findings
      .filter((finding) => finding.needsRepeat && pointByKey.has(finding.pointKeys[finding.pointKeys.length - 1]))
      .forEach((finding) => {
        // Ya resuelta como confirmación de una alarma anterior.
        if (!finding.needsRepeat) return;
        const involved = finding.pointKeys.map((key) => pointByKey.get(key)!).filter(Boolean);
        const materials = new Set(involved.map((point) => point.materialKey));
        const lastAt = Math.max(...involved.map((point) => point.at));
        const repeats = sorted.filter((point) => point.sessionKey === finding.sessionKey && point.at > lastAt && materials.has(point.materialKey));
        if (!repeats.length) return;
        const opposedPair = repeats.some((point) =>
          repeats.some((other) => other.materialKey !== point.materialKey && Math.abs(point.z) > 2 && Math.abs(other.z) > 2 && sideOf(point.z) !== sideOf(other.z)),
        );
        const confirmed = repeats.some((point) => Math.abs(point.z) > 3) || (finding.rule === 'R-4s' && opposedPair);
        finding.needsRepeat = false;
        if (confirmed) {
          finding.repeat = 'confirmed';
          finding.severity = 'rechazo';
          finding.text = `${withoutRepeatRequest(finding.text)}: la repetición lo confirma`;
          // La repetición que confirma no pide otra repetición: forma parte del mismo rechazo.
          const repeatKeys = new Set(repeats.map((point) => point.key));
          findings.forEach((other) => {
            if (other === finding || !other.needsRepeat || !repeatKeys.has(other.pointKeys[other.pointKeys.length - 1])) return;
            other.needsRepeat = false;
            other.repeat = 'confirmed';
            other.severity = 'rechazo';
            other.confirmsEarlier = true;
            other.text = `${withoutRepeatRequest(other.text)}: confirma la alarma anterior`;
          });
        } else if (repeats.every((point) => Math.abs(point.z) <= 2)) {
          finding.repeat = 'normal';
          finding.text = `${withoutRepeatRequest(finding.text)}: la repetición salió normal`;
        } else {
          finding.repeat = 'abnormal';
          finding.severity = 'advertencia';
          finding.text = `${withoutRepeatRequest(finding.text)}: la repetición no volvió a lo normal`;
        }
      });
  });

  const findingsByPoint = new Map<string, BplWestgardFinding[]>();
  findings.forEach((finding) => {
    finding.pointKeys.forEach((key) => {
      const bucket = findingsByPoint.get(key) || [];
      bucket.push(finding);
      findingsByPoint.set(key, bucket);
    });
  });

  const testOfPoint = new Map(points.map((point) => [point.key, point.testKey] as const));
  const sessions = new Map<string, BplQcSessionVerdict>();
  points.forEach((point) => {
    const key = `${point.testKey}|${point.sessionKey}`;
    const verdict = sessions.get(key) || {
      testKey: point.testKey,
      sessionKey: point.sessionKey,
      severity: 'normal' as BplQcSeverity,
      status: 'accepted' as const,
      needsRepeat: false,
      findings: [],
      points: [],
      representativeKey: null,
    };
    verdict.points.push(point);
    sessions.set(key, verdict);
  });
  findings.forEach((finding) => {
    const testKey = testOfPoint.get(finding.pointKeys[0]);
    if (!testKey) return;
    const verdict = sessions.get(`${testKey}|${finding.sessionKey}`);
    if (verdict) verdict.findings.push(finding);
  });
  sessions.forEach((verdict) => {
    verdict.points.sort((left, right) => left.at - right.at);
    verdict.findings.sort((left, right) => left.at - right.at);
    verdict.severity = worstSeverity(verdict.findings);
    verdict.status = statusOfFindings(verdict.findings);
    verdict.needsRepeat = verdict.findings.some((finding) => finding.needsRepeat);
    const worst = [...verdict.findings].sort((left, right) => BPL_QC_SEVERITY_RANK[right.severity] - BPL_QC_SEVERITY_RANK[left.severity] || right.at - left.at)[0];
    verdict.representativeKey = worst ? worst.pointKeys[worst.pointKeys.length - 1] : verdict.points.at(-1)?.key || null;
  });

  return { findings, findingsByPoint, sessions };
}

/** Frase corta del veredicto de una sesión: «Alarma · Nivel 1 +3.4 DE (1-3s): repetir el control». */
export const describeBplQcVerdict = (verdict: Pick<BplQcSessionVerdict, 'severity' | 'findings'>) => {
  if (!verdict.findings.length) return BPL_QC_SEVERITY_LABELS.normal;
  const worst = [...verdict.findings].sort(
    (left, right) =>
      BPL_QC_SEVERITY_RANK[right.severity] - BPL_QC_SEVERITY_RANK[left.severity] ||
      Number(Boolean(left.confirmsEarlier)) - Number(Boolean(right.confirmsEarlier)) ||
      right.at - left.at,
  )[0];
  return `${BPL_QC_SEVERITY_LABELS[worst.severity]} · ${worst.text}`;
};
