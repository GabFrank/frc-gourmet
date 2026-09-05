# Auditoría de Seguridad: PR #289 - Tray Icon, Auto-start y Diálogo de Cierre

**Rama:** `cursor/tray-autostart-close-dialog-f834`  
**HEAD:** `24b75e3b` (feat: autostart - configurar auto-start al login del sistema - FASE 4)  
**Base:** `1cfb2f58` (Merge pull request #287 from GabFrank/cursor/fix-create-caja-dialog-wsod-bd0a)  
**Auditor:** Cloud Agent (modelo: sonnet)  
**Fecha:** 2026-09-05  
**Eje:** PERMISOS / RPC / FUGAS (overlay Gourmet)

---

## Resumen Ejecutivo

**VEREDICTO: ✅ APROBADO SIN RESERVAS**

Este PR introduce funcionalidades de UI/UX del main process de Electron (tray icon, diálogo de cierre, auto-start) y **NO toca la superficie de seguridad del overlay Gourmet**:

- **NO** hay handlers IPC nuevos que muten datos de negocio
- **NO** hay cambios en `preload.ts` (superficie IPC inmutable)
- **NO** hay exposición de APIs peligrosas al renderer
- Las escrituras a `app-settings.json` son **seguras** y **validadas**
- Todo el código nuevo vive en el **main process** y **no expone nueva superficie de ataque**

El alcance del PR está **perfectamente aislado** de los ejes críticos de seguridad (permisos de handlers, RPC default-allow, fugas hidratadas).

---

## Alcance del Diff

**Archivos nuevos:**
- `electron/utils/tray-manager.ts` (196 líneas)
- `electron/utils/window-close-dialog.ts` (88 líneas)
- `electron/utils/auto-start-manager.ts` (52 líneas)

**Archivos modificados:**
- `main.ts` (+326 líneas, -5 líneas)
- `electron/utils/app-settings.utils.ts` (+39 líneas)

**Archivos fuera de auditoría (planes/docs):**
- `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`
- `docs/planes/AUDIT-PLAN-TRAY-CLOSE-DIALOG-A.md`
- `docs/planes/AUDIT-PLAN-TRAY-CLOSE-DIALOG-B.md`

**Total:** 8 archivos cambiados, +3178 líneas (mayoría documentación).

---

## Análisis por Eje

### Eje 1: Handlers IPC Nuevos con Mutación

#### Búsqueda Exhaustiva

```bash
# Búsqueda de ipcMain.handle en archivos del alcance
grep -r "ipcMain\.handle(" electron/utils/{tray-manager,window-close-dialog,auto-start-manager,app-settings.utils}.ts
# Resultado: 0 coincidencias

# Búsqueda en main.ts (diff)
git diff 1cfb2f58..24b75e3b main.ts | grep "ipcMain.handle"
# Resultado: 0 handlers IPC nuevos en el diff
```

**Hallazgo:** Los únicos `ipcMain.handle` en `main.ts` son **preexistentes** y están en la función `registerWindowChromeHandlers()` (líneas 550-613), que se registra **antes** de este PR y **no cambia** en el diff.

#### Handlers Preexistentes en `main.ts` (fuera del diff)

- `window:minimize`
- `window:maximize-toggle`
- `window:close`
- `window:is-maximized`
- `window:platform`
- `window:chrome`
- `window:set-titlebar-overlay`
- `window:zoom-get/set/step/reset`
- `window:reload`
- `window:toggle-devtools`
- `window:toggle-fullscreen`
- `window:is-fullscreen`
- `client-refresh-token-read/write/clear`

**Todos estos handlers son de lectura o control de UI, NO mutan datos de negocio.**

#### ✅ Conclusión Eje 1

**NO hay handlers IPC nuevos que requieran `ensurePermission`.**

El código nuevo (tray/dialog/autostart) ejecuta **100% en el main process** sin exponer canales IPC.

---

### Eje 2: Exposición vía Preload

#### Búsqueda de Cambios en `preload.ts`

```bash
git diff 1cfb2f58..24b75e3b preload.ts
# Resultado: diff vacío (0 líneas cambiadas)
```

**Hallazgo:** `preload.ts` **no cambió** en este PR.

#### Inspección de `contextBridge.exposeInMainWorld`

El único `contextBridge.exposeInMainWorld('api', {...})` en `preload.ts` (línea 1260+) **no fue modificado**.

La superficie IPC expuesta al renderer **permanece idéntica** a la versión previa.

#### ✅ Conclusión Eje 2

**NO hay nueva superficie IPC expuesta al renderer.**

Las funcionalidades nuevas (tray, diálogos, autostart) **no tienen canales IPC** accesibles desde el renderer.

---

### Eje 3: Escritura Segura de `app-settings.json`

#### Funciones que Escriben `app-settings`

El diff modifica `electron/utils/app-settings.utils.ts` para **agregar tipos** (interfaz `WindowBehaviorSettings`) pero **NO cambia la lógica de lectura/escritura**:

- `readAppSettings(userDataPath)` — **sin cambios** (usa `deepMerge` con defaults)
- `writeAppSettings(userDataPath, settings)` — **sin cambios** (escribe JSON serializado)
- `updateAppSettings(userDataPath, mutator)` — **sin cambios** (aplica mutator inmutable)

#### Usos de `updateAppSettings` en el Diff

El PR agrega **2 llamadas** a `updateAppSettings` en `main.ts`:

##### Uso 1: Línea 823 (evento `close` de la ventana)

```typescript
if (result.dontAskAgain && (result.action === 'minimize' || result.action === 'close')) {
  try {
    updateAppSettings(app.getPath('userData'), (current) => ({
      ...current,
      windowBehavior: {
        closeAction: result.action as 'minimize' | 'close',
        autoStart: current.windowBehavior?.autoStart ?? false,
        startMinimized: current.windowBehavior?.startMinimized ?? false,
      },
    }));
    console.log(`[window] closeAction persistido: ${result.action}`);
  } catch (e) {
    console.error('[window] error persistiendo closeAction:', e);
  }
}
```

**Validación:**
- ✅ Solo escribe si `result.action` es `'minimize'` o `'close'` (guard explícito)
- ✅ `result.action === 'restart'` **nunca se persiste** (por diseño)
- ✅ Preserva `autoStart` y `startMinimized` existentes (no los sobrescribe)
- ✅ `result` viene de `showCloseDialog()` — un `dialog.showMessageBox` nativo (no controlado por el usuario)
- ✅ Envuelto en `try/catch` — fallos no rompen la app

##### Uso 2: Línea 1149 (evento `before-quit`)

**Código idéntico al Uso 1.** Mismas validaciones.

#### ✅ Conclusión Eje 3

**Las escrituras a `app-settings.json` son seguras:**

1. **Solo el main process escribe** (no hay handler IPC para modificar settings)
2. **Validación en la escritura:** solo persiste valores legales (`'minimize'` | `'close'`)
3. **No sobrescribe campos existentes** (preserva `autoStart`, `startMinimized`)
4. **No hay inyección de código:** los valores vienen de un `dialog.showMessageBox` nativo con botones fijos
5. **Manejo de errores robusto** (`try/catch` sin crashear la app)

#### Hallazgo Menor P2: Falta Validación de Tipos en Runtime

Los campos `autoStart` y `startMinimized` se leen con `?? false` (coerción de nullish) pero **no se valida que sean boolean** si ya existen en el JSON.

**Impacto:** Si un usuario edita manualmente `app-settings.json` y pone `autoStart: "true"` (string), el código lo preservaría como string.

**Mitigación:** TypeScript protege los paths de escritura normales. Un `app-settings.json` corrompido manualmente es **fuera del threat model** (require acceso a filesystem).

---

### Eje 4: Exposición de APIs Peligrosas al Renderer

#### APIs Electron Usadas en el Código Nuevo

**`electron/utils/tray-manager.ts`:**
- `Tray.setToolTip()` — solo lee el main process
- `Tray.setContextMenu()` — construye menú desde el main
- `Menu.buildFromTemplate()` — templates hardcodeados
- `nativeImage.createFromPath()` — lee archivos locales (iconos)

**`electron/utils/window-close-dialog.ts`:**
- `dialog.showMessageBox()` — diálogo nativo modal

**`electron/utils/auto-start-manager.ts`:**
- `app.setLoginItemSettings()` — configura autostart del SO
- `app.getLoginItemSettings()` — lee estado del SO

**`main.ts` (cambios):**
- `app.relaunch()` — reinicia la app (solo main process)
- `app.quit()` — cierra la app (solo main process)
- `win.hide()` / `win.show()` — oculta/muestra ventana (solo main)

#### ✅ Conclusión Eje 4

**NO hay exposición de APIs peligrosas al renderer:**

- Todas las APIs usadas ejecutan **exclusivamente en el main process**
- **No hay `ipcMain.handle`** que exponga estas funcionalidades al renderer
- El renderer **no puede invocar** `app.quit()`, `app.relaunch()`, `app.setLoginItemSettings()` ni configurar el tray
- Los diálogos son **nativos de Electron** (`dialog.showMessageBox`), no construidos con HTML/Angular

---

### Eje 5: Fugas Hidratadas

#### Búsqueda de Entidades Hidratadas

```bash
# Buscar leftJoinAndSelect / relations en el diff
git diff 1cfb2f58..24b75e3b | grep -i "leftJoinAndSelect\|relations:"
# Resultado: 0 coincidencias
```

**Hallazgo:** El PR **no toca TypeORM** ni consultas de base de datos.

#### ✅ Conclusión Eje 5

**NO hay fugas hidratadas.**

El código nuevo no interactúa con la base de datos ni con entidades.

---

### Eje 6: Superficie IPC Nueva o Relajada

#### Cambios en `preload.ts`

**Diff vacío.** Sin cambios.

#### Cambios en `ALWAYS_LOCAL_CHANNELS` (preload.ts)

**Sin cambios.**

El conjunto de canales que evitan el ruteo HTTP en modo cliente **no cambió**.

#### ✅ Conclusión Eje 6

**NO hay nueva superficie IPC ni relajación de controles.**

---

## Hallazgos

### P0: NINGUNO

### P1: NINGUNO

### P2: Validación de Tipos en Runtime (bajo impacto)

**Archivo:** `main.ts` (líneas 823, 1149)

**Descripción:**

Al persistir `windowBehavior`, los campos `autoStart` y `startMinimized` se preservan con `?? false` (coerción de nullish) pero **no se valida que sean boolean** si ya existen en `app-settings.json`.

**Código:**

```typescript
updateAppSettings(app.getPath('userData'), (current) => ({
  ...current,
  windowBehavior: {
    closeAction: result.action as 'minimize' | 'close',
    autoStart: current.windowBehavior?.autoStart ?? false,      // ← no valida tipo
    startMinimized: current.windowBehavior?.startMinimized ?? false,  // ← no valida tipo
  },
}));
```

**Escenario de Explotación:**

1. Usuario edita manualmente `app-settings.json`
2. Cambia `autoStart: true` por `autoStart: "true"` (string)
3. El código preserva el string
4. `app.setLoginItemSettings({ openAtLogin: "true" })` recibe un string en vez de boolean

**Impacto:**

- **Electron tolera coerciones** (JavaScript truthy): `"true"` se convierte a `true`
- **No hay crash** ni comportamiento inseguro
- El auto-start **funcionaría igual** (string non-empty es truthy)
- **TypeScript protege paths normales** de escritura

**Recomendación:**

Validar explícitamente:

```typescript
autoStart: typeof current.windowBehavior?.autoStart === 'boolean'
  ? current.windowBehavior.autoStart
  : false,
```

**Mitigación Actual:**

Un `app-settings.json` corrompido manualmente está **fuera del threat model** (require acceso a filesystem con permisos de escritura).

---

## Verificación de Evidencia

### 1. Handlers IPC en el Diff

```bash
git diff 1cfb2f58..24b75e3b | grep -c "ipcMain.handle"
# Resultado: 0
```

### 2. Cambios en `preload.ts`

```bash
git diff 1cfb2f58..24b75e3b preload.ts | wc -l
# Resultado: 0 líneas
```

### 3. Referencias a `ensurePermission` en el Diff

```bash
git diff 1cfb2f58..24b75e3b | grep -c "ensurePermission"
# Resultado: 0
```

### 4. Archivos del Alcance

```bash
git diff 1cfb2f58..24b75e3b --name-only | grep -E "(electron/|main\.ts)" | grep -v "docs/"
# Resultado:
# electron/utils/app-settings.utils.ts
# electron/utils/auto-start-manager.ts
# electron/utils/tray-manager.ts
# electron/utils/window-close-dialog.ts
# main.ts
```

**Total:** 5 archivos de código (3 nuevos, 2 modificados).

---

## Veredicto Final

### ✅ APROBADO SIN RESERVAS

Este PR:

1. **NO introduce handlers IPC nuevos** que muten datos de negocio
2. **NO cambia `preload.ts`** ni expone nueva superficie IPC
3. **NO expone APIs peligrosas** al renderer (todo es main process)
4. **Escribe `app-settings.json` de forma segura** con validación
5. **NO tiene fugas hidratadas** (no toca TypeORM)
6. **NO relaja controles de seguridad** existentes

**El código nuevo vive 100% en el main process de Electron y NO toca la superficie de ataque del overlay Gourmet (permisos/RPC/fugas).**

### Top Hallazgos

1. **P2:** Falta validación de tipos boolean en runtime al preservar `autoStart`/`startMinimized` (impacto bajo, mitigado por TypeScript y threat model)

**Ningún hallazgo P0 o P1.**

---

## Contexto del Auditor

**Skill cargado:** `/workspace/.claude/skills/frc-gourmet-expert/SKILL.md`

**Convenciones verificadas:**
- Regla 22: `ensurePermission` primera sentencia en handlers que mutan → **N/A** (no hay handlers nuevos)
- RPC default-allow → **N/A** (no hay handlers nuevos)
- Superficie IPC → **Sin cambios** (preload.ts inmutable)
- app-settings seguro → **✅ Validado**

**Alcance respetado:**
- Solo archivos del diff: `main.ts`, `electron/utils/{tray-manager,window-close-dialog,auto-start-manager,app-settings.utils}.ts`
- No revisé la arquitectura general (fuera del alcance)
- No audité el plan ni las auditorías previas (fuera del alcance)

---

## Firma

**Auditor:** Cloud Agent (Cursor, modelo: claude-sonnet-5-thinking)  
**Rama:** `cursor/tray-autostart-close-dialog-f834`  
**Commit HEAD:** `24b75e3b` (feat: autostart - configurar auto-start al login del sistema - FASE 4)  
**Fecha:** 2026-09-05

**Contacto:** Este reporte se genera automáticamente. Para revisar hallazgos, consultar con el equipo de desarrollo.
