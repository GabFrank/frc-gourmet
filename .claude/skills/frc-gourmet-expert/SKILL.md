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
  - **`npm run build`** — compila Angular (`ng build`) + tsc Electron. **Usar para verificar compilación.**
  - **`npm run check`** — AOT de producción (`ng build --configuration production`). **Correr ANTES de pushear** — el AOT rechaza errores que `ng serve` tolera.
  - **`npm start`** — Angular (4201) + Electron juntos. **El agente lo corre y lo monitorea** (regla actualizada 2026-08-11; antes era exclusivo del usuario). Al relanzar, matar lo anterior: el Electron viejo retiene el puerto 7070 aunque se cierre la ventana (`lsof -ti:7070`).
  - **`npm run migration:generate -- src/app/database/migrations/<NombreMigration>`** — generar migration desde diff de entities (usa el DataSource CLI `src/app/database/datasource.ts`, SQLite por default; el timestamp epoch-ms se prefija solo).
  - **Baseline Postgres:** NO hay script `migration:generate:postgres`. Se genera con variables de entorno: `FRC_DB_TYPE=postgres FRC_PG_DATABASE=frc_gourmet_baseline_pg npm run migration:generate -- src/app/database/migrations/<Nombre>`.
  - Otros: `migration:create`, `migration:run`, `migration:revert`, `migration:show`.

---

## 2. Cómo navegar esta skill

**Si el usuario pregunta sobre…**

| Pregunta | Cargar |
|---|---|
| **Ciclo de implementación de una feature o fix** (proceso obligatorio de punta a punta) | [workflows/ciclo-implementacion.md](workflows/ciclo-implementacion.md) |
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
| **Menú lateral / navegación** (sidenav recursivo 3 niveles, árbol único `MENU_TREE`, `enSidenav`/`enBuscador`) | [domains/menu-sidenav.md](domains/menu-sidenav.md) |
| **Buscador global** (command palette Ctrl+Espacio, árbol único de menús, handler `buscar-global`) | [domains/buscador-global.md](domains/buscador-global.md) |
| Login, sesiones, roles, permisos, `getCurrentUser` | [architecture/auth-permissions.md](architecture/auth-permissions.md) |
| **Productos** (Familia/Subfamilia/Producto/Presentación/Precios) | [domains/productos.md](domains/productos.md) |
| **Recetas, Sabores, Variaciones** (cada variación su propia receta desde 2026-07, multi-sabor pizza, Gestión de Sabores) | [domains/recetas-sabores-variaciones.md](domains/recetas-sabores-variaciones.md) |
| **Ventas y PdV** (mesas, comandas, atajos, delivery/retiro **y su conversión**, cobro parcial por ítems, cajas compartidas, utilitarios del cajón) | [domains/ventas-pdv.md](domains/ventas-pdv.md) |
| **Compras** (proveedor, finalizar, pago unificado vía CPP, compra simplificada) | [domains/compras-cpp.md](domains/compras-cpp.md) |
| **Facturación legal** (SET/SIFEN, timbrado+numeración, emisión desde el cobro del PdV, plantillas pdfmake) | [domains/facturacion.md](domains/facturacion.md) |
| **Pedidos Online / Storefront** (webapp pública tipo iFood, `/pub/*`, auth de cliente, bandeja PdV, pizza online) | [domains/pedidos-online.md](domains/pedidos-online.md) |
| **Importación de facturas con OCR + IA** (GPT-4o vision, aliases, revisor en tab) | [domains/importacion-facturas-ocr.md](domains/importacion-facturas-ocr.md) |
| **KDS (Kitchen Display Screen)** (componente compartido desktop/PWA `/kds`, SSE, modo TV, bump bar) | [domains/cocina-impresion.md](domains/cocina-impresion.md) |
| **Música ambiental** (Spotify Connect, descubrimiento con IA, playlists por bloque, runtime, control en PWA) | [domains/musica-ambiental.md](domains/musica-ambiental.md) |
| **Caja Mayor** (movimientos, anulaciones, configuración, **pago consolidado de obligaciones**) | [domains/financiero-caja-mayor.md](domains/financiero-caja-mayor.md) |
| **Bancos, cheques, POS** (cuentas bancarias, acreditaciones) | [domains/financiero-bancos-pos.md](domains/financiero-bancos-pos.md) |
| **CPP / CPC** (dirección de flujo, préstamos a funcionarios, **cobro consolidado por convenio**) | [domains/financiero-cpp-cpc.md](domains/financiero-cpp-cpc.md) |
| **RRHH** (funcionarios, asistencias, vales, vacaciones) | [domains/rrhh.md](domains/rrhh.md) |
| **RRHH — Fichaje facial** (reconocimiento facial de asistencia, embeddings on-device, match 1:N, liveness, geocerca, kiosco PWA) | [domains/rrhh-asistencia-facial.md](domains/rrhh-asistencia-facial.md) |
| **Liquidaciones, comisiones** (sueldo, aguinaldo, equipos) | [domains/rrhh-liquidaciones.md](domains/rrhh-liquidaciones.md) |
| **Personas, Clientes, Usuarios** | [domains/personas-clientes.md](domains/personas-clientes.md) |
| **Impresoras térmicas** | [domains/cocina-impresion.md](domains/cocina-impresion.md) |
| **Qué imprime el sistema y para qué** (catálogo de los 13 tickets, ruteo por rol de impresora, convenciones de formato) | [domains/tickets-impresos.md](domains/tickets-impresos.md) |
| **Dashboards** (padrón unificado, componentes shared, handlers KPI) | [domains/dashboards.md](domains/dashboards.md) |
| **Reportes de cierre de mes** (hub Ventas + Finanzas, período comparativo, presentación/PDF/WhatsApp, series por rango local) | [domains/reportes.md](domains/reportes.md) |
| Reglas de código (UPPERCASE, no func en templates, colores) | [conventions/coding-rules.md](conventions/coding-rules.md) |
| Patrones UI (mat-menu acciones, tab/dialog híbrido, full-height) | [conventions/ui-patterns.md](conventions/ui-patterns.md) |
| Bugs comunes y workarounds (TypeORM null, fechas UTC, mat-chip) | [conventions/pitfalls-typeorm-electron.md](conventions/pitfalls-typeorm-electron.md) |
| Cómo debuggear un bug en X dominio | [workflows/debug-checklist.md](workflows/debug-checklist.md) |
| Verificar BD SQLite manualmente | [workflows/verificacion-bd-sqlite.md](workflows/verificacion-bd-sqlite.md) |
| **Cómo proceder ante un feature/bug: DoD + registro** (checklist de terminado, dónde registrar, política de issues) | [workflows/definition-of-done.md](workflows/definition-of-done.md) |
| TODOs pendientes del proyecto | [workflows/todos-pendientes.md](workflows/todos-pendientes.md) |
| Árbol completo del sidenav | [reference/menu-sidenav-tree.md](reference/menu-sidenav-tree.md) |
| Lista de handlers IPC con responsabilidades | [reference/handlers-index.md](reference/handlers-index.md) |
| Índice de las 157 entidades por dominio | [reference/entities-index.md](reference/entities-index.md) |
| Catálogo de enums clave | [reference/enums-index.md](reference/enums-index.md) |
| Bugs conocidos sin resolver | [reference/known-bugs.md](reference/known-bugs.md) |

**Manual de usuario** (capítulos 0–19) en [`manual-usuario/`](manual-usuario/) — para usuarios finales, no desarrolladores. **Manual de la app mobile (PWA)** aparte en [`manual-usuario/mobile/`](manual-usuario/mobile/README.md) — cubre el cliente web mobile/tablet (alcance administrativo CRUD).

---

## 3. Reglas duras del proyecto (no negociables)

Estas las debo respetar SIEMPRE, sin que el usuario las repita:

1. **El agente levanta y monitorea los servidores** (`npm start`, reinicios). Regla actualizada 2026-08-11: antes la corría el usuario, ahora no hace falta. Al relanzar, matar primero lo anterior — el Electron viejo **retiene el puerto 7070 del server Fastify** aunque se cierre la ventana (`lsof -ti:7070`). Para verificar sólo compilación sigue sirviendo `npm run build`.
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
21. **Toda feature o fix sigue el ciclo de implementación obligatorio, sin que haga falta pedirlo.** Iniciar desde `develop` remoto → skill → análisis → plan (con tests) → aprobación → implementación por fases con **commit+push al cerrar cada fase** → **revisión por agentes auditores** (Agent tool, siempre `model: "sonnet"`) → **batería completa de tests** → **`npm run check` (AOT)** → manual de pruebas + docs + skill + backlog → commit/push → **PR a `develop` directamente** → **esperar el CI en verde antes de dar por terminado**. Todo el trabajo va a **un solo PR** salvo pedido en contra. Es el flujo por defecto: el usuario no lo va a volver a explicar. Detalle completo → [workflows/ciclo-implementacion.md](workflows/ciclo-implementacion.md).
22. **Todo handler que MUTA datos lleva `ensurePermission`** — como PRIMERA sentencia del `try`: `await ensurePermission(dataSource, getCurrentUser, 'CODIGO');` (de `../utils/auth.utils`). Aplica a create/update/delete/anular/aprobar/confirmar/generar/pagar/registrar/asignar, etc. **`/api/rpc` es default-allow**: cualquier cliente con un JWT válido puede invocar el handler; el guard por-handler es la ÚNICA frontera real (el frontend con `*appHasPermission` no cuenta). Los `get-*`/`list-*` de sólo lectura no lo necesitan. Si el código de permiso no existe, agregarlo a `SEED_PERMISOS` en `permissions.handler.ts`. La auditoría 2026-07 encontró ~35 handlers sensibles sin este guard — no repetir. Ver [reference/known-bugs.md](reference/known-bugs.md) (gotchas) y [workflows/add-new-entity.md](workflows/add-new-entity.md).
23. **Toda pantalla navegable nueva debe estar en el árbol de menú único.** El sidenav Y el buscador global se renderizan desde la **fuente única** `MENU_TREE` (`src/app/services/menu-tree.ts`). Un `MenuNode` es rama (`children`, hasta 3 niveles) u hoja (`action`). Cada hoja declara `enSidenav` / `enBuscador` (ambos default true) para elegir dónde aparece — ej. acciones *Crear …* van con `enSidenav: false` (solo buscador). Hoja: `{ id, label, icon, keywords, permiso, esConfig, action: { component, title, tabId, data } }`; para diálogos-destino `action.mode: 'dialog'` + `dialogConfig`. NO incluir diálogos contextuales (edit/create/confirm/selector/detalle/...). El ADMIN puede sobreescribir visibilidad (sidenav/buscador) y orden por id desde *Configuración → Configuración del menú* (`SISTEMA_MENU_CONFIGURAR`, entidad `MenuConfig`); los overrides se aplican sobre el árbol sin tocar código. Si no se agrega la hoja, la pantalla funciona pero NO aparece ni en sidenav ni en buscador. Detalles → [domains/menu-sidenav.md](domains/menu-sidenav.md).
24. **Ningún cambio está terminado sin su documentación.** Todo feature/bug sigue la **Definición de Terminado** → [workflows/definition-of-done.md](workflows/definition-of-done.md): leer el código real antes, `ensurePermission` + migración cuando aplique, `npm run check` antes de pushear, **actualizar los docs de dominio afectados** (doc nuevo + fila en §2 si es subsistema nuevo), **actualizar la skill si el cambio invalida algo que ella afirma o cambia una convención**, y **mover el ítem en el backlog** (`todos-pendientes.md` para features, `reference/known-bugs.md` para bugs — esos son la fuente de verdad, no GitHub). GitHub issues **solo** para reportes externos, backlog que no se hace ahora, o algo que necesita discusión/varios PRs; el conventional commit + PR a `develop` es el registro de lo hecho. Código sin su doc actualizada = incompleto.

---

## 4. Estado actual del repo (snapshot 2026-05-15, ampliado y reauditado 2026-07-26)

> Esta sección puede quedar desactualizada. Si el usuario pregunta por estado actual, **revisar `git log` y memorias antes de responder**.
> Canal alpha en `develop` va por **`v1.21.0-alpha.98`** (2026-07). El "primer stable v1.1.0" del snapshot viejo es historia lejana.

### Sesión 2026-08-27 — Cobro consolidado de CPC (multi-cuota + descuento)

El motor de **pago consolidado** de Caja Mayor gana un **quinto concepto**,
`COBRO_CLIENTE`, y con él su primer evento de sentido **INGRESO**: cobrar N cuotas
de `CuentaPorCobrar` de un mismo cliente en un solo evento, multi-moneda ×
multi-forma × caja/banco, con una línea opcional de `fuente: DESCUENTO` que condona
deuda sin mover plata. La tarjeta *Ingreso → Cobrar a Cliente* abre el **mismo
wizard** que los pagos; `cobrar-cpc-rapido-dialog` fue eliminado (quedó sin
referencias). Permiso nuevo **`CPC_DESCUENTO`** (no está en ningún rol plantilla) +
motivo obligatorio + tope % por caja. Detalles → [domains/financiero-caja-mayor.md](domains/financiero-caja-mayor.md),
[domains/financiero-cpp-cpc.md](domains/financiero-cpp-cpc.md).

Tres cosas que conviene no volver a aprender por las malas:

- **La dirección se deriva, no se declara.** El asiento de caja ya salía bien porque
  usa `esIngreso(tipoMovimiento)`; lo que estaba a fuego en egreso era el **tramo
  bancario**. `CONCEPTO_ES_INGRESO` (para el renderer, que no puede importar
  `electron/`) es un **espejo** de `esIngreso()` y `test:pago-consolidado` verifica
  que no se separen.
- **Un control que vive dentro de un `if (campoDelCliente)` no es un control.** El
  tope de descuento se evadía omitiendo `cajaMayorContextoId`. Ahora el contexto es
  obligatorio y el tope aplicado es el **más restrictivo** entre el del contexto y el
  de cada caja por la que entra plata. `/api/rpc` es default-allow: todo lo que el
  backend no exige, no existe.
- **Una cuota CPC puede estar reservada por RRHH.** Al *generar el borrador* de una
  liquidación, las cuotas del funcionario-cliente quedan con `liquidacionId` y el
  monto congelado; cobrarlas por caja mientras tanto las cobraba dos veces. El
  adaptador las bloquea mientras la liquidación esté en BORRADOR o APROBADA.

Tests: `npm run test:cobro-cpc-consolidado` (63), `test:pago-consolidado` (90),
`test:pagar-obligaciones-dialog` (19). Manual: `docs/testing/TESTING-CHECKLIST-COBRO-CONSOLIDADO-CPC.md`.

### Reauditoría integral 2026-07-26 (subsistemas nuevos)

Auditoría de ~240 commits desde 2026-06-28. Subsistemas **nuevos completos** que ahora tienen doc propio:

- **Facturación legal (SET/SIFEN)** — timbrado + numeración atómica, emisión desde el cobro del PdV, plantillas pdfmake (A4 forzado, total en letras), toggle Resumido. ⚠️ Sin permisos dedicados todavía. → [domains/facturacion.md](domains/facturacion.md).
- **Pedidos Online / Storefront** — 3er proyecto Angular (`projects/storefront`, base-href `/tienda/`), superficie pública aislada `/pub/*` con whitelist, **JWT de cliente separado del staff** (keytar `customer-jwt-secret`), auth por OTP WhatsApp Cloud / email / Google, bandeja de aceptación en el PdV (polling 15s), pizza sabor×tamaño + mitad y mitad. Solo en **modo server**. → [domains/pedidos-online.md](domains/pedidos-online.md).
- **KDS (Kitchen Display Screen)** — componente compartido desktop (tab) / PWA `/kds` (TV), **SSE** en web (`kds-sse-routes.ts`) + poll de respaldo, modo TV anti-overscan, bump bar/numpad, detalle por ítem (removidos/cambios/adicionales/observaciones), ABM de pantallas con semáforo. → [domains/cocina-impresion.md](domains/cocina-impresion.md).
- **RRHH — Fichaje facial** — `@vladmandic/human`, embeddings on-device, match 1:N en backend (coseno+umbral+margen), liveness server-authoritative, geocerca Haversine, kiosco PWA con auto-captura y cola offline, descarga de modelos in-app. → [domains/rrhh-asistencia-facial.md](domains/rrhh-asistencia-facial.md).
- **Cobro parcial por ítems (PdV)** — entidades `CobroParcial`/`CobroParcialItem` + cache `VentaItem.montoCubierto`, imputación en bruto con `factorAplicado`, tab Items en el diálogo de cobro, chips PAGADO/PARCIAL, ítems cubiertos bloqueados. → [domains/ventas-pdv.md](domains/ventas-pdv.md).
- **Web `/admin`** — el **frontend desktop completo servido como web** (bundle `dist/frc-gourmet-web`, `--base-href /admin/`), shim HTTP `window.api`→`/api/rpc`, auth de staff. Distinto de la PWA mobile (`/`) y del storefront (`/tienda`). → [architecture/cliente-servidor.md](architecture/cliente-servidor.md), [architecture/mobile-pwa.md](architecture/mobile-pwa.md).
- **WhatsApp (dos mecanismos):** **Evolution API** (self-hosted, apikey en keytar) para notificaciones RRHH + **resumen de cierre de caja como imagen** + **envío de backups de BD como documento** (`sendWhatsappDocumentFile`, mediatype `document`); **WhatsApp Cloud (Meta)** solo para el OTP de pedidos online.
- **Reportes de cierre de mes (2026-07)** — hub **Reportes** (grupo de menú propio, entre Financiero y RRHH) con 2 pantallas analíticas interactivas: **Ventas** (tendencia, día de semana, horas pico/heatmap, mix de pago, top productos, ingeniería de menú, combinaciones) y **Finanzas** (flujo de caja, composición ing/egr, gastos por categoría, aging CPC/CPP, comisiones POS, vencimientos). Control de período con comparativo vs período anterior; **modo presentación** (pantalla completa), **export PDF** (pdfmake) y **envío por WhatsApp** (imagen del gráfico, Evolution API). Series por **rango local** (no `GROUP BY` por fecha UTC) para reconciliar con los KPIs. Permisos `VENTAS_REPORTES_VER` / `FINANCIERO_REPORTES_VER`. **También en la PWA mobile** (`projects/mobile/.../pages/reportes/`, mismas 2 pantallas mobile-first vía `/api/rpc`, sin backend nuevo). → [domains/reportes.md](domains/reportes.md).
- **Utilitarios del cajón PdV** — tarjetas Gastos (`GastoCaja`), Vale/Compra/Egresos (`EgresoCaja` + `pdv-egresos.handler.ts`, permisos `PDV_PAGAR_VALE`/`PDV_PAGAR_COMPRA`/`PDV_ANULAR_EGRESO`), Últimas Ventas con acciones (reimprimir/cancelar/pagaré). **Compra simplificada sin ítems** (`Compra.simplificada`).
- **Cajas** — caja **compartida multi-dispositivo**; el cobro desde una terminal ajena es **configurable** desde 2026-08 (`PdvConfig.permitirPagosTerminalAjena` / `permitirFinalizarTerminalAjena`, ambos default `false` = conducta previa), **auto-retiro del cierre** (`generarRetiroDelCierre`), **ajustar caja cerrada** (`FINANCIERO_CAJA_AJUSTAR`), guard anti-ventas-huérfanas, conteo simplificado (`ConteoDetalle.monto`).
- **Login por QR (desktop + PWA)** — Device Authorization Grant (`DeviceAuthCode`, rutas `/api/auth/device/*`), aprobado escaneando desde un dispositivo ya logueado.
- **Variaciones en el PdV/PWA (2026-08-18):** las listas muestran el **rango de precios** de un `ELABORADO_CON_VARIACION` (antes `0`: los handlers cotizaban por `pv.receta_id`); el sabor único se **autoselecciona**; y el **máximo de sabores combinables y la estrategia de precio se configuran por producto** (`Producto.maxVariacionesSimultaneas` / `estrategiaPrecioVariacion`, `null` = global de `PdvConfig`) — la regla ya no es única para todo el local, y la carta online la respeta al validar el pedido. → [domains/recetas-sabores-variaciones.md](domains/recetas-sabores-variaciones.md).
- **Refactor de sabores (2026-07-11):** **cada variación crea su propia `Receta`** (ya NO se comparte una receta base por sabor — corrige el bug de editar "grande" y cambiar "mediano"). Módulo **Gestión de Sabores** (`get-all-sabores`, `variaciones-sabor-dialog`), precio por `receta_presentacion_id`, handler de mantenimiento `reparar-recetas-compartidas`. → [domains/recetas-sabores-variaciones.md](domains/recetas-sabores-variaciones.md).
- **Batch de seguridad/correctness 2026-07-15 (`docs/HALLAZGOS-AUDITORIA-DESKTOP.md`):** ~20 bugs C/M/A cerrados (doble conteo ledger bancario, stock por sabor en pizza multi-sabor, permisos precio/stock, revertir CPC al cancelar venta a crédito, costo receta / rendimiento, idempotencia anulaciones, TOCTOU stock, hash de password no expuesto al renderer, must-change-password en backend, +23 handlers RRHH con permiso). `BLOCKED_CHANNELS` de `/api/rpc` ampliado de 3 a ~30. → [reference/known-bugs.md](reference/known-bugs.md).
- **Backup/Restore driver-aware + WhatsApp (2026-08):** el módulo *Configuración → Backup* ya NO es solo SQLite. Si `database.type === 'postgres'`, todo opera con `pg_dump`/`pg_restore` (motor `electron/utils/pg-backup.utils.ts`): formato **custom (`.dump`)** o **plano (`.sql`)** elegible, autodetección de binarios (+`pgBinDir` override), safety dump con abort/rollback, reset = drop schema. El contenedor `.frcbak` es genérico (manifest con `dbType`/`dbFileName`, retrocompatible). Nuevo handler **`backup-send-whatsapp`** (perm `SISTEMA_BACKUP`) envía cualquier backup como **documento** vía Evolution API a un `whatsappDestino` configurable. Config nueva en `app-settings.backup`: `pgFormat`/`pgBinDir`/`whatsappDestino`. Test `npm run test:pg-backup` (levanta Postgres temporal). → [docs/BACKUP-POSTGRES-WHATSAPP.md](../../../docs/BACKUP-POSTGRES-WHATSAPP.md).

### Sesión 2026-08-24 (Jornada comercial + filtros del resumen)

- **Jornada comercial configurable** — un día deja de ser el día calendario:
  `PdvConfig.inicioJornadaHora` (default **7**, editable en *Configuración del
  PdV*) define la ventana `07:00 → 06:59 del día siguiente`. Existe porque las
  cajas del turno noche cruzan las 00:00 y siguen hasta las 2 AM: con el corte a
  medianoche ese turno aparecía **partido en dos días** y el total de "hoy" se
  reiniciaba a mitad del turno. `anclaJornada()` es la única fuente del corte, y
  **los reportes comparten el mismo ancla** (`resolverPeriodo` tenía aritmética
  propia y habría hecho que la misma venta cayera en días distintos según la
  pantalla). `inicioJornada = 0` reproduce exactamente el comportamiento previo.
  → [domains/dashboards.md](domains/dashboards.md) §7.6.
- **Filtros del resumen de ventas (PWA)** — `get-dashboard-ventas-kpis` acepta
  `{rango, desde, hasta, cajaIds}` además del string suelto; fechas y cajas se
  combinan con **AND**. El default histórico se preserva por **ausencia** de
  filtro, no por la forma del argumento. Nuevo canal liviano `get-cajas-selector`
  para el desplegable. → [domains/dashboards.md](domains/dashboards.md) §7.7,
  [architecture/mobile-pwa.md](architecture/mobile-pwa.md).
- **fix: el filtro por fecha devolvía CERO en SQLite** — TypeORM guarda
  `created_at` como `YYYY-MM-DD HH:MM:SS` (sin `T` ni `Z`) y los handlers
  comparaban contra `toISOString()`; como texto, el espacio ordena antes que la
  `T`, así que una fila creada hoy quedaba fuera del rango "hoy". No fallaba:
  devolvía cero. Sólo afectaba al modo standalone. `dbQuery` normaliza ahora el
  **límite** (no la columna, para no perder el índice). **Los tests no lo agarraban
  porque sellaban `created_at` en el mismo formato ficticio que usaban los
  límites** — coincidían entre sí. → [reference/known-bugs.md](reference/known-bugs.md).
- **fix: los rangos `custom` de los reportes corrían un día** — `new Date('2026-07-15')`
  es UTC-medianoche, que en Paraguay cae el 14 a la noche.
- Tests: `npm run test:kpis-filtros` (nuevo), `test:reportes-periodo`,
  `test:dashboard-rangos`. Manual:
  [docs/testing/TESTING-CHECKLIST-JORNADA-Y-FILTROS.md](../../../docs/testing/TESTING-CHECKLIST-JORNADA-Y-FILTROS.md).

### Sesión 2026-08-27 (sesión persistente del modo cliente)

- **Sesión zombi arreglada.** En `mode=client` los tokens vivían sólo en memoria del preload y morían con el proceso, mientras el estado de sesión de la UI sobrevivía en `localStorage`: al reabrir, la app se veía logueada y ningún dato cargaba. Ahora el **refresh token se persiste** (`electron/utils/client-refresh-token.utils.ts`, keytar + fallback `0600`, mismo patrón que `jwt-secret.utils.ts`) y el preload **rehidrata antes del primer RPC**. ⚠️ La rehidratación pasa siempre por `refreshAccessIfPossible()` porque reenvía el `deviceId`: por otro camino el JWT vuelve con `device_id: null` y los tickets salen por la impresora equivocada. → [architecture/cliente-servidor.md](architecture/cliente-servidor.md).
- **`useHash: true` en el router.** Bajo `file://`, `pushState` ignora el `<base href>` y dejaba `location` en `file:///login` en silencio; el siguiente *Recargar la aplicación* moría con `ERR_FILE_NOT_FOUND`. Se llegaba ahí en cada arranque en frío y en cada logout, **en los tres modos**. Verificado empíricamente sobre Electron 24.3.0.
- Test `npm run test:sesion-cliente`; manual en `docs/testing/TESTING-CHECKLIST-SESION-CLIENTE.md`.

### Sesión 2026-08 (caja compartida configurable + pagos en tickets de delivery)

- **Cobro en terminales ajenas, configurable.** El cobro estaba reservado sin excepción a la terminal que abrió la caja; ahora lo deciden dos flags separados de `PdvConfig` (`permitirPagosTerminalAjena` / `permitirFinalizarTerminalAjena`, ambos default `false`). El gate vive en `electron/utils/terminal-caja.utils.ts` y se aplica en los **cinco** caminos que existen, no sólo en `createPago`: `createPagoDetalle` (que resuelve la caja server-side porque `getVenta` no carga `pago.caja`), `updateVenta ABIERTA→CONCLUIDA`, `cerrarVentasAbiertasMesa` y `cobrar-venta-credito`. Cerró tres huecos preexistentes: `openAjusteDialog` creaba el `Pago` sin el flag (bypass total, también vía F9), `cobroRapido` (F2) no tenía gate, y los rechazos del backend se tragaban en `console.error`. Migración `PdvConfigTerminalAjena`. Test `npm run test:terminal-caja`. → [domains/ventas-pdv.md](domains/ventas-pdv.md).
- **`PagoDetalle` persiste el destino de acreditación** (`maquina_pos_id` / `cuenta_bancaria_id`, migración `PagoDetalleDestinoAcreditacion`). El vínculo vivía sólo en memoria del diálogo de cobro: al reabrirlo se perdía y la `AcreditacionPos` / la transferencia no se creaban nunca, en silencio. Bug preexistente que el cobro repartido entre terminales convertía en el camino normal.
- **Pagos ya registrados en los tickets de delivery.** Ticket de reparto, comprobante y pre-cuenta de un delivery imprimen el desglose de lo cobrado con el mismo layout que el resumen de cierre de caja (`ticketRubroMultimoneda`, **extraído** de `printCierreCajaInternal`, no reimplementado). Con saldo pendiente el número grande pasa a ser el **SALDO**, no el total. Se partió `buildDeliveryTicketLines` (builder puro) de `printDeliveryTicketInternal` para poder testearlo. Corrige de paso que el ticket de delivery ignorara los ajustes de nivel pago, así que imprimía un total distinto al del comprobante de la misma venta. Test `npm run test:ticket-delivery-pagos`. → [domains/ventas-pdv.md](domains/ventas-pdv.md).
- **Integridad de las líneas de cobro (2026-08-27).** Segunda ronda sobre el mismo subsistema, tras dos auditorías independientes. `registrarCobroParcial` tagueaba `PagoDetalle` filtrando sólo por id: encadenado con `anularCobroParcial` (sin llamador en la UI) permitía desactivar plata de **otra caja, incluso cerrada**. `updatePago`/`updateVenta`/`update-caja` aceptaban en el merge `caja`/`dispositivo`, y `Pago.caja` es lo **único** que lee el gate — o sea el gate era auto-derrotable. `updatePagoDetalle`/`deletePagoDetalle`/`deletePago` ahora pasan por un gate **derivado server-side** (discriminador positivo: el `Pago` cuelga de una `Venta`). Tests `test:integridad-cobro`, `test:resumen-caja-numeros`.
- **Plata que se perdía en silencio (2026-08-27).** El cobro **a crédito** nunca creaba las acreditaciones (estaban embebidas en `finalizar()`): en un cobro mixto, lo cobrado con tarjeta no entraba al ledger bancario. Un solo `try` envolvía el bucle, así que un fallo cortaba las siguientes. Se acreditaba el monto **sin su moneda** (40 USD → 40 Gs). F4–F7 no reseteaban la máquina POS. Re-finalizar una venta ya CONCLUIDA **duplicaba** la acreditación.
- **Aritmética (2026-08-27).** `computeResumenCaja` concatenaba strings en Postgres (`decimal` llega como string, no hay `setTypeParser(1700)`) → esperado `NaN` en el arqueo. `cobroRapido` (F2) igual, y encima regalaba el envío. El ticket ya no afirma un saldo sin cotización vigente, y un sobrepago imprime `VUELTO A ENTREGAR` en vez de esconderlo.
- Manual de pruebas: `docs/testing/TESTING-CHECKLIST-CAJA-COMPARTIDA.md`.

### Sesión 2026-08-29 — conversión DELIVERY ⇄ RETIRO

Un pedido para retirar y un reparto ya eran el mismo registro con distinto
`modo`, pero el modo se fijaba al alta. Ahora se convierte con
**`delivery-convertir-modo`**, botón propio en el footer de la lista y diálogo
que muestra qué se pierde y cómo queda el total antes de confirmar.

Lo que hay que saber antes de tocar el módulo: hacer `modo` mutable rompió
invariantes que se sostenían solos mientras era inmutable — tres handlers
vecinos leían el `Delivery` fuera de su transacción y revertían la conversión en
silencio, `updateVenta` dejaba reescribir `costoDelivery` de una venta
CONCLUIDA, `delivery-cancelar` pedía su permiso extra contra una lectura previa
al lock (TOCTOU), y el diálogo de cobro congelaba el envío al abrir. Todo eso
está cerrado y explicado en [domains/ventas-pdv.md](domains/ventas-pdv.md).

⚠️ **La carrera no se puede probar en SQLite** — el `Promise.all` pasaba igual
con el bug reintroducido. Vive en `npm run test:locks-pg`. Tests:
`test:delivery-conversion` (67) + `test:delivery` (53).

### Sesión 2026-07 (Funcionario/Vales + Impresoras + Multimoneda)

- **Funcionario ↔ Cliente en liquidaciones MERGED (PR #196):** una persona puede ser funcionario y cliente a la vez (mismo `persona_id`). (1) La **liquidación de sueldo descuenta el consumo a crédito (CPC)** del cliente vinculado: concepto `CREDITO_CONSUMO`, cuotas CPC del período neteadas como las cuotas de préstamo (cobro atómico al pagar, sin movimiento aparte de Caja Mayor; migración `liquidacion_id` en `cuentas_por_cobrar_cuotas`). (2) La **liquidación final netea deudas** (vales → préstamos → crédito, neto topado en 0, residual queda a cobrar; migración `tipo`/`referencia_*` en `liquidacion_final_items` + `total_haberes/descuentos/neto` en `liquidaciones_final`). (3) Handler **`get-funcionario-resumen-financiero`**. (4) **`funcionario-detalle` → dashboard padrón** con resumen financiero. (5) **Chips cruzados** funcionario↔cliente (handler `get-funcionario-de-cliente`) + página **funcionario-detalle read-only en mobile**. Test: `npm run test:funcionario-vales`. Detalles → [domains/rrhh-liquidaciones.md](domains/rrhh-liquidaciones.md), [domains/rrhh.md](domains/rrhh.md). ⚠️ La **liquidación final no tiene UI** todavía (TODO) y el **neteo multimoneda DENTRO del cálculo de liquidación sigue pendiente** (ver Multimoneda abajo).
- **Impresoras: impresora del sistema + descubrimiento de red MERGED (PR #197):** nuevo `connectionType = 'system'` que imprime **RAW por el spooler del SO usando el nombre de la impresora instalada** (`interface: 'printer:<n>'` de node-thermal-printer + driver nativo **`@thiagoelg/node-printer`** en `optionalDependencies`, `electron/utils/system-printer.utils.ts`, require lazy). Elimina la config LPD/share/ANONYMOUS LOGON para una USB local en Windows. Handlers **`list-system-printers`** (Electron `getPrintersAsync`), **`scan-network-printers`** (mDNS `bonjour-service` + barrido TCP del /24, `electron/utils/network-printer-scan.utils.ts`), **`test-printer-connection`**. UI en `printer-settings` con dropdown de impresoras del SO, "Buscar en red" y "Probar conexión". Detalles → [domains/cocina-impresion.md](domains/cocina-impresion.md).
- **Multimoneda RRHH (capa de resumen) MERGED (PR #198):** nuevo helper backend **`electron/utils/moneda.utils.ts`** (`convertirAPrincipal` / `getCotizacionCompraLocal` / `getMonedaPrincipal`) — antes no existía uno reutilizable. `get-funcionario-resumen-financiero` y `dashboard-rrhh.totalNominaMes` **convierten a PYG** con la cotización (`MonedaCambio.compraLocal`); la UI muestra la moneda real por línea y avisa `sinCotizacion`. Test: `npm run test:resumen-multimoneda`. ⚠️ **Bug de raíz pendiente:** `LiquidacionItem`/`LiquidacionFinalItem` **no tienen columna moneda** → el cálculo de liquidación (sueldo/final) todavía netea/suma monedas distintas como iguales. Requiere migración + decisión de política (convertir vs bloquear). Ver [reference/known-bugs.md](reference/known-bugs.md).
- **Validación de Operaciones Financieras (2026-08):** en la PWA el **cambio de divisa no se podía guardar nunca** — `formaPagoDestinoId` es requerido pero la pantalla lo seteaba sólo si había select de *caja destino*, y en un cambio de divisa el ingreso vuelve a la MISMA caja (no hay tal select). La fuente única `operacion-financiera-validacion.util.ts` ahora distingue **`LADOS_CAJA_MAYOR`** (qué lado mueve caja ⇒ forma de pago efectivo fija) de **`CAJAS_EN_UI`** (qué select se muestra), suma `CUENTAS_EN_UI`/`COTIZACION_EN_UI` y el invariante **`fuenteDelCampo()`**: todo campo requerido tiene que tener una fuente que lo pueble (UI, cuenta bancaria o efectivo). También se arregló que al cambiar de tipo se perdía la moneda heredada de una cuenta bancaria que sobrevivía al cambio (reelegir la misma opción en un `mat-select` **no emite `valueChanges`**), que el escritorio arrastraba valores del tipo anterior, y que el bloque *Diferencia* se mostraba en transferencia bancaria donde el backend lo descarta. `formaPagoEfectivo` se mudó a `src/app/shared/utils/`. Tests: `npm run test:operacion-financiera` (122 asserts, antes 20 y pasaba con el bug), `npm run test:mobile`. → [domains/financiero-caja-mayor.md](domains/financiero-caja-mayor.md).
- **Delivery del PdV auditado y cerrado (2026-08-24):** el módulo estaba implementado pero **nunca se usó en producción**; la auditoría completa (`docs/DIAGNOSTICO-DELIVERY.md`) encontró 26 problemas, cuatro bloqueantes. El peor: **el costo del envío no se cobraba nunca** — el diálogo de cobro sumaba sólo `ítems − descuento` y la zona de entrega era decorativa. Ahora hay `ventas.costo_delivery` (monto **congelado**, no derivado de la FK) que entra en el cobro, en `getEstadoCobroVenta` y en el comprobante. Nuevo **`delivery.handler.ts`** con la **máquina de estados en backend** (`updateDelivery` rechaza `estado` y timestamps; `/api/rpc` es default-allow, así que el guard del handler era la única frontera) y **`delivery-cancelar` transaccional** vía el util reusable `electron/utils/venta-reversa.utils.ts` (ítems + `PagoDetalle` + `CobroParcial` + CPC + stock), con permiso propio `VENTAS_DELIVERY_CANCELAR_COBRADO` si la venta ya estaba cobrada. **Cancelar es terminal**: reabrir estaba roto de raíz (el stock revertido no se reactiva nunca). El **repartidor pasó a ser `Funcionario`** (el botón ENVIAR tenía un `// TODO` y nunca asignaba a nadie) y el **ticket de reparto se imprime de verdad** (el handler que existía era código muerto). `ConfirmationDialogComponent` **implementa `showInput`** (devuelve el string): sin eso, todos los deliveries cancelados quedaban con motivo `'SIN MOTIVO'`. 11 opciones nuevas en la config del PdV. Test: `npm run test:delivery` (46 asserts). → [domains/ventas-pdv.md](domains/ventas-pdv.md) sección Delivery.
- **Fix operaciones financieras (PR #199, abierto):** en el diálogo Nueva Operación Financiera, el botón "Registrar" quedaba deshabilitado en **Retiro** y **Depósito** bancario porque la moneda requerida del lado sin UI (se hereda de la cuenta bancaria) quedaba `null`. Fix: al elegir la cuenta se setean **ambas** monedas (origen y destino). Campos requeridos extraídos a `operacion-financiera-validacion.util.ts` (fuente única para validador + test). Test: `npm run test:operacion-financiera`.

### Snapshot previo (2026-05-15)

- **Branches de larga duración:** `develop` (working) y **`master`** (releases). `origin/main` está obsoleta (`gone`). El skill viejo decía "main (releases)" — ignorar, es `master`.
- **Primer release stable publicado: `v1.1.0` (2026-05-15)**. Sucesión rápida hasta `v1.5.0` el mismo día. **Auto-update totalmente funcional** desde v1.4.0; segundo update consecutivo (v1.4.0 → v1.5.0) sin intervención manual confirma la estabilidad del flujo. Si en el futuro un update falla, es bug a investigar — no comportamiento esperado. Bugs históricos ya cerrados: `pg` faltante en bundle (fix v1.1.1) y `verifyUpdateCodeSignature` que en electron-updater 6.x es función no boolean (fix v1.3.0). Ver [conventions/pitfalls-typeorm-electron.md](conventions/pitfalls-typeorm-electron.md) y [workflows/release-y-deploy.md](workflows/release-y-deploy.md) sección "Historial de validación".
- **Registrar Vale como egreso directo desde Caja Mayor (v1.5.0):** card "Registrar Vale" en `registrar-egreso-dialog` → `create-edit-vale-dialog` en modo `confirmar` (caja preseleccionada, caja+formaPago obligatorios) → handler atómico `crear-vale-confirmado` (`vales.handler.ts:119+`) crea Vale CONFIRMADO + CajaMayorMovimiento EGRESO_VALE + actualiza saldo en una transacción. Requiere `RRHH_VALE_CREAR` + `RRHH_VALE_CONFIRMAR`. Detalles → [domains/rrhh.md](domains/rrhh.md) sección "Crear vale ya confirmado desde Caja Mayor".
- **Toolbar con titlebar frameless + datos enriquecidos (v1.3.0 + v1.4.0, revisado 2026-08-27):** ventana frameless en las tres plataformas, pero **los botones de ventana los dibuja el SO**: `titleBarStyle:'hidden'` + `titleBarOverlay` en Windows, `'hiddenInset'` (semáforos) en macOS; sólo en **Linux** el header pinta los suyos (`controlsMode: 'custom'`). El renderer lo consulta por `window:chrome`. Como no hay menú nativo, zoom / recargar / DevTools / pantalla completa viven en el menú **Herramientas de ventana** del header + atajos (`Ctrl +/-/0`, `F5`, `F12`, `F11`) manejados en `main.ts`; el zoom se persiste en `app-settings.ui.zoomFactor`. Detalles → [architecture/electron-bootstrap.md](architecture/electron-bootstrap.md). Header muestra subtitle "FRC Gourmet v{appVersion}", chip de modo (Servidor/Cliente), cotizaciones USD/BRL del scrapper de nortecambios (refresh 5min) y reloj en vivo (1s, fuera de NgZone). **Toda la toolbar es draggable** (`-webkit-app-region: drag`); botones/inputs/links marcados `no-drag`. Si tocás la toolbar, respetá esto.
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
- **Lo que distingue dev de producción es la MÁQUINA, no el nombre del archivo.** En el iMac de Gabriel, `userData/frc-gourmet.db` es una **BD de desarrollo**: se puede escribir, pagar, anular y romper sin miedo. La instalación productiva corre en **otra PC** y muy probablemente tenga ese mismo nombre de archivo, así que el nombre no sirve para distinguirlas. A producción sólo se llega vía PR a alpha (y luego master).

---

*Este es el índice. Para cada tarea concreta, cargá el documento específico que aplique.*
