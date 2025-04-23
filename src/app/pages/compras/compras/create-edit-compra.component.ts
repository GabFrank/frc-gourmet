import { Component, Input, OnInit, ViewChild, Inject, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormArray, Validators, ReactiveFormsModule, FormControl, AbstractControl } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { RepositoryService } from '../../../database/repository.service';
import { Compra, CompraDetalle, CompraEstado } from '../../../database/entities';
import { Proveedor } from '../../../database/entities';
import { Moneda } from '../../../database/entities';
import { Producto } from '../../../database/entities';
import { Ingrediente } from '../../../database/entities';
import { Presentacion } from '../../../database/entities';
import { MovimientoStock, TipoReferencia } from '../../../database/entities/productos/movimiento-stock.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { Observable, firstValueFrom, map, startWith, of, debounceTime, switchMap, Subject, Subscription, from } from 'rxjs';
import { UnitConversionService, UnitConversion } from '../../../services/unit-conversion.service';
import { CurrencyInputComponent } from '../../../shared/components/currency-input/currency-input.component';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { FormasPago, FormasPago as FormasPagoEntity } from '../../../database/entities/compras/forma-pago.entity';
import { TabsService } from 'src/app/services/tabs.service';
import { TipoBoleta } from 'src/app/database/entities/compras/tipo-boleta.enum';
import { CurrencyConfigService } from '../../../shared/services/currency-config.service';
import { PaymentOptionsDialogComponent, PaymentResult, PaymentOptionsData } from '../../../shared/components/payment-options-dialog/payment-options-dialog.component';
import { CreateEditPagoComponent } from '../../pagos/pagos/create-edit-pago.component';
import { PagoDialogComponent, PagoDialogData } from '../../../shared/components/pago-dialog/pago-dialog.component';

// Add interface for combined search results
interface SearchItem {
  id: number;
  nombre: string;
  tipo: 'producto' | 'ingrediente';
  original: Producto | Ingrediente;
  tipo_medida?: string; // For ingredientes
  presentaciones?: Presentacion[]; // For productos
}

@Component({
  selector: 'app-create-edit-compra',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSelectModule,
    MatTableModule,
    MatCheckboxModule,
    MatDividerModule,
    MatDialogModule,
    MatTabsModule,
    MatTooltipModule,
    MatMenuModule,
    MatAutocompleteModule,
    MatDatepickerModule,
    MatNativeDateModule,
    ConfirmationDialogComponent,
    CurrencyInputComponent,
    PaymentOptionsDialogComponent,
    PagoDialogComponent
  ],
  templateUrl: './create-edit-compra.component.html',
  styleUrls: ['./create-edit-compra.component.scss']
})
export class CreateEditCompraComponent implements OnInit {
  @Input() data: any;

  //datasource for table
  dataSource: MatTableDataSource<any> = new MatTableDataSource<any>([]);

  // Forms
  compraForm: FormGroup;
  detalleForm: FormGroup;

  // Data
  compra?: Compra;
  compraId?: number;
  isEditing = false;
  isLoading = false;
  proveedores: Proveedor[] = [];
  monedas: Moneda[] = [];
  productos: Producto[] = [];
  ingredientes: Ingrediente[] = [];
  presentaciones: Presentacion[] = [];
  formasPago: FormasPago[] = [];
  pagoEstadoLabel = 'N/A'; // Add property to hold the pago estado label

  // Filter for autocomplete
  filteredItems: Observable<SearchItem[]>;
  searchItems: SearchItem[] = [];

  // Add these properties for autocomplete
  filteredProveedores: Observable<Proveedor[]>;
  filteredMonedas: Observable<Moneda[]>;
  filteredFormasPago: Observable<FormasPago[]>;

  // Table columns
  displayedColumns: string[] = ['item', 'tipo', 'tipoMedida', 'cantidad', 'valor', 'subtotal', 'acciones'];

  // Estado options
  estadoOptions = [
    { value: CompraEstado.ABIERTO, label: 'Abierto' },
    { value: CompraEstado.ACTIVO, label: 'Activo' },
    { value: CompraEstado.FINALIZADO, label: 'Finalizado' },
    { value: CompraEstado.CANCELADO, label: 'Cancelado' }
  ];

  // TipoBoleta options
  tipoBoletaOptions = Object.values(TipoBoleta);

  // Tracking selection type (producto, ingrediente, presentacion)
  selectedDetalleType: 'producto' | 'ingrediente' | null = null;

  // New properties for form state management
  detallesActionsEnabled = true;

  // Add properties for presentacion handling
  selectedPresentacion: Presentacion | null = null;
  filteredPresentaciones: Observable<Presentacion[]>;

  // Add new properties for unit conversion
  availableConversions: UnitConversion[] = [
    { from: 'GRAMO', to: 'KILOGRAMO', factor: 0.001, displayLabel: 'kg' },
    { from: 'KILOGRAMO', to: 'GRAMO', factor: 1000, displayLabel: 'g' },
    { from: 'LITRO', to: 'MILILITRO', factor: 1000, displayLabel: 'ml' },
    { from: 'MILILITRO', to: 'LITRO', factor: 0.001, displayLabel: 'L' }
  ];
  selectedUnit: string | null = null;
  convertedValue = 0;
  baseValue = 0;
  convertedQuantity = 0;

  // Add properties for two-way binding
  isUpdatingTotal = false;
  isUpdatingValor = false;

  // Add a property to track previous state
  previousEstado: CompraEstado = CompraEstado.ABIERTO;

  // Add property for editing state
  isEditingEnabled = false;

  // Add new property to track if form should be disabled
  isFormDisabled = false;

  // Add property for tracking the form state
  isNewCompra = true;

  // Computed properties for template use
  get compatibleUnits(): string[] {
    const baseUnit = this.detalleForm.get('item')?.value?.tipo_medida;
    if (!baseUnit) return [];

    const conversions = this.availableConversions.filter(conv => conv.from === baseUnit);
    return [baseUnit, ...conversions.map(conv => conv.to)];
  }

  get canEditDetalles(): boolean {
    // When creating a new compra, always allow editing
    if (!this.isEditing) {
      return true;
    }

    // If estado is ABIERTO and editing is enabled, allow detalle editing
    const estado = this.compraForm.get('estado')?.value;
    if (estado === CompraEstado.ABIERTO) {
      if (this.isEditingEnabled) {
        return true;
      }
      // Even if not in editing mode, if actions are explicitly enabled, allow editing
      if (this.detallesActionsEnabled) {
        return true;
      }
    }
    
    // By default, don't allow editing
    return false;
  }

  get currentMoneda(): Moneda | null {
    const monedaValue = this.compraForm.get('moneda')?.value;
    // If monedaValue is an object with an id property, it's already a Moneda object
    if (monedaValue && typeof monedaValue === 'object' && 'id' in monedaValue) {
      return monedaValue as Moneda;
    }
    // Otherwise, look it up by ID
    const monedaId = typeof monedaValue === 'number' ? monedaValue :
                    (monedaValue ? Number(monedaValue) : null);
    return monedaId ? this.getMonedaById(monedaId) : null;
  }

  get isIngredienteSelected(): boolean {
    return this.detalleForm.get('item')?.value?.tipo === 'ingrediente';
  }

  get isProductoSelected(): boolean {
    return this.detalleForm.get('item')?.value?.tipo === 'producto';
  }

  get selectedItemTypoMedida(): string {
    return this.detalleForm.get('item')?.value?.tipo_medida || '';
  }

  get selectedUnitValue(): string {
    return this.detalleForm.get('selectedUnit')?.value || this.selectedItemTypoMedida;
  }

  get cantidadValue(): string | number {
    return this.detalleForm.get('cantidad')?.value || 0;
  }

  get valorValue(): string | number {
    return this.detalleForm.get('valor')?.value || 0;
  }

  get valorUnitHint(): string {
    if (this.isIngredienteSelected && this.selectedUnitValue) {
      return 'Por ' + this.selectedUnitValue.toLowerCase();
    }
    return '';
  }

  get totalHint(): string {
    if (this.isIngredienteSelected && this.selectedUnitValue) {
      return this.cantidadValue + ' × ' + this.valorValue;
    }
    return '';
  }

  get compraTotal(): number {
    return this.detalles.controls.reduce((total, control) => {
      return total + this.getSubtotal(control.value);
    }, 0);
  }

  // Computed property for estado label
  get estadoLabel(): string {
    const estado = this.compraForm.get('estado')?.value;
    const option = this.estadoOptions.find(opt => opt.value === estado);
    return option ? option.label : '';
  }

  // Get the FormArray for detalles
  get detalles(): FormArray {
    return this.compraForm.get('detalles') as FormArray;
  }

  // Get items of the appropriate type for each detalle - simplified
  getItemName(detalle: any): string {
    if (detalle.item) {
      return detalle.item.nombre;
    }
    return '';
  }

  // Get the item type for display
  getItemType(detalle: any): string {
    if (detalle.tipo === 'producto') {
      return 'Producto';
    } else if (detalle.tipo === 'ingrediente') {
      return 'Ingrediente';
    }
    return '';
  }

  // Calculate subtotal directly - no need for caching
  getSubtotal(detalle: any): number {
    return detalle.cantidad * detalle.valor;
  }

  // Recalculate the total based on detalles - simplified
  recalculateTotal(): void {
    let total = 0;

    for (let i = 0; i < this.detalles.length; i++) {
      const detalle = this.detalles.at(i).value;
      total += this.getSubtotal(detalle);
    }

    this.compraForm.get('total')?.setValue(total);
  }

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
    private unitConversionService: UnitConversionService,
    private currencyConfigService: CurrencyConfigService
  ) {
    // Initialize the main compra form with all necessary controls
    this.compraForm = this.fb.group({
      // Required fields from entity
      estado: [CompraEstado.ABIERTO], // Default to ABIERTO
      isRecepcionMercaderia: [false],
      activo: [true], // Default to true
      moneda: [null, Validators.required],

      // Optional fields from entity
      proveedor: [null, Validators.required], // Made required in UI
      formaPago: [null],
      numeroNota: [null],
      tipoBoleta: [null],
      fechaCompra: [new Date()], // Default to current date
      credito: [false],
      plazoDias: [{ value: null, disabled: true }],

      // Additional fields needed for form functionality
      detalles: this.fb.array([]), // Required for table display
      total: [0], // Required for total calculation display
      id: [null], // Required for edit mode identification
      pagoEstado: [{ value: 'N/A', disabled: true }] // Add new read-only field for Pago status
    });

    // Watch credito changes to enable/disable plazoDias
    this.compraForm.get('credito')?.valueChanges.subscribe(isCredito => {
      const plazoDiasControl = this.compraForm.get('plazoDias');
      if (isCredito) {
        plazoDiasControl?.enable();
        plazoDiasControl?.setValidators([Validators.required, Validators.min(1)]);
      } else {
        plazoDiasControl?.disable();
        plazoDiasControl?.clearValidators();
      }
      plazoDiasControl?.updateValueAndValidity();
    });

    this.detalleForm = this.fb.group({
      item: ['', Validators.required],
      cantidad: ['', [Validators.required, Validators.min(0.01)]],
      valor: ['', [Validators.required, Validators.min(0.01)]],
      valorTotal: ['', [Validators.required, Validators.min(0.01)]],
      presentacion: [''],
      tipo_medida: [''],
      selectedUnit: [''],
      // Add fields for tracking edit state
      editingId: [null],
      editingIndex: [null]
    });

    // Setup bidirectional calculation between valor (unit price) and valorTotal (final total)
    // When user types in valor field, valorTotal will be calculated automatically (valor * cantidad)
    // When user types in valorTotal field, valor will be calculated automatically (valorTotal / cantidad)
    this.detalleForm.get('valor')?.valueChanges.subscribe(value => {
      if (!this.isUpdatingValor) {
        this.updateTotal();
      }
    });

    this.detalleForm.get('valorTotal')?.valueChanges.subscribe(value => {
      if (!this.isUpdatingTotal) {
        this.updateValorFromTotal();
      }
    });

    // Also update the total when cantidad changes
    this.detalleForm.get('cantidad')?.valueChanges.subscribe(value => {
      if (!this.isUpdatingValor && !this.isUpdatingTotal) {
        this.updateTotal();
      }
    });

    // Add event listener for selectedUnit changes to handle conversions
    this.detalleForm.get('selectedUnit')?.valueChanges.subscribe(newUnit => {
      this.handleUnitChange(newUnit);
    });

    // Add event listener for item selection to set default units
    this.detalleForm.get('item')?.valueChanges.subscribe(item => {
      if (item && item.tipo_medida) {
        // When an item is selected, set both the tipo_medida and selectedUnit
        this.detalleForm.get('tipo_medida')?.setValue(item.tipo_medida);
        this.detalleForm.get('selectedUnit')?.setValue(item.tipo_medida);
      }
    });

    // Set up observables for autocomplete filtering
    this.filteredProveedores = this.compraForm.get('proveedor')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      switchMap(value => {
        try {
          return this.searchProveedoresAsync(value);
        } catch (error) {
          console.error('Error searching proveedores:', error);
          return of([]);
        }
      })
    );

    this.filteredMonedas = this.compraForm.get('moneda')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      map(value => this._filterMonedas(value))
    );

    this.filteredPresentaciones = this.detalleForm.get('presentacion')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      map(value => this._filterPresentaciones(value))
    );

    this.filteredItems = this.detalleForm.get('item')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      switchMap(value => {
        try {
          return this.searchItemsAsync(value);
        } catch (error) {
          console.error('Error in search items:', error);
          return of([]);
        }
      })
    );

    this.filteredFormasPago = this.compraForm.get('formaPago')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      map(value => this._filterFormasPago(value))
    );

    // If editing, load existing data
    if (this.isEditing) {
      this.loadCompra();
    }

    // Initialize table data source
    this.dataSource = new MatTableDataSource<any>([]);

    // Check if we're editing an existing compra
    if (this.data && this.data.compra) {
      this.isEditing = true;
      this.compra = this.data.compra;
    }
  }

  async ngOnInit(): Promise<void> {
    try {
      // Load lookup data
      await this.loadProveedores();
      await this.loadMonedas();

      try {
        await this.loadFormasPago();
      } catch (error) {
        console.warn('Failed to load formas de pago, continuing without it:', error);
        // Initialize with empty array instead of failing
        this.formasPago = [];
      }

      // Initialize searchItems as an empty array
      this.searchItems = [];

      // Check if we're editing an existing compra
      if (this.data && this.data.compraId) {
        this.compraId = this.data.compraId;
        this.isNewCompra = false;
        if (this.compraId !== undefined) {
          await this.loadCompraById(this.compraId);
        }
      } else {
        // New compra - enable form editing
        this.isNewCompra = true;
        this.isFormDisabled = false;
        this.isEditingEnabled = true;
        this.enableForm();
      }

      // Set initial state of detalle form controls based on editability
      this.updateDetalleFormState();

      // Subscribe to estado changes to update form state
      this.compraForm.get('estado')?.valueChanges.subscribe(() => {
        this.updateDetalleFormState();
      });

      // Setup the search-as-you-type functionality for items
      this.setupItemSearchObservable();

      // Subscribe to moneda changes to update currency-related values
      this.compraForm.get('moneda')?.valueChanges.subscribe(moneda => {
        // Trigger currency formatting update by updating valor and valorTotal with their current values
        const currentValor = this.detalleForm.get('valor')?.value;
        const currentTotal = this.detalleForm.get('valorTotal')?.value;

        if (currentValor) {
          setTimeout(() => {
            this.detalleForm.get('valor')?.setValue(currentValor);
          });
        }

        if (currentTotal) {
          setTimeout(() => {
            this.detalleForm.get('valorTotal')?.setValue(currentTotal);
          });
        }
      });
    } catch (error) {
      console.error('Error initializing component:', error);
      this.showError('Error al cargar los datos iniciales. Intente nuevamente más tarde.');
    }
  }

  // Setup reactive search for productos and ingredientes
  private setupItemSearchObservable(): void {
    this.filteredItems = this.detalleForm.get('item')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300), // Wait 300ms after user stops typing
      switchMap(value => {
        try {
          return this.searchItemsAsync(value);
        } catch (error) {
          console.error('Error in search items:', error);
          return of([]);
        }
      })
    );
  }

  // Search for productos and ingredientes based on input
  private async searchItemsAsync(value: string | SearchItem): Promise<SearchItem[]> {
    // If it's already a selected item, just return it in an array
    if (value && typeof value !== 'string') {
      return [value];
    }

    const searchText = typeof value === 'string' ? value : '';

    // If search text is empty or too short, return empty array
    if (!searchText || searchText.length < 2) {
      return [];
    }

    try {
      // Search for productos - using filter for simpler implementation
      // In a real application, we would use an API endpoint for server-side search
      const productoQuery = searchText.toLowerCase();
      const productos = await firstValueFrom(
        this.repositoryService.getProductos().pipe(
          map(prods => prods.filter(p =>
            p.nombre.toLowerCase().includes(productoQuery)
          ).slice(0, 10)) // Limit to 10 results
        )
      );

      // Search for ingredientes
      const ingredienteQuery = searchText.toLowerCase();
      const ingredientes = await firstValueFrom(
        this.repositoryService.getIngredientes().pipe(
          map(ings => ings.filter(i =>
            i.descripcion.toLowerCase().includes(ingredienteQuery)
          ).slice(0, 10)) // Limit to 10 results
        )
      );

      // Combine results
      const results: SearchItem[] = [
        ...productos.map(p => ({
          id: p.id,
          nombre: p.nombre,
          tipo: 'producto' as const,
          original: p
        })),
        ...ingredientes.map(i => ({
          id: i.id,
          nombre: i.descripcion,
          tipo: 'ingrediente' as const,
          original: i,
          tipo_medida: i.tipoMedida
        }))
      ];

      return results;
    } catch (error) {
      console.error('Error searching items:', error);
      return [];
    }
  }

  // Load reference data
  async loadProveedores(): Promise<void> {
    try {
      if (typeof this.repositoryService.getProveedores === 'function') {
        this.proveedores = await firstValueFrom(this.repositoryService.getProveedores());
      } else {
        console.warn('getProveedores method not available in repository service');
        this.proveedores = [];
        throw new Error('Method not implemented: getProveedores');
      }
    } catch (error: any) {
      console.error('Error loading proveedores:', error);
      // Initialize with empty array instead of failing
      this.proveedores = [];
      // Only show error message if it's not a database initialization error
      if (!error.message?.includes('Database not initialized')) {
        this.showError('Error al cargar proveedores: ' + error.message);
      }
      throw error;
    }
  }

  async loadMonedas(): Promise<void> {
    try {
      if (typeof this.repositoryService.getMonedas === 'function') {
        this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      } else {
        console.warn('getMonedas method not available in repository service');
        this.monedas = [];
        throw new Error('Method not implemented: getMonedas');
      }
    } catch (error: any) {
      console.error('Error loading monedas:', error);
      // Initialize with empty array instead of failing
      this.monedas = [];
      // Only show error message if it's not a database initialization error
      if (!error.message?.includes('Database not initialized')) {
        this.showError('Error al cargar monedas: ' + error.message);
      }
      throw error;
    }
  }

  // We no longer load all productos and ingredientes at start
  // Instead, we load them when user selects a specific item
  async loadPresentacionesForProducto(productoId: number): Promise<void> {
    try {
      this.presentaciones = await firstValueFrom(
        this.repositoryService.getPresentacionesByProducto(productoId)
      );
    } catch (error: any) {
      console.error('Error loading presentaciones:', error);
      this.showError('Error al cargar presentaciones: ' + error.message);
    }
  }

  // Load existing compra details for editing - simplified
  async loadCompraDetails(): Promise<void> {
    if (!this.compra) return;

    try {
      this.isLoading = true;

      // Store the current estado before loading new data
      if (this.compra.estado) {
        this.previousEstado = this.compra.estado;
      }

      // Determine Pago Estado Label
      this.pagoEstadoLabel = this.compra.pago ? this.compra.pago.estado : 'Pendiente';

      // Set main form values
      this.compraForm.patchValue({
        proveedor: this.compra.proveedor?.id,
        moneda: this.compra.moneda?.id,
        estado: this.compra.estado,
        isRecepcionMercaderia: this.compra.isRecepcionMercaderia,
        formaPago: this.compra.formaPago,
        plazoDias: this.compra.plazoDias,
        credito: this.compra.credito,
        numeroNota: this.compra.numeroNota,
        tipoBoleta: this.compra.tipoBoleta,
        fechaCompra: this.compra.fechaCompra,
        activo: this.compra.activo,
        pagoEstado: this.pagoEstadoLabel
      });

      // Fetch detalles from the database in one call
      const detalles = await firstValueFrom(
        this.repositoryService.getCompraDetalles(this.compra.id)
      );

      // Clear existing detalles
      this.detalles.clear();

      // Add each detalle to the form array with a simplified approach
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          // Get item details for proper unit handling
          let itemName = '';
          let itemType = '';
          let tipoMedida = detalle.tipo_medida || '';
          
          if (detalle.producto) {
            itemName = detalle.producto.nombre;
            itemType = 'producto';
          } else if (detalle.ingrediente) {
            itemName = detalle.ingrediente.descripcion;
            itemType = 'ingrediente';
            tipoMedida = detalle.tipo_medida || detalle.ingrediente.tipoMedida || 'UNIDAD';
          }

          // Create a simple form group for each detalle
          const detalleForm = this.fb.group({
            id: [detalle.id],
            cantidad: [detalle.cantidad, [Validators.required, Validators.min(0)]],
            valor: [detalle.valor, [Validators.required, Validators.min(0)]],
            tipo: [itemType],
            producto: [detalle.producto?.id || null],
            ingrediente: [detalle.ingrediente?.id || null],
            presentacion: [detalle.presentacion?.id || null],
            tipo_medida: [tipoMedida],
            selectedUnit: [tipoMedida], // Set the selected unit to the stored unit
            // Create a simple item object with just the needed properties
            item: [{
              id: detalle.producto?.id || detalle.ingrediente?.id,
              nombre: itemName,
              tipo: itemType,
              tipo_medida: tipoMedida
            }]
          });

          this.detalles.push(detalleForm);
        }
      }

      // Calculate the total
      this.recalculateTotal();

      // Disable the form when loading an existing compra
      this.isFormDisabled = true;
      this.disableForm();

      // Update form state based on editability
      this.updateDetalleFormState();

    } catch (error: any) {
      console.error('Error loading compra details:', error);
      this.showError('Error al cargar detalles de la compra: ' + error.message);
    } finally {
      this.isLoading = false;
    }
  }

  // Handle form submission
  async saveCompra(): Promise<void> {
    if (this.compraForm.invalid) {
      this.markFormGroupTouched(this.compraForm);
      this.showError('Por favor complete todos los campos requeridos.');
      return;
    }

    try {
      this.isLoading = true;

      // Prepare compra data
      const formData = this.compraForm.value;

      // Check if the compra is being canceled
      const isCanceling = this.compra?.estado !== CompraEstado.CANCELADO && 
                         formData.estado === CompraEstado.CANCELADO;

      // Create compra DTO
      const compraData: Partial<Compra> = {
        proveedor: formData.proveedor,
        moneda: formData.moneda,
        estado: formData.estado,
        formaPago: formData.formaPago,
        plazoDias: formData.formaPago?.id === 2 ? formData.plazoDias : null,
        credito: formData.formaPago?.id === 2 ? true : false,
        numeroNota: formData.numeroNota,
        tipoBoleta: formData.tipoBoleta,
        fechaCompra: formData.fechaCompra,
        isRecepcionMercaderia: formData.isRecepcionMercaderia,
        activo: formData.activo
      };

      // Prepare detalles
      const detallesData: Partial<CompraDetalle>[] = formData.detalles.map((detalle: any) => {
        return {
          cantidad: detalle.cantidad,
          valor: detalle.valor,
          activo: true,
          producto: detalle.producto || null,
          ingrediente: detalle.ingrediente || null,
          presentacion: detalle.presentacion || null
        };
      });

      // Save compra
      let savedCompra: Compra;

      if (this.isEditing && this.compra) {
        try {
          // When updating, always keep estado as ABIERTO unless explicitly set to something else
          // This ensures detalles remain editable after saving
          if (this.isEditingEnabled && compraData.estado !== CompraEstado.CANCELADO && 
              compraData.estado !== CompraEstado.FINALIZADO) {
            compraData.estado = CompraEstado.ABIERTO;
          }
          
          // Use the actual repository service to update the compra
          savedCompra = await firstValueFrom(
            this.repositoryService.updateCompra(this.compra.id, {
              ...compraData,
              detalles: detallesData as any // Cast to any to avoid TypeScript issues
            })
          );

          // Update the local compra object
          this.compra = savedCompra;

          // If the compra was canceled, invalidate stock movements
          if (isCanceling) {
            await this.invalidateStockMovements();
          }

          // After successful update:
          this.isEditingEnabled = false; // Reset editing mode
          this.isFormDisabled = true; // Disable the form
          this.disableForm(); // Apply form disable

          // Force an update cycle to make sure showFinalizarButton is recalculated
          setTimeout(() => {
            // Update the estado property to ensure getters are re-evaluated
            const currentEstado = this.compraForm.get('estado')?.value;
            if (currentEstado) {
              this.compraForm.get('estado')?.setValue(currentEstado, { emitEvent: true });
            }
          }, 0);

          this.showSuccess('Compra actualizada correctamente');
        } catch (error) {
          console.error('Error updating compra:', error);
          this.showError('Error al actualizar la compra');
          return;
        }
      } else {
        // For new compras, always set estado to ABIERTO
        compraData.estado = CompraEstado.ABIERTO;

        try {
          // Use the actual repository service to create the compra
          savedCompra = await firstValueFrom(
            this.repositoryService.createCompra({
              ...compraData,
              detalles: detallesData as any // Cast to any to avoid TypeScript issues
            })
          );

          // Update the form with the saved estado
          this.compraForm.get('estado')?.setValue(savedCompra.estado);

          // Update component state for new compra
          this.compra = savedCompra;
          this.compraId = savedCompra.id;
          this.isEditing = true;
          this.isNewCompra = false;
          this.isFormDisabled = true; // Disable the form after creating
          this.disableForm(); // Apply form disable

          // Force an update cycle to ensure button visibility is updated
          setTimeout(() => {
            // This triggers change detection to recalculate getters
            const currentEstado = this.compraForm.get('estado')?.value;
            if (currentEstado) {
              this.compraForm.get('estado')?.setValue(currentEstado, { emitEvent: true });
            }
          }, 0);

          this.showSuccess('Compra creada correctamente');
        } catch (error) {
          console.error('Error creating compra:', error);
          this.showError('Error al crear la compra');
          return;
        }
      }

      // If the compra is FINALIZADO, update stock movements
      if (formData.estado === CompraEstado.FINALIZADO) {
        await this.handleStockMovements();
      }

      // Update form state based on the new estado value
      this.updateDetalleFormState();
      
      // If the estado is ABIERTO, make sure detalle actions are enabled
      if (formData.estado === CompraEstado.ABIERTO) {
        this.detallesActionsEnabled = true;
        this.enableDetalleForm();
      }

      // Focus on the detalle form to start adding details
      this.resetAndFocusDetalleForm();

    } catch (error: any) {
      console.error('Error saving compra:', error);
      this.showError('Error al guardar la compra: ' + error.message);
    } finally {
      this.isLoading = false;
    }
  }

  // Add a new method to validate stock movements
  private async verifyStockMovements(): Promise<boolean> {
    if (!this.compra || !this.compra.id) {
      return false;
    }

    try {
      // Get all compra detalles
      const detalles = await firstValueFrom(
        this.repositoryService.getCompraDetalles(this.compra.id)
      );

      // Get all stock movements for this compra's type
      const allMovements = await firstValueFrom(
        this.repositoryService.getMovimientosStockByTipoReferencia(TipoReferencia.COMPRA)
      );

      // Check if each detalle has a corresponding stock movement
      let allValid = true;
      for (const detalle of detalles) {
        const movement = allMovements.find(m => m.referencia === detalle.id);
        
        if (!movement) {
          console.error(`No stock movement found for compra detalle ${detalle.id}`);
          allValid = false;
        } else if (movement.cantidadActual !== detalle.cantidad) {
          console.warn(`Stock movement for compra detalle ${detalle.id} has inconsistent quantity: ` +
            `movement=${movement.cantidadActual}, detalle=${detalle.cantidad}`);
        }
      }

      return allValid;
    } catch (error) {
      console.error('Error verifying stock movements:', error);
      return false;
    }
  }

  // Add a new method to handle stock movements
  async handleStockMovements(): Promise<void> {
    try {
      if (!this.compra || !this.compra.id) {
        console.error('Cannot handle stock movements: compra is not defined');
        return;
      }

      // Get all compra detalles from the database
      const detalles = await firstValueFrom(
        this.repositoryService.getCompraDetalles(this.compra.id)
      );

      if (!detalles || detalles.length === 0) {
        console.warn('No detalles found for compra', this.compra.id);
        return;
      }

      // Process each detalle
      for (const detalle of detalles) {
        // Check if there's already a stock movement for this detalle
        // Use the correct repository method 
        const existingMovements = await firstValueFrom(
          this.repositoryService.getMovimientosStockByTipoReferencia(TipoReferencia.COMPRA)
            .pipe(
              map(movements => movements.filter(movement => movement.referencia === detalle.id))
            )
        );

        if (existingMovements && existingMovements.length > 0) {
          // Update existing movement
          const movement = existingMovements[0];
          
          // Update the cantidad actual - should already be in the base unit from addDetalle
          movement.cantidadActual = detalle.cantidad;
          
          // Save the updated movement
          await firstValueFrom(
            this.repositoryService.updateMovimientoStock(movement.id, movement)
          );
        } else {
          // Create new movement
          const movimiento: Partial<MovimientoStock> = {
            tipoReferencia: TipoReferencia.COMPRA,
            referencia: detalle.id,
            cantidadActual: detalle.cantidad, // Quantity is already in base unit
            activo: true
          };

          // Set the appropriate relationship and tipoMedida based on detalle type
          if (detalle.producto) {
            movimiento.productoId = detalle.producto.id;
            movimiento.producto = detalle.producto;
            
            // Use the correct tipo_medida from the detalle
            if (!detalle.tipo_medida) {
              throw new Error('Tipo de medida no encontrado para el producto ' + detalle.producto.nombre);
            }
            movimiento.tipoMedida = detalle.tipo_medida;
          } else if (detalle.ingrediente) {
            movimiento.ingredienteId = detalle.ingrediente.id;
            movimiento.ingrediente = detalle.ingrediente;
            
            // Always use the base unit tipo_medida for the ingredient
            if (!detalle.tipo_medida) {
              throw new Error('Tipo de medida no encontrado para el ingrediente ' + detalle.ingrediente.descripcion);
            }
            movimiento.tipoMedida = detalle.tipo_medida;
          }

          // Create the movement in the database
          await firstValueFrom(
            this.repositoryService.createMovimientoStock(movimiento)
          );
        }
      }

      // Verify all stock movements were created properly
      const verified = await this.verifyStockMovements();
      if (verified) {
        console.log('Stock movements processed and verified successfully for compra', this.compra.id);
      } else {
        console.warn('Stock movements processed but verification failed for compra', this.compra.id);
      }
    } catch (error) {
      console.error('Error handling stock movements:', error);
      this.showError('Error al procesar movimientos de stock: ' + (error as Error).message);
    }
  }

  // Helper method to reset and focus the detalle form
  private resetAndFocusDetalleForm(): void {
    // Reset the form with initial values
    this.detalleForm.reset({
      item: null,
      presentacion: null,
      cantidad: 1,
      valor: '',
      valorTotal: '',
      total: 0,
      // Clear editing state
      editingId: null,
      editingIndex: null
    });

    // Focus on the first field of the detalle form
    setTimeout(() => {
      try {
        const firstInput = document.querySelector('.detalle-form-container .search-field input');
        if (firstInput instanceof HTMLElement) {
          firstInput.focus();
        }
      } catch (error) {
        console.error('Error focusing on detalle form:', error);
      }
    }, 100);
  }

  // Helper to create a detalle form group
  createDetalleFormGroup(data: any = {}) {
    return this.fb.group({
      item: [data.item || null, Validators.required],
      cantidad: [data.cantidad || null, [Validators.required, Validators.min(0)]],
      valor: [data.valor || null, [Validators.required, Validators.min(0)]],
      tipo_medida: [data.tipo_medida || null],
      unidadMedida: [data.unidadMedida || null],
      selectedUnit: new FormControl<string>(data.selectedUnit || '')
    });
  }

  // Filter functions for autocomplete
  private _filterItems(value: string | SearchItem): SearchItem[] {
    const searchTerm = typeof value === 'string' ? value.toLowerCase() : '';
    return this.searchItems.filter(item =>
      item.nombre.toLowerCase().includes(searchTerm)
    );
  }

  // Helper to get a Producto by ID
  getProductoById(id: number): Producto | null {
    return this.productos.find(p => p.id === id) || null;
  }

  // Helper to get an Ingrediente by ID
  getIngredienteById(id: number): Ingrediente | null {
    return this.ingredientes.find(i => i.id === id) || null;
  }

  // Display function for autocomplete
  displayItem = (item: SearchItem | null): string => {
    if (!item) return '';
    return `${item.nombre} (${item.tipo === 'producto' ? 'Producto' : 'Ingrediente'})`;
  }

  // Helper to show success messages
  showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  // Helper to show error messages
  showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  // Helper to mark all controls in a form group as touched
  markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  // Cancel the form and close the tab
  cancel(): void {
    this.tabsService.removeTab(this.tabsService.currentIndex);
  }

  // Used by the tab service
  setData(data: any): void {
    console.log('Setting data for Create/Edit Compra component:', data);
    this.data = data;

    if (data?.compraId) {
      this.compraId = data.compraId;
      if (this.compraId !== undefined) {
        this.loadCompraById(this.compraId);
      }
    }
  }

  // Filter methods for proveedores and monedas
  private _filterProveedores(value: string | number): Proveedor[] {
    if (typeof value === 'number') {
      // If we have an ID, find the proveedor with that ID
      return this.proveedores.filter(p => p.id === value);
    }

    // Otherwise, filter by nombre or RUC
    const filterValue = value.toString().toLowerCase();
    return this.proveedores.filter(p =>
      p.nombre.toLowerCase().includes(filterValue) ||
      (p.ruc && p.ruc.toLowerCase().includes(filterValue))
    );
  }

  private _filterMonedas(value: string | number | Moneda): Moneda[] {
    if (value && typeof value === 'object') {
      // If it's an object with an ID, return that object
      return [value];
    }

    if (typeof value === 'number') {
      // If we have an ID, find the moneda with that ID
      return this.monedas.filter(m => m.id === value);
    }

    // Otherwise, filter by denominacion or simbolo
    const filterValue = value.toString().toLowerCase();
    return this.monedas.filter(m =>
      m.denominacion.toLowerCase().includes(filterValue) ||
      m.simbolo.toLowerCase().includes(filterValue)
    );
  }

  // Display methods for autocomplete
  displayProveedor = (proveedorIdOrObject: number | Proveedor): string => {
    if (!proveedorIdOrObject) return '';

    // If it's a number ID, look up the proveedor object
    if (typeof proveedorIdOrObject === 'number') {
      const proveedor = this.getProveedorById(proveedorIdOrObject);
      return proveedor ? proveedor.nombre : '';
    }

    // If it's already a proveedor object, just use its name
    return proveedorIdOrObject.nombre || '';
  }

  displayMoneda = (monedaIdOrObject: number | Moneda): string => {
    if (!monedaIdOrObject) return '';

    // If it's a number ID, look up the moneda object
    if (typeof monedaIdOrObject === 'number') {
      const moneda = this.getMonedaById(monedaIdOrObject);
      return moneda ? `${moneda.denominacion} (${moneda.simbolo})` : '';
    }

    // If it's already a moneda object, just use it
    return monedaIdOrObject.denominacion ? `${monedaIdOrObject.denominacion} (${monedaIdOrObject.simbolo})` : '';
  }

  // Getter methods for IDs
  getProveedorById(id: number): Proveedor | null {
    return this.proveedores.find(p => p.id === id) || null;
  }

  getMonedaById(id: number): Moneda | null {
    return this.monedas.find(m => m.id === id) || null;
  }

  // Determine if detalle de compra form can be edited
  getEstadoLabel(estado: string): string {
    const option = this.estadoOptions.find(opt => opt.value === estado);
    return option ? option.label : '';
  }

  // Update the enabled/disabled state of detalle form controls
  updateDetalleFormState(): void {
    const canEdit = this.canEditDetalles;

    if (canEdit) {
      this.enableDetalleForm();
    } else {
      this.disableDetalleForm();
    }
  }

  // Enable all controls in the detalle form
  enableDetalleForm(): void {
    this.detalleForm.enable();

    // Also enable delete buttons in the detalles table by using flag
    // (we'll use this flag in the template)
    this.detallesActionsEnabled = true;
  }

  // Disable all controls in the detalle form
  disableDetalleForm(): void {
    this.detalleForm.disable();

    // Also disable delete buttons in the detalles table by using flag
    this.detallesActionsEnabled = false;
  }

  // Update search items when productos or ingredientes change
  private updateSearchItems(): void {
    this.searchItems = [
      ...this.productos.map(p => ({
        id: p.id,
        nombre: p.nombre,
        tipo: 'producto' as const,
        original: p,
        presentaciones: this.presentaciones.filter(pres => pres.productoId === p.id)
      })),
      ...this.ingredientes.map(i => ({
        id: i.id,
        nombre: i.descripcion,
        tipo: 'ingrediente' as const,
        original: i,
        tipo_medida: i.tipoMedida
      }))
    ];
  }

  // Add filter method for presentaciones
  private _filterPresentaciones(value: string | Presentacion): Presentacion[] {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';
    return this.presentaciones.filter(p =>
      p?.descripcion?.toLowerCase().includes(filterValue)
    );
  }

  // Add display method for presentaciones
  displayPresentacion = (presentacion: Presentacion | null): string => {
    if (!presentacion) return '';
    return `${presentacion.descripcion} (${presentacion.cantidad})`;
  }

  // Update the method to handle both quantity and price conversions
  private updateConvertedValues(): void {
    const selectedItem = this.detalleForm.get('item')?.value as SearchItem;
    if (!selectedItem || selectedItem.tipo !== 'ingrediente') {
      return;
    }

    const baseUnit = selectedItem.tipo_medida;
    const selectedUnit = this.detalleForm.get('selectedUnit')?.value;
    const valor = this.parseNumber(this.detalleForm.get('valor')?.value);
    const cantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value);

    if (baseUnit && selectedUnit) {
      // Convert price from selected unit to base unit
      const convertedValue = this.unitConversionService.convert(valor, selectedUnit, baseUnit);
      this.detalleForm.get('convertedValue')?.setValue(convertedValue);
      this.baseValue = convertedValue;

      // Convert quantity from selected unit to base unit
      const convertedQuantity = this.unitConversionService.convert(cantidad, selectedUnit, baseUnit);
      this.detalleForm.get('convertedQuantity')?.setValue(convertedQuantity);
      this.convertedQuantity = convertedQuantity;
    }
  }

  // Add method to calculate total
  calculateTotal(): number {
    const selectedItem = this.detalleForm.get('item')?.value as SearchItem;
    if (!selectedItem) {
      return 0;
    }

    const cantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value);
    const valor = this.parseNumber(this.detalleForm.get('valor')?.value);

    return cantidad * valor;
  }

  // Enhance parseNumber to handle currency symbols and formatting
  private parseNumber(value: any): number {
    if (typeof value === 'number') return value;
    if (!value) return 0;

    // Handle both comma and dot decimal separators
    let stringValue = value.toString();

    // Remove currency symbols and spaces - only keep digits, dots, commas, and minus sign
    stringValue = stringValue.replace(/[^0-9.,-]/g, '');

    // Replace comma with dot for decimal parsing
    const normalizedValue = stringValue.replace(',', '.');
    return parseFloat(normalizedValue) || 0;
  }

  // Update method to handle bidirectional calculation with proper precision
  private updateTotal(): void {
    // Skip if we're already updating valor
    if (this.isUpdatingValor) return;

    const cantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value);
    const valor = this.parseNumber(this.detalleForm.get('valor')?.value);

    if (cantidad > 0 && valor > 0) {
      let total;

      // Handle PYG specifically (no decimals)
      if (this.currentMoneda?.denominacion?.toUpperCase() === 'PYG' ||
          this.currentMoneda?.denominacion?.toUpperCase() === 'GUARANI') {
        // For PYG, round to whole number
        total = Math.round(cantidad * valor);
      } else {
        // For other currencies, use 2 decimal places
        total = this.roundToDecimalPlaces(cantidad * valor, 2);
      }

      // Only update if the calculated total is different enough from current total
      const currentTotal = this.parseNumber(this.detalleForm.get('valorTotal')?.value);

      // Use a larger tolerance for PYG
      const tolerance = (this.currentMoneda?.denominacion?.toUpperCase() === 'PYG' ||
                        this.currentMoneda?.denominacion?.toUpperCase() === 'GUARANI') ? 1 : 0.001;

      if (Math.abs(currentTotal - total) > tolerance) {
        this.isUpdatingTotal = true;
        this.detalleForm.get('valorTotal')?.setValue(total, { emitEvent: false });
        this.detalleForm.get('total')?.setValue(total, { emitEvent: false });
        this.isUpdatingTotal = false;
      }
    }
  }

  // Method to update valor when total changes
  updateValorFromTotal(): void {
    // Skip if we're already updating total
    if (this.isUpdatingTotal) return;

    const cantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value);
    const total = this.parseNumber(this.detalleForm.get('valorTotal')?.value);

    if (cantidad > 0 && total > 0) {
      let valor;

      // Handle PYG specifically (no decimals)
      if (this.currentMoneda?.denominacion?.toUpperCase() === 'PYG' ||
          this.currentMoneda?.denominacion?.toUpperCase() === 'GUARANI') {
        // For PYG, calculate to ensure total is preserved exactly
        valor = total / cantidad;
      } else {
        // For other currencies, use 4 decimal places for precision
        valor = this.roundToDecimalPlaces(total / cantidad, 4);
      }

      // Only update if the calculated valor is different enough from current valor
      const currentValor = this.parseNumber(this.detalleForm.get('valor')?.value);

      // Use appropriate tolerance based on currency
      const tolerance = (this.currentMoneda?.denominacion?.toUpperCase() === 'PYG' ||
                        this.currentMoneda?.denominacion?.toUpperCase() === 'GUARANI') ? 1 : 0.0001;

      if (Math.abs(currentValor - valor) > tolerance) {
        this.isUpdatingValor = true;
        this.detalleForm.get('valor')?.setValue(valor, { emitEvent: false });
        // Also update converted values
        this.updateConvertedValues();
        this.isUpdatingValor = false;
      }
    }
  }

  // Helper method to round to specific decimal places
  private roundToDecimalPlaces(value: number, decimalPlaces: number): number {
    // Special case for PYG - no decimal places
    if (this.currentMoneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.currentMoneda?.denominacion?.toUpperCase() === 'GUARANI') {
      return Math.round(value);
    }

    const factor = Math.pow(10, decimalPlaces);
    return Math.round(value * factor) / factor;
  }

  // Add getter for total form control
  get totalControl(): FormControl {
    return this.detalleForm.get('valorTotal') as FormControl;
  }

  // Add getter for selectedUnit form control
  get selectedUnitControl(): FormControl {
    return this.detalleForm.get('selectedUnit') as FormControl;
  }

  // Handle comma-to-dot conversion for decimal inputs
  onDecimalKeydown(event: KeyboardEvent): void {
    if (event.key === ',') {
      event.preventDefault();

      // Get the current input element
      const input = event.target as HTMLInputElement;
      const currentValue = input.value;
      const selectionStart = input.selectionStart || 0;

      // Insert a dot instead of comma at the cursor position
      const newValue = currentValue.substring(0, selectionStart) + '.' + currentValue.substring(selectionStart);

      // We need to update the form control directly
      const controlName = input.getAttribute('formControlName');
      if (controlName && this.detalleForm.contains(controlName)) {
        this.detalleForm.get(controlName)?.setValue(newValue);

        // Set cursor position after the dot
        setTimeout(() => {
          input.setSelectionRange(selectionStart + 1, selectionStart + 1);
        });
      }
    }
  }

  // Custom validator for cantidad to check minimum value
  validateMinimumCantidad(control: FormControl): {[key: string]: any} | null {
    const value = parseFloat(control.value?.toString().replace(',', '.'));
    if (isNaN(value) || value < 0.01) {
      return { 'min': true };
    }
    return null;
  }

  // Add a new detalle to the compra - simplified
  async addDetalle(): Promise<void> {
    if (this.detalleForm.invalid) {
      //print only the invalid field names
      const invalidFields = Object.keys(this.detalleForm.controls).filter(key => this.detalleForm.get(key)?.invalid);
      console.log('invalid fields', invalidFields);
      this.markFormGroupTouched(this.detalleForm);
      this.showError('Por favor complete todos los campos del detalle correctamente.');
      return;
    }

    try {
      // Get values from the form
      const formValues = this.detalleForm.value;
      const selectedItem = formValues.item;
      const isEditing = formValues.editingId != null;

      if (!selectedItem) {
        this.showError('Debe seleccionar un producto o ingrediente.');
        return;
      }

      // Get the base unit and selected unit
      const baseUnit = selectedItem.tipo_medida;
      const selectedUnit = formValues.selectedUnit || baseUnit;
      
      // Parse the quantity from the form
      let cantidad = this.parseNumber(formValues.cantidad);
      
      // If user selected a different unit than the base unit, convert the quantity
      if (baseUnit && selectedUnit && baseUnit !== selectedUnit) {
        try {
          console.log(`Converting ${cantidad} ${selectedUnit} to ${baseUnit}`);
          cantidad = this.unitConversionService.convert(cantidad, selectedUnit, baseUnit);
          console.log(`Converted quantity: ${cantidad} ${baseUnit}`);
        } catch (error) {
          console.error('Error converting units:', error);
          this.showError(`Error al convertir unidades: ${selectedUnit} a ${baseUnit}`);
          return;
        }
      }

      // Create detalle object based on the type (producto or ingrediente)
      const detalleData: Partial<CompraDetalle> = {
        cantidad: cantidad, // Use the converted quantity
        valor: this.parseNumber(formValues.valor),
        activo: true
      };

      // Store the original tipo_medida selected by the user for reference
      detalleData.tipo_medida = baseUnit;

      // Set the appropriate relationship based on the selectedItem type
      if (selectedItem.tipo === 'producto') {
        detalleData.producto = { id: selectedItem.id } as Producto;

        // If a presentacion was selected, add it
        if (formValues.presentacion) {
          detalleData.presentacion = { id: formValues.presentacion.id } as Presentacion;
        }
      } else if (selectedItem.tipo === 'ingrediente') {
        detalleData.ingrediente = { id: selectedItem.id } as Ingrediente;
        // Save the tipo_medida for future reference
        detalleData.tipo_medida = baseUnit;
      }

      // If we have a compra ID, associate this detalle with the compra
      if (this.compra?.id) {
        detalleData.compra = { id: this.compra.id } as Compra;

        // If editing an existing detalle, update it instead of creating a new one
        if (isEditing) {
          // Add the ID of the existing detalle
          detalleData.id = formValues.editingId;
          
          try {
            // Update the detalle in the database - using the function we know exists
            await firstValueFrom(
              this.repositoryService.updateCompra(this.compra.id, {
                detalles: [detalleData] as any
              })
            );
            
            // After updating, create a form group with the updated values
            const detalleForm = this.fb.group({
              id: [formValues.editingId],
              cantidad: [cantidad, [Validators.required, Validators.min(0)]],
              valor: [detalleData.valor, [Validators.required, Validators.min(0)]],
              tipo: [selectedItem.tipo],
              producto: [selectedItem.tipo === 'producto' ? selectedItem.id : null],
              ingrediente: [selectedItem.tipo === 'ingrediente' ? selectedItem.id : null],
              presentacion: [formValues.presentacion?.id || null],
              tipo_medida: [baseUnit],
              selectedUnit: [selectedUnit], // Store the user's selected unit
              item: [selectedItem]
            });

            // Add back to the form array
            this.detalles.insert(formValues.editingIndex, detalleForm);
            
            this.showSuccess('Detalle actualizado correctamente');
          } catch (error) {
            console.error('Error updating detalle:', error);
            this.showError('Error al actualizar detalle: ' + (error as Error).message);
            throw error;
          }
        } else {
          // Create a new detalle
          const savedDetalle = await firstValueFrom(
            this.repositoryService.createCompraDetalle(detalleData)
          );

          // Create a simplified form group with just the needed data
          const detalleForm = this.fb.group({
            id: [savedDetalle.id],
            cantidad: [savedDetalle.cantidad, [Validators.required, Validators.min(0)]],
            valor: [savedDetalle.valor, [Validators.required, Validators.min(0)]],
            tipo: [selectedItem.tipo],
            producto: [selectedItem.tipo === 'producto' ? selectedItem.id : null],
            ingrediente: [selectedItem.tipo === 'ingrediente' ? selectedItem.id : null],
            presentacion: [formValues.presentacion?.id || null],
            tipo_medida: [baseUnit],
            selectedUnit: [selectedUnit], // Store the user's selected unit
            item: [selectedItem]
          });

          // Add to the form array
          this.detalles.push(detalleForm);

          this.showSuccess('Detalle agregado correctamente');
        }
      } else {
        throw new Error('Compra no encontrada');
      }

      // Recalculate total and clear the form for new entry
      this.recalculateTotal();
      this.resetAndFocusDetalleForm();

    } catch (error: any) {
      console.error('Error adding detalle:', error);
      this.showError('Error al agregar detalle: ' + error.message);
    }
  }

  // Remove a detalle from the compra - simplified
  async removeDetalle(index: number): Promise<void> {
    // First check if detalle actions are enabled
    if (!this.detallesActionsEnabled) {
      console.log('Cannot remove detalle: detallesActionsEnabled is false');
      console.log('Current state:', {
        estado: this.compraForm.get('estado')?.value,
        isEditingEnabled: this.isEditingEnabled,
        canEditDetalles: this.canEditDetalles,
        isFormDisabled: this.isFormDisabled
      });
      return;
    }

    try {
      const detalle = this.detalles.at(index).value;

      // If the detalle has an ID, it's already saved in the database
      if (detalle.id && this.compra?.id) {
        // Show confirmation dialog
        const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
          data: {
            title: 'Eliminar detalle',
            message: '¿Está seguro que desea eliminar este detalle de la compra?',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
          }
        });

        const result = await firstValueFrom(dialogRef.afterClosed());
        if (!result) {
          return;
        }

        // Log the unit information for debugging
        console.log('Removing detalle with tipo_medida:', detalle.tipo_medida, 
                    'selectedUnit:', detalle.selectedUnit, 
                    'cantidad:', detalle.cantidad);

        // Delete from database
        await firstValueFrom(
          this.repositoryService.deleteCompraDetalle(detalle.id)
        );

        this.showSuccess('Detalle eliminado correctamente');
      }

      // Remove from form array
      this.detalles.removeAt(index);
      this.recalculateTotal();

    } catch (error: any) {
      console.error('Error removing detalle:', error);
      this.showError('Error al eliminar detalle: ' + error.message);
    }
  }

  // Add this getter to your component class
  get detallesWithComputedValues(): Array<{control: AbstractControl, computedValues: any}> {
    if (!this.detalles) {
      return [];
    }

    return this.detalles.controls.map(control => {
      const value = control.value;
      const itemName = value.item?.nombre || 'Sin nombre';
      const subtotal = value.cantidad * value.valor;

      return {
        control: control,
        computedValues: {
          itemName: itemName,
          subtotal: subtotal
        }
      };
    });
  }

  // Filter methods for formasPago
  private _filterFormasPago(value: string | FormasPago): FormasPago[] {
    if (value && typeof value !== 'string') {
      // If it's an object with an ID, return that object
      return [value];
    }

    const filterValue = typeof value === 'string' ? value.toUpperCase() : '';
    return this.formasPago.filter(formaPago =>
      formaPago.nombre.toUpperCase().includes(filterValue)
    );
  }

  // Load FormasPago
  async loadFormasPago(): Promise<void> {
    try {
      // Check if the method exists before calling it
      if (typeof this.repositoryService.getFormasPago === 'function') {
        this.formasPago = await firstValueFrom(this.repositoryService.getFormasPago());
      } else {
        console.warn('getFormasPago method not available in repository service');
        this.formasPago = [];
        throw new Error('Method not implemented: getFormasPago');
      }
    } catch (error: any) {
      console.error('Error loading formas de pago:', error);
      // Don't show the error to the user, just initialize with empty array
      this.formasPago = [];
      throw error; // Re-throw to be caught by the try/catch in ngOnInit
    }
  }

  // Helper to get FormasPago by ID
  getFormaPagoById(id: number): FormasPago | null {
    return this.formasPago.find(f => f.id === id) || null;
  }

  // Load existing compra data when editing
  loadCompra() {
    if (this.compra) {
      console.log('compra', this.compra);
      this.compraForm.patchValue({
        id: this.compra.id,
        proveedorId: this.compra.proveedor?.id,
        proveedor: this.compra.proveedor?.id,
        monedaId: this.compra.moneda?.id,
        moneda: this.compra.moneda?.id,
        fecha: this.compra.fechaCompra,
        estado: this.compra.estado,
        numeroNota: this.compra.numeroNota,
        tipoBoleta: this.compra.tipoBoleta,
        fechaCompra: this.compra.fechaCompra,
        credito: this.compra.credito,
        plazoDias: this.compra.plazoDias,
        formaPagoId: this.compra.formaPago?.id,
        formaPago: this.compra.formaPago // Set the full object, not just the ID
      });

      if (this.compra.credito) {
        this.compraForm.get('plazoDias')?.enable();
      }
    }
  }

  // Helper method to select FormaPago
  displayFormaPago = (formaPagoIdOrObject: number | FormasPago): string => {
    if (!formaPagoIdOrObject) return '';

    // If it's a number ID, look up the formaPago object
    if (typeof formaPagoIdOrObject === 'number') {
      const formaPago = this.getFormaPagoById(formaPagoIdOrObject);
      return formaPago ? formaPago.nombre : '';
    }

    // If it's already a formaPago object, just use its name
    return formaPagoIdOrObject.nombre || '';
  };

  // Now add the searchProveedoresAsync method
  private async searchProveedoresAsync(value: string | number): Promise<Proveedor[]> {
    if (value === null || value === undefined) {
      return [];
    }

    // If value is a number (ID), retrieve the single provider
    if (typeof value === 'number') {
      try {
        const proveedor = await firstValueFrom(this.repositoryService.getProveedor(value));
        return [proveedor];
      } catch (error) {
        console.error('Error fetching provider by ID:', error);
        return [];
      }
    }

    // If value is a string (search term), search providers by text
    if (typeof value === 'string' && value.trim() !== '') {
      try {
        return await firstValueFrom(this.repositoryService.searchProveedoresByText(value.trim()));
      } catch (error) {
        console.error('Error searching providers:', error);
        return [];
      }
    }

    // Empty search or empty string, return empty array
    return [];
  }

  // Update the method to finalize the compra
  async finalizeCompra(): Promise<void> {
    // Only allow finalizing if the compra is in ABIERTO or ACTIVO state
    const currentEstado = this.compraForm.get('estado')?.value;
    if (currentEstado !== CompraEstado.ABIERTO && currentEstado !== CompraEstado.ACTIVO) {
      this.showError('Solo se pueden finalizar compras en estado ABIERTO o ACTIVO.');
      return;
    }

    // Check if the compra has detalles
    if (this.detalles.length === 0) {
      this.showError('No se puede finalizar una compra sin detalles.');
      return;
    }

    // First save the compra if there are unsaved changes
    if (this.compraForm.dirty) {
      try {
        await this.saveCompra();
      } catch (error) {
        return; // Stop if saving fails
      }
    }

    // Open the payment options dialog
    const dialogData: PaymentOptionsData = {
      title: 'Finalizar Compra',
      message: '¿Desea proceder al pago ahora o registrarlo para pagar más tarde?',
      payNowText: 'Pagar Ahora',
      payLaterText: 'Pagar Después',
      cancelText: 'Cancelar',
      compraId: this.compra?.id || 0,
      total: this.compraTotal
    };

    const dialogRef = this.dialog.open(PaymentOptionsDialogComponent, {
      width: '400px',
      data: dialogData
    });

    const result = await firstValueFrom(dialogRef.afterClosed());

    // Handle dialog result
    if (result === PaymentResult.PAY_NOW) {
      // Mark the compra as FINALIZADO
      this.compraForm.get('estado')?.setValue(CompraEstado.FINALIZADO);
      await this.saveCompra();

      // Process stock movements
      await this.handleStockMovements();

      // Disable the form since the compra is now FINALIZADO
      this.disableForm();

      // Navigate to payment screen using the CreateEditPagoComponent
      if (this.compra && this.compra.id) {
      this.tabsService.openTab(
          `Pago de Compra #${this.compra.id}`,
          CreateEditPagoComponent,
          {
            compraId: this.compra.id // Pass the compraId to the payment component
          },
          `pago-compra-${this.compra.id}`,
        true
      );

      // Close this tab
      this.cancel();
      }
    } else if (result === PaymentResult.PAY_LATER) {
      // Mark the compra as FINALIZADO
      this.compraForm.get('estado')?.setValue(CompraEstado.FINALIZADO);
      await this.saveCompra();

      // Process stock movements
      await this.handleStockMovements();

      this.showSuccess('La compra ha sido finalizada y marcada como pendiente de pago.');
    } else {
      // If canceled, don't change the state
      this.showSuccess('Operación cancelada. La compra no ha sido finalizada.');
    }
  }

  // Add a method to disable the entire form except estado
  disableForm(): void {
    // Disable all form controls
    Object.keys(this.compraForm.controls).forEach(key => {
        this.compraForm.get(key)?.disable();
    });

    // Make sure detalles are also disabled
    this.detallesActionsEnabled = false;
    this.isFormDisabled = true;
  }

  // Add a method to enable the form for editing
  enableForm(): void {
    // Enable all form controls
    Object.keys(this.compraForm.controls).forEach(key => {
      this.compraForm.get(key)?.enable();
    });

    // Update form state based on the new estado value
    this.updateDetalleFormState();
    
    // If estado is ABIERTO, explicitly enable detalle form and actions
    if (this.compraForm.get('estado')?.value === CompraEstado.ABIERTO) {
      this.detallesActionsEnabled = true;
      this.enableDetalleForm();
    }
    
    this.isFormDisabled = false;
  }

  // Update modifyCompra method
  modifyCompra(): void {
    // If compra is in FINALIZADO state, show confirmation dialog
    if (this.compraForm.get('estado')?.value === CompraEstado.FINALIZADO) {
      const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
        data: {
          title: 'Modificar Compra Finalizada',
          message: 'Modificar una compra finalizada cambiará su estado y podría afectar los movimientos de stock. ¿Está seguro que desea continuar?',
          confirmText: 'Sí, Modificar',
          cancelText: 'Cancelar'
        }
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.enableCompraEditing();
        }
      });
    } else {
      // For other states, just enable editing without confirmation
      this.enableCompraEditing();
    }
  }

  // New method to enable compra editing
  private enableCompraEditing(): void {
    // Store the previous estado value before changing it
    const currentEstado = this.compraForm.get('estado')?.value;
    this.previousEstado = currentEstado;

    // Change estado to ABIERTO to allow editing detalles
    this.compraForm.get('estado')?.setValue(CompraEstado.ABIERTO, { emitEvent: true });

    // Enable editing mode
    this.isEditingEnabled = true;

    // Enable the form
    this.enableForm();
    
    // Explicitly enable detalle actions and form
    this.detallesActionsEnabled = true;
    this.enableDetalleForm();
    
    // Force update the detalle form state based on the new estado
    this.updateDetalleFormState();
    
    // Use setTimeout to force change detection cycle
    setTimeout(() => {
      console.log('Estado after enabling editing:', 
          this.compraForm.get('estado')?.value,
          'detallesActionsEnabled:', this.detallesActionsEnabled,
          'canEditDetalles:', this.canEditDetalles);
    }, 0);

    // Show feedback
    this.showSuccess('La compra puede ser modificada ahora.');
  }

  // Add getter for showing modificar button
  get showModificarButton(): boolean {
    return this.isEditing && this.isFormDisabled;
  }

  // Add new method to load compra by ID
  private async loadCompraById(id: number): Promise<void> {
    try {
      this.isLoading = true;
      // Load the compra from the repository
      this.compra = await firstValueFrom(this.repositoryService.getCompra(id));

      if (this.compra) {
        this.isEditing = true;
        this.isNewCompra = false;
        await this.loadCompraDetails();

        // Set the form state based on compra status
        this.isFormDisabled = true;
        this.isEditingEnabled = false;
        this.disableForm();
      } else {
        this.showError('No se encontró la compra especificada.');
      }
    } catch (error: any) {
      console.error('Error loading compra:', error);
      this.showError('Error al cargar la compra: ' + error.message);
    } finally {
      this.isLoading = false;
    }
  }

  // Update getter for finalizar button visibility to hide when estado is FINALIZADO
  get showFinalizarButton(): boolean {
    const estado = this.compraForm.get('estado')?.value;
    return Boolean(this.compra) &&
           !this.isEditingEnabled &&
           estado !== CompraEstado.CANCELADO &&
           estado !== CompraEstado.FINALIZADO &&
           this.detalles.length > 0;
  }

  // Add getter for pagar button visibility
  get showPagarButton(): boolean {
    const estado = this.compraForm.get('estado')?.value;
    return Boolean(this.compra) &&
           !this.isEditingEnabled &&
           estado === CompraEstado.FINALIZADO;
  }

  // Add method to handle payment navigation
  pagarCompra(): void {
    if (!this.compra || !this.compra.id) {
      this.showError('No se puede registrar un pago para esta compra.');
      return;
    }

    // Load monedas and formas de pago if not already loaded
    Promise.all([
      this.loadMonedasIfNeeded(),
      this.loadFormasPagoIfNeeded()
    ]).then(() => {
      const dialogData: PagoDialogData = {
        total: this.compraTotal,
        principalMonedaId: this.compra!.moneda!.id,
        compraIds: [this.compra!.id],
        monedas: this.monedas,
        formasPago: this.formasPago
      };

      const dialogRef = this.dialog.open(PagoDialogComponent, {
        width: '95%',
        height: '95%',
        data: dialogData,
        disableClose: true,
        panelClass: ['pago-dialog-panel', 'dark-theme'],
        autoFocus: false
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result && result.detalles && result.detalles.length > 0) {
          // Handle successful payment
          this.showSuccess('Pago registrado correctamente');

          // Refresh the compra status if needed
          this.loadCompraById(this.compra!.id);
        }
      });
    }).catch(error => {
      console.error('Error preparing payment dialog:', error);
      this.showError('Error al preparar el diálogo de pago: ' + error.message);
    });
  }

  // Helper method to get total by moneda
  private getMonedaTotal(monedaName: string): number {
    const moneda = this.monedas.find(m =>
      m.denominacion.toUpperCase() === monedaName.toUpperCase() ||
      m.simbolo.toUpperCase() === monedaName.toUpperCase()
    );

    if (!moneda) return 0;

    // For this example, we're just returning the same total for the default currency
    // In a real app, you would convert the total based on exchange rates
    if (moneda.denominacion.toUpperCase() === 'GUARANI') {
      return this.compraTotal;
    }

    // Simple exchange rate example (should be replaced with actual rates)
    if (moneda.denominacion.toUpperCase() === 'REAL') {
      return this.compraTotal / 1200; // Example exchange rate
    }

    if (moneda.denominacion.toUpperCase() === 'DOLAR') {
      return this.compraTotal / 7200; // Example exchange rate
    }

    return 0;
  }

  // Helper method to load monedas if not already loaded
  private async loadMonedasIfNeeded(): Promise<void> {
    if (this.monedas.length === 0) {
      await this.loadMonedas();
    }
  }

  // Helper method to load formas de pago if not already loaded
  private async loadFormasPagoIfNeeded(): Promise<void> {
    if (this.formasPago.length === 0) {
      await this.loadFormasPago();
    }
  }

  // Add getter for save button visibility
  get showSaveButton(): boolean {
    return !this.isFormDisabled;
  }

  // Add getter for save button text
  get saveButtonText(): string {
    return this.isEditing ? 'Actualizar' : 'Guardar';
  }

  // Add this method to invalidate stock movements when a purchase is canceled
  async invalidateStockMovements(): Promise<void> {
    try {
      if (!this.compra || !this.compra.id) {
        return;
      }

      // Get all compra detalles
      const detalles = await firstValueFrom(
        this.repositoryService.getCompraDetalles(this.compra.id)
      );

      // For each detalle, find and invalidate related stock movements
      for (const detalle of detalles) {
        // Find stock movements for this detalle
        const movements = await firstValueFrom(
          this.repositoryService.getMovimientosStockByTipoReferencia(TipoReferencia.COMPRA)
            .pipe(
              map(movements => movements.filter(m => m.referencia === detalle.id))
            )
        );

        // Update each movement to set it as inactive
        for (const movement of movements) {
          movement.activo = false;
          await firstValueFrom(
            this.repositoryService.updateMovimientoStock(movement.id, movement)
          );
        }
      }

      console.log('Stock movements invalidated for canceled compra', this.compra.id);
    } catch (error) {
      console.error('Error invalidating stock movements:', error);
      this.showError('Error al invalidar movimientos de stock: ' + (error as Error).message);
    }
  }

  // Handle unit changes and convert quantity between units
  private handleUnitChange(newUnit: string): void {
    const selectedItem = this.detalleForm.get('item')?.value as SearchItem;
    if (!selectedItem || !selectedItem.tipo_medida) {
      return; // Nothing to do if no item selected or no base unit
    }

    const baseUnit = selectedItem.tipo_medida;
    const previousUnit = this.selectedUnit || baseUnit;
    this.selectedUnit = newUnit || baseUnit;

    // Skip if no change or no cantidad
    if (previousUnit === this.selectedUnit || !this.detalleForm.get('cantidad')?.value) {
      return;
    }

    try {
      // Get current cantidad in the old unit
      const currentCantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value);
      
      // If converting from previous unit to new unit
      if (previousUnit !== baseUnit && this.selectedUnit === baseUnit) {
        // First convert from previous unit to base unit
        const cantidadInBaseUnit = this.unitConversionService.convert(currentCantidad, previousUnit, baseUnit);
        this.detalleForm.get('cantidad')?.setValue(cantidadInBaseUnit);
        
      } else if (previousUnit === baseUnit && this.selectedUnit !== baseUnit) {
        // Converting from base unit to new unit
        const cantidadInNewUnit = this.unitConversionService.convert(currentCantidad, previousUnit, this.selectedUnit);
        this.detalleForm.get('cantidad')?.setValue(cantidadInNewUnit);
        
      } else if (previousUnit !== baseUnit && this.selectedUnit !== baseUnit) {
        // Converting between two non-base units (e.g., kg to lb)
        // First convert to base unit, then to the new unit
        const cantidadInBaseUnit = this.unitConversionService.convert(currentCantidad, previousUnit, baseUnit);
        const cantidadInNewUnit = this.unitConversionService.convert(cantidadInBaseUnit, baseUnit, this.selectedUnit);
        this.detalleForm.get('cantidad')?.setValue(cantidadInNewUnit);
      }
      
      // Update calculated values
      this.updateTotal();
      
    } catch (error) {
      console.error('Error converting between units:', error);
      this.showError(`Error al convertir entre unidades: ${previousUnit} a ${this.selectedUnit}`);
      
      // Revert to previous unit on error
      this.detalleForm.get('selectedUnit')?.setValue(previousUnit, { emitEvent: false });
    }
  }

  // Add a new getter to display conversion information
  get conversionInfo(): string {
    const selectedItem = this.detalleForm.get('item')?.value as SearchItem;
    if (!selectedItem || !selectedItem.tipo_medida) {
      return '';
    }
    
    const baseUnit = selectedItem.tipo_medida;
    const selectedUnit = this.detalleForm.get('selectedUnit')?.value || baseUnit;
    
    // Only show conversion info if units are different
    if (baseUnit === selectedUnit) {
      return '';
    }
    
    // Get the current cantidad
    const cantidad = this.parseNumber(this.detalleForm.get('cantidad')?.value || 0);
    if (cantidad <= 0) {
      return '';
    }
    
    try {
      // Convert to base unit for display
      const cantidadBase = this.unitConversionService.convert(cantidad, selectedUnit, baseUnit);
      
      // Format the output with 4 decimal places
      return `${cantidad.toFixed(4)} ${selectedUnit} = ${cantidadBase.toFixed(4)} ${baseUnit}`;
    } catch (error) {
      return `Conversión no disponible`;
    }
  }

  // Edit a detalle in the compra
  editDetalle(index: number): void {
    // First check if detalle actions are enabled
    if (!this.detallesActionsEnabled) {
      console.log('Cannot edit detalle: detallesActionsEnabled is false');
      console.log('Current state:', {
        estado: this.compraForm.get('estado')?.value,
        isEditingEnabled: this.isEditingEnabled,
        canEditDetalles: this.canEditDetalles,
        isFormDisabled: this.isFormDisabled
      });
      return;
    }

    try {
      const detalle = this.detalles.at(index).value;
      
      // Flag to indicate we're editing (we'll use this when adding the detalle back)
      const editingIndex = index;
      
      // Get the original item for reference
      const itemData = detalle.item;
      
      // Load item details for proper unit display
      const selectedUnit = detalle.selectedUnit || detalle.tipo_medida;
      
      // Populate the detalle form with the existing values
      this.detalleForm.patchValue({
        item: itemData,
        cantidad: detalle.cantidad,
        valor: detalle.valor,
        valorTotal: detalle.cantidad * detalle.valor,
        tipo_medida: detalle.tipo_medida,
        selectedUnit: selectedUnit,
        presentacion: detalle.presentacion
      });
      
      // Remove the detalle from the array (we'll add it back when saved)
      this.detalles.removeAt(index);
      
      // Store the index and ID for later reference when saving
      this.detalleForm.patchValue({
        editingIndex: editingIndex,
        editingId: detalle.id
      });
      
      // Focus on the cantidad field
      setTimeout(() => {
        try {
          const cantidadInput = document.querySelector('.detalle-form-container [formcontrolname="cantidad"]');
          if (cantidadInput instanceof HTMLElement) {
            cantidadInput.focus();
          }
        } catch (error) {
          console.error('Error focusing on cantidad field:', error);
        }
      }, 100);
      
    } catch (error: any) {
      console.error('Error editing detalle:', error);
      this.showError('Error al editar detalle: ' + error.message);
    }
  }
}
