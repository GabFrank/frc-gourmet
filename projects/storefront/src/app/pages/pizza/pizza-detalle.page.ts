import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { ConfigService } from '../../core/config.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { MenuProducto, MenuSaborPizza, MenuTamano, MenuAdicional, MenuObservacion } from '../../core/models';

/**
 * Detalle de una pizza — entrada POR SABOR (tipo iFood).
 * El usuario ya eligió un sabor en el menú; acá elige el TAMAÑO, opcionalmente
 * arma "mitad y mitad" con otro sabor, y personaliza (adicionales, observaciones,
 * nota). El precio se combina con la estrategia del PdV (MAYOR_PRECIO/PROMEDIO)
 * y el server lo revalida al confirmar.
 */
@Component({
  selector: 'sf-pizza-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, AppImgPipe],
  templateUrl: './pizza-detalle.page.html',
  styleUrls: ['./pizza-detalle.page.scss'],
})
export class PizzaDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private menuSvc = inject(MenuService);
  cart = inject(CartService);
  config = inject(ConfigService);

  producto: MenuProducto | null = null;
  saborEntrada: MenuSaborPizza | null = null;
  cargando = true;

  tamanos: MenuTamano[] = [];
  presSel: number | null = null;
  saboresSel: MenuSaborPizza[] = [];
  montarMitad = false;

  adicionalesSel = new Set<number>();
  observacionesSel = new Set<number>();
  notaLibre = '';
  cantidad = 1;

  ngOnInit(): void {
    const productoId = Number(this.route.snapshot.paramMap.get('productoId'));
    const saborId = Number(this.route.snapshot.paramMap.get('saborId'));
    this.menuSvc.cargar().subscribe({
      next: () => {
        const p = this.menuSvc.producto(productoId);
        if (p && p.esPizza && p.sabores?.length) {
          this.producto = p;
          this.saborEntrada = p.sabores.find((s) => s.saborId === saborId) || p.sabores[0];
          // Tamaños que el sabor de entrada realmente tiene cotizados.
          this.tamanos = (p.tamanos || []).filter((t) =>
            this.saborEntrada!.precios.some((pr) => pr.presentacionId === t.presentacionId),
          );
          this.presSel = this.tamanos[0]?.presentacionId ?? null;
          this.saboresSel = this.saborEntrada ? [this.saborEntrada] : [];
        }
        this.cargando = false;
      },
      error: () => (this.cargando = false),
    });
  }

  get maxSabores(): number {
    return this.producto?.pizzaConfig?.maxSabores ?? 1;
  }

  get permiteMitad(): boolean {
    return this.maxSabores > 1;
  }

  /** Sabores hermanos que se pueden sumar (tienen precio en el tamaño elegido y no están ya elegidos). */
  get saboresParaSumar(): MenuSaborPizza[] {
    if (!this.producto || this.presSel == null) return [];
    return (this.producto.sabores || []).filter(
      (s) =>
        !this.saboresSel.some((x) => x.saborId === s.saborId) &&
        s.precios.some((pr) => pr.presentacionId === this.presSel),
    );
  }

  get puedeSumarMas(): boolean {
    return this.saboresSel.length < this.maxSabores && this.saboresParaSumar.length > 0;
  }

  private precioDe(s: MenuSaborPizza, presId: number | null): number | null {
    if (presId == null) return null;
    const pr = s.precios.find((x) => x.presentacionId === presId);
    return pr ? pr.precio : null;
  }

  precioTamano(t: MenuTamano): number | null {
    // Precio del sabor de entrada para ese tamaño (referencia del selector).
    return this.saborEntrada ? this.precioDe(this.saborEntrada, t.presentacionId) : null;
  }

  setTamano(t: MenuTamano): void {
    this.presSel = t.presentacionId;
    // Quitar sabores extra que no tengan precio en el nuevo tamaño (el de entrada se conserva).
    this.saboresSel = this.saboresSel.filter(
      (s, i) => i === 0 || this.precioDe(s, this.presSel) != null,
    );
  }

  toggleSaborExtra(s: MenuSaborPizza): void {
    const idx = this.saboresSel.findIndex((x) => x.saborId === s.saborId);
    if (idx > 0) {
      this.saboresSel.splice(idx, 1); // quitar (nunca el de entrada, índice 0)
    } else if (idx < 0 && this.saboresSel.length < this.maxSabores) {
      this.saboresSel.push(s);
    }
  }

  esSaborElegido(s: MenuSaborPizza): boolean {
    return this.saboresSel.some((x) => x.saborId === s.saborId);
  }

  toggleAdicional(a: MenuAdicional): void {
    if (this.adicionalesSel.has(a.id)) this.adicionalesSel.delete(a.id);
    else this.adicionalesSel.add(a.id);
  }

  toggleObservacion(o: MenuObservacion): void {
    if (this.observacionesSel.has(o.id)) this.observacionesSel.delete(o.id);
    else this.observacionesSel.add(o.id);
  }

  cambiarCantidad(delta: number): void {
    this.cantidad = Math.max(1, this.cantidad + delta);
  }

  get precioBase(): number {
    if (this.presSel == null || !this.saboresSel.length) return 0;
    const precios = this.saboresSel
      .map((s) => this.precioDe(s, this.presSel))
      .filter((v): v is number => v != null);
    if (!precios.length) return 0;
    const estrategia = this.producto?.pizzaConfig?.estrategia || 'MAYOR_PRECIO';
    const base = estrategia === 'PROMEDIO'
      ? precios.reduce((a, b) => a + b, 0) / precios.length
      : Math.max(...precios);
    return Math.round(base);
  }

  get precioAdicionales(): number {
    if (!this.producto) return 0;
    return this.producto.adicionales
      .filter((a) => this.adicionalesSel.has(a.id))
      .reduce((s, a) => s + a.precio, 0);
  }

  get precioUnitario(): number {
    return this.precioBase + this.precioAdicionales;
  }

  get total(): number {
    return this.precioUnitario * this.cantidad;
  }

  get monedaSimbolo(): string {
    return this.producto?.moneda?.simbolo || '';
  }

  get resumenSabores(): string {
    if (this.saboresSel.length <= 1) return this.saboresSel[0]?.nombre || '';
    const n = this.saboresSel.length;
    return this.saboresSel.map((s) => `1/${n} ${s.nombre}`).join(' + ');
  }

  get puedeAgregar(): boolean {
    return !!this.producto && this.presSel != null && this.saboresSel.length > 0 && this.config.config.abiertaAhora;
  }

  agregar(): void {
    if (!this.producto || this.presSel == null || !this.saboresSel.length) return;
    const tamano = this.tamanos.find((t) => t.presentacionId === this.presSel);
    const tamNombre = tamano?.nombre || '';
    const label = `${tamNombre} · ${this.resumenSabores}`;
    const adicionales = this.producto.adicionales.filter((a) => this.adicionalesSel.has(a.id));
    const observaciones = this.producto.observaciones.filter((o) => this.observacionesSel.has(o.id));
    this.cart.agregar({
      productoId: this.producto.id,
      nombreProducto: this.producto.nombre,
      imageUrl: this.saborEntrada?.imageUrl || this.producto.imageUrl,
      opcion: {
        tipo: 'PIZZA',
        label,
        presentacionId: this.presSel,
        saborIds: this.saboresSel.map((s) => s.saborId),
      },
      adicionales,
      observaciones,
      notaLibre: this.notaLibre.trim() || null,
      cantidad: this.cantidad,
      precioUnitario: this.precioUnitario,
    });
    this.router.navigate(['/']);
  }

  volver(): void {
    this.router.navigate(['/']);
  }
}
