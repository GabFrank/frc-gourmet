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
import { CreateOperacionFinancieraDialogComponent } from '../create-operacion-financiera/create-operacion-financiera-dialog.component';

@Component({
  selector: 'app-list-operaciones-financieras',
  templateUrl: './list-operaciones-financieras.component.html',
  styleUrls: ['./list-operaciones-financieras.component.scss'],
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
export class ListOperacionesFinancierasComponent implements OnInit {
  operaciones: any[] = [];
  loading = false;
  total = 0;
  page = 0;
  pageSize = 15;
  pageSizeOptions = [10, 15, 25, 50];
  displayedColumns = ['fecha', 'tipoOperacion', 'descripcion', 'origen', 'destino', 'estado', 'actions'];

  filterForm!: FormGroup;
  cajaMayorId: number | null = null;

  tiposOperacion = [
    { value: 'CAMBIO_DIVISA', label: 'Cambio Divisa' },
    { value: 'DEPOSITO_BANCARIO', label: 'Deposito Bancario' },
    { value: 'RETIRO_BANCARIO', label: 'Retiro Bancario' },
    { value: 'TRANSFERENCIA_ENTRE_CAJAS', label: 'Transferencia entre Cajas' },
  ];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      tipoOperacion: [null],
      fechaDesde: [null],
      fechaHasta: [null],
      anulado: [null],
    });
    this.loadData();
  }

  setData(data: any): void {
    if (data?.cajaMayorId) {
      this.cajaMayorId = data.cajaMayorId;
      this.loadData();
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const filtros: any = { ...this.filterForm.value, page: this.page, pageSize: this.pageSize };
      if (this.cajaMayorId) filtros.cajaMayorId = this.cajaMayorId;
      const result = await firstValueFrom(this.repositoryService.getOperacionesFinancieras(filtros));
      if (result && result.items) {
        this.operaciones = result.items;
        this.total = result.total;
      } else {
        this.operaciones = result || [];
        this.total = this.operaciones.length;
      }
    } catch (error) {
      console.error('Error loading operaciones financieras:', error);
      this.snackBar.open('Error al cargar operaciones', 'Cerrar', { duration: 3000 });
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
    const ref = this.dialog.open(CreateOperacionFinancieraDialogComponent, {
      width: '900px',
      maxHeight: '90vh',
      data: { cajaMayorId: this.cajaMayorId },
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  formatOrigen(op: any): string {
    if (op.cuentaBancariaOrigen) {
      return `Cta ${op.cuentaBancariaOrigen.nombre} (${op.cuentaBancariaOrigen.banco}) ${op.montoOrigen || ''}`;
    }
    if (op.cajaMayorOrigen) {
      return `${op.cajaMayorOrigen.nombre} (${op.monedaOrigen?.simbolo || ''} ${op.formaPagoOrigen?.nombre || ''}) ${op.montoOrigen || ''}`;
    }
    return '-';
  }

  formatDestino(op: any): string {
    if (op.cuentaBancariaDestino) {
      return `Cta ${op.cuentaBancariaDestino.nombre} (${op.cuentaBancariaDestino.banco}) ${op.montoDestino || ''}`;
    }
    if (op.cajaMayorDestino) {
      return `${op.cajaMayorDestino.nombre} (${op.monedaDestino?.simbolo || ''} ${op.formaPagoDestino?.nombre || ''}) ${op.montoDestino || ''}`;
    }
    return '-';
  }

  tipoColor(tipo: string): string {
    switch (tipo) {
      case 'CAMBIO_DIVISA': return '#1976d2';
      case 'DEPOSITO_BANCARIO': return '#43a047';
      case 'RETIRO_BANCARIO': return '#f57c00';
      case 'TRANSFERENCIA_ENTRE_CAJAS': return '#6a1b9a';
      default: return '#757575';
    }
  }

  tipoLabel(tipo: string): string {
    return this.tiposOperacion.find(t => t.value === tipo)?.label || tipo;
  }

  async anular(op: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Operacion',
        message: `¿Anular la operacion "${op.descripcion}"? Se generaran contra-movimientos y se revertiran saldos.`,
      }
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularOperacionFinanciera(op.id, 'ANULACION MANUAL'));
      this.snackBar.open('Operacion anulada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error) {
      console.error('Error anulando operacion financiera:', error);
      this.snackBar.open('Error al anular', 'Cerrar', { duration: 3000 });
    }
  }
}
