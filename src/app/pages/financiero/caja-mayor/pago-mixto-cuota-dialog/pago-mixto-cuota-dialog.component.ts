import { Component, Inject, OnInit, Optional } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';

/** Cuota que se va a pagar de forma mixta (varias formas/monedas). */
export interface CuotaParaPagoMixto {
  id: number;
  numero?: number;
  /** Saldo pendiente en la moneda del CPP. */
  saldoPendiente: number;
  /** Moneda de la deuda (CPP). */
  monedaId: number;
  monedaSimbolo?: string;
  monedaDenominacion?: string;
  cppId?: number;
  proveedorNombre?: string;
  compraNumeroNota?: string;
}

interface LineaPago {
  monedaId: number | null;
  formaPagoId: number | null;
  monto: number;
  decimales: number;
}

@Component({
  selector: 'app-pago-mixto-cuota-dialog',
  standalone: true,
  templateUrl: './pago-mixto-cuota-dialog.component.html',
  styleUrls: ['./pago-mixto-cuota-dialog.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    DecimalPipe,
    CurrencyInputDirective,
  ],
})
export class PagoMixtoCuotaDialogComponent implements OnInit {
  readonly displayedColumns = ['moneda', 'forma', 'monto', 'convertido', 'acciones'];

  loading = true;
  saving = false;

  cuota!: CuotaParaPagoMixto;

  monedas: any[] = [];
  formasPago: any[] = [];
  cajasMayor: any[] = [];
  /** Cotizaciones activas: para convertir cada linea a la moneda del CPP. */
  private cambios: any[] = [];

  cajaMayorId: number | null = null;
  observacion = '';
  lineas: LineaPago[] = [];

  constructor(
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() private dialogRef: MatDialogRef<PagoMixtoCuotaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: { cuota: CuotaParaPagoMixto },
  ) {}

  async ngOnInit(): Promise<void> {
    this.cuota = this.data?.cuota;
    await this.loadAll();
  }

  async loadAll(): Promise<void> {
    this.loading = true;
    try {
      const [monedas, formas, cajas, cambios] = await Promise.all([
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getFormasPago()),
        firstValueFrom(this.repo.getCajasMayor()),
        firstValueFrom(this.repo.getMonedasCambio()),
      ]);
      this.monedas = (monedas as any[]) || [];
      this.formasPago = ((formas as any[]) || []).filter((f: any) => f.movimentaCaja);
      this.cajasMayor = ((cajas as any[]) || []).filter((c: any) => c.estado === 'ABIERTA');
      this.cambios = (cambios as any[]) || [];

      // Caja: unica abierta preseleccionada.
      if (this.cajasMayor.length === 1) this.cajaMayorId = this.cajasMayor[0].id;

      // Primera linea: moneda de la deuda + efectivo + saldo completo.
      const efectivo = this.formasPago.find((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO'))
        || preselectSingleOrPrincipal(this.formasPago) || this.formasPago[0];
      this.lineas = [{
        monedaId: this.cuota.monedaId,
        formaPagoId: efectivo?.id ?? null,
        monto: Number(this.cuota.saldoPendiente) || 0,
        decimales: this.decimalesDeMoneda(this.cuota.monedaId),
      }];
    } catch (e: any) {
      console.error('Error cargando datos de pago mixto', e);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  private decimalesDeMoneda(monedaId: number | null): number {
    const m = this.monedas.find((x: any) => x.id === monedaId);
    const dec = Number(m?.decimales);
    return Number.isFinite(dec) ? dec : 0;
  }

  /** Cotizacion (compraLocal) de `origenId` -> moneda del CPP. 1 si igual; null si falta. */
  cotizacionA(origenId: number | null): number | null {
    if (origenId == null) return null;
    const destinoId = this.cuota.monedaId;
    if (origenId === destinoId) return 1;
    const cambio = this.cambios.find((c: any) =>
      c?.monedaOrigen?.id === origenId && c?.monedaDestino?.id === destinoId && c?.activo !== false);
    const tasa = cambio ? Number(cambio.compraLocal) : 0;
    return tasa > 0 ? tasa : null;
  }

  /** Monto de la linea convertido a la moneda del CPP (null si falta cotizacion). */
  convertido(l: LineaPago): number | null {
    const tasa = this.cotizacionA(l.monedaId);
    if (tasa == null) return null;
    return +(Number(l.monto || 0) * tasa).toFixed(2);
  }

  onMonedaChange(l: LineaPago): void {
    l.decimales = this.decimalesDeMoneda(l.monedaId);
  }

  onMontoChange(l: LineaPago, value: any): void {
    const n = Number(value || 0);
    l.monto = isNaN(n) ? 0 : n;
  }

  agregarLinea(): void {
    const efectivo = this.formasPago.find((f: any) => (f.nombre || '').toUpperCase().includes('EFECTIVO')) || this.formasPago[0];
    this.lineas.push({
      monedaId: this.cuota.monedaId,
      formaPagoId: efectivo?.id ?? null,
      monto: Math.max(0, +this.restante.toFixed(2)),
      decimales: this.decimalesDeMoneda(this.cuota.monedaId),
    });
  }

  quitarLinea(i: number): void {
    this.lineas.splice(i, 1);
  }

  get totalConvertido(): number {
    return +this.lineas.reduce((s, l) => s + (this.convertido(l) ?? 0), 0).toFixed(2);
  }

  get restante(): number {
    return +(Number(this.cuota?.saldoPendiente || 0) - this.totalConvertido).toFixed(2);
  }

  get hayLineaSinCotizacion(): boolean {
    return this.lineas.some(l => Number(l.monto) > 0 && this.cotizacionA(l.monedaId) == null);
  }

  isValido(): boolean {
    if (!this.cajaMayorId) return false;
    if (!this.lineas.length) return false;
    if (this.hayLineaSinCotizacion) return false;
    for (const l of this.lineas) {
      if (l.monedaId == null || l.formaPagoId == null) return false;
      if (!(Number(l.monto) > 0)) return false;
    }
    if (this.totalConvertido <= 0) return false;
    if (this.totalConvertido > Number(this.cuota.saldoPendiente) + 0.005) return false;
    return true;
  }

  async confirmar(): Promise<void> {
    if (!this.isValido()) return;

    // Chequeo de saldos negativos por (moneda, forma) en la caja elegida.
    const ok = await this.confirmarSaldosSiNegativos();
    if (!ok) return;

    const lineas = this.lineas.map(l => ({
      monedaId: l.monedaId,
      formaPagoId: l.formaPagoId,
      monto: +Number(l.monto).toFixed(2),
      cotizacion: this.cotizacionA(l.monedaId),
      fuente: 'CAJA_MAYOR',
      cajaMayorId: this.cajaMayorId,
    }));

    this.saving = true;
    try {
      const res: any = await firstValueFrom(this.repo.pagarCppCuotaMixto({
        cuotaId: this.cuota.id,
        lineas,
        observacion: this.observacion,
      }));
      this.snackBar.open(`Pago registrado: ${res?.lineas || lineas.length} linea(s)`, 'Cerrar', { duration: 3500 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      console.error('Error en pago mixto', e);
      const msg = (e?.message || String(e)).replace(/^Error invoking remote method '[^']+': Error: /, '');
      this.snackBar.open(msg, 'Cerrar', { duration: 6000, panelClass: 'error-snackbar' });
    } finally {
      this.saving = false;
    }
  }

  private async confirmarSaldosSiNegativos(): Promise<boolean> {
    const saldos: any[] = await firstValueFrom(this.repo.getCajaMayorSaldos(this.cajaMayorId as number));
    // Agrupar montos por (moneda, forma) para comparar contra el saldo disponible.
    const porClave = new Map<string, { label: string; saldoActual: number; monto: number; monedaSimbolo: string }>();
    for (const l of this.lineas) {
      const key = `${l.monedaId}-${l.formaPagoId}`;
      const moneda = this.monedas.find(m => m.id === l.monedaId);
      const forma = this.formasPago.find(f => f.id === l.formaPagoId);
      const s = (saldos || []).find(x => x.moneda?.id === l.monedaId && x.formaPago?.id === l.formaPagoId);
      const saldoActual = s ? Number(s.saldo) : 0;
      const prev = porClave.get(key);
      const monto = Number(l.monto || 0) + (prev?.monto || 0);
      porClave.set(key, {
        label: `${moneda?.denominacion || ''} / ${forma?.nombre || ''}`,
        saldoActual,
        monto,
        monedaSimbolo: moneda?.simbolo || '',
      });
    }
    return confirmarSaldosNegativos(this.dialog, Array.from(porClave.values()));
  }

  cancelar(): void {
    this.dialogRef?.close(false);
  }
}
