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
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    
    // P1 OBLIGATORIO: cleanup del listener
    if (this.hashChangeHandler) {
      window.removeEventListener('hashchange', this.hashChangeHandler);
    }
  }

  /**
   * Configura listener para deep links mid-session.
   * 
   * Flujo:
   * - Usuario ya logueado toca link de WhatsApp → window.location.hash cambia
   * - Evento hashchange se dispara
   * - Si es deep link (#/o/...) → translateAndNavigate()
   * - Si NO logueado → no hace nada (authGuard manejará con returnUrl)
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

      // Solo navegar si usuario logueado (si NO → authGuard maneja)
      if (!this.auth.isLoggedIn) {
        console.log('[DeepLink] Usuario NO logueado, authGuard manejará con returnUrl');
        return;
      }

      console.log('[DeepLink] Hash cambió mid-session:', hash);
      this.deepLinkService.translateAndNavigate(hash).catch((err) => {
        console.error('[DeepLink] Error navegando:', err);
      });
    };

    window.addEventListener('hashchange', this.hashChangeHandler);
  }
}
