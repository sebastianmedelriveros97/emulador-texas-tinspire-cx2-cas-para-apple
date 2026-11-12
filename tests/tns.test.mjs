import assert from 'node:assert/strict';
import { test } from 'node:test';
import { desEncrypt, luaToTns, tnsToLua, readTiZip, doccrypt } from '../src/tns.js';

const hex = (s) => Uint8Array.from(s.match(/../g), (h) => parseInt(h, 16));
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();

test('DES: vector de prueba clásico', () => {
  assert.equal(toHex(desEncrypt(hex('133457799BBCDFF1'), hex('0123456789ABCDEF'))), '85E813540F0AB405');
});

test('doccrypt es simétrico', () => {
  const d = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(doccrypt(doccrypt(d)), d);
});

test('ida y vuelta Lua -> .tns -> Lua (con ]]> y UTF-8)', async () => {
  const src = 'function on.paint(gc)\n  gc:drawString("Ñandú π ✓", 10, 10)\nend\nlocal t = {}\nlocal s = t[t[1]]]>0\n';
  const tns = await luaToTns(src);
  assert.equal(new TextDecoder().decode(tns.subarray(0, 10)), '*TIMLP0500');
  const entries = readTiZip(tns);
  assert.deepEqual(entries.map((e) => e.name), ['Document.xml', 'Problem1.xml']);
  const { lua } = await tnsToLua(tns);
  assert.equal(lua, src);
});
