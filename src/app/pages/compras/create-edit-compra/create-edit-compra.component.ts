import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, FormGroup, FormArray, Validators } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
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
import { firstValueFrom, merge } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ProductoSearchDialogComponent } from 'src/app/shared/components/producto-search-dialog/producto-search-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';
import { FinalizarCompraDialogComponent } from '../finalizar-compra-dialog/finalizar-compra-dialog.component';
import { GestionarProductoComponent } from 'src/app/pages/productos/gestionar-producto/gestionar-producto.component';
import { PanelProductosProveedorComponent } from './panel-productos-proveedor/panel-productos-proveedor.component';
import { PanelHistoricoProductoComponent } from './panel-historico-producto/panel-historico-producto.component';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

interface ItemSeed {
  productoId: number;
  productoNombre: string;
  productoControlaStock: boolean;
  unidadBase?: string | null;
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
    ReactiveFormsModule,
    MatTableModule,
    MatAutocompleteModule,
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
    PanelProductosProveedorComponent,
    PanelHistoricoProductoComponent,
    CurrencyInputDirective,
  ],
})
export class CreateEditCompraComponent implements OnInit {
  mode: 'create' | 'edit' = 'create';
  compraId?: number;
  /** Callback opcional para que la lista de compras se refresque al crear/finalizar. */
  onSaved?: () => void;
  estadoActual: string = 'ABIERTO';

  form!: FormGroup;
  itemsArray!: FormArray<FormGroup>;
  itemsDataSource: FormGroup[] = [];
  total = 0;

  // Estado para los paneles laterales
  proveedorIdActivo: number | null = null;
  productoIdHistorico: number | null = null;

  proveedores: any[] = [];
  filteredProveedores: any[] = [];
  proveedorControl = new FormControl<any | string | null>(null);
  selectedProveedor: any | null = null;
  categorias: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  tipoBoletaOptions = ['LEGAL', 'COMUN', 'OTRO', 'SIN_COMPROBANTE'];
  displayedColumns = ['producto', 'presentacion', 'cantidad', 'costoUnitario', 'subtotal', 'actions'];

  loading = false;
  saving = false;
  finalizing = false;

  /** Decimales segun la moneda seleccionada (PYG=0, USD/BRL=2). Se actualiza cuando cambia monedaId. */
  decimalesMoneda = 0;

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
      credito: [false],
      cantidadCuotas: [1],
      fechaCreditoInicio: [null],
      items: this.fb.array<FormGroup>([]),
    });
    this.itemsArray = this.form.get('items') as FormArray<FormGroup>;
    this.itemsArray.valueChanges.subscribe(() => this.recalcular());
    this.refreshDataSource();

    this.form.get('monedaId')!.valueChanges.subscribe((id: any) => {
      this.recalcDecimalesMoneda();
    });

    this.form.get('proveedorId')!.valueChanges.subscribe((id: any) => {
      this.proveedorIdActivo = id ? Number(id) : null;
    });

    this.loadCatalogos().then(() => {
      if (this.mode === 'edit' && this.compraId) {
        this.loadCompra(this.compraId);
      } else {
        const principal = this.monedas.find((m: any) => m.principal);
        if (principal) this.form.patchValue({ monedaId: principal.id });
      }
    });
  }

  setData(d: any): void {
    if (!d) return;
    if (d.mode) this.mode = d.mode;
    if (d.compraId) this.compraId = d.compraId;
    if (typeof d.onSaved === 'function') this.onSaved = d.onSaved;
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
      this.filteredProveedores = this.proveedores.slice(0, 50);
      this.setupProveedorAutocomplete();
      this.categorias = (cats as any[]) || [];
      this.monedas = (monedas as any[]) || [];
      this.formasPago = (fps as any[]) || [];
      this.recalcDecimalesMoneda();

      // Si ya hay un proveedorId seteado (ej. edit mode cargado antes), pre-poblar el autocomplete
      const currentProveedorId = this.form.get('proveedorId')?.value;
      if (currentProveedorId) {
        const prov = this.proveedores.find(p => p.id === currentProveedorId);
        if (prov) {
          this.selectedProveedor = prov;
          this.proveedorControl.setValue(prov, { emitEvent: false });
        }
      }
    } catch (e) {
      console.error('Error cargando catalogos', e);
    }
  }

  private setupProveedorAutocomplete(): void {
    this.proveedorControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredProveedores = this.proveedores
          .filter(p => (p.nombre || '').toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedProveedor && (this.selectedProveedor.nombre || '').toUpperCase() !== filter) {
          this.selectedProveedor = null;
          this.form.patchValue({ proveedorId: null });
        }
      } else {
        this.filteredProveedores = this.proveedores.slice(0, 50);
      }
    });
  }

  displayProveedor = (p: any): string => (p && typeof p === 'object') ? (p.nombre || '') : '';

  onProveedorSelected(proveedor: any): void {
    this.selectedProveedor = proveedor;
    this.form.patchValue({ proveedorId: proveedor.id });
  }

  clearProveedor(): void {
    this.selectedProveedor = null;
    this.proveedorControl.setValue('');
    this.form.patchValue({ proveedorId: null });
    this.filteredProveedores = this.proveedores.slice(0, 50);
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
        credito: !!compra.credito,
      });

      // Pre-poblar autocomplete de proveedor
      if (compra.proveedor) {
        const provEnLista = this.proveedores.find(p => p.id === compra.proveedor.id) || compra.proveedor;
        this.selectedProveedor = provEnLista;
        this.proveedorControl.setValue(provEnLista, { emitEvent: false });
      }

      this.itemsArray.clear({ emitEvent: false });
      for (const det of (compra.detalles || [])) {
        const presentaciones = det.producto?.id
          ? await this.cargarPresentaciones(det.producto.id)
          : [];
        this.itemsArray.push(this.buildItemFormGroup({
          productoId: det.producto.id,
          productoNombre: det.producto.nombre,
          productoControlaStock: det.producto.controlaStock,
          unidadBase: det.producto.unidadBase,
          presentacionId: det.presentacion?.id ?? null,
          presentaciones,
          cantidad: Number(det.cantidad),
          costoUnitarioPresentacion: Number(det.costoUnitarioPresentacion),
        }), { emitEvent: false });
      }
      this.refreshDataSource();
      this.recalcular();
      if (this.estadoActual !== 'ABIERTO') {
        this.form.disable();
      }
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
    } finally {
      this.loading = false;
    }
  }

  private buildItemFormGroup(seed: ItemSeed): FormGroup {
    const cant = Number(seed.cantidad) || 0;
    const costoUnit = Number(seed.costoUnitarioPresentacion) || 0;
    const subInicial = +(cant * costoUnit).toFixed(2);

    const fg = this.fb.group({
      productoId: [seed.productoId, Validators.required],
      productoNombre: [seed.productoNombre || ''],
      productoControlaStock: [!!seed.productoControlaStock],
      unidadBase: [seed.unidadBase || null],
      presentaciones: [seed.presentaciones || []],
      presentacionId: [seed.presentacionId ?? null],
      cantidad: [cant, [Validators.required, Validators.min(0.001)]],
      costoUnitarioPresentacion: [costoUnit, [Validators.min(0)]],
      subtotal: [subInicial, [Validators.min(0)]],
    });

    // Bidirectional sync entre cantidad / costo unit / subtotal:
    // - cantidad o costo cambian → subtotal = cantidad × costo.
    // - subtotal cambia → costo = subtotal / cantidad (si cantidad > 0).
    // Usamos `emitEvent: false` para evitar feedback loop.
    const cantCtrl = fg.get('cantidad')!;
    const costoCtrl = fg.get('costoUnitarioPresentacion')!;
    const subCtrl = fg.get('subtotal')!;

    merge(cantCtrl.valueChanges, costoCtrl.valueChanges).subscribe(() => {
      const c = Number(cantCtrl.value || 0);
      const cu = Number(costoCtrl.value || 0);
      const sub = +(c * cu).toFixed(2);
      if (Number(subCtrl.value) !== sub) {
        subCtrl.setValue(sub, { emitEvent: false });
      }
    });

    subCtrl.valueChanges.subscribe(value => {
      const c = Number(cantCtrl.value || 0);
      const sub = Number(value || 0);
      if (c <= 0) return;
      const cu = +(sub / c).toFixed(2);
      if (Number(costoCtrl.value) !== cu) {
        costoCtrl.setValue(cu, { emitEvent: false });
      }
    });

    return fg;
  }

  private refreshDataSource(): void {
    this.itemsDataSource = [...this.itemsArray.controls];
  }

  private recalcular(): void {
    let total = 0;
    for (const ctrl of this.itemsArray.controls) {
      total += Number(ctrl.get('subtotal')?.value || 0);
    }
    this.total = +total.toFixed(2);
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
    let costoInicial = 0;
    try {
      const ultimo: any = await firstValueFrom(this.repo.getUltimoCostoProducto({
        productoId,
        proveedorId: this.proveedorIdActivo,
      }));
      if (ultimo?.ultimoCosto != null) costoInicial = Number(ultimo.ultimoCosto);
    } catch (e) {
      console.error('Error cargando ultimo costo', e);
    }

    await this.pushProductoAItems(
      result.producto,
      result.presentacion?.id ?? null,
      Number(result.cantidad) || 1,
      costoInicial,
    );
  }

  async onProductoFromPanel(payload: { producto: any; ultimoCostoUnidadBase: number | null }): Promise<void> {
    if (this.estadoActual !== 'ABIERTO') return;
    if (!payload?.producto) return;
    const costoUB = payload.ultimoCostoUnidadBase != null ? Number(payload.ultimoCostoUnidadBase) : 0;
    await this.pushProductoAItems(payload.producto, null, 1, costoUB);
  }

  onItemRowSelected(productoId: number | null | undefined): void {
    if (!productoId) return;
    this.productoIdHistorico = Number(productoId);
  }

  // `costoInicialUB` se interpreta como costo en UNIDAD BASE.
  // El form trabaja con `costoUnitarioPresentacion`, asi que multiplicamos por
  // la cantidad de la presentacion seleccionada para obtener el costo facturado.
  private async pushProductoAItems(
    producto: any,
    presentacionPreSeleccionadaId: number | null,
    cantidadInicial: number,
    costoInicialUB: number,
  ): Promise<void> {
    if (!producto?.id) return;
    const productoId = Number(producto.id);
    const presentaciones = await this.cargarPresentaciones(productoId);
    const presentacionId = presentacionPreSeleccionadaId
      || (presentaciones.find((p: any) => p.principal)?.id ?? presentaciones[0]?.id ?? null);

    const presentacionSel = presentaciones.find((p: any) => p.id === presentacionId);
    const factor = presentacionSel?.cantidad ? Number(presentacionSel.cantidad) : 1;
    const costoEnPresentacion = +(Number(costoInicialUB || 0) * factor).toFixed(2);

    this.itemsArray.push(this.buildItemFormGroup({
      productoId,
      productoNombre: producto.nombre,
      productoControlaStock: !!producto.controlaStock,
      unidadBase: producto.unidadBase,
      presentacionId,
      presentaciones,
      cantidad: Number(cantidadInicial) || 1,
      costoUnitarioPresentacion: costoEnPresentacion,
    }));
    this.refreshDataSource();
    this.productoIdHistorico = productoId;
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
    this.itemsArray.removeAt(index);
    this.refreshDataSource();
  }

  presentacionLabel(p: any): string {
    if (!p) return '';
    const cant = p.cantidad ? ` (${p.cantidad})` : '';
    return `${p.nombre || ''}${cant}`;
  }

  buildPayload(): any {
    const f = this.form.getRawValue();
    return {
      proveedorId: f.proveedorId,
      compraCategoriaId: f.compraCategoriaId || null,
      monedaId: f.monedaId,
      fechaCompra: this.formatDate(f.fechaCompra),
      numeroNota: f.numeroNota || null,
      tipoBoleta: f.tipoBoleta || null,
      credito: !!f.credito,
      detalles: (f.items as any[]).map(it => ({
        productoId: it.productoId,
        presentacionId: it.presentacionId || null,
        cantidad: Number(it.cantidad) || 0,
        costoUnitarioPresentacion: Number(it.costoUnitarioPresentacion) || 0,
      })),
    };
  }

  validarParaGuardar(): string | null {
    const f = this.form.getRawValue();
    if (!f.proveedorId) return 'Seleccioná un proveedor.';
    if (!f.monedaId) return 'Seleccioná una moneda.';
    if (this.itemsArray.length === 0) return 'Agregá al menos un ítem a la compra.';
    for (const it of (f.items as any[])) {
      if (!it.productoId) return 'Hay un ítem sin producto.';
      if (Number(it.cantidad) <= 0) return `Cantidad inválida en ${it.productoNombre}.`;
      if (Number(it.costoUnitarioPresentacion) < 0) return `Costo inválido en ${it.productoNombre}.`;
    }
    return null;
  }

  validarParaFinalizar(): string | null {
    const baseErr = this.validarParaGuardar();
    if (baseErr) return baseErr;
    const f = this.form.getRawValue();
    for (const it of (f.items as any[])) {
      if (Number(it.costoUnitarioPresentacion) <= 0) {
        return `Costo unitario debe ser mayor a 0 en ${it.productoNombre}.`;
      }
    }
    if (this.total <= 0) return 'El total de la compra debe ser mayor a 0.';
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
        this.mode = 'edit';
        this.compraId = created.id;
        this.estadoActual = created.estado;
        this.onSaved?.();
      } else if (this.compraId) {
        await firstValueFrom(this.repo.updateCompraBorrador(this.compraId, payload));
        this.snackBar.open('Borrador actualizado', 'Cerrar', { duration: 3000 });
        this.onSaved?.();
      }
    } catch (e: any) {
      this.snackBar.open(this.extraerError(e), 'Cerrar', { duration: 8000, panelClass: 'error-snackbar' });
    } finally {
      this.saving = false;
    }
  }

  async finalizar(): Promise<void> {
    const err = this.validarParaFinalizar();
    if (err) {
      this.snackBar.open(err, 'Cerrar', { duration: 4000 });
      return;
    }
    if (this.mode === 'create' || !this.compraId) {
      await this.guardarBorrador();
      if (!this.compraId) return;
    } else {
      await this.guardarBorrador();
    }

    const f = this.form.getRawValue();
    const ref = this.dialog.open(FinalizarCompraDialogComponent, {
      width: '560px',
      data: {
        compraId: this.compraId,
        total: this.total,
        moneda: this.monedas.find((m: any) => m.id === f.monedaId),
        credito: !!f.credito,
      },
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.confirmed) return;

    this.finalizing = true;
    try {
      const resp: any = await firstValueFrom(this.repo.finalizarCompra(this.compraId!, result.payload));
      this.snackBar.open('Compra finalizada', 'Cerrar', { duration: 3000 });

      // Si el usuario eligio "Pagar ahora" en contado, abrir el dialog de pago con la cuota preseleccionada.
      const cuotaIdParaPagar: number | null = resp?.cuotaIdParaPagar ?? null;
      if (cuotaIdParaPagar) {
        const { PagarComprasDialogComponent } = await import(
          'src/app/pages/financiero/caja-mayor/pagar-compras-dialog/pagar-compras-dialog.component'
        );
        const payRef = this.dialog.open(PagarComprasDialogComponent, {
          width: '900px',
          maxWidth: '95vw',
          data: { cuotaIdsPreseleccionadas: [cuotaIdParaPagar] },
        });
        await firstValueFrom(payRef.afterClosed());
      }

      this.onSaved?.();
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
