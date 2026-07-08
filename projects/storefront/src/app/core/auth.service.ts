import { Injectable } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { PublicApiService } from './public-api.service';
import { CuentaCliente } from './models';

/**
 * Auth de cliente del storefront: OTP por WhatsApp + login por password.
 * El token vive en localStorage (vía PublicApiService). Angular 15: sin signals,
 * `cuenta` e `isAuthenticated` son propiedades planas actualizadas imperativamente.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  cuenta: CuentaCliente | null = null;
  isAuthenticated = false;

  constructor(private api: PublicApiService) {
    this.isAuthenticated = this.api.hasToken();
    if (this.isAuthenticated) this.refreshMe();
  }

  solicitarOtp(telefono: string): Observable<any> {
    return this.api.call('auth.otp.request', [telefono]);
  }

  verificarOtp(telefono: string, codigo: string): Observable<any> {
    return this.api.call<any>('auth.otp.verify', [telefono, codigo]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res.accessToken, res.cuenta);
      }),
    );
  }

  loginPassword(identificador: string, password: string): Observable<any> {
    return this.api.call<any>('auth.login', [identificador, password]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res.accessToken, res.cuenta);
      }),
    );
  }

  refreshMe(): void {
    this.api.call<any>('auth.me', []).subscribe({
      next: (res) => {
        if (res?.success) this.cuenta = res.cuenta;
        else this.logout();
      },
      error: () => this.logout(),
    });
  }

  actualizarPerfil(data: { nombre?: string; email?: string; password?: string }): Observable<any> {
    return this.api.call<any>('auth.perfil.update', [data]).pipe(
      tap((res) => {
        if (res?.success) this.cuenta = res.cuenta;
      }),
    );
  }

  logout(): void {
    this.api.setToken(null);
    this.cuenta = null;
    this.isAuthenticated = false;
  }

  private setSesion(token: string, cuenta: CuentaCliente): void {
    this.api.setToken(token);
    this.cuenta = cuenta;
    this.isAuthenticated = true;
  }
}
