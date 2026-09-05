# Tray Icon, Auto-start y Diálogo de Cierre

Documentación durable sobre el sistema de bandeja del sistema, inicio automático y manejo de cierre de ventana en FRC Gourmet.

**Implementado en:** PR #289, rama `cursor/tray-autostart-close-dialog-f834`  
**Fecha:** 2026-09-05

---

## Resumen Ejecutivo

En **`mode=server`**, FRC Gourmet puede correr en segundo plano sin terminar el proceso Electron:

- **Tray icon** (bandeja del sistema) con menú Mostrar / Reiniciar / Salir
- **Diálogo de cierre inteligente** al presionar X o Cmd+Q, con opciones de minimizar, reiniciar o cerrar completamente
- **Auto-start al login** del sistema operativo (configurable)
- **Single-instance lock** — una sola instancia de la app puede correr simultáneamente
- **Prompt de auto-start** en el primer arranque

En **`mode=client`** y **`mode=standalone`**, el comportamiento es **legacy** (sin tray, cierre normal directo).

---

## Comportamiento por Modo

### `mode=server` (Opción A)

#### Tray Icon (Bandeja del Sistema)

- **Icono:** Se crea automáticamente al iniciar la app
- **Menú contextual:**
  - **Mostrar** — restaura y enfoca la ventana principal
  - **Reiniciar** — detiene el servidor (`stopServer()`), reinicia la app (`app.relaunch()`)
  - **Salir** — muestra confirmación extra, detiene el servidor, termina la app

#### Diálogo de Cierre (Botón X o Cmd+Q / Alt+F4)

Al intentar cerrar la ventana (botón X, Cmd+Q, Alt+F4, File→Quit), aparece un diálogo nativo con **3 opciones**:

```
┌─────────────────────────────────────────────┐
│  Cerrar FRC Gourmet                         │
├─────────────────────────────────────────────┤
│  ¿Qué deseas hacer?                         │
│                                             │
│  [Cerrar completamente] [Reiniciar] [Minimizar a bandeja] │
│                                             │
│  ☐ No volver a preguntar                   │
└─────────────────────────────────────────────┘
```

**Orden de botones (UX optimizado):**
- **Izquierda:** "Cerrar completamente" (acción peligrosa — detiene servidor, afecta cajas/PWA)
- **Centro:** "Reiniciar" (reinicio completo)
- **Derecha:** "Minimizar a bandeja" (acción segura — **default**, responde a Enter/Escape)

**Acciones:**

1. **Minimizar a bandeja:**
   - Oculta la ventana, deja el tray visible
   - El servidor Fastify sigue corriendo
   - Clientes (cajas, PWA móvil) siguen conectados sin interrupción

2. **Reiniciar:**
   - Espera a que `stopServer()` complete (libera puerto 7070)
   - Llama `app.relaunch()` + `app.quit()`
   - Nueva instancia arranca limpia con tray nuevo

3. **Cerrar completamente:**
   - Muestra **confirmación extra** en `mode=server`:
     ```
     ¿Cerrar el servidor de FRC Gourmet?
     
     Esto detendrá el servidor Fastify. Las cajas, dispositivos
     móviles y PWA perderán conexión hasta que vuelvas a abrir
     la aplicación.
     
     [Cancelar] [Cerrar servidor]
     ```
   - Si confirma: detiene servidor, termina la app completamente
   - El tray desaparece

**Checkbox "No volver a preguntar":**
- Persiste la acción elegida en `app-settings.json` → `windowBehavior.closeAction`
- Solo aplica a "Minimizar" y "Cerrar" (no a "Reiniciar" — no tiene sentido reiniciar siempre sin preguntar)
- **Es reversible** — ver sección "Cómo Revertir" más abajo

#### Single-Instance Lock

- Solo **una instancia** de FRC Gourmet puede correr simultáneamente
- Si el usuario abre la app de nuevo (doble click en .exe/.app):
  - La segunda instancia detecta que ya hay una corriendo
  - Enfoca la ventana existente (o la restaura si estaba minimizada)
  - La segunda instancia termina automáticamente

#### Auto-Start al Login

##### Prompt de Primer Arranque

En el **primer arranque** en `mode=server`, aparece un diálogo preguntando:

```
┌─────────────────────────────────────────────┐
│  FRC Gourmet — Inicio Automático            │
├─────────────────────────────────────────────┤
│  ¿Abrir FRC Gourmet al iniciar la PC?      │
│                                             │
│  En modo servidor, esto mantiene el backend │
│  siempre disponible para las cajas,         │
│  dispositivos móviles y PWA conectados.     │
│                                             │
│  Puedes cambiar esta configuración más      │
│  adelante editando app-settings.json.       │
│                                             │
│  [No] [Sí, iniciar con el sistema]         │
└─────────────────────────────────────────────┘
```

- **Default:** "Sí" (botón derecho)
- **Escape:** equivale a "No"
- **Solo pregunta una vez** — la decisión se persiste en `windowBehavior.autoStartPrompted: true`
- **Migración suave:** Si el usuario ya había configurado `autoStart` manualmente antes de esta feature, el prompt NO aparece (solo marca `autoStartPrompted: true` silenciosamente)

##### Comportamiento del Auto-Start

- Si `autoStart: true`:
  - La app se agrega a los login items del sistema operativo (`app.setLoginItemSettings`)
  - Al iniciar sesión en Windows/macOS/Linux, FRC Gourmet arranca automáticamente
- Si `startMinimized: true` (además de `autoStart: true`):
  - La app arranca minimizada al tray (sin mostrar ventana)
  - Útil para servidores que deben estar siempre disponibles en segundo plano

### `mode=client` y `mode=standalone` (Opción A)

- **NO hay tray icon**
- **NO hay diálogo de cierre** — el botón X cierra la app directamente (comportamiento legacy)
- **NO hay prompt de auto-start**
- Cmd+Q / Alt+F4 / File→Quit terminan la app inmediatamente

---

## Configuración: `app-settings.json`

### Schema: `WindowBehaviorSettings`

```json
{
  "windowBehavior": {
    "closeAction": "ask",
    "autoStart": false,
    "startMinimized": false,
    "autoStartPrompted": false
  }
}
```

### Propiedades

#### `closeAction: 'ask' | 'minimize' | 'close'`

Estrategia al cerrar la ventana (botón X o Cmd+Q):

- **`'ask'`** (default en `mode=server`): Mostrar diálogo con las 3 opciones
- **`'minimize'`**: Minimizar a tray **sin preguntar**
- **`'close'`**: Cerrar completamente sin preguntar (pero muestra la confirmación extra en `mode=server`)

**Cómo se setea:**
- Default: `'ask'`
- Se cambia al marcar el checkbox "No volver a preguntar" en el diálogo y elegir Minimizar o Cerrar

#### `autoStart: boolean`

Auto-start al login del sistema operativo (solo tiene efecto en `mode=server`).

- **`true`**: La app se agrega a los login items del SO
- **`false`** (default): NO arranca automáticamente

**Cómo se setea:**
- Default: `false`
- Se setea según la respuesta del usuario en el prompt de primer arranque
- También se puede editar manualmente en `app-settings.json`

#### `startMinimized: boolean`

Iniciar minimizado a la bandeja (requiere `autoStart: true`).

- **`true`**: Al arrancar, la ventana se oculta automáticamente después de ~500ms (solo queda el tray)
- **`false`** (default): Al arrancar, la ventana se muestra normalmente

**Uso típico:** Servidores que deben estar siempre corriendo en segundo plano sin ventana visible.

#### `autoStartPrompted: boolean`

Flag interno que indica si ya se preguntó al usuario sobre auto-start.

- **`true`**: Ya se preguntó (o se detectó configuración manual previa)
- **`false`** (default): Aún no se preguntó

**Cómo funciona internamente:**
- En el primer arranque (`autoStartPrompted: false`), se lee el JSON crudo de `app-settings.json` (antes del merge con defaults)
- Si el JSON crudo tiene `windowBehavior.autoStart` explícitamente configurado (con `hasOwnProperty`):
  - **Migración suave:** Marca `autoStartPrompted: true` sin preguntar (respeta configuración manual previa)
- Si el JSON crudo NO tiene `windowBehavior.autoStart`:
  - Muestra el prompt de auto-start
- Una vez que `autoStartPrompted: true`, el prompt nunca vuelve a aparecer

---

## Cómo Revertir Configuraciones

### Revertir "No volver a preguntar" (volver a ver el diálogo de cierre)

Editar `app-settings.json` y cambiar:

```json
{
  "windowBehavior": {
    "closeAction": "ask"
  }
}
```

**Reiniciar la app** (cambios en `main.ts` requieren reinicio completo).

### Desactivar Auto-Start

Editar `app-settings.json` y cambiar:

```json
{
  "windowBehavior": {
    "autoStart": false
  }
}
```

**Reiniciar la app** para aplicar el cambio (llama `app.setLoginItemSettings` con `openAtLogin: false`).

### Forzar que el Prompt de Auto-Start Vuelva a Aparecer

Editar `app-settings.json` y cambiar:

```json
{
  "windowBehavior": {
    "autoStartPrompted": false
  }
}
```

**Reiniciar la app**. El prompt aparecerá de nuevo al próximo arranque.

---

## Limitaciones y Consideraciones

### Reinicio Requerido

Los cambios en `app-settings.json` relacionados con `windowBehavior` **requieren reinicio completo de la app** porque se aplican en el main process (`main.ts`), no en el renderer.

**No aplica hot reload** — cerrar y volver a abrir la app para ver los cambios.

### Auto-Start por Plataforma

#### Windows
- Funciona out-of-the-box con `app.setLoginItemSettings`
- La app aparece en "Inicio" (Task Manager → pestaña "Inicio")

#### macOS
- Funciona con `app.setLoginItemSettings`
- La app aparece en "Preferencias del Sistema → Usuarios y Grupos → Elementos de inicio"
- **Requiere firma de código** (code signing) para builds de producción
  - Builds de desarrollo sin firma pueden no funcionar correctamente
  - `electron-builder` con certificado válido lo maneja automáticamente

#### Linux
- Funciona con `app.setLoginItemSettings`, pero **depende del entorno de escritorio** (GNOME, KDE, XFCE, etc.)
- Puede que algunos entornos no soporten login items
- La app generalmente se agrega a `~/.config/autostart/` como archivo `.desktop`

### Bandeja del Sistema (Tray)

#### Windows
- Funciona sin problemas (system tray en la barra de tareas)

#### macOS
- Funciona sin problemas (menu bar icon)

#### Linux
- **Depende del entorno de escritorio**
- GNOME 3.26+ requiere extensiones para mostrar tray icons (ej. `TopIcons Plus`, `AppIndicator`)
- KDE Plasma y XFCE soportan tray nativamente
- Si el tray no aparece, la funcionalidad de la app **no se ve afectada** (la app sigue funcionando, pero sin icono en bandeja)

### TRUST y Seguridad

El sistema TRUST de FRC Gourmet (autenticación/permisos para handlers IPC) **NO aplica a estos diálogos nativos**:

- Los diálogos de cierre y auto-start usan `dialog.showMessageBox` de Electron (main process)
- No son handlers IPC expuestos al renderer
- No requieren autenticación TRUST

---

## Archivos Relacionados

### Main Process (Electron)

- **`main.ts`**: Integración completa de tray/diálogos/auto-start en `app.on('ready')` y `app.on('before-quit')`
- **`electron/utils/tray-manager.ts`**: Gestión del tray icon (crear, actualizar menú, destruir)
- **`electron/utils/window-close-dialog.ts`**: Diálogos nativos (`showCloseDialog`, `showFinalConfirmation`, `showAutoStartPrompt`)
- **`electron/utils/auto-start-manager.ts`**: Wrapper de `app.setLoginItemSettings` (`setAutoStart`, `getAutoStartStatus`)
- **`electron/utils/app-settings.utils.ts`**: Schema `WindowBehaviorSettings`, `readAppSettings`, `writeAppSettings`

### Renderer (Angular)

**No hay cambios en el renderer.** Esta feature es 100% main process.

---

## Testing y Debugging

### Verificar Estado del Tray

```bash
# En los logs de la app (consola de Electron):
[tray] Tray icon creado para mode=server
[tray] Menú actualizado con Mostrar / Reiniciar / Salir
```

### Verificar Auto-Start

#### Windows
1. Abrir Task Manager (Ctrl+Shift+Esc)
2. Pestaña "Inicio"
3. Buscar "FRC Gourmet" — debe aparecer "Habilitado" si `autoStart: true`

#### macOS
1. Preferencias del Sistema → Usuarios y Grupos
2. Elementos de inicio
3. Buscar "FRC Gourmet" en la lista

#### Linux
```bash
# Verificar archivo .desktop en autostart
cat ~/.config/autostart/frc-gourmet.desktop
```

### Verificar Single-Instance Lock

1. Abrir FRC Gourmet
2. Intentar abrir de nuevo (doble click en el ejecutable)
3. La segunda instancia debe enfocar la primera y terminar inmediatamente
4. Verificar logs:
   ```
   [single-instance] Segunda instancia detectada, enfocando ventana existente
   ```

### Logs de Auto-Start Prompt

```bash
# Primera ejecución (autoStartPrompted: false, sin autoStart en JSON crudo)
[auto-start] Primera ejecución, preguntando al usuario sobre auto-start
[auto-start] Usuario eligió: Sí  # o "No"
[auto-start] Configuración guardada y aplicada

# Migración suave (autoStart ya configurado manualmente)
[auto-start] autoStart ya configurado manualmente, marcando prompted=true
```

---

## Soporte y Troubleshooting

### El Tray Icon No Aparece (Linux)

**Causa:** Entorno de escritorio sin soporte de tray, o GNOME sin extensión.

**Solución:**
1. Instalar extensión `TopIcons Plus` o `AppIndicator and KStatusNotifierItem Support`
2. O usar KDE Plasma / XFCE (soporte nativo)
3. Si el tray no es crítico, la app sigue funcionando (cerrar X → diálogo aparece igual)

### El Auto-Start No Funciona (macOS)

**Causa:** Build sin firma de código (development build).

**Solución:**
1. Usar build de producción con certificado válido (`electron-builder` + code signing)
2. O configurar manualmente en "Preferencias → Usuarios → Elementos de inicio"

### El Diálogo de Cierre No Aparece

**Causa 1:** `mode !== 'server'` (Opción A: client/standalone sin diálogo).

**Causa 2:** `windowBehavior.closeAction !== 'ask'` (usuario marcó "No preguntar").

**Solución:** Editar `app-settings.json` → `"closeAction": "ask"` → reiniciar app.

### El Servidor No Se Detiene al Reiniciar/Cerrar

**Causa:** `stopServer()` no completó (error o timeout).

**Logs a revisar:**
```bash
[tray] Reiniciar solicitado desde menú
[tray] stopServer error: <error aquí>
```

**Solución:** Verificar que Fastify no esté bloqueado (conexiones abiertas, etc.). El código espera `await stopServer()` antes de `app.relaunch()` / `app.quit()`.

---

## Changelog

### 2026-09-05 — Versión Inicial (PR #289)

- ✅ Tray icon en `mode=server` con menú Mostrar / Reiniciar / Salir
- ✅ Diálogo de cierre con 3 opciones (orden UX optimizado)
- ✅ Auto-start al login con `setLoginItemSettings`
- ✅ Prompt de auto-start en primer arranque
- ✅ Single-instance lock
- ✅ Checkbox "No volver a preguntar" reversible
- ✅ Opción A: `mode=client` y `mode=standalone` sin tray (legacy)

---

**Documentación actualizada:** 2026-09-05  
**Responsable:** Claude (PR #289)  
**Reviewer:** Gabriel Frank
