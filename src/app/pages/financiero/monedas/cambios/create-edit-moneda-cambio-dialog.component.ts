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
  }

  private loadMonedas(): void {
    this.loading = true;
    this.repositoryService.getMonedas().subscribe(
      (monedas) => {
        this.monedas = monedas.filter(m => m.activo);
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
    this.form.patchValue({
      monedaOrigen: cambio.monedaOrigen,
      monedaDestino: cambio.monedaDestino,
      compraOficial: cambio.compraOficial,
      ventaOficial: cambio.ventaOficial,
      compraLocal: cambio.compraLocal,
      ventaLocal: cambio.ventaLocal,
      activo: cambio.activo
    });
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
}
