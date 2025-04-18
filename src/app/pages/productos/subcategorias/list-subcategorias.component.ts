import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormGroup, FormBuilder } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../database/repository.service';
import { Subcategoria } from '../../../database/entities/productos/subcategoria.entity';
import { Categoria } from '../../../database/entities/productos/categoria.entity';
import { CreateEditSubcategoriaComponent } from './create-edit-subcategoria.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { firstValueFrom } from 'rxjs';

// Extended interface to include display values
interface SubcategoriaViewModel extends Partial<Subcategoria> {
  categoriaName?: string;
}

@Component({
  selector: 'app-list-subcategorias',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    ConfirmationDialogComponent
  ],
  templateUrl: './list-subcategorias.component.html',
  styleUrls: ['./list-subcategorias.component.scss']
})
export class ListSubcategoriasComponent implements OnInit {
  subcategorias: SubcategoriaViewModel[] = [];
  categorias: Categoria[] = [];
  displayedColumns: string[] = ['nombre', 'descripcion', 'categoria', 'posicion', 'activo', 'acciones'];
  isLoading = false;
  
  // Map for category names to avoid function calls in template
  categoriaNamesMap: Map<number, string> = new Map();
  
  // Pagination
  totalSubcategorias = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  
  // Filtering
  filterForm: FormGroup;
  
  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      categoriaId: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadCategorias();
    this.loadSubcategorias();
  }

  async loadCategorias(): Promise<void> {
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getCategorias());
      
      // Populate the categorias name map
      this.categoriaNamesMap.clear();
      this.categorias.forEach(categoria => {
        if (categoria.id) {
          this.categoriaNamesMap.set(categoria.id, categoria.nombre);
        }
      });
    } catch (error) {
      console.error('Error loading categorias:', error);
      this.snackBar.open('Error al cargar categorías', 'Cerrar', {
        duration: 3000
      });
    }
  }

  async loadSubcategorias(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        nombre?: string,
        categoriaId?: number,
        activo?: boolean
      } = {
        nombre: this.filterForm.get('nombre')?.value?.trim() || undefined,
        categoriaId: this.filterForm.get('categoriaId')?.value || undefined,
        activo: this.filterForm.get('activo')?.value === 'true' ? true : 
                this.filterForm.get('activo')?.value === 'false' ? false : undefined
      };

      // Filter out empty/null/undefined values
      Object.keys(filters).forEach(key => {
        const k = key as keyof typeof filters;
        if (filters[k] === '' || filters[k] === null || filters[k] === undefined) {
          delete filters[k];
        }
      });
      
      // Get all subcategorias with their related categorias
      const result = await firstValueFrom(this.repositoryService.getSubcategorias());
      
      // Convert to view models with pre-computed values
      this.subcategorias = result.map(subcategoria => this.convertToViewModel(subcategoria));
      
      // Apply filters manually
      if (Object.keys(filters).length > 0) {
        this.subcategorias = this.subcategorias.filter(subcategoria => {
          let matches = true;
          
          if (filters.nombre && subcategoria.nombre) {
            matches = matches && subcategoria.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
          }
          
          if (filters.categoriaId) {
            matches = matches && subcategoria.categoriaId === filters.categoriaId;
          }
          
          if (filters.activo !== undefined) {
            matches = matches && subcategoria.activo === filters.activo;
          }
          
          return matches;
        });
      }
      
      // Sort by position then by name
      this.subcategorias.sort((a, b) => {
        if ((a.posicion ?? 0) !== (b.posicion ?? 0)) {
          return (a.posicion ?? 0) - (b.posicion ?? 0);
        }
        return (a.nombre || '').localeCompare(b.nombre || '');
      });
      
      this.totalSubcategorias = this.subcategorias.length;
      
    } catch (error) {
      console.error('Error loading subcategorias:', error);
      this.snackBar.open('Error al cargar subcategorías', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }
  
  // Convert Subcategoria to SubcategoriaViewModel with pre-computed display values
  private convertToViewModel(subcategoria: Partial<Subcategoria>): SubcategoriaViewModel {
    return {
      ...subcategoria,
      categoriaName: this.computeCategoriaName(subcategoria.categoriaId)
    };
  }
  
  // Compute the categoria name from the id
  private computeCategoriaName(categoriaId?: number): string {
    if (!categoriaId) return 'N/A';
    return this.categoriaNamesMap.get(categoriaId) || 'N/A';
  }
  
  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }
  
  onSort(sortState: Sort): void {
    if (!sortState.active || sortState.direction === '') {
      return;
    }
    
    this.subcategorias = this.subcategorias.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'nombre': return this.compare(a.nombre || '', b.nombre || '', isAsc);
        case 'descripcion': return this.compare(a.descripcion || '', b.descripcion || '', isAsc);
        case 'categoria': return this.compare(a.categoriaName || '', b.categoriaName || '', isAsc);
        case 'posicion': return this.compare(a.posicion ?? 0, b.posicion ?? 0, isAsc);
        case 'activo': return this.compare(a.activo || false, b.activo || false, isAsc);
        default: return 0;
      }
    });
  }
  
  compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
  
  clearFilters(): void {
    this.filterForm.reset({
      nombre: '',
      categoriaId: '',
      activo: ''
    });
    
    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadSubcategorias();
  }
  
  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadSubcategorias();
  }
  
  addSubcategoria(): void {
    const dialogRef = this.dialog.open(CreateEditSubcategoriaComponent, {
      width: '500px',
      data: {
        editMode: false,
        categorias: this.categorias
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadSubcategorias();
      }
    });
  }
  
  editSubcategoria(subcategoria: Subcategoria): void {
    const dialogRef = this.dialog.open(CreateEditSubcategoriaComponent, {
      width: '500px',
      data: {
        subcategoria,
        editMode: true,
        categorias: this.categorias
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadSubcategorias();
      }
    });
  }
  
  deleteSubcategoria(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar eliminación',
        message: '¿Está seguro que desea eliminar esta subcategoría?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        firstValueFrom(this.repositoryService.deleteSubcategoria(id))
          .then(() => {
            this.snackBar.open('Subcategoría eliminada correctamente', 'Cerrar', {
              duration: 3000
            });
            this.loadSubcategorias();
          })
          .catch(error => {
            console.error('Error deleting subcategoria:', error);
            this.snackBar.open('Error al eliminar subcategoría', 'Cerrar', {
              duration: 3000
            });
          });
      }
    });
  }
  
  async reorderSubcategoria(subcategoria: Subcategoria, direction: 'up' | 'down'): Promise<void> {
    const currentIndex = this.subcategorias.findIndex(s => s.id === subcategoria.id);
    if (currentIndex === -1) return;
    
    const isFirst = currentIndex === 0;
    const isLast = currentIndex === this.subcategorias.length - 1;
    
    if (direction === 'up' && isFirst) return;
    if (direction === 'down' && isLast) return;
    
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetSubcategoria = this.subcategorias[targetIndex];
    
    // Swap positions
    const tempPosition = subcategoria.posicion;
    subcategoria.posicion = targetSubcategoria.posicion;
    targetSubcategoria.posicion = tempPosition;
    
    // Update both subcategorias in the database
    Promise.all([
      firstValueFrom(this.repositoryService.updateSubcategoria(subcategoria.id as number, { posicion: subcategoria.posicion })),
      firstValueFrom(this.repositoryService.updateSubcategoria(targetSubcategoria.id as number, { posicion: targetSubcategoria.posicion }))
    ]).then(() => {
      this.snackBar.open('Orden actualizado correctamente', 'Cerrar', {
        duration: 2000
      });
      this.loadSubcategorias();
    }).catch(error => {
      console.error('Error updating positions:', error);
      this.snackBar.open('Error al actualizar el orden', 'Cerrar', {
        duration: 3000
      });
    });
  }
  
  // Get readable categoria name (kept for backwards compatibility but not called from template)
  getCategoriaName(categoriaId?: number): string {
    return this.computeCategoriaName(categoriaId);
  }
} 