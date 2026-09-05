# AUDITORÍA EJE A: PLAN-TRAY-CLOSE-DIALOG

**Auditor:** Claude Sonnet 4.5  
**Fecha:** 2026-09-05  
**Rama:** `cursor/tray-autostart-close-dialog-f834`  
**PR:** #289 (draft)  
**Plan auditado:** `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`

---

## EJE A: ALCANCE Y CONVENCIONES

### 1. COHERENCIA DE FASES Y COMMITS

#### 1.1. Estructura General de Fases

El plan define **9 fases** con un commit por fase:

| Fase | Objetivo | Archivos tocados | Commit convencional |
|------|----------|------------------|---------------------|
| F1 | Extender app-settings + tray básico | `app-settings.utils.ts`, `tray-manager.ts` (nuevo), `main.ts` | `feat(tray): agregar tray icon básico en mode=server` |
| F2 | Interceptar cierre + minimizar | `main.ts` | `feat(tray): minimizar a bandeja al cerrar ventana (mode=server)` |
| F3 | Diálogo con 3 opciones | `window-close-dialog.ts` (nuevo), `main.ts` | `feat(window): agregar diálogo de cierre con 3 opciones` |
| F4 | Auto-start | `auto-start-manager.ts` (nuevo), `main.ts` | `feat(autostart): configurar auto-start al login del sistema` |
| F5 | Diferenciar comportamiento por modo | `main.ts` | `feat(window): comportamiento de cierre diferenciado por modo` |
| F6 | Iconos optimizados por plataforma | `build/tray/*` (nuevos), `tray-manager.ts` | `feat(tray): agregar iconos optimizados por plataforma` |
| F7 | Cmd+Q y otros orígenes de cierre | `main.ts` | `fix(quit): interceptar Cmd+Q y otros orígenes de cierre` |
| F8 | Tests y QA | `TESTING-CHECKLIST-TRAY-CLOSE.md` (nuevo) | `test(tray): agregar checklist de QA manual` |
| F9 | Documentación | `TRAY-Y-CIERRE.md` (nuevo), `electron-bootstrap.md` | `docs(tray): agregar documentación de tray icon y cierre` |

**✅ COHERENCIA:** Las fases están **bien estructuradas** y progresan lógicamente:
- F1–F2: tray + minimizar básico
- F3: UI del diálogo
- F4: auto-start
- F5: diferenciación por modo
- F6: assets cross-platform
- F7: edge cases
- F8–F9: QA + documentación

#### 1.2. Alcance de Archivos Modificados

**Archivos de producto:**
- `electron/utils/app-settings.utils.ts` — ✅ settings (alcance correcto)
- `electron/utils/tray-manager.ts` — ✅ nuevo (alcance correcto)
- `electron/utils/auto-start-manager.ts` — ✅ nuevo (alcance correcto)
- `electron/utils/window-close-dialog.ts` — ✅ nuevo (alcance correcto)
- `main.ts` — ✅ bootstrap (alcance correcto)
- `build/tray/` — ✅ assets (alcance correcto)

**Archivos de documentación:**
- `docs/TRAY-Y-CIERRE.md` — ✅ nuevo
- `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md` — ✅ nuevo
- `.claude/skills/frc-gourmet-expert/architecture/electron-bootstrap.md` — ✅ actualización

**✅ ALCANCE RESTRINGIDO:** El plan **NO toca de más**. Se limita a:
- Main process (`main.ts` + utils nuevos)
- Settings (solo el backend, NO UI Angular)
- Assets (iconos de tray)
- Docs

**NO toca:**
- Frontend Angular (excepto docs)
- Handlers IPC (salvo `window:*` que ya están registrados)
- Base de datos (ni entities ni migrations)
- Preload (no necesario)

#### 1.3. ⚠️ POSIBLE SOLAPAMIENTO: Handlers `window:*`

El plan menciona en FASE 7 (§5.3.3, línea 484+) la necesidad de modificar `window-all-closed` para **NO llamar `app.quit()` si hay tray activo**.

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

**⚠️ AMBIGÜEDAD — ¿Qué fase modifica `window-all-closed`?**

El plan menciona este cambio en §5.3.3 ("Modificar window-all-closed"), que **NO está asignado a ninguna fase** en la sección 7 (Fases de Implementación).

**RECOMENDACIÓN:** Mover este cambio a **FASE 2** (Interceptar cierre + minimizar a tray), ya que es parte del flujo básico de minimizar sin terminar la app.

**✅ Checklist F2 ya lo incluye** (línea 663): "Modificar `app.on('window-all-closed')`: Si `tray` existe, NO llamar `app.quit()`".

**VEREDICTO:** Coherencia OK, pero la referencia §5.3.3 está fuera de fase — es redundancia documental, no un problema.

---

### 2. DOCUMENTACIÓN Y TESTS EN FASES PROPIAS

#### 2.1. FASE 8: Tests y QA

✅ **Fase dedicada exclusivamente a testing manual.**

- Archivo: `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md` (nuevo)
- Alcance:
  - 8.1 Tray Icon (3 checks)
  - 8.2 Cierre de Ventana (5 checks × 5 modos = 25 escenarios)
  - 8.3 Reinicio (3 checks)
  - 8.4 Auto-start (5 checks)
  - 8.5 Múltiples Instancias (1 check)
  - 8.6 Limpieza al Salir (3 checks)
  - 8.7 Plataformas (3 checks: Windows/macOS/Linux)

**Total: ~43 escenarios de prueba manual.**

**✅ ALCANCE CORRECTO:** No hay tests unitarios en el plan porque:
- La feature es **99% integración Electron ↔ OS** (tray API, auto-start, ciclo de vida)
- Testing unitario de Electron APIs es artificioso (requiere mocks de toda la API del OS)
- El manual de QA cubre los escenarios críticos

**Commit:** `test(tray): agregar checklist de QA manual` — ✅ **tipo correcto** (`test:`).

#### 2.2. FASE 9: Documentación

✅ **Fase dedicada exclusivamente a documentación.**

Archivos:
- `docs/TRAY-Y-CIERRE.md` — ✅ nuevo (guía de usuario)
- `docs/testing/TESTING-CHECKLIST-TRAY-CLOSE.md` — ✅ ya creado en F8
- `.claude/skills/frc-gourmet-expert/architecture/electron-bootstrap.md` — ✅ actualización

**Contenido propuesto:**
- Explicar el tray icon y su propósito
- Describir las 3 opciones del diálogo de cierre
- Documentar auto-start y cómo configurarlo
- Limitaciones por plataforma (macOS firma, Linux DE)
- Screenshots del tray y del diálogo

**✅ ALCANCE COMPLETO:** Cubre:
- Usuario final (`TRAY-Y-CIERRE.md`)
- Desarrollador (skill `electron-bootstrap.md`)
- QA (checklist manual)

**Commit:** `docs(tray): agregar documentación de tray icon y cierre` — ✅ **tipo correcto** (`docs:`).

---

### 3. REINICIO DE APP Y MIGRACIÓN BD

#### 3.1. ¿Requiere Reinicio de la App?

**SÍ**, cambios en:
- `main.ts` — ✅ main process
- `electron/utils/*.ts` (nuevos) — ✅ main process
- `build/tray/*` (iconos) — ⚠️ assets (requieren rebuild, no hot-reload)

**✅ PLAN LO ANOTA CORRECTAMENTE:**

Sección 2.7 (Consideraciones de Reinicio):
> "**Hot-reload vs Restart completo:**  
> Cambios en **main.ts, preload.ts, handlers, entities** requieren **reinicio completo** de Electron"

Sección 5.3.2 (Diálogo de cierre):
> **Advertencia necesaria:**  
> "Reiniciar cerrará temporalmente el servidor. Las cajas y dispositivos conectados perderán conexión durante ~10 segundos."

**✅ CORRECTO:** El plan reconoce que reiniciar impacta a clientes conectados y lo documenta en el diálogo.

**Comando de verificación mencionado:**
```bash
npm run build  # Compila Electron TS + Angular
```

**✅ PRESENTE EN CHECKLISTS:**
- F1 (línea 636): "Build: `npm run build`"
- F6 (línea 841): "Build: `npm run electron:build` (empaquetado completo)"

#### 3.2. ¿Requiere Migración de BD?

**NO.**

**✅ PLAN LO JUSTIFICA CORRECTAMENTE** (§2.8, líneas 274–301):

**Razones documentadas:**
1. **`app-settings.json` NO es una tabla de base de datos:**
   - Es un archivo JSON en `userData/`
   - No pasa por TypeORM ni por el sistema de migraciones

2. **Backward compatibility built-in:**
   ```typescript
   export function readAppSettings(userDataPath: string): AppSettings {
     const p = getAppSettingsPath(userDataPath);
     if (!fs.existsSync(p)) return cloneDefaults();
     try {
       const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
       return deepMerge(DEFAULT_APP_SETTINGS, raw);  // ← merge con defaults
     } catch (e) {
       console.warn('[app-settings] no se pudo leer, usando defaults:', e);
       return cloneDefaults();
     }
   }
   ```
   - Si el JSON viejo no tiene `windowBehavior`, el `deepMerge` usa el default
   - **No hay caso de rotura**

3. **Precedente:**
   - Todas las expansiones previas de `AppSettings` (ej: `musica`, `backup`, `ui.zoomFactor`) se hicieron sin migración

**✅ CONCLUSIÓN DEL PLAN:**
> "Agregar `windowBehavior?: WindowBehaviorSettings` a `AppSettings` es safe y no requiere migración."

**✅ VEREDICTO:** Justificación sólida. Agregar campos opcionales a un JSON con merge de defaults es una expansión compatible por diseño.

---

### 4. AMBIGÜEDADES: DECISIONES vs PREGUNTAS

El plan incluye una sección dedicada: **§9. Preguntas Abiertas / Decisiones Pendientes** (líneas 990–1054).

#### 4.1. PREGUNTA 1: ¿UI para Configurar Auto-start?

**Opciones:**
- **A)** Solo vía `app-settings.json` manual (menos trabajo, usuarios avanzados)
- **B)** Pantalla en *Configuración → Sistema → Ventana y bandeja* con toggles

**✅ PLAN TOMA DECISIÓN:**
> "**Recomendación:** Opción A para este plan (solo backend). La UI puede agregarse en una iteración futura."

**Justificación:**
- La feature es mayormente de backend (main.ts, Electron APIs)
- Los settings ya son accesibles vía JSON para usuarios avanzados
- La UI puede agregarse después sin modificar el backend

**VEREDICTO:** ✅ **Decisión tomada**, no queda ambigua. Se deja fuera del alcance explícitamente.

#### 4.2. PREGUNTA 2: ¿Notificación al Minimizar?

**Opciones:**
- **A)** Notificación nativa del OS (`new Notification(...)`)
- **B)** Toast dentro de Angular
- **C)** Sin notificación (solo tooltip del tray)

**✅ PLAN TOMA DECISIÓN:**
> "**Recomendación:** Opción C (sin notificación) + tooltip claro en el tray."

**Justificación:**
- El usuario VIO el diálogo (si eligió "Minimizar") o configuró explícitamente que minimice
- El tray icon es suficientemente visible
- Evita spam de notificaciones

**VEREDICTO:** ✅ **Decisión tomada**, no queda ambigua.

#### 4.3. PREGUNTA 3: ¿Icono Distintivo según Estado del Servidor?

**Opciones:**
- **A)** Un solo ícono (logo de FRC Gourmet)
- **B)** Dos íconos: Verde/Normal (servidor activo) vs Rojo/Warning (error)

**✅ PLAN TOMA DECISIÓN:**
> "**Recomendación:** Opción A (un solo ícono) para este plan."

**Justificación:**
- La feature ya es compleja; agregar estado dinámico incrementa scope
- Si Fastify no arranca, el usuario lo nota porque las cajas no funcionan
- Puede agregarse en el futuro si se solicita

**VEREDICTO:** ✅ **Decisión tomada**, no queda ambigua.

#### 4.4. ⚠️ AMBIGÜEDAD DETECTADA: Comportamiento en `mode=client` / `standalone`

**§3.2 (Recomendación de Implementación):**

> **Opción A (Conservadora — RECOMENDADA):**
> - **`mode=server`:** flujo completo (tray + diálogo con advertencia + 3 opciones)
> - **`mode=client` y `standalone`:** comportamiento legacy (cierre normal) O minimizar a tray directamente sin diálogo

**PROBLEMA:** La frase "comportamiento legacy (cierre normal) **O** minimizar a tray" introduce dos caminos posibles sin decidir cuál.

**FASE 5 dice:**
> "- [ ] Refactorizar lógica de creación de tray:
>   - [ ] Si `mode === 'server'`: crear tray siempre
>   - [ ] Si `mode === 'client'` o `'standalone'`:
>     - [ ] **Opción A (conservadora): NO crear tray, comportamiento legacy**
>     - [ ] Opción B: crear tray opcional si `windowBehavior.showTray = true` (agregar campo)"

**⚠️ AMBIGÜEDAD:** El plan lista **dos opciones en el checklist de F5** sin marcar cuál se implementa.

**RECOMENDACIÓN:**
1. **Decisión para Gabriel:** ¿Se implementa solo Opción A (sin tray en client/standalone), o se agrega soporte opcional para tray en esos modos (Opción B)?
2. **Si es Opción A:** el checklist de F5 debe decir claramente "Implementar Opción A: NO crear tray en client/standalone".
3. **Si es Opción B:** agregar `windowBehavior.showTray?: boolean` al schema (§4) y documentar el comportamiento.

**VEREDICTO:** ⚠️ **AMBIGÜEDAD LEVE** — requiere aclaración antes de implementar FASE 5.

---

### 5. RIESGOS Y JUSTIFICACIONES

#### 5.1. RIESGOS IDENTIFICADOS (§6)

El plan incluye una tabla de riesgos con mitigaciones:

| Riesgo | Impacto | Probabilidad | Mitigación |
|--------|---------|--------------|------------|
| **Usuario cree que cerró la app, pero el server sigue corriendo** | MEDIO | ALTA | Notificación al minimizar + ícono visible en tray + tooltip |
| **Doble instancia al auto-start** | ALTO | MEDIA | `app.requestSingleInstanceLock()` (ya implementado) |
| **En macOS, ícono del dock NO desaparece** | BAJO | ALTA | Comportamiento esperado; documentar |
| **Botón "Cerrar" cierra el server sin querer** | ALTO | MEDIA | Confirmación extra con mensaje explícito |
| **Quit desde menú de macOS (Cmd+Q) bypasea el diálogo** | MEDIO | MEDIA | Interceptar `app.on('before-quit')` (FASE 7) |
| **Auto-start no funciona en macOS sin firma** | BAJO | ALTA (en dev) | Documentar limitación; funciona en prod firmados |
| **Linux: diferentes DE manejan tray distinto** | MEDIO | MEDIA | Probar en Ubuntu (GNOME) y Mint (Cinnamon) |

**✅ RIESGOS BIEN IDENTIFICADOS:**
- Cubren **UX** (usuario confundido), **integridad** (doble instancia, cierre accidental), **plataforma** (macOS, Linux)
- Cada uno tiene mitigación documentada
- Impacto y probabilidad realistas

#### 5.2. JUSTIFICACIONES TÉCNICAS (§11.1)

**¿Por qué NO implementar en este plan?**

El plan justifica por qué es **solo planificación**:

1. **Complejidad:** toca áreas críticas (ciclo de vida de Electron, cierre de servidor)
2. **Riesgo:** bugs pueden causar:
   - Pérdida de datos (servidor se cierra sin avisar)
   - Múltiples instancias corriendo simultáneamente
   - Zombie processes (app no cierra nunca)
3. **Necesidad de revisión:** Gabriel debe aprobar:
   - Decisión de comportamiento por modo
   - Texto de las advertencias en los diálogos
   - Estrategia de iconos
4. **Testing exhaustivo:** requiere pruebas manuales en 3 plataformas × múltiples escenarios

**✅ JUSTIFICACIÓN SÓLIDA:** El plan reconoce la complejidad y el riesgo, y pide aprobación antes de implementar.

#### 5.3. TRAMPAS DE ELECTRON (§6.2)

El plan documenta 3 trampas específicas:

1. **Garbage Collection del Tray:**
   ```javascript
   // ❌ MAL: el tray se recolecta basura
   function createTray() {
     const tray = new Tray(icon);  // Variable local
   }
   
   // ✅ BIEN: mantener referencia global
   let tray = null;
   function createTray() {
     tray = new Tray(icon);  // Variable global
   }
   ```

2. **Event Loop de `app.quit()`:**
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

3. **Cmd+Q en macOS:**
   ```javascript
   // En macOS, Cmd+Q dispara before-quit pero NO pasa por win.on('close')
   app.on('before-quit', (event) => {
     if (!forceQuit && shouldShowDialog) {
       event.preventDefault();
       showCloseDialog(...);
     }
   });
   ```

**✅ DOCUMENTACIÓN PREVENTIVA:** El plan anticipa bugs comunes de Electron y documenta las soluciones correctas.

---

### 6. REVISIÓN DE CRITERIOS DE ACEPTACIÓN (§10)

El plan define **criterios de aceptación** en 4 categorías:

#### 6.1. Funcionalidad (8 checks)
- [x] En `mode=server`, al cerrar la ventana (X), aparece un diálogo con 3 opciones
- [x] Opción "Minimizar a bandeja" oculta la ventana y mantiene el servidor corriendo
- [x] Opción "Reiniciar" cierra y reabre la app automáticamente
- [x] Opción "Cerrar completamente" muestra confirmación extra y termina el servidor
- [x] Checkbox "No volver a preguntar" persiste la preferencia en `app-settings.json`
- [x] Tray icon aparece en la bandeja del sistema con menú "Mostrar / Reiniciar / Salir"
- [x] Auto-start configurable se activa al login del OS
- [x] `mode=client` y `mode=standalone` usan cierre normal (sin diálogo)

#### 6.2. Robustez (5 checks)
- [x] Flag `forceQuit` evita loops infinitos de `preventDefault()`
- [x] `window-all-closed` NO termina la app si hay tray activo
- [x] `before-quit` intercepta Cmd+Q y otros orígenes de cierre
- [x] Single instance lock previene múltiples instancias
- [x] Referencia global a `tray` evita garbage collection

#### 6.3. Documentación (2 checks)
- [x] Manual de usuario en `docs/TRAY-Y-CIERRE.md`
- [x] Skill actualizada (`electron-bootstrap.md`)

#### 6.4. Tests (2 checks)
- [x] Checklist de QA manual ejecutado y pasado
- [x] Verificado en al menos 2 plataformas (Windows + uno de macOS/Linux)

**✅ CRITERIOS COMPLETOS Y RAZONABLES:**
- Cubren funcionalidad, robustez, docs y tests
- Son verificables (no ambiguos)
- Incluyen edge cases (loops infinitos, garbage collection, múltiples instancias)

---

## HALLAZGOS CONSOLIDADOS

### ✅ FORTALEZAS

1. **Fases coherentes y atómicas:** 9 fases bien estructuradas, cada una con un commit convencional.
2. **Alcance restringido:** Solo toca `main.ts`, utils nuevos, assets y docs. NO toca Angular, handlers, DB, preload.
3. **Docs y tests en fases propias:** F8 (QA manual) y F9 (documentación) son fases dedicadas.
4. **Reinicio de app documentado:** El plan anota correctamente que requiere reinicio y lo justifica.
5. **Sin migración BD justificada:** `app-settings.json` con `deepMerge` hace los cambios backward-compatible.
6. **Decisiones tomadas:** Todas las preguntas abiertas tienen recomendación explícita (excepto una, ver abajo).
7. **Riesgos bien identificados:** 7 riesgos con mitigaciones documentadas.
8. **Trampas de Electron documentadas:** 3 gotchas comunes con soluciones correctas.
9. **Criterios de aceptación completos:** 17 checks distribuidos en funcionalidad, robustez, docs y tests.

### ⚠️ AMBIGÜEDADES Y ENMIENDAS SUGERIDAS

#### 1. AMBIGÜEDAD LEVE — Opción A vs B en `mode=client`/`standalone`

**Ubicación:** §3.2 y FASE 5 (líneas 318–330 y 776–791)

**Problema:** El plan lista dos opciones sin marcar cuál se implementa:
- **Opción A:** NO crear tray en `mode=client`/`standalone` (cierre normal legacy)
- **Opción B:** crear tray opcional si `windowBehavior.showTray = true`

**Enmienda sugerida:**
- **Si es Opción A (recomendada):** marcar en el checklist de F5: "✓ Implementar Opción A: NO crear tray en client/standalone".
- **Si es Opción B:** agregar `windowBehavior.showTray?: boolean` al schema (§4, líneas 336–373) y documentar el comportamiento.

**Pregunta para Gabriel:** ¿Se implementa solo Opción A, o se agrega soporte opcional para tray en todos los modos (Opción B)?

#### 2. ENMIENDA MENOR — Referencia §5.3.3 fuera de fase

**Ubicación:** §5.3.3 (líneas 484–500)

**Problema:** La sección §5.3.3 ("Modificar window-all-closed") describe un cambio que **no está asignado a ninguna fase** en la sección 7.

**Enmienda:** Agregar en §7 (FASE 2) una nota: "(Este cambio se describe en §5.3.3 — ya está incluido en el checklist de F2)".

**Impacto:** Ninguno (el checklist de F2 ya lo incluye). Es solo una desconexión documental entre §5 (arquitectura) y §7 (fases).

---

## RIESGOS ADICIONALES DETECTADOS

Además de los 7 riesgos documentados en §6, detecto **2 riesgos adicionales**:

### RIESGO 8: Puerto 7070 retenido tras reinicio

**Descripción:**
El plan menciona (§2.7, línea 261) que el reinicio con `app.relaunch()` + `app.quit()`:
> "❌ **Cierra todas las conexiones WebSocket/SSE/HTTP activas** (clientes se desconectan)  
> ❌ Tarda ~5-15 segundos (re-init de DB, migraciones, seeds)"

**PERO** el skill (SKILL.md, línea 102) advierte:
> "Al relanzar, **matar primero lo anterior** — el Electron viejo **retiene el puerto 7070 del server Fastify** aunque se cierre la ventana (`lsof -ti:7070`)."

**Problema:** Si `app.relaunch()` no espera a que `stopServer()` termine, el proceso viejo puede retener el puerto 7070 y el proceso nuevo **no puede arrancarlo**.

**Impacto:** ALTO — el reinicio desde el diálogo dejaría el servidor caído hasta que el usuario mate el proceso manualmente.

**Mitigación sugerida:**
1. En FASE 3 (diálogo de reinicio), agregar al checklist:
   - [ ] Verificar que `stopServer()` termina **antes** de `app.relaunch()`
   - [ ] Testear manualmente: reiniciar desde el diálogo → verificar que Fastify arranca en el proceso nuevo
2. Código sugerido:
   ```typescript
   case 1: // Reiniciar
     event.preventDefault();
     stopServer()
       .catch(() => {})
       .finally(() => {
         forceQuit = true;
         app.relaunch();
         app.quit();
       });
     break;
   ```

**VEREDICTO:** ⚠️ **RIESGO ALTO NO CUBIERTO EN EL PLAN** — agregar al §6 y al checklist de F3.

### RIESGO 9: Single instance lock fallido durante auto-start

**Descripción:**
El plan asume (§6.1, tabla de riesgos) que `app.requestSingleInstanceLock()` ya implementado previene dobles instancias.

**Problema:** Si el usuario arranca la app **manualmente** mientras el auto-start está configurado, **y el sistema operativo arranca la app al login al mismo tiempo**, hay una ventana de carrera:
1. Auto-start arranca la app (proceso A)
2. Usuario hace doble-click en el ícono (proceso B)
3. `app.requestSingleInstanceLock()` en proceso B falla → proceso B se cierra
4. **PERO** si proceso A aún no terminó la inicialización de DB, el usuario ve un flash de ventana que desaparece sin explicación

**Impacto:** BAJO — UX confuso, pero no rompe nada.

**Mitigación sugerida:**
1. Documentar en `docs/TRAY-Y-CIERRE.md` (FASE 9):
   > "Si configuraste auto-start, evita abrir la app manualmente al mismo tiempo que el sistema la arranca. Si ves un flash de ventana que desaparece, es normal: solo puede haber una instancia corriendo."
2. Agregar al checklist de F8 (QA):
   - [ ] Con auto-start habilitado, reiniciar el OS
   - [ ] Antes de que termine la inicialización de la app, hacer doble-click en el ícono
   - [ ] Verificar que la segunda instancia se cierra sin error

**VEREDICTO:** ⚠️ **RIESGO MENOR NO DOCUMENTADO** — agregar nota en F9 (docs).

---

## VEREDICTO FINAL

### CALIFICACIÓN: **OK CON ENMIENDAS**

El plan es **sólido y bien estructurado**, pero tiene:
- **1 ambigüedad leve** que requiere decisión de Gabriel (Opción A vs B en `mode=client`/`standalone`)
- **1 enmienda menor** documental (referencia §5.3.3 fuera de fase)
- **2 riesgos adicionales** detectados (puerto 7070 retenido, single instance lock)

### ENMIENDAS REQUERIDAS ANTES DE IMPLEMENTAR

1. **[AMBIGÜEDAD CRÍTICA]** Decidir Opción A o B para `mode=client`/`standalone` (§3.2, FASE 5).
2. **[RIESGO ALTO]** Agregar mitigación del puerto 7070 retenido al checklist de F3 (§6.1, nuevo riesgo 8).
3. **[RIESGO BAJO]** Documentar single instance lock + auto-start concurrente en F9 (§6.1, nuevo riesgo 9).
4. **[ENMIENDA MENOR]** Aclarar que §5.3.3 está cubierto por el checklist de F2 (nota documental).

### APROBACIÓN CONDICIONAL

Una vez resueltas las enmiendas **1** y **2**, el plan está listo para implementación.

---

## RECOMENDACIONES ADICIONALES

### 1. Orden de commits en el PR

El plan propone **9 commits convencionales** (uno por fase). Recomiendo:
- **Squash de F8 y F9:** Los commits `test(tray)` y `docs(tray)` podrían mergearse en uno solo (`docs(tray): agregar docs y checklist de QA`) para evitar un commit vacío de código.
- **Alternativa:** Dejar los 9 commits separados si Gabriel prefiere trazabilidad granular.

### 2. Validación en alpha

Agregar al manual de QA (F8) una nota:
> **Validar en un entorno productivo de prueba (alpha):**  
> - Configurar auto-start en una PC de producción  
> - Reiniciar el sistema  
> - Verificar que la app arranca, el servidor queda activo, y las cajas se conectan sin intervención manual

### 3. Rollback plan

El plan no documenta cómo deshacer la feature si algo falla en producción. Agregar en `docs/TRAY-Y-CIERRE.md`:
> **Desactivar tray y auto-start:**  
> 1. Editar `app-settings.json`: `windowBehavior.autoStart = false`  
> 2. Reiniciar la app  
> 3. Si el tray sigue apareciendo, cerrar completamente desde el menú del tray ("Salir")

---

## FIRMA DE AUDITORÍA

**Auditor:** Claude Sonnet 4.5  
**Fecha:** 2026-09-05  
**Rama auditada:** `cursor/tray-autostart-close-dialog-f834`  
**Plan auditado:** `docs/planes/PLAN-TRAY-CLOSE-DIALOG.md`  
**Veredicto:** **OK CON ENMIENDAS** (3 enmiendas requeridas antes de implementar)

---

**Fin del informe de auditoría EJE A.**
