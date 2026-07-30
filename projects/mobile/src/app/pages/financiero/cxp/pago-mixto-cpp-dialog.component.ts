import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

export interface PagoMixtoCppData {
  cuotaId: number;
  titulo: string;
  /** Saldo pendiente en la moneda del CPP. */
  saldo: number;
  /** Moneda del CPP (destino de la conversión). */
  monedaId: number;
  simbolo: string;
  decimales: number;
}

interface Opcion { id: number; label: string; }

interface LineaVM {
  monedaId: number | null;
  formaPagoId: number | null;
  monto: number | null;
  convertido: number | null;
}

/**
 * Pago MIXTO de una cuota de CPP (compra): N líneas (moneda + forma + monto)
 * desde la Caja Mayor, cada una convertida a la moneda de la deuda vía
 * MonedaCambio.compraLocal. Reusa la misma regla de conversión que el desktop.
 * Requiere COMPRAS_GESTIONAR. Devuelve `true` si se pagó.
 */
@Component({
  selector: 'app-pago-mixto-cpp-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './pago-mixto-cpp-dialog.component.html',
  styleUrls: ['./pago-mixto-cpp-dialog.component.scss'],
})
export class PagoMixtoCppDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly snack = inject(MatSnackBar);

  monedas: Opcion[] = [];
  formas: Opcion[] = [];
  cajas: Opcion[] = [];
  private cambios: any[] = [];
  private efectivoFormaId: number | null = null;

  cajaMayorId: number | null = null;
  observacion = '';
  lineas: LineaVM[] = [];

  totalConvertido = 0;
  restante = 0;
  hayLineaSinCotizacion = false;
  valido = false;

  loading = true;
  saving = false;

  constructor(
    public ref: MatDialogRef<PagoMixtoCppDialogComponent, boolean>,
    @Inject(MAT_DIALOG_DATA) public data: PagoMixtoCppData,
  ) {}

  ngOnInit(): void {
    Promise.all([
      firstValueFrom(this.repo.getMonedas()),
      firstValueFrom(this.repo.getFormasPago()),
      firstValueFrom(this.repo.getCajasMayor()),
      firstValueFrom(this.repo.getMonedasCambio()),
    ])
      .then(([monedas, formas, cajas, cambios]: [any[], any[], any[], any[]]) => {
        this.monedas = (monedas || []).filter((m) => m.activo !== false).map((m) => ({ id: m.id, label: `${m.simbolo} · ${m.denominacion}` }));
        const formasCaja = (formas || []).filter((f) => f.movimentaCaja);
        this.formas = formasCaja.map((f) => ({ id: f.id, label: f.nombre }));
        const efectivo = formasCaja.find((f) => (f.nombre || '').toUpperCase().includes('EFECTIVO')) || formasCaja[0];
        this.efectivoFormaId = efectivo?.id ?? null;
        this.cajas = (cajas || [])
          .filter((c) => (c.estado || '').toUpperCase().includes('ABIERT'))
          .map((c) => ({ id: c.id, label: c.nombre || `Caja Mayor #${c.id}` }));
        this.cambios = cambios || [];
        if (this.cajas.length === 1) this.cajaMayorId = this.cajas[0].id;
        // Primera línea: moneda de la deuda + efectivo + saldo completo.
        this.lineas = [{ monedaId: this.data.monedaId, formaPagoId: this.efectivoFormaId, monto: this.data.saldo, convertido: null }];
        this.recompute();
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudieron cargar los datos', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  /** Cotización (compraLocal) de `origenId` → moneda del CPP. 1 si igual; null si falta. */
  cotizacionA(origenId: number | null): number | null {
    if (origenId == null) return null;
    if (origenId === this.data.monedaId) return 1;
    const cambio = this.cambios.find((c) =>
      c?.monedaOrigen?.id === origenId && c?.monedaDestino?.id === this.data.monedaId && c?.activo !== false);
    const tasa = cambio ? Number(cambio.compraLocal) : 0;
    return tasa > 0 ? tasa : null;
  }

  recompute(): void {
    let total = 0;
    let faltaCotiz = false;
    for (const l of this.lineas) {
      const tasa = this.cotizacionA(l.monedaId);
      const monto = Number(l.monto) || 0;
      if (tasa == null) {
        l.convertido = null;
        if (monto > 0) faltaCotiz = true;
      } else {
        l.convertido = +(monto * tasa).toFixed(2);
        total += l.convertido;
      }
    }
    this.totalConvertido = +total.toFixed(2);
    this.restante = +(Number(this.data.saldo) - this.totalConvertido).toFixed(2);
    this.hayLineaSinCotizacion = faltaCotiz;
    this.valido = this.calcularValido();
  }

  private calcularValido(): boolean {
    if (!this.cajaMayorId || !this.lineas.length || this.hayLineaSinCotizacion) return false;
    for (const l of this.lineas) {
      if (l.monedaId == null || l.formaPagoId == null || !(Number(l.monto) > 0)) return false;
    }
    if (this.totalConvertido <= 0) return false;
    if (this.totalConvertido > Number(this.data.saldo) + 0.005) return false;
    return true;
  }

  agregarLinea(): void {
    this.lineas.push({
      monedaId: this.data.monedaId,
      formaPagoId: this.efectivoFormaId,
      monto: Math.max(0, this.restante),
      convertido: null,
    });
    this.recompute();
  }

  quitarLinea(i: number): void {
    this.lineas.splice(i, 1);
    this.recompute();
  }

  construirLineas(): any[] {
    return this.lineas.map((l) => ({
      monedaId: l.monedaId,
      formaPagoId: l.formaPagoId,
      monto: +Number(l.monto).toFixed(2),
      cotizacion: this.cotizacionA(l.monedaId),
      fuente: 'CAJA_MAYOR',
      cajaMayorId: this.cajaMayorId,
    }));
  }

  async confirmar(): Promise<void> {
    this.recompute();
    if (!this.valido || this.saving) return;
    this.saving = true;
    try {
      await firstValueFrom(this.repo.pagarCppCuotaMixto({
        cuotaId: this.data.cuotaId,
        lineas: this.construirLineas(),
        observacion: this.observacion ? this.observacion.toUpperCase() : undefined,
      }));
      this.snack.open('Pago mixto registrado', 'OK', { duration: 2500 });
      this.ref.close(true);
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      this.snack.open(/PERMISO/.test(raw) ? 'Sin permiso' : raw.replace(/^Error:\s*/, '') || 'No se pudo registrar el pago', 'OK', { duration: 4000 });
      this.saving = false;
    }
  }
}
