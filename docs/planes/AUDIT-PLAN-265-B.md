# AUDITORÍA EJE B — PLAN-265-BACKUP-REMOTO
## Correctitud contra código real, drivers, permisos, tests

**Fecha:** 2026-09-09  
**Rama:** `cursor/fix-265-backup-remoto-759b`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/295  
**Issue:** #265  
**Plan auditado:** `docs/planes/PLAN-265-BACKUP-REMOTO.md`

---

## VEREDICTO: **FAIL**

El plan presenta **riesgos críticos (P0)** que lo hacen **no implementable en su forma actual**. Dos canales propuestos para abrir NO deben salir de la deny-list sin cambios arquitectónicos profundos: `backup-create-and-export` (diálogo nativo) y `backup-send-whatsapp` (exfiltración sin control de destino).

---

## HALLAZGOS

### ✅ **PASS — Permiso SISTEMA_BACKUP está correctamente implementado**

**Verificado:**
- Código del permiso: `SISTEMA_BACKUP` (confirmado en `electron/handlers/permissions.handler.ts:139`)
- Descripción: `"Crear y restaurar backups de la base de datos"` (módulo: `SISTEMA`)
- `ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP')` está presente como **primera sentencia** después del `try` en todos los handlers que el plan propone abrir:

| Handler | Línea | ensurePermission |
|---------|-------|------------------|
| `backup-create` | 495 | ✅ |
| `backup-create-and-export` | 511 | ✅ |
| `backup-send-whatsapp` | 669 | ✅ |
| `backup-config-set` | 720 | ✅ |
| `backup-trigger-auto-now` | 746 | ✅ |

**Conclusión:** El guard de permisos está correctamente ubicado. El problema no es la ausencia del permiso, sino el comportamiento de los handlers en contexto HTTP.

---

### ✅ **PASS — Manejo dual SQLite/Postgres**

**Verificado:**
- `electron/handlers/backup.handler.ts` maneja ambos drivers correctamente.
- Función `writeBackupTo` (línea 103): ramifica según `getDbType(userDataPath)`.
- SQLite: copia directa del `.db` o pack `.frcbak` con imágenes.
- Postgres: `pg_dump` en formato `custom` (`.dump`) o `plain` (`.sql`), configurable vía `BackupConfig.pgFormat`.
- El plan NO asume un solo driver — la implementación es driver-aware.

**Conclusión:** El código maneja correctamente ambos drivers. No hay riesgo en este aspecto.

---

### 🔴 **P0 — backup-create-and-export usa dialog nativo en mode=server**

**Archivo:** `electron/handlers/backup.handler.ts:528`

**Problema:**
```typescript
const saveResult = await dialog.showSaveDialog({
  title: 'Guardar backup como...',
  defaultPath: defaultName,
  filters,
});
```

`dialog.showSaveDialog()` es un **diálogo nativo de Electron** que se ejecuta en el proceso principal del servidor. Cuando un cliente HTTP remoto invoca `backup-create-and-export`:

1. El handler abre un diálogo **en la máquina del servidor** (invisible para el cliente remoto).
2. El handler se bloquea esperando que **alguien** cierre el diálogo en el servidor.
3. Si nadie está frente al servidor, el request queda colgado indefinidamente.
4. El cliente remoto recibe un timeout o espera infinita.

**Riesgo:**
- **DoS accidental:** Un operador remoto puede bloquear el servidor abriendo diálogos que nadie cerrará.
- **Superficie de ataque:** Un atacante con `SISTEMA_BACKUP` puede saturar el servidor con requests que abren diálogos.
- **UX rota:** La funcionalidad es inútil para clientes remotos (el diálogo no se muestra en su pantalla).

**Propuesta del plan:**
> "Permitir por HTTP (con guard SISTEMA_BACKUP ya presente en los handlers): backup-create-and-export"

**Veredicto:**  
❌ **NO debe salir de la deny-list** sin un cambio arquitectónico que elimine el diálogo nativo o detecte contexto HTTP y retorne error explícito.

**Fix recomendado:**
```typescript
// Detectar si el call viene de HTTP (context HTTP no tiene BrowserWindow)
if (esContextoHttp()) {
  return { success: false, message: 'backup-create-and-export no está disponible en modo remoto. Use backup-create.' };
}
const saveResult = await dialog.showSaveDialog({ ... });
```

**Alternativa:**  
Mantener `backup-create-and-export` bloqueado para HTTP y documentar que los clientes remotos deben usar `backup-create` (guarda en el directorio configurado) + descargar el archivo por otro medio (FTP, samba, rsync).

---

### 🔴 **P0 — backup-send-whatsapp permite exfiltración sin control de destino**

**Archivo:** `electron/handlers/backup.handler.ts:688`

**Problema:**
```typescript
const destinoRaw = (opts.destino || config.whatsappDestino || '').trim();
```

El handler acepta `opts.destino` como parámetro del request, con prioridad sobre `config.whatsappDestino`. Un usuario con permiso `SISTEMA_BACKUP` puede:

1. Crear un backup completo (BD + imágenes) con `backup-create`.
2. Enviar ese backup a **cualquier número de WhatsApp** especificando `destino` en el request.
3. Exfiltrar datos sensibles (clientes, ventas, funcionarios, salarios, contraseñas hasheadas) a un número externo.

**Validaciones presentes:**
- ✅ Archivo debe estar en `config.customBackupDir` (path traversal bloqueado).
- ✅ Archivo debe existir y pesar menos de 100 MB.
- ❌ **NO hay validación del número de destino** contra una whitelist.

**Riesgo:**
- **Exfiltración de datos:** Un operador malicioso con `SISTEMA_BACKUP` (administrador) puede enviar el dump completo de la BD a un tercero.
- **Superficie de ataque ampliada:** Aunque `SISTEMA_BACKUP` es permiso de SISTEMA (alto privilegio), el plan amplía el acceso remoto sin mitigación.

**Propuesta del plan:**
> "Permitir por HTTP (con guard SISTEMA_BACKUP ya presente en los handlers): backup-send-whatsapp"
>
> "F-3: Un usuario con permiso SISTEMA_BACKUP puede generar un backup completo (BD + imágenes) y enviarlo a un número de WhatsApp **arbitrario**."

El plan **reconoce el riesgo** (F-3) pero lo mitiga solo con:  
> "Mitigación: El permiso SISTEMA_BACKUP es de nivel SISTEMA, reservado para administradores."

**Veredicto:**  
❌ **NO debe salir de la deny-list** sin controles adicionales: whitelist de destinos, log de auditoría obligatorio, o deshabilitar `opts.destino` y forzar solo `config.whatsappDestino`.

**Fix recomendado (mínimo P1):**
```typescript
// Ignorar opts.destino en contexto HTTP — solo usar config
if (esContextoHttp() && opts.destino && opts.destino !== config.whatsappDestino) {
  return { success: false, message: 'El destino de WhatsApp solo puede configurarse en el servidor (Backup → Configuración).' };
}
const destinoRaw = config.whatsappDestino || '';
```

**Fix ideal (P0):**
- Whitelist de destinos permitidos en `BackupConfig.whatsappDestinosPermitidos: string[]`.
- Log de auditoría en tabla `sistema.backup_log` con timestamp, usuario, archivo, destino, IP.
- Notificación al admin principal cuando se envía un backup por WhatsApp desde cliente remoto.

---

### 🟠 **P1 — backup-config-set permite redirigir backups automáticos**

**Archivo:** `electron/handlers/backup.handler.ts:720`

**Problema:**
```typescript
if (typeof next.whatsappDestino === 'string') next.whatsappDestino = next.whatsappDestino.trim() || undefined;
```

El handler permite modificar `whatsappDestino` sin restricción. Combinado con `backup-trigger-auto-now`, un atacante puede:

1. Cambiar `whatsappDestino` a su propio número vía `backup-config-set`.
2. Forzar un backup automático con `backup-trigger-auto-now`.
3. Recibir el backup en su WhatsApp sin que el administrador legítimo lo sepa.

**Mitigación parcial:**
- `SISTEMA_BACKUP` es permiso alto (solo administradores).
- Log del sistema (stdout) registra `"Error enviando backup por WhatsApp:"` en caso de fallo, pero NO registra envíos exitosos con destino.

**Riesgo:**
- **Exfiltración silenciosa:** Un admin malicioso o comprometido puede redirigir backups sin dejar rastro claro.
- **Superficie ampliada en modo remoto:** El plan abre este canal a clientes HTTP, multiplicando los vectores de ataque.

**Veredicto:**  
⚠️ **PASS-with-fixes** — Puede salir de la deny-list SI se implementa:
1. Validación de `whatsappDestino` contra whitelist (o campo de solo-lectura para HTTP).
2. Log de auditoría en BD al modificar la configuración (tabla `sistema.config_changes` con usuario, campo, valor anterior/nuevo, timestamp).

**Fix recomendado:**
```typescript
// No permitir cambio de whatsappDestino desde HTTP
if (esContextoHttp() && partial.whatsappDestino !== undefined) {
  return { success: false, message: 'whatsappDestino solo puede configurarse desde el servidor.' };
}
```

---

### 🟠 **P1 — backup-trigger-auto-now + backup-config-set: escritura en path arbitrario**

**Archivo:** `electron/handlers/backup.handler.ts:746-759`

**Problema:**
`backup-config-set` permite modificar `customBackupDir` (línea 728 implícito en `next: BackupConfig = { ...current, ...partial }`). Un atacante puede:

1. Cambiar `customBackupDir` a `/tmp/exfiltrado/` (o cualquier path donde el servidor tenga permisos de escritura).
2. Llamar `backup-trigger-auto-now`.
3. El backup se guarda en `/tmp/exfiltrado/`, exfiltrable vía acceso SSH, FTP, o vulnerabilidad posterior.

**Validación presente:**
- ❌ **NO hay validación de `customBackupDir`** contra un path base permitido.

**Mitigación parcial:**
- El servidor no tiene permisos de escritura arbitrarios (depende del usuario del proceso Electron).
- `SISTEMA_BACKUP` es permiso alto.

**Riesgo:**
- **Path traversal en escritura:** Aunque limitado por permisos del FS, un atacante podría escribir backups en ubicaciones inesperadas (`/var/www/html/backup.frcbak` → descarga vía HTTP si hay web server).

**Veredicto:**  
⚠️ **PASS-with-fixes** — Puede salir de la deny-list SI se implementa validación de `customBackupDir`:

**Fix recomendado:**
```typescript
// Validar que customBackupDir sea un path absoluto dentro de userData o una whitelist
if (next.customBackupDir) {
  const resolved = path.resolve(next.customBackupDir);
  const allowed = path.resolve(userDataPath);
  if (!resolved.startsWith(allowed + path.sep) && resolved !== allowed) {
    return { success: false, message: 'El directorio de backups debe estar dentro de userData.' };
  }
}
```

---

### 🟡 **P2 — backup-pick-folder y backup-pick-restore-file sin ensurePermission**

**Archivos:**
- `electron/handlers/backup.handler.ts:640` (backup-pick-folder)
- `electron/handlers/backup.handler.ts:578` (backup-pick-restore-file)

**Problema:**
Estos handlers **NO tienen `ensurePermission`** (solo abren diálogos nativos, no mutanstate). El plan propone mantenerlos en la deny-list y ocultarlos en UI remota:

> "**Mantener bloqueados** (destructivos, diálogos nativos, solo útiles en desktop): backup-restore, backup-db-reset, backup-clear-images, backup-delete, **backup-pick-folder, backup-pick-restore-file**."

**Verificado en código:**
- `backup-pick-folder` (línea 640): NO tiene `ensurePermission`.
- `backup-pick-restore-file` (línea 578): NO tiene `ensurePermission`.
- Ambos abren `dialog.showOpenDialog()` (nativo).

**Veredicto:**  
✅ **PASS** — El plan correctamente propone mantenerlos bloqueados. Sufren el mismo problema de diálogo nativo que `backup-create-and-export` (P0).

**Confirmación adicional:**
- `src/app/web/api-http.ts:292-293` devuelve `null` para estos handlers en modo HTTP.
- La UI remota ya los oculta (stub que retorna `null`).

---

### ❌ **FAIL — No hay test que prevenga re-apertura de canales destructivos**

**Archivo:** `scripts/test-permissions-e2e.ts:543`

**Test existente:**
```typescript
// `backup-create` está en BLOCKED_CHANNELS: /api/rpc lo corta antes de
// llegar al handler, para cualquier usuario (ver rpc-router.ts).
await asserRpcCanalBloqueado(cajeroToken, 'backup-create', 'HTTP cajero ✗ backup-create (canal bloqueado)');
```

El test verifica que `backup-create` está bloqueado, pero:

1. **NO hay test para `backup-restore`** (destructivo, debe seguir bloqueado).
2. **NO hay test para `backup-db-reset`** (destructivo).
3. **NO hay test para `backup-clear-images`** (destructivo).
4. **NO hay test que falle** si alguien saca estos canales de la deny-list en el futuro.

**Propuesta del plan:**
> "Smoke test remoto (P2 — hacer si el tiempo lo permite): Un script que levante el servidor, haga login HTTP, y verifique:
> - Crear backup → funciona (con permiso SISTEMA_BACKUP)
> - **Sin permiso SISTEMA_BACKUP → HTTP 403 con mensaje de permiso**
> - backup-restore → 403 channel_bloqueado (ni admin pasa)
> - **Enviar WhatsApp** → funciona (con permiso + destino configurado + Evolution activa)"

**Riesgo:**
- Sin test regresivo, alguien puede sacar `backup-restore` de `BLOCKED_CHANNELS` en un merge y habilitar restauración destructiva vía HTTP sin darse cuenta.

**Veredicto:**  
❌ **FAIL** — El plan NO propone un test específico que falle si `backup-restore`, `backup-db-reset`, o `backup-clear-images` son removidos de la deny-list. El smoke test es marcado como P2 (opcional).

**Fix recomendado:**
Agregar en `scripts/test-permissions-e2e.ts`:

```typescript
// Test P0: canales destructivos deben quedar bloqueados para siempre (ni admin)
await asserRpcCanalBloqueado(adminToken, 'backup-restore', 'HTTP admin ✗ backup-restore (destructivo, bloqueado)');
await asserRpcCanalBloqueado(adminToken, 'backup-db-reset', 'HTTP admin ✗ backup-db-reset (destructivo, bloqueado)');
await asserRpcCanalBloqueado(adminToken, 'backup-clear-images', 'HTTP admin ✗ backup-clear-images (destructivo, bloqueado)');
await asserRpcCanalBloqueado(adminToken, 'backup-pick-folder', 'HTTP admin ✗ backup-pick-folder (diálogo nativo, bloqueado)');
await asserRpcCanalBloqueado(adminToken, 'backup-pick-restore-file', 'HTTP admin ✗ backup-pick-restore-file (diálogo nativo, bloqueado)');
```

Este test debe ser **P0**, no P2 — es la regla dura que previene regresiones.

---

## RESPUESTAS A LAS PREGUNTAS DEL EJE B

### 1. ¿Los handlers existen y ensurePermission SISTEMA_BACKUP es la primera sentencia?

✅ **SÍ.** Todos los handlers propuestos para abrir tienen `ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP')` como primera sentencia después del `try`. El código del permiso es exactamente `SISTEMA_BACKUP` (no otro).

| Handler | ensurePermission | Primera sentencia |
|---------|------------------|-------------------|
| backup-create | ✅ Línea 495 | ✅ |
| backup-create-and-export | ✅ Línea 511 | ✅ |
| backup-send-whatsapp | ✅ Línea 669 | ✅ |
| backup-config-set | ✅ Línea 720 | ✅ |
| backup-trigger-auto-now | ✅ Línea 746 | ✅ |

### 2. ¿Alguno de los "no destructivos" escribe config, dispara WhatsApp, o puede pisar un backup / exfiltrar el dump?

🔴 **SÍ.**

- **backup-config-set** escribe configuración (`writeBackupConfig`, línea 732), incluyendo `whatsappDestino` y `customBackupDir`.
- **backup-send-whatsapp** dispara envío por WhatsApp (`sendWhatsappDocumentFile`, línea 702) con destino controlado por el caller (`opts.destino` tiene prioridad sobre `config.whatsappDestino`, línea 688).
- **backup-create** y **backup-trigger-auto-now** escriben backups en disco (no "pisan" backups existentes — generan nombres únicos con timestamp — pero sí llenan el disco).

**El plan NO cubre adecuadamente estos riesgos:**
- F-3 menciona exfiltración por WhatsApp pero mitiga solo con "permiso alto".
- NO menciona escritura de config ni path arbitrario de backup.

### 3. backup-create-and-export y backup-send-whatsapp: ¿qué hacen de verdad en mode=server cuando el caller es HTTP?

🔴 **backup-create-and-export:**
- Abre `dialog.showSaveDialog()` en el **servidor** (línea 528).
- El diálogo es **invisible** para el cliente HTTP.
- El handler se **bloquea** esperando interacción humana en el servidor.
- **DoS** potencial (requests colgados, recursos bloqueados).

🟠 **backup-send-whatsapp:**
- Envía el archivo especificado por WhatsApp usando Evolution API (`sendWhatsappDocumentFile`, línea 702).
- El destino es `opts.destino ?? config.whatsappDestino` (línea 688) — **el caller HTTP controla el destino**.
- **Exfiltración** sin control de whitelist.
- El dump **NO queda descargable** vía HTTP (se envía por WhatsApp), pero el riesgo de exfiltración es equivalente.

### 4. ¿SQLite vs Postgres cambia el backup? ¿El plan asume un solo driver?

✅ **SÍ, cambia.** El código maneja ambos drivers correctamente:

- **SQLite:** Copia del `.db` o pack `.frcbak` (con imágenes).
- **Postgres:** `pg_dump` en formato `custom` (`.dump`) o `plain` (`.sql`).

El plan **NO asume un solo driver** — menciona explícitamente Postgres en varios puntos (líneas 51, 96, 147 del plan).

### 5. ¿Qué test existente cubre rpc deny-list? ¿El plan propone un test que falle si se vuelve a permitir restore por HTTP?

🔴 **Test existente:**
- `scripts/test-permissions-e2e.ts:543` verifica que `backup-create` está bloqueado.
- **NO hay test** para `backup-restore`, `backup-db-reset`, `backup-clear-images`.

🔴 **Propuesta del plan:**
- Smoke test marcado como **P2 (opcional)**, no P0.
- NO propone test específico que **falle** si `backup-restore` sale de la deny-list.

**Veredicto:**  
❌ **FAIL** — Sin test P0, el sistema es vulnerable a regresiones.

### 6. Regla dura: ensurePermission primera sentencia de todo handler que muta. ¿Un canal que sale de la deny-list sin permiso real es P0?

✅ **Todos los handlers cumplen.** No hay canal propuesto que salga de la deny-list sin `ensurePermission`.

**PERO:** El problema NO es la ausencia de `ensurePermission`, sino el **comportamiento** de los handlers en contexto HTTP (diálogos nativos, exfiltración sin whitelist).

---

## CANALES QUE NO DEBEN SALIR DE LA DENY-LIST

### ❌ **backup-create-and-export**

**Razón:** Usa `dialog.showSaveDialog()` (nativo). Bloquea el servidor en contexto HTTP. Inútil y peligroso (DoS).

**Fix requerido:** Detectar contexto HTTP y retornar error, O eliminar del plan.

### ❌ **backup-send-whatsapp** (en su forma actual)

**Razón:** Acepta destino arbitrario (`opts.destino`). Exfiltración sin control.

**Fix requerido:** Deshabilitar `opts.destino` en contexto HTTP, O implementar whitelist + auditoría.

---

## CANALES QUE PUEDEN SALIR CON FIXES (P1)

### ⚠️ **backup-config-set**

**Condición:** Bloquear modificación de `whatsappDestino` y validar `customBackupDir` desde HTTP.

### ⚠️ **backup-trigger-auto-now**

**Condición:** Validación de `customBackupDir` (depende de fix de `backup-config-set`).

---

## CANALES SEGUROS PARA ABRIR (✅)

### ✅ **backup-create**

**Razón:**
- ✅ `ensurePermission` presente (línea 495).
- ✅ Solo escribe en `getBackupDir(userDataPath, config.customBackupDir)` (validación de path presente en otros handlers — falta en `backup-create`, pero el risk es menor porque no acepta path del caller).
- ✅ No abre diálogos nativos.
- ✅ No envía datos fuera del servidor.

**Riesgo residual:** Llenado de disco (mitigado por `retentionCount`).

**Veredicto:** **PASS** — puede salir de la deny-list.

---

## RESUMEN EJECUTIVO

| Canal | Propuesta del plan | Veredicto auditoría | Riesgo | Fix requerido |
|-------|-------------------|---------------------|--------|---------------|
| backup-create | ✅ Abrir | ✅ PASS | Bajo | Ninguno |
| backup-create-and-export | ✅ Abrir | ❌ **FAIL** | **P0 — DoS** | Detectar HTTP y rechazar, O eliminar del plan |
| backup-send-whatsapp | ✅ Abrir | ❌ **FAIL** | **P0 — Exfiltración** | Deshabilitar `opts.destino` en HTTP + whitelist + auditoría |
| backup-config-set | ✅ Abrir | ⚠️ PASS-with-fixes | **P1** | Bloquear `whatsappDestino` + validar `customBackupDir` |
| backup-trigger-auto-now | ✅ Abrir | ⚠️ PASS-with-fixes | **P1** | (Depende de fix anterior) |
| backup-restore | ❌ Mantener bloqueado | ✅ Correcto | N/A | Agregar test P0 |
| backup-db-reset | ❌ Mantener bloqueado | ✅ Correcto | N/A | Agregar test P0 |
| backup-clear-images | ❌ Mantener bloqueado | ✅ Correcto | N/A | Agregar test P0 |
| backup-pick-folder | ❌ Mantener bloqueado | ✅ Correcto | N/A | N/A |
| backup-pick-restore-file | ❌ Mantener bloqueado | ✅ Correcto | N/A | N/A |

---

## RECOMENDACIONES

### 1. NO implementar el plan en su forma actual (BLOCKER)

Dos canales con riesgo P0:
- `backup-create-and-export` → diálogo nativo → DoS
- `backup-send-whatsapp` → exfiltración sin whitelist

### 2. Plan mínimo viable (eliminar riesgos P0)

**Abrir solo:**
- ✅ `backup-create` (seguro)

**Mantener bloqueados:**
- ❌ `backup-create-and-export`
- ❌ `backup-send-whatsapp`
- ❌ `backup-config-set`
- ❌ `backup-trigger-auto-now`
- ❌ Todos los destructivos (restore, reset, clear, delete)

**Agregar test P0:**
```typescript
// scripts/test-permissions-e2e.ts
await asserRpcCanalBloqueado(adminToken, 'backup-restore', '...');
await asserRpcCanalBloqueado(adminToken, 'backup-db-reset', '...');
await asserRpcCanalBloqueado(adminToken, 'backup-clear-images', '...');
```

### 3. Plan completo con fixes (post-fixes P0+P1)

**Si se implementan los fixes:**

1. **backup-create-and-export:**
   - Detectar contexto HTTP y retornar `{ success: false, message: 'No disponible en modo remoto' }`.
   - O mejor: eliminar del plan — `backup-create` es suficiente.

2. **backup-send-whatsapp:**
   - Ignorar `opts.destino` en contexto HTTP (forzar `config.whatsappDestino`).
   - Implementar whitelist `BackupConfig.whatsappDestinosPermitidos: string[]`.
   - Log de auditoría en tabla `sistema.backup_whatsapp_log` (usuario, archivo, destino, timestamp, IP).

3. **backup-config-set:**
   - Bloquear modificación de `whatsappDestino` desde HTTP.
   - Validar `customBackupDir` contra path base (userData).
   - Log de auditoría en `sistema.config_changes`.

4. **backup-trigger-auto-now:**
   - (Seguro después de fix de backup-config-set)

5. **Test P0:**
   - Agregar tests para todos los canales destructivos (evitar regresiones).

---

## ANEXO — EVIDENCIA DE CÓDIGO

### A.1 — ensurePermission presente en todos los handlers

```typescript
// electron/handlers/backup.handler.ts

// backup-create (línea 493-507)
ipcMain.handle('backup-create', async (_e, opts: { includeImages?: boolean; customDir?: string; notes?: string }) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP'); // ✅
    return await createBackupInternal({ ... });
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error desconocido' };
  }
});

// backup-create-and-export (línea 509-549)
ipcMain.handle('backup-create-and-export', async (_e, opts: { includeImages?: boolean; notes?: string }) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP'); // ✅
    const saveResult = await dialog.showSaveDialog({ ... }); // ⚠️ DIÁLOGO NATIVO
    // ...
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error desconocido' };
  }
});

// backup-send-whatsapp (línea 667-708)
ipcMain.handle('backup-send-whatsapp', async (_e, opts: { fullPath: string; destino?: string; caption?: string }) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP'); // ✅
    const destinoRaw = (opts.destino || config.whatsappDestino || '').trim(); // ⚠️ DESTINO CONTROLADO POR CALLER
    // ...
    await sendWhatsappDocumentFile(evolution, apikey, destino, resolved, { fileName, caption });
    return { success: true, destino, messageId: res.id };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error desconocido' };
  }
});

// backup-config-set (línea 718-741)
ipcMain.handle('backup-config-set', async (_e, partial: Partial<BackupConfig>) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP'); // ✅
    const next: BackupConfig = { ...current, ...partial }; // ⚠️ ACEPTA whatsappDestino Y customBackupDir SIN VALIDACIÓN
    writeBackupConfig(userDataPath, next);
    return { success: true, config: { ...next, nextAutoBackupAt: nextAutoBackupAt?.toISOString() ?? null } };
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error desconocido' };
  }
});

// backup-trigger-auto-now (línea 744-764)
ipcMain.handle('backup-trigger-auto-now', async () => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP'); // ✅
    const result = await createBackupInternal({
      customDir: cfg.customBackupDir, // ⚠️ USA customBackupDir SIN VALIDACIÓN
      // ...
    });
    return result;
  } catch (error: any) {
    return { success: false, message: error?.message || 'Error desconocido' };
  }
});
```

### A.2 — Código del permiso SISTEMA_BACKUP

```typescript
// electron/handlers/permissions.handler.ts:139
{ codigo: 'SISTEMA_BACKUP', descripcion: 'Crear y restaurar backups de la base de datos', modulo: 'SISTEMA' }
```

### A.3 — Deny-list actual en rpc-router.ts

```typescript
// electron/server/rpc-router.ts:33-52
const BLOCKED_CHANNELS = new Set<string>([
  'set-current-user',
  'reset-database',
  'restart-app',

  // Backups y restauración (destructivos / filesystem del servidor)
  'backup-db-reset',
  'backup-clear-images',
  'backup-restore',
  'backup-delete',
  'backup-create',              // ⬅ PROPONE ABRIR
  'backup-create-and-export',   // ⬅ PROPONE ABRIR (⚠️ DIÁLOGO NATIVO)
  'backup-trigger-auto-now',    // ⬅ PROPONE ABRIR
  'backup-config-set',          // ⬅ PROPONE ABRIR
  'backup-send-whatsapp',       // ⬅ PROPONE ABRIR (⚠️ EXFILTRACIÓN)
  'backup-pick-folder',         // ⬅ MANTENER BLOQUEADO (correcto)
  'backup-pick-restore-file',   // ⬅ MANTENER BLOQUEADO (correcto)

  // ... otros canales ...
]);
```

---

## FIRMA

**Auditor:** Claude Sonnet 4.5 (Cloud Agent)  
**Rama:** `cursor/fix-265-backup-remoto-759b`  
**Commit base:** (pendiente — este informe se commitea solo)

**Declaración:** Este informe NO modifica código de producción. Solo documenta hallazgos de auditoría contra el plan propuesto y el código existente.
