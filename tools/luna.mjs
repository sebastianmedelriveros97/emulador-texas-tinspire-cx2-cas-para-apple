#!/usr/bin/env node
// Convierte un script Lua en un documento .tns (equivalente a `luna script.lua salida.tns`).
// Uso: node tools/luna.mjs script.lua [salida.tns]
//      node tools/luna.mjs --extraer documento.tns [salida.lua]
import { readFile, writeFile } from 'node:fs/promises';
import { luaToTns, tnsToLua } from '../src/tns.js';

const args = process.argv.slice(2);
if (!args.length) {
  console.log('Uso:\n  node tools/luna.mjs script.lua [salida.tns]\n  node tools/luna.mjs --extraer documento.tns [salida.lua]');
  process.exit(1);
}
if (args[0] === '--extraer') {
  const [inp, out = inp.replace(/\.tns$/i, '') + '.lua'] = args.slice(1);
  const { lua } = await tnsToLua(new Uint8Array(await readFile(inp)));
  await writeFile(out, lua);
  console.log(`${inp} -> ${out}`);
} else {
  const [inp, out = inp.replace(/\.lua$/i, '') + '.tns'] = args;
  const tns = await luaToTns(await readFile(inp, 'utf8'));
  await writeFile(out, tns);
  console.log(`${inp} -> ${out} (${tns.length} bytes)`);
}
