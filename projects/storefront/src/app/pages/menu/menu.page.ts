import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { CartService } from '../../core/cart.service';
import { MenuSnapshot, MenuProducto, MenuPresentacion, MenuCategoria } from '../../core/models';

@Component({
  selector: 'sf-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Nuestra carta</h1>

      <p class="sf-muted" *ngIf="cargando">Cargando carta…</p>
      <p class="sf-error" *ngIf="error">{{ error }}</p>

      <ng-container *ngIf="menu">
        <p class="sf-muted" *ngIf="!menu.productos.length">No hay productos disponibles online por ahora.</p>

        <section *ngFor="let cat of menu.categorias" class="sf-cat">
          <h2 class="sf-cat-title">{{ cat.nombre }}</h2>
          <div class="sf-prod" *ngFor="let p of productosDe(cat)">
            <img *ngIf="p.imageUrl" [src]="p.imageUrl" class="sf-prod-img" alt="" />
            <div class="sf-prod-body">
              <div class="sf-prod-nombre">{{ p.nombre }}</div>
              <div class="sf-pres" *ngFor="let pr of p.presentaciones">
                <span class="sf-pres-nombre">{{ pr.nombre }}</span>
                <span class="sf-pres-precio">{{ pr.moneda?.simbolo || '' }} {{ pr.precio | number:'1.0-2' }}</span>
                <button class="sf-btn sf-add" (click)="agregar(p, pr)">Agregar</button>
              </div>
            </div>
          </div>
        </section>
      </ng-container>
    </div>

    <a routerLink="/carrito" class="sf-fab" *ngIf="cart.count > 0">
      Ver carrito ({{ cart.count }}) · {{ cart.subtotal | number:'1.0-2' }}
    </a>
  `,
  styles: [`
    .sf-title { font-size: 22px; margin: 4px 0 16px; }
    .sf-error { color: #c0392b; }
    .sf-cat { margin-bottom: 22px; }
    .sf-cat-title { font-size: 16px; text-transform: uppercase; letter-spacing: .5px; color: var(--sf-text-muted); margin: 0 0 10px; }
    .sf-prod { display: flex; gap: 12px; background: var(--sf-surface); border: 1px solid var(--sf-border); border-radius: var(--sf-radius); padding: 12px; margin-bottom: 10px; }
    .sf-prod-img { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; }
    .sf-prod-body { flex: 1; }
    .sf-prod-nombre { font-weight: 600; margin-bottom: 8px; }
    .sf-pres { display: flex; align-items: center; gap: 10px; margin: 4px 0; }
    .sf-pres-nombre { flex: 1; font-size: 14px; }
    .sf-pres-precio { font-weight: 600; font-size: 14px; }
    .sf-add { padding: 6px 12px; font-size: 13px; }
    .sf-fab {
      position: fixed; left: 16px; right: 16px; bottom: 16px;
      background: var(--sf-primary); color: #fff; text-decoration: none;
      text-align: center; padding: 14px; border-radius: var(--sf-radius); font-weight: 700;
      box-shadow: 0 4px 16px rgba(0,0,0,.2);
    }
  `],
})
export class MenuPage implements OnInit {
  private api = inject(PublicApiService);
  cart = inject(CartService);

  menu: MenuSnapshot | null = null;
  cargando = true;
  error: string | null = null;

  ngOnInit(): void {
    this.api.call<MenuSnapshot>('menu.get').subscribe({
      next: (m) => {
        this.menu = m;
        this.cargando = false;
      },
      error: (e) => {
        this.error = 'No se pudo cargar la carta. ' + (e?.message || '');
        this.cargando = false;
      },
    });
  }

  productosDe(cat: MenuCategoria): MenuProducto[] {
    return (this.menu?.productos || []).filter((p: MenuProducto) => p.categoriaId === cat.id);
  }

  agregar(p: MenuProducto, pr: MenuPresentacion): void {
    this.cart.agregar(p, pr);
  }
}
