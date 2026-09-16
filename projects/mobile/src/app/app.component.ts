import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '@frc/shared-core';
import { sessionExpired$ } from './core/data/auth-events';
import { DeepLinkService } from './core/services/deep-link.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>',
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
      }
    `,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly deepLinkService = inject(DeepLinkService);
  private sub?: Subscription;
  private hashChangeHandler?: () => void;
  private popstateHandler?: () => void;
  private hashPollInterval?: ReturnType<typeof setInterval>;
  private lastProcessedHash = '';

  ngOnInit(): void {
    // Sesión expirada (401 irrecuperable) → cerrar sesión y volver al login.
    this.sub = sessionExpired$.subscribe(() => {
      if (this.auth.isLoggedIn) {
        void this.auth.logout();
      }
    });

    // P1 OBLIGATORIO: listener hashchange robusto con cleanup en destroy
    this.setupHashChangeListener();
    
    // P0 FIX: listener popstate para navegación con botones browser
    this.setupPopstateListener();
    
    // P0 FIX: polling para detectar location.hash = '#/o/...' (no dispara hashchange)
    this.setupHashPolling();

    // P0 FIX: procesar hash ya presente en ngOnInit (cubre mid-session y cold-start post-login)
    this.processExistingHash();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    
    // P1 OBLIGATORIO: cleanup del listener
    if (this.hashChangeHandler) {
      window.removeEventListener('hashchange', this.hashChangeHandler);
    }
    
    if (this.popstateHandler) {
      window.removeEventListener('popstate', this.popstateHandler);
    }
    
    if (this.hashPollInterval) {
      clearInterval(this.hashPollInterval);
    }
  }

  /**
   * P0 FIX: procesar hash ya presente en ngOnInit.
   * Cubre:
   * - Mid-session: usuario logueado hace location.hash='#/o/gasto/1' en DevTools
   * - Cold-start post-login: usuario vuelve y el hash todavía está en la URL
   */
  private processExistingHash(): void {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#/o/')) return;

    // Si ya logueado → navegar inmediatamente
    if (this.auth.isLoggedIn) {
      console.log('[DeepLink] hash detectado vía init:', hash);
      this.lastProcessedHash = hash;
      this.deepLinkService.translateAndNavigate(hash).catch((err) => {
        console.error('[DeepLink] Error navegando:', err);
      });
      return;
    }

    // P0 FIX: si NO logueado pero hay token en storage → hidratar auth y reintentar
    const token = localStorage.getItem('frc_mobile_access_token');
    if (token) {
      console.log('[DeepLink] Hash presente pero isLoggedIn=false, verificando token storage...');
      // Dar tiempo al AuthService a hidratar (típicamente < 100ms)
      setTimeout(() => {
        if (this.auth.isLoggedIn) {
          console.log('[DeepLink] Token hidratado, navegando:', hash);
          this.lastProcessedHash = hash;
          this.deepLinkService.translateAndNavigate(hash).catch((err) => {
            console.error('[DeepLink] Error navegando:', err);
          });
        } else {
          console.log('[DeepLink] Token inválido o expirado, authGuard manejará');
        }
      }, 150);
    } else {
      console.log('[DeepLink] No logueado y sin token, authGuard manejará con returnUrl');
    }
  }

  /**
   * Configura listener para deep links mid-session.
   * 
   * Flujo:
   * - Usuario ya logueado toca link de WhatsApp → window.location.hash cambia
   * - Evento hashchange se dispara
   * - Si es deep link (#/o/...) → translateAndNavigate()
   * - Si NO logueado → verificar token storage y reintentar
   * 
   * P1 OBLIGATORIO: fallback si 'onhashchange' no está soportado (navegadores muy viejos)
   */
  private setupHashChangeListener(): void {
    if (!('onhashchange' in window)) {
      console.warn('[AppComponent] hashchange no soportado, deep links mid-session NO funcionarán');
      return;
    }

    this.hashChangeHandler = () => {
      const hash = window.location.hash;
      
      // Solo procesar deep links
      if (!hash || !hash.startsWith('#/o/')) return;
      
      // Evitar procesar el mismo hash múltiples veces
      if (hash === this.lastProcessedHash) return;

      // Si logueado → navegar inmediatamente
      if (this.auth.isLoggedIn) {
        console.log('[DeepLink] hash detectado vía hashchange:', hash);
        this.lastProcessedHash = hash;
        this.deepLinkService.translateAndNavigate(hash).catch((err) => {
          console.error('[DeepLink] Error navegando:', err);
        });
        return;
      }

      // P0 FIX: si NO logueado pero hay token → hidratar y reintentar
      const token = localStorage.getItem('frc_mobile_access_token');
      if (token) {
        console.log('[DeepLink] hashchange sin isLoggedIn, verificando token storage...');
        setTimeout(() => {
          if (this.auth.isLoggedIn) {
            console.log('[DeepLink] Token hidratado, navegando:', hash);
            this.lastProcessedHash = hash;
            this.deepLinkService.translateAndNavigate(hash).catch((err) => {
              console.error('[DeepLink] Error navegando:', err);
            });
          } else {
            console.log('[DeepLink] Token inválido, authGuard manejará');
          }
        }, 150);
      } else {
        console.log('[DeepLink] Usuario NO logueado y sin token, authGuard manejará con returnUrl');
      }
    };

    window.addEventListener('hashchange', this.hashChangeHandler);
  }

  /**
   * P0 FIX: listener popstate para navegación con botones browser.
   * Complementa hashchange para cubrir más escenarios de navegación.
   */
  private setupPopstateListener(): void {
    this.popstateHandler = () => {
      const hash = window.location.hash;
      
      // Solo procesar deep links
      if (!hash || !hash.startsWith('#/o/')) return;
      
      // Evitar procesar el mismo hash múltiples veces
      if (hash === this.lastProcessedHash) return;

      // Si logueado → navegar inmediatamente
      if (this.auth.isLoggedIn) {
        console.log('[DeepLink] hash detectado vía popstate:', hash);
        this.lastProcessedHash = hash;
        this.deepLinkService.translateAndNavigate(hash).catch((err) => {
          console.error('[DeepLink] Error navegando:', err);
        });
        return;
      }

      // Si NO logueado pero hay token → hidratar y reintentar
      const token = localStorage.getItem('frc_mobile_access_token');
      if (token) {
        console.log('[DeepLink] popstate sin isLoggedIn, verificando token storage...');
        setTimeout(() => {
          if (this.auth.isLoggedIn) {
            console.log('[DeepLink] Token hidratado, navegando:', hash);
            this.lastProcessedHash = hash;
            this.deepLinkService.translateAndNavigate(hash).catch((err) => {
              console.error('[DeepLink] Error navegando:', err);
            });
          } else {
            console.log('[DeepLink] Token inválido, authGuard manejará');
          }
        }, 150);
      }
    };

    window.addEventListener('popstate', this.popstateHandler);
  }

  /**
   * P0 FIX: polling para detectar asignación directa location.hash = '#/o/...'
   * 
   * Problema: en Chrome automation / PathLocationStrategy, asignar window.location.hash
   * no dispara hashchange event, pero el hash SÍ cambia en la URL.
   * 
   * Solución: poll corto (300ms) comparando window.location.hash con lastProcessedHash.
   * Si detectamos un deep link nuevo y hay sesión → translateAndNavigate.
   */
  private setupHashPolling(): void {
    this.hashPollInterval = setInterval(() => {
      const hash = window.location.hash;
      
      // Solo procesar deep links nuevos
      if (!hash || !hash.startsWith('#/o/')) return;
      if (hash === this.lastProcessedHash) return;

      // Si logueado → navegar inmediatamente
      if (this.auth.isLoggedIn) {
        console.log('[DeepLink] hash detectado vía poll:', hash);
        this.lastProcessedHash = hash;
        this.deepLinkService.translateAndNavigate(hash).catch((err) => {
          console.error('[DeepLink] Error navegando:', err);
        });
        return;
      }

      // Si NO logueado pero hay token → hidratar y reintentar
      const token = localStorage.getItem('frc_mobile_access_token');
      if (token) {
        console.log('[DeepLink] poll sin isLoggedIn, verificando token storage...');
        setTimeout(() => {
          if (this.auth.isLoggedIn && window.location.hash === hash) {
            console.log('[DeepLink] Token hidratado, navegando:', hash);
            this.lastProcessedHash = hash;
            this.deepLinkService.translateAndNavigate(hash).catch((err) => {
              console.error('[DeepLink] Error navegando:', err);
            });
          }
        }, 150);
      }
    }, 300); // Poll cada 300ms - balance entre responsividad y rendimiento
  }
}
