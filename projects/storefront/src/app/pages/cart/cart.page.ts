import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'sf-cart',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sf-container cart-body">
      <h1 class="title">Tu pedido</h1>

      <div class="empty sf-card" *ngIf="cart.items.length === 0">
        <div class="empty-ic">🛒</div>
        <p>Tu carrito está vacío.</p>
        <a routerLink="/" class="sf-btn sf-btn--ghost">Ver la carta</a>
      </div>

      <div class="line" *ngFor="let it of cart.items">
        <div class="line-main">
          <div class="line-top">
            <span class="line-nombre">{{ it.nombreProducto }}</span>
            <button class="line-del" (click)="cart.quitar(it.uid)" aria-label="Quitar">✕</button>
          </div>
          <div class="line-perso sf-muted" *ngIf="cart.resumen(it)">{{ cart.resumen(it) }}</div>
          <div class="line-bottom">
            <div class="sf-stepper sm">
              <button (click)="cart.cambiarCantidad(it.uid, -1)">−</button>
              <span class="qty">{{ it.cantidad }}</span>
              <button (click)="cart.cambiarCantidad(it.uid, 1)">+</button>
            </div>
            <span class="line-total">{{ it.precioUnitario * it.cantidad | number:'1.0-2' }}</span>
          </div>
        </div>
      </div>

      <div class="resumen sf-card" *ngIf="cart.items.length > 0">
        <div class="row"><span>Subtotal</span><strong>{{ cart.subtotal | number:'1.0-2' }}</strong></div>
      </div>
    </div>

    <div class="sf-sticky-bar" *ngIf="cart.items.length > 0">
      <button class="sf-btn sf-btn--block" (click)="continuar()">Continuar · {{ cart.subtotal | number:'1.0-2' }}</button>
    </div>
  `,
  styles: [`
    .cart-body { padding-bottom: 90px; }
    .title { font-size: 22px; font-weight: 800; margin: 4px 0 16px; }
    .empty { text-align: center; padding: 32px 16px; }
    .empty-ic { font-size: 40px; margin-bottom: 8px; }
    .empty p { color: var(--sf-text-muted); margin: 0 0 16px; }
    .line { background: var(--sf-surface); border-radius: var(--sf-radius); box-shadow: var(--sf-shadow-card); padding: 14px; margin-bottom: 10px; }
    .line-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .line-nombre { font-weight: 600; font-size: 15px; }
    .line-del { border: none; background: none; color: var(--sf-text-muted); font-size: 15px; }
    .line-perso { font-size: 13px; margin-top: 4px; line-height: 1.4; }
    .line-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .sf-stepper.sm button { width: 32px; height: 32px; font-size: 18px; }
    .line-total { font-weight: 700; font-size: 15px; }
    .resumen { margin-top: 6px; }
    .resumen .row { display: flex; justify-content: space-between; font-size: 16px; }
  `],
})
export class CartPage {
  cart = inject(CartService);
  private router = inject(Router);
  continuar(): void { this.router.navigate(['/checkout']); }
}
