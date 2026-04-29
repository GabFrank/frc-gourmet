import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
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
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditEntradaVariaDialogComponent } from '../create-edit-entrada-varia/create-edit-entrada-varia-dialog.component';

@Component({
  selector: 'app-list-entradas-varias',
  templateUrl: './list-entradas-varias.component.html',
  styleUrls: ['./list-entradas-varias.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatProgressSpinnerModule, MatChipsModule, MatDialogModule, MatSnackBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatNativeDateModule, MatTooltipModule, MatPaginatorModule,
    DatePipe, DecimalPipe,
  ]
})
export class ListEntradasVariasComponent implements OnInit {
  entradas: any[] = [];
  categorias: any[] = [];
  loading = false;
  total = 0;
  page = 0;
  pageSize = 15;
  pageSizeOptions = [10, 15, 25, 50];
  displayedColumns = ['fecha', 'descripcion', 'categoria', 'destino', 'monto', 'moneda', 'estado', 'actions'];

  filterForm!: FormGroup;
  cajaMayorId: number | null = null;

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
      entradaVariaCategoriaId: [null],
      anulado: [null],
    });

    this.loadCategorias();
    this.loadData();
  }

  setData(data: any): void {
    if (data?.cajaMayorId) {
      this.cajaMayorId = data.cajaMayorId;
      this.loadData();
    }
  }

  async loadCategorias(): Promise<void> {
    try {
      this.categorias = await firstValueFrom(this.repositoryService.getEntradaVariaCategorias());
    } catch (error) {
      console.error('Error loading entrada varia categorias:', error);
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const filtros: any = { ...this.filterForm.value, page: this.page, pageSize: this.pageSize };
      if (this.cajaMayorId) filtros.cajaMayorId = this.cajaMayorId;
      const result = await firstValueFrom(this.repositoryService.getEntradasVarias(filtros));
      if (result && result.items) {
        this.entradas = result.items;
        this.total = result.total;
      } else {
        this.entradas = result || [];
        this.total = this.entradas.length;
      }
    } catch (error) {
      console.error('Error loading entradas varias:', error);
      this.snackBar.open('Error al cargar entradas varias', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPageChange(e: PageEvent): void {
    this.page = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadData();
  }

  aplicarFiltros(): void {
    this.page = 0;
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filterForm.reset();
    this.page = 0;
    this.loadData();
  }

  openCreateDialog(): void {
    const ref = this.dialog.open(CreateEditEntradaVariaDialogComponent, {
      width: '720px',
      data: { cajaMayorId: this.cajaMayorId },
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  async anularEntrada(entrada: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Entrada Varia',
        message: `¿Anular la entrada "${entrada.descripcion}"?`,
      }
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularEntradaVaria(entrada.id, 'ANULACION MANUAL'));
      this.snackBar.open('Entrada anulada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Error anulando entrada varia:', error);
      this.snackBar.open('Error al anular', 'Cerrar', { duration: 3000 });
    }
  }
}
