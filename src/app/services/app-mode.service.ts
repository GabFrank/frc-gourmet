import { Injectable } from '@angular/core';

export type AppMode = 'standalone' | 'server' | 'client';

export interface AppModeNetwork {
  serverPort?: number;
  serverUrl?: string;
}

export interface AppModeDto {
  mode: AppMode;
  network: AppModeNetwork | null;
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
}
