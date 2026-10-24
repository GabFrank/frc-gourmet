import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import {
  DR_MOBILE_STYLES, DrFuncionarioVM, drCall, drCargarFuncionarios, drFechaIso, drFiltrar, drMensajeError,
} from '../dr-mobile.utils';

interface TipoErrorVM {
  id: number;
  nombre: string;
  descripcion?: string;
  gravedad: string;
  puntos: number;
  color?: string | null;
}

/**
 * M2 — Registrar error en «3 toques» (PWA): tipo de error (botones grandes) → funcionario(s) →
 * confirmar. Los puntos salen de la gravedad vigente del tipo (los define el backend).
 */
@Component({
  selector: 'app-registrar-error',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule,
    MatProgressBarModule, MatProgressSpinnerModule, MatSnackBarModule,
  ],
  templateUrl: './registrar-error.page.html',
  styles: [
    DR_MOBILE_STYLES,
    `
      .re-puntos { font-size: 0.75rem; font-weight: 700; color: var(--error-color); }
      .re-grav { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 4px; vertical-align: middle; }
      .re-resumen { display: flex; flex-direction: column; gap: 6px; }
      .re-resumen strong { color: var(--text-primary); }
      .re-link { background: none; border: 0; color: var(--primary-color); font: inherit; font-size: 0.8rem; cursor: pointer; padding: 4px; }
    `,
  ],
})
export class RegistrarErrorPage implements OnInit {
  private readonly snack = inject(MatSnackBar);

  loading = true;
  error: string | null = null;
  guardando = false;
  paso: 1 | 2 | 3 = 1;

  tipos: TipoErrorVM[] = [];
  tipo: TipoErrorVM | null = null;
  private funcionarios: DrFuncionarioVM[] = [];
  visibles: DrFuncionarioVM[] = [];
  seleccion = new Set<number>();

  readonly busqueda = new FormControl('', { nonNullable: true });
  readonly fecha = new FormControl(drFechaIso(new Date())!, { nonNullable: true });
  readonly detalle = new FormControl('', { nonNullable: true });

  creados: { nombre: string; puntos: number }[] | null = null;

  async ngOnInit(): Promise<void> {
    this.busqueda.valueChanges.subscribe(() => (this.visibles = drFiltrar(this.funcionarios, this.busqueda.value)));
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const [tipos, funcs] = await Promise.all([drCall('dr-get-tipos-error', {}), drCargarFuncionarios()]);
      this.tipos = ((tipos ?? []) as any[])
        .filter((t) => t?.activo !== false)
        .sort((a, b) => (Number(a.orden) || 0) - (Number(b.orden) || 0) || String(a.nombre).localeCompare(String(b.nombre)))
        .map((t) => ({
          id: t.id,
          nombre: t.nombre,
          descripcion: t.descripcion ?? undefined,
          gravedad: t.gravedad?.nombre ?? '',
          puntos: Number(t.gravedad?.puntos) || 0,
          color: t.gravedad?.color ?? null,
        }));
      this.funcionarios = funcs;
      this.visibles = drFiltrar(funcs, this.busqueda.value);
    } catch (e) {
      this.error = drMensajeError(e);
    } finally {
      this.loading = false;
    }
  }

  elegirTipo(t: TipoErrorVM): void {
    this.tipo = t;
    this.paso = 2;
  }

  toggle(f: DrFuncionarioVM): void {
    if (this.seleccion.has(f.id)) this.seleccion.delete(f.id);
    else this.seleccion.add(f.id);
  }

  get seleccionados(): DrFuncionarioVM[] {
    return this.funcionarios.filter((f) => this.seleccion.has(f.id));
  }

  irAConfirmar(): void {
    if (this.seleccion.size) this.paso = 3;
  }

  volver(): void {
    if (this.paso > 1) this.paso = (this.paso - 1) as 1 | 2;
  }

  async confirmar(): Promise<void> {
    if (!this.tipo || !this.seleccion.size || !this.fecha.value || this.guardando) return;
    this.guardando = true;
    try {
      const r: any[] = (await drCall('dr-registrar-error', {
        fecha: this.fecha.value,
        tipoErrorId: this.tipo.id,
        funcionarioIds: [...this.seleccion],
        detalle: this.detalle.value.trim() ? this.detalle.value.trim().toUpperCase() : undefined,
      })) ?? [];
      this.creados = r.map((c) => ({
        nombre: this.funcionarios.find((f) => f.id === c.funcionarioId)?.nombre ?? `#${c.funcionarioId}`,
        puntos: Number(c.puntos) || 0,
      }));
      const pts = this.creados[0]?.puntos ?? this.tipo.puntos;
      this.snack.open(`Error registrado: ${this.creados.length} funcionario${this.creados.length === 1 ? '' : 's'}, −${pts} pts c/u`, 'OK', { duration: 3500 });
    } catch (e) {
      this.snack.open(drMensajeError(e), 'OK', { duration: 5000 });
    } finally {
      this.guardando = false;
    }
  }

  nuevo(): void {
    this.creados = null;
    this.tipo = null;
    this.seleccion.clear();
    this.detalle.setValue('');
    this.busqueda.setValue('');
    this.paso = 1;
  }
}
