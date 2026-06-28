import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { TimbradoDetalle } from '../../../../database/entities/facturacion/timbrado-detalle.entity';
import { FacturaPlantilla } from '../../../../database/entities/facturacion/factura-plantilla.entity';
import { TipoFacturacion } from '../../../../database/entities/facturacion/factura.entity';
import { buildDocDefinition, loadPdfMake, FacturaRenderContext } from '../../plantillas/plantilla-render.util';

@Component({
  selector: 'app-facturar-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatFormFieldModule,
    MatSelectModule,
    MatAutocompleteModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './facturar-dialog.component.html',
  styleUrls: ['./facturar-dialog.component.scss'],
})
export class FacturarDialogComponent implements OnInit {
  form: FormGroup;
  detalles: TimbradoDetalle[] = [];
  detalleOptions: { id: number; label: string }[] = [];
  plantillas: FacturaPlantilla[] = [];
  isLoading = false;
  isSaving = false;

  // Totales precomputados (sin funciones en template)
  gravada10 = 0;
  gravada5 = 0;
  exenta = 0;
  iva10 = 0;
  iva5 = 0;
  totalIva = 0;
  total = 0;

  itemsArray!: FormArray;
  private empresa: any = null;
  private config: any = null;

  /** Modelo de facturacion del sistema (de la config). */
  esPreImpreso = false;
  /** En pre-impreso, permitir tipear el numero de la hoja fisica. */
  permitirEditarNumero = false;
  /** Proximo numero a emitir del punto de expedicion seleccionado. */
  proximoNumero: number | null = null;

  /** Venta de origen (si se factura desde el cobro del PdV). */
  prefillVentaId?: number;
  /** Resultados del buscador de productos (autocomplete por item). */
  productoOptions: any[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialogRef: MatDialogRef<FacturarDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) private data?: any,
  ) {
    this.form = this.fb.group({
      timbradoDetalleId: [null, [Validators.required]],
      plantillaId: [null],
      condicionVenta: ['CONTADO'],
      nombreCliente: [''],
      ruc: [''],
      direccion: [''],
      email: [''],
      descuento: [0],
      numeroManual: [null],
      items: this.fb.array([]),
    });
    this.itemsArray = this.form.get('items') as FormArray;
  }

  ngOnInit(): void {
    // Prefill desde el cobro del PdV (venta + items + cliente).
    if (this.data && (this.data.items?.length || this.data.venta || this.data.cliente)) {
      this.prefillFromData();
    } else {
      this.addItem();
    }
    this.loadRefs();
    this.recalc();
    this.form.valueChanges.subscribe(() => this.recalc());
  }

  private prefillFromData(): void {
    const d = this.data || {};
    this.prefillVentaId = d.venta?.id;
    const cliente = d.cliente || d.venta?.cliente;
    if (cliente) {
      const per = cliente.persona;
      const nombre = `${per?.nombre || ''} ${per?.apellido || ''}`.trim() || cliente.razon_social || '';
      this.form.patchValue({
        nombreCliente: nombre,
        ruc: cliente.ruc || '',
        direccion: per?.direccion || '',
        email: per?.email || '',
      });
    }
    const items: any[] = d.items || [];
    if (items.length) {
      this.itemsArray.clear();
      for (const it of items) {
        const prod = it.producto;
        const pres = it.presentacion;
        const desc = `${prod?.nombre || it.descripcion || ''}${pres?.nombre ? ' (' + pres.nombre + ')' : ''}`.trim();
        this.addItem({
          descripcion: desc.toUpperCase(),
          cantidad: Number(it.cantidad) || 1,
          precioUnitario: Number(it.precioVentaUnitario ?? it.precioUnitario) || 0,
          ivaTipo: prod?.iva ?? 10,
          productoId: prod?.id ?? null,
          productoNombre: prod?.nombre ?? '',
          ventaItemId: it.id ?? null,
        });
      }
    } else {
      this.addItem();
    }
  }

  async loadRefs(): Promise<void> {
    this.isLoading = true;
    try {
      const [detalles, plantillas, empresa, config] = await Promise.all([
        firstValueFrom(this.repositoryService.getTimbradoDetalles()),
        firstValueFrom(this.repositoryService.getFacturaPlantillas()),
        firstValueFrom(this.repositoryService.getEmpresa()).catch(() => null),
        firstValueFrom(this.repositoryService.getFacturacionConfig()).catch(() => null),
      ]);
      this.empresa = empresa;
      this.config = config;
      const tipoSistema = config?.tipoFacturacion || 'PRE_IMPRESO';
      this.esPreImpreso = String(tipoSistema) === 'PRE_IMPRESO';
      this.permitirEditarNumero = this.esPreImpreso && config?.permitirEditarNumeroPreimpreso !== false;

      this.detalles = (detalles || []).filter((d) => d.activo);
      this.detalleOptions = this.detalles.map((d) => ({ id: d.id!, label: this.detalleLabel(d) }));

      // Filtra los disenos al tipo de facturacion del sistema.
      this.plantillas = (plantillas || []).filter((p) => {
        if (!p.activo) return false;
        const pt = String(p.tipo);
        if (String(tipoSistema) === 'PRE_IMPRESO') return pt === 'PRE_IMPRESO';
        if (String(tipoSistema) === 'AUTO_IMPRESO') return pt === 'AUTO_IMPRESO_TERMICA' || pt === 'AUTO_IMPRESO_A4';
        return true;
      });

      // Preselecciones desde la config (plantilla y punto de expedicion).
      const plantillaPre = config?.plantillaPredeterminada?.id
        ?? this.plantillas.find((p) => p.predeterminada)?.id ?? null;
      const detallePre = config?.timbradoDetallePredeterminado?.id
        ?? (this.detalles.length === 1 ? this.detalles[0].id : null);
      this.form.patchValue({ plantillaId: plantillaPre, timbradoDetalleId: detallePre });
      this.onDetalleChange();
    } catch (error) {
      console.error('Error loading refs:', error);
    } finally {
      this.isLoading = false;
    }
  }

  detalleLabel(d: TimbradoDetalle): string {
    const t = (d as any).timbrado;
    return `${d.establecimiento}-${d.puntoExpedicion} (próx. ${d.numeroActual})${t?.numero ? ' · Timb. ' + t.numero : ''}`;
  }

  /** Recalcula el proximo numero al cambiar el punto de expedicion. */
  onDetalleChange(): void {
    const id = this.form.get('timbradoDetalleId')?.value;
    const d = this.detalles.find((x) => x.id === id);
    this.proximoNumero = d ? d.numeroActual : null;
    // En pre-impreso editable, el numero arranca en el proximo pero es editable.
    if (this.permitirEditarNumero) {
      this.form.patchValue({ numeroManual: this.proximoNumero }, { emitEvent: false });
    }
  }

  addItem(init?: any): void {
    this.itemsArray.push(this.fb.group({
      descripcion: [init?.descripcion ?? '', [Validators.required]],
      cantidad: [init?.cantidad ?? 1, [Validators.required, Validators.min(0.001)]],
      precioUnitario: [init?.precioUnitario ?? 0, [Validators.required, Validators.min(0)]],
      ivaTipo: [init?.ivaTipo ?? 10],
      productoId: [init?.productoId ?? null],
      productoNombre: [init?.productoNombre ?? ''],
      ventaItemId: [init?.ventaItemId ?? null],
    }));
  }

  removeItem(i: number): void {
    this.itemsArray.removeAt(i);
    this.recalc();
  }

  /** Busca productos para vincular a un item (autocomplete). */
  async buscarProducto(term: string): Promise<void> {
    const t = (term || '').trim();
    if (t.length < 2) { this.productoOptions = []; return; }
    try {
      this.productoOptions = await firstValueFrom(this.repositoryService.searchProductosByNombre(t, 'venta')) as any[];
    } catch (error) {
      console.error('Error buscando productos:', error);
      this.productoOptions = [];
    }
  }

  /** Vincula el producto elegido al item: completa descripcion, precio e IVA. */
  onProductoSelected(i: number, prod: any): void {
    const grp = this.itemsArray.at(i);
    if (!grp || !prod) return;
    grp.patchValue({
      productoId: prod.id,
      productoNombre: prod.nombre,
      descripcion: String(prod.nombre || '').toUpperCase(),
      precioUnitario: Number(prod.principalPrecio?.valor) || grp.value.precioUnitario || 0,
      ivaTipo: prod.iva ?? 10,
    });
    this.recalc();
  }

  recalc(): void {
    let g10 = 0, g5 = 0, ex = 0;
    for (const ctrl of this.itemsArray.controls) {
      const v = ctrl.value;
      const lineTotal = (Number(v.cantidad) || 0) * (Number(v.precioUnitario) || 0);
      if (Number(v.ivaTipo) === 10) g10 += lineTotal;
      else if (Number(v.ivaTipo) === 5) g5 += lineTotal;
      else ex += lineTotal;
    }
    const descuento = Number(this.form.get('descuento')?.value) || 0;
    this.gravada10 = g10;
    this.gravada5 = g5;
    this.exenta = ex;
    this.iva10 = Math.round(g10 / 11);
    this.iva5 = Math.round(g5 / 21);
    this.totalIva = this.iva10 + this.iva5;
    this.total = g10 + g5 + ex - descuento;
  }

  private buildContext(factura: any): FacturaRenderContext {
    const v = this.form.value;
    return {
      factura: {
        numeroCompleto: factura?.numeroCompleto || '',
        fecha: factura?.fecha || new Date(),
        condicionVenta: v.condicionVenta,
      },
      cliente: { nombre: v.nombreCliente, ruc: v.ruc, direccion: v.direccion, email: v.email },
      timbrado: {
        numero: factura?.timbradoDetalle?.timbrado?.numero || '',
        vigencia: '',
      },
      totales: {
        gravada10: this.gravada10, gravada5: this.gravada5, exenta: this.exenta,
        iva10: this.iva10, iva5: this.iva5, totalIva: this.totalIva,
        descuento: Number(v.descuento) || 0, total: this.total, totalEnLetras: '',
      },
      empresa: {
        nombre: this.empresa?.nombre || this.empresa?.razonSocial || '',
        ruc: this.empresa?.ruc || '',
        direccion: this.empresa?.direccion || '',
      },
      items: this.itemsArray.controls.map((c) => {
        const it = c.value;
        const lineTotal = (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0);
        return {
          cantidad: Number(it.cantidad) || 0,
          descripcion: it.descripcion,
          precioUnitario: Number(it.precioUnitario) || 0,
          descuento: undefined,
          // Solo se completa la columna de IVA que corresponde; el resto queda
          // en blanco en la impresion (undefined -> celda vacia).
          exenta: Number(it.ivaTipo) === 0 ? lineTotal : undefined,
          gravada5: Number(it.ivaTipo) === 5 ? lineTotal : undefined,
          gravada10: Number(it.ivaTipo) === 10 ? lineTotal : undefined,
          total: lineTotal,
        };
      }),
    };
  }

  async facturar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Complete los campos requeridos', 'Cerrar', { duration: 3000 });
      return;
    }
    this.isSaving = true;
    const v = this.form.value;
    const plantilla = this.plantillas.find((p) => p.id === v.plantillaId);
    // El tipo lo define la config del sistema (un unico modelo de facturacion).
    const tipo = (this.config?.tipoFacturacion as TipoFacturacion) || TipoFacturacion.PRE_IMPRESO;

    const itemsPayload = this.itemsArray.controls.map((c) => {
      const it = c.value;
      const payload: any = {
        descripcion: String(it.descripcion || '').toUpperCase(),
        cantidad: Number(it.cantidad) || 0,
        precioUnitario: Number(it.precioUnitario) || 0,
        ivaTipo: Number(it.ivaTipo),
        total: (Number(it.cantidad) || 0) * (Number(it.precioUnitario) || 0),
      };
      if (it.productoId) payload.producto = { id: it.productoId };
      if (it.ventaItemId) payload.ventaItem = { id: it.ventaItemId };
      return payload;
    });

    const facturaPayload: any = {
      timbradoDetalleId: v.timbradoDetalleId,
      venta: this.prefillVentaId ? { id: this.prefillVentaId } : undefined,
      // En pre-impreso editable, se registra el numero tipeado de la hoja fisica.
      numeroManual: this.permitirEditarNumero && v.numeroManual != null ? Number(v.numeroManual) : undefined,
      plantilla: plantilla ? { id: plantilla.id } : undefined,
      tipoFacturacion: tipo,
      condicionVenta: v.condicionVenta,
      nombreCliente: v.nombreCliente ? String(v.nombreCliente).toUpperCase() : undefined,
      ruc: v.ruc || undefined,
      direccion: v.direccion ? String(v.direccion).toUpperCase() : undefined,
      email: v.email || undefined,
      gravada10: this.gravada10,
      gravada5: this.gravada5,
      exenta: this.exenta,
      iva10: this.iva10,
      iva5: this.iva5,
      descuento: Number(v.descuento) || 0,
      total: this.total,
    };

    try {
      const factura: any = await firstValueFrom(
        this.repositoryService.createFactura({ factura: facturaPayload, items: itemsPayload }),
      );
      this.snackBar.open(`Factura ${factura?.numeroCompleto || ''} emitida`, 'Cerrar', { duration: 3500 });

      if (plantilla?.config) {
        await this.imprimir(plantilla, factura);
      }
      this.dialogRef.close({ factura });
    } catch (error: any) {
      console.error('Error facturando:', error);
      this.snackBar.open(error?.message || 'Error al emitir la factura', 'Cerrar', { duration: 5000 });
    } finally {
      this.isSaving = false;
    }
  }

  private async imprimir(plantilla: FacturaPlantilla, factura: any): Promise<void> {
    try {
      const config = JSON.parse(plantilla.config!);
      const ctx = this.buildContext(factura);
      const includeBg = String(plantilla.tipo) !== 'PRE_IMPRESO' && !!plantilla.backgroundImageUrl;
      const dd = buildDocDefinition(
        { anchoMm: Number(plantilla.anchoMm), altoMm: Number(plantilla.altoMm) },
        config,
        ctx,
        includeBg ? { background: plantilla.backgroundImageUrl, backgroundTransform: config.background } : undefined,
      );
      const pdfMake = await loadPdfMake();
      pdfMake.createPdf(dd).print();
    } catch (error) {
      console.error('Error imprimiendo factura:', error);
      this.snackBar.open('Factura emitida, pero no se pudo imprimir automáticamente', 'Cerrar', { duration: 5000 });
    }
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
