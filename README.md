# Nspire Lab: emulador Lua para TI-Nspire CX II CAS

Aplicación web para **probar en el iPad** (o en cualquier navegador) los scripts Lua y los documentos `.tns` que desarrollamos, **antes de pasarlos a la calculadora**.

Simula la pantalla de 320×240 con una ventana Lua de 318×212 (como en la calculadora), el teclado (táctil y físico), los eventos y la API Lua de la TI-Nspire. Además genera el `.tns` listo para enviar a la calculadora.

> No es una emulación del hardware: no usa el sistema operativo ni las ROM de TI, que tienen copyright. Lo que se emula es el **entorno Lua**, que es donde viven nuestros programas.

## Uso en el iPad

1. Abre la URL de GitHub Pages en Safari (ver *Publicación*).
2. Toca **Compartir → Añadir a pantalla de inicio**. Queda como app y funciona sin conexión.
3. **Abrir** un `.lua` o `.tns` desde Archivos/iCloud, o elegir un **Ejemplo**.
4. Edita en la pestaña **Código** y pulsa **▶ Ejecutar**.
5. **⬇ .tns** (o **Compartir**, para AirDrop) genera el documento para la calculadora. Envíalo con TI-Nspire Computer Link / TI Connect desde un computador.

Teclado físico: flechas, Enter, Esc, Tab / ⇧Tab, Retroceso, Supr, `⌘M` (menú), `⌘↵` (ejecutar).

## Qué está emulado

| Área | Soporte |
|---|---|
| Eventos `on.*` | `paint`, `resize`, `construction`, `create`, `activate`, `getFocus`, `timer`, `charIn`, `arrowKey` / `arrowUp…`, `enterKey`, `escapeKey`, `tabKey`, `backtabKey`, `backspaceKey`, `deleteKey`, `clearKey`, `returnKey`, `contextMenu`, `help`, `mouseDown/Up/Move`, `varChange` |
| `gc` | `drawString` (alineaciones), `setFont`, `getStringWidth/Height`, `setColorRGB` (r,g,b o 0xRRGGBB), `setPen` (thin/medium/thick, smooth/dotted/dashed), `drawLine`, `drawRect`, `fillRect`, `drawArc`, `fillArc`, `drawPolyLine`, `fillPolygon`, `clipRect`, `drawImage` |
| `platform` | `window:width/height/invalidate/setBackgroundColor`, `withGC`, `gc`, `apiLevel`, `hw`, `isColorDisplay`, `registerErrorHandler`, `clipboard` |
| Otros | `timer`, `var` (store/recall/list/monitor), `toolpalette` (menú), `image.new` (formato TI), `D2Editor` (cuadro de texto), `cursor`, `locale`, `class()`, `require "color"` |
| Lua 5.1 | `unpack`, `loadstring`, `math.pow`, `table.getn`, `string.format("%d", 2.5)`, números como `5` y no `5.0` |
| `math.eval` | Evaluador **numérico** (sin CAS simbólico), usa las variables de `var.store` |

Los errores se muestran como en la calculadora, en un cuadro "Error" que detiene el script. También aparecen en la pestaña **Consola** con un enlace a la línea. Un bucle infinito se corta a los 5 s.

## Diferencias conocidas con la calculadora

- **Sin CAS de TI**: `math.eval` solo devuelve resultados numéricos.
- **Fuentes del sistema**: el ancho del texto puede diferir unos píxeles.
- **Velocidad**: el iPad es mucho más rápido. Mide el rendimiento en la calculadora.
- **Enteros de 32 bits** (Fengari). En la calculadora los números son reales de 64 bits, así que evita multiplicar literales enteros enormes.
- Los `.tns` guardados por el **software oficial de TI** usan claves de cifrado por archivo y no se pueden abrir. Los generados con Luna o con este emulador sí.

## Estructura

```
index.html            interfaz (calculadora + editor)
src/nspire.js         motor: canvas, eventos, primitivas de dibujo, menú, D2Editor
src/prelude.js        API Lua de la Nspire escrita en Lua + compatibilidad 5.1
src/tns.js            lectura/escritura de .tns (port en JS del formato de Luna)
src/matheval.js       evaluador numérico de math.eval
vendor/fengari-web.js Lua 5.3 en JavaScript (Fengari 0.1.4, MIT) — ver nota
tools/luna.mjs        CLI: .lua -> .tns y .tns -> .lua
examples/             demo, viga (resistencia de materiales), control (2º orden)
tests/                pruebas (node --test)
```

Nota: `vendor/fengari-web.js` es Fengari 0.1.4 con una única modificación (`LUA_COMPAT_FLOATSTRING`), para que los números se conviertan a texto como en Lua 5.1.

## Desarrollo local

```bash
npm start                                 # http://localhost:8000
npm test                                  # pruebas del formato .tns
node tools/luna.mjs examples/viga.lua     # genera examples/viga.tns
node tools/luna.mjs --extraer doc.tns     # extrae el Lua de un .tns
```

## Publicación (GitHub Pages)

El workflow `.github/workflows/pages.yml` publica la app en cada push a `main`. Hay que activarlo una vez en **Settings → Pages → Source: GitHub Actions**. Si el repositorio es privado, GitHub Pages requiere un plan de pago; la alternativa es hacerlo público.

## Créditos

- [Fengari](https://fengari.io), Lua en JavaScript (MIT).
- [Luna](https://github.com/ndless-nspire/Luna) de Olivier Armand (MPL 1.1): referencia del formato `.tns`.
- TI-Nspire es una marca de Texas Instruments. Este proyecto no está afiliado a TI.
