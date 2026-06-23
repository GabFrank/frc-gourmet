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
import { RepositoryService, PermissionService } from '@frc/shared-core';

interface FuncionarioVM {
  id: number;
  codigoInterno?: string;
  activo: boolean;
  persona?: { id: number; nombre: string; apellido?: string };
  cargo?: { id: number; nombre: string };
}

/**
 * Lista de Funcionarios. No hay baja física (se inactivan vía `activo` en el
 * form). Permiso RRHH_FUNCIONARIO_EDITAR para alta/edición.
 */
@Component({
  selector: 'app-funcionarios-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatProgressBarModule,
  ],
  templateUrl: './funcionarios-list.page.html',
})
export class FuncionariosListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: FuncionarioVM[] = [];
  items: FuncionarioVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('RRHH_FUNCIONARIO_EDITAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getFuncionarios().subscribe({
      next: (data) => {
        this.todos = (data || []) as FuncionarioVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los funcionarios';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todos.filter(
          (f) =>
            (f.persona?.nombre || '').toLowerCase().includes(q) ||
            (f.codigoInterno || '').toLowerCase().includes(q),
        )
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }
}
