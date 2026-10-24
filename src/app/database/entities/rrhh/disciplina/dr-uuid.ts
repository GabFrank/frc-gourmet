/**
 * UUID v4 aleatorio para las tablas de votación (dr_participacion,
 * dr_voto_agregado, dr_respuesta_texto): ids no secuenciales para no delatar el
 * orden de llegada de los votos. Se genera en código (no en la base) para que
 * sea igual en SQLite y Postgres sin depender de extensiones.
 */
export function drNuevoUuid(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback (Node sin webcrypto global): require diferido para no romper el bundle Angular.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('crypto').randomUUID();
}
