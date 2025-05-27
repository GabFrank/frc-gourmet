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
import { firstValueFrom, Observable, of, startWith, map, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { RecetaItem } from '../../../database/entities/productos/receta-item.entity';
import { MatAutocompleteModule } from '@angular/material/autocomplete';

interface DialogData {
  ingrediente?: Ingrediente | null;
  ingredienteId?: number;
  editMode: boolean;
}

// Interface for the transformed receta with display properties
interface RecetaViewModel {
  id: number;
  nombre: string;
  tipoMedida: string;
  cantidad: number;
  displayText: string;  // For display in the input when selected
  optionText: string;   // Name with detail for option display
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
    MatTooltipModule,
    MatAutocompleteModule
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

  // Search fields
  recetaSearchLoading = false;
  selectedReceta: RecetaViewModel | null = null;
  filteredRecetas: Observable<RecetaViewModel[]>;

  // Pre-computed values for the template
  tipoMedidaDisplayValues: { [key: string]: string } = {};
  recetasDisplayValues: { [key: number]: string } = {};
  monedasDisplayValues: { [key: number]: string } = {};
  selectedMonedaSymbol = '$';
  showVariacionSelect = false;

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
      recetaId: [null],
      recetaSearch: [''],
      recetaCantidad: [{value: 0, disabled: true}, [Validators.min(0)]],
      activo: [true]
    });

    // Set up autocomplete filtering for recetas
    this.filteredRecetas = this.ingredienteForm.get('recetaSearch')!.valueChanges.pipe(
      startWith(''),
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        // If value is already an object (selected receta), don't search again
        if (typeof value === 'object' && value !== null) {
          return of([value as RecetaViewModel]);
        }

        // If the value is empty or start typing, filter from loaded recetas
        const searchText = value || '';
        this.recetaSearchLoading = true;

        // First try to search from already loaded recetas
        if (this.recetas.length > 0) {
          return of(this.filterRecetas(searchText));
        }

        // If no recetas are loaded yet, load them from the server
        return this.repositoryService.getRecetas().pipe(
          map(recetas => {
            this.recetas = recetas;
            this.recetaSearchLoading = false;
            return this.filterRecetas(searchText);
          }),
          catchError(error => {
            this.recetaSearchLoading = false;
            console.error('Error loading recetas:', error);
            return of([]);
          })
        );
      })
    );

    // Monitor changes to monedaId
    this.ingredienteForm.get('monedaId')?.valueChanges.subscribe(value => {
      console.log('monedaId changed to:', value);
      this.updateSelectedMonedaSymbol();
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

  private filterRecetas(searchText: string): RecetaViewModel[] {
    const filteredRecetas = this.recetas.filter(receta =>
      receta.nombre.toLowerCase().includes(searchText.toLowerCase()) && receta.activo
    );

    this.recetaSearchLoading = false;
    return filteredRecetas.map(receta => this.transformReceta(receta));
  }

  private transformReceta(receta: Receta): RecetaViewModel {
    const cantidadText = receta.cantidad ? `(${receta.cantidad} ${receta.tipoMedida})` : '';
    return {
      id: receta.id,
      nombre: receta.nombre,
      tipoMedida: receta.tipoMedida,
      cantidad: receta.cantidad || 0,
      displayText: `${receta.nombre} ${cantidadText}`,
      optionText: `${receta.id} - ${receta.nombre} ${cantidadText}`
    };
  }

  // Display function for the autocomplete
  displayReceta(receta: RecetaViewModel): string {
    if (!receta) return '';
    return receta.displayText;
  }

  // Handle selection from autocomplete
  onRecetaSelected(event: any): void {
    this.selectedReceta = event.option.value as RecetaViewModel;
    this.ingredienteForm.patchValue({
      recetaId: this.selectedReceta.id
    });
  }

  // Clear receta selection
  clearRecetaSelection(): void {
    this.selectedReceta = null;
    this.ingredienteForm.patchValue({
      recetaId: null,
      recetaSearch: ''
    });
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

      // Then load recetas for the dropdown
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
        await this.handleRecetaChange(recetaId);

        // Find and set the selected receta for the autocomplete
        const receta = this.recetas.find(r => r.id === recetaId);
        if (receta) {
          this.selectedReceta = this.transformReceta(receta);
          this.ingredienteForm.get('recetaSearch')?.setValue(this.selectedReceta);
        }
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
    console.log('Patching form with ingredient data:', ingrediente);
    this.ingredienteForm.patchValue({
      descripcion: ingrediente.descripcion,
      tipoMedida: ingrediente.tipoMedida,
      costo: ingrediente.costo,
      monedaId: ingrediente.monedaId || null,
      recetaId: ingrediente.recetaId || null,
      recetaCantidad: ingrediente.recetaCantidad || 0,
      activo: ingrediente.activo
    });
    console.log('Form values after patch:', this.ingredienteForm.value);
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
      this.showVariacionSelect = false;
      return;
    }

    // Recipe selected, disable cost field and enable cantidad
    costoControl?.disable();
    recetaCantidadControl?.enable();

    // Set a default value for cantidad if it's 0
    if (!recetaCantidadControl?.value || recetaCantidadControl.value === 0) {
      recetaCantidadControl?.setValue(1);
    }

    // Load recipe items from database
    const items = await firstValueFrom(this.repositoryService.getRecetaItems(recetaId));
    this.recetaItems.set(recetaId, items);

    // Load ingredients for each recipe item
    for (const item of this.recetaItems.get(recetaId) || []) {
      if (!this.ingredientes.has(item.ingredienteId)) {
        const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(item.ingredienteId));
        this.ingredientes.set(item.ingredienteId, ingrediente);
      }
    }
  }

  calculateCostFromReceta(): void {
    const recetaId = this.ingredienteForm.get('recetaId')?.value;
    const cantidad = parseFloat(this.ingredienteForm.get('recetaCantidad')?.value) || 0;

    console.log('Calculating cost from receta - recetaId:', recetaId, 'cantidad:', cantidad);

    if (!recetaId || cantidad <= 0) {
      console.log('No recipe selected or cantidad is 0 or below, setting cost to 0');
      this.ingredienteForm.get('costo')?.setValue(0);
      return;
    }

    // Calculate total cost of the recipe
    let recipeTotalCost = 0;
    for (const item of this.recetaItems.get(recetaId) || []) {
      if (item.activo) {
        const ingrediente = this.ingredientes.get(item.ingredienteId);
        if (ingrediente) {
          const itemCosto = parseFloat(ingrediente.costo as any) || 0;
          const itemCantidad = parseFloat(item.cantidad as any) || 0;
          const itemTotalCost = itemCosto * itemCantidad;
          recipeTotalCost += itemTotalCost;
          console.log(`Item ${ingrediente.descripcion}: ${itemCosto} * ${itemCantidad} = ${itemTotalCost}`);
        }
      }
    }

    console.log('Recipe total cost:', recipeTotalCost);

    // Find the recipe to get its quantity
    const receta = this.recetas.find(r => r.id === recetaId);
    console.log('Recipe found:', receta);

    if (!receta || !receta.cantidad || receta.cantidad <= 0) {
      // If recipe has no quantity, just multiply by the requested quantity
      const totalCost = recipeTotalCost * cantidad;
      console.log('No recipe quantity available, using direct calculation:',
                 recipeTotalCost, '*', cantidad, '=', totalCost);
      this.ingredienteForm.get('costo')?.setValue(Math.round(totalCost * 100) / 100);
      return;
    }

    // Convert receta.cantidad to number to ensure proper calculation
    const recetaCantidad = parseFloat(receta.cantidad as any) || 1;

    // Calculate cost per unit of the recipe
    const costPerUnit = recipeTotalCost / recetaCantidad;
    console.log('Cost per unit:', recipeTotalCost, '/', recetaCantidad, '=', costPerUnit);

    // Calculate total cost based on requested quantity
    const totalCost = costPerUnit * cantidad;
    console.log('Total cost:', costPerUnit, '*', cantidad, '=', totalCost);

    // Update the cost field with properly rounded value
    this.ingredienteForm.get('costo')?.setValue(Math.round(totalCost * 100) / 100);
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
