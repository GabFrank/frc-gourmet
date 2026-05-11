import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { IngredienteSaborDialogComponent } from '../ingrediente-sabor-dialog/ingrediente-sabor-dialog.component';
import { SaboresService } from '../../../../services/sabores.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

export interface CreateEditSaborDialogData {
  categoria?: string;
  isEditMode?: boolean;
}

@Component({
  selector: 'app-create-edit-sabor-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatCardModule,
    MatTooltipModule,
    CurrencyInputDirective,
  ],
  templateUrl: './create-edit-sabor-dialog.component.html',
  styleUrls: ['./create-edit-sabor-dialog.component.scss']
})
export class CreateEditSaborDialogComponent implements OnInit {

  saborForm!: FormGroup;
  loading = false;
  isEditMode = false;
  decimalesMoneda = 0;

  // Columnas para las tablas
  ingredientesBaseColumns: string[] = ['nombre', 'cantidad', 'unidad', 'acciones'];
  variacionesColumns: string[] = ['subcategoria', 'multiplicador', 'precio', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    private saboresService: SaboresService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<CreateEditSaborDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CreateEditSaborDialogData
  ) { }

  ngOnInit(): void {
    this.initForm();

    if (this.data?.categoria) {
      this.isEditMode = true;
      this.loadSaborDetails(this.data.categoria);
    } else {
      // Para crear un nuevo sabor, agregar una variación por defecto
      this.agregarVariacion();
    }
  }

  initForm(): void {
    this.saborForm = this.fb.group({
      categoria: [this.data?.categoria || '', Validators.required],
      ingredientesBase: this.fb.array([]),
      variaciones: this.fb.array([])
    });
  }

  loadSaborDetails(categoria: string): void {
    this.loading = true;
    this.saboresService.getSaborDetails(categoria).subscribe({
      next: (saborDetails) => {
        this.patchFormWithSaborData(saborDetails);
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open('Error al cargar los detalles del sabor.', 'Cerrar', { duration: 5000 });
        console.error(error);
      }
    });
  }

  private patchFormWithSaborData(data: any): void {
    this.saborForm.patchValue({
      categoria: data.categoria
    });

    // Limpiar arrays existentes
    while (this.ingredientesBase.length) {
      this.ingredientesBase.removeAt(0);
    }
    while (this.variaciones.length) {
      this.variaciones.removeAt(0);
    }

    // Poblar ingredientes base
    if (data.ingredientesBase && Array.isArray(data.ingredientesBase)) {
      data.ingredientesBase.forEach((ing: any) => {
        const ingredienteFormGroup = this.nuevoIngredienteFormGroup();
        ingredienteFormGroup.patchValue(ing);
        this.ingredientesBase.push(ingredienteFormGroup);
      });
    }

    // Poblar variaciones
    if (data.variaciones && Array.isArray(data.variaciones)) {
      data.variaciones.forEach((variacion: any) => {
        const variacionFormGroup = this.nuevaVariacionFormGroup();
        variacionFormGroup.patchValue({
          subcategoria: variacion.subcategoria,
          multiplicador: variacion.multiplicador || 1,
          precio: variacion.precio || 0
        });

        // Poblar ingredientes específicos para esta variación
        if (variacion.ingredientesEspecificos && Array.isArray(variacion.ingredientesEspecificos)) {
          const ingredientesEspecificosArray = variacionFormGroup.get('ingredientesEspecificos') as FormArray;
          variacion.ingredientesEspecificos.forEach((ing: any) => {
            const ingredienteFormGroup = this.nuevoIngredienteFormGroup();
            ingredienteFormGroup.patchValue(ing);
            ingredientesEspecificosArray.push(ingredienteFormGroup);
          });
        }

        this.variaciones.push(variacionFormGroup);
      });
    }
  }

  // --- Getters para fácil acceso desde el template ---
  get ingredientesBase(): FormArray {
    return this.saborForm.get('ingredientesBase') as FormArray;
  }

  get variaciones(): FormArray {
    return this.saborForm.get('variaciones') as FormArray;
  }

  ingredientesEspecificos(variacionIndex: number): FormArray {
    return this.variaciones.at(variacionIndex).get('ingredientesEspecificos') as FormArray;
  }

  // --- Métodos para crear FormGroups ---
  nuevoIngredienteFormGroup(): FormGroup {
    return this.fb.group({
      productoId: [null, Validators.required],
      nombre: [''], // Se populata al seleccionar producto
      cantidad: [1, [Validators.required, Validators.min(0.0001)]],
      unidad: ['', Validators.required]
    });
  }

  nuevaVariacionFormGroup(): FormGroup {
    return this.fb.group({
      subcategoria: ['', Validators.required], // Ej: GRANDE, MEDIANA
      multiplicador: [1, [Validators.required, Validators.min(0.01)]],
      precio: [0, [Validators.required, Validators.min(0)]],
      ingredientesEspecificos: this.fb.array([])
    });
  }

  // --- Métodos de gestión de ingredientes base ---
  agregarIngredienteBase(): void {
    const dialogRef = this.dialog.open(IngredienteSaborDialogComponent, {
      width: '600px',
      data: { title: 'Agregar Ingrediente Base' }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const ingredienteFormGroup = this.nuevoIngredienteFormGroup();
        ingredienteFormGroup.patchValue(result);
        this.ingredientesBase.push(ingredienteFormGroup);
      }
    });
  }

  editarIngredienteBase(index: number): void {
    const ingrediente = this.ingredientesBase.at(index);
    const dialogRef = this.dialog.open(IngredienteSaborDialogComponent, {
      width: '600px',
      data: {
        title: 'Editar Ingrediente Base',
        ingredienteData: ingrediente.value
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        ingrediente.patchValue(result);
      }
    });
  }

  removerIngredienteBase(index: number): void {
    this.ingredientesBase.removeAt(index);
  }

  // --- Métodos de gestión de variaciones ---
  agregarVariacion(): void {
    this.variaciones.push(this.nuevaVariacionFormGroup());
  }

  removerVariacion(index: number): void {
    this.variaciones.removeAt(index);
  }

  // --- Métodos de gestión de ingredientes específicos ---
  gestionarIngredientesEspecificos(variacionIndex: number): void {
    const variacion = this.variaciones.at(variacionIndex);
    const subcategoria = variacion.get('subcategoria')?.value || `Variación ${variacionIndex + 1}`;

    const dialogRef = this.dialog.open(IngredienteSaborDialogComponent, {
      width: '600px',
      data: {
        title: `Gestionar Ingredientes Específicos - ${subcategoria}`,
        esIngredienteEspecifico: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        const ingredientes = this.ingredientesEspecificos(variacionIndex);
        const ingredienteFormGroup = this.nuevoIngredienteFormGroup();
        ingredienteFormGroup.patchValue(result);
        ingredientes.push(ingredienteFormGroup);
      }
    });
  }

  removerIngredienteEspecifico(variacionIndex: number, ingredienteIndex: number): void {
    const ingredientes = this.ingredientesEspecificos(variacionIndex);
    ingredientes.removeAt(ingredienteIndex);
  }

  // --- Métodos de acción ---
  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    if (this.saborForm.invalid) {
      this.saborForm.markAllAsTouched();
      this.snackBar.open('Por favor, complete todos los campos requeridos.', 'Cerrar', { duration: 3000 });
      return;
    }

    // Validar que haya al menos una variación
    if (this.variaciones.length === 0) {
      this.snackBar.open('Debe agregar al menos una variación.', 'Cerrar', { duration: 3000 });
      return;
    }

    this.loading = true;
    const saborData = this.saborForm.getRawValue();

    console.log('Datos del sabor a enviar:', saborData);

    this.saboresService.createOrUpdateSabor(saborData).subscribe({
      next: (response) => {
        this.loading = false;
        this.snackBar.open(response.message, 'Cerrar', { duration: 3000 });
        this.dialogRef.close(true); // Indicar que se guardó exitosamente
      },
      error: (error) => {
        this.loading = false;
        this.snackBar.open(error.message || 'Error al guardar el sabor', 'Cerrar', { duration: 5000 });
        console.error('Error guardando el sabor:', error);
      }
    });
  }
}
