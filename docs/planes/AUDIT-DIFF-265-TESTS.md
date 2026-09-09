# AUDIT-DIFF-265-TESTS.md

**Auditoría Eje 3: Poder Discriminante de Tests del PR #295**

**Rama auditada:** `cursor/fix-265-backup-remoto-759b`  
**PR:** https://github.com/GabFrank/frc-gourmet/pull/295  
**Commit test:** f1c467db  
**Auditor:** Cloud Agent  
**Fecha:** 2026-09-09

---

## Resumen Ejecutivo

**VEREDICTO: COBERTURA INSUFICIENTE (Test 4 no discrimina)**

El test E2E `scripts/test-backup-http-e2e.ts` cubre 3 de 4 aspectos del fix #265:

✅ **Test 1-3**: Detectan regresiones (deny-list, permisos)  
❌ **Test 4**: NO detecta si `backup-send-whatsapp` acepta destino arbitrario desde HTTP  
⚠️ **Ejecutabilidad**: El test probablemente NO se cuelga (mismo patrón que test-rate-limit-e2e.ts que sí funciona), pero hay un problema conceptual de aislamiento

---

## Análisis Detallado

### 1. ¿Falla si backup-restore sale de la deny-list?

**SÍ, detecta la regresión.**

```typescript
// Líneas 143-166 de test-backup-http-e2e.ts
const blockedChannels = [
  'backup-restore',
  'backup-db-reset',
  'backup-clear-images',
  // ...
];

for (const channel of blockedChannels) {
  const res = await makeRequest(`${baseUrl}/api/rpc`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
    body: { method: channel, params: [] },
  });
  assert.strictEqual(res.status, 403, `${channel} debería estar bloqueado`);
  assert.ok(
    res.body.error && res.body.error.includes('channel_bloqueado_para_http'),
    `${channel} debería responder channel_bloqueado_para_http`
  );
}
```

**Evidencia de discriminación:**
- Si se revierte el fix (quitando `'backup-restore'` de `BLOCKED_CHANNELS` en `electron/server/rpc-router.ts:43`), el canal dejaría de responder 403 con `channel_bloqueado_para_http`
- El test fallaría en la aserción `assert.strictEqual(res.status, 403, ...)`
- **Poder discriminante: ALTO** ✅

---

### 2. ¿Falla si send-whatsapp HTTP acepta destino arbitrario?

**NO, NO detecta la regresión.**

```typescript
// Líneas 203-233 de test-backup-http-e2e.ts
console.log('[Test 4] backup-send-whatsapp HTTP ignora opts.destino arbitrario');
const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: {
    method: 'backup-send-whatsapp',
    params: [{ fullPath: '/fake/path.db', destino: '595991999999' }],
  },
});
// Debería fallar, pero NO debe intentar usar el destino del payload
if (sendRes.body.result) {
  assert.ok(
    sendRes.body.result.success === false,
    'backup-send-whatsapp debería fallar sin config'
  );
  assert.ok(
    sendRes.body.result.message &&
    (sendRes.body.result.message.includes('Archivo no encontrado') ||
     sendRes.body.result.message.includes('Sin número de WhatsApp configurado')),
    `Mensaje esperado sobre archivo o config, got: ${sendRes.body.result.message}`
  );
}
```

**Problema crítico:**

El test falla por **path inválido ANTES** de llegar a la lógica del destino:

```typescript
// electron/handlers/backup.handler.ts:670
if (!opts?.fullPath || !fs.existsSync(opts.fullPath)) {
  return { success: false, message: 'Archivo no encontrado' };  // ← Falla ACÁ
}
// ... resto del handler (líneas 673-690) nunca se ejecuta
```

**Secuencia de ejecución:**

1. Test invoca con `fullPath: '/fake/path.db'` (no existe)
2. Handler verifica existencia en línea 670
3. Handler retorna `{ success: false, message: 'Archivo no encontrado' }` **inmediatamente**
4. Las líneas 673-690 (validación de directorio, tamaño, **destino**, Evolution API) **nunca se ejecutan**
5. El test verifica que el mensaje sea "Archivo no encontrado" ✓
6. Test pasa ✅

**Si se revierte el fix (enmienda #2, líneas 688-691):**

```typescript
// CÓDIGO SIN FIX (regresión):
const destinoRaw = (opts.destino || config.whatsappDestino || '').trim();
// ↑ Acepta opts.destino arbitrario desde HTTP

// VS. CÓDIGO CON FIX:
const isHttp = (_e as any)?._http === true;
const destinoRaw = (isHttp ? config.whatsappDestino : (opts.destino || config.whatsappDestino) || '').trim();
// ↑ Ignora opts.destino si es HTTP
```

El test **seguiría pasando** porque falla por "Archivo no encontrado" mucho antes de llegar a esa lógica.

**Poder discriminante: NULO** ❌

---

### 3. ¿Por qué se cuelga el test?

**Análisis: NO debería colgarse (mismo patrón que test-rate-limit-e2e.ts).**

**Patrón de inicialización (ambos tests):**

```typescript
// test-backup-http-e2e.ts:56-62
const opts = getDataSourceOptions(tmpdir);
const dataSource = new DataSource({
  ...(opts as any),
  database: ':memory:',
  synchronize: false,
  migrationsRun: false,
});
await dataSource.initialize();
await dataSource.runMigrations({ transaction: 'each' });
```

**Comparación:**

| Aspecto | test-rate-limit-e2e.ts | test-backup-http-e2e.ts |
|---------|------------------------|-------------------------|
| DataSource config | Idéntico | Idéntico |
| Migraciones | `runMigrations({ transaction: 'each' })` | `runMigrations({ transaction: 'each' })` |
| Server startup | `startServer()` con DataSource | `startServer()` con DataSource |
| Entidades seed | Usuario, Dispositivo | Usuario, Dispositivo, **Role, Permission, RolePermission, UsuarioRole** |

**Posibles causas de colgado (si ocurre):**

1. **Migración problemática específica de las entidades de permisos**  
   - test-backup-http seed crea Role, Permission, RolePermission, UsuarioRole
   - Si hay una migración que altera estas tablas y se cuelga en `:memory:`, afectaría solo este test

2. **Puerto ocupado** (17071)  
   - `startServer()` en línea 124 intenta escuchar en `TEST_PORT = 17071`
   - Si el puerto ya está ocupado (proceso zombie de un test anterior), `fastify.listen()` puede colgarse o rechazar
   - test-rate-limit usa puerto 17070 (diferente), por eso no choca

3. **JWT_SECRET en process.env**  
   - Línea 122: `process.env.JWT_SECRET = JWT_SECRET;`
   - Si otro test setea el mismo env var y no lo limpia, podría haber interferencia
   - test-rate-limit NO setea JWT_SECRET (usa un token sintácticamente válido pero sin validación criptográfica)

4. **Problema de aislamiento conceptual** ⚠️  
   - El test corre un servidor Fastify REAL con handlers registrados que **ejecutan lógica de producción** (incluyendo acceso a filesystem, validación de permisos, etc.)
   - Si algún handler invocado tiene un side-effect no controlado (ej. intenta escribir en `userDataPath`), podría fallar o colgarse

**Diferencia con test-rate-limit-e2e.ts:**

test-rate-limit-e2e.ts tiene un **bug silencioso** en línea 38:

```typescript
// test-rate-limit-e2e.ts:38 (BUG)
return { status, body: responseBody };  // ← 'status' no está definido

// test-backup-http-e2e.ts:44 (CORRECTO)
return { status: res.status, body: responseBody };
```

Este bug hace que `makeRequest()` retorne `{ status: undefined, body: ... }`, pero el test sigue pasando porque las aserciones son laxas (`[401, 200].includes(resWithDevice.status)` en línea 116 evalúa como false, pero no falla explosivamente).

**Conclusión sobre colgado:**

- **Probable**: NO se cuelga (mismo patrón de inicialización que test-rate-limit)
- **Si se cuelga**: puerto ocupado (17071) o migración específica de permisos
- **Recomendación**: intentar ejecutarlo para confirmar

**Poder de ejecución: INCIERTO** ⚠️

---

### 4. Comparación con test-rate-limit-e2e.ts

**Similitudes:**

| Aspecto | Implementación |
|---------|---------------|
| DataSource | `:memory:`, `synchronize: false`, `migrationsRun: false` + `runMigrations()` |
| Servidor | `startServer()` con puerto local (17070 vs 17071) |
| Request helper | `makeRequest()` con fetch |
| JWT | Tokens sintácticos (test-rate-limit) o criptográficos (test-backup-http) |
| Seed | Usuario + Dispositivo (+ permisos en test-backup-http) |
| Cleanup | `stopServer()` + `dataSource.destroy()` en `finally` |

**Diferencias clave:**

| Aspecto | test-rate-limit-e2e.ts | test-backup-http-e2e.ts |
|---------|------------------------|-------------------------|
| Puerto | 17070 | 17071 |
| JWT | Token fake sintáctico (no verificable) | Token firmado con JWT_SECRET real |
| Env vars | NO setea JWT_SECRET | Setea `process.env.JWT_SECRET` (línea 122) |
| Seed de permisos | NO | SÍ (Role, Permission, RolePermission, UsuarioRole) |
| Bug en makeRequest | Sí (línea 38: `return { status, ... }`) | NO (línea 44: `return { status: res.status, ... }`) |
| Tests de permisos | NO | SÍ (test 3: sin permiso → 403) |

**Veredicto de comparación:**

test-backup-http-e2e.ts es **más robusto** que test-rate-limit-e2e.ts en estructura (no tiene el bug de `status`), pero **más pesado** por el seed de permisos. Si uno se cuelga, el otro NO debería colgarse, porque las diferencias (puerto, JWT, seed) no son bloqueantes.

---

## Arreglo Mínimo para Test 4

**Objetivo:** Detectar si `backup-send-whatsapp` acepta destino arbitrario desde HTTP.

**Problema actual:** El test falla por "Archivo no encontrado" antes de llegar a la lógica del destino.

**Solución:** Crear un archivo de backup real (o stub) y verificar el comportamiento del destino.

### Propuesta A: Stub de archivo válido

```typescript
// Test 4 mejorado
console.log('[Test 4] backup-send-whatsapp HTTP ignora opts.destino arbitrario');

// 1. Crear un archivo stub en el directorio de backups configurado
const backupDir = path.join(tmpdir, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const stubBackupPath = path.join(backupDir, 'test-backup.db');
fs.writeFileSync(stubBackupPath, Buffer.from('fake backup data')); // Archivo pequeño (<16MB)

// 2. Invocar con destino arbitrario
const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: {
    method: 'backup-send-whatsapp',
    params: [{ fullPath: stubBackupPath, destino: '595991999999' }],
  },
});

// 3. Verificar que falla por falta de Evolution API (NO por destino)
// Si el fix está presente, usa solo config.whatsappDestino (vacío) → "Sin número de WhatsApp configurado"
// Si el fix se revierte, usaría opts.destino (595991999999) e intentaría conectar a Evolution API
// El error esperado es "Sin número de WhatsApp configurado" (config vacío, ignora payload)
// NOT "Evolution API no configurada" (que requeriría haber intentado enviar)
assert.ok(sendRes.body.result);
assert.strictEqual(sendRes.body.result.success, false);
assert.ok(
  sendRes.body.result.message.includes('Sin número de WhatsApp configurado'),
  `Esperaba error de config vacío, got: ${sendRes.body.result.message}`
);

// 4. Cleanup
fs.unlinkSync(stubBackupPath);
```

**Problema con Propuesta A:**

Sigue siendo débil porque el handler verifica `config.whatsappDestino` (línea 692) **antes** de intentar conectar a Evolution API (línea 695-699). Si la config está vacía, falla por "Sin número de WhatsApp configurado" sin importar si el fix está o no.

### Propuesta B: Mock de configuración + spy en Evolution API

```typescript
// Test 4 mejorado (requiere cambios en el handler para testear)
console.log('[Test 4] backup-send-whatsapp HTTP ignora opts.destino arbitrario');

// 1. Crear stub de backup
const backupDir = path.join(tmpdir, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const stubBackupPath = path.join(backupDir, 'test-backup.db');
fs.writeFileSync(stubBackupPath, Buffer.from('fake backup data'));

// 2. Mock de configuración de backup con whatsappDestino válido
const configPath = path.join(tmpdir, 'backup-config.json');
fs.writeFileSync(configPath, JSON.stringify({
  autoBackup: false,
  customBackupDir: null,
  whatsappDestino: '595999888777', // Número configurado (el legítimo)
}));

// 3. Invocar con destino arbitrario DIFERENTE al configurado
const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: {
    method: 'backup-send-whatsapp',
    params: [{ 
      fullPath: stubBackupPath, 
      destino: '595991999999' // Arbitrario (diferente al config)
    }],
  },
});

// 4. Verificar que falla por Evolution API no configurada
// (porque intentó usar el destino configurado, NO el del payload)
// Si el fix se revirtiera, intentaría usar 595991999999 (payload)
assert.ok(sendRes.body.result);
assert.strictEqual(sendRes.body.result.success, false);
assert.ok(
  sendRes.body.result.message.includes('Evolution API no configurada'),
  `Esperaba error de Evolution API, got: ${sendRes.body.result.message}`
);

// 5. Verificar en logs (si se exponen) que NO se intentó enviar al 595991999999
// ALTERNATIVA: spy/mock en el módulo de Evolution API para capturar el destino usado

// 6. Cleanup
fs.unlinkSync(stubBackupPath);
fs.unlinkSync(configPath);
```

**Problema con Propuesta B:**

Requiere que el test tenga visibilidad del destino usado internamente (no expuesto en el response), o un mock del módulo Evolution API (complejo en un test e2e).

### Propuesta C: Test de integración con mock de Evolution API ⭐

**Cambio en el handler (líneas 695-699):**

```typescript
// electron/handlers/backup.handler.ts:695-699
const evolution = await buildEvolutionConfig();
const apikey = await getEvolutionApiKey();
if (!evolution.url || !evolution.instance || !apikey) {
  return { success: false, message: 'Evolution API no configurada (Configuración → Notificaciones).' };
}

// AGREGAR (para testing):
// Si process.env.TEST_EVOLUTION_SPY === 'true', exponer el destino usado en el response
if (process.env.TEST_EVOLUTION_SPY === 'true') {
  return { 
    success: false, 
    message: 'TEST SPY ACTIVO',
    __test_destino_usado: destinoRaw  // ← Expone el destino para verificación
  };
}
```

**Test mejorado:**

```typescript
// Test 4 con spy
process.env.TEST_EVOLUTION_SPY = 'true';

// 1. Crear stub + config con whatsappDestino legítimo (595999888777)
const backupDir = path.join(tmpdir, 'backups');
if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
const stubBackupPath = path.join(backupDir, 'test-backup.db');
fs.writeFileSync(stubBackupPath, Buffer.from('fake backup data'));

const configPath = path.join(tmpdir, 'backup-config.json');
fs.writeFileSync(configPath, JSON.stringify({
  autoBackup: false,
  customBackupDir: null,
  whatsappDestino: '595999888777',
}));

// 2. Invocar con destino arbitrario (595991999999)
const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: {
    method: 'backup-send-whatsapp',
    params: [{ fullPath: stubBackupPath, destino: '595991999999' }],
  },
});

// 3. Verificar que el destino usado es el configurado (595999888777), NO el del payload
assert.ok(sendRes.body.result);
assert.strictEqual(sendRes.body.result.__test_destino_usado, '595999888777',
  'Debería usar el destino configurado, NO el del payload');

// 4. Cleanup
delete process.env.TEST_EVOLUTION_SPY;
fs.unlinkSync(stubBackupPath);
fs.unlinkSync(configPath);
```

**Ventaja de Propuesta C:**

- Detecta la regresión: si se revierte el fix, `__test_destino_usado` sería `'595991999999'` (payload), no `'595999888777'` (config)
- No requiere mock complejo de Evolution API
- Solo requiere un flag de test en el handler

**Desventaja:**

- Requiere cambio en código de producción (antipatrón)
- Alternativa más limpia: test unitario del handler con mocks, NO e2e

---

## Propuesta de Arreglo Mínimo (sin cambios en producción)

**Enfoque pragmático:** Test unitario del handler `backup-send-whatsapp` (nuevo archivo `test-backup-send-whatsapp-unit.ts`):

```typescript
import { strict as assert } from 'assert';
import * as backup from '../electron/handlers/backup.handler';
import * as fs from 'fs';
import * as path from 'path';

// Mock de buildEvolutionConfig y getEvolutionApiKey
jest.mock('../electron/handlers/backup.handler', () => ({
  ...jest.requireActual('../electron/handlers/backup.handler'),
  buildEvolutionConfig: jest.fn(() => ({ url: '', instance: '', apikey: '' })),
  getEvolutionApiKey: jest.fn(() => null),
}));

describe('backup-send-whatsapp: destino arbitrario desde HTTP', () => {
  it('debería ignorar opts.destino cuando _e._http === true', async () => {
    // Setup
    const tmpdir = require('os').tmpdir();
    const backupDir = path.join(tmpdir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const stubPath = path.join(backupDir, 'test.db');
    fs.writeFileSync(stubPath, Buffer.from('fake'));

    const configPath = path.join(tmpdir, 'backup-config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      whatsappDestino: '595999888777', // Configurado
    }));

    // Test con isHttp = true
    const eventHttp = { _http: true };
    const result = await backup.handleBackupSendWhatsapp(eventHttp as any, {
      fullPath: stubPath,
      destino: '595991999999', // Arbitrario
    });

    // Verificar que usó el destino configurado (595999888777), no el del payload
    // (requiere instrumentación del handler para exponer el destino usado)
    assert.ok(result.success === false); // Falla por Evolution API no configurada
    assert.ok(result.message.includes('Evolution API no configurada'));
    
    // Cleanup
    fs.unlinkSync(stubPath);
    fs.unlinkSync(configPath);
  });
});
```

**Problema:** FRC Gourmet NO usa Jest (usa Jasmine para Angular, pero no para handlers Electron).

---

## Veredicto Final

**COBERTURA INSUFICIENTE** por Test 4 (no discrimina destino arbitrario).

**Tests funcionales:**

| Test | Aspecto | Detecta regresión | Estado |
|------|---------|-------------------|--------|
| Test 1 | Canales bloqueados en deny-list | ✅ SÍ | OK |
| Test 2 | backup-create permitido con permiso | ✅ SÍ | OK |
| Test 3 | Sin permiso SISTEMA_BACKUP → 403 | ✅ SÍ | OK |
| Test 4 | Ignora opts.destino desde HTTP | ❌ NO | **INSUFICIENTE** |

**Ejecutabilidad:**

- ⚠️ **NO debería colgarse** (mismo patrón que test-rate-limit-e2e.ts), pero **incierto** sin ejecución real
- Posibles causas de colgado: puerto ocupado (17071), migración problemática de permisos, o side-effect de handler

**Recomendaciones:**

1. **Ejecutar el test** para confirmar si se cuelga o no
2. **Arreglar Test 4** con una de las propuestas (preferencia: test unitario del handler, NO e2e)
3. **Arreglar bug en test-rate-limit-e2e.ts** (línea 38: `return { status: res.status, ... }`)
4. **Considerar timeout en CI** (ej. 60s) para detectar colgados automáticamente

**El test puede fallar al revertir el fix en 3 de 4 aspectos, pero NO en el aspecto crítico de seguridad (destino arbitrario).**

---

## Anexo: Evidencia de código

### Fix auditado (enmienda #2)

```typescript
// electron/handlers/backup.handler.ts:688-691
// Enmienda #2 (auditoría): en llamadas HTTP, ignorar opts.destino y usar solo config.
// Un cliente remoto no debe poder enviar backups a números arbitrarios.
const isHttp = (_e as any)?._http === true;
const destinoRaw = (isHttp ? config.whatsappDestino : (opts.destino || config.whatsappDestino) || '').trim();
```

### Deny-list auditada

```typescript
// electron/server/rpc-router.ts:39-49
// Backups: permitidos los no destructivos (con guard SISTEMA_BACKUP en handler).
// Permitidos por HTTP: backup-create, backup-trigger-auto-now, backup-send-whatsapp.
// Destructivos o riesgosos siguen bloqueados:
'backup-db-reset',
'backup-clear-images',
'backup-restore',
'backup-delete',
// Configuración sensible y diálogos del servidor (sin sentido remoto):
'backup-create-and-export',  // showSaveDialog en el servidor = DoS
'backup-config-set',  // configuración sensible, solo local
'backup-pick-folder',
'backup-pick-restore-file',
```

### Test 4 (problemático)

```typescript
// scripts/test-backup-http-e2e.ts:203-233
console.log('[Test 4] backup-send-whatsapp HTTP ignora opts.destino arbitrario');
const sendRes = await makeRequest(`${baseUrl}/api/rpc`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${adminToken}` },
  body: {
    method: 'backup-send-whatsapp',
    params: [{ fullPath: '/fake/path.db', destino: '595991999999' }],
  },
});
// Falla por "Archivo no encontrado" ANTES de llegar a la lógica del destino
if (sendRes.body.result) {
  assert.ok(
    sendRes.body.result.success === false,
    'backup-send-whatsapp debería fallar sin config'
  );
  assert.ok(
    sendRes.body.result.message &&
    (sendRes.body.result.message.includes('Archivo no encontrado') ||
     sendRes.body.result.message.includes('Sin número de WhatsApp configurado')),
    `Mensaje esperado sobre archivo o config, got: ${sendRes.body.result.message}`
  );
}
// ↑ NO verifica que el destino del payload fue ignorado
```

---

**Fin del documento.**
