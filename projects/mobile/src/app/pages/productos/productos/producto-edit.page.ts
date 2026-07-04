import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';
import { PresentacionDialogComponent, PresentacionDraft } from './presentacion-dialog.component';

const TIPOS: { value: string; label: string }[] = [
  { value: 'RETAIL', label: 'Reventa (RETAIL)' },
  { value: 'RETAIL_INGREDIENTE', label: 'Insumo / ingrediente' },
  { value: 'ELABORADO_SIN_VARIACION', label: 'Elaborado' },
  { value: 'ELABORADO_CON_VARIACION', label: 'Elaborado con variación' },
  { value: 'COMBO', label: 'Combo' },
  { value: 'BUFFET_POR_PESO', label: 'Buffet por peso' },
];

const UNIDADES_BASE = ['UNIDAD', 'KILOGRAMO', 'LITRO'];
const IVAS = [10, 5, 0];
const MAX_IMG_BYTES = 5 * 1024 * 1024;

/**
 * Alta y edición de Producto en la PWA: información general + imagen +
 * presentaciones (cada una con su precio y códigos de barra). El backend no
 * tiene handler compuesto, así que al guardar se persiste en secuencia y, en
 * edición, se hace diff (actualizar / crear / borrar) de presentaciones,
 * precios y códigos.
 */
@Component({
  selector: 'app-producto-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatCardModule, MatDialogModule, MatSnackBarModule, AppImagePipe,
  ],
  templateUrl: './producto-edit.page.html',
  styleUrls: ['./producto-edit.page.scss'],
})
export class ProductoEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly tipos = TIPOS;
  readonly unidadesBase = UNIDADES_BASE;
  readonly ivas = IVAS;

  familias: { id: number; nombre: string }[] = [];
  subfamilias: { id: number; nombre: string }[] = [];
  monedas: { id: number; denominacion: string; simbolo: string; principal?: boolean }[] = [];
  tiposPrecio: { id: number; descripcion: string; principal?: boolean }[] = [];

  presentaciones: PresentacionDraft[] = [];
  private presentacionesEliminadas: number[] = [];
  private codigosOriginales = new Map<number, number[]>();

  id: number | null = null;
  imageUrl: string | null = null;
  loading = false;
  saving = false;
  uploadingImage = false;

  readonly form = this.fb.nonNullable.group({
    familiaId: [null as number | null, Validators.required],
    subfamiliaId: [null as number | null, Validators.required],
    nombre: ['', [Validators.required, Validators.minLength(2)]],
    tipo: ['RETAIL', Validators.required],
    unidadBase: ['UNIDAD'],
    iva: [10],
    activo: [true],
    esVendible: [true],
    esComprable: [true],
    controlaStock: [true],
    esIngrediente: [false],
    requiereComanda: [true],
  });

  get esNuevo(): boolean {
    return this.id == null;
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [familias, monedas, tiposPrecio] = await Promise.all([
        firstValueFrom(this.repo.getFamilias()),
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getTiposPrecio()),
      ]);
      this.familias = (familias || []).map((f: any) => ({ id: f.id, nombre: f.nombre }));
      this.monedas = (monedas || []).filter((m: any) => m.activo !== false);
      this.tiposPrecio = (tiposPrecio || []).filter((t: any) => t.activo !== false);

      const p = this.route.snapshot.paramMap.get('id');
      if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
        this.id = Number(p);
        await this.cargar(this.id);
      }
    } catch {
      this.snack.open('No se pudieron cargar los datos de referencia', 'OK', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  private async cargar(id: number): Promise<void> {
    const prod: any = await firstValueFrom(this.repo.getProducto(id));
    if (!prod) return;
    const familiaId = prod.subfamilia?.familia?.id ?? null;
    if (familiaId) await this.onFamiliaChange(familiaId, false);
    this.form.patchValue({
      familiaId,
      subfamiliaId: prod.subfamilia?.id ?? null,
      nombre: prod.nombre ?? '',
      tipo: prod.tipo ?? 'RETAIL',
      unidadBase: prod.unidadBase ?? 'UNIDAD',
      iva: prod.iva ?? 10,
      activo: prod.activo !== false,
      esVendible: prod.esVendible !== false,
      esComprable: !!prod.esComprable,
      controlaStock: prod.controlaStock !== false,
      esIngrediente: !!prod.esIngrediente,
      requiereComanda: prod.requiereComanda !== false,
    });
    this.imageUrl = prod.imageUrl ?? null;

    const presRes: any = await firstValueFrom(this.repo.getPresentacionesByProducto(id, 0, 100, 'activos'));
    const data: any[] = presRes?.data || presRes || [];
    for (const pres of data) {
      const codigos = (pres.codigosBarras || [])
        .filter((c: any) => c.activo !== false)
        .map((c: any) => ({ id: c.id, codigo: c.codigo, principal: !!c.principal }));
      this.codigosOriginales.set(pres.id, codigos.map((c: any) => c.id));

      let precioId: number | undefined;
      let precioValor: number | null = null;
      let monedaId: number | null = null;
      let tipoPrecioId: number | null = null;
      try {
        const precios: any[] = await firstValueFrom(this.repo.getPreciosVentaByPresentacion(pres.id, true));
        const precio = (precios || []).find((x) => x.principal) || (precios || [])[0];
        if (precio) {
          precioId = precio.id;
          precioValor = Number(precio.valor) || null;
          monedaId = precio.moneda?.id ?? null;
          tipoPrecioId = precio.tipoPrecio?.id ?? null;
        }
      } catch { /* precio opcional */ }

      this.presentaciones.push({
        id: pres.id,
        precioId,
        nombre: pres.nombre,
        cantidad: Number(pres.cantidad) || 1,
        principal: !!pres.principal,
        precioValor,
        monedaId,
        tipoPrecioId,
        codigos,
      });
    }
  }

  async onFamiliaChange(familiaId: number | null, resetSub = true): Promise<void> {
    this.subfamilias = [];
    if (resetSub) this.form.controls.subfamiliaId.setValue(null);
    if (familiaId == null) return;
    try {
      const subs = await firstValueFrom(this.repo.getSubfamiliasByFamilia(familiaId));
      this.subfamilias = (subs || []).map((s: any) => ({ id: s.id, nombre: s.nombre }));
    } catch {
      this.snack.open('No se pudieron cargar las subfamilias', 'OK', { duration: 3000 });
    }
  }

  // --- Imagen ---

  async onImageSelected(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files && input.files[0];
    input.value = ''; // permite re-elegir el mismo archivo
    if (!file) return;
    if (file.size > MAX_IMG_BYTES) {
      this.snack.open('La imagen no puede superar 5 MB', 'OK', { duration: 3000 });
      return;
    }
    this.uploadingImage = true;
    try {
      const base64 = await this.readAsDataUrl(file);
      const res: any = await firstValueFrom(this.repo.saveFile({
        carpeta: 'producto-images',
        base64,
        fileName: file.name,
        generateThumbnails: true,
      }));
      this.imageUrl = res?.url ?? null;
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo subir la imagen').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    } finally {
      this.uploadingImage = false;
    }
  }

  quitarImagen(): void {
    this.imageUrl = null;
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  // --- Presentaciones ---

  async agregarPresentacion(): Promise<void> {
    const result: PresentacionDraft | undefined = await firstValueFrom(
      this.dialog.open(PresentacionDialogComponent, {
        data: { monedas: this.monedas, tiposPrecio: this.tiposPrecio },
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (result) {
      if (result.principal || this.presentaciones.length === 0) this.marcarUnicaPrincipal(result);
      this.presentaciones.push(result);
    }
  }

  async editarPresentacion(i: number): Promise<void> {
    const result: PresentacionDraft | undefined = await firstValueFrom(
      this.dialog.open(PresentacionDialogComponent, {
        data: { monedas: this.monedas, tiposPrecio: this.tiposPrecio, presentacion: this.presentaciones[i] },
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (result) {
      if (result.principal) this.marcarUnicaPrincipal(result);
      this.presentaciones[i] = result;
      if (!this.presentaciones.some((p) => p.principal) && this.presentaciones.length) {
        this.presentaciones[0].principal = true;
      }
    }
  }

  quitarPresentacion(i: number): void {
    const p = this.presentaciones[i];
    if (p.id != null) this.presentacionesEliminadas.push(p.id);
    const eraPrincipal = p.principal;
    this.presentaciones.splice(i, 1);
    if (eraPrincipal && this.presentaciones.length) this.presentaciones[0].principal = true;
  }

  private marcarUnicaPrincipal(p: PresentacionDraft): void {
    this.presentaciones.forEach((x) => (x.principal = false));
    p.principal = true;
  }

  resumenPresentacion(p: PresentacionDraft): string {
    const partes: string[] = [`Cant: ${p.cantidad}`];
    if (p.precioValor != null) {
      const m = this.monedas.find((x) => x.id === p.monedaId);
      partes.push(`${m?.simbolo || ''} ${p.precioValor.toLocaleString('es-PY')}`.trim());
    }
    if (p.codigos.length) partes.push(`${p.codigos.length} cód.`);
    return partes.join(' · ');
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.presentaciones.length === 0) {
      this.snack.open('Agregá al menos una presentación', 'OK', { duration: 3000 });
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const productoPayload: any = {
      nombre: v.nombre.trim().toUpperCase(),
      tipo: v.tipo,
      unidadBase: v.unidadBase,
      iva: Number(v.iva),
      activo: v.activo,
      esVendible: v.esVendible,
      esComprable: v.esComprable,
      controlaStock: v.controlaStock,
      esIngrediente: v.esIngrediente,
      requiereComanda: v.requiereComanda,
      subfamiliaId: v.subfamiliaId,
      imageUrl: this.imageUrl,
    };
    try {
      if (this.esNuevo) {
        const prod: any = await firstValueFrom(this.repo.createProducto(productoPayload));
        const productoId = prod?.id;
        if (!productoId) throw new Error('No se recibió el producto creado');
        for (const pres of this.presentaciones) await this.crearPresentacionCompleta(productoId, pres);
        this.snack.open('Producto creado', 'OK', { duration: 2500 });
      } else {
        await firstValueFrom(this.repo.updateProducto(this.id!, productoPayload));
        for (const pres of this.presentaciones) {
          if (pres.id != null) await this.sincronizarPresentacion(pres);
          else await this.crearPresentacionCompleta(this.id!, pres);
        }
        for (const presId of this.presentacionesEliminadas) {
          await firstValueFrom(this.repo.togglePresentacionActivo(presId)); // activa→inactiva
        }
        this.snack.open('Producto actualizado', 'OK', { duration: 2500 });
      }
      this.location.back();
    } catch (e: any) {
      const msg = String(e?.message || '');
      this.snack.open(/PERMISO/i.test(msg) ? 'Sin permiso para gestionar productos' : 'No se pudo guardar el producto', 'OK', { duration: 4000 });
      this.saving = false;
    }
  }

  /** Crea una presentación nueva con su precio y códigos. */
  private async crearPresentacionCompleta(productoId: number, pres: PresentacionDraft): Promise<void> {
    const creada: any = await firstValueFrom(this.repo.createPresentacion({
      nombre: pres.nombre, cantidad: pres.cantidad, principal: pres.principal, activo: true, productoId,
    } as any));
    const presentacionId = creada?.id;
    if (!presentacionId) return;
    if (pres.precioValor != null && pres.monedaId && pres.tipoPrecioId) {
      await firstValueFrom(this.repo.createPrecioVenta({
        presentacionId, valor: pres.precioValor, monedaId: pres.monedaId, tipoPrecioId: pres.tipoPrecioId,
        principal: true, activo: true,
      } as any));
    }
    for (const cod of pres.codigos) {
      await firstValueFrom(this.repo.createCodigoBarra({
        presentacionId, codigo: cod.codigo, principal: cod.principal, activo: true,
      } as any));
    }
  }

  /** Actualiza una presentación existente: campos, precio y diff de códigos. */
  private async sincronizarPresentacion(pres: PresentacionDraft): Promise<void> {
    const presentacionId = pres.id!;
    await firstValueFrom(this.repo.updatePresentacion(presentacionId, {
      nombre: pres.nombre, cantidad: pres.cantidad, principal: pres.principal, activo: true,
    } as any));

    // Precio principal: actualizar / crear / borrar.
    if (pres.precioValor != null && pres.monedaId && pres.tipoPrecioId) {
      if (pres.precioId != null) {
        await firstValueFrom(this.repo.updatePrecioVenta(pres.precioId, {
          valor: pres.precioValor, monedaId: pres.monedaId, tipoPrecioId: pres.tipoPrecioId, principal: true, activo: true,
        } as any));
      } else {
        await firstValueFrom(this.repo.createPrecioVenta({
          presentacionId, valor: pres.precioValor, monedaId: pres.monedaId, tipoPrecioId: pres.tipoPrecioId, principal: true, activo: true,
        } as any));
      }
    } else if (pres.precioId != null) {
      await firstValueFrom(this.repo.deletePrecioVenta(pres.precioId));
    }

    // Códigos: borrar los quitados, actualizar los existentes, crear los nuevos.
    const originales = this.codigosOriginales.get(presentacionId) || [];
    const actualesIds = pres.codigos.filter((c) => c.id != null).map((c) => c.id as number);
    for (const delId of originales.filter((oid) => !actualesIds.includes(oid))) {
      await firstValueFrom(this.repo.deleteCodigoBarra(delId));
    }
    for (const cod of pres.codigos) {
      if (cod.id != null) {
        await firstValueFrom(this.repo.updateCodigoBarra(cod.id, { codigo: cod.codigo, principal: cod.principal, activo: true } as any));
      } else {
        await firstValueFrom(this.repo.createCodigoBarra({ presentacionId, codigo: cod.codigo, principal: cod.principal, activo: true } as any));
      }
    }
  }
}
