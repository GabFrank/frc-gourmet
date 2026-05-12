import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { RepositoryService } from 'src/app/database/repository.service';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from 'src/app/database/entities/financiero/moneda-cambio.entity';
import { CurrencyInputComponent } from 'src/app/shared/components/currency-input/currency-input.component';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-create-edit-moneda-cambio-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    CurrencyInputComponent
  ],
  templateUrl: './create-edit-moneda-cambio-dialog.component.html',
  styleUrls: ['./create-edit-moneda-cambio-dialog.component.scss']
})
export class CreateEditMonedaCambioDialogComponent implements OnInit {
  form: FormGroup;
  monedas: Moneda[] = [];
  loading = false;
  saving = false;
  isEditMode = false;
  scraping = false;

  constructor(
    private dialogRef: MatDialogRef<CreateEditMonedaCambioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { monedaCambio: MonedaCambio | null, monedaOrigen?: Moneda },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    // Initialize form
    this.form = this.fb.group({
      monedaOrigen: [null, Validators.required],
      monedaDestino: [null, Validators.required],
      compraOficial: [null, [Validators.required, Validators.min(0.0001)]],
      ventaOficial: [null, [Validators.required, Validators.min(0.0001)]],
      compraLocal: [null, [Validators.required, Validators.min(0.0001)]],
      ventaLocal: [null, [Validators.required, Validators.min(0.0001)]],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.loadMonedas();
    this.isEditMode = !!this.data.monedaCambio;

    // If in edit mode, populate form with data
    if (this.isEditMode && this.data.monedaCambio) {
      this.populateForm();
    } else if (this.data.monedaOrigen) {
      // If monedaOrigen is provided, set it and disable the field
      this.form.patchValue({
        monedaOrigen: this.data.monedaOrigen
      });
      this.form.get('monedaOrigen')?.disable();
    }

    // Add a listener for moneda changes to prevent circular dependencies
    this.form.get('monedaOrigen')?.valueChanges.subscribe(moneda => {
      // When moneda changes, we need to temporarily set the currency values to null
      // to avoid potential recursion in ngx-currency
      if (moneda) {
        const currentValues = {
          compraOficial: this.form.get('compraOficial')?.value,
          ventaOficial: this.form.get('ventaOficial')?.value,
          compraLocal: this.form.get('compraLocal')?.value,
          ventaLocal: this.form.get('ventaLocal')?.value
        };

        // First set to null to break any potential circular references
        this.form.patchValue({
          compraOficial: null,
          ventaOficial: null,
          compraLocal: null,
          ventaLocal: null
        }, { emitEvent: false });

        // After a small delay, restore the values safely
        setTimeout(() => {
          this.form.patchValue({
            compraOficial: currentValues.compraOficial,
            ventaOficial: currentValues.ventaOficial,
            compraLocal: currentValues.compraLocal,
            ventaLocal: currentValues.ventaLocal
          }, { emitEvent: false });
        }, 10);
      }
    });
  }

  private loadMonedas(): void {
    this.loading = true;
    this.repositoryService.getMonedas().subscribe(
      (monedas) => {
        this.monedas = monedas.filter(m => m.activo);
        // En modo crear, pre-seleccionar la moneda principal como destino
        // (los valores se ingresan en moneda destino, ej. Gs para PY).
        if (!this.isEditMode && !this.form.get('monedaDestino')?.value) {
          const principal = this.monedas.find((m) => m.principal);
          if (principal) {
            this.form.patchValue({ monedaDestino: principal });
          }
        }
        this.loading = false;
      },
      (error) => {
        console.error('Error loading monedas:', error);
        this.snackBar.open('Error al cargar las monedas', 'Cerrar', {
          duration: 3000
        });
        this.loading = false;
      }
    );
  }

  private populateForm(): void {
    const cambio = this.data.monedaCambio!;
    
    // First set the non-currency values
    this.form.patchValue({
      monedaOrigen: cambio.monedaOrigen,
      monedaDestino: cambio.monedaDestino,
      activo: cambio.activo
    });

    // Wait for Angular change detection cycle to update moneda selection
    setTimeout(() => {
      // Then safely set the currency values
      this.form.patchValue({
        compraOficial: cambio.compraOficial,
        ventaOficial: cambio.ventaOficial,
        compraLocal: cambio.compraLocal,
        ventaLocal: cambio.ventaLocal
      });
    }, 100);
  }

  onSubmit(): void {
    if (this.form.invalid) {
      // Mark all fields as touched to display validation errors
      Object.keys(this.form.controls).forEach(key => {
        const control = this.form.get(key);
        control?.markAsTouched();
      });
      return;
    }

    this.saving = true;
    const formValue = this.form.getRawValue(); // Use getRawValue to include disabled fields

    const cambioData: Partial<MonedaCambio> = {
      monedaOrigen: formValue.monedaOrigen,
      monedaDestino: formValue.monedaDestino,
      compraOficial: formValue.compraOficial,
      ventaOficial: formValue.ventaOficial,
      compraLocal: formValue.compraLocal,
      ventaLocal: formValue.ventaLocal,
      activo: formValue.activo
    };

    try {
      if (this.isEditMode && this.data.monedaCambio) {
        // Update existing exchange rate
        this.repositoryService.updateMonedaCambio(this.data.monedaCambio.id!, cambioData).subscribe(
          (result) => {
            this.saving = false;
            this.snackBar.open('Cambio actualizado exitosamente', 'Cerrar', {
              duration: 3000
            });
            this.dialogRef.close(result);
          },
          (error) => {
            console.error('Error updating cambio:', error);
            this.saving = false;
            this.snackBar.open('Error al actualizar el cambio. Es posible que el backend no tenga implementado el servicio para monedas de cambio.', 'Entendido', {
              duration: 7000
            });
          }
        );
      } else {
        // Create new exchange rate
        this.repositoryService.createMonedaCambio(cambioData).subscribe(
          (result) => {
            this.saving = false;
            this.snackBar.open('Cambio creado exitosamente', 'Cerrar', {
              duration: 3000
            });
            this.dialogRef.close(result);
          },
          (error) => {
            console.error('Error creating cambio:', error);
            this.saving = false;
            this.snackBar.open('Error al crear el cambio. Es posible que el backend no tenga implementado el servicio para monedas de cambio.', 'Entendido', {
              duration: 7000
            });
          }
        );
      }
    } catch (error) {
      console.error('Error in onSubmit:', error);
      this.saving = false;
      this.snackBar.open('Error al procesar la operación. Es posible que el backend no tenga implementado el servicio para monedas de cambio.', 'Entendido', {
        duration: 7000
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  compareMonedas(moneda1: Moneda, moneda2: Moneda): boolean {
    return moneda1 && moneda2 && moneda1.id === moneda2.id;
  }

  /** Sugiere una compra local con margen de 50 puntos hacia abajo respecto del
   * mercado, redondeada a múltiplo de 50 con ties hacia abajo.
   * Ejemplos: 6090 → 6000, 6140 → 6100, 1190 → 1150, 1225 → 1150. */
  private sugerirCompraLocal(compraMercado: number): number {
    if (!Number.isFinite(compraMercado)) return compraMercado;
    const ajustado = compraMercado - 50;
    return Math.floor((ajustado + 24) / 50) * 50;
  }

  /** Sugiere una venta local con margen de 50 puntos hacia arriba respecto del
   * mercado, redondeada a múltiplo de 50 con ties hacia arriba. */
  private sugerirVentaLocal(ventaMercado: number): number {
    if (!Number.isFinite(ventaMercado)) return ventaMercado;
    const ajustado = ventaMercado + 50;
    return Math.ceil((ajustado - 24) / 50) * 50;
  }

  /** Hace scraping de cotizaciones de mercado (nortecambios.com.py) y rellena
   * los campos del cambio oficial para la moneda de origen seleccionada. */
  async obtenerCotizacionMercado(): Promise<void> {
    const origen: Moneda | null = this.form.get('monedaOrigen')?.value;
    if (!origen?.denominacion) {
      this.snackBar.open('Seleccioná la moneda de origen primero', 'OK', { duration: 3000 });
      return;
    }
    const key = origen.denominacion.toUpperCase();
    this.scraping = true;
    try {
      const res: any = await firstValueFrom(this.repositoryService.getCotizacionMercado());
      if (!res?.success) {
        this.snackBar.open(
          'No se pudo obtener cotización del mercado: ' + (res?.message || 'error desconocido'),
          'OK',
          { duration: 5000 },
        );
        return;
      }
      const item = res.monedas?.[key];
      if (!item) {
        this.snackBar.open(
          `Nortecambios no devolvió cotización para ${key}`,
          'OK',
          { duration: 4000 },
        );
        return;
      }
      const compraLocalSugerida = this.sugerirCompraLocal(item.compraMercado);
      const ventaLocalSugerida = this.sugerirVentaLocal(item.ventaMercado);

      this.form.patchValue({
        compraOficial: item.compraMercado,
        ventaOficial: item.ventaMercado,
        compraLocal: compraLocalSugerida,
        ventaLocal: ventaLocalSugerida,
      });
      this.snackBar.open(
        `Cotización de ${key} actualizada (fuente: ${res.fuente}). Local sugerido con margen de 50.`,
        'OK',
        { duration: 4000 },
      );
    } catch (e: any) {
      this.snackBar.open('Error obteniendo cotización: ' + (e?.message || e), 'OK', {
        duration: 5000,
      });
    } finally {
      this.scraping = false;
    }
  }
}
