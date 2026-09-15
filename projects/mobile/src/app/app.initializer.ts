import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { DeepLinkService } from './core/services/deep-link.service';
import { AuthService } from '@frc/shared-core';

/**
 * APP_INITIALIZER para procesar deep links en cold start.
 * 
 * P0 FIX (2026-09-15): inject() DEBE estar en el cuerpo de la factory,
 * NO dentro del callback async (NG0203: inject must be called from injection context).
 * 
 * P1 OBLIGATORIO (Gabriel): mitigar race Home flash.
 * 
 * Problema: si el usuario abre #/o/compra/1 sin sesión, authGuard redirige a
 * /login?returnUrl=/o/compra/1, pero AppComponent.ngOnInit() podría procesar el hash
 * ANTES de que authGuard se ejecute → flash de Home → navegación incorrecta.
 * 
 * Solución: APP_INITIALIZER se ejecuta ANTES del bootstrap del AppComponent.
 * - Lee el hash inicial si existe y es deep link.
 * - Si usuario ya logueado → navega inmediatamente (sin race).
 * - Si usuario NO logueado → no hace nada (authGuard se encargará con returnUrl).
 * 
 * Sin dummy navigation a '/' — el router ya está inicializado por Angular,
 * y translateAndNavigate navega directo al deep link (sin flash Home).
 */
export function initializeDeepLinks(): () => Promise<void> {
  // P0 FIX: inject() aquí (en el cuerpo de la factory), NO dentro del async callback
  const router = inject(Router);
  const deepLinkService = inject(DeepLinkService);
  const authService = inject(AuthService);

  return async () => {
    // Leer hash inicial (si existe)
    const initialHash = window.location.hash;

    // Solo procesar si es deep link (#/o/...)
    if (!initialHash || !initialHash.startsWith('#/o/')) {
      return;
    }

    console.log('[AppInitializer] Deep link detectado en cold start:', initialHash);

    // Si usuario ya logueado → navegar inmediatamente
    // Si NO logueado → dejar que authGuard maneje con returnUrl
    if (authService.isLoggedIn) {
      console.log('[AppInitializer] Usuario logueado, navegando a deep link');
      
      // P0 FIX: sin dummy navigation — router ya ready, evita flash Home
      await deepLinkService.translateAndNavigate(initialHash);
    } else {
      console.log('[AppInitializer] Usuario NO logueado, authGuard manejará con returnUrl');
      // authGuard interceptará la navegación y añadirá returnUrl automáticamente
    }
  };
}
