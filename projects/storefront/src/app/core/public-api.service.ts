import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

/**
 * Cliente de la superficie pública `/pub/*` del server FRC Gourmet.
 *
 * Toda operación pasa por `POST /pub/rpc { op, params }` con la whitelist del
 * server (NUNCA `/api/rpc`). El token de cliente (si hay) va como Bearer.
 *
 * Base URL: same-origin por default (el server sirve la PWA). En dev se puede
 * apuntar a otro server con `localStorage.frc_storefront_server_url`.
 */
@Injectable({ providedIn: 'root' })
export class PublicApiService {
  private token: string | null = null;

  constructor(private http: HttpClient) {
    this.token = localStorage.getItem('frc_sf_token');
  }

  setToken(token: string | null): void {
    this.token = token;
    if (token) localStorage.setItem('frc_sf_token', token);
    else localStorage.removeItem('frc_sf_token');
  }

  hasToken(): boolean {
    return !!this.token;
  }

  private baseUrl(): string {
    return localStorage.getItem('frc_storefront_server_url') || '';
  }

  /** Invoca una operación pública. Devuelve el `result` del server. */
  call<T = any>(op: string, params: any[] = []): Observable<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return this.http
      .post<{ result?: T; error?: string }>(`${this.baseUrl()}/pub/rpc`, { op, params }, { headers })
      .pipe(
        map((res) => {
          if (res && (res as any).error) throw new Error((res as any).error);
          return (res as any).result as T;
        }),
        catchError((err) => throwError(() => err)),
      );
  }
}
