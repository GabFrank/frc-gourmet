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
  return url.replace(/(\.[^./]+)$/, '.thumb.jpg');
}

export function mediumUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return url.replace(/(\.[^./]+)$/, '.medium.jpg');
}
