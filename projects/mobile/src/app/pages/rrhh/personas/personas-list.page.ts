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
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';

interface PersonaVM {
  id: number;
  nombre: string;
  apellido?: string;
  documento?: string;
  tipoPersona: string;
  activo: boolean;
  imageUrl?: string;
}

/** Lista de Personas (RRHH). Permiso PERSONAS_GESTIONAR. */
@Component({
  selector: 'app-personas-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule, AppImagePipe,
  ],
  templateUrl: './personas-list.page.html',
})
export class PersonasListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: PersonaVM[] = [];
  items: PersonaVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('PERSONAS_GESTIONAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getPersonas().subscribe({
      next: (data) => {
        this.todos = (data || []) as PersonaVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las personas';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todos.filter(
          (p) =>
            (p.nombre || '').toLowerCase().includes(q) ||
            (p.apellido || '').toLowerCase().includes(q) ||
            (p.documento || '').toLowerCase().includes(q),
        )
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  async eliminar(p: PersonaVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Eliminar persona',
      message: `¿Eliminar "${p.nombre} ${p.apellido || ''}"?`,
      confirmText: 'Eliminar',
      danger: true,
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, width: '320px' }).afterClosed());
    if (!ok) return;
    this.repo.deletePersona(p.id).subscribe({
      next: () => {
        this.snack.open('Persona eliminada', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => this.snack.open(/PERMISO/.test(String(e?.message)) ? 'Sin permiso' : 'No se pudo eliminar', 'OK', { duration: 3000 }),
    });
  }
}
