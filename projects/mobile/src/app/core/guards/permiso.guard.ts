import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { of } from 'rxjs';
import { filter, map, take, timeout, catchError } from 'rxjs/operators';
import { PermissionService } from '@frc/shared-core';

/**
 * Guard de autorización fina para la PWA: exige que el usuario tenga al menos
 * UNO de los permisos declarados en `route.data.permiso` (string | string[]).
 * Si falta, redirige a /home (deep-link bloqueado). La sesión ya la valida
 * `authGuard`; este agrega la capa de permisos (antes inexistente en mobile).
 *
 * La defensa REAL sigue siendo el `ensurePermission` del backend en cada RPC;
 * este guard es UX + defensa en profundidad contra deep-links.
 */
export const permisoGuard: CanActivateFn = (route, state) => {
  const permission = inject(PermissionService);
  const router = inject(Router);

  const required = route.data?.['permiso'] as string | string[] | undefined;
  if (!required) return true;
  const codes = (Array.isArray(required) ? required : [required]).map((c) => c.toUpperCase());

  const decide = () => {
    const ok = codes.some((c) => permission.has(c));
    return ok ? true : router.createUrlTree(['/home'], { queryParams: { sinPermiso: state.url } });
  };

  // Si ya está permitido, resolver sincrónico.
  if (codes.some((c) => permission.has(c))) return true;

  // Si no, esperar a que carguen los permisos del usuario (primera emisión con
  // datos) y reevaluar. Timeout de respaldo por si el set queda vacío.
  return permission.codigos$.pipe(
    filter((set) => set.size > 0),
    take(1),
    timeout({ first: 5000, with: () => of(new Set<string>()) }),
    map(() => decide()),
    catchError(() => of(decide())),
  );
};
