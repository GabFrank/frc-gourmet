import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditGastoDialogComponent } from '../create-edit-gasto/create-edit-gasto-dialog.component';

@Component({
  selector: 'app-list-gastos',
  templateUrl: './list-gastos.component.html',
  styleUrls: ['./list-gastos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatTooltipModule,
    DatePipe,
  ]
})
export class ListGastosComponent implements OnInit {
  gastos: any[] = [];
  gastoCategorias: any[] = [];
  loading = false;
  displayedColumns = ['fecha', 'descripcion', 'categoria', 'monto', 'moneda', 'formaPago', 'estado', 'actions'];

  filterForm!: FormGroup;
  estadoOptions = ['ACTIVO', 'ANULADO'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      fechaDesde: [null],
      fechaHasta: [null],
      gastoCategoriaId: [null],
      estado: [null],
    });

    this.loadCategorias();
    this.loadData();
  }

  setData(data: any): void {}

  async loadCategorias(): Promise<void> {
    try {
      this.gastoCategorias = await firstValueFrom(this.repositoryService.getGastoCategorias());
    } catch (error) {
      console.error('Error loading gasto categorias:', error);
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const filtros = this.filterForm.value;
      this.gastos = await firstValueFrom(this.repositoryService.getGastos(filtros));
    } catch (error) {
      console.error('Error loading gastos:', error);
      this.snackBar.open('Error al cargar gastos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  aplicarFiltros(): void {
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filterForm.reset();
    this.loadData();
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(CreateEditGastoDialogComponent, {
      width: '700px',
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      }
    });
  }

  abrirGasto(gasto: any): void {
    const dialogRef = this.dialog.open(CreateEditGastoDialogComponent, {
      width: '700px',
      data: { gastoId: gasto.id },
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  async anularGasto(gasto: any): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Gasto',
        message: '¿Esta seguro que desea anular el gasto "' + gasto.descripcion + '"?',
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await firstValueFrom(this.repositoryService.anularGasto(gasto.id, 'ANULACION MANUAL'));
        this.snackBar.open('Gasto anulado correctamente', 'Cerrar', { duration: 3000 });
        this.loadData();
      } catch (error) {
        console.error('Error anulando gasto:', error);
        this.snackBar.open('Error al anular gasto', 'Cerrar', { duration: 3000 });
      }
    }
  }
}
