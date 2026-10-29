import { Injectable } from '@angular/core';
import { guarani } from './guarani.pipe';
import { CartItem, MenuAdicional, MenuProducto, MenuSnapshot } from './models';

export interface RevalidacionCarrito {
  cambiados: { nombre: string; antes: number; ahora: number }[];
  quitados: string[];
}

/** Textos para el cliente a partir del resultado de `revalidar`. */
export function avisosRevalidacion(r: RevalidacionCarrito): string[] {
  const out: string[] = [];
  for (const q of r.quitados) out.push(`«${q}» ya no está disponible y lo sacamos de tu pedido.`);
  for (const c of r.cambiados) out.push(`«${c.nombre}» cambió de precio: ahora ${guarani(c.ahora)} (antes ${guarani(c.antes)}).`);
  return out;
}

/** Precio base de una línea según la carta vigente, o null si ya no se vende. */
export function precioBaseLinea(p: MenuProducto, it: CartItem): number | null {
  if (it.opcion.tipo === 'PIZZA') {
    const presId = it.opcion.presentacionId;
    const ids = [...new Set(it.opcion.saborIds || [])]; // igual que el server: sabores únicos
    if (!presId || !ids.length) return null;
    const precios: number[] = [];
    for (const id of ids) {
      const pr = p.sabores?.find((s) => s.saborId === id)?.precios.find((x) => x.presentacionId === presId);
      if (!pr) return null;
      precios.push(pr.precio);
    }
    return p.pizzaConfig?.estrategia === 'PROMEDIO'
      ? precios.reduce((a, b) => a + b, 0) / precios.length
      : Math.max(...precios);
  }
  const op = p.opciones.find(
    (o) =>
      o.tipo === it.opcion.tipo &&
      (o.presentacionId ?? null) === (it.opcion.presentacionId ?? null) &&
      (o.recetaId ?? null) === (it.opcion.recetaId ?? null),
  );
  return op ? op.precio : null;
}

/** Estado del carrito (memoria + localStorage). Angular 15: sin signals. */
@Injectable({ providedIn: 'root' })
export class CartService {
  items: CartItem[] = [];
  count = 0;
  subtotal = 0;

  private seq = 1;

  constructor() {
    this.items = this.load();
    this.recompute();
  }

  /** Agrega una línea ya construida (con su personalización). */
  agregar(item: Omit<CartItem, 'uid'>): void {
    const uid = `L${Date.now()}_${this.seq++}`;
    this.items.push({ ...item, uid });
    this.persist();
  }

  setCantidad(uid: string, cantidad: number): void {
    const it = this.items.find((i) => i.uid === uid);
    if (!it) return;
    it.cantidad = Math.max(1, cantidad);
    this.persist();
  }

  cambiarCantidad(uid: string, delta: number): void {
    const it = this.items.find((i) => i.uid === uid);
    if (!it) return;
    it.cantidad += delta;
    if (it.cantidad <= 0) this.items = this.items.filter((i) => i.uid !== uid);
    this.persist();
  }

  quitar(uid: string): void {
    this.items = this.items.filter((i) => i.uid !== uid);
    this.persist();
  }

  limpiar(): void {
    this.items = [];
    this.persist();
  }

  /** Payload de items para `pedido.crear` (el server revalida precios). */
  toPedidoItems(): any[] {
    return this.items.map((i) => ({
      productoId: i.productoId,
      opcion: {
        tipo: i.opcion.tipo,
        presentacionId: i.opcion.presentacionId,
        recetaId: i.opcion.recetaId,
        saborIds: i.opcion.saborIds,
      },
      cantidad: i.cantidad,
      adicionalIds: i.adicionales.map((a) => a.id),
      observaciones: i.observaciones.map((o) => o.descripcion),
      notaLibre: i.notaLibre || undefined,
    }));
  }

  /**
   * Recalcula cada línea contra la carta vigente (`menu.get`). Actualiza precio,
   * foto y nombre; quita lo que ya no se vende. El server igual recalcula al
   * crear el pedido: esto es para que el cliente vea el mismo número antes.
   */
  revalidar(menu: MenuSnapshot): RevalidacionCarrito {
    const res: RevalidacionCarrito = { cambiados: [], quitados: [] };
    const quedan: CartItem[] = [];
    for (const it of this.items) {
      const p = menu.productos.find((x) => x.id === it.productoId);
      const base = p ? precioBaseLinea(p, it) : null;
      const adicionales = p ? it.adicionales.map((a) => p.adicionales.find((x) => x.id === a.id) || null) : [];
      if (!p || base == null || adicionales.some((a) => !a)) {
        res.quitados.push(it.nombreProducto);
        continue;
      }
      const nuevo = base + (adicionales as MenuAdicional[]).reduce((s, a) => s + a.precio, 0);
      if (Math.abs(nuevo - it.precioUnitario) > 0.001) {
        res.cambiados.push({ nombre: it.nombreProducto, antes: it.precioUnitario, ahora: nuevo });
      }
      const saborImg = it.opcion.saborIds?.length
        ? p.sabores?.find((s) => s.saborId === it.opcion.saborIds![0])?.imageUrl
        : null;
      quedan.push({
        ...it,
        precioUnitario: nuevo,
        adicionales: adicionales as MenuAdicional[],
        imageUrl: saborImg || p.imageUrl || it.imageUrl,
      });
    }
    this.items = quedan;
    this.persist();
    return res;
  }

  /** Resumen legible de la personalización de una línea. */
  resumen(it: CartItem): string {
    const parts: string[] = [];
    if (it.opcion.label && it.opcion.tipo !== 'PRESENTACION') parts.push(it.opcion.label);
    else if (it.opcion.label && it.opcion.label !== 'Estándar') parts.push(it.opcion.label);
    for (const a of it.adicionales) parts.push(a.nombre);
    for (const o of it.observaciones) parts.push(o.descripcion);
    if (it.notaLibre) parts.push(`"${it.notaLibre}"`);
    return parts.join(' · ');
  }

  private persist(): void {
    this.recompute();
    localStorage.setItem('frc_sf_cart', JSON.stringify(this.items));
  }

  private recompute(): void {
    this.count = this.items.reduce((s, i) => s + i.cantidad, 0);
    this.subtotal = this.items.reduce((s, i) => s + i.precioUnitario * i.cantidad, 0);
  }

  private load(): CartItem[] {
    try {
      const arr = JSON.parse(localStorage.getItem('frc_sf_cart') || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
}
