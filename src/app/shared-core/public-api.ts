/**
 * Public API de la librería compartida `@frc/shared-core`.
 *
 * Frontera de código que comparten el desktop (Electron) y la PWA mobile
 * (`projects/mobile`). Por ahora re-exporta los archivos en su ubicación
 * original bajo `src/app/**` vía path-alias (migración incremental: ver
 * `docs/arquitectura/mobile-pwa-plan.md`). El desktop sigue importando por
 * sus rutas relativas; el mobile importa SIEMPRE por `@frc/shared-core`.
 *
 * Regla: acá va código compartible. Lo acoplado a Electron NO se exporta
 * (PrinterService, DatabaseService, UpdateService, DocumentoService).
 * Excepciones documentadas:
 *  - `RepositoryIpcService`: lee `window.api`; en mobile ese `window.api` lo
 *    provee el shim HTTP (`installApiHttp`), así que funciona como repo HTTP.
 *  - `AppModeService`: se exporta SOLO como token DI; en mobile se reemplaza
 *    por `MobileAppModeService`. Nunca se construye la clase original.
 */

// --- Contrato de datos + impl IPC (reusada como HTTP en mobile vía shim) ---
export { RepositoryService } from '../database/repository.service';
export type { LoginResult, ClienteFilters } from '../database/repository.service';
export { RepositoryIpcService } from '../database/repository-ipc.service';

// --- Servicios Angular reutilizables ---
export { ThemeService } from '../services/theme.service';
export { AuthService } from '../services/auth.service';
export type { DeviceInfo } from '../services/auth.service';
export { PermissionService } from '../services/permission.service';
export { AppModeService } from '../services/app-mode.service';
export type { AppMode, AppModeDto } from '../services/app-mode.service';

// --- Enums de dominio (valores puros, sin decoradores TypeORM) ---
export { PersonaTipo } from '../database/entities/personas/persona-tipo.enum';

// --- Entities (solo tipos en el bundle browser) ---
export type { Usuario } from '../database/entities/personas/usuario.entity';
export type { Moneda } from '../database/entities/financiero/moneda.entity';
export type { Persona } from '../database/entities/personas/persona.entity';
