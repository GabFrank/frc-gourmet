import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatInput, MatInputModule } from '@angular/material/input';
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
      state('collapsed', style({ height: '0px', minHeight: '0', visibility: 'hidden' })),
      state('expanded', style({ height: '*', visibility: 'visible' })),
      transition('expanded <=> collapsed', animate('225ms cubic-bezier(0.4, 0.0, 0.2, 1)')),
    ]),
  ],
})
export class ListCategoriasComponent implements OnInit {
  @ViewChild('nombreInput') nombreInputRef!: ElementRef;
  @ViewChild('nombreInput', { read: MatInput }) nombreInput!: MatInput;
  @ViewChild('nombreSubcategoriaInput') nombreInputRefSubcategoria!: ElementRef;
  @ViewChild('nombreSubcategoriaInput', { read: MatInput }) nombreInputSubcategoria!: MatInput;

  categorias: Categoria[] = [];
  subcategorias: { [categoriaId: number]: Subcategoria[] } = {};
  displayedColumns: string[] = ['nombre', 'descripcion', 'posicion', 'activo', 'acciones'];
  expandedCategoria: Categoria | null = null;
  isLoading = false;
  isLoadingSubcategorias = false;
  isProcessingSubcategoria = false; // Flag to prevent multiple save operations

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

      // Check if all categories have the same position (likely 0)
      const allSamePosition = this.categorias.length > 1 &&
        this.categorias.every(c => c.posicion === this.categorias[0].posicion);

      // If all have same position, normalize them
      if (allSamePosition) {
        await this.normalizeCategoriaPositions();
        // Reload after normalization
        const updatedResult = await firstValueFrom(this.repositoryService.getCategorias());
        this.categorias = updatedResult.sort((a, b) => a.posicion - b.posicion);
      }

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

      // Check if all subcategories have the same position (likely 0)
      const allSamePosition = this.subcategorias[categoria.id].length > 1 &&
        this.subcategorias[categoria.id].every(s => s.posicion === this.subcategorias[categoria.id][0].posicion);

      // If all have same position, normalize them
      if (allSamePosition) {
        await this.normalizeSubcategoriaPositions(categoria.id);
        // Reload after normalization
        const updatedResult = await firstValueFrom(this.repositoryService.getSubcategoriasByCategoria(categoria.id));
        this.subcategorias[categoria.id] = updatedResult.sort((a, b) => a.posicion - b.posicion);
      }
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
    // Find the next available position
    let nextPosition = 0;
    if (this.categorias.length > 0) {
      nextPosition = Math.max(...this.categorias.map(c => c.posicion)) + 1;
    }

    const dialogRef = this.dialog.open(CreateEditCategoriaComponent, {
      width: '500px',
      data: { defaultPosition: nextPosition }
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

    // Check if all categories have the same position
    const allSamePosition = this.categorias.every(c => c.posicion === this.categorias[0].posicion);

    // If positions are all the same, normalize them first
    if (allSamePosition) {
      this.isLoading = true;
      this.normalizeCategoriaPositions().then(() => {
        this.loadCategorias().then(() => {
          // Re-attempt the reordering after normalization
          setTimeout(() => {
            this.reorderCategoria(categoria, direction);
          }, 100);
        });
      }).catch(error => {
        console.error('Error while normalizing category positions:', error);
        this.snackBar.open('Error al normalizar posiciones de categorías', 'Cerrar', {
          duration: 3000
        });
        this.isLoading = false;
      });
      return;
    }

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

    // Make sure we have valid IDs before proceeding
    if (!categoria.id || !targetCategoria.id) {
      console.error('Invalid categoria IDs', {
        categoriaId: categoria.id,
        targetCategoriaId: targetCategoria.id
      });
      this.snackBar.open('Error: ID de categoría no válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    // Swap positions
    const tempPosition = categoria.posicion;
    categoria.posicion = targetCategoria.posicion;
    targetCategoria.posicion = tempPosition;

    this.isLoading = true;
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

      // Revert local changes on error
      categoria.posicion = tempPosition;
      targetCategoria.posicion = tempPosition;

      this.isLoading = false;
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
    // Don't set focus here, we'll do it after saving
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
    // Prevent multiple executions in quick succession
    if (this.isProcessingSubcategoria || this.subcategoriaForm.invalid || !this.expandedCategoria?.id) {
      return;
    }

    this.isProcessingSubcategoria = true;

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

    // Check for duplicate name in the same category
    const existingSubcategorias = this.subcategorias[this.expandedCategoria.id] || [];
    const normalizedName = formData.nombre.trim().toUpperCase();

    // When editing, exclude the current subcategory from the duplicate check
    const duplicateSubcategoria = existingSubcategorias.find(s =>
      s.nombre && s.nombre.trim().toUpperCase() === normalizedName &&
      (!this.editingSubcategoria || s.id !== this.editingSubcategoria.id)
    );

    if (duplicateSubcategoria) {
      this.snackBar.open('Ya existe una subcategoría con este nombre en esta categoría', 'Cerrar', {
        duration: 5000
      });
      this.isProcessingSubcategoria = false;
      return;
    }

    // For new subcategoria, set the position to be the next available position
    if (!this.editingSubcategoria) {
      const currentSubcategorias = this.subcategorias[this.expandedCategoria.id] || [];
      if (currentSubcategorias.length > 0) {
        // Find the maximum position and add 1
        const maxPosition = Math.max(...currentSubcategorias.map(s => s.posicion));
        formData.posicion = maxPosition + 1;
      } else {
        // First subcategoria in this category
        formData.posicion = 0;
      }
    }

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

      // Reload subcategorias 
      await this.loadSubcategorias(this.expandedCategoria);

      // Reset form
      this.resetSubcategoriaForm();

      // Set focus on the nombre input
      this.setFocusOnNombreInput();

    } catch (error) {
      console.error('Error saving subcategoria:', error);
      this.snackBar.open('Error al guardar subcategoría', 'Cerrar', {
        duration: 3000
      });
      this.isProcessingSubcategoria = false;
    } finally {
      this.isLoadingSubcategorias = false;
    }
  }

  /**
   * Sets focus on the nombre input field in the subcategoria form
   */
  private setFocusOnNombreInput(): void {
    // Use a sequence of attempts with increasing delays
    [0, 200, 500].forEach(delay => {
      setTimeout(() => this.attemptFocusOnSubcategoriaInput(), delay);
    });
    
    // Final attempt - reset processing flag regardless of focus success
    setTimeout(() => {
      this.attemptFocusOnSubcategoriaInput();
      this.isProcessingSubcategoria = false;
    }, 800);
  }

  /**
   * Attempts to focus the subcategoria nombre input using the most reliable method
   */
  private attemptFocusOnSubcategoriaInput(): void {
    try {
      // Clear any existing focus
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }

      // Find the visible expanded detail section
      const expandedDetail = document.querySelector('.expanded-detail-content[style*="display: block"]');
      if (expandedDetail) {
        // Find the input within the expanded section
        const input = expandedDetail.querySelector('#nombreSubcategoriaInput') as HTMLInputElement;
        if (input) {
          input.focus();
          return;
        }
        
        // Backup approach - find by form control name
        const inputByName = expandedDetail.querySelector('input[formControlName="nombre"]') as HTMLInputElement;
        if (inputByName) {
          inputByName.focus();
          return;
        }
      }
      
      // Fall back to the ElementRef if available
      if (this.nombreInputRefSubcategoria?.nativeElement) {
        this.nombreInputRefSubcategoria.nativeElement.focus();
      }
    } catch (error) {
      // Silent error handling - no need to block form submission if focus fails
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

    // Check if all subcategories have the same position
    const allSamePosition = currentSubcategorias.every(s => s.posicion === currentSubcategorias[0].posicion);

    // If positions are all the same, normalize them first
    if (allSamePosition) {
      this.isLoadingSubcategorias = true;
      try {
        await this.normalizeSubcategoriaPositions(this.expandedCategoria.id);
        await this.loadSubcategorias(this.expandedCategoria);

        // Retry the reordering operation after normalization
        setTimeout(() => {
          this.reorderSubcategoria(subcategoria, direction);
        }, 100);
        return;
      } catch (error) {
        console.error('Error while normalizing positions:', error);
        this.snackBar.open('Error al normalizar posiciones', 'Cerrar', {
          duration: 3000
        });
        this.isLoadingSubcategorias = false;
        return;
      }
    }

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

    // Make sure we have valid IDs before proceeding
    if (!subcategoria.id || !targetSubcategoria.id) {
      console.error('Invalid subcategoria IDs', {
        subcategoriaId: subcategoria.id,
        targetSubcategoriaId: targetSubcategoria.id
      });
      this.snackBar.open('Error: ID de subcategoría no válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    // Swap positions
    const tempPosition = subcategoria.posicion;
    subcategoria.posicion = targetSubcategoria.posicion;
    targetSubcategoria.posicion = tempPosition;

    this.isLoadingSubcategorias = true;
    // Update both subcategorias in the database
    try {
      // Convert IDs to numbers to ensure they're valid
      const subId = typeof subcategoria.id === 'string' ? parseInt(subcategoria.id, 10) : subcategoria.id;
      const targetId = typeof targetSubcategoria.id === 'string' ? parseInt(targetSubcategoria.id, 10) : targetSubcategoria.id;

      await Promise.all([
        firstValueFrom(this.repositoryService.updateSubcategoria(subId, { posicion: subcategoria.posicion })),
        firstValueFrom(this.repositoryService.updateSubcategoria(targetId, { posicion: targetSubcategoria.posicion }))
      ]);

      this.snackBar.open('Orden actualizado correctamente', 'Cerrar', {
        duration: 2000
      });

      // Update the local array to reflect changes before reloading
      this.subcategorias[this.expandedCategoria.id] = [...currentSubcategorias];

      // Reload from server to ensure data consistency
      await this.loadSubcategorias(this.expandedCategoria);
    } catch (error) {
      console.error('Error updating positions:', error);
      this.snackBar.open('Error al actualizar el orden', 'Cerrar', {
        duration: 3000
      });

      // Revert local changes on error
      subcategoria.posicion = tempPosition;
      targetSubcategoria.posicion = subcategoria.posicion;
    } finally {
      this.isLoadingSubcategorias = false;
    }
  }

  // Function to determine when to show the expanded row
  isExpanded(categoria: Categoria): boolean {
    return true; // Always return true to ensure the expansion row is available
  }

  /**
   * Normalizes the positions of all subcategories in a category to ensure they are sequential
   * starting from 0 and incrementing by 1
   */
  private async normalizeSubcategoriaPositions(categoriaId: number): Promise<void> {
    try {
      const subcategorias = this.subcategorias[categoriaId];
      if (!subcategorias || subcategorias.length === 0) return;

      // Sort by name as a fallback if all positions are the same
      const sortedSubcategorias = [...subcategorias].sort((a, b) => {
        if (a.posicion !== b.posicion) {
          return a.posicion - b.posicion;
        }
        // Secondary sort by name if positions are the same
        return (a.nombre || '').localeCompare(b.nombre || '');
      });

      // Update each subcategoria with its new position
      const updatePromises = sortedSubcategorias.map((subcategoria, index) => {
        if (subcategoria.posicion !== index) {
          return firstValueFrom(this.repositoryService.updateSubcategoria(
            subcategoria.id!,
            { posicion: index }
          ));
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error normalizing subcategoria positions:', error);
      throw error;
    }
  }

  /**
   * Normalizes the positions of all categories to ensure they are sequential
   * starting from 0 and incrementing by 1
   */
  private async normalizeCategoriaPositions(): Promise<void> {
    try {
      if (!this.categorias || this.categorias.length === 0) return;

      // Sort by name as a fallback if all positions are the same
      const sortedCategorias = [...this.categorias].sort((a, b) => {
        if (a.posicion !== b.posicion) {
          return a.posicion - b.posicion;
        }
        // Secondary sort by name if positions are the same
        return (a.nombre || '').localeCompare(b.nombre || '');
      });

      // Update each categoria with its new position
      const updatePromises = sortedCategorias.map((categoria, index) => {
        if (categoria.posicion !== index) {
          return firstValueFrom(this.repositoryService.updateCategoria(
            categoria.id!,
            { posicion: index }
          ));
        }
        return Promise.resolve();
      });

      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error normalizing categoria positions:', error);
      throw error;
    }
  }
}
