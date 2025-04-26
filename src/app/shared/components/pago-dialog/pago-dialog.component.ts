import { Component, Inject, OnInit, AfterViewInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';

// Import the models
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';
import { PagoDetalle, TipoDetalle } from '../../../database/entities/compras/pago-detalle.entity';
import { RepositoryService } from '../../../database/repository.service';
import { firstValueFrom } from 'rxjs';
import { CajaMoneda } from '../../../database/entities/financiero/caja-moneda.entity';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { CurrencyInputComponent } from '../currency-input/currency-input.component';
import { Pago } from '../../../database/entities/compras/pago.entity';
import { PagoEstado } from '../../../database/entities/compras/estado.enum';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogConfig } from '@angular/material/dialog';
import { AjusteDialogComponent } from './ajuste-dialog.component';
import { ListCajaDialogComponent } from '../../../pages/financiero/cajas/list-caja-dialog/list-caja-dialog.component';
import { Caja, CajaEstado } from '../../../database/entities/financiero/caja.entity';

export interface PagoDialogData {
  // Principal currency total
  total: number;
  // Principal currency ID
  principalMonedaId: number;
  compraIds: number[];
  monedas: Moneda[];
  formasPago: FormasPago[];
  pagoId?: number; // Optional pago ID if we're editing an existing pago
}

interface MonedaWithTotal {
  moneda: Moneda;
  total: number;
}

@Component({
  selector: 'app-pago-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatCheckboxModule,
    CurrencyInputComponent,
    MatMenuModule,
    MatTooltipModule,
    AjusteDialogComponent,
    ListCajaDialogComponent
  ],
  templateUrl: './pago-dialog.component.html',
  styleUrls: ['./pago-dialog.component.scss']
})
export class PagoDialogComponent implements OnInit, AfterViewInit, AfterViewChecked {
  detalleForm!: FormGroup;
  detalles: PagoDetalle[] = [];

  // Display columns for the table
  displayedColumns: string[] = ['#', 'moneda', 'formaPago', 'valor', 'tipo', 'menu'];

  // Principal currency
  principalMoneda: Moneda | null = null;

  // Monedas with calculated totals
  monedasWithTotals: MonedaWithTotal[] = [];

  // Tracking values for balances
  saldos: Map<number, number> = new Map<number, number>();

  // Selected options
  selectedMoneda: Moneda | null = null;
  selectedFormaPago: FormasPago | null = null;

  // Filtered and sorted currencies (Moved declaration here)
  filteredMonedas: Moneda[] = [];

  // State tracking
  isOffline = false;
  loadingConfig = false;
  loadingExchangeRates = false;
  isSaving = false;
  isFinalizado = false; // New state for finalized payment

  // Exchange rates for conversions
  exchangeRates: MonedaCambio[] = [];

  // Add new properties for tracking the created pago
  pagoCreated: Pago | null = null;

  // Add a new property to track if we should load existing payment details
  existingPagoId: number | null = null;

  // Add a new property to track the ID of the detail being edited
  editingDetalleId: number | null = null;

  // Payment type hint
  paymentTypeHint = 'Pago';

  // Add current detail type tracking
  currentDetalleType: TipoDetalle = TipoDetalle.PAGO;

  @ViewChild('valorInput') valorInput!: CurrencyInputComponent;
  private focusSet = false;

  // Add property to store selected caja
  selectedCaja: Caja | null = null;

  constructor(
    public dialogRef: MatDialogRef<PagoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PagoDialogData,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    // Set the dialog to resize correctly
    this.dialogRef.updateSize('95%', 'auto');
    this.dialogRef.addPanelClass('pago-dialog-panel');

    // Remove any height constraints
    const dialogContainerElement = document.querySelector('.pago-dialog-panel .mat-mdc-dialog-container') as HTMLElement;
    if (dialogContainerElement) {
      dialogContainerElement.style.maxHeight = 'none';
    }

    // Check if device is online
    this.isOffline = !navigator.onLine;

    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOffline = false;
    });

    window.addEventListener('offline', () => {
      this.isOffline = true;
    });

    // Initialize filtered monedas with the provided ones
    this.filteredMonedas = [...this.data.monedas];

    // Find principal moneda
    this.principalMoneda = this.data.monedas.find(m => m.id === this.data.principalMonedaId) || null;

    // Initialize saldos with principal moneda total
    if (this.principalMoneda) {
      this.saldos.set(this.principalMoneda.id!, this.data.total);
    }

    // Set initial default values for selections
    if (this.filteredMonedas.length > 0) {
      this.selectedMoneda = this.filteredMonedas[0];
    }

    if (this.data.formasPago.length > 0) {
      this.selectedFormaPago = this.data.formasPago[0];
    }
  }

  onMonedaSelect(moneda: Moneda): void {
    if (moneda) {
      this.selectedMoneda = moneda;
      this.detalleForm.patchValue({
        moneda: moneda
      });

      // Update the valor field with the current saldo, whether positive or negative
      const currentSaldo = this.saldos.get(moneda.id!);
      if (currentSaldo !== undefined && currentSaldo !== null) {
        this.detalleForm.get('valor')?.setValue(currentSaldo);
        // Update payment type hint based on the saldo value
        this.paymentTypeHint = currentSaldo >= 0 ? 'Pago' : 'Vuelto';
        this.focusValorInput();
      }
    }
  }

  onFormaPagoSelect(formaPago: FormasPago): void {
    this.selectedFormaPago = formaPago;
    // Update the form value
    this.detalleForm.get('formaPago')?.setValue(formaPago);
  }

  // Listen for form changes to update button selections
  setupFormListeners(): void {
    // Listen for changes in the moneda form control
    this.detalleForm.get('moneda')?.valueChanges.subscribe(value => {
      if (value) {
        this.selectedMoneda = value;

        // When currency changes, update the valor field with the current saldo
        if (value.id) {
          const saldo = this.saldos.get(value.id);
          if (saldo && saldo > 0) {
            this.detalleForm.get('valor')?.setValue(saldo);
          }
        }
      }
    });

    // Listen for changes in the formaPago form control
    this.detalleForm.get('formaPago')?.valueChanges.subscribe(value => {
      if (value) {
        this.selectedFormaPago = value;
      }
    });
  }

  ngOnInit(): void {
    // Initialize form first with initial selected values
    this.initForm();

    // Setup form listeners for bidirectional binding with buttons
    this.setupFormListeners();

    // Check if we have a direct pagoId in the data
    if (this.data.pagoId) {
      console.log(`Direct pagoId provided: ${this.data.pagoId}`);
      this.existingPagoId = this.data.pagoId;
      this.loadPagoById(this.data.pagoId);
    } else {
      // Check if we need to load existing payment details from compraIds
      this.checkForExistingPayments();
    }

    // Then load and filter monedas
    this.loadAndFilterMonedas().then(() => {
      // After loading is complete, update the form values
      this.updateFormInitialValues();
    });
  }

  /**
   * Check if there are existing payments for the provided compraIds
   * and load them if found
   */
  async checkForExistingPayments(): Promise<void> {
    if (!this.data.compraIds || this.data.compraIds.length === 0) {
      return;
    }

    try {
      // For each compraId, check if it has an associated pago
      for (const compraId of this.data.compraIds) {
        const compra = await firstValueFrom(this.repositoryService.getCompra(compraId));

        if (compra && compra.pago && compra.pago.id) {
          this.existingPagoId = compra.pago.id;
          this.pagoCreated = compra.pago;
          this.isFinalizado = this.pagoCreated.estado === PagoEstado.PAGADO;
          this.updateFormState(); // Update form state based on finalized status
          await this.loadPagoDetalles(compra.pago.id);
          break; // We only need to find one pago
        } else {
          console.log(`No existing pago found for compra ${compraId}`);
        }
      }
    } catch (error) {
      console.error('Error checking for existing payments:', error);
      this.snackBar.open('Error al verificar pagos existentes', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Load existing payment details for a pago
   */
  async loadPagoDetalles(pagoId: number): Promise<void> {
    try {

      // First, try to get the full pago with its details
      const pago = await firstValueFrom(this.repositoryService.getPago(pagoId));

      // Then get the details specifically
      const detalles = await firstValueFrom(this.repositoryService.getPagoDetalles(pagoId));

      if (detalles && detalles.length > 0) {
        this.detalles = detalles;

        // Wait for exchange rates to be loaded before updating saldos
        if (this.exchangeRates.length > 0) {
          this.updateSaldos();
        } else {
          // If exchange rates aren't loaded yet, we'll update saldos after they're loaded
          console.log('Exchange rates not loaded yet, will update saldos later');
        }
      } else {
        console.log('No payment details found');
      }
    } catch (error) {
      console.error('Error loading payment details:', error);
      this.snackBar.open('Error al cargar los detalles de pago', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Load caja-monedas configuration and filter/sort currencies
   */
  async loadAndFilterMonedas(): Promise<void> {
    this.loadingConfig = true;

    try {
      // Get caja-monedas configuration
      const cajasMonedas = await firstValueFrom(this.repositoryService.getCajasMonedas());

      // Create a map for quick lookup
      const configMap = new Map<number, CajaMoneda>();
      cajasMonedas.forEach(cm => {
        if (cm.moneda && cm.moneda.id) {
          configMap.set(cm.moneda.id, cm);
        }
      });

      // Filter monedas based on active status in caja-moneda config
      this.filteredMonedas = this.data.monedas.filter(moneda => {
        const config = configMap.get(moneda.id!);
        return config ? config.activo : false;
      });

      // Sort monedas based on orden in caja-moneda config
      this.filteredMonedas.sort((a, b) => {
        const configA = configMap.get(a.id!);
        const configB = configMap.get(b.id!);

        const orderA = configA && configA.orden ? parseInt(configA.orden) : 999;
        const orderB = configB && configB.orden ? parseInt(configB.orden) : 999;

        return orderA - orderB;
      });

      // Select default moneda if available
      const defaultMoneda = this.filteredMonedas.find(moneda => {
        const config = configMap.get(moneda.id!);
        return config ? config.predeterminado : false;
      });

      if (defaultMoneda) {
        this.selectedMoneda = defaultMoneda;
      } else if (this.filteredMonedas.length > 0) {
        // Select first moneda if no default is set
        this.selectedMoneda = this.filteredMonedas[0];
      }

      // Also select the first forma pago as default
      if (this.data.formasPago.length > 0) {
        this.selectedFormaPago = this.data.formasPago[0];
      }

      // Update form with selected values
      this.updateFormInitialValues();

      // Ensure flags are available offline
      this.ensureFlagsAvailableOffline();

      // Fetch exchange rates and calculate totals
      await this.loadExchangeRatesAndCalculateTotals();

    } catch (error) {
      console.error('Error loading caja-monedas configuration:', error);
      this.snackBar.open('Error al cargar la configuración de monedas', 'Cerrar', { duration: 3000 });

      // If error, use all monedas as fallback
      this.filteredMonedas = [...this.data.monedas];
      this.ensureFlagsAvailableOffline();

      // Still try to load exchange rates
      await this.loadExchangeRatesAndCalculateTotals();
    } finally {
      this.loadingConfig = false;
    }
  }

  /**
   * Update form with the selected default values
   */
  updateFormInitialValues(): void {
    if (this.detalleForm) {
      this.detalleForm.patchValue({
        moneda: this.selectedMoneda,
        formaPago: this.selectedFormaPago
      });
      
      // Also set the valor field based on the current saldo
      if (this.selectedMoneda?.id) {
        const currentSaldo = this.saldos.get(this.selectedMoneda.id);
        if (currentSaldo !== undefined && currentSaldo !== null) {
          this.detalleForm.get('valor')?.setValue(currentSaldo);
          // Update payment type hint based on the saldo value
          this.paymentTypeHint = currentSaldo >= 0 ? 'Pago' : 'Vuelto';
        }
      }
    }
  }

  /**
   * Load exchange rates and calculate totals for each currency
   */
  async loadExchangeRatesAndCalculateTotals(): Promise<void> {
    if (!this.principalMoneda) {
      console.error('No principal currency defined');
      this.snackBar.open('No se ha definido una moneda principal', 'Cerrar', { duration: 3000 });
      return;
    }

    this.loadingExchangeRates = true;

    try {
      // Get all active exchange rates
      this.exchangeRates = await firstValueFrom(this.repositoryService.getMonedasCambio());

      // Filter for active exchange rates
      this.exchangeRates = this.exchangeRates.filter(rate => rate.activo);

      // For each currency, calculate the total based on exchange rates
      this.calculateCurrencyTotals();

      // If we have loaded payment details, update saldos now that exchange rates are loaded
      if (this.detalles.length > 0) {
        this.updateSaldos();
      }

    } catch (error) {
      console.error('Error loading exchange rates:', error);
      this.snackBar.open('Error al cargar los tipos de cambio', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingExchangeRates = false;
    }
  }

  /**
   * Calculate currency totals based on exchange rates from the principal currency
   */
  calculateCurrencyTotals(): void {
    if (!this.principalMoneda) return;


    // Clear previous calculations
    this.monedasWithTotals = [];

    // Add principal currency with its total
    this.monedasWithTotals.push({
      moneda: this.principalMoneda,
      total: this.data.total
    });

    // For each filtered currency that is not the principal, calculate its total
    this.filteredMonedas.forEach(moneda => {
      if (moneda.id === this.principalMoneda?.id) return; // Skip principal

      // Find exchange rate from principal to this currency
      const exchangeRate = this.exchangeRates.find(rate =>
        rate.monedaOrigen.id === this.principalMoneda?.id &&
        rate.monedaDestino.id === moneda.id
      );

      if (exchangeRate) {
        // Use compraLocal rate to convert from principal to this currency, it must be a division
        const total = this.data.total / exchangeRate.compraLocal;

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

  /**
   * Make sure flags are available offline by preferring base64 data
   * when device is offline
   */
  ensureFlagsAvailableOffline(): void {
    if (this.isOffline) {
      // When offline, ensure we're using base64 data if available
      this.filteredMonedas.forEach(moneda => {
        if (!moneda.flagIconBase64 && !moneda.flagIcon && moneda.countryCode) {
          console.warn(`No offline flag available for ${moneda.denominacion} (${moneda.countryCode})`);
        }
      });
    }
  }

  initForm(): void {
    this.detalleForm = this.fb.group({
      moneda: [this.selectedMoneda, Validators.required],
      formaPago: [this.selectedFormaPago, Validators.required],
      valor: [null, [Validators.required, this.nonZeroValidator]],
      mostrarDescripcion: [false],
      descripcion: ['']
    });

    // Add conditional validation for descripcion based on mostrarDescripcion checkbox
    this.detalleForm.get('mostrarDescripcion')?.valueChanges.subscribe(showDesc => {
      const descControl = this.detalleForm.get('descripcion');
      if (showDesc) {
        descControl?.setValidators([Validators.required]);
      } else {
        descControl?.clearValidators();
      }
      descControl?.updateValueAndValidity();
    });

    // Update payment type hint when valor changes
    this.detalleForm.get('valor')?.valueChanges.subscribe(value => {
      if (value !== null && value !== undefined) {
        this.paymentTypeHint = value >= 0 ? 'Pago' : 'Vuelto';
      }
    });
  }

  /**
   * Custom validator to ensure the value is not zero (can be positive or negative)
   */
  nonZeroValidator(control: FormControl): {[key: string]: any} | null {
    const value = control.value;
    if (value === null || value === undefined) return null;
    
    // Using a small epsilon to avoid floating-point precision issues
    const epsilon = 0.000001;
    return Math.abs(value) > epsilon ? null : { 'nonZero': { value } };
  }

  /**
   * Get the total for a specific currency
   */
  getCurrencyTotal(moneda: Moneda): number {
    const monedaWithTotal = this.monedasWithTotals.find(m => m.moneda.id === moneda.id);
    return monedaWithTotal ? monedaWithTotal.total : 0;
  }

  /**
   * Get the balance for a specific currency
   */
  getCurrencyBalance(moneda: Moneda): number {
    return this.saldos.get(moneda.id!) || 0;
  }

  /**
   * Returns a Map of currency totals by currency id for use in the template
   */
  get currencyTotals(): Map<number, number> {
    const totalsMap = new Map<number, number>();
    this.monedasWithTotals.forEach(mwt => {
      totalsMap.set(mwt.moneda.id!, mwt.total);
    });
    return totalsMap;
  }

  /**
   * Returns the currency balances map for use in the template
   */
  get currencyBalances(): Map<number, number> {
    return this.saldos;
  }

  /**
   * Update balances after adding/removing payment details
   */
  updateSaldos(): void {
    if (!this.principalMoneda || !this.principalMoneda.id) {
      console.error('No principal currency defined for balance calculation');
      return;
    }

    // Calculate net payments/discounts and total increases separately
    let netPaymentsAndDiscountsInPrincipal = 0;
    let totalAumentosInPrincipal = 0;

    // For each payment detail, convert to principal currency and add to the correct total
    this.detalles.forEach(detalle => {
      if (!detalle.moneda || !detalle.moneda.id || detalle.valor === undefined) return;

      let valueInPrincipal: number;

      // Convert detail value to principal currency
      if (detalle.moneda.id === this.principalMoneda!.id) {
        valueInPrincipal = detalle.valor;
      } else {
        const exchangeRate = this.exchangeRates.find(rate =>
          rate.monedaDestino.id === detalle.moneda.id &&
          rate.monedaOrigen.id === this.principalMoneda!.id
        );

        if (exchangeRate) {
          valueInPrincipal = detalle.valor * exchangeRate.compraLocal;
        } else {
          this.snackBar.open('No se encontró el tipo de cambio para la moneda ' + detalle.moneda.denominacion, 'Cerrar', { duration: 3000 });
          return; // Skip this detail if conversion fails
        }
      }

      // Add to the appropriate total based on TipoDetalle
      switch (detalle.tipo) {
        case TipoDetalle.PAGO:
        case TipoDetalle.DESCUENTO:
          netPaymentsAndDiscountsInPrincipal += valueInPrincipal; // Pago/Descuento contribute positively
          break;
        case TipoDetalle.VUELTO:
          netPaymentsAndDiscountsInPrincipal += valueInPrincipal; // Vuelto is stored negative, so adding it subtracts
          break;
        case TipoDetalle.AUMENTO:
          totalAumentosInPrincipal += valueInPrincipal; // Aumento increases the target
          break;
        default:
          // Handle potential unknown types or fallback (e.g., treat as PAGO if value is positive)
          if (valueInPrincipal >= 0) {
            netPaymentsAndDiscountsInPrincipal += valueInPrincipal;
          } else {
            netPaymentsAndDiscountsInPrincipal += valueInPrincipal; // Treat negative unknown as Vuelto
          }
          break;
      }
    });

    // Calculate the effective total to be covered
    const effectiveTotalInPrincipal = this.data.total + totalAumentosInPrincipal;

    // Calculate remaining balance in principal currency
    const remainingInPrincipal = effectiveTotalInPrincipal - netPaymentsAndDiscountsInPrincipal;
    console.log(`Original Total: ${this.data.total}, Aumentos: ${totalAumentosInPrincipal}, Paid/Discount/Vuelto: ${netPaymentsAndDiscountsInPrincipal}`);
    console.log(`Effective Total: ${effectiveTotalInPrincipal}, Remaining in principal currency: ${remainingInPrincipal} ${this.principalMoneda.denominacion}`);

    // Update saldo for principal currency
    this.saldos.set(this.principalMoneda.id, remainingInPrincipal);

    // Now update saldos for all other currencies based on the remaining principal amount
    this.filteredMonedas.forEach(moneda => {
      if (moneda.id === this.principalMoneda!.id) return; // Skip principal, already updated

      // Find exchange rate from principal to this currency
      const exchangeRate = this.exchangeRates.find(rate =>
        rate.monedaOrigen.id === this.principalMoneda!.id &&
        rate.monedaDestino.id === moneda.id
      );

      if (exchangeRate) {
        // Convert remaining principal amount to this currency
        const remainingInCurrency = remainingInPrincipal / exchangeRate.compraLocal;
        this.saldos.set(moneda.id!, remainingInCurrency);
      } else {
        // Try reverse rate
        const reverseRate = this.exchangeRates.find(rate =>
          rate.monedaOrigen.id === moneda.id &&
          rate.monedaDestino.id === this.principalMoneda!.id
        );

        if (reverseRate) {
          // Convert using reverse rate
          const remainingInCurrency = remainingInPrincipal * reverseRate.compraLocal;
          this.saldos.set(moneda.id!, remainingInCurrency);
        } else {
          console.warn(`No exchange rate found from ${this.principalMoneda!.denominacion} to ${moneda.denominacion}`);
          this.saldos.set(moneda.id!, 0);
        }
      }
    });

    console.log('Updated saldos:', Object.fromEntries(this.saldos));

    // Update the valor input with the current saldo if we have a selected currency
    if (this.selectedMoneda?.id) {
      const currentSaldo = this.saldos.get(this.selectedMoneda.id);
      if (currentSaldo !== undefined && currentSaldo !== null) {
        // Use setTimeout to ensure this runs after Angular's change detection
        setTimeout(() => {
          this.detalleForm.get('valor')?.setValue(currentSaldo);
          // Update the payment type hint based on the saldo value
          this.paymentTypeHint = currentSaldo >= 0 ? 'Pago' : 'Vuelto';
          this.focusValorInput();
        }, 0);
      }
    }
  }

  /**
   * Handle keydown events in the form
   * @param event Keyboard event
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addDetalle();
    }
  }

  /**
   * Create a new Pago if one doesn't exist yet
   */
  async createPagoIfNeeded(): Promise<Pago> {
    if (this.pagoCreated) {
      return this.pagoCreated;
    }

    // Check if we have a selected caja before creating a pago
    if (!this.selectedCaja) {
      await this.selectCaja();
    }

    this.isSaving = true;
    try {
      // Create a new Pago
      const pagoData: Partial<Pago> = {
        estado: PagoEstado.ABIERTO,
        activo: true,
        // Associate with selected caja if available
        ...(this.selectedCaja ? { caja: this.selectedCaja } : {})
      };

      const pago = await firstValueFrom(this.repositoryService.createPago(pagoData));

      // If we have compraIds, associate them with this pago
      if (this.data.compraIds && this.data.compraIds.length > 0) {
        for (const compraId of this.data.compraIds) {
          await firstValueFrom(this.repositoryService.updateCompra(compraId, { pago }));
        }
      }

      this.pagoCreated = pago;
      return pago;
    } catch (error) {
      console.error('Error creating pago:', error);
      this.snackBar.open('Error al crear el pago', 'Cerrar', { duration: 3000 });
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Select a caja for the pago
   * Opens a dialog to select an existing caja
   * @returns A promise that resolves when a caja is selected
   */
  async selectCaja(): Promise<void> {
    try {
      // Open the list caja dialog directly
      const dialogRef = this.dialog.open(ListCajaDialogComponent, {
        width: '800px',
        disableClose: true
      });
      
      const result = await firstValueFrom(dialogRef.afterClosed());
      
      if (!result || result.action === 'cancel') {
        this.snackBar.open('No se seleccionó ninguna caja', 'Cerrar', { duration: 3000 });
        throw new Error('Caja selection cancelled');
      }
      
      if (result.action === 'select' && result.caja) {
        // User selected an existing caja
        this.selectedCaja = result.caja;
      } else if (result.action === 'create' && result.dispositivoId) {
        // User wants to create a new caja
        try {
          // Call the service or API to create a new caja
          // This implementation will depend on your API/service design
          // For example:
          const dispositivoId = result.dispositivoId;
          const newCaja = await firstValueFrom(this.repositoryService.createCaja({ 
            dispositivo: { id: dispositivoId },
            fechaApertura: new Date(),
            estado: CajaEstado.ABIERTO,
            activo: true
          }));
          
          if (newCaja) {
            this.selectedCaja = newCaja;
            this.snackBar.open('Caja creada correctamente', 'Cerrar', { duration: 3000 });
          } else {
            throw new Error('Failed to create caja');
          }
        } catch (error) {
          console.error('Error creating caja:', error);
          this.snackBar.open('Error al crear la caja', 'Cerrar', { duration: 3000 });
          throw error;
        }
      }
    } catch (error) {
      console.error('Error selecting caja:', error);
      this.snackBar.open('Error al seleccionar la caja', 'Cerrar', { duration: 3000 });
      throw error;
    }
  }

  /**
   * Save a payment detail to the database
   */
  async savePagoDetalle(detalle: PagoDetalle): Promise<PagoDetalle> {
    try {
      // Ensure we have a pago
      const pago = await this.createPagoIfNeeded();

      // Create the detalle with the pago reference
      const detalleData: Partial<PagoDetalle> = {
        valor: detalle.valor,
        descripcion: detalle.descripcion || '',
        moneda: detalle.moneda,
        formaPago: detalle.formaPago,
        pago: pago,
        activo: true,
        tipo: detalle.tipo || TipoDetalle.PAGO
      };

      // Log the data being sent to the database

      const savedDetalle = await firstValueFrom(this.repositoryService.createPagoDetalle(detalleData));

      return savedDetalle;
    } catch (error) {
      console.error('Error saving pago detalle:', error);
      this.snackBar.open('Error al guardar el detalle de pago', 'Cerrar', { duration: 3000 });
      throw error;
    }
  }

  /**
   * Creates a new payment detail or updates an existing one
   */
  async addDetalle(event?: Event): Promise<void> {
    // Prevent default form submission if event is provided
    if (event) {
      event.preventDefault();
    }

    if (this.detalleForm.valid) {
      const formValues = this.detalleForm.value;

      this.isSaving = true;
      try {
        // If we're editing an existing detail, mark it as inactive first
        if (this.editingDetalleId) {
          await firstValueFrom(this.repositoryService.updatePagoDetalle(this.editingDetalleId, { activo: false }));
        }

        // Determine the type based on the value
        const detalleTipo = formValues.valor >= 0 ? TipoDetalle.PAGO : TipoDetalle.VUELTO;
        
        // Create a new payment detail
        const detalle: Partial<PagoDetalle> = {
          valor: formValues.valor,
          descripcion: formValues.mostrarDescripcion ? formValues.descripcion : '',
          moneda: formValues.moneda,
          formaPago: formValues.formaPago,
          tipo: detalleTipo
        };

        // Save to database
        const savedDetalle = await this.savePagoDetalle(detalle as PagoDetalle);

        // Add to local array with the ID from the database
        this.detalles = [...this.detalles, savedDetalle];

        // Update balances
        this.updateSaldos();

        // Update selected values from form
        this.selectedMoneda = formValues.moneda;
        this.selectedFormaPago = formValues.formaPago;

        // Reset editing state
        this.editingDetalleId = null;

        // Reset only valor and descripcion, keep selected moneda and formaPago
        this.detalleForm.patchValue({
          valor: null,
          descripcion: '',
          mostrarDescripcion: false
        });

        // Update the valor with current saldo after reset
        if (this.selectedMoneda?.id) {
          const saldo = this.saldos.get(this.selectedMoneda.id);
          if (saldo !== undefined && saldo !== null) {
            setTimeout(() => {
              this.detalleForm.get('valor')?.setValue(saldo);
              
              // Update payment type hint based on the saldo value
              this.paymentTypeHint = saldo >= 0 ? 'Pago' : 'Vuelto';

              // Set focus back to valor input
              this.focusValorInput();
            }, 0);
          }
        }
      } catch (error) {
        console.error('Error adding payment detail:', error);
        this.snackBar.open('Error al agregar el detalle de pago', 'Cerrar', { duration: 3000 });
      } finally {
        this.isSaving = false;
      }
    } else {
      // Form is invalid, show validation errors
      Object.keys(this.detalleForm.controls).forEach(key => {
        const control = this.detalleForm.get(key);
        if (control?.invalid) {
          control.markAsTouched();
        }
      });

      this.snackBar.open('Por favor complete todos los campos requeridos', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Get the payment type based on the value and type
   */
  getPaymentType(value: number, tipo?: TipoDetalle): string {
    if (tipo) {
      switch (tipo) {
        case TipoDetalle.PAGO:
          return 'Pago';
        case TipoDetalle.VUELTO:
          return 'Vuelto';
        case TipoDetalle.DESCUENTO:
          return 'Descuento';
        case TipoDetalle.AUMENTO:
          return 'Aumento';
        default:
          return value >= 0 ? 'Pago' : 'Vuelto';
      }
    }
    
    // Fallback to the old logic if tipo is not provided
    return value >= 0 ? 'Pago' : 'Vuelto';
  }

  /**
   * Allows entry of negative values for "Vuelto" (change)
   * This is used when we need to give change back to the customer
   */
  allowNegativeValues(): void {
    // Get current valor
    const valorControl = this.detalleForm.get('valor');
    const currentValor = valorControl?.value;
    
    if (currentValor === null || currentValor === undefined) {
      // If no value, get the current saldo for the selected currency
      if (this.selectedMoneda?.id) {
        const saldo = this.saldos.get(this.selectedMoneda.id);
        if (saldo) {
          // Default to a negative value (for Vuelto) if the user hasn't entered anything yet
          const newValue = -Math.abs(saldo);
          valorControl?.setValue(newValue);
          this.paymentTypeHint = 'Vuelto';
          
          this.snackBar.open(
            `Cambiado a ${this.paymentTypeHint}`, 
            'Cerrar', 
            { duration: 2000 }
          );
        }
      }
      return;
    }
    
    // If the value is already negative, make it positive, otherwise make it negative
    const newValue = currentValor > 0 ? -Math.abs(currentValor) : Math.abs(currentValor);
    valorControl?.setValue(newValue);
    
    // Update the payment type hint
    this.paymentTypeHint = newValue >= 0 ? 'Pago' : 'Vuelto';
    
    // Show a snackbar to indicate the change
    this.snackBar.open(
      `Cambiado a ${this.paymentTypeHint}`, 
      'Cerrar', 
      { duration: 2000 }
    );
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onFinalize(): void {
    if (this.pagoCreated) {
      // Check if saldo is effectively zero before finalizing
      const epsilon = 0.001; // Small tolerance for floating point comparisons
      const saldoPrincipal = this.saldos.get(this.principalMoneda!.id!) || 0;

      if (Math.abs(saldoPrincipal) > epsilon) {
        this.snackBar.open('El saldo debe ser cero para finalizar el pago.', 'Cerrar', { duration: 3000 });
        return;
      }

      this.isSaving = true;
      firstValueFrom(this.repositoryService.updatePago(this.pagoCreated.id!, { estado: PagoEstado.PAGADO }))
        .then(updatedPago => {
          this.pagoCreated = updatedPago; // Update local state
          this.isFinalizado = true;
          this.updateFormState();
          this.snackBar.open('Pago finalizado correctamente', 'Cerrar', { duration: 3000 });
          // Optionally close the dialog after finalizing
          this.dialogRef.close({
            pago: this.pagoCreated,
            detalles: this.detalles,
            finalizado: true
          });
        })
        .catch(error => {
          console.error('Error finalizing pago:', error);
          this.snackBar.open('Error al finalizar el pago', 'Cerrar', { duration: 3000 });
        })
        .finally(() => {
          this.isSaving = false;
        });
    } else {
      // No pago was created (no details were added)
      this.snackBar.open('No hay detalles de pago para finalizar.', 'Cerrar', { duration: 3000 });
      // Or simply close without action if appropriate
      // this.dialogRef.close(); 
    }
  }

  /**
   * Enables the form and reverts the pago state to ABIERTO
   */
  async onModifyPago(): Promise<void> {
    if (!this.pagoCreated || !this.isFinalizado) {
      return; // Should not happen if button visibility is correct
    }

    this.isSaving = true;
    try {
      const updatedPago = await firstValueFrom(this.repositoryService.updatePago(this.pagoCreated.id!, { estado: PagoEstado.ABIERTO }));
      this.pagoCreated = updatedPago; // Update local state
      this.isFinalizado = false;
      this.updateFormState(); // Re-enable form
      this.snackBar.open('Pago habilitado para modificación', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error modifying pago state:', error);
      this.snackBar.open('Error al modificar el estado del pago', 'Cerrar', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Enables or disables the form based on the isFinalizado state
   */
  updateFormState(): void {
    if (this.isFinalizado) {
      this.detalleForm.disable();
    } else {
      this.detalleForm.enable();
    }
    // Optionally, re-apply conditional validation if needed after enable/disable
    // Example: this.detalleForm.get('descripcion')?.updateValueAndValidity();
  }

  // Subscribe to currency total changes to update disabled state
  ngAfterViewInit(): void {
    // Ensure form is properly initialized with defaults after view init
    setTimeout(() => {
      this.updateFormInitialValues();
    }, 0);
  }

  ngAfterViewChecked(): void {
    // Set focus on the valor input only once when component is done loading
    if (!this.focusSet && !this.loadingConfig && !this.loadingExchangeRates && this.valorInput) {
      setTimeout(() => {
        // Try to focus using the component's inputControl
        this.focusSet = true;
        try {
          // Set the initial value to the current saldo
          if (this.selectedMoneda?.id) {
            const saldo = this.saldos.get(this.selectedMoneda.id);
            if (saldo && saldo > 0) {
              this.detalleForm.get('valor')?.setValue(saldo);
            }
          }

          // Try to focus using the component's input element
          this.focusValorInput();
        } catch (error) {
          console.error('Error setting focus:', error);
        }
      }, 300);
    }
  }

  /**
   * Focus the valor input field
   */
  focusValorInput(): void {
    try {
      // Try several methods to focus the input
      if (this.valorInput) {
        // Try to access the actual input element inside the component
        // The CurrencyInputComponent has an inputControl property
        const componentInstance = this.valorInput as any;
        if (componentInstance.inputControl) {
          // Focus directly through the native element
          const input = document.querySelector('.currency-field input');
          if (input) {
            (input as HTMLElement).focus();
            return;
          }
        }
      }

      // Fall back to querying the DOM
      const element = document.querySelector('.currency-field input');
      if (element) {
        (element as HTMLElement).focus();
      }
    } catch (error) {
      console.error('Error focusing valor input:', error);
    }
  }

  // Add a method to load a pago by ID
  async loadPagoById(pagoId: number): Promise<void> {
    try {
      const pago = await firstValueFrom(this.repositoryService.getPago(pagoId));

      if (pago) {
        this.pagoCreated = pago;
        this.isFinalizado = this.pagoCreated.estado === PagoEstado.PAGADO;
        this.updateFormState(); // Update form state based on finalized status
        await this.loadPagoDetalles(pagoId);
        
        // Load caja information if available
        if (pago.caja && pago.caja.id) {
          this.selectedCaja = pago.caja;
        }
      }
    } catch (error) {
      this.snackBar.open('Error al cargar el pago', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Edit an existing payment detail
   */
  editDetalle(detalle: PagoDetalle): void {
    console.log('isFinalizado', this.isFinalizado);
    
    // Prevent editing if the payment is finalized
    if (this.isFinalizado) {
      this.snackBar.open('No se puede editar un detalle de un pago finalizado.', 'Cerrar', { duration: 3000 });
      return;
    }

    // Find the matching moneda and forma pago from our lists to ensure reference equality
    const moneda = this.filteredMonedas.find(m => m.id === detalle.moneda?.id);
    const formaPago = this.data.formasPago.find(f => f.id === detalle.formaPago?.id);

    if (!moneda || !formaPago) {
      this.snackBar.open('Error al cargar los datos para editar', 'Cerrar', { duration: 3000 });
      return;
    }

    // Store the ID of the detail being edited to handle it properly when saving
    this.editingDetalleId = detalle.id;

    // Update selected values for quick buttons first
    this.selectedMoneda = moneda;
    this.selectedFormaPago = formaPago;

    // Then set form values
    this.detalleForm.patchValue({
      moneda: moneda,
      formaPago: formaPago,
      valor: detalle.valor,
      mostrarDescripcion: detalle.descripcion ? true : false,
      descripcion: detalle.descripcion || ''
    });

    // Remove the item from the detalles array
    // Note: We don't update saldos here since it will be updated when the new detail is saved
    this.detalles = this.detalles.filter(d => d.id !== detalle.id);

    // Focus on the valor input after a small delay
    setTimeout(() => {
      this.focusValorInput();
    }, 100);
  }

  /**
   * Delete a payment detail
   */
  async deleteDetalle(detalle: PagoDetalle): Promise<void> {
    // Prevent deleting if the payment is finalized
    if (this.isFinalizado) {
      this.snackBar.open('No se puede eliminar un detalle de un pago finalizado.', 'Cerrar', { duration: 3000 });
      return;
    }

    if (!detalle.id) {
      console.warn('Cannot delete a payment detail without an ID');
      return;
    }

    try {
      // Mark as inactive in the database
      await firstValueFrom(this.repositoryService.updatePagoDetalle(detalle.id, { activo: false }));

      // Remove from the local array
      this.detalles = this.detalles.filter(d => d.id !== detalle.id);

      // Update saldos
      this.updateSaldos();

      this.snackBar.open('Detalle de pago eliminado', 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error('Error deleting payment detail:', error);
      this.snackBar.open('Error al eliminar el detalle de pago', 'Cerrar', { duration: 3000 });
    }
  }

  /**
   * Opens a dialog for applying a discount (descuento)
   * This is used when there's a small amount left and we want to round down
   */
  openDescuentoDialog(): void {
    if (!this.principalMoneda) {
      this.snackBar.open('No se ha definido una moneda principal', 'Cerrar', { duration: 3000 });
      return;
    }

    // Get current remaining amount
    const remainingAmount = this.saldos.get(this.principalMoneda.id!) || 0;
    
    // Only allow discount if there's a positive amount remaining
    if (remainingAmount <= 0) {
      this.snackBar.open('No hay saldo pendiente para aplicar un descuento', 'Cerrar', { duration: 3000 });
      return;
    }

    // Open Material dialog for user input
    const dialogRef = this.dialog.open(AjusteDialogComponent, {
      width: '400px',
      data: {
        tipo: 'DESCUENTO',
        saldoPendiente: remainingAmount,
        moneda: this.principalMoneda,
        suggested: remainingAmount
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // User confirmed with valid input
        this.createAjusteDetalle(result.valor, TipoDetalle.DESCUENTO, result.descripcion);
      }
    });
  }

  /**
   * Opens a dialog for applying an increase (aumento)
   * This is used when the customer pays more than required and we want to record it
   */
  openAumentoDialog(): void {
    if (!this.principalMoneda) {
      this.snackBar.open('No se ha definido una moneda principal', 'Cerrar', { duration: 3000 });
      return;
    }

    // Get current remaining amount
    const remainingAmount = this.saldos.get(this.principalMoneda.id!) || 0;
    
    // Open Material dialog for user input
    const dialogRef = this.dialog.open(AjusteDialogComponent, {
      width: '400px',
      data: {
        tipo: 'AUMENTO',
        saldoPendiente: remainingAmount,
        moneda: this.principalMoneda,
        suggested: Math.abs(remainingAmount)
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // User confirmed with valid input
        this.createAjusteDetalle(result.valor, TipoDetalle.AUMENTO, result.descripcion);
      }
    });
  }

  /**
   * Creates an adjustment detail (either DESCUENTO or AUMENTO)
   */
  async createAjusteDetalle(amount: number, tipo: TipoDetalle, descripcion: string): Promise<void> {
    if (!this.principalMoneda || !this.selectedFormaPago) {
      this.snackBar.open('Faltan datos requeridos para registrar el ajuste', 'Cerrar', { duration: 3000 });
      return;
    }

    // Both discounts and increases effectively increase the "paid" amount relative to the original total.
    // Therefore, the value stored should be positive for both.
    const valorAjuste = Math.abs(amount); // Store absolute value

    this.isSaving = true;
    try {
      // Create a new detail for the adjustment
      const detalle: Partial<PagoDetalle> = {
        valor: valorAjuste, // Use the positive absolute value
        descripcion: descripcion,
        moneda: this.principalMoneda,
        formaPago: this.selectedFormaPago, // Consider if a default/special formaPago is needed for adjustments
        tipo: tipo
      };

      // Save to database
      const savedDetalle = await this.savePagoDetalle(detalle as PagoDetalle);

      // Add to local array with the ID from the database
      this.detalles = [...this.detalles, savedDetalle];

      // Update balances
      this.updateSaldos();

      this.snackBar.open(`${tipo === TipoDetalle.DESCUENTO ? 'Descuento' : 'Aumento'} registrado exitosamente`, 'Cerrar', { duration: 3000 });
    } catch (error) {
      console.error(`Error adding ${tipo.toLowerCase()}:`, error);
      this.snackBar.open(`Error al registrar el ${tipo.toLowerCase()}`, 'Cerrar', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }
}
