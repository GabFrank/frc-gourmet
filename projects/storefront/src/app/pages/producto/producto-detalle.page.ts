import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { CartService } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { ConfigService } from '../../core/config.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { IconComponent } from '../../core/icon.component';
import { MenuProducto, MenuOpcion, MenuAdicional, MenuObservacion } from '../../core/models';

@Component({
  selector: 'sf-producto-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, AppImgPipe, IconComponent],
  templateUrl: './producto-detalle.page.html',
  styleUrls: ['./producto-detalle.page.scss'],
})
export class ProductoDetallePage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private menuSvc = inject(MenuService);
  cart = inject(CartService);
  config = inject(ConfigService);

  producto: MenuProducto | null = null;
  cargando = true;

  opcionSel: MenuOpcion | null = null;
  adicionalesSel = new Set<number>();
  observacionesSel = new Set<number>();
  notaLibre = '';
  cantidad = 1;

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.menuSvc.cargar().subscribe({
      next: () => {
        this.producto = this.menuSvc.producto(id);
        this.opcionSel = this.producto?.opciones?.[0] || null;
        this.cargando = false;
      },
      error: () => (this.cargando = false),
    });
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

  get precioAdicionales(): number {
    if (!this.producto) return 0;
    return this.producto.adicionales
      .filter((a) => this.adicionalesSel.has(a.id))
      .reduce((s, a) => s + a.precio, 0);
  }

  get precioUnitario(): number {
    return (this.opcionSel?.precio || 0) + this.precioAdicionales;
  }

  get total(): number {
    return this.precioUnitario * this.cantidad;
  }

  get puedeAgregar(): boolean {
    return !!this.opcionSel && this.config.config.abiertaAhora;
  }

  agregar(): void {
    if (!this.producto || !this.opcionSel) return;
    const adicionales = this.producto.adicionales.filter((a) => this.adicionalesSel.has(a.id));
    const observaciones = this.producto.observaciones.filter((o) => this.observacionesSel.has(o.id));
    this.cart.agregar({
      productoId: this.producto.id,
      nombreProducto: this.producto.nombre,
      imageUrl: this.producto.imageUrl,
      opcion: this.opcionSel,
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
