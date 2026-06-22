import { Component, Inject, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { RepositoryService } from '../../../../database/repository.service';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { Receta } from '../../../../database/entities/productos/receta.entity';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableDataSource } from '@angular/material/table';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { ViewChild } from '@angular/core';
import { PaginatedDropdownConfig, PaginatedDropdownOption, PaginatedDropdownSearchEvent } from '../../../../shared/components/paginated-dropdown/paginated-dropdown.component';

export interface CreateEditAdicionalDialogData {
  recetaId?: number;
  adicional?: Adicional;
  mode: 'create' | 'edit' | 'select';
}

@Component({
  selector: 'app-create-edit-adicional-dialog',
  templateUrl: './create-edit-adicional-dialog.component.html',
  styleUrls: ['./create-edit-adicional-dialog.component.scss']
})
export class CreateEditAdicionalDialogComponent implements OnInit {

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;

  adicionalForm!: FormGroup;
  loading = false;
  isEditMode = false;
  isCreateMode = false;
  isSelectMode = false;

  // Propiedades para la lista de adicionales
  adicionales: Adicional[] = [];
  adicionalesDataSource = new MatTableDataSource<Adicional>();
  adicionalesLoading = false;
  totalItems = 0;
  currentPage = 0;
  pageSize = 10;
  searchControl = new FormControl('', { nonNullable: true });
  activeFilterControl = new FormControl<'all' | 'active' | 'inactive'>('all', { nonNullable: true });

  // ✅ NUEVAS PROPIEDADES: Para gestión de recetas con PaginatedDropdown
  recetasDisponibles: Receta[] = [];
  recetaSeleccionada: Receta | null = null;
  recetaDropdownOptions: PaginatedDropdownOption[] = [];
  recetaDropdownConfig: PaginatedDropdownConfig = {
    placeholder: 'Seleccionar receta (opcional)',
    searchPlaceholder: 'Buscar recetas...',
    noDataMessage: 'No hay recetas disponibles',
    loadMoreText: 'Cargar más recetas...',
    pageSize: 10,
    searchDebounceMs: 300,
    showSearch: true,
    clearable: true
  };
  recetaDropdownLoading = false;
  recetaDropdownTotalItems = 0;
  recetaDropdownHasMoreItems = false;

  // Columnas para la tabla
  displayedColumns: string[] = ['nombre', 'precioBase', 'activo', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<CreateEditAdicionalDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CreateEditAdicionalDialogData,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.checkMode();
    this.loadRecetasDisponibles(); // ✅ NUEVO: Cargar recetas disponibles
    this.actualizarPropiedadesTemplate();

    // Solo cargar adicionales si no está en modo de edición
    if (!this.isEditMode) {
      this.loadAdicionales();
    }
  }

  private checkMode(): void {
    this.isEditMode = this.data.mode === 'edit';
    this.isCreateMode = this.data.mode === 'create';
    this.isSelectMode = this.data.mode === 'select';

    if (this.isEditMode && this.data.adicional) {
      this.loadAdicionalData();
    }
  }

  initForm(): void {
    this.adicionalForm = this.fb.group({
      nombre: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(255)]],
      precioBase: [0, [Validators.required, Validators.min(0)]],
      activo: [true],
      categoria: [''],
      recetaId: [null] // ✅ NUEVO: Campo para receta
    });

    // ✅ NUEVO: Suscribirse a cambios en recetaId
    this.adicionalForm.get('recetaId')?.valueChanges.subscribe(recetaId => {
      this.onRecetaChange(recetaId);
    });
  }

  private loadAdicionalData(): void {
    const adicional = this.data.adicional!;
    this.adicionalForm.patchValue({
      nombre: adicional.nombre,
      precioBase: adicional.precioBase,
      activo: adicional.activo,
      categoria: adicional.categoria,
      recetaId: adicional.receta?.id || null // ✅ NUEVO: Cargar receta asociada
    });
  }

  async loadAdicionales(): Promise<void> {
    this.adicionalesLoading = true;

    try {
      const activeFilter = this.activeFilterControl.value;
      const filters = {
        search: this.searchControl.value,
        activo: activeFilter === 'all' ? null : activeFilter === 'active',
        page: this.currentPage,
        pageSize: this.pageSize
      };

      const result = await this.repositoryService.getAdicionalesWithFilters(filters).toPromise();

            if (result) {
        this.adicionales = result.items;
        this.totalItems = result.total;
        this.adicionalesDataSource.data = this.adicionales;
      }
    } catch (error) {
      console.error('Error loading adicionales:', error);
      this.snackBar.open('Error al cargar adicionales', 'Cerrar', { duration: 3000 });
    } finally {
      this.adicionalesLoading = false;
    }
  }

  applyFilter(): void {
    this.currentPage = 0;
    this.loadAdicionales();
  }

  onPageChange(event: any): void {
    this.currentPage = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadAdicionales();
  }

  onFilterChange(): void {
    this.currentPage = 0;
    this.loadAdicionales();
  }

  onSubmit(): void {
    if (this.adicionalForm.valid) {
      this.loading = true;
      const formValue = this.adicionalForm.value;

      // Normalizar datos
      const adicionalData = {
        ...formValue,
        nombre: formValue.nombre.toUpperCase(),
        recetaId: formValue.recetaId // ✅ CORREGIDO: Usar el valor del formulario
      };

      if (this.isEditMode && this.data.adicional) {
        this.updateAdicional(this.data.adicional.id!, adicionalData);
      } else {
        this.createAdicional(adicionalData);
      }
    }
  }

  private createAdicional(adicionalData: any): void {
    this.repositoryService.createAdicional(adicionalData).subscribe({
      next: (nuevoAdicional: Adicional) => {
        this.loading = false;
        this.snackBar.open('Adicional creado correctamente', 'Cerrar', { duration: 2000 });

        // Si estamos en modo select, devolver el adicional creado
        if (this.isSelectMode) {
          this.dialogRef.close(nuevoAdicional);
        } else {
          // Recargar la lista
          this.loadAdicionales();
          this.adicionalForm.reset({ activo: true });
        }
      },
      error: (error: any) => {
        console.error('Error creating adicional:', error);
        this.snackBar.open('Error al crear adicional', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

  private updateAdicional(id: number, adicionalData: any): void {
    this.repositoryService.updateAdicional(id, adicionalData).subscribe({
      next: (adicionalActualizado: Adicional) => {
        this.loading = false;
        this.snackBar.open('Adicional actualizado correctamente', 'Cerrar', { duration: 2000 });
        this.dialogRef.close(adicionalActualizado);
      },
      error: (error: any) => {
        console.error('Error updating adicional:', error);
        this.snackBar.open('Error al actualizar adicional', 'Cerrar', { duration: 3000 });
        this.loading = false;
      }
    });
  }

    selectAdicional(adicional: Adicional): void {
    if (this.isSelectMode) {
      this.dialogRef.close(adicional);
    }
  }

  editAdicional(adicional: Adicional): void {
    // Cambiar a modo edición
    this.data.adicional = adicional;
    this.data.mode = 'edit';
    this.isEditMode = true;
    this.isCreateMode = false;
    this.isSelectMode = false;
    this.loadAdicionalData();
  }

  deleteAdicional(adicional: Adicional): void {
    // Aquí podrías implementar un diálogo de confirmación
    this.repositoryService.deleteAdicional(adicional.id!).subscribe({
      next: () => {
        this.snackBar.open('Adicional eliminado correctamente', 'Cerrar', { duration: 2000 });
        this.loadAdicionales();
      },
      error: (error: any) => {
        console.error('Error deleting adicional:', error);
        this.snackBar.open('Error al eliminar adicional', 'Cerrar', { duration: 3000 });
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  // ✅ NUEVOS MÉTODOS: Para gestión de recetas con PaginatedDropdown
  private loadRecetasDisponibles(): void {
    // Cargar datos iniciales
    this.searchRecetas('', 0);
  }

  private searchRecetas(searchTerm: string, page: number): void {
    this.recetaDropdownLoading = true;

    this.repositoryService.getRecetasWithFilters({
      search: searchTerm,
      page: page,
      pageSize: this.recetaDropdownConfig.pageSize,
      activo: true // Solo recetas activas
    }).subscribe({
      next: (result) => {
        // Filtrar solo recetas que no pertenecen a otros adicionales
        const recetasFiltradas = result.items.filter(receta => !receta.adicional);

        // Convertir a formato PaginatedDropdownOption
        const newOptions: PaginatedDropdownOption[] = recetasFiltradas.map(receta => ({
          id: receta.id!,
          label: receta.nombre,
          value: receta.id,
          description: receta.descripcion
        }));

        if (page === 0) {
          this.recetaDropdownOptions = newOptions;
        } else {
          this.recetaDropdownOptions = [...this.recetaDropdownOptions, ...newOptions];
        }

        this.recetaDropdownTotalItems = result.total;
        this.recetaDropdownHasMoreItems = this.recetaDropdownOptions.length < result.total;
        this.recetaDropdownLoading = false;
      },
      error: (error) => {
        console.error('Error loading recetas:', error);
        this.snackBar.open('Error al cargar recetas disponibles', 'Cerrar', { duration: 3000 });
        this.recetaDropdownLoading = false;
      }
    });
  }

  // Métodos para el PaginatedDropdown
  onRecetaSearchChange(event: PaginatedDropdownSearchEvent): void {
    this.searchRecetas(event.searchTerm, event.page);
  }

  onRecetaLoadMore(): void {
    const nextPage = Math.floor(this.recetaDropdownOptions.length / this.recetaDropdownConfig.pageSize);
    this.searchRecetas('', nextPage);
  }

  private onRecetaChange(recetaId: number | null): void {
    if (recetaId) {
      // Buscar la receta seleccionada en las opciones cargadas
      const selectedOption = this.recetaDropdownOptions.find(opt => opt.value === recetaId);
      if (selectedOption) {
        // Crear objeto receta básico para mostrar información
        this.recetaSeleccionada = {
          id: recetaId,
          nombre: selectedOption.label,
          descripcion: selectedOption.description || '',
          costoCalculado: 0, // Se actualizará si es necesario
          activo: true
        } as Receta;
      }
    } else {
      this.recetaSeleccionada = null;
    }
  }

  // Métodos para templates
  // Propiedades para templates (NO FUNCTION CALLS)
  dialogTitle = '';
  submitButtonText = '';
  canCreate = false;
  canSelect = false;

  private actualizarPropiedadesTemplate(): void {
    if (this.isEditMode) {
      this.dialogTitle = 'EDITAR ADICIONAL';
      this.submitButtonText = 'ACTUALIZAR';
    } else if (this.isCreateMode) {
      this.dialogTitle = 'CREAR NUEVO ADICIONAL';
      this.submitButtonText = 'CREAR';
    } else {
      this.dialogTitle = 'SELECCIONAR ADICIONAL';
      this.submitButtonText = 'SELECCIONAR';
    }

    this.canCreate = this.isCreateMode || this.isSelectMode;
    this.canSelect = this.isSelectMode;
  }
}
