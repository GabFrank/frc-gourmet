import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { CajaSelectorItem, DashboardVentasFiltro, RepositoryService } from '@frc/shared-core';

/** Tope del rango. Mas que esto es un reporte, no un resumen: la consulta hace
 *  un round-trip por bucket del chart y el telefono no lo agradece. */
const MAX_DIAS_RANGO = 92;

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

interface CajaOpcion {
  id: number;
  label: string;
}

/** `2026-07-15T…` → `15/07`. Suficiente para distinguir cajas en el desplegable. */
function fmtFechaCorta(v: any): string {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => `${n}`.padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
}

/**
 * Rotulo del periodo filtrado, con la JORNADA ya resuelta por el backend.
 *
 * Se lee de `filtroAplicado` y no del formulario a proposito: lo que el usuario
 * escribio ("15/07") y lo que se consulto ("15/07 07:00 → 16/07 06:59") no son
 * lo mismo, y mostrar el primero esconderia justamente la regla que hace que el
 * turno noche cierre bien.
 */
function etiquetaPeriodo(filtro: any, cajas: CajaOpcion[]): string {
  const f = (v: string) => {
    const d = new Date(v);
    const p = (n: number) => `${n}`.padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const partes = [`${f(filtro.desde)} → ${f(filtro.hasta)}`];
  const ids: number[] = filtro.cajaIds || [];
  if (ids.length === 1) {
    const c = cajas.find((x) => x.id === ids[0]);
    partes.push(c ? c.label : `Caja #${ids[0]}`);
  } else if (ids.length > 1) {
    partes.push(`${ids.length} cajas`);
  }
  return partes.join(' · ');
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
  imports: [
    CommonModule, ReactiveFormsModule, MatBadgeModule, MatButtonModule, MatCardModule,
    MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatSelectModule,
  ],
  templateUrl: './ventas-resumen.page.html',
  styleUrls: ['./ventas-resumen.page.scss'],
})
export class VentasResumenPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  private readonly fb = inject(FormBuilder);

  loading = true;
  error: string | null = null;
  /** Distinto de `error`: la consulta anduvo, el periodo no tiene ventas. */
  sinResultados = false;

  filtrosAbiertos = false;
  filtrosActivos = 0;
  /** Rotulo del periodo cuando hay filtro; vacio cuando manda el default. */
  periodoLabel = '';
  /** Extremos de la jornada, para explicar el corte sin que el usuario adivine. */
  inicioJornadaLabel = '07:00';
  finJornadaLabel = '06:59';

  cajasOpciones: CajaOpcion[] = [];

  readonly filtros = this.fb.nonNullable.group({
    desde: [''],
    hasta: [''],
    cajaIds: [[] as number[]],
  });

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
    this.filtros.valueChanges.subscribe(() => (this.filtrosActivos = this.contarFiltros()));
    void this.cargar();
    void this.cargarCajas();
  }

  toggleFiltros(): void {
    this.filtrosAbiertos = !this.filtrosAbiertos;
  }

  aplicar(): void {
    this.filtrosAbiertos = false;
    void this.cargar();
  }

  limpiar(): void {
    this.filtros.reset({ desde: '', hasta: '', cajaIds: [] });
    this.filtrosAbiertos = false;
    void this.cargar();
  }

  private contarFiltros(): number {
    const v = this.filtros.getRawValue();
    let n = 0;
    if (v.desde) n++;
    if (v.hasta) n++;
    if (v.cajaIds.length) n++;
    return n;
  }

  /**
   * Cajas para el desplegable. Se piden aparte de los KPIs porque la lista no
   * depende del periodo elegido: si se recargara con cada filtro, elegir una
   * caja podria sacarla de la lista y el usuario se quedaria sin poder
   * deseleccionarla.
   */
  private async cargarCajas(): Promise<void> {
    try {
      const cajas = await firstValueFrom(this.repo.getCajasSelector({ limite: 200 }));
      this.cajasOpciones = (cajas || []).map((c: CajaSelectorItem) => ({
        id: c.id,
        label: `#${c.id} · ${c.dispositivoNombre} · ${fmtFechaCorta(c.fechaApertura)}`,
      }));
    } catch {
      // Sin lista de cajas el resto del resumen sigue sirviendo; el filtro por
      // caja simplemente queda vacio.
      this.cajasOpciones = [];
    }
  }

  /**
   * Arma el parametro del canal. Devuelve el string suelto cuando no hay filtro
   * para no perder la Opcion B (el total sigue a la caja abierta): el default
   * historico se preserva por AUSENCIA de filtro, no por la forma del argumento.
   */
  private paramKpis(): string | DashboardVentasFiltro {
    const v = this.filtros.getRawValue();
    if (!v.desde && !v.hasta && !v.cajaIds.length) return 'today';
    const p: DashboardVentasFiltro = { rango: 'today' };
    if (v.desde) p.desde = v.desde;
    if (v.hasta) p.hasta = v.hasta;
    if (v.cajaIds.length) p.cajaIds = v.cajaIds;
    return p;
  }

  /** null si el rango es valido; si no, el motivo para mostrar al usuario. */
  private validarRango(): string | null {
    const { desde, hasta } = this.filtros.getRawValue();
    if (!desde || !hasta) return null;
    if (desde > hasta) return 'La fecha "desde" es posterior a "hasta"';
    const dias = Math.round(
      (new Date(`${hasta}T12:00:00`).getTime() - new Date(`${desde}T12:00:00`).getTime()) / 86_400_000,
    );
    if (dias > MAX_DIAS_RANGO) return `El rango no puede superar ${MAX_DIAS_RANGO} días`;
    return null;
  }

  async cargar(): Promise<void> {
    const invalido = this.validarRango();
    if (invalido) {
      this.error = invalido;
      this.loading = false;
      return;
    }
    this.loading = true;
    this.error = null;
    this.sinResultados = false;
    try {
      const k: any = await firstValueFrom(this.repo.getDashboardVentasKpis(this.paramKpis()));
      if (!k) {
        this.error = 'No se pudo cargar el resumen';
        return;
      }
      this.basadoEnCajas = !!k.totalBasadoEnCajas;
      // Con filtro el total ya no es "de hoy" ni "de la caja": es del periodo
      // pedido, y el label tiene que decirlo o el numero se lee como otra cosa.
      this.labelTotal = k.filtroAplicado
        ? 'Total del período'
        : this.basadoEnCajas
        ? 'Total en caja'
        : 'Total del día';
      this.periodoLabel = k.filtroAplicado
        ? etiquetaPeriodo(k.filtroAplicado, this.cajasOpciones)
        : '';
      this.sinResultados = Number(k.ventasHoy || 0) === 0;
      const h = Number(k.inicioJornada);
      if (Number.isFinite(h)) {
        const p = (n: number) => `${n}`.padStart(2, '0');
        this.inicioJornadaLabel = `${p(h)}:00`;
        this.finJornadaLabel = `${p((h + 23) % 24)}:59`;
      }
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
