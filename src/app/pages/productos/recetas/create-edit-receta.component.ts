import { Component, Inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormArray } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { MatBadgeModule } from '@angular/material/badge';
import { MatListModule } from '@angular/material/list';
import { MatCardModule } from '@angular/material/card';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../../database/entities/productos/receta-variacion-item.entity';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { firstValueFrom, Subscription } from 'rxjs';
import { VariationDialogComponent } from './variation-dialog.component';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';

interface DialogData {
  editMode: boolean;
  receta?: Receta;
}

@Component({
  selector: 'app-create-edit-receta',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatTabsModule,
    MatTableModule,
    MatTooltipModule,
    MatExpansionModule,
    MatDividerModule,
    MatBadgeModule,
    MatListModule,
    MatCardModule
  ],
  providers: [
    FormBuilder
  ],
  templateUrl: './create-edit-receta.component.html',
  styleUrls: ['./create-edit-receta.component.scss']
})
export class CreateEditRecetaComponent implements OnInit, OnDestroy {
  recetaForm: FormGroup;
  loading = false;
  savingReceta = false;
  recetaCreated = false;
  recetaId?: number;
  variaciones: RecetaVariacion[] = [];
  variacionItems: { [key: number]: RecetaVariacionItem[] } = {};
  ingredientes: Ingrediente[] = [];
  tipoMedidaOptions = Object.values(TipoMedida);
  monedas: Moneda[] = [];
  defaultMoneda?: Moneda;
  defaultMonedaSimbolo = '$';

  private subscriptions = new Subscription();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaComponent>,
    private dialog: MatDialog,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.recetaForm = this.fb.group({
      nombre: ['', Validators.required],
      modo_preparo: [''],
      tipoMedida: [TipoMedida.UNIDAD],
      calcularCantidad: [false],
      cantidad: [0],
      activo: [true]
    });
  }

  ngOnInit(): void {
    if (this.data.editMode && this.data.receta) {
      this.recetaId = this.data.receta.id;
      this.recetaForm.patchValue({
        nombre: this.data.receta.nombre,
        modo_preparo: this.data.receta.modo_preparo || '',
        tipoMedida: this.data.receta.tipoMedida || TipoMedida.UNIDAD,
        calcularCantidad: this.data.receta.calcularCantidad || false,
        cantidad: this.data.receta.cantidad || 0,
        activo: this.data.receta.activo
      });

      this.loadRecetaVariaciones();
    }

    this.loadIngredientes();
    this.loadMonedas();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  private loadIngredientes(): void {
    this.loading = true;
    this.subscriptions.add(
      this.repositoryService.getIngredientes()
        .subscribe({
          next: (ingredientes) => {
            this.ingredientes = ingredientes.filter(i => i.activo);
            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading ingredientes:', error);
            this.snackBar.open('Error al cargar ingredientes', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        })
    );
  }

  private loadMonedas(): void {
    this.subscriptions.add(
      this.repositoryService.getMonedas()
        .subscribe({
          next: (monedas) => {
            this.monedas = monedas;
            // Find default moneda (principal == true)
            this.defaultMoneda = this.monedas.find(m => m.principal);
            // Pre-compute the default currency symbol
            this.defaultMonedaSimbolo = this.defaultMoneda ? this.defaultMoneda.simbolo : '$';
          },
          error: (error) => {
            console.error('Error loading monedas:', error);
          }
        })
    );
  }

  getDefaultMonedaSimbolo(): string {
    return this.defaultMonedaSimbolo;
  }

  getIngredientName(ingredienteId: number): string {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.descripcion : 'Desconocido';
  }

  getIngredientUnitCost(ingredienteId: number): number {
    const ingrediente = this.ingredientes.find(i => i.id === ingredienteId);
    return ingrediente ? ingrediente.costo || 0 : 0;
  }

  getIngredientTotalCost(item: RecetaVariacionItem): number {
    const ingrediente = this.ingredientes.find(i => i.id === item.ingredienteId);
    if (!ingrediente || !item.activo) return 0;
    return (ingrediente.costo || 0) * item.cantidad;
  }

  private loadRecetaVariaciones(): void {
    if (!this.recetaId) return;

    this.loading = true;
    this.subscriptions.add(
      this.repositoryService.getRecetaVariaciones(this.recetaId)
        .subscribe({
          next: (variaciones) => {
            this.variaciones = variaciones;

            // Load ingredients for each variation
            variaciones.forEach(v => this.loadVariationIngredients(v.id));

            this.loading = false;
          },
          error: (error) => {
            console.error('Error loading variations:', error);
            this.snackBar.open('Error al cargar variaciones', 'Cerrar', { duration: 3000 });
            this.loading = false;
          }
        })
    );
  }

  private loadVariationIngredients(variacionId: number): void {
    this.subscriptions.add(
      this.repositoryService.getRecetaVariacionItems(variacionId)
        .subscribe({
          next: (items) => {
            this.variacionItems[variacionId] = items;
          },
          error: (error) => {
            console.error(`Error loading variation items for variation ${variacionId}:`, error);
          }
        })
    );
  }

  getVariationIngredients(variacionId: number): RecetaVariacionItem[] {
    return this.variacionItems[variacionId] || [];
  }

  addVariation(): void {
    // Create a new variation
    if (!this.recetaId) return;

    this.loading = true;

    const newVariation: Partial<RecetaVariacion> = {
      nombre: 'NUEVA VARIACIÓN',
      activo: true,
      recetaId: this.recetaId,
      costo: 0
    };

    this.repositoryService.createRecetaVariacion(newVariation)
      .subscribe({
        next: (variation) => {
          this.variaciones.push(variation);
          this.variacionItems[variation.id] = [];
          this.loading = false;

          // Immediately open the edit dialog for the new variation
          this.editVariation(variation);

          this.snackBar.open('Variación creada exitosamente', 'Cerrar', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error creating variation:', error);
          this.snackBar.open('Error al crear variación', 'Cerrar', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  editVariation(variacion: RecetaVariacion): void {
    this.openVariationDialog(variacion);
  }

  deleteVariation(variacion: RecetaVariacion): void {
    const confirm = window.confirm(`¿Está seguro que desea eliminar la variación "${variacion.nombre}"?`);
    if (!confirm) return;

    this.loading = true;

    this.repositoryService.deleteRecetaVariacion(variacion.id)
      .subscribe({
        next: () => {
          // Remove from arrays
          const index = this.variaciones.findIndex(v => v.id === variacion.id);
          if (index !== -1) {
            this.variaciones.splice(index, 1);
          }

          // Remove items
          delete this.variacionItems[variacion.id];

          this.loading = false;
          this.snackBar.open('Variación eliminada exitosamente', 'Cerrar', { duration: 3000 });
        },
        error: (error) => {
          console.error('Error deleting variation:', error);
          this.snackBar.open('Error al eliminar variación', 'Cerrar', { duration: 3000 });
          this.loading = false;
        }
      });
  }

  private openVariationDialog(variacion: RecetaVariacion): void {
    const dialogRef = this.dialog.open(VariationDialogComponent, {
      width: '600px',
      data: {
        variacion: variacion,
        ingredientes: this.ingredientes,
        variacionItems: this.variacionItems[variacion.id] || []
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Refresh the variations when dialog is closed with result true
        this.loadRecetaVariaciones();
      }
    });
  }

  async save(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;

      if (this.data.editMode && this.data.receta && this.data.receta.id) {
        // Update existing receta
        await firstValueFrom(
          this.repositoryService.updateReceta(this.data.receta.id, {
            nombre: formValues.nombre.toUpperCase(),
            modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
            tipoMedida: formValues.tipoMedida,
            calcularCantidad: formValues.calcularCantidad,
            cantidad: formValues.cantidad,
            activo: formValues.activo
          })
        );
        this.snackBar.open('Receta actualizada exitosamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta
        const newReceta = await firstValueFrom(
          this.repositoryService.createReceta({
            nombre: formValues.nombre.toUpperCase(),
            modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
            tipoMedida: formValues.tipoMedida,
            calcularCantidad: formValues.calcularCantidad,
            cantidad: formValues.cantidad,
            activo: formValues.activo
          })
        );
        this.recetaId = newReceta.id;
        this.recetaCreated = true;
        this.snackBar.open('Receta creada exitosamente. Ahora puede agregar variaciones.', 'Cerrar', { duration: 3000 });
      }
    } catch (error) {
      console.error('Error al guardar la receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }
}
