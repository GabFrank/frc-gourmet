import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';
import { CreateEditCompraComponent } from '../create-edit-compra/create-edit-compra.component';
import { CompraDetalleComponent } from '../compra-detalle/compra-detalle.component';

@Component({
  selector: 'app-list-compras',
  templateUrl: './list-compras.component.html',
  styleUrls: ['./list-compras.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    DatePipe,
    DecimalPipe,
  ]
})
export class ListComprasComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  compras: any[] = [];
  proveedores: any[] = [];
  categorias: any[] = [];

  total = 0;
  pageSize = 25;
  pageIndex = 0;
  loading = false;
  showFiltros = false;
  filtrosForm!: FormGroup;

  estadoOptions = ['ABIERTO', 'FINALIZADO', 'CANCELADO'];
  creditoOptions: { label: string; value: any }[] = [
    { label: 'Todos', value: null },
    { label: 'Solo contado', value: false },
    { label: 'Solo crédito', value: true },
  ];

  displayedColumns = ['id', 'fecha', 'proveedor', 'categoria', 'numeroNota', 'total', 'pago', 'estado', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.filtrosForm = this.fb.group({
      proveedorId: [null],
      compraCategoriaId: [null],
      estado: [null],
      credito: [null],
      fechaDesde: [null],
      fechaHasta: [null],
      search: [''],
    });
    this.loadCatalogos();
    this.loadData();
  }

  setData(_d: any): void {}

  async loadCatalogos(): Promise<void> {
    try {
      const [provs, cats] = await Promise.all([
        firstValueFrom(this.repositoryService.getProveedores()),
        firstValueFrom(this.repositoryService.getCompraCategorias()),
      ]);
      this.proveedores = (provs as any[]) || [];
      this.categorias = (cats as any[]) || [];
    } catch (e) {
      console.error('Error cargando catalogos', e);
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const f = this.filtrosForm?.value || {};
      const params: any = {
        page: this.pageIndex + 1,
        pageSize: this.pageSize,
      };
      if (f.proveedorId) params.proveedorId = f.proveedorId;
      if (f.compraCategoriaId) params.compraCategoriaId = f.compraCategoriaId;
      if (f.estado) params.estado = f.estado;
      if (f.credito !== null && f.credito !== undefined && f.credito !== '') params.credito = f.credito;
      if (f.fechaDesde) params.fechaDesde = this.formatDate(f.fechaDesde);
      if (f.fechaHasta) params.fechaHasta = this.formatDate(f.fechaHasta);
      if (f.search) params.search = String(f.search).trim();

      const res: any = await firstValueFrom(this.repositoryService.getComprasPaginado(params));
      this.compras = res?.items || [];
      this.total = res?.total || 0;
    } catch (e: any) {
      console.error('Error loading compras', e);
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 5000, panelClass: 'error-snackbar' });
    } finally {
      this.loading = false;
    }
  }

  onPage(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadData();
  }

  toggleFiltros(): void {
    this.showFiltros = !this.showFiltros;
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset({
      proveedorId: null,
      compraCategoriaId: null,
      estado: null,
      credito: null,
      fechaDesde: null,
      fechaHasta: null,
      search: '',
    });
    this.aplicarFiltros();
  }

  nuevaCompra(): void {
    this.tabsService.openTab(
      'Nueva compra',
      CreateEditCompraComponent,
      { mode: 'create' },
      `nueva-compra-${Date.now()}`,
      true,
    );
  }

  editarBorrador(compra: any): void {
    if (compra.estado !== 'ABIERTO') {
      this.snackBar.open('Solo las compras en BORRADOR se pueden editar', 'Cerrar', { duration: 4000 });
      return;
    }
    this.tabsService.openTab(
      `Compra #${compra.id} (borrador)`,
      CreateEditCompraComponent,
      { mode: 'edit', compraId: compra.id },
      `editar-compra-${compra.id}`,
      true,
    );
  }

  verDetalle(compra: any): void {
    this.tabsService.openTab(
      `Compra #${compra.id}`,
      CompraDetalleComponent,
      { compraId: compra.id },
      `detalle-compra-${compra.id}`,
      true,
    );
  }

  async anular(compra: any): Promise<void> {
    const motivo = window.prompt('Motivo de anulación (opcional):', '') ?? null;
    if (motivo === null) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '480px',
      data: {
        title: `Anular compra #${compra.id}`,
        message: compra.estado === 'FINALIZADO'
          ? '¿Confirmás la anulación? Se revertirán stock, costo y caja mayor (o se cancelará el CPP). Esta acción es definitiva.'
          : '¿Confirmás la anulación de este borrador?',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularCompra(compra.id, motivo));
      this.snackBar.open('Compra anulada', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
    }
  }

  estadoChipClass(estado: string): string {
    switch (estado) {
      case 'ABIERTO': return 'chip-amarillo';
      case 'FINALIZADO': return 'chip-verde';
      case 'CANCELADO': return 'chip-rojo';
      default: return 'chip-gris';
    }
  }

  estadoLabel(estado: string): string {
    switch (estado) {
      case 'ABIERTO': return 'Borrador';
      case 'FINALIZADO': return 'Finalizada';
      case 'CANCELADO': return 'Anulada';
      default: return estado;
    }
  }

  formatDate(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  extraerError(e: any): string {
    const msg = e?.message || String(e);
    return msg.replace(/^Error invoking remote method '[^']+': Error: /, '');
  }
}
