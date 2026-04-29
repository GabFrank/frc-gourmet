import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateCuentaPorCobrarDialogComponent } from '../create-cuenta-por-cobrar-dialog/create-cuenta-por-cobrar-dialog.component';
import { CuentaPorCobrarDetalleComponent } from '../cuenta-por-cobrar-detalle/cuenta-por-cobrar-detalle.component';
import { TabsService } from 'src/app/services/tabs.service';

@Component({
  selector: 'app-list-cuentas-por-cobrar',
  templateUrl: './list-cuentas-por-cobrar.component.html',
  styleUrls: ['./list-cuentas-por-cobrar.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    DatePipe,
  ]
})
export class ListCuentasPorCobrarComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  cuentas: any[] = [];
  total = 0;
  pageSize = 15;
  pageIndex = 0;
  loading = false;
  showFiltros = false;
  filtrosForm!: FormGroup;
  estadoOptions = ['ACTIVO', 'COBRADO', 'CANCELADO'];
  tipoOptions = ['CREDITO_VENTA', 'PRESTAMO_CLIENTE', 'OTRO'];

  displayedColumns = ['cliente', 'tipo', 'descripcion', 'montoTotal', 'montoCobrado', 'restante', 'cuotas', 'fechaInicio', 'estado', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.filtrosForm = this.fb.group({
      estado: [null],
      tipo: [null],
    });
    this.loadData();
  }

  setData(_d: any): void {}

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const f = this.filtrosForm.value;
      const filtros: any = { page: this.pageIndex, pageSize: this.pageSize };
      if (f.estado) filtros.estado = f.estado;
      if (f.tipo) filtros.tipo = f.tipo;
      const r: any = await firstValueFrom(this.repositoryService.getCuentasPorCobrar(filtros));
      this.cuentas = r?.items || [];
      this.total = r?.total || 0;
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadData();
  }

  toggleFiltros(): void { this.showFiltros = !this.showFiltros; }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset();
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadData();
  }

  crear(): void {
    const ref = this.dialog.open(CreateCuentaPorCobrarDialogComponent, { width: '700px' });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  verDetalle(c: any): void {
    this.tabsService.openTab(`CPC #${c.id}`, CuentaPorCobrarDetalleComponent, { cuentaPorCobrarId: c.id });
  }

  async cancelar(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cancelar Cuenta',
        message: `¿Cancelar la cuenta "${c.descripcion || 'CPC #' + c.id}"? No se eliminará pero pasará a estado CANCELADO.`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.cancelarCuentaPorCobrar({ id: c.id, motivo: 'CANCELACION MANUAL' }));
      this.snackBar.open('Cuenta cancelada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open(e?.message || 'Error al cancelar', 'Cerrar', { duration: 3000 });
    }
  }

  estadoColor(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return 'primary';
      case 'COBRADO': return 'accent';
      default: return '';
    }
  }

  restante(c: any): number {
    return +(Number(c.montoTotal || 0) - Number(c.montoCobrado || 0)).toFixed(2);
  }

  clienteNombre(c: any): string {
    return c.cliente?.razon_social || c.cliente?.persona?.nombre || '-';
  }
}
