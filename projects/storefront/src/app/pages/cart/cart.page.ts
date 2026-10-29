import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { CartService, avisosRevalidacion } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { AppImgPipe } from '../../core/app-img.pipe';
import { IconComponent } from '../../core/icon.component';
import { GuaraniPipe } from '../../core/guarani.pipe';

@Component({
  selector: 'sf-cart',
  standalone: true,
  imports: [GuaraniPipe, CommonModule, RouterLink, AppImgPipe, IconComponent],
  template: `
    <div class="sf-container cart-body">
      <h1 class="title">Tu pedido</h1>

      <div class="aviso sf-card" *ngIf="avisos.length" role="status">
        <div *ngFor="let a of avisos">{{ a }}</div>
      </div>

      <div class="empty sf-card" *ngIf="cart.items.length === 0">
        <div class="empty-ic"><sf-icon name="cart" [size]="40"></sf-icon></div>
        <p>Tu carrito está vacío.</p>
        <a routerLink="/" class="sf-btn sf-btn--ghost">Ver la carta</a>
      </div>

      <div class="line" *ngFor="let it of cart.items">
        <div class="line-photo" [style.background-image]="(it.imageUrl | appImg) ? 'url(' + (it.imageUrl | appImg) + ')' : null">
          <sf-icon *ngIf="!(it.imageUrl | appImg)" name="bag" [size]="22"></sf-icon>
        </div>
        <div class="line-main">
          <div class="line-top">
            <span class="line-nombre">{{ it.nombreProducto }}</span>
            <button class="line-del" (click)="cart.quitar(it.uid)" aria-label="Quitar"><sf-icon name="x" [size]="16"></sf-icon></button>
          </div>
          <div class="line-perso sf-muted" *ngIf="cart.resumen(it)">{{ cart.resumen(it) }}</div>
          <div class="line-bottom">
            <div class="sf-stepper sm">
              <button (click)="cart.cambiarCantidad(it.uid, -1)">−</button>
              <span class="qty">{{ it.cantidad }}</span>
              <button (click)="cart.cambiarCantidad(it.uid, 1)">+</button>
            </div>
            <span class="line-total">{{ it.precioUnitario * it.cantidad | guarani }}</span>
          </div>
        </div>
      </div>

      <div class="resumen sf-card" *ngIf="cart.items.length > 0">
        <div class="row"><span>Subtotal</span><strong>{{ cart.subtotal | guarani }}</strong></div>
      </div>
    </div>

    <div class="sf-sticky-bar" *ngIf="cart.items.length > 0">
      <button class="sf-btn sf-btn--block" [disabled]="revalidando" (click)="continuar()">Continuar · {{ cart.subtotal | guarani }}</button>
    </div>
  `,
  styles: [`
    .cart-body { padding-bottom: 90px; }
    .title { font-size: 22px; font-weight: 800; margin: 4px 0 16px; }
    .empty { text-align: center; padding: 32px 16px; }
    .empty-ic { color: var(--sf-text-muted); margin-bottom: 8px; display: flex; justify-content: center; }
    .empty p { color: var(--sf-text-muted); margin: 0 0 16px; }
    .line { display: flex; gap: 12px; align-items: flex-start; background: var(--sf-surface); border-radius: var(--sf-radius); box-shadow: var(--sf-shadow-card); padding: 14px; margin-bottom: 10px; }
    .aviso { background: var(--sf-primary-surface); color: var(--sf-text); font-size: 14px; line-height: 1.4; margin-bottom: 12px; }
    .line-photo { display: flex; align-items: center; justify-content: center; color: var(--sf-text-muted); width: 56px; height: 56px; border-radius: var(--sf-radius-sm); background-size: cover; background-position: center; background-color: var(--sf-surface-alt); flex-shrink: 0; }
    .line-main { flex: 1; min-width: 0; }
    .line-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .line-nombre { font-weight: 600; font-size: 15px; }
    .line-del { border: none; background: none; color: var(--sf-text-muted); display: inline-flex; align-items: center; padding: 0; }
    .line-perso { font-size: 13px; margin-top: 4px; line-height: 1.4; }
    .line-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; }
    .sf-stepper.sm button { width: 32px; height: 32px; font-size: 18px; }
    .line-total { font-weight: 700; font-size: 15px; }
    .resumen { margin-top: 6px; }
    .resumen .row { display: flex; justify-content: space-between; font-size: 16px; }
  `],
})
export class CartPage implements OnInit {
  cart = inject(CartService);
  private menu = inject(MenuService);
  private router = inject(Router);
  avisos: string[] = [];
  revalidando = false;

  ngOnInit(): void {
    if (!this.cart.items.length) return;
    this.revalidando = true;
    this.menu.cargar(true).subscribe({
      next: (m) => { this.avisos = avisosRevalidacion(this.cart.revalidar(m)); this.revalidando = false; },
      error: () => (this.revalidando = false), // sin carta: el server igual valida al confirmar
    });
  }

  continuar(): void { this.router.navigate(['/checkout']); }
}
