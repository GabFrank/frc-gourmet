import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';

interface Opcion {
  id: number;
  label: string;
}

interface GastoVM {
  id: number;
  descripcion: string;
  categoria: string;
  simbolo: string;
  decimales: number;
  monto: number;
  fecha: string;
  estado: string;
  estadoClase: string;
  esCaja: boolean;
  recurrente: boolean;
}

const ESTADO_CLASE: Record<string, string> = {
  PAGADO: 'ok',
  PROGRAMADO: 'info',
  PENDIENTE: 'warn',
  CANCELADO: 'anul',
};

const ESTADOS = ['PAGADO', 'PROGRAMADO', 'PENDIENTE', 'CANCELADO'];

/**
 * Lista de Gastos (Financiero) con filtros por fecha, categoría y estado.
 * Acciones: editar (solo gastos de caja mayor de una línea) y anular. La alta se
 * hace desde Caja Mayor o con el FAB. Escritura requiere CAJA_MAYOR_OPERAR.
 */
@Component({
  selector: 'app-gastos-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, ReactiveFormsModule, MatCardModule, MatIconModule,
    MatButtonModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './gastos-list.page.html',
  styles: [
    `
      .gl-chip.info {
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .gl-chip.anul {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
      }
      .gl-filtros {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 16px 0;
      }
      .gl-filtros mat-form-field {
        flex: 1 1 140px;
      }
      .gl-monto {
        font-weight: 700;
        color: var(--text-primary);
      }
    `,
  ],
})
export class GastosListPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly estados = ESTADOS;
  categorias: Opcion[] = [];
  items: GastoVM[] = [];
  loading = true;
  error: string | null = null;
  canOperar = false;

  readonly filtros = this.fb.nonNullable.group({
    fechaDesde: [''],
    fechaHasta: [''],
    gastoCategoriaId: [null as number | null],
    estado: [null as string | null],
  });

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canOperar = this.perm.has('CAJA_MAYOR_OPERAR')));
    firstValueFrom(this.repo.getGastoCategorias())
      .then((cats: any[]) => {
        this.categorias = (cats || []).map((c) => ({ id: c.id, label: c.nombre }));
      })
      .catch(() => undefined);
    this.buscar();
  }

  buscar(): void {
    this.loading = true;
    this.error = null;
    const v = this.filtros.getRawValue();
    const filtros: any = {
      fechaDesde: v.fechaDesde || undefined,
      fechaHasta: v.fechaHasta || undefined,
      gastoCategoriaId: v.gastoCategoriaId || undefined,
      estado: v.estado || undefined,
    };
    this.repo.getGastos(filtros).subscribe({
      next: (data: any[]) => {
        this.items = (data || []).map((g) => this.toVM(g));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los gastos';
        this.loading = false;
      },
    });
  }

  limpiar(): void {
    this.filtros.reset({ fechaDesde: '', fechaHasta: '', gastoCategoriaId: null, estado: null });
    this.buscar();
  }

  private toVM(g: any): GastoVM {
    const estado = (g.estado || '').toUpperCase();
    const destino = (g.destinoTipo || 'CAJA_MAYOR').toUpperCase();
    return {
      id: g.id,
      descripcion: g.descripcion || '',
      categoria: g.gastoCategoria?.nombre || '',
      simbolo: g.moneda?.simbolo || '',
      decimales: g.moneda?.decimales ?? 0,
      monto: Number(g.monto) || 0,
      fecha: g.fecha,
      estado,
      estadoClase: ESTADO_CLASE[estado] || 'off',
      esCaja: destino !== 'CUENTA_BANCARIA',
      recurrente: !!g.esRecurrente,
    };
  }

  async anular(g: GastoVM): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular gasto',
            message: `${g.descripcion} · ${g.simbolo} ${g.monto.toLocaleString()}`,
            label: 'Motivo de la anulación',
            confirmText: 'Anular',
            danger: true,
          } as PromptData,
          width: '340px',
        })
        .afterClosed(),
    );
    if (!motivo) return;
    try {
      await firstValueFrom(this.repo.anularGasto(g.id, motivo));
      this.snack.open('Gasto anulado', 'OK', { duration: 2500 });
      this.buscar();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo anular', 'OK', { duration: 4000 });
    }
  }
}
