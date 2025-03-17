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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormGroup, FormBuilder, Validators } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { animate, state, style, transition, trigger } from '@angular/animations';
import { RepositoryService } from '../../../../database/repository.service';
import { Categoria } from '../../../../database/entities/productos/categoria.entity';
import { Subcategoria } from '../../../../database/entities/productos/subcategoria.entity';
import { CreateEditCategoriaComponent } from '../create-edit-categoria/create-edit-categoria.component';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-list-categorias',
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
    MatCheckboxModule,
    MatTooltipModule,
    FormsModule,
    ReactiveFormsModule,
    MatSnackBarModule,
    MatDialogModule,
    ConfirmationDialogComponent
  ],
  templateUrl: './list-categorias.component.html',
  styleUrls: ['./list-categorias.component.scss'],
  animations: [
    trigger('detailExpand', [
      state('collapsed', style({ height: '0px', minHeight: '0' })),
      state('expanded', style({ height: '*' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class ListCategoriasComponent implements OnInit {
  categorias: Categoria[] = [];
  subcategorias: { [categoriaId: number]: Subcategoria[] } = {};
  displayedColumns: string[] = ['nombre', 'descripcion', 'posicion', 'activo', 'acciones'];
  expandedCategoria: Categoria | null = null;
  isLoading = false;
  isLoadingSubcategorias = false;

  // Pagination
  totalCategorias = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];

  // Filtering
  filterForm: FormGroup;

  // Subcategoria form
  subcategoriaForm: FormGroup;
  editingSubcategoria: Subcategoria | null = null;

  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      activo: ['']
    });

    this.subcategoriaForm = this.fb.group({
      nombre: ['', Validators.required],
      descripcion: [''],
      posicion: [0, [Validators.required, Validators.min(0)]],
      activo: [true]
    });
  }

  ngOnInit(): void {
    this.loadCategorias();
  }

  async loadCategorias(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        nombre?: string,
        activo?: boolean
      } = {
        nombre: this.filterForm.get('nombre')?.value?.trim() || undefined,
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

      // Get data from repository service
      const result = await firstValueFrom(this.repositoryService.getCategorias());
      this.categorias = result;

      // Apply filters manually
      if (Object.keys(filters).length > 0) {
        this.categorias = this.categorias.filter(categoria => {
          let matches = true;

          if (filters.nombre && categoria.nombre) {
            matches = matches && categoria.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
          }

          if (filters.activo !== undefined) {
            matches = matches && categoria.activo === filters.activo;
          }

          return matches;
        });
      }

      // Sort by position
      this.categorias.sort((a, b) => a.posicion - b.posicion);

      this.totalCategorias = this.categorias.length;

    } catch (error) {
      console.error('Error loading categorias:', error);
      this.snackBar.open('Error al cargar categorías', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  async loadSubcategorias(categoria?: Categoria | null): Promise<void> {
    if (!categoria?.id) return;

    this.isLoadingSubcategorias = true;
    try {
      const result = await firstValueFrom(this.repositoryService.getSubcategoriasByCategoria(categoria.id));
      this.subcategorias[categoria.id] = result.sort((a, b) => a.posicion - b.posicion);
    } catch (error) {
      console.error('Error loading subcategorias:', error);
      this.snackBar.open('Error al cargar subcategorías', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoadingSubcategorias = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
  }

  onSort(sortState: Sort): void {
    if (!sortState.active || sortState.direction === '') {
      return;
    }

    this.categorias = this.categorias.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'nombre': return this.compare(a.nombre || '', b.nombre || '', isAsc);
        case 'descripcion': return this.compare(a.descripcion || '', b.descripcion || '', isAsc);
        case 'posicion': return this.compare(a.posicion || 0, b.posicion || 0, isAsc);
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
      activo: ''
    });

    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadCategorias();
  }

  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadCategorias();
  }

  editCategoria(categoria: Categoria): void {
    const dialogRef = this.dialog.open(CreateEditCategoriaComponent, {
      width: '500px',
      data: { id: categoria.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Categoría actualizada correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadCategorias();
      } else if (result && !result.success) {
        this.snackBar.open('Error al actualizar categoría', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  deleteCategoria(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar Eliminación',
        message: '¿Está seguro de que desea eliminar esta categoría? Esto también eliminará todas las subcategorías y productos asociados.'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        firstValueFrom(this.repositoryService.deleteCategoria(id))
          .then(result => {
            this.snackBar.open('Categoría eliminada correctamente', 'Cerrar', {
              duration: 3000
            });
            this.loadCategorias();
          })
          .catch(error => {
            console.error('Error deleting categoria:', error);
            this.snackBar.open('Error al eliminar categoría', 'Cerrar', {
              duration: 3000
            });
          });
      }
    });
  }

  addCategoria(): void {
    const dialogRef = this.dialog.open(CreateEditCategoriaComponent, {
      width: '500px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Categoría creada correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadCategorias();
      } else if (result && !result.success) {
        this.snackBar.open('Error al crear categoría', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  // Method to reorder categories (move up/down)
  reorderCategoria(categoria: Categoria, direction: 'up' | 'down'): void {
    // Find the current index
    const currentIndex = this.categorias.findIndex(c => c.id === categoria.id);
    if (currentIndex === -1) return;

    // Calculate the target index
    let targetIndex = currentIndex;
    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < this.categorias.length - 1) {
      targetIndex = currentIndex + 1;
    } else {
      return; // No valid move
    }

    // Get the target categoria
    const targetCategoria = this.categorias[targetIndex];

    // Swap positions
    const tempPosition = categoria.posicion;
    categoria.posicion = targetCategoria.posicion;
    targetCategoria.posicion = tempPosition;

    // Update both categories in the database
    Promise.all([
      firstValueFrom(this.repositoryService.updateCategoria(categoria.id!, { posicion: categoria.posicion })),
      firstValueFrom(this.repositoryService.updateCategoria(targetCategoria.id!, { posicion: targetCategoria.posicion }))
    ]).then(() => {
      this.snackBar.open('Orden actualizado correctamente', 'Cerrar', {
        duration: 2000
      });
      this.loadCategorias();
    }).catch(error => {
      console.error('Error updating positions:', error);
      this.snackBar.open('Error al actualizar el orden', 'Cerrar', {
        duration: 3000
      });
    });
  }

  // Methods for handling subcategorias
  toggleExpand(categoria: Categoria) {
    if (this.expandedCategoria === categoria) {
      this.expandedCategoria = null;
      this.resetSubcategoriaForm();
    } else {
      this.expandedCategoria = categoria;
      if (categoria && categoria.id) {
        this.loadSubcategorias(categoria);
      }
      this.resetSubcategoriaForm();
    }
  }

  resetSubcategoriaForm() {
    this.subcategoriaForm.reset({
      nombre: '',
      descripcion: '',
      posicion: 0,
      activo: true
    });
    this.editingSubcategoria = null;
  }

  editSubcategoria(subcategoria: Subcategoria) {
    this.editingSubcategoria = subcategoria;
    this.subcategoriaForm.setValue({
      nombre: subcategoria.nombre,
      descripcion: subcategoria.descripcion || '',
      posicion: subcategoria.posicion,
      activo: subcategoria.activo
    });
  }

  cancelEditSubcategoria() {
    this.resetSubcategoriaForm();
  }

  async saveSubcategoria() {
    if (this.subcategoriaForm.invalid || !this.expandedCategoria?.id) {
      return;
    }

    const formData = { ...this.subcategoriaForm.value };

    // Convert string fields to uppercase
    if (formData.nombre) {
      formData.nombre = formData.nombre.toUpperCase();
    }
    if (formData.descripcion) {
      formData.descripcion = formData.descripcion.toUpperCase();
    }

    // Add categoriaId to the formData
    formData.categoriaId = this.expandedCategoria.id;

    this.isLoadingSubcategorias = true;
    try {
      if (this.editingSubcategoria) {
        // Update existing subcategoria
        await firstValueFrom(this.repositoryService.updateSubcategoria(this.editingSubcategoria.id!, formData));
        this.snackBar.open('Subcategoría actualizada correctamente', 'Cerrar', {
          duration: 3000
        });
      } else {
        // Create new subcategoria
        await firstValueFrom(this.repositoryService.createSubcategoria(formData));
        this.snackBar.open('Subcategoría creada correctamente', 'Cerrar', {
          duration: 3000
        });
      }
      // Reload subcategorias and reset form
      await this.loadSubcategorias(this.expandedCategoria);
      this.resetSubcategoriaForm();
    } catch (error) {
      console.error('Error saving subcategoria:', error);
      this.snackBar.open('Error al guardar subcategoría', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoadingSubcategorias = false;
    }
  }

  async deleteSubcategoria(subcategoria: Subcategoria) {
    if (!subcategoria.id || !this.expandedCategoria) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar Eliminación',
        message: '¿Está seguro de que desea eliminar esta subcategoría? Esto también eliminará todos los productos asociados.'
      }
    });

    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        this.isLoadingSubcategorias = true;
        try {
          await firstValueFrom(this.repositoryService.deleteSubcategoria(subcategoria.id));
          this.snackBar.open('Subcategoría eliminada correctamente', 'Cerrar', {
            duration: 3000
          });
          await this.loadSubcategorias(this.expandedCategoria);
        } catch (error) {
          console.error('Error deleting subcategoria:', error);
          this.snackBar.open('Error al eliminar subcategoría', 'Cerrar', {
            duration: 3000
          });
        } finally {
          this.isLoadingSubcategorias = false;
        }
      }
    });
  }

  async reorderSubcategoria(subcategoria: Subcategoria, direction: 'up' | 'down') {
    if (!subcategoria.id || !this.expandedCategoria?.id) return;

    const currentSubcategorias = this.subcategorias[this.expandedCategoria.id];
    const currentIndex = currentSubcategorias.findIndex(s => s.id === subcategoria.id);

    if (currentIndex === -1) return;

    // Calculate the target index
    let targetIndex = currentIndex;
    if (direction === 'up' && currentIndex > 0) {
      targetIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < currentSubcategorias.length - 1) {
      targetIndex = currentIndex + 1;
    } else {
      return; // No valid move
    }

    // Get the target subcategoria
    const targetSubcategoria = currentSubcategorias[targetIndex];

    // Swap positions
    const tempPosition = subcategoria.posicion;
    subcategoria.posicion = targetSubcategoria.posicion;
    targetSubcategoria.posicion = tempPosition;

    this.isLoadingSubcategorias = true;
    // Update both subcategorias in the database
    try {
      await Promise.all([
        firstValueFrom(this.repositoryService.updateSubcategoria(subcategoria.id, { posicion: subcategoria.posicion })),
        firstValueFrom(this.repositoryService.updateSubcategoria(targetSubcategoria.id!, { posicion: targetSubcategoria.posicion }))
      ]);

      this.snackBar.open('Orden actualizado correctamente', 'Cerrar', {
        duration: 2000
      });

      await this.loadSubcategorias(this.expandedCategoria);
    } catch (error) {
      console.error('Error updating positions:', error);
      this.snackBar.open('Error al actualizar el orden', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoadingSubcategorias = false;
    }
  }

  // Function to determine when to show the expanded row
  isExpanded(categoria: Categoria): boolean {
    return this.expandedCategoria === categoria;
  }
}
