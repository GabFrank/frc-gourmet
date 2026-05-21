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
  if (auth.isLoggedIn) return true;
  return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};
