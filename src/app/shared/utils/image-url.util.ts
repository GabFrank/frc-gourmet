/**
 * Helpers para inferir URLs de las derivadas (thumb 96px, medium 400px) a partir
 * de la URL del original, sin almacenar campos extra en la BD.
 *
 * Convención: el backend (`files.handler.ts` + `image-resize.utils.ts`) genera
 * `<base>.thumb.jpg` y `<base>.medium.jpg` junto al original. Estos helpers
 * solo computan la URL — no garantizan que el archivo exista (imágenes legacy
 * cargadas antes del refactor no las tienen).
 *
 * En componentes con `<img>`, manejar `(error)` para fallback al original.
 */

export function thumbUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return resolveAppUrl(url.replace(/(\.[^./]+)$/, '.thumb.jpg'));
}

export function mediumUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return resolveAppUrl(url.replace(/(\.[^./]+)$/, '.medium.jpg'));
}

/**
 * F4 image URL switch.
 *
 * En modo standalone/server las URLs `app://carpeta/file.jpg` las resuelve
 * Electron via `protocol.registerFileProtocol`. En modo cliente el renderer
 * no tiene esos archivos locales — necesita ir al server via
 * `GET /api/files/by-url?url=<encoded>&token=<jwt>`.
 *
 * Devuelve la URL "renderizable" desde un `<img src>`. Si la url no es app://
 * o no estamos en cliente, devuelve la original.
 *
 * @param url valor crudo (ej. `app://producto-images/abc.jpg` o `/assets/...`).
 */
export function resolveAppUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (!url.startsWith('app://')) return url;
  const api: any = (typeof window !== 'undefined' ? (window as any).api : null);
  if (!api) return url;
  const mode = api.getAppMode ? api.getAppMode() : 'standalone';
  if (mode !== 'client') return url;
  const serverUrl: string | null = api.getServerUrl ? api.getServerUrl() : null;
  const token: string | null = api.getAccessToken ? api.getAccessToken() : null;
  if (!serverUrl) return url; // no podemos proxear, dejar que el <img> falle
  const qs = `url=${encodeURIComponent(url)}` + (token ? `&token=${encodeURIComponent(token)}` : '');
  return `${serverUrl.replace(/\/$/, '')}/api/files/by-url?${qs}`;
}
