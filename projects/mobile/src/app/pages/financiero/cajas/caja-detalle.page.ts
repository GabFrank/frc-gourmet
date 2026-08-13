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

interface MontoItem { simbolo: string; valorFmt: string; }
interface GrupoForma { forma: string; items: MontoItem[]; }
interface LineaSimple { label: string; valorFmt: string; }
interface RetiroGrupo { titulo: string; detalles: LineaSimple[]; }
interface ArqueoMoneda {
  simbolo: string;
  apertura: string;
  cierre?: string;
  esperado: string;
  diferencia?: string;
  difClase?: 'pos' | 'neg';
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

  ventasForma: GrupoForma[] = [];
  totalVentas: MontoItem[] = [];
  descuentos: MontoItem[] = [];
  aumentos: MontoItem[] = [];
  gastos: LineaSimple[] = [];
  totalGastos: MontoItem[] = [];
  retiros: RetiroGrupo[] = [];
  totalRetiros: MontoItem[] = [];
  arqueo: ArqueoMoneda[] = [];

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

      // Mapa monedaId → símbolo, armado con todas las filas que lo traen.
      const simbolo: { [id: number]: string } = {};
      const setSim = (id: any, s: any) => {
        if (id != null && s && !simbolo[Number(id)]) simbolo[Number(id)] = s;
      };
      for (const x of r.conteoApertura || []) setSim(x.monedaId, x.monedaSimbolo);
      for (const x of r.conteoCierre || []) setSim(x.monedaId, x.monedaSimbolo);
      for (const x of r.ventasTotalPorMoneda || []) setSim(x.monedaId, x.monedaSimbolo);
      for (const x of r.ventasPorFormaPago || []) setSim(x.monedaId, x.monedaSimbolo);
      for (const g of r.gastos || []) setSim(g.monedaId, g.monedaSimbolo);
      for (const rt of r.retiros || []) for (const d of rt.detalles || []) setSim(d.monedaId, d.monedaSimbolo);
      const sim = (id: any) => simbolo[Number(id)] || '';
      const mapAItems = (m: any): MontoItem[] =>
        Object.keys(m || {}).map(Number).filter((id) => Number(m[id]))
          .map((id) => ({ simbolo: sim(id), valorFmt: fmt(m[id]) }));

      // Ventas por forma de pago, agrupadas (una forma, N monedas debajo).
      const grupos = new Map<string, MontoItem[]>();
      for (const x of r.ventasPorFormaPago || []) {
        const forma = String(x.formaPago || 'SIN FORMA').toUpperCase();
        if (!grupos.has(forma)) grupos.set(forma, []);
        grupos.get(forma)!.push({ simbolo: x.monedaSimbolo || '', valorFmt: fmt(x.total) });
      }
      this.ventasForma = [...grupos].map(([forma, items]) => ({ forma, items }));
      this.totalVentas = (r.ventasTotalPorMoneda || []).map((x: any) => ({
        simbolo: x.monedaSimbolo || '', valorFmt: fmt(x.total),
      }));

      // Descuentos / aumentos.
      this.descuentos = mapAItems(r.descuentosPorMoneda);
      this.aumentos = mapAItems(r.aumentosPorMoneda);

      // Gastos + total por moneda.
      this.gastos = (r.gastos || []).map((g: any) => ({
        label: String(g.descripcion || g.categoria || 'GASTO').toUpperCase(),
        valorFmt: `${fmt(g.monto)} ${g.monedaSimbolo || ''}`.trim(),
      }));
      const gastoTot: { [id: number]: number } = {};
      for (const g of r.gastos || []) gastoTot[Number(g.monedaId)] = (gastoTot[Number(g.monedaId)] || 0) + Number(g.monto || 0);
      this.totalGastos = mapAItems(gastoTot);

      // Retiros (agrupados por retiro) + total por moneda.
      this.retiros = (r.retiros || []).map((rt: any) => ({
        titulo: `RETIRO N° ${rt.id}${rt.responsable ? ' · ' + String(rt.responsable).toUpperCase() : ''}`,
        detalles: (rt.detalles || []).map((d: any) => ({
          label: String(d.monedaDenominacion || d.monedaSimbolo || '').toUpperCase(),
          valorFmt: `${fmt(d.monto)} ${d.monedaSimbolo || ''}`.trim(),
        })),
      }));
      const retiroTot: { [id: number]: number } = {};
      for (const rt of r.retiros || []) for (const d of rt.detalles || []) retiroTot[Number(d.monedaId)] = (retiroTot[Number(d.monedaId)] || 0) + Number(d.monto || 0);
      this.totalRetiros = mapAItems(retiroTot);

      // Arqueo por moneda: apertura / cierre / esperado / diferencia.
      const aperturaMap: { [id: number]: number } = {};
      for (const x of r.conteoApertura || []) aperturaMap[Number(x.monedaId)] = Number(x.total || 0);
      const cierreMap: { [id: number]: number } = {};
      for (const x of r.conteoCierre || []) cierreMap[Number(x.monedaId)] = Number(x.total || 0);
      const esperadoMap: { [id: number]: number } = r.esperadoPorMoneda || {};
      const difMap: { [id: number]: number } = r.diferenciaPorMoneda || {};
      const arqueoIds = new Set<number>();
      [aperturaMap, cierreMap, esperadoMap, difMap].forEach((m) => Object.keys(m).forEach((k) => arqueoIds.add(Number(k))));
      this.arqueo = [...arqueoIds].map((id) => {
        const v = Number(difMap[id] || 0);
        return {
          simbolo: (sim(id) || `Moneda ${id}`).toUpperCase(),
          apertura: fmt(aperturaMap[id] || 0),
          cierre: this.abierta ? undefined : fmt(cierreMap[id] || 0),
          esperado: fmt(esperadoMap[id] || 0),
          diferencia: this.abierta ? undefined : fmt(v),
          difClase: v > 0 ? 'pos' : v < 0 ? 'neg' : undefined,
        } as ArqueoMoneda;
      });

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
