import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface PermisoVM {
  id: number;
  codigo: string;
  descripcion?: string;
  modulo?: string;
  activo: boolean;
}

/** Vista (solo lectura) del catálogo de Permisos. */
@Component({
  selector: 'app-permisos-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './permisos-list.page.html',
})
export class PermisosListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: PermisoVM[] = [];
  items: PermisoVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getPermissions().subscribe({
      next: (data) => {
        this.todos = (data || []) as PermisoVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los permisos';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todos.filter(
          (p) => (p.codigo || '').toLowerCase().includes(q) || (p.modulo || '').toLowerCase().includes(q),
        )
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }
}
