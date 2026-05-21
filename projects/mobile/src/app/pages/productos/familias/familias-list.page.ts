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

interface FamiliaVM {
  id: number;
  nombre: string;
  activo: boolean;
}

/** Lista de Familias (Productos). Patrón CRUD. Permiso CATEGORIAS_GESTIONAR. */
@Component({
  selector: 'app-familias-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './familias-list.page.html',
})
export class FamiliasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: FamiliaVM[] = [];
  items: FamiliaVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('CATEGORIAS_GESTIONAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getFamilias().subscribe({
      next: (data) => {
        this.todos = (data || []) as FamiliaVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las familias';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q ? this.todos.filter((f) => (f.nombre || '').toLowerCase().includes(q)) : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  async eliminar(f: FamiliaVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Eliminar familia',
      message: `¿Eliminar "${f.nombre}"?`,
      confirmText: 'Eliminar',
      danger: true,
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, width: '320px' }).afterClosed());
    if (!ok) return;
    this.repo.deleteFamilia(f.id).subscribe({
      next: () => {
        this.snack.open('Familia eliminada', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => this.snack.open(/PERMISO/.test(String(e?.message)) ? 'Sin permiso' : 'No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }
}
