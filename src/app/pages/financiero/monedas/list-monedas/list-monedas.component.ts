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
import { FormsModule, ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RepositoryService } from '../../../../database/repository.service';
import { Moneda } from '../../../../database/entities/financiero/moneda.entity';
import { TabsService } from '../../../../services/tabs.service';
import { firstValueFrom } from 'rxjs';
import { CreateEditMonedaComponent } from '../create-edit-moneda/create-edit-moneda.component';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { ConfigMonedasDialogComponent } from '../config-monedas/config-monedas-dialog.component';
import { ListaBilletesDialogComponent } from '../billetes/lista-billetes-dialog.component';
import { CreateEditMonedaCambioDialogComponent } from '../cambios/create-edit-moneda-cambio-dialog.component';
import { ListMonedasCambioDialogComponent } from '../cambios/list-monedas-cambio-dialog.component';

@Component({
  selector: 'app-list-monedas',
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
    MatTooltipModule,
    ConfirmationDialogComponent,
    CreateEditMonedaCambioDialogComponent,
    ListMonedasCambioDialogComponent
  ],
  templateUrl: './list-monedas.component.html',
  styleUrls: ['./list-monedas.component.scss']
})
export class ListMonedasComponent implements OnInit {
  monedas: Moneda[] = [];
  displayedColumns: string[] = ['denominacion', 'simbolo', 'principal', 'activo', 'acciones'];
  isLoading = false;

  // Pagination
  totalMonedas = 0;
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
    private tabsService: TabsService
  ) {
    this.filterForm = this.fb.group({
      denominacion: [''],
      activo: ['']
    });
  }

  ngOnInit(): void {
    this.loadMonedas();
  }

  async loadMonedas(): Promise<void> {
    this.isLoading = true;
    try {
      // Get filter values from form
      const filters: {
        denominacion?: string,
        activo?: boolean
      } = {
        denominacion: this.filterForm.get('denominacion')?.value?.trim() || undefined,
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

      // Get all monedas
      const result = await firstValueFrom(this.repositoryService.getMonedas());
      this.monedas = result;

      // Apply filters manually
      if (Object.keys(filters).length > 0) {
        this.monedas = this.monedas.filter(moneda => {
          let matches = true;

          if (filters.denominacion && moneda.denominacion) {
            matches = matches && moneda.denominacion.toLowerCase().includes(filters.denominacion.toLowerCase());
          }

          if (filters.activo !== undefined) {
            matches = matches && moneda.activo === filters.activo;
          }

          return matches;
        });
      }

      // Sort by denominacion
      this.monedas.sort((a, b) => a.denominacion.localeCompare(b.denominacion));

      this.totalMonedas = this.monedas.length;

    } catch (error) {
      console.error('Error loading monedas:', error);
      this.snackBar.open('Error al cargar monedas', 'Cerrar', {
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

    this.monedas = this.monedas.sort((a, b) => {
      const isAsc = sortState.direction === 'asc';
      switch (sortState.active) {
        case 'denominacion': return this.compare(a.denominacion || '', b.denominacion || '', isAsc);
        case 'simbolo': return this.compare(a.simbolo || '', b.simbolo || '', isAsc);
        case 'principal': return this.compare(a.principal || false, b.principal || false, isAsc);
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
      denominacion: '',
      activo: ''
    });

    // Reset to first page and reload data
    this.currentPage = 0;
    this.loadMonedas();
  }

  buscar(): void {
    // Reset to first page when applying new filters
    this.currentPage = 0;
    this.loadMonedas();
  }

  editMoneda(moneda: Moneda): void {
    // Open the edit moneda component in a dialog
    const dialogRef = this.dialog.open(CreateEditMonedaComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: { moneda: moneda }
    });

    // Refresh the list when the dialog is closed
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadMonedas();
      }
    });
  }

  deleteMoneda(id: number): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '350px',
      data: {
        title: 'Confirmar Eliminación',
        message: '¿Está seguro de que desea eliminar esta moneda?'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        firstValueFrom(this.repositoryService.deleteMoneda(id))
          .then(() => {
            this.snackBar.open('Moneda eliminada correctamente', 'Cerrar', {
              duration: 3000
            });
            this.loadMonedas();
          })
          .catch(error => {
            console.error('Error deleting moneda:', error);
            this.snackBar.open('Error al eliminar moneda', 'Cerrar', {
              duration: 3000
            });
          });
      }
    });
  }

  addMoneda(): void {
    // Open the create moneda component in a dialog instead of a tab
    const dialogRef = this.dialog.open(CreateEditMonedaComponent, {
      width: '800px',
      maxHeight: '90vh',
      data: { moneda: null }
    });

    // Refresh the list when the dialog is closed
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadMonedas();
      }
    });
  }

  // Functions from the old MonedaComponent

  openConfigDialog(): void {
    const dialogRef = this.dialog.open(ConfigMonedasDialogComponent, {
      width: '800px',
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Configuración de monedas guardada correctamente', 'Cerrar', {
          duration: 3000
        });
        this.loadMonedas();
      }
    });
  }

  openBilletesDialog(moneda: Moneda): void {
    const dialogRef = this.dialog.open(ListaBilletesDialogComponent, {
      width: '600px',
      data: { moneda },
      disableClose: true
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Billetes actualizados correctamente', 'Cerrar', {
          duration: 3000
        });
      }
    });
  }

  openCambiosDialog(moneda: Moneda): void {
    try {
      const dialogRef = this.dialog.open(ListMonedasCambioDialogComponent, {
        width: '900px',
        data: { monedaOrigen: moneda },
        disableClose: true
      });

      dialogRef.afterClosed().subscribe(result => {
        if (result) {
          this.loadMonedas();
        }
      });
    } catch (error) {
      console.error('Error opening cambios dialog:', error);
      this.snackBar.open(
        'Error al abrir el diálogo de tipos de cambio. Es posible que el backend no tenga implementado el servicio para monedas de cambio.',
        'Entendido',
        { duration: 7000 }
      );
    }
  }

  toggleActivo(moneda: Moneda): void {
    const updatedMoneda = { ...moneda, activo: !moneda.activo };

    firstValueFrom(this.repositoryService.updateMoneda(moneda.id!, updatedMoneda))
      .then(() => {
        this.snackBar.open(`Moneda ${moneda.denominacion} ${moneda.activo ? 'desactivada' : 'activada'} correctamente`, 'Cerrar', {
          duration: 3000
        });
        this.loadMonedas();
      })
      .catch((error) => {
        console.error('Error toggling moneda status:', error);
        this.snackBar.open(`Error al cambiar el estado de la moneda: ${error.message}`, 'Cerrar', {
          duration: 3000
        });
    });
  }
}
