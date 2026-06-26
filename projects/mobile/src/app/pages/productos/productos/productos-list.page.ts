import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';

interface ProductoVM {
  id: number;
  nombre: string;
  tipo: string;
  activo: boolean;
  imageUrl?: string;
  esBuffet?: boolean;
  precio: number | null;
  simbolo: string;
  decimales: number;
  precioDigits: string;
}

/** Vista (solo lectura) de Productos: lista con precio principal + detalle. */
@Component({
  selector: 'app-productos-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatProgressBarModule,
    MatRippleModule, AppImagePipe,
  ],
  templateUrl: './productos-list.page.html',
  styleUrls: ['./productos-list.page.scss'],
})
export class ProductosListPage implements OnInit {
  private readonly router = inject(Router);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: ProductoVM[] = [];
  items: ProductoVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    const api = (window as any).api;
    const cargar: Promise<any[]> = api?.callIpc
      ? api.callIpc('get-productos-con-precio')
      : Promise.reject();
    cargar
      .then((data: any[]) => {
        this.todos = (data || []).map((p) => this.toVM(p));
        this.aplicarFiltro();
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudieron cargar los productos';
        this.loading = false;
      });
  }

  private toVM(p: any): ProductoVM {
    return {
      id: p.id,
      nombre: p.nombre,
      tipo: p.tipo,
      activo: p.activo,
      imageUrl: p.imageUrl ?? undefined,
      esBuffet: p.esBuffet,
      precio: p.precio ?? null,
      simbolo: p.simbolo || '',
      decimales: p.decimales ?? 0,
      precioDigits: `1.0-${p.decimales ?? 0}`,
    };
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q ? this.todos.filter((p) => (p.nombre || '').toLowerCase().includes(q)) : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  abrir(p: ProductoVM): void {
    this.router.navigate(['/productos/detalle', p.id]);
  }
}
