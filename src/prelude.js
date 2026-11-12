// Código Lua que se ejecuta antes del script del usuario.
// Define la API de la TI-Nspire (platform, gc, on, timer, var, image, D2Editor,
// toolpalette, cursor, class, ...) sobre las primitivas JavaScript de __ti,
// y añade compatibilidad con Lua 5.1 (el Lua de la calculadora) sobre Fengari (Lua 5.3).
export const PRELUDE = String.raw`
local ti = __ti
__ti = nil
local type, tostring, tonumber, error, select, pairs, ipairs, setmetatable =
      type, tostring, tonumber, error, select, pairs, ipairs, setmetatable

---------------------------------------------------------------- Lua 5.1
unpack = table.unpack
loadstring = function(s, name) return load(s, name) end
math.pow = function(a, b) return a ^ b end
math.mod = math.fmod
math.ldexp = math.ldexp or function(m, e) return m * 2.0 ^ e end
math.frexp = math.frexp or function(x)
  if x == 0 then return 0.0, 0 end
  local e = math.floor(math.log(math.abs(x), 2)) + 1
  return x / 2.0 ^ e, e
end
math.log10 = math.log10 or function(x) return math.log(x, 10) end
math.cosh = math.cosh or function(x) return (math.exp(x) + math.exp(-x)) / 2 end
math.sinh = math.sinh or function(x) return (math.exp(x) - math.exp(-x)) / 2 end
math.tanh = math.tanh or function(x) local a, b = math.exp(x), math.exp(-x) return (a - b) / (a + b) end
math.atan2 = math.atan2 or function(y, x) return math.atan(y, x) end
table.getn = function(t) return #t end
table.setn = function() end
table.maxn = table.maxn or function(t)
  local m = 0
  for k in pairs(t) do if type(k) == "number" and k > m then m = k end end
  return m
end
string.gfind = string.gmatch
getfenv = getfenv or function() return _G end
setfenv = setfenv or function(f) return f end
do
  -- Lua 5.1 acepta %d con números no enteros (los trunca); 5.3 da error.
  local fmt, floor, ceil, tointeger, mtype = string.format, math.floor, math.ceil, math.tointeger, math.type
  local intconv = { d = true, i = true, x = true, X = true, o = true, c = true }
  string.format = function(f, ...)
    local args = table.pack(...)
    local n = 0
    for _, conv in tostring(f):gmatch("%%([-+ #0%d%.]*)(.)") do
      if conv ~= "%" then
        n = n + 1
        local v = args[n]
        if intconv[conv] and type(v) == "number" and mtype(v) == "float" then
          if v ~= v or v == math.huge or v == -math.huge then v = 0 end
          args[n] = tointeger(v >= 0 and floor(v) or ceil(v)) or v
        end
      end
    end
    return fmt(f, table.unpack(args, 1, args.n))
  end
end
string.uchar = utf8.char
print = function(...)
  local t = {}
  for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
  ti.print(table.concat(t, "\t"))
end

---------------------------------------------------------------- utilidades
local function argerr(i, fname, expected, v, level)
  error(("bad argument #%d to '%s' (%s expected, got %s)"):format(i, fname, expected, type(v)), (level or 2) + 1)
end
local function num(v, i, fname)
  local n = tonumber(v)
  if n == nil then argerr(i, fname, "number", v, 2) end
  return n
end
local function optnum(v, i, fname, default)
  if v == nil then return default end
  return num(v, i, fname)
end

---------------------------------------------------------------- class()
function class(parent)
  local c = {}
  c.__index = c
  local mt = {
    __call = function(cls, ...)
      local o = setmetatable({}, cls)
      if cls.init then cls.init(o, ...) end
      return o
    end,
  }
  if parent then
    mt.__index = parent
    for k, v in pairs(parent) do
      if type(k) == "string" and k:sub(1, 2) == "__" and k ~= "__index" then c[k] = v end
    end
  end
  return setmetatable(c, mt)
end

---------------------------------------------------------------- gc
local GC = {}
GC.__index = GC
local screenGC = setmetatable({ __canDraw = true }, GC)
local measureGC = setmetatable({ __canDraw = false }, GC)

local function points(fname, first, ...)
  local t = first
  if type(first) ~= "table" then t = { first, ... } end
  for i = 1, #t do t[i] = num(t[i], 1, fname) end
  return t
end

function GC:drawString(s, x, y, align)
  if type(s) ~= "string" and type(s) ~= "number" then argerr(1, "drawString", "string", s) end
  if self.__canDraw then
    ti.text(tostring(s), num(x, 2, "drawString"), num(y, 3, "drawString"), align or "top")
  end
end
function GC:getStringWidth(s)
  if type(s) ~= "string" and type(s) ~= "number" then argerr(1, "getStringWidth", "string", s) end
  return ti.strW(tostring(s))
end
function GC:getStringHeight(s)
  return ti.strH(tostring(s or "A"))
end
function GC:setFont(family, style, size)
  ti.setFont(tostring(family or "sansserif"), tostring(style or "r"), optnum(size, 3, "setFont", 12))
end
function GC:setColorRGB(r, g, b)
  r = num(r, 1, "setColorRGB")
  if g == nil then
    ti.setColor((r // 65536) % 256, (r // 256) % 256, r % 256)
  else
    ti.setColor(r, num(g, 2, "setColorRGB"), num(b, 3, "setColorRGB"))
  end
end
function GC:setPen(size, style) ti.setPen(tostring(size or "thin"), tostring(style or "smooth")) end
function GC:drawLine(x1, y1, x2, y2)
  if self.__canDraw then ti.line(num(x1, 1, "drawLine"), num(y1, 2, "drawLine"), num(x2, 3, "drawLine"), num(y2, 4, "drawLine")) end
end
function GC:drawRect(x, y, w, h)
  if self.__canDraw then ti.rect(num(x, 1, "drawRect"), num(y, 2, "drawRect"), num(w, 3, "drawRect"), num(h, 4, "drawRect"), false) end
end
function GC:fillRect(x, y, w, h)
  if self.__canDraw then ti.rect(num(x, 1, "fillRect"), num(y, 2, "fillRect"), num(w, 3, "fillRect"), num(h, 4, "fillRect"), true) end
end
function GC:drawArc(x, y, w, h, s, a)
  if self.__canDraw then ti.arc(num(x, 1, "drawArc"), num(y, 2, "drawArc"), num(w, 3, "drawArc"), num(h, 4, "drawArc"), num(s, 5, "drawArc"), num(a, 6, "drawArc"), false) end
end
function GC:fillArc(x, y, w, h, s, a)
  if self.__canDraw then ti.arc(num(x, 1, "fillArc"), num(y, 2, "fillArc"), num(w, 3, "fillArc"), num(h, 4, "fillArc"), num(s, 5, "fillArc"), num(a, 6, "fillArc"), true) end
end
function GC:drawPolyLine(...)
  local t = points("drawPolyLine", ...)
  if self.__canDraw then ti.poly(false, table.unpack(t)) end
end
function GC:fillPolygon(...)
  local t = points("fillPolygon", ...)
  if self.__canDraw then ti.poly(true, table.unpack(t)) end
end
function GC:clipRect(op, x, y, w, h)
  if self.__canDraw then ti.clip(tostring(op or "reset"), tonumber(x) or 0, tonumber(y) or 0, tonumber(w) or 0, tonumber(h) or 0) end
end
function GC:drawImage(img, x, y)
  if type(img) ~= "table" or not img.__id then argerr(1, "drawImage", "image", img) end
  if self.__canDraw then ti.drawImage(img.__id, num(x, 2, "drawImage"), num(y, 3, "drawImage")) end
end
function GC:begin() end
function GC:finish() end
function GC:setAlpha() end

---------------------------------------------------------------- platform
local window = {}
function window:width() return ti.winW() end
function window:height() return ti.winH() end
function window:invalidate() ti.invalidate() end
function window:setFocus() end
function window:setBackgroundColor(c) ti.setBg(num(c, 1, "setBackgroundColor")) end
function window:getScrollHeight() return 0 end
function window:setScrollHeight() end
function window:displayInvalidatedRectangles() end

local errorHandler
platform = {
  window = window,
  apiLevel = "2.7",
  hw = function() return 7 end,
  isColorDisplay = function() return true end,
  isDeviceModeRendering = function() return true end,
  isTabletModeRendering = function() return false end,
  getDeviceID = function() return "EMULADOR-WEB" end,
  withGC = function(f, ...) return f(measureGC, ...) end,
  gc = function() return measureGC end,
  registerErrorHandler = function(f) errorHandler = f end,
  registerEventHandler = function() end,
  clipboard = {
    getText = function() return ti.clipGet() end,
    addText = function(s) ti.clipAdd(tostring(s)) end,
  },
}
platform.apilevel = platform.apiLevel

---------------------------------------------------------------- on / timer / cursor / locale / document
on = {}
timer = {
  start = function(p) ti.timerStart(math.max(0.01, num(p, 1, "start"))) end,
  stop = function() ti.timerStop() end,
  getMilliSecCounter = function() return ti.millis() end,
}
cursor = {
  set = function(name) ti.cursor(tostring(name or "default")) end,
  show = function() ti.cursorShow(true) end,
  hide = function() ti.cursorShow(false) end,
}
locale = { name = function() return "es" end }
document = { markChanged = function() end }

---------------------------------------------------------------- var / math.eval
var = {
  store = function(name, value)
    if type(name) ~= "string" then argerr(1, "store", "string", name) end
    return ti.varStore(name, value)
  end,
  recall = function(name) return ti.varRecall(tostring(name)) end,
  recallStr = function(name)
    local v = ti.varRecall(tostring(name))
    if v == nil then return nil, "variable no definida" end
    return tostring(v)
  end,
  recallAt = function(name, col, row)
    local v = ti.varRecall(tostring(name))
    if type(v) ~= "table" then return nil end
    if row then v = v[row] if type(v) ~= "table" then return nil end end
    return v[col]
  end,
  storeAt = function(name, value, col)
    local v = ti.varRecall(tostring(name))
    if type(v) ~= "table" then v = {} end
    v[col] = value
    return ti.varStore(name, v)
  end,
  list = function() return ti.varList() end,
  monitor = function(name) ti.varMonitor(tostring(name), true) return 0 end,
  unmonitor = function(name) ti.varMonitor(tostring(name), false) end,
  makeNumericSliderSettings = function() end,
}
math.eval = function(expr)
  if type(expr) ~= "string" then argerr(1, "eval", "string", expr) end
  local v, err = ti.mathEval(expr)
  if v == nil then return nil, err end
  return v
end
math.evalStr = function(expr)
  local v, err = math.eval(expr)
  if v == nil then return nil, err end
  return ti.fmtNum(v)
end
math.setEvalSettings = function() end
math.getEvalSettings = function() return {} end

---------------------------------------------------------------- require
local builtin = {
  color = {
    black = 0x000000, white = 0xFFFFFF, red = 0xFF0000, green = 0x00FF00, blue = 0x0000FF,
    yellow = 0xFFFF00, cyan = 0x00FFFF, magenta = 0xFF00FF, orange = 0xFFA500, gray = 0x808080,
    grey = 0x808080, lightgray = 0xD3D3D3, darkgray = 0x404040, navy = 0x000080, maroon = 0x800000,
    purple = 0x800080, brown = 0xA52A2A, pink = 0xFFC0CB, darkgreen = 0x006400,
  },
  physics = setmetatable({}, { __index = function(_, k) error("physics." .. tostring(k) .. " no está disponible en el emulador", 2) end }),
  strict = {},
}
local _require = require
function require(name)
  local m = builtin[name]
  if m then
    package.loaded[name] = m
    if name == "color" then _G.color = m end
    if name == "physics" then _G.physics = m end
    return m
  end
  return _require(name)
end

---------------------------------------------------------------- image
local Img = {}
Img.__index = Img
local function wrapImg(id, w, h) return setmetatable({ __id = id, __w = w, __h = h }, Img) end
image = {}
function image.new(data)
  if type(data) ~= "string" then argerr(1, "new", "string", data) end
  return wrapImg(ti.imgNew(data))
end
function Img:width() return self.__w end
function Img:height() return self.__h end
function Img:copy(w, h) return wrapImg(ti.imgCopy(self.__id, num(w, 1, "copy"), num(h, 2, "copy"))) end
function Img:rotate(a) return wrapImg(ti.imgRotate(self.__id, num(a, 1, "rotate"))) end
image.width = function(i) return i:width() end
image.height = function(i) return i:height() end
image.copy = function(i, w, h) return i:copy(w, h) end
image.rotate = function(i, a) return i:rotate(a) end
_R = { IMG = {} }

---------------------------------------------------------------- toolpalette (menú)
local menuDef
toolpalette = {
  register = function(m)
    menuDef = m
    if m == nil then ti.setMenu("") return end
    local tools = {}
    for i, tool in ipairs(m) do
      local items = { tostring(tool[1]) }
      for j = 2, #tool do
        local it = tool[j]
        items[#items + 1] = type(it) == "table" and tostring(it[1]) or "-"
      end
      tools[i] = table.concat(items, "\30")
    end
    ti.setMenu(table.concat(tools, "\31"))
  end,
  enable = function(tool, item, on) ti.menuEnable(tostring(tool), tostring(item), on and true or false) end,
  enableCut = function() end, enableCopy = function() end, enablePaste = function() end,
}

---------------------------------------------------------------- D2Editor
local Ed = {}
local editors = {}
Ed.__index = function(self, k)
  local m = rawget(Ed, k)
  if m then return m end
  return function(s) return s end -- métodos no implementados: no hacen nada
end
D2Editor = {}
function D2Editor.newRichText()
  local id = ti.edNew()
  local e = setmetatable({ __id = id }, Ed)
  editors[id] = e
  return e
end
function Ed:move(x, y) ti.edSet(self.__id, "move", num(x, 1, "move"), num(y, 2, "move")) return self end
function Ed:resize(w, h) ti.edSet(self.__id, "resize", num(w, 1, "resize"), num(h, 2, "resize")) return self end
function Ed:setText(t) ti.edSet(self.__id, "text", tostring(t or "")) return self end
function Ed:setExpression(t) return self:setText(t) end
function Ed:getText() return ti.edGet(self.__id, "text") end
function Ed:getExpression() return ti.edGet(self.__id, "text") end
function Ed:setFocus(b) ti.edSet(self.__id, "focus", b ~= false) return self end
function Ed:hasFocus() return ti.edGet(self.__id, "focus") end
function Ed:setVisible(b) ti.edSet(self.__id, "visible", b ~= false) return self end
function Ed:isVisible() return ti.edGet(self.__id, "visible") end
function Ed:setReadOnly(b) ti.edSet(self.__id, "readonly", b ~= false) return self end
function Ed:isReadOnly() return ti.edGet(self.__id, "readonly") end
function Ed:setBorder(n) ti.edSet(self.__id, "border", tonumber(n) or 0) return self end
function Ed:setBorderColor(c) ti.edSet(self.__id, "borderColor", tonumber(c) or 0) return self end
function Ed:setColorable() return self end
function Ed:setFontSize(n) ti.edSet(self.__id, "fontSize", tonumber(n) or 12) return self end
function Ed:setMainFont(family, style) ti.edSet(self.__id, "font", tostring(family or "sansserif"), tostring(style or "r")) return self end
function Ed:setTextColor(c) ti.edSet(self.__id, "color", tonumber(c) or 0) return self end
function Ed:setTextChangeListener(f) self.__change = f return self end
function Ed:registerFilter(t) self.__filter = t return self end
function Ed:getExpressionSelection() local t = self:getText() return t, #t, #t end

---------------------------------------------------------------- despacho de eventos (llamado desde JS)
local function cap(s) return s:sub(1, 1):upper() .. s:sub(2) end

function __nsp_dispatch(name, ...)
  if name == "paint" then
    local f = on.paint
    if f then f(screenGC, ...) end
    return
  end
  if name == "arrow" then
    local dir = ...
    local sp = on["arrow" .. cap(dir)]
    if sp then return sp() end
    if on.arrowKey then return on.arrowKey(dir) end
    return
  end
  if name == "__menu" then
    local i, j = ...
    local tool = menuDef and menuDef[i]
    local item = tool and tool[j + 1]
    if type(item) == "table" and type(item[2]) == "function" then item[2](tool[1], item[1]) end
    return
  end
  if name == "__edChange" then
    local e = editors[...]
    if e and e.__change then e.__change(e) end
    return
  end
  if name == "__edFilter" then
    local id, ev, a, b = ...
    local e = editors[id]
    local f = e and e.__filter and e.__filter[ev]
    if f then return f(a, b) and true or false end
    return false
  end
  local f = on[name]
  if f then return f(...) end
end

function __nsp_has(name) return on[name] ~= nil end

function __nsp_error(msg)
  if errorHandler then
    local line = tonumber(tostring(msg):match(":(%d+):")) or 0
    local ok, res = pcall(errorHandler, line, tostring(msg), "", {})
    return ok and res == true
  end
  return false
end
`;
