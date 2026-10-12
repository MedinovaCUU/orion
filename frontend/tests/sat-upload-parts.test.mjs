import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// El SAT original se guarda entero si cabe y, si no, en partes con un manifiesto que permite reconstruirlo.
const root = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({ root, cacheDir: 'node_modules/.vite-dri-tests', server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const checks = [];
const check = async (name, fn) => { await fn(); checks.push(name); };
const fakeBucket = (failOn = null) => {
  const stored = new Map();
  return {
    stored,
    upload: async (path, body, options) => {
      assert.equal(options.contentType, 'application/octet-stream', 'the bucket only accepts octet-stream');
      if (failOn && path.includes(failOn)) return { error: { message: 'The object exceeded the maximum allowed size' } };
      stored.set(path, new Uint8Array(await body.arrayBuffer()));
      return { error: null };
    },
  };
};
try {
  const { uploadSatOriginal, SAT_PART_BYTES } = await vite.ssrLoadModule('/src/modules/sat-report/satReportData.ts');
  assert.equal(SAT_PART_BYTES, 45 * 1024 * 1024);
  const bytes = new Uint8Array(2500).map((_, index) => index % 251);
  const file = new File([bytes], 'SAT.A400');

  await check('a file that fits is stored whole', async () => {
    const bucket = fakeBucket();
    const result = await uploadSatOriginal(bucket, file, 'abc', 'BA400/1/x.A400', undefined, 4096);
    assert.deepEqual(result, { path: 'BA400/1/x.A400', parts: 1 });
    assert.equal(bucket.stored.size, 1);
  });

  await check('a large file is split into parts plus a manifest that rebuilds it byte for byte', async () => {
    const bucket = fakeBucket();
    const progress = [];
    const result = await uploadSatOriginal(bucket, file, 'abc', 'BA400/1/x.A400', (message) => progress.push(message), 1000);
    assert.deepEqual(result, { path: 'BA400/1/x.A400.manifest.json', parts: 3 });
    const manifest = JSON.parse(new TextDecoder().decode(bucket.stored.get(result.path)));
    assert.equal(manifest.schemaVersion, 'sat-parts-v1');
    assert.equal(manifest.fileSize, 2500);
    assert.deepEqual(manifest.parts.map((part) => part.path), ['BA400/1/x.A400.part-001-of-003', 'BA400/1/x.A400.part-002-of-003', 'BA400/1/x.A400.part-003-of-003']);
    const rebuilt = new Uint8Array(manifest.parts.flatMap((part) => [...bucket.stored.get(part.path)]));
    assert.deepEqual(rebuilt, bytes);
    assert.equal(progress.length, 3);
  });

  await check('a failing part reports which part and links nothing', async () => {
    const result = await uploadSatOriginal(fakeBucket('part-002'), file, 'abc', 'BA400/1/x.A400', undefined, 1000);
    assert.match(result.error, /parte 2 de 3: The object exceeded/);
  });
  console.log(JSON.stringify({ checks: checks.length, passed: checks }, null, 2));
} finally {
  await vite.close();
}
