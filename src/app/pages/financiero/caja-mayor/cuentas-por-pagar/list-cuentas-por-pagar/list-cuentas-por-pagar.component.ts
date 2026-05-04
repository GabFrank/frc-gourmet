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
import { CreateEditCuentaPorPagarDialogComponent } from '../create-edit-cuenta-por-pagar-dialog/create-edit-cuenta-por-pagar-dialog.component';
import { CuentaPorPagarDetalleComponent } from '../cuenta-por-pagar-detalle/cuenta-por-pagar-detalle.component';
import { TabsService } from 'src/app/services/tabs.service';

@Component({
  selector: 'app-list-cuentas-por-pagar',
  templateUrl: './list-cuentas-por-pagar.component.html',
  styleUrls: ['./list-cuentas-por-pagar.component.scss'],
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
export class ListCuentasPorPagarComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  cuentas: any[] = [];
  total = 0;
  pageSize = 15;
  pageIndex = 0;
  loading = false;
  showFiltros = false;
  filtrosForm!: FormGroup;
  estadoOptions = ['ACTIVO', 'PAGADO', 'CANCELADO'];
  tipoOptions = ['COMPRA', 'PRESTAMO', 'PRESTAMO_FUNCIONARIO', 'OTRO'];

  displayedColumns = ['descripcion', 'tipo', 'beneficiario', 'montoTotal', 'montoPagado', 'restante', 'cuotas', 'estado', 'actions'];

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
      const r: any = await firstValueFrom(this.repositoryService.getCuentasPorPagar(filtros));
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
    const ref = this.dialog.open(CreateEditCuentaPorPagarDialogComponent, { width: '700px' });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  verDetalle(c: any): void {
    this.tabsService.openTab(`CPP #${c.id}`, CuentaPorPagarDetalleComponent, { cuentaPorPagarId: c.id });
  }

  async abrirCompra(compraId: number): Promise<void> {
    if (!compraId) return;
    const { CompraDetalleComponent } = await import('src/app/pages/compras/compra-detalle/compra-detalle.component');
    this.tabsService.openTab(
      `Compra #${compraId}`,
      CompraDetalleComponent,
      { compraId },
      `detalle-compra-${compraId}`,
      true,
    );
  }

  async cancelar(c: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Cancelar Cuenta', message: `¿Cancelar la cuenta "${c.descripcion}"? No se eliminará pero pasará a estado CANCELADO.` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.cancelarCuentaPorPagar(c.id));
      this.snackBar.open('Cuenta cancelada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cancelar', 'Cerrar', { duration: 3000 });
    }
  }

  estadoColor(estado: string): string {
    switch (estado) {
      case 'ACTIVO': return '#1976d2';
      case 'PAGADO': return '#4caf50';
      case 'CANCELADO': return '#9e9e9e';
      default: return '#9e9e9e';
    }
  }

  restante(c: any): number {
    return +(Number(c.montoTotal || 0) - Number(c.montoPagado || 0)).toFixed(2);
  }

  direccion(tipo: string): 'EGRESO' | 'INGRESO' | 'NEUTRO' {
    if (tipo === 'PRESTAMO_FUNCIONARIO') return 'INGRESO';
    if (tipo === 'COMPRA' || tipo === 'PRESTAMO') return 'EGRESO';
    return 'NEUTRO';
  }

  tipoLabel(tipo: string): string {
    switch (tipo) {
      case 'PRESTAMO_FUNCIONARIO': return 'PRESTAMO FUNCIONARIO';
      default: return tipo;
    }
  }

  beneficiarioLabel(r: any): string {
    if (r.tipo === 'PRESTAMO_FUNCIONARIO' && r.funcionario) {
      const p = r.funcionario.persona;
      return `${p?.nombre || ''} ${p?.apellido || ''}`.trim() || '-';
    }
    return r.proveedor?.nombre || '-';
  }

  beneficiarioRol(r: any): string {
    if (r.tipo === 'PRESTAMO_FUNCIONARIO') return 'Funcionario';
    if (r.tipo === 'COMPRA') return 'Proveedor';
    if (r.tipo === 'PRESTAMO') return 'Acreedor';
    return 'Beneficiario';
  }
}
