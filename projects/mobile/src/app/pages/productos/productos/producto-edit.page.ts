import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
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
import { PresentacionDialogComponent, PresentacionDraft } from './presentacion-dialog.component';

/** Opciones de tipo de producto (labels amigables). Default RETAIL para el alta simple. */
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

/**
 * Alta de Producto en la PWA: información general + presentaciones (cada una con
 * su precio y códigos de barra). Como el backend no tiene un handler compuesto,
 * al guardar se persiste en secuencia: createProducto → por cada presentación
 * createPresentacion → createPrecioVenta → createCodigoBarra.
 */
@Component({
  selector: 'app-producto-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatCardModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './producto-edit.page.html',
  styleUrls: ['./producto-edit.page.scss'],
})
export class ProductoEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
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

  loading = false;
  saving = false;

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
    } catch {
      this.snack.open('No se pudieron cargar los datos de referencia', 'OK', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  async onFamiliaChange(familiaId: number | null): Promise<void> {
    this.subfamilias = [];
    this.form.controls.subfamiliaId.setValue(null);
    if (familiaId == null) return;
    try {
      const subs = await firstValueFrom(this.repo.getSubfamiliasByFamilia(familiaId));
      this.subfamilias = (subs || []).map((s: any) => ({ id: s.id, nombre: s.nombre }));
    } catch {
      this.snack.open('No se pudieron cargar las subfamilias', 'OK', { duration: 3000 });
    }
  }

  async agregarPresentacion(): Promise<void> {
    const result: PresentacionDraft | undefined = await firstValueFrom(
      this.dialog.open(PresentacionDialogComponent, {
        data: { monedas: this.monedas, tiposPrecio: this.tiposPrecio },
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (result) {
      // La primera presentación queda principal por defecto; si marca otra, se respeta.
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
    const eraPrincipal = this.presentaciones[i].principal;
    this.presentaciones.splice(i, 1);
    if (eraPrincipal && this.presentaciones.length) this.presentaciones[0].principal = true;
  }

  /** Deja `p` como la única presentación principal. */
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
    };
    try {
      const prod: any = await firstValueFrom(this.repo.createProducto(productoPayload));
      const productoId = prod?.id;
      if (!productoId) throw new Error('No se recibió el producto creado');

      for (const pres of this.presentaciones) {
        const presCreada: any = await firstValueFrom(this.repo.createPresentacion({
          nombre: pres.nombre,
          cantidad: pres.cantidad,
          principal: pres.principal,
          activo: true,
          productoId,
        } as any));
        const presentacionId = presCreada?.id;
        if (!presentacionId) continue;

        if (pres.precioValor != null && pres.monedaId && pres.tipoPrecioId) {
          await firstValueFrom(this.repo.createPrecioVenta({
            presentacionId,
            valor: pres.precioValor,
            monedaId: pres.monedaId,
            tipoPrecioId: pres.tipoPrecioId,
            principal: true,
            activo: true,
          } as any));
        }
        for (const cod of pres.codigos) {
          await firstValueFrom(this.repo.createCodigoBarra({
            presentacionId,
            codigo: cod.codigo,
            principal: cod.principal,
            activo: true,
          } as any));
        }
      }

      this.snack.open('Producto creado', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e: any) {
      const msg = String(e?.message || '');
      this.snack.open(/PERMISO/i.test(msg) ? 'Sin permiso para crear productos' : 'No se pudo crear el producto', 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
