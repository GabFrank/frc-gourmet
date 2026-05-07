# `build/` — Recursos para electron-builder

Carpeta convencional de electron-builder. Acá viven recursos que el packager consume al generar instaladores.

## Archivos esperados

| Archivo | Para qué | Estado |
|---|---|---|
| `entitlements.mac.plist` | Permisos requeridos por hardened runtime de macOS (notarización) | OK |
| `installer.nsh` | Script NSIS personalizado (Windows) | OK |
| `icon.png` | Ícono fuente 512×512 (PNG) — electron-builder genera `.ico` y `.icns` automáticamente si no existen explícitos | **FALTA** — agregar antes del primer release |
| `icon.icns` | Ícono macOS (opcional si hay `icon.png`) | falta |
| `icon.ico` | Ícono Windows (opcional si hay `icon.png`) | falta |
| `icons/` | Carpeta de íconos PNG multi-tamaño para Linux (16x16, 32x32, 48x48, 64x64, 128x128, 256x256, 512x512) | falta |
| `background.png` | Fondo de la imagen DMG (macOS) | opcional |

## Cómo agregar íconos

1. Diseñar logo en 1024×1024 PNG con fondo transparente.
2. Convertir:
   - **macOS:** `iconutil -c icns icon.iconset` (después de crear las variantes).
   - **Windows:** ImageMagick `convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`.
   - **Linux:** generar PNGs en `icons/` con tamaños arriba.
3. Drop en `build/`.
4. Volver a habilitar las claves `mac.icon`, `win.icon`, `linux.icon` en `package.json` `"build"`.

Sin íconos personalizados, electron-builder usa el ícono default de Electron (la pelota azul/blanca).
