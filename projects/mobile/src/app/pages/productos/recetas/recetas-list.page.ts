import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { PermissionService, RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

interface RecetaVM {
  id: number;
  nombre: string;
  costoFmt: string;
  activo: boolean;
  completa: boolean;
}

/** Lista de Recetas (Productos). Permiso RECETAS_GESTIONAR. */
@Component({
  selector: 'app-recetas-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './recetas-list.page.html',
})
export class RecetasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  busqueda = new FormControl('', { nonNullable: true });
  items: RecetaVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('RECETAS_GESTIONAR')));
    this.cargar();
  }

  private cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getRecetasWithFilters({ search: this.busqueda.value.trim(), page: 0, pageSize: 100 }).subscribe({
      next: (res: any) => {
        this.items = ((res?.items) || []).map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          costoFmt: Number(r.costoCalculado || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 }),
          activo: r.activo !== false,
          completa: !!r.producto,
        }));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las recetas';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    this.cargar();
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.cargar();
  }

  async eliminar(r: RecetaVM): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, {
        data: { title: 'Eliminar receta', message: `¿Eliminar "${r.nombre}"?`, danger: true },
        width: '320px',
      }).afterClosed(),
    );
    if (!ok) return;
    try {
      const res: any = await firstValueFrom(this.repo.deleteReceta(r.id));
      if (res && res.success === false) {
        this.snack.open(res.message || 'No se pudo eliminar', 'OK', { duration: 4000 });
        return;
      }
      this.snack.open('Receta eliminada', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e: any) {
      this.snack.open((e?.message || 'No se pudo eliminar').replace(/^Error:\s*/, ''), 'OK', { duration: 4000 });
    }
  }
}
