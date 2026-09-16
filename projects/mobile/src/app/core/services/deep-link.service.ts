import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { PermissionService } from '@frc/shared-core';
import { firstValueFrom, timeout, of } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface DeepLinkParsed {
  tipo: 'compra' | 'gasto' | 'vale' | 'pago';
  id: number;
}

/**
 * Servicio de deep links para mobile PWA.
 * 
 * Traduce URLs de WhatsApp con hash (#/o/{tipo}/{id}) a rutas path de Angular (/o/{tipo}/{id}).
 * Mobile usa path routing (NO useHash), pero el contrato externo (bot de WhatsApp) usa hash
 * para compatibilidad con desktop.
 * 
 * Flujo:
 * 1. Usuario toca link https://app.frc-gourmet.com/#/o/compra/123
 * 2. AppInitializer/hashchange listener detecta el hash
 * 3. parseDeepLink() extrae tipo + id
 * 4. translateAndNavigate() convierte a ruta path: /o/compra/123
 * 5. Angular Router navega (authGuard + permisoGuard aplican automáticamente)
 */
@Injectable({
  providedIn: 'root',
})
export class DeepLinkService {
  private readonly router = inject(Router);
  private readonly permission = inject(PermissionService);

  /**
   * Parsea un deep link desde hash o URL completa.
   * 
   * Formatos válidos:
   * - #/o/compra/123
   * - /o/compra/123
   * - https://app.frc-gourmet.com/#/o/compra/123
   * 
   * @param url Hash, path o URL completa
   * @returns Objeto parseado o null si formato inválido
   */
  parseDeepLink(url: string): DeepLinkParsed | null {
    if (!url) return null;

    // Extraer el hash si es URL completa
    let hashOrPath = url;
    if (url.includes('#')) {
      const hashIndex = url.indexOf('#');
      hashOrPath = url.substring(hashIndex);
    }

    // Remover el # si está presente
    const path = hashOrPath.startsWith('#') ? hashOrPath.substring(1) : hashOrPath;

    // Patrón: /o/{tipo}/{id}
    const match = path.match(/^\/o\/(compra|gasto|vale|pago)\/(\d+)$/);
    if (!match) return null;

    const tipo = match[1] as DeepLinkParsed['tipo'];
    const id = parseInt(match[2], 10);

    // Validar ID positivo
    if (id <= 0) return null;

    return { tipo, id };
  }

  /**
   * Traduce hash de deep link a ruta path y navega.
   * 
   * Mobile usa path routing (NO hash), pero el contrato externo usa hash.
   * Este método hace la traducción:
   * - #/o/compra/123 → navega a /compras/lista/123 (ruta real ya con guards)
   * - #/o/gasto/456 → navega a /o/gasto/456 (ruta con loadComponent)
   * - #/o/vale/789 → navega a /o/vale/789 (ruta con loadComponent)
   * - #/o/pago/111 → navega a /o/pago/111 (ruta con loadComponent)
   * 
   * P0 FIX (2026-09-15): compra mapea directo a /compras/lista/:id (ruta existente),
   * NO a /o/compra/:id (redirectTo + canActivate = NG04014).
   * 
   * El Router maneja automáticamente:
   * - authGuard (redirige a login con returnUrl si sin sesión)
   * - permisoGuard (valida permiso de la ruta)
   * - lazy loading de componentes
   * 
   * P0 FIX (2026-09-16): espera a que los permisos estén cargados antes de navegar,
   * para evitar que permisoGuard rechace por permisos vacíos (especialmente en admin seed).
   * 
   * @param url Hash o URL completa con deep link
   * @returns Promise de navegación (resolve true/false)
   */
  async translateAndNavigate(url: string): Promise<boolean> {
    const parsed = this.parseDeepLink(url);
    if (!parsed) {
      console.warn('[DeepLink] Formato inválido, no se navega:', url);
      return false;
    }

    // P0 FIX: esperar a que los permisos estén cargados (max 3s)
    // Evita rechazo prematuro cuando permisoGuard evalúa con codigos$ vacío
    try {
      const currentPerms = await firstValueFrom(this.permission.codigos$);
      const permCount = currentPerms.size;
      if (permCount === 0) {
        console.log('[DeepLink] Esperando carga de permisos antes de navegar...');
        const loadedPerms = await firstValueFrom(
          this.permission.codigos$.pipe(
            filter(set => set.size > 0),
            timeout({ first: 3000, with: () => of(new Set<string>()) })
          )
        );
        console.log('[DeepLink] Permisos cargados:', loadedPerms.size);
      } else {
        console.log('[DeepLink] Permisos ya disponibles:', permCount);
      }
    } catch (err) {
      console.warn('[DeepLink] Timeout esperando permisos, navegando de todos modos:', err);
    }

    // P0 FIX: compra → ruta real /compras/lista/:id (ya tiene guards)
    // Otros tipos → rutas /o/{tipo}/:id (loadComponent + guards)
    const rutaPath = parsed.tipo === 'compra'
      ? `/compras/lista/${parsed.id}`
      : `/o/${parsed.tipo}/${parsed.id}`;

    console.log('[DeepLink] Navegando a:', rutaPath);

    // Navegar (Router aplica guards automáticamente)
    const result = await this.router.navigateByUrl(rutaPath);
    
    console.log('[DeepLink] Resultado de navegación:', result ? 'ÉXITO' : 'FALLO (guard/redirect)');
    
    return result;
  }
}
