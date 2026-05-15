import { Injectable } from '@angular/core';

export interface DbConfigDto {
  type: 'sqlite' | 'postgres';
  path?: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  schema?: string;
  ssl?: boolean;
}

export interface DbConfigOpResult {
  success: boolean;
  message?: string;
}

export interface DbConfigInitPostgresDto {
  host: string;
  port: number;
  ssl?: boolean;
  superuserUsername: string;
  superuserPassword: string;
  targetUsername: string;
  targetPassword: string;
  targetDatabase: string;
}

@Injectable({ providedIn: 'root' })
export class DbConfigService {
  private get api(): any {
    return (window as any).api;
  }

  async get(): Promise<DbConfigDto> {
    return await this.api.dbConfigGet();
  }

  async save(payload: DbConfigDto): Promise<DbConfigOpResult> {
    return await this.api.dbConfigSave(payload);
  }

  async testConnection(payload: DbConfigDto): Promise<DbConfigOpResult> {
    return await this.api.dbConfigTestConnection(payload);
  }

  async restartApp(): Promise<DbConfigOpResult> {
    return await this.api.dbConfigRestartApp();
  }

  async initPostgres(payload: DbConfigInitPostgresDto): Promise<DbConfigOpResult> {
    return await this.api.dbConfigInitPostgres(payload);
  }
}
