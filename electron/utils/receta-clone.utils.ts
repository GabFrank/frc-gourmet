import { EntityManager } from 'typeorm';
import { Receta } from '../../src/app/database/entities/productos/receta.entity';
import { RecetaIngrediente } from '../../src/app/database/entities/productos/receta-ingrediente.entity';
import { RecetaIngredienteIntercambiable } from '../../src/app/database/entities/productos/receta-ingrediente-intercambiable.entity';
import { RecetaFase } from '../../src/app/database/entities/productos/receta-fase.entity';
import { RecetaFaseIngrediente } from '../../src/app/database/entities/productos/receta-fase-ingrediente.entity';
import { RecetaMaterial } from '../../src/app/database/entities/productos/receta-material.entity';
import { RecetaAdicionalVinculacion } from '../../src/app/database/entities/productos/receta-adicional-vinculacion.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';

/**
 * Clona una Receta con todo su grafo (ingredientes + intercambiables,
 * fases + fase-ingredientes con doble remapeo, materiales, adicionales
 * vinculados y adicionales disponibles M2M). Devuelve la receta nueva.
 *
 * DB-agnóstico (usa EntityManager, no SQL crudo).
 */
export async function clonarReceta(manager: EntityManager, recetaId: number): Promise<Receta> {
  const recetaRepo = manager.getRepository(Receta);
  const orig = await recetaRepo.findOne({
    where: { id: recetaId },
    relations: ['adicionalesDisponibles'],
  });
  if (!orig) throw new Error(`Receta ${recetaId} no encontrada para clonar`);

  // 1) Fila Receta (escalares) + M2M adicionalesDisponibles.
  const nueva = await recetaRepo.save(recetaRepo.create({
    categoria: orig.categoria,
    subcategoria: orig.subcategoria,
    nombre: orig.nombre,
    descripcion: orig.descripcion,
    costoCalculado: orig.costoCalculado,
    rendimiento: orig.rendimiento,
    unidadRendimiento: orig.unidadRendimiento,
    unidadRendimientoOriginal: orig.unidadRendimientoOriginal,
    tiempoPreparo: orig.tiempoPreparo,
    imageUrl: orig.imageUrl,
    activo: orig.activo,
    adicionalesDisponibles: orig.adicionalesDisponibles || [],
  } as any)) as unknown as Receta;

  // 2) Ingredientes (map old→new para las fases).
  const ingRepo = manager.getRepository(RecetaIngrediente);
  const ingredientes = await ingRepo.find({
    where: { receta: { id: recetaId } },
    relations: ['ingrediente', 'reemplazoDefault'],
  });
  const ingMap = new Map<number, number>();
  for (const ing of ingredientes as any[]) {
    const nuevoIng = await ingRepo.save(ingRepo.create({
      cantidad: ing.cantidad,
      unidad: ing.unidad,
      descripcion: ing.descripcion,
      unidadOriginal: ing.unidadOriginal,
      costoUnitario: ing.costoUnitario,
      costoTotal: ing.costoTotal,
      esExtra: ing.esExtra,
      esOpcional: ing.esOpcional,
      esCambiable: ing.esCambiable,
      costoExtra: ing.costoExtra,
      porcentajeAprovechamiento: ing.porcentajeAprovechamiento,
      esIngredienteBase: ing.esIngredienteBase,
      activo: ing.activo,
      receta: { id: nueva.id },
      ingrediente: ing.ingrediente ? { id: ing.ingrediente.id } : null,
      reemplazoDefault: ing.reemplazoDefault ? { id: ing.reemplazoDefault.id } : undefined,
    } as any)) as unknown as RecetaIngrediente;
    ingMap.set(ing.id, nuevoIng.id);
  }

  // 2b) Intercambiables de cada ingrediente.
  if (ingMap.size) {
    const intRepo = manager.getRepository(RecetaIngredienteIntercambiable);
    const intercambiables = await intRepo.find({
      where: Array.from(ingMap.keys()).map((oldId) => ({ recetaIngrediente: { id: oldId } })) as any,
      relations: ['recetaIngrediente', 'ingredienteOpcion'],
    });
    for (const it of intercambiables as any[]) {
      const nuevoIngId = ingMap.get(it.recetaIngrediente?.id);
      if (!nuevoIngId) continue;
      await intRepo.save(intRepo.create({
        costoExtra: it.costoExtra,
        activo: it.activo,
        recetaIngrediente: { id: nuevoIngId },
        ingredienteOpcion: it.ingredienteOpcion ? { id: it.ingredienteOpcion.id } : undefined,
      } as any));
    }
  }

  // 3) Fases (map old→new).
  const faseRepo = manager.getRepository(RecetaFase);
  const fases = await faseRepo.find({ where: { receta: { id: recetaId } } });
  const faseMap = new Map<number, number>();
  for (const fase of fases as any[]) {
    const nuevaFase = await faseRepo.save(faseRepo.create({
      orden: fase.orden,
      titulo: fase.titulo,
      descripcion: fase.descripcion,
      activo: fase.activo,
      receta: { id: nueva.id },
    } as any)) as unknown as RecetaFase;
    faseMap.set(fase.id, nuevaFase.id);
  }

  // 3b) Fase-ingredientes (usa AMBOS mapas: fase e ingrediente).
  if (faseMap.size) {
    const fiRepo = manager.getRepository(RecetaFaseIngrediente);
    const faseIngs = await fiRepo.find({
      where: Array.from(faseMap.keys()).map((oldFaseId) => ({ fase: { id: oldFaseId } })) as any,
      relations: ['fase', 'recetaIngrediente'],
    });
    for (const fi of faseIngs as any[]) {
      const nuevaFaseId = faseMap.get(fi.fase?.id);
      const nuevoIngId = ingMap.get(fi.recetaIngrediente?.id);
      if (!nuevaFaseId || !nuevoIngId) continue;
      await fiRepo.save(fiRepo.create({
        fase: { id: nuevaFaseId },
        recetaIngrediente: { id: nuevoIngId },
      } as any));
    }
  }

  // 4) Materiales.
  const matRepo = manager.getRepository(RecetaMaterial);
  const materiales = await matRepo.find({ where: { receta: { id: recetaId } } });
  for (const mat of materiales as any[]) {
    await matRepo.save(matRepo.create({
      descripcion: mat.descripcion,
      orden: mat.orden,
      activo: mat.activo,
      receta: { id: nueva.id },
    } as any));
  }

  // 5) Adicionales vinculados.
  const vincRepo = manager.getRepository(RecetaAdicionalVinculacion);
  const vinculaciones = await vincRepo.find({ where: { receta: { id: recetaId } }, relations: ['adicional'] });
  for (const v of vinculaciones as any[]) {
    await vincRepo.save(vincRepo.create({
      precioAdicional: v.precioAdicional,
      cantidad: v.cantidad,
      unidad: v.unidad,
      unidadOriginal: v.unidadOriginal,
      activo: v.activo,
      receta: { id: nueva.id },
      adicional: v.adicional ? { id: v.adicional.id } : undefined,
    } as any));
  }

  return nueva;
}

/**
 * Des-comparte las recetas que hoy están asignadas a MÁS DE UNA variación
 * (RecetaPresentacion). Deja la receta original en la primera variación y clona
 * el grafo para cada una de las demás, re-apuntando su receta_id. Idempotente:
 * tras correrlo, cada receta_id de receta_presentacion es único.
 */
export async function desduplicarRecetasCompartidas(
  manager: EntityManager,
): Promise<{ recetasCompartidas: number; variacionesReparadas: number }> {
  const rpRepo = manager.getRepository(RecetaPresentacion);

  const compartidas = await rpRepo.createQueryBuilder('rp')
    .select('rp.receta_id', 'recetaId')
    .addSelect('COUNT(*)', 'n')
    .where('rp.receta_id IS NOT NULL')
    .groupBy('rp.receta_id')
    .having('COUNT(*) > 1')
    .getRawMany();

  let variacionesReparadas = 0;
  for (const row of compartidas) {
    const recetaId = Number(row.recetaId);
    const rps = await rpRepo.find({ where: { receta: { id: recetaId } }, order: { id: 'ASC' } });
    // La primera variación conserva la receta original; las demás reciben un clon.
    for (let i = 1; i < rps.length; i++) {
      const clon = await clonarReceta(manager, recetaId);
      await rpRepo.update(rps[i].id, { receta: { id: clon.id } } as any);
      variacionesReparadas++;
    }
  }

  return { recetasCompartidas: compartidas.length, variacionesReparadas };
}
