# Plan: Cliente web mobile (PWA) — FRC Gourmet

> Estado vivo. Verificado: 2026-06-28. Branch original: `feat/mobile-pwa-cliente` (ya en `develop`).
>
> **IMPLEMENTADO:** la PWA existe en `projects/mobile` y el server Fastify la sirve. F0 ✅ · F1 ✅ ·
> F2 (servir PWA ✅ / TLS del mesh ⛔ requiere acción del usuario) · F3 ✅ · olas administrativas con
> múltiples dominios ya cubiertos (RRHH, Productos, Compras, Financiero, Clientes/Comisiones — mezcla de
> CRUD y vistas). Detalle por pantalla en [`mobile-pwa-skill-notes.md`](./mobile-pwa-skill-notes.md).
> **GATE pendiente:** validar E2E contra server real (mode=server + mesh) antes de dar por cerrado el resto.
>
> > **Nota de alcance:** el plan original anticipaba un *repo separado* (`frc-gourmet-mobile`); se decidió
> > finalmente hacerlo **dentro del mismo repo** (`projects/mobile` + path-alias `@frc/shared-core`).

## Objetivo

Cliente **web mobile/tablet (PWA)** dentro del **mismo repo**, que consume el server
Fastify existente (`mode=server`) por HTTP. SaaS totalmente operable desde mobile.
Roadmap por audiencia:

1. **Administrativa** (MVP actual) — todo lo administrativo con **paridad CRUD**, menos
   "Sistema / Configuración".
2. **Mozo** — tomar pedidos, mesas, comandas.
3. **Cocina** — stock, recetas, pedidos de insumos.
4. **Colaboradores** — avisos, tareas, salarios, vales, créditos, estados de cuenta,
   pedidos de vacaciones/días libres.

## Decisiones de arquitectura (confirmadas con el usuario)

| # | Decisión | Elección |
|---|----------|----------|
| 1 | Estructura en el repo | **App Angular separada** (`projects/mobile`) + **librería compartida** (`@frc/shared-core`). Desktop y mobile comparten lógica de datos, **no** UI. |
| 2 | Red LAN/WAN | **IP/hostname único del mesh headscale** con TLS. Tailscale rutea directo-LAN cuando estás en el local y relay-WAN cuando remoto (LAN-first automático). |
| 3 | Hosting del bundle | **El server Fastify sirve la PWA** por HTTPS (`/app`). |
| 4 | Alcance MVP | **Paridad CRUD** de todo lo administrativo, **excepto** Sistema/Configuración. |
| 5 | Offline (MVP) | Server inaccesible ⇒ **ninguna acción** (pantalla "sin conexión"). El SW solo cachea el app-shell. |
| 6 | UI | **100% nueva**, sin reutilizar componentes/diálogos del desktop. Patterns modernos mobile/tablet. |
| 7 | Librería compartida | Migración **incremental** vía path-alias `@frc/shared-core` (no mover todo de una; desktop intacto). |

## Hallazgos clave del código (que condicionan el plan)

- El **server Fastify ya está maduro**: `/api/auth/login` + `/api/auth/refresh` (JWT access 15min +
  refresh 30d con rotación), `/api/rpc/:channel` que expone los ~696 handlers IPC vía
  `handlerRegistry`, `/api/files/...`, CORS `origin:true` (ya contempla PWAs), rate-limit,
  `bcrypt` (passwords **no** son texto plano).
- **`ensurePermission` (P0) corre server-side** en cada RPC ⇒ la seguridad no depende de la UI mobile.
- **`repository-http.service.ts` es un SKELETON**: sus ~400 métodos lanzan
  `"no esta implementado todavia"`. El `mode=client` del **desktop NO lo usa**: el
  `repositoryFactory` (`app.module.ts`) siempre devuelve `RepositoryIpcService` y el **preload
  monkea `ipcRenderer.invoke`** para rutear a HTTP. En un **browser puro no hay preload/`window.api`**,
  así que ese mecanismo no sirve y hay que construir el transporte HTTP del lado browser.
- Servicios Angular **reutilizables tal cual** (sin Electron): `AuthService`, `ThemeService`,
  `PermissionService`, `TabsService`, `CurrencyConfigService`, `UnitConversionService`,
  `PaginatorIntlEs`.
- Servicios **acoplados a Electron** (NO van al mobile): `PrinterService`, `DatabaseService`,
  `UpdateService`, `AppModeService`, `DocumentoService`, `RepositoryIpcService` (depende de `window.api`).

## Arquitectura objetivo

```
┌─────────────── Dispositivo (Android/iOS, browser) ───────────────┐
│  PWA Angular (projects/mobile)  ── UI mobile-first NUEVA          │
│        └► RepositoryService (abstract, @frc/shared-core)          │
│               └► impl HTTP (apiHttp shim)                         │
│                     └► POST /api/rpc {method, params}             │
│                        + Authorization: Bearer <JWT> + refresh 401│
└──────────────────────────────│───────────────────────────────────┘
                               │ HTTPS (mesh headscale, LAN-first)
                               ▼
┌─────────────── PC servidor (Electron mode=server) ───────────────┐
│  Fastify  /app/*  → bundle PWA (static, @fastify/static)         │
│           /api/auth/login|refresh  → JWT                          │
│           /api/rpc/:channel        → handlerRegistry (696)        │
│           /api/files/...           → imágenes/adjuntos            │
│           ensurePermission (P0) en cada RPC                       │
└──────────────────────────────────────────────────────────────────┘
```

## Capa de datos de la PWA (la pieza que falta)

**Estrategia elegida:** generar un **shim `apiHttp`** en browser que exponga los mismos nombres de
método que `window.api`, cada uno haciendo `rpc('<channel>', [...args])` → `POST /api/rpc` con
Bearer + refresh en 401. El mapeo método→channel ya vive en `preload.ts`; un **script de build**
lo parsea y emite `api-http.generated.ts` (single source of truth, se regenera en cada build).
Esto permite **reutilizar la lógica de `RepositoryIpcService`** (400 métodos ya mantenidos) sin
duplicarla; solo cambia el transporte.

## Infra del server

- **TLS (bloqueante para PWA):** Fastify hoy es HTTP. La PWA exige HTTPS (service worker +
  mixed-content). Opciones a validar contra la versión de headscale:
  - (a) `tailscale serve` termina HTTPS con cert del tailnet y proxea al Fastify local (lo más limpio
    si headscale soporta endpoints de cert).
  - (b) Reverse proxy local (Caddy) o TLS directo en Fastify con cert propio (dominio real DNS-01, o
    CA privada instalada en los dispositivos).
- **Servir bundle:** `@fastify/static` → `/app` → `dist/mobile`. Cache-control para que el SW maneje versiones.

## Imágenes / archivos

`app://producto-images/...` no existe en browser ⇒ resolver a `GET /api/files/by-url` con auth.
Como `<img>` no manda headers, usar **fetch→blobURL** (o token firmado por query).

## Alcance administrativo (paridad CRUD) — secuenciado por olas

- **Ola 1 — RRHH**: Personas, Usuarios, Cargos, Funcionarios, Turnos, Asistencias, Vales, Préstamos,
  Liquidaciones, Bonos, Aguinaldos, Penalizaciones, Horas extra, Feriados, Notificaciones,
  Config RRHH, Permisos.
- **Ola 2 — Financiero**: Cajas, Monedas, Caja Mayor, Cuentas por Cobrar.
- **Ola 3 — Compras**: Compras, Importaciones IA.
- **Ola 4 — Productos**: Productos, Recetas, Sabores, Adicionales.
- **Ola 5 — Clientes/Comisiones** + Dashboards por dominio.
- **Fuera de MVP**: todo "Sistema / Configuración" (Impresoras, Dispositivos, Backup, Configurar IA, Modo).

## Fases de ejecución

- **F0 — Cimientos**: workspace multi-proyecto + path-alias `@frc/shared-core`; `projects/mobile`
  scaffold; PWA shell que compila. ✅ hito: `npm run build` (desktop) sigue verde + build mobile.
- **F1 — Capa de datos + auth**: generador `api-http`, transporte RPC (Bearer+refresh), reuso de la
  lógica del repo, login HTTP, estado "sin conexión". Hito: login real + un listado por `/api/rpc`.
- **F2 — Infra server**: TLS del mesh + `@fastify/static` sirviendo `/app`. Hito: PWA instalable
  abierta desde el celu vía headscale (LAN y WAN). *(TLS depende de info de headscale del usuario.)*
- **F3 — Shell mobile + imágenes**: navegación (bottom-nav/drawer), theming, archivos.
- **F4..Fn — Olas administrativas**: RRHH → Financiero → Compras → Productos → Clientes/Comisiones,
  cada dominio con listados + alta/edición/baja mobile-first nuevos.

## Decisiones abiertas / acciones manuales del usuario

1. **TLS con headscale** (F2): validar si la versión soporta `tailscale serve`/cert; si no, Caddy o CA
   privada. Necesita datos del entorno del usuario. *(No bloquea F0/F1/F3.)*
2. **Hardening JWT secret** (`'frc-gourmet-secret-key'` hardcodeado) antes de exponer por WAN. Ítem de
   seguridad, no bloqueante del MVP.
3. **Testing contra server real** requiere que el usuario levante `mode=server` y el mesh.

## Convenciones de trabajo para esta iniciativa

- Commit entre fases y entre pasos grandes. Branch `feat/mobile-pwa-cliente` → PR a `develop`.
- Verificar compilación con `npm run build` (nunca `npm start`).
- Respetar reglas duras del proyecto (UPPERCASE en BD, colores de tema, etc.) también en mobile.
