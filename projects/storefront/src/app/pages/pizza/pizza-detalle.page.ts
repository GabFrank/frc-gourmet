import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { ConfigService } from '../../core/config.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { MenuProducto, MenuSaborPizza, MenuTamano, MenuAdicional, MenuObservacion, PersonalizacionReceta, PersonalizacionSabor } from '../../core/models';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { PrecioPipe } from '../../core/precio.pipe';
import { MonedasService } from '../../core/monedas.service';
import { IconComponent } from '../../core/icon.component';

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
  imports: [IconComponent, GuaraniPipe, PrecioPipe, CommonModule, FormsModule, AppImgPipe],
  templateUrl: './pizza-detalle.page.html',
  styleUrls: ['./pizza-detalle.page.scss'],
})
export class PizzaDetallePage implements OnInit {
  /** F8: moneda en que se ven los precios (argumento del pipe `precio`). */
  monedas = inject(MonedasService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private menuSvc = inject(MenuService);
  cart = inject(CartService);
  config = inject(ConfigService);

  producto: MenuProducto | null = null;
  saborEntrada: MenuSaborPizza | null = null;
  cargando = true;

  tamanos: MenuTamano[] = [];
  /** Cabecera de la pantalla: sigue a los sabores elegidos (el de entrada se puede quitar). */
  tituloCab = '';
  descCab = '';
  imagenCab: string | null = null;
  /** Sabores del mitad y mitad: todos los que tienen precio en el tamaño elegido. */
  saboresMitad: MenuSaborPizza[] = [];
  soloUnSabor = false;
  presSel: number | null = null;
  saboresSel: MenuSaborPizza[] = [];
  montarMitad = false;

  adicionalesSel = new Set<number>();
  observacionesSel = new Set<number>();
  notaLibre = '';
  cantidad = 1;

  /** F6b: personalización de cada sabor (como el PdV), y el sabor abierto en la hoja. */
  persSabores = new Map<number, PersonalizacionSabor>();
  hojaSabor: MenuSaborPizza | null = null;
  avisoPers = '';

  ngOnInit(): void {
    // El detalle abre siempre desde arriba (la foto entera), venga de donde venga en la carta.
    window.scrollTo({ top: 0 });
    const productoId = Number(this.route.snapshot.paramMap.get('productoId'));
    const saborId = Number(this.route.snapshot.paramMap.get('saborId'));
    this.menuSvc.cargar().subscribe({
      next: () => {
        const p = this.menuSvc.producto(productoId);
        if (p && p.esPizza && p.sabores?.length) {
          this.producto = p;
          this.saborEntrada = p.sabores.find((s) => s.saborId === saborId) || p.sabores[0];
          this.saboresSel = this.saborEntrada ? [this.saborEntrada] : [];
          this.recalcularTamanos();
          this.presSel = this.tamanos[0]?.presentacionId ?? null;
          this.actualizarVista();
        }
        this.cargando = false;
      },
      error: () => (this.cargando = false),
    });
  }

  /** Tamaños que el primer sabor elegido tiene cotizados (todos los elegidos tienen precio en el tamaño actual). */
  private recalcularTamanos(): void {
    const ref = this.saboresSel[0];
    this.tamanos = ref
      ? (this.producto?.tamanos || []).filter((t) => ref.precios.some((pr) => pr.presentacionId === t.presentacionId))
      : [];
  }

  /** Recalcula lo que depende de los sabores elegidos y del tamaño (cabecera y lista de mitad y mitad). */
  private actualizarVista(): void {
    const p = this.producto;
    const primero = this.saboresSel[0] || null;
    if (!p || !primero) return;
    const entradaPrimero = primero.saborId === this.saborEntrada?.saborId;
    if (this.saboresSel.length > 1 && !entradaPrimero) {
      this.tituloCab = p.nombre;
      this.descCab = this.resumenSabores;
    } else {
      this.tituloCab = `${p.nombre} ${primero.nombre}`;
      this.descCab = primero.descripcion || '';
    }
    this.imagenCab = primero.imageUrl || p.imageUrl || null;
    this.soloUnSabor = this.saboresSel.length <= 1;
    this.saboresMitad = this.presSel == null
      ? []
      : (p.sabores || []).filter((s) => s.precios.some((pr) => pr.presentacionId === this.presSel));
  }

  get maxSabores(): number {
    return this.producto?.pizzaConfig?.maxSabores ?? 1;
  }

  get permiteMitad(): boolean {
    return this.maxSabores > 1;
  }

  private precioDe(s: MenuSaborPizza, presId: number | null): number | null {
    if (presId == null) return null;
    const pr = s.precios.find((x) => x.presentacionId === presId);
    return pr ? pr.precio : null;
  }

  precioTamano(t: MenuTamano): number | null {
    // Precio del primer sabor elegido para ese tamaño (referencia del selector).
    return this.saboresSel[0] ? this.precioDe(this.saboresSel[0], t.presentacionId) : null;
  }

  setTamano(t: MenuTamano): void {
    // La personalización es de la receta sabor × tamaño: otro tamaño, otra receta.
    if (this.presSel !== t.presentacionId && this.hayPersonalizacion) {
      this.persSabores.clear();
      this.avisoPers = 'Cambiaste el tamaño: volvé a personalizar los sabores.';
    }
    this.presSel = t.presentacionId;
    // Quitar sabores que no tengan precio en el nuevo tamaño (el primero siempre lo tiene: define los tamaños).
    this.saboresSel = this.saboresSel.filter(
      (s, i) => i === 0 || this.precioDe(s, this.presSel) != null,
    );
    this.actualizarVista();
  }

  toggleSaborExtra(s: MenuSaborPizza): void {
    const idx = this.saboresSel.findIndex((x) => x.saborId === s.saborId);
    if (idx >= 0) {
      if (this.saboresSel.length <= 1) return; // siempre queda al menos un sabor
      this.saboresSel.splice(idx, 1);
      this.persSabores.delete(s.saborId);
      this.recalcularTamanos();
    } else if (this.saboresSel.length < this.maxSabores) {
      this.saboresSel.push(s);
    }
    this.actualizarVista();
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

  // ── F6b: personalizar cada sabor ──────────────────────────────────────────
  /** Con el interruptor de la tienda prendido, el menú trae qué se puede tocar de cada receta. */
  get personalizaPorSabor(): boolean {
    return !!this.menuSvc.actual?.personalizacionPorReceta;
  }

  opcionesDe(s: MenuSaborPizza): PersonalizacionReceta | null {
    const recetaId = s.precios.find((x) => x.presentacionId === this.presSel)?.recetaId;
    const mapa = this.menuSvc.actual?.personalizacionPorReceta;
    return recetaId && mapa ? mapa[String(recetaId)] || null : null;
  }

  persDe(s: MenuSaborPizza): PersonalizacionSabor {
    let ps = this.persSabores.get(s.saborId);
    if (!ps) {
      ps = { saborId: s.saborId, nombreSabor: s.nombre, quitar: [], cambios: [], adicionales: [] };
      this.persSabores.set(s.saborId, ps);
    }
    return ps;
  }

  resumenPers(s: MenuSaborPizza): string {
    const ps = this.persSabores.get(s.saborId);
    if (!ps) return '';
    return [
      ...ps.quitar.map((q) => `Sin ${q.nombre.toLowerCase()}`),
      ...ps.cambios.map((c) => `${c.nombre.toLowerCase()} → ${c.reemplazoNombre.toLowerCase()}`),
      ...ps.adicionales.map((a) => `+ ${a.nombre.toLowerCase()}`),
    ].join(' · ');
  }

  abrirHoja(s: MenuSaborPizza): void {
    this.avisoPers = '';
    this.hojaSabor = s;
  }

  cerrarHoja(): void {
    this.hojaSabor = null;
  }

  estaQuitado(s: MenuSaborPizza, id: number): boolean {
    return this.persDe(s).quitar.some((q) => q.id === id);
  }

  toggleQuitar(s: MenuSaborPizza, q: { id: number; nombre: string }): void {
    const ps = this.persDe(s);
    const i = ps.quitar.findIndex((x) => x.id === q.id);
    if (i >= 0) ps.quitar.splice(i, 1);
    else ps.quitar.push({ id: q.id, nombre: q.nombre });
  }

  cambioDe(s: MenuSaborPizza, recetaIngredienteId: number): number | null {
    return this.persDe(s).cambios.find((c) => c.recetaIngredienteId === recetaIngredienteId)?.productoId ?? null;
  }

  setCambio(s: MenuSaborPizza, c: PersonalizacionReceta['cambiables'][number], productoId: number | null): void {
    const ps = this.persDe(s);
    ps.cambios = ps.cambios.filter((x) => x.recetaIngredienteId !== c.id);
    const op = c.opciones.find((o) => o.productoId === Number(productoId));
    if (op) ps.cambios.push({ recetaIngredienteId: c.id, nombre: c.nombre, productoId: op.productoId, reemplazoNombre: op.nombre });
  }

  tieneAdicionalSabor(s: MenuSaborPizza, id: number): boolean {
    return this.persDe(s).adicionales.some((a) => a.id === id);
  }

  toggleAdicionalSabor(s: MenuSaborPizza, a: MenuAdicional): void {
    const ps = this.persDe(s);
    const i = ps.adicionales.findIndex((x) => x.id === a.id);
    if (i >= 0) ps.adicionales.splice(i, 1);
    else ps.adicionales.push({ ...a });
  }

  /** Lo que suma un adicional en este sabor: precio × proporción (mitad → 50 %), como el PdV. */
  precioEnSabor(a: MenuAdicional): number {
    return Math.round(a.precio / Math.max(1, this.saboresSel.length));
  }

  get hayPersonalizacion(): boolean {
    return [...this.persSabores.values()].some((ps) => ps.quitar.length || ps.cambios.length || ps.adicionales.length);
  }

  get precioPersonalizacion(): number {
    const n = Math.max(1, this.saboresSel.length);
    let total = 0;
    for (const s of this.saboresSel) {
      for (const a of this.persSabores.get(s.saborId)?.adicionales || []) total += a.precio / n;
    }
    return Math.round(total);
  }

  get precioUnitario(): number {
    return this.precioBase + this.precioAdicionales + this.precioPersonalizacion;
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
      imageUrl: this.saboresSel[0]?.imageUrl || this.producto.imageUrl,
      opcion: {
        tipo: 'PIZZA',
        label,
        presentacionId: this.presSel,
        saborIds: this.saboresSel.map((s) => s.saborId),
        personalizacionSabores: this.saboresSel
          .map((s) => this.persSabores.get(s.saborId))
          .filter((ps): ps is PersonalizacionSabor => !!ps && !!(ps.quitar.length || ps.cambios.length || ps.adicionales.length)),
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
