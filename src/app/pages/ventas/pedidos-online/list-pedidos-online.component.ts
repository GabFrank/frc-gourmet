import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';

/**
 * Bandeja de PEDIDOS ONLINE en el PdV (Fase 4).
 *
 * Lista los pedidos entrantes de la web y permite aceptar / rechazar / avanzar
 * su estado. La venta se materializa con el flujo normal del PdV; acá se maneja
 * la máquina de estados del pedido. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
@Component({
  selector: 'app-list-pedidos-online',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './list-pedidos-online.component.html',
  styleUrls: ['./list-pedidos-online.component.scss'],
})
export class ListPedidosOnlineComponent implements OnInit, OnDestroy {
  pedidos: any[] = [];
  cargando = false;
  filtroEstado = 'ACTIVOS';
  confirmandoRechazoId: number | null = null;

  private timer: any = null;

  readonly estados = [
    { value: 'ACTIVOS', label: 'Activos' },
    { value: 'RECIBIDO', label: 'Recibidos' },
    { value: 'ACEPTADO', label: 'Aceptados' },
    { value: 'EN_PREPARACION', label: 'En preparación' },
    { value: 'LISTO', label: 'Listos' },
    { value: 'EN_CAMINO', label: 'En camino' },
    { value: 'ENTREGADO', label: 'Entregados' },
    { value: 'RECHAZADO', label: 'Rechazados' },
    { value: 'CANCELADO', label: 'Cancelados' },
  ];

  private readonly estadoLabels: Record<string, string> = {
    RECIBIDO: 'Recibido',
    ACEPTADO: 'Aceptado',
    EN_PREPARACION: 'En preparación',
    LISTO: 'Listo',
    EN_CAMINO: 'En camino',
    ENTREGADO: 'Entregado',
    RECHAZADO: 'Rechazado',
    CANCELADO: 'Cancelado',
  };

  estadoLabel(estado: string): string {
    return this.estadoLabels[estado] || estado;
  }

  constructor(
    private repo: RepositoryService,
    private snack: MatSnackBar,
  ) {}

  private get api(): any {
    return (window as any).api;
  }

  /**
   * Recovery MESA_QR: materializa manualmente un pedido de mesa que no se
   * materializó solo (ej. no había caja abierta al crearse) → lo vuelca en la
   * cuenta de la mesa y lo manda a cocina. Resuelve la única caja abierta; si hay
   * más de una, avisa (habría que materializar desde el PdV de esa caja).
   */
  enviarACocina(p: any): void {
    this.api.callIpc('materializar-pedido-online-en-venta', p.id).then((res: any) => {
      if (res?.ventaId) {
        this.snack.open(`Pedido ${p.numero} enviado a cocina`, 'OK', { duration: 2500 });
        this.cargar(true);
      } else {
        this.snack.open('No se pudo enviar a cocina', 'OK', { duration: 3500 });
      }
    }).catch((e: any) => {
      const msg = String(e?.message || e);
      const amigable = /no_hay_caja_abierta/.test(msg) ? 'No hay una caja abierta.'
        : /caja_ambigua/.test(msg) ? 'Hay más de una caja abierta; abrí el pedido desde el PdV de la caja correspondiente.'
        : msg;
      this.snack.open('No se pudo enviar a cocina: ' + amigable, 'OK', { duration: 5000 });
    });
  }

  ngOnInit(): void {
    this.cargar();
    // Auto-refresh cada 15s para detectar pedidos nuevos.
    this.timer = setInterval(() => this.cargar(true), 15000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  cargar(silencioso = false): void {
    if (!silencioso) this.cargando = true;
    const filtros: any = {};
    if (this.filtroEstado === 'ACTIVOS') {
      filtros.estados = ['RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO'];
    } else {
      filtros.estado = this.filtroEstado;
    }
    this.repo.getPedidosOnlineAdmin(filtros).subscribe({
      next: (res) => {
        this.pedidos = res || [];
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  aceptar(p: any): void {
    this.repo.aceptarPedidoOnline(p.id).subscribe({
      next: (res) => {
        if (res?.success) {
          this.snack.open(`Pedido ${p.numero} aceptado`, 'OK', { duration: 2500 });
          this.cargar(true);
        } else {
          this.snack.open('No se pudo aceptar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  confirmarRechazo(p: any): void {
    this.confirmandoRechazoId = p.id;
  }

  cancelarRechazo(): void {
    this.confirmandoRechazoId = null;
  }

  rechazar(p: any): void {
    this.repo.rechazarPedidoOnline(p.id, 'RECHAZADO POR EL LOCAL').subscribe({
      next: (res) => {
        this.confirmandoRechazoId = null;
        if (res?.success) {
          this.snack.open(`Pedido ${p.numero} rechazado`, 'OK', { duration: 2500 });
          this.cargar(true);
        } else {
          this.snack.open('No se pudo rechazar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  avanzar(p: any, nuevoEstado: string): void {
    this.repo.avanzarEstadoPedidoOnline(p.id, nuevoEstado).subscribe({
      next: (res) => {
        if (res?.success) {
          this.cargar(true);
        } else {
          this.snack.open('No se pudo actualizar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  /** Próximo estado sugerido según el estado actual y el tipo de pedido. */
  siguienteEstado(p: any): { estado: string; label: string } | null {
    switch (p.estado) {
      case 'ACEPTADO':
        return { estado: 'EN_PREPARACION', label: 'Marcar en preparación' };
      case 'EN_PREPARACION':
        return { estado: 'LISTO', label: 'Marcar listo' };
      case 'LISTO':
        return p.tipoPedido === 'DELIVERY'
          ? { estado: 'EN_CAMINO', label: 'Enviar (en camino)' }
          : { estado: 'ENTREGADO', label: 'Marcar entregado' };
      case 'EN_CAMINO':
        return { estado: 'ENTREGADO', label: 'Marcar entregado' };
      default:
        return null;
    }
  }
}
