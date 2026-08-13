# Plan: DB externa + arquitectura cliente/servidor

> **Estado (2026-06-28): IMPLEMENTADO en lo esencial.** Este documento se mantiene como
> referencia de diseño; ya no es un borrador. Lo construido en `develop`:
> - **DB externa (Fase 1):** driver dual SQLite/PostgreSQL configurable, `synchronize: false`
>   con migraciones al arranque (driver-aware). ✅
> - **Repository abstraido (Fase 2):** `repository.service.ts` es abstracto; existen
>   `repository-ipc.service.ts` y `repository-http.service.ts` (este último, esqueleto). ✅
> - **Modo servidor (Fase 3):** `electron/server/` con Fastify expone `/api/version`, `/api/health`,
>   `/api/auth/login` + `/api/auth/refresh`, `/api/rpc` (vía `handlerRegistry`), `/api/files/:id`,
>   SSE de KDS, y sirve la PWA mobile (`@fastify/static`). ✅
> - **Modo cliente (Fase 4):** seleccionable en `app-settings.json` (`mode`); el cliente rutea por HTTP.
>   En el desktop el ruteo se hace monkey-patcheando `ipcRenderer.invoke` en el preload (NO la clase
>   `RepositoryHttpService`, que quedó como esqueleto). ✅
> - **Foundations (Fase 0):** bcrypt + migración de passwords, refresh tokens. ✅
> - **Mobile PWA (Fase 6):** implementada dentro del mismo repo (`projects/mobile`), no en repo separado
>   como anticipaba el plan. Ver `docs/arquitectura/mobile-pwa-plan.md`.
>
> **Pendiente / parcial:** endurecer el JWT secret hardcodeado (`'frc-gourmet-secret-key'`),
> mDNS auto-discovery, multi-tenant fields/audit (Fase 5), code signing Windows (SignPath, ver
> `docs/RELEASE.md`).
>
> ---
>
> **Estado original:** Borrador — 2026-05-09.
> **Alcance:** Permitir DB externa configurable (SQLite/PostgreSQL) Y modo cliente/servidor para multiples instancias en una misma sucursal (oficina + caja + futuros mobiles/tablets).

## 0. Decisiones arquitectonicas (lo que el dueño me pidio que decida)

### 0.1 ¿Ambas apps servidores que comparten DB, o una servidor y otras clientes?

**Recomendacion: una servidor, otras clientes (modelo hub-and-spoke).**

| Criterio | Multi-servidor + DB compartida (Postgres LAN) | Servidor + Clientes (API HTTP) |
|---|---|---|
| Seguridad | Cada device tiene credenciales DB. DB expuesta en LAN. Si un device se compromete, leak de credenciales = leak total. | Devices solo tienen credenciales de usuario. Server centraliza el acceso a DB. JWT por usuario. |
| Integridad | Validaciones distribuidas (cada cliente puede saltearse una regla). Triggers DB ayudan pero son rigidos. | Toda escritura pasa por el server → reglas de negocio en un solo lugar. Audit log natural. |
| Schema migrations | Todas las apps deben actualizar al mismo tiempo o explota. Coordinacion dificil con auto-update. | Server actualiza primero, clientes despues. Endpoint `/version` permite a clientes detectar mismatch y bloquear escrituras hasta updatearse. |
| Mobile/tablet futuro | **No factible:** browsers no pueden hablar con Postgres directo. Necesitarias armar un backend igual. | **Trivial:** los mobiles consumen la misma API. La PWA Angular Ionic puede convivir con el desktop client en el mismo backend. |
| Offline | Si el cliente pierde la red, no puede operar. | Igual problema, pero el server puede agregar una capa de cache local + sync queue (fase futura). |
| Concurrencia | Postgres maneja muchos clientes nativamente. | El server hace de gateway → puede rate-limit, batch, etc. SQLite atras del server tambien funciona si el volumen es chico. |
| Complejidad inicial | Media — config DB en cada cliente. | Alta — hay que construir el server HTTP. |
| Simplicidad operativa | Baja — N puntos de actualizacion. | Alta — un punto de actualizacion (server). Clientes son dummies. |

**Conclusion:** El segundo modelo gana en seguridad, simplicidad operativa, y compatibilidad con el futuro mobile/tablet. La complejidad inicial extra se amortiza rapido.

### 0.2 ¿Mismo tipo de instalable para server y client?

**Si.** Un solo binario (`FRC-Gourmet`) con un setting en el primer arranque que pregunta:
- **Standalone** (default): SQLite local, sin servidor. Mismo comportamiento de hoy.
- **Servidor** (oficina): SQLite o Postgres, abre puerto HTTP en LAN.
- **Cliente** (caja, mesonero): no toca DB local, todo lo manda al servidor.

Ventaja: una sola pipeline de release, un solo instalador, un solo update channel. La diferencia entre roles es solo configuracion en `userData/app-mode.json`.

### 0.3 Stack para el server HTTP

**Recomendacion: Fastify + JSON-RPC sobre `/api/rpc`.**

Razones:
- **Fastify** es lightweight, schema-first, perfecto para embeber en Electron main. Mas rapido que Express, menos magia.
- **JSON-RPC** sobre un solo endpoint `/api/rpc` permite mappear automaticamente cada `ipcMain.handle(channel, fn)` existente a una ruta sin escribir 700 routes a mano. Es el patron que mejor se adapta al codigo actual.
- Alternativa considerada y descartada: tRPC. Excelente para Node-Node pero mete typings agresivos que no se llevan bien con la estructura actual de handlers.
- Alternativa considerada y descartada: GraphQL. Overkill, requiere reescribir handlers como resolvers.
- WebSocket queda para fase 2 (push de eventos al cliente, ej. pedidos nuevos en una mesonera).

### 0.4 Mobile/tablet futuros

**Recomendacion: PWA Angular standalone que consume la misma API.**

- No reusar el codigo del desktop tal cual: muy pesado (Electron-only deps, sqlite, keytar, etc.).
- Crear un repo separado `frc-gourmet-mobile` (o un workspace nuevo): Angular + Ionic + Capacitor (o solo PWA si no hace falta nativo). Usa el mismo `RemoteRepositoryService` pattern del cliente desktop, mismo servidor.
- Distribucion: APK firmado + PWA hosteada por el mismo server (`http://lan-ip:port/` sirve la app). Tablets en LAN entran al URL del server, le da install-as-app y listo.

---

## 1. Vision objetivo

```
┌─────────────────────────┐                ┌─────────────────────────┐
│  Oficina (PC servidor)  │                │  Caja (PC cliente)      │
│  ─────────────────────  │                │  ─────────────────────  │
│  FRC Gourmet (server)   │  ◄── HTTP ──►  │  FRC Gourmet (client)   │
│  ├ Angular renderer     │   :7070/api    │  ├ Angular renderer     │
│  ├ Electron main + IPC  │                │  ├ Electron main (slim) │
│  ├ Fastify HTTP server  │                │  └ NO DB local          │
│  ├ TypeORM + SQLite|PG  │                │                         │
│  └ Backups / scheduler  │                │                         │
└─────────────────────────┘                └─────────────────────────┘
            ▲                                          ▲
            │ HTTP (LAN)                               │ misma API
            │                                          │
   ┌────────┴────────┐                       ┌─────────┴─────────┐
   │ Mesonera tablet │                       │  Stock movil       │
   │ (PWA Ionic)     │                       │  (PWA Ionic)       │
   └─────────────────┘                       └────────────────────┘
```

Caracteristicas:
- **Un servidor**, N clientes (desktop o web).
- DB del server es **SQLite por default** (sin friction); **Postgres opcional** cuando crece el volumen o quieren backup centralizado.
- Auth via **JWT firmado por el server**. Clientes guardan token en localStorage (igual que hoy, pero contra remote).
- **Auto-discovery LAN** opcional con mDNS/Bonjour para que clientes encuentren al server sin tipear IP. Caso simple: setting manual `http://192.168.1.10:7070`.

---

## 2. Restricciones y prerequisitos

Antes de meterse en cliente/servidor hay que cerrar deuda tecnica que actualmente bloquea:

| Item | Estado actual | Necesario |
|---|---|---|
| **Auth segura** | Password en texto plano en BD, JWT secret hardcodeado `'frc-gourmet-secret-key'`, password incluido en claims del JWT (per `REPORTE_VULNERABILIDADES.md`). | bcrypt, secret en keytar, claims minimal (user_id + roles + exp). **Sin esto el modo cliente/servidor expone cuentas en claro por la red.** |
| **Migrations TypeORM** | Recien introducidas en feat/baseline-migration. `synchronize: true` aun en dev. | Ya esta. Consolidar para que server pueda controlar version del schema. |
| **Repository abstraido** | `repository.service.ts` accede a `window.api` directo, 667 metodos. | Extraer interfaz `IRepository` + dos implementaciones (`IpcRepository` actual, `HttpRepository` nueva). |
| **Settings unificadas** | Cada feature tiene su JSON propio (`ia-config.json`, `backup-config.json`). | Un `app-settings.json` con sub-secciones: `mode`, `database`, `network`, `update`. Migracion suave. |
| **Image protocol** | Servido via `app://` (file system local). | En cliente, las imagenes vienen del server. URL `http://server/api/files/<id>` o `data:` inline para chicos. |

---

## 3. Plan por fases

Cada fase es **independientemente entregable** y puede ir a producción sin las siguientes. No se puede saltear orden.

### Fase 0 — Foundations (2 semanas)
**Objetivo:** Cerrar deuda tecnica + introducir capa de settings unificada + code signing. Sin cambios visibles al usuario en UI.

Tareas:
1. Migrar passwords existentes a bcrypt (handler `migrate-passwords` que corre una vez al arranque, lee plaintext, hashea, guarda).
2. Mover JWT secret a keytar (igual patron que `OPENAI_API_KEY` ya implementado en deploy).
3. Sacar `password` de los JWT claims (solo `user_id`, `roles[]`, `iat`, `exp`).
4. **Refresh tokens:**
   - Access token 15min, refresh token 30d (configurables).
   - Refresh token persistido en BD (entity `RefreshToken: id, usuario_id, token_hash, issued_at, expires_at, revoked_at, ip, user_agent`).
   - Endpoint `POST /api/auth/refresh` (en F3 cuando exista el server). En F0 solo dejamos la entity + util de generacion.
   - Logout invalida refresh token (soft delete con `revoked_at`).
5. Crear `electron/utils/app-settings.utils.ts`: lee/escribe `userData/app-settings.json`. Schema:
   ```json
   {
     "mode": "standalone",
     "database": { "type": "sqlite", "path": "default" },
     "network": null,
     "update": { "channel": "stable", "autoCheck": true }
   }
   ```
6. Migrar `ia-config.json`, `backup-config.json`, `update-config.json` a sub-secciones de `app-settings.json` con shim de retrocompatibilidad.
7. **Code signing Windows via SignPath Foundation:**
   - Aplicar al programa OSS de SignPath ([signpath.io/foundation](https://signpath.io/foundation)).
   - Esperar aprobacion (~1-2 sem).
   - Mientras tanto: integrar la GitHub Action de SignPath en `release.yml`.
   - Cuando aprueben, releases firmados sin SmartScreen warning despues de reputation building.
   - Fallback si no califica: documentar opcion Azure Trusted Signing ($10/mes) para activar despues.

Deliverables: 1 PR a `develop`. Sin features visibles. Tests focus en migracion segura de passwords + refresh token flow.

### Fase 1 — DB externa configurable en standalone (1 semana)
**Objetivo:** El usuario puede mover la SQLite a otro path, o usar Postgres. Sigue siendo standalone (sin red).

Tareas:
1. Generalizar `database.config.ts` para aceptar `DataSourceOptions` segun `app-settings.database`:
   - `{ type: 'sqlite', path: 'default' | '<custom path>' }`
   - `{ type: 'postgres', host, port, database, username, password (keytar), schema, ssl }`
2. Agregar `pg` como dep opcional. Postgres driver se carga dinamicamente con `await import('typeorm-pg')` para no inflar el bundle si nadie lo usa.
3. Pantalla de configuracion en Sistema → BD: form con tabs (SQLite / Postgres), boton "Probar conexion" que ejecuta una query trivial, "Guardar y reiniciar".
4. Migrar entities existentes a Postgres-friendly: tipos como `text` en vez de SQLite-specific, fechas con timezone, default values explicitos. Generar nueva migracion `0002_postgres_compatible.ts` que sea no-op en SQLite.
5. Test: arrancar app contra una Postgres docker-compose local, validar CRUD basico.

6. **Eliminar `synchronize: true` definitivamente:**
   - `database.config.ts`: forzar `synchronize: false` siempre, en SQLite y Postgres.
   - Toda nueva entity requiere migracion: documentar en `README.md` y `docs/MIGRATIONS.md` el comando `npm run migration:generate -- src/app/database/migrations/<NombreCambio>`.
   - Pre-commit hook (husky): si hay entity nueva sin migracion correspondiente, fallar. Heuristica: si hay diff en `entities/` sin diff correspondiente en `migrations/`, advertir.
   - Migracion baseline ya existe (PR #4 deploy worktree).

Deliverables: 1 PR a `develop`. Standalone con dos backends elegibles. Util incluso si nunca activamos cliente/servidor.

**Gotcha:** Despues de F1, agregar entities sin migracion ROMPE la app. Dev experience: el `migration:generate` lee el datasource activo, asi que hay que correr contra la BD que se quiere syncar. Documentarlo.

### Fase 2 — Repository abstraido (1-2 semanas)
**Objetivo:** Preparar el frontend para soportar dos transportes sin tocar componentes. Sin cambios visibles.

Tareas:
1. Definir interfaz `IRepository` con tipos correctos (estimado: 10-15 metodos por dominio × ~12 dominios). Generarla parcialmente desde `repository.service.ts` usando un script.
2. Renombrar `repository.service.ts` → `repository-ipc.service.ts`, hacer que implemente `IRepository`.
3. Crear `repository-http.service.ts` (skeleton vacio, lanza `NotImplementedError` por ahora).
4. Provider factory en `app.module.ts` que selecciona implementacion segun `app-settings.mode`:
   - `mode === 'client'` → `RepositoryHttpService`
   - else → `RepositoryIpcService`
5. **No cambiar nada en componentes.** Siguen inyectando `RepositoryService` (alias) que resuelve al adapter correcto.

Deliverables: 1 PR a `develop`. Refactor puro. CI verde + e2e existente sigue funcionando.

### Fase 3 — Modo servidor (2-3 semanas)
**Objetivo:** Una instancia desktop puede actuar como server HTTP en LAN. Pueden coexistir con modo standalone (basicamente: standalone + se abre el puerto).

Tareas:
1. `electron/server/` nuevo modulo:
   - `server.ts`: arranca Fastify en puerto configurable (`app-settings.network.port`, default 7070).
   - `auth-middleware.ts`: valida JWT en cada request salvo `/api/auth/login`, `/api/version`, `/api/health`.
   - `rpc-router.ts`: expone `POST /api/rpc` que recibe `{ method: string, params: any }` y delega al handler IPC equivalente. Mappeo automatico desde un registry global (ver paso 2).
2. Refactorizar `electron/handlers/*.handler.ts` para que cada `ipcMain.handle(channel, fn)` se registre tambien en un global `handlerRegistry: Map<string, Function>`. Esto NO rompe IPC actual (sigue funcionando), solo lo expone.
3. UI Sistema → Servidor: toggle "Activar modo servidor", input puerto, indicador "X clientes conectados", lista de IPs activas.
4. Endpoints especiales (no via RPC):
   - `GET /api/version` → schema version + app version (clientes lo usan al conectarse).
   - `GET /api/health` → ping.
   - `POST /api/auth/login` → usuario+password → JWT.
   - `GET /api/files/:id` → stream binario para imagenes/adjuntos.
   - `WS /api/events` → stream de eventos (pedidos nuevos, etc.). Usar `@fastify/websocket`. **Solo si fase 5 lo requiere; sino diferir.**
5. CORS + rate limiting basico (`@fastify/rate-limit`).
6. ~~mDNS broadcast~~ — **diferido a Fase 5+** por decision 7.3. En F3 el cliente tipea IP del server una vez.

Deliverables: 1 PR a `develop`. Server arranca pero sin clientes aun. Test manual: hacer `curl localhost:7070/api/version` desde otro proceso y validar response.

**Gotcha:** Firewall Windows. Primer arranque del server pide permiso. Documentar en `docs/RELEASE.md`.

### Fase 4 — Modo cliente (2 semanas)
**Objetivo:** Una instancia desktop puede operar sin DB local, todo contra el servidor.

Tareas:
1. Implementar `RepositoryHttpService` real:
   - Por cada metodo de `IRepository`, mappea a `POST /api/rpc { method: '<channel>', params: [...] }`.
   - Manejo de errores: timeouts (5s default), retry para idempotentes (GET-equivalente), prompt "Sin conexion con el servidor" cuando falla.
   - Manejo de auth: si JWT expira (401), reintenta login automatico si tiene refresh token (NUEVO — agregar refresh token al server fase 3).
2. UI primer arranque → wizard:
   - "¿Como vas a usar esta computadora?"
     - **Standalone** (sigue como hoy)
     - **Servidor** (oficina/HQ)
     - **Cliente** (caja/POS) → form: URL del server (con auto-discovery LAN), test de conexion, login.
3. En modo cliente, ocultar features que no aplican: backup local, config DB, scheduler interno, etc.
4. En modo cliente, las imagenes (`app://`) se reemplazan por `<server>/api/files/:id`. Cache HTTP normal del browser.
5. Auto-update en cliente: instala updates pero **bloquea operacion** si el server tiene un schema mas nuevo (`/api/version` mismatch). Mensaje "Esperando actualizacion del servidor".

Deliverables: 1 PR a `develop`. Setup de prueba: 2 PCs en LAN, una server y una cliente, operacion full POS sin DB local.

**Gotcha:** `electron-updater` en cliente: el manifest del canal sigue viniendo de GitHub (no del server). Bien — el server solo es para datos, no para distribucion del binario.

### Fase 5 — Multi-tenant fields + audit (1 semana)
**Objetivo:** Saber desde que dispositivo/cliente vino cada operacion. Util para audit y para futuros filtros UI.

Tareas:
1. Agregar `device_id` (NULL por default) a entities clave: `Venta`, `Compra`, `Caja`, `Conteo`, `Comanda`, `LoginSession`.
2. `device_id` viene del JWT claim (server lo setea al hacer login, persiste en client en localStorage).
3. UI Reportes: filtro "Por dispositivo".
4. Crear entity `Cliente` (en sentido de PC cliente, no comprador) en el server: `id, name, last_seen, ip, app_version`.

Deliverables: 1 PR a `develop`. Migracion aditiva, no rompe nada.

### Fase 6 — Mobile/tablet PWA (4-6 semanas, repo separado)
**Objetivo:** App movil en LAN para tomar pedidos / consultar stock. Solo lectura primero, escritura limitada despues.

Tareas (alto nivel):
1. Repo nuevo `frc-gourmet-mobile` (Angular + Ionic + Capacitor opcional).
2. Compartir `IRepository` y tipos via npm package interno o git subtree.
3. Implementar `RepositoryHttpService` (mismo codigo que en desktop client, factorizar).
4. UI mobile-first: pedidos en mesa, comandas en cocina, consulta de stock.
5. Build PWA + APK. PWA hosteada por el server desktop (`<server>/app`). APK firmada para Play Store interno.

Deliverables: app mobile funcional contra el server desktop. Plan separado, scope grande.

---

## 4. Plan de migracion para usuarios existentes

Hoy hay instalaciones standalone con SQLite local y operaciones acumuladas. La migracion debe ser segura.

1. **Standalone → Standalone con DB externa configurable** (Fase 1): el usuario puede mover la DB. Sin migracion, solo cambio de path o export/import.
2. **Standalone → Servidor**: el usuario activa modo servidor en su instalacion existente. La DB no se mueve (mismo path), solo se abre el puerto. **Operacion de la app sigue igual** localmente — el server es additivo.
3. **Standalone → Cliente**: el usuario tiene que **decidir si la data local se descarta o se exporta y carga al server**. Wizard con opcion "Mantener datos locales" (bloqueada en cliente real, solo para testing) vs "Conectar a servidor X y descartar local".

---

## 5. Riesgos y mitigaciones

| Riesgo | Mitigacion |
|---|---|
| Refactor masivo de `repository.service.ts` (3733 LOC, 667 metodos) introduce regresiones. | Generar interface automaticamente desde el servicio actual con script. Tests e2e deben pasar al final de Fase 2. CI con Playwright. |
| LAN inestable corta operacion del cliente. | Fase 4 incluye estado de conexion en toolbar (verde/rojo) + reintento automatico + queue local de operaciones de escritura para reproducir cuando vuelva (defer a Fase 7 si es complejo). |
| Postgres + SQLite divergen en tipos / queries. | Migracion `0002_postgres_compatible` aborda diferencias. Tests de integracion contra ambos en CI matrix. |
| Server desktop se cuelga / reinicia → todos los clientes pierden conexion. | Auto-restart del server (`launch on boot` documentado). Health check en cada cliente cada 30s. UI clara cuando el server no responde. |
| Update del server rompe API → clientes operando con schema incompatible. | Versioning del API (`/api/version` con `app_version` + `schema_version`). Cliente bloquea writes si mismatch. Forzar update del cliente en ese caso (auto-update via electron-updater dispara). |
| Carga concurrente sobre SQLite del server | Documentar limite de N clientes (probable: 10-15 ok para SQLite WAL). Para sucursales mas grandes, recomendar Postgres. |

---

## 6. Estimacion total

| Fase | Estimado | Acumulado |
|---|---|---|
| 0 — Foundations (incluye SignPath setup + refresh tokens) | 2 sem | 2 sem |
| 1 — DB externa (incluye eliminar `synchronize`) | 1 sem | 3 sem |
| 2 — Repository abstract | 1-2 sem | 5 sem |
| 3 — Modo servidor | 2-3 sem | 8 sem |
| 4 — Modo cliente | 2 sem | 10 sem |
| 5 — Multi-tenant fields | 1 sem | 11 sem |
| **Subtotal desktop** | | **~11 sem** |
| 5.5 — mDNS auto-discovery (opcional) | 0.5 sem | 11.5 sem |
| 6 — Mobile PWA | 4-6 sem | 17.5 sem |

Asumiendo 1 dev. Decisiones cerradas no agregan tiempo material — refresh tokens y SignPath estan absorbidos en F0.

---

## 7. Decisiones cerradas (2026-05-09)

| # | Decision | Resultado | Implicancia |
|---|---|---|---|
| 1 | DB del servidor | **SQLite default, Postgres opcional** | F1 implementa ambos drivers, default SQLite. Postgres es switch en config UI. |
| 2 | JWT tokens | **Access + refresh tokens** | F0 incluye refresh token endpoint + rotacion. Access token 15min, refresh 30d. |
| 3 | mDNS auto-discovery | **Despues de Fase 5** | F3 deja el server publicado en puerto fijo, cliente tipea IP manualmente. mDNS llega como mejora UX cuando hay >3 clientes. |
| 4 | Mobile PWA | **Despues de Fase 5** | Primero validar modelo con 2 desktops. F6 arranca solo cuando F5 cierra. |
| 5 | Code signing Windows | **SignPath Foundation en Fase 0** | Aplicar al programa OSS de SignPath (repo publico → elegible). Gratis. Integra via GitHub Action. Si no califica, fallback Azure Trusted Signing ($10/mes). |
| 6 | `synchronize: true` | **Eliminar en Fase 1** | A partir de F1, `synchronize: false` siempre. Toda nueva entity exige migracion generada con `npm run migration:generate`. Dev experience: documentar el comando + agregar al README. |

---

## 8. Anexo — Metricas para guiar Fase 1 (DB externa)

Antes de implementar Postgres, conviene saber:
- ¿Cuantas filas tiene cada tabla en una instalacion tipica? (ej. cuanto creció `Venta` en 6 meses)
- ¿Cual es el tamaño del archivo `.db` actual? (afecta backup time, sync time si pensamos en cliente offline-cache)
- ¿Cuantos pedidos / minuto en hora pico?

Si alguno de estos es alto (>10k pedidos/dia, >1GB DB), Postgres deja de ser opcional y pasa a default.

---

## 9. Apendice — Lo que NO esta en alcance

Por claridad, lo siguiente queda explicitamente fuera:
- Sync offline-first / CRDT / replicacion bidireccional. Si la red se cae, el cliente se bloquea (fase 7 hipotetica).
- Multi-sucursal con replicacion central (eso es el dominio de `frc-comercial/central` + `frc-comercial/filial`). Aca asumimos UN restaurante con multiples PCs en LAN.
- Migracion a microservicios. El server desktop es monolitico y asi se queda.
- Cloud hosting del server. El server vive en una PC del restaurante, no en la nube. Si en el futuro se quiere cloud, el patron ya esta preparado (es una HTTP API), pero no es objetivo de este plan.
