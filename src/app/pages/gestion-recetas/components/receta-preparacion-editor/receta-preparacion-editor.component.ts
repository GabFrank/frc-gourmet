import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { FileUploadComponent, FileUploadResult } from 'src/app/shared/components/file-upload/file-upload.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

interface IngredienteOpcion {
  id: number;
  nombre: string;
}

interface FaseVM {
  id: number;
  orden: number;
  titulo: string;
  descripcion: string;
  ingredienteIds: number[]; // recetaIngrediente ids vinculados
}

/**
 * Editor del "modo de preparo" de una receta: tiempo de preparo, foto del producto
 * final, materiales/utensilios y fases (con los ítems de receta que participan en
 * cada una). Se persiste de forma autónoma vía RepositoryService (requiere recetaId).
 */
@Component({
  selector: 'app-receta-preparacion-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatDialogModule,
    MatSnackBarModule,
    FileUploadComponent,
  ],
  templateUrl: './receta-preparacion-editor.component.html',
  styleUrls: ['./receta-preparacion-editor.component.scss'],
})
export class RecetaPreparacionEditorComponent implements OnChanges {
  /** Receta sobre la que se trabaja (debe estar guardada). */
  @Input() recetaId?: number;
  /** Ítems de receta para vincular a fases (id + nombre mostrado). */
  @Input() ingredientesOpciones: IngredienteOpcion[] = [];

  loading = false;

  tiempoPreparo: number | null = null;
  imageUrl: string | null = null;

  materiales: { id: number; descripcion: string }[] = [];
  nuevoMaterial = '';

  fases: FaseVM[] = [];
  nuevaFaseTitulo = '';
  nuevaFaseDescripcion = '';

  constructor(
    private repo: RepositoryService,
    private snack: MatSnackBar,
    private dialog: MatDialog,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['recetaId'] && this.recetaId) {
      this.cargar();
    }
  }

  private async cargar(): Promise<void> {
    if (!this.recetaId) return;
    this.loading = true;
    try {
      const [receta, fases, materiales] = await Promise.all([
        firstValueFrom(this.repo.getReceta(this.recetaId)),
        firstValueFrom(this.repo.getRecetaFases(this.recetaId)),
        firstValueFrom(this.repo.getRecetaMateriales(this.recetaId)),
      ]);
      this.tiempoPreparo = (receta as any)?.tiempoPreparo ?? null;
      this.imageUrl = (receta as any)?.imageUrl ?? null;
      this.materiales = (materiales || []).map((m: any) => ({ id: m.id, descripcion: m.descripcion }));
      this.fases = (fases || []).map((f: any) => ({
        id: f.id,
        orden: f.orden,
        titulo: f.titulo || '',
        descripcion: f.descripcion || '',
        ingredienteIds: (f.ingredientes || [])
          .map((fi: any) => fi.recetaIngrediente?.id)
          .filter((x: any) => x != null),
      }));
    } catch (error) {
      console.error('Error cargando preparación de receta:', error);
      this.snack.open('Error al cargar el modo de preparo', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  // --- Tiempo de preparo / foto ---
  async guardarTiempo(): Promise<void> {
    if (!this.recetaId) return;
    try {
      await firstValueFrom(this.repo.updateReceta(this.recetaId, { tiempoPreparo: this.tiempoPreparo ?? null } as any));
      this.snack.open('Tiempo de preparo guardado', undefined, { duration: 1500 });
    } catch {
      this.snack.open('Error al guardar el tiempo', 'Cerrar', { duration: 3000 });
    }
  }

  async onFotoSubida(result: FileUploadResult): Promise<void> {
    if (!this.recetaId) return;
    this.imageUrl = result.url;
    try {
      await firstValueFrom(this.repo.updateReceta(this.recetaId, { imageUrl: result.url } as any));
    } catch {
      this.snack.open('Error al guardar la foto', 'Cerrar', { duration: 3000 });
    }
  }

  async onFotoRemovida(): Promise<void> {
    if (!this.recetaId) return;
    this.imageUrl = null;
    try {
      await firstValueFrom(this.repo.updateReceta(this.recetaId, { imageUrl: null } as any));
    } catch {
      this.snack.open('Error al quitar la foto', 'Cerrar', { duration: 3000 });
    }
  }

  // --- Materiales ---
  async agregarMaterial(): Promise<void> {
    const desc = this.nuevoMaterial.trim();
    if (!desc || !this.recetaId) return;
    try {
      const saved: any = await firstValueFrom(
        this.repo.createRecetaMaterial({ recetaId: this.recetaId, descripcion: desc, orden: this.materiales.length }),
      );
      this.materiales = [...this.materiales, { id: saved.id, descripcion: saved.descripcion }];
      this.nuevoMaterial = '';
    } catch {
      this.snack.open('Error al agregar material', 'Cerrar', { duration: 3000 });
    }
  }

  async eliminarMaterial(m: { id: number }): Promise<void> {
    try {
      await firstValueFrom(this.repo.deleteRecetaMaterial(m.id));
      this.materiales = this.materiales.filter((x) => x.id !== m.id);
    } catch {
      this.snack.open('Error al eliminar material', 'Cerrar', { duration: 3000 });
    }
  }

  // --- Fases ---
  async agregarFase(): Promise<void> {
    const desc = this.nuevaFaseDescripcion.trim();
    if (!desc || !this.recetaId) return;
    try {
      const saved: any = await firstValueFrom(
        this.repo.createRecetaFase({
          recetaId: this.recetaId,
          titulo: this.nuevaFaseTitulo.trim() || null,
          descripcion: desc,
          orden: this.fases.length,
        }),
      );
      this.fases = [...this.fases, {
        id: saved.id, orden: saved.orden, titulo: saved.titulo || '', descripcion: saved.descripcion, ingredienteIds: [],
      }];
      this.nuevaFaseTitulo = '';
      this.nuevaFaseDescripcion = '';
    } catch {
      this.snack.open('Error al agregar fase', 'Cerrar', { duration: 3000 });
    }
  }

  async guardarFase(f: FaseVM): Promise<void> {
    try {
      await firstValueFrom(this.repo.updateRecetaFase(f.id, { titulo: f.titulo || null, descripcion: f.descripcion }));
      this.snack.open('Fase guardada', undefined, { duration: 1500 });
    } catch {
      this.snack.open('Error al guardar la fase', 'Cerrar', { duration: 3000 });
    }
  }

  async eliminarFase(f: FaseVM): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar fase', message: '¿Eliminar esta fase del modo de preparo?' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteRecetaFase(f.id));
      this.fases = this.fases.filter((x) => x.id !== f.id);
      await this.persistirOrden();
    } catch {
      this.snack.open('Error al eliminar la fase', 'Cerrar', { duration: 3000 });
    }
  }

  async moverFase(index: number, dir: -1 | 1): Promise<void> {
    const nuevo = index + dir;
    if (nuevo < 0 || nuevo >= this.fases.length) return;
    const arr = [...this.fases];
    [arr[index], arr[nuevo]] = [arr[nuevo], arr[index]];
    this.fases = arr;
    await this.persistirOrden();
  }

  private async persistirOrden(): Promise<void> {
    if (!this.recetaId) return;
    try {
      await firstValueFrom(this.repo.reorderRecetaFases(this.recetaId, this.fases.map((f) => f.id)));
    } catch {
      /* el orden visual ya cambió; reintento silencioso no crítico */
    }
  }

  async toggleIngredienteFase(f: FaseVM, ingId: number, checked: boolean): Promise<void> {
    f.ingredienteIds = checked
      ? [...f.ingredienteIds, ingId]
      : f.ingredienteIds.filter((x) => x !== ingId);
    try {
      await firstValueFrom(this.repo.setRecetaFaseIngredientes(f.id, f.ingredienteIds));
    } catch {
      this.snack.open('Error al vincular ingrediente a la fase', 'Cerrar', { duration: 3000 });
    }
  }
}
