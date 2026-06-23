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

interface ProveedorVM {
  id: number;
  nombre: string;
  razon_social?: string;
  ruc?: string;
  telefono?: string;
  activo: boolean;
}

/** Vista (solo lectura) de Proveedores (no hay handler de alta en backend). */
@Component({
  selector: 'app-proveedores-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './proveedores-list.page.html',
})
export class ProveedoresListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: ProveedorVM[] = [];
  items: ProveedorVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getProveedores().subscribe({
      next: (data) => {
        this.todos = (data || []) as unknown as ProveedorVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los proveedores';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todos.filter((p) => (p.nombre || '').toLowerCase().includes(q) || (p.ruc || '').toLowerCase().includes(q))
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }
}
