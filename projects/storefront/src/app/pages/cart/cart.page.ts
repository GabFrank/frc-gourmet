import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'sf-cart',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Tu pedido</h1>

      <p class="sf-muted" *ngIf="cart.items.length === 0">
        Tu carrito está vacío. <a routerLink="/">Ver la carta</a>.
      </p>

      <div class="sf-line" *ngFor="let it of cart.items; let i = index">
        <div class="sf-line-info">
          <div class="sf-line-nombre">{{ it.nombreProducto }}</div>
          <div class="sf-muted sf-line-pres">{{ it.nombrePresentacion }} · {{ it.precioUnitario | number:'1.0-2' }}</div>
        </div>
        <div class="sf-qty">
          <button class="sf-qbtn" (click)="cart.cambiarCantidad(i, -1)">−</button>
          <span>{{ it.cantidad }}</span>
          <button class="sf-qbtn" (click)="cart.cambiarCantidad(i, 1)">+</button>
        </div>
        <div class="sf-line-total">{{ it.precioUnitario * it.cantidad | number:'1.0-2' }}</div>
      </div>

      <div class="sf-total" *ngIf="cart.items.length > 0">
        <span>Subtotal</span>
        <strong>{{ cart.subtotal | number:'1.0-2' }}</strong>
      </div>

      <button class="sf-btn sf-full" *ngIf="cart.items.length > 0" (click)="continuar()">
        Continuar
      </button>
    </div>
  `,
  styles: [`
    .sf-title { font-size: 22px; margin: 4px 0 16px; }
    .sf-line { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--sf-border); }
    .sf-line-info { flex: 1; }
    .sf-line-nombre { font-weight: 600; }
    .sf-line-pres { font-size: 13px; }
    .sf-qty { display: flex; align-items: center; gap: 10px; }
    .sf-qbtn { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--sf-border); background: var(--sf-surface); color: var(--sf-text); font-size: 18px; }
    .sf-line-total { width: 90px; text-align: right; font-weight: 600; }
    .sf-total { display: flex; justify-content: space-between; padding: 16px 0; font-size: 18px; }
    .sf-full { width: 100%; }
  `],
})
export class CartPage {
  cart = inject(CartService);
  private router = inject(Router);

  continuar(): void {
    this.router.navigate(['/checkout']);
  }
}
