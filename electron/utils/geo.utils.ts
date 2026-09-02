/**
 * Geometría mínima para resolver en qué zona de delivery cae un punto.
 *
 * Sin dependencias y sin PostGIS a propósito: el esquema tiene que funcionar
 * igual en SQLite y en Postgres, así que el polígono se guarda como GeoJSON en
 * texto y el cálculo corre acá. Para el puñado de zonas de un local, un ray
 * casting sobre unos pocos vértices es instantáneo.
 */

/** Punto `[lng, lat]`, el orden de GeoJSON (¡no `[lat, lng]`!). */
export type PuntoGeoJson = [number, number];

export interface ZonaConPoligono {
  id: number;
  /** Menor gana cuando dos polígonos se superponen. */
  orden?: number | null;
  /** GeoJSON en texto: un `Polygon` o un `MultiPolygon`. */
  poligono?: string | null;
}

/**
 * Ray casting sobre un anillo. El punto se considera dentro si un rayo
 * horizontal hacia la derecha cruza los lados un número impar de veces.
 *
 * Un punto exactamente sobre el borde puede caer de cualquier lado según el
 * redondeo; no vale la pena resolverlo: a la escala de una zona de reparto la
 * ambigüedad es de centímetros.
 */
function puntoEnAnillo(lng: number, lat: number, anillo: PuntoGeoJson[]): boolean {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    const cruza = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

/**
 * ¿El punto cae dentro de la geometría? Soporta `Polygon` y `MultiPolygon`, y
 * respeta los agujeros: el primer anillo es el contorno y el resto son huecos.
 */
export function puntoEnGeometria(lat: number, lng: number, geojson: unknown): boolean {
  let geo: any = geojson;
  if (typeof geo === 'string') {
    try { geo = JSON.parse(geo); } catch { return false; }
  }
  if (!geo || typeof geo !== 'object') return false;

  // Tolera tanto la geometría suelta como un Feature que la envuelve.
  const g = geo.type === 'Feature' ? geo.geometry : geo;
  if (!g || !Array.isArray(g.coordinates)) return false;

  const enPoligono = (anillos: PuntoGeoJson[][]): boolean => {
    if (!anillos.length || !Array.isArray(anillos[0])) return false;
    if (!puntoEnAnillo(lng, lat, anillos[0])) return false;
    // Dentro del contorno, pero puede estar en un agujero.
    for (let i = 1; i < anillos.length; i++) {
      if (puntoEnAnillo(lng, lat, anillos[i])) return false;
    }
    return true;
  };

  if (g.type === 'Polygon') return enPoligono(g.coordinates as PuntoGeoJson[][]);
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as PuntoGeoJson[][][]).some((p) => enPoligono(p));
  }
  return false;
}

/**
 * Primera zona cuyo polígono contiene el punto. Cuando dos zonas se superponen
 * gana la de menor `orden` — determinístico a propósito, para que el mismo
 * domicilio cotice siempre igual. Devuelve `null` si el punto queda fuera de
 * toda cobertura, que es un resultado legítimo y no un error.
 */
export function resolverZonaPorPunto<T extends ZonaConPoligono>(
  lat: number,
  lng: number,
  zonas: T[],
): T | null {
  const candidatas = zonas
    .filter((z) => !!z.poligono)
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0) || a.id - b.id);
  for (const zona of candidatas) {
    if (puntoEnGeometria(lat, lng, zona.poligono)) return zona;
  }
  return null;
}
