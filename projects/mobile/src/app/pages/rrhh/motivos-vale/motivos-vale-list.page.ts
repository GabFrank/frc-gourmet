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
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../core/components/confirm-dialog.component';

interface MotivoVM {
  id: number;
  nombre: string;
  descripcion?: string;
  activo: boolean;
}

/** Lista de Motivos de vale (RRHH). Replica el patrón CRUD de Cargos. */
@Component({
  selector: 'app-motivos-vale-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './motivos-vale-list.page.html',
})
export class MotivosValeListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: MotivoVM[] = [];
  items: MotivoVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('RRHH_CONFIG_EDITAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getMotivosVale().subscribe({
      next: (data) => {
        this.todos = (data || []) as MotivoVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los motivos';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q ? this.todos.filter((m) => (m.nombre || '').toLowerCase().includes(q)) : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  async eliminar(m: MotivoVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Eliminar motivo',
      message: `¿Eliminar "${m.nombre}"?`,
      confirmText: 'Eliminar',
      danger: true,
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, width: '320px' }).afterClosed());
    if (!ok) return;
    this.repo.deleteMotivoVale(m.id).subscribe({
      next: () => {
        this.snack.open('Motivo eliminado', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => this.snack.open(/PERMISO/.test(String(e?.message)) ? 'Sin permiso' : 'No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }
}
