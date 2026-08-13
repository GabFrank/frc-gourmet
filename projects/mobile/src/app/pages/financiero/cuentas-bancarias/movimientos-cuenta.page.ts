import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { CrearMovimientoBancarioDialogComponent } from './crear-movimiento-bancario-dialog.component';

const TIPO_LABELS: Record<string, string> = {
  ENTRADA_MANUAL: 'Entrada manual',
  SALIDA_MANUAL: 'Salida manual',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  ACREDITACION_POS: 'Acreditación POS',
  CHEQUE_COBRADO: 'Cheque cobrado',
  DEPOSITO: 'Depósito',
  RETIRO: 'Retiro',
  ENTRADA_VARIA: 'Entrada varia',
  GASTO: 'Gasto',
  VALE: 'Vale',
  COBRO_CLIENTE: 'Cobro cliente',
};

const TIPOS_FILTRO = [
  'ENTRADA_MANUAL', 'SALIDA_MANUAL', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO',
  'CHEQUE_COBRADO', 'ACREDITACION_POS', 'DEPOSITO', 'RETIRO', 'ENTRADA_VARIA',
];

interface MovimientoVM {
  id: number;
  tipoLabel: string;
  esIngreso: boolean;
  monto: number;
  fecha: string;
  descripcion?: string;
  numeroComprobante?: string;
  origen?: string;
  responsable?: string;
  anulado: boolean;
}

const PAGE_SIZE = 15;

/**
 * Movimientos de una Cuenta Bancaria (vista unificada del backend). Filtros por
 * tipo e ingreso/egreso, paginado ("Cargar más"). Botón para registrar un
 * movimiento manual (BANCOS_GESTIONAR).
 */
@Component({
  selector: 'app-movimientos-cuenta',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatFormFieldModule, MatSelectModule, MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './movimientos-cuenta.page.html',
  styleUrls: ['./movimientos-cuenta.scss'],
})
export class MovimientosCuentaPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  readonly tiposFiltro = TIPOS_FILTRO;
  readonly tipoLabels = TIPO_LABELS;
  cuentaId = 0;
  titulo = 'Movimientos';
  simbolo = '';
  decimales = 0;
  canEdit = false;

  readonly filtroTipo = new FormControl<string | null>(null);
  readonly filtroSigno = new FormControl<'TODOS' | 'INGRESO' | 'EGRESO'>('TODOS', { nonNullable: true });

  movimientos: MovimientoVM[] = [];
  total = 0;
  page = 0;
  loading = true;
  loadingMov = false;
  error: string | null = null;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canEdit = this.perm.has('BANCOS_GESTIONAR')));
    this.cuentaId = Number(this.route.snapshot.paramMap.get('id'));
    firstValueFrom(this.repo.getCuentaBancaria(this.cuentaId))
      .then((c: any) => {
        if (c) {
          this.titulo = c.nombre || `Cuenta #${this.cuentaId}`;
          this.simbolo = c.moneda?.simbolo || '';
          this.decimales = c.moneda?.decimales ?? 0;
        }
        this.loading = false;
        this.recargar();
      })
      .catch(() => {
        this.error = 'No se pudo cargar la cuenta';
        this.loading = false;
      });
  }

  recargar(): void {
    this.page = 0;
    this.movimientos = [];
    this.cargar();
  }

  private cargar(): void {
    this.loadingMov = true;
    const signo = this.filtroSigno.value;
    const filtros: any = {
      page: this.page,
      pageSize: PAGE_SIZE,
      tipo: this.filtroTipo.value || undefined,
      esIngreso: signo === 'TODOS' ? undefined : signo === 'INGRESO',
    };
    this.repo.getMovimientosCuentaBancaria(this.cuentaId, filtros).subscribe({
      next: (res: any) => {
        const items = (res?.items || []) as any[];
        this.total = res?.total ?? items.length;
        this.movimientos = [...this.movimientos, ...items.map((m) => this.toVM(m))];
        this.loadingMov = false;
      },
      error: () => {
        this.loadingMov = false;
        this.snack.open('No se pudieron cargar los movimientos', 'OK', { duration: 3000 });
      },
    });
  }

  cargarMas(): void {
    this.page++;
    this.cargar();
  }

  get hayMas(): boolean {
    return this.movimientos.length < this.total;
  }

  private toVM(m: any): MovimientoVM {
    const tipo = (m.tipo || '').toUpperCase();
    return {
      id: m.id,
      tipoLabel: TIPO_LABELS[tipo] || tipo,
      esIngreso: !!m.esIngreso,
      monto: Number(m.monto) || 0,
      fecha: m.fecha,
      descripcion: m.descripcion || undefined,
      numeroComprobante: m.numeroComprobante || undefined,
      origen: m.origen || undefined,
      responsable: m.responsable && m.responsable !== '-' ? m.responsable : undefined,
      anulado: !!m.anulado,
    };
  }

  volver(): void {
    this.location.back();
  }

  async nuevoMovimiento(): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog
        .open(CrearMovimientoBancarioDialogComponent, {
          data: { cuentaBancariaId: this.cuentaId, simbolo: this.simbolo },
          width: '360px',
        })
        .afterClosed(),
    );
    if (ok) {
      this.snack.open('Movimiento registrado', 'OK', { duration: 2500 });
      this.recargar();
    }
  }
}
