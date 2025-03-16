import { Component, Input, OnChanges, OnInit, SimpleChanges, AfterViewInit } from '@angular/core';
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
import { RepositoryService } from '../../../database/repository.service';
import { Usuario } from '../../../database/entities/personas/usuario.entity';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { CreateEditUsuarioComponent } from './create-edit-usuario.component';
import { GenericSearchDialogComponent } from '../../../shared/components/generic-search-dialog/generic-search-dialog.component';

@Component({
  selector: 'app-list-usuarios',
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
    CreateEditUsuarioComponent,
    GenericSearchDialogComponent
  ],
  templateUrl: './list-usuarios.component.html',
  styleUrls: ['./list-usuarios.component.scss']
})
export class ListUsuariosComponent implements OnInit, OnChanges, AfterViewInit {
  // This will be set by the tab container
  @Input() data: any;

  usuarios: Usuario[] = [];
  displayedColumns: string[] = ['id', 'nickname', 'persona', 'activo', 'acciones'];
  isLoading = false;
  
  // Flag to track if data has been processed
  private dataProcessed = false;

  // Pagination
  totalUsuarios = 0;
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
      nickname: [''],
      nombrePersona: [''],
      activo: ['']
    });
    
    // Add debugging info
    console.log('[ListUsuariosComponent] Constructor called');
    console.log('[ListUsuariosComponent] setData method accessible:', typeof this.setData === 'function');
    
    // Expose setData method on window for debugging
    (window as any).listUsuariosComponent = this;
  }

  ngOnInit(): void {
    console.log('[ListUsuariosComponent] ngOnInit with data:', this.data);
    
    // Apply initial data if available
    if (this.data) {
      this.processData();
    } else {
      // Otherwise just load all usuarios
      this.loadUsuarios();
    }
  }

  ngAfterViewInit(): void {
    console.log('[ListUsuariosComponent] ngAfterViewInit');
    // Double-check if data was processed
    if (this.data && !this.dataProcessed) {
      console.log('[ListUsuariosComponent] Processing data in ngAfterViewInit');
      this.processData();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    console.log('[ListUsuariosComponent] ngOnChanges', changes);
    if (changes['data'] && changes['data'].currentValue) {
      this.processData();
    }
  }
  
  // Process the input data
  private processData(): void {
    console.log('[ListUsuariosComponent] Processing data:', this.data);
    this.dataProcessed = true;
    this.setData(this.data);
  }

  // Used to set data from tab service
  setData(data: any): void {
    console.log('[ListUsuariosComponent] setData called with:', data);
    
    // If no data provided, just load all
    if (!data) {
      console.log('[ListUsuariosComponent] No data provided, loading all usuarios');
      this.loadUsuarios();
      return;
    }
    
    // Check if we have filter data from another component
    if (data.filterData) {
      console.log('[ListUsuariosComponent] Found filterData:', data.filterData);
      
      let filterApplied = false;
      
      // Apply filters from data
      if (data.filterData.nickname) {
        console.log('[ListUsuariosComponent] Setting nickname filter to:', data.filterData.nickname);
        this.filterForm.get('nickname')?.setValue(data.filterData.nickname);
        filterApplied = true;
      }
      
      if (data.filterData.nombrePersona) {
        console.log('[ListUsuariosComponent] Setting nombrePersona filter to:', data.filterData.nombrePersona);
        this.filterForm.get('nombrePersona')?.setValue(data.filterData.nombrePersona);
        filterApplied = true;
      }
      
      if (data.filterData.activo !== undefined) {
        console.log('[ListUsuariosComponent] Setting activo filter to:', data.filterData.activo);
        this.filterForm.get('activo')?.setValue(data.filterData.activo);
        filterApplied = true;
      }
      
      // Only trigger search if we actually applied filters
      if (filterApplied) {
        console.log('[ListUsuariosComponent] Triggering search with applied filters');
        this.buscar();
      } else {
        console.log('[ListUsuariosComponent] No filters were applied, loading all usuarios');
        this.loadUsuarios();
      }
    } else {
      console.log('[ListUsuariosComponent] No filterData found, loading all usuarios');
      this.loadUsuarios();
    }
  }

  async loadUsuarios(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form with proper trimming for strings
      const filters: {
        nickname?: string,
        nombrePersona?: string,
        activo?: string | boolean
      } = {
        nickname: this.filterForm.get('nickname')?.value?.trim?.() || undefined,
        nombrePersona: this.filterForm.get('nombrePersona')?.value?.trim?.() || undefined,
        activo: this.filterForm.get('activo')?.value
      };

      // Filter out empty/null/undefined values
      Object.keys(filters).forEach(key => {
        const k = key as keyof typeof filters;
        // Only delete if it's an empty string, null, or undefined
        // We want to keep boolean false values for activo filter
        if (filters[k] === '' || filters[k] === null || filters[k] === undefined) {
          delete filters[k];
        }
      });

      // Get paginated data from repository with filters
      const data = await firstValueFrom(
        this.repositoryService.getUsuariosPaginated(this.currentPage, this.pageSize, filters)
      );


      this.usuarios = data.items;
      this.totalUsuarios = data.total;
    } catch (error) {
      console.error('Error loading usuarios:', error);
      this.snackBar.open('Error al cargar usuarios', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
    // Reload data with new pagination parameters
    this.loadUsuarios();
  }

  onSort(sortState: Sort): void {
    if (!sortState.active || sortState.direction === '') {
      return;
    }

    this.usuarios = this.usuarios.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'id': return this.compare(a.id, b.id, isAsc);
        case 'nickname': return this.compare(a.nickname, b.nickname, isAsc);
        case 'persona':
          return this.compare(
            a.persona?.nombre || '',
            b.persona?.nombre || '',
            isAsc
          );
        case 'activo': return this.compare(a.activo, b.activo, isAsc);
        default: return 0;
      }
    });
  }

  compare(a: any, b: any, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  clearFilters(): void {
    this.filterForm.reset({
      nickname: '',
      nombrePersona: '',
      activo: ''
    });

    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadUsuarios();
  }

  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadUsuarios();
  }

  editUsuario(usuario: Usuario): void {
    const dialogRef = this.dialog.open(CreateEditUsuarioComponent, {
      width: '600px',
      data: { usuario }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Usuario actualizado correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadUsuarios();
      } else if (result && !result.success) {
        this.snackBar.open('Error al actualizar usuario', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  async deleteUsuario(usuario: Usuario): Promise<void> {
    if (confirm(`¿Está seguro que desea eliminar el usuario ${usuario.nickname}?`)) {
      try {
        await firstValueFrom(this.repositoryService.deleteUsuario(usuario.id!));
        this.snackBar.open('Usuario eliminado correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadUsuarios();
      } catch (error) {
        console.error('Error deleting usuario:', error);
        this.snackBar.open('Error al eliminar usuario', 'Cerrar', {
          duration: 3000
        });
      }
    }
  }

  addUsuario(): void {
    const dialogRef = this.dialog.open(CreateEditUsuarioComponent, {
      width: '600px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Usuario creado correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadUsuarios();
      } else if (result && !result.success) {
        this.snackBar.open('Error al crear usuario', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }
} 