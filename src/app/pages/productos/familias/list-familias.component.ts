import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../database/repository.service';
import { CreateEditFamiliaComponent } from './create-edit-familia.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { Familia } from '../../../database/entities/productos/familia.entity';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';

@Component({
  selector: 'app-list-familias',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatMenuModule,
    HasPermissionDirective,
  ],
  templateUrl: './list-familias.component.html',
  styleUrls: ['./list-familias.component.scss']
})
export class ListFamiliasComponent implements OnInit {
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  displayedColumns: string[] = ['nombre', 'activo', 'createdAt', 'actions'];
  dataSource = new MatTableDataSource<Familia>();
  isLoading = false;

  filterForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      activo: [''], // '' = TODOS, 'true' = ACTIVOS, 'false' = INACTIVOS
    });
  }

  ngOnInit(): void {
    this.loadFamilias();
  }

  ngAfterViewInit(): void {
    this.dataSource.paginator = this.paginator;
  }

  async loadFamilias(): Promise<void> {
    this.isLoading = true;
    try {
      const nombre = (this.filterForm.get('nombre')?.value || '').trim().toLowerCase();
      const activoRaw = this.filterForm.get('activo')?.value;
      const activo: boolean | undefined =
        activoRaw === 'true' ? true : activoRaw === 'false' ? false : undefined;

      const all = await firstValueFrom(this.repositoryService.getFamilias());

      let filtered = all || [];
      if (nombre) {
        filtered = filtered.filter((f) => (f.nombre || '').toLowerCase().includes(nombre));
      }
      if (activo !== undefined) {
        filtered = filtered.filter((f) => f.activo === activo);
      }

      filtered.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
      this.dataSource.data = filtered;

      if (this.dataSource.paginator) {
        this.dataSource.paginator.firstPage();
      }
    } catch (error) {
      console.error('ERROR_LOADING_FAMILIAS', error);
      this.snackBar.open('Error al cargar familias', 'CERRAR', {
        duration: 5000,
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
    }
  }

  buscar(): void {
    this.loadFamilias();
  }

  limpiarFiltros(): void {
    this.filterForm.reset({ nombre: '', activo: '' });
    this.loadFamilias();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditFamiliaComponent, {
      width: '60%',
      height: '70%',
      data: { isEdit: false }
    });

    // Siempre recargar al cerrar: el dialog puede crear una familia y
    // mantenerse abierto para agregar subfamilias, asi que el resultado
    // del cierre no es confiable para decidir si refrescar.
    dialogRef.afterClosed().subscribe(() => this.loadFamilias());
  }

  openEditDialog(familia: Familia): void {
    const dialogRef = this.dialog.open(CreateEditFamiliaComponent, {
      width: '60%',
      height: '70%',
      data: { isEdit: true, familia: familia }
    });

    dialogRef.afterClosed().subscribe(() => this.loadFamilias());
  }

  deleteFamilia(familia: Familia): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'CONFIRMAR ELIMINACION',
        message: `¿Está seguro que desea eliminar la familia "${familia.nombre}"?`,
        confirmText: 'ELIMINAR',
        cancelText: 'CANCELAR'
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.isLoading = true;
        this.repositoryService.deleteFamilia(familia.id!).subscribe({
          next: () => {
            this.snackBar.open('Familia eliminada correctamente', 'CERRAR', {
              duration: 3000,
              panelClass: ['success-snackbar']
            });
            this.loadFamilias();
          },
          error: (error) => {
            console.error('ERROR_DELETING_FAMILIA', error);
            this.snackBar.open('Error al eliminar familia', 'CERRAR', {
              duration: 5000,
              panelClass: ['error-snackbar']
            });
            this.isLoading = false;
          }
        });
      }
    });
  }

  toggleStatus(familia: Familia): void {
    const updatedFamilia = { ...familia, activo: !familia.activo };
    this.isLoading = true;

    this.repositoryService.updateFamilia(familia.id!, updatedFamilia).subscribe({
      next: () => {
        const statusText = updatedFamilia.activo ? 'activada' : 'desactivada';
        this.snackBar.open(`Familia ${statusText} correctamente`, 'CERRAR', {
          duration: 3000,
          panelClass: ['success-snackbar']
        });
        this.loadFamilias();
      },
      error: (error) => {
        console.error('ERROR_UPDATING_FAMILIA_STATUS', error);
        this.snackBar.open('Error al cambiar estado de familia', 'CERRAR', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
        this.isLoading = false;
      }
    });
  }
}
