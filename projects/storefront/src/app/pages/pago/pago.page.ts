import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { IconComponent } from '../../core/icon.component';
import { esPagoPix, esUrlPagoPermitida, textoEstadoPago } from '../../core/pago-online';

/**
 * Página de pago del pedido: /tienda/pago/<numero> (PLAN-tienda-online F4; proveedores en
 * PLAN-tienda-pagos-proveedores).
 *
 * - Proveedor con redirección (uPay): es la página de VUELTA.
 * - Proveedor con formulario (Bancard): acá se arma el formulario de la tarjeta con el script
 *   del proveedor (solo de sus hosts), y Bancard vuelve a esta misma página al terminar.
 * - Proveedor con QR (IC Pay, Pix): se muestra el QR que arma el servidor y el «copia e cola»,
 *   con lo que paga el cliente en reales y la cuenta regresiva (PLAN-tienda-pagos-multi-icpay §2).
 * - Si el intento falla y hay otros proveedores prendidos, el cliente puede pagar con otro.
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
        <!-- QR Pix (IC Pay): la imagen la arma el servidor; el código se puede copiar. -->
        <div class="qr-pago" *ngIf="qr && estadoPago === 'PENDIENTE'">
          <p class="qr-monto">Pagás <strong>R$ {{ qr.monto }}</strong> <span class="sf-muted">({{ pedido.total | guarani }})</span></p>
          <img *ngIf="qr.imagen" [src]="qr.imagen" alt="Código QR Pix" class="qr-img" width="240" height="240">
          <p class="sf-muted qr-ayuda">Abrí la app de tu banco de Brasil, elegí <strong>Pix › Pagar con QR</strong> y escaneá. Si estás en el mismo teléfono, copiá el código y usá <strong>Pix copia e cola</strong>.</p>
          <button type="button" class="sf-btn sf-btn-primary qr-copiar" (click)="copiarCodigo()">{{ copiado ? '¡Código copiado!' : 'Copiar código Pix' }}</button>
          <p class="sf-muted qr-vence" *ngIf="restanteTexto">Vence en {{ restanteTexto }}</p>
          <p class="sf-muted"><sf-icon name="clock" [size]="16"></sf-icon> Apenas pagues lo confirmamos acá solo.</p>
        </div>
        <p class="sf-muted" *ngIf="cancelado && estadoPago === 'PENDIENTE' && !formulario">
          Cancelaste el pago. Tu pedido sigue esperando el pago con tarjeta.
        </p>
        <p *ngIf="estadoPago === 'PENDIENTE' && !formulario && !cancelado && !qr" class="sf-muted">
          <sf-icon name="clock" [size]="16"></sf-icon> Confirmando tu pago… Esto puede tardar unos minutos.
        </p>
        <div class="sf-ok" *ngIf="estadoPago === 'PAGADO'">
          <sf-icon name="check" [size]="16"></sf-icon> ¡Pago confirmado! Tu pedido ya está en el local.
        </div>
        <p class="sf-error" *ngIf="estadoPago && estadoPago !== 'PENDIENTE' && estadoPago !== 'PAGADO'">{{ texto }}</p>
        <div class="sf-acciones">
          <button class="sf-btn sf-btn-primary" *ngIf="estadoPago === 'FALLIDO' && pedido.estado === 'PENDIENTE_PAGO'"
                  [disabled]="reintentando" (click)="reintentar()">{{ textoReintentar }}</button>
          <ng-container *ngIf="estadoPago === 'FALLIDO' && pedido.estado === 'PENDIENTE_PAGO'">
            <button class="sf-btn" *ngFor="let o of otrosMedios" [disabled]="reintentando" (click)="pagarCon(o.id)">Pagar con {{ o.etiqueta }}</button>
          </ng-container>
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
    .qr-pago { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; margin: 4px 0 12px; }
    .qr-monto { font-size: 1.15rem; margin: 0; }
    .qr-monto strong { font-size: 1.5rem; }
    .qr-img { width: 240px; height: 240px; max-width: 100%; background: #fff; padding: 8px; border-radius: 12px; }
    .qr-ayuda { max-width: 420px; margin: 0; }
    .qr-copiar { min-width: 220px; }
    .qr-vence { margin: 0; font-variant-numeric: tabular-nums; }
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
  private scriptPago: HTMLScriptElement | null = null;
  /** QR Pix en pantalla (IC Pay). */
  qr: { payload: string; imagen?: string; moneda: string; monto: string; expiraEn: string | null } | null = null;
  copiado = false;
  restanteTexto = '';
  private reloj: any = null;
  /** Otros proveedores prendidos, para pagar con otro si este intento falló. */
  otrosMedios: { id: string; etiqueta: string }[] = [];
  textoReintentar = 'Intentar de nuevo';

  get estadoPago(): string | null { return this.pedido?.estadoPago ?? null; }
  get texto(): string | null { return textoEstadoPago(this.estadoPago, this.pedido?.pagoMonto ?? this.pedido?.total, this.pedido?.metodoPago); }

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

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.reloj) clearInterval(this.reloj);
  }

  verificar(): void {
    this.api.call<any>('pedido.pago.verificar', [this.numero]).subscribe({
      next: (r) => {
        this.cargando = false;
        if (r?.success && r.pedido) {
          this.pedido = r.pedido;
          if (this.estadoPago !== 'PENDIENTE' && this.timer) { clearInterval(this.timer); this.timer = null; }
          if (this.estadoPago !== 'PENDIENTE') { this.formulario = false; this.qr = null; this.pararReloj(); }
          this.calcularMedios();
          // Proveedor de formulario (Bancard): se arma acá. Con uno de redirección (uPay) esta es la
          // página de vuelta: nunca se manda al cliente de nuevo al proveedor sin que lo pida (si
          // no, «Atrás» desde uPay rebotaba otra vez a uPay).
          if (!this.formularioPedido && this.estadoPago === 'PENDIENTE' && this.pedido.estado === 'PENDIENTE_PAGO') {
            this.formularioPedido = true;
            this.conConfig(() => this.abrirPago(false, true));
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

  /** Tras un intento fallido: pagar con otro de los proveedores prendidos. */
  pagarCon(proveedor: string): void {
    this.abrirPago(true, false, proveedor);
  }

  /** Textos y opciones que dependen del método del pedido y de los proveedores prendidos. */
  private calcularMedios(): void {
    const metodo = String(this.pedido?.metodoPago || '').toUpperCase();
    this.textoReintentar = esPagoPix(metodo) ? 'Generar otro QR Pix' : 'Intentar de nuevo con tarjeta';
    this.otrosMedios = (this.config.config?.pagoOnlineProveedores || [])
      .filter((p) => p.id !== metodo)
      .map((p) => ({ id: p.id, etiqueta: p.etiqueta }));
  }

  copiarCodigo(): void {
    if (!this.qr) return;
    const listo = () => { this.copiado = true; setTimeout(() => (this.copiado = false), 3000); };
    const respaldo = () => {
      // Navegadores sin portapapeles asíncrono (o sin https): selección clásica.
      const t = document.createElement('textarea');
      t.value = this.qr!.payload;
      t.setAttribute('readonly', '');
      t.style.position = 'fixed';
      t.style.opacity = '0';
      document.body.appendChild(t);
      t.select();
      try { document.execCommand('copy'); listo(); } catch { this.error = 'No pudimos copiar el código. Escaneá el QR.'; }
      t.remove();
    };
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(this.qr.payload).then(listo, respaldo);
    else respaldo();
  }

  private mostrarQr(qr: any): void {
    this.formulario = false;
    this.qr = qr;
    this.copiado = false;
    this.pararReloj();
    const vence = qr?.expiraEn ? new Date(qr.expiraEn).getTime() : NaN;
    if (isNaN(vence)) { this.restanteTexto = ''; return; }
    const tic = () => {
      const s = Math.max(0, Math.round((vence - Date.now()) / 1000));
      this.restanteTexto = s > 0 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'unos segundos';
      if (s <= 0) this.pararReloj();
    };
    tic();
    this.reloj = setInterval(tic, 1000);
  }

  private pararReloj(): void {
    if (this.reloj) { clearInterval(this.reloj); this.reloj = null; }
  }

  /** Espera la config de la tienda (hosts permitidos del proveedor) antes de seguir. */
  private conConfig(fn: () => void): void {
    if (this.config.loaded) { fn(); return; }
    const sub = this.config.cambios$.subscribe(() => {
      if (!this.config.loaded) return;
      setTimeout(() => sub.unsubscribe());
      fn();
    });
  }

  /**
   * Pide el cobro (o reusa el vigente) y lleva al cliente al proveedor o arma su formulario.
   * `soloFormulario`: al entrar a la página, solo se arma el formulario; no se redirige.
   */
  abrirPago(nuevoIntento: boolean, soloFormulario = false, proveedor?: string): void {
    this.reintentando = true;
    this.error = null;
    this.api.call<any>('pedido.pago.iniciar', [this.numero, { nuevoIntento, ...(proveedor ? { proveedor } : {}) }]).subscribe({
      next: (r) => {
        this.reintentando = false;
        if (r?.success && r.tipo === 'QR' && r.qr?.payload) {
          this.cancelado = false;
          if (this.pedido) this.pedido = { ...this.pedido, estadoPago: 'PENDIENTE', ...(proveedor ? { metodoPago: proveedor } : {}) };
          this.calcularMedios();
          if (!this.timer) this.timer = setInterval(() => this.verificar(), 5000);
          this.mostrarQr(r.qr);
          return;
        }
        // Los hosts del proveedor DEL PEDIDO (si el local cambió de proveedor, sigue valiendo).
        const hosts = r?.hosts || this.config.config?.pagoOnlineHosts;
        if (r?.success && r.tipo === 'FORMULARIO' && r.procesoId && esUrlPagoPermitida(r.script, hosts)) {
          this.cancelado = false;
          this.qr = null;
          this.pararReloj();
          // Intento nuevo tras un rechazo: vuelve a esperar el pago y a consultar.
          if (this.pedido) this.pedido = { ...this.pedido, estadoPago: 'PENDIENTE', ...(proveedor ? { metodoPago: proveedor } : {}) };
          if (!this.timer) this.timer = setInterval(() => this.verificar(), 5000);
          this.mostrarFormulario(r.script, r.procesoId, r.proveedor);
          return;
        }
        if (soloFormulario) return;
        if (r?.success && esUrlPagoPermitida(r.checkoutUrl, hosts)) { window.location.href = r.checkoutUrl; return; }
        this.error = 'No pudimos abrir el pago. Probá de nuevo en un rato.';
      },
      error: () => { this.reintentando = false; this.error = 'No pudimos abrir el pago.'; },
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
    // Un intento anterior que cargó mal: se saca antes de volver a cargarlo.
    if (this.scriptPago) { this.scriptPago.remove(); this.scriptPago = null; }
    const s = document.createElement('script');
    this.scriptPago = s;
    s.src = script;
    s.async = true;
    s.onload = armar;
    s.onerror = () => { this.formulario = false; this.error = 'No pudimos cargar el formulario de pago. Probá de nuevo en un rato.'; };
    document.head.appendChild(s);
  }
}
