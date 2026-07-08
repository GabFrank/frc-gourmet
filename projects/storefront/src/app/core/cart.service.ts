import { Injectable } from '@angular/core';
import { CartItem, MenuProducto, MenuPresentacion } from './models';

/** Estado del carrito (en memoria + persistido en localStorage). Angular 15: sin signals. */
@Injectable({ providedIn: 'root' })
export class CartService {
  items: CartItem[] = [];
  count = 0;
  subtotal = 0;

  constructor() {
    this.items = this.load();
    this.recompute();
  }

  agregar(producto: MenuProducto, presentacion: MenuPresentacion, cantidad = 1): void {
    const existente = this.items.find(
      (i) => i.productoId === producto.id && i.presentacionId === presentacion.id,
    );
    if (existente) {
      existente.cantidad += cantidad;
    } else {
      this.items.push({
        productoId: producto.id,
        presentacionId: presentacion.id,
        nombreProducto: producto.nombre,
        nombrePresentacion: presentacion.nombre,
        precioUnitario: presentacion.precio,
        cantidad,
      });
    }
    this.persist();
  }

  cambiarCantidad(index: number, delta: number): void {
    const it = this.items[index];
    if (!it) return;
    it.cantidad += delta;
    if (it.cantidad <= 0) this.items.splice(index, 1);
    this.persist();
  }

  quitar(index: number): void {
    this.items.splice(index, 1);
    this.persist();
  }

  limpiar(): void {
    this.items = [];
    this.persist();
  }

  /** Payload de items para `pedido.crear`. */
  toPedidoItems(): any[] {
    return this.items.map((i) => ({
      productoId: i.productoId,
      presentacionId: i.presentacionId,
      cantidad: i.cantidad,
    }));
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
      return JSON.parse(localStorage.getItem('frc_sf_cart') || '[]');
    } catch {
      return [];
    }
  }
}
