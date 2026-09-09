# Plan — Backup remoto desde /admin y modo cliente (issue #265)

> Branch: `fix/265-backup-remoto` · base `develop`  
> Estado: **plan** · implementación pendiente de aprobación

## 1. Diagnóstico

### Problema

Desde la app web (`/admin`) o desde un nodo en `mode=client`, **todas** las acciones del módulo *Configuración → Backup* fallan con el error crudo:

```
Error: channel_bloqueado_para_http
```

La pantalla se muestra completa y funcional, pero al presionar cualquier botón el usuario recibe un código de error interno sin explicación.

### Evidencia de código

**`electron/server/rpc-router.ts:39-49`** — Los 11 canales del módulo están en la deny-list de `/api/rpc`:

```typescript
// Backups y restauración (destructivos / filesystem del servidor)
'backup-db-reset',
'backup-clear-images',
'backup-restore',
'backup-delete',
'backup-create',
'backup-create-and-export',
'backup-trigger-auto-now',
'backup-config-set',
'backup-send-whatsapp',
'backup-pick-folder',
'backup-pick-restore-file',
```

**`electron/handlers/backup.handler.ts`** — Los handlers ya implementan `ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP')` como primera sentencia en:
- `backup-create` (línea 495)
- `backup-create-and-export` (línea 511)
- `backup-delete` (línea 560)
- `backup-restore` (línea 653)
- `backup-send-whatsapp` (línea 669)
- `backup-config-set` (línea 720)
- `backup-trigger-auto-now` (línea 746)
- `backup-db-reset` (línea 768)
- `backup-clear-images` (línea 840)

**`electron/handlers/permissions.handler.ts:139`** — El permiso existe en `SEED_PERMISOS`:

```typescript
{ codigo: 'SISTEMA_BACKUP', descripcion: 'Crear y restaurar backups de la base de datos', modulo: 'SISTEMA' }
```

**`src/app/pages/configuracion/backup-restore/backup-restore.component.ts`** — El componente NO detecta si corre en modo remoto. Muestra todos los botones sin ninguna advertencia ni estado deshabilitado.

### Impacto real

**Bloqueante:** Sacar un backup de la instalación de producción sin estar físicamente frente a esa máquina es imposible. Hoy no hay alternativa remota viable: el SSH del host está cerrado y Postgres no está expuesto. La única forma de obtener una copia de la BD es ir presencialmente al local.

**Caso de uso legítimo:** Un administrador desde su casa necesita un backup para análisis/desarrollo, o el operador del local necesita enviarlo por soporte técnico.

**Detectado:** 2026-08-24 al intentar sacar una copia de producción desde `/admin`.

## 2. Qué se cambia

### 2.1 Separación de canales en `rpc-router.ts`

**Permitir por HTTP** (con guard `SISTEMA_BACKUP` ya presente en los handlers):

| Canal | Uso | Justificación |
|---|---|---|
| `backup-create` | Generar backup en el servidor | No destructivo, útil en remoto |
| `backup-create-and-export` | Generar y descargar | El diálogo `showSaveDialog` abre en el **servidor**, guarda ahí — no descarga al cliente |
| `backup-send-whatsapp` | Enviar backup por WhatsApp | **El caso de uso del issue**: recibir el backup sin estar en el local |
| `backup-config-set` | Configurar backups automáticos | Solo lectura/escritura de config, sin riesgo |
| `backup-trigger-auto-now` | Forzar backup automático ya | Equivalente a `backup-create` con parámetros preset |

**Mantener bloqueados** (operaciones destructivas/riesgosas):

| Canal | Razón del bloqueo |
|---|---|
| `backup-restore` | Reemplaza toda la BD del servidor y reinicia la app |
| `backup-db-reset` | Elimina toda la BD del servidor y reinicia la app |
| `backup-clear-images` | Borra todas las imágenes del servidor |
| `backup-delete` | Elimina archivos del filesystem del servidor |

**Sin sentido en HTTP** (diálogos nativos Electron):

| Canal | Problema |
|---|---|
| `backup-pick-folder` | Abre `showOpenDialog` en el **servidor**, no en el cliente |
| `backup-pick-restore-file` | Abre `showOpenDialog` en el **servidor** |

Estos dos canales NO se desbloquean. La UI debe detectar el modo y:
- **Ocultar** o **deshabilitar** los botones "Cambiar carpeta" y "Restaurar desde archivo" cuando no corre local.
- Mostrar un mensaje claro: *"Esta acción requiere acceso local al servidor"* o similar.

### 2.2 Detección del modo de ejecución en la UI

**`BackupRestoreComponent`** debe detectar si corre en modo remoto para deshabilitar/ocultar controles que no tienen sentido:

```typescript
isRemote = false;  // true cuando window.location.protocol === 'http:' || 'https:'

ngOnInit() {
  this.isRemote = window.location.protocol.startsWith('http');
  // ...
}
```

**En el template:**
- Botón "Cambiar carpeta de backups": `[disabled]="isRemote"` + tooltip explicativo.
- Botón "Restaurar desde archivo...": `[disabled]="isRemote"` + tooltip.
- Alternativamente, ocultar con `*ngIf="!isRemote"` y mostrar un mensaje informativo.

### 2.3 Actualización del permiso (si aplica)

El permiso `SISTEMA_BACKUP` existe y su descripción actual es:

> "Crear y restaurar backups de la base de datos"

**Propuesta:** Ajustar la descripción para reflejar el alcance real:

> "Administrar backups: crear, configurar, enviar por WhatsApp, restaurar y resetear la base de datos"

Esto es opcional — solo por claridad. El permiso ya cubre todas las acciones.

## 3. Fases de implementación

### Fase 1 — Permitir canales no destructivos por HTTP

**Archivo:** `electron/server/rpc-router.ts`

1. Remover de `BLOCKED_CHANNELS` (líneas 44-48):
   - `backup-create`
   - `backup-create-and-export`
   - `backup-trigger-auto-now`
   - `backup-config-set`
   - `backup-send-whatsapp`

2. Agregar un comentario explicativo antes del bloque que sí queda bloqueado:

```typescript
// Backups: permitidos los no destructivos (con guard SISTEMA_BACKUP en handler).
// Destructivos siguen bloqueados:
'backup-db-reset',
'backup-clear-images',
'backup-restore',
'backup-delete',
// Diálogos nativos del servidor (sin sentido remoto):
'backup-pick-folder',
'backup-pick-restore-file',
```

**Commit:** `fix(backup): permitir operaciones no destructivas por HTTP`

### Fase 2 — Detectar modo remoto en la UI

**Archivo:** `src/app/pages/configuracion/backup-restore/backup-restore.component.ts`

1. Agregar propiedad:
   ```typescript
   /** true cuando la app corre en modo remoto (web /admin o client) */
   isRemote = false;
   ```

2. En `ngOnInit()`:
   ```typescript
   this.isRemote = window.location.protocol.startsWith('http');
   ```

**Archivo:** `src/app/pages/configuracion/backup-restore/backup-restore.component.html`

3. Deshabilitar botón "Cambiar carpeta":
   ```html
   <button mat-raised-button
           [disabled]="isRemote"
           [matTooltip]="isRemote ? 'No disponible en modo remoto' : ''"
           (click)="selectBackupFolder()">
     <mat-icon>folder_open</mat-icon>
     Cambiar carpeta
   </button>
   ```

4. Deshabilitar botón "Restaurar desde archivo...":
   ```html
   <button mat-raised-button
           [disabled]="isRemote"
           [matTooltip]="isRemote ? 'Solo disponible en modo local' : ''"
           (click)="restore()">
     <mat-icon>restore</mat-icon>
     Restaurar desde archivo...
   </button>
   ```

5. *Opcional:* Agregar un aviso informativo global en la parte superior del componente cuando `isRemote === true`:

   ```html
   <mat-card *ngIf="isRemote" class="info-card">
     <mat-card-content>
       <mat-icon>info</mat-icon>
       <span>Está accediendo al backup de forma remota. Algunas acciones (restaurar, cambiar carpeta) solo están disponibles desde el servidor.</span>
     </mat-card-content>
   </mat-card>
   ```

**Commit:** `fix(backup): deshabilitar controles sin sentido en modo remoto`

### Fase 3 — Tests manuales

**Checklist de verificación:**

**En modo `standalone` (local):**
- [ ] Crear backup → funciona
- [ ] Crear y exportar → funciona
- [ ] Enviar por WhatsApp → funciona (con Evolution API configurada)
- [ ] Configurar auto-backup → funciona
- [ ] Forzar backup automático → funciona
- [ ] Cambiar carpeta de backups → funciona (diálogo se abre)
- [ ] Restaurar desde archivo → funciona (diálogo se abre)
- [ ] Resetear BD → funciona (con confirmación)
- [ ] Borrar imágenes → funciona
- [ ] Eliminar backup → funciona
- [ ] Los botones locales NO están deshabilitados (`isRemote === false`)

**En `/admin` (web) o modo `client`:**
- [ ] Crear backup → funciona (con permiso `SISTEMA_BACKUP`)
- [ ] Crear y exportar → funciona, guarda en el servidor
- [ ] Enviar por WhatsApp → funciona
- [ ] Configurar auto-backup → funciona
- [ ] Forzar backup automático → funciona
- [ ] Cambiar carpeta → botón **deshabilitado** o con mensaje claro
- [ ] Restaurar desde archivo → botón **deshabilitado** o con mensaje claro
- [ ] Resetear BD → **falla con `channel_bloqueado_para_http`** (comportamiento esperado)
- [ ] Borrar imágenes → **falla con `channel_bloqueado_para_http`** (esperado)
- [ ] Eliminar backup → **falla con `channel_bloqueado_para_http`** (esperado)
- [ ] Sin permiso `SISTEMA_BACKUP` → HTTP 403 con mensaje de permiso

**Commit:** `test: verificar backup remoto en standalone, server y client`

## 4. Qué NO se toca

1. **Los handlers de backup** — NO se modifican. Ya tienen `ensurePermission` correctamente implementado.
2. **La lógica de creación/restauración** — Solo se cambia el guard HTTP, no el código de backup/restore.
3. **El servicio `BackupService` de Angular** — Solo se ajusta la UI del componente.
4. **Otros módulos con canales bloqueados** — Este plan es específico de backup. Otros casos (música, config de BD, modo de operación) quedan fuera del alcance. Se puede crear un issue aparte si alguno tiene el mismo patrón (UI mostrada pero funcionalidad bloqueada).

## 5. Riesgos de exponer backup por HTTP

### Riesgo 1: Exfiltración de datos

**Descripción:** Un usuario con permiso `SISTEMA_BACKUP` puede generar un backup completo (BD + imágenes) y enviarlo a un número de WhatsApp arbitrario.

**Mitigación existente:**
- El permiso `SISTEMA_BACKUP` es de **nivel SISTEMA**, reservado para administradores.
- La operación queda registrada en el log del handler (consola del servidor).
- El número de WhatsApp por defecto está en la config (`app-settings.backup.whatsappDestino`), no ingresado ad-hoc.

**Mitigación adicional sugerida (fuera del alcance de este fix):**
- Registrar en una tabla de auditoría (`AuditoriaBackup`) cada creación/envío con `usuario_id`, `timestamp`, `destino`, `tamano_bytes`.
- Alerta si se envían más de X backups en Y horas desde el mismo usuario.

### Riesgo 2: Consumo de recursos del servidor

**Descripción:** Generar backups grandes (Postgres con GB de datos + imágenes) consume CPU, disco y RAM del servidor. Un usuario malicioso o un script podría saturar el servidor generando backups en loop.

**Mitigación existente:**
- Rate limiting de `/api/rpc` (600 req/min por `device_id`, 300 para rutas sin diferenciación).
- `ensurePermission` limita a usuarios autenticados con permiso SISTEMA.

**Mitigación adicional sugerida (fuera del alcance):**
- Limitar cantidad de backups generados por usuario/hora (ej. máximo 5/hora).
- Rechazar backup si ya hay uno en progreso (lock en memoria).

### Riesgo 3: Exposición del dump Postgres

**Descripción:** `backup-create-and-export` guarda en el servidor, pero el path es configurable. Si un usuario malicioso cambia `customBackupDir` a una ruta servida por HTTP (`/pub/`, assets), el backup queda accesible públicamente.

**Mitigación existente:**
- El handler `backup-create` valida que `customDir` no salga de `userData` (no aplica a `backup-create-and-export` con `showSaveDialog`, pero ahí el diálogo es del **servidor**, no del cliente HTTP).
- Los backups en `backupDir` NO están servidos por ninguna ruta HTTP.

**Mitigación adicional sugerida (fuera del alcance):**
- Validar en `backup-config-set` que `customBackupDir` no sea una ruta servida públicamente.

### Riesgo 4: Confusión de contexto (UX)

**Descripción:** `backup-create-and-export` abre `showSaveDialog` **en el servidor**, no en el cliente. Un usuario remoto puede creer que está descargando el backup a su PC, pero en realidad lo guarda en el filesystem del servidor.

**Mitigación:**
- Renombrar el botón en UI cuando `isRemote === true`: en vez de "Crear y exportar...", usar "Crear y guardar en servidor" o similar.
- Tooltip explicativo: *"El archivo se guardará en el servidor, no en su PC"*.

**Este ajuste se incluye en Fase 2.**

## 6. Reinicio requerido

**SÍ, requiere reinicio del nodo `server`.**

Los cambios en `electron/server/rpc-router.ts` (Fase 1) modifican el comportamiento del Fastify que expone `/api/rpc`. El código del router se lee una sola vez al iniciar el servidor.

**Instrucciones de deploy:**
1. Mergear el PR a `develop`.
2. En la PC que corre en `mode=server`:
   - Cerrar la aplicación.
   - Instalar la nueva versión (alpha build).
   - Reiniciar.
3. Los clientes (`mode=client`, `/admin`, PWA) **NO** necesitan reinicio — se conectan al servidor actualizado y ven los canales permitidos inmediatamente.

**Los cambios de UI (Fase 2) NO requieren reinicio** — Angular hot-reload es suficiente en desarrollo.

## 7. Verificación post-merge

**En alpha (rama `develop`):**
1. Configurar un nodo en `mode=server` con la nueva build.
2. Acceder desde `/admin` (mismo PC con `http://localhost:7070/admin` o LAN con `http://<ip-server>:7070/admin`).
3. Correr el checklist de Fase 3 completo.
4. Verificar que los logs del servidor (consola) muestran las llamadas exitosas a `backup-create`, `backup-send-whatsapp`, etc.
5. Verificar que intentar `backup-restore` desde remoto falla con `channel_bloqueado_para_http`.

**Criterio de éxito:**
- Un administrador remoto puede sacar un backup y recibirlo por WhatsApp **sin** acceso físico al servidor.
- Las operaciones destructivas siguen bloqueadas remotamente.
- Los botones sin sentido remoto están deshabilitados con mensaje claro.

## 8. Decisiones de Gabriel (2026-09-09)

**Enmiendas aprobadas tras auditorías A (PASS-with-fixes) y B (FAIL):**

### 1. Canales permitidos por HTTP (restringido)

**SOLO estos 3 canales:**
- `backup-create` — generar backup en el servidor
- `backup-trigger-auto-now` — forzar backup automático ya
- `backup-send-whatsapp` — enviar backup por WhatsApp

**Bloqueados (se mantienen en deny-list):**
- `backup-create-and-export` — `showSaveDialog` en el servidor = DoS, no tiene sentido remoto
- `backup-config-set` — configuración sensible, solo local
- `backup-restore`, `backup-db-reset`, `backup-clear-images`, `backup-delete` — destructivos
- `backup-pick-folder`, `backup-pick-restore-file` — diálogos nativos del servidor

### 2. Seguridad: `backup-send-whatsapp` ignora destino del payload HTTP

**Cambio en handler:** En caller HTTP, **ignorar `opts.destino`**. Usar **solo `config.whatsappDestino`**.

**Razón:** Un cliente HTTP autenticado no debe poder enviar el backup a un número arbitrario. El destino se configura en el servidor (`app-settings.backup.whatsappDestino`) y no se puede sobreescribir remotamente.

**Implementación:** Detectar si la llamada viene por HTTP (ausencia de contexto Electron) e ignorar `opts.destino` en ese caso.

### 3. `ensurePermission` obligatorio

Verificar que `SISTEMA_BACKUP` sea la primera sentencia en los 3 handlers permitidos. Ya está implementado (líneas 495, 746, 669 de `backup.handler.ts`).

### 4. UI — deshabilitar botones bloqueados

En modo remoto (`isRemote = true`):
- Deshabilitar: restore, reset, delete, pick-folder, pick-restore-file, create-and-export, config-set
- Mensaje claro: tooltip o banner
- **NO dejar el error crudo `channel_bloqueado_para_http`**

### 5. Test automatizado obligatorio

**Cobertura mínima:**
- Canales destructivos siguen respondiendo `channel_bloqueado_para_http` por `/api/rpc`
- `backup-create` permitido con permiso `SISTEMA_BACKUP`
- Sin permiso → HTTP 403
- `backup-send-whatsapp` por HTTP no acepta `destino` arbitrario del payload

Si no hay harness HTTP completo, el test más chico que **falle** al sacar `backup-restore` de la deny-list.

### 6. Reinicio requerido

**Server Y standalone** — `rpc-router.ts` se carga en ambos modos.

### 7. Fuera de alcance

- **NO** implementar descarga HTTP del dump (opción C)
- **NO** agregar tabla `BackupAuditoria` en este PR
- **NO** `Closes #265` todavía — el issue se cierra tras validación en alpha

---

**Estado del plan:** ✅ **Aprobado con enmiendas** (2026-09-09)  
**Siguiente paso:** Implementación por fases, commit+push por fase.
