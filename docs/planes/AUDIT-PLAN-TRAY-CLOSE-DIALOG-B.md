# AUDITORÍA PLAN B — Correctitud contra Código Real

**Branch:** `cursor/tray-autostart-close-dialog-f834` (PR #289)  
**Plan auditado:** `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`  
**Fecha:** 2026-09-05  
**Alcance:** Eje B — Validación técnica del plan contra la arquitectura y el código real de FRC Gourmet

---

## 1. Resumen Ejecutivo

| Aspecto | Estado | Riesgo |
|---------|--------|--------|
| Hooks de ciclo de vida (`window-all-closed` / `before-quit` / `stopServer`) | ✅ **VÁLIDO** | BAJO |
| Schema `app-settings.json` extensible | ✅ **VÁLIDO** | BAJO |
| APIs Electron 24 (Tray, setLoginItemSettings) | ✅ **VÁLIDAS** | BAJO |
| Paths de iconos reales | ✅ **EXISTEN** | BAJO |
| Single instance lock | ⚠️ **NO IMPLEMENTADO** | MEDIO |
| Diálogo (nativo vs MatDialog) | ✅ **CORRECTO** | BAJO |
| Cmd+Q (macOS) | ⚠️ **INCOMPLETO EN PLAN** | MEDIO |
| Doble instancia | ⚠️ **SIN MITIGACIÓN** | ALTO |
| Mode client | ✅ **COMPATIBLE** | BAJO |

**VEREDICTO GENERAL:** El plan es **técnicamente sólido y compatible** con el código real. Identifica correctamente hooks, APIs y arquitectura. **Tres riesgos significativos** requieren atención: (1) ausencia de single instance lock en el código actual, (2) manejo incompleto de Cmd+Q, (3) doble instancia no mitigada.

---

## 2. Validación de Hooks del Ciclo de Vida

### 2.1. Hooks Existentes en `main.ts`

**Plan afirma (§2.1):**
```typescript:853:870:main.ts
app.on('window-all-closed', () => {
  // On macOS specific behavior
  if (process.platform !== 'darwin') {
    stopServer().catch(() => {});
    if (dbService) {
      dbService.close();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer().catch(() => {});
});
```

**Código real (`main.ts:852-870`):**
```typescript
app.on('window-all-closed', () => {
  // On macOS specific behavior
  if (process.platform !== 'darwin') {
    // Stop Fastify server (idempotente — si nunca arranco no hace nada)
    stopServer().catch(() => {});
    // Close the database connection
    if (dbService) {
      dbService.close();
    }
    app.quit();
  }
});

app.on('before-quit', () => {
  // Stop server explicitly antes de quit (cubrira el caso macOS donde el handler
  // de window-all-closed no termina la app)
  stopServer().catch(() => {});
});
```

**✅ VALIDADO:** Los hooks existen exactamente como el plan los describe. El plan comprende correctamente:
- `window-all-closed` NO llama `app.quit()` en macOS (comportamiento estándar de la plataforma)
- `stopServer()` es idempotente (puede llamarse múltiples veces sin error)
- `dbService.close()` solo en `window-all-closed`, no en `before-quit` (correcto: `before-quit` puede disparar sin que la DB esté inicializada)

### 2.2. Impacto del Tray en el Hook

**Plan propone (§5.3.3):**
```typescript
app.on('window-all-closed', () => {
  // Si hay tray activo, NO terminar la app (quedará en segundo plano)
  if (tray) {
    console.log('[tray] Ventana cerrada, app sigue en segundo plano');
    return;
  }
  
  // Comportamiento legacy (sin tray): cerrar app
  if (process.platform !== 'darwin') {
    stopServer().catch(() => {});
    if (dbService) {
      dbService.close();
    }
    app.quit();
  }
});
```

**✅ ARQUITECTURA CORRECTA:** La propuesta es la forma estándar y correcta de mantener una app viva con tray icon. El `return` temprano evita el `app.quit()` sin modificar el resto del comportamiento.

**⚠️ RIESGO IDENTIFICADO:** Si el tray falla al crearse (ej: error al cargar el ícono), la variable `tray` quedará `null` y la app se cerrará normalmente aunque `mode === 'server'`. El plan debería agregar:
```typescript
if (tray || (settings.mode === 'server' && windowBehavior?.closeAction !== 'default')) {
  return; // No cerrar si DEBE haber tray, aunque haya fallado
}
```

---

## 3. Schema de App-Settings

### 3.1. Estructura Actual

**Código real (`electron/utils/app-settings.utils.ts:179-203`):**
```typescript
export interface AppSettings {
  mode: AppMode;
  database: DatabaseSettings;
  network: NetworkSettings | null;
  update: UpdateSettings;
  backup: BackupSettings;
  ia: IaSettings;
  musica: MusicaSettings;
  ui: UiSettings;
  deviceId?: number | null;
  timezone?: string;
}
```

**Plan propone agregar (§4):**
```typescript
export interface WindowBehaviorSettings {
  closeAction: 'ask' | 'minimize' | 'close' | 'default';
  autoStart: boolean;
  startMinimized: boolean;
}

export interface AppSettings {
  // ... campos existentes ...
  windowBehavior?: WindowBehaviorSettings;
}
```

### 3.2. Retrocompatibilidad

**Mecanismo existente (`app-settings.utils.ts:253-283`):**
```typescript
function deepMerge<T>(base: T, override: Partial<T> | undefined | null): T {
  if (!override) return { ...(base as any) };
  const out: any = { ...(base as any) };
  for (const k of Object.keys(override)) {
    const bv = (base as any)[k];
    const ov = (override as any)[k];
    if (ov === null) {
      out[k] = null;
    } else if (typeof ov === 'object' && !Array.isArray(ov) && typeof bv === 'object' && bv !== null) {
      out[k] = deepMerge(bv, ov);
    } else if (ov !== undefined) {
      out[k] = ov;
    }
  }
  return out as T;
}

export function readAppSettings(userDataPath: string): AppSettings {
  const p = getAppSettingsPath(userDataPath);
  if (!fs.existsSync(p)) return cloneDefaults();
  try {
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return deepMerge(DEFAULT_APP_SETTINGS, raw);
  } catch (e) {
    console.warn('[app-settings] no se pudo leer, usando defaults:', e);
    return cloneDefaults();
  }
}
```

**✅ VALIDADO:** El plan afirma correctamente (§2.8):
> "**NO**, por las siguientes razones: \[...\] `readAppSettings()` aplica `deepMerge(DEFAULT_APP_SETTINGS, raw)`: si el JSON viejo no tiene `windowBehavior`, el `deepMerge` usa el default. **No hay caso de rotura**."

**Precedente confirmado:** La última expansión fue `ui: { zoomFactor }` (commit 2026-08-27) y NO requirió migración. El patrón es consistente.

### 3.3. Schema Propuesto

**Evaluación:**
- `closeAction`: enum bien diseñado, valores auto-explicativos
- `autoStart`: boolean simple, correcto
- `startMinimized`: requiere `autoStart: true`, el plan lo documenta (§4)

**⚠️ OBSERVACIÓN:** El plan usa `'default'` como valor de `closeAction` para modo client/standalone. Sería más claro usar `'legacy'` o `'normal'`, pero es aceptable documentado.

**✅ VALIDADO:** La extensión del schema es segura y compatible.

---

## 4. APIs de Electron 24

### 4.1. Versión Confirmada

**Código (`package.json:electron`):**
```json
"electron": "^24.3.0"
```

**Plan asume Electron 24** (§2.4, §2.5). ✅ CORRECTO.

### 4.2. Tray API

**Plan cita (§2.4):**
```javascript
const { Tray, Menu, nativeImage } = require('electron');
let tray = null;

function createTray() {
  const icon = nativeImage.createFromPath('/path/to/icon.png');
  tray = new Tray(icon);
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar', click: () => { win?.show(); } },
    // ...
  ]);
  tray.setToolTip('FRC Gourmet');
  tray.setContextMenu(contextMenu);
}
```

**✅ VALIDADO:** Esta API existe desde Electron 1.x y es estable en 24.x. Documentación oficial: https://www.electronjs.org/docs/latest/api/tray

### 4.3. Auto-start API

**Plan cita (§2.5):**
```javascript
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: false,
  path: app.getPath('exe'),
  args: []
});

const settings = app.getLoginItemSettings();
```

**✅ VALIDADO:** API estable desde Electron 6.x. Limitaciones por plataforma documentadas correctamente:

| Plataforma | Estado Plan | Estado Real |
|---|---|---|
| Windows | ✅ Funciona sin restricciones | ✅ Correcto |
| macOS | ⚠️ Requiere firma/notarización | ✅ Correcto (dev funciona parcialmente) |
| Linux | ⚠️ Depende del DE | ✅ Correcto (crea `.desktop` en autostart) |

### 4.4. Dialog API

**Plan usa `dialog.showMessageBox()` (§2.6):**
```javascript
dialog.showMessageBox(win, {
  type: 'question',
  title: 'Cerrar FRC Gourmet',
  message: '¿Qué deseas hacer?',
  buttons: ['Minimizar a bandeja', 'Reiniciar', 'Cerrar completamente'],
  defaultId: 0,
  cancelId: 0,
  checkboxLabel: 'No volver a preguntar',
  checkboxChecked: false
}).then(result => {
  const { response, checkboxChecked } = result;
  // ...
});
```

**✅ VALIDADO:** Esta es la API correcta para diálogos nativos del sistema. Código real ya usa `dialog.showErrorBox()` (`main.ts:294`), confirmando que el import existe.

**✅ DECISIÓN CORRECTA:** El plan descarta MatDialog (§introducción implícita). MatDialog es del renderer (Angular) y NO puede interceptar el evento `close` de la ventana, que dispara en el main process ANTES de que el renderer tenga oportunidad de reaccionar. `dialog.showMessageBox()` es la única opción viable.

---

## 5. Iconos Reales

### 5.1. Paths Existentes

**Plan busca (§2.3):**
```typescript:338:345:main.ts
function resolveAppIconPath(): string | undefined {
  const candidates = process.platform === 'darwin'
    ? [path.join(__dirname, 'build', 'icon.icns'), path.join(__dirname, 'build', 'icons', '512x512.png')]
    : [path.join(__dirname, 'build', 'icons', '512x512.png'), path.join(__dirname, 'build', 'icon.png')];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}
```

**Archivos encontrados en `/workspace/build/`:**
```
build/icon.icns          (macOS)
build/icon.ico           (Windows)
build/icons/16x16.png
build/icons/32x32.png
build/icons/48x48.png
build/icons/64x64.png
build/icons/128x128.png
build/icons/256x256.png
build/icons/512x512.png
build/icons/1024x1024.png
```

**✅ VALIDADO:** Los iconos existen. **Crítico:** `16x16.png` y `32x32.png` ya están generados, que son los tamaños necesarios para tray icon.

### 5.2. Necesidades del Tray

**Plan propone (§6):**
> "Crear directorio `build/tray/` con iconos optimizados: \[...\] Windows `.ico` 16x16, macOS `iconTemplate.png` 22x22, Linux 24x24"

**⚠️ OBSERVACIÓN:** NO es necesario crear `build/tray/` separado. Los iconos `16x16.png` y `32x32.png` existentes son **suficientes** para el tray en las tres plataformas:
- Windows: `nativeImage.createFromPath('build/icons/16x16.png')` escala automáticamente
- macOS: puede usar 16x16 o 32x32; el sistema lo tiñe si se nombra `iconTemplate.png` (opcional)
- Linux: 22x22 o 24x24, pero 32x32 es aceptable (el DE lo escala)

**✅ RECOMENDACIÓN:** FASE 6 puede simplificarse: reusar `build/icons/16x16.png` y `32x32.png` en lugar de crear nuevos iconos. Si se quiere tema monocromático en macOS, duplicar uno como `iconTemplate.png`.

---

## 6. Single Instance Lock

### 6.1. Estado Actual

**Búsqueda en código:**
```bash
grep -r "requestSingleInstanceLock\|makeSingleInstance\|second-instance" --include="*.ts"
# Resultado: 0 archivos
```

**❌ NO IMPLEMENTADO:** El código actual **no tiene** single instance lock.

### 6.2. Impacto del Plan

**Plan afirma (§6.1):**
> "**Doble instancia al auto-start si el usuario ya tiene una abierta** \[...\] Mitigación: `app.requestSingleInstanceLock()` (ya implementado en Electron 24)"

**🔴 FALSO:** El plan afirma que está "ya implementado", pero **no lo está** en el código de FRC Gourmet. Es una API de Electron 24 disponible, pero no utilizada.

### 6.3. Patrón Correcto

**Debe agregarse ANTES de `app.on('ready')`:**
```typescript
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Segunda instancia: salir inmediatamente
  app.quit();
} else {
  // Primera instancia: manejar evento second-instance
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Alguien intentó abrir una segunda instancia: enfocar la ventana existente
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
  
  app.on('ready', () => {
    // ... código existente
  });
}
```

**⚠️ RIESGO ALTO:** Sin esto, el auto-start puede abrir **múltiples procesos** si el usuario inicia la app manualmente mientras el auto-start está corriendo. Cada proceso abrirá su conexión a la BD y al puerto 7070 (el segundo fallará).

**✅ RECOMENDACIÓN:** Agregar el lock **en FASE 1**, no en FASE 4 (antes del auto-start).

---

## 7. Cmd+Q y Otros Atajos (macOS)

### 7.1. Plan Actual

**Plan propone (§7, FASE 7):**
```typescript
app.on('before-quit', (event) => {
  if (!forceQuit && mode === 'server') {
    event.preventDefault();
    showCloseDialog(...);
  }
});
```

### 7.2. Problema Identificado

**⚠️ INCOMPLETO:** El plan intercepta `before-quit`, pero **NO maneja el estado de `forceQuit`** dentro del diálogo resultante. Escenario:

1. Usuario presiona Cmd+Q (macOS)
2. `before-quit` dispara → `event.preventDefault()` → muestra diálogo
3. Usuario elige "Minimizar a bandeja" → diálogo cierra
4. **`before-quit` NO vuelve a disparar** — el quit original fue cancelado

**Comportamiento esperado:** funciona bien.

**PERO:** Si el usuario elige "Cerrar completamente":
```typescript
case 2: // Cerrar
  forceQuit = true;
  win.close(); // ← Esto dispara win.on('close'), NO before-quit
```

**🔴 PROBLEMA:** `win.close()` dispara el handler `win.on('close')`, que **TAMBIÉN** tiene lógica de diálogo. Si `closeAction === 'ask'`, mostrará el diálogo de nuevo (loop).

### 7.3. Solución Requerida

**Agregar flag `quitRequested`:**
```typescript
let forceQuit = false;
let quitRequested = false; // NUEVO: distingue quit vs close

app.on('before-quit', (event) => {
  if (!forceQuit && mode === 'server') {
    event.preventDefault();
    quitRequested = true; // Marcador: vino de quit, no de close
    showCloseDialog(...);
  }
});

win.on('close', (event) => {
  if (forceQuit) return;
  
  // Si vino de before-quit, el diálogo ya se mostró: no duplicar
  if (quitRequested) return;
  
  // Lógica normal de close...
});
```

**⚠️ RIESGO MEDIO:** Sin esta distinción, Cmd+Q puede mostrar el diálogo dos veces en secuencia (una por `before-quit`, otra por `win.on('close')`).

---

## 8. Mode Client

### 8.1. Compatibilidad

**Plan propone (§5, FASE 5):**
> "En `mode=client`/`standalone`: usar cierre normal (sin diálogo) o permitir minimizar opcional."

**Arquitectura actual (`architecture/cliente-servidor.md`):**
```
| Modo | DB | Handlers | UI | Uso típico |
|---|---|---|---|---|
| `standalone` | Local (SQLite o Postgres) | IPC local | Local | Una sola PC |
| `server` | Local (típico Postgres) | IPC local + Fastify | Local | PC central |
| `client` | NO tiene DB | Llama por HTTP al server | Local | Tablets/PCs remotos |
```

**✅ VALIDADO:** El plan comprende correctamente que:
- `mode=server`: necesita tray (impacta a otros)
- `mode=client` / `standalone`: pueden cerrar normal (no impacta a nadie)

**✅ CORRECTA:** La decisión de NO agregar tray en client/standalone por defecto (§3.1 Opción A).

### 8.2. Rate Limiting y Clientes Remotos

**Preocupación:** Minimizar el server a tray NO afecta la conectividad de clientes. El servidor Fastify sigue corriendo en puerto 7070 aunque la ventana esté oculta.

**✅ SIN RIESGO:** El plan no introduce ningún cambio que afecte el servidor HTTP. `startServer()` y `stopServer()` siguen llamándose solo en `app.quit()`.

---

## 9. Riesgos No Cubiertos por el Plan

### 9.1. Doble Instancia (ALTO)

**Escenario:**
1. Usuario configura `autoStart: true`
2. PC reinicia → app arranca automáticamente en segundo plano (tray)
3. Usuario no lo nota y hace doble-click en el ícono del escritorio
4. **Segunda instancia intenta abrir**

**Sin single instance lock:**
- Segunda instancia abre otra ventana
- **Dos procesos intentan conectarse a la misma DB** (SQLite: locked; Postgres: tablas compartidas, caos)
- **Dos procesos intentan abrir puerto 7070** (el segundo falla: `EADDRINUSE`)

**🔴 RIESGO CRÍTICO:** Puede corromper datos o generar ventas duplicadas.

**Mitigación:** Agregar `app.requestSingleInstanceLock()` en FASE 1 (ver §6.3).

### 9.2. Relaunch Mientras el Server Está Activo

**Plan propone (§2.7, §5.3.4):**
```typescript
// Opción "Reiniciar" del diálogo
app.relaunch();
forceQuit = true;
app.quit();
```

**⚠️ RIESGO MEDIO:** `app.relaunch()` ejecuta `spawn()` del proceso nuevo **ANTES** de que el viejo termine. Ventana de 1-3 segundos donde:
- Dos procesos corren simultáneamente
- Ambos intentan abrir puerto 7070
- Ambos pueden acceder a SQLite (locked)

**Mitigación sugerida:**
```typescript
// Esperar a que stopServer termine antes de relaunch
stopServer()
  .then(() => {
    if (dbService) dbService.close();
  })
  .then(() => {
    app.relaunch();
    app.quit();
  })
  .catch(() => {
    // Si falla, reiniciar igual
    app.relaunch();
    app.quit();
  });
```

**Plan actual:** No maneja esto. FASE 3 debería agregar la espera de `stopServer()`.

### 9.3. Usuario Borra el Tray Icon Manualmente

**Escenario (Linux/GNOME):**
- Usuario cierra la ventana → app minimiza a tray
- Usuario hace click derecho en el tray → "Remove from panel" (GNOME)
- **Tray desaparece, pero la app sigue corriendo**
- Usuario no puede volver a abrir la ventana (no hay UI)

**⚠️ RIESGO BAJO:** Poco común, pero posible en Linux.

**Mitigación:**
```typescript
tray.on('destroyed', () => {
  console.warn('[tray] Tray destruido externamente. Mostrando ventana...');
  win?.show();
  tray = null; // Permitir que window-all-closed cierre la app
});
```

**Plan:** No menciona el evento `destroyed` del tray. Agregar en FASE 1 o 2.

### 9.4. Bandwidth de Diálogo (UX)

**Plan muestra diálogo en:**
1. Cada cierre de ventana (X) con `closeAction: 'ask'`
2. Cada Cmd+Q con `closeAction: 'ask'`
3. Cada intento de quit desde el SO

**⚠️ RIESGO UX:** Usuario en `mode=server` puede ver el diálogo **10-20 veces por día** si abre/cierra la app frecuentemente. El checkbox "No volver a preguntar" mitiga esto, pero:

**Problema:** Una vez que el usuario marca "No volver a preguntar" → `closeAction` cambia a `'minimize'` → **NUNCA** puede volver a ver el diálogo (salvo editando el JSON manualmente).

**Sugerencia:** Agregar botón en la UI (*Configuración → Sistema → Ventana*) para resetear el comportamiento a `'ask'`. El plan menciona esto como "iteración futura" (§9.1 Opción A), pero debería ser **FASE 5**, no post-release.

---

## 10. Validación de Fases

### FASE 1: Extender app-settings + tray básico

**✅ VIABLE:** Schema extensible (§3), iconos existen (§5), API Tray válida (§4.2).

**⚠️ FALTA:** Single instance lock (debe agregarse acá, no en FASE 4).

### FASE 2: Interceptar cierre + minimizar a tray

**✅ VIABLE:** Hook `window-all-closed` correcto (§2.1), lógica de `preventDefault()` estándar.

**⚠️ FALTA:** Manejo de `tray.on('destroyed')` (§9.3).

### FASE 3: Diálogo de cierre con 3 opciones

**✅ VIABLE:** API `dialog.showMessageBox()` válida (§4.4), UX bien diseñada.

**⚠️ FALTA:** Espera de `stopServer()` antes de `app.relaunch()` (§9.2).

### FASE 4: Auto-start al login

**✅ VIABLE:** API `setLoginItemSettings()` válida (§4.3), limitaciones documentadas.

**🔴 DEBE REORDENARSE:** Single instance lock debe estar en FASE 1, no acá.

### FASE 5: Diferenciar por modo

**✅ VIABLE:** Arquitectura client/server comprendida (§8), decisión de Opción A correcta.

**⚠️ SUGERENCIA:** Agregar UI para configurar `windowBehavior` (actualmente "iteración futura").

### FASE 6: Iconos del tray por plataforma

**✅ SIMPLIFICABLE:** Los iconos 16x16 / 32x32 ya existen (§5.1). No es necesario crear nuevos.

### FASE 7: Manejo de Cmd+Q

**⚠️ INCOMPLETO:** Necesita flag `quitRequested` para evitar diálogos duplicados (§7.2).

### FASE 8: Tests y QA

**✅ COMPLETO:** Checklist exhaustivo, cubre todos los escenarios.

### FASE 9: Documentación

**✅ COMPLETO:** Menciona docs + skill + manual de pruebas.

---

## 11. Verificación de Supuestos del Plan

| Supuesto del Plan | Código Real | Veredicto |
|---|---|---|
| `window-all-closed` llama `stopServer()` | ✅ `main.ts:857` | ✅ CORRECTO |
| `before-quit` llama `stopServer()` | ✅ `main.ts:866-869` | ✅ CORRECTO |
| `stopServer()` es idempotente | ✅ Comentario `main.ts:857` | ✅ CORRECTO |
| `app-settings` usa `deepMerge` | ✅ `app-settings.utils.ts:253-268` | ✅ CORRECTO |
| No hay migración para nuevos campos | ✅ Precedente `ui.zoomFactor` | ✅ CORRECTO |
| Iconos existen en `build/` | ✅ 16x16, 32x32, etc. | ✅ CORRECTO |
| Electron 24 soporta Tray + auto-start | ✅ Versión 24.3.0 | ✅ CORRECTO |
| Single instance lock "ya implementado" | ❌ NO encontrado en código | ❌ **FALSO** |
| MatDialog no sirve para este caso | ✅ Ejecución en renderer | ✅ CORRECTO |
| `mode=client` no impacta al servidor | ✅ Arquitectura F1-F5 | ✅ CORRECTO |

**1 de 10 supuestos es falso:** el single instance lock NO está implementado, aunque el plan afirma que sí.

---

## 12. Recomendaciones

### 12.1. Críticas (MUST FIX)

1. **Agregar `app.requestSingleInstanceLock()` en FASE 1** (antes del auto-start)
   - Ubicación: `main.ts` línea ~800, antes de `app.on('ready')`
   - Patrón: ver §6.3
   - Riesgo mitigado: doble instancia, corrupción de datos

2. **Agregar flag `quitRequested` para Cmd+Q** (FASE 7)
   - Ubicación: `main.ts` junto a `forceQuit`
   - Patrón: ver §7.3
   - Riesgo mitigado: diálogo duplicado

3. **Esperar `stopServer()` antes de `app.relaunch()`** (FASE 3)
   - Ubicación: handler "Reiniciar" del diálogo
   - Patrón: ver §9.2
   - Riesgo mitigado: puerto ocupado, conflicto de DB

### 12.2. Importantes (SHOULD FIX)

4. **Agregar `tray.on('destroyed')` para Linux** (FASE 2)
   - Ubicación: `tray-manager.ts`
   - Patrón: ver §9.3
   - Riesgo mitigado: app sin UI recuperable

5. **Simplificar FASE 6: reusar iconos existentes**
   - No crear `build/tray/` nuevo
   - Usar `build/icons/16x16.png` y `32x32.png`
   - Ahorrar tiempo y espacio

6. **Agregar UI para configurar `windowBehavior`**
   - Ubicación: *Configuración → Sistema → Ventana y bandeja*
   - Permitir resetear `closeAction` de `'minimize'` a `'ask'`
   - Mejorar UX post-checkbox

### 12.3. Opcionales (NICE TO HAVE)

7. **Guard adicional en `window-all-closed`** (ver §2.2)
   - No solo `if (tray)`, sino también `if (mode === 'server')`
   - Evitar cierre si el tray falló al crearse

8. **Notificación al minimizar** (plan descarta en §9.2)
   - Tooltip del tray es suficiente, pero un toast sutil ayudaría
   - Considerar solo en `mode=server`

---

## 13. Veredicto Final

### 13.1. Solidez Técnica

**⭐⭐⭐⭐☆ (4/5)**

El plan demuestra:
- ✅ Comprensión profunda de los hooks de Electron
- ✅ Conocimiento correcto de las APIs disponibles
- ✅ Decisiones arquitectónicas sólidas (diálogo nativo, tray en server, no en client)
- ✅ Identificación de trampas comunes (garbage collection del tray, macOS dock)
- ⚠️ **Un supuesto falso** (single instance lock "ya implementado")
- ⚠️ **Tres riesgos no mitigados** (doble instancia, Cmd+Q duplicado, relaunch sin cleanup)

### 13.2. Correctitud vs Código

**✅ COMPATIBLE:** El plan puede implementarse **sin modificar la arquitectura existente**. Todas las APIs que menciona están disponibles en Electron 24.3.0, todos los hooks que referencia existen en `main.ts`, y el schema de `app-settings` es extensible de la forma propuesta.

### 13.3. Riesgos Residuales

| Riesgo | Severidad | Mitigado por Plan | Requiere Fix |
|---|---|---|---|
| Doble instancia | 🔴 ALTA | ❌ NO | ✅ SÍ (§12.1.1) |
| Cmd+Q duplica diálogo | 🟡 MEDIA | ❌ NO | ✅ SÍ (§12.1.2) |
| Relaunch sin cleanup | 🟡 MEDIA | ❌ NO | ✅ SÍ (§12.1.3) |
| Tray destruido en Linux | 🟡 BAJA | ❌ NO | ⚠️ Recomendado (§12.2.4) |
| Diálogo molesto (UX) | 🟢 BAJA | ✅ SÍ (checkbox) | ⚠️ Mejorable (§12.2.6) |

### 13.4. Conclusión

**✅ PLAN APROBADO CON AJUSTES**

El plan es **técnicamente viable y arquitectónicamente sólido**. La investigación del código real confirma que:
- Los hooks existen y funcionan como el plan asume
- El schema es extensible sin migración
- Las APIs de Electron están disponibles
- Los iconos necesarios ya existen

**⚠️ TRES AJUSTES OBLIGATORIOS** antes de implementar:
1. Agregar `app.requestSingleInstanceLock()` en FASE 1
2. Agregar flag `quitRequested` para Cmd+Q en FASE 7
3. Esperar `stopServer()` antes de `app.relaunch()` en FASE 3

Con estos fixes, el plan puede proceder a implementación.

---

## 14. Checklist de Validación (para el Implementador)

Antes de mergear cada fase:

**FASE 1:**
- [ ] ✅ `app.requestSingleInstanceLock()` agregado ANTES de `app.on('ready')`
- [ ] ✅ Evento `second-instance` maneja enfoque de ventana existente
- [ ] ✅ Tray creado con ícono `16x16.png` o `32x32.png` (reusar existentes)
- [ ] ✅ Referencia global `let tray: Tray | null = null` para evitar GC

**FASE 2:**
- [ ] ✅ `window-all-closed` hace `return` temprano si `tray` existe
- [ ] ✅ `tray.on('destroyed')` agregado (mostrar ventana si el tray muere)
- [ ] ✅ Flag `forceQuit` funciona correctamente

**FASE 3:**
- [ ] ✅ `dialog.showMessageBox()` con checkbox "No volver a preguntar"
- [ ] ✅ Persistencia de `closeAction` en `app-settings.json`
- [ ] ✅ Opción "Reiniciar" **espera** `stopServer()` antes de `relaunch()`
- [ ] ✅ Confirmación extra para "Cerrar" en `mode=server`

**FASE 4:**
- [ ] ✅ `app.setLoginItemSettings()` configurado correctamente
- [ ] ✅ `startMinimized` oculta ventana en `did-finish-load`

**FASE 7:**
- [ ] ✅ Flag `quitRequested` agregado
- [ ] ✅ `before-quit` setea `quitRequested = true`
- [ ] ✅ `win.on('close')` NO muestra diálogo si `quitRequested === true`

**FASE 8 (QA):**
- [ ] ✅ Doble-click en ícono del escritorio con app ya corriendo → enfoca ventana existente (no abre segunda)
- [ ] ✅ Cmd+Q en macOS → un solo diálogo (no duplicado)
- [ ] ✅ Reiniciar desde menú tray → app cierra limpiamente y reabre (sin error `EADDRINUSE`)

---

**Fin de la Auditoría del PLAN B**

**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Repo:** GabFrank/frc-gourmet  
**Branch:** `cursor/tray-autostart-close-dialog-f834`  
**Commit:** (head actual del PR #289)
