import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { PedidoResumen } from '../../core/models';

/** Estados en los que ya no hay nada más que esperar. */
const TERMINALES = ['ENTREGADO', 'RECHAZADO', 'CANCELADO'];

const ESTADO_LABEL: Record<string, string> = {
  RECIBIDO: 'Recibido',
  ACEPTADO: 'Aceptado',
  EN_PREPARACION: 'En preparación',
  LISTO: 'Listo',
  EN_CAMINO: 'En camino',
  ENTREGADO: 'Entregado',
  RECHAZADO: 'Rechazado',
  CANCELADO: 'Cancelado',
};

@Component({
  selector: 'sf-mis-pedidos',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="sf-container">
      <h1 class="sf-title">Mis pedidos</h1>

      <div class="sf-ok" *ngIf="nuevo">
        ✅ ¡Pedido {{ nuevo }} recibido! Te avisamos cuando lo confirmen.
      </div>

      <p class="sf-muted" *ngIf="!auth.isAuthenticated">
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
        <div class="sf-pedido-head">
          <strong>{{ p.numero }}</strong>
          <span class="sf-estado" [attr.data-estado]="p.estado">{{ label(p.estado) }}</span>
        </div>
        <div class="sf-muted sf-pedido-sub">{{ p.tipoPedido }} · {{ p.createdAt | date:'short' }}</div>
        <div class="sf-pedido-item" *ngFor="let it of p.items">
          {{ it.cantidad }}× {{ it.nombreProducto }}
          <span class="sf-muted" *ngIf="it.nombrePresentacion">({{ it.nombrePresentacion }})</span>
        </div>
        <div class="sf-pedido-total">Total: {{ p.total | number:'1.0-2' }}</div>
      </div>
    </div>
  `,
  styles: [`
    .sf-title { font-size: 22px; margin: 4px 0 16px; }
    .sf-ok { background: var(--sf-success-bg); color: var(--sf-success); padding: 12px; border-radius: var(--sf-radius); margin-bottom: 14px; }
    .sf-pedido { margin-bottom: 12px; }
    .sf-pedido-head { display: flex; justify-content: space-between; align-items: center; }
    .sf-estado { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--sf-border); }
    .sf-estado[data-estado="ENTREGADO"] { background: var(--sf-success-bg); color: var(--sf-success); }
    .sf-estado[data-estado="RECHAZADO"], .sf-estado[data-estado="CANCELADO"] { background: var(--sf-error-bg); color: var(--sf-error); }
    .sf-pedido-sub { font-size: 12px; margin: 4px 0 8px; }
    .sf-pedido-item { font-size: 14px; padding: 2px 0; }
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
  auth = inject(AuthService);

  pedidos: PedidoResumen[] = [];
  cargando = false;
  nuevo: string | null = null;
  /** Marca de la última actualización, para que se note que la página está viva. */
  actualizado: Date | null = null;
  private poll: any = null;

  ngOnInit(): void {
    this.nuevo = this.route.snapshot.queryParamMap.get('nuevo');
    if (!this.auth.isAuthenticated) return;
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
    this.api.call<any>('pedido.mis').subscribe({
      next: (res) => {
        this.cargando = false;
        if (res?.success) {
          this.pedidos = res.pedidos || [];
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

  label(estado: string): string {
    return ESTADO_LABEL[estado] || estado;
  }
}
