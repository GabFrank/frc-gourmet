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
import { RouterModule, Router } from '@angular/router';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { RepositoryService } from '../../../database/repository.service';
import { Persona } from '../../../database/entities/personas/persona.entity';
import { Usuario } from '../../../database/entities/personas/usuario.entity';
import { DocumentoTipo } from '../../../database/entities/personas/documento-tipo.enum';
import { PersonaTipo } from '../../../database/entities/personas/persona-tipo.enum';
import { CreateEditPersonaComponent } from './create-edit-persona.component';
import { firstValueFrom } from 'rxjs';
import { CreateEditUsuarioComponent } from '../usuarios/create-edit-usuario.component';
import { TabsService } from 'src/app/services/tabs.service';
import { ListUsuariosComponent } from '../usuarios/list-usuarios.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-personas',
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
    RouterModule,
    CreateEditUsuarioComponent,
    ListUsuariosComponent,
    ConfirmationDialogComponent
  ],
  templateUrl: './list-personas.component.html',
  styleUrls: ['./list-personas.component.scss']
})
export class ListPersonasComponent implements OnInit {
  personas: Partial<Persona>[] = [];
  documentoTipos = Object.values(DocumentoTipo);
  personaTipos = Object.values(PersonaTipo);
  displayedColumns: string[] = ['nombre', 'tipoDocumento', 'documento', 'tipoPersona', 'telefono', 'direccion', 'activo', 'acciones'];
  isLoading = false;
  
  // Pagination
  totalPersonas = 0;
  pageSize = 10;
  currentPage = 0;
  pageSizeOptions: number[] = [5, 10, 25, 50];
  
  // Filtering
  filterForm: FormGroup;
  
  constructor(
    private repositoryService: RepositoryService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private router: Router,
    private tabService: TabsService
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      documento: [''],
      tipoDocumento: [''],
      tipoPersona: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadPersonas();
  }

  async loadPersonas(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        nombre?: string,
        documento?: string,
        tipoDocumento?: DocumentoTipo,
        tipoPersona?: PersonaTipo,
        activo?: boolean
      } = {
        nombre: this.filterForm.get('nombre')?.value?.trim() || undefined,
        documento: this.filterForm.get('documento')?.value?.trim() || undefined,
        tipoDocumento: this.filterForm.get('tipoDocumento')?.value || undefined,
        tipoPersona: this.filterForm.get('tipoPersona')?.value || undefined,
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
      const result = await firstValueFrom(this.repositoryService.getPersonas());
      this.personas = result as Partial<Persona>[];
      
      // Apply filters manually
      if (Object.keys(filters).length > 0) {
        this.personas = this.personas.filter(persona => {
          let matches = true;
          
          if (filters.nombre && persona.nombre) {
            matches = matches && persona.nombre.toLowerCase().includes(filters.nombre.toLowerCase());
          }
          
          if (filters.documento && persona.documento) {
            matches = matches && persona.documento.toLowerCase().includes(filters.documento.toLowerCase());
          }
          
          if (filters.tipoDocumento) {
            matches = matches && persona.tipoDocumento === filters.tipoDocumento;
          }
          
          if (filters.tipoPersona) {
            matches = matches && persona.tipoPersona === filters.tipoPersona;
          }
          
          if (filters.activo !== undefined) {
            matches = matches && persona.activo === filters.activo;
          }
          
          return matches;
        });
      }
      
      this.totalPersonas = this.personas.length;
      
    } catch (error) {
      console.error('Error loading personas:', error);
      this.snackBar.open('Error al cargar personas', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
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
    
    this.personas = this.personas.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'nombre': return this.compare(a.nombre || '', b.nombre || '', isAsc);
        case 'documento': return this.compare(a.documento || '', b.documento || '', isAsc);
        case 'tipoDocumento': return this.compare(a.tipoDocumento || '', b.tipoDocumento || '', isAsc);
        case 'tipoPersona': return this.compare(a.tipoPersona || '', b.tipoPersona || '', isAsc);
        case 'telefono': return this.compare(a.telefono || '', b.telefono || '', isAsc);
        case 'direccion': return this.compare(a.direccion || '', b.direccion || '', isAsc);
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
      documento: '',
      tipoDocumento: '',
      tipoPersona: '',
      activo: ''
    });
    
    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadPersonas();
  }
  
  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadPersonas();
  }
  
  editPersona(persona: Partial<Persona>): void {
    const dialogRef = this.dialog.open(CreateEditPersonaComponent, {
      width: '600px',
      data: { persona }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Persona actualizada correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadPersonas();
      } else if (result && !result.success) {
        this.snackBar.open('Error al actualizar persona', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }
  
  deletePersona(id: number): void {
    if (confirm('¿Está seguro de que desea eliminar esta persona?')) {
      firstValueFrom(this.repositoryService.deletePersona(id))
        .then(result => {
          this.snackBar.open('Persona eliminada correctamente', 'Cerrar', {
            duration: 3000
          });
          this.loadPersonas();
        })
        .catch(error => {
          console.error('Error deleting persona:', error);
          this.snackBar.open('Error al eliminar persona', 'Cerrar', {
            duration: 3000
          });
        });
    }
  }
  
  addPersona(): void {
    const dialogRef = this.dialog.open(CreateEditPersonaComponent, {
      width: '600px',
      data: {}
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Persona creada correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadPersonas();
      } else if (result && !result.success) {
        this.snackBar.open('Error al crear persona', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }
  
  getDocumentoTipoLabel(tipo?: DocumentoTipo): string {
    return tipo || '';
  }

  getPersonaTipoLabel(tipo?: PersonaTipo): string {
    return tipo === PersonaTipo.FISICA ? 'Física' : tipo === PersonaTipo.JURIDICA ? 'Jurídica' : '';
  }
  
  // Used to set data from tab service
  setData(data: any): void {
    // Reload data if necessary
    this.loadPersonas();
  }

  async createEditUsuario(persona: Partial<Persona>): Promise<void> {
    if (!persona.id) {
      this.snackBar.open('Error: La persona no tiene un ID válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.isLoading = true;
    try {
      // Find if there's a usuario associated with this persona
      const usuarios = await firstValueFrom(this.repositoryService.getUsuarios());
      const existingUsuario = usuarios.find(u => u.persona?.id === persona.id);
      
      if (existingUsuario) {
        // If user exists, open edit dialog
        const dialogRef = this.dialog.open(CreateEditUsuarioComponent, {
          width: '600px',
          data: { usuario: existingUsuario }
        });

        dialogRef.afterClosed().subscribe(result => {
          if (result && result.success) {
            this.snackBar.open('Usuario actualizado correctamente', 'Cerrar', {
              duration: 3000
            });
            
            // If usuario data is returned, ask user if they want to navigate
            if (result.usuario) {
              this.showNavigationConfirmation(result.usuario);
            }
          } else if (result && !result.success) {
            this.snackBar.open('Error al actualizar usuario', 'Cerrar', {
              duration: 3000
            });
          }
        });
      } else {
        // If no user exists, open create dialog with persona pre-selected
        const dialogRef = this.dialog.open(CreateEditUsuarioComponent, {
          width: '600px',
          data: { 
            preselectedPersona: persona
          }
        });

        dialogRef.afterClosed().subscribe(result => {          
          if (result && result.success) {
            this.snackBar.open('Usuario creado correctamente', 'Cerrar', {
              duration: 3000
            });
            
            // If usuario data is returned, ask user if they want to navigate
            if (result.usuario) {
              this.showNavigationConfirmation(result);
            }
          } else if (result && !result.success) {
            this.snackBar.open('Error al crear usuario', 'Cerrar', {
              duration: 3000
            });
          }
        });
      }
    } catch (error) {
      console.error('Error al buscar usuario:', error);
      this.snackBar.open('Error al buscar información de usuario', 'Cerrar', {
        duration: 3000
      });
    } finally {
      this.isLoading = false;
    }
  }
  
  // New method to show navigation confirmation dialog
  private showNavigationConfirmation(userData: any): void {
    const confirmDialog = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Ir a Listado de Usuarios',
        message: '¿Desea ir al listado de usuarios para ver los cambios?'
      }
    });

    confirmDialog.afterClosed().subscribe(result => {
      if (result === true) {
        // User confirmed, navigate to the usuarios tab
        this.openUsuariosTab(userData);
      }
    });
  }
  
  // Helper function to open the usuarios tab and set filter
  private openUsuariosTab(data: any): void {
    // Create the tab data with the nickname filter
    const tabData = {
      filterData: {
        nickname: data.usuario.nickname
      }
    };
    
    // Use the enhanced openTabWithData method that handles delayed data updates
    this.tabService.openTabWithData(
      'Usuarios',
      ListUsuariosComponent,
      tabData
    );
  }
} 