import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ProductoSearchDialogComponent } from 'src/app/shared/components/producto-search-dialog/producto-search-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';
import { FinalizarCompraDialogComponent } from '../finalizar-compra-dialog/finalizar-compra-dialog.component';
import { GestionarProductoComponent } from 'src/app/pages/productos/gestionar-producto/gestionar-producto.component';

interface ItemRow {
  productoId: number;
  productoNombre: string;
  productoControlaStock: boolean;
  unidadBase?: string;
  presentacionId?: number | null;
  presentaciones: any[];
  cantidad: number;
  costoUnitarioPresentacion: number;
}

@Component({
  selector: 'app-create-edit-compra',
  standalone: true,
  templateUrl: './create-edit-compra.component.html',
  styleUrls: ['./create-edit-compra.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatCardModule,
    MatChipsModule,
    DecimalPipe,
  ],
})
export class CreateEditCompraComponent implements OnInit {
  mode: 'create' | 'edit' = 'create';
  compraId?: number;
  estadoActual: string = 'ABIERTO';

  form!: FormGroup;
  items: ItemRow[] = [];
  total = 0;

  proveedores: any[] = [];
  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

  tipoBoletaOptions = ['LEGAL', 'COMUN', 'OTRO', 'SIN_COMPROBANTE'];
  displayedColumns = ['producto', 'presentacion', 'cantidad', 'costoUnitario', 'subtotal', 'actions'];

  loading = false;
  saving = false;
  finalizing = false;

  constructor(
    private fb: FormBuilder,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private repo: RepositoryService,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      proveedorId: [null, Validators.required],
      compraCategoriaId: [null],
      monedaId: [null, Validators.required],
      fechaCompra: [new Date(), Validators.required],
      numeroNota: [''],
      tipoBoleta: ['COMUN'],
      formaPagoId: [null],
      credito: [false],
      cantidadCuotas: [1],
      fechaCreditoInicio: [null],
    });
    this.loadCatalogos().then(() => {
      if (this.mode === 'edit' && this.compraId) {
        this.loadCompra(this.compraId);
      } else {
        // Default moneda principal si existe
        const principal = this.monedas.find((m: any) => m.principal);
        if (principal) this.form.patchValue({ monedaId: principal.id });
      }
    });
  }

  setData(d: any): void {
    if (!d) return;
    if (d.mode) this.mode = d.mode;
    if (d.compraId) this.compraId = d.compraId;
  }

  async loadCatalogos(): Promise<void> {
    try {
      const [provs, cats, monedas, fps] = await Promise.all([
        firstValueFrom(this.repo.getProveedores()),
        firstValueFrom(this.repo.getCompraCategorias()),
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getFormasPago()),
      ]);
      this.proveedores = (provs as any[]) || [];
      this.categorias = (cats as any[]) || [];
      this.monedas = (monedas as any[]) || [];
      this.formasPago = (fps as any[]) || [];
    } catch (e) {
      console.error('Error cargando catalogos', e);
    }
  }

  async loadCompra(id: number): Promise<void> {
    this.loading = true;
    try {
      const compra: any = await firstValueFrom(this.repo.getCompra(id));
      if (!compra) throw new Error('Compra no encontrada');
      this.estadoActual = compra.estado;
      this.form.patchValue({
        proveedorId: compra.proveedor?.id || null,
        compraCategoriaId: compra.compraCategoria?.id || null,
        monedaId: compra.moneda?.id || null,
        fechaCompra: compra.fechaCompra ? new Date(compra.fechaCompra) : new Date(),
        numeroNota: compra.numeroNota || '',
        tipoBoleta: compra.tipoBoleta || 'COMUN',
        formaPagoId: compra.formaPago?.id || null,
        credito: !!compra.credito,
      });
      // Cargar presentaciones por producto y construir items
      this.items = [];
      for (const det of (compra.detalles || [])) {
        const presentaciones = det.producto?.id
          ? await this.cargarPresentaciones(det.producto.id)
          : [];
        this.items.push({
          productoId: det.producto.id,
          productoNombre: det.producto.nombre,
          productoControlaStock: det.producto.controlaStock,
          unidadBase: det.producto.unidadBase,
          presentacionId: det.presentacion?.id ?? null,
          presentaciones,
          cantidad: Number(det.cantidad),
          costoUnitarioPresentacion: Number(det.costoUnitarioPresentacion),
        });
      }
      this.recalcularTotal();
      if (this.estadoActual !== 'ABIERTO') {
        this.form.disable();
      }
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
    } finally {
      this.loading = false;
    }
  }

  async agregarItem(): Promise<void> {
    const ref = this.dialog.open(ProductoSearchDialogComponent, {
      width: '900px',
      maxWidth: '95vw',
      data: { searchTerm: '', cantidad: 1, mode: 'compra' },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.producto) return;

    const productoId = result.producto.id;
    const presentaciones = await this.cargarPresentaciones(productoId);
    const presentacionId = result.presentacion?.id || (presentaciones.find((p: any) => p.principal)?.id ?? presentaciones[0]?.id ?? null);

    this.items.push({
      productoId,
      productoNombre: result.producto.nombre,
      productoControlaStock: !!result.producto.controlaStock,
      unidadBase: result.producto.unidadBase,
      presentacionId,
      presentaciones,
      cantidad: Number(result.cantidad) || 1,
      costoUnitarioPresentacion: 0,
    });
    this.items = [...this.items];
    this.recalcularTotal();
  }

  crearNuevoProducto(): void {
    this.tabsService.openTab(
      'Nuevo Producto',
      GestionarProductoComponent,
      { mode: 'create' },
      `nuevo-producto-${Date.now()}`,
      true,
    );
  }

  eliminarItem(index: number): void {
    this.items.splice(index, 1);
    this.items = [...this.items];
    this.recalcularTotal();
  }

  onCantidadChange(item: ItemRow, value: any): void {
    item.cantidad = Number(value) || 0;
    this.recalcularTotal();
  }

  onCostoChange(item: ItemRow, value: any): void {
    item.costoUnitarioPresentacion = Number(value) || 0;
    this.recalcularTotal();
  }

  onPresentacionChange(item: ItemRow, value: any): void {
    item.presentacionId = value;
  }

  subtotalItem(item: ItemRow): number {
    return +(Number(item.cantidad || 0) * Number(item.costoUnitarioPresentacion || 0)).toFixed(2);
  }

  recalcularTotal(): void {
    this.total = this.items.reduce((sum, it) => sum + this.subtotalItem(it), 0);
  }

  presentacionLabel(p: any): string {
    if (!p) return '';
    const cant = p.cantidad ? ` (${p.cantidad})` : '';
    return `${p.nombre || ''}${cant}`;
  }

  buildPayload(): any {
    const f = this.form.value;
    return {
      proveedorId: f.proveedorId,
      compraCategoriaId: f.compraCategoriaId || null,
      monedaId: f.monedaId,
      fechaCompra: this.formatDate(f.fechaCompra),
      numeroNota: f.numeroNota || null,
      tipoBoleta: f.tipoBoleta || null,
      formaPagoId: f.formaPagoId || null,
      credito: !!f.credito,
      detalles: this.items.map(it => ({
        productoId: it.productoId,
        presentacionId: it.presentacionId || null,
        cantidad: Number(it.cantidad) || 0,
        costoUnitarioPresentacion: Number(it.costoUnitarioPresentacion) || 0,
      })),
    };
  }

  validarParaGuardar(): string | null {
    const f = this.form.value;
    if (!f.proveedorId) return 'Seleccioná un proveedor.';
    if (!f.monedaId) return 'Seleccioná una moneda.';
    if (this.items.length === 0) return 'Agregá al menos un ítem a la compra.';
    for (const it of this.items) {
      if (!it.productoId) return 'Hay un ítem sin producto.';
      if (it.cantidad <= 0) return `Cantidad inválida en ${it.productoNombre}.`;
      if (it.costoUnitarioPresentacion < 0) return `Costo inválido en ${it.productoNombre}.`;
    }
    return null;
  }

  async guardarBorrador(): Promise<void> {
    const err = this.validarParaGuardar();
    if (err) {
      this.snackBar.open(err, 'Cerrar', { duration: 4000 });
      return;
    }
    this.saving = true;
    try {
      const payload = this.buildPayload();
      if (this.mode === 'create') {
        const created: any = await firstValueFrom(this.repo.createCompraBorrador(payload));
        this.snackBar.open(`Borrador creado #${created.id}`, 'Cerrar', { duration: 3000 });
        // Cambiar a modo edit
        this.mode = 'edit';
        this.compraId = created.id;
        this.estadoActual = created.estado;
      } else if (this.compraId) {
        await firstValueFrom(this.repo.updateCompraBorrador(this.compraId, payload));
        this.snackBar.open('Borrador actualizado', 'Cerrar', { duration: 3000 });
      }
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
    } finally {
      this.saving = false;
    }
  }

  async finalizar(): Promise<void> {
    const err = this.validarParaGuardar();
    if (err) {
      this.snackBar.open(err, 'Cerrar', { duration: 4000 });
      return;
    }
    // Guardar primero (asegurar estado actualizado)
    if (this.mode === 'create' || !this.compraId) {
      await this.guardarBorrador();
      if (!this.compraId) return;
    } else {
      await this.guardarBorrador();
    }

    const f = this.form.value;
    const ref = this.dialog.open(FinalizarCompraDialogComponent, {
      width: '560px',
      data: {
        compraId: this.compraId,
        total: this.total,
        moneda: this.monedas.find((m: any) => m.id === f.monedaId),
        credito: !!f.credito,
        formaPagoIdInicial: f.formaPagoId || null,
      },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.confirmed) return;

    this.finalizing = true;
    try {
      await firstValueFrom(this.repo.finalizarCompra(this.compraId!, result.payload));
      this.snackBar.open('Compra finalizada', 'Cerrar', { duration: 3000 });
      // Cerrar el tab actual
      const currentIdx = this.tabsService.currentIndex;
      if (currentIdx >= 0) this.tabsService.removeTab(currentIdx);
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
    } finally {
      this.finalizing = false;
    }
  }

  async cargarPresentaciones(productoId: number): Promise<any[]> {
    try {
      const res: any = await firstValueFrom(this.repo.getPresentacionesByProducto(productoId, 0, 100, 'activos'));
      // Soporta tanto formato paginado { items, total } como array directo
      if (Array.isArray(res)) return res;
      return res?.items || res?.data || [];
    } catch (e) {
      console.error('Error cargando presentaciones', e);
      return [];
    }
  }

  formatDate(d: Date | string | null): string | null {
    if (!d) return null;
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
