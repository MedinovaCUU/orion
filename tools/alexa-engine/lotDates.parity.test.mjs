// Parity of lotDatesMx.ts (explicit zone) with the browser's lotDates.ts in Mexico.
//   node tools/alexa-engine/lotDates.parity.test.mjs
// Runs the original under TZ=America/Mexico_City and the server copy under TZ=UTC; every output must match.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const INPUTS = [
  '2028-03-31', '2028-03-19', '2026-10-10', '2026-01-01', '2025-04-06', '2022-06-15', '2019-08-01', '2026-03-08',
  '2026-10-10T05:59:59.000Z', '2026-10-10T06:00:00.000Z', '2026-10-11T01:00:00.000Z', '2026-10-10T23:59:59.999Z',
  '2022-07-01T04:30:00Z', '2022-10-30T06:30:00Z', '2026-10-09T19:00:00-06:00', '2026-10-09T15:29:00', '2026-10-09 15:29', '2026-10-09T15:29:00.1234567', '2022-07-01T12:00:00', null, '', 'no-es-fecha',
];
const PAIRS = [['2026-10-01', '2026-10-10'], ['2026-10-10T05:00:00Z', '2026-10-10'], ['2025-12-31', '2026-01-01'], ['2022-04-01', '2022-11-01'], [null, '2026-10-10']];

const probe = (file, tz) => {
  const script = `
    const m = await import(${JSON.stringify(file)});
    const inputs = ${JSON.stringify(INPUTS)};
    const pairs = ${JSON.stringify(PAIRS)};
    const row = (v) => [m.parseInstantMs(v), m.localDayStartMs(v), m.localDayEndMs(v), m.toLocalIsoDate(v), m.formatLocalDate(v)];
    console.log(JSON.stringify({ rows: inputs.map(row), pairs: pairs.map(([a, b]) => m.calendarDaysBetween(a, b)) }));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }));
};

const original = probe(join(root, 'frontend/src/modules/dri/utils/lotDates.ts'), 'America/Mexico_City');
const server = probe(join(here, 'lotDatesMx.ts'), 'UTC');
INPUTS.forEach((input, i) => assert.deepEqual(server.rows[i], original.rows[i], `input ${JSON.stringify(input)}`));
assert.deepEqual(server.pairs, original.pairs, 'calendarDaysBetween');
console.log(`lotDates parity ok (${INPUTS.length} inputs, ${PAIRS.length} pairs)`);
