import { Component, OnInit, Inject, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatStepperModule } from '@angular/material/stepper';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { RepositoryService } from 'src/app/database/repository.service';
import { Dispositivo } from 'src/app/database/entities/financiero/dispositivo.entity';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { CajaMoneda } from 'src/app/database/entities/financiero/caja-moneda.entity';
import { MonedaBillete } from 'src/app/database/entities/financiero/moneda-billete.entity';
import { Caja, CajaEstado } from 'src/app/database/entities/financiero/caja.entity';
import { Conteo } from 'src/app/database/entities/financiero/conteo.entity';
import { ConteoDetalle } from 'src/app/database/entities/financiero/conteo-detalle.entity';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, finalize } from 'rxjs/operators';
import { AuthService } from 'src/app/services/auth.service';

interface MonedaConfig {
  moneda: Moneda;
  billetes: MonedaBillete[];
  predeterminado: boolean;
}

@Component({
  selector: 'app-create-caja-dialog',
  templateUrl: './create-caja-dialog.component.html',
  styleUrls: ['./create-caja-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatStepperModule,
    MatButtonModule,
    MatIconModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTabsModule
  ]
})
export class CreateCajaDialogComponent implements OnInit, AfterViewInit {
  // Form groups for each step
  cajaInfoForm!: FormGroup;
  conteoInicialForm!: FormGroup;
  conteoCierreForm!: FormGroup; // New form for cierre
  dispositivos: Dispositivo[] = [];
  monedasConfig: MonedaConfig[] = [];
  activeCurrency: MonedaConfig | null = null;
  activeCierreCurrency: MonedaConfig | null = null; // Active currency for cierre
  isLinear = true;
  loading = false;
  loadingDeviceInfo = false;
  detectedDispositivoId: number | null = null;
  isViewMode = false; // New property to track if the component is in view mode

  // Properties to replace direct function calls in template
  selectedTabIndex = 0;
  selectedCierreTabIndex = 0; // Tab index for cierre
  dispositivoName = '';
  currencyTotals: { [key: number]: number } = {};
  currencyHasValues: { [key: number]: boolean } = {};
  cierreCurrencyTotals: { [key: number]: number } = {}; // Totals for cierre
  cierreCurrencyHasValues: { [key: number]: boolean } = {}; // Has values for cierre
  billeteValues: { [key: number]: number } = {};
  previousTabIndex = 0;

  // Add field to store billete values across tab changes
  billeteValuesStore: { [key: string]: number } = {};
  cierreBilleteValuesStore: { [key: string]: number } = {}; // Store for cierre values

  // Mode of operation ('create' or 'conteo')
  dialogMode: 'create' | 'conteo' = 'create';
  dialogTitle = 'Abrir nueva caja';
  existingCaja: Caja | null = null;
  existingConteo: Conteo | null = null;
  existingConteoCierre: Conteo | null = null; // New property for conteo cierre
  conteoDetalles: ConteoDetalle[] = [];
  conteoCierreDetalles: ConteoDetalle[] = []; // New property for conteo cierre details

  // Add a property to store the excluded dispositivo ID
  excludeDispositivoId: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<CreateCajaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    private formBuilder: FormBuilder,
    private repositoryService: RepositoryService,
    private authService: AuthService
  ) {
    // Handle dialog data
    if (data) {
      // Check if we're in conteo mode
      if (data.mode === 'conteo') {
        this.dialogMode = 'conteo';
        this.dialogTitle = 'Conteo de caja';
      }

      // Check if we have an excluded dispositivo ID (for preventing multiple cajas per device)
      this.excludeDispositivoId = data.excludeDispositivoId;
    }

    // Initialize forms
    this.initForms();

    // Set dialog size
    this.dialogRef.updateSize('80vw', '80vh');

    // Remove the max-width and max-height restrictions
    const dialogContainer = document.querySelector('.cdk-dialog-container') as HTMLElement;
    if (dialogContainer) {
      dialogContainer.style.maxWidth = 'none';
      dialogContainer.style.maxHeight = 'none';
    }
  }

  // Lifecycle hooks
  ngOnInit(): void {
    this.initForms();

    if (this.dialogMode === 'conteo' && this.data && this.data.cajaId) {
      // Load existing caja and conteo data
      this.isViewMode = true; // Set view mode to true for conteo
      this.loadExistingCajaData(this.data.cajaId);
    } else {
      // Regular flow for creating a new caja
    this.loadDispositivos();
    }
  }

  ngAfterViewInit(): void {
    // Set up form change listeners
    this.listenForFormChanges();

    // Update properties for initial view
    this.updatePropertiesForTemplate();
  }

  // Public methods
  navigateToNextField(currentIndex: number, currentCurrencyId: number): void {
    // Find the index of this currency in the monedas config
    const currencyIndex = this.monedasConfig.findIndex(config => config.moneda.id === currentCurrencyId);
    if (currencyIndex === -1) return;

    const currentCurrency = this.monedasConfig[currencyIndex];

    // Calculate the next logical index (not the visual position)
    const nextIndex = currentIndex + 1;

    // If there's a next field in the current currency, focus it
    if (nextIndex < currentCurrency.billetes.length) {
      setTimeout(() => {
        // Use a query that gets all inputs for this currency
        const inputs = Array.from(document.querySelectorAll(
          `input[data-currency-id="${currentCurrencyId}"]`
        )) as HTMLInputElement[];

        // Sort inputs by their data-index attribute to match the logical order
        inputs.sort((a, b) => {
          const indexA = parseInt(a.getAttribute('data-index') || '0');
          const indexB = parseInt(b.getAttribute('data-index') || '0');
          return indexA - indexB;
        });

        // Find the input with the next index
        const nextField = inputs.find(input =>
          parseInt(input.getAttribute('data-index') || '0') === nextIndex
        );

        if (nextField) {
          nextField.focus();
          nextField.select(); // Also select the content
        }
      }, 0); // Small timeout to ensure DOM is updated
      return;
    }

    // If this is the last field in the current currency, check if there's a next currency
    const nextCurrencyIndex = currencyIndex + 1;
    if (nextCurrencyIndex < this.monedasConfig.length) {
      // Switch to next tab
      this.onTabChange(nextCurrencyIndex);

      // Wait for tab to render
      setTimeout(() => {
        // Focus the first field in the next currency
        const nextCurrency = this.monedasConfig[nextCurrencyIndex];

        // Get all inputs for the next currency
        const inputs = Array.from(document.querySelectorAll(
          `input[data-currency-id="${nextCurrency.moneda.id}"]`
        )) as HTMLInputElement[];

        // Sort inputs by their data-index attribute
        inputs.sort((a, b) => {
          const indexA = parseInt(a.getAttribute('data-index') || '0');
          const indexB = parseInt(b.getAttribute('data-index') || '0');
          return indexA - indexB;
        });

        // Get the first input (should have data-index="0")
        const firstField = inputs[0];

        if (firstField) {
          firstField.focus();
          firstField.select(); // Also select the content
        }
      }, 100);
      return;
    }

    // If it's the last field of the last currency, click the "Next" button
    if (nextCurrencyIndex >= this.monedasConfig.length) {
      setTimeout(() => {
        const nextButton = document.querySelector('.step-actions button[matStepperNext]') as HTMLButtonElement;
        if (nextButton && !nextButton.disabled) {
          nextButton.click();
        }
      }, 50);
    }
  }

  navigateToNextCierreField(currentIndex: number, currentCurrencyId: number): void {
    // Find the index of this currency in the monedas config
    const currencyIndex = this.monedasConfig.findIndex(config => config.moneda.id === currentCurrencyId);
    if (currencyIndex === -1) return;

    const currentCurrency = this.monedasConfig[currencyIndex];

    // Calculate the next logical index (not the visual position)
    const nextIndex = currentIndex + 1;

    // If there's a next field in the current currency, focus it
    if (nextIndex < currentCurrency.billetes.length) {
      setTimeout(() => {
        // Use a query that gets all inputs for this currency
        const inputs = Array.from(document.querySelectorAll(
          `input[data-currency-id="${currentCurrencyId}"]`
        )) as HTMLInputElement[];

        // Sort inputs by their data-index attribute to match the logical order
        inputs.sort((a, b) => {
          const indexA = parseInt(a.getAttribute('data-index') || '0');
          const indexB = parseInt(b.getAttribute('data-index') || '0');
          return indexA - indexB;
        });

        // Find the input with the next index
        const nextField = inputs.find(input =>
          parseInt(input.getAttribute('data-index') || '0') === nextIndex
        );

        if (nextField) {
          nextField.focus();
          nextField.select(); // Also select the content
        }
      }, 0); // Small timeout to ensure DOM is updated
      return;
    }

    // If this is the last field in the current currency, check if there's a next currency
    const nextCurrencyIndex = currencyIndex + 1;
    if (nextCurrencyIndex < this.monedasConfig.length) {
      // Switch to next tab
      this.onCierreTabChange(nextCurrencyIndex);

      // Wait for tab to render
      setTimeout(() => {
        // Focus the first field in the next currency
        const nextCurrency = this.monedasConfig[nextCurrencyIndex];

        // Get all inputs for the next currency
        const inputs = Array.from(document.querySelectorAll(
          `input[data-currency-id="${nextCurrency.moneda.id}"]`
        )) as HTMLInputElement[];

        // Sort inputs by their data-index attribute
        inputs.sort((a, b) => {
          const indexA = parseInt(a.getAttribute('data-index') || '0');
          const indexB = parseInt(b.getAttribute('data-index') || '0');
          return indexA - indexB;
        });

        // Get the first input (should have data-index="0")
        const firstField = inputs[0];

        if (firstField) {
          firstField.focus();
          firstField.select(); // Also select the content
        }
      }, 100);
      return;
    }

    // If it's the last field of the last currency, click the "Next" button
    if (nextCurrencyIndex >= this.monedasConfig.length) {
      setTimeout(() => {
        const nextButton = document.querySelector('.step-actions button[matStepperNext]') as HTMLButtonElement;
        if (nextButton && !nextButton.disabled) {
          nextButton.click();
        }
      }, 50);
    }
  }

  getSelectedTabIndex(): number {
    if (!this.activeCurrency || !this.monedasConfig.length) return 0;
    const index = this.monedasConfig.findIndex(config =>
      config.moneda.id === this.activeCurrency?.moneda.id
    );
    return index >= 0 ? index : 0;
  }

  hasValueForCurrency(monedaConfig: MonedaConfig): boolean {
    if (!monedaConfig || !monedaConfig.billetes) return false;

    return monedaConfig.billetes.some(billete =>
      billete && billete.id && this.getBilleteValue(billete.id) > 0
    );
  }

  getBilleteValue(billeteId: number): number {
    const controlName = `billete_${billeteId}`;

    // First check if there's a form control for this billete
    const formControl = this.conteoInicialForm.get(controlName);
    if (formControl) {
      const value = formControl.value;
      // If the value exists in the form, use it and also update the store
      if (value !== null && value !== undefined) {
        // Keep the store updated with the latest form value
        this.billeteValuesStore[controlName] = Number(value);
        return Number(value);
      }
    }

    // If not in form or no value, fall back to stored value
    return this.billeteValuesStore[controlName] || 0;
  }

  getCierreBilleteValue(billeteId: number): number {
    const controlName = `cierre_billete_${billeteId}`;

    // First check if there's a form control for this billete
    const formControl = this.conteoCierreForm.get(controlName);
    if (formControl) {
      const value = formControl.value;
      // If the value exists in the form, use it and also update the store
      if (value !== null && value !== undefined) {
        // Keep the store updated with the latest form value
        this.cierreBilleteValuesStore[controlName] = Number(value);
        return Number(value);
      }
    }

    // If not in form or no value, fall back to stored value
    return this.cierreBilleteValuesStore[controlName] || 0;
  }

  initForms(): void {
    this.cajaInfoForm = this.formBuilder.group({
      dispositivoId: ['', Validators.required],
    });

    this.conteoInicialForm = this.formBuilder.group({});
    this.conteoCierreForm = this.formBuilder.group({}); // Initialize the cierre form

    this.initConteoFields();
    this.initConteoCierreFields(); // Initialize cierre fields
    this.listenForFormChanges();
  }

  onTabChange(index: number): void {
    if (index >= 0 && index < this.monedasConfig.length) {
      this.switchCurrency(this.monedasConfig[index]);
      this.selectedTabIndex = index;
    }
  }

  onCierreTabChange(index: number): void {
    if (index >= 0 && index < this.monedasConfig.length) {
      this.switchCierreCurrency(this.monedasConfig[index]);
      this.selectedCierreTabIndex = index;
    }
  }

  switchCurrency(monedaConfig: MonedaConfig): void {
    // Sync form values to store before switching currency
    this.syncFormValuesToStores();

    this.activeCurrency = monedaConfig;
    this.initConteoFields();
  }

  switchCierreCurrency(monedaConfig: MonedaConfig): void {
    // Sync form values to store before switching currency
    this.syncFormValuesToStores();

    this.activeCierreCurrency = monedaConfig;
    this.initConteoCierreFields();
  }

  calculateCurrencyTotal(): number {
    if (!this.activeCurrency || !this.activeCurrency.billetes) return 0;

    let total = 0;
    this.activeCurrency.billetes.forEach(billete => {
      if (!billete || !billete.id) return;

      const value = this.getBilleteValue(billete.id);
      if (value > 0) {
        total += value * billete.valor;
      }
    });

    return total;
  }

  calculateCierreCurrencyTotal(): number {
    if (!this.activeCierreCurrency || !this.activeCierreCurrency.billetes) return 0;

    let total = 0;
    this.activeCierreCurrency.billetes.forEach(billete => {
      if (!billete || !billete.id) return;

      const value = this.getCierreBilleteValue(billete.id);
      if (value > 0) {
        total += value * billete.valor;
      }
    });

    return total;
  }

  getCurrencyTotal(currencyId: number): number {
    // Use the pre-calculated total
    return this.currencyTotals[currencyId] || 0;
  }

  getCierreCurrencyTotal(currencyId: number): number {
    // Use the pre-calculated total
    return this.cierreCurrencyTotals[currencyId] || 0;
  }

  getDifference(currencyId: number): number {
    const cierre = this.cierreCurrencyTotals[currencyId] || 0;
    const apertura = this.currencyTotals[currencyId] || 0;
    return cierre - apertura;
  }

  getDispositivoName(): string {
    const dispositivoId = this.cajaInfoForm.get('dispositivoId')?.value;
    if (!dispositivoId) return 'SIN SELECCIONAR';

    const dispositivo = this.dispositivos.find(d => d.id === dispositivoId);
    return dispositivo ? dispositivo.nombre : 'DESCONOCIDO';
  }

  listenForFormChanges(): void {
    // Subscribe to cajaInfoForm changes to update dispositivo name
    this.cajaInfoForm.valueChanges.subscribe(() => {
      this.updateDispositivoName();
    });

    // Subscribe to conteoInicialForm changes to update totals in real-time
    this.conteoInicialForm.valueChanges.subscribe(() => {
      this.updatePropertiesForTemplate();
    });

    // Subscribe to conteoCierreForm changes to update cierre totals in real-time
    this.conteoCierreForm.valueChanges.subscribe(() => {
      this.updateCierrePropertiesForTemplate();
    });
  }

  // New method to handle input changes directly from billete inputs
  onBilleteInputChange(event: Event, billeteId: number): void {
    const input = event.target as HTMLInputElement;
    const value = input ? Number(input.value) : 0;
    const controlName = `billete_${billeteId}`;

    // Immediately update the billeteValuesStore
    this.billeteValuesStore[controlName] = value;

    // Update the properties for template to refresh totals
    this.updatePropertiesForTemplate();
  }

  // New method to handle input changes directly from cierre billete inputs
  onCierreBilleteInputChange(event: Event, billeteId: number): void {
    const input = event.target as HTMLInputElement;
    const value = input ? Number(input.value) : 0;
    const controlName = `cierre_billete_${billeteId}`;

    // Immediately update the cierreBilleteValuesStore
    this.cierreBilleteValuesStore[controlName] = value;

    // Update the properties for template to refresh totals
    this.updateCierrePropertiesForTemplate();
  }

  // New method to sync all current form values to the stores before any critical operation
  syncFormValuesToStores(): void {
    // Sync conteoInicialForm values
    if (this.conteoInicialForm) {
      Object.keys(this.conteoInicialForm.controls).forEach(controlName => {
        const value = this.conteoInicialForm.get(controlName)?.value;
        if (value !== undefined && value !== null) {
          this.billeteValuesStore[controlName] = value;
        }
      });
    }

    // Sync conteoCierreForm values
    if (this.conteoCierreForm) {
      Object.keys(this.conteoCierreForm.controls).forEach(controlName => {
        const value = this.conteoCierreForm.get(controlName)?.value;
        if (value !== undefined && value !== null) {
          this.cierreBilleteValuesStore[controlName] = value;
        }
      });
    }

    // Update properties for template to ensure totals are current
    this.updatePropertiesForTemplate();
    this.updateCierrePropertiesForTemplate();
  }

  updatePropertiesForTemplate(): void {
    // Pre-calculate all bill values for better performance
    const billeteValues: { [key: number]: number } = {};

    // Get values for all billetes
    for (const monedaConfig of this.monedasConfig) {
      for (const billete of monedaConfig.billetes) {
        const value = this.getBilleteValue(billete.id);
        billeteValues[billete.id] = value;
      }
    }

    // Calculate totals for each currency
    for (const monedaConfig of this.monedasConfig) {
      let total = 0;
      let hasValues = false;

      for (const billete of monedaConfig.billetes) {
        const cantidad = billeteValues[billete.id] || 0;
        const subtotal = cantidad * billete.valor;
        total += subtotal;

        if (cantidad > 0) {
          hasValues = true;
        }
      }

      this.currencyTotals[monedaConfig.moneda.id] = total;
      this.currencyHasValues[monedaConfig.moneda.id] = hasValues;
    }
  }

  updateCierrePropertiesForTemplate(): void {
    // Pre-calculate all bill values for better performance
    const billeteValues: { [key: number]: number } = {};

    // Get values for all billetes
    for (const monedaConfig of this.monedasConfig) {
      for (const billete of monedaConfig.billetes) {
        const value = this.getCierreBilleteValue(billete.id);
        billeteValues[billete.id] = value;
      }
    }

    // Calculate totals for each currency
    for (const monedaConfig of this.monedasConfig) {
      let total = 0;
      let hasValues = false;

      for (const billete of monedaConfig.billetes) {
        const cantidad = billeteValues[billete.id] || 0;
        const subtotal = cantidad * billete.valor;
        total += subtotal;

        if (cantidad > 0) {
          hasValues = true;
        }
      }

      this.cierreCurrencyTotals[monedaConfig.moneda.id] = total;
      this.cierreCurrencyHasValues[monedaConfig.moneda.id] = hasValues;
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    // Sync all form values to stores before submission
    this.syncFormValuesToStores();

    if (this.cajaInfoForm.invalid || this.conteoInicialForm.invalid) {
      console.log('Form invalid:', {
        cajaInfoFormInvalid: this.cajaInfoForm.invalid,
        conteoInicialFormInvalid: this.conteoInicialForm.invalid
      });
      return;
    }

    // If in conteo mode, update the conteo detalles
    if (this.dialogMode === 'conteo' && this.existingConteo) {
      console.log('Submitting in conteo mode for conteo ID:', this.existingConteo.id);
      this.updateConteoDetalles();
      return;
    }

    // Regular flow for creating a new caja
    console.log('Submitting in create mode');
    this.loading = true;

    const dispositivoId = this.cajaInfoForm.get('dispositivoId')?.value;

    // Step 1: Create conteo inicial first
    const conteoData: Partial<Conteo> = {
      activo: true,
      tipo: 'APERTURA',
      fecha: new Date(),
      observaciones: 'CONTEO INICIAL DE APERTURA DE CAJA'
    };

    this.repositoryService.createConteo(conteoData).subscribe(
      conteo => {
        // Step 2: Create conteo detalles for each currency and denomination
        const conteoDetalleObservables: Observable<any>[] = [];

        // For each currency config with values
        this.monedasConfig.forEach(monedaConfig => {
          // For each billete with a value > 0
          if (monedaConfig.billetes) {
            monedaConfig.billetes.forEach(billete => {
              if (!billete || !billete.id) return;

              const controlName = `billete_${billete.id}`;
              const cantidadControl = this.billeteValuesStore[controlName];
              const cantidad = cantidadControl || 0;

              if (cantidad > 0) {
                const conteoDetalleData: Partial<ConteoDetalle> = {
                  conteo: { id: conteo.id } as Conteo,
                  monedaBillete: { id: billete.id } as MonedaBillete,
                  cantidad: cantidad,
                  activo: true
                };

                conteoDetalleObservables.push(
                  this.repositoryService.createConteoDetalle(conteoDetalleData)
                );
              }
            });
          }
        });

        // Process all conteo detalles
        forkJoin(conteoDetalleObservables.length > 0 ? conteoDetalleObservables : [of(null)])
          .subscribe(() => {
            // Step 3: Create the caja with the conteo apertura ID
            const cajaData: Partial<Caja> = {
              dispositivo: { id: dispositivoId } as Dispositivo,
              estado: CajaEstado.ABIERTO,
              fechaApertura: new Date(),
              conteoApertura: { id: conteo.id } as Conteo,
              activo: true
              // Note: Usuario will be automatically set by the backend based on the authenticated user
            };

            this.repositoryService.createCaja(cajaData).subscribe(
              caja => {
                this.loading = false;
                this.dialogRef.close({
                  success: true,
                  caja: caja
                });
              },
              error => {
                console.error('Error creating caja:', error);
                this.loading = false;
                this.dialogRef.close({
                  success: false,
                  error: 'ERROR AL CREAR CAJA'
                });
              }
            );
          }, error => {
            console.error('Error creating conteo detalles:', error);
            this.loading = false;
            this.dialogRef.close({
              success: false,
              error: 'ERROR AL CREAR DETALLES DEL CONTEO'
            });
          });
      },
      error => {
        console.error('Error creating conteo:', error);
        this.loading = false;
        this.dialogRef.close({
          success: false,
          error: 'ERROR AL CREAR CONTEO INICIAL'
        });
      }
    );
  }

  selectAllContent(event: FocusEvent): void {
    const input = event.target as HTMLInputElement;
    if (input) {
      setTimeout(() => {
        input.select();
      }, 0);
    }
  }

  // Private methods
  private loadDispositivos(): void {
    this.loading = true;
    this.repositoryService.getDispositivos().subscribe(
      dispositivos => {
        // Filter to only display active dispositivos with isCaja=true
        this.dispositivos = dispositivos.filter(d => d.activo && d.isCaja);

        // If we have an excluded dispositivo ID, filter it out or mark it as disabled
        if (this.excludeDispositivoId) {
          // Check for open cajas on each dispositivo
          this.checkOpenCajas();
        } else {
          this.loading = false;
          // After loading dispositivos, try to find current device by MAC address
          this.detectCurrentDevice();
          // Load monedas after dispositivos are loaded
          this.loadMonedas();
        }
      },
      error => {
        console.error('Error loading dispositivos:', error);
        this.loading = false;
      }
    );
  }

  private detectCurrentDevice(): void {
    this.loadingDeviceInfo = true;

    // Use the Electron API exposed through preload script to get MAC address
    (window as any).api.getSystemMacAddress()
      .then((macAddress: string) => {
        if (macAddress) {
          // Find dispositivo with this MAC address
          const matchingDispositivo = this.dispositivos.find(d =>
            d.mac && d.mac.toLowerCase() === macAddress.toLowerCase()
          );

          if (matchingDispositivo) {
            // Set the detected dispositivo ID
            this.detectedDispositivoId = matchingDispositivo.id;

            // Update the form value
            this.cajaInfoForm.get('dispositivoId')?.setValue(matchingDispositivo.id);
            console.log(`Dispositivo detectado automáticamente: ${matchingDispositivo.nombre}`);
          } else {
            console.log(`No se encontró dispositivo con MAC: ${macAddress}`);
          }
        }
        this.loadingDeviceInfo = false;
      })
      .catch((error: any) => {
        console.error('Error al obtener dirección MAC:', error);
        this.loadingDeviceInfo = false;
      });
  }

  private loadMonedas(isConteoMode = false, conteoId?: number): void {
    this.loading = true;

    // Reset monedas config
    this.monedasConfig = [];

    // Load all caja monedas to know which currencies are enabled
    this.repositoryService.getCajasMonedas().subscribe(
      cajasMonedas => {
        // Filter active monedas
        const activeCajasMonedas = cajasMonedas.filter(cm => cm.activo);

        // Sort cajasMonedas by orden field to maintain proper display order
        activeCajasMonedas.sort((a, b) => {
          const ordenA = a.orden ? parseInt(a.orden.toString()) : 999;
          const ordenB = b.orden ? parseInt(b.orden.toString()) : 999;
          return ordenA - ordenB;
        });

        if (activeCajasMonedas.length > 0) {
          // For each active moneda, load its billetes
          const observables: Observable<any>[] = [];

          activeCajasMonedas.forEach(cajaMoneda => {
            const observable = new Observable<void>(subscriber => {
              this.repositoryService.getMonedasBilletes().subscribe(
                billetes => {
                  const monedaId = cajaMoneda.moneda.id;
                  const filteredBilletes = billetes.filter(
                    b => b.moneda && b.moneda.id === monedaId && b.activo
                  );

                  // Sort billetes by valor in ascending order
                  filteredBilletes.sort((a, b) => a.valor - b.valor);

                  // Store the currency config
                  this.monedasConfig.push({
                    moneda: cajaMoneda.moneda,
                    billetes: filteredBilletes,
                    predeterminado: cajaMoneda.predeterminado
                  });

                  // Set default currency
                  if (cajaMoneda.predeterminado) {
                    this.activeCurrency = this.monedasConfig[this.monedasConfig.length - 1];
                  }

                  subscriber.next();
                  subscriber.complete();
                },
                error => {
                  console.error(`Error loading billetes for moneda ${cajaMoneda.moneda.denominacion}:`, error);
                  subscriber.error(error);
                }
              );
            });

            observables.push(observable);
          });

          // When all observables complete
          forkJoin(observables)
            .pipe(
              finalize(() => {
                if (!isConteoMode) {
                this.loading = false;
                }
              })
            )
            .subscribe(() => {
              // Ensure monedasConfig is ordered by cajaMoneda.orden
              this.monedasConfig.sort((a, b) => {
                const monedaA = activeCajasMonedas.find(cm => cm.moneda.id === a.moneda.id);
                const monedaB = activeCajasMonedas.find(cm => cm.moneda.id === b.moneda.id);
                const ordenA = monedaA && monedaA.orden ? parseInt(monedaA.orden.toString()) : 999;
                const ordenB = monedaB && monedaB.orden ? parseInt(monedaB.orden.toString()) : 999;
                return ordenA - ordenB;
              });

              // If no predeterminado was found, use the first one
              if (!this.activeCurrency && this.monedasConfig.length > 0) {
                this.activeCurrency = this.monedasConfig[0];
              }

              // If we're in conteo mode and have a conteo ID, load the conteo data before initializing fields
              if (isConteoMode && conteoId) {
                // Don't initialize fields yet - wait for conteo data to be loaded
                this.loadConteoData(conteoId);
              } else {
                // Normal mode - initialize fields and update
              this.initConteoFields();
                this.updatePropertiesForTemplate();
                this.loading = false;
              }
            }, error => {
              console.error('Error loading monedas data:', error);
              this.loading = false;
            });
        } else {
          this.loading = false;
          console.warn('No active monedas found for cajas');
        }
      },
      error => {
        console.error('Error loading cajas monedas:', error);
        this.loading = false;
      }
    );
  }

  private initConteoFields(): void {
    if (!this.activeCurrency || !this.activeCurrency.billetes || this.activeCurrency.billetes.length === 0) {
      return;
    }

    console.log('Initializing conteo fields for currency:', this.activeCurrency.moneda.denominacion);

    // Store current form values before recreating the form
    if (this.conteoInicialForm) {
      Object.keys(this.conteoInicialForm.controls).forEach(controlName => {
        const value = this.conteoInicialForm.get(controlName)?.value;
        if (value !== undefined && value !== null) {
          this.billeteValuesStore[controlName] = value;
          console.log(`Stored value for ${controlName}: ${value}`);
        }
      });
    }

    // Clear the form first by recreating it
    this.conteoInicialForm = this.formBuilder.group({});

    // Ensure billetes are sorted by value in ascending order
    this.activeCurrency.billetes.sort((a, b) => a.valor - b.valor);

    // Before adding fields, log all stored values for debugging
    console.log('Current billeteValuesStore before creating controls:', {...this.billeteValuesStore});

    // Add fields for each denomination
    this.activeCurrency.billetes.forEach(billete => {
      // Check if billete is valid before adding control
      if (billete && billete.id) {
        const controlName = `billete_${billete.id}`;

        // First check for a value in billeteValuesStore
        const storedValue = this.billeteValuesStore[controlName] !== undefined ?
                            this.billeteValuesStore[controlName] : 0;

        console.log(`Setting form control ${controlName} to ${storedValue}`);

        // Fix linter error by using a boolean expression for the disabled state
        const shouldDisable = this.isViewMode && this.existingConteo !== null;

        this.conteoInicialForm.addControl(
          controlName,
          this.formBuilder.control(
            {value: storedValue, disabled: shouldDisable},
            [Validators.min(0), Validators.required]
          )
        );
      }
    });

    this.listenForFormChanges();
  }

  private initConteoCierreFields(): void {
    if (!this.activeCierreCurrency || !this.activeCierreCurrency.billetes || this.activeCierreCurrency.billetes.length === 0) {
      return;
    }

    console.log('Initializing conteo cierre fields for currency:', this.activeCierreCurrency.moneda.denominacion);

    // Store current form values before recreating the form
    if (this.conteoCierreForm) {
      Object.keys(this.conteoCierreForm.controls).forEach(controlName => {
        const value = this.conteoCierreForm.get(controlName)?.value;
        if (value !== undefined && value !== null) {
          this.cierreBilleteValuesStore[controlName] = value;
          console.log(`Stored cierre value for ${controlName}: ${value}`);
        }
      });
    }

    // Clear the form first by recreating it
    this.conteoCierreForm = this.formBuilder.group({});

    // Ensure billetes are sorted by value in ascending order
    this.activeCierreCurrency.billetes.sort((a, b) => a.valor - b.valor);

    // Before adding fields, log all stored values for debugging
    console.log('Current cierreBilleteValuesStore before creating controls:', {...this.cierreBilleteValuesStore});

    // Add fields for each denomination
    this.activeCierreCurrency.billetes.forEach(billete => {
      // Check if billete is valid before adding control
      if (billete && billete.id) {
        const controlName = `cierre_billete_${billete.id}`;

        // First check for a value in cierreBilleteValuesStore
        const storedValue = this.cierreBilleteValuesStore[controlName] !== undefined ?
                          this.cierreBilleteValuesStore[controlName] : 0;

        console.log(`Setting cierre form control ${controlName} to ${storedValue}`);

        // Fix linter error by using a boolean expression for the disabled state
        const shouldDisable = this.isViewMode && this.existingConteoCierre !== null;

        this.conteoCierreForm.addControl(
          controlName,
          this.formBuilder.control(
            {value: storedValue, disabled: shouldDisable},
            [Validators.min(0), Validators.required]
          )
        );
      }
    });

    // Update properties for template after form changes
    this.updateCierrePropertiesForTemplate();
  }

  private updateConteoDetalles(): void {
    // Sync all form values to stores before updating conteo detalles
    this.syncFormValuesToStores();

    if (!this.existingConteo || !this.existingConteo.id) {
      console.error('No conteo to update');
      return;
    }

    this.loading = true;
    console.log('Updating conteo detalles for conteo ID:', this.existingConteo.id);

    const conteoId = this.existingConteo.id;
    const updateObservables: Observable<any>[] = [];

    // Log current state for debugging
    console.log('Current monedasConfig:', this.monedasConfig);
    console.log('Current billeteValuesStore:', this.billeteValuesStore);
    console.log('Current conteoDetalles:', this.conteoDetalles);
    console.log('Current cierreBilleteValuesStore:', this.cierreBilleteValuesStore);

    // For apertura - update existing implementation...
    this.monedasConfig.forEach(monedaConfig => {
      // For each billete
      monedaConfig.billetes.forEach(billete => {
        if (!billete || !billete.id) return;

        const controlName = `billete_${billete.id}`;
        const newCantidad = this.getBilleteValue(billete.id);

        // Find if there's an existing conteo detalle for this billete
        const existingDetalle = this.conteoDetalles.find(
          d => d.monedaBillete && d.monedaBillete.id === billete.id
        );

        if (existingDetalle) {
          // Update existing detalle if the quantity changed
          if (existingDetalle.cantidad !== newCantidad) {
            const updateData: Partial<ConteoDetalle> = {
              cantidad: newCantidad
            };
            updateObservables.push(
              this.repositoryService.updateConteoDetalle(existingDetalle.id!, updateData)
            );
          }
        } else if (newCantidad > 0) {
          // Create new detalle if there's a value
          const newDetalle: Partial<ConteoDetalle> = {
            conteo: { id: conteoId } as Conteo,
            monedaBillete: { id: billete.id } as MonedaBillete,
            cantidad: newCantidad,
      activo: true
    };
          updateObservables.push(
            this.repositoryService.createConteoDetalle(newDetalle)
          );
        }
      });
    });

    // For cierre - create or update conteo cierre and its detalles
    // First create a new conteo for cierre if it doesn't exist
    let cierreObservable: Observable<any>;

    if (this.existingConteoCierre) {
      // If conteo cierre already exists, use it
      cierreObservable = of(this.existingConteoCierre);
    } else {
      // Create a new conteo cierre
      const cierreData: Partial<Conteo> = {
          activo: true,
        tipo: 'CIERRE',
          fecha: new Date(),
        observaciones: 'CONTEO DE CIERRE DE CAJA'
      };
      cierreObservable = this.repositoryService.createConteo(cierreData);
    }

    cierreObservable.subscribe(conteoCierre => {
      const conteoCierreId = conteoCierre.id;

      // Now create or update conteo cierre detalles
            this.monedasConfig.forEach(monedaConfig => {
                monedaConfig.billetes.forEach(billete => {
                  if (!billete || !billete.id) return;

          const controlName = `cierre_billete_${billete.id}`;
          const newCantidad = this.getCierreBilleteValue(billete.id);

          // Find if there's an existing conteo cierre detalle for this billete
          const existingDetalle = this.conteoCierreDetalles.find(
            d => d.monedaBillete && d.monedaBillete.id === billete.id
          );

          if (existingDetalle) {
            // Update existing detalle if the quantity changed
            if (existingDetalle.cantidad !== newCantidad) {
              const updateData: Partial<ConteoDetalle> = {
                cantidad: newCantidad
              };
              updateObservables.push(
                this.repositoryService.updateConteoDetalle(existingDetalle.id!, updateData)
              );
            }
          } else if (newCantidad > 0) {
            // Create new detalle if there's a value
            const newDetalle: Partial<ConteoDetalle> = {
              conteo: { id: conteoCierreId } as Conteo,
                      monedaBillete: { id: billete.id } as MonedaBillete,
              cantidad: newCantidad,
                      activo: true
                    };
            updateObservables.push(
              this.repositoryService.createConteoDetalle(newDetalle)
                    );
                  }
                });
      });

      // If this is a new conteo cierre, update the caja with the conteo cierre ID
      if (!this.existingConteoCierre && this.existingCaja && this.existingCaja.id) {
        const cajaUpdateData: Partial<Caja> = {
          conteoCierre: { id: conteoCierreId } as Conteo,
          fechaCierre: new Date(),
          estado: CajaEstado.CERRADO
        };
        updateObservables.push(
          this.repositoryService.updateCaja(this.existingCaja.id, cajaUpdateData)
        );
      }

      // Process all updates
      if (updateObservables.length > 0) {
        forkJoin(updateObservables).subscribe(
                () => {
                  this.loading = false;
                  this.dialogRef.close({
                    success: true,
              message: 'CONTEO ACTUALIZADO CORRECTAMENTE'
                  });
                },
          (error: any) => {
            console.error('Error updating conteo detalles:', error);
                  this.loading = false;
                  this.dialogRef.close({
                    success: false,
              error: 'ERROR AL ACTUALIZAR DETALLES DEL CONTEO'
                  });
                }
              );
            } else {
        // No changes needed
              this.loading = false;
              this.dialogRef.close({
                success: true,
          message: 'NO SE REALIZARON CAMBIOS'
              });
            }
    }, error => {
      console.error('Error creating conteo cierre:', error);
            this.loading = false;
            this.dialogRef.close({
              success: false,
        error: 'ERROR AL CREAR CONTEO DE CIERRE'
      });
    });
  }

  private loadExistingCajaData(cajaId: number): void {
    this.loading = true;
    console.log(`Loading caja data for cajaId: ${cajaId}`);

    // Get the caja details
    this.repositoryService.getCaja(cajaId).subscribe(
      (caja: Caja) => {
        console.log('Caja loaded:', caja);
        this.existingCaja = caja;

        // Load dispositivos first to ensure the dispositivo can be selected
        this.repositoryService.getDispositivos().subscribe(
          dispositivos => {
            // Filter to only display active dispositivos with isCaja=true
            this.dispositivos = dispositivos.filter(d => d.activo && d.isCaja);

            // Set the dispositivo in the form
            if (caja.dispositivo && caja.dispositivo.id) {
              this.cajaInfoForm.get('dispositivoId')?.setValue(caja.dispositivo.id);
              this.dispositivoName = caja.dispositivo.nombre;
              this.cajaInfoForm.disable(); // Disable editing of dispositivo in conteo mode
            }

            // Now load monedas and then conteo data
            this.loadMonedas(true, caja.conteoApertura?.id);

            // Also load conteo cierre data if it exists
            if (caja.conteoCierre && caja.conteoCierre.id) {
              this.loadConteoCierreData(caja.conteoCierre.id);
            } else {
              // Initialize with default cierre currency
              setTimeout(() => {
                if (this.monedasConfig.length > 0) {
                  this.activeCierreCurrency = this.monedasConfig[0];
                  this.initConteoCierreFields();
                }
              }, 500);
            }
      },
      error => {
            console.error('Error loading dispositivos:', error);
        this.loading = false;
          }
        );
      },
      (error: any) => {
        console.error('Error loading caja:', error);
        this.loading = false;
      }
    );
  }

  private loadConteoData(conteoId: number): void {
    if (!conteoId) {
      console.error('No conteo ID provided');
      this.loading = false;
      return;
    }

    console.log(`Loading conteo data for conteoId: ${conteoId}`);
    this.loading = true;

    // Get the conteo details
    this.repositoryService.getConteo(conteoId).subscribe(
      (conteo: Conteo) => {
        console.log('Conteo loaded:', conteo);
        this.existingConteo = conteo;

        // Get the conteo detalles
        this.repositoryService.getConteoDetalles(conteoId).subscribe(
          (detalles: ConteoDetalle[]) => {
            console.log('Conteo detalles loaded:', detalles);
            this.conteoDetalles = detalles;

            // Store the billete values from conteo detalles BEFORE initializing form
            this.conteoDetalles.forEach(detalle => {
              if (detalle.monedaBillete && detalle.monedaBillete.id) {
                const controlName = `billete_${detalle.monedaBillete.id}`;
                this.billeteValuesStore[controlName] = detalle.cantidad;
                console.log(`Setting value for ${controlName}: ${detalle.cantidad}`);
              }
            });

            console.log('All billete values loaded to store:', {...this.billeteValuesStore});

            // Now that we have all the data, initialize the form for the active currency
            if (this.activeCurrency) {
              this.initConteoFields();
            }

            // Update template properties after initialization
            this.updatePropertiesForTemplate();

            this.loading = false;
          },
          (error: any) => {
            console.error('Error loading conteo detalles:', error);
            this.loading = false;
          }
        );
      },
      (error: any) => {
        console.error('Error loading conteo:', error);
        this.loading = false;
      }
    );
  }

  private updateDispositivoName(): void {
    this.dispositivoName = this.getDispositivoName();
  }

  /**
   * Load conteo cierre data
   */
  private loadConteoCierreData(conteoCierreId: number): void {
    if (!conteoCierreId) {
      console.error('No conteo cierre ID provided');
      return;
    }

    console.log(`Loading conteo cierre data for conteoCierreId: ${conteoCierreId}`);

    // Get the conteo cierre details
    this.repositoryService.getConteo(conteoCierreId).subscribe(
      (conteo: Conteo) => {
        console.log('Conteo cierre loaded:', conteo);
        this.existingConteoCierre = conteo;

        // Get the conteo cierre detalles
        this.repositoryService.getConteoDetalles(conteoCierreId).subscribe(
          (detalles: ConteoDetalle[]) => {
            console.log('Conteo cierre detalles loaded:', detalles);
            this.conteoCierreDetalles = detalles;

            // Store the billete values from conteo cierre detalles
            this.conteoCierreDetalles.forEach(detalle => {
              if (detalle.monedaBillete && detalle.monedaBillete.id) {
                const controlName = `cierre_billete_${detalle.monedaBillete.id}`;
                this.cierreBilleteValuesStore[controlName] = detalle.cantidad;
                console.log(`Setting cierre value for ${controlName}: ${detalle.cantidad}`);
              }
            });

            console.log('All cierre billete values loaded to store:', {...this.cierreBilleteValuesStore});

            // Now that we have all the data, initialize the form for the active cierre currency
            if (this.monedasConfig.length > 0) {
              this.activeCierreCurrency = this.monedasConfig[0]; // Start with first currency
              this.initConteoCierreFields();
            }

            // Update template properties
            this.updateCierrePropertiesForTemplate();
          },
          (error: any) => {
            console.error('Error loading conteo cierre detalles:', error);
          }
        );
      },
      (error: any) => {
        console.error('Error loading conteo cierre:', error);
      }
    );
  }

  // Add a method to check for open cajas for each dispositivo
  private checkOpenCajas(): void {
    // Get all cajas to check for open ones
    this.repositoryService.getCajas().subscribe(
      cajas => {
        // Filter cajas by estado = ABIERTO and filter by dispositivo
        const openCajas = cajas.filter(caja => caja.estado === 'ABIERTO');

        // Create a map of dispositivo IDs with open cajas
        const openDispositivoIds = new Set(openCajas.map(caja =>
          caja.dispositivo?.id).filter(id => id !== undefined));

        // Include the excluded dispositivo ID if provided
        if (this.excludeDispositivoId && !openDispositivoIds.has(this.excludeDispositivoId)) {
          openDispositivoIds.add(this.excludeDispositivoId);
        }

        // Filter out dispositivos that already have open cajas
        this.dispositivos = this.dispositivos.filter(dispositivo =>
          !openDispositivoIds.has(dispositivo.id));

        this.loading = false;

        // After filtering dispositivos, try to find current device by MAC address
        this.detectCurrentDevice();

        // Load monedas after dispositivos are loaded
        this.loadMonedas();
      },
      error => {
        console.error('Error checking open cajas:', error);
        this.loading = false;

        // Even in case of error, continue loading
        this.detectCurrentDevice();
        this.loadMonedas();
      }
    );
  }
}
