// tns.js — Lectura y escritura de documentos .tns (TI-Nspire) con scripts Lua.
//
// Implementación en JavaScript del formato que genera Luna
// (https://github.com/ndless-nspire/Luna, MPL 1.1, Olivier Armand).
// Funciona en el navegador (Safari/iPadOS 16.4+) y en Node 18+, sin dependencias:
// usa CompressionStream/DecompressionStream("deflate-raw") para (des)comprimir.
//
// Estructura de un .tns generado por Luna:
//   - Un ZIP "modificado": la primera cabecera local empieza con "*TIMLP0500"
//     en vez de "PK\3\4" y el registro final usa la firma "TIPD".
//   - Document.xml y Problem1.xml con método 0x0D ("cifrado TI"):
//       cabecera fija de 40 bytes + deflate-raw(XML comprimido "TIXC") cifrado
//       con 3DES en un modo tipo contador (doccrypt, simétrico).
//   - El script Lua va dentro de Problem1.xml en un bloque <![CDATA[ ... ]]>.

// ---------------------------------------------------------------- DES / 3DES
const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,
  63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,
  41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const SHIFTS = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1];
const IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,
  57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,
  36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,
  16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const SBOX = [
  [14,4,13,1,2,15,11,8,3,10,6,12,5,9,0,7,0,15,7,4,14,2,13,1,10,6,12,11,9,5,3,8,4,1,14,8,13,6,2,11,15,12,9,7,3,10,5,0,15,12,8,2,4,9,1,7,5,11,3,14,10,0,6,13],
  [15,1,8,14,6,11,3,4,9,7,2,13,12,0,5,10,3,13,4,7,15,2,8,14,12,0,1,10,6,9,11,5,0,14,7,11,10,4,13,1,5,8,12,6,9,3,2,15,13,8,10,1,3,15,4,2,11,6,7,12,0,5,14,9],
  [10,0,9,14,6,3,15,5,1,13,12,7,11,4,2,8,13,7,0,9,3,4,6,10,2,8,5,14,12,11,15,1,13,6,4,9,8,15,3,0,11,1,2,12,5,10,14,7,1,10,13,0,6,9,8,7,4,15,14,3,11,5,2,12],
  [7,13,14,3,0,6,9,10,1,2,8,5,11,12,4,15,13,8,11,5,6,15,0,3,4,7,2,12,1,10,14,9,10,6,9,0,12,11,7,13,15,1,3,14,5,2,8,4,3,15,0,6,10,1,13,8,9,4,5,11,12,7,2,14],
  [2,12,4,1,7,10,11,6,8,5,3,15,13,0,14,9,14,11,2,12,4,7,13,1,5,0,15,10,3,9,8,6,4,2,1,11,10,13,7,8,15,9,12,5,6,3,0,14,11,8,12,7,1,14,2,13,6,15,0,9,10,4,5,3],
  [12,1,10,15,9,2,6,8,0,13,3,4,14,7,5,11,10,15,4,2,7,12,9,5,6,1,13,14,0,11,3,8,9,14,15,5,2,8,12,3,7,0,4,10,1,13,11,6,4,3,2,12,9,5,15,10,11,14,1,7,6,0,8,13],
  [4,11,2,14,15,0,8,13,3,12,9,7,5,10,6,1,13,0,11,7,4,9,1,10,14,3,5,12,2,15,8,6,1,4,11,13,12,3,7,14,10,15,6,8,0,5,9,2,6,11,13,8,1,4,10,7,9,5,0,15,14,2,3,12],
  [13,2,8,4,6,15,11,1,10,9,3,14,5,0,12,7,1,15,13,8,10,3,7,4,12,5,6,11,0,14,9,2,7,11,4,1,9,12,14,2,0,6,10,13,15,3,5,8,2,1,14,7,4,10,8,13,15,12,9,0,3,5,6,11],
];

function bytesToBits(bytes) {
  const bits = new Array(bytes.length * 8);
  for (let i = 0; i < bytes.length; i++)
    for (let b = 0; b < 8; b++) bits[i * 8 + b] = (bytes[i] >> (7 - b)) & 1;
  return bits;
}
function bitsToBytes(bits) {
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i++) {
    let v = 0;
    for (let b = 0; b < 8; b++) v = (v << 1) | bits[i * 8 + b];
    out[i] = v;
  }
  return out;
}
const permute = (bits, table) => table.map((p) => bits[p - 1]);

function desKeySchedule(key8) {
  const k = permute(bytesToBits(key8), PC1);
  let c = k.slice(0, 28), d = k.slice(28);
  const subkeys = [];
  for (let r = 0; r < 16; r++) {
    for (let s = 0; s < SHIFTS[r]; s++) { c.push(c.shift()); d.push(d.shift()); }
    subkeys.push(permute(c.concat(d), PC2));
  }
  return subkeys;
}

function desBlock(block8, subkeys, decrypt) {
  const bits = permute(bytesToBits(block8), IP);
  let l = bits.slice(0, 32), r = bits.slice(32);
  for (let i = 0; i < 16; i++) {
    const k = subkeys[decrypt ? 15 - i : i];
    const er = permute(r, E).map((b, j) => b ^ k[j]);
    const f = [];
    for (let s = 0; s < 8; s++) {
      const o = s * 6;
      const row = (er[o] << 1) | er[o + 5];
      const col = (er[o + 1] << 3) | (er[o + 2] << 2) | (er[o + 3] << 1) | er[o + 4];
      const v = SBOX[s][row * 16 + col];
      f.push((v >> 3) & 1, (v >> 2) & 1, (v >> 1) & 1, v & 1);
    }
    const pf = permute(f, P);
    const nr = l.map((b, j) => b ^ pf[j]);
    l = r; r = nr;
  }
  return bitsToBytes(permute(r.concat(l), FP));
}

/** Cifrado DES de un bloque de 8 bytes (exportado para pruebas). */
export function desEncrypt(key8, block8) {
  return desBlock(block8, desKeySchedule(key8), false);
}

// Claves de Luna (derivadas de la cabecera fija TIEN).
const KS1 = desKeySchedule([0x16, 0xA7, 0xA7, 0x32, 0x68, 0xA7, 0xBA, 0x73]);
const KS2 = desKeySchedule([0xD9, 0xA8, 0x86, 0xA4, 0x34, 0x45, 0x94, 0x10]);
const KS3 = desKeySchedule([0x3D, 0x80, 0x8C, 0xB5, 0xDF, 0xB3, 0x80, 0x6B]);
const IVEC_BASE = 0x6fe21307;

/** doccrypt de Luna: XOR con 3DES-EDE(contador). Cifra y descifra (es simétrico). */
export function doccrypt(data) {
  const out = new Uint8Array(data);
  let incr = 0;
  for (let off = 0; off < out.length; off += 8) {
    const cur = (IVEC_BASE + incr) >>> 0;
    incr = (incr + 1) % 1024;
    let blk = new Uint8Array([0, 0, 0, 0, cur & 0xff, (cur >>> 8) & 0xff, (cur >>> 16) & 0xff, (cur >>> 24) & 0xff]);
    blk = desBlock(blk, KS1, false);
    blk = desBlock(blk, KS2, true);
    blk = desBlock(blk, KS3, false);
    for (let i = 0; i < 8 && off + i < out.length; i++) out[off + i] ^= blk[i];
  }
  return out;
}

// ---------------------------------------------------------------- utilidades
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8');

function concat(...arrs) {
  const len = arrs.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
const latin1 = (s) => Uint8Array.from(s, (c) => c.charCodeAt(0));
function indexOf(hay, needle, from = 0) {
  outer: for (let i = from; i <= hay.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (hay[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

let CRC_TABLE;
export function crc32(data) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

async function streamThrough(data, stream) {
  const blob = new Blob([data]);
  const buf = await new Response(blob.stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(buf);
}
export const deflateRaw = (d) => streamThrough(d, new CompressionStream('deflate-raw'));
export const inflateRaw = (d) => streamThrough(d, new DecompressionStream('deflate-raw'));

// ---------------------------------------------------------------- constantes de Luna
const TIEN_HEADER = latin1(
  '\x0F\xCE\xD8\xD2\x81\x06\x86\x5B\x99\xDD\xA2\x3D\xD9\xE9\x4B\xD4\x31\xBB\x50\xB6' +
  '\x4D\xB3\x29\x24\x70\x60\x49\x38\x1C\x30\xF8\x99\x00\x4B\x92\x64\xE4\x58\xE6\xBC');

const DEFAULT_DOCUMENT_XML = latin1(
  '\x0F\xCE\xD8\xD2\x81\x06\x86\x5B\x4A\x4A\xC5\xCE\xA9\x16\xF2\xD5\x1D\xA8\x2F\x6E' +
  '\x00\x22\xF2\xF0\xC1\xA6\x06\x77\x4D\x7E\xA6\xC0\x3A\xF0\x5C\x74\xBA\xAA\x44\x60' +
  '\xCD\x58\xE6\x70\xD7\x40\xF6\x9C\x17\xDC\xF0\x94\x77\xBF\xCA\xDE\xF7\x02\x09\xC9' +
  '\x62\xB1\x5D\xEF\x22\xFA\x51\x37\xA0\x81\x91\x48\xE1\x83\x4D\xAD\x08\x31\x2D\xD0' +
  '\xD3\xE3\x2D\x60\xAB\x13\xC2\x98\x2B\xED\x39\x5B\x09\x24\x39\x92\x2F\x0C\x7A\x4C' +
  '\x95\x74\x91\x3B\x0C\xF4\x60\xCC\x73\x27\xCB\x07\x7E\x7F\xA9\x17\x87\xE2\xAC\xA2' +
  '\x3B\xCC\xA0\xC4\xE3\x8E\x89\xF0\xC0\x51\x9F\xC2\xBE\xCE\x28\x45\xC3\xD4\x11\x90' +
  '\xA6\xEC\x53\xA0\xFB\x5B\x46\x6B\x41\xAD\xE9\x53\xBB\x97\xDB\xB1\xD2\x68\xE2\xF6' +
  '\x36\x0F\x26\x36\x75\x9B\xE9\x1F\x48\xAD\xE9\x29\x67\x00\x58\x19\xC3\xC0\x12\x76' +
  '\xA0\x4A\x73\xF3\xB1\xD3\x09\x18\xD6\x06\xDD\x97\x24\x53\x3E\x22\xA4\xFB\x82\x50' +
  '\x7B\x7C\x12\x88\x4E\x7D\x41\x80\xFE\x72\x92\x29\x87\xE8\x5C\x56\x72\xFF\x29\x16' +
  '\x8C\x42\x5B\x8B\x9B\xA7\xD2\x08\x6D\xD3\x98\xFF\x91\xA9\x9E\xF3\x93\xA8\x2E\x1C' +
  '\xB2\xA9\x6B\x6A\xDF\xF6\xCE\x2D\x15\x17\xCE\x6E\xC0\x4F\x9A\x9C\x0E\xDF\x19\x8D' +
  '\x2D\xFA\x69\x9F\x11\xD2\x20\x12\xE0\x79\x14\x04\x4E\x62\x8F\x0A\x2A\x18\x72\x5A' +
  '\x8B\x80\xB3\x3C\x9B\xD5\x67\x59\x4B\x51\x4D\xE0\xC3\x38\x28\xC3\xDC\xCD\x39\x22' +
  '\x12\x8C\x40\x55');

const LUA_HEADER = latin1(
  '\x54\x49\x58\x43\x30\x31\x30\x30\x2D\x31\x2E\x30\x3F\x3E\x3C\x70\x72' +
  '\x6F\x62\x20\x78\x6D\x6C\x6E\x73\x3D\x22\x75\x72\x6E\x3A\x54\x49\x2E' +
  '\x50\xA8\x5F\x5B\x1F\x0A\x22\x20\x76\x65\x72\x3D\x22\x31\x2E\x30\x22' +
  '\x20\x70\x62\x6E\x61\x6D\x65\x3D\x22\x22\x3E\x3C\x73\x79\x6D\x3E\x0E' +
  '\x01\x3C\x63\x61\x72\x64\x20\x63\x6C\x61\x79\x3D\x22\x30\x22\x20\x68' +
  '\x31\x3D\x22\xF1\x00\x00\xFF\x22\x20\x68\x32\x3D\x22\xF1\x00\x00\xFF' +
  '\x22\x20\x77\x31\x3D\x22\xF1\x00\x00\xFF\x22\x20\x77\x32\x3D\x22\xF1' +
  '\x00\x00\xFF\x22\x3E\x3C\x69\x73\x44\x75\x6D\x6D\x79\x43\x61\x72\x64' +
  '\x3E\x30\x0E\x03\x3C\x66\x6C\x61\x67\x3E\x30\x0E\x04\x3C\x77\x64\x67' +
  '\x74\x20\x78\x6D\x6C\x6E\x73\x3A\x73\x63\x3D\x22\x75\x72\x6E\x3A\x54' +
  '\x49\x2E\x53\xAC\x84\xF2\x2A\x41\x70\x70\x22\x20\x74\x79\x70\x65\x3D' +
  '\x22\x54\x49\x2E\x53\xAC\x84\xF2\x2A\x41\x70\x70\x22\x20\x76\x65\x72' +
  '\x3D\x22\x31\x2E\x30\x22\x3E\x3C\x73\x63\x3A\x6D\x46\x6C\x61\x67\x73' +
  '\x3E\x30\x0E\x06\x3C\x73\x63\x3A\x76\x61\x6C\x75\x65\x3E\x2D\x31\x0E' +
  '\x07\x3C\x73\x63\x3A\x73\x63\x72\x69\x70\x74\x20\x76\x65\x72\x73\x69' +
  '\x6F\x6E\x3D\x22\x35\x31\x32\x22\x20\x69\x64\x3D\x22\x30\x22\x3E' +
  '<![CDATA[');
const LUA_FOOTER = latin1(']]>\x0E\x08\x0E\x05\x0E\x02\x0E\x00');

// ---------------------------------------------------------------- escritura
/** Convierte un script Lua (texto) en los bytes de un documento .tns. */
export async function luaToTns(luaSource) {
  let src = enc.encode(luaSource);
  if (src[0] === 0xEF && src[1] === 0xBB && src[2] === 0xBF) src = src.subarray(3);
  // Igual que Luna: "]]>" dentro del script se parte entre dos secciones CDATA.
  const restart = enc.encode(']]><![CDATA[');
  const parts = [];
  let last = 0;
  for (let i = 0; i < src.length - 2; i++) {
    if (src[i] === 0x5D && src[i + 1] === 0x5D && src[i + 2] === 0x3E) {
      parts.push(src.subarray(last, i + 2), restart);
      last = i + 2;
      i += 2;
    }
  }
  parts.push(src.subarray(last));
  const xmlc = concat(LUA_HEADER, ...parts, LUA_FOOTER);
  const problem = concat(TIEN_HEADER, doccrypt(await deflateRaw(xmlc)));
  return buildTiZip([
    { name: 'Document.xml', data: DEFAULT_DOCUMENT_XML },
    { name: 'Problem1.xml', data: problem },
  ]);
}

function buildTiZip(entries, tiversion = 0x0500) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = 0x0020; // lo que produce minizip con fecha cero
  entries.forEach((e, idx) => {
    const name = enc.encode(e.name);
    const crc = crc32(e.data);
    const sig = idx === 0
      ? latin1('*TIMLP' + tiversion.toString(16).toUpperCase().padStart(4, '0'))
      : new Uint8Array([0x50, 0x4B, 0x03, 0x04]);
    const h = new DataView(new ArrayBuffer(26));
    h.setUint16(0, 20, true);        // versión necesaria
    h.setUint16(2, 0, true);         // flags
    h.setUint16(4, 0x0D, true);      // método: cifrado TI
    h.setUint16(6, DOS_TIME, true);
    h.setUint16(8, DOS_DATE, true);
    h.setUint32(10, crc, true);
    h.setUint32(14, e.data.length, true);
    h.setUint32(18, e.data.length, true);
    h.setUint16(22, name.length, true);
    h.setUint16(24, 0, true);
    const local = concat(sig, new Uint8Array(h.buffer), name, e.data);
    chunks.push(local);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 0, true);         // versión creada por
    c.setUint16(6, 20, true);
    c.setUint16(8, 0, true);
    c.setUint16(10, 0x0D, true);
    c.setUint16(12, DOS_TIME, true);
    c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, e.data.length, true);
    c.setUint32(24, e.data.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(concat(new Uint8Array(c.buffer), name));
    offset += local.length;
  });
  const cd = concat(...central);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x44504954, true); // "TIPD"
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cd.length, true);
  end.setUint32(16, offset, true);
  return concat(...chunks, cd, new Uint8Array(end.buffer));
}

// ---------------------------------------------------------------- lectura
/** Lista las entradas de un ZIP TI (o un ZIP normal). */
export function readTiZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0 && i >= bytes.length - 22 - 65535; i--) {
    const s = dv.getUint32(i, true);
    if (s === 0x44504954 || s === 0x06054b50) { eocd = i; break; }
  }
  const entries = [];
  if (eocd >= 0) {
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count && p + 46 <= bytes.length; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const usize = dv.getUint32(p + 24, true);
      const nlen = dv.getUint16(p + 28, true);
      const xlen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const lofs = dv.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      const sigLen = bytes[lofs] === 0x2A /* '*' */ ? 10 : 4;
      const lh = lofs + sigLen;
      const lnlen = dv.getUint16(lh + 22, true);
      const lxlen = dv.getUint16(lh + 24, true);
      const start = lh + 26 + lnlen + lxlen;
      entries.push({ name, method, usize, data: bytes.subarray(start, start + csize) });
      p += 46 + nlen + xlen + clen;
    }
  }
  if (!entries.length) throw new Error('No parece un archivo .tns válido (no se encontró el directorio ZIP).');
  return entries;
}

async function entryContent(entry) {
  if (entry.method === 0) return entry.data;
  if (entry.method === 8) return inflateRaw(entry.data);
  if (entry.method === 0x0D) {
    const body = entry.data.subarray(TIEN_HEADER.length);
    return inflateRaw(doccrypt(body));
  }
  throw new Error(`Método de compresión no soportado: ${entry.method}`);
}

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
}

/** Extrae el script Lua de un Problem*.xml descomprimido (formato TIXC o XML plano). */
export function extractLuaFromProblem(xml) {
  const tagPos = indexOf(xml, enc.encode('<sc:script'));
  if (tagPos < 0) return null;
  let p = xml.indexOf(0x3E, tagPos) + 1; // '>'
  const out = [];
  const CDATA_OPEN = enc.encode('<![CDATA[');
  const CDATA_CLOSE = enc.encode(']]>');
  while (p < xml.length) {
    if (indexOf(xml.subarray(p, p + CDATA_OPEN.length), CDATA_OPEN) === 0) {
      const end = indexOf(xml, CDATA_CLOSE, p + CDATA_OPEN.length);
      if (end < 0) { out.push(xml.subarray(p + CDATA_OPEN.length)); break; }
      out.push(xml.subarray(p + CDATA_OPEN.length, end));
      p = end + CDATA_CLOSE.length;
      continue;
    }
    if (xml[p] === 0x0E || xml[p] === 0x3C) break; // cierre comprimido o etiqueta
    let q = p;
    while (q < xml.length && xml[q] !== 0x0E && xml[q] !== 0x3C) q++;
    out.push(enc.encode(unescapeXml(dec.decode(xml.subarray(p, q)))));
    p = q;
  }
  return dec.decode(concat(...out));
}

/** Lee un .tns y devuelve { lua, files } donde lua es el primer script encontrado. */
export async function tnsToLua(bytes) {
  bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const entries = readTiZip(bytes);
  const files = entries.map((e) => e.name);
  const problems = entries.filter((e) => /^Problem\d*\.xml$/i.test(e.name));
  for (const e of problems) {
    let xml;
    try {
      xml = await entryContent(e);
    } catch (err) {
      throw new Error(`No se pudo descifrar ${e.name}. Este .tns probablemente fue guardado con el software oficial de TI ` +
        `(usa otro cifrado). Abre el .lua original o reexpórtalo con Luna/este emulador.`);
    }
    const lua = extractLuaFromProblem(xml);
    if (lua != null) return { lua, files, problem: e.name };
  }
  throw new Error('El .tns no contiene un script Lua (puede ser un documento de calculadora, gráficos o TI-Basic).');
}
