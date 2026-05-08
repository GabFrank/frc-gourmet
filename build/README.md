# `build/` — Recursos para electron-builder

Carpeta convencional de electron-builder. Acá viven recursos que el packager consume al generar instaladores.

## Archivos

| Archivo | Para qué | Estado |
|---|---|---|
| `entitlements.mac.plist` | Permisos requeridos por hardened runtime de macOS (notarización) | OK |
| `installer.nsh` | Script NSIS personalizado (Windows) | OK |
| `icon.png` | Ícono master 1024×1024 (PNG) | **placeholder** generado |
| `icon.icns` | Ícono macOS (multi-resolución) | **placeholder** generado |
| `icon.ico` | Ícono Windows (multi-resolución) | **placeholder** generado |
| `icons/` | PNGs Linux multi-tamaño (16…1024) | **placeholder** generado |
| `background.png` | Fondo DMG (macOS) | opcional |

## Iconos placeholder

`build/icon.*` y `build/icons/*.png` son placeholders generados por `scripts/generate-icons.js` (gradiente azul + texto "FRC GOURMET"). Sirven para que electron-builder no falle, **no son arte final**.

### Reemplazar por logo real

1. Pedir / diseñar el logo en **1024×1024 PNG** con fondo (transparente o sólido — el placeholder usa sólido azul para legibilidad).
2. **Opción A — drop manual:** sobrescribir `build/icon.png` (1024×1024) y volver a correr `npm run icons` para regenerar `.ico`, `.icns` y `icons/*.png`.
3. **Opción B — edición del generador:** modificar `scripts/generate-icons.js` (función `drawIcon`) para usar el nuevo brand y correr `npm run icons`.

### Regenerar derivados

```bash
npm run icons
```

Requiere `iconutil` (macOS, viene preinstalado) para `.icns`. Sin macOS, el `.icns` se omite con un warning.

## Convenciones electron-builder

electron-builder busca los siguientes paths por defecto cuando `directories.buildResources = "build"`:
- macOS → `build/icon.icns`
- Windows → `build/icon.ico`
- Linux → `build/icons/*.png` (multi-tamaño)

Las claves `mac.icon`, `win.icon`, `linux.icon` en `package.json` apuntan explícitamente para evitar ambigüedad.
