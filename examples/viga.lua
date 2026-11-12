-- Viga simplemente apoyada con carga puntual
-- ◀ ▶ mueve la carga · ▲ ▼ cambia P · tab cambia la longitud L
-- Muestra reacciones, diagrama de cortante V(x) y de momento M(x)

platform.apiLevel = "2.4"

local W, H = 318, 212
local L = 6        -- m
local P = 10       -- kN
local a = 2        -- m (posición de la carga desde el apoyo A)

local function fmt(v)
  return string.format("%.2f", v)
end

local function reacciones()
  local RB = P * a / L
  local RA = P - RB
  return RA, RB
end

function on.resize(w, h) W, H = w, h end

function on.arrowKey(k)
  if k == "left" then a = math.max(0.25, a - 0.25)
  elseif k == "right" then a = math.min(L - 0.25, a + 0.25)
  elseif k == "up" then P = P + 1
  elseif k == "down" then P = math.max(1, P - 1) end
  platform.window:invalidate()
end

function on.tabKey()
  L = (L % 10) + 1
  if L < 2 then L = 2 end
  a = math.min(a, L - 0.25)
  platform.window:invalidate()
end

local function flecha(gc, x, y1, y2)
  gc:drawLine(x, y1, x, y2)
  gc:fillPolygon({ x - 4, y2 - 6, x + 4, y2 - 6, x, y2, x - 4, y2 - 6 })
end

function on.paint(gc)
  local RA, RB = reacciones()
  local Mmax = RA * a
  local x0, x1 = 30, W - 30
  local sx = (x1 - x0) / L
  local px = x0 + a * sx

  gc:setFont("sansserif", "b", 10)
  gc:setColorRGB(20, 40, 80)
  gc:drawString("Viga simplemente apoyada", 6, 2, "top")
  gc:setFont("sansserif", "r", 9)
  gc:setColorRGB(60, 60, 60)
  gc:drawString("L=" .. L .. " m   P=" .. P .. " kN   a=" .. fmt(a) .. " m", 6, 17, "top")

  -- viga
  local yb = 52
  gc:setColorRGB(120, 120, 120)
  gc:fillRect(x0, yb, x1 - x0, 5)
  -- apoyos
  gc:setColorRGB(0, 0, 0)
  gc:drawPolyLine({ x0, yb + 5, x0 - 6, yb + 15, x0 + 6, yb + 15, x0, yb + 5 })
  gc:drawPolyLine({ x1, yb + 5, x1 - 6, yb + 15, x1 + 6, yb + 15, x1, yb + 5 })
  gc:drawLine(x1 - 8, yb + 18, x1 + 8, yb + 18)
  -- carga
  gc:setColorRGB(200, 30, 30)
  flecha(gc, px, yb - 22, yb - 1)
  gc:setFont("sansserif", "r", 8)
  gc:drawString(P .. " kN", px + 4, yb - 24, "top")
  -- reacciones
  gc:setColorRGB(30, 110, 40)
  gc:drawString("RA=" .. fmt(RA), x0 - 22, yb + 19, "top")
  gc:drawString("RB=" .. fmt(RB), x1 - 26, yb + 19, "top")

  -- diagrama de cortante
  local yv = 108
  local sv = 18 / math.max(RA, RB)
  gc:setColorRGB(200, 200, 200)
  gc:drawLine(x0, yv, x1, yv)
  gc:setColorRGB(30, 90, 200)
  gc:fillRect(x0, yv - RA * sv, px - x0, RA * sv)
  gc:fillRect(px, yv, x1 - px, RB * sv)
  gc:setColorRGB(0, 0, 0)
  gc:setFont("sansserif", "b", 8)
  gc:drawString("V", 6, yv - 6, "top")

  -- diagrama de momento
  local ym = 196
  local sm = 50 / Mmax
  gc:setColorRGB(200, 200, 200)
  gc:drawLine(x0, ym, x1, ym)
  gc:setColorRGB(220, 120, 20)
  gc:fillPolygon({ x0, ym, px, ym - Mmax * sm, x1, ym, x0, ym })
  gc:setColorRGB(0, 0, 0)
  gc:drawString("M", 6, ym - 20, "top")
  gc:setFont("sansserif", "r", 8)
  gc:drawString("Mmax=" .. fmt(Mmax) .. " kN·m", px - 30, ym - Mmax * sm - 13, "top")
end
