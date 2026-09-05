# AUDITORÍA EJE 3: TESTS / PODER DISCRIMINANTE — TRAY + CLOSE DIALOG

**Auditor:** Cloud Agent (Claude Sonnet 4.5)  
**Fecha:** 2026-09-05  
**Rama:** `cursor/tray-autostart-close-dialog-f834`  
**HEAD:** `24b75e3b` ("feat(autostart): configurar auto-start al login del sistema (FASE 4)")  
**PR:** #289 (draft)  
**Plan:** `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`

---

## 1. RESUMEN EJECUTIVO

### 1.1. Veredicto General

**🟡 COBERTURA INSUFICIENTE** — la feature carece de **toda protección automatizada**.

| Dimensión | Estado | Razón |
|-----------|--------|-------|
| **Tests unitarios** | ❌ **Cero** | No existen para código Electron main process |
| **Tests E2E** | ❌ **No cubren la feature** | El único E2E (`window-chrome.spec.ts`) verifica zoom/fullscreen, no tray/cierre |
| **Checklist manual (FASE 8)** | ⚠️ **Planificado pero NO ejecutado** | El plan lo define; el PR no incluye el checklist escrito ni evidencia de pruebas |
| **Poder discriminante** | ❌ **Nulo** | Sin tests automatizados, **todos los escenarios críticos quedarían sin detectar** |

**Riesgos sin cobertura:**
- ✅ **FASE 8 del plan define los escenarios** → el plan NO está mal
- ❌ **Cero tests automatizados** → el CI no detectaría regresiones
- ❌ **Checklist manual planificado pero no ejecutado** → el PR no incluye `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md` ni evidencia de haber corrido las pruebas

---

## 2. ALCANCE DEL DIFF PRODUCTO (SCOPE)

Código modificado en `cursor/tray-autostart-close-dialog-f834`:

```
electron/utils/app-settings.utils.ts      (+39 líneas)  — schema de windowBehavior
electron/utils/auto-start-manager.ts      (+52 líneas)  — nuevo: setAutoStart()
electron/utils/tray-manager.ts            (+196 líneas) — nuevo: createTray(), destroyTray()
electron/utils/window-close-dialog.ts     (+88 líneas)  — nuevo: showCloseDialog()
main.ts                                   (+321 líneas) — win.on('close'), before-quit, tray integration
```

**Total código producto:** ~696 líneas nuevas de lógica crítica de ciclo de vida Electron.

---

## 3. ANÁLISIS POR RIESGO — ¿QUÉ PUEDE ROMPERSE?

### 3.1. Riesgos Críticos (IMPACTO ALTO)

#### R1: Server se cierra cuando debería seguir corriendo

**Escenario:**
- Usuario cierra ventana (X) en `mode=server`
- **Esperado:** ventana se oculta, Fastify sigue en puerto 7070
- **Roto si:** `window-all-closed` llama `app.quit()` sin verificar `isTrayActive()`

**Líneas críticas:**
```typescript:main.ts:685:692
app.on('window-all-closed', () => {
  if (isTrayActive()) {
    console.log('[window] Todas las ventanas cerradas, pero tray activo — app sigue en segundo plano');
    return;  // ← CRÍTICO: si esta línea se elimina, el server se cierra
  }
  // ... comportamiento legacy ...
});
```

**¿Cómo fallaría un test?**
- E2E: cerrar ventana → `curl http://localhost:7070/api/health` → debería devolver 200, pero devolvería ECONNREFUSED

**¿Existe ese test?** ❌ **NO**

---

#### R2: Minimizar deja `quitRequested=true`, bloqueando el siguiente cierre

**Escenario:**
- Usuario cierra ventana → elige "Minimizar"
- Ventana se oculta correctamente
- Usuario cierra ventana de nuevo (desde tray → "Mostrar" → X)
- **Esperado:** diálogo aparece de nuevo
- **Roto si:** `quitRequested` quedó `true` y no se reseteó

**Líneas críticas:**
```typescript:main.ts:470:474
if (quitRequested) {
  console.log('[window] close: quitRequested=true, evitando diálogo duplicado');
  return;  // ← Si quitRequested nunca se resetea a false, este guard bloquea todo
}
```

**Correctivo implementado:**
```typescript:main.ts:556:558
case 'minimize':
  win?.hide();
  quitRequested = false;  // ← CRÍTICO: sin esto, el segundo cierre falla
```

**¿Cómo fallaría un test?**
- E2E: cerrar → minimizar → mostrar → cerrar → verificar que aparece diálogo (2da vez)
- **Esperado:** diálogo aparece
- **Roto:** ventana se cierra sin diálogo

**¿Existe ese test?** ❌ **NO**

---

#### R3: Reinicio no espera `stopServer()` → corrupción de DB o puerto ocupado

**Escenario:**
- Usuario elige "Reiniciar" desde diálogo
- **Esperado:** `app.relaunch()` se llama DESPUÉS de cerrar Fastify y DB
- **Roto si:** el `await` de `stopServer()` se elimina

**Líneas críticas:**
```typescript:main.ts:560:567
case 'restart':
  console.log('[window] acción: reiniciar');
  await stopServer().catch((e) => console.error('[window] stopServer error:', e));
  //^^^^^ CRÍTICO: sin await, app.relaunch() arranca mientras Fastify sigue vivo
  forceQuit = true;
  app.relaunch();
  app.quit();
  break;
```

**Consecuencias de fallo:**
- Nueva instancia intenta bindearse a puerto 7070 → `EADDRINUSE`
- DB SQLite aún en uso → `SQLITE_BUSY` o lock timeout
- **Symptoma:** app reabre pero crashea al arrancar el server

**¿Cómo fallaría un test?**
- E2E: cerrar → reiniciar → verificar log de la nueva instancia → debería arrancar sin errores

**¿Existe ese test?** ❌ **NO**

---

#### R4: Single instance lock falla → dos servers en mismo puerto

**Escenario:**
- Usuario hace doble-click en `.exe` mientras app está minimizada a tray
- **Esperado:** segunda instancia se cierra, primera se enfoca
- **Roto si:** `app.requestSingleInstanceLock()` devuelve `true` para ambas (race condition)

**Líneas críticas:**
```typescript:main.ts:610:624
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[single-instance] Ya hay una instancia corriendo. Cerrando esta instancia.');
  app.quit();  // ← Sin esto, ambas instancias arrancan
} else {
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });
}
```

**¿Cómo fallaría un test?**
- E2E: arrancar app → esperar a que esté lista → lanzar segunda instancia → verificar que la segunda termina en <1s

**¿Existe ese test?** ❌ **NO**

---

### 3.2. Riesgos Medios (IMPACTO MEDIO)

#### R5: Persistencia de `closeAction` no funciona (checkbox sin efecto)

**Escenario:**
- Usuario marca "No volver a preguntar" + elige "Minimizar"
- **Esperado:** próximo cierre minimiza sin diálogo
- **Roto si:** `updateAppSettings()` falla silenciosamente (ej: permisos de escritura)

**Líneas críticas:**
```typescript:main.ts:536:550
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
  } catch (e) {
    console.error('[window] error persistiendo closeAction:', e);  // ← Solo log, no falla el flujo
  }
}
```

**¿Cómo fallaría un test?**
- Unit test: llamar con `dontAskAgain=true` → verificar que `app-settings.json` tiene `closeAction: 'minimize'`
- E2E: marcar checkbox → cerrar → reabrir app → cerrar de nuevo → verificar que NO aparece diálogo

**¿Existe ese test?** ❌ **NO**

---

#### R6: Auto-start no se configura en `mode=server`

**Escenario:**
- Usuario modifica `app-settings.json`: `windowBehavior.autoStart = true`
- **Esperado:** `setAutoStart(true, false)` se llama al arrancar
- **Roto si:** el bloque en `app.on('ready')` no ejecuta en mode=server

**Líneas críticas:**
```typescript:main.ts:640:645
if (settings.mode === 'server') {
  const autoStart = settings.windowBehavior?.autoStart ?? false;
  const startMinimized = settings.windowBehavior?.startMinimized ?? false;
  setAutoStart(autoStart, startMinimized);
  console.log(`[auto-start] configurado: autoStart=${autoStart}, startMinimized=${startMinimized}`);
```

**¿Cómo fallaría un test?**
- Unit test: mock `app.setLoginItemSettings` → verificar que se llama con `{ openAtLogin: true }`
- E2E: arrancar con settings → reiniciar OS → verificar que app arranca (IMPOSIBLE en CI cloud)

**¿Existe ese test?** ❌ **NO** (y el E2E es impracticable en CI)

---

#### R7: Tray no se destruye al salir → ghost icon en Windows

**Escenario:**
- Usuario elige "Cerrar completamente"
- **Esperado:** tray icon desaparece de la bandeja
- **Roto si:** `destroyTray()` no se llama en `before-quit`

**Líneas críticas:**
```typescript:main.ts:708:710
if (forceQuit || quitRequested) {
  destroyTray();  // ← CRÍTICO: sin esto, el ícono persiste en la bandeja
  await stopServer().catch(() => {});
```

**¿Cómo fallaría un test?**
- E2E: cerrar app → verificar que `tray.isDestroyed() === true`

**¿Existe ese test?** ❌ **NO**

---

#### R8: `mode=client` muestra diálogo cuando no debería

**Escenario:**
- App arranca en `mode=client` (sin server local)
- Usuario cierra ventana (X)
- **Esperado:** app termina sin diálogo (comportamiento legacy)
- **Roto si:** el guard de `settings.mode !== 'server'` falla

**Líneas críticas:**
```typescript:main.ts:491:497
if (settings.mode !== 'server' || !isTrayActive()) {
  console.log(`[window] close: mode=${settings.mode}, sin tray → cerrar normal`);
  forceQuit = true;
  win?.close();
  return;
}
```

**¿Cómo fallaría un test?**
- E2E: arrancar con `mode=client` → cerrar ventana → verificar que NO aparece diálogo y app termina

**¿Existe ese test?** ❌ **NO**

---

### 3.3. Riesgos Bajos (IMPACTO BAJO)

#### R9: Icono de tray no carga → menú contextual funciona pero sin ícono visible

**Escenario:**
- `resolveTrayIconPath()` no encuentra ningún ícono
- **Esperado:** tray se crea igual (sin ícono visual)
- **Roto si:** `new Tray(undefined)` lanza excepción

**Líneas críticas:**
```typescript:tray-manager.ts:213:217
const iconPath = resolveTrayIconPath();
if (!iconPath) {
  console.error('[tray] No se pudo crear el tray: no hay ícono disponible');
  return null;  // ← No se crea el tray, pero app sigue funcionando
}
```

**Impacto:** BAJO — app funciona, solo falta el ícono en la bandeja.

**¿Cómo fallaría un test?**
- Unit test: mock `fs.existsSync` → `false` para todos los paths → verificar que `createTray()` devuelve `null`

**¿Existe ese test?** ❌ **NO**

---

#### R10: `startMinimized` no oculta ventana si el timeout de 500ms es insuficiente

**Escenario:**
- `windowBehavior.startMinimized = true`
- **Esperado:** ventana arranca oculta (solo tray visible)
- **Roto si:** ventana se destruye antes del `setTimeout()` de 500ms

**Líneas críticas:**
```typescript:main.ts:663:670
if (startMinimized && tray) {
  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      win.hide();
      console.log('[auto-start] ventana oculta (startMinimized=true)');
    }
  }, 500);  // ← Hardcoded 500ms: ¿suficiente en máquinas lentas?
}
```

**¿Cómo fallaría un test?**
- E2E: arrancar con `startMinimized=true` → esperar 1s → verificar que `win.isVisible() === false`

**¿Existe ese test?** ❌ **NO**

---

## 4. COBERTURA DE TESTS EXISTENTE

### 4.1. Tests Unitarios

**Búsqueda en el repo:**
```bash
find . -name "*.spec.ts" -o -name "*.test.ts" | grep -E "(tray|window|auto-start)"
# Resultado: 0 archivos
```

```bash
grep -r "tray-manager\|window-close-dialog\|auto-start-manager" --include="*.spec.ts"
# Resultado: sin coincidencias
```

**Conclusión:** ❌ **Cero tests unitarios para los 3 módulos nuevos.**

---

### 4.2. Tests E2E (Playwright)

**Archivo existente:** `e2e/window-chrome.spec.ts`

**Cobertura actual:**
- ✅ Modo de controles del titlebar (native/none/custom)
- ✅ Zoom por pasos (`windowZoomStep()`)
- ✅ Persistencia de zoom en `app-settings.json`
- ✅ Pantalla completa (`windowToggleFullscreen()`)
- ✅ TitleBar overlay (Windows)

**¿Cubre tray/cierre?** ❌ **NO**

**Evidencia:**
```typescript:e2e/window-chrome.spec.ts:1:5
/**
 * E2E — chrome de la ventana frameless: botones, zoom, pantalla completa.
 * ...
 * Cubre lo que el unit test (`npm run test:window-chrome`) no puede:
 * que el zoom se aplique realmente al renderer...
 */
```

El test NO toca:
- `win.on('close')` — no intenta cerrar la ventana
- Tray icon — no verifica su existencia ni menú
- `before-quit` — no prueba Cmd+Q
- Auto-start — no verifica `app.setLoginItemSettings()`

**Conclusión:** ❌ **E2E existente no aporta cobertura a esta feature.**

---

### 4.3. Checklist Manual (FASE 8 del Plan)

**Planificado en el plan:**
```markdown:PLAN-TRAY-CLOSE-DIALOG.md:890:940
### FASE 8: Tests y QA

**Archivos:**
```
docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md   # Nuevo: manual de pruebas
```

**Checklist de Testing:**

#### 8.1. Tray Icon
- [ ] Ícono aparece en bandeja al iniciar (mode=server)
- [ ] Click derecho → menú con "Mostrar / Reiniciar / Salir"
- [ ] Doble-click en tray (Windows) → muestra ventana
...

#### 8.4. Auto-start
- [ ] Modificar `app-settings.json`: `windowBehavior.autoStart = true`
- [ ] Reiniciar sistema operativo
- [ ] App arranca automáticamente
...
```

**¿Existe el archivo `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md`?**

```bash
find docs/testing -name "*TRAY*" -o -name "*CLOSE*"
# Resultado: 0 archivos
```

**Conclusión:** ❌ **Checklist manual NO ejecutado** (el plan lo define, pero el PR no lo incluye).

---

## 5. GAPS DE COBERTURA — ¿QUÉ FALTA?

### 5.1. Tests Unitarios Viables

**Módulo:** `electron/utils/tray-manager.ts`

| Caso | Entrada | Esperado | Test actual | Gap |
|------|---------|----------|-------------|-----|
| Crear tray con ícono válido | `mode=server`, win, callback | `trayInstance !== null` | ❌ | **Falta** |
| Crear tray sin ícono | todos paths inválidos | `trayInstance === null` | ❌ | **Falta** |
| Destruir tray | `trayInstance` existente | `isDestroyed() === true` | ❌ | **Falta** |
| Update menu | nuevo callback | menú se actualiza | ❌ | **Falta** |

**Módulo:** `electron/utils/window-close-dialog.ts`

| Caso | Entrada | Esperado | Test actual | Gap |
|------|---------|----------|-------------|-----|
| Diálogo devuelve acción | usuario elige "Minimizar" | `{ action: 'minimize', dontAskAgain: false }` | ❌ | **Falta** |
| Checkbox marcado | usuario marca checkbox | `dontAskAgain: true` | ❌ | **Falta** |
| Confirmación extra | usuario confirma cierre | `true` | ❌ | **Falta** |
| Confirmación cancelada | usuario cancela | `false` | ❌ | **Falta** |

**Módulo:** `electron/utils/auto-start-manager.ts`

| Caso | Entrada | Esperado | Test actual | Gap |
|------|---------|----------|-------------|-----|
| Habilitar auto-start | `(true, false)` | `app.setLoginItemSettings({ openAtLogin: true })` | ❌ | **Falta** |
| Deshabilitar auto-start | `(false, false)` | `app.setLoginItemSettings({ openAtLogin: false })` | ❌ | **Falta** |
| Leer estado actual | — | `{ enabled: boolean }` | ❌ | **Falta** |

**¿Por qué no hay tests unitarios para main process?**

**Razón técnica:** El código de `main.ts` y utils de Electron dependen de:
- `app`, `BrowserWindow`, `Tray`, `dialog` — APIs de Electron que no corren en Node puro
- Instancia de `BrowserWindow` viva — no se puede mockear fácilmente

**Solución estándar:** usar **Spectron** (deprecated) o **Playwright for Electron** (actual).

**Estado en este repo:**
- ✅ Playwright instalado (`e2e/window-chrome.spec.ts` existe)
- ❌ No hay tests E2E para tray/cierre

---

### 5.2. Tests E2E Necesarios (Poder Discriminante)

**¿Qué tests E2E detectarían los riesgos críticos?**

| Riesgo | Test E2E | Complejidad | Prioridad |
|--------|----------|-------------|-----------|
| **R1** (server se cierra) | Cerrar ventana → curl 7070 → 200 | 🟢 BAJA | 🔴 **CRÍTICA** |
| **R2** (`quitRequested` bloqueado) | Cerrar → minimizar → mostrar → cerrar → verificar diálogo | 🟡 MEDIA | 🔴 **CRÍTICA** |
| **R3** (reinicio sin await) | Cerrar → reiniciar → verificar log sin EADDRINUSE | 🔴 ALTA | 🟠 ALTA |
| **R4** (single instance) | Arrancar 2da instancia → verificar que termina | 🟢 BAJA | 🟠 ALTA |
| **R5** (persistencia checkbox) | Marcar checkbox → reabrir → verificar comportamiento | 🟡 MEDIA | 🟡 MEDIA |
| **R8** (client muestra diálogo) | Arrancar en client → cerrar → verificar que termina | 🟢 BAJA | 🟡 MEDIA |

**Estimación de esfuerzo:**
- **Mínimo viable (R1, R2, R4):** ~150-200 líneas de código E2E
- **Cobertura completa (R1-R8):** ~400-500 líneas de código E2E

---

### 5.3. Checklist Manual como Gate QA

**¿El FASE 8 del plan basta como gate QA?**

**Contenido del checklist planificado:**
```markdown
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
```

**Análisis:**

| Aspecto | Cobertura del checklist | Limitación |
|---------|-------------------------|------------|
| **Escenarios funcionales** | ✅ **Excelente** — cubre todos los riesgos R1-R10 | Requiere ejecución manual |
| **Escenarios de error** | ⚠️ **Parcial** — no cubre race conditions ni edge cases | No verifica logs ni estado interno |
| **Plataformas** | ✅ **Completo** — Win/Mac/Linux | Impracticable en CI cloud |
| **Regresiones** | ❌ **Nulo** — sin tests automatizados, no detecta regresiones en PRs futuros | No es reproducible |

**Conclusión:** El checklist FASE 8 **es necesario pero NO suficiente** como único gate QA.

**Razones:**
1. **No es reproducible** — depende de que el revisor lo ejecute manualmente
2. **No es CI-friendly** — no puede correrse en GitHub Actions
3. **No es exhaustivo** — no verifica condiciones de carrera ni estado interno (ej: `quitRequested`)
4. **No previene regresiones** — un cambio futuro en `main.ts` puede romper R1-R8 y el CI no lo detectará

---

## 6. HALLAZGOS ESPECÍFICOS DEL DIFF

### 6.1. Race Condition: `quitRequested` sin lock

**Ubicación:** `main.ts:470-474`, `main.ts:529`

**Código:**
```typescript
let quitRequested = false;  // ← Variable global sin mutex

win.on('close', async (event) => {
  if (quitRequested) {
    console.log('[window] close: quitRequested=true, evitando diálogo duplicado');
    return;
  }
  // ...
  quitRequested = true;  // ← TOCTOU: si antes de esta línea se dispara otro 'close'...
```

**Escenario de fallo:**
1. Usuario hace **Cmd+Q** (dispara `before-quit`)
2. Mientras el diálogo está abierto, usuario hace **Alt+F4** (dispara `win.on('close')`)
3. Ambos handlers leen `quitRequested = false` (TOCTOU)
4. Ambos muestran el diálogo → **dos diálogos superpuestos**

**Probabilidad:** BAJA (requiere timing preciso), pero **POSIBLE**.

**Mitigación recomendada:**
```typescript
let quitInProgress = false;  // Renombrar para claridad

win.on('close', async (event) => {
  if (quitInProgress) return;
  event.preventDefault();
  quitInProgress = true;
  try {
    // ... mostrar diálogo ...
  } finally {
    quitInProgress = false;  // Solo resetear si no se forzó el quit
  }
});
```

**Impacto:** MEDIO — UX degradada (dos diálogos), pero no pierde datos.

**¿Lo detectaría un test?**
- Unit test: ❌ NO (requiere threading)
- E2E: ⚠️ **Solo con stress test** (disparar Cmd+Q + Alt+F4 en ráfaga)

---

### 6.2. Hardcoded Timeout: `startMinimized` espera 500ms

**Ubicación:** `main.ts:663-670`

**Código:**
```typescript
if (startMinimized && tray) {
  setTimeout(() => {
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  }, 500);  // ← Hardcoded: ¿qué pasa si la ventana tarda 600ms en ready?
}
```

**Escenario de fallo:**
- Máquina lenta (ej: Raspberry Pi con Electron)
- Ventana tarda >500ms en `did-finish-load`
- `win.hide()` se ejecuta ANTES de que la ventana sea visible
- **Síntoma:** ventana aparece brevemente y luego desaparece (flicker)

**Probabilidad:** BAJA en desktop moderno, MEDIA en hardware embebido.

**Mitigación recomendada:**
```typescript
if (startMinimized && tray) {
  win.once('ready-to-show', () => {
    win?.hide();  // ← Evento más robusto que timeout
  });
}
```

**Impacto:** BAJO — solo flicker visual, no pierde funcionalidad.

**¿Lo detectaría un test?**
- E2E: ⚠️ **Solo con throttling de CPU** (difícil de simular en CI)

---

### 6.3. Falta Rollback de `quitRequested` en Catch

**Ubicación:** `main.ts:584-588`

**Código:**
```typescript
try {
  const result = await showCloseDialog(win, settings.mode);
  // ... ejecutar acción ...
} catch (e) {
  console.error('[window] close: error en diálogo:', e);
  quitRequested = false;  // ← Bien: resetea el flag
}
```

**vs.**

```typescript:main.ts:516-524
if (closeAction === 'close') {
  quitRequested = true;
  const confirmed = await showFinalConfirmation(win);
  if (confirmed) {
    forceQuit = true;
    await stopServer().catch((e) => console.error('[window] stopServer error:', e));
    win?.close();
  } else {
    quitRequested = false;  // ← Aquí sí resetea
  }
  return;  // ← Pero si stopServer() lanza, el return no llega
}
```

**Escenario de fallo:**
1. Usuario elige "Cerrar completamente" → confirma
2. `stopServer()` lanza excepción (ej: Fastify ya cerrado)
3. `.catch()` swallow la excepción → `forceQuit` sigue `true`
4. `win?.close()` se ejecuta → ventana se cierra
5. **Pero si el usuario cancela en el siguiente intento, `quitRequested` sigue `true`**

**Probabilidad:** BAJA (requiere que `stopServer()` falle), pero **POSIBLE**.

**Mitigación recomendada:**
```typescript
if (closeAction === 'close') {
  quitRequested = true;
  const confirmed = await showFinalConfirmation(win);
  if (!confirmed) {
    quitRequested = false;
    return;
  }
  try {
    await stopServer();
    forceQuit = true;
    win?.close();
  } catch (e) {
    console.error('[window] stopServer error:', e);
    quitRequested = false;  // ← Rollback si falla
    forceQuit = false;
  }
}
```

**Impacto:** MEDIO — deja la app en estado inconsistente (quit bloqueado).

**¿Lo detectaría un test?**
- Unit test: ✅ **Sí** (mockear `stopServer()` para que lance)
- E2E: ❌ NO (no puede inyectar fallos en Fastify)

---

### 6.4. Falta Validación: `mode` puede ser `undefined` si settings corruptos

**Ubicación:** `main.ts:481-489`

**Código:**
```typescript
let settings;
try {
  settings = readAppSettings(app.getPath('userData'));
} catch (e) {
  console.error('[window] close: error leyendo settings:', e);
  forceQuit = true;
  win?.close();
  return;
}

// ... luego ...
if (settings.mode !== 'server' || !isTrayActive()) {
  //          ^^^^ Si readAppSettings devuelve algo sin `mode`, esto falla
```

**Escenario de fallo:**
- `app-settings.json` corrupto (ej: JSON inválido, o `mode: null`)
- `readAppSettings()` devuelve `DEFAULT_APP_SETTINGS` (que SÍ tiene `mode`)
- **Pero si el deepMerge falla,** `settings` puede tener `mode: undefined`

**Probabilidad:** MUY BAJA (solo si `deepMerge()` tiene un bug).

**Mitigación recomendada:**
```typescript
if (!settings || !settings.mode) {
  console.error('[window] close: settings inválidos, cerrando normal');
  forceQuit = true;
  win?.close();
  return;
}
```

**Impacto:** BAJO — app se cierra, pero es el comportamiento de fallback correcto.

**¿Lo detectaría un test?**
- Unit test: ✅ **Sí** (mockear `readAppSettings()` para devolver objeto sin `mode`)

---

## 7. RECOMENDACIONES

### 7.1. Cobertura Mínima Viable (MVP)

**Para que el PR sea mergeable:**

#### Opción A: Tests E2E (Recomendado)

Agregar `e2e/tray-close.spec.ts` con **3 tests críticos** (~150 líneas):

```typescript
import { test, expect } from '@playwright/test';

test('R1: cerrar ventana en mode=server mantiene Fastify corriendo', async () => {
  // 1. Arrancar app en mode=server
  // 2. Esperar a que Fastify esté en puerto 7070
  // 3. Cerrar ventana (elige "Minimizar" en diálogo)
  // 4. Verificar: curl http://localhost:7070/api/health → 200
  // 5. Verificar: ventana no visible pero tray activo
});

test('R2: minimizar + reabrir + cerrar no bloquea diálogo', async () => {
  // 1. Arrancar app
  // 2. Cerrar ventana → elige "Minimizar"
  // 3. Desde tray → "Mostrar"
  // 4. Cerrar ventana de nuevo
  // 5. Verificar: diálogo aparece (2da vez)
});

test('R4: segunda instancia se cierra, primera se enfoca', async () => {
  // 1. Arrancar app
  // 2. Lanzar segunda instancia (mismo executable)
  // 3. Esperar 2s
  // 4. Verificar: solo 1 proceso Electron corriendo
  // 5. Verificar: ventana de la primera instancia está enfocada
});
```

**Esfuerzo estimado:** 4-6 horas (incluyendo setup de fixtures).

---

#### Opción B: Checklist Manual Ejecutado (Más Rápido)

Si los tests E2E son impracticables:

1. **Escribir `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md`** con el contenido del plan FASE 8
2. **Ejecutar el checklist en las 3 plataformas** (Windows + al menos 1 de Mac/Linux)
3. **Documentar resultados** en el checklist:
   ```markdown
   - [x] Ícono aparece en bandeja al iniciar (mode=server)
         ✅ Probado en Windows 11 — OK
         ✅ Probado en Ubuntu 22.04 — OK
   ```
4. **Agregar screenshots** de:
   - Tray icon en la bandeja
   - Diálogo de cierre con las 3 opciones
   - Confirmación extra al cerrar

**Esfuerzo estimado:** 2-3 horas.

**Limitación:** No previene regresiones futuras (siguiente PR puede romper sin detectar).

---

### 7.2. Cobertura Ideal (Largo Plazo)

**Para proteger la feature de regresiones:**

1. **Tests E2E completos** (400-500 líneas):
   - Cubrir R1-R8 (todos los riesgos críticos + medios)
   - Agregar stress test para race condition de `quitRequested`
   - Verificar persistencia de `closeAction` tras reinicio

2. **Tests unitarios para utils** (~300 líneas):
   - `tray-manager.spec.ts`: createTray, destroyTray, updateTrayMenu
   - `window-close-dialog.spec.ts`: showCloseDialog, showFinalConfirmation
   - `auto-start-manager.spec.ts`: setAutoStart, getAutoStartStatus

3. **Integration test de `main.ts`** (opcional, ~200 líneas):
   - Mockear Electron APIs (`app`, `BrowserWindow`, `Tray`)
   - Verificar flujo completo de `win.on('close')` + `before-quit`

**Esfuerzo total:** 10-15 horas.

---

### 7.3. Fixes Recomendados (Hallazgos 6.1-6.4)

**Prioridad ALTA:**
1. ✅ **6.1 (Race condition `quitRequested`)** — agregar lock o renombrar + clarificar semántica
2. ⚠️ **6.3 (Rollback de `quitRequested` en catch)** — agregar try/catch en `closeAction === 'close'`

**Prioridad BAJA:**
3. ⚠️ **6.2 (Hardcoded timeout)** — reemplazar por `win.once('ready-to-show')`
4. ✅ **6.4 (Validación de `mode`)** — agregar guard para `!settings.mode`

**Esfuerzo:** 30-60 minutos.

---

## 8. VEREDICTO FINAL

### 8.1. Resumen de Gaps

| Categoría | Estado | Impacto en Regresión | Recomendación |
|-----------|--------|---------------------|---------------|
| **Tests unitarios** | ❌ Cero | NULO | 🟡 Nice-to-have (largo plazo) |
| **Tests E2E** | ❌ Cero | NULO | 🔴 **Bloqueante** (MVP: 3 tests) |
| **Checklist manual** | ❌ No ejecutado | BAJO | 🟠 Requerido (si no E2E) |
| **Fixes de hallazgos** | ⚠️ 2 prioridad ALTA | MEDIO | 🔴 **Bloqueante** |

---

### 8.2. ¿El Plan FASE 8 Basta como Gate QA?

**NO**, por las siguientes razones:

1. **El checklist NO está ejecutado** — el PR no incluye el archivo `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md` ni evidencia de pruebas
2. **Sin tests automatizados, el CI no detecta regresiones** — un cambio futuro en `main.ts` puede romper R1-R8 sin alertas
3. **Hallazgos 6.1 y 6.3 son bugs latentes** — requieren fixes antes de merge

**Pero:** el plan FASE 8 **define correctamente los escenarios críticos** — solo falta ejecutarlo.

---

### 8.3. Recomendación para Este PR

**Antes de merge:**

- [ ] **Escribir y ejecutar `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md`**
  - Mínimo: Windows + 1 plataforma adicional (Mac o Linux)
  - Documentar resultados y agregar screenshots
- [ ] **Agregar 3 tests E2E mínimos** (`e2e/tray-close.spec.ts`)
  - R1: server sigue corriendo al minimizar
  - R2: diálogo no se bloquea tras minimizar
  - R4: single instance lock funciona
- [ ] **Aplicar fixes de hallazgos 6.1 y 6.3**
  - Lock para `quitRequested`
  - Rollback en catch de `stopServer()`

**Esfuerzo total:** 6-8 horas.

**Alternativa rápida (si deadline apretado):**
- [ ] Ejecutar checklist manual con screenshots
- [ ] Aplicar fixes de hallazgos
- [ ] Mergear con label `needs-tests`
- [ ] Abrir issue de seguimiento para agregar E2E

---

### 8.4. Poder Discriminante Actual

**¿Los tests fallarían si se rompe el comportamiento?**

| Riesgo | Severidad | Test actual que detecta | Poder discriminante |
|--------|-----------|------------------------|---------------------|
| **R1** (server se cierra) | 🔴 CRÍTICA | ❌ Ninguno | **0%** |
| **R2** (quit bloqueado) | 🔴 CRÍTICA | ❌ Ninguno | **0%** |
| **R3** (reinicio sin await) | 🟠 ALTA | ❌ Ninguno | **0%** |
| **R4** (single instance) | 🟠 ALTA | ❌ Ninguno | **0%** |
| **R5** (persistencia) | 🟡 MEDIA | ❌ Ninguno | **0%** |
| **R6** (auto-start) | 🟡 MEDIA | ❌ Ninguno | **0%** |
| **R7** (tray no destruye) | 🟡 MEDIA | ❌ Ninguno | **0%** |
| **R8** (client con diálogo) | 🟡 MEDIA | ❌ Ninguno | **0%** |
| **R9** (ícono no carga) | 🟢 BAJA | ❌ Ninguno | **0%** |
| **R10** (timeout 500ms) | 🟢 BAJA | ❌ Ninguno | **0%** |

**PODER DISCRIMINANTE ACTUAL: 0/10 riesgos cubiertos = 0%**

---

## 9. CONCLUSIÓN

**La feature está implementada correctamente (según auditorías previas A y B), pero carece de toda protección contra regresiones.**

**El plan FASE 8 es excelente** — define todos los escenarios críticos que deben probarse.

**El problema:** FASE 8 nunca se ejecutó.

**Acción requerida antes de merge:**
1. Ejecutar checklist manual + documentar resultados
2. Agregar 3 tests E2E mínimos (R1, R2, R4)
3. Aplicar fixes de hallazgos 6.1 y 6.3

**Sin esto, el PR es funcional pero frágil** — cualquier refactor futuro de `main.ts` puede romper silenciosamente R1-R8.

---

**Firma:** Cloud Agent  
**Timestamp:** 2026-09-05 13:52 UTC
