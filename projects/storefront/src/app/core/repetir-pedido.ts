/**
 * F9: «Repetir pedido» — rearma las líneas del carrito a partir de un pedido hecho.
 *
 * Usa el snapshot que el servidor guardó en cada ítem (opción, sabores con su personalización,
 * adicionales, observaciones, nota) y lo cruza con la carta VIGENTE: lo que ya no se vende no
 * vuelve, y el precio es el de hoy (lo recalcula `CartService.revalidar` y, al final, el
 * servidor). Funciona desde cualquier dispositivo: no depende de nada guardado en el navegador.
 * También lo usa «Modificar», que cancela el pedido y devuelve sus productos al carrito.
 */
import { precioBaseLinea, precioSaboresLinea } from './cart.service';
import { CartItem, MenuAdicional, MenuObservacion, MenuSnapshot, PersonalizacionSabor } from './models';

export interface ItemPedidoRepetible {
  productoId?: number;
  presentacionId?: number | null;
  nombreProducto: string;
  nombrePresentacion?: string | null;
  cantidad: number;
  personalizacion?: any;
}

export interface ResultadoRepetir {
  lineas: Omit<CartItem, 'uid'>[];
  /** Productos que no se pudieron rearmar (ya no se venden, o cambió la opción). */
  faltantes: string[];
  /** Preferencias que ya no existen y no se pudieron volver a poner (la línea sí vuelve). */
  avisos: string[];
}

const TIPOS = ['PRESENTACION', 'RECETA', 'VARIACION', 'COMBO', 'PIZZA'];

export function lineasDesdePedido(items: ItemPedidoRepetible[], menu: MenuSnapshot): ResultadoRepetir {
  const res: ResultadoRepetir = { lineas: [], faltantes: [], avisos: [] };
  for (const it of items || []) {
    const linea = lineaDesdeItem(it, menu, res.avisos);
    if (linea) res.lineas.push(linea);
    else res.faltantes.push(it.nombreProducto);
  }
  return res;
}

function lineaDesdeItem(it: ItemPedidoRepetible, menu: MenuSnapshot, avisos: string[]): Omit<CartItem, 'uid'> | null {
  const p = it.productoId != null ? menu.productos.find((x) => x.id === Number(it.productoId)) : null;
  if (!p) return null;
  const snap = it.personalizacion || {};
  const tipo = TIPOS.includes(snap?.opcion?.tipo) ? snap.opcion.tipo : 'PRESENTACION';
  const presentacionId = it.presentacionId != null ? Number(it.presentacionId) : undefined;
  const cantidad = Math.max(1, Math.floor(Number(it.cantidad) || 1));

  let opcion: CartItem['opcion'];
  if (tipo === 'PIZZA') {
    const sabores: any[] = Array.isArray(snap.sabores) ? snap.sabores : [];
    const saborIds = sabores.map((s) => Number(s?.saborId)).filter((n) => n > 0);
    if (!presentacionId || !saborIds.length) return null;
    const personalizacionSabores: PersonalizacionSabor[] = [];
    for (const s of sabores) {
      const ps = s?.personalizacion;
      if (!ps) continue;
      const nombreSabor = p.sabores?.find((x) => x.saborId === Number(s.saborId))?.nombre || s.nombre;
      personalizacionSabores.push({
        saborId: Number(s.saborId),
        nombreSabor,
        quitar: (ps.quitados || []).map((q: any) => ({ id: Number(q.id), nombre: String(q.nombre || '') })),
        cambios: (ps.cambios || []).map((c: any) => ({
          recetaIngredienteId: Number(c.id), nombre: String(c.nombre || ''),
          productoId: Number(c.reemplazoId), reemplazoNombre: String(c.reemplazoNombre || ''),
        })),
        adicionales: (ps.adicionales || []).map((a: any) => ({ id: Number(a.id), nombre: String(a.nombre || ''), precio: Number(a.precio) || 0 })),
      });
    }
    opcion = {
      tipo: 'PIZZA',
      label: String(snap?.opcion?.label || it.nombrePresentacion || ''),
      presentacionId,
      saborIds,
      personalizacionSabores: personalizacionSabores.filter((ps) => ps.quitar.length || ps.cambios.length || ps.adicionales.length),
    };
  } else {
    const recetaId = snap?.opcion?.recetaId != null ? Number(snap.opcion.recetaId) : null;
    const delTipo = p.opciones.filter((o) => o.tipo === tipo);
    // Pedidos anteriores a F9 no guardaron la receta: alcanza si hay una sola opción que encaje.
    const candidatas = delTipo.filter((o) =>
      (o.presentacionId ?? null) === (presentacionId ?? null)
      && (recetaId == null || (o.recetaId ?? null) === recetaId));
    if (candidatas.length !== 1) return null;
    const o = candidatas[0];
    opcion = { tipo: o.tipo, label: o.label, presentacionId: o.presentacionId, recetaId: o.recetaId };
  }

  // Adicionales: los mismos, si todavía se ofrecen; si alguno ya no, la línea no se rearma
  // (sería otro plato). Observaciones: las que sigan existiendo.
  const adicionales: MenuAdicional[] = [];
  for (const a of snap.adicionales || []) {
    const vig = p.adicionales.find((x) => x.id === Number(a?.id));
    if (!vig) return null;
    adicionales.push(vig);
  }
  const observaciones: MenuObservacion[] = [];
  const perdidas: string[] = [];
  for (const o of snap.observaciones || []) {
    const txt = String(typeof o === 'string' ? o : o?.descripcion || '');
    const vig = p.observaciones.find((x) => x.descripcion === txt);
    if (vig) observaciones.push(vig);
    else if (txt) perdidas.push(txt);
  }

  const base: Omit<CartItem, 'uid'> = {
    productoId: p.id,
    nombreProducto: p.nombre,
    imageUrl: (opcion.saborIds?.length ? p.sabores?.find((s) => s.saborId === opcion.saborIds![0])?.imageUrl : null) || p.imageUrl,
    opcion,
    adicionales,
    observaciones,
    notaLibre: snap.notaLibre ? String(snap.notaLibre) : null,
    cantidad,
    precioUnitario: 0,
  };
  const precio = precioBaseLinea(p, base as CartItem);
  const sabores = precioSaboresLinea(menu, p, base as CartItem);
  if (precio == null || sabores == null) return null;
  base.precioUnitario = precio + adicionales.reduce((s, a) => s + a.precio, 0) + sabores;
  // Sólo se avisa si la línea vuelve: una preferencia perdida («sin cebolla») no puede pasar callada.
  for (const t of perdidas) avisos.push(`«${p.nombre}»: la preferencia «${t}» ya no está; agregala como nota si la necesitás.`);
  return base;
}
