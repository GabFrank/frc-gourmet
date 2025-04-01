import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatSortModule } from '@angular/material/sort';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from '../../../database/repository.service';
import { Receta } from '../../../database/entities/productos/receta.entity';
import { firstValueFrom } from 'rxjs';
import { CreateEditRecetaComponent } from './create-edit-receta.component';
import { RecetaVariacion } from '../../../database/entities/productos/receta-variacion.entity';
import { RecetaVariacionItem } from '../../../database/entities/productos/receta-variacion-item.entity';
import { Ingrediente } from '../../../database/entities/productos/ingrediente.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';

interface RecetaViewModel extends Receta {
  totalCost?: number;
  costPerUnit?: number;
}

@Component({
  selector: 'app-list-recetas',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatPaginatorModule,
    MatSortModule,
    MatCardModule,
    MatDividerModule,
    MatCheckboxModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    ReactiveFormsModule
  ],
  templateUrl: './list-recetas.component.html',
  styleUrls: ['./list-recetas.component.scss']
})
export class ListRecetasComponent implements OnInit {
  recetas: RecetaViewModel[] = [];
  variaciones: Map<number, RecetaVariacion[]> = new Map();
  variacionItems: Map<number, RecetaVariacionItem[]> = new Map();
  ingredientes: Map<number, Ingrediente> = new Map();
  displayedColumns: string[] = ['id', 'nombre', 'tipoMedida', 'cantidad', 'costo', 'costoUnidad', 'activo', 'actions'];
  isLoading = true;
  filterForm: FormGroup;
  monedas: Moneda[] = [];
  defaultMoneda?: Moneda;
  defaultMonedaSimbolo: string = '$';

  // Pagination variables
  pageSize = 10;
  pageSizeOptions: number[] = [5, 10, 25, 100];
  currentPage = 0;
  totalRecetas = 0;

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatTable) table!: MatTable<RecetaViewModel>;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadMonedas().then(() => {
      this.loadRecetas();
    });
  }

  async loadMonedas(): Promise<void> {
    try {
      this.monedas = await firstValueFrom(this.repositoryService.getMonedas());
      // Find default moneda (principal == true)
      this.defaultMoneda = this.monedas.find(m => m.principal);
      // Pre-compute the default currency symbol
      this.defaultMonedaSimbolo = this.defaultMoneda ? this.defaultMoneda.simbolo : '$';
    } catch (error) {
      console.error('Error loading monedas:', error);
    }
  }

  async loadRecetas(): Promise<void> {
    this.isLoading = true;
    try {
      let recetasData = await firstValueFrom(this.repositoryService.getRecetas());

      // Apply filters
      const filters = this.filterForm.value;

      if (filters.nombre) {
        const searchTerm = filters.nombre.toLowerCase();
        recetasData = recetasData.filter(receta =>
          receta.nombre.toLowerCase().includes(searchTerm)
        );
      }

      if (filters.activo !== '') {
        const isActive = filters.activo === 'true';
        recetasData = recetasData.filter(receta => receta.activo === isActive);
      }

      this.recetas = recetasData;
      this.totalRecetas = this.recetas.length;

      // Load recipe variations and ingredients for cost calculation
      await this.loadVariacionesAndIngredientes();
      
      // Pre-compute costs for each recipe
      this.calculateAllRecipeCosts();
    } catch (error) {
      console.error('Error loading recetas:', error);
      this.snackBar.open('Error al cargar las recetas', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  async loadVariacionesAndIngredientes(): Promise<void> {
    // Clear previous data
    this.variaciones.clear();
    this.variacionItems.clear();
    this.ingredientes.clear();

    // Load variations for each recipe
    for (const receta of this.recetas) {
      if (receta.id) {
        try {
          const variaciones = await firstValueFrom(this.repositoryService.getRecetaVariaciones(receta.id));
          this.variaciones.set(receta.id, variaciones);

          // Load variation items for each variation
          for (const variacion of variaciones) {
            const items = await firstValueFrom(this.repositoryService.getRecetaVariacionItems(variacion.id));
            this.variacionItems.set(variacion.id, items);

            // Load ingredients for each variation item
            for (const item of items) {
              if (!this.ingredientes.has(item.ingredienteId)) {
                const ingrediente = await firstValueFrom(this.repositoryService.getIngrediente(item.ingredienteId));
                this.ingredientes.set(item.ingredienteId, ingrediente);
              }
            }
          }
        } catch (error) {
          console.error(`Error loading variations for recipe ${receta.id}:`, error);
        }
      }
    }
  }

  // Calculate costs for all recipes and store the results
  calculateAllRecipeCosts(): void {
    for (const receta of this.recetas) {
      if (receta.id) {
        // Calculate and store total cost
        receta.totalCost = this.calculateTotalCost(receta.id);
        
        // Calculate and store cost per unit
        receta.costPerUnit = this.calculateCostPerUnit(receta.id, receta.totalCost);
      }
    }
  }

  getRecetaVariaciones(recetaId: number): RecetaVariacion[] {
    return this.variaciones.get(recetaId) || [];
  }

  getVariacionItems(variacionId: number): RecetaVariacionItem[] {
    return this.variacionItems.get(variacionId) || [];
  }

  getIngrediente(ingredienteId: number): Ingrediente | undefined {
    return this.ingredientes.get(ingredienteId);
  }

  // Calculate the total cost of a recipe based on all its variations
  calculateTotalCost(recetaId: number): number {
    const variaciones = this.getRecetaVariaciones(recetaId);
    let total = 0;
    
    // If no variations, return 0
    if (variaciones.length === 0) {
      return 0;
    }
    
    // Average the costs of all active variations
    const activeVariaciones = variaciones.filter(v => v.activo);
    if (activeVariaciones.length === 0) {
      return 0;
    }
    
    for (const variacion of activeVariaciones) {
      total += variacion.costo || 0;
    }
    
    return total / activeVariaciones.length;
  }

  calculateCostPerUnit(recetaId: number, totalCost?: number): number {
    const receta = this.recetas.find(r => r.id === recetaId);
    if (!receta || !receta.cantidad || receta.cantidad <= 0) {
      return 0;
    }
    
    const cost = totalCost !== undefined ? totalCost : this.calculateTotalCost(recetaId);
    return cost / receta.cantidad;
  }

  // Keep these methods for compatibility but they should only be used internally
  getTotalCost(recetaId: number): number {
    const receta = this.recetas.find(r => r.id === recetaId);
    return receta?.totalCost || 0;
  }

  getCostPerUnit(recetaId: number): number {
    const receta = this.recetas.find(r => r.id === recetaId);
    return receta?.costPerUnit || 0;
  }

  getDefaultMonedaSimbolo(): string {
    return this.defaultMonedaSimbolo;
  }

  buscar(): void {
    this.loadRecetas();
  }

  clearFilters(): void {
    this.filterForm.reset({
      nombre: '',
      activo: ''
    });
    this.loadRecetas();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditRecetaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        editMode: false
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecetas();
      }
    });
  }

  openEditDialog(receta: Receta): void {
    const dialogRef = this.dialog.open(CreateEditRecetaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        receta: receta,
        editMode: true
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadRecetas();
      }
    });
  }

  async toggleActive(receta: Receta): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.updateReceta(receta.id, {
        nombre: receta.nombre,
        modo_preparo: receta.modo_preparo,
        tipoMedida: receta.tipoMedida,
        calcularCantidad: receta.calcularCantidad,
        cantidad: receta.cantidad,
        activo: !receta.activo
      }));

      this.snackBar.open(`Receta ${!receta.activo ? 'activada' : 'desactivada'} correctamente`, 'Cerrar', { duration: 3000 });
      this.loadRecetas();
    } catch (error) {
      console.error('Error toggling receta active state:', error);
      this.snackBar.open('Error al cambiar el estado de la receta', 'Cerrar', { duration: 3000 });
    }
  }

  openDeleteDialog(receta: Receta): void {
    if (confirm(`¿Está seguro que desea eliminar la receta "${receta.nombre}"?`)) {
      this.deleteReceta(receta.id);
    }
  }

  async deleteReceta(recetaId: number): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.deleteReceta(recetaId));
      this.snackBar.open('Receta eliminada correctamente', 'Cerrar', { duration: 3000 });
      this.loadRecetas();
    } catch (error) {
      console.error('Error deleting receta:', error);
      this.snackBar.open('Error al eliminar la receta', 'Cerrar', { duration: 3000 });
    }
  }

  // Pagination handling
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }
}
