// Installed before the components load (the Supabase client captures fetch when it is created).
// Answers get_service_parts_lab with synthetic data, or with ./parts-lab-real.local.json when the page has ?real
// (a local, uncommitted export used only to compare against the parts control workbook).
type Lab = { period: { from: string; to: string; timezone: string }; services: unknown[]; lines: Array<[string, string, number]>; codes: Record<string, string> };
let seed = 7;
const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = <T,>(items: Array<[T, number]>) => { let r = rand() * items.reduce((sum, [, w]) => sum + w, 0); for (const [item, w] of items) { if ((r -= w) <= 0) return item; } return items[0][0]; };
function synthetic(): Lab {
  const kinds: Array<[string, number]> = [['preventivo', 21], ['correctivo', 22], ['visita', 6.5], ['instalacion', 4.7], ['reacondicionamiento', 2.2], ['retiro', 1.6]];
  const platforms: Array<[string, number]> = [['BA400', 30], ['BA200', 18], ['A15', 18], ['A25', 5], ['Y15', 4], ['A15C', 1.5], ['BTS', 1], ['Destilador', 1], ['SPICA', 0.6], ['IPRO', 0.4]];
  const parts: Record<string, Array<[string, number]>> = {
    BA400: [['AC11527', 8], ['5625', 5], ['AC17092', 2], ['AC16598', 2], ['AC17199', 1], ['AC18411', 1], ['AC16565', 1]],
    BA200: [['AC11527', 5], ['AC16598', 2], ['AC17221', 1], ['ME11514', 1], ['AC16582', 1]],
    A15: [['LA10429', 12], ['ME13377', 2], ['ZO13374', 1], ['BO15206', 1]], A15C: [['LA10429', 3]], A25: [['LA10418', 4], ['CE14757', 1]],
    Y15: [['LA10429', 2]], BTS: [['PC14709', 1]], Destilador: [['FI11488', 1]], SPICA: [['AC18411', 1]], IPRO: [['ME14623', 1]],
  };
  const services: unknown[] = []; const lines: Array<[string, string, number]> = [];
  for (let m = 1; m <= 10; m++) for (let i = 0; i < 60; i++) {
    const dayOfMonth = 1 + Math.floor(rand() * (m === 10 ? 13 : 28));
    const kind = pick(kinds); const platform = pick(platforms); const id = `svc-${m}-${i}`;
    const usesParts = rand() < ({ preventivo: 0.75, correctivo: 0.55, reacondicionamiento: 0.7, visita: 0.12 } as Record<string, number>)[kind] ;
    let qty = 0;
    if (usesParts) for (let n = 0; n < 1 + Math.floor(rand() * 2); n++) { const code = pick(parts[platform]); const q = 1 + (rand() < 0.2 ? 1 : 0); qty += q; lines.push([id, code, q]); }
    services.push({ id, source: 'Historial de servicio', day: `2026-${String(m).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`, kind, ticket_id: null, folio: null,
      ref: `Servicio ${1000 + m * 100 + i}`, serial: `83${m}00${i}`, platform, client: ['Hospital Norte', 'Laboratorio Delta', 'Clínica Sur', 'IMSS Delegación'][i % 4],
      sector: rand() < 0.45 ? 'gobierno' : 'particular', sector_inferred: rand() < 0.01, people: ['Especialista Alfa', 'Especialista Beta'][i % 2], parts: qty });
  }
  return { period: { from: '2026-01-01', to: '2026-10-13', timezone: 'America/Chihuahua' }, services, lines,
    codes: { LA10429: 'Lámpara halógena 6V/10W', AC11527: '8MM PISTON SEAL KIT', 5625: 'Tubos de bombas peristálticas ISE', AC17092: 'DEGASSER MEMBRANE SPARE', LA10418: 'Lámpara halógena 12V/20W', ME13377: 'Amortiguadores de tapa' } };
}
const real = new URLSearchParams(location.search).has('real');
const original = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.includes('/rpc/get_service_parts_lab')) {
    await new Promise(resolve => setTimeout(resolve, 300));
    const body = real ? await (await original('./parts-lab-real.local.json')).text() : JSON.stringify(synthetic());
    return new Response(body, { headers: { 'Content-Type': 'application/json' } });
  }
  return original(input, init);
};
export {};
