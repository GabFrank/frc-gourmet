import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RepositoryService } from '../../../database/repository.service';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MovimientoStock, TipoReferencia } from '../../../database/entities/productos/movimiento-stock.entity';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TipoMedida } from '../../../database/entities/productos/ingrediente.entity';

@Component({
  selector: 'app-create-edit-movimiento-stock',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDialogModule,
    MatCardModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule
  ],
  templateUrl: './create-edit-movimiento-stock.component.html',
  styleUrls: ['./create-edit-movimiento-stock.component.scss']
})
export class CreateEditMovimientoStockComponent implements OnInit {
  form: FormGroup;
  isLoading = false;
  isEditMode: boolean;
  productosOptions: any[] = [];
  ingredientesOptions: any[] = [];
  tipoReferencias = Object.values(TipoReferencia);
  tipoMedidas = Object.values(TipoMedida);

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreateEditMovimientoStockComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { movimientoStock?: MovimientoStock, isEditMode: boolean }
  ) {
    this.isEditMode = data.isEditMode;
    
    this.form = this.fb.group({
      productoId: [null],
      ingredienteId: [null],
      tipoMedida: ['', Validators.required],
      cantidadActual: ['', [Validators.required, Validators.min(0)]],
      referencia: [null],
      tipoReferencia: [TipoReferencia.AJUSTE, Validators.required],
      activo: [true]
    }, { validators: this.validateProductoOrIngrediente });
  }

  async ngOnInit(): Promise<void> {
    this.isLoading = true;
    try {
      // Load productos for dropdown
      const productos = await this.repositoryService.getProductos().toPromise();
      this.productosOptions = productos || [];

      // Load ingredientes for dropdown
      const ingredientes = await this.repositoryService.getIngredientes().toPromise();
      this.ingredientesOptions = ingredientes || [];

      // Set form values in edit mode
      if (this.isEditMode && this.data.movimientoStock) {
        this.form.patchValue({
          productoId: this.data.movimientoStock.productoId,
          ingredienteId: this.data.movimientoStock.ingredienteId,
          tipoMedida: this.data.movimientoStock.tipoMedida,
          cantidadActual: this.data.movimientoStock.cantidadActual,
          referencia: this.data.movimientoStock.referencia,
          tipoReferencia: this.data.movimientoStock.tipoReferencia,
          activo: this.data.movimientoStock.activo
        });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error al cargar los datos', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  validateProductoOrIngrediente(group: FormGroup): { [key: string]: any } | null {
    const productoId = group.get('productoId')?.value;
    const ingredienteId = group.get('ingredienteId')?.value;

    if (!productoId && !ingredienteId) {
      return { 'requireProductoOrIngrediente': true };
    } else if (productoId && ingredienteId) {
      return { 'bothProductoAndIngrediente': true };
    }

    return null;
  }

  onProductoChange() {
    if (this.form.get('productoId')?.value) {
      this.form.get('ingredienteId')?.setValue(null);
      // Optionally, update tipoMedida based on selected producto
    }
  }

  onIngredienteChange() {
    if (this.form.get('ingredienteId')?.value) {
      this.form.get('productoId')?.setValue(null);
      // Find the selected ingrediente to get its tipoMedida
      const selectedIngrediente = this.ingredientesOptions.find(
        i => i.id === this.form.get('ingredienteId')?.value
      );
      if (selectedIngrediente && selectedIngrediente.tipoMedida) {
        this.form.get('tipoMedida')?.setValue(selectedIngrediente.tipoMedida);
      }
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading = true;
    try {
      const formData = this.form.value;
      let result;

      if (this.isEditMode && this.data.movimientoStock) {
        result = await this.repositoryService.updateMovimientoStock(
          this.data.movimientoStock.id, 
          formData
        ).toPromise();
        this.snackBar.open('Movimiento de stock actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        result = await this.repositoryService.createMovimientoStock(formData).toPromise();
        this.snackBar.open('Movimiento de stock creado correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(result);
    } catch (error) {
      console.error('Error saving movimiento stock:', error);
      this.snackBar.open('Error al guardar el movimiento de stock', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }
} 