# Auditoría de Seguridad: PR #295 - Backup Remoto (Eje 2: Permisos RPC)

**Fecha:** 2026-09-09  
**Rama:** `cursor/fix-265-backup-remoto-759b`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/295  
**Auditor:** Claude Cloud Agent  

## Resumen Ejecutivo

Auditoría de seguridad enfocada en permisos RPC y fugas de acceso en el sistema de backup remoto. El sistema RPC es **default-allow**: cualquier canal que salga de la deny-list `BLOCKED_CHANNELS` sin la protección `ensurePermission` es un P0 (crítico).

**Veredicto:** ✅ **APROBADO** - Sin hallazgos P0. Todos los controles críticos están en su lugar.

---

## 1. Canales Desbloqueados de BLOCKED_CHANNELS

Se removieron de la deny-list los siguientes 3 canales:

| Canal | Estado en Diff | Línea (rpc-router.ts) |
|-------|---------------|---------------------|
| `backup-create` | ❌ REMOVIDO | Antes: línea 44 |
| `backup-trigger-auto-now` | ❌ REMOVIDO | Antes: línea 46 |
| `backup-send-whatsapp` | ❌ REMOVIDO | Antes: línea 47 |

**Justificación (según comentarios en código):**
- **Permitidos por HTTP:** operaciones de lectura/generación NO destructivas
- **Protegidos:** cada uno debe tener guard `SISTEMA_BACKUP` en el handler

---

## 2. Verificación de ensurePermission en Handlers

Cada handler desbloqueado **DEBE** comenzar con:
```typescript
await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
```

### 2.1 backup-create

**Archivo:** `electron/handlers/backup.handler.ts`  
**Línea:** 493-495

```typescript
ipcMain.handle('backup-create', async (_e, opts: { includeImages?: boolean; customDir?: string; notes?: string }) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
    return await createBackupInternal({
```

✅ **CONFORME** - Primera sentencia del try es ensurePermission.

---

### 2.2 backup-trigger-auto-now

**Archivo:** `electron/handlers/backup.handler.ts`  
**Línea:** 747-749

```typescript
ipcMain.handle('backup-trigger-auto-now', async () => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
    const cfg = readBackupConfig(userDataPath);
```

✅ **CONFORME** - Primera sentencia del try es ensurePermission.

---

### 2.3 backup-send-whatsapp

**Archivo:** `electron/handlers/backup.handler.ts`  
**Línea:** 668-670

```typescript
ipcMain.handle('backup-send-whatsapp', async (_e, opts: { fullPath: string; destino?: string; caption?: string }) => {
  try {
    await ensurePermission(dataSource, getCurrentUser, 'SISTEMA_BACKUP');
    if (!opts?.fullPath || !fs.existsSync(opts.fullPath)) {
```

✅ **CONFORME** - Primera sentencia del try es ensurePermission.

---

## 3. Análisis de backup-send-whatsapp: Protección de opts.destino en HTTP

### 3.1 Pregunta de Auditoría
¿Cómo se detecta si la invocación viene de HTTP? ¿Puede saltarse la protección?

### 3.2 Implementación de Detección HTTP

**Archivo:** `electron/handlers/backup.handler.ts`  
**Líneas:** 689-691

```typescript
// Enmienda #2 (auditoría): en llamadas HTTP, ignorar opts.destino y usar solo config.
// Un cliente remoto no debe poder enviar backups a números arbitrarios.
const isHttp = (_e as any)?._http === true;
const destinoRaw = (isHttp ? config.whatsappDestino : (opts.destino || config.whatsappDestino) || '').trim();
```

**Comportamiento:**
- **Modo IPC (local):** puede usar `opts.destino` → permite UI enviar a número específico
- **Modo HTTP (remoto):** IGNORA `opts.destino`, usa SOLO `config.whatsappDestino` → número fijo configurado en el servidor

---

### 3.3 Origen de la Marca `_http`

**Archivo:** `electron/utils/handler-registry.ts`  
**Líneas:** 93-100

```typescript
export async function invokeHandlerWithContext(
  channel: string,
  context: HandlerInvocationContext | undefined,
  ...args: any[]
): Promise<any> {
  const fn = handlerRegistry.get(channel);
  if (!fn) {
    throw new Error(`Handler '${channel}' no registrado en handlerRegistry`);
  }
  // El primer arg de ipcMain.handle listeners es el event. Cuando se invoca
  // desde HTTP, no hay event nativo. Pasamos un mock minimo + extras del
  // contexto del request HTTP.
  const fakeEvent: any = { sender: { id: -1 }, _http: true };
  if (context?.userId != null) fakeEvent._httpUserId = context.userId;
  if (context?.deviceId != null) fakeEvent._deviceId = context.deviceId;
  if (context?.customerId != null) fakeEvent._customerId = context.customerId;
  if (context?.clientIp != null) fakeEvent._clientIp = context.clientIp;
  return fn(fakeEvent, ...args);
}
```

**Punto crítico:** Línea 96 establece `_http: true` en el fakeEvent.

---

### 3.4 Puntos de Invocación HTTP

Todas las rutas HTTP pasan por `invokeHandlerWithContext`:

| Router | Archivo | Línea | Función Usada |
|--------|---------|-------|---------------|
| RPC principal | `electron/server/rpc-router.ts` | 163 | `invokeHandlerWithContext(method, ctx, ...)` |
| Rutas públicas | `electron/server/public-routes.ts` | 124 | `invokeHandlerWithContext(def.channel, ctx, ...)` |
| Auth | `electron/server/auth-routes.ts` | 202-213 | `invokeHandler(...)` → internamente llama a `invokeHandlerWithContext` |

---

### 3.5 ¿Puede Saltarse la Protección?

**NO.** Análisis de vectores:

1. **Invocar handler directamente sin pasar por registry:**
   - ❌ IMPOSIBLE: Los handlers están registrados en `ipcMain` y solo son accesibles vía IPC (local) o el registry HTTP.
   - Todo request HTTP DEBE pasar por el router Fastify → RPC endpoint → `invokeHandlerWithContext`.

2. **Forjar un event con `_http: false`:**
   - ❌ IMPOSIBLE: El `fakeEvent` se crea dentro de `invokeHandlerWithContext`, no viene del cliente.
   - El cliente HTTP solo envía `{ method, params }` en el body; nunca tiene control sobre el event object.

3. **Usar un endpoint HTTP alternativo:**
   - ❌ NO EXISTE: Solo hay 3 routers HTTP (`rpc-router`, `public-routes`, `auth-routes`) y todos usan `invokeHandlerWithContext`.

✅ **CONCLUSIÓN:** La marca `_http: true` es **inmutable** y **confiable**. Un cliente remoto NO puede enviar backups a números arbitrarios.

---

## 4. Canales Críticos que Permanecen Bloqueados

Verificación de que operaciones destructivas/sensibles permanecen en `BLOCKED_CHANNELS`:

| Canal | Bloqueado? | Línea (rpc-router.ts) | Justificación |
|-------|-----------|---------------------|---------------|
| `backup-config-set` | ✅ SÍ | 47 | Configuración sensible (paths, credenciales) |
| `backup-create-and-export` | ✅ SÍ | 46 | Abre dialog nativo en servidor (DoS) |
| `backup-restore` | ✅ SÍ | 43 | Destructivo: reemplaza BD completa |
| `backup-db-reset` | ✅ SÍ | 41 | Destructivo: wipe completo de BD |
| `backup-delete` | ✅ SÍ | 44 | Destructivo: borra archivos del filesystem |
| `backup-pick-folder` | ✅ SÍ | 48 | Dialog nativo del servidor (sin sentido remoto) |
| `backup-pick-restore-file` | ✅ SÍ | 49 | Dialog nativo del servidor (sin sentido remoto) |
| `backup-clear-images` | ✅ SÍ | 42 | Destructivo: borra todas las imágenes |

✅ **CONFORME** - Todos los canales críticos permanecen bloqueados.

---

## 5. Exposición de Información Sensible al Renderer

### 5.1 Handlers SIN ensurePermission

Verificación de handlers de backup que NO requieren permiso (información pública):

#### 5.1.1 backup-get-info (línea 434)

**Devuelve:**
- `userDataPath`: ruta del userData
- `dbType`: sqlite | postgres
- `profileImagesDir`, `productoImagesDir`: rutas de directorios de imágenes
- `profileImagesSize`, `productoImagesSize`: tamaños en bytes
- `backupDir`: directorio de backups configurado
- `appVersion`: versión de la app
- Para Postgres: `dbPath` (host:port/db), `pgInfo` (host, port, database, username, schema, ssl)
- `dbExists`, `dbSize`, `dbModifiedAt`

**Análisis:**
- ❌ NO expone tokens (el apikey de Evolution se obtiene internamente con `getEvolutionApiKey()`, nunca se devuelve)
- ❌ NO expone passwords (la password de Postgres se obtiene de keytar, no se devuelve)
- ⚠️ SÍ expone: paths de directorios, host/usuario de BD (metadata necesaria para UI)

**Riesgo:** 🟡 BAJO - Información de metadata necesaria para mostrar en UI. No hay secretos.

---

#### 5.1.2 backup-list (línea 552)

**Devuelve:**
```typescript
return { dir, items: list };
```

Donde `items` es un array de:
- `fileName`: nombre del archivo de backup
- `fullPath`: ⚠️ **PATH COMPLETO** del archivo
- `size`: tamaño en bytes
- `createdAt`: fecha de creación
- `isAutomatic`: boolean
- `hasImages`: boolean
- `dbType`: sqlite | postgres | undefined

**Análisis:**
- ⚠️ SÍ expone: paths completos de archivos de backup
- ❌ NO expone: tokens ni credenciales

**Riesgo:** 🟡 BAJO - Paths de backups son información necesaria para que el usuario seleccione qué archivo restaurar/enviar. No son credenciales ni tokens.

---

#### 5.1.3 backup-config-get (línea 713)

**Devuelve:**
```typescript
const cfg = readBackupConfig(userDataPath);
return {
  ...cfg,
  nextAutoBackupAt: nextAutoBackupAt?.toISOString() ?? null,
};
```

Incluye:
- `autoBackupEnabled`: boolean
- `mode`: 'interval' | 'daily'
- `intervalHours`: number
- `dailyTime`: string | undefined
- `retentionCount`: number
- `includeImages`: boolean
- `customBackupDir`: string | undefined
- `whatsappDestino`: string | undefined (⚠️ número de teléfono)
- `pgFormat`: 'plain' | 'custom'
- `pgBinDir`: string | undefined
- `lastAutoBackupAt`: string | null
- `nextAutoBackupAt`: string | null

**Análisis:**
- ⚠️ SÍ expone: `whatsappDestino` (número de teléfono configurado)
- ❌ NO expone: el apikey de Evolution (se obtiene internamente con `getEvolutionApiKey()`)

**Riesgo:** 🟡 BAJO - El número de WhatsApp es información que el usuario configura y necesita ver en la UI. NO es un secreto criptográfico. El token de Evolution nunca se devuelve.

---

### 5.2 Resumen de Exposición

| Handler | Expone Tokens? | Expone Passwords? | Expone Paths? | Riesgo |
|---------|----------------|-------------------|---------------|--------|
| `backup-get-info` | ❌ NO | ❌ NO | ⚠️ Metadata (dirs) | 🟡 BAJO |
| `backup-list` | ❌ NO | ❌ NO | ⚠️ Paths de backups | 🟡 BAJO |
| `backup-config-get` | ❌ NO | ❌ NO | ⚠️ Tel. WhatsApp | 🟡 BAJO |

✅ **CONCLUSIÓN:** NO hay exposición de tokens ni passwords. Los paths y metadata expuestos son información necesaria para la UI.

---

## 6. Cobertura de Tests

**Archivo:** `scripts/test-backup-http-e2e.ts`

### Test Cases Implementados:

1. **Test 1 (líneas 142-167):** Canales destructivos bloqueados
   - Verifica que los 8 canales críticos respondan `403 channel_bloqueado_para_http`
   - ✅ Pasa para: `backup-restore`, `backup-db-reset`, `backup-clear-images`, `backup-delete`, `backup-create-and-export`, `backup-config-set`, `backup-pick-folder`, `backup-pick-restore-file`

2. **Test 2 (líneas 170-184):** backup-create permitido con permiso
   - Verifica que un usuario con `SISTEMA_BACKUP` pueda invocar `backup-create` por HTTP
   - ✅ NO debe responder `403` ni `channel_bloqueado_para_http`

3. **Test 3 (líneas 187-201):** Sin permiso → HTTP 403
   - Usuario SIN `SISTEMA_BACKUP` invoca `backup-create`
   - ✅ Debe responder `403` con mensaje `PERMISO REQUERIDO` o `SISTEMA_BACKUP`

4. **Test 4 (líneas 204-234):** backup-send-whatsapp ignora opts.destino en HTTP
   - Invoca `backup-send-whatsapp` por HTTP con `destino: '595991999999'` arbitrario
   - ✅ Verifica que el handler NO intente usar ese destino
   - ✅ Debe fallar con "Archivo no encontrado" o "Sin número de WhatsApp configurado"
   - (No debe intentar enviar al 595991999999 del payload)

---

## 7. Hallazgos

### Hallazgos P0 (Críticos)
**Ninguno.** ✅

### Hallazgos de Mejora (Informativos)

**I-01: backup-list expone fullPath sin validación de directorio**

- **Severidad:** 🟡 INFO
- **Descripción:** `backup-list` devuelve `fullPath` de todos los archivos en el directorio de backups sin verificar que estén dentro del directorio permitido.
- **Impacto:** Bajo. El handler solo lee del directorio configurado (`backupDir`), no acepta input del cliente sobre QUÉ directorio leer.
- **Recomendación:** Consideración futura: si algún día se permite al cliente especificar un directorio customizado, validar que esté dentro de un allowlist.

---

## 8. Veredicto Final

### ✅ APROBADO - Sin hallazgos críticos

**Controles Verificados:**

1. ✅ Canales desbloqueados (3) tienen `ensurePermission SISTEMA_BACKUP` como primera sentencia
2. ✅ Canales destructivos (8) permanecen en `BLOCKED_CHANNELS`
3. ✅ `backup-send-whatsapp` en HTTP ignora `opts.destino` (protección contra envío a números arbitrarios)
4. ✅ Marca `_http: true` es inmutable y confiable (no puede forjarse desde el cliente)
5. ✅ NO hay exposición de tokens ni passwords al renderer
6. ✅ Cobertura de tests E2E para los 4 casos críticos

**Conclusión:**  
El sistema de permisos RPC está correctamente implementado. Todos los canales desbloqueados están protegidos con `ensurePermission SISTEMA_BACKUP`. La protección contra envío de backups a números arbitrarios desde HTTP es sólida y no puede saltarse. Los canales destructivos permanecen bloqueados. No hay fugas de credenciales.

**Recomendación:** ✅ OK para mergear a develop.

---

**Firma Digital:**  
Claude Cloud Agent (run a715)  
Hash del commit auditado: `HEAD` en `cursor/fix-265-backup-remoto-759b`  
Fecha: 2026-09-09 02:07 UTC
