import { Pipe, PipeTransform } from '@angular/core';
import { resolveAppUrl } from '../utils/image-url.util';

/**
 * Resuelve URLs `app://...` segun el modo:
 * - standalone/server: devuelve la URL original (Electron resuelve el protocolo).
 * - client: devuelve `${SERVER_URL}/api/files/by-url?url=...&token=...` para
 *   que el `<img>` pueda cargar el binario del server via HTTP.
 *
 * Uso:
 *   <img [src]="producto.imageUrl | appUrl" />
 *
 * Impure porque el accessToken puede cambiar (login/refresh). El costo es bajo
 * — solo se aplica a strings y los componentes con imagenes son pocos.
 */
@Pipe({
  name: 'appUrl',
  standalone: true,
  pure: false,
})
export class AppUrlPipe implements PipeTransform {
  transform(value: string | null | undefined): string | undefined {
    return resolveAppUrl(value);
  }
}
