import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
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
import { RecetaPasoDialogComponent, PasoResult } from './receta-paso-dialog.component';

interface ItemVM {
  id: number;
  nombre: string;
  detalle: string;
  costoFmt: string;
  esProducto: boolean;
  raw: any;
}

interface PasoVM {
  id: number;
  orden: number;
  titulo: string | null;
  descripcion: string;
  itemIds: number[];
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
    MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatSlideToggleModule,
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
  pasos: PasoVM[] = [];
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
      await this.cargarPasos();
    } catch {
      this.snack.open('No se pudo cargar la receta', 'OK', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private async cargarPasos(): Promise<void> {
    if (this.id == null) return;
    const data: any[] = await firstValueFrom(this.repo.getRecetaFases(this.id));
    this.pasos = (data || [])
      .map((f) => ({
        id: f.id,
        orden: f.orden ?? 0,
        titulo: f.titulo || null,
        descripcion: f.descripcion || '',
        itemIds: (f.ingredientes || [])
          .map((fi: any) => fi.recetaIngrediente?.id)
          .filter((x: any): x is number => x != null),
      }))
      .sort((a, b) => a.orden - b.orden);
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

  // --- Pasos de preparación (fases) ---

  /** Opciones de ítems (id + nombre) para vincular a un paso. */
  private itemOptions(): { id: number; nombre: string }[] {
    return this.items.map((it) => ({ id: it.id, nombre: it.nombre }));
  }

  async agregarPaso(): Promise<void> {
    if (this.id == null) return;
    const result: PasoResult | undefined = await firstValueFrom(
      this.dialog.open(RecetaPasoDialogComponent, {
        data: { items: this.itemOptions() },
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (!result) return;
    try {
      const fase: any = await firstValueFrom(this.repo.createRecetaFase({
        recetaId: this.id,
        orden: this.pasos.length,
        titulo: result.titulo,
        descripcion: result.descripcion,
      }));
      if (fase?.id && result.itemIds.length) {
        await firstValueFrom(this.repo.setRecetaFaseIngredientes(fase.id, result.itemIds));
      }
      await this.cargarPasos();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo agregar el paso').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  async editarPaso(p: PasoVM): Promise<void> {
    const result: PasoResult | undefined = await firstValueFrom(
      this.dialog.open(RecetaPasoDialogComponent, {
        data: { titulo: p.titulo, descripcion: p.descripcion, orden: p.orden, items: this.itemOptions(), selectedItemIds: p.itemIds },
        maxWidth: '95vw',
      }).afterClosed(),
    );
    if (!result) return;
    try {
      await firstValueFrom(this.repo.updateRecetaFase(p.id, { titulo: result.titulo, descripcion: result.descripcion }));
      await firstValueFrom(this.repo.setRecetaFaseIngredientes(p.id, result.itemIds));
      await this.cargarPasos();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo actualizar el paso').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  async eliminarPaso(p: PasoVM): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data: { title: 'Eliminar paso', message: '¿Eliminar este paso?', danger: true },
        width: '320px',
      }).afterClosed(),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteRecetaFase(p.id));
      await this.cargarPasos();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo eliminar el paso').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }

  /** Mueve un paso una posición arriba/abajo y persiste el nuevo orden. */
  async moverPaso(index: number, delta: number): Promise<void> {
    if (this.id == null) return;
    const destino = index + delta;
    if (destino < 0 || destino >= this.pasos.length) return;
    const arr = [...this.pasos];
    [arr[index], arr[destino]] = [arr[destino], arr[index]];
    this.pasos = arr; // feedback inmediato
    try {
      await firstValueFrom(this.repo.reorderRecetaFases(this.id, arr.map((p) => p.id)));
      await this.cargarPasos();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo reordenar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
      await this.cargarPasos();
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
