# FRC Gourmet

A modern Electron Angular desktop application for restaurant inventory management, product cataloging, and point of sale operations.

## Features

- **Product Management**: Comprehensive system for managing products, categories, and subcategories
- **Inventory Control**: Keep track of stock, set reorder points, and manage product expiration
- **User Management**: Secure multi-user system with role-based access control
- **Profile Management**: Create and manage customer and employee profiles
- **Image Handling**: Store product and profile images locally with the app
- **Responsive UI**: Modern, user-friendly interface built with Angular Material

## Tech Stack

- **Frontend**: Angular 15 with TypeScript
- **UI Framework**: Angular Material
- **Desktop Framework**: Electron
- **Database**: SQLite (default) o Postgres, ambos con TypeORM. Configurable en Sistema → Configurar BD.
- **Build Tools**: Angular CLI, Electron Builder

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

3. Run the development server
   ```
   npm run start
   ```

4. Start Electron
   ```
   npm run electron
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

- **src/app/pages/**: Angular components organized by feature
  - **personas/**: Customer and employee management
  - **productos/**: Product, category, and subcategory management
- **src/app/database/**: Database configuration and entity definitions
- **src/app/services/**: Application services
- **electron/**: Electron main process code and utilities

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

Project Link: [https://github.com/GabFrank/frc-gourmet](https://github.com/GabFrank/frc-gourmet)
