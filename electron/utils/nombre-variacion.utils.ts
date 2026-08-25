/**
 * Nombre de una variación (`producto + tamaño + sabor`), compuesto EN VIVO.
 *
 * ¿Por qué no usar `RecetaPresentacion.nombre_generado`, que ya guarda esto?
 * Porque es un snapshot que se toma al crear la variación y **nadie lo
 * recalcula**: ni `update-sabor` ni `update-producto` lo tocan. En el catálogo
 * real de producción, 8 de 61 variaciones tenían el nombre podrido —
 * «PICADA DE LA CASA GRANDE TRADICIONAL» cuando el producto ya se llamaba
 * «PICADA DON FRANCO», o «PIZZA GRANDE PIZZA» cuando el sabor ya era
 * «PEPPERONI»—. Imprimir eso en el ticket del cliente es mostrarle nombres que
 * no existen.
 *
 * El campo se sigue manteniendo (ver `recalcularNombresDeVariacion`) porque lo
 * consumen pantallas de gestión, pero para cualquier cosa que vea el cliente se
 * compone acá.
 *
 * `mostrarEnNombre` permite apagar una parte que no aporta: presentaciones de
 * relleno llamadas «TRADICIONAL» (el nombre es obligatorio y alguien tiene que
 * poner algo) y sabores únicos que no distinguen nada.
 */
import { DataSource } from 'typeorm';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';

export interface PartesVariacion {
  producto?: { nombre?: string | null } | null;
  presentacion?: { nombre?: string | null; mostrarEnNombre?: boolean } | null;
  sabor?: { nombre?: string | null; mostrarEnNombre?: boolean } | null;
}

/** Une las partes visibles, en orden, ya en UPPERCASE. */
export function componerNombreVariacion(partes: PartesVariacion): string {
  const trozos: string[] = [];
  const push = (v?: string | null) => {
    const s = String(v ?? '').trim();
    if (s) trozos.push(s.toUpperCase());
  };

  push(partes.producto?.nombre);
  if (partes.presentacion && partes.presentacion.mostrarEnNombre !== false) {
    push(partes.presentacion.nombre);
  }
  if (partes.sabor && partes.sabor.mostrarEnNombre !== false) {
    push(partes.sabor.nombre);
  }
  return trozos.join(' ');
}

export interface SaborDeItem {
  nombre: string;
  /** Fracción del ítem que ocupa este sabor (0.5 = mitad). */
  proporcion: number;
}

/**
 * Línea de variación de un ítem vendido: el tamaño y, si hay más de un sabor,
 * cada mitad con su fracción.
 *
 * Con un solo sabor devuelve `GRANDE · CALABRESA`; con dos,
 * `GRANDE · 1/2 CALABRESA + 1/2 BACON`. Devuelve `''` si no hay nada que
 * mostrar, y el llamador omite la línea.
 *
 * Las fracciones sólo aparecen cuando hay más de un sabor: escribir «1/1» en un
 * ítem de un solo sabor confunde más de lo que informa.
 */
export function componerDetalleVariacion(
  presentacionNombre: string | null | undefined,
  sabores: SaborDeItem[],
  opts: { mostrarPresentacion?: boolean } = {},
): string {
  const partes: string[] = [];
  const pres = String(presentacionNombre ?? '').trim().toUpperCase();
  if (pres && opts.mostrarPresentacion !== false) partes.push(pres);

  const conNombre = (sabores || []).filter((s) => String(s?.nombre ?? '').trim());
  if (conNombre.length === 1) {
    partes.push(conNombre[0].nombre.toUpperCase());
  } else if (conNombre.length > 1) {
    // Si todas las proporciones son iguales se muestra 1/n, que es como lo
    // piensa el que atiende ("mitad y mitad"), en vez de 50%.
    const primera = conNombre[0].proporcion;
    const iguales = conNombre.every((s) => Math.abs((s.proporcion || 0) - (primera || 0)) < 0.001);
    const n = conNombre.length;
    partes.push(
      conNombre
        .map((s) => {
          const frac = iguales ? `1/${n}` : `${Math.round((s.proporcion || 0) * 100)}%`;
          return `${frac} ${s.nombre.toUpperCase()}`;
        })
        .join(' + '),
    );
  }

  return partes.join(' · ');
}

// ============================================================
// Mantenimiento de `RecetaPresentacion.nombre_generado`
// ============================================================

/**
 * Recalcula el `nombre_generado` de las variaciones afectadas por un renombre.
 *
 * Ese campo se escribía UNA sola vez, al crear la variación, y ni `update-sabor`
 * ni `update-producto` ni `update-presentacion` lo tocaban. Resultado: al
 * renombrar cualquiera de las tres partes, el nombre guardado quedaba
 * describiendo algo que ya no existe — y se sigue viendo en las pantallas de
 * gestión, que son las que leen este campo.
 *
 * Se llama después de guardar el renombre, con el id de lo que cambió. No es
 * transaccional a propósito: si falla, el renombre igual vale y lo peor que
 * pasa es que el nombre derivado quede como estaba, que es exactamente el
 * comportamiento anterior.
 */
export async function recalcularNombresDeVariacion(
  dataSource: DataSource,
  filtro: { saborId?: number; presentacionId?: number; productoId?: number },
): Promise<number> {
  const repo = dataSource.getRepository(RecetaPresentacion);
  const qb = repo.createQueryBuilder('rp')
    .leftJoinAndSelect('rp.presentacion', 'presentacion')
    .leftJoinAndSelect('presentacion.producto', 'producto')
    .leftJoinAndSelect('rp.sabor', 'sabor');

  if (filtro.saborId) qb.andWhere('rp.sabor_id = :s', { s: filtro.saborId });
  else if (filtro.presentacionId) qb.andWhere('rp.presentacion_id = :p', { p: filtro.presentacionId });
  else if (filtro.productoId) qb.andWhere('presentacion.producto_id = :pr', { pr: filtro.productoId });
  else return 0;

  const variaciones = await qb.getMany();
  let actualizadas = 0;
  for (const rp of variaciones) {
    const nombre = componerNombreVariacion({
      producto: (rp as any).presentacion?.producto,
      presentacion: (rp as any).presentacion,
      sabor: (rp as any).sabor,
    });
    if (nombre && nombre !== rp.nombre_generado) {
      await repo.update(rp.id, { nombre_generado: nombre });
      actualizadas++;
    }
  }
  return actualizadas;
}
