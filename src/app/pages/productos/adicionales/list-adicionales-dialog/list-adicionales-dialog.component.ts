import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { RepositoryService } from '../../../../database/repository.service';
import { Adicional } from '../../../../database/entities/productos/adicional.entity';
import { Ingrediente } from '../../../../database/entities/productos/ingrediente.entity';
import { Receta } from '../../../../database/entities/productos/receta.entity';
import { Subscription, forkJoin } from 'rxjs';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { CreateEditAdicionalDialogComponent } from '../create-edit-adicional-dialog/create-edit-adicional-dialog.component';
import { MatMenuModule } from '@angular/material/menu';

interface FilterParams {
  nombre?: string;
  ingredienteId?: number;
  recetaId?: number;
  activo?: boolean;
  pageIndex: number;
  pageSize: number;
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatPaginatorModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTableModule,
    MatCardModule,
    MatMenuModule
  ],
  selector: 'app-list-adicionales-dialog',
  templateUrl: './list-adicionales-dialog.component.html',
  styleUrls: ['./list-adicionales-dialog.component.scss']
})
export class ListAdicionalesDialogComponent implements OnInit, OnDestroy {
  // Forms
  filterForm: FormGroup;
  
  // Data
  adicionales: Adicional[] = [];
  ingredientes: Ingrediente[] = [];
  recetas: Receta[] = [];
  totalItems = 0;

  // Pagination
  pageSize = 10;
  pageIndex = 0;
  pageSizeOptions = [5, 10, 25, 50];

  // Table
  displayedColumns: string[] = ['nombre', 'ingrediente', 'receta', 'precioVentaUnitario', 'activo', 'actions'];
  
  // State
  isLoading = false;
  private subscriptions: Subscription = new Subscription();

  constructor(
    private fb: FormBuilder,
    private repository: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.filterForm = this.fb.group({
      nombreFilter: [''],
      ingredienteFilter: [null],
      recetaFilter: [null],
      activoFilter: [null]
    });
  }

  ngOnInit(): void {
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  loadData(): void {
    this.isLoading = true;
    
    // Load ingredientes and recetas for dropdowns
    const loadSubcription = forkJoin({
      ingredientes: this.repository.getIngredientes(),
      recetas: this.repository.getRecetas()
    }).subscribe({
      next: (result: any) => {
        this.ingredientes = result.ingredientes;
        this.recetas = result.recetas;
        this.loadAdicionales();
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError('Error al cargar datos de referencia');
        console.error('Error loading reference data:', error);
      }
    });
    
    this.subscriptions.add(loadSubcription);
  }

  loadAdicionales(): void {
    this.isLoading = true;
    
    // Create filter object from the filter form
    const filters: FilterParams = {
      pageIndex: this.pageIndex,
      pageSize: this.pageSize
    };
    
    // Add filter values if they exist
    const nombreFilter = this.filterForm.get('nombreFilter')?.value;
    if (nombreFilter) {
      filters.nombre = nombreFilter;
    }
    
    const ingredienteFilter = this.filterForm.get('ingredienteFilter')?.value;
    if (ingredienteFilter !== null) {
      filters.ingredienteId = ingredienteFilter;
    }
    
    const recetaFilter = this.filterForm.get('recetaFilter')?.value;
    if (recetaFilter !== null) {
      filters.recetaId = recetaFilter;
    }
    
    const activoFilter = this.filterForm.get('activoFilter')?.value;
    if (activoFilter !== null) {
      filters.activo = activoFilter;
    }
    
    // Get filtered adicionales from repository
    const subscription = this.repository.getAdicionalesFiltered(filters).subscribe({
      next: (result: any) => {
        this.adicionales = result.items;
        this.totalItems = result.total;
        this.isLoading = false;
      },
      error: (error: any) => {
        this.isLoading = false;
        this.showError('Error al cargar adicionales');
        console.error('Error loading adicionales:', error);
      }
    });
    
    this.subscriptions.add(subscription);
  }

  applyFilter(): void {
    this.pageIndex = 0; // Reset to first page when filtering
    this.loadAdicionales();
  }

  resetFilters(): void {
    this.filterForm.reset({
      nombreFilter: '',
      ingredienteFilter: null,
      recetaFilter: null,
      activoFilter: null
    });
    this.pageIndex = 0;
    this.loadAdicionales();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.pageIndex = event.pageIndex;
    this.loadAdicionales();
  }

  editAdicional(adicional: Adicional): void {
    const dialogRef = this.dialog.open(CreateEditAdicionalDialogComponent, {
      width: '800px',
      data: { adicionalId: adicional.id }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadAdicionales();
      }
    });
  }

  deleteAdicional(adicional: Adicional): void {
    this.repository.deleteAdicional(adicional.id).subscribe({
      next: () => {
        this.loadAdicionales();
      }
    });
  }

  openCreateAdicionalDialog(): void {
    const dialogRef = this.dialog.open(CreateEditAdicionalDialogComponent, {
      width: '800px'
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadAdicionales();
      }
    });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Cerrar', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }
} 