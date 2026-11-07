import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { DecisionPagoOnlineService, textoResultadoPago } from '../decision-pago-online-dialog/decision-pago-online.service';
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
import { esCajaCerrada } from '../../utils/caja-error.util';
import { limpiarCodigo, textoErrorPedidoOnline, textoExcepcionPedidoOnline } from '../../utils/pedido-online-errores.util';
import { HasPermissionDirective } from '../../directives/has-permission.directive';
import {
  ConvertirModoDeliveryDialogComponent,
  ConvertirModoDeliveryDialogResult,
} from '../convertir-modo-delivery-dialog/convertir-modo-delivery-dialog.component';

export interface DeliveryDialogData {
  caja: Caja;
  monedas: Moneda[];
  principalMoneda: Moneda;
  exchangeRates: MonedaCambio[];
  filteredMonedas: Moneda[];
  /**
   * Gate de terminal ajena, resuelto por el PdV que abre este diálogo. Se
   * propaga tal cual al diálogo de cobro. `undefined ⇒ permitido`.
   */
  puedeAgregarPagos?: boolean;
  puedeFinalizar?: boolean;
  terminalDeLaCaja?: string;
  /**
   * Cada vez que la cola web cambia (acción del cajero o poll), con su largo. El PdV lo usa para
   * su badge, que si no quedaba atrasado hasta su propio poll de 15 s.
   */
  alCambiarCola?: (total: number) => void;
}

/*
 * ⚠️ DOS PANTALLAS, UN PEDIDO (F10). Esta cola es la pantalla de ATENCIÓN de los pedidos web; la
 * bandeja (`list-pedidos-online.component.ts`) sigue viva como panel de observación y acción.
 * Toda regla o acción nueva de atención va en LAS DOS. Lo que espera a alguien lo decide el
 * servidor (`motivoAtencion` en `electron/utils/pedido-acciones.utils.ts`), no esta pantalla.
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md, «Dos pantallas, un pedido».
 */

/**
 * Una fila de la lista. Siempre es un `Delivery`: el pedido para retirar es el
 * mismo registro en `modo: RETIRO`, con dirección, costo de envío y repartidor
 * vacíos. Por eso no hace falta ningún camino paralelo — la lista, el footer,
 * el cobro y la impresión operan sobre lo mismo.
 */
interface DeliveryRow {
  delivery: any;
  /** El cliente lo pasa a buscar: sin reparto ni costo de envío. */
  esRetiro: boolean;
  /** 'WEB' si entró por la tienda online, 'LOCAL' si lo cargó el cajero. */
  canal: string;
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
  /**
   * La caja de la venta de este pedido ya está CERRADA (Q1): el backend
   * rechaza cobrarlo (`CAJA_CERRADA`) y no hay reapertura de cajas, así que la
   * única salida es cancelarlo y volver a cargarlo en la caja de hoy. Se avisa
   * en la fila para que el cajero no lo descubra recién al confirmar el pago.
   */
  cajaCerrada: boolean;
  /**
   * F10: con qué número se habla de este pedido. El de la web es el PO-… que ve el cliente (y
   * la bandeja); el que cargó el cajero, el número del delivery. Antes la lista no mostraba
   * ninguno y el detalle decía «N° 8» sin aclarar de qué.
   */
  numero: string;
  /** El pedido web detrás de la fila (o null): cancelación pedida, pago online. */
  pedidoWeb: any | null;
  pideCancelar: boolean;
  /** Estado del pago online (uPay), si lo hay. */
  pagoChip: { texto: string; clase: string } | null;
}

/** Secciones de la cola de atención, en el orden en que se muestran (lo urgente primero). */
const SECCIONES_COLA: { clave: string; titulo: string }[] = [
  { clave: 'CANCELACION', titulo: 'PIDEN CANCELAR' },
  { clave: 'NUEVO', titulo: 'NUEVOS' },
  { clave: 'SIN_COCINA', titulo: 'ACEPTADOS SIN ENVIAR A COCINA' },
  { clave: 'DEVOLVER', titulo: 'DEVOLVER PAGO ONLINE' },
];

/** Insignia del pago online (uPay). Misma tabla que la bandeja (`pagoInsignia`). */
export function chipPagoOnline(estadoPago: string | null | undefined, monto?: number | null): { texto: string; clase: string } | null {
  switch (estadoPago) {
    case 'PAGADO': return { texto: 'PAGADO ONLINE', clase: 'ok' };
    case 'PENDIENTE': return { texto: 'ESPERANDO PAGO', clase: 'espera' };
    case 'FALLIDO': return { texto: 'PAGO RECHAZADO', clase: 'mal' };
    case 'EXPIRADO': return { texto: 'PAGO VENCIDO', clase: 'mal' };
    case 'REEMBOLSO_PENDIENTE': return { texto: `DEVOLVER ${Number(monto || 0).toLocaleString('es-PY')}`, clase: 'mal' };
    case 'DEVOLVIENDO': return { texto: 'DEVOLVIENDO…', clase: 'espera' };
    case 'DEVUELTO': return { texto: 'PAGO DEVUELTO', clase: 'neutro' };
    case 'NO_ACREDITADO': return { texto: 'PAGO NO ENTRÓ', clase: 'neutro' };
    case 'RETENIDO': return { texto: 'PAGO NO DEVUELTO', clase: 'neutro' };
    default: return null;
  }
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
    HasPermissionDirective,
  ],
})
export class DeliveryDialogComponent implements OnInit, OnDestroy {
  deliveryRows: DeliveryRow[] = [];
  selectedDelivery: any = null;
  selectedItems: any[] = [];
  /**
   * Los ítems ya listos para la vista: nombre con su variación, líneas de
   * detalle y total por línea. Se pre-computa acá porque la vista no llama
   * funciones, y porque el detalle de variación viene de otra consulta.
   */
  itemsDetalle: any[] = [];
  /**
   * El total convertido a las otras monedas del PdV. El cajero cobra en
   * guaraníes, reales o dólares según con qué llegue el cliente, y tener que
   * abrir la pantalla de cobro sólo para saber cuánto es en reales obliga a
   * entrar y salir de un diálogo que además puede cerrar la venta.
   */
  totalesMoneda: { simbolo: string; valor: number; decimales: number }[] = [];
  /** Estado de cobro, para no tener que deducirlo del card COBRO. */
  ventaCobrada = false;
  /** Texto y estilo del sello del comprobante (pre-computados). */
  selloRecibo = 'A COBRAR';
  selloPagado = false;
  /** 'WEB' o 'LOCAL', para el chip del detalle. */
  detalleCanal = 'LOCAL';
  /**
   * Datos del local en el encabezado del resumen.
   *
   * El panel no es sólo una pantalla de trabajo: cuando el cliente pide su
   * resumen, el cajero le manda una **foto de esta pantalla** por WhatsApp. Sin
   * el nombre y el teléfono del local, esa foto llega sin contexto — podría ser
   * de cualquier lado.
   */
  empresa: any = null;
  /** Fecha del pedido, para que la foto se explique sola. */
  detalleFecha: Date | null = null;
  /** Título del comprobante: qué es este pedido. */
  detalleTitulo = 'DELIVERY';
  /** F10: el número del pedido web (PO-…) si lo hay; es el que conoce el cliente. */
  detallePedidoWeb = '';
  /** F10: «DELIVERY N° 8 · VENTA #14»: cada número con su nombre. */
  detalleNumeros = '';
  /** F10: el pedido web de la fila seleccionada (para responder su cancelación desde el footer). */
  pedidoWebSel: any = null;
  selectedPagoDetalles: any[] = [];
  estadoFiltro = '';
  estados = Object.values(DeliveryEstado);
  displayedColumns = ['numero', 'telefono', 'nombre', 'estado', 'espera', 'valorDelivery', 'total', 'entregador', 'observacion'];

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
  /**
   * La bandeja del panel derecho: **sólo pedidos esperando confirmación**.
   *
   * Un pedido aceptado deja de ser una decisión pendiente y pasa a ser trabajo
   * en curso, así que sale de acá y entra en la lista de la izquierda junto a
   * los deliveries que carga el cajero — incluidos los RETIROS, que no generan
   * `Delivery` y entran como fila sintética. Tener los aceptados en un panel
   * aparte partía la operación en dos lugares para mirar.
   */
  colaWeb: any[] = [];
  /**
   * F10: la cola agrupada por lo que espera (`motivoAtencion` del servidor): piden cancelar,
   * nuevos, aceptados sin cocina y devoluciones. Pre-computado: la vista no llama funciones.
   */
  seccionesCola: { clave: string; titulo: string; pedidos: any[] }[] = [];
  /**
   * Con la tienda online apagada no hay pedidos web posibles, así que todo lo
   * que habla de ellos —el botón del subheader, el panel, el poll— sobra y
   * confunde: el cajero ve un sector vacío de algo que no existe.
   */
  tiendaActiva = false;
  /**
   * Si el panel derecho muestra la cola. Pre-computado y compartido con el
   * empty-state: son excluyentes y cuando los dos se renderizaban a la vez se
   * partían el lado derecho entre sí.
   */
  hayColaWeb = false;
  /** El panel derecho está mostrando algo: cola, detalle de delivery o de retiro. */
  panelOcupado = false;
  avisoTooltip = 'Pedidos de la web';
  procesandoPedidoId: number | null = null;
  /** F10: qué había en la cola en el último poll (null = todavía no se cargó). */
  private firmaCola: string | null = null;
  private pedidosInterval: any;
  /**
   * F4 (backoff exponencial ante 429): intervalo del poll en ms. Crece de 15s
   * a 120s cuando el server responde 429, resetea a 15s en éxito.
   */
  private pollIntervalMs = 15000;
  /**
   * Enmienda auditoría B (backoff sin race): flag que indica que el intervalo
   * cambió y hay que recrear el interval fuera del catch, evitando timers
   * huérfanos ante 429 concurrentes.
   */
  private needsIntervalUpdate = false;

  constructor(
    public dialogRef: MatDialogRef<DeliveryDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeliveryDialogData,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private decisionPago: DecisionPagoOnlineService,
  ) {}

  async ngOnInit(): Promise<void> {
    // Si esta terminal no puede ni registrar pagos ni finalizar, el botón PAGO
    // no tiene nada que ofrecer. Se computa antes de la primera carga para que
    // `recomputarEstadoBotones` ya lo tenga en cuenta.
    const puedePagos = this.data.puedeAgregarPagos !== false;
    const puedeFin = this.data.puedeFinalizar !== false;
    this.cobroBloqueadoPorTerminal = !puedePagos && !puedeFin;
    this.tooltipPagoTerminal = this.cobroBloqueadoPorTerminal
      ? `El cobro se realiza en ${this.data.terminalDeLaCaja || 'la terminal donde se abrió la caja'}`
      : '';
    this.tooltipPago = this.tooltipPagoTerminal;
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

    // Los datos del local van en el encabezado del resumen y no cambian
    // mientras el diálogo está abierto.
    try {
      this.empresa = await firstValueFrom(this.repositoryService.getEmpresa());
    } catch (e) {
      console.warn('No se pudieron leer los datos de la empresa:', e);
    }

    // La tienda apagada se consulta una sola vez: es una decisión del gerente,
    // no algo que cambie mientras el cajero tiene el diálogo abierto.
    try {
      const tienda = await firstValueFrom(this.repositoryService.getTiendaOnlineConfig());
      this.tiendaActiva = !!tienda?.activa;
    } catch (e) {
      // Sin config legible se asume apagada: mostrar una cola que nunca se va a
      // poblar es peor que no mostrarla.
      console.warn('No se pudo leer la configuración de la tienda online:', e);
      this.tiendaActiva = false;
    }

    // Los retiros primero: son filas de la tabla, así que tienen que estar en
    // memoria antes de armarla o el primer render sale sin ellos.
    await this.cargarPedidosOnline();
    await this.loadDeliveries();

    // Timer cada segundo para actualizar espera
    this.timerInterval = setInterval(() => {
      this.updateEsperas();
    }, 1000);
    // Los pedidos de la web entran solos: sin este poll el cajero tendría que
    // cerrar y reabrir el diálogo para enterarse. F10: corre aunque la tienda esté
    // apagada — una cancelación pedida o una devolución son de pedidos que ya existen.
    this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), 15000);
  }

  ngOnDestroy(): void {
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.pedidosInterval) clearInterval(this.pedidosInterval);
  }

  // ─── Pedidos de la web ──────────────────────────────────────────────────

  /**
   * Trae lo que viene de la web: la bandeja de pendientes y los retiros en
   * curso.
   *
   * Los pendientes sólo se piden con la tienda encendida —apagada no puede
   * entrar ninguno—, pero **los retiros en curso se piden siempre**: apagar la
   * tienda no hace desaparecer los pedidos que ya se aceptaron, y como su
   * venta no aparece en ninguna otra pantalla, dejar de traerlos los volvería
   * invisibles y sin forma de cobrarlos.
   */
  async cargarPedidosOnline(): Promise<void> {
    try {
      // F10: todo lo que espera a alguien, con el mismo criterio que el badge del PdV
      // (`motivoAtencion` en el servidor). Se pide aunque la tienda esté apagada: una cancelación
      // pedida, un pedido sin cocina o una devolución son de pedidos que ya existen.
      const pedidos = await firstValueFrom(this.repositoryService.getPedidosOnlineAdmin({ atencion: true }));
      // El handler devuelve DESC (más nuevo arriba), que sirve para la pantalla
      // de historial pero no para una cola de atención: acá el que espera hace
      // más tiempo va primero, y el orden se mantiene estable aunque entren
      // pedidos nuevos mientras el cajero está por tocar un botón.
      this.pedidosOnline = (pedidos || [])
        .map((p: any) => this.mapPedidoOnline(p))
        .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

      this.armarColaWeb();

      // F10: la lista también se refresca en cada poll —un pedido avanzado o cancelado desde la
      // bandeja cambia su delivery—, pero el detalle abierto sólo se recarga si SU fila cambió,
      // para no parpadear cada 15 s. La primera carga la hace `ngOnInit`.
      if (this.firmaCola !== null) await this.refrescarListaSilencioso();
      this.firmaCola = 'cargada';

      // Reset en éxito (F4 fix bloqueante auditoría UI)
      const wasBackedOff = this.pollIntervalMs > 15000;
      this.pollIntervalMs = 15000;
      if (wasBackedOff) {
        // Estaba en backoff, recrear interval con el intervalo default
        this.recreatePollInterval();
      }
    } catch (e) {
      const es429 = (e as any)?.message?.includes('429') || (e as any)?.message?.includes('Too Many Requests');
      if (es429) {
        // F4 (backoff): duplicar intervalo hasta 120s max ante rate limit
        const nuevoIntervalo = Math.min(this.pollIntervalMs * 2, 120000);
        if (nuevoIntervalo !== this.pollIntervalMs) {
          this.pollIntervalMs = nuevoIntervalo;
          // Enmienda auditoría B: marcar que necesita recrear interval FUERA
          // del catch, evitando timers huérfanos si entra 429 concurrente
          this.needsIntervalUpdate = true;
          console.warn(`[delivery-dialog] Rate limit 429, backoff a ${this.pollIntervalMs / 1000}s`);
        }
      }
      // Un fallo del poll no puede romper la pantalla de delivery, que es lo
      // que el cajero está usando para trabajar.
      console.warn('No se pudieron cargar los pedidos online:', e);
    } finally {
      // Enmienda auditoría B: recrear interval fuera del try/catch, una sola
      // vez, evitando race si entran 429 concurrentes mientras se procesa el
      // primero. Solo aplica tras 429 (needsIntervalUpdate=true del catch).
      if (this.needsIntervalUpdate) {
        this.needsIntervalUpdate = false;
        this.recreatePollInterval();
      }
    }
  }

  /**
   * Enmienda auditoría B: método separado para recrear el interval del poll,
   * evita timers huérfanos ante 429 concurrentes.
   */
  private recreatePollInterval(): void {
    if (this.pedidosInterval) {
      clearInterval(this.pedidosInterval);
      this.pedidosInterval = null;
    }
    this.pedidosInterval = setInterval(() => this.cargarPedidosOnline(), this.pollIntervalMs);
  }

  /**
   * Funde pendientes y retiros en curso en una sola cola, el que espera hace
   * más tiempo primero. El orden es estable aunque entren pedidos nuevos
   * mientras el cajero está por tocar un botón.
   */
  private armarColaWeb(): void {
    this.colaWeb = [...this.pedidosOnline]
      .filter((p) => !!p.motivoAtencion)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    this.seccionesCola = SECCIONES_COLA
      .map((sec) => ({ ...sec, pedidos: this.colaWeb.filter((p) => p.motivoAtencion === sec.clave) }))
      .filter((sec) => sec.pedidos.length > 0);
    this.hayColaWeb = this.colaWeb.length > 0;
    this.data?.alCambiarCola?.(this.colaWeb.length);
    this.actualizarPanel();
    this.avisoTooltip = this.colaWeb.length
      ? this.seccionesCola.map((sec) => `${sec.pedidos.length} ${sec.titulo.toLowerCase()}`).join(' · ')
      : 'Pedidos de la web';
  }

  /** Deselecciona lo que haya abierto para que el panel vuelva a la bandeja. */
  verColaPedidos(): void {
    this.selectedDelivery = null;
    this.actualizarPanel();
    this.updateEstadoFlags();
  }

  /** Pre-computado: la vista no llama funciones. */
  private actualizarPanel(): void {
    this.panelOcupado = !!this.selectedDelivery || this.hayColaWeb;
  }

  /** Sin esto Angular reconstruye toda la cola en cada poll de 15s. */
  trackPedido(_i: number, p: any): number { return p.id; }

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
      // Pre-computado y no un getter: la cola se renderiza en un *ngFor y la
      // vista no llama funciones.
      esRetiro: p.tipoPedido === 'PICKUP',
      tipoLabel: p.tipoPedido === 'PICKUP' ? 'RETIRO' : 'DELIVERY',
      // Por defecto pendiente de aceptación; los retiros en curso lo pisan.
      pendiente: true,
      // F9: el cliente pidió cancelar (y el pedido todavía se puede cancelar).
      pideCancelar: p.motivoAtencion === 'CANCELACION',
      esRecibido: p.estado === 'RECIBIDO',
      // F10: qué botones lleva en la cola.
      esNuevo: p.motivoAtencion === 'NUEVO',
      esSinCocina: p.motivoAtencion === 'SIN_COCINA',
      esDevolver: p.motivoAtencion === 'DEVOLVER',
      montoDevolver: Number(p.pagoMonto || 0),
      pagoChip: chipPagoOnline(p.estadoPago, p.pagoMonto),
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
        this.snackBar.open(`No se pudo aceptar: ${textoErrorPedidoOnline(res)}`, 'OK', { duration: 5000 });
        await this.cargarPedidosOnline();
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
      this.mostrarError(e, 'No se pudo aceptar el pedido');
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
    // Pagado online: qué se hace con ese cobro (auditoría post-F10).
    const pago = p.estadoPago === 'PAGADO'
      ? await this.decisionPago.preguntar({ modo: 'CANCELAR', pedidos: [{ numero: p.numero, monto: Number(p.pagoMonto || 0), proveedor: p.pagoProveedorNombre }] })
      : { seguir: true };
    if (!pago.seguir) return;

    this.procesandoPedidoId = p.id;
    try {
      const res: any = await firstValueFrom(this.repositoryService.rechazarPedidoOnline(p.id, motivo, pago.decision));
      if (res?.success) {
        this.snackBar.open(p.estadoPago === 'PAGADO'
          ? textoResultadoPago(p.numero, p.pagoMonto, pago.decision, 'rechazado', p.pagoProveedorNombre)
          : `Pedido ${p.numero} rechazado`, 'OK', { duration: p.estadoPago === 'PAGADO' ? 10000 : 3000 });
        await this.cargarPedidosOnline();
        await this.loadDeliveries();
      } else {
        this.snackBar.open(`No se pudo rechazar: ${textoErrorPedidoOnline(res)}`, 'OK', { duration: 5000 });
        await this.cargarPedidosOnline();
      }
    } catch (e: any) {
      this.mostrarError(e, 'No se pudo rechazar el pedido');
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  /** F9: responder la solicitud de cancelación del cliente (aprobar = mismo camino que rechazar). */
  async resolverCancelacionOnline(p: any, aprobar: boolean): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: aprobar
        ? { title: `Cancelar ${p.numero}`, message: 'El cliente pidió cancelar. Si tiene venta, se cancela también.', confirmText: 'Cancelar pedido', cancelText: 'Volver' }
        : { title: `No cancelar ${p.numero}`, message: 'El cliente va a ver este motivo y el pedido sigue.', confirmText: 'Responder', cancelText: 'Volver', showInput: true, inputLabel: 'Motivo' },
    });
    const r = await firstValueFrom(ref.afterClosed());
    if (!r) return;
    const pagado = aprobar && p.estadoPago === 'PAGADO';
    const pago = pagado
      ? await this.decisionPago.preguntar({ modo: 'CANCELAR', pedidos: [{ numero: p.numero, monto: Number(p.pagoMonto || 0), proveedor: p.pagoProveedorNombre }] })
      : { seguir: true };
    if (!pago.seguir) return;
    this.procesandoPedidoId = p.id;
    try {
      const res: any = await firstValueFrom(
        this.repositoryService.resolverCancelacionPedidoOnline(p.id, aprobar, typeof r === 'string' ? r : undefined, pago.decision),
      );
      if (res?.success) {
        this.snackBar.open(
          !aprobar ? `Se le respondió al cliente: ${p.numero} sigue`
            : pagado ? textoResultadoPago(p.numero, p.pagoMonto, pago.decision, undefined, p.pagoProveedorNombre)
            : `Pedido ${p.numero} cancelado`,
          'OK', { duration: pagado ? 10000 : 3000 });
        await this.cargarPedidosOnline();
        // Manteniendo la fila abierta: se puede responder desde el footer con ella seleccionada.
        await this.recargarManteniendoSeleccion();
      } else {
        this.snackBar.open(`No se pudo: ${textoErrorPedidoOnline(res)}`, 'OK', { duration: 5000 });
        await this.cargarPedidosOnline();
      }
    } catch (e: any) {
      this.mostrarError(e, 'No se pudo responder la solicitud');
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  /**
   * F10: un pedido aceptado que no llegó a crear su venta (aceptación sin caja abierta, o
   * automática que falló). Antes sólo se destrababa desde la bandeja.
   */
  async enviarACocinaOnline(p: any): Promise<void> {
    this.procesandoPedidoId = p.id;
    try {
      const res: any = await (window as any).api.callIpc('materializar-pedido-online-en-venta', p.id, { cajaId: this.data.caja.id });
      if (res?.ventaId) {
        this.snackBar.open(`Pedido ${p.numero} enviado a cocina`, 'OK', { duration: 3000 });
        await this.cargarPedidosOnline();
        await this.loadDeliveries();
      } else {
        this.snackBar.open(`No se pudo enviar ${p.numero} a cocina`, 'OK', { duration: 4000 });
      }
    } catch (e: any) {
      this.snackBar.open(`No se pudo enviar a cocina: ${textoExcepcionPedidoOnline(e)}`, 'OK', { duration: 6000 });
      await this.cargarPedidosOnline();
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  /**
   * F10: cerrar la devolución pendiente de un pedido cancelado: ya se devolvió desde uPay, el pago
   * no entró, o no se devuelve (auditoría post-F10, con motivo). Mismo diálogo que la bandeja.
   */
  async marcarDevueltoOnline(p: any): Promise<void> {
    const pago = await this.decisionPago.preguntar({ modo: 'RESOLVER', pedidos: [{ numero: p.numero, monto: Number(p.pagoMonto || 0), proveedor: p.pagoProveedorNombre }] });
    if (!pago.seguir || !pago.decision) return;
    this.procesandoPedidoId = p.id;
    try {
      const res: any = await firstValueFrom(this.repositoryService.resolverPagoPedidoOnline(p.id, pago.decision));
      if (res?.success) {
        this.snackBar.open(`Pedido ${p.numero}: devolución cerrada`, 'OK', { duration: 3000 });
      } else {
        this.snackBar.open(`No se pudo registrar: ${textoErrorPedidoOnline(res)}`, 'OK', { duration: 5000 });
      }
      await this.cargarPedidosOnline();
      await this.recargarManteniendoSeleccion();
    } catch (e: any) {
      this.mostrarError(e, 'No se pudo registrar la devolución');
    } finally {
      this.procesandoPedidoId = null;
    }
  }

  /** F10: responder la cancelación pedida desde el footer, con la fila seleccionada. */
  async resolverCancelacionSeleccionado(aprobar: boolean): Promise<void> {
    if (!this.pedidoWebSel?.pideCancelar) return;
    await this.resolverCancelacionOnline(this.pedidoWebSel, aprobar);
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

  /** Firma de lo que la fila muestra y habilita (estado, venta, pedido web). */
  private firmaFila(d: any): string {
    const w = d?.pedidoWeb;
    return [d?.id, d?.estado, d?.venta?.estado, w?.estado, w?.estadoPago, w?.pideCancelar, w?.cancelacionRespuesta].join(':');
  }

  /** Recarga la lista; si la fila abierta cambió, la vuelve a abrir con los datos nuevos. */
  private async refrescarListaSilencioso(): Promise<void> {
    const sel = this.selectedDelivery;
    const antes = sel ? this.firmaFila(sel) : null;
    try {
      const filtros: any = { page: this.pageIndex + 1, pageSize: this.pageSize };
      if (this.estadoFiltro) filtros.estado = this.estadoFiltro;
      const result = await firstValueFrom(this.repositoryService.deliveryListarPdv(this.data.caja.id, filtros));
      this.totalDeliveries = result.total;
      this.deliveryRows = result.data.map((d: any) => this.mapDeliveryRow(d));
    } catch (e) {
      console.warn('No se pudo refrescar la lista de deliveries:', e);
      return;
    }
    // La selección pudo cambiar durante la consulta: sólo se toca si sigue siendo la misma.
    if (!sel || this.selectedDelivery?.id !== sel.id) return;
    const row = this.deliveryRows.find((r) => r.delivery.id === sel.id);
    if (row && this.firmaFila(row.delivery) !== antes) this.selectDelivery(row);
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadDeliveries();
  }

  private mapDeliveryRow(d: any): DeliveryRow {
    const mins = this.calcMinutos(d.fechaAbierto);
    const esRetiro = d.modo === 'RETIRO';
    return {
      delivery: d,
      esRetiro,
      canal: (d.venta?.canalOrigen ?? 'LOCAL') === 'LOCAL' ? 'LOCAL' : 'WEB',
      nombre: d.nombre || d.cliente?.persona?.nombre || '-',
      telefono: d.telefono || '-',
      estadoLabel: d.estado,
      estadoColor: this.getEstadoColor(d.estado),
      espera: this.esperaDe(d, mins),
      totalVenta: this.calcTotalVenta(d),
      // `costoDelivery` viene congelado en la venta; la zona es sólo el
      // fallback para deliveries anteriores a la columna. `Number()` porque
      // ambos son `decimal` → string en Postgres.
      valorDelivery: esRetiro ? 0 : (Number(d.venta?.costoDelivery ?? d.precioDelivery?.valor ?? 0) || 0),
      entregador: d.entregadoPorFuncionario?.persona?.nombre || '-',
      observacion: d.observacion || '',
      tiempoColor: this.colorDe(d, mins),
      otraCaja: !!d.otraCaja,
      cajaCerrada: !!d.cajaCerrada,
      numero: d.pedidoWeb?.numero || `N° ${d.id}`,
      pedidoWeb: d.pedidoWeb || null,
      pideCancelar: !!d.pedidoWeb?.pideCancelar,
      pagoChip: chipPagoOnline(d.pedidoWeb?.estadoPago, d.pedidoWeb?.pagoMonto),
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

  /**
   * Cuánto hace que espera este pedido.
   *
   * En un retiro el reloj **se congela** al marcarlo PARA_ENTREGA: a partir de
   * ahí el pedido está pronto en el mostrador y lo que falta es que el cliente
   * venga, que no depende del local. Sin esto un retiro se ponía rojo a las
   * horas y el rojo dejaba de significar "hay que apurarse" en toda la lista.
   */
  private esperaDe(d: any, mins: number): string {
    if (d.modo === 'RETIRO' && d.fechaParaEntrega) {
      const listoEn = Math.max(0, Math.floor(
        (new Date(d.fechaParaEntrega).getTime() - new Date(d.fechaAbierto).getTime()) / 60000,
      ));
      return `${this.formatEspera(listoEn)} · LISTO`;
    }
    return this.formatEspera(mins);
  }

  /** El color sigue al reloj: congelado el reloj, no hay alarma que dar. */
  private colorDe(d: any, mins: number): string {
    if (d.modo === 'RETIRO' && d.fechaParaEntrega) return '';
    return this.getTiempoColor(mins, d.estado);
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
      row.espera = this.esperaDe(row.delivery, mins);
      row.tiempoColor = this.colorDe(row.delivery, mins);
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

  /** Un retiro no sale a la calle: sin EN_CAMINO. */
  private static readonly TRANSICIONES_RETIRO: Record<string, DeliveryEstado[]> = {
    [DeliveryEstado.ABIERTO]: [DeliveryEstado.PARA_ENTREGA, DeliveryEstado.ENTREGADO],
    [DeliveryEstado.PARA_ENTREGA]: [DeliveryEstado.ENTREGADO, DeliveryEstado.ABIERTO],
    // Un retiro sólo llega a EN_CAMINO por conversión: es un reparto que ya
    // había salido. Vuelve a PARA_ENTREGA como cualquier delivery.
    [DeliveryEstado.EN_CAMINO]: [DeliveryEstado.ENTREGADO, DeliveryEstado.PARA_ENTREGA],
    [DeliveryEstado.ENTREGADO]: [DeliveryEstado.PARA_ENTREGA],
    [DeliveryEstado.CANCELADO]: [],
  };

  selectDelivery(row: DeliveryRow): void {
    this.selectedDelivery = row.delivery;
    this.actualizarPanel();
    this.updateEstadoFlags();
    this.loadDeliveryDetails();
  }

  /** Habilitación de los botones del footer. Pre-computados: sin getters. */
  /**
   * "Hay un delivery seleccionado y no está en estado terminal". NO tiene que
   * ver con el gate por terminal de la caja: ese llega desde el PdV en
   * `data.puedeAgregarPagos` / `data.puedeFinalizar` y se propaga al diálogo de
   * cobro. Se llama así desde que el PdV ganó un `puedeCobrar` con otro
   * significado.
   */
  puedeEditarPago = false;
  /** La venta del delivery seleccionado está cancelada: no se cobra ni se avanza. */
  ventaCanceladaSel = false;
  /** Ningún permiso de cobro en esta terminal: el botón PAGO no hace nada. */
  cobroBloqueadoPorTerminal = false;
  tooltipPago = '';
  /** El pedido seleccionado pertenece a una caja cerrada: sólo se cancela (Q1). */
  cajaCerradaSeleccionada = false;
  /** Motivo del bloqueo por terminal ajena, para no perderlo al recomputar. */
  private tooltipPagoTerminal = '';
  puedeCambiarEstado = false;
  puedeAsignarRepartidor = false;
  esRetiroSeleccionado = false;
  /**
   * Convertir el pedido al otro modo. Pre-computados label, icono y tooltip:
   * la vista no llama funciones.
   */
  puedeConvertirModo = false;
  labelConvertir = 'CONVERTIR';
  iconoConvertir = 'swap_horiz';
  tooltipConvertir = '';

  private updateEstadoFlags(): void {
    const estado = this.selectedDelivery?.estado;
    // El pedido web de la fila: los botones de la solicitud de cancelación cuelgan de esto. Se
    // calculaba sólo al cargar el detalle, y al cancelar (fila deseleccionada) quedaban en el pie.
    this.pedidoWebSel = this.selectedDelivery?.pedidoWeb || null;
    this.isAbierto = estado === DeliveryEstado.ABIERTO;
    this.isParaEntrega = estado === DeliveryEstado.PARA_ENTREGA;
    this.isEnCamino = estado === DeliveryEstado.EN_CAMINO;
    this.isEntregado = estado === DeliveryEstado.ENTREGADO;
    this.isCancelado = estado === DeliveryEstado.CANCELADO;
    this.isTerminal = this.isEntregado || this.isCancelado;
    // Espejo de `transicionesDe()` en el backend: un retiro no pasa por
    // EN_CAMINO, así que ofrecerlo sería ofrecer algo que el backend rechaza.
    const tabla = this.selectedDelivery?.modo === 'RETIRO'
      ? DeliveryDialogComponent.TRANSICIONES_RETIRO
      : DeliveryDialogComponent.TRANSICIONES;
    this.estadosDisponibles = estado ? (tabla[estado] ?? []) : [];

    // `!ventaCobrada`: sobre una venta ya CONCLUIDA (cobro anticipado, delivery
    // todavía EN_CAMINO) el diálogo de cobro abría con las líneas cargadas y
    // saldo 0, así que FINALIZAR quedaba habilitado y volvía a crear las
    // acreditaciones. `acreditar-transferencia-bancaria` no es idempotente.
    // Se lee del delivery y no de `this.ventaCobrada`: ese lo setea
    // `recalcularTotalesDetalle`, y el orden entre los dos no está garantizado
    // en todos los caminos que refrescan la selección.
    const yaCobrada = this.selectedDelivery?.venta?.estado === 'CONCLUIDA';
    // Q1: la caja de esta venta ya se cerró. El backend rechaza el cobro con
    // `CAJA_CERRADA`, así que ofrecerlo sería mandar al cajero a un rechazo.
    // Cancelar sigue habilitado: es una reversa y resta del arqueo.
    this.cajaCerradaSeleccionada = !!this.selectedDelivery?.cajaCerrada;
    // Una venta cancelada tampoco se cobra (el servidor lo rechaza con VENTA_CANCELADA) ni se
    // avanza: el pedido no existe más. Sólo queda cancelar el delivery.
    const ventaCancelada = this.selectedDelivery?.venta?.estado === 'CANCELADA';
    this.ventaCanceladaSel = ventaCancelada;
    this.puedeEditarPago = !!this.selectedDelivery && !this.isTerminal
      && !this.cobroBloqueadoPorTerminal && !yaCobrada && !ventaCancelada && !this.cajaCerradaSeleccionada;
    this.tooltipPago = this.cajaCerradaSeleccionada
      ? 'Caja cerrada: este pedido sólo se puede cancelar y volver a cargar en la caja de hoy'
      : this.tooltipPagoTerminal;
    this.puedeCambiarEstado = !!this.selectedDelivery && this.estadosDisponibles.length > 0 && !this.ventaCanceladaSel;

    // El repartidor es quien LLEVA el pedido. En un retiro nadie lo lleva:
    // asignarlo sería registrar a una persona que no participa.
    this.esRetiroSeleccionado = this.selectedDelivery?.modo === 'RETIRO';
    this.puedeAsignarRepartidor = !!this.selectedDelivery && !this.isTerminal && !this.esRetiroSeleccionado;

    // Convertir mueve el costo del envío dentro o fuera del total, así que
    // pide la venta ABIERTA por el mismo motivo que el cambio de zona: sobre
    // una venta cerrada sería cambiar lo que ya se cobró.
    // Sin selección, el botón no promete un sentido: antes quedaba «A RETIRO» del pedido anterior.
    this.labelConvertir = !this.selectedDelivery ? 'CONVERTIR' : this.esRetiroSeleccionado ? 'A DELIVERY' : 'A RETIRO';
    this.iconoConvertir = !this.selectedDelivery ? 'swap_horiz' : this.esRetiroSeleccionado ? 'delivery_dining' : 'shopping_bag';
    const ventaAbierta = this.selectedDelivery?.venta?.estado === 'ABIERTA';
    this.puedeConvertirModo = !!this.selectedDelivery && !this.isTerminal && ventaAbierta;
    if (!this.selectedDelivery) {
      this.tooltipConvertir = '';
    } else if (this.isTerminal) {
      this.tooltipConvertir = `Un pedido ${this.selectedDelivery.estado} ya no se puede convertir`;
    } else if (!ventaAbierta) {
      this.tooltipConvertir = 'La venta ya fue cerrada: anulá el cobro antes de convertir el pedido';
    } else {
      this.tooltipConvertir = this.esRetiroSeleccionado
        ? 'Pasarlo a reparto: pide dirección y zona de envío'
        : 'Pasarlo a retiro en el local: se quitan dirección, envío y repartidor';
    }
  }

  private async loadDeliveryDetails(): Promise<void> {
    this.selectedItems = [];
    this.itemsDetalle = [];
    this.selectedPagoDetalles = [];
    this.recalcularTotalesDetalle();

    const sel = this.selectedDelivery;
    if (!sel?.venta?.id) return;
    // Lo que se trae es de ESTA fila: si mientras tanto se eligió otra (o se limpió la
    // selección), se descarta en vez de pisar el panel o leer una selección que ya es null.
    const sigue = () => this.selectedDelivery === sel;

    // Si esto falla hay que avisar: un panel vacío es indistinguible de un
    // pedido sin ítems, y el cajero puede creer que el pedido está mal cargado.
    try {
      const items = await firstValueFrom(this.repositoryService.getVentaItems(sel.venta.id));
      if (!sigue()) return;
      this.selectedItems = items;
    } catch (e) {
      if (!sigue()) return;
      this.selectedItems = [];
      this.mostrarError(e, 'No se pudieron cargar los ítems del delivery');
    }

    await this.armarItemsDetalle();
    if (!sigue()) return;

    try {
      if (sel.venta.pago?.id) {
        const detalles = await firstValueFrom(this.repositoryService.getPagoDetalles(sel.venta.pago.id));
        if (!sigue()) return;
        this.selectedPagoDetalles = detalles;
      }
    } catch (e) {
      if (!sigue()) return;
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
  /**
   * Los ítems con el MISMO nombre que sale impreso en el ticket del cliente.
   *
   * El panel mostraba sólo `producto.nombre`: «1 PIZZA» donde el papel decía
   * «1 PIZZA · GRANDE · 1/2 CALABRESA + 1/2 MARGUERITA, sin cebolla». El
   * cajero leía en pantalla algo distinto de lo que el cliente tenía en la
   * mano, que es justo cuando aparece un reclamo que nadie puede resolver.
   *
   * El detalle es una consulta aparte: si falla, los ítems se muestran igual
   * con el nombre pelado en vez de dejar el panel vacío.
   */
  private async armarItemsDetalle(): Promise<void> {
    const ids = this.selectedItems.map((i) => i.id).filter(Boolean);
    let detalle: Record<number, any> = {};
    if (ids.length) {
      try {
        detalle = await firstValueFrom(this.repositoryService.getDetalleVariacionItems(ids)) || {};
      } catch (e) {
        console.warn('No se pudo cargar el detalle de variación:', e);
      }
    }

    this.itemsDetalle = this.selectedItems.map((i) => {
      const d = detalle[i.id] || {};
      const cantidad = Number(i.cantidad || 0);
      // El precio de línea incluye los adicionales: sin ellos, un ítem con
      // extras mostraba menos de lo que el cliente paga y el panel no cerraba
      // con el TOTAL de abajo.
      const unit = Number(i.precioVentaUnitario || 0) + Number(i.precioAdicionales || 0);
      return {
        id: i.id,
        cancelado: i.estado === 'CANCELADO',
        cantidad,
        nombre: (i.producto?.nombre || '-').toUpperCase(),
        variacion: d.variacion || '',
        removidos: d.removidos || [],
        cambios: d.cambios || [],
        adicionales: d.adicionales || [],
        observaciones: d.observaciones || [],
        descuento: Number(i.descuentoUnitario || 0) * cantidad,
        total: unit * cantidad,
      };
    });
  }

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
    this.ventaCobrada = this.selectedDelivery?.venta?.estado === 'CONCLUIDA';
    // El sello es lo primero que se mira en la foto: un pedido cancelado no está «a cobrar», y
    // uno pagado con tarjeta en la tienda tampoco (la venta sigue abierta hasta entregarlo).
    const web = this.selectedDelivery?.pedidoWeb;
    this.selloRecibo = this.selectedDelivery?.estado === 'CANCELADO' || this.selectedDelivery?.venta?.estado === 'CANCELADA' ? 'CANCELADO'
      : this.ventaCobrada ? 'PAGADO'
      : web?.estadoPago === 'PAGADO' ? 'PAGADO ONLINE'
      : 'A COBRAR';
    this.selloPagado = this.selloRecibo === 'PAGADO' || this.selloRecibo === 'PAGADO ONLINE';
    this.detalleCanal = (this.selectedDelivery?.venta?.canalOrigen ?? 'LOCAL') === 'LOCAL' ? 'LOCAL' : 'WEB';
    this.detalleFecha = this.selectedDelivery?.fechaAbierto
      ? new Date(this.selectedDelivery.fechaAbierto) : null;
    this.detalleTitulo = this.selectedDelivery?.modo === 'RETIRO' ? 'RETIRO EN LOCAL' : 'DELIVERY';
    // F10: los mismos números que el ticket impreso, cada uno con su nombre.
    this.pedidoWebSel = this.selectedDelivery?.pedidoWeb || null;
    this.detallePedidoWeb = this.pedidoWebSel?.numero || '';
    this.detalleNumeros = this.selectedDelivery
      ? `${this.selectedDelivery.modo === 'RETIRO' ? 'RETIRO' : 'DELIVERY'} N° ${this.selectedDelivery.id}`
        + (this.selectedDelivery.venta?.id ? ` · VENTA #${this.selectedDelivery.venta.id}` : '')
      : '';
    this.recalcularTotalesMoneda();
  }

  /**
   * El total en cada moneda configurada, además de la principal.
   *
   * `compraLocal` expresa cuántos PRINCIPAL vale 1 de la otra, así que para ir
   * de principal a la otra se divide. Misma fórmula que usa el diálogo de
   * cobro; si falta la cotización se omite la moneda en vez de mostrar un
   * número inventado con rate 1.
   */
  private recalcularTotalesMoneda(): void {
    this.totalesMoneda = [];
    const principal = this.data.principalMoneda;
    if (!principal || !this.detalleTotal) return;

    const monedas = this.data.filteredMonedas?.length ? this.data.filteredMonedas : this.data.monedas;
    for (const m of monedas || []) {
      if (!m?.id || m.id === principal.id) continue;
      const rate = (this.data.exchangeRates || []).find(
        (r: any) =>
          (r.monedaOrigen?.id === principal.id && r.monedaDestino?.id === m.id) ||
          (r.monedaOrigen?.id === m.id && r.monedaDestino?.id === principal.id),
      );
      const compra = Number(rate?.compraLocal || 0);
      if (!compra) continue;
      this.totalesMoneda.push({
        simbolo: (m as any).simbolo || (m as any).denominacion || '',
        valor: this.detalleTotal / compra,
        // Guaraníes no lleva decimales; el resto sí.
        decimales: (m as any).decimales ?? 2,
      });
    }
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
    // También cubre el camino `finalizar()` → `editarPago()` (botón ENTREGADO
    // sobre un delivery sin cobrar), que no pasa por el botón PAGO.
    if (this.cobroBloqueadoPorTerminal || this.cajaCerradaSeleccionada) {
      this.snackBar.open(this.tooltipPago, 'CERRAR', { duration: 6000 });
      return;
    }

    const dialogData: CobrarVentaDialogData = {
      venta: this.selectedDelivery.venta,
      items: this.selectedItems,
      monedas: this.data.filteredMonedas?.length > 0 ? this.data.filteredMonedas : this.data.monedas,
      exchangeRates: this.data.exchangeRates,
      principalMoneda: this.data.principalMoneda,
      caja: this.data.caja,
      costoDelivery: this.detalleEnvio,
      puedeAgregarPagos: this.data.puedeAgregarPagos,
      puedeFinalizar: this.data.puedeFinalizar,
      terminalDeLaCaja: this.data.terminalDeLaCaja,
      // F8: el pago que eligió el cliente en la tienda, para precargarlo (no se guarda solo).
      pagoPrevisto: (this.selectedDelivery as any).pagoPrevisto || undefined,
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

    // Guard: un retiro no se envía (no tiene transición a EN_CAMINO).
    if (objetivo.modo === 'RETIRO') {
      this.snackBar.open('Un retiro no se envía: usá FINALIZAR', 'CERRAR', { duration: 3000 });
      return;
    }

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
    if (this.selectedDelivery.venta?.estado === 'CANCELADA') {
      this.snackBar.open('La venta de este pedido fue cancelada: no se cobra ni se entrega.', 'CERRAR', { duration: 5000 });
      return;
    }
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
    // Capturado acá: entre el click y la respuesta la selección puede cambiar o limpiarse
    // (el poll refresca la lista), como en `enviar()` y `convertirModo()`.
    const objetivo = this.selectedDelivery;

    const cobrada = objetivo.venta?.estado === 'CONCLUIDA';
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
      // Pedido web pagado online: qué se hace con ese cobro (auditoría post-F10).
      const web = objetivo.pedidoWeb;
      const pago = web?.estadoPago === 'PAGADO'
        ? await this.decisionPago.preguntar({ modo: 'CANCELAR', pedidos: [{ numero: web.numero, monto: Number(web.pagoMonto || 0), proveedor: web.pagoProveedorNombre }] })
        : { seguir: true };
      if (!pago.seguir) return;
      try {
        // Una sola llamada transaccional: delivery + venta + cobro + stock.
        await firstValueFrom(this.repositoryService.deliveryCancelar(objetivo.id, motivo, pago.decision));
        if (web?.estadoPago === 'PAGADO') {
          this.snackBar.open(textoResultadoPago(web.numero, web.pagoMonto, pago.decision, undefined, web.pagoProveedorNombre), 'OK', { duration: 10000 });
        } else {
          this.snackBar.open(`${web?.numero || `Delivery #${objetivo.id}`} cancelado`, 'CERRAR', { duration: 3000 });
        }
        this.selectedDelivery = null;
        this.selectedItems = [];
        this.selectedPagoDetalles = [];
        this.updateEstadoFlags();
        this.recalcularTotalesDetalle();
        await this.loadDeliveries();
        await this.cargarPedidosOnline();
      } catch (error) {
        this.mostrarError(error, 'No se pudo cancelar el delivery');
      }
    });
  }

  /**
   * Convierte el pedido entre reparto y retiro.
   *
   * El pedido objetivo se captura ACÁ y no se vuelve a leer de
   * `this.selectedDelivery`: entre el click y el cierre del diálogo la tabla
   * sigue clickeable, y si el cajero elige otra fila mientras tanto la
   * conversión (y el cambio de total) se aplicarían al pedido equivocado, en
   * silencio. Mismo patrón que `enviar()` y `cambiarRepartidor()`.
   */
  convertirModo(): void {
    if (!this.selectedDelivery || !this.puedeConvertirModo) return;
    const objetivo = this.selectedDelivery;

    const ref = this.dialog.open(ConvertirModoDeliveryDialogComponent, {
      width: '460px',
      maxHeight: '90vh',
      data: { delivery: objetivo },
    });

    ref.afterClosed().subscribe(async (salida: ConvertirModoDeliveryDialogResult | null) => {
      if (!salida?.resultado) return;

      const modoNuevo = salida.resultado?.delivery?.modo === 'RETIRO' ? 'RETIRO' : 'DELIVERY';
      this.snackBar.open(
        `Pedido #${objetivo.id} convertido a ${modoNuevo === 'RETIRO' ? 'RETIRO EN LOCAL' : 'DELIVERY'}`,
        'CERRAR', { duration: 3000 },
      );

      // El aviso de cobro va aparte y dura más: es plata que quedó cobrada por
      // encima del total nuevo, y nadie la devuelve sola.
      const aviso = salida.resultado?.advertencia;
      if (aviso?.excedente > 0.5) {
        this.snackBar.open(
          `Atención: lo cobrado supera el total nuevo en ${aviso.excedente.toLocaleString('es-PY')}.`
          + ' Revisá el cobro del pedido.',
          'CERRAR', { duration: 9000, panelClass: ['error-snackbar'] },
        );
      } else if (aviso?.tienePagoRegistrado) {
        this.snackBar.open(
          'Este pedido ya tiene líneas de cobro registradas: revisá el detalle del pago con el total nuevo.',
          'CERRAR', { duration: 7000 },
        );
      }

      await this.recargarManteniendoSeleccion();
      if (salida.reimprimir) await this.imprimirDe(objetivo.id);
    });
  }

  async imprimir(): Promise<void> {
    if (!this.selectedDelivery) return;
    await this.imprimirDe(this.selectedDelivery.id);
  }

  /** Imprime el ticket de un pedido concreto (la selección puede haber cambiado). */
  private async imprimirDe(deliveryId: number): Promise<void> {
    try {
      const res = await firstValueFrom(this.repositoryService.deliveryImprimirTicket(deliveryId));
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
    // Si mientras se recargaba el cajero eligió otra fila (o cerró el detalle), no se le vuelve a
    // poner la anterior: los botones del footer actuarían sobre un pedido que no está mirando.
    if (this.selectedDelivery?.id !== id) return;
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
    // El backend manda el código dentro del mensaje (es lo único que sobrevive
    // a los tres transportes). Acá se traduce a algo que diga qué hacer, en vez
    // de mostrar «CAJA_CERRADA: …» o el JSON del 500 del modo cliente.
    const mensaje = esCajaCerrada(error)
      ? 'La caja de esta venta ya fue cerrada: el pedido sólo se puede cancelar y volver a cargar en la caja de hoy.'
      : (limpiarCodigo((error as any)?.message) || fallback);
    this.snackBar.open(mensaje, 'CERRAR', { duration: 7000, panelClass: ['error-snackbar'] });
  }
}
