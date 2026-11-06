import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { PedidoResumen } from '../../core/models';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { IconComponent } from '../../core/icon.component';
import { esMetodoPagoOnline } from '../../core/pago-online';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { tokensSeguimiento, quitarSeguimiento } from '../../core/seguimiento';
import { textoEstadoPago } from '../../core/pago-online';
import { vistaEstadoPedido } from '../../core/estado-pedido';
import { textoPagoCliente } from '../pedido/pedido-detalle.utils';
import { MonedasService } from '../../core/monedas.service';

/** Estados en los que ya no hay nada más que esperar. */
const TERMINALES = ['ENTREGADO', 'RECHAZADO', 'CANCELADO'];


@Component({
  selector: 'sf-mis-pedidos',
  standalone: true,
  imports: [GuaraniPipe, CommonModule, RouterLink, IconComponent],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Mis pedidos</h1>

      <div class="sf-ok" *ngIf="nuevo">
        <sf-icon name="check" [size]="16"></sf-icon> ¡Pedido {{ nuevo }} enviado! Te avisamos cuando el local lo confirme.
      </div>

      <p class="sf-muted" *ngIf="!auth.isAuthenticated && !invitado">
        Ingresá para ver tus pedidos. <a routerLink="/login">Ingresar</a>.
      </p>
      <p class="sf-muted" *ngIf="cargando">Cargando…</p>
      <p class="sf-muted sf-live" *ngIf="!cargando && actualizado">
        Se actualiza solo · {{ actualizado | date:'HH:mm:ss' }}
        <button type="button" class="sf-refresh" (click)="cargar(true)">Actualizar</button>
      </p>
      <p class="sf-muted" *ngIf="auth.isAuthenticated && !cargando && pedidos.length === 0">
        Todavía no hiciste pedidos.
      </p>

      <div class="sf-card sf-pedido" *ngFor="let p of pedidos">
        <!-- F9: la cabecera abre el detalle (acciones, compartir, contacto). El invitado de mesa no tiene cuenta. -->
        <a class="sf-pedido-head sf-pedido-link" *ngIf="!invitado" [routerLink]="['/pedido', p.numero]"
           [attr.aria-label]="'Ver el pedido ' + p.numero">
          <strong>{{ p.numero }}</strong>
          <span class="sf-head-der">
            <span class="sf-estado" [attr.data-tono]="p.vista.tono">{{ p.vista.chip }}</span>
            <span class="sf-ver">Ver ›</span>
          </span>
        </a>
        <div class="sf-pedido-head" *ngIf="invitado">
          <strong>{{ p.numero }}</strong>
          <span class="sf-estado" [attr.data-tono]="p.vista.tono">{{ p.vista.chip }}</span>
        </div>
        <div class="sf-cancelacion" *ngIf="p.pideCancelar">Pediste cancelarlo · esperando respuesta del local</div>
        <div class="sf-muted sf-pedido-sub">{{ tipoLabel(p.tipoPedido) }} · {{ p.createdAt | date:'dd/MM HH:mm' }}</div>
        <div class="sf-ayuda" *ngIf="p.vista.ayuda">{{ p.vista.ayuda }}</div>
        <ol class="sf-pasos" *ngIf="p.vista.pasos as pasos" [attr.aria-label]="'Estado: ' + p.vista.chip">
          <li *ngFor="let paso of pasos" [class.hecho]="paso.hecho" [class.actual]="paso.actual"
              [attr.aria-current]="paso.actual ? 'step' : null">
            <span class="dot"></span><span class="txt">{{ paso.label }}</span>
          </li>
        </ol>
        <div class="sf-pedido-item" *ngFor="let it of p.items">
          {{ it.cantidad }}× {{ it.nombreProducto }}
          <span class="sf-muted" *ngIf="it.nombrePresentacion">({{ it.nombrePresentacion }})</span>
          <div class="sf-muted sf-pedido-perso" *ngIf="detalle(it) as d">{{ d }}</div>
        </div>
        <div class="sf-muted sf-pedido-perso" *ngIf="p.notas">Nota: {{ p.notas }}</div>
        <div class="sf-rechazo" *ngIf="(p.estado === 'RECHAZADO' || p.estado === 'CANCELADO') && p.motivoRechazo">Motivo: {{ p.motivoRechazo }}</div>
        <div class="sf-muted sf-pago" *ngIf="pago(p) as tp">
          {{ tp }}
          <a *ngIf="p.estado === 'PENDIENTE_PAGO'" [routerLink]="['/pago', p.numero]">Ver pago</a>
        </div>
        <div class="sf-muted sf-pago" *ngIf="p.pagoTexto">{{ p.pagoTexto }}</div>
        <div class="sf-pedido-total">Total: {{ p.total | guarani }}</div>
      </div>
    </div>
  `,
  styles: [`
    .sf-title { font-size: 22px; margin: 4px 0 16px; }
    .sf-ok { background: var(--sf-success-bg); color: var(--sf-success); padding: 12px; border-radius: var(--sf-radius); margin-bottom: 14px; }
    .sf-pedido { margin-bottom: 12px; }
    .sf-pedido-head { display: flex; justify-content: space-between; align-items: center; }
    .sf-pedido-link { color: inherit; text-decoration: none; }
    .sf-head-der { display: inline-flex; align-items: center; gap: 8px; }
    .sf-ver { font-size: 13px; font-weight: 600; color: var(--sf-primary); white-space: nowrap; }
    .sf-cancelacion { font-size: 12px; margin: 6px 0 0; padding: 6px 10px; border-radius: var(--sf-radius-sm); background: var(--sf-warning-bg); color: var(--sf-text); }
    .sf-pago { font-size: 13px; margin-top: 6px; }
    .sf-estado { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--sf-border); }
    .sf-estado { white-space: nowrap; }
    .sf-estado[data-tono="espera"] { background: var(--sf-warning-bg); color: var(--sf-warning); }
    .sf-estado[data-tono="curso"] { background: var(--sf-primary-surface); color: var(--sf-primary); }
    .sf-estado[data-tono="ok"] { background: var(--sf-success-bg); color: var(--sf-success); }
    .sf-estado[data-tono="error"] { background: var(--sf-error-bg); color: var(--sf-error); }
    .sf-ayuda { font-size: 13px; margin: -2px 0 10px; color: var(--sf-text); }
    .sf-pasos { list-style: none; display: flex; margin: 0 0 12px; padding: 0; }
    .sf-pasos li { flex: 1; position: relative; display: flex; flex-direction: column; align-items: center; text-align: center; min-width: 0; }
    .sf-pasos li::before { content: ''; position: absolute; top: 6px; right: 50%; width: 100%; height: 3px; background: var(--sf-border); }
    .sf-pasos li:first-child::before { display: none; }
    .sf-pasos li.hecho::before, .sf-pasos li.actual::before { background: var(--sf-primary); }
    .sf-pasos .dot { position: relative; z-index: 1; width: 15px; height: 15px; border-radius: 50%; background: var(--sf-surface); border: 3px solid var(--sf-border); box-sizing: border-box; }
    .sf-pasos li.hecho .dot { background: var(--sf-primary); border-color: var(--sf-primary); }
    .sf-pasos li.actual .dot { border-color: var(--sf-primary); box-shadow: 0 0 0 4px var(--sf-primary-surface); }
    .sf-pasos .txt { font-size: 11px; line-height: 1.25; margin-top: 6px; padding: 0 2px; color: var(--sf-text-muted); }
    .sf-pasos li.hecho .txt { color: var(--sf-text); }
    .sf-pasos li.actual .txt { color: var(--sf-primary); font-weight: 700; }
    .sf-pedido-sub { font-size: 12px; margin: 4px 0 8px; }
    .sf-pedido-item { font-size: 14px; padding: 2px 0; }
    .sf-pedido-perso { font-size: 12px; margin: 2px 0 0 18px; line-height: 1.4; }
    .sf-rechazo { margin-top: 8px; font-size: 13px; color: var(--sf-error); background: var(--sf-error-bg); padding: 8px 10px; border-radius: var(--sf-radius-sm); }
    .sf-pedido-total { margin-top: 8px; font-weight: 600; }
    .sf-live { display: flex; align-items: center; gap: 10px; font-size: 12px; }
    .sf-refresh {
      background: none; border: none; padding: 0;
      color: var(--sf-primary); font: inherit; cursor: pointer; text-decoration: underline;
    }
  `],
})
export class MisPedidosPage implements OnInit, OnDestroy {
  private api = inject(PublicApiService);
  private route = inject(ActivatedRoute);
  private monedas = inject(MonedasService);
  auth = inject(AuthService);

  pedidos: (PedidoResumen & { vista: ReturnType<typeof vistaEstadoPedido>; pideCancelar: boolean; pagoTexto: string | null })[] = [];
  invitado = false;
  cargando = false;
  nuevo: string | null = null;
  /** Marca de la última actualización, para que se note que la página está viva. */
  actualizado: Date | null = null;
  private poll: any = null;

  ngOnInit(): void {
    this.nuevo = this.route.snapshot.queryParamMap.get('nuevo');
    // Invitado de mesa sin cuenta: sigue sus pedidos con el token de esta visita.
    this.invitado = !this.auth.isAuthenticated && tokensSeguimiento().length > 0;
    if (!this.auth.isAuthenticated && !this.invitado) return;
    if (!this.monedas.monedas.length) this.monedas.cargar();
    this.cargar(true);
    // Sin esto la página era una carga única: el cliente tenía que recargar el
    // navegador para ver si su pedido avanzó, y en la práctica termina llamando
    // por teléfono al local — el peor final para un canal digital.
    this.poll = setInterval(() => this.cargar(false), 12000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
  }

  /** `mostrarSpinner` sólo en la primera carga: el refresco es silencioso. */
  cargar(mostrarSpinner: boolean): void {
    if (mostrarSpinner) this.cargando = true;
    if (this.invitado) { this.cargarInvitado(); return; }
    this.api.call<any>('pedido.mis').subscribe({
      next: (res) => {
        this.cargando = false;
        if (res?.success) {
          this.pedidos = conVista(res.pedidos || [], this.monedas.monedas);
          this.actualizado = new Date();
          // Cuando ya no queda nada en curso no hay nada que mirar: se corta el
          // poll para no golpear el server desde una pestaña abierta y olvidada.
          const enCurso = this.pedidos.some((p: any) => !TERMINALES.includes(p.estado));
          if (!enCurso && this.poll) { clearInterval(this.poll); this.poll = null; }
        }
      },
      error: () => (this.cargando = false),
    });
  }

  private cargarInvitado(): void {
    const tokens = tokensSeguimiento();
    forkJoin(tokens.map((t) => this.api.call<any>('pedido.seguimiento', [t]).pipe(catchError(() => of(null))))).subscribe((rs) => {
      this.cargando = false;
      const pedidos: PedidoResumen[] = [];
      rs.forEach((r, i) => {
        if (r?.success) pedidos.push(r.pedido);
        else if (r && (r.error === 'pedido_no_encontrado' || r.error === 'seguimiento_vencido')) quitarSeguimiento(tokens[i]);
      });
      this.pedidos = conVista(pedidos, this.monedas.monedas);
      this.actualizado = new Date();
      const enCurso = pedidos.some((p: any) => !TERMINALES.includes(p.estado));
      if (!enCurso && this.poll) { clearInterval(this.poll); this.poll = null; }
    });
  }

  /** F4: estado del pago con tarjeta (null en efectivo). */
  pago(p: any): string | null {
    return textoEstadoPago(p?.estadoPago, p?.pagoMonto ?? p?.total);
  }

  tipoLabel(tipo: string): string {
    return ({ PICKUP: 'Retiro en el local', DELIVERY: 'Delivery', MESA_QR: 'En la mesa' } as Record<string, string>)[tipo] || tipo;
  }

  /** Sabores, adicionales, preferencias y nota de una línea, en una sola frase. */
  detalle(it: any): string {
    const p = it?.personalizacion;
    if (!p) return '';
    const parts: string[] = [];
    if (Array.isArray(p.sabores) && p.sabores.length > 1) parts.push(p.sabores.map((s: any) => s.nombre).join(' / '));
    for (const a of p.adicionales || []) parts.push(`+ ${a.nombre}`);
    for (const o of p.observaciones || []) parts.push(typeof o === 'string' ? o : o?.descripcion);
    if (p.notaLibre) parts.push(`"${p.notaLibre}"`);
    return parts.filter(Boolean).join(' · ');
  }
}

/** El estado que ve el cliente se calcula al cargar: el template no llama funciones. */
function conVista(pedidos: PedidoResumen[], monedas: Parameters<typeof textoPagoCliente>[1] = []) {
  return pedidos.map((p: any) => ({
    ...p,
    vista: vistaEstadoPedido(p.estado, p.tipoPedido),
    pideCancelar: !!p.cancelacionSolicitadaEn && !TERMINALES.includes(p.estado),
    // F8/F9: cómo dijo que va a pagar (el de tarjeta online sale aparte, con su estado).
    pagoTexto: esMetodoPagoOnline(p.metodoPago) ? null : textoPagoCliente(p, monedas),
  }));
}
