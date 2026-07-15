import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';
import { ConfirmarValeDialogComponent, ConfirmarValeResult } from './confirmar-vale-dialog.component';

interface ValeVM {
  id: number;
  funcionario: string;
  motivo?: string;
  descripcion?: string;
  fecha: string;
  simbolo: string;
  monto: number;
  estado: string;
  estadoClase: string;
  esAdelanto: boolean;
  puedeConfirmar: boolean;
  puedeAnular: boolean;
  raw: any;
}

const ESTADO_CLASE: Record<string, string> = {
  SOLICITADO: 'sol',
  CONFIRMADO: 'conf',
  DESCONTADO: 'desc',
  ANULADO: 'anul',
};

const ESTADO_FILTROS = ['TODOS', 'SOLICITADO', 'CONFIRMADO', 'DESCONTADO', 'ANULADO'];

/**
 * Gestión de vales (PWA): lista con filtro por estado + búsqueda por funcionario,
 * confirmar los SOLICITADO (→ CONFIRMADO, egresa de caja) y anular. Las acciones
 * de escritura requieren RRHH_VALE_CONFIRMAR. La creación de vales confirmados se
 * hace desde Caja Mayor.
 */
@Component({
  selector: 'app-vales-list',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatMenuModule, MatFormFieldModule, MatInputModule, MatChipsModule, MatProgressBarModule,
    MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './vales-list.page.html',
  styles: [
    `
      .vl-estados {
        display: flex;
        gap: 8px;
        overflow-x: auto;
        padding: 4px 0 12px;
      }
      .vl-estado-chip {
        flex: 0 0 auto;
        border: 1px solid var(--border-color);
        background: transparent;
        color: var(--text-secondary);
        border-radius: 999px;
        padding: 6px 14px;
        font-size: 0.8rem;
        font-weight: 600;
        cursor: pointer;
      }
      .vl-estado-chip.active {
        background: color-mix(in srgb, var(--info-color) 22%, transparent);
        border-color: var(--info-color);
        color: var(--info-color);
      }
      .vl-row2 {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
        margin: 2px 0;
      }
      .vl-monto {
        font-weight: 700;
        color: var(--text-primary);
      }
      .vl-tag {
        font-size: 0.68rem;
        font-weight: 600;
        padding: 1px 7px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .vl-motivo {
        font-size: 0.8rem;
        color: var(--text-secondary);
      }
      .crud-chip.sol {
        background: color-mix(in srgb, var(--warning-color) 16%, transparent);
        color: var(--warning-color);
      }
      .crud-chip.conf {
        background: color-mix(in srgb, var(--success-color) 16%, transparent);
        color: var(--success-color);
      }
      .crud-chip.desc {
        background: color-mix(in srgb, var(--info-color) 16%, transparent);
        color: var(--info-color);
      }
      .crud-chip.anul {
        background: color-mix(in srgb, var(--error-color) 16%, transparent);
        color: var(--error-color);
      }
    `,
  ],
})
export class ValesListPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly estados = ESTADO_FILTROS;
  estadoActivo = 'TODOS';
  readonly busqueda = new FormControl('', { nonNullable: true });

  private todos: ValeVM[] = [];
  items: ValeVM[] = [];
  loading = true;
  error: string | null = null;
  canConfirmar = false;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canConfirmar = this.perm.has('RRHH_VALE_CONFIRMAR')));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    const filtros = this.estadoActivo === 'TODOS' ? {} : { estado: this.estadoActivo };
    this.repo.getVales(filtros).subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.items || data?.data || [];
        this.todos = arr.map((v) => this.toVM(v));
        this.aplicarFiltro();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los vales';
        this.loading = false;
      },
    });
  }

  filtrarEstado(estado: string): void {
    if (this.estadoActivo === estado) return;
    this.estadoActivo = estado;
    this.cargar();
  }

  aplicarFiltro(): void {
    const q = this.busqueda.value.trim().toLowerCase();
    this.items = q ? this.todos.filter((v) => v.funcionario.toLowerCase().includes(q)) : [...this.todos];
  }

  limpiarBusqueda(): void {
    this.busqueda.setValue('');
    this.aplicarFiltro();
  }

  private toVM(v: any): ValeVM {
    const estado = (v.estado || '').toUpperCase();
    const p = v.funcionario?.persona;
    return {
      id: v.id,
      funcionario: p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : `Funcionario #${v.funcionario?.id ?? ''}`,
      motivo: v.motivo?.nombre || undefined,
      descripcion: v.descripcion || undefined,
      fecha: v.fecha,
      simbolo: v.moneda?.simbolo || '',
      monto: Number(v.monto) || 0,
      estado,
      estadoClase: ESTADO_CLASE[estado] || 'off',
      esAdelanto: !!v.esAdelanto,
      puedeConfirmar: estado === 'SOLICITADO',
      puedeAnular: estado === 'SOLICITADO' || estado === 'CONFIRMADO',
      raw: v,
    };
  }

  async confirmar(v: ValeVM): Promise<void> {
    const result = await firstValueFrom(
      this.dialog
        .open(ConfirmarValeDialogComponent, { data: { vale: v.raw }, width: '360px' })
        .afterClosed(),
    ) as ConfirmarValeResult | undefined;
    if (!result) return;
    try {
      await firstValueFrom(this.repo.confirmarVale(v.id, result));
      this.snack.open('Vale confirmado', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e) {
      this.snack.open(this.msgError(e, 'No se pudo confirmar'), 'OK', { duration: 4000 });
    }
  }

  async anular(v: ValeVM): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular vale',
            message: `${v.funcionario} · ${v.simbolo} ${v.monto.toLocaleString()}`,
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
      await firstValueFrom(this.repo.anularVale(v.id, motivo));
      this.snack.open('Vale anulado', 'OK', { duration: 2500 });
      this.cargar();
    } catch (e) {
      this.snack.open(this.msgError(e, 'No se pudo anular'), 'OK', { duration: 4000 });
    }
  }

  private msgError(e: unknown, fallback: string): string {
    const raw = String((e as Error)?.message || '');
    if (/PERMISO/.test(raw)) return 'Sin permiso';
    return raw.replace(/^Error:\s*/, '') || fallback;
  }
}
