import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
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
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { FacturaImportService, MatchResult, MatchItem, ProveedorCandidato, ProductoCandidato } from 'src/app/services/factura-import.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { CrearProveedorInlineDialogComponent } from './crear-proveedor-inline-dialog.component';
import { CrearProductoInlineDialogComponent } from './crear-producto-inline-dialog.component';

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
  selector: 'app-importar-factura-dialog',
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
  templateUrl: './importar-factura-dialog.component.html',
  styleUrls: ['./importar-factura-dialog.component.scss'],
})
export class ImportarFacturaDialogComponent implements OnInit {
  loading = false;
  confirming = false;
  matchResult: MatchResult | null = null;
  documento: any = null;

  archivoUrlSafe: SafeResourceUrl | null = null;
  archivoEsPdf = false;

  proveedoresAll: any[] = [];
  productosAll: any[] = [];
  monedas: any[] = [];

  proveedorIdSeleccionado: number | null = null;
  monedaIdSeleccionada: number | null = null;
  numeroNota = '';
  fechaCompra: Date = new Date();
  tipoBoleta = 'COMUN';

  itemsVm: ItemVm[] = [];

  presentacionesPorProducto: { [productoId: number]: any[] } = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { documentoId: number },
    private dialogRef: MatDialogRef<ImportarFacturaDialogComponent>,
    private service: FacturaImportService,
    private repo: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private sanitizer: DomSanitizer,
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const doc = await firstValueFrom(this.service.get(this.data.documentoId));
      this.documento = doc;
      this.archivoEsPdf = doc.archivoTipo === 'PDF';
      this.archivoUrlSafe = this.sanitizer.bypassSecurityTrustResourceUrl(doc.archivoUrl);

      const [match, provs, monedas] = await Promise.all([
        firstValueFrom(this.service.match(this.data.documentoId)),
        firstValueFrom(this.repo.getProveedores()),
        firstValueFrom(this.repo.getMonedas()),
      ]);

      if ((match as any).error) {
        this.snackBar.open('Error al hacer matching: ' + (match as any).error, 'Cerrar', { duration: 6000 });
        this.dialogRef.close(null);
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
      // Pre-cargar presentaciones para los productos auto-vinculados
      for (const vm of this.itemsVm) {
        if (vm.selectedProductoId) {
          await this.loadPresentaciones(vm.selectedProductoId);
          vm.presentacionesDisponibles = this.presentacionesPorProducto[vm.selectedProductoId] || [];
        }
      }
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
      const items: any[] = res?.items || res || [];
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
    const c = this.matchResult.proveedor.confianza;
    return c === 'ALTA' ? 'chip-verde' : c === 'MEDIA' ? 'chip-amarillo' : 'chip-naranja';
  }

  proveedorChipLabel(): string {
    if (!this.matchResult) return '';
    const c = this.matchResult.proveedor.confianza;
    return c === 'ALTA' ? 'Auto-vinculado' : c === 'MEDIA' ? 'Sugerencia' : 'Sin coincidencia';
  }

  abrirCrearProveedor(): void {
    const ref = this.dialog.open(CrearProveedorInlineDialogComponent, { width: '480px' });
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
    } else {
      vm.presentacionesDisponibles = [];
    }
  }

  abrirCrearProducto(vm: ItemVm): void {
    const ref = this.dialog.open(CrearProductoInlineDialogComponent, {
      width: '520px',
      data: { descripcionOcr: vm.lineaOcr.descripcion },
    });
    ref.afterClosed().subscribe(async (res: any) => {
      if (res?.producto) {
        vm.selectedProductoId = res.producto.id;
        if (res.presentacion) {
          this.presentacionesPorProducto[res.producto.id] = [{
            id: res.presentacion.id,
            nombre: res.presentacion.nombre,
            cantidad: Number(res.presentacion.cantidad) || 1,
            principal: !!res.presentacion.principal,
          }];
          vm.presentacionesDisponibles = this.presentacionesPorProducto[res.producto.id];
          vm.selectedPresentacionId = res.presentacion.id;
        }
        vm.confianza = 'ALTA';
        vm.chipLabel = 'Producto nuevo';
        vm.chipClass = 'chip-verde';
        this.snackBar.open('Producto creado.', 'Cerrar', { duration: 2500 });
      }
    });
  }

  toggleOmitir(vm: ItemVm): void {
    vm.omitir = !vm.omitir;
    vm.rowClass = vm.omitir ? 'row-omitida' : '';
  }

  cancelar(): void {
    this.dialogRef.close(null);
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
      this.snackBar.open(`Faltan vincular ${sinVincular.length} ítems (o marcalos para omitir).`, 'Cerrar', { duration: 6000 });
      return;
    }
    if (!this.matchResult) return;

    this.confirming = true;
    try {
      const payload = {
        documentoId: this.data.documentoId,
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
      if (res.success) {
        this.dialogRef.close({ compraId: res.compraId });
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
