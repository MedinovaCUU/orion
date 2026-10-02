import modelInfo from './ba400Model.generated.json';
// Cache bytes only. Each mount owns/disposes its own Three.js graph and GPU resources.
// One in-flight request is shared, including across finding changes and remounts.
export const BA400_MODEL_URL = `${import.meta.env.BASE_URL}models/ba400/BA400_web.glb?v=${modelInfo.sha256.slice(0, 12)}`;
export const BA400_MODEL_BYTES = modelInfo.bytes;
let cached: Promise<ArrayBuffer> | null = null;
let progress = 0;
const listeners = new Set<(value: number) => void>();
function report(value: number) { progress = value; listeners.forEach(fn => fn(value)); }
export function subscribeModelProgress(listener: (value: number) => void) {
  listeners.add(listener); listener(progress);
  return () => { listeners.delete(listener); };
}
export function clearBa400ModelCache() { cached = null; progress = 0; }
export function loadBa400Bytes(): Promise<ArrayBuffer> {
  if (cached) return cached;
  cached = (async () => {
    report(0);
    // Recoverable timeout includes stalls while streaming the response body.
    const response = await fetch(BA400_MODEL_URL, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`No se pudo descargar el modelo (HTTP ${response.status}).`);
    const total = Number(response.headers.get('content-length')) || BA400_MODEL_BYTES;
    let buffer: ArrayBuffer;
    if (!response.body) buffer = await response.arrayBuffer();
    else {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let received = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); received += value.byteLength;
          report(Math.min(99, received / total * 100));
        }
      } finally { reader.releaseLock(); }
      const result = new Uint8Array(received); let offset = 0;
      for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
      buffer = result.buffer;
    }
    if (buffer.byteLength < 20 || new DataView(buffer).getUint32(0, true) !== 0x46546c67) {
      throw new Error('El archivo recibido no es un modelo GLB válido.');
    }
    report(100); return buffer;
  })().catch(error => { cached = null; throw error; });
  return cached;
}
