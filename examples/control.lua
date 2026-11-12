-- Respuesta al escalón de un sistema de 2º orden
--   G(s) = wn² / (s² + 2·z·wn·s + wn²)
-- ▲ ▼ cambia el amortiguamiento z · ◀ ▶ cambia wn · enter: guardar en variables

platform.apiLevel = "2.4"

local W, H = 318, 212
local z, wn = 0.3, 2.0
local T = 10       -- s simulados
local datos = {}
local Mp, ts, tr = 0, 0, 0

local function simular()
  -- RK4 sobre x'' + 2 z wn x' + wn^2 x = wn^2 (escalón unitario)
  local n = 300
  local dt = T / n
  local x, v = 0, 0
  local function f(xx, vv) return vv, wn * wn * (1 - xx) - 2 * z * wn * vv end
  datos = { 0 }
  local maxv, t10, t90 = 0, nil, nil
  ts = 0
  for i = 1, n do
    local k1x, k1v = f(x, v)
    local k2x, k2v = f(x + dt / 2 * k1x, v + dt / 2 * k1v)
    local k3x, k3v = f(x + dt / 2 * k2x, v + dt / 2 * k2v)
    local k4x, k4v = f(x + dt * k3x, v + dt * k3v)
    x = x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x)
    v = v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
    datos[i + 1] = x
    local t = i * dt
    if x > maxv then maxv = x end
    if not t10 and x >= 0.1 then t10 = t end
    if not t90 and x >= 0.9 then t90 = t end
    if math.abs(x - 1) > 0.02 then ts = t end
  end
  Mp = math.max(0, (maxv - 1) * 100)
  tr = (t10 and t90) and (t90 - t10) or 0
end

function on.construction() simular() end
function on.resize(w, h) W, H = w, h end

function on.arrowKey(k)
  if k == "up" then z = math.min(2, z + 0.05)
  elseif k == "down" then z = math.max(0, z - 0.05)
  elseif k == "right" then wn = math.min(10, wn + 0.25)
  elseif k == "left" then wn = math.max(0.25, wn - 0.25) end
  simular()
  platform.window:invalidate()
end

function on.enterKey()
  var.store("zeta", z)
  var.store("wn", wn)
  var.store("mp", Mp)
  print(string.format("Guardado: zeta=%.2f wn=%.2f Mp=%.1f%%", z, wn, Mp))
end

function on.paint(gc)
  local gx, gy, gw, gh = 34, 30, W - 44, H - 62
  gc:setFont("sansserif", "b", 10)
  gc:setColorRGB(20, 40, 80)
  gc:drawString(string.format("Escalón 2º orden   ζ=%.2f   ωn=%.2f rad/s", z, wn), 6, 4, "top")

  -- ejes y cuadrícula
  gc:setColorRGB(225, 228, 232)
  for i = 1, 4 do
    local yy = gy + gh - i * gh / 4 * 0.625
    gc:drawLine(gx, yy, gx + gw, yy)
  end
  gc:setColorRGB(0, 0, 0)
  gc:drawLine(gx, gy, gx, gy + gh)
  gc:drawLine(gx, gy + gh, gx + gw, gy + gh)
  gc:setFont("sansserif", "r", 7)
  local ymax = 1.6
  for _, v in ipairs({ 0.5, 1.0, 1.5 }) do
    local yy = gy + gh - v / ymax * gh
    gc:drawString(string.format("%.1f", v), 8, yy, "middle")
  end
  gc:drawString("t=" .. T .. " s", gx + gw - 30, gy + gh + 2, "top")

  -- referencia 1.0
  gc:setColorRGB(150, 150, 150)
  gc:setPen("thin", "dashed")
  local y1 = gy + gh - 1 / ymax * gh
  gc:drawLine(gx, y1, gx + gw, y1)
  gc:setPen("thin", "smooth")

  -- curva
  gc:setColorRGB(30, 100, 210)
  gc:setPen("medium", "smooth")
  local pts = {}
  local n = #datos
  for i = 1, n do
    local v = math.min(ymax, math.max(0, datos[i]))
    pts[#pts + 1] = gx + (i - 1) / (n - 1) * gw
    pts[#pts + 1] = gy + gh - v / ymax * gh
  end
  gc:drawPolyLine(pts)
  gc:setPen("thin", "smooth")

  -- métricas
  gc:setColorRGB(0, 0, 0)
  gc:setFont("sansserif", "r", 9)
  gc:drawString(string.format("Mp=%.1f%%   tr=%.2f s   ts(2%%)=%.2f s", Mp, tr, ts), 6, H - 18, "top")
end
