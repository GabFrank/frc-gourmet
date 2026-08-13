import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@frc/shared-core';

/**
 * Protege rutas que requieren sesión. Sin sesión → redirige a /login con returnUrl.
 * La autorización fina (permisos) la valida el server en cada RPC (P0).
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  // Cambio de contraseña temporal obligatorio: si el usuario tiene el flag,
  // no puede navegar a ninguna otra ruta hasta cambiarla (bloquea deep-links).
  if (auth.currentUser?.mustChangePassword && !state.url.startsWith('/cambiar-password')) {
    return router.createUrlTree(['/cambiar-password']);
  }
  return true;
};
