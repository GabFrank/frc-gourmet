import { Injectable } from '@angular/core';
import { CartItem } from './models';

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
      },
      cantidad: i.cantidad,
      adicionalIds: i.adicionales.map((a) => a.id),
      observaciones: i.observaciones.map((o) => o.descripcion),
      notaLibre: i.notaLibre || undefined,
    }));
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
