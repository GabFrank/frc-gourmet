import { Pipe, PipeTransform } from '@angular/core';

/**
 * Resuelve una URL de imagen del backend (`app://producto-images/x.jpg`, etc.)
 * a una URL HTTP cargable por `<img src>`, vía `GET /api/files/by-url?url=...&token=...`
 * (el token va por query porque `<img>` no manda headers). Si la URL ya es http(s)/
 * data/blob se devuelve tal cual; si es vacía devuelve null.
 *
 * El server base y el access token salen del shim (`window.api`).
 */
@Pipe({ name: 'appImage', standalone: true })
export class AppImagePipe implements PipeTransform {
  transform(url: string | null | undefined): string | null {
    if (!url) return null;
    if (/^(https?:|data:|blob:)/.test(url)) return url;
    const api = (window as unknown as { api?: { getServerUrl?: () => string | null; getAccessToken?: () => string | null } }).api;
    const base = (api?.getServerUrl?.() || '').replace(/\/$/, '');
    const token = api?.getAccessToken?.() || '';
    return `${base}/api/files/by-url?url=${encodeURIComponent(url)}&token=${encodeURIComponent(token)}`;
  }
}
