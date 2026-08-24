import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { DeliveryEstado } from '../../../database/entities/ventas/delivery.entity';
import { Caja } from '../../../database/entities/financiero/caja.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { CrearDeliveryDialogComponent } from '../crear-delivery-dialog/crear-delivery-dialog.component';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { CobrarVentaDialogComponent, CobrarVentaDialogData } from '../cobrar-venta-dialog/cobrar-venta-dialog.component';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { SeleccionarRepartidorDialogComponent } from '../seleccionar-repartidor-dialog/seleccionar-repartidor-dialog.component';

export interface DeliveryDialogData {
  caja: Caja;
  monedas: Moneda[];
  principalMoneda: Moneda;
  exchangeRates: MonedaCambio[];
  filteredMonedas: Moneda[];
}

interface DeliveryRow {
  delivery: any;
  nombre: string;
  telefono: string;
  estadoLabel: string;
  estadoColor: string;
  espera: string;
  totalVenta: number;
  valorDelivery: number;
  entregador: string;
  observacion: string;
  tiempoColor: string;
  otraCaja: boolean;
}

@Component({
  selector: 'app-delivery-dialog',
  templateUrl: './delivery-dialog.component.html',
  styleUrls: ['./delivery-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatPaginatorModule,
  ],
})
export class DeliveryDialogComponent implements OnInit, OnDestroy {
  deliveryRows: DeliveryRow[] = [];
  selectedDelivery: any = null;
  selectedItems: any[] = [];
  selectedPagoDetalles: any[] = [];
  estadoFiltro = '';
  estados = Object.values(DeliveryEstado);
  displayedColumns = ['telefono', 'nombre', 'estado', 'espera', 'valorDelivery', 'total', 'entregador', 'observacion'];

  // Paginación
  totalDeliveries = 0;
  pageSize = 20;
  pageIndex = 0;

  // Umbrales de tiempo (configurables en Configuración del PdV → Delivery)
  tiempoAmarillo = 30;
  tiempoRojo = 60;

  // Totales del panel de detalle. Pre-computados: la vista no llama funciones.
  detalleSubtotal = 0;
  detalleEnvio = 0;
  detalleTotal = 0;

  private timerInterval: any;

  /**
   * Cola de pedidos de la web esperando aceptación. Vive acá y no en una
   * pantalla aparte a propósito: quien atiende el reparto ya tiene este diálogo
   * abierto, y una segunda pantalla es una segunda cosa que hay que mirar.
   */
  pedidosOnline: any[] = [];
  procesandoPedidoId: number | null = null;
  private pedidosInterval: any;

  constructor(
    public dialogRef: MatDialogRef<DeliveryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeliveryDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const config = await firstValueFrom(this.repositoryService.getPdvConfig());
      if (config) {
        this.tiempoAmarillo = config.deliveryTiempoAmarillo || 30;
        this.tiempoRojo = config.deliveryTiempoRojo || 60;
        this.pageSize = config.deliveryPageSize || 20;
      }
    } catch (e) {
      console.warn('No se pudo leer la configuración de delivery, se usan los defaults:', e);
    }

    await this.loadDeliveries();
    await this.cargarPedidosOnline();

    // Timer cada segundo para actualizar espera
    this.timerInterval = setInterval(() => {
      this.updateEsperas();
    }, 1000);
    // Los pedidos de la web entran solos: sin este poll el cajero tendría que
    // cerrar y reabrir el diálogo para enterarse.
    this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), 15000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.pedidosInterval) clearInterval(this.pedidosInterval);
  }

  // ─── Pedidos de la web ──────────────────────────────────────────────────

  async cargarPedidosOnline(): Promise<void> {
    try {
      const pedidos = await firstValueFrom(
        this.repositoryService.getPedidosOnlineAdmin({ estado: 'RECIBIDO' }),
      );
      this.pedidosOnline = (pedidos || []).map((p: any) => this.mapPedidoOnline(p));
    } catch (e) {
      // Un fallo del poll no puede romper la pantalla de delivery, que es lo
      // que el cajero está usando para trabajar.
      console.warn('No se pudieron cargar los pedidos online:', e);
    }
  }

  private mapPedidoOnline(p: any): any {
    const creado = p.createdAt ? new Date(p.createdAt).getTime() : Date.now();
    const mins = Math.max(0, Math.floor((Date.now() - creado) / 60000));
    const items = (p.items || []).map((i: any) => `${i.cantidad}× ${i.nombreProducto}`);
    return {
      ...p,
      espera: this.formatEspera(mins),
      // Mismos umbrales que la tabla de deliveries: un pedido de hace 20 minutos
      // no puede verse igual que uno de hace 20 segundos.
      esperaColor: mins >= this.tiempoRojo ? 'rojo' : mins >= this.tiempoAmarillo ? 'amarillo' : 'verde',
      resumenItems: items.slice(0, 3).join(', ') + (items.length > 3 ? ` +${items.length - 3}` : ''),
    };
  }

  /**
   * Aceptar materializa: crea la venta, la manda a cocina y —si es delivery—
   * abre el registro de reparto, que aparece en la lista de la izquierda.
   */
  async aceptarPedidoOnline(p: any): Promise<void> {
    this.procesandoPedidoId = p.id;
    try {
      const res: any = await firstValueFrom(
        this.repositoryService.aceptarPedidoOnline(p.id, { cajaId: this.data.caja.id }),
      );
      if (!res?.success) {
        this.snackBar.open(`No se pudo aceptar: ${res?.error || ''}`, 'OK', { duration: 4000 });
        return;
      }
      if (res.errorMaterializacion) {
        // El pedido quedó aceptado igual: se avisa sin deshacer nada.
        this.snackBar.open(
          `Pedido ${p.numero} aceptado, pero no se pudo mandar a cocina: ${res.errorMaterializacion}`,
          'OK', { duration: 6000 },
        );
      } else {
        this.snackBar.open(`Pedido ${p.numero} aceptado y enviado a cocina`, 'OK', { duration: 3000 });
      }
      await this.cargarPedidosOnline();
      await this.loadDeliveries();
    } catch (e: any) {
      this.snackBar.open(`Error: ${e?.message || e}`, 'OK', { duration: 4000 });
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  async rechazarPedidoOnline(p: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Rechazar ${p.numero}`,
        message: 'El cliente va a ver el pedido como rechazado. ¿Por qué motivo?',
        confirmText: 'Rechazar',
        cancelText: 'Volver',
        showInput: true,
        inputLabel: 'Motivo',
      },
    });
    const motivo = await firstValueFrom(ref.afterClosed());
    if (!motivo) return;

    this.procesandoPedidoId = p.id;
    try {
      const res: any = await firstValueFrom(this.repositoryService.rechazarPedidoOnline(p.id, motivo));
      if (res?.success) {
        this.snackBar.open(`Pedido ${p.numero} rechazado`, 'OK', { duration: 3000 });
        await this.cargarPedidosOnline();
        await this.loadDeliveries();
      } else {
        this.snackBar.open(`No se pudo rechazar: ${res?.error || ''}`, 'OK', { duration: 4000 });
      }
    } catch (e: any) {
      this.snackBar.open(`Error: ${e?.message || e}`, 'OK', { duration: 4000 });
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  async loadDeliveries(): Promise<void> {
    try {
      const filtros: any = { page: this.pageIndex + 1, pageSize: this.pageSize };
      if (this.estadoFiltro) filtros.estado = this.estadoFiltro;

      const result = await firstValueFrom(this.repositoryService.deliveryListarPdv(this.data.caja.id, filtros));
      this.totalDeliveries = result.total;
      this.deliveryRows = result.data.map((d: any) => this.mapDeliveryRow(d));
    } catch (error) {
      this.mostrarError(error, 'No se pudo cargar la lista de deliveries');
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadDeliveries();
  }

  private mapDeliveryRow(d: any): DeliveryRow {
    const mins = this.calcMinutos(d.fechaAbierto);
    return {
      delivery: d,
      nombre: d.nombre || d.cliente?.persona?.nombre || '-',
      telefono: d.telefono || '-',
      estadoLabel: d.estado,
      estadoColor: this.getEstadoColor(d.estado),
      espera: this.formatEspera(mins),
      totalVenta: this.calcTotalVenta(d),
      // `costoDelivery` viene congelado en la venta; la zona es sólo el
      // fallback para deliveries anteriores a la columna. `Number()` porque
      // ambos son `decimal` → string en Postgres.
      valorDelivery: Number(d.venta?.costoDelivery ?? d.precioDelivery?.valor ?? 0) || 0,
      entregador: d.entregadoPorFuncionario?.persona?.nombre || '-',
      observacion: d.observacion || '',
      tiempoColor: this.getTiempoColor(mins, d.estado),
      otraCaja: !!d.otraCaja,
    };
  }

  private calcMinutos(fecha: string | Date): number {
    if (!fecha) return 0;
    return Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
  }

  private formatEspera(mins: number): string {
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }

  private getEstadoColor(estado: DeliveryEstado): string {
    switch (estado) {
      case DeliveryEstado.ABIERTO: return 'abierto';
      case DeliveryEstado.PARA_ENTREGA: return 'listo';
      case DeliveryEstado.EN_CAMINO: return 'camino';
      case DeliveryEstado.ENTREGADO: return 'entregado';
      case DeliveryEstado.CANCELADO: return 'cancelado';
      default: return '';
    }
  }

  private getTiempoColor(mins: number, estado: DeliveryEstado): string {
    if (estado === DeliveryEstado.ENTREGADO || estado === DeliveryEstado.CANCELADO) return '';
    if (mins >= this.tiempoRojo) return 'tiempo-rojo';
    if (mins >= this.tiempoAmarillo) return 'tiempo-amarillo';
    return '';
  }

  /** Total de la venta: ítems activos + costo de envío. */
  private calcTotalVenta(d: any): number {
    const envio = Number(d.venta?.costoDelivery ?? 0) || 0;
    if (!d.venta?.items) return envio;
    return d.venta.items.reduce((sum: number, i: any) => {
      if (i.estado !== 'ACTIVO') return sum;
      const unit = Number(i.precioVentaUnitario || 0)
        + Number(i.precioAdicionales || 0)
        - Number(i.descuentoUnitario || 0);
      return sum + unit * Number(i.cantidad || 0);
    }, envio);
  }

  private updateEsperas(): void {
    for (const row of this.deliveryRows) {
      const mins = this.calcMinutos(row.delivery.fechaAbierto);
      row.espera = this.formatEspera(mins);
      row.tiempoColor = this.getTiempoColor(mins, row.delivery.estado);
    }
  }

  // Estado flags (pre-computed, no getters in template)
  isAbierto = false;
  isParaEntrega = false;
  isEnCamino = false;
  isEntregado = false;
  isCancelado = false;
  isTerminal = false;
  /** El menú ESTADO sólo ofrece transiciones que el backend acepta. */
  estadosDisponibles: DeliveryEstado[] = [];

  /**
   * Espejo de la tabla de transiciones del backend
   * (`delivery.handler.ts:TRANSICIONES`). Acá sólo decide qué botones se
   * muestran: la validación real y su mensaje de error son del backend.
   */
  private static readonly TRANSICIONES: Record<string, DeliveryEstado[]> = {
    [DeliveryEstado.ABIERTO]: [DeliveryEstado.PARA_ENTREGA, DeliveryEstado.EN_CAMINO],
    [DeliveryEstado.PARA_ENTREGA]: [DeliveryEstado.EN_CAMINO, DeliveryEstado.ABIERTO],
    [DeliveryEstado.EN_CAMINO]: [DeliveryEstado.ENTREGADO, DeliveryEstado.PARA_ENTREGA],
    [DeliveryEstado.ENTREGADO]: [DeliveryEstado.EN_CAMINO],
    [DeliveryEstado.CANCELADO]: [],
  };

  selectDelivery(row: DeliveryRow): void {
    this.selectedDelivery = row.delivery;
    this.updateEstadoFlags();
    this.loadDeliveryDetails();
  }

  private updateEstadoFlags(): void {
    const estado = this.selectedDelivery?.estado;
    this.isAbierto = estado === DeliveryEstado.ABIERTO;
    this.isParaEntrega = estado === DeliveryEstado.PARA_ENTREGA;
    this.isEnCamino = estado === DeliveryEstado.EN_CAMINO;
    this.isEntregado = estado === DeliveryEstado.ENTREGADO;
    this.isCancelado = estado === DeliveryEstado.CANCELADO;
    this.isTerminal = this.isEntregado || this.isCancelado;
    this.estadosDisponibles = estado ? (DeliveryDialogComponent.TRANSICIONES[estado] ?? []) : [];
  }

  private async loadDeliveryDetails(): Promise<void> {
    this.selectedItems = [];
    this.selectedPagoDetalles = [];
    this.recalcularTotalesDetalle();

    if (!this.selectedDelivery?.venta?.id) return;

    // Si esto falla hay que avisar: un panel vacío es indistinguible de un
    // pedido sin ítems, y el cajero puede creer que el pedido está mal cargado.
    try {
      this.selectedItems = await firstValueFrom(this.repositoryService.getVentaItems(this.selectedDelivery.venta.id));
    } catch (e) {
      this.selectedItems = [];
      this.mostrarError(e, 'No se pudieron cargar los ítems del delivery');
    }

    try {
      if (this.selectedDelivery.venta.pago?.id) {
        this.selectedPagoDetalles = await firstValueFrom(this.repositoryService.getPagoDetalles(this.selectedDelivery.venta.pago.id));
      }
    } catch (e) {
      this.selectedPagoDetalles = [];
      this.mostrarError(e, 'No se pudo cargar el detalle del cobro');
    }

    this.recalcularTotalesDetalle();
  }

  /**
   * Totales del panel derecho.
   *
   * Antes el template hacía `calcTotalItems() + precioDelivery?.valor`, que
   * además de ser una llamada en la vista concatenaba strings en Postgres
   * (`valor` es `decimal`): el total salía como "100005000".
   */
  private recalcularTotalesDetalle(): void {
    this.detalleSubtotal = this.selectedItems
      .filter((i) => i.estado === 'ACTIVO')
      .reduce((sum, i) => {
        const unit = Number(i.precioVentaUnitario || 0)
          + Number(i.precioAdicionales || 0)
          - Number(i.descuentoUnitario || 0);
        return sum + unit * Number(i.cantidad || 0);
      }, 0);
    this.detalleEnvio = Number(
      this.selectedDelivery?.venta?.costoDelivery ?? this.selectedDelivery?.precioDelivery?.valor ?? 0,
    ) || 0;
    this.detalleTotal = this.detalleSubtotal + this.detalleEnvio;
  }

  onFiltroChange(): void {
    this.pageIndex = 0;
    this.loadDeliveries();
  }

  nuevoDelivery(): void {
    const dialogRef = this.dialog.open(CrearDeliveryDialogComponent, {
      width: '450px',
      data: { caja: this.data.caja },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.delivery && result?.venta) {
        // Cerrar el diálogo y cargar el pedido en el PdV para tomar los ítems.
        this.dialogRef.close({ action: 'editItems', delivery: result.delivery, venta: result.venta });
      }
    });
  }

  // Acciones según estado
  editarItems(): void {
    if (!this.selectedDelivery) return;
    if (this.selectedDelivery.venta?.estado !== 'ABIERTA') {
      this.snackBar.open(
        `La venta de este delivery está ${this.selectedDelivery.venta?.estado ?? 'sin abrir'}: no se pueden editar los ítems.`,
        'CERRAR', { duration: 5000, panelClass: ['error-snackbar'] },
      );
      return;
    }
    this.dialogRef.close({ action: 'editItems', delivery: this.selectedDelivery, venta: this.selectedDelivery.venta });
  }

  editarDatos(): void {
    if (!this.selectedDelivery) return;
    const dialogRef = this.dialog.open(CrearDeliveryDialogComponent, {
      width: '450px',
      data: { caja: this.data.caja, delivery: this.selectedDelivery },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.edited) await this.recargarManteniendoSeleccion();
    });
  }

  editarPago(): void {
    if (!this.selectedDelivery?.venta) return;

    const dialogData: CobrarVentaDialogData = {
      venta: this.selectedDelivery.venta,
      items: this.selectedItems,
      monedas: this.data.filteredMonedas?.length > 0 ? this.data.filteredMonedas : this.data.monedas,
      exchangeRates: this.data.exchangeRates,
      principalMoneda: this.data.principalMoneda,
      caja: this.data.caja,
      costoDelivery: this.detalleEnvio,
    };

    const dialogRef = this.dialog.open(CobrarVentaDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '95vw',
      disableClose: true,
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      const cobroOk = result?.success && this.selectedDelivery && !this.isEntregado;
      if (!cobroOk) {
        await this.recargarManteniendoSeleccion();
        return;
      }

      // Con el cobro cerrado, ofrecer marcar la entrega. Sólo tiene sentido si
      // el pedido ya salió: el backend rechaza ENTREGADO desde ABIERTO.
      if (!this.isEnCamino) {
        await this.recargarManteniendoSeleccion();
        return;
      }
      const confirmRef = this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: 'FINALIZAR DELIVERY',
          message: 'El cobro ha sido finalizado. ¿Desea también marcar el delivery como ENTREGADO?',
          confirmText: 'SÍ, ENTREGADO',
          cancelText: 'AHORA NO',
        },
      });
      confirmRef.afterClosed().subscribe(async (confirmed) => {
        if (confirmed) await this.cambiarEstado(DeliveryEstado.ENTREGADO, { silencioso: true });
        await this.recargarManteniendoSeleccion();
      });
    });
  }

  async marcarListoParaEntrega(): Promise<void> {
    await this.cambiarEstado(DeliveryEstado.PARA_ENTREGA);
  }

  /** ENVIAR: pide el repartidor y pasa a EN_CAMINO. */
  async enviar(): Promise<void> {
    if (!this.selectedDelivery) return;
    // Se captura el delivery objetivo ACÁ y no se vuelve a leer
    // `this.selectedDelivery`: entre el click y el cierre del selector hay dos
    // huecos asíncronos con la tabla clickeable de fondo, y si el cajero
    // selecciona otra fila mientras tanto el envío (y el repartidor) se
    // aplicarían al pedido equivocado, en silencio.
    const objetivo = this.selectedDelivery;

    let repartidores: { id: number; nombre: string; cargo: string | null }[] = [];
    try {
      repartidores = await firstValueFrom(this.repositoryService.deliveryListarRepartidores());
    } catch (error) {
      this.mostrarError(error, 'No se pudo cargar la lista de repartidores');
      return;
    }

    const ref = this.dialog.open(SeleccionarRepartidorDialogComponent, {
      width: '420px',
      data: {
        repartidores,
        seleccionadoId: objetivo.entregadoPorFuncionario?.id ?? null,
      },
    });

    ref.afterClosed().subscribe(async (funcionarioId: number | null | undefined) => {
      if (funcionarioId === undefined) return; // cancelado
      await this.cambiarEstado(DeliveryEstado.EN_CAMINO, {
        funcionarioId: funcionarioId ?? undefined,
        deliveryId: objetivo.id,
      });
    });
  }

  /**
   * Reasigna el repartidor sin tocar el estado: el pedido ya salió y lo termina
   * llevando otra persona. Sin esto, `deliveryAsignarRepartidor` quedaba como
   * superficie IPC sin usar.
   */
  async cambiarRepartidor(): Promise<void> {
    if (!this.selectedDelivery) return;
    const objetivo = this.selectedDelivery;

    let repartidores: { id: number; nombre: string; cargo: string | null }[] = [];
    try {
      repartidores = await firstValueFrom(this.repositoryService.deliveryListarRepartidores());
    } catch (error) {
      this.mostrarError(error, 'No se pudo cargar la lista de repartidores');
      return;
    }

    const ref = this.dialog.open(SeleccionarRepartidorDialogComponent, {
      width: '420px',
      data: { repartidores, seleccionadoId: objetivo.entregadoPorFuncionario?.id ?? null },
    });

    ref.afterClosed().subscribe(async (funcionarioId: number | null | undefined) => {
      if (funcionarioId === undefined) return;
      try {
        await firstValueFrom(this.repositoryService.deliveryAsignarRepartidor(objetivo.id, funcionarioId));
        this.snackBar.open('Repartidor actualizado', 'CERRAR', { duration: 2500 });
        await this.recargarManteniendoSeleccion();
      } catch (error) {
        this.mostrarError(error, 'No se pudo asignar el repartidor');
      }
    });
  }

  async finalizar(): Promise<void> {
    if (!this.selectedDelivery) return;

    // Sin cobro cerrado no hay entrega: el backend rechaza la transición, así
    // que primero se abre el cobro.
    if (this.selectedDelivery.venta?.estado !== 'CONCLUIDA') {
      this.editarPago();
      return;
    }
    await this.cambiarEstado(DeliveryEstado.ENTREGADO);
  }

  /**
   * Única puerta de entrada a un cambio de estado.
   *
   * La validación (qué transición es legal, qué fechas limpiar, si hace falta
   * repartidor) es del backend: acá sólo se despacha y se muestra el error.
   */
  async cambiarEstado(
    nuevoEstado: DeliveryEstado,
    opts: { funcionarioId?: number; silencioso?: boolean; deliveryId?: number } = {},
  ): Promise<void> {
    // `deliveryId` explícito para los flujos con diálogo de por medio, donde la
    // selección puede haber cambiado mientras tanto.
    const deliveryId = opts.deliveryId ?? this.selectedDelivery?.id;
    if (!deliveryId) return;
    try {
      await firstValueFrom(this.repositoryService.deliveryCambiarEstado(
        deliveryId,
        nuevoEstado,
        opts.funcionarioId ? { funcionarioId: opts.funcionarioId } : undefined,
      ));
      if (!opts.silencioso) {
        this.snackBar.open(`Delivery #${deliveryId} → ${nuevoEstado}`, 'CERRAR', { duration: 2500 });
      }
      await this.recargarManteniendoSeleccion();
    } catch (error) {
      this.mostrarError(error, 'No se pudo cambiar el estado del delivery');
    }
  }

  cancelarDelivery(): void {
    if (!this.selectedDelivery) return;

    const cobrada = this.selectedDelivery.venta?.estado === 'CONCLUIDA';
    const advertencia = cobrada
      ? 'Esta venta YA FUE COBRADA. Al cancelar se revierte el cobro, el stock y la cuenta por cobrar.\n\n'
      : '';

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'CANCELAR DELIVERY',
        message: `${advertencia}Indique el motivo de la cancelación:`,
        showInput: true,
        inputLabel: 'MOTIVO',
        confirmText: 'CANCELAR DELIVERY',
        cancelText: 'VOLVER',
      },
    });

    dialogRef.afterClosed().subscribe(async (motivo) => {
      // El diálogo devuelve el texto del motivo (o `false` si se cerró).
      if (!motivo || typeof motivo !== 'string') return;
      try {
        // Una sola llamada transaccional: delivery + venta + cobro + stock.
        await firstValueFrom(this.repositoryService.deliveryCancelar(this.selectedDelivery.id, motivo));
        this.snackBar.open(`Delivery #${this.selectedDelivery.id} cancelado`, 'CERRAR', { duration: 3000 });
        this.selectedDelivery = null;
        this.selectedItems = [];
        this.selectedPagoDetalles = [];
        this.updateEstadoFlags();
        this.recalcularTotalesDetalle();
        await this.loadDeliveries();
      } catch (error) {
        this.mostrarError(error, 'No se pudo cancelar el delivery');
      }
    });
  }

  async imprimir(): Promise<void> {
    if (!this.selectedDelivery) return;
    try {
      const res = await firstValueFrom(this.repositoryService.deliveryImprimirTicket(this.selectedDelivery.id));
      if (res?.ok) {
        this.snackBar.open('Ticket de delivery enviado a la impresora', 'CERRAR', { duration: 2500 });
      } else {
        const msg = res?.errors?.[0]?.message || 'No se pudo imprimir el ticket';
        this.snackBar.open(msg, 'CERRAR', { duration: 5000, panelClass: ['error-snackbar'] });
      }
    } catch (error) {
      this.mostrarError(error, 'No se pudo imprimir el ticket de delivery');
    }
  }

  cerrar(): void {
    this.dialogRef.close(null);
  }

  /** Recarga la lista dejando seleccionado el mismo delivery. */
  private async recargarManteniendoSeleccion(): Promise<void> {
    const id = this.selectedDelivery?.id;
    await this.loadDeliveries();
    if (!id) return;
    const row = this.deliveryRows.find((r) => r.delivery.id === id);
    if (row) {
      this.selectDelivery(row);
    } else {
      // Salió de la página o del filtro actual.
      this.selectedDelivery = null;
      this.selectedItems = [];
      this.selectedPagoDetalles = [];
      this.updateEstadoFlags();
      this.recalcularTotalesDetalle();
    }
  }

  private mostrarError(error: unknown, fallback: string): void {
    console.error(fallback, error);
    const mensaje = (error as any)?.message?.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
      || fallback;
    this.snackBar.open(mensaje, 'CERRAR', { duration: 6000, panelClass: ['error-snackbar'] });
  }
}
