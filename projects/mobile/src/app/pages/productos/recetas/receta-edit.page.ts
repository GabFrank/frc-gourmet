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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';
import { RecetaIngredienteDialogComponent, RecetaIngredienteResult } from './receta-ingrediente-dialog.component';
import { VincularProductoDialogComponent, VincularProductoResult } from './vincular-producto-dialog.component';

interface ItemVM {
  id: number;
  nombre: string;
  detalle: string;
  costoFmt: string;
  esProducto: boolean;
  raw: any;
}

const UNIDADES_RENDIMIENTO = ['UNIDADES', 'GRAMOS', 'KILOGRAMOS', 'MILILITROS', 'LITROS', 'PAQUETES'];

/**
 * Alta/edición de Receta en la PWA. Al crear una receta sin producto vinculado
 * queda como "pre-receta"; el paso natural es cargar sus ítems y luego vincular
 * un producto para completarla. Los ítems pueden estar vinculados a un producto
 * o ser texto libre, y en ambos casos admiten costo cargado a mano.
 */
@Component({
  selector: 'app-receta-edit',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './receta-edit.page.html',
  styleUrls: ['./receta-edit.page.scss'],
})
export class RecetaEditPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly unidadesRendimiento = UNIDADES_RENDIMIENTO;

  id: number | null = null;
  loading = false;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    nombre: ['', [Validators.required, Validators.minLength(3)]],
    descripcion: [''],
    rendimiento: [1, [Validators.required, Validators.min(0.01)]],
    unidadRendimiento: ['UNIDADES'],
    tiempoPreparo: [null as number | null],
    activo: [true],
  });

  items: ItemVM[] = [];
  costoTotalFmt = '0';
  productoVinculado: { id: number; nombre: string } | null = null;
  esNuevo = true;

  ngOnInit(): void {
    const p = this.route.snapshot.paramMap.get('id');
    if (p && p !== 'nuevo' && Number.isFinite(Number(p))) {
      this.id = Number(p);
      this.esNuevo = false;
      this.cargar();
    }
  }

  private async cargar(): Promise<void> {
    if (this.id == null) return;
    this.loading = true;
    try {
      const r: any = await firstValueFrom(this.repo.getReceta(this.id));
      if (r) {
        this.form.patchValue({
          nombre: r.nombre ?? '',
          descripcion: r.descripcion ?? '',
          rendimiento: r.rendimiento ?? 1,
          unidadRendimiento: r.unidadRendimiento || 'UNIDADES',
          tiempoPreparo: r.tiempoPreparo ?? null,
          activo: r.activo !== false,
        });
        this.costoTotalFmt = Number(r.costoCalculado || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
        this.productoVinculado = r.producto ? { id: r.producto.id, nombre: r.producto.nombre } : null;
      }
      await this.cargarItems();
    } catch {
      this.snack.open('No se pudo cargar la receta', 'OK', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private async cargarItems(): Promise<void> {
    if (this.id == null) return;
    const data: any[] = await firstValueFrom(this.repo.getRecetaIngredientesActivos(this.id));
    this.items = (data || []).map((it) => {
      const esProducto = !!it.ingrediente;
      const nombre = esProducto ? (it.ingrediente?.nombre || 'PRODUCTO') : (it.descripcion || 'ÍTEM');
      const cant = it.cantidad != null ? `${it.cantidad} ${it.unidad || ''}`.trim() : '';
      return {
        id: it.id,
        nombre: String(nombre).toUpperCase(),
        detalle: cant,
        costoFmt: Number(it.costoTotal || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 }),
        esProducto,
        raw: it,
      };
    });
  }

  /** Recarga solo el costo total (tras alta/edición/baja de ítems). */
  private async refrescarCosto(): Promise<void> {
    if (this.id == null) return;
    const r: any = await firstValueFrom(this.repo.getReceta(this.id));
    this.costoTotalFmt = Number(r?.costoCalculado || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
  }

  async guardarReceta(): Promise<void> {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    const payload: any = {
      nombre: v.nombre.toUpperCase(),
      descripcion: (v.descripcion || '').toUpperCase() || null,
      rendimiento: Number(v.rendimiento) || 1,
      unidadRendimiento: v.unidadRendimiento,
      tiempoPreparo: v.tiempoPreparo != null ? Number(v.tiempoPreparo) : null,
      activo: v.activo,
    };
    try {
      if (this.esNuevo) {
        const creada: any = await firstValueFrom(this.repo.createReceta(payload));
        this.id = creada?.id ?? null;
        this.esNuevo = false;
        this.snack.open('Receta creada. Agregá sus ítems.', 'OK', { duration: 3000 });
        await this.cargar();
      } else {
        await firstValueFrom(this.repo.updateReceta(this.id!, payload));
        this.snack.open('Receta guardada', 'OK', { duration: 2500 });
      }
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo guardar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  async agregarItem(): Promise<void> {
    if (this.id == null) return;
    const result: RecetaIngredienteResult | undefined = await firstValueFrom(
      this.dialog.open(RecetaIngredienteDialogComponent, { data: { recetaId: this.id }, width: '420px', maxWidth: '95vw' }).afterClosed(),
    );
    if (!result) return;
    try {
      await firstValueFrom(this.repo.createRecetaIngrediente(this.toItemPayload(result)));
      await this.cargarItems();
      await this.refrescarCosto();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo agregar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  async editarItem(item: ItemVM): Promise<void> {
    if (this.id == null) return;
    const result: RecetaIngredienteResult | undefined = await firstValueFrom(
      this.dialog.open(RecetaIngredienteDialogComponent, { data: { recetaId: this.id, item: item.raw }, width: '420px', maxWidth: '95vw' }).afterClosed(),
    );
    if (!result) return;
    try {
      await firstValueFrom(this.repo.updateRecetaIngrediente(item.id, this.toItemPayload(result)));
      await this.cargarItems();
      await this.refrescarCosto();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo actualizar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  async eliminarItem(item: ItemVM): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data: { title: 'Eliminar ítem', message: `¿Eliminar "${item.nombre}"?`, danger: true },
        width: '320px',
      }).afterClosed(),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteRecetaIngrediente(item.id));
      await this.cargarItems();
      await this.refrescarCosto();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo eliminar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  private toItemPayload(r: RecetaIngredienteResult): any {
    return {
      recetaId: r.recetaId,
      ingredienteId: r.ingredienteId ?? undefined,
      descripcion: r.descripcion ?? undefined,
      cantidad: r.cantidad,
      unidad: r.unidad,
      unidadOriginal: r.unidadOriginal,
      costoUnitario: r.costoUnitario,
      costoTotal: r.costoTotal,
      activo: r.activo,
    };
  }

  async vincularProducto(): Promise<void> {
    if (this.id == null) return;
    const result: VincularProductoResult | undefined = await firstValueFrom(
      this.dialog.open(VincularProductoDialogComponent, { width: '420px', maxWidth: '95vw' }).afterClosed(),
    );
    if (!result) return;
    try {
      await firstValueFrom(this.repo.updateProducto(result.productoId, { recetaId: this.id } as any));
      this.productoVinculado = { id: result.productoId, nombre: result.productoNombre };
      this.snack.open('Producto vinculado. Receta completa.', 'OK', { duration: 3000 });
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo vincular').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  async desvincularProducto(): Promise<void> {
    if (!this.productoVinculado) return;
    try {
      await firstValueFrom(this.repo.updateProducto(this.productoVinculado.id, { recetaId: null } as any));
      this.productoVinculado = null;
      this.snack.open('Producto desvinculado', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo desvincular').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  volver(): void {
    this.location.back();
  }
}
