import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../core/components/confirm-dialog.component';

interface ProveedorVM {
  id: number;
  nombre: string;
  razon_social?: string;
  ruc?: string;
  telefono?: string;
  activo: boolean;
}

/** Lista de Proveedores con alta/edición/baja (PROVEEDORES_GESTIONAR). */
@Component({
  selector: 'app-proveedores-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatMenuModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './proveedores-list.page.html',
})
export class ProveedoresListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: ProveedorVM[] = [];
  items: ProveedorVM[] = [];
  loading = true;
  error: string | null = null;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('PROVEEDORES_GESTIONAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
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

  async eliminar(p: ProveedorVM): Promise<void> {
    const data: ConfirmData = {
      title: 'Eliminar proveedor',
      message: `¿Eliminar "${p.nombre}"? Si tiene compras asociadas, desactivalo en su lugar.`,
      confirmText: 'Eliminar',
      danger: true,
    };
    const ok = await firstValueFrom(this.dialog.open(ConfirmDialogComponent, { data, width: '320px' }).afterClosed());
    if (!ok) return;
    this.repo.deleteProveedor(p.id).subscribe({
      next: () => {
        this.snack.open('Proveedor eliminado', 'OK', { duration: 2500 });
        this.cargar();
      },
      error: (e) => {
        const raw = String(e?.message || '');
        this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo eliminar', 'OK', { duration: 4000 });
      },
    });
  }
}
