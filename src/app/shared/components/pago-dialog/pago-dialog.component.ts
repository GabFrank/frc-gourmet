import { Component, Inject, OnInit, AfterViewInit, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
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

// Import the models
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';
import { PagoDetalle } from '../../../database/entities/compras/pago-detalle.entity';
import { RepositoryService } from '../../../database/repository.service';
import { firstValueFrom } from 'rxjs';
import { CajaMoneda } from '../../../database/entities/financiero/caja-moneda.entity';
import { MonedaCambio } from '../../../database/entities/financiero/moneda-cambio.entity';
import { CurrencyInputComponent } from '../currency-input/currency-input.component';

export interface PagoDialogData {
  // Principal currency total
  total: number;
  // Principal currency ID
  principalMonedaId: number;
  compraIds: number[];
  monedas: Moneda[];
  formasPago: FormasPago[];
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
    CurrencyInputComponent
  ],
  templateUrl: './pago-dialog.component.html',
  styleUrls: ['./pago-dialog.component.scss']
})
export class PagoDialogComponent implements OnInit, AfterViewInit, AfterViewChecked {
  detalleForm!: FormGroup;
  detalles: PagoDetalle[] = [];

  // Display columns for the table
  displayedColumns: string[] = ['#', 'moneda', 'formaPago', 'valor', 'tipo'];

  // Principal currency
  principalMoneda: Moneda | null = null;

  // Monedas with calculated totals
  monedasWithTotals: MonedaWithTotal[] = [];

  // Tracking values for balances
  saldos: Map<number, number> = new Map<number, number>();

  // Selected options
  selectedMoneda: Moneda | null = null;
  selectedFormaPago: FormasPago | null = null;

  // Offline status
  isOffline = false;

  // Filtered and sorted currencies
  filteredMonedas: Moneda[] = [];

  // Loading states
  loadingConfig = false;
  loadingExchangeRates = false;

  // Exchange rates for conversions
  exchangeRates: MonedaCambio[] = [];

  @ViewChild('valorInput') valorInput!: CurrencyInputComponent;
  private focusSet = false;

  constructor(
    public dialogRef: MatDialogRef<PagoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: PagoDialogData,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
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
    console.log('Currency selected from button:', moneda);
    this.selectedMoneda = moneda;
    // Update the form value
    this.detalleForm.get('moneda')?.setValue(moneda);
  }

  onFormaPagoSelect(formaPago: FormasPago): void {
    console.log('Payment method selected from button:', formaPago);
    this.selectedFormaPago = formaPago;
    // Update the form value
    this.detalleForm.get('formaPago')?.setValue(formaPago);
  }

  // Listen for form changes to update button selections
  setupFormListeners(): void {
    // Listen for changes in the moneda form control
    this.detalleForm.get('moneda')?.valueChanges.subscribe(value => {
      if (value) {
        console.log('Currency changed in form:', value);
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
        console.log('Payment method changed in form:', value);
        this.selectedFormaPago = value;
      }
    });
  }

  ngOnInit(): void {
    // Initialize form first with initial selected values
    this.initForm();

    // Setup form listeners for bidirectional binding with buttons
    this.setupFormListeners();

    // Then load and filter monedas
    this.loadAndFilterMonedas().then(() => {
      // After loading is complete, update the form values
      this.updateFormInitialValues();
    });
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
      console.log('Updating form with selectedMoneda:', this.selectedMoneda);
      console.log('Updating form with selectedFormaPago:', this.selectedFormaPago);

      this.detalleForm.patchValue({
        moneda: this.selectedMoneda,
        formaPago: this.selectedFormaPago
      });
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

        // Update saldos for this currency
        this.saldos.set(moneda.id!, total);
      } else {
        // No exchange rate found, set total to 0
        this.monedasWithTotals.push({
          moneda: moneda,
          total: 0
        });

        // Update saldos for this currency
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
      valor: [null, [Validators.required, Validators.min(0.01)]],
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
    // Reset saldos to initial totals
    this.monedasWithTotals.forEach(mwt => {
      this.saldos.set(mwt.moneda.id!, mwt.total);
    });

    // Subtract paid amounts for each currency
    this.detalles.forEach(detalle => {
      if (detalle.moneda && detalle.moneda.id) {
        const currentSaldo = this.saldos.get(detalle.moneda.id) || 0;
        this.saldos.set(detalle.moneda.id, currentSaldo - (detalle.valor || 0));
      }
    });
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

  addDetalle(): void {
    if (this.detalleForm.valid) {
      const formValues = this.detalleForm.value;

      // Create a new payment detail
      const detalle: Partial<PagoDetalle> = {
        valor: formValues.valor,
        descripcion: formValues.mostrarDescripcion ? formValues.descripcion : '',
        moneda: formValues.moneda,
        formaPago: formValues.formaPago,
      };

      this.detalles.push(detalle as PagoDetalle);
      this.updateSaldos();

      // Update selected values from form
      this.selectedMoneda = formValues.moneda;
      this.selectedFormaPago = formValues.formaPago;

      // Reset only valor and descripcion, keep selected moneda and formaPago
      this.detalleForm.patchValue({
        valor: null,
        descripcion: '',
        mostrarDescripcion: false
      });

      // Update the valor with current saldo after reset
      if (this.selectedMoneda?.id) {
        const saldo = this.saldos.get(this.selectedMoneda.id);
        if (saldo && saldo > 0) {
          setTimeout(() => {
            this.detalleForm.get('valor')?.setValue(saldo);

            // Set focus back to valor input
            this.focusValorInput();
          }, 0);
        }
      }
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onFinalize(): void {
    // Return the payment details to the caller
    this.dialogRef.close({
      detalles: this.detalles
    });
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
}
