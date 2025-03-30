import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { firstValueFrom } from 'rxjs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';

interface DialogData {
  ingrediente?: Ingrediente | null;
  ingredienteId?: number;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-ingrediente-dialog',
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
    MatDividerModule,
    MatTooltipModule
  ],
  templateUrl: './create-edit-ingrediente-dialog.component.html',
  styleUrls: ['./create-edit-ingrediente-dialog.component.scss']
})
export class CreateEditIngredienteDialogComponent implements OnInit {
  ingredienteForm: FormGroup;
  loading = false;
  savingIngrediente = false;
  ingredienteId?: number;
  tipoMedidaOptions = Object.values(TipoMedida);
  recetas: Receta[] = [];
  recetaItems: Map<number, RecetaItem[]> = new Map();
  ingredientes: Map<number, Ingrediente> = new Map();
  monedas: Moneda[] = [];
  calculating = false;
  
  // Pre-computed values for the template - making these public
  public tipoMedidaDisplayValues: { [key: string]: string } = {};
  public recetasDisplayValues: { [key: number]: string } = {};
  public monedasDisplayValues: { [key: number]: string } = {};
  public selectedMonedaSymbol: string = '$';

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditIngredienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.ingredienteForm = this.fb.group({
      descripcion: ['', Validators.required],
      tipoMedida: [TipoMedida.UNIDAD, Validators.required],
      costo: [{value: 0, disabled: false}, [Validators.required, Validators.min(0)]],
      monedaId: [null, Validators.required],
      isProduccion: [false],
      recetaId: [null],
      recetaCantidad: [{value: 0, disabled: true}, [Validators.min(0)]],
      activo: [true]
    });

    // Monitor changes to monedaId
    this.ingredienteForm.get('monedaId')?.valueChanges.subscribe(value => {
      console.log('monedaId changed to:', value);
      this.updateSelectedMonedaSymbol();
    });

    // Monitor changes to recetaId
    this.ingredienteForm.get('recetaId')?.valueChanges.subscribe(value => {
      this.handleRecetaChange(value);
    });

    // Monitor changes to recetaCantidad
    this.ingredienteForm.get('recetaCantidad')?.valueChanges.subscribe(value => {
      if (this.ingredienteForm.get('recetaId')?.value) {
        this.calculateCostFromReceta();
      }
    });

    // Initialize the tipo medida display values
    this.initTipoMedidaDisplayValues();
  }

  private initTipoMedidaDisplayValues(): void {
    Object.values(TipoMedida).forEach(tipo => {
      this.tipoMedidaDisplayValues[tipo] = this.computeTipoMedidaText(tipo);
    });
  }

  ngOnInit(): void {
    this.initializeForm();
  }

  private async initializeForm(): Promise<void> {
    try {
      this.loading = true;

      // Load monedas first to ensure they're available
      await this.loadMonedas();

      // For new ingredients, select the principal currency by default right after loading
      //or if data.ingrediente.moneda is null
      console.log(!this.data.editMode, !this.data.ingrediente?.moneda);
      if (!this.data.editMode || !this.data.ingrediente?.moneda) {
        this.setDefaultMoneda();
      }

      // Then load recetas
      await this.loadRecetas();

      if (this.data.editMode) {
        if (this.data.ingrediente) {
          // If full ingrediente object is provided
          this.ingredienteId = this.data.ingrediente.id;
          this.patchIngredienteForm(this.data.ingrediente);
        } else if (this.data.ingredienteId) {
          // If only ingredienteId is provided, load the ingrediente
          this.ingredienteId = this.data.ingredienteId;
          await this.loadIngredienteById(this.ingredienteId);
        }
      }

      // Handle initial receta state
      const recetaId = this.ingredienteForm.get('recetaId')?.value;
      if (recetaId) {
        this.handleRecetaChange(recetaId);
      }

      // Update the selected moneda symbol
      this.updateSelectedMonedaSymbol();
    } catch (error) {
      console.error('Error initializing form:', error);
      this.snackBar.open('Error al inicializar el formulario', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private setDefaultMoneda(): void {
    // Find the principal moneda
    const principalMoneda = this.monedas.find(m => m.principal);

    if (principalMoneda) {
      console.log('Setting default moneda:', principalMoneda);

      // Use setTimeout to ensure value is set after the next change detection cycle
      setTimeout(() => {
        this.ingredienteForm.patchValue({
          monedaId: principalMoneda.id
        });
        console.log('Current monedaId value after timeout:', this.ingredienteForm.get('monedaId')?.value);
      });

      // Verify if the value was set
      console.log('Current monedaId value:', this.ingredienteForm.get('monedaId')?.value);
    } else {
      console.log('No principal moneda found among:', this.monedas);
    }
  }

  private patchIngredienteForm(ingrediente: Ingrediente): void {
    this.ingredienteForm.patchValue({
      descripcion: ingrediente.descripcion,
      tipoMedida: ingrediente.tipoMedida,
      costo: ingrediente.costo,
      monedaId: ingrediente.monedaId || null,
      isProduccion: ingrediente.isProduccion,
      recetaId: ingrediente.recetaId || null,
      recetaCantidad: ingrediente.recetaCantidad || 0,
      activo: ingrediente.activo
    });
  }

  async loadIngredienteById(ingredienteId: number): Promise<void> {
    try {
      const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(ingredienteId));
      this.data.ingrediente = ingrediente;
      this.patchIngredienteForm(ingrediente);
    } catch (error) {
      console.error('Error loading ingrediente:', error);
      this.snackBar.open('Error al cargar el ingrediente', 'Cerrar', { duration: 3000 });
    }
  }

  async loadRecetas(): Promise<void> {
    try {
      this.recetas = await firstValueFrom(this.repositoryService.getRecetas());
      // Pre-compute the display values for each receta
      this.recetas.forEach(receta => {
        this.recetasDisplayValues[receta.id] = this.computeRecetaLabel(receta);
      });
    } catch (error) {
      console.error('Error loading recetas:', error);
      this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
    }
  }

  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      console.log('Monedas loaded:', this.monedas);
      // Pre-compute the display values for each moneda
      this.monedas.forEach(moneda => {
        this.monedasDisplayValues[moneda.id] = this.computeMonedaLabel(moneda);
      });
    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar las monedas', 'Cerrar', { duration: 3000 });
    }
  }

  async handleRecetaChange(recetaId: number | null): Promise<void> {
    const costoControl = this.ingredienteForm.get('costo');
    const recetaCantidadControl = this.ingredienteForm.get('recetaCantidad');

    if (!recetaId) {
      // No recipe selected, enable cost field and disable cantidad
      costoControl?.enable();
      recetaCantidadControl?.disable();
      recetaCantidadControl?.setValue(0);
      return;
    }

    // Recipe selected, disable cost field and enable cantidad
    costoControl?.disable();
    recetaCantidadControl?.enable();
    
    // Set a default value for cantidad if it's 0
    if (!recetaCantidadControl?.value || recetaCantidadControl.value === 0) {
      recetaCantidadControl?.setValue(1);
    }

    // Load recipe items if not already loaded
    await this.loadRecipeData(recetaId);
    
    // Calculate cost based on recipe
    this.calculateCostFromReceta();
  }

  async loadRecipeData(recetaId: number): Promise<void> {
    if (!this.recetaItems.has(recetaId)) {
      try {
        this.calculating = true;
        const items = await firstValueFrom(this.repositoryService.getRecetaItems(recetaId));
        this.recetaItems.set(recetaId, items);

        // Load ingredients for each recipe item
        for (const item of items) {
          if (!this.ingredientes.has(item.ingredienteId)) {
            const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(item.ingredienteId));
            this.ingredientes.set(item.ingredienteId, ingrediente);
          }
        }
      } catch (error) {
        console.error(`Error loading items for recipe ${recetaId}:`, error);
        this.snackBar.open('Error al cargar los ingredientes de la receta', 'Cerrar', { duration: 3000 });
      } finally {
        this.calculating = false;
      }
    }
  }

  calculateCostFromReceta(): void {
    const recetaId = this.ingredienteForm.get('recetaId')?.value;
    const cantidad = this.ingredienteForm.get('recetaCantidad')?.value || 0;
    
    if (!recetaId || cantidad <= 0) {
      this.ingredienteForm.get('costo')?.setValue(0);
      return;
    }

    // Check if we have the recipe items loaded
    const items = this.recetaItems.get(recetaId) || [];
    if (items.length === 0) {
      return;
    }

    // Calculate total cost of the recipe
    let recipeTotalCost = 0;
    for (const item of items) {
      if (item.activo) {
        const ingrediente = this.ingredientes.get(item.ingredienteId);
        if (ingrediente) {
          recipeTotalCost += ingrediente.costo * item.cantidad;
        }
      }
    }

    // Find the recipe to get its quantity
    const receta = this.recetas.find(r => r.id === recetaId);
    if (!receta || !receta.cantidad || receta.cantidad <= 0) {
      // If recipe has no quantity, just multiply by the requested quantity
      this.ingredienteForm.get('costo')?.setValue(recipeTotalCost * cantidad);
      return;
    }

    // Calculate cost per unit of the recipe
    const costPerUnit = recipeTotalCost / receta.cantidad;
    
    // Calculate total cost based on requested quantity
    const totalCost = costPerUnit * cantidad;
    
    // Update the cost field
    this.ingredienteForm.get('costo')?.setValue(totalCost);
  }

  async save(): Promise<void> {
    if (this.ingredienteForm.invalid) {
      this.ingredienteForm.markAllAsTouched();
      return;
    }

    this.savingIngrediente = true;

    try {
      const formValues = this.ingredienteForm.getRawValue(); // Get values including disabled controls

      if (this.data.editMode && this.ingredienteId) {
        // Update existing ingrediente
        await firstValueFrom(this.repositoryService.updateIngrediente(this.ingredienteId, {
          descripcion: formValues.descripcion.toUpperCase(),
          tipoMedida: formValues.tipoMedida,
          costo: formValues.costo,
          monedaId: formValues.monedaId,
          isProduccion: formValues.isProduccion,
          recetaId: formValues.recetaId,
          recetaCantidad: formValues.recetaId ? formValues.recetaCantidad : null,
          activo: formValues.activo
        }));
        this.snackBar.open('Ingrediente actualizado correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new ingrediente
        const newIngrediente = await firstValueFrom(this.repositoryService.createIngrediente({
          descripcion: formValues.descripcion.toUpperCase(),
          tipoMedida: formValues.tipoMedida,
          costo: formValues.costo,
          monedaId: formValues.monedaId,
          isProduccion: formValues.isProduccion,
          recetaId: formValues.recetaId,
          recetaCantidad: formValues.recetaId ? formValues.recetaCantidad : null,
          activo: formValues.activo
        }));
        this.ingredienteId = newIngrediente.id;
        this.snackBar.open('Ingrediente creado correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving ingrediente:', error);
      this.snackBar.open('Error al guardar el ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingIngrediente = false;
    }
  }

  // Helper methods to pre-compute values for the template
  private computeTipoMedidaText(tipo: TipoMedida): string {
    switch (tipo) {
      case TipoMedida.UNIDAD:
        return 'Unidad';
      case TipoMedida.KILO:
        return 'Kilo';
      case TipoMedida.GRAMO:
        return 'Gramo';
      case TipoMedida.LITRO:
        return 'Litro';
      case TipoMedida.MILILITRO:
        return 'Mililitro';
      case TipoMedida.PAQUETE:
        return 'Paquete';
      default:
        return tipo;
    }
  }

  private computeMonedaLabel(moneda: Moneda): string {
    return moneda.principal ?
      `${moneda.denominacion} (${moneda.simbolo}) - Principal` :
      `${moneda.denominacion} (${moneda.simbolo})`;
  }

  private computeRecetaLabel(receta: Receta): string {
    if (receta.cantidad) {
      return `${receta.nombre} (${receta.cantidad} ${receta.tipoMedida})`;
    }
    return receta.nombre;
  }

  private updateSelectedMonedaSymbol(): void {
    const monedaId = this.ingredienteForm.get('monedaId')?.value;
    if (!monedaId) {
      this.selectedMonedaSymbol = '$';
      return;
    }

    const selectedMoneda = this.monedas.find(m => m.id === monedaId);
    this.selectedMonedaSymbol = selectedMoneda ? selectedMoneda.simbolo : '$';
  }

  // Keep these methods for backward compatibility, but they should no longer be called directly from the template
  getTipoMedidaText(tipo: TipoMedida): string {
    return this.tipoMedidaDisplayValues[tipo] || tipo;
  }

  getMonedaLabel(moneda: Moneda): string {
    return this.monedasDisplayValues[moneda.id] || `${moneda.denominacion} (${moneda.simbolo})`;
  }

  getSelectedMonedaSymbol(): string {
    return this.selectedMonedaSymbol;
  }

  getRecetaLabel(receta: Receta): string {
    return this.recetasDisplayValues[receta.id] || receta.nombre;
  }
}
