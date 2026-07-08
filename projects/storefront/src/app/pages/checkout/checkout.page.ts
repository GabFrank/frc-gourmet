import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { CartService } from '../../core/cart.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { ZonaDelivery, TipoPedido } from '../../core/models';

@Component({
  selector: 'sf-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Finalizar pedido</h1>

      <ng-container *ngIf="!auth.isAuthenticated">
        <div class="sf-card">
          <p>Necesitás ingresar para completar tu pedido.</p>
          <button class="sf-btn" (click)="irLogin()">Ingresar con mi teléfono</button>
        </div>
      </ng-container>

      <div class="sf-card sf-cerrada" *ngIf="config.loaded && !config.config.abiertaAhora">
        🕒 La tienda está cerrada ahora. No se pueden tomar pedidos.
      </div>

      <ng-container *ngIf="auth.isAuthenticated && config.config.abiertaAhora">
        <div class="sf-card">
          <h3>Tipo de pedido</h3>
          <div class="sf-choices">
            <button class="sf-choice" *ngIf="config.config.permitePickup" [class.active]="tipo === 'PICKUP'" (click)="setTipo('PICKUP')">🏃 Retiro</button>
            <button class="sf-choice" *ngIf="config.config.permiteDelivery" [class.active]="tipo === 'DELIVERY'" (click)="setTipo('DELIVERY')">🛵 Delivery</button>
          </div>
          <p class="sf-muted sf-prep" *ngIf="config.config.prepTimeMinutos">⏱ Preparación estimada: {{ config.config.prepTimeMinutos }} min.</p>
        </div>

        <div class="sf-card" *ngIf="tipo === 'DELIVERY'">
          <h3>Entrega</h3>
          <label class="sf-label">Zona</label>
          <select class="sf-input" [(ngModel)]="zonaId" (ngModelChange)="recomputar()">
            <option [ngValue]="null" disabled>Elegí una zona</option>
            <option *ngFor="let z of zonas" [ngValue]="z.id">
              {{ z.nombre }} — envío {{ z.tarifa | number:'1.0-2' }}
              <ng-container *ngIf="z.montoMinimo > 0"> (mín. {{ z.montoMinimo | number:'1.0-2' }})</ng-container>
            </option>
          </select>
          <label class="sf-label">Dirección</label>
          <input class="sf-input" [(ngModel)]="direccion" placeholder="Calle, número, barrio" />
          <label class="sf-label">Referencia (opcional)</label>
          <input class="sf-input" [(ngModel)]="referencia" placeholder="Casa, timbre, etc." />
        </div>

        <div class="sf-card">
          <label class="sf-label">Notas (opcional)</label>
          <input class="sf-input" [(ngModel)]="notas" placeholder="Sin cebolla, etc." />
        </div>

        <div class="sf-card sf-totales">
          <div class="sf-row"><span>Subtotal</span><span>{{ cart.subtotal | number:'1.0-2' }}</span></div>
          <div class="sf-row" *ngIf="tipo === 'DELIVERY'"><span>Envío</span><span>{{ costoEnvio | number:'1.0-2' }}</span></div>
          <div class="sf-row sf-grand"><strong>Total</strong><strong>{{ total | number:'1.0-2' }}</strong></div>
        </div>

        <p class="sf-muted">Pago: efectivo contra entrega/retiro (el pago online llega pronto).</p>
        <p class="sf-error" *ngIf="error">{{ error }}</p>

        <button class="sf-btn sf-full" [disabled]="enviando || cart.items.length === 0" (click)="confirmar()">
          {{ enviando ? 'Enviando…' : 'Confirmar pedido' }}
        </button>
      </ng-container>
    </div>
  `,
  styles: [`
    .sf-title { font-size: 22px; margin: 4px 0 16px; }
    .sf-card { margin-bottom: 14px; }
    .sf-card h3 { margin: 0 0 10px; font-size: 15px; }
    .sf-choices { display: flex; gap: 10px; }
    .sf-choice { flex: 1; padding: 14px; border-radius: var(--sf-radius); border: 1px solid var(--sf-border); background: var(--sf-surface); color: var(--sf-text); font-weight: 600; }
    .sf-choice.active { border-color: var(--sf-primary); color: var(--sf-primary); }
    .sf-label { display: block; font-size: 13px; color: var(--sf-text-muted); margin: 10px 0 4px; }
    .sf-row { display: flex; justify-content: space-between; padding: 4px 0; }
    .sf-grand { font-size: 18px; margin-top: 6px; border-top: 1px solid var(--sf-border); padding-top: 10px; }
    .sf-full { width: 100%; }
    .sf-error { color: #c0392b; }
    .sf-cerrada { background: rgba(249,168,37,.15); color: #b8860b; font-weight: 600; }
    .sf-prep { margin: 10px 0 0; font-size: 13px; }
  `],
})
export class CheckoutPage implements OnInit {
  private api = inject(PublicApiService);
  private router = inject(Router);
  cart = inject(CartService);
  auth = inject(AuthService);
  config = inject(ConfigService);

  tipo: TipoPedido = 'PICKUP';
  zonas: ZonaDelivery[] = [];
  zonaId: number | null = null;
  direccion = '';
  referencia = '';
  notas = '';
  enviando = false;
  error: string | null = null;

  costoEnvio = 0;
  total = 0;

  ngOnInit(): void {
    // Default: primer tipo permitido por la config.
    if (!this.config.config.permitePickup && this.config.config.permiteDelivery) {
      this.tipo = 'DELIVERY';
    }
    this.recomputar();
    this.api.call<ZonaDelivery[]>('zonas.get').subscribe({
      next: (z) => (this.zonas = z || []),
      error: () => {},
    });
  }

  setTipo(t: TipoPedido): void {
    this.tipo = t;
    this.recomputar();
  }

  recomputar(): void {
    const z = this.zonas.find((x) => x.id === this.zonaId);
    this.costoEnvio = this.tipo === 'DELIVERY' && z ? z.tarifa : 0;
    this.total = this.cart.subtotal + this.costoEnvio;
  }

  irLogin(): void {
    this.router.navigate(['/login'], { queryParams: { volver: '/checkout' } });
  }

  confirmar(): void {
    this.error = null;
    if (this.tipo === 'DELIVERY') {
      if (!this.zonaId) { this.error = 'Elegí una zona de entrega.'; return; }
      if (!this.direccion.trim()) { this.error = 'Ingresá la dirección.'; return; }
    }
    this.enviando = true;
    const payload = {
      tipoPedido: this.tipo,
      items: this.cart.toPedidoItems(),
      zonaDeliveryId: this.tipo === 'DELIVERY' ? this.zonaId : null,
      direccionEntrega: this.tipo === 'DELIVERY' ? this.direccion.trim() : null,
      referenciaDireccion: this.referencia.trim() || null,
      notas: this.notas.trim() || null,
      metodoPago: 'EFECTIVO',
    };
    this.api.call<any>('pedido.crear', [payload]).subscribe({
      next: (res) => {
        this.enviando = false;
        if (res?.success) {
          this.cart.limpiar();
          this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: res.numero } });
        } else {
          this.error = this.mensajeError(res);
        }
      },
      error: (e) => {
        this.enviando = false;
        this.error = 'No se pudo enviar el pedido. ' + (e?.message || '');
      },
    });
  }

  private mensajeError(res: any): string {
    switch (res?.error) {
      case 'monto_minimo_no_alcanzado':
        return `El mínimo para esta zona es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'falta_zona_delivery':
        return 'Elegí una zona de entrega.';
      case 'falta_direccion':
        return 'Ingresá la dirección.';
      case 'monto_minimo_global':
        return `El pedido mínimo es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'tienda_cerrada':
        return 'La tienda está cerrada en este momento.';
      case 'pickup_no_disponible':
        return 'El retiro no está disponible.';
      case 'delivery_no_disponible':
        return 'El delivery no está disponible.';
      default:
        return res?.error || 'No se pudo crear el pedido.';
    }
  }
}
