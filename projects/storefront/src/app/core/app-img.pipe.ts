import { Pipe, PipeTransform } from '@angular/core';

/**
 * Resuelve `app://producto-images/<file>` (que viene del menú) a la URL pública
 * `<base>/pub/producto-image/<file>` que sirve el server. Cualquier otra URL se
 * devuelve tal cual. Null si no hay imagen.
 */
@Pipe({ name: 'appImg', standalone: true })
export class AppImgPipe implements PipeTransform {
  transform(url: string | null | undefined): string | null {
    if (!url) return null;
    const base = localStorage.getItem('frc_storefront_server_url') || '';
    const prefix = 'app://producto-images/';
    if (url.startsWith(prefix)) {
      return `${base}/pub/producto-image/${url.slice(prefix.length)}`;
    }
    if (url.startsWith('app://')) return null; // otros protocolos app:// no se sirven público
    return url;
  }
}
