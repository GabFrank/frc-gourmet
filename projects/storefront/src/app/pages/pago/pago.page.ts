import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { IconComponent } from '../../core/icon.component';
import { esUrlPagoPermitida, textoEstadoPago } from '../../core/pago-online';

/**
 * Página de pago del pedido: /tienda/pago/<numero> (PLAN-tienda-online F4; proveedores en
 * PLAN-tienda-pagos-proveedores).
 *
 * - Proveedor con redirección (uPay): es la página de VUELTA.
 * - Proveedor con formulario (Bancard): acá se arma el formulario de la tarjeta con el script
 *   del proveedor (solo de sus hosts), y Bancard vuelve a esta misma página al terminar.
 *
 * El resultado lo decide SIEMPRE el servidor consultando al proveedor (nunca el ?r=ok de la URL):
 * se pregunta cada 5 s hasta que el pago queda confirmado, fallido o vencido.
 */
declare const Bancard: any;
@Component({
  selector: 'sf-pago',
  standalone: true,
  imports: [CommonModule, RouterLink, GuaraniPipe, IconComponent],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Pago del pedido <span class="nowrap">{{ numero }}</span></h1>
      <p class="sf-muted" *ngIf="!auth.isAuthenticated">Ingresá para ver tu pedido. <a routerLink="/login">Ingresar</a>.</p>
      <div class="sf-card" *ngIf="pedido">
        <div class="sf-pedido-head">
          <strong>{{ pedido.numero }}</strong>
          <span>{{ pedido.total | guarani }}</span>
        </div>
        <!-- Formulario del proveedor (Bancard): la tarjeta se carga en su ventana segura, embebida. -->
        <ng-container *ngIf="formulario">
          <p class="sf-muted">Ingresá los datos de tu tarjeta. Son de {{ formularioProveedor }}: la tienda no los ve.</p>
          <div id="sf-formulario-pago" class="formulario-pago"></div>
        </ng-container>
        <p class="sf-muted" *ngIf="cancelado && estadoPago === 'PENDIENTE' && !formulario">
          Cancelaste el pago. Tu pedido sigue esperando el pago con tarjeta.
        </p>
        <p *ngIf="estadoPago === 'PENDIENTE' && !formulario && !cancelado" class="sf-muted">
          <sf-icon name="clock" [size]="16"></sf-icon> Confirmando tu pago… Esto puede tardar unos minutos.
        </p>
        <div class="sf-ok" *ngIf="estadoPago === 'PAGADO'">
          <sf-icon name="check" [size]="16"></sf-icon> ¡Pago confirmado! Tu pedido ya está en el local.
        </div>
        <p class="sf-error" *ngIf="estadoPago && estadoPago !== 'PENDIENTE' && estadoPago !== 'PAGADO'">{{ texto }}</p>
        <div class="sf-acciones">
          <button class="sf-btn sf-btn-primary" *ngIf="estadoPago === 'FALLIDO' && pedido.estado === 'PENDIENTE_PAGO'"
                  [disabled]="reintentando" (click)="reintentar()">Intentar de nuevo con tarjeta</button>
          <button class="sf-btn sf-btn-primary" *ngIf="cancelado && estadoPago === 'PENDIENTE' && pedido.estado === 'PENDIENTE_PAGO' && !formulario"
                  [disabled]="reintentando" (click)="abrirPago(false)">Pagar con tarjeta</button>
          <a class="sf-btn" routerLink="/mis-pedidos">Ver mis pedidos</a>
          <a class="sf-btn" routerLink="/" *ngIf="estadoPago === 'EXPIRADO' || estadoPago === 'FALLIDO'">Volver a la carta</a>
        </div>
        <p class="sf-error" *ngIf="error">{{ error }}</p>
      </div>
      <p class="sf-muted" *ngIf="!pedido && cargando">Cargando…</p>
    </div>
  `,
  styles: [`
    .nowrap { white-space: nowrap; }
    .sf-pedido-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; }
    .sf-ok { display: flex; align-items: flex-start; gap: 8px; color: #15803d; font-weight: 600; margin: 8px 0 16px; }
    .sf-acciones { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 12px; }
    .sf-acciones .sf-btn { text-decoration: none; }
    .formulario-pago { min-height: 360px; margin: 8px 0 12px; }
  `],
})
export class PagoPage implements OnInit, OnDestroy {
  private api = inject(PublicApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  auth = inject(AuthService);
  private config = inject(ConfigService);
  numero = '';
  pedido: any = null;
  cargando = true;
  reintentando = false;
  error: string | null = null;
  private timer: any = null;
  /** Formulario del proveedor (Bancard) en pantalla. */
  formulario = false;
  formularioProveedor = 'el banco';
  /** Volvió de Bancard con «cancelar». */
  cancelado = false;
  /** Ya se pidió el formulario en esta visita (no se vuelve a pedir en cada consulta). */
  private formularioPedido = false;

  get estadoPago(): string | null { return this.pedido?.estadoPago ?? null; }
  get texto(): string | null { return textoEstadoPago(this.estadoPago, this.pedido?.pagoMonto ?? this.pedido?.total); }

  ngOnInit(): void {
    this.numero = this.route.snapshot.paramMap.get('numero') || '';
    const r = this.route.snapshot.queryParamMap.get('r');
    this.cancelado = r === 'cancelado';
    // Volviendo del proveedor (?r=ok / ?r=error / ?r=cancelado) no se vuelve a abrir el formulario.
    if (r) this.formularioPedido = true;
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
          if (this.estadoPago !== 'PENDIENTE') this.formulario = false;
          // Llegó recién del checkout con un proveedor de formulario: se abre acá.
          if (!this.formularioPedido && this.estadoPago === 'PENDIENTE' && this.pedido.estado === 'PENDIENTE_PAGO') {
            this.formularioPedido = true;
            this.abrirPago(false);
          }
        } else {
          this.error = 'No encontramos ese pedido.';
        }
      },
      error: () => { this.cargando = false; },
    });
  }

  reintentar(): void {
    this.abrirPago(true);
  }

  /** Pide el cobro (o reusa el vigente) y lleva al cliente al proveedor o arma su formulario. */
  abrirPago(nuevoIntento: boolean): void {
    this.reintentando = true;
    this.error = null;
    this.api.call<any>('pedido.pago.iniciar', [this.numero, { nuevoIntento }]).subscribe({
      next: (r) => {
        this.reintentando = false;
        const hosts = this.config.config?.pagoOnlineHosts;
        if (r?.success && r.tipo === 'FORMULARIO' && r.procesoId && esUrlPagoPermitida(r.script, hosts)) {
          this.cancelado = false;
          this.mostrarFormulario(r.script, r.procesoId, r.proveedor);
          return;
        }
        if (r?.success && esUrlPagoPermitida(r.checkoutUrl, hosts)) { window.location.href = r.checkoutUrl; return; }
        this.error = 'No pudimos abrir el pago con tarjeta. Probá de nuevo en un rato.';
      },
      error: () => { this.reintentando = false; this.error = 'No pudimos abrir el pago con tarjeta.'; },
    });
  }

  /** Carga el script del proveedor (una vez) y arma su formulario en la página. */
  private mostrarFormulario(script: string, procesoId: string, proveedor?: string): void {
    this.formularioProveedor = proveedor === 'BANCARD' ? 'Bancard' : 'el banco';
    this.formulario = true;
    const armar = () => setTimeout(() => {
      try {
        Bancard.Checkout.createForm('sf-formulario-pago', procesoId, {});
      } catch {
        this.formulario = false;
        this.error = 'No pudimos mostrar el formulario de pago. Probá de nuevo en un rato.';
      }
    });
    if (typeof Bancard !== 'undefined') { armar(); return; }
    const s = document.createElement('script');
    s.src = script;
    s.async = true;
    s.onload = armar;
    s.onerror = () => { this.formulario = false; this.error = 'No pudimos cargar el formulario de pago. Probá de nuevo en un rato.'; };
    document.head.appendChild(s);
  }
}
