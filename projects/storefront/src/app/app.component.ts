import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink } from '@angular/router';
import { CartService } from './core/cart.service';
import { AuthService } from './core/auth.service';
import { ConfigService } from './core/config.service';
import { MesaService } from './core/mesa.service';
import { IconComponent } from './core/icon.component';

@Component({
  selector: 'sf-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, IconComponent],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">{{ config.config.nombreComercio || 'Pedí Online' }}</a>
      <nav class="nav">
        <a routerLink="/mis-pedidos" class="nav-link" *ngIf="auth.isAuthenticated" aria-label="Mis pedidos">
          <sf-icon name="receipt" [size]="21"></sf-icon>
        </a>
        <a routerLink="/cuenta" class="nav-link" *ngIf="auth.isAuthenticated" aria-label="Cuenta">
          <sf-icon name="user" [size]="21"></sf-icon>
        </a>
        <a routerLink="/login" class="nav-link nav-login" *ngIf="!auth.isAuthenticated && !mesa.enMesa">Ingresar</a>
      </nav>
    </header>
    <div class="mesa-banner" *ngIf="mesa.enMesa">
      <sf-icon name="pin" [size]="15"></sf-icon>
      <span *ngIf="mesa.ctx">Estás en la <strong>Mesa {{ mesa.ctx.numero }}</strong></span>
      <span *ngIf="!mesa.ctx">Mesa</span>
    </div>
    <main><router-outlet></router-outlet></main>
  `,
  styles: [`
    :host { display: block; min-height: 100%; }
    .topbar {
      position: sticky; top: 0; z-index: 30;
      height: var(--sf-header-h);
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 16px;
      background: var(--sf-surface);
      border-bottom: 1px solid var(--sf-divider);
    }
    .brand { color: var(--sf-primary); text-decoration: none; font-weight: 800; font-size: 18px; letter-spacing: -.2px; }
    .nav { display: flex; align-items: center; gap: 6px; }
    .nav-link { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 40px; text-decoration: none; color: var(--sf-text); border-radius: 50%; }
    .nav-link:hover { background: var(--sf-surface-alt); }
    .nav-link .ic { font-size: 19px; }
    .nav-login { color: var(--sf-primary); font-weight: 600; width: auto; padding: 0 12px; border-radius: var(--sf-pill); }
    .mesa-banner {
      position: sticky; top: var(--sf-header-h); z-index: 29;
      display: flex; align-items: center; gap: 6px;
      padding: 6px 16px; font-size: 13px; font-weight: 600;
      color: #fff; background: var(--sf-primary);
    }
    main { min-height: calc(100vh - var(--sf-header-h)); }
  `],
})
export class AppComponent implements OnInit {
  cart = inject(CartService);
  auth = inject(AuthService);
  config = inject(ConfigService);
  mesa = inject(MesaService);

  ngOnInit(): void {
    this.config.load();
    this.mesa.capturar();
  }
}
