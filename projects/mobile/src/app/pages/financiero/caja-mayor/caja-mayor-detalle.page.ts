import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, PermissionService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../core/components/confirm-dialog.component';
import { PromptDialogComponent, PromptData } from '../../../core/components/prompt-dialog.component';

/** Etiquetas legibles por tipo de movimiento. */
const TIPO_LABELS: Record<string, string> = {
  INGRESO_RETIRO_CAJA: 'Retiro de caja',
  INGRESO_CIERRE_CAJA: 'Cierre de caja',
  INGRESO_ENTRADA_VARIA: 'Entrada varia',
  INGRESO_OPERACION_FINANCIERA: 'Operación financiera',
  INGRESO_RETIRO_BANCO: 'Retiro de banco',
  INGRESO_COBRO_CLIENTE: 'Cobro a cliente',
  INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO: 'Cobro cuota préstamo',
  TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
  AJUSTE_POSITIVO: 'Ajuste positivo',
  EGRESO_GASTO: 'Gasto',
  EGRESO_COMPRA: 'Compra',
  EGRESO_CUOTA_COMPRA: 'Cuota de compra',
  EGRESO_CUOTA_PRESTAMO: 'Cuota de préstamo',
  EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO: 'Desembolso préstamo',
  EGRESO_VALE: 'Vale',
  EGRESO_SALARIO: 'Salario',
  EGRESO_CHEQUE: 'Cheque',
  EGRESO_OPERACION_FINANCIERA: 'Operación financiera',
  EGRESO_DEPOSITO_BANCO: 'Depósito a banco',
  EGRESO_CAJA_INICIAL: 'Caja inicial',
  TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
  AJUSTE_NEGATIVO: 'Ajuste negativo',
  ANULACION: 'Anulación',
};

function esIngreso(tipo: string): boolean {
  return tipo.startsWith('INGRESO') || tipo === 'AJUSTE_POSITIVO' || tipo === 'TRANSFERENCIA_ENTRADA';
}

interface SaldoMonedaVM {
  simbolo: string;
  denominacion: string;
  decimales: number;
  total: number;
  detalle: { formaPago: string; monto: number }[];
}

interface CuentaBancariaCardVM {
  id: number;
  titulo: string;       // "BNF · BANCO NACIONAL DE FOMENTO"
  simbolo: string;
  decimales: number;
  saldo: number;
}

interface MovimientoVM {
  id: number;
  tipoLabel: string;
  esIngreso: boolean;
  esAnulacion: boolean;
  anulado: boolean;
  motivoAnulacion?: string;
  simbolo: string;
  decimales: number;
  monto: number;
  fecha: string;
  formaPago?: string;
  responsable?: string;
  observacion?: string;
  gastoId?: number;
  entradaVariaId?: number;
  puedeAnular: boolean;
}

const PAGE_SIZE = 15;

/**
 * Detalle operativo de una Caja Mayor: saldos por moneda/forma de pago,
 * historial de movimientos paginado, y acciones (registrar ingreso/egreso,
 * anular movimiento). Las operaciones de escritura requieren CAJA_MAYOR_OPERAR.
 */
@Component({
  selector: 'app-caja-mayor-detalle',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatProgressBarModule,
    MatSlideToggleModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './caja-mayor-detalle.page.html',
  styleUrls: ['./caja-mayor.scss'],
})
export class CajaMayorDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly perm = inject(PermissionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  id = 0;
  nombre = '';
  abierta = true;
  canOperar = false;

  saldos: SaldoMonedaVM[] = [];
  cuentasBancariasCards: CuentaBancariaCardVM[] = [];
  /** ids de formas de pago visibles según la config de la caja. null = mostrar todas (no hay config). */
  private formaPagoVisibleIds: Set<number> | null = null;
  movimientos: MovimientoVM[] = [];
  total = 0;
  page = 0;

  readonly verAnulaciones = new FormControl(false, { nonNullable: true });

  loading = true;
  loadingMov = false;
  error: string | null = null;

  ngOnInit(): void {
    this.perm.codigos$.subscribe(() => (this.canOperar = this.perm.has('CAJA_MAYOR_OPERAR')));
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    this.repo.getCajaMayor(this.id).subscribe({
      next: (c: any) => {
        if (c) {
          this.nombre = c.nombre || `Caja Mayor #${this.id}`;
          this.abierta = (c.estado || '').toUpperCase().includes('ABIERT');
        }
        // Cargamos primero la config (filtra FPs/CBs visibles), después los
        // saldos y las cuentas en función de ella.
        this.cargarConfigYSaldos();
        this.recargarMovimientos();
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la caja mayor';
        this.loading = false;
      },
    });
  }

  /**
   * Replica el modelo del escritorio: el "saldo en caja" solo muestra las
   * formas de pago que la configuración haya marcado (típicamente EFECTIVO);
   * las cuentas bancarias visibles salen en cards aparte (saldo independiente
   * en `cuenta_bancaria.saldo`, NO mezclado con los buckets del caja mayor).
   * Si la caja no tiene configuración, fallback al comportamiento legacy: se
   * muestran TODAS las FPs como saldos y no se muestran cuentas bancarias.
   */
  private cargarConfigYSaldos(): void {
    this.repo.getCajaMayorConfiguracion(this.id).subscribe({
      next: (cfg: any) => this.aplicarConfig(cfg),
      error: () => this.aplicarConfig(null),
    });
  }

  private aplicarConfig(cfg: any): void {
    const fps = cfg?.formasPagoVisibles || [];
    this.formaPagoVisibleIds = cfg ? new Set<number>(fps.map((f: any) => f.id)) : null;

    // Cargar saldos crudos y filtrar según la config.
    this.repo.getCajaMayorSaldos(this.id).subscribe({
      next: (data: any[]) => (this.saldos = this.agruparSaldos(data || [])),
      error: () => (this.saldos = []),
    });

    // Cargar cuentas bancarias visibles (saldo en vivo desde cuentas_bancarias).
    const visibles: any[] = cfg?.cuentasBancariasVisibles || [];
    if (!visibles.length) {
      this.cuentasBancariasCards = [];
      return;
    }
    const idsVisibles = new Set<number>(visibles.map((c: any) => c.id));
    this.repo.getCuentasBancarias().subscribe({
      next: (cuentas: any[]) => {
        this.cuentasBancariasCards = (cuentas || [])
          .filter((c: any) => idsVisibles.has(c.id))
          .map((c: any) => ({
            id: c.id,
            titulo: `${c.banco ? c.banco + ' · ' : ''}${c.nombre}`,
            simbolo: c.moneda?.simbolo || '',
            decimales: c.moneda?.decimales ?? 0,
            saldo: Number(c.saldo) || 0,
          }));
      },
      error: () => (this.cuentasBancariasCards = []),
    });
  }

  private agruparSaldos(rows: any[]): SaldoMonedaVM[] {
    const map = new Map<number, SaldoMonedaVM>();
    for (const s of rows) {
      const m = s.moneda;
      if (!m) continue;
      const fpId = s.formaPago?.id;
      // Respetar la config: si hay lista de FPs visibles, ocultar los demás
      // (los buckets no visibles existen internamente pero no son "saldo en caja"
      // operativamente — el resto vive en cuentas bancarias).
      if (this.formaPagoVisibleIds && fpId != null && !this.formaPagoVisibleIds.has(fpId)) continue;
      const vm: SaldoMonedaVM = map.get(m.id) ?? {
        simbolo: m.simbolo || '',
        denominacion: m.denominacion || '',
        decimales: m.decimales ?? 0,
        total: 0,
        detalle: [],
      };
      const monto = Number(s.saldo) || 0;
      vm.total += monto;
      vm.detalle.push({ formaPago: s.formaPago?.nombre || '—', monto });
      map.set(m.id, vm);
    }
    return [...map.values()];
  }

  recargarMovimientos(): void {
    this.page = 0;
    this.movimientos = [];
    this.cargarMovimientos();
  }

  private cargarMovimientos(): void {
    this.loadingMov = true;
    const filtros = {
      pageSize: PAGE_SIZE,
      page: this.page,
      incluirAnulaciones: this.verAnulaciones.value,
    };
    this.repo.getCajaMayorMovimientos(this.id, filtros).subscribe({
      next: (res: any) => {
        const items = (res?.items || []) as any[];
        this.total = res?.total ?? items.length;
        this.movimientos = [...this.movimientos, ...items.map((m) => this.toMovVM(m))];
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
    this.cargarMovimientos();
  }

  get hayMas(): boolean {
    return this.movimientos.length < this.total;
  }

  private toMovVM(m: any): MovimientoVM {
    const tipo = (m.tipoMovimiento || '').toUpperCase();
    const esAnulacion = tipo === 'ANULACION';
    const anulado = !!m.anulacion;
    return {
      id: m.id,
      tipoLabel: TIPO_LABELS[tipo] || tipo,
      esIngreso: esIngreso(tipo),
      esAnulacion,
      anulado,
      motivoAnulacion: m.anulacion?.motivo || undefined,
      simbolo: m.moneda?.simbolo || '',
      decimales: m.moneda?.decimales ?? 0,
      monto: Number(m.monto) || 0,
      fecha: m.fecha,
      formaPago: m.formaPago?.nombre || undefined,
      responsable: m.responsable?.persona?.nombre || m.responsable?.nickname || undefined,
      observacion: m.observacion || undefined,
      gastoId: m.gasto?.id || undefined,
      entradaVariaId: m.entradaVariaId || undefined,
      puedeAnular: !esAnulacion && !anulado,
    };
  }

  // --- Navegación a operaciones (páginas full-screen) ---
  registrarGasto(): void {
    this.router.navigate(['/financiero/caja-mayor', this.id, 'gasto']);
  }
  registrarEntradaVaria(): void {
    this.router.navigate(['/financiero/caja-mayor', this.id, 'entrada-varia']);
  }
  ajuste(signo: 'ingreso' | 'egreso'): void {
    this.router.navigate(['/financiero/caja-mayor', this.id, 'ajuste', signo]);
  }

  volver(): void {
    this.location.back();
  }

  async anular(mov: MovimientoVM): Promise<void> {
    const motivo = await firstValueFrom(
      this.dialog
        .open(PromptDialogComponent, {
          data: {
            title: 'Anular movimiento',
            message: `${mov.tipoLabel} · ${mov.simbolo} ${mov.monto.toLocaleString()}`,
            label: 'Motivo de la anulación',
            confirmText: 'Anular',
            danger: true,
          } as PromptData,
          width: '340px',
        })
        .afterClosed(),
    );
    if (!motivo) return;

    // Enrutar la anulación al módulo de origen (revierte estados cruzados).
    const op$ = mov.gastoId
      ? this.repo.anularGasto(mov.gastoId, motivo)
      : mov.entradaVariaId
        ? this.repo.anularEntradaVaria(mov.entradaVariaId, motivo)
        : this.repo.anularCajaMayorMovimiento(mov.id, motivo);

    try {
      await firstValueFrom(op$);
      this.snack.open('Movimiento anulado', 'OK', { duration: 2500 });
      // Refrescar tanto saldos de caja como cards de cuentas bancarias
      // (la anulación bancaria revierte cb.saldo).
      this.cargarConfigYSaldos();
      this.recargarMovimientos();
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw)
        ? 'Sin permiso para anular'
        : raw.replace(/^Error:\s*/, '') || 'No se pudo anular';
      this.snack.open(msg, 'OK', { duration: 5000 });
    }
  }
}
