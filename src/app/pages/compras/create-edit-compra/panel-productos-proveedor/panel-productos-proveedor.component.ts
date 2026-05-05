import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-panel-productos-proveedor',
  standalone: true,
  templateUrl: './panel-productos-proveedor.component.html',
  styleUrls: ['./panel-productos-proveedor.component.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatButtonModule,
    MatMenuModule,
    MatDialogModule,
    MatSnackBarModule,
    DecimalPipe,
    DatePipe,
  ],
})
export class PanelProductosProveedorComponent implements OnInit {
  private _proveedorId: number | null = null;
  @Input()
  set proveedorId(v: number | null) {
    if (this._proveedorId === v) return;
    this._proveedorId = v;
    this.pageIndex = 0;
    this.searchForm?.get('search')?.setValue('', { emitEvent: false });
    if (v) this.load();
    else this.resetState();
  }
  get proveedorId(): number | null {
    return this._proveedorId;
  }

  @Input() disabled = false;

  // Click simple: solo cargar histórico (no agrega).
  @Output() productoFocus = new EventEmitter<number>();
  // Doble click o "Seleccionar" del menu: agregar a la compra.
  // `ultimoCostoUnidadBase` esta en unidad base (independiente de la presentacion comprada).
  @Output() productoSelected = new EventEmitter<{ producto: any; ultimoCostoUnidadBase: number | null }>();

  readonly displayedColumns = ['nombre', 'ultimoCosto', 'actions'];

  searchForm!: FormGroup;
  items: any[] = [];
  total = 0;
  pageIndex = 0;
  pageSize = 10;
  pageSizeOptions = [10, 25, 50];
  loading = false;

  private requestId = 0;

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.searchForm = this.fb.group({ search: [''] });
    this.searchForm.get('search')!.valueChanges.pipe(
      debounceTime(300),
      distinctUntilChanged(),
    ).subscribe(() => {
      this.pageIndex = 0;
      this.load();
    });
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }

  onRowClick(row: any): void {
    if (!row?.producto?.id) return;
    this.productoFocus.emit(Number(row.producto.id));
  }

  onRowDblClick(row: any): void {
    if (this.disabled) return;
    this.emitirSeleccion(row);
  }

  seleccionar(row: any): void {
    if (this.disabled) return;
    this.emitirSeleccion(row);
  }

  private emitirSeleccion(row: any): void {
    if (!row?.producto) return;
    this.productoSelected.emit({
      producto: row.producto,
      ultimoCostoUnidadBase: row.ultimoCostoUnidadBase != null ? Number(row.ultimoCostoUnidadBase) : null,
    });
  }

  async removerDelProveedor(row: any): Promise<void> {
    if (this.disabled) return;
    if (!row?.id) return;
    const nombre = row.producto?.nombre || 'producto';
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '440px',
      data: {
        title: 'Remover producto del proveedor',
        message: `¿Querés remover "${nombre}" de la lista de productos de este proveedor? La relación se desactiva (no afecta compras anteriores).`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;

    try {
      await firstValueFrom(this.repo.deleteProveedorProducto(Number(row.id)));
      this.snackBar.open('Producto removido del proveedor', 'Cerrar', { duration: 3000 });
      await this.load();
    } catch (e: any) {
      const msg = e?.message || String(e);
      this.snackBar.open('No se pudo remover: ' + msg, 'Cerrar', { duration: 5000, panelClass: 'error-snackbar' });
    }
  }

  private async load(): Promise<void> {
    if (!this._proveedorId) {
      this.resetState();
      return;
    }
    const myReq = ++this.requestId;
    this.loading = true;
    try {
      const search = String(this.searchForm.get('search')?.value || '').trim();
      const result = await firstValueFrom(this.repo.getProveedorProductosPaginado({
        proveedorId: this._proveedorId,
        search: search || undefined,
        page: this.pageIndex,
        pageSize: this.pageSize,
      }));
      if (myReq !== this.requestId) return;
      this.items = result?.items || [];
      this.total = result?.total || 0;
    } catch (e) {
      console.error('Error cargando productos del proveedor', e);
      if (myReq !== this.requestId) return;
      this.items = [];
      this.total = 0;
    } finally {
      if (myReq === this.requestId) this.loading = false;
    }
  }

  private resetState(): void {
    this.items = [];
    this.total = 0;
    this.pageIndex = 0;
    this.loading = false;
  }
}
