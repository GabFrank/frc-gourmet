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

interface ProductoVM {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
}

/** Vista (solo lectura) de Productos. La gestión completa (precios/presentaciones) es en escritorio. */
@Component({
  selector: 'app-productos-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './productos-list.page.html',
})
export class ProductosListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: ProductoVM[] = [];
  items: ProductoVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getProductos().subscribe({
      next: (data) => {
        this.todos = (data || []) as unknown as ProductoVM[];
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los productos';
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q ? this.todos.filter((p) => (p.nombre || '').toLowerCase().includes(q)) : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }
}
