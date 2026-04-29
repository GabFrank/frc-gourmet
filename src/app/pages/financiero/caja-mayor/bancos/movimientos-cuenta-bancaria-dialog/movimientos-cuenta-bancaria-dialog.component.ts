import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
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
import { CrearMovimientoBancarioDialogComponent } from '../crear-movimiento-bancario-dialog/crear-movimiento-bancario-dialog.component';

@Component({
  selector: 'app-movimientos-cuenta-bancaria-dialog',
  templateUrl: './movimientos-cuenta-bancaria-dialog.component.html',
  styleUrls: ['./movimientos-cuenta-bancaria-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule, MatCardModule,
    MatProgressSpinnerModule, MatChipsModule, MatDialogModule, MatSnackBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatNativeDateModule, MatTooltipModule, MatPaginatorModule,
    DatePipe, DecimalPipe,
  ]
})
export class MovimientosCuentaBancariaDialogComponent implements OnInit {
  cuentaBancaria: any = null;
  movimientos: any[] = [];
  loading = false;
  total = 0;
  page = 0;
  pageSize = 15;
  pageSizeOptions = [10, 15, 25, 50];
  displayedColumns = ['fecha', 'tipo', 'descripcion', 'comprobante', 'origen', 'monto'];

  filterForm!: FormGroup;
  tiposFiltro = [
    { value: null, label: 'Todos' },
    { value: 'ENTRADA_MANUAL', label: 'Entrada Manual' },
    { value: 'SALIDA_MANUAL', label: 'Salida Manual' },
    { value: 'AJUSTE_POSITIVO', label: 'Ajuste Positivo' },
    { value: 'AJUSTE_NEGATIVO', label: 'Ajuste Negativo' },
    { value: 'CHEQUE_COBRADO', label: 'Cheque Cobrado' },
    { value: 'ACREDITACION_POS', label: 'Acreditacion POS' },
    { value: 'DEPOSITO', label: 'Deposito' },
    { value: 'RETIRO', label: 'Retiro' },
    { value: 'ENTRADA_VARIA', label: 'Entrada Varia' },
  ];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    @Optional() public dialogRef: MatDialogRef<MovimientosCuentaBancariaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {
    this.cuentaBancaria = data?.cuentaBancaria;
  }

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      fechaDesde: [null],
      fechaHasta: [null],
      tipo: [null],
      esIngreso: [null],
    });
    this.loadData();
  }

  async loadData(): Promise<void> {
    if (!this.cuentaBancaria?.id) return;
    this.loading = true;
    try {
      const filtros: any = { ...this.filterForm.value, page: this.page, pageSize: this.pageSize };
      const result = await firstValueFrom(this.repositoryService.getMovimientosCuentaBancaria(this.cuentaBancaria.id, filtros));
      this.movimientos = result?.items || [];
      this.total = result?.total || 0;
    } catch (error) {
      console.error('Error loading movimientos:', error);
      this.snackBar.open('Error al cargar movimientos', 'Cerrar', { duration: 3000 });
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

  abrirCrearMovimiento(): void {
    const ref = this.dialog.open(CrearMovimientoBancarioDialogComponent, {
      width: '600px',
      data: { cuentaBancaria: this.cuentaBancaria },
    });
    ref.afterClosed().subscribe(r => {
      if (r) {
        this.loadData();
        this.refrescarSaldo();
      }
    });
  }

  async refrescarSaldo(): Promise<void> {
    try {
      const cb = await firstValueFrom(this.repositoryService.getCuentaBancaria(this.cuentaBancaria.id));
      if (cb) this.cuentaBancaria = cb;
    } catch (e) { console.error(e); }
  }

  cerrar(): void {
    this.dialogRef?.close();
  }

  origenColor(origen: string): string {
    switch (origen) {
      case 'MANUAL': return '#757575';
      case 'CHEQUE': return '#0d47a1';
      case 'POS': return '#ad1457';
      case 'OP_FIN': return '#6a1b9a';
      case 'ENTRADA_VARIA': return '#2e7d32';
      default: return '#9e9e9e';
    }
  }
}
