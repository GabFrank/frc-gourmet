import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { IconComponent } from '../../core/icon.component';
import { esUrlCheckoutUpay, textoEstadoPago } from '../../core/pago-online';

/**
 * Vuelta de uPay (PLAN-tienda-online F4): /tienda/pago/<numero>. El resultado lo decide el
 * servidor consultando a uPay (nunca el ?r=ok de la URL): se pregunta cada 5 s hasta que el
 * pago queda confirmado, fallido o vencido.
 */
@Component({
  selector: 'sf-pago',
  standalone: true,
  imports: [CommonModule, RouterLink, GuaraniPipe, IconComponent],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Pago del pedido {{ numero }}</h1>
      <p class="sf-muted" *ngIf="!auth.isAuthenticated">Ingresá para ver tu pedido. <a routerLink="/login">Ingresar</a>.</p>
      <div class="sf-card" *ngIf="pedido">
        <div class="sf-pedido-head">
          <strong>{{ pedido.numero }}</strong>
          <span>{{ pedido.total | guarani }}</span>
        </div>
        <p *ngIf="estadoPago === 'PENDIENTE'" class="sf-muted">
          <sf-icon name="clock" [size]="16"></sf-icon> Confirmando tu pago con uPay… Esto puede tardar unos minutos.
        </p>
        <div class="sf-ok" *ngIf="estadoPago === 'PAGADO'">
          <sf-icon name="check" [size]="16"></sf-icon> ¡Pago confirmado! Tu pedido ya está en el local.
        </div>
        <p class="sf-error" *ngIf="estadoPago && estadoPago !== 'PENDIENTE' && estadoPago !== 'PAGADO'">{{ texto }}</p>
        <div class="sf-acciones">
          <button class="sf-btn sf-btn-primary" *ngIf="estadoPago === 'FALLIDO' && pedido.estado === 'PENDIENTE_PAGO'"
                  [disabled]="reintentando" (click)="reintentar()">Intentar de nuevo con tarjeta</button>
          <a class="sf-btn" routerLink="/mis-pedidos">Ver mis pedidos</a>
          <a class="sf-btn" routerLink="/" *ngIf="estadoPago === 'EXPIRADO' || estadoPago === 'FALLIDO'">Volver a la carta</a>
        </div>
        <p class="sf-error" *ngIf="error">{{ error }}</p>
      </div>
      <p class="sf-muted" *ngIf="!pedido && cargando">Cargando…</p>
    </div>
  `,
})
export class PagoPage implements OnInit, OnDestroy {
  private api = inject(PublicApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);
  numero = '';
  pedido: any = null;
  cargando = true;
  reintentando = false;
  error: string | null = null;
  private timer: any = null;

  get estadoPago(): string | null { return this.pedido?.estadoPago ?? null; }
  get texto(): string | null { return textoEstadoPago(this.estadoPago, this.pedido?.pagoMonto ?? this.pedido?.total); }

  ngOnInit(): void {
    this.numero = this.route.snapshot.paramMap.get('numero') || '';
    if (!this.auth.isAuthenticated) { this.cargando = false; return; }
    this.verificar();
    this.timer = setInterval(() => this.verificar(), 5000);
  }

  ngOnDestroy(): void { if (this.timer) clearInterval(this.timer); }

  verificar(): void {
    this.api.call<any>('pedido.pago.verificar', [this.numero]).subscribe({
      next: (r) => {
        this.cargando = false;
        if (r?.success && r.pedido) {
          this.pedido = r.pedido;
          if (this.estadoPago !== 'PENDIENTE' && this.timer) { clearInterval(this.timer); this.timer = null; }
        } else {
          this.error = 'No encontramos ese pedido.';
        }
      },
      error: () => { this.cargando = false; },
    });
  }

  reintentar(): void {
    this.reintentando = true;
    this.error = null;
    this.api.call<any>('pedido.pago.iniciar', [this.numero, { nuevoIntento: true }]).subscribe({
      next: (r) => {
        this.reintentando = false;
        if (r?.success && esUrlCheckoutUpay(r.checkoutUrl)) { window.location.href = r.checkoutUrl; return; }
        this.error = 'No pudimos abrir el pago con tarjeta. Probá de nuevo en un rato.';
      },
      error: () => { this.reintentando = false; this.error = 'No pudimos abrir el pago con tarjeta.'; },
    });
  }
}
