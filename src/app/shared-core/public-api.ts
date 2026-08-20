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
export { FaceRecognitionService } from '../services/face-recognition.service';
export type { FaceCapture } from '../services/face-recognition.service';
export { FaceCaptureComponent } from '../shared/components/face-capture/face-capture.component';
export { AppModeService } from '../services/app-mode.service';
export type { AppMode, AppModeDto } from '../services/app-mode.service';

// --- Componentes standalone compartidos ---
// KDS (pantalla de cocina): reusado por el desktop (tab) y la PWA (ruta /kds
// para TV). No está acoplado a Electron — usa window.api si existe, sino HTTP.
export { KdsComponent } from '../pages/ventas/kds/kds.component';

// --- Enums de dominio (valores puros, sin decoradores TypeORM) ---
export { PersonaTipo } from '../database/entities/personas/persona-tipo.enum';
export {
  TipoSemilla,
  TipoVeto,
  EstadoTrack,
  VarianteEnergia,
  TipoFeedback,
  OrigenPlan,
} from '../database/entities/musica/musica-enums';

// --- Música ambiental: service + interfaces (reusado tal cual por la PWA) ---
// El service sólo usa `window.api.callIpc` (browser-safe); en mobile ese
// window.api lo provee el shim HTTP. El desktop sigue importándolo por su ruta
// relativa; la PWA lo importa por este barrel.
export { MusicaService } from '../services/musica.service';
export type {
  MusicaAvanzado,
  MusicaConfig,
  MusicaSemilla,
  MusicaTrack,
  ResumenPool,
  ResultadoDescubrimiento,
  BloqueProgramacion,
  ResultadoPlan,
  DispositivoSpotify,
  EstiloConDatos,
  MezclaItem,
  DeficitEstilo,
  DeficitBloque,
  EstadoRuntime,
  EstadoReproduccion,
} from '../services/musica.service';

// --- Entities (solo tipos en el bundle browser) ---
export type { Usuario } from '../database/entities/personas/usuario.entity';
export type { Moneda } from '../database/entities/financiero/moneda.entity';
export type { Persona } from '../database/entities/personas/persona.entity';

// --- Utilidades de dominio (datos puros, sin Angular/Electron) ---
// Mensaje legible de un error del backend (desenvuelve el prefijo de IPC).
export { mensajeDeError } from '../shared/utils/error-message.util';
// Reglas de validación de Operación Financiera (fuente única desktop + mobile).
export {
  CAMPOS_REQUERIDOS,
  CAMPOS_MONEDA,
  MONEDAS_EN_UI,
  usaCuentaBancaria,
  usaDosCuentasBancarias,
  monedasDesdeCuentaBancaria,
} from '../pages/financiero/caja-mayor/operaciones-financieras/create-operacion-financiera/operacion-financiera-validacion.util';
export type { TipoOperacionFinanciera } from '../pages/financiero/caja-mayor/operaciones-financieras/create-operacion-financiera/operacion-financiera-validacion.util';
