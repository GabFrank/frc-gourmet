import { DataSource, In } from 'typeorm';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { RecetaIngredienteIntercambiable } from '../../src/app/database/entities/productos/receta-ingrediente-intercambiable.entity';
import { RecetaAdicionalVinculacion } from '../../src/app/database/entities/productos/receta-adicional-vinculacion.entity';

/**
 * Tienda F6b (docs/planes/PLAN-tienda-pizza-personalizar-sabor.md): personalización de CADA sabor
 * de la pizza, igual que el PdV (`seleccionar-variacion-dialog` + `personalizar-producto-dialog`):
 * sacar ingredientes opcionales, cambiar los cambiables y sumar adicionales, todo sobre la receta
 * de ese sabor × tamaño. Nada se confía al cliente: ids, pertenencia y precios salen del catálogo.
 */

export const MAX_POR_LISTA = 20;

export class PersonalizacionInvalidaError extends Error {
  constructor(motivo: string) {
    super(`personalizacion_invalida:${motivo}`);
    this.name = 'PersonalizacionInvalidaError';
  }
}

/** Sabor ya resuelto por `resolveOpcion` (con la receta de su sabor × tamaño). */
export interface SaborResuelto {
  saborId: number;
  nombre: string;
  proporcion: number;
  recetaId?: number | null;
}

export interface PersonalizacionSaborSnap {
  quitados: { id: number; nombre: string }[];
  cambios: { id: number; nombre: string; reemplazoId: number; reemplazoNombre: string }[];
  adicionales: { id: number; nombre: string; precio: number }[];
}

export interface PersonalizacionResuelta {
  /** Σ por sabor de (precio del adicional × proporción), como `addVariacionItem` del PdV. */
  total: number;
  porSabor: Map<number, PersonalizacionSaborSnap>;
}

function idsEnteros(v: any, campo: string): number[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new PersonalizacionInvalidaError(`${campo}_no_es_lista`);
  if (v.length > MAX_POR_LISTA) throw new PersonalizacionInvalidaError(`${campo}_demasiados`);
  const out = v.map((n: any) => Number(n));
  if (out.some((n: number) => !Number.isInteger(n) || n <= 0)) throw new PersonalizacionInvalidaError(`${campo}_id_invalido`);
  if (new Set(out).size !== out.length) throw new PersonalizacionInvalidaError(`${campo}_repetido`);
  return out;
}

const nombreIng = (ri: any): string => ri?.ingrediente?.nombre || ri?.descripcion || '';

/**
 * Valida `opcion.personalizacionSabores` contra el catálogo y devuelve el precio y el snapshot.
 * Sin personalización (ausente o vacía) devuelve `null`. Con el interruptor apagado, cualquier
 * personalización se rechaza (el cliente no la pudo haber visto en el menú).
 */
export async function resolvePersonalizacionSabores(
  dataSource: DataSource,
  sabores: SaborResuelto[],
  raw: any,
  habilitado: boolean,
): Promise<PersonalizacionResuelta | null> {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new PersonalizacionInvalidaError('no_es_lista');
  if (!raw.length) return null;
  if (!habilitado) throw new PersonalizacionInvalidaError('deshabilitada');
  if (raw.length > sabores.length) throw new PersonalizacionInvalidaError('demasiados_sabores');

  const porSaborId = new Map(sabores.map((s) => [s.saborId, s]));
  const vistos = new Set<number>();
  const pedidos: { sabor: SaborResuelto; quitar: number[]; cambios: { ri: number; prod: number }[]; adic: number[] }[] = [];

  for (const p of raw) {
    const saborId = Number(p?.saborId);
    const sabor = porSaborId.get(saborId);
    if (!sabor) throw new PersonalizacionInvalidaError('sabor_no_elegido');
    if (vistos.has(saborId)) throw new PersonalizacionInvalidaError('sabor_repetido');
    vistos.add(saborId);
    if (!sabor.recetaId) throw new PersonalizacionInvalidaError('sabor_sin_receta');

    const quitar = idsEnteros(p.quitarIds, 'quitar');
    if (p.cambios != null && !Array.isArray(p.cambios)) throw new PersonalizacionInvalidaError('cambios_no_es_lista');
    const cambiosRaw: any[] = p.cambios || [];
    if (cambiosRaw.length > MAX_POR_LISTA) throw new PersonalizacionInvalidaError('cambios_demasiados');
    const cambios = cambiosRaw.map((c) => ({ ri: Number(c?.recetaIngredienteId), prod: Number(c?.productoId) }));
    if (cambios.some((c) => !Number.isInteger(c.ri) || c.ri <= 0 || !Number.isInteger(c.prod) || c.prod <= 0)) {
      throw new PersonalizacionInvalidaError('cambios_id_invalido');
    }
    if (new Set(cambios.map((c) => c.ri)).size !== cambios.length) throw new PersonalizacionInvalidaError('cambios_repetido');
    if (cambios.some((c) => quitar.includes(c.ri))) throw new PersonalizacionInvalidaError('quitado_y_cambiado');
    const adic = idsEnteros(p.adicionalIds, 'adicionales');
    pedidos.push({ sabor, quitar, cambios, adic });
  }

  // Catálogo de una vez: ingredientes, intercambiables y adicionales tocados.
  const riIds = Array.from(new Set(pedidos.flatMap((p) => [...p.quitar, ...p.cambios.map((c) => c.ri)])));
  const ris = riIds.length
    ? await dataSource.getRepository(RecetaIngrediente).find({ where: { id: In(riIds) } as any, relations: ['receta', 'ingrediente'] })
    : [];
  const riPorId = new Map((ris as any[]).map((r) => [r.id, r]));

  const cambiosRiIds = Array.from(new Set(pedidos.flatMap((p) => p.cambios.map((c) => c.ri))));
  const inters = cambiosRiIds.length
    ? await dataSource.getRepository(RecetaIngredienteIntercambiable).find({
        where: { recetaIngrediente: { id: In(cambiosRiIds) }, activo: true } as any,
        relations: ['recetaIngrediente', 'ingredienteOpcion'],
      })
    : [];

  const recetaIds = Array.from(new Set(pedidos.filter((p) => p.adic.length).map((p) => p.sabor.recetaId as number)));
  const vincs = recetaIds.length
    ? await dataSource.getRepository(RecetaAdicionalVinculacion).find({
        where: recetaIds.map((rid) => ({ receta: { id: rid }, activo: true })) as any,
        relations: ['receta', 'adicional'],
      })
    : [];

  let total = 0;
  const porSabor = new Map<number, PersonalizacionSaborSnap>();
  for (const p of pedidos) {
    const recetaId = p.sabor.recetaId;
    const snap: PersonalizacionSaborSnap = { quitados: [], cambios: [], adicionales: [] };

    for (const id of p.quitar) {
      const ri: any = riPorId.get(id);
      if (!ri || !ri.activo || ri.receta?.id !== recetaId || !ri.esOpcional) throw new PersonalizacionInvalidaError('ingrediente_no_quitable');
      snap.quitados.push({ id, nombre: nombreIng(ri) });
    }
    for (const c of p.cambios) {
      const ri: any = riPorId.get(c.ri);
      if (!ri || !ri.activo || ri.receta?.id !== recetaId || !ri.esCambiable) throw new PersonalizacionInvalidaError('ingrediente_no_cambiable');
      const op: any = (inters as any[]).find((i) => i.recetaIngrediente?.id === c.ri && i.ingredienteOpcion?.id === c.prod);
      if (!op) throw new PersonalizacionInvalidaError('opcion_de_cambio_invalida');
      snap.cambios.push({ id: c.ri, nombre: nombreIng(ri), reemplazoId: c.prod, reemplazoNombre: op.ingredienteOpcion?.nombre || '' });
    }
    for (const id of p.adic) {
      const v: any = (vincs as any[]).find((x) => x.receta?.id === recetaId && x.adicional?.id === id);
      if (!v || !v.adicional?.activo) throw new PersonalizacionInvalidaError('adicional_invalido');
      const precio = Math.max(0, Number(v.precioAdicional ?? v.adicional.precio ?? 0));
      snap.adicionales.push({ id, nombre: v.adicional.nombre, precio });
      total += precio * (Number(p.sabor.proporcion) || 1);
    }
    porSabor.set(p.sabor.saborId, snap);
  }

  return { total: Math.round(total), porSabor };
}

export interface PersonalizacionReceta {
  quitables: { id: number; nombre: string }[];
  cambiables: { id: number; nombre: string; opciones: { productoId: number; nombre: string }[] }[];
  adicionales: { id: number; nombre: string; precio: number }[];
}

/**
 * Lo que el menú público ofrece para personalizar cada receta (sabor × tamaño). Solo ids y
 * nombres activos: ni costos, ni cantidades, ni nada inactivo. Recetas sin nada para tocar no
 * aparecen (la tienda no muestra el botón).
 */
export async function buildPersonalizacionPorReceta(
  dataSource: DataSource,
  recetaIds: number[],
): Promise<Record<string, PersonalizacionReceta>> {
  const ids = Array.from(new Set(recetaIds.filter((n) => Number.isInteger(n) && n > 0)));
  const out: Record<string, PersonalizacionReceta> = {};
  if (!ids.length) return out;

  const ris = await dataSource.getRepository(RecetaIngrediente).find({
    where: { receta: { id: In(ids) }, activo: true } as any,
    relations: ['receta', 'ingrediente'],
    order: { id: 'ASC' } as any,
  });
  const cambiablesIds = (ris as any[]).filter((r) => r.esCambiable).map((r) => r.id);
  const inters = cambiablesIds.length
    ? await dataSource.getRepository(RecetaIngredienteIntercambiable).find({
        where: { recetaIngrediente: { id: In(cambiablesIds) }, activo: true } as any,
        relations: ['recetaIngrediente', 'ingredienteOpcion'],
        order: { id: 'ASC' } as any,
      })
    : [];
  const vincs = await dataSource.getRepository(RecetaAdicionalVinculacion).find({
    where: ids.map((rid) => ({ receta: { id: rid }, activo: true })) as any,
    relations: ['receta', 'adicional'],
    order: { id: 'ASC' } as any,
  });

  for (const rid of ids) {
    const quitables = (ris as any[])
      .filter((r) => r.receta?.id === rid && r.esOpcional)
      .map((r) => ({ id: r.id, nombre: nombreIng(r) }));
    const cambiables = (ris as any[])
      .filter((r) => r.receta?.id === rid && r.esCambiable)
      .map((r) => ({
        id: r.id,
        nombre: nombreIng(r),
        opciones: (inters as any[])
          .filter((i) => i.recetaIngrediente?.id === r.id && i.ingredienteOpcion)
          .map((i) => ({ productoId: i.ingredienteOpcion.id, nombre: i.ingredienteOpcion.nombre })),
      }))
      .filter((c) => c.opciones.length);
    const vistos = new Set<number>();
    const adicionales: PersonalizacionReceta['adicionales'] = [];
    for (const v of vincs as any[]) {
      if (v.receta?.id !== rid || !v.adicional?.activo || vistos.has(v.adicional.id)) continue;
      vistos.add(v.adicional.id);
      adicionales.push({ id: v.adicional.id, nombre: v.adicional.nombre, precio: Math.max(0, Number(v.precioAdicional ?? v.adicional.precio ?? 0)) });
    }
    if (quitables.length || cambiables.length || adicionales.length) out[String(rid)] = { quitables, cambiables, adicionales };
  }
  return out;
}
