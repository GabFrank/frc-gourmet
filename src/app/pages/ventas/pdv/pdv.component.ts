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
import { Observable, of, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';

import { RepositoryService } from '../../../database/repository.service';
import { CajaMoneda } from '../../../database/entities/financiero/caja-moneda.entity';
import { Producto } from '../../../database/entities/productos/producto.entity';
import { VentaItem } from '../../../database/entities/ventas/venta-item.entity';
import { PrecioVenta } from '../../../database/entities/productos/precio-venta.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { PdvMesa } from '../../../database/entities/ventas/pdv-mesa.entity';
import { ProductoSearchDialogComponent } from '../../../shared/components/producto-search-dialog/producto-search-dialog.component';

interface TableItem {
  id?: number;
  productoId: number;
  productoNombre: string;
  cantidad: number;
  precio: number;
  total: number;
  presentacionId?: number;
  precioVentaId?: number;
}

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
    MatDialogModule
  ]
})
export class PdvComponent implements OnInit {
  // Table data
  ventaItems: TableItem[] = [];
  displayedColumns: string[] = ['productoNombre', 'cantidad', 'precio', 'total', 'actions'];
  
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
  
  // Sector filter for tables
  selectedSectorId: number | null = null;
  
  // Pre-generated table numbers for template
  preGeneratedTableNumbers: number[] = [];
  
  // Loading states
  loadingExchangeRates = false;
  loadingConfig = false;
  
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
    private fb: FormBuilder
  ) {
    // Initialize form
    this.searchForm = this.fb.group({
      searchTerm: ['']
    });
  }

  ngOnInit(): void {
    // Pre-generate table numbers (for compatibility with existing template)
    this.preGeneratedTableNumbers = Array(30).fill(0).map((_, i) => i + 1);
    
    // Initialize demo data
    this.loadInitialData();
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
    
    // Calculate grand total in principal currency
    const totalInPrincipal = this.ventaItems.reduce((sum, item) => sum + item.total, 0);
    
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
    this.ventaItems = [
      {
        productoId: 1,
        productoNombre: 'Producto 1',
        cantidad: 2,
        precio: 10.5,
        total: 21.0
      },
      {
        productoId: 2,
        productoNombre: 'Producto 2',
        cantidad: 1,
        precio: 15.75,
        total: 15.75
      },
      {
        productoId: 3,
        productoNombre: 'Producto 3',
        cantidad: 3,
        precio: 7.25,
        total: 21.75
      }
    ];
    
    // Demo productos
    this.productos = Array(12).fill(0).map((_, i) => {
      return {
        id: i + 1,
        nombre: `Producto ${i + 1}`
      } as Producto;
    });
  }
  
  // Remove item from cart
  removeItem(item: TableItem): void {
    const index = this.ventaItems.findIndex(i => i.productoId === item.productoId);
    if (index !== -1) {
      this.ventaItems.splice(index, 1);
      this.ventaItems = [...this.ventaItems];
      // Recalculate totals after removing item
      this.calculateTotals();
    }
  }
  
  // Add product to cart
  addProduct(producto: Producto): void {
    const existingItem = this.ventaItems.find(item => item.productoId === producto.id);
    
    if (existingItem) {
      existingItem.cantidad += 1;
      existingItem.total = existingItem.cantidad * existingItem.precio;
      this.ventaItems = [...this.ventaItems];
    } else {
      this.ventaItems.push({
        productoId: producto.id!,
        productoNombre: producto.nombre!,
        cantidad: 1,
        precio: 10, // Demo price
        total: 10 // Demo total
      });
      this.ventaItems = [...this.ventaItems];
    }
    
    // Recalculate totals after adding item
    this.calculateTotals();
  }
  
  // Search products using dialog
  openProductSearchDialog(): void {
    const searchTerm = this.searchForm.get('searchTerm')?.value?.trim() || '';
    
    const dialogRef = this.dialog.open(ProductoSearchDialogComponent, {
      width: this.SEARCH_DIALOG_WIDTH,
      height: this.SEARCH_DIALOG_HEIGHT,
      data: { searchTerm }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.addProduct(result);
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
      
      switch (moneda.countryCode) {
        case 'PY':
          currencyCode = 'PY';
          denominationCode = 'PYG';
          break;
        case 'US':
          currencyCode = 'US';
          denominationCode = 'USD';
          break;
        case 'GB':
          currencyCode = 'GB';
          denominationCode = 'UE'; // Based on screenshot
          break;
        case 'BR':
          currencyCode = 'BR';
          denominationCode = 'BRL';
          break;
        default:
          currencyCode = moneda.countryCode || '';
          denominationCode = moneda.denominacion || '';
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
      let currencyCode = '';
      let denominationCode = '';
      
      switch (moneda.countryCode) {
        case 'PY':
          currencyCode = 'PY';
          denominationCode = 'PYG';
          break;
        case 'US':
          currencyCode = 'US';
          denominationCode = 'USD';
          break;
        case 'GB':
          currencyCode = 'GB';
          denominationCode = 'UE'; // Based on screenshot
          break;
        case 'BR':
          currencyCode = 'BR';
          denominationCode = 'BRL';
          break;
        default:
          currencyCode = moneda.countryCode || '';
          denominationCode = moneda.denominacion || '';
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
} 