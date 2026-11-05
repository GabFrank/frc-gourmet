import { Component, inject, OnInit } from '@angular/core';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterOutlet, RouterLink } from '@angular/router';
import { CartService } from './core/cart.service';
import { AuthService } from './core/auth.service';
import { ConfigService } from './core/config.service';
import { MesaService } from './core/mesa.service';
import { IconComponent } from './core/icon.component';
import { destinoAtras } from './core/navegacion';
import { MonedasService } from './core/monedas.service';

@Component({
  selector: 'sf-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, IconComponent],
  template: `
    <header class="topbar">
      <a *ngIf="atras" [routerLink]="atras" class="nav-link back" aria-label="Volver"><sf-icon name="back" [size]="21"></sf-icon></a>
      <a routerLink="/" class="brand">{{ config.config.nombreComercio || 'Pedí Online' }}</a>
      <nav class="nav">
        <div class="moneda" *ngIf="monedas.hayOtras">
          <button type="button" class="nav-link nav-moneda" (click)="menuMoneda = !menuMoneda"
                  [attr.aria-expanded]="menuMoneda" aria-haspopup="listbox" aria-label="Moneda de los precios">
            {{ monedas.seleccionada?.simbolo }} <sf-icon name="chevron-down" [size]="14"></sf-icon>
          </button>
          <ul class="moneda-menu" *ngIf="menuMoneda" role="listbox" aria-label="Ver precios en">
            <li *ngFor="let m of monedas.monedas" role="option" [attr.aria-selected]="m.id === monedas.seleccionada?.id"
                [class.activa]="m.id === monedas.seleccionada?.id" (click)="elegirMoneda(m)">
              <span class="sim">{{ m.simbolo }}</span> {{ m.denominacion }}
            </li>
          </ul>
        </div>
        <a routerLink="/mis-pedidos" class="nav-link" *ngIf="auth.isAuthenticated" aria-label="Mis pedidos">
          <sf-icon name="receipt" [size]="21"></sf-icon>
        </a>
        <a routerLink="/cuenta" class="nav-link" *ngIf="auth.isAuthenticated" aria-label="Cuenta">
          <sf-icon name="user" [size]="21"></sf-icon>
        </a>
        <a routerLink="/login" class="nav-link nav-login" *ngIf="!auth.isAuthenticated && !mesa.enMesa">Ingresar</a>
      </nav>
    </header>
    <div class="moneda-aviso" *ngIf="monedas.esOtra" role="status">
      Precios aproximados en {{ monedas.seleccionada?.simbolo }} · se cobra en {{ monedas.principal?.simbolo }}
    </div>
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
    .back { margin-left: -8px; margin-right: 4px; }
    .brand { margin-right: auto; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--sf-primary); text-decoration: none; font-weight: 800; font-size: 18px; letter-spacing: -.2px; }
    .nav { display: flex; align-items: center; gap: 6px; }
    .nav-link { display: inline-flex; align-items: center; justify-content: center; min-width: 40px; height: 40px; text-decoration: none; color: var(--sf-text); border-radius: 50%; }
    .nav-link:hover { background: var(--sf-surface-alt); }
    .nav-link .ic { font-size: 19px; }
    .moneda { position: relative; }
    .nav-moneda { gap: 2px; padding: 0 10px; width: auto; border: none; background: none; font: inherit; font-weight: 700; cursor: pointer; border-radius: var(--sf-pill); }
    .moneda-menu {
      position: absolute; right: 0; top: 44px; z-index: 40; min-width: 170px; margin: 0; padding: 6px 0; list-style: none;
      background: var(--sf-surface); border-radius: var(--sf-radius); box-shadow: var(--sf-shadow-raised);
    }
    .moneda-menu li { padding: 10px 14px; cursor: pointer; font-size: 14px; color: var(--sf-text); }
    .moneda-menu li:hover { background: var(--sf-surface-alt); }
    .moneda-menu li.activa { color: var(--sf-primary); font-weight: 700; }
    .moneda-menu .sim { display: inline-block; min-width: 34px; font-weight: 700; }
    .moneda-aviso { padding: 6px 16px; font-size: 12px; text-align: center; color: var(--sf-text); background: var(--sf-warning-bg); }
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

  private router = inject(Router);
  monedas = inject(MonedasService);
  menuMoneda = false;

  elegirMoneda(m: any): void {
    this.monedas.elegir(m);
    this.menuMoneda = false;
  }
  /** Adónde vuelve la flecha de la barra; null en la carta y en las fichas (tienen la suya sobre la foto). */
  atras: string | null = null;

  ngOnInit(): void {
    this.config.load();
    this.monedas.cargar();
    this.mesa.capturar();
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => (this.atras = destinoAtras(e.urlAfterRedirects)));
  }
}

