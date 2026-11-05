/**
 * Geometría de las zonas de delivery, sin Leaflet (se testea en Node).
 *
 * Una zona es UN precio (su tarifa del PdV) y puede valer en varias áreas: se
 * guarda como `Polygon` con un área y como `MultiPolygon` con varias. El servidor
 * ya resuelve los dos (`geo.utils.ts`). Los huecos (anillos interiores) no se
 * dibujan ni se editan acá: el diseñador trabaja con el contorno de cada área.
 */

/** [lat, lng], como los usa Leaflet. GeoJSON va al revés: [lng, lat]. */
export type ParLatLng = [number, number];

const valido = (c: any): boolean => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]);

/** Contorno de un anillo GeoJSON → [lat,lng] sin el punto de cierre repetido. */
function anilloALatLng(anillo: any): ParLatLng[] {
  if (!Array.isArray(anillo)) return [];
  const pts = anillo.filter(valido).map((c: number[]) => [c[1], c[0]] as ParLatLng);
  if (pts.length > 1) {
    const [a, b] = [pts[0], pts[pts.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) pts.pop();
  }
  return pts;
}

/** Todas las áreas de la zona (contorno de cada polígono). Texto inválido → []. */
export function parsearAreas(geojson?: string | null): ParLatLng[][] {
  if (!geojson) return [];
  let g: any;
  try { g = JSON.parse(geojson); } catch { return []; }
  const geo = g?.type === 'Feature' ? g.geometry : g;
  if (geo?.type === 'Polygon') {
    const a = anilloALatLng(geo.coordinates?.[0]);
    return a.length ? [a] : [];
  }
  if (geo?.type === 'MultiPolygon' && Array.isArray(geo.coordinates)) {
    return geo.coordinates.map((p: any) => anilloALatLng(p?.[0])).filter((a: ParLatLng[]) => a.length > 0);
  }
  return [];
}

/**
 * Áreas → GeoJSON en texto. Un área → `Polygon` (como siempre); varias →
 * `MultiPolygon`. Cada anillo se cierra repitiendo el primer punto. Áreas con
 * menos de 3 puntos no son un área: quien llama decide si las bloquea.
 */
export function serializarAreas(areas: ParLatLng[][]): string | null {
  const anillos = areas
    .filter((a) => a.length >= 3)
    .map((a) => {
      const r = a.map(([lat, lng]) => [lng, lat]);
      r.push([a[0][1], a[0][0]]);
      return r;
    });
  if (!anillos.length) return null;
  if (anillos.length === 1) return JSON.stringify({ type: 'Polygon', coordinates: [anillos[0]] });
  return JSON.stringify({ type: 'MultiPolygon', coordinates: anillos.map((r) => [r]) });
}

export interface PuntoPlano { x: number; y: number; }

/** Distancia al cuadrado de `p` al segmento a–b (en píxeles de pantalla). */
function dist2Segmento(p: PuntoPlano, a: PuntoPlano, b: PuntoPlano): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return (p.x - cx) ** 2 + (p.y - cy) ** 2;
}

/**
 * Clic sobre el borde de un área: en qué posición del anillo va el punto nuevo.
 * El anillo es cerrado (el último lado une el último punto con el primero), así
 * que un clic sobre ese lado devuelve `anillo.length` (va al final).
 */
export function indiceParaInsertar(anillo: PuntoPlano[], p: PuntoPlano): number {
  if (anillo.length < 2) return anillo.length;
  let mejor = 0, dMejor = Infinity;
  for (let i = 0; i < anillo.length; i++) {
    const a = anillo[i], b = anillo[(i + 1) % anillo.length];
    const d = dist2Segmento(p, a, b);
    if (d < dMejor) { dMejor = d; mejor = i; }
  }
  return mejor + 1;
}
