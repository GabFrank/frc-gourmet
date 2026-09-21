# Auditoría Diff #265 - UI Backup/Restore en Modo Remoto

**Fecha:** 2026-09-09  
**Rama:** `cursor/fix-265-backup-remoto-759b`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/295  
**Alcance:** Archivos TS y HTML de `src/app/pages/configuracion/backup-restore/`

---

## Resumen Ejecutivo

**VEREDICTO: ❌ IMPLEMENTACIÓN INCOMPLETA**

El diff introduce la variable `isRemote` en el componente TypeScript para detectar cuando la app corre en modo HTTP (/admin o mode=client), pero **NO aplica esta variable en el template HTML** para deshabilitar los controles problemáticos. Los botones y acciones que invocan canales IPC bloqueados en modo remoto quedan expuestos sin protección, lo que causará errores crudos `channel_bloqueado_para_http` cuando el usuario los active.

---

## Cambios Detectados en el Diff

### `backup-restore.component.ts`

**Líneas modificadas:**
- **L73-74:** Se agrega propiedad `isRemote = false` con comentario JSDoc
- **L113-114:** Se inicializa `isRemote` en `ngOnInit()` con `window.location.protocol.startsWith('http')`

```typescript
/** true cuando la app corre en modo remoto (web /admin o mode=client) */
isRemote = false;

ngOnInit(): void {
  // Detectar si corre en modo remoto (HTTP) para deshabilitar controles que no tienen sentido remotos
  this.isRemote = window.location.protocol.startsWith('http');
  this.refreshAll();
}
```

**Evaluación:** ✅ La detección es correcta y el comentario es claro.

### `backup-restore.component.html`

**Cambios:** ❌ **NINGUNO**

El template NO fue modificado en este diff. No se agregó ningún `[disabled]="isRemote"`, `*ngIf="!isRemote"`, ni tooltip/mensaje explicativo para los controles que deben deshabilitarse.

---

## Análisis de Controles por Categoría

### 1. **Controles que DEBEN deshabilitarse en remoto**

Según las especificaciones, estas operaciones NO deben ser accesibles en modo `/admin` o `client` porque invocan canales IPC bloqueados:

| Acción | Método TypeScript | Ubicación HTML | Estado Actual | Riesgo |
|--------|------------------|----------------|---------------|--------|
| **Restaurar desde archivo** | `restoreFromFile()` | L137-142 (botón principal) | ❌ Sin `[disabled]` | 🔴 ALTO |
| **Restaurar desde lista** | `restoreFromList(row)` | L207-209 (menú) | ❌ Sin `[disabled]` | 🔴 ALTO |
| **Exportar BD a archivo** | `createAndExport(false)` | L115-119 | ❌ Sin `[disabled]` | 🔴 ALTO |
| **Exportar completo** | `createAndExport(true)` | L120-126 | ❌ Sin `[disabled]` | 🔴 ALTO |
| **Eliminar backup** | `deleteBackup(row)` | L214-217 (menú) | ❌ Sin `[disabled]` | 🟡 MEDIO |
| **Cambiar carpeta backups** | `pickCustomBackupDir()` | L338-341 | ❌ Sin `[disabled]` | 🟡 MEDIO |
| **Resetear carpeta** | `resetCustomDir()` | L342-345 | ❌ Sin `[disabled]` | 🟡 MEDIO |
| **Guardar config (carpeta)** | `saveConfig()` | L360-363 | ⚠️ Parcial* | 🟡 MEDIO |
| **Resetear BD** | `resetDatabase()` | L403-406 | ❌ Sin `[disabled]` | 🔴 ALTO |

**\*Nota sobre `saveConfig()`:** Este método guarda toda la configuración del auto-backup. Debería permitirse en remoto EXCEPTO cuando se modifica `customBackupDir` (que requiere `pickFolder`, bloqueado). La implementación actual no distingue: o se deshabilita todo o nada.

### 2. **Controles que DEBEN seguir usables en remoto**

Estas operaciones SÍ funcionan en modo remoto:

| Acción | Método TypeScript | Ubicación HTML | Estado Actual | Observación |
|--------|------------------|----------------|---------------|-------------|
| **Backup rápido (solo BD)** | `createBackupLocal(false)` | L103-108 | ✅ Accesible | Correcto ✓ |
| **Backup completo (BD+img)** | `createBackupLocal(true)` | L109-114 | ✅ Accesible | Correcto ✓ |
| **Ejecutar auto-backup** | `triggerAutoBackupNow()` | L365-368 | ✅ Accesible | Correcto ✓ |
| **Enviar WhatsApp** | `sendBackupWhatsapp(row)` | L210-213 (menú) | ✅ Accesible | Correcto ✓ |
| **Toggle auto-backup** | `toggleAutoBackup()` | L246-249 | ✅ Accesible | Correcto ✓ |

**Verificación adicional:** El código TypeScript de `isRemote` NO afecta estos métodos. ✅ Confirmado.

### 3. **Mensaje de error esperado vs. actual**

**Comportamiento esperado:**
- Botones deshabilitados con tooltip: _"No disponible en modo remoto (/admin o cliente)"_
- O mensaje informativo en la card: _"Restaurar backups solo está disponible en modo standalone local"_

**Comportamiento actual:**
- Botones activos → usuario hace clic → error crudo en snackbar o log:  
  ```
  Error al elegir archivo: channel_bloqueado_para_http
  ```

---

## Problemas Identificados

### ❌ **Problema 1: Botones de restauración sin protección**

**Líneas afectadas:** L137-142 (botón principal), L207-209 (menú lista)

```html
<!-- ACTUAL (línea 137-142) -->
<button *appHasPermission="'SISTEMA_BACKUP'" mat-flat-button color="warn"
        (click)="restoreFromFile()"
        [disabled]="loading">
  <mat-icon>restore</mat-icon>
  <span>{{ isPostgres ? 'Elegir archivo .dump, .sql o .frcbak...' : 'Elegir archivo .db o .frcbak...' }}</span>
</button>
```

**Falta:** `[disabled]="loading || isRemote"` + tooltip explicativo

---

### ❌ **Problema 2: Exportar a archivo sin bloqueo**

**Líneas afectadas:** L115-126

```html
<!-- ACTUAL (línea 115-119) -->
<button *appHasPermission="'SISTEMA_BACKUP'" mat-stroked-button
        (click)="createAndExport(false)"
        [disabled]="loading">
  <mat-icon>file_download</mat-icon>
  <span>Exportar BD a archivo...</span>
</button>
```

**Falta:** `[disabled]="loading || isRemote"` + tooltip

---

### ❌ **Problema 3: Resetear BD accesible en remoto**

**Líneas afectadas:** L403-406

```html
<!-- ACTUAL (línea 403-406) -->
<button *appHasPermission="'SISTEMA_BACKUP'" mat-flat-button color="warn" 
        (click)="resetDatabase()" 
        [disabled]="loading">
  <mat-icon>delete_forever</mat-icon>
  <span>Resetear base de datos</span>
</button>
```

Este es **crítico**: permite que un usuario remoto intente borrar la BD del servidor.

---

### ❌ **Problema 4: Gestión de carpeta de backups sin protección**

**Líneas afectadas:** L338-345

```html
<!-- ACTUAL (línea 338-341) -->
<button mat-stroked-button (click)="pickCustomBackupDir()">
  <mat-icon>folder_open</mat-icon>
  <span>Cambiar</span>
</button>
```

`pickFolder()` usa un dialog nativo de Electron (IPC), no funciona en HTTP.

---

### ⚠️ **Problema 5: Eliminar backup desde menú**

**Líneas afectadas:** L214-217

```html
<button *appHasPermission="'SISTEMA_BACKUP'" mat-menu-item (click)="deleteBackup(row)">
  <mat-icon>delete</mat-icon>
  <span>Eliminar</span>
</button>
```

Según la spec, `delete` debe deshabilitarse en remoto. Actualmente accesible.

---

### ✅ **Verificado: Backup local NO se deshabilita**

Los botones de `createBackupLocal()` (L103-114) **NO** usan `isRemote` en su lógica, por lo tanto siguen funcionando en remoto. ✓ Correcto según spec.

---

### ✅ **Verificado: Standalone local no pierde restore**

La detección `isRemote` solo es `true` cuando el protocolo es HTTP. En standalone local (Electron con `file://` o `app://`), `isRemote` será `false`, por lo que los controles de restore seguirán disponibles. ✓ Correcto.

---

## Canales IPC Potencialmente Bloqueados

Según la arquitectura de FRC Gourmet (modo client redirige a HTTP), estos handlers IPC están en juego:

| Handler Electron | Operación UI | Bloqueado en HTTP |
|-----------------|--------------|-------------------|
| `backup:pick-restore-file` | `restoreFromFile()` | ✅ Sí |
| `backup:restore` | `restoreFromList()` / `restoreFromFile()` | ✅ Sí |
| `backup:create-and-export` | `createAndExport()` | ✅ Sí |
| `backup:pick-folder` | `pickCustomBackupDir()` | ✅ Sí |
| `backup:delete` | `deleteBackup()` | ✅ Sí |
| `backup:reset-db` | `resetDatabase()` | ✅ Sí |
| `backup:set-config` | `saveConfig()` (solo campo `customBackupDir`) | ⚠️ Parcial |
| `backup:create-local` | `createBackupLocal()` | ❌ No (debe funcionar) |
| `backup:trigger-auto-now` | `triggerAutoBackupNow()` | ❌ No (debe funcionar) |
| `backup:send-whatsapp` | `sendBackupWhatsapp()` | ❌ No (debe funcionar) |

**Nota:** No confirmé el nombre exacto de los canales IPC porque el diff no incluye `electron/handlers/`, pero la lógica es inferible.

---

## Clear Images (No Encontrado)

La spec menciona "clear-images" como operación a deshabilitar. **No encontré** ningún método o botón relacionado con limpiar imágenes en estos archivos. Posibles escenarios:

1. La funcionalidad no existe en este componente (puede estar en otro lado)
2. Se refiere a una operación futura no implementada
3. Error en la spec

**Recomendación:** Solicitar aclaración sobre `clear-images`.

---

## Recomendaciones de Implementación

### 1. **Template: Deshabilitar botones críticos**

Agregar `[disabled]="loading || isRemote"` y tooltips:

```html
<!-- Ejemplo: Restaurar desde archivo -->
<button *appHasPermission="'SISTEMA_BACKUP'" mat-flat-button color="warn"
        (click)="restoreFromFile()"
        [disabled]="loading || isRemote"
        [matTooltip]="isRemote ? 'No disponible en modo remoto (/admin o cliente)' : 'Reemplaza la BD actual'">
  <mat-icon>restore</mat-icon>
  <span>{{ isPostgres ? 'Elegir archivo .dump, .sql o .frcbak...' : 'Elegir archivo .db o .frcbak...' }}</span>
</button>
```

### 2. **Menús contextuales: Ocultar items bloqueados**

```html
<button *appHasPermission="'SISTEMA_BACKUP'" mat-menu-item 
        (click)="restoreFromList(row)"
        [disabled]="isRemote">
  <mat-icon>restore</mat-icon>
  <span>Restaurar este backup</span>
</button>
```

O directamente con `*ngIf`:

```html
<button *ngIf="!isRemote" *appHasPermission="'SISTEMA_BACKUP'" mat-menu-item (click)="restoreFromList(row)">
  <mat-icon>restore</mat-icon>
  <span>Restaurar este backup</span>
</button>
```

### 3. **Mensaje informativo en cards afectadas**

Agregar un banner en la card de "Restaurar desde archivo":

```html
<mat-card class="action-card">
  <mat-card-header>
    <mat-card-title>Restaurar desde archivo</mat-card-title>
    <mat-card-subtitle *ngIf="!isRemote">Reemplaza la BD actual con un backup. La app se reinicia.</mat-card-subtitle>
    <mat-card-subtitle *ngIf="isRemote" class="remote-warning">
      ⚠️ Restaurar backups solo está disponible en modo standalone local (no /admin ni cliente).
    </mat-card-subtitle>
  </mat-card-header>
  <mat-card-content>
    <button *appHasPermission="'SISTEMA_BACKUP'" mat-flat-button color="warn"
            (click)="restoreFromFile()"
            [disabled]="loading || isRemote">
      <mat-icon>restore</mat-icon>
      <span>{{ isPostgres ? 'Elegir archivo .dump, .sql o .frcbak...' : 'Elegir archivo .db o .frcbak...' }}</span>
    </button>
  </mat-card-content>
</mat-card>
```

### 4. **Guardar config: Lógica condicional**

Opción A (simple): Deshabilitar "Cambiar carpeta" y "Default", permitir guardar el resto:

```html
<button mat-stroked-button (click)="pickCustomBackupDir()" [disabled]="isRemote">
  <mat-icon>folder_open</mat-icon>
  <span>Cambiar</span>
</button>
```

Opción B (compleja): Split `saveConfig()` en dos métodos, uno para configs remotas (intervalos, WhatsApp) y otro para locales (carpeta).

### 5. **WhatsApp: Sin validación de número**

La spec dice "sin pedir un número libre si el handler ignora destino". El código actual en L270-274 SÍ valida `config.whatsappDestino` y muestra error si está vacío. **Verificar** si el handler backend realmente necesita el destino o puede usar uno default. Si el handler ignora el parámetro, remover la validación del método `sendBackupWhatsapp()`.

---

## Checklist de Verificación

| Item | Estado | Notas |
|------|--------|-------|
| ✅ `isRemote` no deshabilita `backup-create` | ✅ OK | Confirmado en código |
| ✅ Standalone local no pierde `restore` | ✅ OK | Lógica de detección correcta |
| ❌ Botones bloqueados usan `[disabled]="isRemote"` | ❌ FALTA | Ningún botón lo usa |
| ❌ Tooltips/mensajes claros en UI | ❌ FALTA | Sin mensajes de modo remoto |
| ❌ Menú contextual oculta/deshabilita items | ❌ FALTA | Todos los menús activos |
| ⚠️ `clear-images` implementado | ⚠️ NO ENCONTRADO | Verificar spec |
| ⚠️ `sendBackupWhatsapp` sin validar destino | ⚠️ A VERIFICAR | Depende del handler |

---

## Impacto en Experiencia de Usuario

### Escenario Actual (Post-Diff)

1. Usuario en `/admin` (servidor HTTP en LAN)
2. Navega a Configuración → Backup y Restauración
3. Ve el botón **"Restaurar desde archivo"** activo
4. Hace clic → Error en snackbar: _"Error al elegir archivo: channel_bloqueado_para_http"_
5. **Confusión:** ¿Por qué está activo si no funciona?

### Escenario Esperado

1. Usuario en `/admin`
2. Navega a Backup
3. Ve el botón **deshabilitado (gris)** con tooltip: _"No disponible en modo remoto"_
4. O ve un mensaje claro: _"Restaurar backups requiere acceso standalone local"_
5. **Claridad:** Entiende la limitación sin intentar la acción

---

## Archivos No Incluidos en el Diff

El diff solo muestra cambios en `backup-restore.component.ts`. Estos archivos NO fueron modificados (confirmado por ausencia en el diff):

- ❌ `backup-restore.component.html` — Sin cambios (problema principal)
- ❌ `backup-restore.component.scss` — Sin cambios (posibles estilos para warnings)
- ❌ `restore-confirm-dialog.component.ts` — Sin cambios (podría necesitar validación de modo)
- ❌ `reset-db-confirm-dialog.component.ts` — Sin cambios (ídem)

---

## Conclusión

### Veredicto: **IMPLEMENTACIÓN INCOMPLETA - REQUIERE CORRECCIÓN**

El diff introduce la **detección correcta** de modo remoto mediante `isRemote`, pero **no aplica esta información en ningún control de la UI**. Todos los botones y menús que invocan canales IPC bloqueados siguen activos, exponiendo al usuario a errores crudos sin explicación.

### Próximos Pasos Recomendados

1. ✅ **Aplicar `[disabled]="isRemote"`** en todos los botones de la lista de operaciones bloqueadas
2. ✅ **Agregar tooltips** con `[matTooltip]="isRemote ? 'Mensaje...' : ''"` para explicar por qué está deshabilitado
3. ✅ **Agregar banners informativos** en las cards afectadas (Restaurar, Reset BD)
4. ⚠️ **Revisar `saveConfig()`**: decidir si se deshabilita completo o solo la gestión de carpetas
5. ⚠️ **Aclarar `clear-images`**: buscar en otros componentes o confirmar spec
6. ⚠️ **Verificar `sendBackupWhatsapp`**: si el handler ignora el destino, remover validación

### Riesgos de Merge Actual

- 🔴 **ALTO:** Usuarios remotos pueden intentar resetear la BD del servidor
- 🔴 **ALTO:** Restauración genera errores confusos en modo cliente
- 🟡 **MEDIO:** Exportar/eliminar backups muestran error crudo
- 🟢 **BAJO:** Backups locales y auto-backup funcionan correctamente

---

**Auditor:** Claude Sonnet (Cursor Cloud Agent)  
**Rama auditada:** `cursor/fix-265-backup-remoto-759b` @ commit HEAD  
**Documento generado:** `docs/planes/AUDIT-DIFF-265-UI.md`
