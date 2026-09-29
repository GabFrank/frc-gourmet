import { SelectQueryBuilder } from 'typeorm';

/**
 * Recorte de los `Usuario` que viajan en las respuestas de lectura.
 *
 * Por qué existe: hidratar un `Usuario` con `leftJoinAndSelect` publica la
 * entidad ENTERA, y eso incluye su `Persona` con documento, teléfono,
 * dirección, email y fecha de nacimiento. `/api/rpc` es default-allow, así que
 * cualquier cliente con un JWT válido leía los datos personales del cajero al
 * pedir la lista de cajas. (El hash de la contraseña ya no viaja por ningún
 * lado: `Usuario.password` es `select: false` desde este mismo PR — eso es el
 * fix de raíz, esto es el recorte de la otra mitad del problema.)
 *
 * Qué necesita la UI de un usuario, verificado contra los templates que muestran
 * al cajero (`seleccionar-caja-dialog`, `list-cajas`, `list-caja-dialog`,
 * `resumen-caja-dialog`, `list-retiros-caja`, `registrar-ingreso-dialog`,
 * historial de ventas, y sus equivalentes de la PWA): el nombre y el apellido de
 * la persona, con el `nickname` como fallback. Nada más. Los `id` van porque sin
 * la PK TypeORM no arma el objeto de la relación (queda `null` y el `?.` del
 * template muestra el fallback para todos).
 *
 * Es el mismo patrón que `getVentasByDateRange` ya aplicaba al repartidor
 * (`ventas.handler.ts`, lección de la sesión 2026-08-28): `leftJoin` +
 * `addSelect` de columnas sueltas, nunca `leftJoinAndSelect`.
 */

/** Columnas públicas del `Usuario` (sin el alias). */
export const COLUMNAS_USUARIO_PUBLICO = ['id', 'nickname'] as const;

/** Columnas públicas de su `Persona` (sin el alias). */
export const COLUMNAS_PERSONA_PUBLICA = ['id', 'nombre', 'apellido'] as const;

/**
 * Agrega al QueryBuilder la relación a un `Usuario` recortada a lo que la UI
 * muestra: `id`, `nickname` y `persona.{id,nombre,apellido}`.
 *
 * @param qb            builder al que se le cuelga el join
 * @param relacionPath  ruta de la relación, p. ej. `'caja.createdBy'`
 * @param alias         alias del usuario, p. ej. `'cajaCreatedBy'`
 * @param personaAlias  alias de su persona; por defecto `<alias>Persona`
 *
 * Devuelve el mismo `qb` para poder encadenar.
 */
export function selectUsuarioPublico<T>(
  qb: SelectQueryBuilder<T>,
  relacionPath: string,
  alias: string,
  personaAlias?: string,
): SelectQueryBuilder<T> {
  const aliasPersona = personaAlias || `${alias}Persona`;
  return qb
    .leftJoin(relacionPath, alias)
    .addSelect(COLUMNAS_USUARIO_PUBLICO.map((c) => `${alias}.${c}`))
    .leftJoin(`${alias}.persona`, aliasPersona)
    .addSelect(COLUMNAS_PERSONA_PUBLICA.map((c) => `${aliasPersona}.${c}`));
}
