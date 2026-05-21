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

interface CargoVM {
  id: number;
  nombre: string;
  descripcion?: string;
  salarioReferencia?: number;
  activo: boolean;
}

/**
 * Lista de Cargos (RRHH) — pantalla EJEMPLAR del patrón CRUD mobile:
 * - búsqueda con botón "Filtrar" explícito (sin live filtering)
 * - tarjetas táctiles + acciones en mat-menu
 * - FAB para crear, permisos reactivos (RRHH_CONFIG_EDITAR)
 */
@Component({
  selector: 'app-cargos-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './cargos-list.page.html',
  styleUrls: ['./cargos-list.page.scss'],
})
export class CargosListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });

  private todos: CargoVM[] = [];
  cargos: CargoVM[] = [];
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
    this.repo.getCargos().subscribe({
      next: (data) => {
        this.todos = (data || []) as CargoVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los cargos';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.cargos = q
      ? this.todos.filter((c) => (c.nombre || '').toLowerCase().includes(q))
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  async eliminar(cargo: CargoVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Eliminar cargo',
      message: `¿Eliminar "${cargo.nombre}"? Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true,
    };
    const ok = await firstValueFrom(
      this.dialog.open(ConfirmDialogComponent, { data, width: '320px' }).afterClosed(),
    );
    if (!ok) return;
    this.repo.deleteCargo(cargo.id).subscribe({
      next: () => {
        this.snack.open('Cargo eliminado', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => {
        const msg = /PERMISO/.test(String(e?.message)) ? 'Sin permiso para eliminar' : 'No se pudo eliminar';
        this.snack.open(msg, 'OK', { duration: 3000 });
      },
    });
  }
}
