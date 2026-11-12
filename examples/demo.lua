-- Demo de la API Lua de TI-Nspire
-- Flechas: mover la pelota · Enter: cambiar color · menu: opciones
-- Toca la pantalla para mover la pelota · escribe para ver on.charIn

platform.apiLevel = "2.4"

local W, H = 318, 212
local x, y = 160, 110
local vx, vy = 2, 1.5
local r = 12
local colores = { {220, 40, 40}, {30, 120, 220}, {40, 160, 70}, {230, 150, 20} }
local c = 1
local texto = ""
local animar = true
local ticks = 0

function on.resize(w, h)
  W, H = w, h
end

function on.construction()
  timer.start(0.03)
end

function on.timer()
  if not animar then return end
  ticks = ticks + 1
  x = x + vx
  y = y + vy
  if x < r or x > W - r then vx = -vx end
  if y < 40 + r or y > H - r then vy = -vy end
  platform.window:invalidate()
end

function on.arrowKey(k)
  if k == "up" then y = y - 8
  elseif k == "down" then y = y + 8
  elseif k == "left" then x = x - 8
  elseif k == "right" then x = x + 8 end
  platform.window:invalidate()
end

function on.enterKey()
  c = c % #colores + 1
  platform.window:invalidate()
end

function on.charIn(ch)
  texto = (texto .. ch):sub(-24)
  platform.window:invalidate()
end

function on.backspaceKey()
  texto = texto:sub(1, -2)
  platform.window:invalidate()
end

function on.mouseDown(mx, my)
  x, y = mx, my
  platform.window:invalidate()
end

toolpalette.register({
  { "Animación",
    { "Pausar / continuar", function() animar = not animar end },
    { "Centrar pelota", function() x, y = W / 2, H / 2 platform.window:invalidate() end },
  },
  { "Tamaño",
    { "Pequeña", function() r = 6 end },
    { "Mediana", function() r = 12 end },
    { "Grande", function() r = 22 end },
  },
})

function on.paint(gc)
  -- cabecera
  gc:setColorRGB(235, 241, 248)
  gc:fillRect(0, 0, W, 34)
  gc:setColorRGB(30, 60, 100)
  gc:setFont("sansserif", "b", 12)
  gc:drawString("Nspire Lab · demo", 8, 4, "top")
  gc:setFont("sansserif", "r", 9)
  gc:setColorRGB(90, 100, 110)
  gc:drawString("flechas · enter · menu · toca la pantalla", 8, 20, "top")

  -- marco y diagonal punteada
  gc:setColorRGB(180, 190, 200)
  gc:setPen("thin", "dotted")
  gc:drawLine(0, 40, W, H)
  gc:setPen("thin", "smooth")
  gc:drawRect(0, 36, W - 1, H - 37)

  -- pelota
  local col = colores[c]
  gc:setColorRGB(col[1], col[2], col[3])
  gc:fillArc(x - r, y - r, 2 * r, 2 * r, 0, 360)
  gc:setColorRGB(0, 0, 0)
  gc:drawArc(x - r, y - r, 2 * r, 2 * r, 0, 360)

  -- polígono
  gc:setColorRGB(250, 200, 60)
  gc:fillPolygon({ W - 50, 50, W - 20, 50, W - 35, 75, W - 50, 50 })

  -- texto escrito
  gc:setColorRGB(0, 0, 0)
  gc:setFont("serif", "i", 11)
  gc:drawString("charIn: " .. texto, 8, H - 20, "top")
  gc:setFont("sansserif", "r", 8)
  gc:drawString(string.format("x=%d y=%d  t=%d", x, y, ticks), W - 110, H - 16, "top")
end
