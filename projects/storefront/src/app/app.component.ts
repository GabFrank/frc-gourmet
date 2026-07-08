import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CartService } from './core/cart.service';
import { AuthService } from './core/auth.service';

@Component({
  selector: 'sf-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  template: `
    <header class="sf-header">
      <a routerLink="/" class="sf-brand">🍔 Pedí Online</a>
      <nav class="sf-nav">
        <a routerLink="/mis-pedidos" class="sf-nav-link" *ngIf="auth.isAuthenticated">Mis pedidos</a>
        <a routerLink="/cuenta" class="sf-nav-link" *ngIf="auth.isAuthenticated">
          {{ auth.cuenta?.nombre || auth.cuenta?.telefono || 'Cuenta' }}
        </a>
        <a routerLink="/login" class="sf-nav-link" *ngIf="!auth.isAuthenticated">Ingresar</a>
        <a routerLink="/carrito" class="sf-cart" aria-label="Carrito">
          🛒<span class="sf-badge" *ngIf="cart.count > 0">{{ cart.count }}</span>
        </a>
      </nav>
    </header>
    <main class="sf-main">
      <router-outlet></router-outlet>
    </main>
  `,
  styles: [`
    .sf-header {
      position: sticky; top: 0; z-index: 10;
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 16px;
      background: var(--sf-primary); color: #fff;
    }
    .sf-brand { color: #fff; text-decoration: none; font-weight: 700; font-size: 18px; }
    .sf-nav { display: flex; align-items: center; gap: 14px; }
    .sf-nav-link { color: #fff; text-decoration: none; font-size: 14px; opacity: .95; }
    .sf-cart { position: relative; color: #fff; text-decoration: none; font-size: 20px; }
    .sf-badge {
      position: absolute; top: -8px; right: -10px;
      background: #fff; color: var(--sf-primary);
      border-radius: 10px; font-size: 11px; font-weight: 700;
      min-width: 18px; height: 18px; line-height: 18px; text-align: center; padding: 0 4px;
    }
    .sf-main { min-height: calc(100vh - 56px); }
  `],
})
export class AppComponent {
  cart = inject(CartService);
  auth = inject(AuthService);
}
