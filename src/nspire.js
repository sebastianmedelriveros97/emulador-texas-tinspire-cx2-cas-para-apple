// nspire.js — Motor que ejecuta scripts Lua de TI-Nspire en un <canvas>.
// Usa Fengari (Lua 5.3 en JavaScript, cargado como window.fengari) más el preludio
// de compatibilidad (src/prelude.js) que define la API de la calculadora.

import { PRELUDE } from './prelude.js';
import { evaluate, formatNumber } from './matheval.js';

export const SCREEN_W = 320;
export const SCREEN_H = 240;
export const WIN_X = 1;     // la ventana Lua en el dispositivo mide 318×212
export const WIN_Y = 28;
export const WIN_W = 318;
export const WIN_H = 212;

const PEN = { thin: 1, medium: 2, thick: 3 };
const FONT_FAMILY = {
  sansserif: '"Helvetica Neue", Helvetica, Arial, sans-serif',
  serif: '"Times New Roman", Times, serif',
};
const WATCHDOG_MS = 5000;

export class NspireRuntime {
  /**
   * @param {object} o
   * @param {HTMLElement} o.screen   contenedor (se le añaden el canvas y la capa de overlays)
   * @param {(s:string)=>void} [o.onPrint]
   * @param {(msg:string)=>void} [o.onError]
   * @param {(vars:object)=>void} [o.onVarsChange]
   * @param {string} [o.docName]
   */
  constructor(o) {
    this.opts = o;
    this.F = window.fengari;
    if (!this.F) throw new Error('Fengari no está cargado');
    this.vars = {};
    this.monitored = new Set();
    this.clipboard = '';
    this.zoom = 1;
    this.docName = o.docName || 'Documento';

    const screen = o.screen;
    screen.classList.add('nsp-screen');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'nsp-canvas';
    this.overlay = document.createElement('div');
    this.overlay.className = 'nsp-overlay';
    screen.replaceChildren(this.canvas, this.overlay);
    this.ctx = this.canvas.getContext('2d');
    this.measureCtx = document.createElement('canvas').getContext('2d');
    this._bindPointer();
    this.setZoom(1);
    this._raf = this._raf.bind(this);
    requestAnimationFrame(this._raf);
    this._drawIdle('Carga un script .lua o .tns');
  }

  // ------------------------------------------------------------ pantalla
  setZoom(z) {
    this.zoom = z;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    this.pxScale = dpr * z;
    this.canvas.width = Math.round(SCREEN_W * this.pxScale);
    this.canvas.height = Math.round(SCREEN_H * this.pxScale);
    this.canvas.style.width = `${SCREEN_W * z}px`;
    this.canvas.style.height = `${SCREEN_H * z}px`;
    this.opts.screen.style.width = `${SCREEN_W * z}px`;
    this.opts.screen.style.height = `${SCREEN_H * z}px`;
    this.overlay.style.transform = `scale(${z})`;
    this.dirty = true;
  }

  _drawChrome() {
    const c = this.ctx;
    c.setTransform(this.pxScale, 0, 0, this.pxScale, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, WIN_Y);
    g.addColorStop(0, '#f4f6f8');
    g.addColorStop(1, '#d9dee4');
    c.fillStyle = g;
    c.fillRect(0, 0, SCREEN_W, WIN_Y);
    c.fillStyle = '#9aa3ad';
    c.fillRect(0, WIN_Y - 1, SCREEN_W, 1);
    // pestaña "1.1"
    c.fillStyle = '#ffffff';
    c.strokeStyle = '#8a939d';
    c.lineWidth = 1;
    c.beginPath();
    c.roundRect ? c.roundRect(4.5, 5.5, 34, 22, 3) : c.rect(4.5, 5.5, 34, 22);
    c.fill(); c.stroke();
    c.fillStyle = '#1f2a36';
    c.font = 'bold 11px "Helvetica Neue", Arial, sans-serif';
    c.textBaseline = 'middle';
    c.fillText('1.1', 12, 16.5);
    c.font = '11px "Helvetica Neue", Arial, sans-serif';
    c.fillStyle = '#33404d';
    const name = this.docName.length > 24 ? this.docName.slice(0, 23) + '…' : this.docName;
    c.fillText(name, 46, 15);
    c.fillText('RAD', 262, 15);
    // batería
    c.strokeStyle = '#33404d';
    c.strokeRect(292.5, 10.5, 18, 9);
    c.fillStyle = '#33404d';
    c.fillRect(311, 13, 2, 4);
    c.fillStyle = '#3aa655';
    c.fillRect(294, 12, 15, 6);
    // bordes laterales de la ventana
    c.fillStyle = '#c4cad1';
    c.fillRect(0, WIN_Y, WIN_X, WIN_H);
    c.fillRect(WIN_X + WIN_W, WIN_Y, SCREEN_W - WIN_X - WIN_W, WIN_H);
  }

  _drawIdle(msg) {
    this._drawChrome();
    const c = this.ctx;
    c.fillStyle = '#fff';
    c.fillRect(WIN_X, WIN_Y, WIN_W, WIN_H);
    c.fillStyle = '#7a8591';
    c.font = '13px "Helvetica Neue", Arial, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(msg, SCREEN_W / 2, WIN_Y + WIN_H / 2);
    c.textAlign = 'left';
  }

  // ------------------------------------------------------------ ciclo de vida
  /** Carga y arranca un script. Devuelve true si arrancó sin errores. */
  load(code, chunkName = 'script.lua') {
    this.stop();
    this.halted = false;
    this.bg = '#ffffff';
    this.menu = null;
    this.menuDisabled = new Set();
    this.editors = new Map();
    this.images = new Map();
    this.nextId = 1;
    this.overlay.replaceChildren();
    this.errorDialog = null;
    this.menuEl = null;
    this.cursorPos = { x: WIN_W / 2, y: WIN_H / 2 };
    this.focusedEditor = null;

    const { lua, lauxlib, lualib, to_luastring } = this.F;
    const L = lauxlib.luaL_newstate();
    this.L = L;
    lualib.luaL_openlibs(L);
    this._installPrimitives();
    lua.lua_sethook(L, () => {
      if (this.callStart && performance.now() - this.callStart > WATCHDOG_MS) {
        this.callStart = 0;
        lauxlib.luaL_error(L, to_luastring('el script tardó demasiado (¿bucle infinito?)'));
      }
    }, lua.LUA_MASKCOUNT, 20000);

    if (!this._runChunk(PRELUDE, '=preludio')) return false;
    if (!this._runChunk(code, '@' + chunkName)) return false;

    this.dispatch('construction');
    this.dispatch('resize', WIN_W, WIN_H);
    this.dispatch('create');
    this.dispatch('activate');
    this.dispatch('getFocus');
    this.dirty = true;
    return !this.halted;
  }

  stop() {
    this.timerStop();
    this.L = null;
    this.halted = true;
    this.closeMenu();
  }

  _runChunk(code, name) {
    const { lua, lauxlib, to_luastring } = this.F;
    const L = this.L;
    const buf = to_luastring(code);
    if (lauxlib.luaL_loadbufferx(L, buf, buf.length, to_luastring(name), null) !== lua.LUA_OK) {
      this._fail(lua.lua_tojsstring(L, -1));
      lua.lua_pop(L, 1);
      return false;
    }
    return this._pcall(0, 0);
  }

  _pcall(nargs, nres) {
    const { lua, to_luastring } = this.F;
    const L = this.L;
    const base = lua.lua_gettop(L) - nargs;
    lua.lua_getglobal(L, to_luastring('debug'));
    lua.lua_getfield(L, -1, to_luastring('traceback'));
    lua.lua_remove(L, -2);
    lua.lua_insert(L, base);
    this.callStart = performance.now();
    let status;
    try {
      status = lua.lua_pcall(L, nargs, nres, base);
    } catch (e) {
      this.callStart = 0;
      lua.lua_settop(L, base - 1);
      this._fail(String(e && e.message || e));
      return false;
    }
    this.callStart = 0;
    lua.lua_remove(L, base);
    if (status !== lua.LUA_OK) {
      let msg = lua.lua_tojsstring(L, -1) ?? 'error desconocido';
      lua.lua_pop(L, 1);
      if (!this._handledByLua(msg)) this._fail(msg);
      return false;
    }
    return true;
  }

  _handledByLua(msg) {
    const { lua, to_luastring } = this.F;
    const L = this.L;
    if (!L) return false;
    lua.lua_getglobal(L, to_luastring('__nsp_error'));
    lua.lua_pushstring(L, to_luastring(msg.split('\n')[0]));
    if (lua.lua_pcall(L, 1, 1, 0) !== lua.LUA_OK) { lua.lua_pop(L, 1); return false; }
    const r = lua.lua_toboolean(L, -1);
    lua.lua_pop(L, 1);
    return r;
  }

  _fail(msg) {
    msg = String(msg).replace(/\n\s*\[C\]: in \?$/, '');
    this.timerStop();
    this.halted = true;
    this.lastError = msg;
    this.opts.onError?.(msg);
    this._showErrorDialog(msg.split('\n')[0]);
  }

  /** Llama a un evento on.* del script. Devuelve el primer valor de retorno. */
  dispatch(name, ...args) {
    if (!this.L || this.halted) return undefined;
    const { lua, to_luastring } = this.F;
    const L = this.L;
    lua.lua_getglobal(L, to_luastring('__nsp_dispatch'));
    lua.lua_pushstring(L, to_luastring(name));
    for (const a of args) this._push(a);
    if (!this._pcall(args.length + 1, 1)) return undefined;
    const r = this._get(-1);
    lua.lua_pop(L, 1);
    return r;
  }

  hasHandler(name) {
    if (!this.L || this.halted) return false;
    const { lua, to_luastring } = this.F;
    lua.lua_getglobal(this.L, to_luastring('__nsp_has'));
    lua.lua_pushstring(this.L, to_luastring(name));
    lua.lua_call(this.L, 1, 1);
    const r = lua.lua_toboolean(this.L, -1);
    lua.lua_pop(this.L, 1);
    return r;
  }

  // ------------------------------------------------------------ conversión JS <-> Lua
  _push(v) {
    const { lua, to_luastring } = this.F;
    const L = this.L;
    if (v === undefined || v === null) lua.lua_pushnil(L);
    else if (typeof v === 'number') {
      if (Number.isInteger(v) && Math.abs(v) < 2 ** 31) lua.lua_pushinteger(L, v);
      else lua.lua_pushnumber(L, v);
    } else if (typeof v === 'boolean') lua.lua_pushboolean(L, v);
    else if (typeof v === 'string') lua.lua_pushstring(L, to_luastring(v));
    else if (v instanceof Uint8Array) lua.lua_pushstring(L, v);
    else if (Array.isArray(v)) {
      lua.lua_createtable(L, v.length, 0);
      v.forEach((x, i) => { this._push(x); lua.lua_rawseti(L, -2, i + 1); });
    } else if (typeof v === 'object') {
      lua.lua_createtable(L, 0, 0);
      for (const [k, x] of Object.entries(v)) { this._push(x); lua.lua_setfield(L, -2, to_luastring(k)); }
    } else lua.lua_pushnil(L);
  }

  _get(i, depth = 0) {
    const { lua, to_jsstring } = this.F;
    const L = this.L;
    switch (lua.lua_type(L, i)) {
      case lua.LUA_TNUMBER: return lua.lua_tonumber(L, i);
      case lua.LUA_TBOOLEAN: return lua.lua_toboolean(L, i);
      case lua.LUA_TSTRING: {
        const raw = lua.lua_tolstring(L, i);
        try { return to_jsstring(raw); } catch { return raw; }
      }
      case lua.LUA_TTABLE: {
        if (depth > 3) return null;
        const idx = lua.lua_absindex(L, i);
        const n = lua.lua_rawlen(L, idx);
        const arr = [];
        for (let k = 1; k <= n; k++) {
          lua.lua_rawgeti(L, idx, k);
          arr.push(this._get(-1, depth + 1));
          lua.lua_pop(L, 1);
        }
        return arr;
      }
      default: return undefined;
    }
  }

  _installPrimitives() {
    const { lua, lauxlib, to_luastring } = this.F;
    const L = this.L;
    lua.lua_createtable(L, 0, 64);
    const reg = (name, fn) => {
      lua.lua_pushcfunction(L, (Ls) => {
        const n = lua.lua_gettop(Ls);
        const args = [];
        for (let i = 1; i <= n; i++) args.push(this._get(i));
        let r;
        try {
          r = fn(...args);
        } catch (e) {
          return lauxlib.luaL_error(Ls, to_luastring(String(e && e.message || e)));
        }
        if (r === undefined) return 0;
        if (r instanceof Multi) { r.values.forEach((v) => this._push(v)); return r.values.length; }
        this._push(r);
        return 1;
      });
      lua.lua_setfield(L, -2, to_luastring(name));
    };
    const P = this._primitives();
    for (const [k, fn] of Object.entries(P)) reg(k, fn);
    lua.lua_setglobal(L, to_luastring('__ti'));
  }

  // ------------------------------------------------------------ primitivas expuestas a Lua
  _primitives() {
    const c = this.ctx;
    const st = () => this.gcState;
    return {
      print: (s) => this.opts.onPrint?.(String(s)),
      winW: () => WIN_W,
      winH: () => WIN_H,
      invalidate: () => { this.dirty = true; },
      setBg: (v) => { this.bg = rgbHex(v); this.dirty = true; },
      millis: () => Math.floor(performance.now()),
      timerStart: (sec) => this.timerStart(sec),
      timerStop: () => this.timerStop(),
      clipGet: () => this.clipboard,
      clipAdd: (s) => { this.clipboard = s; navigator.clipboard?.writeText?.(s).catch(() => {}); },
      cursor: (name) => { this.canvas.style.cursor = CURSORS[name] || 'default'; },
      cursorShow: (b) => { if (!b) this.canvas.style.cursor = 'none'; else if (this.canvas.style.cursor === 'none') this.canvas.style.cursor = 'default'; },

      // texto y fuentes
      setFont: (family, style, size) => {
        const s = st();
        s.family = FONT_FAMILY[family] ? family : 'sansserif';
        s.style = style;
        s.size = Math.max(6, Math.min(255, Math.round(size)));
        this._applyFont(c);
      },
      strW: (s) => { this._applyFont(this.measureCtx); return Math.round(this.measureCtx.measureText(s).width); },
      strH: () => fontHeight(st().size),
      text: (s, x, y, align) => {
        this._applyFont(c);
        const h = fontHeight(st().size);
        let ty = y;
        if (align === 'middle') ty = y - h / 2;
        else if (align === 'bottom') ty = y - h;
        else if (align === 'baseline') ty = y - Math.round(h * 0.78);
        c.textBaseline = 'top';
        c.fillText(s, Math.floor(x), Math.floor(ty) + Math.round(h * 0.12));
      },

      // dibujo
      setColor: (r, g, b) => {
        const clamp = (v) => Math.max(0, Math.min(255, Math.floor(v)));
        const col = `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
        st().color = col;
        c.fillStyle = col; c.strokeStyle = col;
      },
      setPen: (size, style) => {
        const s = st();
        s.pen = PEN[size] || 1;
        s.dash = style === 'dotted' ? [1, 2] : style === 'dashed' ? [6, 3] : [];
        c.lineWidth = s.pen; c.setLineDash(s.dash);
      },
      line: (x1, y1, x2, y2) => {
        const o = st().pen % 2 ? 0.5 : 0;
        c.beginPath();
        c.moveTo(Math.floor(x1) + o, Math.floor(y1) + o);
        c.lineTo(Math.floor(x2) + o, Math.floor(y2) + o);
        c.stroke();
        if (st().pen === 1 && !st().dash.length) c.fillRect(Math.floor(x2), Math.floor(y2), 1, 1);
      },
      rect: (x, y, w, h, fill) => {
        x = Math.floor(x); y = Math.floor(y); w = Math.floor(w); h = Math.floor(h);
        if (fill) c.fillRect(x, y, w, h);
        else { const o = st().pen % 2 ? 0.5 : 0; c.strokeRect(x + o, y + o, w, h); }
      },
      arc: (x, y, w, h, start, sweep, fill) => {
        const rx = w / 2, ry = h / 2, cx = x + rx, cy = y + ry;
        if (rx <= 0 || ry <= 0) return;
        const a0 = -start * Math.PI / 180, a1 = -(start + sweep) * Math.PI / 180;
        c.beginPath();
        if (fill) c.moveTo(cx, cy);
        c.ellipse(cx, cy, rx, ry, 0, a0, a1, sweep > 0);
        if (fill) { c.closePath(); c.fill(); } else c.stroke();
      },
      poly: (fill, ...pts) => {
        if (pts.length < 4) return;
        const o = !fill && st().pen % 2 ? 0.5 : 0;
        c.beginPath();
        c.moveTo(pts[0] + o, pts[1] + o);
        for (let i = 2; i + 1 < pts.length; i += 2) c.lineTo(pts[i] + o, pts[i + 1] + o);
        if (fill) { c.closePath(); c.fill(); } else c.stroke();
      },
      clip: (op, x, y, w, h) => {
        // Restaurar el estado base de la ventana y aplicar el nuevo recorte.
        c.restore();
        c.save();
        if (op === 'set' || op === 'intersect') {
          c.beginPath();
          c.rect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
          c.clip();
        } else if (op === 'null') {
          c.beginPath(); c.rect(0, 0, 0, 0); c.clip();
        }
        this._applyState();
      },

      // imágenes
      imgNew: (data) => {
        const img = decodeTiImage(typeof data === 'string' ? new TextEncoder().encode(data) : data);
        const id = this.nextId++;
        this.images.set(id, img);
        return new Multi([id, img.width, img.height]);
      },
      imgCopy: (id, w, h) => {
        const src = this.images.get(id);
        w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
        const cv = makeCanvas(w, h);
        const cx = cv.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(src, 0, 0, w, h);
        const nid = this.nextId++;
        this.images.set(nid, cv);
        return new Multi([nid, w, h]);
      },
      imgRotate: (id, deg) => {
        const src = this.images.get(id);
        const a = -deg * Math.PI / 180;
        const w = Math.round(Math.abs(src.width * Math.cos(a)) + Math.abs(src.height * Math.sin(a)));
        const h = Math.round(Math.abs(src.width * Math.sin(a)) + Math.abs(src.height * Math.cos(a)));
        const cv = makeCanvas(w, h);
        const cx = cv.getContext('2d');
        cx.translate(w / 2, h / 2); cx.rotate(a);
        cx.drawImage(src, -src.width / 2, -src.height / 2);
        const nid = this.nextId++;
        this.images.set(nid, cv);
        return new Multi([nid, w, h]);
      },
      drawImage: (id, x, y) => {
        const img = this.images.get(id);
        if (!img) return;
        c.imageSmoothingEnabled = false;
        c.drawImage(img, Math.floor(x), Math.floor(y));
      },

      // variables
      varStore: (name, value) => {
        if (typeof value === 'function' || value === undefined) return 'tipo de valor no soportado';
        this.vars[name] = value;
        this.opts.onVarsChange?.(this.vars);
        return undefined;
      },
      varRecall: (name) => {
        const key = Object.keys(this.vars).find((k) => k.toLowerCase() === name.toLowerCase());
        return key === undefined ? undefined : this.vars[key];
      },
      varList: () => Object.keys(this.vars),
      varMonitor: (name, on) => { if (on) this.monitored.add(name.toLowerCase()); else this.monitored.delete(name.toLowerCase()); },
      mathEval: (expr) => {
        try {
          const v = evaluate(expr, this.vars);
          return new Multi([v]);
        } catch (e) {
          return new Multi([undefined, e.message]);
        }
      },
      fmtNum: (v) => formatNumber(v),

      // menú
      setMenu: (spec) => {
        this.menu = spec ? spec.split('\x1f').map((t) => {
          const [title, ...items] = t.split('\x1e');
          return { title, items };
        }) : null;
      },
      menuEnable: (tool, item, on) => {
        const k = `${tool}\x1e${item}`;
        if (on) this.menuDisabled.delete(k); else this.menuDisabled.add(k);
      },

      // D2Editor
      edNew: () => this._edNew(),
      edSet: (id, prop, a, b) => this._edSet(id, prop, a, b),
      edGet: (id, prop) => this._edGet(id, prop),
    };
  }

  _applyFont(ctx) {
    const s = this.gcState;
    const bold = s.style.includes('b') ? 'bold ' : '';
    const ital = s.style.includes('i') ? 'italic ' : '';
    ctx.font = `${ital}${bold}${fontPx(s.size)}px ${FONT_FAMILY[s.family]}`;
  }

  _applyState() {
    const c = this.ctx;
    const s = this.gcState;
    c.fillStyle = s.color; c.strokeStyle = s.color;
    c.lineWidth = s.pen; c.setLineDash(s.dash);
    this._applyFont(c);
  }

  _resetGcState() {
    this.gcState = { family: 'sansserif', style: 'r', size: 12, color: '#000', pen: 1, dash: [] };
  }

  // ------------------------------------------------------------ repintado
  paint() {
    this._drawChrome();
    const c = this.ctx;
    c.fillStyle = this.bg || '#fff';
    c.fillRect(WIN_X, WIN_Y, WIN_W, WIN_H);
    if (!this.L || this.halted) return;
    c.save();
    c.beginPath();
    c.rect(WIN_X, WIN_Y, WIN_W, WIN_H);
    c.clip();
    c.translate(WIN_X, WIN_Y);
    c.save(); // estado base para clipRect
    this._resetGcState();
    this._applyState();
    this.dispatch('paint', 0, 0, WIN_W, WIN_H);
    c.restore();
    c.restore();
  }

  _raf() {
    if (this.dirty) {
      this.dirty = false;
      if (this.L && !this.halted) this.paint();
      else if (!this.L) this._drawIdle('Carga un script .lua o .tns');
    }
    this._layoutEditors();
    requestAnimationFrame(this._raf);
  }

  // ------------------------------------------------------------ temporizador
  timerStart(sec) {
    this.timerStop();
    this.timerId = setInterval(() => {
      if (this.halted || !this.L) return this.timerStop();
      this.dispatch('timer');
    }, Math.max(10, sec * 1000));
  }
  timerStop() {
    if (this.timerId) clearInterval(this.timerId);
    this.timerId = null;
  }

  // ------------------------------------------------------------ entrada
  /** Tecla con nombre: enter, esc, tab, backtab, del, clear, return, menu, contextMenu, help, up/down/left/right, click */
  key(name) {
    if (this.errorDialog) { if (['enter', 'esc', 'click'].includes(name)) this._closeErrorDialog(); return; }
    if (this.menuEl) return this._menuKey(name);
    if (this.focusedEditor && this._editorKey(name)) return;
    switch (name) {
      case 'up': case 'down': case 'left': case 'right': return this.dispatch('arrow', name);
      case 'enter': return this.dispatch('enterKey');
      case 'esc': return this.dispatch('escapeKey');
      case 'tab': return this.dispatch('tabKey');
      case 'backtab': return this.dispatch('backtabKey');
      case 'del': return this.dispatch('backspaceKey');
      case 'delete': return this.dispatch('deleteKey');
      case 'clear': return this.dispatch('clearKey');
      case 'return': return this.dispatch('returnKey');
      case 'help': return this.dispatch('help');
      case 'contextMenu': return this.dispatch('contextMenu');
      case 'menu': return this.menu ? this.openMenu() : undefined;
      case 'click': {
        const { x, y } = this.cursorPos;
        this.dispatch('mouseDown', x, y);
        return this.dispatch('mouseUp', x, y);
      }
      default: return undefined;
    }
  }

  charIn(ch) {
    if (this.errorDialog) return;
    if (this.menuEl) { this.menuCharIn(ch); return; }
    if (this.focusedEditor) {
      const ed = this.editors.get(this.focusedEditor);
      if (ed && !this.dispatch('__edFilter', ed.id, 'charIn', ch)) this._edInsert(ed, ch);
      return;
    }
    this.dispatch('charIn', ch);
  }

  _bindPointer() {
    const toWin = (e) => {
      const r = this.canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width * SCREEN_W - WIN_X;
      const y = (e.clientY - r.top) / r.height * SCREEN_H - WIN_Y;
      return { x: Math.floor(x), y: Math.floor(y) };
    };
    const inside = (p) => p.x >= 0 && p.y >= 0 && p.x < WIN_W && p.y < WIN_H;
    let down = false;
    this.canvas.addEventListener('pointerdown', (e) => {
      const p = toWin(e);
      if (this.errorDialog) return this._closeErrorDialog();
      if (!inside(p)) return;
      e.preventDefault();
      this.canvas.setPointerCapture?.(e.pointerId);
      down = true;
      this.cursorPos = p;
      this._blurEditors();
      this.dispatch('mouseDown', p.x, p.y);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const p = toWin(e);
      if (!inside(p) || (e.pointerType !== 'mouse' && !down)) return;
      this.cursorPos = p;
      this.dispatch('mouseMove', p.x, p.y);
    });
    const up = (e) => {
      if (!down) return;
      down = false;
      const p = toWin(e);
      this.dispatch('mouseUp', p.x, p.y);
    };
    this.canvas.addEventListener('pointerup', up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.dispatch('rightMouseDown', ...Object.values(toWin(e))); });
  }

  // ------------------------------------------------------------ menú (toolpalette)
  openMenu() {
    if (!this.menu || !this.menu.length) return;
    this.closeMenu();
    const el = document.createElement('div');
    el.className = 'nsp-menu';
    this.menuEl = el;
    this.menuSel = { tool: 0, item: -1 };
    this.overlay.append(el);
    this._renderMenu();
  }
  closeMenu() {
    this.menuEl?.remove();
    this.menuEl = null;
    this.dirty = true;
  }
  _renderMenu() {
    const el = this.menuEl;
    el.replaceChildren();
    const list = document.createElement('ol');
    list.className = 'nsp-menu-tools';
    this.menu.forEach((tool, i) => {
      const li = document.createElement('li');
      li.textContent = tool.title;
      if (i === this.menuSel.tool) li.classList.add('sel');
      li.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.menuSel = { tool: i, item: 0 }; this._renderMenu(); });
      list.append(li);
    });
    el.append(list);
    if (this.menuSel.item >= 0) {
      const tool = this.menu[this.menuSel.tool];
      const sub = document.createElement('ol');
      sub.className = 'nsp-menu-items';
      sub.style.top = `${4 + this.menuSel.tool * 20}px`;
      tool.items.forEach((name, j) => {
        const li = document.createElement('li');
        if (name === '-') { li.className = 'sep'; sub.append(li); return; }
        li.textContent = name;
        if (this.menuDisabled.has(`${tool.title}\x1e${name}`)) li.classList.add('off');
        if (j === this.menuSel.item) li.classList.add('sel');
        li.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._menuPick(this.menuSel.tool, j); });
        sub.append(li);
      });
      el.append(sub);
    }
  }
  _menuPick(i, j) {
    const tool = this.menu[i];
    const name = tool.items[j];
    if (name === '-' || this.menuDisabled.has(`${tool.title}\x1e${name}`)) return;
    this.closeMenu();
    this.dispatch('__menu', i + 1, j + 1);
    this.dirty = true;
  }
  _menuKey(name) {
    const s = this.menuSel;
    const n = this.menu.length;
    if (name === 'esc' || name === 'menu') {
      if (s.item >= 0) { s.item = -1; this._renderMenu(); } else this.closeMenu();
      return;
    }
    if (s.item < 0) {
      if (name === 'up') s.tool = (s.tool + n - 1) % n;
      else if (name === 'down') s.tool = (s.tool + 1) % n;
      else if (name === 'right' || name === 'enter' || name === 'click') s.item = 0;
    } else {
      const items = this.menu[s.tool].items;
      const m = items.length;
      if (name === 'up') do s.item = (s.item + m - 1) % m; while (items[s.item] === '-');
      else if (name === 'down') do s.item = (s.item + 1) % m; while (items[s.item] === '-');
      else if (name === 'left') s.item = -1;
      else if (name === 'enter' || name === 'click') return this._menuPick(s.tool, s.item);
    }
    this._renderMenu();
  }
  menuCharIn(ch) {
    // en la calculadora se puede elegir con el número de la opción
    if (!this.menuEl) return false;
    const k = parseInt(ch, 10);
    if (!k) return true;
    if (this.menuSel.item < 0) { if (k <= this.menu.length) { this.menuSel = { tool: k - 1, item: 0 }; this._renderMenu(); } }
    else if (k <= this.menu[this.menuSel.tool].items.length) this._menuPick(this.menuSel.tool, k - 1);
    return true;
  }

  // ------------------------------------------------------------ D2Editor
  _edNew() {
    const id = this.nextId++;
    const el = document.createElement('textarea');
    el.className = 'nsp-editor';
    el.spellcheck = false;
    el.setAttribute('autocapitalize', 'off');
    el.setAttribute('autocorrect', 'off');
    const ed = { id, el, x: 0, y: 0, w: 100, h: 30, visible: true, fontSize: 11 };
    el.addEventListener('focus', () => { this.focusedEditor = id; });
    el.addEventListener('blur', () => { if (this.focusedEditor === id) this.focusedEditor = null; });
    el.addEventListener('input', () => this.dispatch('__edChange', id));
    el.addEventListener('keydown', (e) => {
      const map = { Enter: 'enterKey', Escape: 'escapeKey', Tab: 'tabKey', ArrowUp: 'arrowKey', ArrowDown: 'arrowKey', ArrowLeft: 'arrowKey', ArrowRight: 'arrowKey' };
      const ev = map[e.key];
      if (!ev) return;
      const arg = e.key.startsWith('Arrow') ? e.key.slice(5).toLowerCase() : undefined;
      if (this.dispatch('__edFilter', id, ev, arg)) { e.preventDefault(); this.dirty = true; return; }
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); el.blur(); this.key(e.key === 'Tab' ? 'tab' : 'esc'); }
    });
    this.editors.set(id, ed);
    this.overlay.append(el);
    return id;
  }
  _edSet(id, prop, a, b) {
    const ed = this.editors.get(id);
    if (!ed) return;
    const el = ed.el;
    switch (prop) {
      case 'move': ed.x = a; ed.y = b; break;
      case 'resize': ed.w = a; ed.h = b; break;
      case 'text': el.value = a; break;
      case 'focus': if (a) { el.focus({ preventScroll: true }); this.focusedEditor = id; } else el.blur(); break;
      case 'visible': ed.visible = a; break;
      case 'readonly': el.readOnly = a; break;
      case 'border': el.style.borderWidth = `${a}px`; break;
      case 'borderColor': el.style.borderColor = rgbHex(a); break;
      case 'fontSize': ed.fontSize = a; break;
      case 'font': el.style.fontFamily = FONT_FAMILY[a] || FONT_FAMILY.sansserif; el.style.fontWeight = /b/.test(b) ? 'bold' : ''; el.style.fontStyle = /i/.test(b) ? 'italic' : ''; break;
      case 'color': el.style.color = rgbHex(a); break;
      default: break;
    }
    this._layoutEditors();
  }
  _edGet(id, prop) {
    const ed = this.editors.get(id);
    if (!ed) return undefined;
    if (prop === 'text') return ed.el.value;
    if (prop === 'focus') return this.focusedEditor === id;
    if (prop === 'visible') return ed.visible;
    if (prop === 'readonly') return ed.el.readOnly;
    return undefined;
  }
  _layoutEditors() {
    if (!this.editors) return;
    for (const ed of this.editors.values()) {
      const s = ed.el.style;
      s.left = `${WIN_X + ed.x}px`; s.top = `${WIN_Y + ed.y}px`;
      s.width = `${ed.w}px`; s.height = `${ed.h}px`;
      s.fontSize = `${fontPx(ed.fontSize)}px`;
      s.display = ed.visible && !this.halted ? 'block' : 'none';
    }
  }
  _blurEditors() {
    for (const ed of this.editors?.values() ?? []) ed.el.blur();
    this.focusedEditor = null;
  }
  _edInsert(ed, ch) {
    const el = ed.el;
    if (el.readOnly) return;
    const s = el.selectionStart ?? el.value.length, e = el.selectionEnd ?? s;
    el.value = el.value.slice(0, s) + ch + el.value.slice(e);
    el.selectionStart = el.selectionEnd = s + ch.length;
    this.dispatch('__edChange', ed.id);
  }
  _editorKey(name) {
    const ed = this.editors.get(this.focusedEditor);
    if (!ed) return false;
    const evs = { enter: 'enterKey', esc: 'escapeKey', tab: 'tabKey', up: 'arrowKey', down: 'arrowKey', left: 'arrowKey', right: 'arrowKey', del: 'backspaceKey' };
    const ev = evs[name];
    if (ev && this.dispatch('__edFilter', ed.id, ev, ev === 'arrowKey' ? name : undefined)) return true;
    const el = ed.el;
    const s = el.selectionStart ?? 0, e = el.selectionEnd ?? s;
    if (name === 'del') {
      if (s !== e) el.value = el.value.slice(0, s) + el.value.slice(e);
      else if (s > 0) { el.value = el.value.slice(0, s - 1) + el.value.slice(s); el.selectionStart = el.selectionEnd = s - 1; }
      this.dispatch('__edChange', ed.id);
      return true;
    }
    if (name === 'left') { el.selectionStart = el.selectionEnd = Math.max(0, s - 1); return true; }
    if (name === 'right') { el.selectionStart = el.selectionEnd = Math.min(el.value.length, e + 1); return true; }
    if (name === 'esc' || name === 'tab') { this._blurEditors(); return false; }
    return false;
  }

  // ------------------------------------------------------------ diálogo de error
  _showErrorDialog(msg) {
    this._closeErrorDialog();
    const d = document.createElement('div');
    d.className = 'nsp-error';
    d.innerHTML = '<div class="nsp-error-title">Error</div><div class="nsp-error-msg"></div><div class="nsp-error-btn">OK</div>';
    d.querySelector('.nsp-error-msg').textContent = msg;
    d.addEventListener('pointerdown', () => this._closeErrorDialog());
    this.overlay.append(d);
    this.errorDialog = d;
  }
  _closeErrorDialog() {
    this.errorDialog?.remove();
    this.errorDialog = null;
  }

  /** Cambia una variable desde fuera (panel de variables) y avisa a on.varChange. */
  setVar(name, value) {
    this.vars[name] = value;
    if (this.monitored.has(name.toLowerCase())) this.dispatch('varChange', [name]);
    this.dirty = true;
  }
}

class Multi { constructor(values) { this.values = values; } }

const CURSORS = {
  default: 'default', arrow: 'default', pointer: 'pointer', 'hand pointer': 'pointer', 'hand open': 'grab',
  'hand closed': 'grabbing', 'drag grab': 'grabbing', crosshair: 'crosshair', 'text': 'text', 'interrogation': 'help',
  'translation': 'move', 'rotation': 'alias', 'resize column': 'col-resize', 'resize row': 'row-resize', 'diag resize': 'nwse-resize',
};

function fontPx(size) { return Math.round(size * 1.08); }
function fontHeight(size) { return Math.round(fontPx(size) * 1.32); }
function rgbHex(v) { return '#' + (Math.floor(v) & 0xFFFFFF).toString(16).padStart(6, '0'); }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

/** Decodifica el formato de imagen TI (cabecera de 20 bytes + píxeles ARGB1555 LE). */
export function decodeTiImage(b) {
  if (b.length < 20) throw new Error('image.new: datos de imagen inválidos');
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const w = dv.getUint32(0, true), h = dv.getUint32(4, true);
  const stride = dv.getUint32(12, true) || w * 2;
  if (!w || !h || w > 4096 || h > 4096 || 20 + stride * h > b.length) throw new Error('image.new: datos de imagen inválidos');
  const cv = makeCanvas(w, h);
  const cx = cv.getContext('2d');
  const id = cx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = dv.getUint16(20 + y * stride + x * 2, true);
      const o = (y * w + x) * 4;
      id.data[o] = ((px >> 10) & 31) * 255 / 31;
      id.data[o + 1] = ((px >> 5) & 31) * 255 / 31;
      id.data[o + 2] = (px & 31) * 255 / 31;
      id.data[o + 3] = px & 0x8000 ? 255 : 0;
    }
  }
  cx.putImageData(id, 0, 0);
  return cv;
}
