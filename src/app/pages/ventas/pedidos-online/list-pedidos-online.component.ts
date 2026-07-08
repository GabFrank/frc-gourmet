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
  ];

  constructor(
    private repo: RepositoryService,
    private snack: MatSnackBar,
  ) {}

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
