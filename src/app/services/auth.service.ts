import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { RepositoryService } from '../database/repository.service';
import { Usuario } from '../database/entities/personas/usuario.entity';
import { LoginSession } from '../database/entities/auth/login-session.entity';
import { AppModeService, AppMode } from './app-mode.service';

export interface LoginResult {
  success: boolean;
  usuario?: Usuario;
  token?: string;
  message?: string;
  sessionId?: number;
}

export interface DeviceInfo {
  browser: string;
  os: string;
  device: string;
  userAgent: string;
  ip?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<Usuario | null>(null);
  public currentUser$: Observable<Usuario | null> = this.currentUserSubject.asObservable();
  private sessionId: number | null = null;
  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'current_user';
  private readonly SESSION_ID_KEY = 'session_id';
  private handlingAuthExpired = false;

  constructor(
    private repositoryService: RepositoryService,
    private router: Router,
    private appModeService: AppModeService
  ) {
    this.loadFromLocalStorage();

    // Web /admin: el shim HTTP (api-http.ts) emite 'frc-web-auth-expired' cuando
    // el refresh token venció / es inválido y no se pudo renovar la sesión. Sin
    // un interceptor global, la UI quedaba "logueada sin token"; acá cerramos
    // sesión y vamos al login. En Electron el evento nunca se emite (no-op).
    if (typeof window !== 'undefined') {
      window.addEventListener('frc-web-auth-expired', () => {
        // Guard: logout() hace un RPC que podría volver a 401 y re-emitir el
        // evento; el flag evita el logout re-entrante en loop.
        if (this.handlingAuthExpired || !this.currentUserSubject.value) return;
        this.handlingAuthExpired = true;
        this.logout().finally(() => { this.handlingAuthExpired = false; });
      });
    }
  }

  // Check if user is logged in
  public get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  // Get the current logged in user
  public get currentUser(): Usuario | null {
    return this.currentUserSubject.value;
  }

  /**
   * Baja el flag `mustChangePassword` del usuario en memoria (y storage) tras un
   * cambio de contraseña exitoso, para que el guard de la PWA deje de redirigir
   * a la pantalla de cambio obligatorio. El backend ya persistió el false.
   */
  markPasswordChanged(): void {
    const user = this.currentUserSubject.value;
    if (!user) return;
    const updated = { ...user, mustChangePassword: false } as Usuario;
    this.currentUserSubject.next(updated);
    this.repositoryService.setCurrentUser(updated);
    if (localStorage.getItem(this.USER_KEY)) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(updated));
    }
  }

  // Login user
  async login(nickname: string, password: string): Promise<LoginResult> {
    try {
      const loginData = {
        nickname,
        password,
        deviceInfo: this.getDeviceInfo()
      };

      const result = await firstValueFrom(this.repositoryService.login(loginData));
      
      if (result.success && result.usuario) {
        this.setSession(result.usuario, result.token!, result.sessionId!);
        this.currentUserSubject.next(result.usuario);
        return result;
      }
      
      return result;
    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        message: 'Error en el servidor. Intente nuevamente más tarde.'
      };
    }
  }

  // Logout user
  async logout(navigateToLogin = true): Promise<void> {
    if (this.sessionId) {
      try {
        await firstValueFrom(this.repositoryService.logout(this.sessionId));
      } catch (error) {
        console.error('Error during logout:', error);
      }
    }
    
    this.clearSession();
    this.currentUserSubject.next(null);
    
    if (navigateToLogin) {
      this.router.navigate(['/login']);
    }
  }

  // Get login sessions for a user
  getLoginSessions(usuarioId: number): Observable<LoginSession[]> {
    return this.repositoryService.getLoginSessions(usuarioId);
  }

  // Update last activity to keep session active
  async updateLastActivity(): Promise<void> {
    if (this.sessionId) {
      try {
        await firstValueFrom(this.repositoryService.updateSessionActivity(this.sessionId));
      } catch (error) {
        console.error('Error updating session activity:', error);
      }
    }
  }

  /**
   * Aplica una sesión obtenida por fuera del login con usuario/clave (ej. login
   * por QR / device grant). Persiste el estado y emite el usuario actual. El
   * transporte HTTP (api-http) debe recibir sus tokens por separado.
   */
  applyExternalSession(user: Usuario, token: string, sessionId: number): void {
    this.setSession(user, token, sessionId);
    this.currentUserSubject.next(user);
  }

  // Set up session data after successful login
  private setSession(user: Usuario, token: string, sessionId: number): void {
    this.sessionId = sessionId;
    
    // Store in localStorage for persistence
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    localStorage.setItem(this.SESSION_ID_KEY, sessionId.toString());
    
    // Set current user in repository service
    this.repositoryService.setCurrentUser(user);
  }

  // Clear session data on logout
  private clearSession(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.SESSION_ID_KEY);
    this.sessionId = null;
    
    // Clear current user in repository service
    this.repositoryService.setCurrentUser(null);
  }

  // Load user data from localStorage on application startup.
  //
  // P0-2: en modo standalone/server se valida contra el main process
  // (verifica JWT + LoginSession activa en BD). Si falla, se limpia.
  //
  // En modo client la seguridad real la hace el server al verificar el
  // JWT en cada request HTTP: la BD local del cliente no contiene esas
  // sessions ni los users del server, asi que validar localmente daria
  // false negatives. Restauramos UI state desde localStorage; si el JWT
  // ya no vale, el primer request al server rebotara con 401 y el
  // interceptor disparara logout.
  private async loadFromLocalStorage(): Promise<void> {
    const token = localStorage.getItem(this.TOKEN_KEY);
    const sessionIdStr = localStorage.getItem(this.SESSION_ID_KEY);
    const userJson = localStorage.getItem(this.USER_KEY);

    if (!token || !sessionIdStr || !userJson) return;

    const parsedSessionId = parseInt(sessionIdStr, 10);
    if (!Number.isFinite(parsedSessionId)) {
      this.clearSession();
      return;
    }

    let mode: AppMode = 'standalone';
    try {
      const cfg = await this.appModeService.get();
      mode = cfg?.mode || 'standalone';
    } catch { /* fallback standalone */ }

    if (mode === 'client') {
      // Red de seguridad: no dar por buena una sesión que el transporte no
      // puede usar.
      //
      // El estado de sesión de la UI vive en localStorage y sobrevive al cierre
      // de la app; los tokens del modo cliente viven en memoria del preload y
      // mueren con el proceso. Restaurar el usuario sin mirar los tokens
      // producía una sesión zombi: la app mostraba el nombre y el avatar
      // leídos del disco mientras cada llamada salía sin `Authorization` y
      // volvía rechazada. Nada la corregía, porque el evento que dispara el
      // logout automático no se emite en Electron.
      //
      // Desde 2026-08 el preload rehidrata la sesión desde el refresh token
      // persistido, así que lo normal es que acá ya haya token. Si igual no
      // hay —vencido a los 30 días, revocado, o servidor caído— se limpia y se
      // manda al login, que es honesto, en vez de un panel vacío que aparenta
      // funcionar.
      //
      // En la web `/admin` este chequeo no molesta: ese shim sí persiste sus
      // tokens en localStorage y los recarga al arrancar.
      await this.esperarRehidratacionCliente();
      if (!this.transporteTieneCredenciales()) {
        // No hace falta navegar: `clearSession()` deja el `BehaviorSubject` en
        // null y `app.component` ya reacciona a eso yendo al login. Un segundo
        // navigate a la misma URL sería un no-op.
        console.warn('[auth] sesión cacheada sin tokens en el transporte: se limpia.');
        this.clearSession();
        return;
      }
      try {
        const user = JSON.parse(userJson) as Usuario;
        this.sessionId = parsedSessionId;
        this.currentUserSubject.next(user);
        // No hace falta repoblar roles/permisos acá: `PermissionService` se
        // suscribe a `currentUser$` y los pide al servidor
        // (`getPermissionsByUser`) cada vez que el usuario cambia. Nada en la
        // UI lee `usuario.roles` — de hecho la entidad ni siquiera tiene esa
        // propiedad. El sidenav aparecía vacío por la sesión zombi (esa
        // llamada también salía sin token), no por el objeto cacheado.
      } catch {
        this.clearSession();
      }
      return;
    }

    try {
      const result = await firstValueFrom(
        this.repositoryService.restoreSession(parsedSessionId, token)
      );
      if (result?.success && result.usuario) {
        this.sessionId = parsedSessionId;
        this.currentUserSubject.next(result.usuario);
        localStorage.setItem(this.USER_KEY, JSON.stringify(result.usuario));
      } else {
        this.clearSession();
      }
    } catch (error) {
      console.error('restoreSession error:', error);
      this.clearSession();
    }
  }

  /**
   * Espera a que el preload termine de rehidratar la sesión desde el refresh
   * token persistido, si esa capacidad existe.
   *
   * Sin esto habría una carrera: `AuthService` se construye apenas arranca
   * Angular y podría preguntar por el token antes de que la rehidratación
   * termine, y limpiar una sesión que sí era recuperable.
   *
   * El `?.` no es defensivo por gusto: la web `/admin` usa otro shim de
   * `window.api` que no tiene este método (allá los tokens se recargan de
   * `localStorage` de forma síncrona), y en modo standalone esta rama ni
   * siquiera se ejecuta.
   */
  private async esperarRehidratacionCliente(): Promise<void> {
    try {
      const api = (window as any).api;
      if (typeof api?.ensureSessionRehydrated === 'function') {
        await api.ensureSessionRehydrated();
      }
    } catch (e) {
      console.warn('[auth] rehidratación de sesión falló:', e);
    }
  }

  /** ¿El transporte tiene con qué autenticar la próxima llamada? */
  private transporteTieneCredenciales(): boolean {
    try {
      const api = (window as any).api;
      // Si el shim no expone el método, no se puede afirmar que falten
      // credenciales: se deja pasar en vez de desloguear a ciegas.
      if (typeof api?.getAccessToken !== 'function') return true;
      return !!api.getAccessToken();
    } catch {
      return true;
    }
  }

  // Get device info for logging
  private getDeviceInfo(): DeviceInfo {
    const userAgent = navigator.userAgent;
    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Unknown';

    // Extract browser info
    if (userAgent.indexOf('Firefox') > -1) {
      browser = 'Firefox';
    } else if (userAgent.indexOf('Chrome') > -1) {
      browser = 'Chrome';
    } else if (userAgent.indexOf('Safari') > -1) {
      browser = 'Safari';
    } else if (userAgent.indexOf('MSIE') > -1 || userAgent.indexOf('Trident') > -1) {
      browser = 'Internet Explorer';
    } else if (userAgent.indexOf('Edge') > -1) {
      browser = 'Edge';
    }

    // Extract OS info
    if (userAgent.indexOf('Windows') > -1) {
      os = 'Windows';
    } else if (userAgent.indexOf('Mac') > -1) {
      os = 'MacOS';
    } else if (userAgent.indexOf('Linux') > -1) {
      os = 'Linux';
    } else if (userAgent.indexOf('Android') > -1) {
      os = 'Android';
    } else if (userAgent.indexOf('iOS') > -1 || userAgent.indexOf('iPhone') > -1 || userAgent.indexOf('iPad') > -1) {
      os = 'iOS';
    }

    // Extract device type
    if (userAgent.indexOf('Mobile') > -1) {
      device = 'Mobile';
    } else if (userAgent.indexOf('Tablet') > -1) {
      device = 'Tablet';
    } else {
      device = 'Desktop';
    }

    return { browser, os, device, userAgent };
  }
} 