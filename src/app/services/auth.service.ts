import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { map, tap } from 'rxjs/operators';
import { Router } from '@angular/router';
import { RepositoryService } from '../database/repository.service';
import { Usuario } from '../database/entities/personas/usuario.entity';
import { LoginSession } from '../database/entities/auth/login-session.entity';

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

  constructor(
    private repositoryService: RepositoryService,
    private router: Router
  ) {
    this.loadFromLocalStorage();
  }

  // Check if user is logged in
  public get isLoggedIn(): boolean {
    return !!this.currentUserSubject.value;
  }

  // Get the current logged in user
  public get currentUser(): Usuario | null {
    return this.currentUserSubject.value;
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

  // Load user data from localStorage on application startup
  private loadFromLocalStorage(): void {
    const userJson = localStorage.getItem(this.USER_KEY);
    const token = localStorage.getItem(this.TOKEN_KEY);
    const sessionId = localStorage.getItem(this.SESSION_ID_KEY);
    
    if (userJson && token && sessionId) {
      try {
        const user = JSON.parse(userJson) as Usuario;
        this.sessionId = parseInt(sessionId, 10);
        this.currentUserSubject.next(user);
        this.repositoryService.setCurrentUser(user);
      } catch (error) {
        console.error('Error parsing user data from localStorage:', error);
        this.clearSession();
      }
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