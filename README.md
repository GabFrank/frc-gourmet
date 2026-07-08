# FRC Gourmet

A restaurant management desktop app (Electron + Angular) covering point of sale, products & recipes, inventory, purchasing, finances and a full HR (RRHH) suite. It runs standalone on one machine or in a client/server setup with a companion mobile PWA.

## Features

- **PdV (Point of Sale)**: tables, comandas, kitchen display (KDS), buffet-by-weight, delivery.
- **Products & Recipes**: families/subfamilies, presentations & prices, recipes (ingredients, phases, materials), flavors/pizza variations, combos and promotions.
- **Purchasing & Suppliers**: purchases, supplier catalog, accounts payable/receivable with installments.
- **Finance**: Caja Mayor, expenses, bank accounts, cheques, POS accreditations, multi-currency.
- **HR (RRHH)**: employees, attendance/shifts, advances/loans, payroll, bonuses, vacations, commissions.
- **Dashboards** per domain and **OCR + AI invoice import**.
- **Security**: multi-user with role/permission access control; secrets stored in the OS keychain (keytar).
- **Operation modes**: standalone, server (HTTP API + mobile PWA), client (thin client over the LAN).

## Tech Stack

- **Frontend**: Angular 15 + TypeScript + Angular Material
- **Desktop**: Electron 24
- **Server (server/client modes)**: Fastify (JWT auth, RPC, static)
- **Database**: SQLite (default) or PostgreSQL, both via TypeORM. Schema managed by **migrations** (no auto-DDL). Configurable in Configuración → Configurar BD.
- **Mobile**: PWA Angular project (`projects/mobile`) served by the server node
- **Build Tools**: Angular CLI, Electron Builder; releases via semantic-release

## Development

### Prerequisites

- Node.js 18+ (`>=18.17.0 <21`) y npm
- Angular CLI (`npm install -g @angular/cli`)

### Documentación clave

- **[docs/RELEASE.md](docs/RELEASE.md)** — Proceso de release completo (canales alpha/beta/stable, semantic-release, code signing, auto-update).
- **[docs/MIGRATIONS.md](docs/MIGRATIONS.md)** — TypeORM migrations (cómo agregar cambios de schema sin perder datos).
- **[build/README.md](build/README.md)** — Recursos de empaquetado (íconos, entitlements, NSIS).
- **[CLAUDE.md](CLAUDE.md)** — Instrucciones para agentes IA trabajando en el repo.

### Getting Started

1. Clone the repository
   ```
   git clone https://github.com/GabFrank/frc-gourmet.git
   cd frc-gourmet
   ```

2. Install dependencies
   ```
   npm install
   ```

3. Run the app (Angular dev server on port 4201 + Electron, in parallel)
   ```
   npm start
   ```

4. Before pushing, run the strict AOT build to catch template/type errors
   ```
   npm run check
   ```

### Cambios de schema (migrations)

Cualquier cambio en `src/app/database/entities/**` (agregar columna, índice, tabla, etc.) **requiere migration**. `synchronize:true` está deshabilitado: el schema solo cambia vía migrations versionadas.

```bash
# Generar migration desde diff entities ↔ BD CLI temporal
npm run migration:generate -- src/app/database/migrations/NombreCambio

# Aplicar migrations pendientes manualmente
npm run migration:run

# Listar estado
npm run migration:show
```

Después de generar, importar la clase en `src/app/database/database.config.ts → getMigrations()`. Detalles completos en [docs/MIGRATIONS.md](docs/MIGRATIONS.md).

El pre-commit hook (`scripts/check-entity-migration.sh`) avisa si modificás entities sin migration en el mismo commit, y bloquea si agregás entity nueva sin migration. Override puntual: `SKIP_ENTITY_MIGRATION_CHECK=1 git commit ...`.

### Building for Production

1. Build the Angular application
   ```
   npm run build:prod
   ```

2. Package the Electron application
   ```
   npm run electron:build
   ```

## Project Structure

- **src/app/pages/**: Angular standalone components organized by domain (`productos`, `ventas`, `compras`, `financiero`, `personas`, `rrhh`, `comisiones`, `gestion-recetas`, `gestion-sabores`, `configuracion`, `sistema`, `pagos`, `personalizacion`, `home`)
- **src/app/database/**: TypeORM config, entities (`entities/<domain>/`) and migrations (`migrations/`)
- **src/app/services/**: Angular services (incl. the `RepositoryService` abstraction with IPC and HTTP implementations)
- **electron/**: Electron main process — `handlers/` (IPC handlers), `server/` (Fastify routes for server mode), `utils/`
- **projects/mobile/**: companion mobile PWA (Angular)
- **main.ts / preload.ts**: Electron entry point and the `window.api` context bridge
- **docs/** and **.claude/skills/frc-gourmet-expert/**: technical docs, conventions and the in-repo knowledge base

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Proprietary / `UNLICENSED` (see `package.json`). All rights reserved by FRC Sistemas Informaticos.

## Contact

Project Link: [https://github.com/GabFrank/frc-gourmet](https://github.com/GabFrank/frc-gourmet)
