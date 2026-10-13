// Runs an edge-function Deno test file with Node 24 (type stripping) when Deno is not installed:
//   node supabase/tests/tools/run-deno-test.mjs supabase/functions/ticket-whatsapp/handler.test.ts
// `npm:pkg@version` imports resolve to frontend/node_modules; Deno.env/Deno.test are shimmed.
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const frontend = pathToFileURL(resolve(import.meta.dirname, '../../../frontend/package.json')).href;
register(`data:text/javascript,${encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (!specifier.startsWith('npm:')) return next(specifier, context);
  const match = /^(@[^/]+\\/[^@/]+|[^@/]+)(?:@[^/]+)?(\\/.*)?$/.exec(specifier.slice(4));
  return next(match[1] + (match[2] || ''), { ...context, parentURL: ${JSON.stringify(frontend)} });
}`)}`);

const values = new Map();
const tests = [];
globalThis.Deno = {
  env: { get: name => values.get(name), set: (name, value) => values.set(name, value), delete: name => values.delete(name) },
  test: (name, fn) => tests.push(typeof name === 'object' ? name : { name, fn }),
  serve: () => {},
};
const file = process.argv[2];
if (!file) throw new Error('Usage: node supabase/tests/tools/run-deno-test.mjs <file.test.ts>');
await import(pathToFileURL(resolve(file)).href);
for (const test of tests) {
  await test.fn();
  console.log(`ok - ${test.name}`);
}
console.log(`PASS: ${tests.length} test(s) in ${file}`);
