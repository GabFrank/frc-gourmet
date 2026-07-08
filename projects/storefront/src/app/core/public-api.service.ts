import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError, from } from 'rxjs';
import { map, catchError, switchMap } from 'rxjs/operators';

/**
 * Cliente de la superficie pública `/pub/*` del server FRC Gourmet.
 *
 * `POST /pub/rpc { op, params }` con la whitelist del server (NUNCA `/api/rpc`).
 * Access token corto (Bearer) + refresh token: si una llamada da 401, rota el
 * refresh y reintenta una vez. Base URL same-origin (override en dev con
 * `localStorage.frc_storefront_server_url`).
 */
@Injectable({ providedIn: 'root' })
export class PublicApiService {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private refreshing = false;

  constructor(private http: HttpClient) {
    this.token = localStorage.getItem('frc_sf_token');
    this.refreshToken = localStorage.getItem('frc_sf_refresh');
  }

  setTokens(access: string | null, refresh?: string | null): void {
    this.token = access;
    if (access) localStorage.setItem('frc_sf_token', access);
    else localStorage.removeItem('frc_sf_token');
    if (refresh !== undefined) {
      this.refreshToken = refresh;
      if (refresh) localStorage.setItem('frc_sf_refresh', refresh);
      else localStorage.removeItem('frc_sf_refresh');
    }
  }

  hasToken(): boolean {
    return !!this.token;
  }

  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  private baseUrl(): string {
    return localStorage.getItem('frc_storefront_server_url') || '';
  }

  private rawCall<T>(op: string, params: any[], useAuth = true): Observable<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (useAuth && this.token) headers['Authorization'] = `Bearer ${this.token}`;
    return this.http
      .post<{ result?: T; error?: string }>(`${this.baseUrl()}/pub/rpc`, { op, params }, { headers })
      .pipe(
        map((res) => {
          if (res && (res as any).error) throw new Error((res as any).error);
          return (res as any).result as T;
        }),
      );
  }

  /** Invoca una operación pública, con auto-refresh en 401. */
  call<T = any>(op: string, params: any[] = []): Observable<T> {
    return this.rawCall<T>(op, params).pipe(
      catchError((err) => {
        const is401 = err?.status === 401;
        if (is401 && this.refreshToken && op !== 'auth.refresh' && !this.refreshing) {
          return from(this.doRefresh()).pipe(
            switchMap((okRefresh) =>
              okRefresh ? this.rawCall<T>(op, params) : throwError(() => err),
            ),
          );
        }
        return throwError(() => err);
      }),
    );
  }

  /** Rota el refresh token. Devuelve true si obtuvo un access token nuevo. */
  private async doRefresh(): Promise<boolean> {
    if (!this.refreshToken) return false;
    this.refreshing = true;
    try {
      const res: any = await this.rawCall<any>('auth.refresh', [this.refreshToken], false).toPromise();
      if (res?.success && res.accessToken) {
        this.setTokens(res.accessToken, res.refreshToken ?? this.refreshToken);
        return true;
      }
      this.setTokens(null, null);
      return false;
    } catch {
      this.setTokens(null, null);
      return false;
    } finally {
      this.refreshing = false;
    }
  }
}
