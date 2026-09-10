# Plan: Credenciales API Read-Only para Auditorías Don Franco

**Fecha:** 2026-09-10  
**Repo:** GabFrank/frc-gourmet  
**Branch base:** `develop`  
**Propósito:** Diseñar opciones de autenticación para el bot de auditorías del Gerente Don Franco que llama `/api/rpc` en modo server.

---

## 1. Contexto

El bot de auditorías necesita:

1. **Autenticarse** en el servidor de producción (nodo `mode=server` del restaurante, expuesto en LAN puerto 7070 o túnel Cloudflare)
2. **Obtener un JWT válido** para invocar `/api/rpc`
3. **Tener los permisos necesarios** para leer ventas, productos, clientes, RRHH (ver `CATALOGO-RPC-READONLY-GERENTE.md`)
4. **NO escribir datos de negocio** (solo lectura)
5. **Renovar el token periódicamente** (access token expira en ~7 días, refresh token en más tiempo)
6. **Almacenar credenciales de forma segura** (NO en el chat de Grok, NO en logs visibles)

---

## 2. Opciones de autenticación

### Opción A: Usuario dedicado con rol GERENTE (recomendada para MVP)

#### Descripción

Crear un usuario específico para el bot (ej. `don-franco-audit`) con rol **GERENTE** (o un rol custom derivado de GERENTE con solo permisos de lectura).

#### Flujo

1. **Crear el usuario:**

   - Nickname: `don-franco-audit`
   - Password: generada aleatoria (ej. `openssl rand -base64 32`)
   - Rol: `GERENTE` (o rol custom `GERENTE_READONLY` con subset de permisos)
   - `mustChangePassword`: **false** (crítico: si es `true`, bloquea toda operación)
   - `activo`: **true**

2. **Login del bot:**

   ```http
   POST https://<server-ip>:7070/api/auth/login
   Content-Type: application/json

   {
     "nickname": "don-franco-audit",
     "password": "<password>",
     "deviceInfo": {
       "device_id": "audit-bot-don-franco",
       "userAgent": "Grok-Audit-Bot/1.0",
       "os": "cloud"
     }
   }
   ```

   **Response:**

   ```json
   {
     "success": true,
     "token": "eyJhbGc...",      // access token (JWT)
     "usuario": {
       "id": 123,
       "nickname": "don-franco-audit",
       "mustChangePassword": false
     },
     "sessionId": 456
   }
   ```

3. **Refresh token** (si el backend soporta refresh en Fastify):

   ```http
   POST https://<server-ip>:7070/api/auth/refresh
   Content-Type: application/json

   {
     "token": "<refresh-token>"
   }
   ```

4. **Logout** (opcional, al terminar auditoría):

   ```http
   POST https://<server-ip>:7070/api/auth/logout
   Content-Type: application/json

   {
     "sessionId": 456
   }
   ```

#### Ventajas

- **Rápido de implementar:** Usa la infraestructura existente (login, JWT, permisos).
- **Auditable:** Las llamadas quedan registradas en `LoginSession` con el nickname del bot.
- **Revocable:** Desactivar el usuario = bloquear el bot.
- **Sin código nuevo:** No requiere backend adicional.

#### Desventajas

- **Credenciales estáticas:** El bot necesita un password (aunque sea fuerte, es un secreto más que gestionar).
- **Usuario "humano":** El sistema no distingue nativamente entre bot y persona (mismos permisos, mismos handlers).
- **Rate limit compartido:** Si el restaurante tiene otros terminales del mismo usuario, comparten el bucket de 600 req/min (mitigado con `device_id` único).

#### Permisos del rol custom `GERENTE_READONLY`

Si se crea un rol específico para el bot, incluir **solo permisos de lectura**:

```javascript
const GERENTE_READONLY_PERMISOS = [
  // Dashboards
  'HOME_DASHBOARD_VER',
  'VENTAS_DASHBOARD_VER',
  'COMPRAS_DASHBOARD_VER',
  'PRODUCTOS_DASHBOARD_VER',
  'FINANCIERO_DASHBOARD_VER',
  'CAJA_MAYOR_DASHBOARD_VER',
  'RRHH_DASHBOARD_VER',
  
  // Ventas (solo lectura)
  'VENTAS_HISTORICO_VER',
  
  // Productos (solo lectura)
  'PRODUCTOS_VER',
  'RECETAS_VER',
  'INGREDIENTES_VER',
  'ADICIONALES_VER',
  'SABORES_VER',
  'STOCK_MOVIMIENTO_VER',
  
  // Clientes (solo lectura)
  'CLIENTES_VER',
  'PERSONAS_VER',
  
  // Financiero (solo lectura)
  'FINANCIERO_CAJA_VER',
  'BANCOS_VER',
  'CPC_GESTIONAR',  // incluye lectura de CPC (nombre engañoso)
  
  // RRHH (solo lectura)
  'RRHH_FUNCIONARIO_VER',
  'RRHH_NOTIFICACIONES_VER',
  'RRHH_REPORTE_GENERAR',
  
  // Compras (solo lectura)
  'COMPRAS_VER',
  'PROVEEDORES_VER',
  
  // Facturación (solo lectura)
  'FACTURACION_VER',
  
  // Pedidos online (solo lectura)
  'PEDIDOS_ONLINE_VER',
  
  // KDS (solo lectura)
  'COMANDAS_KDS_VER',
  
  // Documentos (solo lectura: generar PDF no muta datos de negocio)
  'DOCUMENTOS_GENERAR_PDF',
  
  // Música (solo lectura)
  'MUSICA_VER',
];
```

**⚠️ NO incluir permisos de escritura:**

- ❌ `VENTAS_PDV`, `VENTAS_COBRAR`, `PDV_PAGAR_VALE`, `PDV_PAGAR_COMPRA`, `PDV_ANULAR_EGRESO`
- ❌ `PRODUCTOS_GESTIONAR`, `RECETAS_GESTIONAR`, `STOCK_MOVIMIENTO_REGISTRAR`
- ❌ `FINANCIERO_CAJA_OPERAR`, `FINANCIERO_CAJA_GESTIONAR`, `CAJA_MAYOR_OPERAR`
- ❌ `CPC_COBRAR`, `COMPRAS_GESTIONAR`, `PROVEEDORES_GESTIONAR`
- ❌ `RRHH_*` (excepto `_VER` y `_REPORTE_GENERAR`)
- ❌ `USUARIOS_GESTIONAR`, `SISTEMA_PERMISO_GESTIONAR`, `SISTEMA_ROL_GESTIONAR`
- ❌ `SISTEMA_BACKUP`, `SISTEMA_BD_CONFIGURAR`, `SISTEMA_MODO_CONFIGURAR`

#### Implementación en seed

Agregar a `electron/utils/seed-system.ts`:

```typescript
const ROLES_PLANTILLA: Array<{ descripcion: string; permisos: string[] }> = [
  // ... roles existentes ...
  {
    descripcion: 'GERENTE_READONLY',
    permisos: [
      'HOME_DASHBOARD_VER',
      'VENTAS_DASHBOARD_VER',
      'VENTAS_HISTORICO_VER',
      'PRODUCTOS_VER', 'RECETAS_VER', 'INGREDIENTES_VER', 'ADICIONALES_VER', 'SABORES_VER', 'STOCK_MOVIMIENTO_VER',
      'CLIENTES_VER', 'PERSONAS_VER',
      'FINANCIERO_CAJA_VER', 'BANCOS_VER', 'CPC_GESTIONAR',
      'RRHH_FUNCIONARIO_VER', 'RRHH_NOTIFICACIONES_VER', 'RRHH_REPORTE_GENERAR',
      'COMPRAS_VER', 'PROVEEDORES_VER',
      'FACTURACION_VER',
      'PEDIDOS_ONLINE_VER',
      'COMANDAS_KDS_VER',
      'DOCUMENTOS_GENERAR_PDF',
      'MUSICA_VER',
    ],
  },
];
```

Al arrancar el servidor, el seed idempotente crea el rol y asigna los permisos.

---

### Opción B: API token de servicio (futura implementación)

#### Descripción

Crear un **token de servicio** (API key) con alcance explícito de lectura, sin vinculación a un usuario humano.

#### Flujo

1. **Generar el token:**

   - Desde la UI (admin): *Sistema → API Tokens → Crear token*
   - Nombre: `Don Franco Audit Bot`
   - Scopes: `ventas:read`, `productos:read`, `clientes:read`, `rrhh:read`, `financiero:read`
   - Expira: nunca (o renovación automática)
   - Token: generado aleatoriamente (ej. `dfa_abc123...`)

2. **Autenticación del bot:**

   ```http
   POST https://<server-ip>:7070/api/rpc
   Authorization: Bearer dfa_abc123...
   Content-Type: application/json

   {
     "method": "get-ventas-by-date-range",
     "params": [...]
   }
   ```

   **Sin login previo:** El token es directamente el Bearer token.

3. **Validación en backend:**

   - Middleware de Fastify verifica el token contra tabla `ApiToken`
   - Chequea scopes: si el método requiere `ventas:read` y el token no lo tiene, rechaza con 403
   - Popula un usuario "virtual" con permisos derivados de los scopes

#### Ventajas

- **Sin password:** Solo un token revocable.
- **Scopes explícitos:** Más granular que roles (ej. `ventas:read` ≠ `VENTAS_PDV`).
- **Auditoría clara:** Los logs muestran "API token X hizo Y", no "usuario Z hizo Y".
- **No consume sesión:** No crea `LoginSession` (el bot no es humano).
- **Rate limit dedicado:** Puede tener un bucket propio más generoso (ej. 1200 req/min).

#### Desventajas

- **Requiere implementación nueva:**
  - Tabla `api_tokens` (id, nombre, token hash, scopes JSON, expira, activo, usuario creador)
  - Handler `create-api-token`, `revoke-api-token`, `list-api-tokens`
  - Middleware `api-token-auth.ts` en Fastify
  - Mapeo de scopes → permisos (ej. `ventas:read` → `[VENTAS_HISTORICO_VER, VENTAS_DASHBOARD_VER]`)
  - UI en `Sistema → API Tokens`
- **Fuera de alcance de Fase 1:** No existe hoy en el código.
- **Compatibilidad:** Los handlers actuales esperan `getCurrentUser()` (usuario real). Con API token, `getCurrentUser()` devuelve un usuario virtual o `null` (hay que auditar cada handler para que no rompa).

#### Estimación de esfuerzo

- Backend: ~4–6 horas (entity, handlers, middleware, mapeo scopes, tests)
- Frontend: ~2–3 horas (UI CRUD de tokens)
- Auditoría de handlers: ~2–4 horas (verificar que toleran `getCurrentUser() === null` o usuario virtual)
- **Total:** ~8–13 horas (1–2 días)

---

### Comparación de opciones

| Aspecto | Opción A (usuario GERENTE) | Opción B (API token) |
|---|---|---|
| **Implementación** | Inmediata (infraestructura existe) | Requiere ~8–13 h de dev |
| **Seguridad** | Password estático (fuerte pero gestionable) | Token revocable sin password |
| **Auditoría** | Logs con nickname del bot | Logs con "API token X" |
| **Granularidad** | Permisos del rol (coarse) | Scopes (fine-grained) |
| **Revocación** | Desactivar usuario | Revocar token (más ágil) |
| **Rate limit** | 600 req/min (compartido con device_id) | Configurable (ej. 1200 req/min) |
| **Compatibilidad** | Total (usa login estándar) | Requiere auditar handlers |
| **Mantenimiento** | Seed de rol + usuario manual | UI de tokens + middleware |
| **Recomendación** | ✅ **MVP** (Fase 1) | 🔮 **Futuro** (post-MVP) |

---

## 3. Recomendación: Opción A para MVP

**Para la Fase 1 (investigación + PoC), usar Opción A:**

1. Crear usuario `don-franco-audit` con rol **`GERENTE_READONLY`** (agregar rol al seed).
2. Password fuerte generada (ej. `openssl rand -base64 32`).
3. Almacenar password en **variable de entorno del bot Grok** (NO en el chat, NO en código).
4. Login → obtener JWT → llamar `/api/rpc` con `Authorization: Bearer <token>`.
5. Refresh token antes de expiración (o relogin si no hay refresh).

**Ventajas:**
- Implementable HOY (sin tocar backend).
- Auditable (logs con nickname).
- Revocable (desactivar usuario).

**Para Fase 2/3 (producción a largo plazo), considerar Opción B:**
- Más seguro (sin password).
- Más ágil (revocar token sin desactivar usuario).
- Mejor trazabilidad (logs específicos de bots).

---

## 4. Almacenamiento seguro de credenciales (el bot)

### 4.1 Dónde NO almacenar

- ❌ **En el chat de Grok:** Cualquier mensaje del bot que mencione el password queda en historial y puede ser leído por otros usuarios.
- ❌ **En logs visibles:** Console.log, archivos de log accesibles, etc.
- ❌ **En código del bot:** Hardcodear credenciales es un riesgo de seguridad.
- ❌ **En el repo GitHub:** Ni siquiera en un archivo `.env` (puede ser pusheado por error).

### 4.2 Dónde SÍ almacenar

#### Para Grok Bot (asumiendo plataforma X/Twitter)

- ✅ **Variables de entorno del bot:** Si Grok soporta secrets (ej. `process.env.GOURMET_BOT_PASSWORD`), usarlas.
- ✅ **Vault de secretos:** Si hay integración con AWS Secrets Manager, HashiCorp Vault, o similar.
- ✅ **Encriptado en DB del bot:** Almacenar el password encriptado con una clave maestra (la clave maestra en env var).

#### Para el bot en general

- El bot debe tener un **módulo de credenciales** que:
  1. Lee el password de la fuente segura (env var, vault, DB encriptada)
  2. Lo usa solo en memoria durante el login
  3. Lo descarta tras obtener el JWT
  4. **Nunca** lo loguea ni lo menciona en respuestas al usuario

#### Refresh token

- El **refresh token** se persiste en el bot (NO en el servidor).
- Si el bot se reinicia, puede releer el refresh token y obtener un nuevo access token sin relogin.
- Almacenar en:
  - ✅ **DB del bot** (encriptada)
  - ✅ **Filesystem del bot** (archivo `0600`, solo lectura por el proceso)
  - ❌ **En memoria volátil** (se pierde al reiniciar)

---

## 5. Host de producción y conectividad

### 5.1 Topología típica

```
┌─────────────────────────────────────────────────────┐
│ Restaurante "Gourmet" (LAN privada 192.168.1.0/24)  │
│                                                      │
│  ┌──────────────────────────────────┐               │
│  │ PC Server (mode=server)          │               │
│  │ - Windows 10 / Ubuntu            │               │
│  │ - Postgres local (puerto 5432)   │               │
│  │ - Fastify (puerto 7070)          │               │
│  │ - IP LAN: 192.168.1.100          │               │
│  └──────────────────────────────────┘               │
│           │                                          │
│           │                                          │
│  ┌────────▼──────────────────────────┐              │
│  │ Túnel Cloudflare / VPN            │              │
│  │ - Expone :7070 a Internet         │              │
│  │ - URL: https://gourmet-xyz.trycloudflare.com   │
│  └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────┘
                      │
                      │ HTTPS (443)
                      │
           ┌──────────▼────────────┐
           │ Internet              │
           │                       │
           │  ┌─────────────────┐  │
           │  │ Bot Grok        │  │
           │  │ (X/Twitter)     │  │
           │  └─────────────────┘  │
           └───────────────────────┘
```

### 5.2 Conectividad

**⚠️ El servidor NO es público por defecto.**

1. **LAN:** El bot solo puede alcanzar el servidor si está en la misma red (ej. bot corriendo en otra PC del restaurante).
   
2. **Túnel Cloudflare:** Si el restaurante usa `cloudflared tunnel` (handler `remote-tunnel.handler.ts`), el servidor expone una URL pública temporal (ej. `https://gourmet-xyz.trycloudflare.com`). El bot llama a esa URL.

3. **VPN:** Si el bot está en cloud (ej. servidores de X), necesita VPN (ej. WireGuard, Tailscale) hacia la LAN del restaurante.

4. **IP pública + forwarding:** Si el router del restaurante tiene IP pública, puede hacer port forwarding `<IP-publica>:7070` → `192.168.1.100:7070`. **Menos seguro** (expone el server a Internet sin VPN).

**Recomendación:** Usar túnel Cloudflare (ya implementado en el código, handler `start-tunnel`) o VPN.

---

## 6. Checklist de deployment

### 6.1 En el servidor de producción (restaurante)

- [ ] Crear usuario `don-franco-audit`:
  ```sql
  -- O desde la UI: Personas → Crear persona → Usuario
  ```
- [ ] Asignar rol `GERENTE_READONLY`:
  ```sql
  -- O desde la UI: Usuarios → Asignar roles
  ```
- [ ] Verificar `mustChangePassword = false`:
  ```sql
  SELECT nickname, must_change_password FROM usuarios WHERE nickname = 'don-franco-audit';
  ```
- [ ] Probar login manual:
  ```bash
  curl -X POST https://<server-url>/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"nickname":"don-franco-audit","password":"<password>","deviceInfo":{"device_id":"test"}}'
  ```
- [ ] Verificar JWT en response:
  ```bash
  # Debe devolver { success: true, token: "eyJ...", usuario: {...} }
  ```
- [ ] Probar llamada a `/api/rpc` con JWT:
  ```bash
  curl -X POST https://<server-url>/api/rpc \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d '{"method":"get-ventas-by-date-range","params":["2026-09-01T00:00:00.000Z","2026-09-10T23:59:59.999Z",null]}'
  ```
- [ ] Verificar rate limit: 600 req/min con `device_id` único

### 6.2 En el bot Grok

- [ ] Configurar variable de entorno `GOURMET_BOT_PASSWORD`:
  ```bash
  export GOURMET_BOT_PASSWORD="<password>"
  ```
- [ ] Configurar URL del servidor:
  ```bash
  export GOURMET_SERVER_URL="https://gourmet-xyz.trycloudflare.com"
  ```
- [ ] Implementar módulo de credenciales:
  - Leer `GOURMET_BOT_PASSWORD` y `GOURMET_SERVER_URL` de env vars
  - Login → obtener JWT
  - Almacenar JWT en memoria (access token) y refresh token en DB/filesystem encriptado
  - Refresh antes de expiración (cada 6 días o al recibir 401)
- [ ] Implementar rate limit: máximo 600 req/min, backoff ante 429
- [ ] Implementar batch de requests: priorizar handlers agregados
- [ ] Logs de auditoría: registrar qué consultas hace y cuándo (sin exponer password)
- [ ] Manejo de errores:
  - 401 → relogin
  - 403 → permisos insuficientes (reportar al admin del servidor)
  - 429 → backoff exponencial
  - 500 → error interno (reportar al admin del servidor)

### 6.3 Checklist de seguridad

- [ ] Password del usuario bot es fuerte (≥32 caracteres random)
- [ ] Password NO está en el chat, logs, código ni repo
- [ ] Password está en variable de entorno / vault de secretos
- [ ] Refresh token se persiste encriptado (no en plaintext)
- [ ] Bot NUNCA invoca métodos de mutación (lista DENY del catálogo)
- [ ] Logs del bot NO exponen el JWT completo (solo primeros 8 chars para debug)
- [ ] Usuario bot tiene `activo=true` y `mustChangePassword=false`
- [ ] Rol `GERENTE_READONLY` solo tiene permisos de lectura (sin `_GESTIONAR`, `_CREAR`, `_EDITAR`, `_ELIMINAR`)

---

## 7. Pruebas de integración (manual)

### 7.1 Caso 1: Ventas del día

```bash
# Login
curl -X POST https://<server-url>/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nickname":"don-franco-audit","password":"<password>","deviceInfo":{"device_id":"audit-bot-test"}}'

# Capturar token de la response

# Llamar get-ventas-by-date-range
curl -X POST https://<server-url>/api/rpc \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "get-ventas-by-date-range",
    "params": ["2026-09-10T07:00:00.000Z", "2026-09-11T06:59:59.999Z", null]
  }'

# Verificar response con ventas + totales
```

**Resultado esperado:** Lista de ventas con `items`, `pago`, `delivery`, `cliente`, etc.

### 7.2 Caso 2: Productos sin precio

```bash
# Login (igual que arriba)

# Llamar get-productos-for-sale-mode
curl -X POST https://<server-url>/api/rpc \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "get-productos-for-sale-mode",
    "params": []
  }'

# Filtrar en el bot los que no tienen preciosVenta
```

**Resultado esperado:** Lista de productos con `presentaciones[].preciosVenta[]`.

### 7.3 Caso 3: Intento de mutación (debe fallar)

```bash
# Login (igual que arriba)

# Intentar crear una venta (DENY)
curl -X POST https://<server-url>/api/rpc \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "create-venta",
    "params": [{"mesa_id": 1}]
  }'

# Verificar que falla con 403 (si el handler tiene ensurePermission)
# O que el bot detecta que es un método DENY y no lo invoca
```

**Resultado esperado:** El bot **no** invoca este método (bloqueado en su lógica interna).

---

## 8. Roadmap de credenciales

### Fase 1 (MVP): Usuario GERENTE_READONLY

- [x] Definir permisos del rol `GERENTE_READONLY`
- [ ] Agregar rol al seed de `seed-system.ts`
- [ ] Crear usuario `don-franco-audit` con rol en producción
- [ ] Bot llama `/api/auth/login` con nickname + password (env var)
- [ ] Bot invoca `/api/rpc` con JWT
- [ ] Bot respeta lista DENY (no invoca mutaciones)

**Duración:** 2–4 horas (1 hora de seed + 1 hora de creación manual en prod + 2 horas de integración bot)

### Fase 2 (futuro): API tokens de servicio

- [ ] Diseñar tabla `api_tokens` (id, nombre, token hash, scopes JSON, expira, activo, usuario creador)
- [ ] Implementar handlers `create-api-token`, `revoke-api-token`, `list-api-tokens`
- [ ] Implementar middleware `api-token-auth.ts` en Fastify
- [ ] Mapear scopes → permisos (ej. `ventas:read` → `[VENTAS_HISTORICO_VER, VENTAS_DASHBOARD_VER]`)
- [ ] Auditar handlers para tolerar `getCurrentUser() === null` o usuario virtual
- [ ] UI en `Sistema → API Tokens`
- [ ] Bot usa token de servicio en lugar de login

**Duración:** 8–13 horas (1–2 días)

### Fase 3 (opcional): OAuth2 / API Gateway

- [ ] Implementar servidor OAuth2 (ej. `@fastify/oauth2`) con grant type `client_credentials`
- [ ] Bot obtiene token de OAuth2 en lugar de login
- [ ] API Gateway (ej. Kong, nginx) adelante del servidor Gourmet
- [ ] Rate limiting + logging + revocación en el gateway

**Duración:** 1–2 semanas (fuera de alcance actual)

---

## 9. Documentación para el operador

### 9.1 Cómo crear el usuario del bot (manual)

1. Abrir la app desktop (o web `/admin` en modo server)
2. Login como ADMINISTRADOR
3. Ir a *Personas → Crear persona*:
   - Nombre: `DON FRANCO`
   - Apellido: `AUDIT BOT`
   - Tipo: `FISICA`
   - Activo: `true`
4. En la misma pantalla, crear usuario:
   - Nickname: `don-franco-audit`
   - Password: `<password generada>`
   - Activo: `true`
   - **Cambiar password:** `NO` (desmarcar checkbox)
5. Ir a *Sistema → Gestión de usuarios → Asignar roles*:
   - Usuario: `don-franco-audit`
   - Rol: `GERENTE_READONLY`
6. Guardar

### 9.2 Cómo revocar el acceso del bot

**Opción A: Desactivar el usuario**

1. Login como ADMINISTRADOR
2. Ir a *Personas → Usuarios*
3. Buscar `don-franco-audit`
4. Editar → Marcar `Activo: NO`
5. Guardar

**Opción B: Quitar todos los roles**

1. Login como ADMINISTRADOR
2. Ir a *Sistema → Gestión de usuarios → Asignar roles*
3. Usuario: `don-franco-audit`
4. Quitar rol `GERENTE_READONLY`
5. Guardar

**Opción C (futuro con API tokens): Revocar el token**

1. Login como ADMINISTRADOR
2. Ir a *Sistema → API Tokens*
3. Buscar token `Don Franco Audit Bot`
4. Click en "Revocar"

### 9.3 Cómo verificar los logs del bot

- Los `LoginSession` del bot aparecen en *Personas → Sesiones*:
  - Usuario: `don-franco-audit`
  - Device: `audit-bot-don-franco`
  - Login time, Logout time, IP
- Los handlers IPC/RPC no loguean cada llamada por defecto. Para auditar, agregar logging en `rpc-router.ts` o `auth-middleware.ts`.

---

## 10. Resumen ejecutivo

**Recomendación para MVP (Fase 1):**

- Usar **Opción A**: usuario `don-franco-audit` con rol `GERENTE_READONLY`
- Password fuerte en variable de entorno del bot
- Login → JWT → `/api/rpc` con `Authorization: Bearer <token>`
- Bot respeta lista DENY (no invoca mutaciones)
- Revocable desactivando el usuario

**Ventajas:**
- Implementable hoy (sin backend nuevo)
- Auditable (logs con nickname)
- Revocable (desactivar usuario)

**Siguiente paso:** Agregar rol `GERENTE_READONLY` al seed y crear el usuario en producción.

---

**Fin del plan.**  
**Próximos pasos:** Ver `CATALOGO-RPC-READONLY-GERENTE.md` para los métodos RPC específicos de cada caso de uso.
