import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';

interface ConfigVM {
  id: number;
  clave: string;
  valor: string;
  tipo: string; // NUMBER | STRING | BOOLEAN | DATE
  descripcion?: string;
}

/**
 * Configuración RRHH en la PWA: lista todas las claves (ConfiguracionRrhh) con el
 * control adecuado según el tipo y guarda cada valor. Equivale al CRUD del desktop
 * (edición de valores). Permiso: RRHH_CONFIG_EDITAR.
 */
@Component({
  selector: 'app-configuracion-rrhh',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatFormFieldModule, MatInputModule, MatSlideToggleModule,
    MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './configuracion-rrhh.page.html',
  styleUrls: ['./configuracion-rrhh.page.scss'],
})
export class ConfiguracionRrhhPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly snack = inject(MatSnackBar);

  readonly busqueda = new FormControl('', { nonNullable: true });
  private todos: ConfigVM[] = [];
  items: ConfigVM[] = [];
  original: Record<number, string> = {};
  editado: Record<number, string> = {};
  guardando: Record<number, boolean> = {};
  loading = true;
  canEdit = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('RRHH_CONFIG_EDITAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.repo.getConfiguracionesRrhh().subscribe({
      next: (data) => {
        this.todos = ((data || []) as ConfigVM[]).sort((a, b) => a.clave.localeCompare(b.clave));
        for (const c of this.todos) {
          this.original[c.id] = c.valor;
          this.editado[c.id] = c.valor;
        }
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.snack.open('No se pudo cargar la configuración', 'OK', { duration: 3000 });
        this.loading = false;
      },
    });
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q
      ? this.todos.filter((c) => c.clave.toLowerCase().includes(q) || (c.descripcion || '').toLowerCase().includes(q))
      : [...this.todos];
  }

  limpiarFiltro(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  setBool(id: number, checked: boolean): void {
    this.editado[id] = checked ? 'true' : 'false';
  }

  async guardar(item: ConfigVM): Promise<void> {
    const valor = (this.editado[item.id] ?? '').toString();
    this.guardando[item.id] = true;
    try {
      await firstValueFrom(this.repo.updateConfiguracionRrhh(item.id, { valor }));
      this.original[item.id] = valor;
      this.snack.open(`${item.clave} guardado`, 'OK', { duration: 2000 });
    } catch (e: any) {
      this.snack.open(/PERMISO/i.test(String(e?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
    } finally {
      this.guardando[item.id] = false;
    }
  }
}
