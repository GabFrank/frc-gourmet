import { Injectable } from '@angular/core';

export type AppMode = 'standalone' | 'server' | 'client';

export interface AppModeNetwork {
  serverPort?: number;
  serverUrl?: string;
}

export interface AppModeDto {
  mode: AppMode;
  network: AppModeNetwork | null;
  /** F5 paso 3: id del Dispositivo asignado a este PC. Nullable. */
  deviceId?: number | null;
}

export interface DispositivoOption {
  id: number;
  nombre: string;
  mac?: string | null;
  activo: boolean;
  isVenta?: boolean;
  isCaja?: boolean;
}

export interface AppModeOpResult {
  success: boolean;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class AppModeService {
  private get api(): any {
    return (window as any).api;
  }

  async get(): Promise<AppModeDto> {
    return await this.api.appModeGet();
  }

  async save(payload: AppModeDto): Promise<AppModeOpResult> {
    return await this.api.appModeSave(payload);
  }

  async testServer(serverUrl: string): Promise<AppModeOpResult> {
    return await this.api.appModeTestServer({ serverUrl });
  }

  async restartApp(): Promise<AppModeOpResult> {
    return await this.api.dbConfigRestartApp();
  }

  /**
   * Lista dispositivos disponibles para asignar al PC actual. En modo
   * standalone/server resuelve via DB local; en cliente HTTP-rutea al server
   * (requiere JWT activo). Propaga error si falla — el caller distingue
   * "sin sesion" de "no hay datos".
   */
  async listDispositivos(): Promise<DispositivoOption[]> {
    return (await this.api.getDispositivos()) || [];
  }
}
