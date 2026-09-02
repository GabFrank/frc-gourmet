import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatBadgeModule } from '@angular/material/badge';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { mensajeDeError } from 'src/app/shared/utils/error-message.util';
import { FormControl, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Observable, of, firstValueFrom, async } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { animate, state, style, transition, trigger } from '@angular/animations';

import { RepositoryService } from '../../../database/repository.service';
import { CajaMoneda } from '../../../database/entities/financiero/caja-moneda.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { VentaItem, EstadoVentaItem } from '../../../database/entities/ventas/venta-item.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { PdvMesa, PdvMesaEstado } from '../../../database/entities/ventas/pdv-mesa.entity';
import { ProductoSearchDialogComponent } from '../../../shared/components/producto-search-dialog/producto-search-dialog.component';
import { Presentacion } from '../../../database/entities/productos/presentacion.entity';
import { Venta, VentaEstado } from 'src/app/database/entities/ventas/venta.entity';
import { PagoEstado } from 'src/app/database/entities/compras/estado.enum';
import { TipoDetalle } from 'src/app/database/entities/compras/pago-detalle.entity';
import { AuthService } from 'src/app/services/auth.service';
import { Caja } from 'src/app/database/entities/financiero/caja.entity';
import { CreateCajaDialogComponent } from '../../financiero/cajas/create-caja-dialog/create-caja-dialog.component';
import { SeleccionarCajaDialogComponent, SeleccionarCajaDialogData } from '../../../shared/components/seleccionar-caja-dialog/seleccionar-caja-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';
import { MesaSelectionDialogComponent } from '../../../shared/components/mesa-selection-dialog/mesa-selection-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableDataSource } from '@angular/material/table';
import { PdvAtajoGrupo } from 'src/app/database/entities/ventas/pdv-atajo-grupo.entity';
import { CobrarVentaDialogComponent, CobrarVentaDialogData } from 'src/app/shared/components/cobrar-venta-dialog/cobrar-venta-dialog.component';
import { CancelarVentaDialogComponent } from 'src/app/shared/components/cancelar-venta-dialog/cancelar-venta-dialog.component';
import { EditVentaItemDialogComponent } from 'src/app/shared/components/edit-venta-item-dialog/edit-venta-item-dialog.component';
import { derivarEstadoVisualMesa, derivarEstadoDetalleMesa } from 'src/app/shared/utils/mesa-estado.util';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';
import { TransferirDestinoDialogComponent, TransferirDestinoDialogData, TransferirDestinoResult }
  from 'src/app/shared/components/transferir-destino-dialog/transferir-destino-dialog.component';
import { BuscarClienteDialogComponent } from 'src/app/shared/components/buscar-cliente-dialog/buscar-cliente-dialog.component';
import { DescuentoDialogComponent } from 'src/app/shared/components/descuento-dialog/descuento-dialog.component';
import { DividirCuentaDialogComponent } from 'src/app/shared/components/dividir-cuenta-dialog/dividir-cuenta-dialog.component';
import { AtajoProductosDialogComponent } from 'src/app/shared/components/atajo-productos-dialog/atajo-productos-dialog.component';
import { AtajoConfigDialogComponent } from 'src/app/shared/components/atajo-config-dialog/atajo-config-dialog.component';
import { Sector } from 'src/app/database/entities/ventas/sector.entity';
import { DeliveryDialogComponent, DeliveryDialogData } from 'src/app/shared/components/delivery-dialog/delivery-dialog.component';
import { Delivery } from 'src/app/database/entities/ventas/delivery.entity';
import { PersonalizarProductoDialogComponent, PersonalizarProductoDialogResult } from 'src/app/shared/components/personalizar-producto-dialog/personalizar-producto-dialog.component';
import { SeleccionarVariacionDialogComponent, SeleccionarVariacionDialogData, SeleccionarVariacionDialogResult } from 'src/app/shared/components/seleccionar-variacion-dialog/seleccionar-variacion-dialog.component';
import { PesajeBuffetDialogComponent, PesajeBuffetDialogResult } from 'src/app/shared/components/pesaje-buffet-dialog/pesaje-buffet-dialog.component';
import { resolverPrecioVigente } from 'src/app/shared/utils/precio-vigencia.util';
import { parseEtiquetaBalanza } from 'src/app/shared/utils/balanza-ean13.util';
import { ProductoTipo } from 'src/app/database/entities/productos/producto-tipo.enum';
import { AbrirComandaDialogComponent, AbrirComandaDialogData, AbrirComandaDialogResult } from 'src/app/shared/components/abrir-comanda-dialog/abrir-comanda-dialog.component';
import { Comanda, ComandaEstado } from 'src/app/database/entities/ventas/comanda.entity';
import { UtilitariosDialogComponent } from './utilitarios-dialog/utilitarios-dialog.component';

interface MonedaWithTotal {
  moneda: Moneda;
  total: number;
}

interface CurrencyDisplay {
  code: string;        // Currency code (e.g., 'PY', 'US', 'BR')
  symbol: string;      // Currency symbol (e.g., '$', '€')
  denominationCode: string; // Currency denomination code (e.g., 'PYG', 'USD', 'BRL')
  total: number;
  flag: string;
}

/**
 * Mesa con el color y el tooltip ya resueltos.
 *
 * La regla 4 del proyecto prohíbe funciones y getters en templates, así que el
 * estado visual se calcula una vez y se estampa acá. No son columnas: viven sólo
 * en el objeto que consume la grilla.
 */
type MesaVm = PdvMesa & { _claseEstado?: string; _tooltip?: string };

@Component({
  selector: 'app-pdv',
  templateUrl: './pdv.component.html',
  styleUrls: ['./pdv.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatInputModule,
    MatTableModule,
    MatFormFieldModule,
    MatBadgeModule,
    MatGridListModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatMenuModule,
    MatCheckboxModule,
    // Sin esto, `*appHasPermission` desazucara a un <ng-template> que nadie
    // instancia: el boton desaparece en silencio, sin error de AOT ni de consola.
    HasPermissionDirective
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', overflow: 'hidden', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class PdvComponent implements OnInit, OnDestroy {
  private mesasRefreshInterval: any = null;
  private refreshingMesas = false;

  // Modo mover items
  moverItemsMode = false;
  selectedItemIds: Set<number> = new Set();
  // Table data
  ventaItemsDataSource = new MatTableDataSource<VentaItem>([]);
  displayedColumns: string[] = ['productoNombre', 'cantidad', 'precio', 'total', 'actions'];
  expandedElement: VentaItem | null = null;
  columnsToDisplayWithExpand: string[] = [...this.displayedColumns];

  // ─── Estado de cobro por ítem (cobro parcial) ──────────────────────────
  // Resumen en bruto para la barra Total/Pagado/Saldo del PdV.
  cobroDeudaBruta = 0;
  cobroPagado = 0;
  cobroSaldo = 0;
  hayCobroParcial = false; // true si algún ítem tiene cobertura parcial/total

  // Search form
  searchForm: FormGroup;

  // Currency management
  monedas: Moneda[] = [];
  monedasWithTotals: MonedaWithTotal[] = [];
  saldos: Map<number, number> = new Map<number, number>();
  exchangeRates: MonedaCambio[] = [];
  filteredMonedas: Moneda[] = [];
  currencyTotalsMap: Map<number, number> = new Map<number, number>();
  // Principal currency
  principalMoneda: Moneda | null = null;
  principalMonedaId: number | null = null;

  // Product demo data for grid
  productos: Producto[] = [];

  // Tables (mesas)
  mesas: MesaVm[] = [];
  loadingMesas = false;
  selectedMesa: PdvMesa | null = null;

  // Venta rápida (sin mesa)
  ventaRapidaActual: Venta | null = null;

  // Delivery activo (cuando se editan items de un delivery)
  deliveryActual: Delivery | null = null;
  /** Muestra el boton DELIVERY del PdV (Configuracion del PdV -> Delivery). */
  deliveryHabilitado = true;

  // Comandas (tarjetas de cuenta individual)
  comandas: any[] = [];
  loadingComandas = false;
  selectedComanda: any = null;
  activeTab: 'MESAS' | 'COMANDAS' = 'MESAS';
  mesasOcupadasCount = 0;
  comandasOcupadasCount = 0;
  /** Repartos vivos (ABIERTO / PARA_ENTREGA / EN_CAMINO). */
  deliveriesPendientesCount = 0;
  /** Pedidos de la web esperando que alguien los acepte. */
  pedidosOnlinePendientesCount = 0;
  /**
   * Con la tienda online apagada no entran pedidos web, así que su badge no
   * tiene nada que contar y el poll que lo alimenta no tiene a qué preguntarle.
   */
  tiendaOnlineActiva = false;
  private pedidosOnlineInterval: any;
  private ultimoConteoPedidosOnline = 0;
  private refreshingComandas = false;

  // Sector filter for tables
  sectores: Sector[] = [];
  selectedSectorId: number | null = null;

  // Pre-generated table numbers for template
  preGeneratedTableNumbers: number[] = [];

  // Loading states
  loadingExchangeRates = false;
  loadingConfig = false;

  // Cliente name editing
  isEditingClienteName = false;
  clienteNameForm: FormGroup;

  // Caja
  caja: Caja | null = null;
  // Dispositivo de este PC (snapshot del boot). Si coincide con el dispositivo
  // de la caja seleccionada, este equipo puede cobrar; si no, solo lanza items.
  currentDeviceId: number | null = null;
  // Gate de cobro por dispositivo: true solo en el dispositivo donde se abrio
  // la caja. Otros dispositivos (y la PWA) pueden lanzar items pero no cobrar.
  /**
   * Gate de terminal ajena. Se computa en dos etapas a propósito:
   *
   *  1. `aplicarCajaSeleccionada()` lo fija **síncrono** al unirse a la caja,
   *     con el criterio histórico (sólo la terminal dueña opera). Fail-closed.
   *  2. `recomputarGateTerminal()` lo **amplía** una vez leída la config del
   *     PdV, si el local habilitó alguno de los dos permisos.
   *
   * Si la lectura de config falla, quedan los valores de (1): la terminal dueña
   * nunca puede quedarse sin cobrar por un error de red.
   */
  esTerminalDeLaCaja = true;
  puedeCobrar = false;
  puedeFinalizarVenta = false;
  /** Texto del chip informativo en la barra de caja. Vacío = no se muestra. */
  avisoTerminal = '';
  tooltipCobrar = 'Cobrar (F1)';
  tooltipCobroRapido = 'Cobro rápido (F2)';
  // Nombre del dispositivo dueno de la caja (para el mensaje al usuario).
  dispositivoCajaNombre = '';

  // Atajos (accesos rápidos)
  atajoGrupos: any[] = [];
  selectedAtajoGrupo: any = null;
  atajoItemsDelGrupo: any[] = [];
  atajosGridSize = 3;
  atajosProductosGridSize = 3;
  pdvConfig: any = null;

  // tiempo abierto
  tiempoAbierto = '0h 0m';

  // Getter to combine loading states for currency display
  // get loadingCurrencies(): boolean {
  //   return this.loadingExchangeRates || this.loadingConfig;
  // }

  // Search constants
  readonly SEARCH_DIALOG_WIDTH = '800px';
  readonly SEARCH_DIALOG_HEIGHT = '600px';


  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private authService: AuthService,
    private tabsService: TabsService,
    private snackBar: MatSnackBar,
    private elementRef: ElementRef
  ) {
    // Initialize form
    this.searchForm = this.fb.group({
      cantidad: [1],
      searchTerm: ['']
    });

    // Initialize cliente name form
    this.clienteNameForm = this.fb.group({
      nombre: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    // Los pedidos de la web entran solos. Sin un aviso acá, el cajero se entera
    // recién si abre el diálogo de delivery por su cuenta: un pedido puede
    // quedar sin mirar mientras el cliente espera.
    this.refrescarContadoresDelivery();
    this.pedidosOnlineInterval = setInterval(() => this.refrescarContadoresDelivery(), 15000);

    // Dispositivo de este PC (para el gate de cobro por dispositivo).
    this.currentDeviceId = (window as any).api?.getDeviceId ? (window as any).api.getDeviceId() : null;

    // Selección de caja: cualquier usuario/dispositivo puede unirse a una caja
    // ABIERTA para lanzar items. Si hay 1 sola, se usa esa; si hay varias, se
    // muestra la lista para elegir; si no hay ninguna, se ofrece abrir una.
    if (this.authService.currentUser) {
      await this.inicializarCaja();
    }
    //set timeout and focus on searchTerm input
    setTimeout(() => {
      const searchTermInput = document.querySelector('input[formControlName="searchTerm"]');
      if (searchTermInput) {
        (searchTermInput as HTMLInputElement).focus();
      }
    }, 100);

    // set interval to update tiempoAbierto each 60 seconds
    setInterval(() => {
      this.tiempoAbierto = this.timeOpen();
    }, 60000);


  }

  /**
   * Resuelve a qué caja abierta se une este PdV: 1 → automática; varias →
   * diálogo de selección; ninguna → ofrecer abrir una nueva.
   */
  private async inicializarCaja(): Promise<void> {
    let cajasAbiertas: Caja[] = [];
    try {
      cajasAbiertas = (await firstValueFrom(this.repositoryService.getCajasAbiertas())) || [];
    } catch (e) {
      // ⚠️ Un error NO es "no hay cajas". Antes el catch dejaba la lista vacía y
      // el flujo caía al else, que ofrece "No hay una caja abierta, ¿desea abrir
      // una nueva?" — una afirmación falsa cuando la consulta simplemente falló.
      // En modo cliente alcanza un timeout, y de ahí salió una segunda caja
      // abierta en producción. Ante la duda no se ofrece abrir nada.
      console.error('Error obteniendo cajas abiertas:', e);
      const mensaje = (e as any)?.message?.replace(/^Error invoking remote method '[^']+':\s*Error:\s*/, '')
        || 'Error desconocido';
      this.dialog.open(ConfirmationDialogComponent, {
        width: '460px',
        disableClose: true,
        data: {
          title: 'NO SE PUDO CONSULTAR LAS CAJAS',
          message: `No se pudo leer el estado de las cajas abiertas, así que no se sabe si hay una en curso.\n\n${mensaje}\n\nRevisá la conexión con el servidor y volvé a abrir el PdV. Si abrís una caja a ciegas podés terminar con dos abiertas.`,
          confirmText: 'ENTENDIDO',
          showCancel: false,
        },
      });
      this.tabsService.removeTabById('pdv');
      return;
    }

    if (cajasAbiertas.length === 1) {
      this.aplicarCajaSeleccionada(cajasAbiertas[0]);
    } else if (cajasAbiertas.length > 1) {
      const dialogRef = this.dialog.open(SeleccionarCajaDialogComponent, {
        width: '520px',
        disableClose: true,
        data: { cajas: cajasAbiertas, currentDeviceId: this.currentDeviceId } as SeleccionarCajaDialogData,
      });
      const result = await firstValueFrom(dialogRef.afterClosed());
      if (result?.caja) {
        this.aplicarCajaSeleccionada(result.caja);
      } else if (result?.abrirNueva) {
        this.ofrecerAbrirCaja(false);
      } else {
        this.tabsService.removeTabById('pdv');
      }
    } else {
      this.ofrecerAbrirCaja(true);
    }
  }

  /**
   * Ofrece abrir una nueva caja. Si `preguntar` es true, primero confirma.
   */
  private ofrecerAbrirCaja(preguntar: boolean): void {
    const abrir = () => {
      const cajaDialogRef = this.dialog.open(CreateCajaDialogComponent, {
        width: '80vw',
        height: '80vh',
        disableClose: true,
      });
      cajaDialogRef.afterClosed().subscribe(async (cajaResult) => {
        if (cajaResult?.success) {
          // Recargar la caja recién abierta de este usuario.
          const caja = await firstValueFrom(
            this.repositoryService.getCajaAbiertaByUsuario(this.authService.currentUser!.id)
          );
          if (caja) {
            this.aplicarCajaSeleccionada(caja);
          } else {
            this.tabsService.removeTabById('pdv');
          }
        } else {
          this.tabsService.removeTabById('pdv');
        }
      });
    };

    if (!preguntar) {
      abrir();
      return;
    }

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      disableClose: true,
      data: {
        title: 'Caja abierta no encontrada',
        message: 'No hay una caja abierta, ¿desea abrir una nueva?',
      },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        abrir();
      } else {
        this.tabsService.removeTabById('pdv');
      }
    });
  }

  /**
   * Fija la caja activa, computa si este dispositivo puede cobrar y carga datos.
   */
  private aplicarCajaSeleccionada(caja: Caja): void {
    this.caja = caja;
    const dispositivoCajaId = caja?.dispositivo?.id ?? null;
    this.dispositivoCajaNombre = caja?.dispositivo?.nombre || (dispositivoCajaId ? `Dispositivo #${dispositivoCajaId}` : '');
    // Solo el dispositivo donde se abrió la caja puede cobrar. Se bloquea SOLO
    // cuando se puede determinar positivamente que este dispositivo difiere del
    // dueño de la caja; si el dispositivo local no está identificado (ej.
    // standalone sin device configurado) no se bloquea, para no romper el cobro
    // en instalaciones de un solo equipo.
    this.esTerminalDeLaCaja =
      this.currentDeviceId == null || dispositivoCajaId == null || this.currentDeviceId === dispositivoCajaId;
    // Arranque fail-closed: la conducta histórica. `recomputarGateTerminal()`
    // sólo puede ampliar esto, nunca restringirlo.
    this.puedeCobrar = this.esTerminalDeLaCaja;
    this.puedeFinalizarVenta = this.esTerminalDeLaCaja;
    this.actualizarTextosTerminal(caja.id);
    this.loadInitialData();
  }

  /**
   * Amplía el gate según la configuración del PdV, una vez leída.
   *
   * `PdvConfig` puede habilitar por separado registrar pagos y finalizar ventas
   * desde una terminal que no abrió la caja. Nunca restringe: si la config no
   * se pudo leer o no habilita nada, quedan los valores fail-closed que fijó
   * `aplicarCajaSeleccionada`.
   */
  private recomputarGateTerminal(): void {
    if (this.esTerminalDeLaCaja) return;
    this.puedeCobrar = this.pdvConfig?.permitirPagosTerminalAjena === true;
    this.puedeFinalizarVenta = this.pdvConfig?.permitirFinalizarTerminalAjena === true;
    this.actualizarTextosTerminal(this.caja?.id);
  }

  /**
   * Textos del aviso y de los tooltips. Pre-computados: la regla 4 prohíbe
   * funciones y getters en el template.
   */
  private actualizarTextosTerminal(cajaId?: number | null): void {
    const terminal = this.dispositivoCajaNombre || 'la terminal donde se abrió la caja';
    if (this.esTerminalDeLaCaja) {
      this.avisoTerminal = '';
      this.tooltipCobrar = 'Cobrar (F1)';
      this.tooltipCobroRapido = 'Cobro rápido (F2)';
      return;
    }
    const ref = cajaId ? `Caja #${cajaId}` : 'Caja';
    if (this.puedeCobrar && this.puedeFinalizarVenta) {
      this.avisoTerminal = `${ref} abierta en ${terminal} · cobro habilitado desde acá`;
    } else if (this.puedeCobrar) {
      this.avisoTerminal = `${ref} abierta en ${terminal} · podés cargar pagos, no finalizar`;
    } else if (this.puedeFinalizarVenta) {
      this.avisoTerminal = `${ref} abierta en ${terminal} · podés finalizar, no cargar pagos`;
    } else {
      this.avisoTerminal = `${ref} abierta en ${terminal} · el cobro se hace allá`;
    }
    this.tooltipCobrar = this.puedeCobrar || this.puedeFinalizarVenta
      ? 'Cobrar (F1)'
      : `El cobro solo se realiza en ${terminal}`;
    // El cobro rápido hace las dos cosas de una: cargar el pago y cerrar la
    // venta. Necesita los dos permisos.
    this.tooltipCobroRapido = this.puedeCobrar && this.puedeFinalizarVenta
      ? 'Cobro rápido (F2)'
      : `El cobro rápido registra y finaliza: solo se hace en ${terminal}`;
  }

  /**
   * Relee la config del PdV justo antes de cobrar.
   *
   * El diálogo de configuración no se abre desde el PdV (va por el menú, el
   * home o el dashboard), así que sin esto un cambio de los flags no surtía
   * efecto hasta cerrar y reabrir la pestaña. Es una sola fila.
   */
  private async refrescarGateTerminal(): Promise<void> {
    if (this.esTerminalDeLaCaja) return;
    try {
      const cfg = await firstValueFrom(this.repositoryService.getPdvConfig());
      const config = Array.isArray(cfg) ? cfg[0] : cfg;
      if (config) this.pdvConfig = config;
    } catch { /* se mantiene lo que ya estaba */ }
    this.recomputarGateTerminal();
  }

  /**
   * Load initial data from database (monedas, exchange rates, products)
   */
  async loadInitialData(): Promise<void> {
    try {
      // Load monedas
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());

      // Find principal moneda (assuming it's marked in the database with a principal flag)
      const principalMonedas = this.monedas.filter(m => m.principal === true);

      if (principalMonedas.length > 0) {
        this.principalMoneda = principalMonedas[0];
        this.principalMonedaId = this.principalMoneda.id || null;
      } else {
        // Fallback if no principal currency is marked
        console.warn('No principal currency found in database');
        this.principalMoneda = this.monedas[0];
        this.principalMonedaId = this.principalMoneda?.id || null;
      }

      // Load filtered currencies based on CajaMoneda configuration
      await this.loadCajaMonedasConfig();

      // Load exchange rates
      await this.loadExchangeRates();

      // Load tables (mesas)
      await this.loadMesas();

      // Load sectores de MESA (chips para filtrar mesas)
      this.sectores = await firstValueFrom(this.repositoryService.getSectoresActivos('MESA'));

      // Load comandas
      await this.loadComandas();

      // Load PdV config for tab default
      try {
        const pdvConfigs = await firstValueFrom(this.repositoryService.getPdvConfig());
        if (pdvConfigs) {
          const config = Array.isArray(pdvConfigs) ? pdvConfigs[0] : pdvConfigs;
          this.pdvConfig = config;
          if (config?.pdvTabDefault) {
            this.activeTab = config.pdvTabDefault as 'MESAS' | 'COMANDAS';
          }
          if (config?.atajosGridSize) {
            this.atajosGridSize = config.atajosGridSize;
          }
          if (config?.atajosProductosGridSize) {
            this.atajosProductosGridSize = config.atajosProductosGridSize;
          }
          // `deliveryHabilitado` es nuevo: en una base sin migrar llega
          // undefined, y ahi el modulo tiene que seguir visible.
          this.deliveryHabilitado = config?.deliveryHabilitado !== false;
        }
      } catch (e) { /* use default */ }
      finally {
        // En `finally`: si la lectura falla, el gate se queda en fail-closed y
        // el aviso sigue siendo el correcto.
        this.recomputarGateTerminal();
      }

      try {
        const tienda: any = await firstValueFrom(this.repositoryService.getTiendaOnlineConfig());
        this.tiendaOnlineActiva = !!tienda?.activa;
      } catch { /* sin config legible se asume apagada */ }

      // Load atajo grupos
      await this.loadAtajoGrupos();

      // Initialize demo data
      this.initDemoData();

      // Calculate totals
      this.calculateTotals();

    } catch (error) {
      console.error('Error loading initial data:', error);
    }

    // Auto-refresh mesas y comandas cada 1 segundo
    this.mesasRefreshInterval = setInterval(() => {
      this.refreshMesasSilent();
      this.refreshComandasSilent();
    }, 1000);
  }

  /**
   * Refresca los dos badges del botón DELIVERY y avisa con un sonido cuando
   * entra un pedido nuevo. El sonido se genera con WebAudio en vez de un
   * archivo: no hay assets de audio en el proyecto y empaquetar uno para un
   * beep no se justifica.
   */
  private async refrescarContadoresDelivery(): Promise<void> {
    if (!this.deliveryHabilitado) return;
    if (this.tiendaOnlineActiva) {
      try {
        const res: any = await firstValueFrom(this.repositoryService.contarPedidosOnlinePendientes());
        const nuevos = Number(res?.total ?? res ?? 0) || 0;
        if (nuevos > this.ultimoConteoPedidosOnline) this.sonarAvisoPedido();
        this.ultimoConteoPedidosOnline = nuevos;
        this.pedidosOnlinePendientesCount = nuevos;
      } catch {
        /* el badge no puede romper el PdV */
      }
    }
    try {
      const caja = this.caja?.id;
      if (caja) {
        const r: any = await firstValueFrom(
          this.repositoryService.deliveryListarPdv(caja, { page: 1, pageSize: 200 }),
        );
        const vivos = (r?.data || []).filter((d: any) =>
          ['ABIERTO', 'PARA_ENTREGA', 'EN_CAMINO'].includes(d?.estado));
        this.deliveriesPendientesCount = vivos.length;
      }
    } catch {
      /* idem */
    }
  }

  /** Beep de aviso. Deliberadamente distinto del resto: el local tiene ruido. */
  private sonarAvisoPedido(): void {
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const tono = (freq: number, inicio: number, dur: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, ctx.currentTime + inicio);
        gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + inicio + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + dur);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(ctx.currentTime + inicio);
        osc.stop(ctx.currentTime + inicio + dur + 0.02);
      };
      // Dos notas ascendentes: se distingue de cualquier beep de error.
      tono(880, 0, 0.16);
      tono(1320, 0.18, 0.22);
      setTimeout(() => ctx.close().catch(() => {}), 900);
    } catch {
      /* sin audio no pasa nada */
    }
  }

  ngOnDestroy(): void {
    if (this.mesasRefreshInterval) {
      clearInterval(this.mesasRefreshInterval);
    }
    if (this.pedidosOnlineInterval) {
      clearInterval(this.pedidosOnlineInterval);
    }
    if (this.focusBuscadorTimeout) {
      clearTimeout(this.focusBuscadorTimeout);
    }
  }

  private focusBuscadorTimeout: any = null;

  /**
   * Reenfoca el input de búsqueda de producto tras un pequeño delay.
   * Se usa al hacer click en una mesa/comanda u otro lugar del PdV, para que el
   * usuario pueda seguir escaneando/escribiendo productos sin reubicar el foco a mano.
   * No roba el foco si el usuario está escribiendo en el input de nombre de cliente
   * (u otro input de texto), ni si hay un diálogo abierto.
   */
  private focusBuscadorConDelay(delayMs = 500): void {
    if (this.focusBuscadorTimeout) {
      clearTimeout(this.focusBuscadorTimeout);
    }
    this.focusBuscadorTimeout = setTimeout(() => {
      this.focusBuscadorTimeout = null;
      // No interrumpir la edición del nombre del cliente.
      if (this.isEditingClienteName) return;
      // No robar el foco si hay un diálogo abierto (ej. cobro, asociar cliente).
      if (this.dialog.openDialogs.length > 0) return;
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        const esInputTexto = tag === 'INPUT' || tag === 'TEXTAREA';
        const esBuscador = active.getAttribute('formControlName') === 'searchTerm';
        // Si está escribiendo en otro input (ej. nombre cliente), no interrumpir.
        if (esInputTexto && !esBuscador) return;
      }
      const searchTermInput = document.querySelector('input[formControlName="searchTerm"]');
      if (searchTermInput) {
        (searchTermInput as HTMLInputElement).focus();
      }
    }, delayMs);
  }

  /**
   * Estampa en la mesa el color y el tooltip que le corresponden.
   *
   * El color responde UNA pregunta: ¿la mesa tiene cuenta propia? El badge, que
   * ya existía, carga la otra dimensión: ¿hay comandas sentadas acá? Son dos
   * señales ortogonales, y colapsarlas destruye la distinción que necesita el
   * cajero — "no hay nada que cobrarle a la mesa" vs "hay cuenta de mesa Y
   * además comandas".
   *
   *   verde            vacía
   *   amarillo + badge sin cuenta de mesa, N comandas sentadas
   *   naranja          cuenta de mesa
   *   naranja + badge  cuenta de mesa + comandas → ⚠️ 2 cuentas o más
   *   azul             reservada (pisa a las demás)
   *
   * Se estampa en vez de calcularse en el template porque la regla 4 del
   * proyecto prohíbe funciones y getters en templates. ⚠️ Hay SIETE caminos que
   * escriben `mesas`; si alguno no llama a esto, el color se congela — y el más
   * traicionero es el de la mesa SELECCIONADA, que `refreshMesasSilent` saltea a
   * propósito para no pisar datos en edición.
   */
  private estamparMesa(mesa: any): void {
    if (!mesa) return;
    // La matriz de decisión vive en `mesa-estado.util.ts`, fuera del componente,
    // para que el test la importe en vez de replicarla: una copia se queda vieja
    // en silencio el día que alguien cambia la regla acá.
    const { clase, tooltip } = derivarEstadoVisualMesa(mesa);
    mesa._claseEstado = clase;
    mesa._tooltip = tooltip;

    // La card de detalle muestra la misma verdad que la tarjeta del plano.
    if (this.selectedMesa && mesa.id === this.selectedMesa.id) this.estamparDetalleMesa();
  }

  /** Estado de la mesa seleccionada, para la card de detalle (regla 4: sin
   *  funciones ni getters en el template). Se recalcula al seleccionar y al
   *  estampar. */
  mesaDetalleClase = '';
  mesaDetalleTexto = '';

  private estamparDetalleMesa(): void {
    const { clase, texto } = derivarEstadoDetalleMesa(this.selectedMesa as any);
    this.mesaDetalleClase = clase;
    this.mesaDetalleTexto = texto;
  }

  /**
   * Abre una comanda sentada en la mesa seleccionada.
   *
   * ⚠️ Se busca por id dentro de `this.comandas`, NO se reusa el objeto que
   * viene en `mesa.comandas`: son grafos distintos y `refreshComandasSilent`
   * sólo actualiza los de `this.comandas`. Reusar la referencia de la mesa deja
   * la comanda seleccionada congelada.
   */
  async abrirComandaDeMesa(comandaDeLaMesa: any): Promise<void> {
    if (!comandaDeLaMesa?.id) return;
    // Se revalida el ESTADO, no sólo la existencia: `getComandasActivas` devuelve
    // también las DISPONIBLE, y si otro cajero liberó la comanda entre el render
    // del chip y el click, `selectComanda` abriría el diálogo de asignar
    // mesa/sector — otra cosa completamente distinta a lo que se pidió.
    const viva = this.comandas.find((c: any) => c.id === comandaDeLaMesa.id);
    if (!viva || viva.estado !== 'OCUPADO') {
      this.snackBar.open('Esa comanda ya no está abierta', 'CERRAR', { duration: 3000 });
      await this.loadMesas();
      return;
    }
    this.activeTab = 'COMANDAS';
    await this.selectComanda(viva);
  }

  /** Estampa todas y recalcula el contador del tab, que también deriva. */
  private estamparMesas(): void {
    for (const mesa of this.mesas) this.estamparMesa(mesa);
    this.estamparDetalleMesa();  // por si la seleccionada no está en el array
    // El badge del tab cuenta lo mismo que pinta de naranja: cuentas de mesa.
    // Antes contaba por la columna cruda y quedaba desalineado con los colores.
    this.mesasOcupadasCount = this.mesas.filter(m => !!(m as any).venta).length;
  }

  /**
   * Refresh mesas sin afectar la selección actual
   */
  private async refreshMesasSilent(): Promise<void> {
    if (this.refreshingMesas) return;
    this.refreshingMesas = true;
    try {
      const mesasFrescas = await firstValueFrom(this.repositoryService.getPdvMesas());
      const mesasActivas = mesasFrescas.filter(m => m.activo).sort((a, b) => a.numero - b.numero);

      // Actualizar estado de cada mesa sin perder la selección
      for (const mesaFresca of mesasActivas) {
        const mesaLocal = this.mesas.find(m => m.id === mesaFresca.id);
        if (mesaLocal) {
          mesaLocal.estado = mesaFresca.estado;
          mesaLocal.comandas = mesaFresca.comandas;
          // Actualizar venta solo si no es la mesa seleccionada (para no pisar datos en edición)
          if (!this.selectedMesa || this.selectedMesa.id !== mesaLocal.id) {
            mesaLocal.venta = mesaFresca.venta;
          }
        }
      }

      // Agregar mesas nuevas que no existían
      for (const mesaFresca of mesasActivas) {
        if (!this.mesas.find(m => m.id === mesaFresca.id)) {
          this.mesas.push(mesaFresca);
        }
      }

      this.mesas = [...this.mesas];
      this.estamparMesas();
    } catch (error) {
      // Silencioso — no interrumpir al usuario
    } finally {
      this.refreshingMesas = false;
    }
  }

  /**
   * Load tables (mesas) from the database
   */
  async loadMesas(): Promise<void> {
    this.loadingMesas = true;
    try {
      // Get all active tables
      this.mesas = await firstValueFrom(this.repositoryService.getPdvMesas()) as MesaVm[];

      // Filter for active tables
      this.mesas = this.mesas.filter(mesa => mesa.activo);

      // Sort tables by number
      this.mesas.sort((a, b) => a.numero - b.numero);
      this.estamparMesas();

      console.log(`Loaded ${this.mesas.length} tables`);
    } catch (error) {
      console.error('Error loading tables:', error);
      // Initialize empty array on error
      this.mesas = [];
    } finally {
      this.loadingMesas = false;
    }
  }

  /**
   * Load tables by sector
   */
  async loadMesasBySector(sectorId: number): Promise<void> {
    this.loadingMesas = true;
    try {
      this.selectedSectorId = sectorId;
      // Get tables by sector
      this.mesas = await firstValueFrom(this.repositoryService.getPdvMesasBySector(sectorId)) as MesaVm[];

      // Filter for active tables
      this.mesas = this.mesas.filter(mesa => mesa.activo);

      // Sort tables by number
      this.mesas.sort((a, b) => a.numero - b.numero);
      this.estamparMesas();

      console.log(`Loaded ${this.mesas.length} tables for sector ${sectorId}`);
    } catch (error) {
      console.error(`Error loading tables for sector ${sectorId}:`, error);
      // Initialize empty array on error
      this.mesas = [];
    } finally {
      this.loadingMesas = false;
    }
  }

  /**
   * Reset sector filter and load all tables
   */
  async resetMesasFilter(): Promise<void> {
    this.selectedSectorId = null;
    await this.loadMesas();
  }

  // --- Comandas ---

  async loadComandas(): Promise<void> {
    this.loadingComandas = true;
    try {
      this.comandas = await firstValueFrom(this.repositoryService.getComandasActivas());
      this.comandas.sort((a: any, b: any) => a.numero - b.numero);
      this.comandasOcupadasCount = this.comandas.filter((c: any) => c.estado === 'OCUPADO').length;
    } catch (error) {
      console.error('Error loading comandas:', error);
      this.comandas = [];
    } finally {
      this.loadingComandas = false;
    }
  }

  private async refreshComandasSilent(): Promise<void> {
    if (this.refreshingComandas) return;
    this.refreshingComandas = true;
    try {
      const comandasFrescas = await firstValueFrom(this.repositoryService.getComandasActivas());
      const sorted = comandasFrescas.sort((a: any, b: any) => a.numero - b.numero);

      // Para las ocupadas, cargar venta abierta
      for (const cf of sorted) {
        if (cf.estado === 'OCUPADO') {
          const conVenta = await firstValueFrom(this.repositoryService.getComandaWithVenta(cf.id));
          if (conVenta) {
            cf.venta = conVenta.venta;
          }
        }
      }

      // Actualizar sin perder selección
      for (const cf of sorted) {
        const local = this.comandas.find((c: any) => c.id === cf.id);
        if (local) {
          local.estado = cf.estado;
          local.pdv_mesa = cf.pdv_mesa;
          local.sector = cf.sector;
          if (!this.selectedComanda || this.selectedComanda.id !== local.id) {
            local.venta = cf.venta;
          }
        }
      }

      // Agregar nuevas
      for (const cf of sorted) {
        if (!this.comandas.find((c: any) => c.id === cf.id)) {
          this.comandas.push(cf);
        }
      }

      // Remover las que ya no están activas
      this.comandas = this.comandas.filter((c: any) => sorted.find((cf: any) => cf.id === c.id));
      this.comandasOcupadasCount = this.comandas.filter((c: any) => c.estado === 'OCUPADO').length;
    } catch (error) {
      // Silencioso
    } finally {
      this.refreshingComandas = false;
    }
  }

  async selectComanda(comanda: any): Promise<void> {
    if (comanda.estado === 'DISPONIBLE') {
      // Abrir dialogo para asignar mesa/sector
      const dialogRef = this.dialog.open(AbrirComandaDialogComponent, {
        width: '450px',
        data: {
          comanda,
          mesas: this.mesas,
          sectores: this.sectores
        } as AbrirComandaDialogData
      });

      const result: AbrirComandaDialogResult | null = await firstValueFrom(dialogRef.afterClosed());
      if (!result) return;

      try {
        await firstValueFrom(this.repositoryService.abrirComanda(comanda.id, result));
        // Recargar comanda con venta
        const updated = await firstValueFrom(this.repositoryService.getComandaWithVenta(comanda.id));
        if (updated) {
          comanda.estado = updated.estado;
          comanda.pdv_mesa = updated.pdv_mesa;
          comanda.sector = updated.sector;
          comanda.observacion = updated.observacion;
          comanda.venta = updated.venta;
        }
      } catch (error) {
        console.error('Error abriendo comanda:', error);
        return;
      }
    }

    // Seleccionar comanda (OCUPADO)
    this.selectedComanda = comanda;
    this.selectedMesa = null;
    this.ventaRapidaActual = null;
    this.deliveryActual = null;
    this.isEditingClienteName = false;

    // Cargar nombre cliente si hay venta
    if (comanda.venta?.nombreCliente) {
      this.clienteNameForm.get('nombre')?.setValue(comanda.venta.nombreCliente);
    } else {
      this.clienteNameForm.get('nombre')?.setValue('');
    }

    // Cargar items de la venta
    if (comanda.venta?.id) {
      await this.loadVentaItemsForVenta(comanda.venta.id);
    } else {
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
    }

    // Devolver el foco al buscador de productos tras un pequeño delay.
    this.focusBuscadorConDelay();
  }

  private async loadVentaItemsForVenta(ventaId: number): Promise<void> {
    try {
      const items = await firstValueFrom(this.repositoryService.getVentaItems(ventaId));
      for (const item of items) {
        await this.cargarPersonalizacionesItem(item);
      }
      this.ventaItemsDataSource.data = items;
      this.calculateTotals();
      await this.loadEstadoCobroActual(ventaId);
    } catch (error) {
      console.error('Error loading venta items:', error);
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
      this.resetEstadoCobro();
    }
  }

  /**
   * Carga el estado de cobro por ítem (PAGADO/PARCIAL/PENDIENTE) y el resumen
   * en bruto. Estampa `_estadoCobro` y `_montoCubierto` en cada VentaItem para
   * el template (sin funciones en la vista).
   */
  private async loadEstadoCobroActual(ventaId: number): Promise<void> {
    try {
      const estado: any = await firstValueFrom(this.repositoryService.getEstadoCobroVenta(ventaId));
      if (!estado) { this.resetEstadoCobro(); return; }
      const map = new Map<number, any>();
      for (const e of (estado.items || [])) map.set(e.id, e);
      for (const item of this.ventaItemsDataSource.data) {
        const e = map.get(item.id);
        (item as any)._estadoCobro = e?.estado || 'PENDIENTE';
        (item as any)._montoCubierto = Number(e?.montoCubierto || 0);
      }
      this.ventaItemsDataSource.data = [...this.ventaItemsDataSource.data];
      this.cobroDeudaBruta = Number(estado.deudaBruta || 0);
      this.cobroPagado = Number(estado.totalCubierto || 0);
      this.cobroSaldo = Number(estado.pendienteBruto || 0);
      this.hayCobroParcial = this.cobroPagado > 0.5;
    } catch (error) {
      console.error('Error cargando estado de cobro:', error);
      this.resetEstadoCobro();
    }
  }

  private resetEstadoCobro(): void {
    this.cobroDeudaBruta = 0;
    this.cobroPagado = 0;
    this.cobroSaldo = 0;
    this.hayCobroParcial = false;
  }

  /**
   * Bloquea acciones sobre un ítem que ya tiene cobertura de pago (parcial o
   * total): editar, cancelar, personalizar o mover. Hay que anular la ronda de
   * cobro primero. Devuelve true si está bloqueado (y avisa).
   */
  private bloqueadoPorCobro(item: VentaItem, accion: string): boolean {
    if (Number((item as any)?._montoCubierto || 0) > 0.5) {
      this.snackBar.open(
        `No se puede ${accion} un ítem ya pagado. Anulá el cobro parcial primero.`,
        'OK',
        { duration: 4000 }
      );
      return true;
    }
    return false;
  }

  private async cerrarComandaActual(): Promise<void> {
    if (!this.selectedComanda) return;
    try {
      await firstValueFrom(this.repositoryService.cerrarComanda(this.selectedComanda.id));
      this.selectedComanda.estado = 'DISPONIBLE';
      this.selectedComanda.venta = null;
      this.selectedComanda.pdv_mesa = null;
      this.selectedComanda.sector = null;
      this.selectedComanda = null;
    } catch (error) {
      console.error('Error cerrando comanda:', error);
    }
  }

  /**
   * Mover comanda a otra mesa/sector (cambia ubicación, no toca la venta)
   */
  moverComanda(): void {
    if (!this.selectedComanda || this.selectedComanda.estado !== 'OCUPADO') return;

    const dialogRef = this.dialog.open(AbrirComandaDialogComponent, {
      width: '450px',
      data: {
        comanda: this.selectedComanda,
        mesas: this.mesas,
        sectores: this.sectores,
        isEditing: true
      } as AbrirComandaDialogData
    });

    dialogRef.afterClosed().subscribe(async (result: AbrirComandaDialogResult | null) => {
      if (!result || !this.selectedComanda) return;
      try {
        const updateData: any = {
          pdv_mesa: result.mesaId ? { id: result.mesaId } : null,
          sector: result.sectorId ? { id: result.sectorId } : null,
          observacion: result.observacion || null,
        };
        await firstValueFrom(this.repositoryService.updateComanda(this.selectedComanda.id, updateData));

        // Recargar comanda
        const updated = await firstValueFrom(this.repositoryService.getComandaWithVenta(this.selectedComanda.id));
        if (updated) {
          this.selectedComanda.pdv_mesa = updated.pdv_mesa;
          this.selectedComanda.sector = updated.sector;
          this.selectedComanda.observacion = updated.observacion;
        }
      } catch (error) {
        console.error('Error al mover comanda:', error);
      }
    });
  }

  // --- Atajos (accesos rápidos) ---

  async loadAtajoGrupos(): Promise<void> {
    try {
      this.atajoGrupos = await firstValueFrom(this.repositoryService.getPdvAtajoGrupos());
      // Reload grid sizes from config
      try {
        const config = await firstValueFrom(this.repositoryService.getPdvConfig());
        const cfg = Array.isArray(config) ? config[0] : config;
        if (cfg?.atajosGridSize) this.atajosGridSize = cfg.atajosGridSize;
        if (cfg?.atajosProductosGridSize) this.atajosProductosGridSize = cfg.atajosProductosGridSize;
      } catch (e) { /* keep current */ }
      // Auto-select first grupo or reload current
      if (this.atajoGrupos.length > 0) {
        const currentGrupo = this.selectedAtajoGrupo
          ? this.atajoGrupos.find((g: any) => g.id === this.selectedAtajoGrupo.id) || this.atajoGrupos[0]
          : this.atajoGrupos[0];
        await this.selectAtajoGrupo(currentGrupo);
      }
    } catch (error) {
      console.error('Error loading atajo grupos:', error);
    }
  }

  async selectAtajoGrupo(grupo: any): Promise<void> {
    this.selectedAtajoGrupo = grupo;
    try {
      this.atajoItemsDelGrupo = await firstValueFrom(this.repositoryService.getPdvAtajoItemsByGrupo(grupo.id));
    } catch (error) {
      console.error('Error loading atajo items:', error);
      this.atajoItemsDelGrupo = [];
    }
  }

  onAtajoItemClick(item: any): void {
    const dialogRef = this.dialog.open(AtajoProductosDialogComponent, {
      width: '55%',
      height: '70%',
      panelClass: 'atajo-productos-dialog-container',
      data: {
        atajoItemId: item.id,
        atajoItemNombre: item.nombre,
        gridSize: this.atajosProductosGridSize,
        // Propagar la cantidad actual del buscador al panel de accesos directos.
        cantidad: Number(this.searchForm.get('cantidad')?.value) || 1,
      }
    });

    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (result?.isVariacionSelection && result?.producto) {
        // ELABORADO_CON_VARIACION: abrir diálogo de selección de variaciones
        const cantidad = result.cantidad || 1;
        const variacionResult = await this.openSeleccionarVariacionDialog(result.producto, cantidad);
        if (variacionResult) {
          await this.addVariacionItem(result.producto, variacionResult);
        }
      } else if (result?.producto && result?.precioVenta) {
        const producto = result.producto;
        const presentacion = result.presentacion || producto.presentaciones?.[0] || null;
        const precioVenta = result.precioVenta;
        const cantidad = result.cantidad || 1;
        await this.addProduct(producto, presentacion, cantidad, precioVenta);
      }
    });
  }

  openAtajoConfig(): void {
    const dialogRef = this.dialog.open(AtajoConfigDialogComponent, {
      width: '90vw',
      maxWidth: '90vw',
      height: '80vh',
      panelClass: 'atajo-config-dialog-container'
    });

    dialogRef.afterClosed().subscribe(async () => {
      await this.loadAtajoGrupos();
    });
  }


  // Get all mesas (for template)
  get availableMesas(): PdvMesa[] {
    return this.mesas.filter(mesa => !mesa.reservado);
  }

  // Get reserved mesas (for template)
  get reservedMesas(): PdvMesa[] {
    return this.mesas.filter(mesa => mesa.reservado);
  }

  // Get table numbers (from loaded mesas)
  get tableNumbers(): number[] {
    return this.mesas.map(mesa => mesa.numero);
  }

  /**
   * Load caja-monedas configuration to filter currencies
   */
  async loadCajaMonedasConfig(): Promise<void> {
    this.loadingConfig = true;
    try {
      // Get active caja-monedas configuration
      const cajaMonedas = await firstValueFrom(this.repositoryService.getCajasMonedas());

      // Create a map for quick lookup and to maintain order
      const configuredMonedas = new Map<number, CajaMoneda>();

      // Filter for active configurations and sort by orden
      const activeCajaMonedas = cajaMonedas
        .filter(cm => cm.activo)
        .sort((a, b) => {
          const ordenA = a.orden ? parseInt(a.orden) : 999;
          const ordenB = b.orden ? parseInt(b.orden) : 999;
          return ordenA - ordenB;
        });

      // Add to map in order
      activeCajaMonedas.forEach(cm => {
        if (cm.moneda && cm.moneda.id) {
          configuredMonedas.set(cm.moneda.id, cm);
        }
      });

      // Filter monedas based on active caja-moneda configurations
      this.filteredMonedas = this.monedas.filter(moneda =>
        moneda.id && configuredMonedas.has(moneda.id)
      );

      // If principal moneda is not in filtered list, add it
      if (this.principalMoneda && !this.filteredMonedas.some(m => m.id === this.principalMoneda?.id)) {
        this.filteredMonedas.unshift(this.principalMoneda);
      }

      console.log(`Loaded ${this.filteredMonedas.length} configured currencies`);

    } catch (error) {
      console.error('Error loading caja-monedas configuration:', error);
      // On error, use all monedas as fallback
      this.filteredMonedas = [...this.monedas];
    } finally {
      this.loadingConfig = false;
    }
  }

  /**
   * Load exchange rates from the database
   */
  async loadExchangeRates(): Promise<void> {
    this.loadingExchangeRates = true;
    try {
      // Get all active exchange rates
      this.exchangeRates = await firstValueFrom(this.repositoryService.getMonedasCambio());

      // Filter for active exchange rates
      this.exchangeRates = this.exchangeRates.filter(rate => rate.activo);
    } catch (error) {
      console.error('Error loading exchange rates:', error);
    } finally {
      this.loadingExchangeRates = false;
    }
  }

  /**
   * Calculate totals for each currency based on items in cart
   */
  calculateTotals(): void {
    if (!this.principalMoneda) return;

    // Calculate grand total in principal currency if estado is ACTIVO only
    const totalInPrincipal = this.ventaItemsDataSource.data.filter(item => item.estado === EstadoVentaItem.ACTIVO).reduce((sum, item) => sum + (item.precioVentaUnitario + (item.precioAdicionales || 0) - item.descuentoUnitario) * item.cantidad, 0);

    // Clear previous calculations
    this.monedasWithTotals = [];

    // Add principal currency with its total
    this.monedasWithTotals.push({
      moneda: this.principalMoneda,
      total: totalInPrincipal
    });

    // Initialize saldos for principal currency
    this.saldos.set(this.principalMoneda.id!, totalInPrincipal);

    // For each filtered currency that is not the principal, calculate its total
    this.filteredMonedas.forEach(moneda => {
      if (moneda.id === this.principalMoneda?.id) return; // Skip principal

      // Tasa: cantidad de PRINCIPAL que vale 1 unidad de OTRA. Aceptamos un solo
      // sentido en BD ("USD->PYG: 7500" significa 1 USD = 7500 Gs), porque
      // PYG->X = totalPYG / 7500 funciona en ambos sentidos del registro.
      const rateRecord = this.exchangeRates.find(rate =>
        (rate.monedaOrigen?.id === this.principalMoneda?.id && rate.monedaDestino?.id === moneda.id) ||
        (rate.monedaOrigen?.id === moneda.id && rate.monedaDestino?.id === this.principalMoneda?.id)
      );

      if (rateRecord && rateRecord.compraLocal) {
        const total = totalInPrincipal / rateRecord.compraLocal;
        this.monedasWithTotals.push({ moneda: moneda, total });
        this.saldos.set(moneda.id!, total);
      } else {
        console.warn(`No exchange rate found between ${this.principalMoneda?.denominacion} and ${moneda.denominacion}`);
        this.monedasWithTotals.push({ moneda: moneda, total: 0 });
        this.saldos.set(moneda.id!, 0);
      }
    });
  }

  // Initialize some demo data
  private initDemoData(): void {
    // Demo venta items

  }

  // Remove item from cart
  removeItem(item: VentaItem): void {
    //perform delete from database, if success then remove from ventaItems
    this.repositoryService.deleteVentaItem(item.id!).subscribe((success) => {
      if (success) {
        this.ventaItemsDataSource.data = this.ventaItemsDataSource.data.filter(i => i.id !== item.id);
        this.calculateTotals();
      }
    });
  }

  // Edit item from cart
  async personalizarItem(item: VentaItem): Promise<void> {
    if (this.bloqueadoPorCobro(item, 'personalizar')) return;
    const recetaId = (item.producto as any)?.receta?.id;
    if (!recetaId) {
      // Si no tiene receta, buscar el producto completo con relación receta
      const producto = await firstValueFrom(this.repositoryService.getProducto(item.producto?.id));
      if (!producto?.receta?.id) return; // No tiene receta, no se puede personalizar
      (item.producto as any).receta = producto.receta;
    }

    // Cargar personalizaciones existentes para pasarlas al diálogo
    const [existingAdicionales, existingModificaciones, existingObs] = await Promise.all([
      firstValueFrom(this.repositoryService.getVentaItemAdicionales(item.id)),
      firstValueFrom(this.repositoryService.getVentaItemIngredienteModificaciones(item.id)),
      firstValueFrom(this.repositoryService.getObservacionesByVentaItem(item.id)),
    ]);

    const ingredientesRemovidos = (existingModificaciones || [])
      .filter((m: any) => m.tipoModificacion === 'REMOVIDO')
      .map((m: any) => m.recetaIngrediente?.id);
    const ingredientesIntercambiados = (existingModificaciones || [])
      .filter((m: any) => m.tipoModificacion === 'INTERCAMBIADO')
      .map((m: any) => ({
        recetaIngredienteId: m.recetaIngrediente?.id,
        reemplazoProductoId: m.ingredienteReemplazo?.id,
      }));
    const adicionalesSeleccionados = (existingAdicionales || []).map((a: any) => a.adicional?.id);
    // La fila de la nota libre cuelga del sentinel NOTA DEL CLIENTE, así que se
    // excluye de los chips seleccionados: si no, el sentinel volvería marcado
    // como si fuera una observación del catálogo elegida por el cajero.
    const observacionIds = (existingObs || [])
      .filter((o: any) => o.observacion?.id && !o.observacionLibre)
      .map((o: any) => o.observacion.id);
    const observacionLibre = (existingObs || []).find((o: any) => o.observacionLibre)?.observacionLibre || '';

    const dialogRef = this.dialog.open(PersonalizarProductoDialogComponent, {
      width: '750px',
      maxHeight: '90vh',
      data: {
        producto: item.producto,
        presentacion: item.presentacion,
        precioVenta: item.precioVentaPresentacion,
        cantidad: item.cantidad,
        modoEdicion: true,
        ingredientesRemovidos,
        ingredientesIntercambiados,
        adicionalesSeleccionados,
        observacionIds,
        observacionLibre,
      },
      disableClose: true,
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return;

    try {
      // Limpiar personalizaciones anteriores
      const oldAdicionales = existingAdicionales;
      const oldModificaciones = existingModificaciones;
      const oldObs = existingObs;

      const deletePromises: Promise<any>[] = [];
      for (const a of (oldAdicionales || [])) {
        deletePromises.push(firstValueFrom(this.repositoryService.deleteVentaItemAdicional(a.id)));
      }
      for (const m of (oldModificaciones || [])) {
        deletePromises.push(firstValueFrom(this.repositoryService.deleteVentaItemIngredienteModificacion(m.id)));
      }
      for (const o of (oldObs || [])) {
        deletePromises.push(firstValueFrom(this.repositoryService.deleteVentaItemObservacion(o.id)));
      }
      await Promise.all(deletePromises);

      // Actualizar cantidad y precioAdicionales en el item
      item.cantidad = result.cantidad;
      item.precioAdicionales = result.precioAdicionalTotal;
      await firstValueFrom(this.repositoryService.updateVentaItem(item.id!, {
        cantidad: result.cantidad,
        precioAdicionales: result.precioAdicionalTotal,
      }));

      // Persistir nuevas personalizaciones
      await this.persistirPersonalizacion(item.id, result);

      // Recargar datos para la vista
      await this.cargarPersonalizacionesItem(item);
      this.ventaItemsDataSource.data = [...this.ventaItemsDataSource.data];
      this.calculateTotals();
    } catch (error) {
      console.error('Error al personalizar item:', error);
    }
  }

  editItem(item: VentaItem): void {
    if (this.bloqueadoPorCobro(item, 'editar')) return;
    const dialogRef = this.dialog.open(EditVentaItemDialogComponent, {
      width: '400px',
      data: { ventaItem: item },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        try {
          // Construir entrada de historial con valores anteriores
          const historialEntry = {
            fecha: new Date().toISOString(),
            usuario: this.authService.currentUser?.persona?.nombre || 'N/A',
            cantidadAnterior: item.cantidad,
            descuentoAnterior: item.descuentoUnitario,
            cantidadNueva: result.cantidad,
            descuentoNuevo: result.descuentoUnitario,
          };

          // Parsear historial existente o crear array nuevo
          let historial: any[] = [];
          try {
            historial = item.historialCambios ? JSON.parse(item.historialCambios) : [];
          } catch { historial = []; }
          historial.push(historialEntry);

          // Actualizar item in-place
          await firstValueFrom(this.repositoryService.updateVentaItem(item.id, {
            cantidad: result.cantidad,
            descuentoUnitario: result.descuentoUnitario,
            modificado: true,
            modificadoPor: this.authService.currentUser,
            horaModificacion: new Date(),
            historialCambios: JSON.stringify(historial),
          }));

          // Actualizar objeto local
          item.cantidad = result.cantidad;
          item.descuentoUnitario = result.descuentoUnitario;
          item.modificado = true;
          item.historialCambios = JSON.stringify(historial);

          // Guardar observaciones. El diálogo precarga lo que el ítem ya tenía y
          // devuelve la selección COMPLETA, así que hay que reconciliar: borrar
          // las actuales y recrear. Sin esto, cada "Editar" (aunque sólo cambies
          // la cantidad) volvía a insertar todo y las observaciones se
          // multiplicaban en pantalla y en la comanda. Mismo criterio que
          // `personalizarItem()` y que el flujo de mobile.
          const obsActuales = await firstValueFrom(this.repositoryService.getObservacionesByVentaItem(item.id));
          for (const o of (obsActuales || [])) {
            await firstValueFrom(this.repositoryService.deleteVentaItemObservacion(o.id));
          }
          // Una fila por observación del catálogo (sin la nota adentro — antes se
          // repetía en todas) + una sola fila para la nota libre, que el handler
          // cuelga del sentinel NOTA DEL CLIENTE.
          for (const obsId of (result.observacionIds || [])) {
            await firstValueFrom(this.repositoryService.createVentaItemObservacion({
              ventaItem: { id: item.id },
              observacion: { id: obsId },
            }));
          }
          if (result.observacionLibre) {
            await firstValueFrom(this.repositoryService.createVentaItemObservacion({
              ventaItem: { id: item.id },
              observacionLibre: result.observacionLibre,
            }));
          }

          // Recargar personalizaciones del item
          await this.cargarPersonalizacionesItem(item);

          // Refrescar tabla
          this.ventaItemsDataSource.data = [...this.ventaItemsDataSource.data];
          this.calculateTotals();
        } catch (error) {
          console.error('Error al editar item:', error);
        }
      }
    });
  }

  // Cancel item from cart
  cancelItem(item: VentaItem): void {
    if (this.bloqueadoPorCobro(item, 'cancelar')) return;
    // update item with estado = CANCELADO, cancelado_por = current user, cancelado_fecha = current date,
    item.estado = EstadoVentaItem.CANCELADO;
    item.canceladoPor = this.authService.currentUser;
    item.horaCancelado = new Date();
    this.repositoryService.updateVentaItem(item.id!, item).subscribe((success) => {
      if (success) {
        this.calculateTotals();
      }
    });
  }

  // Add product to cart
  async addProduct(producto: Producto, presentacion: Presentacion, cantidad: number, precioVenta?: PrecioVenta): Promise<void> {
    console.log('Adding new producto');

    // Forzar cantidad entera si unidadBase es UNIDAD
    if (producto.unidadBase === 'UNIDAD') {
      cantidad = Math.max(1, Math.round(cantidad));
    }

    // Si es BUFFET_POR_PESO, abrir diálogo de pesaje (cobro por kilo).
    if (producto.tipo === ProductoTipo.BUFFET_POR_PESO) {
      try {
        await this.addBuffetPorPesoItem(producto, presentacion, precioVenta);
      } catch (error) {
        console.error('Error en flujo de buffet por peso:', error);
      }
      return;
    }

    // Si es ELABORADO_CON_VARIACION, abrir diálogo de selección de variaciones
    if (producto.tipo === ProductoTipo.ELABORADO_CON_VARIACION) {
      try {
        const variacionResult = await this.openSeleccionarVariacionDialog(producto, cantidad);
        if (!variacionResult) return; // Cancelado
        await this.addVariacionItem(producto, variacionResult);
      } catch (error) {
        console.error('Error en flujo de variaciones:', error);
      }
      return;
    }

    try {
      // Si el producto tiene receta, abrir diálogo de personalización
      let personalizacion: PersonalizarProductoDialogResult | null = null;
      const recetaId = (producto as any).receta?.id;
      if (recetaId && precioVenta) {
        const dialogRef = this.dialog.open(PersonalizarProductoDialogComponent, {
          width: '750px',
          maxHeight: '90vh',
          data: { producto, presentacion, precioVenta, cantidad },
          disableClose: true,
        });
        personalizacion = await firstValueFrom(dialogRef.afterClosed());
        if (!personalizacion) return; // Usuario canceló
        cantidad = personalizacion.cantidad;
      }

      // Check if mesa, comanda, or venta rápida is selected
      if (!this.selectedMesa && !this.ventaRapidaActual && !this.selectedComanda) {
        await this.showMesaSelectionDialog();
        if (!this.selectedMesa && !this.selectedComanda) {
          console.log('No se seleccionó ninguna mesa ni comanda');
          return;
        }
      }

      // Get the venta first
      const venta = await this.getVenta();

      const precioVentaToUse = precioVenta;
      if (!precioVentaToUse) {
        throw new Error('No se encontró un precio de venta válido');
      }

      // Create a new VentaItem
      const newVentaItem = new VentaItem();
      newVentaItem.presentacion = presentacion;
      newVentaItem.cantidad = cantidad;
      newVentaItem.precioVentaUnitario = precioVentaToUse.valor;
      newVentaItem.precioCostoUnitario = await this.findPrecioCosto(producto);
      newVentaItem.venta = venta;
      newVentaItem.precioVentaPresentacion = precioVentaToUse;
      newVentaItem.producto = producto;
      newVentaItem.precioAdicionales = personalizacion?.precioAdicionalTotal || 0;

      // Save the new item
      try {
        const savedItem = await firstValueFrom(this.repositoryService.createVentaItem(newVentaItem));
        savedItem.producto = producto;
        savedItem.presentacion = presentacion;
        savedItem.precioVentaPresentacion = precioVentaToUse;
        savedItem.precioAdicionales = newVentaItem.precioAdicionales;

        // Persistir personalizaciones
        if (personalizacion) {
          await this.persistirPersonalizacion(savedItem.id, personalizacion);
          // Cargar personalizaciones guardadas para mostrar en la tabla expandible
          await this.cargarPersonalizacionesItem(savedItem);
        }

        const auxList = this.ventaItemsDataSource.data;
        auxList.push(savedItem);
        console.log('adding new item', savedItem, auxList);
        this.ventaItemsDataSource.data = auxList;
      } catch (error) {
        console.error('Error al guardar el item de venta:', error);
        this.mostrarErrorItem(error, 'NO SE PUDO AGREGAR EL ITEM');
      }

      // Recalculate totals after adding item
      this.calculateTotals();
    } catch (error) {
      console.error('Error al agregar producto:', error);
    }
  }

  private async addBuffetPorPesoItem(
    producto: Producto,
    presentacion: Presentacion,
    precioVenta?: PrecioVenta,
    pesoInicialGramos?: number,
  ): Promise<void> {
    // Resolver el precio vigente (precios programados por día/horario).
    let precioResuelto: PrecioVenta | undefined = precioVenta;
    if (presentacion?.id) {
      try {
        const precios = await firstValueFrom(
          this.repositoryService.getPreciosVentaByPresentacion(presentacion.id, true),
        );
        const vigente = resolverPrecioVigente(precios || []);
        if (vigente) {
          precioResuelto = vigente as PrecioVenta;
        }
      } catch (e) {
        console.warn('No se pudieron cargar precios para resolver vigencia:', e);
      }
    }
    if (!precioResuelto) {
      console.error('No hay precio de venta para el producto buffet');
      return;
    }

    const dialogRef = this.dialog.open(PesajeBuffetDialogComponent, {
      width: '460px',
      data: {
        producto,
        presentacion,
        precioVenta: precioResuelto,
        decimalesMoneda: (precioResuelto.moneda as any)?.decimales ?? 0,
        pesoInicialGramos,
      },
      disableClose: true,
    });
    const result: PesajeBuffetDialogResult | null = await firstValueFrom(dialogRef.afterClosed());
    if (!result) return; // Cancelado

    // Asegurar mesa/comanda/venta rápida.
    if (!this.selectedMesa && !this.ventaRapidaActual && !this.selectedComanda) {
      await this.showMesaSelectionDialog();
      if (!this.selectedMesa && !this.selectedComanda) return;
    }

    const venta = await this.getVenta();

    const newVentaItem = new VentaItem();
    newVentaItem.presentacion = presentacion;
    // cantidad = kg neto; precioVentaUnitario = precio/kg efectivo (incluye tope/mínimo)
    // para que el cálculo universal (unitario * cantidad) dé el total correcto.
    newVentaItem.cantidad = result.cantidadKg;
    newVentaItem.precioVentaUnitario = result.precioVentaUnitarioEfectivo;
    newVentaItem.precioCostoUnitario = await this.findPrecioCosto(producto);
    newVentaItem.venta = venta;
    newVentaItem.precioVentaPresentacion = precioResuelto;
    newVentaItem.producto = producto;
    newVentaItem.precioAdicionales = 0;
    // Datos de peso (el peso real se persiste siempre, aunque aplique el tope).
    newVentaItem.pesoBruto = result.pesoBrutoGramos;
    newVentaItem.pesoTara = result.pesoTaraGramos;
    newVentaItem.pesoNeto = result.pesoNetoGramos;
    newVentaItem.precioPorKg = result.precioPorKg;
    newVentaItem.aplicoLibre = result.aplicoLibre;

    try {
      const savedItem = await firstValueFrom(this.repositoryService.createVentaItem(newVentaItem));
      savedItem.producto = producto;
      savedItem.presentacion = presentacion;
      savedItem.precioVentaPresentacion = precioResuelto;
      savedItem.precioAdicionales = 0;
      const auxList = this.ventaItemsDataSource.data;
      auxList.push(savedItem);
      this.ventaItemsDataSource.data = auxList;
    } catch (error) {
      console.error('Error al guardar el item de buffet:', error);
    }

    this.calculateTotals();
  }

  private async openSeleccionarVariacionDialog(producto: Producto, cantidad: number): Promise<SeleccionarVariacionDialogResult | null> {
    // El producto de la búsqueda/atajo/código puede venir como DTO sin la relación
    // `presentaciones` (el handler search-productos-by-nombre no la incluye), lo que
    // dejaba el paso 1 en "No hay presentaciones configuradas". Recargamos el producto
    // completo (presentaciones activas + sabores) antes de abrir el diálogo.
    let productoCompleto: Producto = producto;
    try {
      const full = await firstValueFrom(this.repositoryService.getProducto(producto.id));
      if (full) productoCompleto = full;
    } catch {
      // Si falla la recarga, seguimos con lo que hay (mejor que romper el flujo).
    }
    const dialogData: SeleccionarVariacionDialogData = {
      producto: productoCompleto,
      cantidad,
      pdvConfig: this.pdvConfig,
    };

    const dialogRef = this.dialog.open(SeleccionarVariacionDialogComponent, {
      width: '650px',
      maxHeight: '90vh',
      data: dialogData,
      disableClose: true,
    });

    return await firstValueFrom(dialogRef.afterClosed());
  }

  private async addVariacionItem(producto: Producto, result: SeleccionarVariacionDialogResult): Promise<void> {
    // Verificar que haya mesa/comanda/venta rápida seleccionada
    if (!this.selectedMesa && !this.ventaRapidaActual && !this.selectedComanda) {
      await this.showMesaSelectionDialog();
      if (!this.selectedMesa && !this.selectedComanda) return;
    }

    const venta = await this.getVenta();

    // Calcular precio de adicionales total (personalización por sabor)
    let totalAdicionales = 0;
    for (const sabor of result.sabores) {
      if (sabor.personalizacion) {
        totalAdicionales += sabor.personalizacion.precioAdicionalTotal * sabor.proporcion;
      }
    }

    // Determinar la RecetaPresentacion principal (mayor precio o primera)
    const recetaPresentacionPrincipal = result.sabores.length === 1
      ? result.sabores[0].recetaPresentacion
      : result.sabores.reduce((max, s) => {
          const precioMax = max.recetaPresentacion.preciosVenta?.find((p: any) => p.principal)?.valor || 0;
          const precioS = s.recetaPresentacion.preciosVenta?.find((p: any) => p.principal)?.valor || 0;
          return Number(precioS) > Number(precioMax) ? s : max;
        }, result.sabores[0]).recetaPresentacion;

    const precioVentaPrincipal = recetaPresentacionPrincipal.preciosVenta?.find((p: any) => p.principal);

    // Crear VentaItem
    const newVentaItem = new VentaItem();
    newVentaItem.producto = producto;
    newVentaItem.presentacion = result.presentacion;
    newVentaItem.cantidad = result.cantidad;
    newVentaItem.precioVentaUnitario = result.precioCalculado - totalAdicionales; // precio base sin adicionales
    newVentaItem.precioCostoUnitario = result.costoCalculado;
    newVentaItem.precioAdicionales = totalAdicionales;
    newVentaItem.venta = venta;
    newVentaItem.precioVentaPresentacion = precioVentaPrincipal;
    newVentaItem.ensambladoDescripcion = result.ensambladoDescripcion;
    newVentaItem.cantidadSabores = result.sabores.length;
    newVentaItem.recetaPresentacion = recetaPresentacionPrincipal;

    try {
      const savedItem = await firstValueFrom(this.repositoryService.createVentaItem(newVentaItem));
      savedItem.producto = producto;
      savedItem.presentacion = result.presentacion;
      savedItem.ensambladoDescripcion = result.ensambladoDescripcion;
      savedItem.cantidadSabores = result.sabores.length;
      savedItem.precioAdicionales = totalAdicionales;

      // Crear VentaItemSabor por cada sabor
      for (const sabor of result.sabores) {
        const precio = sabor.recetaPresentacion.preciosVenta?.find((p: any) => p.principal);
        const savedSabor = await firstValueFrom(this.repositoryService.createVentaItemSabor({
          ventaItemId: savedItem.id,
          recetaPresentacionId: sabor.recetaPresentacion.id,
          proporcion: sabor.proporcion,
          precioReferencia: precio ? Number(precio.valor) : 0,
          costoReferencia: Number(sabor.recetaPresentacion.costo_calculado) || 0,
        }));

        // Persistir personalizaciones por sabor (con ventaItemSabor FK)
        if (sabor.personalizacion) {
          await this.persistirPersonalizacionConSabor(savedItem.id, sabor.personalizacion, savedSabor.id);
        }
      }

      // Cargar personalizaciones para mostrar en tabla expandible
      await this.cargarPersonalizacionesItem(savedItem);

      const auxList = this.ventaItemsDataSource.data;
      auxList.push(savedItem);
      this.ventaItemsDataSource.data = auxList;

      this.calculateTotals();
    } catch (error) {
      console.error('Error al guardar item de variación:', error);
      this.mostrarErrorItem(error, 'NO SE PUDO AGREGAR EL ITEM');
    }
  }

  /**
   * Muestra el motivo real por el que el backend rechazó el ítem. Antes estos
   * catch sólo hacían `console.error`, así que un rechazo de permisos (o el
   * 'DEBE CAMBIAR SU CONTRASEÑA ANTES DE CONTINUAR' de un usuario con
   * contraseña temporal) se veía como si no hubiera pasado nada.
   */
  private mostrarErrorItem(error: any, fallback: string): void {
    this.snackBar.open(mensajeDeError(error, fallback), 'CERRAR', {
      duration: 6000,
      panelClass: 'error-snackbar',
    });
  }

  private async persistirPersonalizacionConSabor(ventaItemId: number, result: PersonalizarProductoDialogResult, ventaItemSaborId: number): Promise<void> {
    const promises: Promise<any>[] = [];

    // Ingredientes removidos
    for (const ingId of result.ingredientesRemovidos) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemIngredienteModificacion({
        ventaItem: { id: ventaItemId },
        recetaIngrediente: { id: ingId },
        tipoModificacion: 'REMOVIDO',
        ventaItemSabor: { id: ventaItemSaborId },
      })));
    }

    // Ingredientes intercambiados
    for (const swap of result.ingredientesIntercambiados) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemIngredienteModificacion({
        ventaItem: { id: ventaItemId },
        recetaIngrediente: { id: swap.recetaIngredienteId },
        tipoModificacion: 'INTERCAMBIADO',
        ingredienteReemplazo: { id: swap.reemplazoProductoId },
        ventaItemSabor: { id: ventaItemSaborId },
      })));
    }

    // Adicionales
    for (const adic of result.adicionalesSeleccionados) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemAdicional({
        ventaItem: { id: ventaItemId },
        adicional: { id: adic.adicionalId },
        precioCobrado: adic.precio,
        cantidad: adic.cantidad,
        ventaItemSabor: { id: ventaItemSaborId },
      })));
    }

    // Observaciones
    for (const obsId of result.observacionIds) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
        ventaItem: { id: ventaItemId },
        observacion: { id: obsId },
        ventaItemSabor: { id: ventaItemSaborId },
      })));
    }

    // Nota libre: UNA sola fila, sin `observacion` — el handler la cuelga del
    // sentinel NOTA DEL CLIENTE. Antes se colgaba de `observacionIds[0]`, lo que
    // duplicaba esa observación en pantalla y en la comanda; y si no había
    // ninguna seleccionada, la nota se descartaba.
    if (result.observacionLibre) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
        ventaItem: { id: ventaItemId },
        observacionLibre: result.observacionLibre,
        ventaItemSabor: { id: ventaItemSaborId },
      })));
    }

    await Promise.all(promises);
  }

  private async persistirPersonalizacion(ventaItemId: number, result: PersonalizarProductoDialogResult): Promise<void> {
    const promises: Promise<any>[] = [];

    // Ingredientes removidos
    for (const ingId of result.ingredientesRemovidos) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemIngredienteModificacion({
        ventaItem: { id: ventaItemId },
        recetaIngrediente: { id: ingId },
        tipoModificacion: 'REMOVIDO',
      })));
    }

    // Ingredientes intercambiados
    for (const swap of result.ingredientesIntercambiados) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemIngredienteModificacion({
        ventaItem: { id: ventaItemId },
        recetaIngrediente: { id: swap.recetaIngredienteId },
        tipoModificacion: 'INTERCAMBIADO',
        ingredienteReemplazo: { id: swap.reemplazoProductoId },
      })));
    }

    // Adicionales
    for (const adic of result.adicionalesSeleccionados) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemAdicional({
        ventaItem: { id: ventaItemId },
        adicional: { id: adic.adicionalId },
        precioCobrado: adic.precio,
        cantidad: adic.cantidad,
      })));
    }

    // Observaciones
    for (const obsId of result.observacionIds) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
        ventaItem: { id: ventaItemId },
        observacion: { id: obsId },
      })));
    }
    // Nota libre: UNA sola fila, sin `observacion` (el handler resuelve el
    // sentinel NOTA DEL CLIENTE). Antes duplicaba `observacionIds[0]`, o mandaba
    // `observacion: null` y la fila moría contra el NOT NULL de la columna.
    if (result.observacionLibre) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
        ventaItem: { id: ventaItemId },
        observacionLibre: result.observacionLibre,
      })));
    }

    await Promise.all(promises);
  }

  private async cargarPersonalizacionesItem(item: VentaItem): Promise<void> {
    const [obs, adicionales, modificaciones] = await Promise.all([
      firstValueFrom(this.repositoryService.getObservacionesByVentaItem(item.id)),
      firstValueFrom(this.repositoryService.getVentaItemAdicionales(item.id)),
      firstValueFrom(this.repositoryService.getVentaItemIngredienteModificaciones(item.id)),
    ]);
    (item as any).observacionesVinculadas = obs || [];
    (item as any).adicionalesVinculados = adicionales || [];
    (item as any).ingredientesModificados = modificaciones || [];
  }


  // Add new method to show mesa selection dialog
  private async showMesaSelectionDialog(): Promise<void> {
    const dialogData = {
      mesas: this.mesas.filter(mesa => mesa.activo && !mesa.reservado),
      comandas: this.comandas,
      title: 'Seleccionar Mesa o Comanda',
      message: 'Seleccione dónde agregar el producto'
    };

    const dialogRef = this.dialog.open(MesaSelectionDialogComponent, {
      width: '60%',
      height: '60%',
      data: dialogData,
      disableClose: true
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      if (result.tipo === 'comanda') {
        this.selectedComanda = result.comanda;
      } else {
        this.selectedMesa = result;
      }
    }
  }

  // return a promise, if mesa is not null, get venta from mesa, if null create a new venta
  getVenta(): Promise<Venta> {
    // Venta rápida (sin mesa)
    if (this.ventaRapidaActual) {
      return Promise.resolve(this.ventaRapidaActual);
    }

    // Comanda (tarjeta de cuenta individual)
    if (this.selectedComanda) {
      if (this.selectedComanda.venta && this.selectedComanda.venta.estado === VentaEstado.ABIERTA) {
        return Promise.resolve(this.selectedComanda.venta);
      }
      const venta = new Venta();
      venta.estado = VentaEstado.ABIERTA;
      venta.caja = this.caja!;
      venta.comanda = this.selectedComanda;
      if (this.selectedComanda.pdv_mesa) {
        venta.mesa = this.selectedComanda.pdv_mesa;
      }
      return firstValueFrom(this.repositoryService.createVenta(venta).pipe(
        map(createdVenta => {
          createdVenta.estado = VentaEstado.ABIERTA;
          if (this.selectedComanda) {
            this.selectedComanda.venta = createdVenta;
          }
          return createdVenta;
        })
      ));
    }

    if (this.selectedMesa == null) {
      return Promise.reject('Mesa no seleccionada');
    } else {
      if (this.selectedMesa.venta == null || this.selectedMesa.venta.estado !== VentaEstado.ABIERTA) {
        const venta = new Venta();
        venta.estado = VentaEstado.ABIERTA;
        venta.caja = this.caja!;
        venta.mesa = this.selectedMesa;
        // save venta and return promise
        return firstValueFrom(this.repositoryService.createVenta(venta).pipe(
          map(createdVenta => {
            // Ensure estado is set (IPC serialization may lose it)
            createdVenta.estado = VentaEstado.ABIERTA;
            if (this.selectedMesa) {
              this.selectedMesa.venta = createdVenta;
            this.estamparMesa(this.selectedMesa as any);
              // La mesa la marca OCUPADO el backend, dentro de la misma
              // transaccion que crea la venta. Antes se hacia con una segunda
              // llamada desde aca, que fallaba para todo el que no fuera gerente.
              this.selectedMesa.estado = PdvMesaEstado.OCUPADO;
            }
            return createdVenta;
          })
        ));
      } else {
        return Promise.resolve(this.selectedMesa.venta);
      }
    }
  }

  /**
   * Update the estado of a mesa
   */
  /**
   * Cambia el estado de una mesa.
   *
   * Usa `setPdvMesaEstado` (permiso VENTAS_PDV) y no `updatePdvMesa`, que es el
   * ABM y exige VENTAS_PDV_CONFIGURAR — permiso que sólo tiene gerente. Con el
   * handler viejo, a un mozo o cajero le fallaba siempre.
   *
   * Y si falla, se avisa: antes el error moría en un console.error y la mesa
   * quedaba con el estado equivocado sin que nadie se enterara.
   */
  private async updateMesaEstado(mesa: PdvMesa, estado: PdvMesaEstado): Promise<void> {
    const anterior = mesa.estado;
    mesa.estado = estado;
    this.estamparMesa(mesa as any);
    try {
      await firstValueFrom(this.repositoryService.setPdvMesaEstado(mesa.id!, estado));
    } catch (err: any) {
      mesa.estado = anterior;
      this.estamparMesa(mesa as any);
      console.error('Error updating mesa estado:', err);
      this.snackBar.open(
        err?.message || `No se pudo cambiar el estado de la mesa ${mesa.numero}`,
        'Cerrar',
        { duration: 5000 },
      );
    }
  }

  async findPrecioCosto(producto: Producto): Promise<number> {
    try {
      const tipo = producto.tipo;

      if (tipo === 'RETAIL' || tipo === 'RETAIL_INGREDIENTE') {
        // Costo directo del producto
        const precios = await firstValueFrom(this.repositoryService.getPreciosCostoByProducto(producto.id));
        const precioActivo = precios.find(p => p.activo);
        return precioActivo ? Number(precioActivo.valor) : 0;
      }

      if (tipo === 'ELABORADO_SIN_VARIACION') {
        // Costo desde receta.costoCalculado
        const recetaId = (producto as any).receta?.id;
        if (recetaId) {
          const receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
          if (receta?.costoCalculado) return Number(receta.costoCalculado);
        }
        // Fallback a PrecioCosto del producto
        const precios = await firstValueFrom(this.repositoryService.getPreciosCostoByProducto(producto.id));
        const precioActivo = precios.find(p => p.activo);
        return precioActivo ? Number(precioActivo.valor) : 0;
      }

      if (tipo === 'ELABORADO_CON_VARIACION') {
        // Costo desde la primera receta del producto
        const recetas = (producto as any).recetas;
        if (recetas?.length > 0 && recetas[0].costoCalculado) {
          return Number(recetas[0].costoCalculado);
        }
        return 0;
      }

      if (tipo === 'COMBO') {
        // Para combos, sumar costo de componentes (futuro)
        // Por ahora intentar PrecioCosto directo
        const precios = await firstValueFrom(this.repositoryService.getPreciosCostoByProducto(producto.id));
        const precioActivo = precios.find(p => p.activo);
        return precioActivo ? Number(precioActivo.valor) : 0;
      }

      return 0;
    } catch (error) {
      console.error('Error finding precio costo:', error);
      return 0;
    }
  }

  findPrecioPrincipal(presentacion: Presentacion): number {
    // return presentacion.preciosVenta.find(p => p.principal)?.valor || 0;
    return 0;
  }

  // --- Acciones del PdV ---

  get hasActiveVenta(): boolean {
    return this.selectedMesa?.venta != null || this.ventaRapidaActual != null || this.selectedComanda?.venta != null;
  }

  get hasActiveItems(): boolean {
    return this.ventaItemsDataSource.data.some(i => i.estado === EstadoVentaItem.ACTIVO);
  }

  async cobrarVenta(): Promise<void> {
    if (!this.hasActiveVenta || !this.hasActiveItems) return;

    // La config puede haber cambiado desde que se abrió la pestaña: el diálogo
    // de configuración del PdV no se abre desde acá.
    await this.refrescarGateTerminal();

    // Sin ninguno de los dos permisos el diálogo no tiene nada que ofrecer. Con
    // uno solo sí se abre: adentro se deshabilita lo que corresponda.
    if (!this.puedeCobrar && !this.puedeFinalizarVenta) {
      this.snackBar.open(
        `El cobro solo se realiza en ${this.dispositivoCajaNombre || 'el dispositivo donde se abrió la caja'}.`,
        'OK',
        { duration: 5000 }
      );
      return;
    }

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const dialogData: CobrarVentaDialogData = {
      venta,
      items: this.ventaItemsDataSource.data,
      monedas: this.filteredMonedas.length > 0 ? this.filteredMonedas : this.monedas,
      exchangeRates: this.exchangeRates,
      principalMoneda: this.principalMoneda!,
      caja: this.caja!,
      // Cobrando un delivery desde el PdV, el envio es parte del total.
      costoDelivery: Number((venta as any)?.costoDelivery ?? 0) || 0,
      puedeAgregarPagos: this.puedeCobrar,
      puedeFinalizar: this.puedeFinalizarVenta,
      terminalDeLaCaja: this.esTerminalDeLaCaja ? undefined : this.dispositivoCajaNombre,
    };

    const dialogRef = this.dialog.open(CobrarVentaDialogComponent, {
      width: '80vw',
      height: '80vh',
      maxWidth: '95vw',
      disableClose: true,
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result?.success) {
        // Cerrar comanda si estaba vinculada
        if (this.selectedComanda) {
          await this.cerrarComandaActual();
        }
        // Liberar mesa y limpiar estado completamente
        if (this.selectedMesa) {
          // Cerrar cualquier venta huérfana abierta en esta mesa
          await firstValueFrom(this.repositoryService.cerrarVentasAbiertasMesa(this.selectedMesa.id!, VentaEstado.CONCLUIDA, { validarDispositivoCaja: true }));
          this.updateMesaEstado(this.selectedMesa, PdvMesaEstado.DISPONIBLE);
          this.selectedMesa.venta = null as any;
        this.estamparMesa(this.selectedMesa as any);
          this.selectedMesa = null;
          this.clienteNameForm.get('nombre')?.setValue('');
        }
        // Limpiar venta rápida
        if (this.ventaRapidaActual) {
          this.ventaRapidaActual = null;
        }
        // Salir del modo delivery: la venta ya está cobrada, dejar el cartel
        // colgado hacía creer que seguía habiendo un pedido en edición.
        this.deliveryActual = null;
        // Limpiar UI
        this.ventaItemsDataSource.data = [];
        this.calculateTotals();
        this.resetEstadoCobro();
      } else if (result?.partial) {
        // Cobro parcial: la venta sigue abierta. Recargar ítems + estado de cobro.
        const ventaId = this.ventaRapidaActual?.id || this.selectedComanda?.venta?.id || this.selectedMesa?.venta?.id;
        if (ventaId) {
          await this.loadVentaItemsForVenta(ventaId);
        }
      }
    });
  }

  cancelarVenta(): void {
    if (!this.hasActiveVenta) return;

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const dialogRef = this.dialog.open(CancelarVentaDialogComponent, {
      width: '400px',
      data: { venta },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.confirmed) {
        try {
          // Cancelar todos los items activos
          const activeItems = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
          for (const item of activeItems) {
            await firstValueFrom(this.repositoryService.updateVentaItem(item.id, {
              estado: EstadoVentaItem.CANCELADO,
              canceladoPor: this.authService.currentUser,
              horaCancelado: new Date(),
            }));
          }

          // Cancelar esta venta y cualquier otra abierta de la misma mesa
          await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
            estado: VentaEstado.CANCELADA,
          }));

          // Cerrar comanda si estaba vinculada
          if (this.selectedComanda) {
            await this.cerrarComandaActual();
          }

          // Liberar mesa y limpiar estado completamente
          if (this.selectedMesa) {
            // Cerrar cualquier venta huérfana abierta en esta mesa
            await firstValueFrom(this.repositoryService.cerrarVentasAbiertasMesa(this.selectedMesa.id!, VentaEstado.CANCELADA));
            await this.updateMesaEstado(this.selectedMesa, PdvMesaEstado.DISPONIBLE);
            this.selectedMesa.venta = null as any;
            this.estamparMesa(this.selectedMesa as any);
            this.selectedMesa = null;
            this.clienteNameForm.get('nombre')?.setValue('');
          }

          // Limpiar venta rápida
          if (this.ventaRapidaActual) {
            this.ventaRapidaActual = null;
          }

          // Limpiar UI
          this.ventaItemsDataSource.data = [];
          this.calculateTotals();
        } catch (error) {
          console.error('Error al cancelar venta:', error);
        }
      }
    });
  }

  async ventaRapida(): Promise<void> {
    if (this.ventaRapidaActual) return;

    try {
      const venta = new Venta();
      venta.estado = VentaEstado.ABIERTA;
      venta.caja = this.caja!;
      // mesa = null (venta sin mesa)

      const createdVenta = await firstValueFrom(this.repositoryService.createVenta(venta));
      this.ventaRapidaActual = createdVenta;

      // Deseleccionar mesa si había una
      this.selectedMesa = null;
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
    } catch (error) {
      console.error('Error al crear venta rápida:', error);
    }
  }

  async cobroRapido(): Promise<void> {
    if (!this.hasActiveVenta || !this.hasActiveItems) return;

    // El cobro rápido registra el pago Y cierra la venta de un saque, así que
    // necesita los dos permisos. Este camino no tenía ningún gate: en una
    // terminal ajena F2 cobraba completo aunque el botón COBRAR estuviera
    // bloqueado.
    await this.refrescarGateTerminal();
    if (!this.puedeCobrar || !this.puedeFinalizarVenta) {
      this.snackBar.open(this.tooltipCobroRapido, 'OK', { duration: 5000 });
      return;
    }

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const items = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    // `Number()` en los cuatro términos: son columnas `decimal` y en Postgres
    // llegan como string. Sin esto la suma concatena y da NaN — y el guard de
    // abajo NO lo atrapaba (`NaN <= 0` es false), así que seguía y persistía un
    // `PagoDetalle` con `valor: NaN`. Es el mismo arreglo que ya tiene
    // `calculateTotals()` del diálogo de cobro.
    const total = items.reduce((sum, i) => sum + (
      Number(i.precioVentaUnitario || 0)
      + Number(i.precioAdicionales || 0)
      - Number(i.descuentoUnitario || 0)
    ) * Number(i.cantidad || 0), 0)
      // El envío es un cargo de la venta, no un ítem. F2 es alcanzable sobre un
      // delivery (editar ítems desde el diálogo deja el delivery como venta
      // rápida), así que sin esto el cobro rápido regalaba el costo de envío.
      + (Number((venta as any)?.costoDelivery ?? 0) || 0);
    if (!Number.isFinite(total) || total <= 0) return;

    try {
      const formasPago = await firstValueFrom(this.repositoryService.getFormasPago());
      const fpPrincipal = formasPago.find(fp => fp.principal && fp.activo) || formasPago.find(fp => fp.activo);
      if (!fpPrincipal || !this.principalMoneda) return;

      const pago = await firstValueFrom(this.repositoryService.createPago({
        estado: PagoEstado.PAGADO,
        caja: this.caja!,
        activo: true,
        validarDispositivoCaja: true,
      } as any));

      await firstValueFrom(this.repositoryService.createPagoDetalle({
        valor: total,
        descripcion: 'COBRO RAPIDO',
        tipo: TipoDetalle.PAGO,
        pago,
        moneda: this.principalMoneda,
        formaPago: fpPrincipal,
        activo: true,
        validarDispositivoCaja: true,
      } as any));

      await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
        estado: VentaEstado.CONCLUIDA,
        formaPago: fpPrincipal,
        pago,
        fechaCierre: new Date(),
        __validarDispositivoCaja: true,
      } as any));

      // Procesar stock (fire-and-forget)
      this.repositoryService.procesarStockVenta(venta.id).subscribe({
        next: (r) => console.log('Stock procesado:', r),
        error: (e) => console.error('Error procesando stock (no-blocking):', e),
      });

      // Cerrar comanda si estaba vinculada
      if (this.selectedComanda) {
        await this.cerrarComandaActual();
      }
      if (this.selectedMesa) {
        // Cerrar cualquier venta huérfana abierta en esta mesa
        await firstValueFrom(this.repositoryService.cerrarVentasAbiertasMesa(this.selectedMesa.id!, VentaEstado.CONCLUIDA, { validarDispositivoCaja: true }));
        await firstValueFrom(this.repositoryService.setPdvMesaEstado(this.selectedMesa.id!, PdvMesaEstado.DISPONIBLE));
        this.selectedMesa.venta = null as any;
        this.estamparMesa(this.selectedMesa as any);
        this.selectedMesa = null;
        this.clienteNameForm.get('nombre')?.setValue('');
      }
      if (this.ventaRapidaActual) {
        this.ventaRapidaActual = null;
      }

      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
      await this.loadMesas();
    } catch (error) {
      console.error('Error al realizar cobro rápido:', error);
      const msg = String((error as any)?.message || '');
      this.snackBar.open(
        msg.includes('_NO_PERMITID') || msg.includes('NO_PERMITIDA')
          ? this.tooltipCobroRapido
          : 'No se pudo completar el cobro rápido',
        'CERRAR',
        { duration: 5000 },
      );
    }
  }

  async cerrarCaja(): Promise<void> {
    if (!this.caja) return;

    // Verificar ventas abiertas
    const ventas = await firstValueFrom(this.repositoryService.getVentasByCaja(this.caja.id));
    const ventasAbiertas = ventas.filter(v => v.estado === VentaEstado.ABIERTA);

    if (ventasAbiertas.length > 0) {
      const listaVentas = ventasAbiertas.map(v => `• Venta #${v.id} - ${v.nombreCliente || 'Sin cliente'}`).join('\n');
      this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: 'NO SE PUEDE CERRAR LA CAJA',
          message: `Hay ${ventasAbiertas.length} venta(s) abierta(s). Debe cerrar o cancelar todas las ventas antes de cerrar la caja.\n\n${listaVentas}`,
          confirmText: 'ENTENDIDO',
          showCancel: false
        },
      });
      return;
    }

    // Abrir diálogo de cierre con conteo de billetes (mismo componente que apertura)
    const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
      width: '80vw',
      height: '80vh',
      disableClose: true,
      data: { mode: 'conteo', cajaId: this.caja.id },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.caja = null;
        this.tabsService.removeTabById('pdv');
      }
    });
  }

  async openDelivery(): Promise<void> {
    if (!this.caja) return;

    // El cobro de un delivery sale por el mismo diálogo, así que necesita el
    // gate al día.
    await this.refrescarGateTerminal();

    const dialogData: DeliveryDialogData = {
      caja: this.caja,
      monedas: this.monedas,
      principalMoneda: this.principalMoneda!,
      exchangeRates: this.exchangeRates,
      filteredMonedas: this.filteredMonedas,
      puedeAgregarPagos: this.puedeCobrar,
      puedeFinalizar: this.puedeFinalizarVenta,
      terminalDeLaCaja: this.esTerminalDeLaCaja ? undefined : this.dispositivoCajaNombre,
    };

    const dialogRef = this.dialog.open(DeliveryDialogComponent, {
      width: '90vw',
      height: '85vh',
      maxWidth: '95vw',
      disableClose: false,
      data: dialogData,
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result?.action === 'editItems' && result.delivery && result.venta) {
        // Cargar delivery en PdV para editar items
        this.deliveryActual = result.delivery;
        this.selectedMesa = null;
        this.ventaRapidaActual = result.venta;

        // Cargar items de la venta
        try {
          const items = await firstValueFrom(this.repositoryService.getVentaItems(result.venta.id));
          for (const item of items) {
            await this.cargarPersonalizacionesItem(item);
          }
          this.ventaItemsDataSource.data = items;
          this.calculateTotals();
        } catch (e) {
          this.ventaItemsDataSource.data = [];
        }
      }
    });
  }

  cerrarModoDelivery(): void {
    this.deliveryActual = null;
    this.ventaRapidaActual = null;
    this.ventaItemsDataSource.data = [];
    this.calculateTotals();
  }

  openUtilitarios(): void {
    if (!this.caja) {
      this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: { title: 'UTILITARIOS', message: 'No hay una caja abierta.', confirmText: 'CERRAR', showCancel: false },
      });
      return;
    }
    this.dialog.open(UtilitariosDialogComponent, {
      width: '600px',
      data: { cajaId: this.caja.id, cajaNombre: `Caja #${this.caja.id}` },
    });
  }

  aplicarDescuentoVenta(): void {
    if (!this.hasActiveVenta) return;

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    // Calcular subtotal de items activos
    const subtotal = this.ventaItemsDataSource.data
      .filter(i => i.estado === EstadoVentaItem.ACTIVO)
      .reduce((sum, i) => sum + ((i.precioVentaUnitario + (i.precioAdicionales || 0)) * i.cantidad), 0);

    const dialogRef = this.dialog.open(DescuentoDialogComponent, {
      width: '450px',
      data: {
        subtotal,
        descuentoPorcentaje: venta.descuentoPorcentaje,
        descuentoMonto: venta.descuentoMonto,
        descuentoMotivo: venta.descuentoMotivo,
      },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result !== null && result !== undefined) {
        try {
          await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
            descuentoPorcentaje: result.descuentoPorcentaje,
            descuentoMonto: result.descuentoMonto,
            descuentoMotivo: result.descuentoMotivo,
          }));
          venta.descuentoPorcentaje = result.descuentoPorcentaje;
          venta.descuentoMonto = result.descuentoMonto;
          venta.descuentoMotivo = result.descuentoMotivo;
          this.calculateTotals();
        } catch (error) {
          console.error('Error al aplicar descuento:', error);
        }
      }
    });
  }

  /**
   * Contenedor del que sale la cuenta activa. Null cuando no hay nada que
   * transferir (venta rápida y delivery quedan fuera: el mostrador no es un
   * contenedor del salón).
   */
  private resolverOrigenTransferencia(): { tipo: 'MESA' | 'COMANDA'; id: number; etiqueta: string } | null {
    if (this.selectedComanda?.id && this.selectedComanda?.venta) {
      return { tipo: 'COMANDA', id: this.selectedComanda.id, etiqueta: `COMANDA ${this.selectedComanda.numero}` };
    }
    if (this.selectedMesa?.id && this.selectedMesa?.venta) {
      return { tipo: 'MESA', id: this.selectedMesa.id, etiqueta: `MESA ${this.selectedMesa.numero}` };
    }
    return null;
  }

  /** Transfiere la cuenta entera a otra mesa o comanda. */
  transferirCuenta(): void {
    const origen = this.resolverOrigenTransferencia();
    if (!origen) return;

    const dialogRef = this.dialog.open(TransferirDestinoDialogComponent, {
      width: '520px',
      data: { origen, alcance: 'COMPLETA' } as TransferirDestinoDialogData,
    });

    dialogRef.afterClosed().subscribe(async (destino: TransferirDestinoResult | null) => {
      if (!destino) return;
      await this.ejecutarTransferencia(origen, destino, 'COMPLETA');
    });
  }

  /**
   * Una sola llamada al backend por transferencia. Antes esto eran 5 a 8 IPC
   * encadenados desde acá, y una falla a mitad dejaba los ítems movidos con la
   * mesa origen todavía ocupada.
   */
  private async ejecutarTransferencia(
    origen: { tipo: 'MESA' | 'COMANDA'; id: number; etiqueta: string },
    destino: TransferirDestinoResult,
    alcance: 'COMPLETA' | 'ITEMS',
    itemIds?: number[],
  ): Promise<void> {
    try {
      const resultado = await firstValueFrom(this.repositoryService.transferirVentaPdv({
        origen: { tipo: origen.tipo, id: origen.id },
        destino: { tipo: destino.tipo, id: destino.id },
        alcance,
        ...(itemIds ? { itemIds } : {}),
      }));

      this.cancelarMoverItems();

      if (resultado.origenCerrado) {
        this.selectedMesa = null;
        this.selectedComanda = null;
        this.ventaItemsDataSource.data = [];
        this.clienteNameForm.get('nombre')?.setValue('');
      } else {
        await this.loadVentaItemsForVenta(resultado.ventaOrigenId);
      }

      this.calculateTotals();
      await this.loadMesas();
      await this.loadComandas();

      this.snackBar.open(
        `${resultado.itemsMovidos} item(s) transferidos a ${destino.etiqueta}`,
        'CERRAR',
        { duration: 3000 },
      );
    } catch (error: any) {
      console.error('Error al transferir la cuenta:', error);
      this.snackBar.open(
        error?.message || 'No se pudo transferir la cuenta',
        'CERRAR',
        { duration: 6000, panelClass: ['error-snackbar'] },
      );
    }
  }

  imprimirPreCuenta(): void {
    if (!this.hasActiveVenta) return;
    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta?.id) return;

    // Dispara impresion vía LPR/network/etc en la impresora con rol TICKET_VENTA.
    const api: any = (window as any).api;
    if (!api?.callIpc) return;
    api.callIpc('print-precuenta', { ventaId: venta.id })
      .then((res: any) => {
        if (res?.ok) {
          this.snackBar.open('Pre-cuenta enviada a impresión', 'CERRAR', { duration: 2500 });
        } else {
          const msg = res?.errors?.[0]?.message || 'No se pudo imprimir la pre-cuenta';
          this.snackBar.open(msg, 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
        }
      })
      .catch((err: any) => {
        console.error('Error imprimir pre-cuenta:', err);
        this.snackBar.open('Error al imprimir pre-cuenta', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      });
  }

  /**
   * Reimprime la comanda (ticket de cocina) de la venta activa. Usa
   * `forceReprint: true` para reenviar TODOS los items a sus sectores, incluso
   * los que ya fueron impresos antes (a diferencia del envío automático que solo
   * manda los pendientes). Útil cuando un ticket se traba/pierde en cocina.
   */
  reimprimirComanda(): void {
    if (!this.hasActiveVenta) return;
    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta?.id) return;

    const api: any = (window as any).api;
    if (!api?.callIpc) return;
    api.callIpc('print-comanda', { ventaId: venta.id, forceReprint: true })
      .then((res: any) => {
        if (res?.ok) {
          this.snackBar.open('Comanda reenviada a cocina', 'CERRAR', { duration: 2500 });
        } else {
          const msg = res?.errors?.[0]?.message || 'No se pudo reimprimir la comanda';
          this.snackBar.open(msg, 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
        }
      })
      .catch((err: any) => {
        console.error('Error reimprimir comanda:', err);
        this.snackBar.open('Error al reimprimir la comanda', 'CERRAR', { duration: 4000, panelClass: ['error-snackbar'] });
      });
  }

  moverItems(): void {
    if (!this.hasActiveVenta || !this.hasActiveItems) return;

    if (!this.moverItemsMode) {
      // Entrar en modo selección
      this.moverItemsMode = true;
      this.selectedItemIds.clear();
      this.columnsToDisplayWithExpand = ['select', ...this.displayedColumns];
      return;
    }

    // Ya estamos en modo — confirmar mover
    if (this.selectedItemIds.size === 0) return;

    const activeItems = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    const allSelected = activeItems.every(i => this.selectedItemIds.has(i.id));

    if (allSelected) {
      // Todos seleccionados — preguntar si transferir la cuenta completa. No es lo
      // mismo: la completa arrastra cobros y datos del cliente, la de ítems no.
      const origen = this.resolverOrigenTransferencia();
      const etiqueta = origen ? origen.etiqueta : 'LA CUENTA';
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: `TRANSFERIR ${etiqueta} COMPLETA`,
          message: `Todos los items están seleccionados. ¿Desea transferir ${etiqueta.toLowerCase()} completa (incluyendo cobros y datos del cliente)?`,
          confirmText: 'TRANSFERIR COMPLETA',
          cancelText: 'SOLO ITEMS',
        },
      });

      dialogRef.afterClosed().subscribe((transferirCompleta: boolean) => {
        if (transferirCompleta === true) {
          this.cancelarMoverItems();
          this.transferirCuenta();
        } else if (transferirCompleta === false) {
          this.ejecutarMoverItems();
        }
        // Si es undefined (cerró el diálogo), no hacer nada
      });
    } else {
      this.ejecutarMoverItems();
    }
  }

  toggleItemSelection(itemId: number): void {
    if (this.selectedItemIds.has(itemId)) {
      this.selectedItemIds.delete(itemId);
    } else {
      const item = this.ventaItemsDataSource.data.find(i => i.id === itemId);
      if (item && this.bloqueadoPorCobro(item, 'mover')) return;
      this.selectedItemIds.add(itemId);
    }
  }

  toggleSelectAll(): void {
    // Ítems movibles = ACTIVOS y sin cobertura de pago (los pagados no se mueven).
    const activeItems = this.ventaItemsDataSource.data.filter(
      i => i.estado === EstadoVentaItem.ACTIVO && Number((i as any)?._montoCubierto || 0) <= 0.5
    );
    const allSelected = activeItems.length > 0 && activeItems.every(i => this.selectedItemIds.has(i.id));
    if (allSelected) {
      this.selectedItemIds.clear();
    } else {
      activeItems.forEach(i => this.selectedItemIds.add(i.id));
    }
  }

  isAllSelected(): boolean {
    const activeItems = this.ventaItemsDataSource.data.filter(
      i => i.estado === EstadoVentaItem.ACTIVO && Number((i as any)?._montoCubierto || 0) <= 0.5
    );
    return activeItems.length > 0 && activeItems.every(i => this.selectedItemIds.has(i.id));
  }

  cancelarMoverItems(): void {
    this.moverItemsMode = false;
    this.selectedItemIds.clear();
    this.columnsToDisplayWithExpand = [...this.displayedColumns];
  }

  private ejecutarMoverItems(): void {
    const origen = this.resolverOrigenTransferencia();
    if (!origen) return;

    const itemIds = Array.from(this.selectedItemIds);
    if (itemIds.length === 0) return;

    const dialogRef = this.dialog.open(TransferirDestinoDialogComponent, {
      width: '520px',
      data: { origen, alcance: 'ITEMS', cantidadItems: itemIds.length } as TransferirDestinoDialogData,
    });

    dialogRef.afterClosed().subscribe(async (destino: TransferirDestinoResult | null) => {
      if (!destino) return;
      await this.ejecutarTransferencia(origen, destino, 'ITEMS', itemIds);
    });
  }

  dividirCuenta(): void {
    if (!this.hasActiveVenta || !this.hasActiveItems) return;

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const activeItems = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    const total = activeItems.reduce((sum, i) => sum + (i.precioVentaUnitario + (i.precioAdicionales || 0) - (i.descuentoUnitario || 0)) * i.cantidad, 0);

    const dialogRef = this.dialog.open(DividirCuentaDialogComponent, {
      width: '500px',
      data: { items: activeItems, total },
    });

    dialogRef.afterClosed().subscribe(async (result) => {
      if (result) {
        // La división crea ventas hijas — cada una se cobra por separado
        // Por ahora loguear el resultado, implementación completa con backend en siguiente iteración
        console.log('División de cuenta:', result);
      }
    });
  }

  asociarCliente(): void {
    if (!this.hasActiveVenta) return;

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const dialogRef = this.dialog.open(BuscarClienteDialogComponent, {
      width: '600px',
    });

    dialogRef.afterClosed().subscribe(async (cliente) => {
      if (cliente && venta) {
        try {
          await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
            cliente: cliente,
            nombreCliente: `${cliente.persona?.nombre || ''} ${cliente.razon_social || ''}`.trim().toUpperCase(),
          }));
          venta.cliente = cliente;
          venta.nombreCliente = `${cliente.persona?.nombre || ''} ${cliente.razon_social || ''}`.trim().toUpperCase();
        } catch (error) {
          console.error('Error al asociar cliente:', error);
        }
      }
    });
  }

  // --- Atajos de teclado ---
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // No disparar si hay un diálogo abierto
    if (this.dialog.openDialogs.length > 0) return;
    // No disparar si la pestaña del PdV no está visible. El listener es a nivel
    // `document`, así que sin este guard los atajos F1-F5 se filtrarían a otras
    // pestañas (ej. al anular una compra). Las pestañas inactivas se ocultan con
    // `display:none`, por lo que un host oculto tiene `offsetParent === null`.
    if (!this.elementRef.nativeElement?.offsetParent) return;

    switch (event.key) {
      case 'F1':
        event.preventDefault();
        this.cobrarVenta();
        break;
      case 'F2':
        event.preventDefault();
        this.cobroRapido();
        break;
      case 'F3':
        event.preventDefault();
        this.openProductSearchDialog();
        break;
      case 'F4':
        event.preventDefault();
        this.cancelarVenta();
        break;
      case 'F5':
        event.preventDefault();
        this.imprimirPreCuenta();
        break;
      case 'Escape':
        event.preventDefault();
        if (this.deliveryActual) {
          this.cerrarModoDelivery();
        } else if (this.ventaRapidaActual) {
          // No deseleccionar — mantener venta rápida
        } else if (this.selectedComanda) {
          this.selectedComanda = null;
          this.ventaItemsDataSource.data = [];
          this.calculateTotals();
        } else {
          this.selectedMesa = null;
          this.ventaItemsDataSource.data = [];
          this.calculateTotals();
        }
        break;
    }
  }

  /**
   * Detecta y procesa una etiqueta EAN-13 de balanza (buffet por peso).
   * @returns true si la consumió (no abrir el buscador normal).
   */
  private async tryHandleBalanzaScan(searchTerm: string): Promise<boolean> {
    const parsed = parseEtiquetaBalanza(searchTerm, {
      prefijo: this.pdvConfig?.balanzaPrefijo || '2',
      modo: (this.pdvConfig?.balanzaModo as 'PESO' | 'PRECIO') || 'PESO',
      factorPeso: Number(this.pdvConfig?.balanzaFactorPeso) || 1,
    });
    if (!parsed) return false;

    let res: any = null;
    try {
      res = await firstValueFrom(this.repositoryService.searchProductosByCodigo(parsed.codigoProducto));
    } catch (e) {
      console.warn('Error resolviendo etiqueta de balanza:', e);
    }
    if (!res?.producto || res.producto.tipo !== ProductoTipo.BUFFET_POR_PESO) {
      // No es un producto de buffet → dejar que el flujo normal lo maneje.
      return false;
    }
    this.searchForm.get('searchTerm')?.setValue('');
    await this.addBuffetPorPesoItem(res.producto, res.presentacion, undefined, parsed.pesoGramos);
    return true;
  }

  // Search products using dialog
  async openProductSearchDialog(): Promise<void> {
    console.log('opening product search dialog');
    const searchTerm = this.searchForm.get('searchTerm')?.value?.trim() || '';

    // Etiqueta de balanza (buffet por peso): resolver sin abrir el buscador.
    if (searchTerm && (await this.tryHandleBalanzaScan(searchTerm))) {
      return;
    }

    const dialogRef = this.dialog.open(ProductoSearchDialogComponent, {
      width: '70%',
      height: '80%',
      data: { searchTerm, cantidad: this.searchForm.get('cantidad')?.value }
    });

    dialogRef.afterClosed().subscribe(async (result: any) => {
      if (result?.isVariacionSelection && result?.producto) {
        // ELABORADO_CON_VARIACION: abrir diálogo de selección de variaciones
        const variacionResult = await this.openSeleccionarVariacionDialog(result.producto, result.cantidad || 1);
        if (variacionResult) {
          await this.addVariacionItem(result.producto, variacionResult);
        }
        this.resetBuscador();
      } else if (result) {
        this.addProduct(result.producto, result.presentacion, result.cantidad, result.precioVenta);
        this.resetBuscador();
      }
    });
  }

  /**
   * Limpia el buscador tras agregar un ítem: borra el término y **resetea la
   * cantidad a 1** (si el usuario había cargado "3*" para agregar 3, la próxima
   * búsqueda arranca de nuevo en 1).
   */
  private resetBuscador(): void {
    this.searchForm.patchValue({ searchTerm: '', cantidad: 1 });
  }

  // Handle search from input
  onSearchKeyDown(event: KeyboardEvent): void {
    console.log(event.key);
    if (event.key === '*') {
      const textBeforeAsterisk = (event.target as HTMLInputElement).value.split('*')[0];
      if (!isNaN(Number(textBeforeAsterisk))) {
        setTimeout(() => {
          this.searchForm.patchValue({
            cantidad: Number(textBeforeAsterisk),
            searchTerm: ''
          });
        }, 100);
      }
    } else if (event.key === 'Enter') {
      event.preventDefault(); // Prevent form submission
      this.openProductSearchDialog();
    }
  }

  // Search products (called from template)
  searchProducts(): void {
    this.openProductSearchDialog();
  }

  selectMesa(mesa: PdvMesa): void {
    this.selectedMesa = mesa;
    this.selectedComanda = null;
    this.estamparDetalleMesa();

    // Reset cliente name form when selecting a new mesa
    this.isEditingClienteName = false;

    // Reset the nombre in the form if the mesa has a venta with a nombre_cliente
    if (mesa.venta && mesa.venta.nombreCliente) {
      this.clienteNameForm.get('nombre')?.setValue(mesa.venta.nombreCliente);
    } else {
      this.clienteNameForm.get('nombre')?.setValue('');
    }

    // Load venta items if mesa has a venta
    this.loadVentaItems(mesa);

    // Devolver el foco al buscador de productos tras un pequeño delay.
    this.focusBuscadorConDelay();
  }

  /**
   * Load venta items for a selected mesa
   */
  async loadVentaItems(mesa: PdvMesa): Promise<void> {
    // Reset ventaItems
    this.ventaItemsDataSource.data = [];

    if (mesa.venta && mesa.venta.id) {
      try {
        // Load venta items for this venta
        const items = await firstValueFrom(this.repositoryService.getVentaItems(mesa.venta.id));
        // Cargar personalizaciones de cada item
        for (const item of items) {
          await this.cargarPersonalizacionesItem(item);
        }
        this.ventaItemsDataSource.data = items;
        // Calculate totals based on loaded items
        this.calculateTotals();
        await this.loadEstadoCobroActual(mesa.venta.id);
      } catch (error) {
        console.error('Error loading venta items:', error);
        // Reset items and totals on error
        this.ventaItemsDataSource.data = [];
        this.calculateTotals();
        this.resetEstadoCobro();
      }
    } else {
      // If there is no venta, clear the table
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
      this.resetEstadoCobro();
    }
  }

  /**
   * Start editing cliente name
   */
  startEditingClienteName(): void {
    this.isEditingClienteName = true;

    // Set initial value if available
    const ventaActual = this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (ventaActual?.nombreCliente) {
      this.clienteNameForm.get('nombre')?.setValue(ventaActual.nombreCliente);
    } else {
      this.clienteNameForm.get('nombre')?.setValue('');
    }

    // Focus on the input field
    setTimeout(() => {
      const inputElement = document.querySelector('input[formControlName="nombre"]');
      if (inputElement) {
        (inputElement as HTMLInputElement).focus();
      }
    }, 100);
  }

  /**
   * Save cliente name
   */
  async saveClienteName(): Promise<void> {
    if (!this.selectedMesa && !this.selectedComanda) return;

    const raw = this.clienteNameForm.get('nombre')?.value || '';
    const nombreCliente = raw.replace(/\b\w/g, (c: string) => c.toUpperCase());
    this.clienteNameForm.get('nombre')?.setValue(nombreCliente, { emitEvent: false });

    try {
      let venta = this.selectedComanda?.venta || this.selectedMesa?.venta;

      if (!venta) {
        // Create a new venta if none exists
        venta = await this.getVenta();
      }

      // Update the nombreCliente
      venta.nombreCliente = nombreCliente;

      // Update the venta in the database
      const updatedVenta = await firstValueFrom(this.repositoryService.updateVenta(venta.id!, venta));

      // Update the local reference
      if (this.selectedComanda) {
        this.selectedComanda.venta = updatedVenta;
      } else if (this.selectedMesa) {
        this.selectedMesa.venta = updatedVenta;

        // Update mesa estado to OCUPADO
        if (this.selectedMesa.estado !== PdvMesaEstado.OCUPADO) {
          this.updateMesaEstado(this.selectedMesa, PdvMesaEstado.OCUPADO);
        }
      }

      // Exit editing mode
      this.isEditingClienteName = false;
    } catch (error) {
      console.error('Error saving cliente name:', error);
    }
  }

  /**
   * Cancel editing cliente name
   */
  cancelEditingClienteName(): void {
    this.isEditingClienteName = false;
  }

  /**
   * Handle key press in cliente name input
   */
  onClienteNameKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.saveClienteName();
    } else if (event.key === 'Escape') {
      this.cancelEditingClienteName();
    }
  }

  /**
   * Calculates the time the caja has been open and returns a formatted string (hours and minutes)
   * @returns String with formatted time e.g. "2h 45m"
   */
  timeOpen(): string {
    if (!this.caja?.fechaApertura) {
      return '0h 0m';
    }

    const fechaApertura = new Date(this.caja.fechaApertura);
    const now = new Date();

    // Calculate the difference in milliseconds
    const diffMs = now.getTime() - fechaApertura.getTime();

    // Convert to hours and minutes
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

    return `${hours}h ${minutes}m`;
  }


} 