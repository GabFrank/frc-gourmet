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

// Extended interface to include display values
interface PersonaViewModel extends Partial<Persona> {
  displayValues: {
    tipoDocumentoLabel: string;
    tipoPersonaLabel: string;
  };
}

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
  personas: PersonaViewModel[] = [];
  documentoTipos = Object.values(DocumentoTipo);
  personaTipos = Object.values(PersonaTipo);
  displayedColumns: string[] = ['nombre', 'tipoDocumento', 'documento', 'tipoPersona', 'telefono', 'direccion', 'activo', 'acciones'];
  isLoading = false;
  
  // Pre-computed label maps
  documentoTipoLabels: Record<DocumentoTipo, string> = {
    [DocumentoTipo.CI]: 'C.I.',
    [DocumentoTipo.RUC]: 'RUC',
    [DocumentoTipo.CPF]: 'CPF',
    [DocumentoTipo.PASAPORTE]: 'Pasaporte'
  };

  personaTipoLabels: Record<PersonaTipo, string> = {
    [PersonaTipo.FISICA]: 'Física',
    [PersonaTipo.JURIDICA]: 'Jurídica'
  };
  
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
      const personas = result as Partial<Persona>[];
      
      // Apply filters manually
      let filteredPersonas = personas;
      if (Object.keys(filters).length > 0) {
        filteredPersonas = personas.filter(persona => {
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
      
      // Convert to view model with pre-computed values
      this.personas = filteredPersonas.map(persona => this.convertToViewModel(persona));
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

  // Convert Persona to PersonaViewModel with pre-computed display values
  private convertToViewModel(persona: Partial<Persona>): PersonaViewModel {
    return {
      ...persona,
      displayValues: {
        tipoDocumentoLabel: this.computeDocumentoTipoLabel(persona.tipoDocumento),
        tipoPersonaLabel: this.computePersonaTipoLabel(persona.tipoPersona)
      }
    };
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
    this.loadPersonas();
  }
  
  buscar(): void {
    this.loadPersonas();
  }
  
  editPersona(persona: PersonaViewModel): void {
    const dialogRef = this.dialog.open(CreateEditPersonaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        persona: persona,
        isEditMode: true
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPersonas();
      }
    });
  }
  
  deletePersona(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar Persona',
        message: '¿Está seguro que desea eliminar esta persona?',
        confirmText: 'Eliminar',
        cancelText: 'Cancelar'
      }
    });
    
    dialogRef.afterClosed().subscribe(async result => {
      if (result) {
        try {
          await firstValueFrom(this.repositoryService.deletePersona(id));
          this.snackBar.open('Persona eliminada correctamente', 'Cerrar', { duration: 3000 });
          this.loadPersonas();
        } catch (error) {
          console.error('Error deleting persona:', error);
          this.snackBar.open('Error al eliminar la persona', 'Cerrar', { duration: 3000 });
        }
      }
    });
  }
  
  addPersona(): void {
    const dialogRef = this.dialog.open(CreateEditPersonaComponent, {
      width: '800px',
      disableClose: true,
      data: {
        isEditMode: false
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadPersonas();
      }
    });
  }
  
  // Private computation methods
  private computeDocumentoTipoLabel(tipo?: DocumentoTipo): string {
    if (!tipo) return '-';
    return this.documentoTipoLabels[tipo] || tipo;
  }
  
  private computePersonaTipoLabel(tipo?: PersonaTipo): string {
    if (!tipo) return '-';
    return this.personaTipoLabels[tipo] || tipo;
  }
  
  // Public methods - these shouldn't be called directly from the template
  getDocumentoTipoLabel(tipo?: DocumentoTipo): string {
    return this.computeDocumentoTipoLabel(tipo);
  }
  
  getPersonaTipoLabel(tipo?: PersonaTipo): string {
    return this.computePersonaTipoLabel(tipo);
  }
  
  setData(data: any): void {
    // This method can be used to receive data from other components
    console.log('Received data:', data);
  }
  
  async createEditUsuario(persona: PersonaViewModel): Promise<void> {
    try {
      // First, check if this persona already has a user
      const usuarios = await firstValueFrom(this.repositoryService.getUsuarios());
      const existingUsuario = usuarios.find(u => u.persona?.id === persona.id);
      
      let dialogData: any;
      
      if (existingUsuario) {
        // Edit existing user
        dialogData = {
          usuario: existingUsuario,
          persona: persona,
          isEditMode: true
        };
      } else {
        // Create new user
        dialogData = {
          persona: persona,
          isEditMode: false
        };
      }
      
      // Open dialog
      const dialogRef = this.dialog.open(CreateEditUsuarioComponent, {
        width: '800px',
        disableClose: true,
        data: dialogData
      });
      
      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          // Ask user if they want to navigate to the usuarios list
          this.showNavigationConfirmation(result);
        }
      });
    } catch (error) {
      console.error('Error checking for existing usuario:', error);
      this.snackBar.open('Error al verificar usuario existente', 'Cerrar', { duration: 3000 });
    }
  }
  
  private showNavigationConfirmation(userData: any): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Usuario guardado',
        message: '¿Desea ir a la lista de usuarios?',
        confirmText: 'Sí',
        cancelText: 'No'
      }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.openUsuariosTab(userData);
      }
    });
  }
  
  private openUsuariosTab(data: any): void {
    this.tabService.openTab(
      'Usuarios',
      ListUsuariosComponent,
      { source: 'persona', data: data },
      'usuarios-tab',
      true
    );
  }
} 