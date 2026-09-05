# PLAN: Tray Icon + Auto-start + Diálogo de Cierre

**Feature aprobada por Gabriel**  
**Branch:** `cursor/tray-autostart-close-dialog-f834`  
**Estado:** PLANIFICACIÓN (NO implementar)

---

## 1. Contexto y Objetivo

### 1.1. Problema Actual

En `mode=server`, cuando el usuario cierra la ventana (botón X), la aplicación **termina por completo**, cerrando:
- El servidor Fastify (puerto 7070/HTTPS)
- La base de datos
- Todas las conexiones de las cajas/PWA/clientes remotos

Esto genera:
- **Desconexión de todas las terminales** cliente conectadas
- **Caída del servicio de pedidos online** (storefront)
- **Pérdida de acceso a la PWA móvil** (mozos, cocina, KDS)
- **Interrupción de ventas en curso** en otras terminales
- Necesidad de volver a abrir la app manualmente para reactivar el servicio

### 1.2. Solución Propuesta

Implementar un sistema de **persistencia en segundo plano** para `mode=server`:

1. **Tray Icon (Bandeja del Sistema):**
   - Ícono en la bandeja de sistema con menú contextual
   - Opciones: Mostrar / Reiniciar / Salir

2. **Auto-start al login del OS:**
   - Configuración persistente en `app-settings.json`
   - Arranque automático al iniciar sesión en Windows/macOS/Linux
   - Configurable desde la UI (opcional en este plan)

3. **Diálogo de cierre inteligente:**
   - Interceptar el evento `close` de la ventana
   - Mostrar diálogo con 3 opciones:
     - **Minimizar a bandeja** (default) — servidor sigue corriendo
     - **Reiniciar** — `app.relaunch()` + quit completo
     - **Cerrar completamente** — con confirmación extra por el impacto
   - Checkbox "No volver a preguntar" → persistir en `app-settings.json`

4. **Diferenciación por modo:**
   - **`mode=server`:** flujo completo con advertencia de impacto
   - **`mode=client` / `standalone`:** comportamiento simplificado (o cierre normal directo)

---

## 2. Investigación Técnica

### 2.1. Hooks Actuales de Ciclo de Vida (main.ts)

```typescript:853:870:main.ts
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

**Estado actual:**
- `window-all-closed`: en Windows/Linux, llama `stopServer()`, cierra DB y termina app
- `before-quit`: también llama `stopServer()` (redundancia para macOS)
- **Problema:** no hay manera de ocultar la ventana sin terminar el proceso

### 2.2. App-Settings Schema Existente

El archivo `electron/utils/app-settings.utils.ts` define la estructura completa de configuración:

```typescript:179:203:electron/utils/app-settings.utils.ts
export interface AppSettings {
  mode: AppMode;
  database: DatabaseSettings;
  network: NetworkSettings | null;
  update: UpdateSettings;
  backup: BackupSettings;
  ia: IaSettings;
  musica: MusicaSettings;
  ui: UiSettings;
  /**
   * F5 paso 3: dispositivo "fisico" identificado para este proceso.
   * - standalone/server: el PC donde corre la app (selección manual).
   * - client: el dispositivo asignado a este PC cliente (se envia en login).
   * Nullable cuando aun no se selecciono — los handlers caen a `null` y la
   * columna `dispositivo_id` queda vacia (es nullable).
   */
  deviceId?: number | null;
  /**
   * Zona horaria IANA aplicada a TODO el proceso via `process.env.TZ` al
   * arranque (antes de createWindow, para que el renderer la herede). Espejo
   * de `empresa.zonaHoraria` — se persiste aca para poder leerla sync temprano.
   * Paraguay quedo en UTC-3 fijo (sin horario de invierno): si el tzdata del SO
   * esta viejo, usar 'America/Sao_Paulo' (UTC-3 estable) corrige la hora.
   */
  timezone?: string;
}
```

**Extensión necesaria:**
- Agregar sub-sección `windowBehavior` para configuración de ventana/tray
- Persistir preferencias de cierre y auto-start

### 2.3. Iconos Disponibles

El código actual (main.ts) busca iconos en:
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

**Hallazgo:** La búsqueda con `Glob` no encontró archivos en `build/` — probablemente se generan durante el build empaquetado.

**Acción requerida:**
- Verificar existencia de iconos en tiempo de build
- Si no existen, agregar generación de iconos para tray (16x16, 32x32 mínimo)
- El tray necesita **iconos pequeños** (16x16, 24x24, 32x32) además del ícono de ventana

### 2.4. Electron Tray API

```javascript
const { Tray, Menu, nativeImage } = require('electron');

let tray = null;

function createTray() {
  const icon = nativeImage.createFromPath('/path/to/icon.png');
  // En Windows, usar .ico de 16x16; en macOS, PNG de 16x16/32x32 (Template)
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Mostrar', click: () => { win?.show(); } },
    { type: 'separator' },
    { label: 'Reiniciar', click: () => { app.relaunch(); app.quit(); } },
    { label: 'Salir', click: () => { app.quit(); } }
  ]);
  
  tray.setToolTip('FRC Gourmet');
  tray.setContextMenu(contextMenu);
  
  // Doble click en Windows → mostrar ventana
  tray.on('double-click', () => { win?.show(); });
}

app.whenReady().then(() => {
  createTray();
});

// IMPORTANTE: mantener referencia global a `tray` o se recolecta basura
```

**Consideraciones por plataforma:**
- **Windows:** `.ico` de 16x16 mínimo, soporta color completo
- **macOS:** PNG monocromático (Template Image) de 16x16 @ 2x = 32x32 real
  - Nombre del archivo con sufijo `Template` (ej: `iconTemplate.png`)
  - El sistema lo tiñe automáticamente según el tema claro/oscuro
- **Linux:** PNG de 22x22 o 24x24 (varía por DE)

### 2.5. Auto-start con `app.setLoginItemSettings()`

```javascript
// Configurar auto-start
app.setLoginItemSettings({
  openAtLogin: true,
  openAsHidden: false,  // true = arranca minimizado
  path: app.getPath('exe'),  // Ruta del ejecutable (solo si no es la actual)
  args: []  // Argumentos opcionales
});

// Leer configuración actual
const settings = app.getLoginItemSettings();
console.log(settings.openAtLogin);  // true si está habilitado
```

**Limitaciones por plataforma:**

| Plataforma | Limitación | Workaround |
|------------|------------|------------|
| **Windows** | ✅ Funciona nativamente sin restricciones | N/A |
| **macOS** | ⚠️ Requiere que la app esté firmada y notarizada (sandbox) | En dev, funciona parcialmente. En producción, requiere firma válida. |
| **Linux** | ⚠️ Depende del DE (GNOME, KDE, XFCE tienen mecanismos distintos) | Electron lo maneja creando `.desktop` file en `~/.config/autostart/` |

**Recomendación:** 
- Documentar que en macOS sin firma válida, el auto-start puede no funcionar
- En Linux, verificar manualmente en al menos Ubuntu (GNOME) y Linux Mint (Cinnamon)
- Persistir la preferencia en `app-settings.windowBehavior.autoStart`

### 2.6. Interceptar Cierre de Ventana

```javascript
win.on('close', (event) => {
  if (!forceQuit && someCondition) {
    event.preventDefault();
    
    // Mostrar diálogo
    dialog.showMessageBox(win, {
      type: 'question',
      title: 'Cerrar FRC Gourmet',
      message: '¿Qué deseas hacer?',
      detail: 'En modo servidor, cerrar la ventana puede desconectar las cajas.',
      buttons: ['Minimizar a bandeja', 'Reiniciar', 'Cerrar completamente'],
      defaultId: 0,  // Default = Minimizar
      cancelId: 0,
      checkboxLabel: 'No volver a preguntar',
      checkboxChecked: false
    }).then(result => {
      const { response, checkboxChecked } = result;
      
      if (checkboxChecked) {
        // Guardar preferencia en app-settings
      }
      
      switch (response) {
        case 0: // Minimizar
          win.hide();
          break;
        case 1: // Reiniciar
          app.relaunch();
          app.quit();
          break;
        case 2: // Cerrar
          // Mostrar confirmación extra si mode=server
          // Luego: forceQuit = true; win.close();
          break;
      }
    });
  }
});
```

**Flag `forceQuit`:**
- Variable global que indica si el cierre es intencional (desde menú Salir del tray, o segunda confirmación)
- Evita loops infinitos de `preventDefault()`

### 2.7. Consideraciones de Reinicio

**Hot-reload vs Restart completo:**
- Cambios en **main.ts, preload.ts, handlers, entities** requieren **reinicio completo** de Electron
- El reinicio con `app.relaunch()` + `app.quit()`:
  - ✅ Preserva la configuración persistida en `app-settings.json`
  - ✅ Preserva el `deviceId` y `currentUser` (se rehidratan de disco/keytar)
  - ❌ **Cierra todas las conexiones WebSocket/SSE/HTTP activas** (clientes se desconectan)
  - ❌ Tarda ~5-15 segundos (re-init de DB, migraciones, seeds)

**Advertencia necesaria:**
> "Reiniciar cerrará temporalmente el servidor. Las cajas y dispositivos conectados perderán conexión durante ~10 segundos."

### 2.8. Migraciones de Base de Datos

**¿Se necesita migración?**

**NO**, por las siguientes razones:

1. **app-settings.json NO es una tabla de base de datos**
   - Es un archivo JSON persistido en `userData/`
   - No pasa por TypeORM ni por el sistema de migraciones
   - Se lee/escribe síncronamente con `readAppSettings()` / `writeAppSettings()`

2. **Backward compatibility built-in:**
   - `readAppSettings()` aplica `deepMerge(DEFAULT_APP_SETTINGS, raw)`:
     ```typescript:274:284:electron/utils/app-settings.utils.ts
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
   - Si el JSON viejo no tiene `windowBehavior`, el `deepMerge` usa el default
   - **No hay caso de rotura**: instancias viejas funcionan con defaults, instancias nuevas leen los valores guardados

3. **Precedente:** todas las expansiones previas de `AppSettings` (ej: `musica`, `backup`, `ui.zoomFactor`) se hicieron sin migración

**Conclusión:** agregar `windowBehavior?: WindowBehaviorSettings` a `AppSettings` es safe y no requiere migración.

---

## 3. Decisión: Comportamiento por Modo

### 3.1. Análisis por Modo de Operación

| Modo | Descripción | ¿Necesita tray + diálogo? |
|------|-------------|---------------------------|
| **`server`** | Esta máquina expone Fastify + sirve PWA/storefront | ✅ **SÍ** — cerrar impacta a clientes remotos |
| **`client`** | Todas las llamadas van a un server remoto vía HTTP | ⚠️ **OPCIONAL** — no impacta otros dispositivos, pero puede minimizar a tray |
| **`standalone`** | Todo local (SQLite), sin servidor HTTP | ⚠️ **OPCIONAL** — no impacta otros dispositivos |

### 3.2. Recomendación de Implementación

**Opción A (Conservadora — RECOMENDADA):**
- **`mode=server`:** flujo completo (tray + diálogo con advertencia + 3 opciones)
- **`mode=client` y `standalone`:** comportamiento legacy (cierre normal) O minimizar a tray directamente sin diálogo

**Justificación:**
- En `mode=client`/`standalone`, cerrar la ventana **no afecta a nadie más**
- El usuario puede estar acostumbrado a cerrar la app normalmente
- Agregar el diálogo en estos modos puede resultar molesto sin beneficio claro

**Opción B (Unificada):**
- Todos los modos usan tray + diálogo, pero:
  - `server`: mensaje de advertencia de impacto
  - `client`/`standalone`: mensaje neutro ("¿Cerrar o minimizar?")

**Decisión documentada:** Implementar **Opción A** (flujo completo solo en `mode=server`).

---

## 4. Schema de App-Settings Propuesto

```typescript
export interface WindowBehaviorSettings {
  /**
   * Estrategia al cerrar la ventana (botón X):
   * - 'ask': mostrar diálogo con opciones (default en mode=server)
   * - 'minimize': minimizar a tray sin preguntar
   * - 'close': cerrar completamente sin preguntar
   * - 'default': comportamiento legacy (cerrar directo en client/standalone)
   */
  closeAction: 'ask' | 'minimize' | 'close' | 'default';
  
  /**
   * Auto-start al login del sistema operativo.
   * Solo aplica en mode=server (opcional: también en client/standalone).
   */
  autoStart: boolean;
  
  /**
   * Iniciar minimizado a la bandeja (requiere autoStart=true).
   * Útil para que el server arranque en segundo plano sin mostrar ventana.
   */
  startMinimized: boolean;
}

export interface AppSettings {
  // ... campos existentes ...
  windowBehavior?: WindowBehaviorSettings;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  // ... defaults existentes ...
  windowBehavior: {
    closeAction: 'ask',  // Se determinará por modo en runtime
    autoStart: false,
    startMinimized: false,
  },
};
```

**Notas:**
- `closeAction: 'ask'` es el default para `mode=server` (mostrar diálogo)
- `closeAction: 'default'` en `mode=client`/`standalone` = cierre legacy sin tray
- El checkbox "No volver a preguntar" cambia `closeAction` de `'ask'` a `'minimize'` o `'close'` según la opción elegida

---

## 5. Arquitectura de la Solución

### 5.1. Nuevos Archivos

```
electron/
  utils/
    tray-manager.ts          # Gestión del tray icon
    auto-start-manager.ts    # Configuración de auto-start
    window-close-dialog.ts   # Diálogo de cierre con las 3 opciones
```

### 5.2. Modificaciones Principales

```
main.ts                                    # Integrar tray + diálogo de cierre
electron/utils/app-settings.utils.ts       # Agregar WindowBehaviorSettings
```

### 5.3. Flujo de Ejecución

#### 5.3.1. Inicialización (app.on('ready'))

```typescript
app.on('ready', () => {
  const settings = readAppSettings(getUserDataPath());
  
  // 1. Configurar auto-start según settings
  if (settings.mode === 'server') {
    configureAutoStart(settings.windowBehavior?.autoStart ?? false);
  }
  
  // 2. Crear tray icon (solo en server, o en todos los modos si Opción B)
  if (settings.mode === 'server') {
    createTray();
  }
  
  // 3. Crear ventana
  createWindow();
  
  // 4. Si startMinimized=true, ocultar ventana (queda solo tray)
  if (settings.windowBehavior?.startMinimized && tray) {
    win?.hide();
  }
});
```

#### 5.3.2. Interceptar Cierre (win.on('close'))

```typescript
let forceQuit = false;

win.on('close', (event) => {
  const settings = readAppSettings(getUserDataPath());
  const closeAction = settings.windowBehavior?.closeAction ?? 'ask';
  
  // Si forceQuit = true, dejar que cierre (salida desde tray o confirmación final)
  if (forceQuit) {
    return;
  }
  
  // Estrategia según closeAction
  switch (closeAction) {
    case 'default':
      // Client/standalone: cerrar normal (no hacer nada, dejar que cierre)
      return;
    
    case 'minimize':
      // Minimizar sin preguntar
      event.preventDefault();
      win.hide();
      break;
    
    case 'close':
      // Cerrar sin preguntar (pero en server, confirmar impacto)
      if (settings.mode === 'server') {
        event.preventDefault();
        showFinalConfirmation(() => {
          forceQuit = true;
          win.close();
        });
      }
      // En client/standalone, dejar que cierre
      break;
    
    case 'ask':
      // Mostrar diálogo con 3 opciones
      event.preventDefault();
      showCloseDialog(settings.mode, (action, dontAskAgain) => {
        if (dontAskAgain) {
          persistCloseAction(action);
        }
        executeCloseAction(action);
      });
      break;
  }
});
```

#### 5.3.3. Modificar window-all-closed

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

**CRÍTICO:** Con tray activo, `window-all-closed` NO debe llamar `app.quit()`, o el servidor se cierra igual.

#### 5.3.4. Salir desde Tray

```typescript
// En el menú del tray
{
  label: 'Salir',
  click: () => {
    if (settings.mode === 'server') {
      // Confirmar antes de cerrar en mode=server
      dialog.showMessageBox({
        type: 'warning',
        title: 'Cerrar FRC Gourmet',
        message: '¿Estás seguro de cerrar el servidor completamente?',
        detail: 'Se desconectarán todas las cajas, PWA y dispositivos móviles conectados.',
        buttons: ['Cancelar', 'Cerrar servidor'],
        defaultId: 0,
        cancelId: 0
      }).then(result => {
        if (result.response === 1) {
          forceQuit = true;
          app.quit();
        }
      });
    } else {
      // Client/standalone: salir directo
      forceQuit = true;
      app.quit();
    }
  }
}
```

---

## 6. Riesgos y Mitigaciones

### 6.1. Riesgos Identificados

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| **Usuario cree que cerró la app, pero el server sigue corriendo** | MEDIO | ALTA | 1. Notificación al minimizar: "App minimizada a la bandeja" (toast)<br>2. Ícono visible en tray<br>3. Tooltip del tray: "FRC Gourmet (Servidor activo)" |
| **Doble instancia al auto-start si el usuario ya tiene una abierta** | ALTO | MEDIA | `app.requestSingleInstanceLock()` (ya implementado en Electron 24) — segunda instancia se cierra automáticamente |
| **En macOS, el ícono del dock NO desaparece al minimizar a tray** | BAJO | ALTA | **Comportamiento esperado de macOS:** el dock siempre muestra apps abiertas. Documentar que en Mac el ícono queda visible. |
| **Botón "Cerrar" del diálogo cierra el server sin querer** | ALTO | MEDIA | Confirmación extra con mensaje explícito: "Se desconectarán N cajas / PWA / dispositivos" |
| **Quit desde menú de macOS (Cmd+Q) bypasea el diálogo** | MEDIO | MEDIA | Interceptar `app.on('before-quit')` y cancelar si `forceQuit = false` |
| **Auto-start no funciona en macOS sin firma** | BAJO | ALTA (en dev) | Documentar limitación; funciona en builds de producción firmados |
| **Linux: diferentes Desktop Environments manejan tray de forma distinta** | MEDIO | MEDIA | 1. Probar en Ubuntu (GNOME) y Mint (Cinnamon)<br>2. Documentar que en algunos DE el tray puede no ser visible |

### 6.2. Trampas Específicas de Electron

#### 6.2.1. Garbage Collection del Tray

```javascript
// ❌ MAL: el tray se recolecta basura
function createTray() {
  const tray = new Tray(icon);  // Variable local
  // ...
}

// ✅ BIEN: mantener referencia global
let tray = null;

function createTray() {
  tray = new Tray(icon);  // Variable global
  // ...
}
```

#### 6.2.2. Event Loop de app.quit()

```javascript
// ❌ MAL: stopServer() no termina antes de quit
app.on('before-quit', () => {
  stopServer();  // Devuelve Promise, pero quit no espera
  app.quit();
});

// ✅ BIEN: cancelar quit, esperar async, luego quit con flag
app.on('before-quit', (event) => {
  if (!cleanupDone) {
    event.preventDefault();
    stopServer().then(() => {
      cleanupDone = true;
      app.quit();
    });
  }
});
```

#### 6.2.3. Cmd+Q en macOS

```javascript
// En macOS, Cmd+Q dispara before-quit pero NO pasa por win.on('close')
app.on('before-quit', (event) => {
  if (!forceQuit && shouldShowDialog) {
    event.preventDefault();
    showCloseDialog(...);
  }
});
```

---

## 7. Fases de Implementación

### FASE 1: Extender app-settings + tray básico (sin diálogo)

**Objetivo:** Crear el tray funcional y el schema de configuración.

**Archivos:**
```
electron/utils/app-settings.utils.ts       # Agregar WindowBehaviorSettings
electron/utils/tray-manager.ts             # Nuevo: gestión del tray
main.ts                                    # Integrar createTray()
```

**Checklist:**
- [ ] Agregar `WindowBehaviorSettings` a `AppSettings`
- [ ] Agregar default para `windowBehavior` en `DEFAULT_APP_SETTINGS`
- [ ] Crear `tray-manager.ts`:
  - [ ] `createTray(mode: AppMode): Tray` — crea tray con menú básico (Mostrar/Salir)
  - [ ] `destroyTray()` — limpia la instancia del tray
  - [ ] Resolver path del ícono para tray (16x16/32x32, según plataforma)
- [ ] En `main.ts`:
  - [ ] Mantener referencia global `let tray: Tray | null = null`
  - [ ] Llamar `createTray()` en `app.on('ready')` **solo si `mode === 'server'`**
  - [ ] Agregar opción "Mostrar" en menú del tray: `win?.show(); win?.focus();`
  - [ ] Agregar opción "Salir" en menú del tray (sin confirmación aún)
  - [ ] Doble-click en tray (Windows): mostrar ventana

**Commit:** `feat(tray): agregar tray icon básico en mode=server`

**Verificación manual:**
- Build: `npm run build`
- Iniciar app en `mode=server`
- Verificar que aparece ícono en bandeja del sistema
- Click derecho → menú con "Mostrar" / "Salir"
- Cerrar ventana (X) → app termina (comportamiento actual, sin cambios aún)
- Desde tray → "Salir" → app termina

---

### FASE 2: Interceptar cierre + minimizar a tray (sin diálogo)

**Objetivo:** Evitar que cerrar la ventana termine la app; minimiza a tray directamente.

**Archivos:**
```
main.ts                                    # Modificar win.on('close') y window-all-closed
```

**Checklist:**
- [ ] Agregar flag global `let forceQuit = false`
- [ ] Modificar `win.on('close')`:
  - [ ] Si `forceQuit = true`, dejar que cierre
  - [ ] Si `mode === 'server'` y `tray` existe:
    - [ ] `event.preventDefault()`
    - [ ] `win.hide()`
    - [ ] (Opcional) Mostrar notificación: "App minimizada a la bandeja"
- [ ] Modificar `app.on('window-all-closed')`:
  - [ ] Si `tray` existe, NO llamar `app.quit()` (dejar que siga corriendo)
  - [ ] Si NO hay tray, mantener comportamiento legacy (cerrar app)
- [ ] Actualizar "Salir" del menú tray:
  - [ ] Setear `forceQuit = true`
  - [ ] Llamar `app.quit()`

**Commit:** `feat(tray): minimizar a bandeja al cerrar ventana (mode=server)`

**Verificación manual:**
- Iniciar en `mode=server`
- Cerrar ventana (X) → ventana desaparece, tray sigue visible
- Verificar que Fastify sigue corriendo: `curl http://localhost:7070/api/health` → 200 OK
- Desde tray → "Mostrar" → ventana reaparece
- Desde tray → "Salir" → app termina completamente

---

### FASE 3: Diálogo de cierre con 3 opciones

**Objetivo:** Mostrar diálogo al cerrar, con opciones Minimizar/Reiniciar/Cerrar.

**Archivos:**
```
electron/utils/window-close-dialog.ts      # Nuevo: diálogo de cierre
main.ts                                    # Integrar diálogo en win.on('close')
```

**Checklist:**
- [ ] Crear `window-close-dialog.ts`:
  - [ ] `showCloseDialog(win: BrowserWindow, mode: AppMode): Promise<CloseDialogResult>`
  - [ ] Opciones: "Minimizar a bandeja" (default), "Reiniciar", "Cerrar completamente"
  - [ ] Checkbox: "No volver a preguntar"
  - [ ] Si `mode === 'server'`, agregar texto de advertencia: "Las cajas y dispositivos conectados se desconectarán"
  - [ ] Devolver: `{ action: 'minimize' | 'restart' | 'close', dontAskAgain: boolean }`
- [ ] Agregar `showFinalConfirmation()` — diálogo extra para "Cerrar completamente":
  - [ ] Título: "Confirmar cierre del servidor"
  - [ ] Mensaje: "Se desconectarán todas las cajas, PWA y dispositivos móviles. ¿Continuar?"
  - [ ] Botones: "Cancelar" / "Cerrar servidor"
- [ ] En `main.ts`, modificar `win.on('close')`:
  - [ ] Leer `closeAction` de `app-settings`
  - [ ] Si `closeAction === 'ask'`:
    - [ ] Mostrar diálogo `showCloseDialog()`
    - [ ] Según respuesta:
      - [ ] `'minimize'`: `win.hide()`
      - [ ] `'restart'`: `app.relaunch(); forceQuit = true; app.quit();`
      - [ ] `'close'`: mostrar `showFinalConfirmation()`, luego `forceQuit = true; win.close();`
  - [ ] Si `dontAskAgain = true`:
    - [ ] Persistir en `app-settings.windowBehavior.closeAction` (cambiar de `'ask'` a la acción elegida)

**Commit:** `feat(window): agregar diálogo de cierre con 3 opciones`

**Verificación manual:**
- Iniciar en `mode=server` (con `closeAction: 'ask'` en app-settings)
- Cerrar ventana (X) → aparece diálogo con 3 botones
- Probar cada opción:
  - [ ] "Minimizar" → ventana se oculta, tray visible, server corriendo
  - [ ] "Reiniciar" → app se cierra y reabre automáticamente
  - [ ] "Cerrar" → diálogo extra de confirmación → app termina
- Marcar "No volver a preguntar" + Minimizar → próximo cierre NO muestra diálogo, minimiza directo
- Verificar `app-settings.json`: `windowBehavior.closeAction` cambió a `'minimize'`

---

### FASE 4: Auto-start al login

**Objetivo:** Configurar arranque automático al iniciar sesión del OS.

**Archivos:**
```
electron/utils/auto-start-manager.ts       # Nuevo: gestión de auto-start
main.ts                                    # Integrar auto-start en app.on('ready')
```

**Checklist:**
- [ ] Crear `auto-start-manager.ts`:
  - [ ] `setAutoStart(enabled: boolean, startMinimized: boolean): void`
    - [ ] Llamar `app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: startMinimized })`
  - [ ] `getAutoStartStatus(): { enabled: boolean, startMinimized: boolean }`
    - [ ] Leer de `app.getLoginItemSettings()`
- [ ] En `main.ts`, en `app.on('ready')`:
  - [ ] Leer `autoStart` y `startMinimized` de `app-settings`
  - [ ] Si `mode === 'server'`:
    - [ ] Llamar `setAutoStart(autoStart, startMinimized)`
  - [ ] Si `startMinimized = true` y `tray` existe:
    - [ ] Después de `createWindow()`, hacer `win?.hide()`
- [ ] Agregar opción "Reiniciar" al menú del tray:
  - [ ] Label: "Reiniciar"
  - [ ] Click: `app.relaunch(); forceQuit = true; app.quit();`

**Commit:** `feat(autostart): configurar auto-start al login del sistema`

**Verificación manual:**
- Modificar `app-settings.json`: `windowBehavior: { autoStart: true, startMinimized: false }`
- Build: `npm run build`
- Iniciar app → cerrar → **reiniciar el sistema operativo**
- Verificar que la app arranca automáticamente al iniciar sesión
- Repetir con `startMinimized: true` → app arranca pero ventana oculta (solo tray visible)

**Verificación por plataforma:**
- [ ] Windows: verificar en `Task Manager → Startup` que la app está habilitada
- [ ] macOS: verificar en `System Preferences → Users & Groups → Login Items`
- [ ] Linux: verificar existencia de archivo en `~/.config/autostart/frc-gourmet.desktop`

---

### FASE 5: Diferenciar comportamiento por modo (client/standalone)

**Objetivo:** En `mode=client`/`standalone`, usar cierre normal (sin diálogo) o permitir minimizar opcional.

**Archivos:**
```
main.ts                                    # Ajustar lógica de tray según modo
```

**Checklist:**
- [ ] Refactorizar lógica de creación de tray:
  - [ ] Si `mode === 'server'`: crear tray siempre
  - [ ] Si `mode === 'client'` o `'standalone'`:
    - [ ] Opción A (conservadora): NO crear tray, comportamiento legacy
    - [ ] Opción B: crear tray opcional si `windowBehavior.showTray = true` (agregar campo)
- [ ] Ajustar `win.on('close')`:
  - [ ] Si `mode !== 'server'` y NO hay tray: dejar que cierre normal (sin preventDefault)
  - [ ] Si hay tray en cualquier modo: aplicar lógica de `closeAction`
- [ ] En el diálogo `showCloseDialog()`:
  - [ ] Si `mode !== 'server'`: NO mostrar advertencia de impacto en otros dispositivos
  - [ ] Mensaje neutro: "¿Deseas cerrar la aplicación o dejarla en segundo plano?"

**Commit:** `feat(window): comportamiento de cierre diferenciado por modo`

**Verificación manual:**
- [ ] Cambiar a `mode=client` → cerrar ventana (X) → app termina (sin diálogo)
- [ ] Cambiar a `mode=standalone` → cerrar ventana (X) → app termina (sin diálogo)
- [ ] Cambiar a `mode=server` → cerrar ventana (X) → diálogo aparece (comportamiento actual de FASE 3)

---

### FASE 6: Iconos del tray por plataforma

**Objetivo:** Generar/incluir iconos optimizados para tray en cada plataforma.

**Archivos:**
```
build/tray/
  icon.ico                  # Windows (16x16, 32x32 multi-size)
  iconTemplate.png          # macOS (22x22 @ 2x = 44x44, monocromático)
  iconTemplate@2x.png       # macOS retina
  icon.png                  # Linux (24x24)
electron/utils/tray-manager.ts  # Actualizar path de iconos
```

**Checklist:**
- [ ] Crear directorio `build/tray/`
- [ ] Generar iconos:
  - [ ] Windows: `.ico` multi-size (16x16, 32x32, 48x48)
  - [ ] macOS: PNG monocromático con nombre `iconTemplate.png` (sistema lo tiñe automáticamente)
    - [ ] 22x22 @ 1x y 44x44 @ 2x (retina)
  - [ ] Linux: PNG 24x24 con color completo
- [ ] Actualizar `tray-manager.ts`:
  - [ ] Función `resolveTrayIconPath(): string`
    - [ ] Según `process.platform`:
      - [ ] `'win32'`: `build/tray/icon.ico`
      - [ ] `'darwin'`: `build/tray/iconTemplate.png` (Electron maneja @2x automáticamente)
      - [ ] `'linux'`: `build/tray/icon.png`
  - [ ] Usar `nativeImage.createFromPath()` con fallback a ícono de ventana si no existe
- [ ] Agregar iconos a `asarUnpack` en `package.json` (si no están ya):
  ```json
  "build": {
    "asarUnpack": [
      "dist/**/*",
      "build/**/*"
    ]
  }
  ```

**Commit:** `feat(tray): agregar iconos optimizados por plataforma`

**Verificación manual:**
- Build: `npm run electron:build` (empaquetado completo)
- Instalar e iniciar app empaquetada
- Verificar calidad del ícono en tray en cada plataforma:
  - [ ] Windows: ícono nítido en bandeja (esquina inferior derecha)
  - [ ] macOS: ícono monocromático que cambia con tema claro/oscuro
  - [ ] Linux (Ubuntu): ícono visible en la barra superior

---

### FASE 7: Manejo de Cmd+Q (macOS) y quit desde otros orígenes

**Objetivo:** Interceptar todos los caminos de cierre, no solo el botón X.

**Archivos:**
```
main.ts                                    # Mejorar app.on('before-quit')
```

**Checklist:**
- [ ] Modificar `app.on('before-quit')`:
  - [ ] Si `forceQuit = false` y `mode === 'server'`:
    - [ ] `event.preventDefault()`
    - [ ] Mostrar diálogo de cierre (mismo que el botón X)
  - [ ] Si ya pasó por el diálogo (o `forceQuit = true`):
    - [ ] Llamar `stopServer().catch()`
    - [ ] Dejar que continúe el quit
- [ ] Casos a cubrir:
  - [ ] Cmd+Q en macOS
  - [ ] Clic en "Quit" del menú del dock (macOS)
  - [ ] Cerrar sesión del OS (Windows "Log out", macOS "Log Out", Linux shutdown)
  - [ ] Task Manager → End Task (Windows) — **no interceptable, pero documentar**

**Commit:** `fix(quit): interceptar Cmd+Q y otros orígenes de cierre`

**Verificación manual (macOS):**
- [ ] Iniciar app → Cmd+Q → aparece diálogo (igual que botón X)
- [ ] Desde dock → Quit → aparece diálogo
- [ ] Marcar "No volver a preguntar" + Minimizar → Cmd+Q minimiza sin diálogo

**Verificación Windows:**
- [ ] Alt+F4 → aparece diálogo
- [ ] Cerrar sesión → (diálogo puede o no aparecer según timing del OS)

---

### FASE 8: Tests y QA

**Objetivo:** Validar el comportamiento en todos los escenarios.

**Archivos:**
```
docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md   # Nuevo: manual de pruebas
```

**Checklist de Testing:**

#### 8.1. Tray Icon
- [ ] Ícono aparece en bandeja al iniciar (mode=server)
- [ ] Click derecho → menú con "Mostrar / Reiniciar / Salir"
- [ ] Doble-click en tray (Windows) → muestra ventana
- [ ] Tooltip muestra "FRC Gourmet (Servidor activo)"

#### 8.2. Cierre de Ventana (X)
- [ ] `mode=server` + `closeAction='ask'`:
  - [ ] Diálogo aparece con 3 opciones
  - [ ] "Minimizar" → ventana oculta, server corriendo
  - [ ] "Reiniciar" → app se reinicia automáticamente
  - [ ] "Cerrar" → confirmación extra → app termina, server se detiene
  - [ ] Checkbox "No volver a preguntar" persiste preferencia
- [ ] `mode=server` + `closeAction='minimize'`: minimiza sin preguntar
- [ ] `mode=server` + `closeAction='close'`: confirmación extra, luego cierra
- [ ] `mode=client`: cierra normal (sin diálogo ni tray)
- [ ] `mode=standalone`: cierra normal (sin diálogo ni tray)

#### 8.3. Reinicio
- [ ] Desde menú tray → "Reiniciar" → app se cierra y reabre
- [ ] Desde diálogo de cierre → "Reiniciar" → app se cierra y reabre
- [ ] Verificar que `deviceId` y `currentUser` se preservan tras reinicio

#### 8.4. Auto-start
- [ ] Modificar `app-settings.json`: `windowBehavior.autoStart = true`
- [ ] Reiniciar sistema operativo
- [ ] App arranca automáticamente
- [ ] Con `startMinimized=true`: app arranca en segundo plano (solo tray)
- [ ] Con `startMinimized=false`: app arranca con ventana visible

#### 8.5. Múltiples Instancias
- [ ] Intentar abrir segunda instancia de la app → se enfoca la primera (single instance lock)

#### 8.6. Limpieza al Salir
- [ ] Salir completamente → verificar que:
  - [ ] Fastify se detiene (puerto 7070 libre)
  - [ ] Conexión a BD se cierra sin errores en logs
  - [ ] Tray icon desaparece

#### 8.7. Plataformas
- [ ] Windows 10/11: tray + auto-start + diálogo
- [ ] macOS: tray + auto-start (con firma) + Cmd+Q interceptado
- [ ] Linux (Ubuntu/Mint): tray + auto-start + diálogo

**Commit:** `test(tray): agregar checklist de QA manual`

---

### FASE 9: Documentación

**Objetivo:** Actualizar docs y skill con la nueva feature.

**Archivos:**
```
docs/TRAY-Y-CIERRE.md                                # Nuevo: guía de usuario
docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md        # Manual de pruebas
.claude/skills/frc-gourmet-expert/architecture/electron-bootstrap.md  # Actualizar
```

**Checklist:**
- [ ] Crear `docs/TRAY-Y-CIERRE.md`:
  - [ ] Explicar el tray icon y su propósito
  - [ ] Describir las 3 opciones del diálogo de cierre
  - [ ] Documentar auto-start y cómo configurarlo
  - [ ] Limitaciones por plataforma (macOS firma, Linux DE)
  - [ ] Screenshots del tray y del diálogo
- [ ] Actualizar skill `electron-bootstrap.md`:
  - [ ] Sección nueva: "Tray Icon y Cierre de Ventana"
  - [ ] Explicar flujo de `win.on('close')` + `window-all-closed` + `before-quit`
  - [ ] Mencionar `forceQuit` flag
  - [ ] Link a docs/TRAY-Y-CIERRE.md
- [ ] Actualizar `CLAUDE.md` (si aplica):
  - [ ] Mencionar que en `mode=server`, cerrar la ventana NO termina el servidor

**Commit:** `docs(tray): agregar documentación de tray icon y cierre`

---

## 8. Resumen de Commits Convencionales Previstos

```
feat(tray): agregar tray icon básico en mode=server
feat(tray): minimizar a bandeja al cerrar ventana (mode=server)
feat(window): agregar diálogo de cierre con 3 opciones
feat(autostart): configurar auto-start al login del sistema
feat(window): comportamiento de cierre diferenciado por modo
feat(tray): agregar iconos optimizados por plataforma
fix(quit): interceptar Cmd+Q y otros orígenes de cierre
test(tray): agregar checklist de QA manual
docs(tray): agregar documentación de tray icon y cierre
```

**Total:** 9 commits atómicos (uno por fase).

---

## 9. Preguntas Abiertas / Decisiones Pendientes

### 9.1. UI para Configurar Auto-start

**¿Agregar pantalla en Angular para configurar `windowBehavior`?**

**Opciones:**
- **A)** Solo via `app-settings.json` manual (menos trabajo, para usuarios avanzados)
- **B)** Pantalla en *Configuración → Sistema → Ventana y bandeja* con toggles:
  - Auto-start al login
  - Iniciar minimizado
  - Comportamiento al cerrar (dropdown: Preguntar / Minimizar / Cerrar)

**Recomendación:** Opción A para este plan (solo backend). La UI puede agregarse en una iteración futura.

**Justificación:**
- La feature es mayormente de backend (main.ts, Electron APIs)
- Los settings ya son accesibles via JSON para usuarios avanzados
- La UI puede agregarse después sin modificar el backend

---

### 9.2. Notificación al Minimizar

**¿Mostrar toast/notificación del sistema al minimizar?**

**Opciones:**
- **A)** Notificación nativa del OS: `new Notification('FRC Gourmet minimizado a la bandeja')`
  - ✅ Pro: estándar del OS, usuario acostumbrado
  - ❌ Con: requiere permisos de notificaciones (puede estar bloqueado)
- **B)** Toast dentro de Angular (antes de ocultar la ventana)
  - ✅ Pro: no requiere permisos
  - ❌ Con: puede no verse si la ventana se oculta rápido
- **C)** Sin notificación (solo tooltip del tray)

**Recomendación:** Opción C (sin notificación) + tooltip claro en el tray.

**Justificación:**
- El usuario VIO el diálogo (si eligió "Minimizar") o configuró explícitamente que minimice
- El tray icon es suficientemente visible
- Evita spam de notificaciones

---

### 9.3. Icono Distintivo en Tray según Estado

**¿Usar íconos diferentes según el estado del servidor?**

**Opciones:**
- **A)** Un solo ícono (logo de FRC Gourmet)
- **B)** Dos íconos:
  - Verde/Normal: servidor activo, sin errores
  - Rojo/Warning: servidor con error (ej: Fastify no arrancó)

**Recomendación:** Opción A (un solo ícono) para este plan.

**Justificación:**
- La feature ya es compleja; agregar estado dinámico incrementa scope
- Si Fastify no arranca, el usuario lo nota porque las cajas no funcionan
- Puede agregarse en el futuro si se solicita

---

## 10. Criterios de Aceptación

La feature se considera **COMPLETA** cuando:

### 10.1. Funcionalidad
- [x] En `mode=server`, al cerrar la ventana (X), aparece un diálogo con 3 opciones
- [x] Opción "Minimizar a bandeja" oculta la ventana y mantiene el servidor corriendo
- [x] Opción "Reiniciar" cierra y reabre la app automáticamente
- [x] Opción "Cerrar completamente" muestra confirmación extra y termina el servidor
- [x] Checkbox "No volver a preguntar" persiste la preferencia en `app-settings.json`
- [x] Tray icon aparece en la bandeja del sistema con menú "Mostrar / Reiniciar / Salir"
- [x] Auto-start configurable se activa al login del OS
- [x] `mode=client` y `mode=standalone` usan cierre normal (sin diálogo)

### 10.2. Robustez
- [x] Flag `forceQuit` evita loops infinitos de `preventDefault()`
- [x] `window-all-closed` NO termina la app si hay tray activo
- [x] `before-quit` intercepta Cmd+Q y otros orígenes de cierre
- [x] Single instance lock previene múltiples instancias
- [x] Referencia global a `tray` evita garbage collection

### 10.3. Documentación
- [x] Manual de usuario en `docs/TRAY-Y-CIERRE.md`
- [x] Checklist de QA manual en `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md`
- [x] Skill actualizada (`electron-bootstrap.md`)

### 10.4. Tests
- [x] Checklist de QA manual ejecutado y pasado
- [x] Verificado en al menos 2 plataformas (Windows + uno de macOS/Linux)

---

## 11. Notas Finales

### 11.1. Justificación de No Implementar en Este Plan

**Este es un documento de PLANIFICACIÓN exclusivamente.** No se implementa código de producto porque:

1. **Complejidad:** la feature toca áreas críticas (ciclo de vida de Electron, cierre de servidor)
2. **Riesgo:** bugs en esta área pueden causar:
   - Pérdida de datos (servidor se cierra sin avisar)
   - Múltiples instancias corriendo simultáneamente
   - Zombie processes (app no cierra nunca)
3. **Necesidad de revisión:** Gabriel debe aprobar:
   - La decisión de comportamiento por modo (server vs client/standalone)
   - El texto de las advertencias en los diálogos
   - La estrategia de iconos
4. **Testing exhaustivo:** requiere pruebas manuales en 3 plataformas × múltiples escenarios

### 11.2. Próximos Pasos (Post-Aprobación)

Una vez que Gabriel apruebe este plan:

1. **Crear issues/tareas** por cada fase en GitHub (opcional)
2. **Implementar fase por fase**, con commit al cerrar cada una
3. **Testing intermedio** entre fases (no esperar al final)
4. **Build empaquetado** al terminar FASE 6 (para probar iconos reales)
5. **QA completo** en FASE 8 antes de PR final

### 11.3. Estimación de Complejidad

- **Código nuevo:** ~400-600 líneas (3 archivos nuevos + modificaciones a main.ts)
- **Complejidad:** MEDIA-ALTA (APIs de Electron específicas, comportamiento cross-platform)
- **Testing:** ALTA (requiere pruebas manuales extensivas en 3 plataformas)

---

## Fin del Plan

**Path del plan:** `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`  
**Branch:** `cursor/tray-autostart-close-dialog-f834`  
**Estado:** ✅ Listo para revisión de Gabriel
