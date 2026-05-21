---
name: frc-gourmet-expert
description: Experto integral del sistema FRC Gourmet (Electron 24 + Angular 15 + TypeORM dual SQLite/Postgres + Fastify cliente/servidor). Conoce arquitectura, todos los dominios (productos, recetas, ventas, compras, financiero, RRHH, comisiones), convenciones, seeds, atajos y bugs conocidos. Activar al trabajar en cualquier parte de este repo.
license: Proprietary
---

# FRC Gourmet Expert

Soy el experto interno del sistema FRC Gourmet. Conozco la arquitectura, los dominios, las convenciones y la historia de decisiones. Al activarme, asumí que tengo contexto completo: no necesito redescubrir patrones, ni preguntar dónde está cada cosa.

> **Cómo está organizada esta skill:** este archivo es el índice. Cada sección apunta a un documento dedicado en `architecture/`, `domains/`, `conventions/`, `workflows/`, `reference/` o `manual-usuario/`. Carga sólo los documentos relevantes a la tarea — no todos a la vez.

---

## 1. Quick facts (siempre verdadero)

- **Stack:** Angular 15 (standalone + AppModule mixto) + Electron 24 + TypeORM 0.3.21 sobre **SQLite o Postgres** (driver seleccionable en runtime).
- **`synchronize: false` desde F1.5** — toda nueva entity exige migration generada con `npm run migration:generate`. Dual baseline `migrations/` SQLite + Postgres; `getMigrations(driver)` elige cuál corre. `DatabaseService` hace backup + runMigrations automático en cada arranque.
- **Modos de operación (F4.2):** `standalone` (default, todo local), `server` (este PC expone Fastify en `/api/*` + sirve clientes), `client` (todas las llamadas a un server remoto vía HTTP). Configurable desde *Sistema → Modo de operación*. Settings unificadas en `userData/app-settings.json`.
- **Navegación:** sistema de **tabs dinámicas** vía `TabsService`. La única ruta del Router de Angular es `/login`. Todo lo demás se abre como tab.
- **IPC en 4 capas:** Entity → Handler (`electron/handlers/*`) → Preload (`preload.ts`) → `RepositoryService` (Angular, devuelve Observables). En `mode=client`, preload monkey-patchea `ipcRenderer.invoke` para rutear a HTTP `/api/rpc`.
- **DB file:** SQLite default = `frc-gourmet.db` en `app.getPath('userData')`. **Postgres: la app SÍ crea la BD + el rol/usuario** — el handler `db-config-init-postgres` se conecta con el superusuario, hace `CREATE ROLE` + `CREATE DATABASE` + `GRANT` (idempotente). El operador solo instala Postgres y da las credenciales del superusuario; NO necesita pgAdmin ni `CREATE DATABASE` manual. Detalles → [workflows/setup-pc-nueva.md](workflows/setup-pc-nueva.md).
- **Release y deploy:** `semantic-release` + GitHub Actions. Push a `master` → canal `stable`, `release/beta` → `beta`, `develop` → `alpha`. Cada push dispara `release.yml` → tag + GitHub Release + instaladores Windows NSIS / Linux AppImage. La app trae **auto-update** (`electron-updater`). La branch de releases es **`master`** (NO `main` — `origin/main` está obsoleta). Detalles → [workflows/release-y-deploy.md](workflows/release-y-deploy.md).
- **Custom protocols Electron:** `app://profile-images/<file>` y `app://producto-images/<file>` sirven archivos desde `userData/`. En `mode=client` proxean por `/api/files/by-url`.
- **Idioma de la app:** español. Strings se guardan en **UPPERCASE** en BD.
- **Moneda:** Paraguay primero (PYG, sin decimales) + USD/BRL. Conversión vía `MonedaCambio.compraLocal`.
- **Seeds idempotentes** en cada arranque: cubren admin user, permisos, monedas, formas de pago, categorías de gasto/compra, conceptos liquidación, config RRHH, familia GENERAL, turnos, feriados PY, observaciones, roles plantilla (GERENTE/CAJERO/MOZO). Detalles → [architecture/seed-system.md](architecture/seed-system.md).
- **Comandos:**
  - **`npm run build`** — compila Angular + tsc Electron. **Usar para verificar compilación.**
  - **`npm start`** — el USUARIO lo corre manualmente. NUNCA ejecutar desde el agente. (`feedback_npm_start_manual`)
  - **`npm run migration:generate -- src/app/database/migrations/<NombreMigration>`** — generar migration desde diff de entities.
  - **`npm run migration:generate:postgres -- ...`** — variante para baseline Postgres.

---

## 2. Cómo navegar esta skill

**Si el usuario pregunta sobre…**

| Pregunta | Cargar |
|---|---|
| Cómo está estructurado el proyecto, qué hace cada capa | [architecture/overview.md](architecture/overview.md) |
| Cómo añadir una nueva entidad de punta a punta | [workflows/add-new-entity.md](workflows/add-new-entity.md) |
| **Archivos, imágenes, adjuntos, visor de docs** (`app://`, `<app-file-upload>`, `<app-document-viewer>`, thumbnails, entity `Adjunto`) | [domains/archivos-y-adjuntos.md](domains/archivos-y-adjuntos.md) |
| Cómo viaja un dato del frontend al backend (IPC) | [architecture/ipc-pattern.md](architecture/ipc-pattern.md) |
| TypeORM, BaseModel, dual driver (SQLite/Postgres), migrations, ubicación del .db | [architecture/database.md](architecture/database.md) |
| **Seeds del sistema** (admin, permisos, catálogos base, roles plantilla, feriados PY) | [architecture/seed-system.md](architecture/seed-system.md) |
| **Modo cliente/servidor** (F4 standalone/server/client, Fastify, HTTP routing, device_id) | [architecture/cliente-servidor.md](architecture/cliente-servidor.md) |
| **Cliente Mobile (PWA)** (`projects/mobile`, shim HTTP→/api/rpc, shell mobile, cobertura admin) | [architecture/mobile-pwa.md](architecture/mobile-pwa.md) |
| **Setup en PC nueva / Postgres** (la app crea la DB, configurar, modos, primer login) | [workflows/setup-pc-nueva.md](workflows/setup-pc-nueva.md) |
| **Release y deploy** (semantic-release, canales, GitHub Actions, auto-update, deploy a un local real) | [workflows/release-y-deploy.md](workflows/release-y-deploy.md) |
| `main.ts`, ciclo de vida Electron, custom protocols | [architecture/electron-bootstrap.md](architecture/electron-bootstrap.md) |
| Tabs, sidenav, layout principal, ThemeService | [architecture/frontend-shell.md](architecture/frontend-shell.md) |
| Login, sesiones, roles, permisos, `getCurrentUser` | [architecture/auth-permissions.md](architecture/auth-permissions.md) |
| **Productos** (Familia/Subfamilia/Producto/Presentación/Precios) | [domains/productos.md](domains/productos.md) |
| **Recetas, Sabores, Variaciones** (refactor 2024-07-29, multi-sabor pizza) | [domains/recetas-sabores-variaciones.md](domains/recetas-sabores-variaciones.md) |
| **Ventas y PdV** (mesas, comandas, atajos, delivery, cobro) | [domains/ventas-pdv.md](domains/ventas-pdv.md) |
| **Compras** (proveedor, finalizar, pago unificado vía CPP) | [domains/compras-cpp.md](domains/compras-cpp.md) |
| **Importación de facturas con OCR + IA** (GPT-4o vision, aliases, revisor en tab) | [domains/importacion-facturas-ocr.md](domains/importacion-facturas-ocr.md) |
| **Caja Mayor** (movimientos, anulaciones, configuración) | [domains/financiero-caja-mayor.md](domains/financiero-caja-mayor.md) |
| **Bancos, cheques, POS** (cuentas bancarias, acreditaciones) | [domains/financiero-bancos-pos.md](domains/financiero-bancos-pos.md) |
| **CPP / CPC** (dirección de flujo, préstamos a funcionarios) | [domains/financiero-cpp-cpc.md](domains/financiero-cpp-cpc.md) |
| **RRHH** (funcionarios, asistencias, vales, vacaciones) | [domains/rrhh.md](domains/rrhh.md) |
| **Liquidaciones, comisiones** (sueldo, aguinaldo, equipos) | [domains/rrhh-liquidaciones.md](domains/rrhh-liquidaciones.md) |
| **Personas, Clientes, Usuarios** | [domains/personas-clientes.md](domains/personas-clientes.md) |
| **Impresoras térmicas** | [domains/cocina-impresion.md](domains/cocina-impresion.md) |
| **Dashboards** (padrón unificado, componentes shared, handlers KPI) | [domains/dashboards.md](domains/dashboards.md) |
| Reglas de código (UPPERCASE, no func en templates, colores) | [conventions/coding-rules.md](conventions/coding-rules.md) |
| Patrones UI (mat-menu acciones, tab/dialog híbrido, full-height) | [conventions/ui-patterns.md](conventions/ui-patterns.md) |
| Bugs comunes y workarounds (TypeORM null, fechas UTC, mat-chip) | [conventions/pitfalls-typeorm-electron.md](conventions/pitfalls-typeorm-electron.md) |
| Cómo debuggear un bug en X dominio | [workflows/debug-checklist.md](workflows/debug-checklist.md) |
| Verificar BD SQLite manualmente | [workflows/verificacion-bd-sqlite.md](workflows/verificacion-bd-sqlite.md) |
| TODOs pendientes del proyecto | [workflows/todos-pendientes.md](workflows/todos-pendientes.md) |
| Árbol completo del sidenav | [reference/menu-sidenav-tree.md](reference/menu-sidenav-tree.md) |
| Lista de handlers IPC con responsabilidades | [reference/handlers-index.md](reference/handlers-index.md) |
| Índice de las ~170 entidades por dominio | [reference/entities-index.md](reference/entities-index.md) |
| Catálogo de enums clave | [reference/enums-index.md](reference/enums-index.md) |
| Bugs conocidos sin resolver | [reference/known-bugs.md](reference/known-bugs.md) |

**Manual de usuario** (capítulos 0–19) en [`manual-usuario/`](manual-usuario/) — para usuarios finales, no desarrolladores.

---

## 3. Reglas duras del proyecto (no negociables)

Estas las debo respetar SIEMPRE, sin que el usuario las repita:

1. **Nunca correr `npm start`** — el usuario lo corre manualmente. Para verificar compilación: `npm run build`.
2. **Editar sólo `.ts`** — los `.js` y `.js.map` se autogeneran de TypeScript.
3. **Strings en UPPERCASE en BD** — convertir en handlers o componentes antes de guardar.
4. **No funciones en templates Angular** — pre-computar en propiedades, usar pipes para transformar. **Sin getters tampoco.**
5. **No colores hardcoded** — usar variables de tema (`--text-primary`, `--surface`, etc.) para soporte dark/light.
6. **Estados sólo verde/amarillo/naranja/rojo/celeste** — no morado/gris/colores arbitrarios. ([feedback_colores_estados](#))
7. **Acciones en tablas con `mat-menu` + `more_vert`** — nunca iconos sueltos. ([feedback_mat_menu_acciones](#))
8. **Confirmaciones con `ConfirmationDialogComponent`** — nunca `confirm()` ni alerts custom.
9. **Acceso a BD desde Angular sólo vía `RepositoryService`** — no instanciar TypeORM en el renderer.
10. **Number formatting:** siempre `| number:'1.0-2'` en pipes.
11. **No live filtering** — botón "Filtrar" explícito, salvo que el usuario pida lo contrario.
12. **No `mat-sort-header`** sin pedido explícito.
13. **Pruebas UI paso a paso** — un solo paso por turno, esperar confirmación, verificar BD entre pasos. ([feedback_pruebas_ui_paso_a_paso](#))
14. **Avisar siempre** si el usuario debe reiniciar la app: backend (`electron/handlers/`, `preload.ts`, `main.ts`, nuevas entidades, `database.config.ts`) → reinicio. Solo Angular templates/scss/ts → hot reload. ([feedback_reiniciar_app](#))
15. **Para nulear columna en TypeORM:** `(entity as any).campo = null`, NUNCA `undefined` (no genera UPDATE). ([feedback_typeorm_null_undefined](#))
16. **Cada diálogo, un propósito** — no mezclar conceptos. ([feedback_separar_conceptos](#))
17. **Componente de tabla con scroll local** — usar el patrón full-height de [conventions/ui-patterns.md](conventions/ui-patterns.md), no el scroll global de la tab.
18. **Si el componente es muy grande para mat-dialog** — convertir a híbrido tab/dialog. ([feedback_componente_hibrido_tab_dialog](#))
19. **Dashboards: padrón unificado obligatorio** — usar `<app-dash-stat-chip>`, `<app-dash-quick-action>`, `<app-dash-ranking>`, `<app-dash-section-header>`, `<app-dash-chart-card>` de `shared/components/dashboard/`; estilos comunes en `_dashboard.scss`; chart options vía `getDashboardChartOptions()`. Detalles → [domains/dashboards.md](domains/dashboards.md).
20. **Si el usuario menciona trabajo paralelo de otro agente** — usar `git worktree add` (no `checkout` en el directorio principal). El checkout cambia el filesystem para todos los procesos. ([feedback_git_worktree_paralelo](#))

---

## 4. Estado actual del repo (snapshot 2026-05-15)

> Esta sección puede quedar desactualizada. Si el usuario pregunta por estado actual, **revisar `git log` y memorias antes de responder**.

- **Branches de larga duración:** `develop` (working) y **`master`** (releases). `origin/main` está obsoleta (`gone`). El skill viejo decía "main (releases)" — ignorar, es `master`.
- **Primer release stable publicado: `v1.1.0` (2026-05-15)**. Sucesión rápida hasta `v1.5.0` el mismo día. **Auto-update totalmente funcional** desde v1.4.0; segundo update consecutivo (v1.4.0 → v1.5.0) sin intervención manual confirma la estabilidad del flujo. Si en el futuro un update falla, es bug a investigar — no comportamiento esperado. Bugs históricos ya cerrados: `pg` faltante en bundle (fix v1.1.1) y `verifyUpdateCodeSignature` que en electron-updater 6.x es función no boolean (fix v1.3.0). Ver [conventions/pitfalls-typeorm-electron.md](conventions/pitfalls-typeorm-electron.md) y [workflows/release-y-deploy.md](workflows/release-y-deploy.md) sección "Historial de validación".
- **Registrar Vale como egreso directo desde Caja Mayor (v1.5.0):** card "Registrar Vale" en `registrar-egreso-dialog` → `create-edit-vale-dialog` en modo `confirmar` (caja preseleccionada, caja+formaPago obligatorios) → handler atómico `crear-vale-confirmado` (`vales.handler.ts:119+`) crea Vale CONFIRMADO + CajaMayorMovimiento EGRESO_VALE + actualiza saldo en una transacción. Requiere `RRHH_VALE_CREAR` + `RRHH_VALE_CONFIRMAR`. Detalles → [domains/rrhh.md](domains/rrhh.md) sección "Crear vale ya confirmado desde Caja Mayor".
- **Toolbar con titlebar custom + datos enriquecidos (v1.3.0 + v1.4.0):** `BrowserWindow({ frame: false })` en Win/Linux con controles min/max/close custom en `app.component`, `titleBarStyle: 'hiddenInset'` en macOS para mantener semáforos nativos. Header muestra subtitle "FRC Gourmet v{appVersion}", chip de modo (Servidor/Cliente), cotizaciones USD/BRL del scrapper de nortecambios (refresh 5min) y reloj en vivo (1s, fuera de NgZone). **Toda la toolbar es draggable** (`-webkit-app-region: drag`); botones/inputs/links marcados `no-drag`. Si tocás la toolbar, respetá esto.
- **Asignar roles a usuario existente (v1.2.0):** UI en `create-edit-usuario` con multi-select que calcula diff y llama `assignRoleToUsuario` / `removeRoleFromUsuario` (recibe `usuarioRole.id`, NO `role.id`).
- **Cliente/servidor F1–F5 MERGED** — dual driver SQLite+Postgres con migrations (`synchronize: false`), Repository abstract+factory IPC/HTTP, Fastify server con handler registry global + RPC router + JWT, modos standalone/server/client en `app-settings.json` con wizard, multi-tenant `device_id`.
- **Seguridad P0 MERGED (PR #22, 2026-05-14)** — `checkPermission`/`ensurePermission` en ~178 handlers IPC sensibles (P0-1), cambio de password forzado en primer login con `must_change_password` + dialog bloqueante (P0-3), `*appHasPermission` directiva, smoke E2E de permisos.
- **Empresa MERGED (PR #21)** — datos de empresa + branding visual + logo en header.
- **Clientes módulo completo MERGED (PR #20)** — CRUD F1, F2 cliente-detalle con padrón dashboards, venta a crédito desde PdV (`cobrar-venta-credito` atómico), cobro de CPC desde Caja Mayor, fix `pg.types.setTypeParser(1700)` para NUMERIC.
- **Onboarding + cotización mercado MERGED (PR #19)**, **UX sweep (PR #18)**, **F4 images E2E fix (PR #17)**.
- **Dashboards padrón unificado MERGED** — 7 dashboards con SCSS partial común + 5 componentes shared (`<app-dash-*>`) + 5 handlers KPI por dominio + 6 permisos `XXX_DASHBOARD_VER`. **Pendiente: activar `PermissionService` en frontend** (existe pero no se usa para chequear permisos).
- **Importación de facturas con OCR + IA** (GPT-4o vision), **Backup/Restore + Reset BD** + seed admin, **Compras MVP** con pago unificado vía CPP, **RRHH** hasta Fase 8, **Ventas/PdV** avanzado, **Productos** con refactor variaciones (RecetaPresentacion).
- **Seed system actualizado** — limpieza de seeds con datos placeholder (CuentaBancaria, MaquinaPos, MonedaCambio quitados); agregados Familia/Subfamilia GENERAL, Turnos, Feriados PY, Observaciones, Roles plantilla (GERENTE/CAJERO/MOZO). Detalles → [architecture/seed-system.md](architecture/seed-system.md).
- **Branch protection:** develop y master requieren checks `Lint + Build (ubuntu-latest)` y `Lint + Build (windows-latest)` antes de mergear. No requieren reviews.
- **Repo en GitHub se llama `frc-gourmet`** — el directorio local es `frc-gourmet-legacy` pero el remoto se renombró y mantiene redirect.
- **Pendientes mayores:** UI Promociones, Producción, Reservas avanzadas; completar migración ngModel→Reactive Forms; chequear permisos en sidenav y `app.component.ts`. **Cliente Mobile PWA: EN CURSO** (branch `feat/mobile-pwa-cliente`, MVP administrativo construido) → ver [architecture/mobile-pwa.md](architecture/mobile-pwa.md).

Detalles → [workflows/todos-pendientes.md](workflows/todos-pendientes.md).

---

## 5. Antes de actuar, recordá:

- **Verificá memoria:** los archivos en `~/.claude/projects/-Users-gabfranck-workspace-frc-gourmet-legacy/memory/` reflejan decisiones de sesiones pasadas. Si algo en esta skill conflictúa con una memoria más reciente, la memoria gana — y luego actualizá la skill.
- **Verificá el código antes de afirmar:** esta skill describe el sistema en un momento; nombres de archivos/símbolos pueden haber cambiado. Si vas a recomendar editar un archivo o llamar a una función, **leé primero**.
- **Auto memoria:** seguir guardando memorias nuevas cuando el usuario corrija o confirme decisiones no obvias.

---

## 6. Modo de trabajo con el usuario (Gabriel)

- Habla **español** (rioplatense/paraguayo). Respondé en español salvo que escriba en otro idioma.
- Prefiere **respuestas cortas y directas**, sin resúmenes redundantes al final.
- Le gusta probar **paso a paso** — una acción por turno, no listas largas de pasos para hacer todo de una.
- Usa **dark theme** generalmente. Verificar siempre que los cambios visuales funcionen en ambos.
- Trabaja en `userData/frc-gourmet.db` (la BD de prod local). **Hacer backup antes de cambios destructivos** (entidades, columnas, deletes masivos).

---

*Este es el índice. Para cada tarea concreta, cargá el documento específico que aplique.*
