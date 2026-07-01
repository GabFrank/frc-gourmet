import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { AuthService, RepositoryService } from '@frc/shared-core';

function fmt(v: any): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: 2 });
}

interface LineaMonto {
  label: string;
  sub?: string;
  valorFmt: string;
  clase?: 'pos' | 'neg';
}

/**
 * Detalle / resumen de una caja: cajero, estado, terminal, ventas por forma de
 * pago y moneda, conteo de apertura (y cierre + diferencias si está cerrada).
 * Si la caja está abierta y el usuario actual es quien la abrió, ofrece cerrarla.
 */
@Component({
  selector: 'app-caja-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './caja-detalle.page.html',
  styleUrls: ['./cajas.scss'],
})
export class CajaDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  cajaId!: number;
  loading = true;
  error: string | null = null;

  cajero = '';
  terminal = '';
  estado = '';
  estadoClase: 'ok' | 'off' | '' = '';
  aperturaFmt = '';
  cierreFmt = '';
  abierta = false;
  cantidadVentas = 0;

  ventasPorForma: LineaMonto[] = [];
  ventasPorMoneda: LineaMonto[] = [];
  conteoApertura: LineaMonto[] = [];
  conteoCierre: LineaMonto[] = [];
  diferencias: LineaMonto[] = [];

  puedeCerrar = false;
  avisoNoCierre = '';

  async ngOnInit(): Promise<void> {
    this.cajaId = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;
    try {
      const [caja, resumen] = await Promise.all([
        firstValueFrom(this.repo.getCaja(this.cajaId)),
        firstValueFrom(this.repo.getResumenCaja(this.cajaId)),
      ]);
      if (!caja) {
        this.error = 'Caja no encontrada';
        return;
      }
      const abridor: any = caja.createdBy;
      this.cajero = (abridor?.persona?.nombre || abridor?.nickname || 'SIN USUARIO').toUpperCase();
      this.terminal = String(caja.dispositivo?.nombre || `Terminal #${caja.dispositivo?.id ?? ''}`).toUpperCase();
      this.estado = String(caja.estado || '').toUpperCase();
      this.abierta = this.estado === 'ABIERTO';
      this.estadoClase = this.abierta ? 'ok' : 'off';
      this.aperturaFmt = caja.fechaApertura ? new Date(caja.fechaApertura).toLocaleString('es-PY') : '';
      this.cierreFmt = caja.fechaCierre ? new Date(caja.fechaCierre).toLocaleString('es-PY') : '';

      const r: any = resumen || {};
      this.cantidadVentas = Number(r.cantidadVentas || 0);
      this.ventasPorForma = (r.ventasPorFormaPago || []).map((x: any) => ({
        label: String(x.formaPago || 'SIN FORMA').toUpperCase(),
        sub: x.monedaSimbolo,
        valorFmt: `${fmt(x.total)} ${x.monedaSimbolo || ''}`,
      }));
      this.ventasPorMoneda = (r.ventasTotalPorMoneda || []).map((x: any) => ({
        label: String(x.monedaSimbolo || '').toUpperCase(),
        valorFmt: fmt(x.total),
      }));
      this.conteoApertura = (r.conteoApertura || []).map((x: any) => ({
        label: String(x.monedaDenominacion || x.monedaSimbolo || '').toUpperCase(),
        valorFmt: `${fmt(x.total)} ${x.monedaSimbolo || ''}`,
      }));
      this.conteoCierre = (r.conteoCierre || []).map((x: any) => ({
        label: String(x.monedaDenominacion || x.monedaSimbolo || '').toUpperCase(),
        valorFmt: `${fmt(x.total)} ${x.monedaSimbolo || ''}`,
      }));

      // Diferencias por moneda (solo con sentido en caja cerrada).
      const simbolo: { [id: number]: string } = {};
      for (const x of r.conteoApertura || []) simbolo[Number(x.monedaId)] = x.monedaSimbolo || '';
      for (const x of r.ventasTotalPorMoneda || []) simbolo[Number(x.monedaId)] = x.monedaSimbolo || simbolo[Number(x.monedaId)] || '';
      const dif: { [id: number]: number } = r.diferenciaPorMoneda || {};
      if (!this.abierta) {
        this.diferencias = Object.keys(dif).map((k) => {
          const v = Number(dif[Number(k)] || 0);
          return {
            label: (simbolo[Number(k)] || '').toUpperCase() || `Moneda ${k}`,
            valorFmt: fmt(v),
            clase: v > 0 ? 'pos' : v < 0 ? 'neg' : undefined,
          } as LineaMonto;
        });
      }

      // Cerrar: solo si está abierta y el usuario actual es quien la abrió.
      if (this.abierta) {
        const actualId = this.auth.currentUser?.id ?? null;
        const abridorId = abridor?.id ?? null;
        if (abridorId != null && actualId === abridorId) {
          this.puedeCerrar = true;
        } else {
          this.avisoNoCierre = `Solo ${this.cajero} puede cerrar esta caja.`;
        }
      }
    } catch {
      this.error = 'No se pudo cargar la caja';
    } finally {
      this.loading = false;
    }
  }

  irACerrar(): void {
    void this.router.navigate(['/financiero/cajas', this.cajaId, 'cerrar']);
  }

  volver(): void {
    this.location.back();
  }
}
