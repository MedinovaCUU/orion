#!/usr/bin/env node
// Extrae los controles del .bak de un SAT a JSON (sin escribir en Supabase). Para incorporarlos a Orion usa
// sat-qc-worker.mjs. La contraseña sale de --password o de SAT_EXPORT_PASSWORD en el entorno.
// Uso: node extract-latest-qc.mjs --file <SAT.A400> --serial <serie> [--password <clave>] [--model BA400] [--output archivo.json]
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DEFAULT_SAT_PASSWORD, extractQcFromSat } from './extract-qc.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const archivePath = args.get('--file') ? resolve(args.get('--file')) : null;
const serialNumber = args.get('--serial') || '';
if (!archivePath || !serialNumber) {
  console.error('Uso: node extract-latest-qc.mjs --file <SAT.A400> --serial <serie> [--password <clave>] [--model BA400] [--output archivo.json]');
  process.exit(2);
}
const payload = await extractQcFromSat({
  archivePath,
  password: args.get('--password') || DEFAULT_SAT_PASSWORD,
  serialNumber,
  equipmentModel: args.get('--model') || 'BA400',
  log: (message) => console.error(message),
});
const text = JSON.stringify(payload, null, 2);
if (args.get('--output')) {
  await writeFile(resolve(args.get('--output')), text);
  console.error(`${payload.results.length} resultados escritos en ${args.get('--output')}`);
} else process.stdout.write(`${text}\n`);
