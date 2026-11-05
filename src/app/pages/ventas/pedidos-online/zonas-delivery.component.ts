import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import * as L from 'leaflet';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { DashStatChipComponent, DashStatChipColor } from '../../../shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { MapaZonasDialogComponent } from './mapa-zonas-dialog/mapa-zonas-dialog.component';

type RangoZonas = 'today' | 'week' | 'month';

/** Colores de zona del tema (`--zona-1…8`): orden fijo por el orden de la zona. */
const COLORES_ZONA = 8;
const CENTRO_DEFAULT: L.LatLngTuple = [-24.0561, -54.3061]; // Salto del Guairá, como el diseñador
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

interface Kpi { icon: string; label: string; value: string; color: DashStatChipColor; }

/**
 * Zonas de Delivery: dashboard (KPIs, mapa con todas las zonas y los pedidos de la
 * tienda, tabla por zona con los dos tipos de delivery) + el ABM de siempre.
 *
 * Todo lo que muestra el template se calcula acá al cargar: el template no llama
 * funciones. Los colores salen de variables del tema; Leaflet necesita el valor
 * real, que se lee con `getComputedStyle`.
 */
@Component({
  selector: 'app-zonas-delivery',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatButtonModule, MatButtonToggleModule, MatIconModule, MatTooltipModule,
    MatSnackBarModule, MatDialogModule, MatMenuModule, DashStatChipComponent,
  ],
  providers: [DecimalPipe],
  templateUrl: './zonas-delivery.component.html',
  styleUrls: ['./zonas-delivery.component.scss'],
})
export class ZonasDeliveryComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private zone = inject(NgZone);
  /** Mismo formateador que el `| number` de la tabla: KPIs y filas con los mismos separadores. */
  private decimal = inject(DecimalPipe);

  readonly rangos: { valor: RangoZonas; label: string }[] = [
    { valor: 'today', label: 'Hoy' }, { valor: 'week', label: '7 días' }, { valor: 'month', label: 'Este mes' },
  ];
  /** El que está elegido en el selector; se aplica con el botón (no se filtra en vivo). */
  rangoSel: RangoZonas = 'week';
  rangoAplicado: RangoZonas = 'week';
  periodoTexto = '';

  cargando = true;
  puedeConfigurar = false;
  zonas: any[] = [];
  tarifas: any[] = [];
  filas: any[] = [];
  kpis: Kpi[] = [];
  alertas: string[] = [];
  puntosTexto = '';
  mapaSinMosaicos = false;
  seleccionada: string | null = null;

  guardando = false;
  editando: any = null;
  tarifasOpciones: { id: number | null; label: string; disabled: boolean }[] = [];

  private map: L.Map | null = null;
  private capaZonas = L.layerGroup();
  private capaPuntos = L.layerGroup();
  private poligonos = new Map<string, L.GeoJSON>();
  private datos: any = null;
  /** La pestaña puede crearse oculta o cambiar de ancho (una o dos columnas): el mapa se reacomoda. */
  private observador: ResizeObserver | null = null;
  private encuadrePendiente = true;

  ngOnInit(): void { this.cargar(); }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.map = L.map(this.mapEl.nativeElement, { zoomControl: true }).setView(CENTRO_DEFAULT, 13);
      const tiles = L.tileLayer(TILE_URL, {
        maxZoom: 19,
        attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      });
      // Sin internet el mapa queda gris: se avisa en vez de dejar un cuadro mudo.
      tiles.on('tileerror', () => this.zone.run(() => (this.mapaSinMosaicos = true)));
      tiles.on('tileload', () => { if (this.mapaSinMosaicos) this.zone.run(() => (this.mapaSinMosaicos = false)); });
      tiles.addTo(this.map);
      this.capaZonas.addTo(this.map);
      this.capaPuntos.addTo(this.map);
      if (typeof ResizeObserver !== 'undefined') {
        this.observador = new ResizeObserver(() => {
          const el = this.mapEl.nativeElement;
          if (!this.map || !el.clientWidth || !el.clientHeight) return;
          this.map.invalidateSize();
          // El primer encuadre con tamaño real: con la pestaña oculta, fitBounds calcula sobre 0×0.
          if (this.encuadrePendiente && this.datos) this.encuadrar();
        });
        this.observador.observe(this.mapEl.nativeElement);
      }
    });
    if (this.datos) this.dibujarMapa();
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.map?.remove();
    this.map = null;
  }

  aplicarRango(): void {
    this.rangoAplicado = this.rangoSel;
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.repo.getDashboardZonasDelivery({ rango: this.rangoAplicado }).subscribe({
      next: (d: any) => {
        this.datos = d;
        this.procesar(d);
        this.cargando = false;
        this.dibujarMapa();
      },
      error: (e: any) => {
        this.cargando = false;
        this.snack.open('No se pudo cargar: ' + (e?.message || ''), 'OK', { duration: 4000 });
      },
    });
  }

  private procesar(d: any): void {
    this.puedeConfigurar = !!d.puedeConfigurar;
    this.zonas = d.zonas || [];
    this.tarifas = d.tarifas || [];
    const tarifaPorId = new Map<number, any>(this.tarifas.map((t: any) => [t.id, t]));
    const zonaPorId = new Map<number, any>(this.zonas.map((z: any) => [z.id, z]));
    // El color sigue a la zona (su posición en el orden), no al ranking del período.
    const indice = new Map<number, number>(this.zonas.map((z: any, i: number) => [z.id, (i % COLORES_ZONA) + 1]));

    this.filas = (d.filas || []).map((f: any) => {
      const z = f.zonaId != null ? zonaPorId.get(f.zonaId) : null;
      const t = z?.precioDeliveryId != null ? tarifaPorId.get(z.precioDeliveryId) : null;
      const n = z ? indice.get(z.id)! : null;
      return {
        ...f,
        zona: z,
        esZona: !!z,
        colorCss: n ? `var(--zona-${n})` : null,
        tarifaNombre: z ? (t ? t.descripcion : 'Sin tarifa') : '',
        sinTarifa: !!z && !t,
        envioPrecio: z ? (t ? t.valor : z.tarifa) : null,
        coberturaTexto: z ? (z.poligono ? 'Dibujada' : 'Sin dibujar') : '',
        dibujada: !!z?.poligono,
        activa: !!z?.activa,
        seleccionada: false,
      };
    });

    const k = d.kpis || {};
    const gs = (v: number) => `₲ ${this.num(v)}`;
    this.kpis = [
      { icon: 'pin_drop', label: 'Zonas activas', value: String(k.zonasActivas ?? 0), color: 'primary' },
      { icon: 'two_wheeler', label: `Envíos · tienda ${this.num(k.enviosTienda)} · teléfono ${this.num(k.enviosTelefono)}`, value: this.num(k.envios), color: 'info' },
      { icon: 'payments', label: 'Ventas de delivery', value: gs(k.facturacion), color: 'success' },
      { icon: 'local_shipping', label: 'Envíos cobrados', value: gs(k.envioRecaudado), color: 'success' },
      { icon: 'confirmation_number', label: 'Ticket promedio', value: gs(k.ticketPromedio), color: 'primary' },
    ];

    this.alertas = [];
    if (k.zonasSinDibujar) this.alertas.push(`${k.zonasSinDibujar} zona(s) sin dibujar: la tienda no puede calcular el envío de un pedido que caiga ahí.`);
    if (k.zonasSinTarifa) this.alertas.push(`${k.zonasSinTarifa} zona(s) sin tarifa del PdV: sus deliverys por teléfono no se pueden contar en la zona.`);
    if (k.tarifasCompartidas) this.alertas.push(`${k.tarifasCompartidas} tarifa(s) del PdV vinculada(s) a más de una zona: esos deliverys por teléfono van a «varias zonas». Dejá cada tarifa en una sola zona.`);
    if (k.enviosSinAsignar) this.alertas.push(`${this.num(k.enviosSinAsignar)} envío(s) del período no tienen zona (filas al final de la tabla).`);

    const puntos = d.puntos || [];
    this.puntosTexto = d.puntosTruncados
      ? `El mapa muestra los últimos ${this.num(puntos.length)} pedidos de la tienda del período.`
      : `${this.num(puntos.length)} pedido(s) de la tienda en el mapa (los del teléfono no tienen ubicación).`;

    const desde = d.desde ? new Date(d.desde) : null;
    const hasta = d.hasta ? new Date(d.hasta) : null;
    const fmt = (x: Date) => x.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
    this.periodoTexto = desde && hasta ? `${fmt(desde)} – ${fmt(hasta)}` : '';
    this.marcarSeleccion();
  }

  private num(v: any): string {
    return this.decimal.transform(Number(v || 0), '1.0-2') || '0';
  }

  // ─── Mapa ───────────────────────────────────────────────────────────────

  /** Leaflet necesita el color real: se lee del tema (`--zona-mapa-*`). */
  private varTema(nombre: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  private colorMapa(n: number): string { return this.varTema(`--zona-mapa-${n}`); }

  private dibujarMapa(): void {
    if (!this.map || !this.datos) return;
    this.zone.runOutsideAngular(() => {
      this.capaZonas.clearLayers();
      this.capaPuntos.clearLayers();
      this.poligonos.clear();
      const indice = new Map<number, number>(this.zonas.map((z: any, i: number) => [z.id, (i % COLORES_ZONA) + 1]));
      const limites = L.latLngBounds([]);
      for (const z of this.zonas) {
        if (!z.poligono) continue;
        let geo: any;
        try { geo = JSON.parse(z.poligono); } catch { continue; }
        const color = this.colorMapa(indice.get(z.id)!);
        const capa = L.geoJSON(geo, { style: { color, weight: 2, fillColor: color, fillOpacity: z.activa ? 0.18 : 0.06, dashArray: z.activa ? undefined : '4 4' } });
        capa.bindTooltip(z.nombre, { permanent: true, direction: 'center', className: 'zona-etiqueta' });
        capa.on('click', () => this.zone.run(() => this.seleccionar(`Z${z.id}`)));
        capa.addTo(this.capaZonas);
        this.poligonos.set(`Z${z.id}`, capa);
        limites.extend(capa.getBounds());
      }
      for (const p of this.datos.puntos || []) {
        const n = p.zonaId != null ? indice.get(p.zonaId) : null;
        const color = n ? this.colorMapa(n) : this.varTema('--zona-mapa-sin-zona');
        const nombre = (p.zonaId != null && this.zonas.find((z: any) => z.id === p.zonaId)?.nombre) || 'Sin zona';
        L.circleMarker([p.lat, p.lng], { radius: 5, color: this.varTema('--zona-mapa-anillo'), weight: 2, fillColor: color, fillOpacity: 0.95 })
          .bindTooltip(nombre)
          .addTo(this.capaPuntos);
        limites.extend([p.lat, p.lng]);
      }
      this.limites = limites;
      this.encuadrePendiente = true;
      this.encuadrar();
      this.resaltarPoligono();
    });
  }

  private limites: L.LatLngBounds | null = null;

  /** Encuadra zonas y puntos; si el mapa todavía no tiene tamaño, queda pendiente para el observador. */
  private encuadrar(): void {
    const el = this.mapEl.nativeElement;
    if (!this.map || !el.clientWidth || !el.clientHeight) return;
    this.map.invalidateSize();
    if (this.limites?.isValid()) this.map.fitBounds(this.limites, { padding: [24, 24], maxZoom: 15 });
    else this.map.setView(CENTRO_DEFAULT, 13);
    this.encuadrePendiente = false;
  }

  seleccionar(clave: string): void {
    this.seleccionada = this.seleccionada === clave ? null : clave;
    this.marcarSeleccion();
    this.resaltarPoligono(true);
  }

  private marcarSeleccion(): void {
    for (const f of this.filas) f.seleccionada = f.clave === this.seleccionada;
  }

  private resaltarPoligono(acercar = false): void {
    this.poligonos.forEach((capa, clave) => {
      const sel = clave === this.seleccionada;
      capa.setStyle({ weight: sel ? 4 : 2, fillOpacity: sel ? 0.35 : 0.18 });
      if (sel) {
        capa.bringToFront();
        if (acercar) this.map?.fitBounds(capa.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
    });
  }

  // ─── ABM ───────────────────────────────────────────────────────────────

  nueva(): void { this.abrirForm({ nombre: '', tarifa: 0, montoMinimo: 0, activa: true, orden: this.zonas.length, poligono: null, precioDeliveryId: null }); }
  editar(z: any): void { this.abrirForm({ ...z }); }

  private abrirForm(z: any): void {
    this.editando = z;
    // Una tarifa del PdV por zona: las que ya usa otra zona se muestran pero no se pueden elegir.
    const usadaPor = new Map<number, string>();
    for (const o of this.zonas) if (o.precioDeliveryId != null && o.id !== z.id) usadaPor.set(o.precioDeliveryId, o.nombre);
    this.tarifasOpciones = [
      { id: null, label: 'Sin tarifa', disabled: false },
      ...this.tarifas
        .filter((t: any) => t.activo || t.id === z.precioDeliveryId)
        .map((t: any) => ({
          id: t.id,
          label: `${t.descripcion} · ₲ ${this.num(t.valor)}${usadaPor.has(t.id) ? ` (usada por ${usadaPor.get(t.id)})` : ''}`,
          disabled: usadaPor.has(t.id),
        })),
    ];
  }

  guardar(): void {
    if (!this.editando?.nombre?.trim()) { this.snack.open('Ingresá un nombre', 'OK', { duration: 2500 }); return; }
    this.guardando = true;
    this.repo.guardarZonaDelivery(this.editando).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) { this.editando = null; this.cargar(); this.snack.open('Zona guardada', 'OK', { duration: 2000 }); }
        else if (res?.error === 'tarifa_en_uso') this.snack.open(`Esa tarifa ya la usa la zona ${res.zona}. Cada tarifa va en una sola zona.`, 'OK', { duration: 5000 });
        else this.snack.open('No se pudo guardar: ' + (res?.error || ''), 'OK', { duration: 3000 });
      },
      error: (e) => { this.guardando = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }); },
    });
  }

  /** Abre el mapa para dibujar el área de la zona y guarda el polígono. */
  dibujar(z: any): void {
    const ref = this.dialog.open(MapaZonasDialogComponent, {
      width: '90vw', maxWidth: '1100px',
      data: { zona: z, otras: this.zonas.filter((o) => o.id !== z.id) },
    });
    ref.afterClosed().subscribe((poligono: string | undefined) => {
      if (!poligono) return;
      this.repo.guardarZonaDelivery({ ...z, poligono }).subscribe({
        next: (res: any) => {
          if (res?.success) { this.cargar(); this.snack.open('Zona dibujada', 'OK', { duration: 2000 }); }
          else this.snack.open('No se pudo guardar: ' + (res?.error || ''), 'OK', { duration: 3000 });
        },
        error: (e: any) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }),
      });
    });
  }

  eliminar(z: any): void {
    // Borrar una zona referenciada por pedidos históricos les rompe la
    // trazabilidad, así que se confirma como cualquier destructivo del sistema.
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar zona',
        message: `¿Eliminar la zona "${z.nombre}"? Los pedidos que la usaron van a quedar en «Zona eliminada».`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe((confirmado: boolean) => {
      if (!confirmado) return;
      this.repo.eliminarZonaDelivery(z.id).subscribe({
        next: () => { this.cargar(); this.snack.open('Zona eliminada', 'OK', { duration: 2000 }); },
        error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }),
      });
    });
  }
}
