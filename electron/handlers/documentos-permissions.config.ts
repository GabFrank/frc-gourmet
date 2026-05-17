/**
 * Mapa centralizado de permisos por handler/dominio para el sistema de
 * documentos (PDFs, tickets, adjuntos).
 *
 * Tres usos:
 *
 * 1. **`PERMISO_ADJUNTAR_POR_TIPO`** — al crear/borrar un adjunto a una
 *    entidad polimórfica, además del permiso global `DOCUMENTOS_ADJUNTAR` se
 *    valida que el usuario tenga el permiso del DOMINIO de la entidad
 *    (ej. para adjuntar a un VALE necesita `RRHH_VALE_CREAR`).
 *
 * 2. **`PERMISO_POR_HANDLER`** — para los handlers `export-*-pdf` y `print-*`
 *    se mappea el nombre del handler → permiso del dominio. Usado por
 *    helpers `ensurePermissionForDocumentoHandler` (no implementado aún —
 *    cada handler usa `ensurePermission` directo con su permiso conocido).
 *
 * Mantener este archivo como la única fuente de verdad. Si agregás un
 * dominio nuevo de adjuntos, actualizá aquí en vez de hardcodear el permiso
 * en el handler.
 */

/**
 * Para cada `entidadTipo` de Adjunto, el permiso del dominio que ADEMÁS de
 * `DOCUMENTOS_ADJUNTAR` se exige al crear/borrar un adjunto. Si no está en
 * el mapa, se usa solo el permiso global.
 *
 * Convención: usar `string | string[]` — array = OR de permisos.
 */
export const PERMISO_ADJUNTAR_POR_TIPO: Record<string, string | string[]> = {
  // Financiero
  'GASTO': 'CAJA_MAYOR_OPERAR',
  'CPP': 'CAJA_MAYOR_OPERAR',
  'CPP_CUOTA': 'CAJA_MAYOR_OPERAR',
  'CPC': 'CPC_GESTIONAR',
  'CPC_CUOTA': ['CPC_GESTIONAR', 'CPC_COBRAR'],
  'CHEQUE': 'BANCOS_GESTIONAR',
  'RETIRO_CAJA': 'CAJA_MAYOR_OPERAR',
  'ENTRADA_VARIA': 'CAJA_MAYOR_OPERAR',
  'OPERACION_FINANCIERA': 'CAJA_MAYOR_OPERAR',
  'MOVIMIENTO_BANCARIO': 'BANCOS_GESTIONAR',
  'ACREDITACION_POS': 'BANCOS_GESTIONAR',

  // Compras
  'COMPRA': 'COMPRAS_GESTIONAR',

  // Ventas
  'VENTA': 'VENTAS_HISTORICO_VER',

  // RRHH
  'VALE': ['RRHH_VALE_CREAR', 'RRHH_VALE_CONFIRMAR'],
  'PRESTAMO_FUNCIONARIO': 'RRHH_PRESTAMO_OTORGAR',
  'LIQUIDACION_SUELDO': ['RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR'],
  'LIQUIDACION_FINAL': 'RRHH_LIQUIDACION_FINAL_GENERAR',
  'ASISTENCIA': 'RRHH_ASISTENCIA_JUSTIFICAR',
};

/**
 * Devuelve los permisos del dominio para un `entidadTipo`, o `null` si no
 * está mappeado (se usará solo el permiso global).
 */
export function getPermisoAdjuntarPorTipo(entidadTipo: string): string | string[] | null {
  return PERMISO_ADJUNTAR_POR_TIPO[entidadTipo.toUpperCase()] ?? null;
}
