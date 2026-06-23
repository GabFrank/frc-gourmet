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
import { TransferirMesaDialogComponent } from 'src/app/shared/components/transferir-mesa-dialog/transferir-mesa-dialog.component';
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
    MatCheckboxModule
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
  mesas: PdvMesa[] = [];
  loadingMesas = false;
  selectedMesa: PdvMesa | null = null;

  // Venta rápida (sin mesa)
  ventaRapidaActual: Venta | null = null;

  // Delivery activo (cuando se editan items de un delivery)
  deliveryActual: Delivery | null = null;

  // Comandas (tarjetas de cuenta individual)
  comandas: any[] = [];
  loadingComandas = false;
  selectedComanda: any = null;
  activeTab: 'MESAS' | 'COMANDAS' = 'MESAS';
  mesasOcupadasCount = 0;
  comandasOcupadasCount = 0;
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
    // get caja abierta from current user
    if (this.authService.currentUser) {
      this.caja = await firstValueFrom(this.repositoryService.getCajaAbiertaByUsuario(this.authService.currentUser.id));
      if (this.caja) {
        this.loadInitialData();
      } else {
        // show dialog warning that there is no caja abierta, ask if they want to open a new caja, if yes open create caja dialog
        // fist show a dialog with a warning message  
        // change this by confirmation dialog
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          disableClose: true,
          data: {
            title: 'Caja abierta no encontrada',
            message: 'No hay una caja abierta, ¿desea abrir una nueva?',
          }
        });
        dialogRef.afterClosed().subscribe(result => {
          if (result) {
            // open create caja dialog
            const cajaDialogRef = this.dialog.open(CreateCajaDialogComponent, {
              width: '80vw',
              height: '80vh',
              disableClose: true
            });
            cajaDialogRef.afterClosed().subscribe(async (cajaResult) => {
              if (cajaResult?.success) {
                // Recargar la caja abierta
                this.caja = await firstValueFrom(this.repositoryService.getCajaAbiertaByUsuario(this.authService.currentUser!.id));
                if (this.caja) {
                  this.loadInitialData();
                }
              } else {
                // close tab
                this.tabsService.removeTabById('pdv');
              }
            });
          } else {
            // close tab
            this.tabsService.removeTabById('pdv');
          }
        });
      }
    } else {
      // 
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

      // Load sectores
      this.sectores = await firstValueFrom(this.repositoryService.getSectoresActivos());

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
        }
      } catch (e) { /* use default */ }

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

  ngOnDestroy(): void {
    if (this.mesasRefreshInterval) {
      clearInterval(this.mesasRefreshInterval);
    }
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
      this.mesasOcupadasCount = this.mesas.filter(m => m.estado === PdvMesaEstado.OCUPADO).length;
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
      this.mesas = await firstValueFrom(this.repositoryService.getPdvMesas());

      // Filter for active tables
      this.mesas = this.mesas.filter(mesa => mesa.activo);

      // Sort tables by number
      this.mesas.sort((a, b) => a.numero - b.numero);
      this.mesasOcupadasCount = this.mesas.filter(m => m.estado === PdvMesaEstado.OCUPADO).length;

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
      this.mesas = await firstValueFrom(this.repositoryService.getPdvMesasBySector(sectorId));

      // Filter for active tables
      this.mesas = this.mesas.filter(mesa => mesa.activo);

      // Sort tables by number
      this.mesas.sort((a, b) => a.numero - b.numero);

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
  }

  private async loadVentaItemsForVenta(ventaId: number): Promise<void> {
    try {
      const items = await firstValueFrom(this.repositoryService.getVentaItems(ventaId));
      for (const item of items) {
        await this.cargarPersonalizacionesItem(item);
      }
      this.ventaItemsDataSource.data = items;
      this.calculateTotals();
    } catch (error) {
      console.error('Error loading venta items:', error);
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
    }
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

  /**
   * Transferir venta de comanda a una mesa (libera la comanda)
   */
  transferirComandaAMesa(): void {
    if (!this.selectedComanda?.venta) return;

    const dialogRef = this.dialog.open(TransferirMesaDialogComponent, {
      width: '500px',
      data: { mesaActual: this.selectedComanda.pdv_mesa || { numero: `Comanda #${this.selectedComanda.numero}` } },
    });

    dialogRef.afterClosed().subscribe(async (mesaDestino: PdvMesa | null) => {
      if (!mesaDestino || !this.selectedComanda?.venta) return;
      try {
        const ventaId = this.selectedComanda.venta.id;

        if (mesaDestino.venta?.id) {
          // Mesa destino tiene venta: mover items a esa venta
          const items = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
          for (const item of items) {
            await firstValueFrom(this.repositoryService.updateVentaItem(item.id, {
              venta: { id: mesaDestino.venta.id } as any,
            }));
          }
          // Transferir nombre cliente si destino no tiene
          const ventaOrigen = await firstValueFrom(this.repositoryService.getVenta(ventaId));
          if (ventaOrigen?.nombreCliente && !mesaDestino.venta.nombreCliente) {
            await firstValueFrom(this.repositoryService.updateVenta(mesaDestino.venta.id, {
              nombreCliente: ventaOrigen.nombreCliente,
            }));
          }
          // Cancelar la venta de la comanda
          await firstValueFrom(this.repositoryService.updateVenta(ventaId, {
            estado: VentaEstado.CANCELADA,
          }));
        } else {
          // Mesa destino libre: mover la venta completa
          await firstValueFrom(this.repositoryService.updateVenta(ventaId, {
            mesa: { id: mesaDestino.id } as any,
            comanda: null as any,
          }));
          // Ocupar mesa destino
          await firstValueFrom(this.repositoryService.updatePdvMesa(mesaDestino.id!, { estado: PdvMesaEstado.OCUPADO } as any));
        }

        // Cerrar comanda (liberar tarjeta)
        await this.cerrarComandaActual();

        // Limpiar UI
        this.ventaItemsDataSource.data = [];
        this.calculateTotals();
        this.clienteNameForm.get('nombre')?.setValue('');

        await this.loadMesas();
      } catch (error) {
        console.error('Error al transferir comanda a mesa:', error);
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
      data: { atajoItemId: item.id, atajoItemNombre: item.nombre, gridSize: this.atajosProductosGridSize }
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
    const observacionIds = (existingObs || [])
      .filter((o: any) => o.observacion?.id)
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

          // Guardar observaciones
          if (result.observacionIds?.length > 0 || result.observacionLibre) {
            for (const obsId of (result.observacionIds || [])) {
              await firstValueFrom(this.repositoryService.createVentaItemObservacion({
                ventaItem: { id: item.id },
                observacion: { id: obsId },
                observacionLibre: result.observacionLibre,
              }));
            }
            if (result.observacionIds?.length === 0 && result.observacionLibre) {
              await firstValueFrom(this.repositoryService.createVentaItemObservacion({
                ventaItem: { id: item.id },
                observacionLibre: result.observacionLibre,
              }));
            }
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
    const dialogData: SeleccionarVariacionDialogData = {
      producto,
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

    // Calcular precio de adicionales total (por sabor + general)
    let totalAdicionales = 0;
    for (const sabor of result.sabores) {
      if (sabor.personalizacion) {
        totalAdicionales += sabor.personalizacion.precioAdicionalTotal * sabor.proporcion;
      }
    }
    if (result.personalizacionGeneral) {
      totalAdicionales += result.personalizacionGeneral.precioAdicionalTotal;
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

      // Persistir personalización general (sin ventaItemSabor FK)
      if (result.personalizacionGeneral) {
        await this.persistirPersonalizacion(savedItem.id, result.personalizacionGeneral);
      }

      // Cargar personalizaciones para mostrar en tabla expandible
      await this.cargarPersonalizacionesItem(savedItem);

      const auxList = this.ventaItemsDataSource.data;
      auxList.push(savedItem);
      this.ventaItemsDataSource.data = auxList;

      this.calculateTotals();
    } catch (error) {
      console.error('Error al guardar item de variación:', error);
    }
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

    // Observación libre
    if (result.observacionLibre) {
      const firstObs = result.observacionIds.length > 0 ? result.observacionIds[0] : null;
      if (firstObs) {
        // Ya se guardó arriba, agregar observación libre en una entry separada
        promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
          ventaItem: { id: ventaItemId },
          observacion: { id: firstObs },
          observacionLibre: result.observacionLibre,
          ventaItemSabor: { id: ventaItemSaborId },
        })));
      } else {
        // Solo observación libre sin observación predefinida — necesitamos al menos una observación
        // Por ahora guardar como observación libre sin relación a observación predefinida
      }
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
    if (result.observacionLibre) {
      promises.push(firstValueFrom(this.repositoryService.createVentaItemObservacion({
        ventaItem: { id: ventaItemId },
        observacion: result.observacionIds.length > 0 ? { id: result.observacionIds[0] } : null,
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
              // Update mesa estado to OCUPADO
              this.updateMesaEstado(this.selectedMesa, PdvMesaEstado.OCUPADO);
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
  private updateMesaEstado(mesa: PdvMesa, estado: PdvMesaEstado): void {
    mesa.estado = estado;
    this.repositoryService.updatePdvMesa(mesa.id!, mesa).subscribe(
      updatedMesa => {
        console.log(`Mesa ${updatedMesa.numero} updated to estado: ${updatedMesa.estado}`);
      },
      error => {
        console.error('Error updating mesa estado:', error);
      }
    );
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

  cobrarVenta(): void {
    if (!this.hasActiveVenta || !this.hasActiveItems) return;

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const dialogData: CobrarVentaDialogData = {
      venta,
      items: this.ventaItemsDataSource.data,
      monedas: this.filteredMonedas.length > 0 ? this.filteredMonedas : this.monedas,
      exchangeRates: this.exchangeRates,
      principalMoneda: this.principalMoneda!,
      caja: this.caja!,
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
          await firstValueFrom(this.repositoryService.cerrarVentasAbiertasMesa(this.selectedMesa.id!, VentaEstado.CONCLUIDA));
          this.updateMesaEstado(this.selectedMesa, PdvMesaEstado.DISPONIBLE);
          this.selectedMesa.venta = null as any;
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

    const venta = this.ventaRapidaActual || this.selectedComanda?.venta || this.selectedMesa?.venta;
    if (!venta) return;

    const items = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    const total = items.reduce((sum, i) => sum + (i.precioVentaUnitario + (i.precioAdicionales || 0) - (i.descuentoUnitario || 0)) * i.cantidad, 0);
    if (total <= 0) return;

    try {
      const formasPago = await firstValueFrom(this.repositoryService.getFormasPago());
      const fpPrincipal = formasPago.find(fp => fp.principal && fp.activo) || formasPago.find(fp => fp.activo);
      if (!fpPrincipal || !this.principalMoneda) return;

      const pago = await firstValueFrom(this.repositoryService.createPago({
        estado: PagoEstado.PAGADO,
        caja: this.caja!,
        activo: true,
      }));

      await firstValueFrom(this.repositoryService.createPagoDetalle({
        valor: total,
        descripcion: 'COBRO RAPIDO',
        tipo: TipoDetalle.PAGO,
        pago,
        moneda: this.principalMoneda,
        formaPago: fpPrincipal,
        activo: true,
      }));

      await firstValueFrom(this.repositoryService.updateVenta(venta.id, {
        estado: VentaEstado.CONCLUIDA,
        formaPago: fpPrincipal,
        pago,
        fechaCierre: new Date(),
      }));

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
        await firstValueFrom(this.repositoryService.cerrarVentasAbiertasMesa(this.selectedMesa.id!, VentaEstado.CONCLUIDA));
        await firstValueFrom(this.repositoryService.updatePdvMesa(this.selectedMesa.id!, { estado: PdvMesaEstado.DISPONIBLE } as any));
        this.selectedMesa.venta = null as any;
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

  openDelivery(): void {
    if (!this.caja) return;

    const dialogData: DeliveryDialogData = {
      caja: this.caja,
      monedas: this.monedas,
      principalMoneda: this.principalMoneda!,
      exchangeRates: this.exchangeRates,
      filteredMonedas: this.filteredMonedas,
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

  transferirMesa(): void {
    if (!this.selectedMesa || !this.selectedMesa.venta) return;

    const dialogRef = this.dialog.open(TransferirMesaDialogComponent, {
      width: '500px',
      data: { mesaActual: this.selectedMesa },
    });

    dialogRef.afterClosed().subscribe(async (mesaDestino: PdvMesa | null) => {
      if (mesaDestino && this.selectedMesa?.venta) {
        try {
          const ventaOrigenId = this.selectedMesa.venta.id;

          if (mesaDestino.venta?.id) {
            // Mesa destino tiene venta abierta: mover items + pago a la venta destino
            const items = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
            for (const item of items) {
              await firstValueFrom(this.repositoryService.updateVentaItem(item.id, {
                venta: { id: mesaDestino.venta.id } as any,
              }));
            }
            // Transferir pago y nombre de cliente si la venta destino no tiene
            const ventaOrigen = await firstValueFrom(this.repositoryService.getVenta(ventaOrigenId));
            const updateData: any = {};
            if (ventaOrigen?.pago?.id) {
              updateData.pago = ventaOrigen.pago;
            }
            if (ventaOrigen?.nombreCliente && !mesaDestino.venta.nombreCliente) {
              updateData.nombreCliente = ventaOrigen.nombreCliente;
            }
            if (Object.keys(updateData).length > 0) {
              await firstValueFrom(this.repositoryService.updateVenta(mesaDestino.venta.id, updateData));
            }
            // Cancelar la venta origen
            await firstValueFrom(this.repositoryService.updateVenta(ventaOrigenId, {
              estado: VentaEstado.CANCELADA,
            }));
          } else {
            // Mesa destino libre: mover la venta completa (pago va con la venta)
            await firstValueFrom(this.repositoryService.updateVenta(ventaOrigenId, {
              mesa: { id: mesaDestino.id } as any,
            }));
          }

          // Liberar mesa origen
          await firstValueFrom(this.repositoryService.updatePdvMesa(this.selectedMesa.id!, { estado: PdvMesaEstado.DISPONIBLE } as any));

          // Ocupar mesa destino
          await firstValueFrom(this.repositoryService.updatePdvMesa(mesaDestino.id!, { estado: PdvMesaEstado.OCUPADO } as any));

          // Limpiar UI
          this.selectedMesa = null;
          this.ventaItemsDataSource.data = [];
          this.calculateTotals();

          // Recargar mesas
          await this.loadMesas();
        } catch (error) {
          console.error('Error al transferir mesa:', error);
        }
      }
    });
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
      // Todos seleccionados — preguntar si transferir mesa completa
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        width: '400px',
        data: {
          title: 'TRANSFERIR MESA COMPLETA',
          message: 'Todos los items están seleccionados. ¿Desea transferir la mesa completa (incluyendo cobros y datos del cliente)?',
          confirmText: 'TRANSFERIR MESA',
          cancelText: 'SOLO ITEMS',
        },
      });

      dialogRef.afterClosed().subscribe((transferirCompleta: boolean) => {
        if (transferirCompleta === true) {
          this.cancelarMoverItems();
          this.transferirMesa();
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
      this.selectedItemIds.add(itemId);
    }
  }

  toggleSelectAll(): void {
    const activeItems = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    const allSelected = activeItems.every(i => this.selectedItemIds.has(i.id));
    if (allSelected) {
      this.selectedItemIds.clear();
    } else {
      activeItems.forEach(i => this.selectedItemIds.add(i.id));
    }
  }

  isAllSelected(): boolean {
    const activeItems = this.ventaItemsDataSource.data.filter(i => i.estado === EstadoVentaItem.ACTIVO);
    return activeItems.length > 0 && activeItems.every(i => this.selectedItemIds.has(i.id));
  }

  cancelarMoverItems(): void {
    this.moverItemsMode = false;
    this.selectedItemIds.clear();
    this.columnsToDisplayWithExpand = [...this.displayedColumns];
  }

  private ejecutarMoverItems(): void {
    if (!this.selectedMesa) return;

    const dialogRef = this.dialog.open(TransferirMesaDialogComponent, {
      width: '500px',
      data: { mesaActual: this.selectedMesa },
    });

    dialogRef.afterClosed().subscribe(async (mesaDestino: PdvMesa | null) => {
      if (!mesaDestino || !this.selectedMesa?.venta) {
        return;
      }

      try {
        // Obtener o crear venta en mesa destino
        let ventaDestinoId: number;
        if (mesaDestino.venta?.id) {
          ventaDestinoId = mesaDestino.venta.id;
        } else {
          const nuevaVenta = await firstValueFrom(this.repositoryService.createVenta({
            estado: VentaEstado.ABIERTA,
            caja: this.caja!,
            mesa: { id: mesaDestino.id } as any,
          } as any));
          nuevaVenta.estado = VentaEstado.ABIERTA;
          ventaDestinoId = nuevaVenta.id;
          await firstValueFrom(this.repositoryService.updatePdvMesa(mesaDestino.id!, { estado: PdvMesaEstado.OCUPADO } as any));
        }

        // Mover items seleccionados
        const itemsToMove = this.ventaItemsDataSource.data.filter(i => this.selectedItemIds.has(i.id));
        for (const item of itemsToMove) {
          await firstValueFrom(this.repositoryService.updateVentaItem(item.id, {
            venta: { id: ventaDestinoId } as any,
          }));
        }

        // Verificar si quedan items activos en la mesa origen
        const itemsRestantes = this.ventaItemsDataSource.data.filter(
          i => i.estado === EstadoVentaItem.ACTIVO && !this.selectedItemIds.has(i.id)
        );

        if (itemsRestantes.length === 0) {
          // No quedan items — desocupar mesa origen
          await firstValueFrom(this.repositoryService.updateVenta(this.selectedMesa.venta.id, {
            estado: VentaEstado.CANCELADA,
          }));
          await firstValueFrom(this.repositoryService.updatePdvMesa(this.selectedMesa.id!, { estado: PdvMesaEstado.DISPONIBLE } as any));
          this.selectedMesa = null;
          this.ventaItemsDataSource.data = [];
        } else {
          // Quedan items — recargar la mesa
          this.ventaItemsDataSource.data = itemsRestantes;
        }

        this.cancelarMoverItems();
        this.calculateTotals();
        await this.loadMesas();
      } catch (error) {
        console.error('Error al mover items:', error);
      }
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
        this.searchForm.get('searchTerm')?.setValue('');
      } else if (result) {
        this.addProduct(result.producto, result.presentacion, result.cantidad, result.precioVenta);
        // Clear search term after adding product
        this.searchForm.get('searchTerm')?.setValue('');
      }
    });
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
        console.log(this.ventaItemsDataSource.data);
        // Calculate totals based on loaded items
        this.calculateTotals();
      } catch (error) {
        console.error('Error loading venta items:', error);
        // Reset items and totals on error
        this.ventaItemsDataSource.data = [];
        this.calculateTotals();
      }
    } else {
      // If there is no venta, clear the table
      this.ventaItemsDataSource.data = [];
      this.calculateTotals();
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