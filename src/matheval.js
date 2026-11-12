// Evaluador numérico sencillo para math.eval() de la API Lua.
// La calculadora real usa su motor CAS; aquí solo se evalúan expresiones numéricas
// (modo radianes) con funciones habituales y variables guardadas con var.store().

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  'sin⁻¹': Math.asin, 'cos⁻¹': Math.acos, 'tan⁻¹': Math.atan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, '√': Math.sqrt, ln: Math.log, log: Math.log10, exp: Math.exp,
  abs: Math.abs, floor: Math.floor, ceiling: Math.ceil, ceil: Math.ceil, round: Math.round,
  int: Math.floor, iPart: Math.trunc, ipart: Math.trunc, fpart: (x) => x - Math.trunc(x),
  sign: Math.sign, max: Math.max, min: Math.min, root: (x, n) => Math.pow(x, 1 / n),
  mod: (a, b) => a - b * Math.floor(a / b),
};
const CONSTS = { 'π': Math.PI, pi: Math.PI, e: Math.E, '∞': Infinity };

function tokenize(src) {
  const s = src.replace(/×|·/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/ᴇ|ᴇ/g, 'E')
    .replace(/²/g, '^2').replace(/³/g, '^3').replace(/\*\*/g, '^');
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const m = /^(\d+\.?\d*|\.\d+)(E[-+]?\d+)?/i.exec(s.slice(i));
    if (m && /[\d.]/.test(c)) { toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue; }
    const id = /^([A-Za-z_À-ɏͰ-Ͽ][A-Za-z0-9_À-ɏͰ-Ͽ]*(⁻¹)?|√|∞)/.exec(s.slice(i));
    if (id) { toks.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^(),!'.includes(c)) { toks.push({ t: c }); i++; continue; }
    throw new Error(`Carácter no válido: "${c}"`);
  }
  return toks;
}

export function evaluate(src, vars = {}) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => { if (peek() && peek().t === t) return toks[p++]; return null; };
  const expect = (t) => { if (!take(t)) throw new Error(`Se esperaba "${t}"`); };

  function expr() {
    let v = term();
    for (;;) {
      if (take('+')) v += term();
      else if (take('-')) v -= term();
      else return v;
    }
  }
  function startsFactor(tok) { return tok && (tok.t === 'num' || tok.t === 'id' || tok.t === '('); }
  function term() {
    let v = unary();
    for (;;) {
      if (take('*')) v *= unary();
      else if (take('/')) v /= unary();
      else if (startsFactor(peek())) v *= unary(); // multiplicación implícita: 2π, 3(x+1)
      else return v;
    }
  }
  function unary() {
    if (take('-')) return -unary();
    if (take('+')) return unary();
    return power();
  }
  function power() {
    const base = postfix();
    if (take('^')) return Math.pow(base, unary());
    return base;
  }
  function postfix() {
    let v = primary();
    while (take('!')) { let r = 1; for (let k = 2; k <= v; k++) r *= k; v = r; }
    return v;
  }
  function primary() {
    const tok = toks[p++];
    if (!tok) throw new Error('Expresión incompleta');
    if (tok.t === 'num') return tok.v;
    if (tok.t === '(') { const v = expr(); expect(')'); return v; }
    if (tok.t === 'id') {
      const name = tok.v;
      const fn = FUNCS[name] || FUNCS[name.toLowerCase()];
      if (fn && peek() && peek().t === '(') {
        p++;
        const args = [expr()];
        while (take(',')) args.push(expr());
        expect(')');
        return fn(...args);
      }
      if (fn && name === '√') return fn(unary());
      if (name in CONSTS) return CONSTS[name];
      const key = Object.keys(vars).find((k) => k.toLowerCase() === name.toLowerCase());
      if (key !== undefined) {
        const v = vars[key];
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? 1 : 0;
        const n = Number(v);
        if (!Number.isNaN(n)) return n;
      }
      throw new Error(`Variable no definida: ${name}`);
    }
    throw new Error(`Símbolo inesperado: ${tok.t}`);
  }
  const v = expr();
  if (p < toks.length) throw new Error('Error de sintaxis');
  return v;
}

/** Formatea como la calculadora (hasta 12 cifras significativas). */
export function formatNumber(v) {
  if (typeof v !== 'number') return String(v);
  if (!Number.isFinite(v)) return Number.isNaN(v) ? 'undef' : v > 0 ? '∞' : '-∞';
  if (Number.isInteger(v) && Math.abs(v) < 1e12) return String(v);
  let s = Number(v.toPrecision(12)).toString();
  s = s.replace('e+', 'e').replace(/e/, 'ᴇ');
  return s;
}
