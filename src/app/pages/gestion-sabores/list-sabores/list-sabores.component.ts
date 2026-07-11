import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';

import { RepositoryService } from '../../../database/repository.service';
import { HasPermissionDirective } from '../../../shared/directives/has-permission.directive';
import { SaborDialogComponent } from '../../productos/gestionar-producto/dialogs/sabor-dialog/sabor-dialog.component';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

interface SaborRow {
  id: number;
  nombre: string;
  categoria: string;
  descripcion: string | null;
  activo: boolean;
  imageUrl: string | null;
  producto: { id: number; nombre: string } | null;
  variacionesCount: number;
}

@Component({
  selector: 'app-list-sabores',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    HasPermissionDirective,
  ],
  templateUrl: './list-sabores.component.html',
  styleUrls: ['./list-sabores.component.scss'],
})
export class ListSaboresComponent implements OnInit {
  displayedColumns = ['nombre', 'producto', 'categoria', 'variaciones', 'estado', 'acciones'];

  sabores: SaborRow[] = [];
  pagedSabores: SaborRow[] = [];
  productos: { id: number; nombre: string }[] = [];
  categorias: string[] = [];
  loading = false;

  // Filtros (se aplican con el botón Buscar; sin filtrado en vivo)
  filtroProductoId: number | null = null;
  filtroCategoria: string | null = null;
  filtroEstado: 'todos' | 'activos' | 'inactivos' = 'todos';
  filtroTexto = '';

  // Paginación (client-side)
  pageSize = 10;
  pageIndex = 0;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargarProductos();
    this.buscar();
  }

  private cargarProductos(): void {
    this.repositoryService.getProductosByTipo('ELABORADO_CON_VARIACION').subscribe({
      next: (data) => {
        this.productos = (data || []).map((p: any) => ({ id: p.id, nombre: p.nombre }));
      },
      error: () => { this.productos = []; },
    });
  }

  buscar(): void {
    this.loading = true;
    const filtros = {
      productoId: this.filtroProductoId ?? undefined,
      categoria: this.filtroCategoria || undefined,
      activo: this.filtroEstado === 'todos' ? undefined : this.filtroEstado === 'activos',
      texto: this.filtroTexto.trim() || undefined,
    };
    this.repositoryService.getAllSabores(filtros).subscribe({
      next: (data) => {
        this.sabores = (data || []) as SaborRow[];
        this.actualizarCategorias(this.sabores);
        this.pageIndex = 0;
        this.recomputarPagina();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error cargando sabores:', error);
        this.sabores = [];
        this.pagedSabores = [];
        this.loading = false;
        this.snackBar.open('Error al cargar los sabores', 'Cerrar', { duration: 3000 });
      },
    });
  }

  limpiarFiltros(): void {
    this.filtroProductoId = null;
    this.filtroCategoria = null;
    this.filtroEstado = 'todos';
    this.filtroTexto = '';
    this.buscar();
  }

  private actualizarCategorias(sabores: SaborRow[]): void {
    // Solo poblar la lista de categorías la primera vez (o si está vacía), para
    // que los filtros aplicados no achiquen las opciones disponibles.
    if (this.categorias.length || this.filtroCategoria) return;
    const set = new Set<string>();
    for (const s of sabores) if (s.categoria) set.add(s.categoria);
    this.categorias = Array.from(set).sort();
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.recomputarPagina();
  }

  private recomputarPagina(): void {
    const start = this.pageIndex * this.pageSize;
    this.pagedSabores = this.sabores.slice(start, start + this.pageSize);
  }

  // ===== Acciones =====

  crearSabor(): void {
    const producto = this.productos.find((p) => p.id === this.filtroProductoId);
    if (!producto) {
      this.snackBar.open('Elegí un producto en el filtro para crear un sabor', 'Cerrar', { duration: 4000 });
      return;
    }
    const ref = this.dialog.open(SaborDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      data: { productoId: producto.id, productoNombre: producto.nombre, modo: 'crear' },
    });
    ref.afterClosed().subscribe((result) => {
      if (result && result.action === 'created') {
        this.snackBar.open('Sabor creado', 'Cerrar', { duration: 3000 });
        this.buscar();
      }
    });
  }

  editarSabor(row: SaborRow): void {
    if (!row.producto) return;
    const ref = this.dialog.open(SaborDialogComponent, {
      width: '600px',
      maxWidth: '95vw',
      disableClose: true,
      data: {
        productoId: row.producto.id,
        productoNombre: row.producto.nombre,
        modo: 'editar',
        sabor: { id: row.id, nombre: row.nombre, categoria: row.categoria, descripcion: row.descripcion, activo: row.activo, imageUrl: row.imageUrl } as any,
      },
    });
    ref.afterClosed().subscribe((result) => {
      if (result && result.action === 'updated') {
        this.snackBar.open('Sabor actualizado', 'Cerrar', { duration: 3000 });
        this.buscar();
      }
    });
  }

  toggleActivo(row: SaborRow): void {
    const nuevo = !row.activo;
    this.repositoryService.updateSabor(row.id, { activo: nuevo } as any).subscribe({
      next: () => {
        row.activo = nuevo;
        this.snackBar.open(`Sabor ${nuevo ? 'activado' : 'desactivado'}`, 'Cerrar', { duration: 2000 });
      },
      error: () => this.snackBar.open('No se pudo cambiar el estado', 'Cerrar', { duration: 3000 }),
    });
  }

  eliminarSabor(row: SaborRow): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '450px',
      data: {
        title: 'Eliminar Sabor',
        message: `¿Eliminar el sabor "${row.nombre}"?`,
        details: ['Se eliminarán también sus variaciones y precios.'],
        confirmText: 'Sí, eliminar',
        cancelText: 'Cancelar',
        dangerous: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (!confirmed) return;
      this.repositoryService.deleteSabor(row.id).subscribe({
        next: () => {
          this.snackBar.open('Sabor eliminado', 'Cerrar', { duration: 3000 });
          this.buscar();
        },
        error: (error) => {
          this.snackBar.open(error?.message || 'No se pudo eliminar el sabor', 'Cerrar', { duration: 5000 });
        },
      });
    });
  }
}
