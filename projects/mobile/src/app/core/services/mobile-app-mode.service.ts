import { Injectable } from '@angular/core';
import type { AppModeDto } from '@frc/shared-core';

/**
 * Stub de `AppModeService` para la PWA mobile. El desktop resuelve el modo vía
 * `window.api.appModeGet()` (Electron); en mobile el modo es SIEMPRE `client`
 * (siempre habla a un server remoto por HTTP). Se provee para el token
 * `AppModeService` en el bootstrap, así `AuthService` (reusado) funciona sin
 * tocar Electron.
 */
@Injectable()
export class MobileAppModeService {
  async get(): Promise<AppModeDto> {
    return { mode: 'client', network: null, deviceId: null };
  }
}
