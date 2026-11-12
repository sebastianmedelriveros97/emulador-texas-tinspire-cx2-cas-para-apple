import { NspireRuntime, SCREEN_W } from './nspire.js';
import { luaToTns, tnsToLua } from './tns.js';

const $ = (s) => document.querySelector(s);
const EXAMPLES = [
  { file: 'demo.lua', name: 'Demo de la API' },
  { file: 'viga.lua', name: 'Viga simplemente apoyada (V y M)' },
  { file: 'control.lua', name: 'Respuesta al escalón 2º orden' },
];
const STORE_KEY = 'nspirelab.v1';

// ---------------------------------------------------------------- consola
const consoleEl = $('#console');
const badge = $('#console-badge');
let unread = 0;
function log(text, cls = '') {
  const line = document.createElement('div');
  if (cls) line.className = cls;
  if (cls === 'err') {
    // enlaces a la línea del error: "script.lua:12:"
    const parts = text.split(/([\w\-. ]+\.lua:\d+)/);
    for (const p of parts) {
      const m = /\.lua:(\d+)$/.exec(p);
      if (m) {
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = p;
        a.addEventListener('click', (e) => { e.preventDefault(); gotoLine(+m[1]); });
        line.append(a);
      } else line.append(p);
    }
  } else line.textContent = text;
  consoleEl.append(line);
  consoleEl.scrollTop = consoleEl.scrollHeight;
  if (!$('.tab[data-tab="console"]').classList.contains('active') && cls === 'err') {
    unread++;
    badge.textContent = unread;
    badge.hidden = false;
  }
}
$('#btn-clear-console').addEventListener('click', () => consoleEl.replaceChildren());

// ---------------------------------------------------------------- pestañas
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  if (name === 'console') { unread = 0; badge.hidden = true; }
  if (name === 'vars') renderVars();
}

// ---------------------------------------------------------------- editor
const code = $('#code');
const gutter = $('#gutter');
const fileName = $('#file-name');
function updateGutter() {
  const n = code.value.split('\n').length;
  let s = '';
  for (let i = 1; i <= n; i++) s += i + '\n';
  gutter.textContent = s;
}
code.addEventListener('input', () => { updateGutter(); persist(); });
code.addEventListener('scroll', () => { gutter.scrollTop = code.scrollTop; });
code.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    e.preventDefault();
    const s = code.selectionStart, en = code.selectionEnd;
    code.setRangeText('  ', s, en, 'end');
    updateGutter();
  }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
});
fileName.addEventListener('change', persist);
function gotoLine(n) {
  showTab('code');
  const lines = code.value.split('\n');
  const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
  code.focus();
  code.setSelectionRange(start, start + (lines[n - 1] || '').length);
  const lh = parseFloat(getComputedStyle(code).lineHeight) || 19;
  code.scrollTop = Math.max(0, (n - 5) * lh);
}

function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ code: code.value, name: fileName.value })); } catch { /* sin almacenamiento */ }
}
function restore() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (s && s.code) { code.value = s.code; fileName.value = s.name || 'script.lua'; return true; }
  } catch { /* nada */ }
  return false;
}

// ---------------------------------------------------------------- emulador
const rt = new NspireRuntime({
  screen: $('#screen'),
  onPrint: (s) => log(s),
  onError: (msg) => log(msg, 'err'),
  onVarsChange: () => { if ($('.tab[data-tab="vars"]').classList.contains('active')) renderVars(); },
});
window.nspire = rt; // útil para depurar desde la consola del navegador

function run() {
  persist();
  const name = fileName.value.trim() || 'script.lua';
  rt.docName = name.replace(/\.lua$/i, '');
  $('#doc-name').textContent = name;
  log(`— Ejecutando ${name} —`, 'sys');
  rt.load(code.value, name);
}
$('#btn-run').addEventListener('click', run);

function fitScreen() {
  const wide = window.innerWidth > 900;
  const availW = (wide ? Math.min(window.innerWidth * 0.47, 800) : window.innerWidth - 24) - 52; // marco + carcasa
  const availH = wide ? (window.innerHeight - 470) / 240 * SCREEN_W : Infinity; // deja sitio al teclado
  const z = Math.max(1, Math.min(2.4, Math.min(availW, availH) / SCREEN_W));
  rt.setZoom(Math.floor(z * 20) / 20);
  document.querySelector('.device-body').style.width = `${SCREEN_W * rt.zoom + 52}px`;
}
window.addEventListener('resize', fitScreen);

// ---------------------------------------------------------------- abrir / exportar
const fileInput = $('#file-input');
$('#btn-open').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const f = fileInput.files[0];
  fileInput.value = '';
  if (f) await openFile(f);
});
async function openFile(f) {
  try {
    const buf = new Uint8Array(await f.arrayBuffer());
    const isTns = /\.tns$/i.test(f.name) || new TextDecoder('latin1').decode(buf.subarray(0, 6)) === '*TIMLP';
    if (isTns) {
      const { lua } = await tnsToLua(buf);
      code.value = lua;
      fileName.value = f.name.replace(/\.tns$/i, '.lua');
      log(`Abierto ${f.name} (script Lua extraído)`, 'sys');
    } else {
      code.value = new TextDecoder().decode(buf);
      fileName.value = f.name;
      log(`Abierto ${f.name}`, 'sys');
    }
    updateGutter();
    run();
  } catch (e) {
    log(`No se pudo abrir ${f.name}: ${e.message}`, 'err');
    showTab('console');
  }
}
document.addEventListener('dragover', (e) => e.preventDefault());
document.addEventListener('drop', (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) openFile(f);
});

function baseName() { return (fileName.value.trim() || 'script.lua').replace(/\.(lua|txt)$/i, ''); }
function download(bytes, name, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function makeTnsFile() {
  const bytes = await luaToTns(code.value);
  return new File([bytes], `${baseName()}.tns`, { type: 'application/octet-stream' });
}
$('#btn-export').addEventListener('click', async () => {
  try {
    const f = await makeTnsFile();
    download(f, f.name, 'application/octet-stream');
    log(`Generado ${f.name} (${f.size} bytes). Envíalo a la calculadora con TI-Nspire Link / TI Connect.`, 'sys');
  } catch (e) { log(`Error al generar el .tns: ${e.message}`, 'err'); }
});
$('#btn-save-lua').addEventListener('click', () => download(code.value, `${baseName()}.lua`, 'text/plain'));
const shareBtn = $('#btn-share');
if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.tns', { type: 'application/octet-stream' })] })) {
  shareBtn.hidden = false;
  shareBtn.addEventListener('click', async () => {
    try {
      const f = await makeTnsFile();
      await navigator.share({ files: [f], title: f.name });
    } catch (e) { if (e.name !== 'AbortError') log(`No se pudo compartir: ${e.message}`, 'err'); }
  });
}

// ---------------------------------------------------------------- ejemplos
const sel = $('#sel-example');
for (const ex of EXAMPLES) {
  const o = document.createElement('option');
  o.value = ex.file; o.textContent = ex.name;
  sel.append(o);
}
sel.addEventListener('change', async () => {
  if (!sel.value) return;
  await loadExample(sel.value);
  sel.value = '';
});
async function loadExample(file) {
  try {
    const r = await fetch(`examples/${file}`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.statusText);
    code.value = await r.text();
    fileName.value = file;
    updateGutter();
    run();
  } catch (e) { log(`No se pudo cargar el ejemplo: ${e.message}`, 'err'); }
}

// ---------------------------------------------------------------- variables
function renderVars() {
  const body = $('#vars-body');
  body.replaceChildren();
  const names = Object.keys(rt.vars).sort();
  if (!names.length) {
    body.innerHTML = '<tr><td class="hint">No hay variables. Usa var.store("x", 1) o añade una abajo.</td></tr>';
    return;
  }
  for (const n of names) {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'); td1.textContent = n;
    const td2 = document.createElement('td');
    const inp = document.createElement('input');
    const v = rt.vars[n];
    inp.value = Array.isArray(v) ? `{${v.join(',')}}` : String(v);
    inp.addEventListener('change', () => rt.setVar(n, parseValue(inp.value)));
    td2.append(inp);
    tr.append(td1, td2);
    body.append(tr);
  }
}
function parseValue(s) {
  s = s.trim();
  if (/^\{.*\}$/.test(s)) return s.slice(1, -1).split(',').map((x) => parseValue(x));
  if (s === 'true') return true;
  if (s === 'false') return false;
  const n = Number(s);
  if (s !== '' && !Number.isNaN(n)) return n;
  return s.replace(/^"(.*)"$/, '$1');
}
$('#var-add').addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target;
  rt.setVar(f.name.value.trim(), parseValue(f.value.value));
  f.reset();
  renderVars();
});

// ---------------------------------------------------------------- teclado de la calculadora
const mods = { ctrl: false, shift: false };
let letters = false;
const keypad = $('#keypad');

// k: acción. 'key:x' tecla con nombre, 'ch:x' carácter, 'mod:x', 'abc', 'trig'
const NUM_GRID = [
  ['=', 'ch:='], ['trig', 'trig', 'dark'], ['^', 'ch:^'], ['x²', 'ch:²'], ['(', 'ch:('], [')', 'ch:)'],
  ['eˣ', 'ch:e^(', 'dark'], ['10ˣ', 'ch:10^(', 'dark'], ['7', 'ch:7'], ['8', 'ch:8'], ['9', 'ch:9'], ['×', 'ch:*', 'dark'],
  ['ln', 'ch:ln(', 'dark'], ['log', 'ch:log(', 'dark'], ['4', 'ch:4'], ['5', 'ch:5'], ['6', 'ch:6'], ['÷', 'ch:/', 'dark'],
  ['π', 'ch:π', 'dark'], ['√', 'ch:√(', 'dark'], ['1', 'ch:1'], ['2', 'ch:2'], ['3', 'ch:3'], ['−', 'ch:-', 'dark'],
  ['EE', 'ch:ᴇ', 'dark'], [',', 'ch:,', 'dark'], ['0', 'ch:0'], ['.', 'ch:.'], ['(−)', 'ch:−'], ['+', 'ch:+', 'dark'],
  ['ABC', 'abc', 'blue'], ['␣', 'ch: ', 'dark'], ['?!', 'ch:?', 'dark'], [':=', 'ch::=', 'dark'], ['enter', 'key:enter', 'green enter'],
];
const LETTER_GRID = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c) => [c, `letter:${c}`])
  .concat([['θ', 'ch:θ'], ['"', 'ch:"'], ['_', 'ch:_'], ['123', 'abc', 'blue'], ['␣', 'ch: ', 'dark'], ['enter', 'key:enter', 'green wide']]);

function mkKey(label, act, cls = '') {
  const b = document.createElement('button');
  b.className = `key ${cls}`.trim();
  b.type = 'button';
  b.innerHTML = label;
  b.dataset.act = act;
  return b;
}
function renderKeypad() {
  keypad.replaceChildren();
  const top = document.createElement('div');
  top.className = 'kp-top';
  const left = document.createElement('div'); left.className = 'kp-col';
  left.append(mkKey('esc', 'key:esc', 'dark'), mkKey('⌂<small>on</small>', 'home', 'dark'));
  const pad = document.createElement('div'); pad.className = 'touchpad';
  pad.append(mkKey('▲', 'key:up', 'up'), mkKey('▼', 'key:down', 'down'), mkKey('◀', 'key:left', 'left'), mkKey('▶', 'key:right', 'right'), mkKey('click', 'key:click', 'center'));
  const right = document.createElement('div'); right.className = 'kp-col';
  right.append(mkKey('tab', 'key:tab', 'dark'), mkKey('menu', 'key:menu', 'dark'));
  top.append(left, pad, right);

  const row = document.createElement('div'); row.className = 'kp-row';
  row.append(mkKey('ctrl', 'mod:ctrl', 'blue' + (mods.ctrl ? ' on' : '')), mkKey('shift', 'mod:shift', 'dark' + (mods.shift ? ' on' : '')),
    mkKey('var', 'var', 'dark'), mkKey('del', 'key:del', 'dark'));

  const grid = document.createElement('div');
  grid.className = 'kp-grid' + (letters ? ' letters' : '');
  for (const [label, act, cls] of letters ? LETTER_GRID : NUM_GRID) {
    const l = act.startsWith('letter:') && !mods.shift ? label.toLowerCase() : label;
    grid.append(mkKey(l, act, cls || ''));
  }
  keypad.append(top, row, grid);
}

function press(act, el) {
  if (act.startsWith('mod:')) {
    const m = act.slice(4);
    mods[m] = !mods[m];
    renderKeypad();
    return;
  }
  const ctrl = mods.ctrl, shift = mods.shift;
  const clearMods = () => { if (mods.ctrl || mods.shift) { mods.ctrl = mods.shift = false; renderKeypad(); } };
  if (act === 'abc') { letters = !letters; renderKeypad(); return; }
  if (act === 'home') { clearMods(); run(); return; }
  if (act === 'var') { clearMods(); showTab('vars'); return; }
  if (act === 'trig') { trigPopup(el); return; }
  if (act.startsWith('letter:')) {
    const c = act.slice(7);
    rt.charIn(shift ? c : c.toLowerCase());
    if (shift) clearMods();
    return;
  }
  if (act.startsWith('ch:')) {
    clearMods();
    return rt.charIn(act.slice(3));
  }
  if (act.startsWith('key:')) {
    let k = act.slice(4);
    if (ctrl && k === 'del') k = 'clear';
    else if (ctrl && k === 'menu') k = 'contextMenu';
    else if (ctrl && k === 'enter') k = 'return';
    else if (shift && k === 'tab') k = 'backtab';
    clearMods();
    rt.key(k);
  }
}
keypad.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.key');
  if (!b) return;
  e.preventDefault();
  b.classList.add('pressed');
  setTimeout(() => b.classList.remove('pressed'), 120);
  press(b.dataset.act, b);
});

let trigEl;
function trigPopup(anchor) {
  trigEl?.remove();
  trigEl = document.createElement('div');
  trigEl.className = 'trig-pop';
  for (const f of ['sin(', 'cos(', 'tan(', 'sin⁻¹(', 'cos⁻¹(', 'tan⁻¹(']) {
    const b = mkKey(f, `ch:${f}`, '');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); rt.charIn(f); trigEl.remove(); });
    trigEl.append(b);
  }
  const r = anchor.getBoundingClientRect();
  trigEl.style.left = `${Math.max(8, r.left - 40)}px`;
  trigEl.style.top = `${Math.max(8, r.top - 96)}px`;
  document.body.append(trigEl);
  setTimeout(() => document.addEventListener('pointerdown', () => trigEl?.remove(), { once: true }), 0);
}

// ---------------------------------------------------------------- teclado físico
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run(); return; }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); rt.key('menu'); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const map = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'enter', Escape: 'esc',
    Tab: e.shiftKey ? 'backtab' : 'tab', Backspace: 'del', Delete: 'delete', Home: 'clear',
  };
  if (map[e.key]) { e.preventDefault(); rt.key(map[e.key]); return; }
  if (e.key.length === 1) { e.preventDefault(); rt.charIn(e.key); }
});

// ---------------------------------------------------------------- arranque
renderKeypad();
fitScreen();
updateGutter();
if (restore()) { updateGutter(); run(); } else loadExample('demo.lua');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
