import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { RepositoryService, ClienteFilters } from '../../../database/repository.service';
import { Cliente } from '../../../database/entities/personas/cliente.entity';
import { TipoCliente } from '../../../database/entities/personas/tipo-cliente.entity';
import { TabsService } from '../../../services/tabs.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditClienteDialogComponent } from './create-edit-cliente-dialog/create-edit-cliente-dialog.component';
import { ClienteDetalleComponent } from './cliente-detalle/cliente-detalle.component';

type EstadoFilter = '' | 'true' | 'false';
type CreditoFilter = '' | 'true' | 'false';

type ClienteRow = Cliente & {
  _pctUso: number;
  _pctClass: 'pct-ok' | 'pct-warn' | 'pct-high' | 'pct-over' | 'pct-na';
  _pctLabel: string;
  _nombreCompleto: string;
};

@Component({
  selector: 'app-list-clientes',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-clientes.component.html',
  styleUrls: ['./list-clientes.component.scss'],
})
export class ListClientesComponent implements OnInit {
  displayedColumns: string[] = [
    'nombre',
    'ruc',
    'tipo',
    'saldo',
    'limite',
    'pctUso',
    'estado',
    'acciones',
  ];

  clientes: ClienteRow[] = [];
  pagedClientes: ClienteRow[] = [];
  tiposCliente: TipoCliente[] = [];
  totalClientes = 0;
  isLoading = false;

  pageSize = 20;
  currentPage = 0;
  pageSizeOptions = [10, 20, 50, 100];

  filterForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
  ) {
    this.filterForm = this.fb.group({
      nombre: [''],
      ruc: [''],
      tipoClienteId: [''],
      activo: ['true' as EstadoFilter],
      conCredito: ['' as CreditoFilter],
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadTiposCliente();
    await this.loadClientes();
  }

  setData(_data: any): void {
    // Required by TabsService; no-op
  }

  async loadTiposCliente(): Promise<void> {
    try {
      const tipos = await firstValueFrom(this.repositoryService.getTipoClientes());
      this.tiposCliente = (tipos || []).filter((t: any) => t.activo);
    } catch (error) {
      console.error('Error cargando tipos de cliente:', error);
    }
  }

  async loadClientes(): Promise<void> {
    this.isLoading = true;
    try {
      const filters = this.buildFilters();
      const result = await firstValueFrom(this.repositoryService.getClientes(filters));
      this.clientes = (result || []).map((c) => this.toRow(c));
      this.totalClientes = this.clientes.length;
      this.recomputePage();
    } catch (error) {
      console.error('Error cargando clientes:', error);
      this.snackBar.open('Error al cargar clientes', 'Cerrar', { duration: 3500 });
    } finally {
      this.isLoading = false;
    }
  }

  private buildFilters(): ClienteFilters {
    const v = this.filterForm.value;
    const f: ClienteFilters = {};
    if (v.nombre?.trim()) f.nombre = v.nombre.trim();
    if (v.ruc?.trim()) f.ruc = v.ruc.trim();
    if (v.tipoClienteId !== '' && v.tipoClienteId != null) f.tipoClienteId = Number(v.tipoClienteId);
    if (v.activo === 'true') f.activo = true;
    else if (v.activo === 'false') f.activo = false;
    if (v.conCredito === 'true') f.conCredito = true;
    else if (v.conCredito === 'false') f.conCredito = false;
    return f;
  }

  private toRow(c: Cliente): ClienteRow {
    const saldo = Number(c.saldoActual) || 0;
    const limite = Number(c.limite_credito) || 0;
    let pct = 0;
    let pctClass: ClienteRow['_pctClass'] = 'pct-na';
    let pctLabel = '—';

    if (c.credito && limite > 0) {
      pct = (saldo / limite) * 100;
      pctLabel = `${pct.toFixed(0)}%`;
      if (pct > 100) pctClass = 'pct-over';
      else if (pct >= 80) pctClass = 'pct-high';
      else if (pct >= 50) pctClass = 'pct-warn';
      else pctClass = 'pct-ok';
    } else if (c.credito && limite === 0) {
      pctLabel = 'Sin límite';
      pctClass = 'pct-na';
    } else {
      pctLabel = 'Sin crédito';
      pctClass = 'pct-na';
    }

    const persona = c.persona as any;
    const apellido = persona?.apellido ? ` ${persona.apellido}` : '';
    const nombreCompleto = `${persona?.nombre || ''}${apellido}`.trim() || c.razon_social || '(sin nombre)';

    return Object.assign(c, {
      _pctUso: pct,
      _pctClass: pctClass,
      _pctLabel: pctLabel,
      _nombreCompleto: nombreCompleto,
    }) as ClienteRow;
  }

  buscar(): void {
    this.currentPage = 0;
    this.loadClientes();
  }

  limpiarFiltros(): void {
    this.filterForm.reset({
      nombre: '',
      ruc: '',
      tipoClienteId: '',
      activo: 'true',
      conCredito: '',
    });
    this.currentPage = 0;
    this.loadClientes();
  }

  onPageChange(event: PageEvent): void {
    this.pageSize = event.pageSize;
    this.currentPage = event.pageIndex;
    this.recomputePage();
  }

  private recomputePage(): void {
    const start = this.currentPage * this.pageSize;
    this.pagedClientes = this.clientes.slice(start, start + this.pageSize);
  }

  nuevoCliente(): void {
    const ref = this.dialog.open(CreateEditClienteDialogComponent, {
      width: '760px',
      maxHeight: '90vh',
      data: { cliente: null },
      disableClose: true,
    });
    ref.afterClosed().subscribe(() => this.loadClientes());
  }

  editarCliente(cliente: ClienteRow): void {
    const ref = this.dialog.open(CreateEditClienteDialogComponent, {
      width: '760px',
      maxHeight: '90vh',
      data: { cliente },
      disableClose: true,
    });
    ref.afterClosed().subscribe(() => this.loadClientes());
  }

  verEstadoCuenta(cliente: ClienteRow): void {
    if (!cliente?.id) return;
    this.tabsService.openTab(
      `Cliente: ${cliente._nombreCompleto}`,
      ClienteDetalleComponent,
      { clienteId: cliente.id },
      `cliente-detalle-${cliente.id}`,
      true,
    );
  }

  async toggleActivo(cliente: ClienteRow): Promise<void> {
    try {
      await firstValueFrom(
        this.repositoryService.updateCliente(cliente.id!, {
          activo: !cliente.activo,
        } as Partial<Cliente>),
      );
      this.snackBar.open(
        `Cliente ${cliente.activo ? 'desactivado' : 'activado'}`,
        'Cerrar',
        { duration: 2500 },
      );
      this.loadClientes();
    } catch (error) {
      console.error('Error toggling activo:', error);
      this.snackBar.open('Error al cambiar estado', 'Cerrar', { duration: 3000 });
    }
  }

  eliminarCliente(cliente: ClienteRow): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar cliente',
        message: `¿Está seguro que desea eliminar a "${cliente._nombreCompleto}"?`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await firstValueFrom(this.repositoryService.deleteCliente(cliente.id!));
        this.snackBar.open('Cliente eliminado', 'Cerrar', { duration: 2500 });
        this.loadClientes();
      } catch (error) {
        console.error('Error eliminando cliente:', error);
        this.snackBar.open('Error al eliminar cliente', 'Cerrar', { duration: 3000 });
      }
    });
  }

}
