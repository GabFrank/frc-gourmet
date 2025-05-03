import { Component, OnInit } from '@angular/core';
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
import { AuthService } from 'src/app/services/auth.service';
import { Caja } from 'src/app/database/entities/financiero/caja.entity';
import { CreateCajaDialogComponent } from '../../financiero/cajas/create-caja-dialog/create-caja-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';
import { MesaSelectionDialogComponent } from '../../../shared/components/mesa-selection-dialog/mesa-selection-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableDataSource } from '@angular/material/table';

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
    MatMenuModule
  ],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0', overflow: 'hidden', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class PdvComponent implements OnInit {
  // Table data
  ventaItemsDataSource = new MatTableDataSource<VentaItem>([]);
  displayedColumns: string[] = ['productoNombre', 'cantidad', 'precio', 'total', 'actions'];
  expandedElement: VentaItem | null = null;
  columnsToDisplayWithExpand = [...this.displayedColumns, 'expand'];

  // Search form
  searchForm: FormGroup;

  // Currency management
  monedas: Moneda[] = [];
  monedasWithTotals: MonedaWithTotal[] = [];
  saldos: Map<number, number> = new Map<number, number>();
  exchangeRates: MonedaCambio[] = [];
  filteredMonedas: Moneda[] = [];

  // Principal currency
  principalMoneda: Moneda | null = null;
  principalMonedaId: number | null = null;

  // Product demo data for grid
  productos: Producto[] = [];

  // Tables (mesas)
  mesas: PdvMesa[] = [];
  loadingMesas = false;
  selectedMesa: PdvMesa | null = null;

  // Sector filter for tables
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

  // Getter to combine loading states for currency display
  get loadingCurrencies(): boolean {
    return this.loadingExchangeRates || this.loadingConfig;
  }

  // Search constants
  readonly SEARCH_DIALOG_WIDTH = '800px';
  readonly SEARCH_DIALOG_HEIGHT = '600px';

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private authService: AuthService,
    private tabsService: TabsService
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
            this.dialog.open(CreateCajaDialogComponent, {
              width: '80vw',
              height: '80vh',
              disableClose: true
            });
            dialogRef.afterClosed().subscribe(result => {
              if (result) {
                this.loadInitialData();
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

      // Initialize demo data
      this.initDemoData();

      // Calculate totals
      this.calculateTotals();

    } catch (error) {
      console.error('Error loading initial data:', error);
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
    const totalInPrincipal = this.ventaItemsDataSource.data.filter(item => item.estado === EstadoVentaItem.ACTIVO).reduce((sum, item) => sum + item.precioVentaTotal, 0);

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

      // Find exchange rate from principal to this currency
      const exchangeRate = this.exchangeRates.find(rate =>
        rate.monedaOrigen.id === this.principalMoneda?.id &&
        rate.monedaDestino.id === moneda.id
      );

      if (exchangeRate) {
        // Convert total from principal to this currency
        const total = totalInPrincipal / exchangeRate.compraLocal;

        // Add to the list
        this.monedasWithTotals.push({
          moneda: moneda,
          total: total
        });

        // Initialize saldos for this currency
        this.saldos.set(moneda.id!, total);
      } else {
        console.warn(`No exchange rate found from ${this.principalMoneda?.denominacion} to ${moneda.denominacion}`);

        // No exchange rate found, set total to 0
        this.monedasWithTotals.push({
          moneda: moneda,
          total: 0
        });

        // Initialize saldos for this currency
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
  editItem(item: VentaItem): void {
    // open dialog to edit item
    // this.dialog.open(VentaItemEditDialogComponent, {
    //   data: item
    // });
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
    try {
      // Check if mesa is selected
      if (!this.selectedMesa) {
        // No mesa selected, show dialog to select one
        await this.showMesaSelectionDialog();
        
        // If still no mesa selected after dialog, return without adding product
        if (!this.selectedMesa) {
          console.log('No se seleccionó ninguna mesa');
          return;
        }
      }
      
      // Get the venta first
      const venta = await this.getVenta();
      
      const existingItem = this.ventaItemsDataSource.data.find(item => item.presentacion.id === presentacion.id);
      let ventaItem: VentaItem;
      
      if (existingItem) {
        existingItem.cantidad += 1;
        existingItem.precioVentaTotal = existingItem.cantidad * existingItem.precioVentaTotal;
        this.ventaItemsDataSource.data = [...this.ventaItemsDataSource.data];
        console.log(existingItem);
        ventaItem = existingItem;
      } else {
        // use precioVenta or get preciosVenta from database where principal is true and presentacion.id is the same as precioVenta.presentacionId
        const precioVentaToUse = precioVenta || await firstValueFrom(this.repositoryService.getPrecioVenta(presentacion.id!, true));
        
        if (!precioVentaToUse) {
          throw new Error('No se encontró un precio de venta válido');
        }
        
        // Create a new VentaItem (only use properties that exist on the VentaItem type)
        const newVentaItem = new VentaItem();
        newVentaItem.presentacion = presentacion;
        newVentaItem.cantidad = cantidad;
        newVentaItem.precioVentaTotal = precioVentaToUse.valor;
        newVentaItem.precioCostoTotal = this.findPrecioCosto(presentacion);
        newVentaItem.venta = venta;
        newVentaItem.tipoMedida = presentacion.tipoMedida;
        newVentaItem.precioVentaPresentacion = precioVentaToUse;
        newVentaItem.producto = producto;
      
        // Save the new item
        try {
          const savedItem = await firstValueFrom(this.repositoryService.createVentaItem(newVentaItem));
          this.ventaItemsDataSource.data.push(savedItem);
          this.ventaItemsDataSource.data = [...this.ventaItemsDataSource.data];
          ventaItem = savedItem;
        } catch (error) {
          console.error('Error al guardar el item de venta:', error);
        }
      }

      // Recalculate totals after adding item
      this.calculateTotals();
    } catch (error) {
      console.error('Error al agregar producto:', error);
      // Handle error appropriately
    }
  }

  // Add new method to show mesa selection dialog
  private async showMesaSelectionDialog(): Promise<void> {
    // Create dialog data with available mesas
    const dialogData = {
      mesas: this.mesas.filter(mesa => mesa.activo && !mesa.reservado),
      title: 'Seleccionar Mesa',
      message: 'Por favor seleccione una mesa para continuar'
    };

    // Open the dialog
    const dialogRef = this.dialog.open(MesaSelectionDialogComponent, {
      width: '80%',
      maxWidth: '800px',
      data: dialogData,
      disableClose: true
    });

    // Handle the result
    const selectedMesa = await firstValueFrom(dialogRef.afterClosed());
    if (selectedMesa) {
      this.selectedMesa = selectedMesa;
    }
  }

  // return a promise, if mesa is not null, get venta from mesa, if null create a new venta
  getVenta(): Promise<Venta> {
    if (this.selectedMesa == null) {
      return Promise.reject('Mesa no seleccionada');
    } else {
      if (this.selectedMesa.venta == null) {
        const venta = new Venta();
        venta.estado = VentaEstado.ABIERTA;
        venta.caja = this.caja!;
        venta.mesa = this.selectedMesa;
        // save venta and return promise
        return firstValueFrom(this.repositoryService.createVenta(venta).pipe(
          map(createdVenta => {
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

  findPrecioCosto(presentacion: Presentacion): number {
    // return presentacion.preciosCosto.find(p => p.principal)?.valor || 0;
    return 0;
  }

  findPrecioPrincipal(presentacion: Presentacion): number {
    return presentacion.preciosVenta.find(p => p.principal)?.valor || 0;
  }

  // Search products using dialog
  openProductSearchDialog(): void {
    const searchTerm = this.searchForm.get('searchTerm')?.value?.trim() || '';

    const dialogRef = this.dialog.open(ProductoSearchDialogComponent, {
      width: this.SEARCH_DIALOG_WIDTH,
      height: this.SEARCH_DIALOG_HEIGHT,
      data: { searchTerm, cantidad: this.searchForm.get('cantidad')?.value }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addProduct(result.product, result.presentacion, result.cantidad);
        // Clear search term after adding product
        this.searchForm.get('searchTerm')?.setValue('');
      }
    });
  }

  // Handle search from input
  onSearchKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.openProductSearchDialog();
    }
  }

  // Search products (called from template)
  searchProducts(): void {
    this.openProductSearchDialog();
  }

  selectMesa(mesa: PdvMesa): void {
    this.selectedMesa = mesa;
    
    // Reset cliente name form when selecting a new mesa
    this.isEditingClienteName = false;
    
    // Reset the nombre in the form if the mesa has a venta with a nombre_cliente
    if (mesa.venta && mesa.venta.nombre_cliente) {
      this.clienteNameForm.get('nombre')?.setValue(mesa.venta.nombre_cliente);
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
    if (this.selectedMesa?.venta?.nombre_cliente) {
      this.clienteNameForm.get('nombre')?.setValue(this.selectedMesa.venta.nombre_cliente);
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
    if (!this.selectedMesa) return;
    
    const nombreCliente = this.clienteNameForm.get('nombre')?.value;
    
    try {
      let venta = this.selectedMesa.venta;
      
      if (!venta) {
        // Create a new venta if none exists
        venta = await this.getVenta();
      }
      
      // Update the nombre_cliente
      venta.nombre_cliente = nombreCliente;
      
      // Update the venta in the database
      const updatedVenta = await firstValueFrom(this.repositoryService.updateVenta(venta.id!, venta));
      
      // Update the local reference
      if (this.selectedMesa) {
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

  // Getter for accessing search term (for template)
  get searchTerm(): string {
    return this.searchForm.get('searchTerm')?.value || '';
  }

  /**
   * Get formatted currencies with their totals for display,
   * matching the layout in the screenshot
   */
  get currenciesToDisplay(): CurrencyDisplay[] {
    return this.monedasWithTotals.map(({ moneda, total }) => {
      // Map country codes to expected currency codes in screenshot
      let currencyCode = '';
      let denominationCode = '';

      if(moneda.countryCode) {
        currencyCode = moneda.countryCode;
      }

      if(moneda.denominacion) {
        denominationCode = moneda.denominacion;
      }

      return {
        code: currencyCode,
        symbol: moneda.simbolo || '',
        denominationCode: denominationCode,
        total: total,
        flag: moneda.countryCode?.toLowerCase() || ''
      };
    });
  }

  /**
   * Get formatted currencies with their balances for display,
   * matching the layout in the screenshot
   */
  get currencyBalancesToDisplay(): CurrencyDisplay[] {
    return this.monedasWithTotals.map(({ moneda }) => {
      // Map country codes to expected currency codes in screenshot
      //  we already have currencyCode and denominationCode in moneda entity, currencyCode: moneda.countryCode, denominationCode: moneda.denominacion
      let currencyCode = '';
      let denominationCode = '';

      if(moneda.countryCode) {
        currencyCode = moneda.countryCode;
      }

      if(moneda.denominacion) {
        denominationCode = moneda.denominacion;
      }

      return {
        code: currencyCode,
        symbol: moneda.simbolo || '',
        denominationCode: denominationCode,
        total: this.saldos.get(moneda.id!) || 0,
        flag: moneda.countryCode?.toLowerCase() || ''
      };
    });
  }

  get currencyTotals(): Map<number, number> {
    const totalsMap = new Map<number, number>();
    this.monedasWithTotals.forEach(mwt => {
      totalsMap.set(mwt.moneda.id!, mwt.total);
    });
    return totalsMap;
  }

  get currencyBalances(): Map<number, number> {
    return this.saldos;
  }

  /**
   * Calculates the time the caja has been open and returns a formatted string (hours and minutes)
   * @returns String with formatted time e.g. "2h 45m"
   */
  get timeOpen(): string {
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

  /**
   * Get information about the selected mesa for display in the template
   * @returns Boolean indicating if a mesa is selected
   */
  get hasMesaSelected(): boolean {
    return this.selectedMesa !== null;
  }
  
  /**
   * Get status text for the selected mesa
   * @returns Status text based on mesa's reservation status
   */
  get mesaStatusText(): string {
    if (!this.selectedMesa) return '';
    return this.selectedMesa.reservado ? 'Reservada' : this.selectedMesa.estado === PdvMesaEstado.DISPONIBLE ? 'Disponible' : 'Ocupada';
  }
  
  /**
   * Get CSS class for mesa status
   * @returns CSS class for styling the mesa status
   */
  get mesaStatusClass(): string {
    if (!this.selectedMesa) return '';
    return this.selectedMesa.reservado ? 'status-reserved' : this.selectedMesa.estado === PdvMesaEstado.DISPONIBLE ? 'status-available' : 'status-occupied';
  }

  /**
   * Get cliente name from the selected mesa's venta
   */
  get clienteName(): string | undefined {
    return this.selectedMesa?.venta?.nombre_cliente;
  }

  /**
   * Check if the selected mesa has a cliente name
   */
  get hasClienteName(): boolean {
    return !!this.clienteName;
  }

  /**
   * Get the formatted estado display
   */
  getEstadoDisplay(estado: EstadoVentaItem): string {
    return estado;
  }

  /**
   * Check if an item has been canceled
   */
  isCancelado(item: VentaItem): boolean {
    return item.estado === EstadoVentaItem.CANCELADO;
  }

  /**
   * Check if an item has been modified
   */
  isModificado(item: VentaItem): boolean {
    return item.estado === EstadoVentaItem.MODIFICADO || item.modificado;
  }
} 