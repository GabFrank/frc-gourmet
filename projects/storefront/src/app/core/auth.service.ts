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

  constructor(private api: PublicApiService) {
    if (this.api.hasToken()) this.refreshMe();
  }

  /** Refleja siempre el estado real del token (incluye refresh fallido). */
  get isAuthenticated(): boolean {
    return this.api.hasToken();
  }

  solicitarOtp(telefono: string): Observable<any> {
    return this.api.call('auth.otp.request', [telefono]);
  }

  verificarOtp(telefono: string, codigo: string): Observable<any> {
    return this.api.call<any>('auth.otp.verify', [telefono, codigo]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res);
      }),
    );
  }

  loginPassword(identificador: string, password: string): Observable<any> {
    return this.api.call<any>('auth.login', [identificador, password]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res);
      }),
    );
  }

  registrar(email: string, password: string, nombre: string): Observable<any> {
    return this.api.call<any>('auth.registrar', [{ email, password, nombre }]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res);
      }),
    );
  }

  googleLogin(idToken: string): Observable<any> {
    return this.api.call<any>('auth.google', [idToken]).pipe(
      tap((res) => {
        if (res?.success && res.accessToken) this.setSesion(res);
      }),
    );
  }

  /** True si la cuenta aún no completó su nombre (para el onboarding de perfil). */
  get necesitaPerfil(): boolean {
    return this.isAuthenticated && !this.cuenta?.nombre;
  }

  /**
   * F8b: crédito del cliente para el checkout. `null` = no puede comprar a cuenta. `disponible`
   * null con `sinTope` = sin límite. Se pide al entrar al checkout; no cambia la sesión.
   */
  credito: { disponible: number | null; sinTope: boolean } | null = null;
  cargarCredito(): Observable<any> {
    return this.api.call<any>('auth.me', []).pipe(
      tap((res) => { this.credito = res?.success ? (res.credito ?? null) : null; }),
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

  /** Suma a la cuenta abierta el Gmail verificado por Google. */
  vincularGoogle(idToken: string): Observable<any> {
    return this.api.call<any>('auth.google.vincular', [idToken]).pipe(
      tap((res) => {
        if (res?.success) this.cuenta = res.cuenta;
      }),
    );
  }

  actualizarPerfil(data: { nombre?: string; email?: string; password?: string; telefonoContacto?: string; avisosWhatsapp?: boolean }): Observable<any> {
    return this.api.call<any>('auth.perfil.update', [data]).pipe(
      tap((res) => {
        if (res?.success) this.cuenta = res.cuenta;
      }),
    );
  }

  logout(): void {
    const refresh = this.api.getRefreshToken();
    if (refresh) this.api.call('auth.logout', [refresh]).subscribe({ next: () => {}, error: () => {} });
    this.api.setTokens(null, null);
    this.cuenta = null;
    this.credito = null;
  }

  private setSesion(res: any): void {
    this.api.setTokens(res.accessToken, res.refreshToken ?? null);
    this.cuenta = res.cuenta;
    this.credito = null;
  }
}
