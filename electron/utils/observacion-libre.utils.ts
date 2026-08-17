/**
 * Nota libre de un ítem de venta.
 *
 * `VentaItemObservacion.observacion` es una FK **obligatoria** (la columna es
 * NOT NULL en las dos baselines), así que una nota escrita a mano no puede
 * guardarse "sin observación": necesita colgarse de una `Observacion` del
 * catálogo. Para eso existe el sentinel `NOTA DEL CLIENTE`, y el texto real va
 * en `VentaItemObservacion.observacionLibre`.
 *
 * Antes esto vivía suelto dentro de la materialización de pedidos online, y el
 * PdV desktop intentaba guardar la nota de otras dos formas — colgándola de la
 * primera observación seleccionada (la duplicaba en la comanda) o con
 * `observacion: null` (violaba el NOT NULL y la nota se perdía en silencio).
 * Este helper es la única forma soportada.
 */
import type { DataSource } from 'typeorm';
import { Observacion } from '../../src/app/database/entities/productos/observacion.entity';

/** Descripción del sentinel. `Observacion.descripcion` es unique. */
export const OBSERVACION_NOTA_LIBRE_DESC = 'NOTA DEL CLIENTE';

/**
 * Devuelve el id de la `Observacion` sentinel, creándola si no existe.
 *
 * No cachea el id a nivel de módulo a propósito: un restore de backup o un
 * reset de BD lo dejaría apuntando a una fila que ya no existe. Es un lookup
 * por columna unique y sólo corre cuando el ítem trae nota libre.
 *
 * Tolera la colisión de unique (dos ítems guardando nota a la vez): si el
 * `save` falla, re-consulta.
 */
export async function ensureObservacionNotaLibreId(dataSource: DataSource): Promise<number> {
  const repo = dataSource.getRepository(Observacion);
  let obs = await repo.findOne({ where: { descripcion: OBSERVACION_NOTA_LIBRE_DESC } });
  if (!obs) {
    try {
      obs = await repo.save(repo.create({ descripcion: OBSERVACION_NOTA_LIBRE_DESC, activo: true }));
    } catch {
      obs = await repo.findOne({ where: { descripcion: OBSERVACION_NOTA_LIBRE_DESC } });
    }
  }
  if (!obs) throw new Error('no_se_pudo_asegurar_observacion_sentinel');
  return obs.id;
}
