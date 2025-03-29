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
import { MatTableModule } from '@angular/material/table';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';
import { Ingrediente, TipoMedida } from '../../../database/entities/productos/ingrediente.entity';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { CreateEditRecetaItemDialogComponent } from './create-edit-receta-item-dialog.component';

// Define a view model interface for RecetaItem with display values
interface RecetaItemViewModel {
  // Original RecetaItem properties
  id: number;
  recetaId: number;
  ingredienteId: number;
  cantidad: number;
  activo: boolean;
  
  // Display values for template
  displayValues: {
    ingredienteName: string;
    monedaSimbolo: string;
    totalCosto: number;
  };
}

interface DialogData {
  receta?: Receta | null;
  recetaId?: number;
  editMode: boolean;
}

@Component({
  selector: 'app-create-edit-receta-dialog',
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
    MatTableModule,
    MatDividerModule,
    MatTooltipModule,
    MatMenuModule
  ],
  templateUrl: './create-edit-receta-dialog.component.html',
  styleUrls: ['./create-edit-receta-dialog.component.scss']
})
export class CreateEditRecetaDialogComponent implements OnInit {
  recetaForm: FormGroup;
  ingredientes: Ingrediente[] = [];
  recetaItems: RecetaItemViewModel[] = [];
  displayedColumns: string[] = ['ingrediente', 'cantidad', 'costo', 'activo', 'acciones'];
  loading = false;
  savingReceta = false;
  recetaId?: number;
  tipoMedidaOptions = Object.values(TipoMedida);
  monedas: Moneda[] = [];
  defaultMoneda?: Moneda;
  
  // Pre-computed values for template
  defaultMonedaSimbolo: string = '$';
  totalCost: number = 0;
  costPerUnit: number = 0;
  
  // Maps for display values
  ingredientNameMap: Map<number, string> = new Map();
  ingredientCostoMap: Map<number, number> = new Map();
  ingredientMonedaSimboloMap: Map<number, string> = new Map();
  ingredientTotalCostoMap: Map<number, number> = new Map();

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditRecetaDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.recetaForm = this.fb.group({
      nombre: ['', Validators.required],
      modo_preparo: [''],
      tipoMedida: [TipoMedida.UNIDAD],
      calcularCantidad: [false],
      cantidad: [0],
      activo: [true]
    });
    
    // Listen for changes to recalculate costs
    this.recetaForm.get('cantidad')?.valueChanges.subscribe(() => {
      this.updateCalculatedValues();
    });

    // Set recetaId if editing
    this.recetaId = data.recetaId || data.receta?.id;
  }

  ngOnInit(): void {
    // Load monedas for displaying costs
    this.loadMonedas();

    // Load data based on mode
    if (this.data.editMode) {
      if (this.data.receta) {
        this.patchRecetaForm(this.data.receta);
        this.loadRecetaItems();
      } else if (this.recetaId) {
        this.loadRecetaById(this.recetaId);
      }
    }

    // Don't load all ingredients at startup - we'll use server-side filtering
  }

  private patchRecetaForm(receta: Receta): void {
    this.recetaForm.patchValue({
      nombre: receta.nombre,
      modo_preparo: receta.modo_preparo || '',
      tipoMedida: receta.tipoMedida || TipoMedida.UNIDAD,
      calcularCantidad: receta.calcularCantidad || false,
      cantidad: receta.cantidad || 0,
      activo: receta.activo
    });
  }

  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      // Find default moneda (principal == true)
      this.defaultMoneda = this.monedas.find(m => m.principal);
      
      // Set default moneda símbolo for template
      if (this.defaultMoneda) {
        this.defaultMonedaSimbolo = this.defaultMoneda.simbolo;
      }
    } catch (error) {
      console.error('Error loading monedas:', error);
    }
  }

  async loadRecetaById(recetaId: number): Promise<void> {
    try {
      this.loading = true;
      const receta = await firstValueFrom(this.repositoryService.getReceta(recetaId));
      this.data.receta = receta;
      this.patchRecetaForm(receta);
      this.loadRecetaItems();
    } catch (error) {
      console.error('Error loading receta:', error);
      this.snackBar.open('Error al cargar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async loadRecetaItems(): Promise<void> {
    if (!this.recetaId) return;

    try {
      this.loading = true;
      const recetaItems = await firstValueFrom(this.repositoryService.getRecetaItems(this.recetaId));
      
      if (recetaItems.length > 0) {
        // Load ingredients data for these items
        const ingredientIds = recetaItems.map((item: RecetaItem) => item.ingredienteId);
        await this.loadIngredientesByIds(ingredientIds);
        
        // Convert to view models with display values
        this.recetaItems = recetaItems.map((item: RecetaItem) => this.createRecetaItemViewModel(item));
        
        // Update calculated values
        this.updateCalculatedValues();
      } else {
        this.recetaItems = [];
      }
    } catch (error) {
      console.error('Error loading receta items:', error);
      this.snackBar.open('Error al cargar los ingredientes de la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private createRecetaItemViewModel(item: RecetaItem): RecetaItemViewModel {
    // Get ingredient data
    const ingrediente = this.ingredientes.find(i => i.id === item.ingredienteId);
    const ingredienteName = ingrediente ? ingrediente.descripcion : 'Desconocido';
    const monedaSimbolo = ingrediente?.moneda?.simbolo || this.defaultMonedaSimbolo;
    const totalCosto = this.calculateIngredienteTotalCosto(item, ingrediente);
    
    // Store in maps for backward compatibility
    this.ingredientNameMap.set(item.ingredienteId, ingredienteName);
    this.ingredientMonedaSimboloMap.set(item.ingredienteId, monedaSimbolo);
    this.ingredientTotalCostoMap.set(item.ingredienteId, totalCosto);
    
    // Create and return the view model with type assertion
    return {
      id: item.id,
      recetaId: item.recetaId,
      ingredienteId: item.ingredienteId,
      cantidad: item.cantidad || 0,
      activo: item.activo,
      displayValues: {
        ingredienteName,
        monedaSimbolo,
        totalCosto
      }
    };
  }

  private calculateIngredienteTotalCosto(item: RecetaItem, ingrediente?: Ingrediente): number {
    if (!ingrediente) return 0;
    
    let costo = ingrediente.costo || 0;
    
    // If ingredient is based on a recipe, calculate the cost
    if (ingrediente.isProduccion && ingrediente.recetaId) {
      // For production ingredients, we use the pre-calculated cost
      costo = ingrediente.costo || 0;
    }
    
    return costo * (item.cantidad || 0);
  }

  async loadIngredientesByIds(ingredientIds: number[]): Promise<void> {
    if (!ingredientIds.length) return;

    try {
      // Make sure the ingredientes array is initialized
      if (!this.ingredientes) {
        this.ingredientes = [];
      }

      // Add the ingredients we need for display purposes
      for (const id of ingredientIds) {
        if (!this.ingredientes.some(i => i.id === id)) {
          const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(id));
          this.ingredientes.push(ingrediente);
        }
      }

      // After loading ingredients, update the display values
      this.preComputeDisplayValues();
    } catch (error) {
      console.error('Error loading specific ingredients:', error);
    }
  }

  onCalcularCantidadChange(event: MatCheckboxChange): void {
    const cantidadControl = this.recetaForm.get('cantidad');
    if (cantidadControl) {
      if (event.checked) {
        // Disable the cantidad field and calculate the total
        cantidadControl.disable();
        this.updateCantidadTotal();
      } else {
        // Enable the cantidad field for manual input
        cantidadControl.enable();
      }
    }
    
    // Always update calculated values
    this.updateCalculatedValues();
  }

  updateCantidadTotal(): void {
    if (!this.recetaForm.get('calcularCantidad')?.value || this.recetaItems.length === 0) {
      return;
    }

    // Calculate the total quantity from active ingredients
    const totalCantidad = this.recetaItems
      .filter(item => item.activo)
      .reduce((sum, item) => sum + item.cantidad, 0);

    // Update the cantidad field
    this.recetaForm.get('cantidad')?.setValue(totalCantidad);
  }
  
  // Calculate and update all pre-computed values for the template
  updateCalculatedValues(): void {
    // Calculate total cost
    this.totalCost = this.recetaItems.reduce(
      (total, item) => total + item.displayValues.totalCosto,
      0
    );
    
    // Calculate cost per unit
    const cantidad = this.recetaForm.get('cantidad')?.value || 0;
    this.costPerUnit = cantidad > 0 ? this.totalCost / cantidad : 0;
  }

  async save(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;
      
      // If calcularCantidad is true, ensure we have the latest total
      if (formValues.calcularCantidad) {
        this.updateCantidadTotal();
        // Get the updated value from the form
        formValues.cantidad = this.recetaForm.get('cantidad')?.value;
      }

      if (this.data.editMode && this.recetaId) {
        // Update existing receta
        await firstValueFrom(this.repositoryService.updateReceta(this.recetaId, {
          nombre: formValues.nombre.toUpperCase(),
          modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
          tipoMedida: formValues.tipoMedida,
          calcularCantidad: formValues.calcularCantidad,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.snackBar.open('Receta actualizada correctamente', 'Cerrar', { duration: 3000 });
      } else {
        // Create new receta
        const newReceta = await firstValueFrom(this.repositoryService.createReceta({
          nombre: formValues.nombre.toUpperCase(),
          modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
          tipoMedida: formValues.tipoMedida,
          calcularCantidad: formValues.calcularCantidad,
          cantidad: formValues.cantidad,
          activo: formValues.activo
        }));
        this.recetaId = newReceta.id;
        this.snackBar.open('Receta creada correctamente', 'Cerrar', { duration: 3000 });
      }

      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }

  addRecetaItem(): void {
    if (!this.recetaId) {
      // Save the recipe first if it doesn't exist
      this.saveAndContinue();
      return;
    }

    this.openRecetaItemDialog();
  }

  async saveAndContinue(): Promise<void> {
    if (this.recetaForm.invalid) {
      this.recetaForm.markAllAsTouched();
      return;
    }

    this.savingReceta = true;

    try {
      const formValues = this.recetaForm.value;
      
      // If calcularCantidad is true, ensure we have the latest total
      if (formValues.calcularCantidad) {
        this.updateCantidadTotal();
        // Get the updated value from the form
        formValues.cantidad = this.recetaForm.get('cantidad')?.value;
      }

      // Create new receta
      const newReceta = await firstValueFrom(this.repositoryService.createReceta({
        nombre: formValues.nombre.toUpperCase(),
        modo_preparo: formValues.modo_preparo ? formValues.modo_preparo.toUpperCase() : '',
        tipoMedida: formValues.tipoMedida,
        calcularCantidad: formValues.calcularCantidad,
        cantidad: formValues.cantidad,
        activo: formValues.activo
      }));

      this.recetaId = newReceta.id;
      this.data.receta = newReceta;
      this.data.editMode = true;

      this.snackBar.open('Receta guardada correctamente', 'Cerrar', { duration: 3000 });

      // Open the dialog to add a recipe item
      this.openRecetaItemDialog();
    } catch (error) {
      console.error('Error saving receta:', error);
      this.snackBar.open('Error al guardar la receta', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingReceta = false;
    }
  }

  openRecetaItemDialog(recetaItem?: RecetaItem): void {
    if (!this.recetaId) {
      this.snackBar.open('Primero debe guardar la receta', 'Cerrar', { duration: 3000 });
      return;
    }

    // If editing, make sure we have the ingredient loaded
    if (recetaItem) {
      this.loadIngredientesByIds([recetaItem.ingredienteId]);
    }

    const dialogRef = this.dialog.open(CreateEditRecetaItemDialogComponent, {
      width: '500px',
      disableClose: true,
      data: {
        recetaId: this.recetaId,
        recetaItem: recetaItem,
        editMode: !!recetaItem,
        ingredientes: recetaItem ? this.ingredientes.filter(i => i.id === recetaItem.ingredienteId) : []
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        await this.loadRecetaItems();
        this.updateCalculatedValues();
      }
    });
  }

  editRecetaItem(item: RecetaItemViewModel): void {
    // First cast to unknown, then to RecetaItem as required by TypeScript for safe type conversion
    const recetaItem = {
      id: item.id,
      recetaId: item.recetaId,
      ingredienteId: item.ingredienteId,
      cantidad: item.cantidad,
      activo: item.activo
    } as unknown as RecetaItem;
    
    this.openRecetaItemDialog(recetaItem);
  }

  async deleteRecetaItem(recetaItemId: number): Promise<void> {
    try {
      this.loading = true;
      await firstValueFrom(this.repositoryService.deleteRecetaItem(recetaItemId));
      this.snackBar.open('Ingrediente eliminado correctamente', 'Cerrar', { duration: 3000 });
      await this.loadRecetaItems();
    } catch (error) {
      console.error('Error deleting receta item:', error);
      this.snackBar.open('Error al eliminar ingrediente', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async toggleRecetaItemActive(recetaItem: RecetaItem): Promise<void> {
    try {
      this.loading = true;
      await firstValueFrom(this.repositoryService.updateRecetaItem(recetaItem.id, {
        ...recetaItem,
        activo: !recetaItem.activo
      }));
      this.snackBar.open('Estado actualizado correctamente', 'Cerrar', { duration: 3000 });
      await this.loadRecetaItems();
    } catch (error) {
      console.error('Error updating receta item:', error);
      this.snackBar.open('Error al actualizar estado', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  // Methods for the template to access pre-computed values
  getIngredienteName(ingredienteId: number): string {
    return this.ingredientNameMap.get(ingredienteId) || 'Desconocido';
  }

  getIngredienteCosto(ingredienteId: number): number {
    return this.ingredientCostoMap.get(ingredienteId) || 0;
  }
  
  getIngredienteTotalCosto(ingredienteId: number): number {
    return this.ingredientTotalCostoMap.get(ingredienteId) || 0;
  }

  getIngredienteMonedaSimbolo(ingredienteId: number): string {
    return this.ingredientMonedaSimboloMap.get(ingredienteId) || this.defaultMonedaSimbolo;
  }

  // Pre-compute all display values
  private preComputeDisplayValues(): void {
    // Update receta items with fresh display values
    this.recetaItems = this.recetaItems.map(item => {
      // Extract original RecetaItem properties needed for createRecetaItemViewModel
      const recetaItemData = {
        id: item.id,
        recetaId: item.recetaId,
        ingredienteId: item.ingredienteId,
        cantidad: item.cantidad,
        activo: item.activo
      } as unknown as RecetaItem;
      
      // Create a new view model with up-to-date display values
      return this.createRecetaItemViewModel(recetaItemData);
    });
    
    // Update calculated values
    this.updateCalculatedValues();
  }
}
