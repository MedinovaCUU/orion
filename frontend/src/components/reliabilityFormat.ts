import type { Proportion, Rate } from './reliabilityStats';

// Number formatting shared by the reliability lab views (es-MX, never a fake zero for a missing value).
export const pctText = (value: number | null | undefined, digits = 0) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : `${(value * 100).toFixed(digits)} %`);
export const numText = (value: number | null | undefined, digits = 2) => (value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString('es-MX', { minimumFractionDigits: digits, maximumFractionDigits: digits }));
export const moneyText = (value: number | null | undefined) => (value === null || value === undefined ? '—' : `$${value.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`);
export const propCi = (p: Proportion | null) => (p ? `IC 95 % ${pctText(p.low)}–${pctText(p.high)} · ${p.k}/${p.n}` : 'Sin base evaluable');
export const rateCi = (r: Rate | null) => (r ? `IC 95 % ${numText(r.low)}–${numText(r.high)} · ${r.events} en ${numText(r.exposure, 1)} eq-año` : 'Sin exposición');

