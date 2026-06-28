# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FRC Gourmet is a desktop restaurant management app built with **Angular 15 + Electron + SQLite (TypeORM)**. It handles products, recipes, sales (PdV), inventory, purchasing, and finances.

## Commands

- **Dev (full app):** `npm start` — runs Angular dev server on port 4201 and Electron together. **The user runs this manually from their terminal; never run `npm start` from Claude Code.**
- **Check compilation:** `npm run build` — use this to verify the code compiles without errors
- **Angular only:** `npm run ng:serve` (port 4201)
- **Compile Electron TS:** `npm run electron:serve-tsc` (uses `tsconfig.electron.json`)
- **Build prod:** `npm run build:prod`
- **Package desktop app:** `npm run electron:build`
- **Lint:** `npm run lint`
- **Test:** `npm run test`

## Architecture

### Electron ↔ Angular Communication (IPC)

The app uses Electron's IPC with context isolation. Data flows through 4 layers:

1. **Entity** (`src/app/database/entities/`) — TypeORM entity extending `BaseModel` (has `id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`)
2. **Handler** (`electron/handlers/*.handler.ts`) — registers `ipcMain.handle()` calls, uses TypeORM repositories directly. Each domain has its own handler file (e.g., `productos.handler.ts`, `financiero.handler.ts`, `recetas.handler.ts`)
3. **Preload** (`preload.ts`) — exposes IPC methods via `contextBridge.exposeInMainProcess` as `window.electron`
4. **Repository Service** (`src/app/database/repository.service.ts`) — Angular injectable that wraps `window.electron.*` calls in `Observable`s via `from()`

**To add a new entity/feature**, you must touch all 4 layers + register the entity in `database.config.ts`. See `.cursor/rules/create-new-entities.mdc` for the full checklist.

Handler registration happens in `main.ts` after DB initialization. Each handler receives the `DataSource` and optionally `getCurrentUser`.

### Database

- TypeORM with **dual driver**: SQLite (default; file at Electron's `userData` path as `frc-gourmet.db`) or Postgres (client/server mode).
- **`synchronize: false`** — the schema is managed **exclusively by migrations**, which run automatically at startup (`runMigrations`). There is NO auto-DDL. Adding or changing an entity REQUIRES a migration; without one the table/column won't exist at runtime.
- Entity config: `src/app/database/database.config.ts` — every entity must be imported and added to `getEntitiesList()`, and every migration imported and added to `getMigrations()`.

#### Migrations

- One file per change in `src/app/database/migrations/`, named **`<epoch-millis>-<Descripcion>.ts`** with class `Descripcion<epoch-millis>` (e.g. `1782606189440-AddNotificaciones.ts`).
- **Timestamp = real epoch milliseconds** — get it with `date +%s%3N` (or let `npm run migration:generate` assign it). **NEVER hand-pick a rounded number** (e.g. `1780500000000`): rounded timestamps collide across unmerged branches; a real-ms value is unique and orders correctly. Older migrations use rounded numbers — do not imitate them.
- Must be **driver-aware** (branch on `queryRunner.connection.options.type === 'postgres'`) and **additive** (no `DROP`/`RENAME` without a 2-version strategy). Prefer `IF NOT EXISTS`.
- Register the class in `getMigrations()` (`database.config.ts`). Edit `.ts` only (`.js` are generated). Never modify an already-merged migration — add a new one. Full guide: `docs/MIGRATIONS.md`.

### Frontend Structure

- **Tab-based navigation** — `TabsService` manages dynamic tabs; components open as tabs via `AppComponent` methods
- Pages organized by domain: `src/app/pages/{productos,compras,financiero,personas,ventas,gestion-recetas,gestion-sabores}/`
- Most page components are standalone Angular components
- Some components declared in `AppModule` (e.g., `GestionarProductoComponent` and its sub-components)
- UI framework: Angular Material with dark/light theme support
- Images served via custom `app://` protocol (profile-images, producto-images)

### Entity Domains

- **productos/** — Familia → Subfamilia → Producto → Presentacion → PrecioVenta/PrecioCosto, plus Receta, Sabor, Combo, Promocion, Observacion, etc.
- **financiero/** — Moneda, Caja, Conteo, Dispositivo, TipoPrecio
- **compras/** — Proveedor, Compra/CompraDetalle, Pago, ProveedorProducto
- **ventas/** — Venta/VentaItem, PdV categories/config, Mesa, Comanda, Delivery
- **personas/** — Persona, Usuario, Role, Cliente

## Coding Rules

- **Edit `.ts` files only** — `.js`/`.js.map` files are auto-generated from TypeScript
- **All strings must be saved UPPERCASE** in the database
- **No function calls in Angular templates** — pre-compute values in component properties, use pipes for transforms. No getters either.
- **No hardcoded colors** — use theme variables (dark/light mode support)
- **Number formatting:** always use `| number:'1.0-2'` pipe format
- **No live filtering** — use explicit filter buttons unless specifically requested
- **No `mat-sort-header`** unless specifically requested
- **Component naming:** `list-{entity}`, `create-edit-{entity}`, add `-dialog` suffix for dialogs
- **Separate files** for .ts, .html, .scss per component
- **Use `repository.service.ts`** for all DB access from Angular components
- **Confirmations:** use the existing `confirmation-dialog.component.ts`
- **Reuse existing modules** — don't create new ones unnecessarily
