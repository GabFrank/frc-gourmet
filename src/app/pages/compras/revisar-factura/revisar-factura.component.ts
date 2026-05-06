import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { FacturaImportService, MatchResult, MatchItem } from 'src/app/services/factura-import.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { CrearProveedorInlineDialogComponent } from '../importar-factura-dialog/crear-proveedor-inline-dialog.component';
import { CrearProductoInlineDialogComponent } from '../importar-factura-dialog/crear-producto-inline-dialog.component';
import { CreateEditCompraComponent } from '../create-edit-compra/create-edit-compra.component';
import { VerFacturaDialogComponent } from './ver-factura-dialog.component';

interface ItemVm extends MatchItem {
  chipLabel: string;
  chipClass: string;
  rowClass: string;
  selectedProductoId: number | null;
  selectedPresentacionId: number | null;
  presentacionesDisponibles: { id: number; nombre: string; cantidad: number; principal: boolean }[];
  costoUnitario: number;
}

@Component({
  selector: 'app-revisar-factura',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './revisar-factura.component.html',
  styleUrls: ['./revisar-factura.component.scss'],
})
export class RevisarFacturaComponent implements OnInit {
  documentoId!: number;
  tabId?: string;

  loading = false;
  confirming = false;
  matchResult: MatchResult | null = null;
  documento: any = null;

  previewImgUrl: string | null = null;
  previewImgError = false;
  archivoEsPdf = false;

  proveedoresAll: any[] = [];
  monedas: any[] = [];

  proveedorIdSeleccionado: number | null = null;
  monedaIdSeleccionada: number | null = null;
  numeroNota = '';
  fechaCompra: Date = new Date();
  tipoBoleta = 'COMUN';

  itemsVm: ItemVm[] = [];
  presentacionesPorProducto: { [productoId: number]: any[] } = {};

  totalAjustado = 0;
  itemsOmitidos = 0;

  proveedorValidado = false;

  itemsColumns = ['estado', 'producto', 'descripcion', 'presentacion', 'cantidad', 'precio', 'subtotal', 'acciones'];

  constructor(
    private service: FacturaImportService,
    private repo: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
  ) {}

  setData(d: any): void {
    if (!d) return;
    if (d.documentoId) this.documentoId = d.documentoId;
    if (d.tabId) this.tabId = d.tabId;
  }

  ngOnInit(): void {
    if (this.documentoId) this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const doc = await firstValueFrom(this.service.get(this.documentoId));
      this.documento = doc;
      this.archivoEsPdf = doc.archivoTipo === 'PDF';
      this.previewImgUrl = this.archivoEsPdf
        ? doc.archivoUrl.replace(/\.pdf$/i, '.render.png')
        : doc.archivoUrl;

      const [match, provs, monedas] = await Promise.all([
        firstValueFrom(this.service.match(this.documentoId)),
        firstValueFrom(this.repo.getProveedores()),
        firstValueFrom(this.repo.getMonedas()),
      ]);

      if ((match as any).error) {
        this.snackBar.open('Error al hacer matching: ' + (match as any).error, 'Cerrar', { duration: 6000 });
        return;
      }

      this.matchResult = match as MatchResult;
      this.proveedoresAll = provs || [];
      this.monedas = monedas || [];

      const monedaPyg = this.monedas.find(m => (m.denominacion || '').toUpperCase() === 'GUARANI')
        || this.monedas.find(m => (m.simbolo || '').toUpperCase() === 'PYG')
        || this.monedas[0];
      this.monedaIdSeleccionada = monedaPyg?.id || null;

      this.proveedorIdSeleccionado = this.matchResult.proveedor.match?.id || null;
      this.numeroNota = this.matchResult.documento.numeroNota || '';
      this.tipoBoleta = this.matchResult.documento.tipo || 'COMUN';
      if (this.matchResult.documento.fecha) {
        const f = new Date(this.matchResult.documento.fecha);
        if (!isNaN(f.getTime())) this.fechaCompra = f;
      }

      this.itemsVm = this.matchResult.items.map(it => this.toVm(it));
      for (const vm of this.itemsVm) {
        if (vm.selectedProductoId) {
          await this.loadPresentaciones(vm.selectedProductoId);
          vm.presentacionesDisponibles = this.presentacionesPorProducto[vm.selectedProductoId] || [];
          // Auto-seleccionar la presentacion principal (o la primera) si no vino del matcher.
          const yaExiste = vm.selectedPresentacionId
            && vm.presentacionesDisponibles.some(p => p.id === vm.selectedPresentacionId);
          if (!yaExiste) {
            const principal = vm.presentacionesDisponibles.find(p => p.principal);
            vm.selectedPresentacionId = principal?.id ?? vm.presentacionesDisponibles[0]?.id ?? null;
          }
        }
      }
      this.recalcularTotal();
    } catch (e: any) {
      this.snackBar.open('Error al cargar: ' + e?.message, 'Cerrar', { duration: 6000 });
    } finally {
      this.loading = false;
    }
  }

  private toVm(item: MatchItem): ItemVm {
    const conf = item.confianza;
    const chipLabel = conf === 'ALTA' ? 'Auto-vinculado' : conf === 'MEDIA' ? 'Sugerencia' : 'Sin coincidencia';
    const chipClass = conf === 'ALTA' ? 'chip-verde' : conf === 'MEDIA' ? 'chip-amarillo' : 'chip-naranja';
    return {
      ...item,
      chipLabel,
      chipClass,
      rowClass: '',
      selectedProductoId: item.match?.productoId || null,
      selectedPresentacionId: item.match?.presentacionId || null,
      presentacionesDisponibles: [],
      costoUnitario: item.lineaOcr.precioUnitario,
    };
  }

  private async loadPresentaciones(productoId: number): Promise<void> {
    if (this.presentacionesPorProducto[productoId]) return;
    try {
      const res: any = await firstValueFrom(this.repo.getPresentacionesByProducto(productoId, 0, 50, 'activos'));
      // El handler devuelve { data, total, page, pageSize }
      const items: any[] = res?.data || res?.items || (Array.isArray(res) ? res : []) || [];
      this.presentacionesPorProducto[productoId] = items.map(p => ({
        id: p.id,
        nombre: p.nombre || '(sin nombre)',
        cantidad: Number(p.cantidad) || 1,
        principal: !!p.principal,
      }));
    } catch {
      this.presentacionesPorProducto[productoId] = [];
    }
  }

  proveedorChipClass(): string {
    if (!this.matchResult) return '';
    if (this.proveedorValidado && this.proveedorIdSeleccionado) return 'chip-verde';
    const c = this.matchResult.proveedor.confianza;
    return c === 'ALTA' ? 'chip-verde' : c === 'MEDIA' ? 'chip-amarillo' : 'chip-naranja';
  }

  proveedorChipLabel(): string {
    if (!this.matchResult) return '';
    if (this.proveedorValidado && this.proveedorIdSeleccionado) return 'Validado';
    const c = this.matchResult.proveedor.confianza;
    return c === 'ALTA' ? 'Auto-vinculado' : c === 'MEDIA' ? 'Sugerencia' : 'Sin coincidencia';
  }

  onProveedorSeleccion(): void {
    if (this.proveedorIdSeleccionado) {
      this.proveedorValidado = true;
    }
  }

  abrirVerFactura(): void {
    if (!this.previewImgUrl || this.previewImgError) return;
    this.dialog.open(VerFacturaDialogComponent, {
      width: '90vw',
      maxWidth: '90vw',
      height: '90vh',
      data: {
        archivoUrl: this.documento?.archivoUrl,
        archivoNombre: this.documento?.archivoNombre,
        archivoTipo: this.documento?.archivoTipo,
        previewUrl: this.previewImgUrl,
      },
    });
  }

  abrirCrearProveedor(): void {
    const ref = this.dialog.open(CrearProveedorInlineDialogComponent, {
      width: '480px',
      data: {
        nombre: this.matchResult?.proveedor.textoOcr || '',
        ruc: this.matchResult?.proveedor.rucOcr || '',
        telefono: this.matchResult?.proveedor.telefonoOcr || '',
      },
    });
    ref.afterClosed().subscribe((nuevo: any) => {
      if (nuevo) {
        this.proveedoresAll = [nuevo, ...this.proveedoresAll];
        this.proveedorIdSeleccionado = nuevo.id;
        this.snackBar.open('Proveedor creado.', 'Cerrar', { duration: 2500 });
      }
    });
  }

  async onProductoChange(vm: ItemVm, productoId: number | null): Promise<void> {
    vm.selectedProductoId = productoId;
    vm.selectedPresentacionId = null;
    if (productoId) {
      await this.loadPresentaciones(productoId);
      vm.presentacionesDisponibles = this.presentacionesPorProducto[productoId] || [];
      const principal = vm.presentacionesDisponibles.find(p => p.principal);
      if (principal) vm.selectedPresentacionId = principal.id;
      this.marcarItemValidado(vm);
    } else {
      vm.presentacionesDisponibles = [];
    }
  }

  onPresentacionSeleccion(vm: ItemVm): void {
    if (vm.selectedPresentacionId) {
      this.marcarItemValidado(vm);
    }
  }

  private marcarItemValidado(vm: ItemVm): void {
    vm.confianza = 'ALTA';
    vm.chipLabel = 'Validado';
    vm.chipClass = 'chip-verde';
  }

  abrirCrearProducto(vm: ItemVm): void {
    const ref = this.dialog.open(CrearProductoInlineDialogComponent, {
      width: '560px',
      data: {
        descripcionOcr: vm.lineaOcr.descripcion,
        codigoProveedorOcr: vm.lineaOcr.codigoProveedor,
        ivaOcr: (vm.lineaOcr as any).iva,
      },
    });
    ref.afterClosed().subscribe(async (res: any) => {
      if (res?.producto) {
        // Insertar el producto creado al tope de candidatos para que el mat-select tenga la opcion.
        vm.candidatos = [
          {
            productoId: res.producto.id,
            presentacionId: res.presentacion?.id || null,
            nombre: res.producto.nombre,
            presentacionNombre: res.presentacion?.nombre || null,
            score: 1,
          },
          ...(vm.candidatos || []).filter(c => c.productoId !== res.producto.id),
        ];
        if (res.presentacion) {
          this.presentacionesPorProducto[res.producto.id] = [{
            id: res.presentacion.id,
            nombre: res.presentacion.nombre,
            cantidad: Number(res.presentacion.cantidad) || 1,
            principal: !!res.presentacion.principal,
          }];
          vm.presentacionesDisponibles = this.presentacionesPorProducto[res.producto.id];
        }
        // Setear selecciones DESPUES de que la opcion exista en la lista (Angular debe rerender primero).
        setTimeout(() => {
          vm.selectedProductoId = res.producto.id;
          if (res.presentacion) {
            vm.selectedPresentacionId = res.presentacion.id;
          }
          vm.confianza = 'ALTA';
          vm.chipLabel = 'Producto nuevo';
          vm.chipClass = 'chip-verde';
          this.recalcularTotal();
        }, 0);
        this.snackBar.open('Producto creado.', 'Cerrar', { duration: 2500 });
      }
    });
  }

  toggleOmitir(vm: ItemVm): void {
    vm.omitir = !vm.omitir;
    vm.rowClass = vm.omitir ? 'row-omitida' : '';
    this.recalcularTotal();
  }

  recalcularTotal(): void {
    let total = 0;
    let omitidos = 0;
    for (const vm of this.itemsVm) {
      if (vm.omitir) {
        omitidos++;
        continue;
      }
      const cant = Number(vm.lineaOcr.cantidad) || 0;
      const costo = Number(vm.costoUnitario) || 0;
      total += cant * costo;
    }
    this.totalAjustado = +total.toFixed(2);
    this.itemsOmitidos = omitidos;
  }

  onCostoChange(_vm: ItemVm): void {
    this.recalcularTotal();
  }

  onPreviewError(): void {
    this.previewImgError = true;
  }

  cerrarTab(): void {
    if (this.tabId) this.tabsService.removeTabById(this.tabId);
  }

  async confirmar(): Promise<void> {
    if (!this.proveedorIdSeleccionado) {
      this.snackBar.open('Seleccioná un proveedor.', 'Cerrar', { duration: 4000 });
      return;
    }
    if (!this.monedaIdSeleccionada) {
      this.snackBar.open('Seleccioná moneda.', 'Cerrar', { duration: 4000 });
      return;
    }
    const sinVincular = this.itemsVm.filter(v => !v.omitir && (!v.selectedProductoId || !v.selectedPresentacionId));
    if (sinVincular.length > 0) {
      const lbl = sinVincular.length === 1 ? 'Falta vincular 1 ítem' : `Faltan vincular ${sinVincular.length} ítems`;
      this.snackBar.open(`${lbl} (o marcalos para omitir).`, 'Cerrar', { duration: 6000 });
      return;
    }
    const itemsValidos = this.itemsVm.filter(v => !v.omitir);
    if (itemsValidos.length === 0) {
      this.snackBar.open('No hay ítems válidos para crear borrador. Restaurá al menos uno.', 'Cerrar', { duration: 5000 });
      return;
    }
    if (!this.matchResult) return;

    this.confirming = true;
    try {
      const payload = {
        documentoId: this.documentoId,
        datosCompra: {
          numeroNota: this.numeroNota,
          fechaCompra: this.fechaCompra,
          tipoBoleta: this.tipoBoleta,
          monedaId: this.monedaIdSeleccionada,
          credito: false,
        },
        itemsVinculados: this.itemsVm.map(v => ({
          indice: v.indice,
          productoId: v.selectedProductoId as number,
          presentacionId: v.selectedPresentacionId,
          cantidad: v.lineaOcr.cantidad,
          costoUnitario: v.costoUnitario,
          descripcionOcr: v.lineaOcr.descripcion,
          omitir: v.omitir,
        })),
        aliasProveedor: {
          textoOcr: this.matchResult.proveedor.textoOcr,
          rucOcr: this.matchResult.proveedor.rucOcr,
          proveedorId: this.proveedorIdSeleccionado!,
        },
      };
      const res = await firstValueFrom(this.service.confirm(payload));
      if (res.success && res.compraId) {
        this.snackBar.open('Borrador creado. Abriendo para finalizar...', 'Cerrar', { duration: 3500 });
        this.tabsService.openTab(
          `Compra #${res.compraId} (borrador)`,
          CreateEditCompraComponent,
          { mode: 'edit', compraId: res.compraId },
          `editar-compra-${res.compraId}`,
          true,
        );
        this.cerrarTab();
      } else {
        this.snackBar.open('Error: ' + res.error, 'Cerrar', { duration: 6000 });
      }
    } catch (e: any) {
      this.snackBar.open('Error: ' + e?.message, 'Cerrar', { duration: 6000 });
    } finally {
      this.confirming = false;
    }
  }
}
