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

  ngOnInit(): void {
    // Sesión expirada (401 irrecuperable) → cerrar sesión y volver al login.
    this.sub = sessionExpired$.subscribe(() => {
      if (this.auth.isLoggedIn) {
        void this.auth.logout();
      }
    });

    // P1 OBLIGATORIO: listener hashchange robusto con cleanup en destroy
    this.setupHashChangeListener();

    // P0 FIX: procesar hash ya presente en ngOnInit (cubre mid-session y cold-start post-login)
    this.processExistingHash();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    
    // P1 OBLIGATORIO: cleanup del listener
    if (this.hashChangeHandler) {
      window.removeEventListener('hashchange', this.hashChangeHandler);
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
      console.log('[DeepLink] Hash presente en init (logueado):', hash);
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

      // Si logueado → navegar inmediatamente
      if (this.auth.isLoggedIn) {
        console.log('[DeepLink] Hash cambió mid-session:', hash);
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
}
