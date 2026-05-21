/**
 * Public API de la librería compartida `@frc/shared-core`.
 *
 * Frontera de código que comparten el desktop (Electron) y la PWA mobile
 * (`projects/mobile`). Por ahora re-exporta los archivos en su ubicación
 * original bajo `src/app/**` vía path-alias (migración incremental: ver
 * `docs/arquitectura/mobile-pwa-plan.md`). El desktop sigue importando por
 * sus rutas relativas; el mobile importa SIEMPRE por `@frc/shared-core`.
 *
 * Regla: acá solo va código **browser-safe** (sin `window.api`, ipcRenderer
 * ni Node). NO exportar PrinterService, DatabaseService, UpdateService,
 * AppModeService, DocumentoService ni RepositoryIpcService.
 */

// --- Contrato de datos (impl HTTP la provee projects/mobile en F1) ---
export { RepositoryService } from '../database/repository.service';
export type { LoginResult, ClienteFilters } from '../database/repository.service';

// --- Servicios Angular reutilizables (browser-safe) ---
export { ThemeService } from '../services/theme.service';

// --- Enums de dominio (valores puros, sin decoradores TypeORM) ---
export { PersonaTipo } from '../database/entities/personas/persona-tipo.enum';
