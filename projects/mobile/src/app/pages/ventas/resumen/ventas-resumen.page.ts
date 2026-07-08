import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

/** Formatea un número a es-PY sin decimales (Gs). */
function fmtGs(v: any): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 });
}

/** Formatea un monto en una moneda respetando sus decimales. */
function fmtMoneda(v: any, decimales: number): string {
  return Number(v || 0).toLocaleString('es-PY', { maximumFractionDigits: decimales || 0 });
}

interface RankItem {
  nombre: string;
  cantidad: number;
  detalle: string; // "X uds" o "N ventas"
  totalFmt: string;
  porcentaje: number;
}

interface MonedaRow {
  denominacion: string;
  simbolo: string;
  esPrincipal: boolean;
  totalFmt: string; // en la moneda original
  totalEnGsFmt: string;
  cotizacionFmt: string;
}

interface FormaPagoRow {
  formaPago: string;
  simbolo: string;
  totalFmt: string;
  totalEnGsFmt: string;
}

interface CajaAbiertaRow {
  cajero: string;
  horasAbierto: string;
  ventaTotalFmt: string;
  cantidadVentas: number;
}

/**
 * Resumen de ventas del día / caja para la PWA. Espeja el dashboard de ventas
 * del desktop: total en Gs, desglose por moneda y forma de pago, top meseros,
 * top productos y cajas abiertas. Consume `get-dashboard-ventas-kpis` (rango
 * 'today'); si hay cajas abiertas el total corresponde a esas cajas (Opción B).
 */
@Component({
  selector: 'app-ventas-resumen',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './ventas-resumen.page.html',
  styleUrls: ['./ventas-resumen.page.scss'],
})
export class VentasResumenPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  loading = true;
  error: string | null = null;

  // Modo del total: caja abierta vs día calendario (para el label).
  basadoEnCajas = false;
  labelTotal = 'Total del día';

  totalFmt = '0';
  ventas = 0;
  ticketFmt = '0';
  mesasOcupadas = 0;
  mesasTotal = 0;

  porMoneda: MonedaRow[] = [];
  porFormaPago: FormaPagoRow[] = [];
  topMeseros: RankItem[] = [];
  topProductos: RankItem[] = [];
  cajasAbiertas: CajaAbiertaRow[] = [];

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    this.error = null;
    try {
      const k: any = await firstValueFrom(this.repo.getDashboardVentasKpis('today'));
      if (!k) {
        this.error = 'No se pudo cargar el resumen';
        return;
      }
      this.basadoEnCajas = !!k.totalBasadoEnCajas;
      this.labelTotal = this.basadoEnCajas ? 'Total en caja' : 'Total del día';
      this.totalFmt = fmtGs(k.totalHoyPYG);
      this.ventas = Number(k.ventasHoy || 0);
      this.ticketFmt = fmtGs(k.ticketPromedio);
      this.mesasOcupadas = Number(k.mesasOcupadas || 0);
      this.mesasTotal = Number(k.mesasTotal || 0);

      const desg = k.desgloseVentasHoy || {};
      this.porMoneda = (desg.porMoneda || []).map((m: any) => ({
        denominacion: m.denominacion,
        simbolo: m.simbolo,
        esPrincipal: !!m.esPrincipal,
        totalFmt: fmtMoneda(m.total, m.decimales),
        totalEnGsFmt: fmtGs(m.totalEnGs),
        cotizacionFmt: m.esPrincipal ? '' : fmtGs(m.cotizacion),
      }));
      // Agrupar forma de pago (puede venir repetida por moneda) sumando en Gs.
      this.porFormaPago = (desg.porFormaPago || []).map((f: any) => ({
        formaPago: f.formaPago,
        simbolo: f.simbolo,
        totalFmt: fmtGs(f.total),
        totalEnGsFmt: fmtGs(f.totalEnGs),
      }));

      this.topMeseros = (k.topMeseros || []).map((r: any) => ({
        nombre: r.nombre,
        cantidad: Number(r.cantidad || 0),
        detalle: `${Number(r.cantidad || 0)} vta.`,
        totalFmt: fmtGs(r.total) + ' Gs',
        porcentaje: Number(r.porcentaje || 0),
      }));
      this.topProductos = (k.topProductos || []).map((r: any) => ({
        nombre: r.nombre,
        cantidad: Number(r.cantidad || 0),
        detalle: `${Number(r.cantidad || 0)} uds`,
        totalFmt: fmtGs(r.total) + ' Gs',
        porcentaje: Number(r.porcentaje || 0),
      }));
      this.cajasAbiertas = (k.cajasAbiertas || []).map((c: any) => ({
        cajero: c.cajero,
        horasAbierto: c.horasAbierto,
        ventaTotalFmt: fmtGs(c.ventaTotal) + ' Gs',
        cantidadVentas: Number(c.cantidadVentas || 0),
      }));
    } catch {
      this.error = 'No se pudo cargar el resumen';
    } finally {
      this.loading = false;
    }
  }
}
