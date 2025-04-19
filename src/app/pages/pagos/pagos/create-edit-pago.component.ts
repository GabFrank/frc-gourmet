import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray, AbstractControl } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Observable, firstValueFrom, of } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { Compra, CompraEstado, Moneda } from '../../../database/entities';
import { Caja, CajaEstado } from '../../../database/entities/financiero/caja.entity';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from '../../../services/tabs.service';
import { CurrencyInputComponent } from '../../../shared/components/currency-input/currency-input.component';
import { PagosService, Pago, PagoDetalle } from '../../../core/services/pagos.service';
import { ComprasService } from '../../../core/services/compras.service';
import { MetodoPago } from '../../../core/enums/metodo-pago.enum';
import { PagoEstado } from '../../../database/entities/compras/estado.enum';

@Component({
  selector: 'app-create-edit-pago',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDividerModule,
    MatDialogModule,
    MatTableModule,
    MatCheckboxModule,
    ConfirmationDialogComponent,
    CurrencyInputComponent
  ],
  templateUrl: './create-edit-pago.component.html',
  styleUrls: ['./create-edit-pago.component.scss']
})
export class CreateEditPagoComponent implements OnInit {
  @Input() data: any;

  // Forms
  pagoForm: FormGroup;
  detalleForm: FormGroup;

  // Data
  compra?: Compra;
  compraId?: number;
  pago?: Pago;
  pagoId?: number;
  isEditing = false;
  isLoading = false;
  moneda?: Moneda;
  monedas: Moneda[] = [];
  cajas: Caja[] = [];
  formasPago: FormasPago[] = [];
  detallesActionsEnabled = true;

  // Table columns
  displayedColumns: string[] = ['descripcion', 'formaPago', 'valor', 'moneda', 'acciones'];

  // Payment method options
  metodoPagoOptions = [
    { value: MetodoPago.EFECTIVO, label: 'Efectivo' },
    { value: MetodoPago.TARJETA, label: 'Tarjeta' },
    { value: MetodoPago.TRANSFERENCIA, label: 'Transferencia' },
    { value: MetodoPago.CHEQUE, label: 'Cheque' },
    { value: MetodoPago.CREDITO, label: 'Crédito' }
  ];

  // Estado options
  estadoOptions = [
    { value: PagoEstado.ABIERTO, label: 'Abierto' },
    { value: PagoEstado.PAGO_PARCIAL, label: 'Pago Parcial' },
    { value: PagoEstado.PAGADO, label: 'Pagado' },
    { value: PagoEstado.CANCELADO, label: 'Cancelado' }
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
    private pagosService: PagosService,
    private comprasService: ComprasService
  ) {
    // Initialize the main form
    this.pagoForm = this.fb.group({
      fecha: [new Date(), Validators.required],
      monto: [0, [Validators.required, Validators.min(0.01)]],
      metodoPago: [MetodoPago.EFECTIVO, Validators.required],
      caja: [null, Validators.required],
      activo: [true],
      estado: [PagoEstado.ABIERTO, Validators.required],
      compraId: [null],
      detalles: this.fb.array([]) // Add FormArray for detalles
    });

    // Initialize the detalle form
    this.detalleForm = this.fb.group({
      descripcion: ['', Validators.required],
      valor: [0, [Validators.required, Validators.min(0.01)]],
      moneda: [null, Validators.required],
      formaPago: [null, Validators.required]
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.isLoading = true;

      // Load data
      await this.loadMonedas();
      await this.loadCajas();
      await this.loadFormasPago();

      // Check if we're editing an existing pago or creating a new one for a compra
      if (this.data) {
        if (this.data.pagoId) {
          // Editing existing pago
          this.pagoId = this.data.pagoId;
          this.isEditing = true;
          await this.loadPago(this.pagoId);
        } else if (this.data.compraId) {
          // Creating new pago for a compra
          this.compraId = this.data.compraId;
          this.pagoForm.patchValue({
            compraId: this.compraId
          });
          await this.loadCompra(this.compraId);
          this.initFormForCompra();
        }
      }
    } catch (error: any) {
      this.showError(`Error al inicializar el formulario: ${error.message}`);
      console.error('Initialization error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load formas pago
   */
  private async loadFormasPago(): Promise<void> {
    try {
      // Get all formas pago from repository
      this.formasPago = await firstValueFrom(this.repositoryService.getFormasPago());

      // Set default forma pago if available
      if (this.formasPago.length > 0) {
        // Find the default forma pago (marked as principal)
        const defaultFormaPago = this.formasPago.find(fp => fp.principal) || this.formasPago[0];
        this.detalleForm.patchValue({
          formaPago: defaultFormaPago
        });
      }
    } catch (error: any) {
      console.error('Error loading formas pago:', error);
      this.showError(`Error al cargar las formas de pago: ${error.message}`);
      this.formasPago = [];
    }
  }

  /**
   * Load cajas with ABIERTO estado
   */
  private async loadCajas(): Promise<void> {
    try {
      // Get all cajas from repository
      const allCajas = await firstValueFrom(this.repositoryService.getCajas());

      // Filter to only include cajas with estado ABIERTO
      this.cajas = allCajas.filter(caja => caja.estado === CajaEstado.ABIERTO);

      // If there are cajas, select the first one by default
      if (this.cajas.length > 0) {
        this.pagoForm.patchValue({
          caja: this.cajas[0]
        });
      }
    } catch (error: any) {
      console.error('Error loading cajas:', error);
      this.showError(`Error al cargar las cajas: ${error.message}`);
      this.cajas = [];
    }
  }

  /**
   * Load monedas for the dropdown
   */
  private async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
    } catch (error: any) {
      console.error('Error loading monedas:', error);
      this.showError(`Error al cargar las monedas: ${error.message}`);
      this.monedas = [];
    }
  }

  /**
   * Load compra data to create a payment for it
   */
  private async loadCompra(compraId: number | undefined): Promise<void> {
    if (!compraId) {
      this.showError('ID de compra no especificado');
      return;
    }

    try {
      this.compra = await firstValueFrom(this.repositoryService.getCompra(compraId));

      if (!this.compra) {
        throw new Error('Compra no encontrada');
      }

      // Check if compra is FINALIZADO
      if (this.compra.estado !== CompraEstado.FINALIZADO) {
        throw new Error('Solo se pueden realizar pagos a compras finalizadas');
      }

      // Load moneda for the compra
      if (this.compra.moneda?.id) {
        this.moneda = await firstValueFrom(this.repositoryService.getMoneda(this.compra.moneda.id));

        // Pre-select the compra's moneda in the detalle form
        this.detalleForm.patchValue({
          moneda: this.moneda
        });
      }

      // Get total amount due for the compra
      const montoRestante = await this.comprasService.getCompraRemainingAmount(compraId);

      // Update form with the remaining amount
      this.pagoForm.patchValue({
        monto: montoRestante > 0 ? montoRestante : 0
      });

    } catch (error: any) {
      this.showError(`Error al cargar la compra: ${error.message}`);
      console.error('Error loading compra:', error);
    }
  }

  /**
   * Load existing pago for editing
   */
  private async loadPago(pagoId: number | undefined): Promise<void> {
    if (!pagoId) {
      this.showError('ID de pago no especificado');
      return;
    }

    try {
      const result = await this.pagosService.getPagoById(pagoId);

      if (!result) {
        throw new Error('Pago no encontrado');
      }

      this.pago = result;

      // Load compra information
      this.compraId = this.pago.compraId;
      await this.loadCompra(this.pago.compraId);

      // Find the caja object
      let cajaObj = null;
      if (this.pago.cajaId) {
        cajaObj = this.cajas.find(c => c.id === this.pago?.cajaId);
      }

      // Update form with pago data
      this.pagoForm.patchValue({
        fecha: this.pago.fecha,
        monto: this.pago.monto,
        metodoPago: this.pago.metodoPago,
        caja: cajaObj,
        activo: this.pago.activo,
        estado: this.pago.estado || PagoEstado.ABIERTO,
        compraId: this.pago.compraId
      });

      // Load payment details
      await this.loadPagoDetails(pagoId);

    } catch (error: any) {
      this.showError(`Error al cargar el pago: ${error.message}`);
      console.error('Error loading pago:', error);
    }
  }

  /**
   * Load pago details for editing
   */
  private async loadPagoDetails(pagoId: number): Promise<void> {
    try {
      // In a real implementation, you would fetch details from repository
      // For now, we'll use mock data
      const mockDetails = [
        {
          id: 1,
          descripcion: 'Pago principal',
          valor: this.pago?.monto || 0,
          moneda: this.moneda,
          formaPago: this.formasPago.length > 0 ? this.formasPago[0] : null
        }
      ];

      // Clear existing detalles
      this.detalles.clear();

      // Add each detalle to the form array
      mockDetails.forEach(detalle => {
        this.detalles.push(
          this.fb.group({
            id: [detalle.id],
            descripcion: [detalle.descripcion, Validators.required],
            valor: [detalle.valor, [Validators.required, Validators.min(0.01)]],
            moneda: [detalle.moneda, Validators.required],
            formaPago: [detalle.formaPago, Validators.required]
          })
        );
      });
    } catch (error: any) {
      console.error('Error loading pago details:', error);
      this.showError(`Error al cargar los detalles del pago: ${error.message}`);
    }
  }

  /**
   * Initialize form with compra data
   */
  private initFormForCompra(): void {
    if (!this.compra) return;

    // Pre-select payment method based on forma pago of compra if available
    const formaPago = this.compra.formaPago?.nombre?.toUpperCase();
    let metodoPago = MetodoPago.EFECTIVO; // Default

    if (formaPago) {
      if (formaPago.includes('TARJETA')) {
        metodoPago = MetodoPago.TARJETA;
      } else if (formaPago.includes('TRANSFERENCIA')) {
        metodoPago = MetodoPago.TRANSFERENCIA;
      } else if (formaPago.includes('CHEQUE')) {
        metodoPago = MetodoPago.CHEQUE;
      }
    }

    this.pagoForm.patchValue({
      metodoPago: metodoPago
    });

    // Add a default detail for the payment
    if (this.moneda && this.compra) {
      // Find default forma pago
      const defaultFormaPago = this.formasPago.find(fp => fp.principal) ||
                              (this.formasPago.length > 0 ? this.formasPago[0] : null);

      // Create a default detalle using the compra's information
      this.detalleForm.patchValue({
        descripcion: `Pago de compra #${this.compra.id}`,
        valor: this.pagoForm.get('monto')?.value || 0,
        moneda: this.moneda,
        formaPago: defaultFormaPago
      });
    }
  }

  /**
   * Add a payment detail
   */
  async addDetalle(): Promise<void> {
    if (this.detalleForm.invalid) {
      this.markFormGroupTouched(this.detalleForm);
      this.showError('Por favor complete todos los campos del detalle correctamente.');
      return;
    }

    const formValues = this.detalleForm.value;

    // Create a detalle form group
    const detalleGroup = this.fb.group({
      descripcion: [formValues.descripcion, Validators.required],
      valor: [formValues.valor, [Validators.required, Validators.min(0.01)]],
      moneda: [formValues.moneda, Validators.required],
      formaPago: [formValues.formaPago, Validators.required]
    });

    // Add to the form array
    this.detalles.push(detalleGroup);

    // Update the total monto
    this.updateTotalMonto();

    // Reset the form for new entry
    this.detalleForm.reset({
      descripcion: '',
      valor: 0,
      moneda: this.moneda,
      formaPago: this.formasPago.find(fp => fp.principal) ||
                (this.formasPago.length > 0 ? this.formasPago[0] : null)
    });

    this.showSuccess('Detalle agregado correctamente');
  }

  /**
   * Save the pago (create or update)
   */
  async savePago(): Promise<void> {
    if (this.pagoForm.invalid) {
      this.markFormGroupTouched(this.pagoForm);
      this.showError('Por favor complete todos los campos requeridos correctamente.');
      return;
    }

    if (!this.compraId) {
      this.showError('No se especificó la compra a la que pertenece este pago.');
      return;
    }

    try {
      this.isLoading = true;

      const formData = this.pagoForm.value;
      const pagoData: Pago = {
        compraId: this.compraId,
        fecha: formData.fecha,
        monto: formData.monto,
        metodoPago: formData.metodoPago,
        cajaId: formData.caja?.id,
        activo: formData.activo,
        estado: formData.estado
      };

      // Prepare detalles data
      const detallesData: PagoDetalle[] = this.detalles.controls.map(control => {
        const detalleValue = control.value;
        return {
          descripcion: detalleValue.descripcion,
          valor: detalleValue.valor,
          monedaId: detalleValue.moneda?.id,
          formaPagoId: detalleValue.formaPago?.id
        };
      });

      // Create full pago object with detalles
      const pagoWithDetalles: Pago = {
        ...pagoData,
        detalles: detallesData
      };

      if (this.isEditing && this.pagoId) {
        // Update existing pago
        await this.pagosService.updatePago(this.pagoId, pagoWithDetalles);
        this.showSuccess('Pago actualizado correctamente');
      } else {
        // Create new pago
        const savedPago = await this.pagosService.createPago(pagoWithDetalles);
        this.pagoId = savedPago.id;
        this.showSuccess('Pago registrado correctamente');
      }

      // Close the tab after saving
      this.cancel();
    } catch (error: any) {
      this.showError(`Error al guardar el pago: ${error.message}`);
      console.error('Error saving pago:', error);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Get FormArray for detalles
   */
  get detalles(): FormArray {
    return this.pagoForm.get('detalles') as FormArray;
  }

  /**
   * Get detalles with computed values for displaying in the template
   */
  get detallesWithComputedValues(): Array<{control: AbstractControl, computedValues: any}> {
    if (!this.detalles) {
      return [];
    }

    return this.detalles.controls.map(control => {
      const value = control.value;
      return {
        control: control,
        computedValues: {
          monedaSymbol: value.moneda?.simbolo || '',
          monedaNombre: value.moneda?.denominacion || 'Sin moneda',
          formaPagoNombre: value.formaPago?.nombre || 'Sin forma de pago',
          subtotal: value.valor
        }
      };
    });
  }

  /**
   * Update the total monto based on detalles
   */
  private updateTotalMonto(): void {
    let total = 0;

    // Sum all detalle valores
    for (let i = 0; i < this.detalles.length; i++) {
      const detalle = this.detalles.at(i).value;
      total += Number(detalle.valor);
    }

    // Update the monto field
    this.pagoForm.patchValue({
      monto: total
    });
  }

  /**
   * Remove a payment detail
   */
  async removeDetalle(index: number): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar detalle',
        message: '¿Está seguro que desea eliminar este detalle del pago?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      // Remove from form array
      this.detalles.removeAt(index);

      // Update the total monto
      this.updateTotalMonto();

      this.showSuccess('Detalle eliminado correctamente');
    }
  }

  /**
   * Mark all controls in a form group as touched
   */
  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.values(formGroup.controls).forEach(control => {
      control.markAsTouched();
    });
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }

  /**
   * Cancel and close the tab
   */
  cancel(): void {
    this.tabsService.removeTab(this.tabsService.currentIndex);
  }

  /**
   * Used by the tab service to set data
   */
  setData(data: any): void {
    console.log('Setting data for Create/Edit Pago component:', data);
    this.data = data;

    if (data?.pagoId) {
      this.pagoId = data.pagoId;
      this.isEditing = true;
      this.loadPago(this.pagoId);
    } else if (data?.compraId) {
      this.compraId = data.compraId;
      this.pagoForm.patchValue({
        compraId: this.compraId
      });
      this.loadCompra(this.compraId);
      this.initFormForCompra();
    }
  }

  /**
   * Get formatted compra info for display
   */
  get compraInfo(): string {
    if (!this.compra) return '';
    const moneda = this.moneda?.simbolo || '';
    return `#${this.compra.id} - ${this.compra.proveedor?.nombre || 'Sin proveedor'} (${moneda})`;
  }

  /**
   * Get component title based on edit/create mode
   */
  get title(): string {
    return this.isEditing ? 'Editar Pago' : 'Registrar Pago';
  }

  /**
   * Display the moneda details
   */
  displayMoneda(moneda: Moneda | null): string {
    if (!moneda) return '';
    return `${moneda.denominacion} (${moneda.simbolo})`;
  }

  /**
   * Display the forma pago details
   */
  displayFormaPago(formaPago: FormasPago | null): string {
    if (!formaPago) return '';
    return formaPago.nombre;
  }
}
