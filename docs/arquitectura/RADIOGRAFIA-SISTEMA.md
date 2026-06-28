# Radiografía Completa del Sistema FRC Gourmet

> Actualizado: 2026-06-28 (rama `docs/actualizacion-integral`). Verificado contra el código de `develop`.

## 1. Visión General

FRC Gourmet es un software de gestión gastronómica construido con **Angular 15.2 + Electron 24 + TypeORM 0.3 + Fastify 4.10**. Cubre productos, recetas, punto de venta (PdV), inventario, compras, finanzas, una suite completa de RRHH/comisiones, importación de facturas con IA y un cliente web mobile (PWA).

**Navegación**: Sistema de pestañas dinámicas (no routing tradicional en el desktop). Cada sección se abre como tab vía `TabsService`. La PWA mobile (`projects/mobile`) sí usa Angular Router.

**Base de datos**: **driver dual** SQLite (default, monomáquina) o **PostgreSQL** (`pg`), configurable. El esquema se gestiona **exclusivamente por migraciones** (`synchronize: false`); las migraciones corren automáticamente al arranque y son driver-aware (ramifican según `queryRunner.connection.options.type === 'postgres'`). NO hay auto-DDL.

### 1.1 Modos de operación

El modo se guarda en `userData/app-settings.json` (`mode`) y se elige desde **Sistema → Modo de operación** (handler `app-mode.handler.ts`, modos válidos: `standalone | server | client`).

| Modo | Qué hace |
|------|----------|
| **standalone** (default) | DB local (SQLite o Postgres), todo vía IPC de Electron. Comportamiento clásico, sin red. |
| **server** | Igual que standalone + arranca un servidor **Fastify** en LAN (puerto default 7070, listener HTTPS opcional en 7443) que expone los mismos handlers vía HTTP y **sirve la PWA mobile**. |
| **client** | No toca DB local: rutea cada llamada al nodo `server` por HTTP. |

**Comunicación Frontend ↔ Backend (IPC)**: context isolation. Los datos fluyen en 4 capas:

```
Entity (.entity.ts) → Handler (electron/handlers/*.handler.ts) → preload.ts (window.api) → RepositoryService (Angular)
```

- **preload.ts** (raíz del repo) expone la API vía `contextBridge.exposeInMainWorld('api', {...})`, incluyendo un canal genérico `callIpc(channel, ...args) → ipcRenderer.invoke(channel, ...args)` además de métodos tipados.
- **RepositoryService** es **abstracto**: `repository-ipc.service.ts` (IPC, usado en standalone/server) y `repository-http.service.ts` (esqueleto). En `mode=client` del desktop, el preload monkey-patchea `ipcRenderer.invoke` para rutear a HTTP; el factory de `app.module.ts` sigue devolviendo `RepositoryIpcService`.
- En la **PWA mobile** (browser, sin preload) se instala un shim `window.api` (Proxy) que mapea método → canal y hace `POST /api/rpc`. Ver `docs/arquitectura/mobile-pwa-plan.md`.

### 1.2 Servidor HTTP (modo server)

Módulo `electron/server/` (Fastify). Rutas principales:

| Ruta | Función |
|------|---------|
| `GET /api/version` | versión de app + schema + driver |
| `GET /api/health` | ping |
| `GET /api/client-config` | URL LAN-directa que la PWA prueba al arrancar |
| `POST /api/auth/login` · `POST /api/auth/refresh` · logout | JWT (access 15 min + refresh 30 d con rotación) |
| `POST /api/rpc` (`rpc-router.ts`) | invoca el handler por su canal desde el `handlerRegistry` global |
| `GET /api/files/...` (`file-routes.ts`) | stream binario de imágenes/adjuntos |
| `/api/kds/...` SSE (`kds-sse-routes.ts`) | stream de eventos para KDS (cocina) |
| `/` (`@fastify/static`) | bundle de la PWA mobile (`dist/mobile`) + SPA fallback |

Seguridad: CORS, rate-limit, `auth-middleware.ts` valida JWT salvo en rutas públicas. `ensurePermission` corre server-side en cada RPC.

---

## 2. Mapa de Entidades (157 archivos `.entity.ts`)

Hay **157 archivos `.entity.ts`** en `src/app/database/entities/`: 155 entidades de dominio + `printer.entity.ts` (raíz) + `base.entity.ts` (la clase abstracta `BaseModel`, no es una tabla). Las 157 referencias `.entity` están registradas en `getEntitiesList()` de `database.config.ts`.

Todas las entidades extienden `BaseModel`: `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.

> El detalle completo de entidades agrupadas por dominio está en **[`entities-list.mdc`](./entities-list.mdc)**.

### Conteo por dominio

| Dominio | Entidades | Contenido principal |
|---------|-----------|---------------------|
| **productos** | 33 | Familia → Subfamilia → Producto → Presentacion → Precio(Venta/Costo); Receta (fases, ingredientes, intercambiables, materiales), Sabor, Combo, Promoción, Adicional, Observación, StockMovimiento, Producción, pizza (tamaño/sabor/ensamblado), ConfiguracionMonetaria, ConversionMoneda |
| **financiero** | 35 | Moneda (billetes/cambio), TipoPrecio, Dispositivo, Caja (conteos), Caja Mayor (movimientos/saldos), Gasto, EntradaVaria, OperacionFinanciera, Cuenta por Cobrar/Pagar (cuotas), Banco (cuenta/movimiento/cheque/chequera), POS (máquina/acreditación), cobro consolidado |
| **rrhh** | 34 | Funcionario, Cargo, Turno, Asistencia, HoraExtra, Vacación, Aguinaldo, Bono, Penalización, Vale, Liquidaciones (sueldo/final/comisión), Comisiones (reglas/equipos/requisitos), Feriado, configuración y notificaciones de RRHH |
| **ventas** | 24 | Venta/VentaItem (+ adicional/ingrediente-modificación/observación/sabor), PdV (grupo/categoría/ítem/config/atajos), Mesa, Sector, Comanda/ComandaItem, Delivery/PrecioDelivery, Reserva, KdsPantalla, SectorImpresora, ProductoSector |
| **compras** | 12 | Proveedor, ProveedorProducto, Compra/CompraDetalle/CompraCuota/CompraCategoria, Pago/PagoDetalle, FormaPago, OCR (alias producto/proveedor, documento importado) |
| **personas** | 9 | Persona, Usuario, Role, Permission, RolePermission, UsuarioRole, Cliente, TipoCliente, Convenio |
| **auth** | 2 | LoginSession, RefreshToken |
| **ia** | 2 | IaPromptConfig, IaPromptSugerencia |
| **personalizacion** | 2 | DashboardShortcut, OnboardingTaskOverride |
| **sistema** | 1 | Empresa |
| **shared** | 1 | Adjunto |
| **raíz** | 1 | Printer (impresoras) |

### 2.1 Arquitectura de variaciones de producto (núcleo de productos)

Un producto `ELABORADO_CON_VARIACION` (típicamente pizza) combina:

```
Producto ("Pizza")
  ├─ Presentaciones: [Grande, Mediana, Chica]
  ├─ Sabores: [Calabresa, Pepperoni, ...]   (cada sabor con su Receta)
  └─ RecetaPresentacion: matriz Presentación × Sabor (auto-generada, con SKU y precio propio)
```

Servicios involucrados: `SaboresVariacionesService` (estado), `SaboresService` (IPC), `RecetasService` (costos).

### 2.2 Enums principales de productos

| Enum | Valores |
|------|---------|
| **ProductoTipo** | RETAIL, RETAIL_INGREDIENTE, ELABORADO_SIN_VARIACION, ELABORADO_CON_VARIACION, COMBO, BUFFET_POR_PESO |
| **StockMovimientoTipo** | COMPRA, VENTA, TRANSFERENCIA, AJUSTE_POSITIVO, AJUSTE_NEGATIVO, DESCARTE, PRODUCCION_ENTRADA, PRODUCCION_SALIDA |
| **TipoPromocion** | DESCUENTO_PORCENTAJE, DESCUENTO_MONTO, PRODUCTO_GRATIS, COMBO_ESPECIAL |

> `BUFFET_POR_PESO` y los precios programados por día/horario están documentados en [`../buffet-por-kilo.md`](../buffet-por-kilo.md).

---

## 3. Handlers IPC (54 archivos)

Hay **54 handlers** en `electron/handlers/*.handler.ts` que registran ~776 canales `ipcMain.handle()` en total. La registración ocurre en `main.ts` (raíz) tras la inicialización de la DB; cada handler recibe el `DataSource` y, opcionalmente, `getCurrentUser`. Cada canal se registra además en un `handlerRegistry` global que el servidor Fastify expone vía `/api/rpc`.

Handlers por área (lista no exhaustiva de canales):

- **Auth / personas / permisos:** `auth`, `personas`, `permissions`, `convenios`
- **Productos / recetas:** `productos`, `recetas`, `receta-presentacion`, `sabores`, `producto-sectores`
- **Ventas / PdV:** `ventas`, `kds`, `documentos-tickets`, `sectores-impresoras`
- **Compras / OCR-IA:** `compras`, `factura-import`
- **Financiero:** `financiero`, `caja-mayor`, `banking`, `cuentas-por-cobrar`, `cuentas-por-pagar`, `movimientos-cliente`
- **RRHH / comisiones:** `rrhh-funcionarios`, `asistencias`, `horas-extra`, `vacaciones`, `vales`, `feriados`, `comisiones`, `equipos-comision`, `liquidacion-sueldo`, `liquidacion-final`, `configuracion-rrhh`, `notificaciones-rrhh`, `reportes-rrhh`, `funcionario-documentos`
- **Dashboards:** `dashboard-ventas`, `dashboard-compras`, `dashboard-productos`, `dashboard-financiero`, `dashboard-caja-mayor`, `dashboard-rrhh`, `dashboard-shortcuts`
- **Sistema / infra:** `system`, `empresa`, `app-mode`, `db-config`, `backup`, `printers`, `images`, `adjuntos`, `files`, `remote-tunnel`, `cotizacion-mercado`, `onboarding`

---

## 4. Seguridad y permisos

- **Passwords con bcrypt** (`electron/utils/password.utils.ts`); migración única de plaintext → hash al arranque (`migrate-passwords.ts`).
- **JWT** con access + refresh tokens (rotación, persistidos en `RefreshToken`).
- **94 permisos** sembrados (`permissions.handler.ts`), agrupados por dominio (RRHH, ventas, financiero, etc.). `ensurePermission` se valida tanto en handlers como server-side en cada RPC.
- Roles/permisos: `Role` ↔ `Permission` vía `RolePermission`; `Usuario` ↔ `Role` vía `UsuarioRole`.

> Vulnerabilidad pendiente conocida: el JWT secret está hardcodeado (`'frc-gourmet-secret-key'`) — endurecer antes de exponer por WAN.

---

## 5. Impresión térmica e imágenes

- **Impresión térmica:** `node-thermal-printer` (vía `electron/utils/printer.utils.ts` y `ticket.utils.ts`). Soporta `network` (tcp://ip:9100), `usb`/`serial` (path), `bluetooth`, `lpr` (vía `lpr.utils.ts`) y CUPS (comando `lp`). `electron-pos-printer` figura como dependencia. Tickets soportados (`documentos-tickets.handler.ts`): comanda, ticket de venta (auto-impreso al concluir), pre-cuenta, recibos de cuotas, retiro de caja, vale, pagaré, etiqueta de delivery, acreditación POS. Ruteo por sector vía `SectorImpresora`; cocina en tiempo real vía **KDS** (SSE).
- **Imágenes/archivos:** protocolo custom `app://` (`main.ts`) que mapea `app://<bucket>/<archivo>` a `userData/<bucket>/`. Buckets: `profile-images`, `producto-images`, `factura-imports`, `funcionario-documentos`, `adjuntos`, `logos`. En modo cliente/PWA las imágenes vienen de `GET /api/files/...`.

---

## 6. Mobile PWA

App Angular separada en **`projects/mobile`**, servida por el nodo `server` y consumida por LAN/WAN (mesh Tailscale/headscale). Reutiliza lógica de datos vía path-alias `@frc/shared-core`, **no** reutiliza UI del desktop. Estado y olas administrativas en [`mobile-pwa-plan.md`](./mobile-pwa-plan.md) y [`mobile-pwa-skill-notes.md`](./mobile-pwa-skill-notes.md).

---

## 7. Resumen cuantitativo

| Métrica | Cantidad |
|---------|----------|
| Archivos `.entity.ts` | 157 (155 dominio + Printer + BaseModel) |
| Handlers IPC (archivos) | 54 |
| Canales IPC (`ipcMain.handle`) | ~776 |
| Migraciones TypeORM | 24 |
| Permisos sembrados | 94 |
| Servicios Angular (`src/app/services`) | 19 |
| Modos de operación | 3 (standalone / server / client) + PWA mobile |
| Driver de BD | SQLite o PostgreSQL |

---

## 8. Referencias

- [`entities-list.mdc`](./entities-list.mdc) — lista de entidades por dominio
- [`mobile-pwa-plan.md`](./mobile-pwa-plan.md) · [`mobile-pwa-skill-notes.md`](./mobile-pwa-skill-notes.md) — cliente PWA
- [`../plan-cliente-servidor.md`](../plan-cliente-servidor.md) — diseño cliente/servidor (implementado)
- [`../guia-funcionamiento-punto-de-venta.md`](../guia-funcionamiento-punto-de-venta.md) — funcionamiento del PdV
- [`../buffet-por-kilo.md`](../buffet-por-kilo.md) — buffet por peso + precios programados
- [`../RELEASE.md`](../RELEASE.md) — proceso de release
- [`../MIGRATIONS.md`](../MIGRATIONS.md) — guía de migraciones
