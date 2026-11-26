import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import * as L from 'leaflet';
import { indiceParaInsertar, parsearAreas, serializarAreas } from '../zona-geometria';

export interface MapaZonasDialogData {
  /** Zona que se está dibujando. */
  zona: { id?: number; nombre: string; poligono?: string | null };
  /** Las demás zonas, para dibujarlas de fondo y ver superposiciones. */
  otras: Array<{ id: number; nombre: string; poligono?: string | null; orden?: number }>;
  /** Centro inicial cuando la zona todavía no tiene polígono. */
  centro?: { lat: number; lng: number };
}

interface ChipArea { indice: number; label: string; activa: boolean; incompleta: boolean; }

/**
 * Diseñador de la zona de reparto sobre un mapa.
 *
 * Una zona es UN precio (su tarifa del PdV) y puede valer en **varias áreas**: dos
 * barrios separados que pagan lo mismo son una zona con dos áreas, sin duplicar la
 * tarifa en el PdV. Se guarda como `Polygon` (un área) o `MultiPolygon` (varias).
 *
 * Edición del área activa:
 * - clic en el mapa agrega un vértice al final;
 * - clic sobre un borde inserta un vértice en ese lado;
 * - los vértices se arrastran; al pasar el mouse se destacan y muestran «×» para borrarlos.
 * Clic sobre otra área la vuelve la activa.
 *
 * Sin plugin de dibujo a propósito: es Leaflet pelado, y el desktop es Electron
 * empaquetado, donde cada dependencia nueva hay que bundlearla.
 */
@Component({
  selector: 'app-mapa-zonas-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatTooltipModule, MatSnackBarModule],
  templateUrl: './mapa-zonas-dialog.component.html',
  styleUrls: ['./mapa-zonas-dialog.component.scss'],
})
export class MapaZonasDialogComponent implements OnInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;
  private zone = inject(NgZone);
  private snack = inject(MatSnackBar);

  /** Áreas de la zona, cada una un anillo abierto de vértices. */
  areas: L.LatLng[][] = [];
  activa = 0;

  // Precalculado para el template (no se llaman funciones en el template).
  chips: ChipArea[] = [];
  puntosActiva = 0;
  hayAreas = false;
  puedeGuardar = false;
  superpone = false;
  resumen = '';

  private map!: L.Map;
  private capa = L.layerGroup();
  private colorActiva = '';
  private colorOtras = '';

  constructor(
    public ref: MatDialogRef<MapaZonasDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MapaZonasDialogData,
  ) {}

  ngOnInit(): void {
    this.colorActiva = this.varTema('--zona-mapa-1');
    this.colorOtras = this.varTema('--zona-mapa-sin-zona');
    const centro = this.data.centro ?? { lat: -24.0561, lng: -54.3061 }; // Salto del Guairá
    this.map = L.map(this.mapEl.nativeElement).setView([centro.lat, centro.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    }).addTo(this.map);

    // Las otras zonas van de fondo (todas sus áreas), para ver dónde pega esta.
    for (const otra of this.data.otras || []) {
      for (const area of parsearAreas(otra.poligono)) {
        L.polygon(area, { color: this.colorOtras, weight: 1, fillOpacity: 0.08, interactive: false })
          .bindTooltip(otra.nombre)
          .addTo(this.map);
      }
    }
    this.capa.addTo(this.map);

    this.areas = parsearAreas(this.data.zona.poligono).map((a) => a.map(([lat, lng]) => L.latLng(lat, lng)));
    if (!this.areas.length) this.areas = [[]];
    this.activa = 0;
    const todos = this.areas.flat();
    if (todos.length) this.map.fitBounds(L.latLngBounds(todos), { padding: [30, 30] });

    // Clic en el mapa (fuera de un área o un borde): vértice nuevo al final del área activa.
    this.map.on('click', (e: L.LeafletMouseEvent) => this.zone.run(() => {
      this.areas[this.activa].push(e.latlng);
      this.redibujar();
    }));

    this.redibujar();
    // El diálogo se abre con el contenedor todavía sin tamaño final.
    setTimeout(() => this.map.invalidateSize(), 120);
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
  }

  private varTema(nombre: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  // ─── Acciones de la barra ───────────────────────────────────────────────

  seleccionarArea(i: number): void {
    this.activa = i;
    this.redibujar();
  }

  agregarArea(): void {
    // Un área vacía al final ya es «la nueva»: no se apilan áreas vacías.
    const ultima = this.areas[this.areas.length - 1];
    if (ultima && !ultima.length) { this.activa = this.areas.length - 1; this.redibujar(); return; }
    this.areas.push([]);
    this.activa = this.areas.length - 1;
    this.redibujar();
    this.snack.open('Área nueva: tocá el mapa para marcar sus vértices.', 'OK', { duration: 2500 });
  }

  borrarArea(): void {
    this.areas.splice(this.activa, 1);
    if (!this.areas.length) this.areas = [[]];
    this.activa = Math.min(this.activa, this.areas.length - 1);
    this.redibujar();
  }

  deshacer(): void {
    this.areas[this.activa].pop();
    this.redibujar();
  }

  aceptar(): void {
    const incompleta = this.areas.findIndex((a) => a.length > 0 && a.length < 3);
    if (incompleta >= 0) {
      this.seleccionarArea(incompleta);
      this.snack.open(`El área ${incompleta + 1} tiene menos de 3 puntos: completala o borrala.`, 'OK', { duration: 3500 });
      return;
    }
    const geo = serializarAreas(this.areas.map((a) => a.map((p) => [p.lat, p.lng] as [number, number])));
    if (!geo) {
      this.snack.open('Una zona necesita al menos un área de 3 puntos', 'OK', { duration: 2500 });
      return;
    }
    this.ref.close(geo);
  }

  // ─── Dibujo ────────────────────────────────────────────────────────────

  private redibujar(): void {
    this.capa.clearLayers();
    this.areas.forEach((area, i) => {
      if (i === this.activa) return;
      if (area.length >= 3) {
        L.polygon(area, { color: this.colorActiva, weight: 2, dashArray: '6 4', fillOpacity: 0.16 })
          .bindTooltip(`Área ${i + 1} · clic para editarla`)
          .on('click', (e: L.LeafletMouseEvent) => { L.DomEvent.stopPropagation(e); this.zone.run(() => this.seleccionarArea(i)); })
          .addTo(this.capa);
      }
    });
    this.dibujarActiva();
    this.actualizarEstado();
  }

  private dibujarActiva(): void {
    const area = this.areas[this.activa] || [];
    if (area.length >= 3) {
      L.polygon(area, { color: this.colorActiva, weight: 0, fillOpacity: 0.2, interactive: false }).addTo(this.capa);
    }
    // El borde va como línea aparte e interactiva: clic sobre un lado inserta un vértice ahí.
    if (area.length >= 2) {
      const borde = area.length >= 3 ? [...area, area[0]] : area;
      L.polyline(borde, { color: this.colorActiva, weight: 3, className: 'zona-borde' })
        .bindTooltip('Clic para agregar un punto acá', { sticky: true })
        .on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.zone.run(() => this.insertarEnBorde(e.latlng));
        })
        .addTo(this.capa);
    }
    area.forEach((p, idx) => this.dibujarVertice(p, idx));
  }

  private dibujarVertice(p: L.LatLng, idx: number): void {
    const icono = L.divIcon({
      className: 'zona-vertice-icono',
      html: '<span class="vertice"></span><span class="borrar" title="Borrar punto">×</span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });
    const m = L.marker(p, { draggable: true, icon: icono, keyboard: false, riseOnHover: true }).addTo(this.capa);
    m.on('drag', () => {
      this.areas[this.activa][idx] = m.getLatLng();
      this.redibujarSoloForma();
    });
    m.on('dragend', () => this.zone.run(() => this.redibujar()));
    // Leaflet no dispara `click` después de un arrastre: el «×» sólo borra con un clic real.
    m.on('click', (e: L.LeafletMouseEvent) => {
      L.DomEvent.stopPropagation(e);
      const destino = e.originalEvent?.target as HTMLElement | null;
      if (destino?.classList?.contains('borrar')) this.zone.run(() => this.borrarVertice(idx));
    });
  }

  /** Mientras se arrastra: sólo la forma, sin recrear los marcadores (cortaría el arrastre). */
  private redibujarSoloForma(): void {
    this.capa.eachLayer((l: any) => {
      if (l instanceof L.Polygon && !l.options.interactive) l.setLatLngs(this.areas[this.activa]);
      else if (l instanceof L.Polyline && !(l instanceof L.Polygon) && l.options.className === 'zona-borde') {
        const a = this.areas[this.activa];
        l.setLatLngs(a.length >= 3 ? [...a, a[0]] : a);
      }
    });
  }

  private insertarEnBorde(latlng: L.LatLng): void {
    const area = this.areas[this.activa];
    const plano = area.map((q) => this.map.latLngToLayerPoint(q));
    const p = this.map.latLngToLayerPoint(latlng);
    area.splice(indiceParaInsertar(plano, p), 0, latlng);
    this.redibujar();
  }

  private borrarVertice(idx: number): void {
    this.areas[this.activa].splice(idx, 1);
    this.redibujar();
  }

  private actualizarEstado(): void {
    const area = this.areas[this.activa] || [];
    this.puntosActiva = area.length;
    this.hayAreas = this.areas.some((a) => a.length > 0);
    const completas = this.areas.filter((a) => a.length >= 3).length;
    this.puedeGuardar = completas > 0 && !this.areas.some((a) => a.length > 0 && a.length < 3);
    this.chips = this.areas.map((a, i) => ({
      indice: i,
      label: `Área ${i + 1}${a.length ? ` · ${a.length} pts` : ' · vacía'}`,
      activa: i === this.activa,
      incompleta: a.length > 0 && a.length < 3,
    }));
    this.resumen = `${completas} área${completas === 1 ? '' : 's'} · editando el área ${this.activa + 1} (${this.puntosActiva} punto${this.puntosActiva === 1 ? '' : 's'})`;
    this.chequearSuperposicion();
  }

  /**
   * Aviso, no bloqueo: superponer zonas es legítimo (una chica dentro de una
   * grande) y el servidor desempata por `orden`. Sólo hace falta que quien
   * dibuja lo sepa. Mira todas las áreas de esta zona contra todas las de las otras.
   */
  private chequearSuperposicion(): void {
    const propias = this.areas.filter((a) => a.length >= 3).map((a) => a.map((p) => [p.lng, p.lat] as [number, number]));
    const ajenas = (this.data.otras || []).flatMap((o) => parsearAreas(o.poligono))
      .filter((a) => a.length >= 3)
      .map((a) => a.map(([lat, lng]) => [lng, lat] as [number, number]));
    this.superpone = propias.some((pr) => ajenas.some((aj) =>
      pr.some(([lng, lat]) => this.dentro(lng, lat, aj)) || aj.some(([lng, lat]) => this.dentro(lng, lat, pr))));
  }

  /** Mismo ray casting que usa el backend, para que el aviso coincida. */
  private dentro(lng: number, lat: number, anillo: Array<[number, number]>): boolean {
    let d = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [xi, yi] = anillo[i];
      const [xj, yj] = anillo[j];
      const cruza = (yi > lat) !== (yj > lat)
        && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
      if (cruza) d = !d;
    }
    return d;
  }
}
