/**
 * Cliente mínimo de einfo.bio (documentación electrónica de Biosystems) sin dependencias.
 *
 * - `searchProduct(code)`: POST /Home/Docs con el token antifalsificación de la página de inicio;
 *   devuelve título, lote vigente y la lista de lotes publicados con su caducidad.
 * - `fetchLotDocuments(lot, code)`: GET /{lot}/{code}/{lang}; devuelve las pestañas (IFU, SDS, CoA,
 *   Value Sheet, eFile) con el PDF embebido en base64.
 *
 * Todas las llamadas son secuenciales y con pausa para no castigar el sitio.
 */
const UA = { 'User-Agent': 'Orion-DRI-EInfo-LotIntelligence/1.0 (+biosystems.com.mx)' };
const DELAY_MS = 450;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseExpiry = (text) => {
  const match = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null;
};

const decodeEntities = (value) =>
  value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    if (code[0] !== '#') return named[code.toLowerCase()] || entity;
    const numeric = code[1].toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
    return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
  });

const readTitle = (html) => {
  const match = html.match(/class="card-titleDoc"[^>]*>([\s\S]*?)<\//);
  return match ? decodeEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()) : null;
};

const readLots = (html, code) =>
  [...html.matchAll(/href="\/(\d+)\/(\d+)\/[a-z]{2}"[^>]*>([\s\S]*?)<\/a>/g)]
    .filter((match) => match[2] === code)
    .map((match) => ({ lot: match[1], text: match[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() }))
    .filter((entry) => /Expires|Caduca|Vence/i.test(entry.text) || /\d{2}\/\d{2}\/\d{4}/.test(entry.text))
    .reduce((acc, entry) => {
      if (!acc.some((item) => item.lot === entry.lot)) acc.push({ lot: entry.lot, expiresAt: parseExpiry(entry.text) });
      return acc;
    }, []);

export class EInfoClient {
  constructor({ lang = 'es', log = () => {} } = {}) {
    this.lang = lang;
    this.log = log;
    this.cookie = '';
    this.token = null;
    this.searchCache = new Map();
    this.pageCache = new Map();
  }

  async prime() {
    if (this.token) return;
    const home = await fetch('https://einfo.bio/', { headers: UA });
    const cookies = home.headers.getSetCookie ? home.headers.getSetCookie() : [];
    this.cookie = cookies.map((cookie) => cookie.split(';')[0]).join('; ');
    const html = await home.text();
    this.token = (html.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/) || [])[1] || null;
    if (!this.token) throw new Error('einfo.bio no devolvió el token de búsqueda');
    await sleep(DELAY_MS);
  }

  /** @returns {Promise<{code:string,title:string|null,activeLot:string|null,lots:Array<{lot:string,expiresAt:string|null}>,found:boolean}>} */
  async searchProduct(code) {
    if (this.searchCache.has(code)) return this.searchCache.get(code);
    await this.prime();
    const body = new URLSearchParams({ __RequestVerificationToken: this.token, Lang: this.lang, Code: code, Lot: '' });
    const response = await fetch('https://einfo.bio/Home/Docs', {
      method: 'POST',
      headers: { ...UA, Cookie: this.cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      redirect: 'follow',
    });
    const html = await response.text();
    const activeLot = (html.match(/class="dropdown-item active"[^>]*href="\/(\d+)\/\d+\/[a-z]{2}"/) || [])[1] || null;
    const result = { code, title: readTitle(html), activeLot, lots: readLots(html, code), found: !/No Documents Found/i.test(html) };
    this.searchCache.set(code, result);
    this.log(`einfo búsqueda ${code}: ${result.found ? `${result.lots.length} lotes` : 'sin documentos'}`);
    await sleep(DELAY_MS);
    return result;
  }

  /** @returns {Promise<{url:string,title:string|null,lots:Array<{lot:string,expiresAt:string|null}>,documents:Array<{tab:string,pdf:Buffer}>}>} */
  async fetchLotDocuments(lot, code) {
    const key = `${lot}/${code}`;
    if (this.pageCache.has(key)) return this.pageCache.get(key);
    const url = `https://einfo.bio/${lot}/${code}/${this.lang}`;
    const response = await fetch(url, { headers: { ...UA, Cookie: this.cookie } });
    const html = await response.text();
    const tabs = [...html.matchAll(/href="#(pageContent_\d+)"[^>]*>\s*([^<]+?)\s*<\/a>/g)].map((match) => ({ target: match[1], name: match[2].trim() }));
    const documents = [];
    for (const tab of tabs) {
      const start = html.indexOf(`id="${tab.target}"`);
      if (start < 0) continue;
      const segment = html.slice(start, html.indexOf('</iframe>', start) + 9);
      const match = segment.match(/src=['"]data:application\/pdf;base64,([^'"]+)['"]/);
      if (!match) continue;
      documents.push({ tab: tab.name, pdf: Buffer.from(match[1], 'base64') });
    }
    const result = { url, title: readTitle(html), lots: readLots(html, code), documents };
    this.pageCache.set(key, result);
    this.log(`einfo ${key}: ${documents.map((doc) => doc.tab).join(', ') || 'sin PDF'}`);
    await sleep(DELAY_MS);
    return result;
  }
}
