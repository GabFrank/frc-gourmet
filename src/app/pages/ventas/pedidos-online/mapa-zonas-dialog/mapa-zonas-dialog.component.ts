import { Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild, NgZone, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import * as L from 'leaflet';

export interface MapaZonasDialogData {
  /** Zona que se está dibujando. */
  zona: { id?: number; nombre: string; poligono?: string | null };
  /** Las demás zonas, para dibujarlas de fondo y ver superposiciones. */
  otras: Array<{ id: number; nombre: string; poligono?: string | null; orden?: number }>;
  /** Centro inicial cuando la zona todavía no tiene polígono. */
  centro?: { lat: number; lng: number };
}

/**
 * Diseñador de la zona de reparto sobre un mapa.
 *
 * El cliente nunca elige su zona —es un dato interno del local— así que alguien
 * tiene que dibujar dónde llega el delivery. Acá se hace: se marcan los vértices
 * con click, se arrastran para corregir y se guarda como GeoJSON. El servidor
 * después resuelve con eso en qué zona cae el pin del cliente.
 *
 * Sin plugin de dibujo a propósito: marcar vértices y cerrar el anillo son unas
 * pocas decenas de líneas con Leaflet pelado, y el desktop es Electron
 * empaquetado, donde cada dependencia nueva hay que bundlearla.
 */
@Component({
  selector: 'app-mapa-zonas-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title>Dibujar zona · {{ data.zona.nombre || 'Nueva zona' }}</h2>

    <mat-dialog-content class="cont">
      <p class="ayuda">
        Tocá el mapa para marcar los vértices de la zona. Arrastrá un punto para corregirlo.
        Con 3 puntos o más ya se puede guardar.
      </p>
      <div #mapEl class="mapa"></div>
      <div class="barra">
        <span class="contador">{{ puntos.length }} punto{{ puntos.length === 1 ? '' : 's' }}</span>
        <span class="aviso" *ngIf="superpone">Se superpone con otra zona: gana la de menor orden.</span>
        <span class="spacer"></span>
        <button mat-stroked-button (click)="deshacer()" [disabled]="!puntos.length">
          <mat-icon>undo</mat-icon> Deshacer
        </button>
        <button mat-stroked-button color="warn" (click)="limpiar()" [disabled]="!puntos.length">
          <mat-icon>delete_outline</mat-icon> Borrar todo
        </button>
      </div>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" [disabled]="puntos.length < 3" (click)="aceptar()">
        Guardar zona
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cont { display: flex; flex-direction: column; gap: 10px; min-width: 60vw; }
    .ayuda { margin: 0; color: var(--text-secondary); font-size: 13px; }
    .mapa { height: 55vh; min-height: 320px; border-radius: 6px; border: 1px solid var(--border-color); }
    .barra { display: flex; align-items: center; gap: 10px; }
    .spacer { flex: 1; }
    .contador { color: var(--text-secondary); font-size: 13px; }
    .aviso { color: var(--warning-color); font-size: 13px; }
  `],
})
export class MapaZonasDialogComponent implements OnInit, OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl!: ElementRef<HTMLDivElement>;

  private zone = inject(NgZone);
  private snack = inject(MatSnackBar);

  puntos: L.LatLng[] = [];
  superpone = false;

  private map!: L.Map;
  private poligono: L.Polygon | null = null;
  private marcadores: L.Marker[] = [];

  constructor(
    public ref: MatDialogRef<MapaZonasDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: MapaZonasDialogData,
  ) {}

  ngOnInit(): void {
    const centro = this.data.centro ?? { lat: -24.0561, lng: -54.3061 }; // Salto del Guairá
    this.map = L.map(this.mapEl.nativeElement).setView([centro.lat, centro.lng], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap · © CARTO',
    }).addTo(this.map);

    // Las otras zonas van de fondo, para ver dónde pega la nueva.
    for (const otra of this.data.otras || []) {
      const anillo = this.aLatLngs(otra.poligono);
      if (!anillo.length) continue;
      L.polygon(anillo, { color: '#888', weight: 1, fillOpacity: 0.08, interactive: false })
        .bindTooltip(otra.nombre, { permanent: false })
        .addTo(this.map);
    }

    const propios = this.aLatLngs(this.data.zona.poligono);
    if (propios.length) {
      this.puntos = propios.map((p) => L.latLng(p[0], p[1]));
      this.redibujar();
      const b = L.latLngBounds(this.puntos);
      this.map.fitBounds(b, { padding: [30, 30] });
    }

    this.map.on('click', (e: L.LeafletMouseEvent) => {
      this.zone.run(() => {
        this.puntos.push(e.latlng);
        this.redibujar();
      });
    });

    // El diálogo se abre con el contenedor todavía sin tamaño final.
    setTimeout(() => this.map.invalidateSize(), 120);
  }

  ngOnDestroy(): void {
    if (this.map) this.map.remove();
  }

  deshacer(): void {
    this.puntos.pop();
    this.redibujar();
  }

  limpiar(): void {
    this.puntos = [];
    this.redibujar();
  }

  aceptar(): void {
    if (this.puntos.length < 3) {
      this.snack.open('Una zona necesita al menos 3 puntos', 'OK', { duration: 2500 });
      return;
    }
    // GeoJSON va en [lng, lat] y el anillo tiene que cerrar repitiendo el primero.
    const anillo = this.puntos.map((p) => [p.lng, p.lat]);
    anillo.push([this.puntos[0].lng, this.puntos[0].lat]);
    this.ref.close(JSON.stringify({ type: 'Polygon', coordinates: [anillo] }));
  }

  /** GeoJSON (texto, [lng,lat]) → pares [lat,lng] para Leaflet. */
  private aLatLngs(geojson?: string | null): Array<[number, number]> {
    if (!geojson) return [];
    try {
      const g = JSON.parse(geojson);
      const geo = g?.type === 'Feature' ? g.geometry : g;
      const anillo = geo?.type === 'Polygon' ? geo.coordinates?.[0]
        : geo?.type === 'MultiPolygon' ? geo.coordinates?.[0]?.[0]
        : null;
      if (!Array.isArray(anillo)) return [];
      return anillo.map((c: number[]) => [c[1], c[0]] as [number, number]);
    } catch {
      return [];
    }
  }

  private redibujar(): void {
    if (this.poligono) { this.poligono.remove(); this.poligono = null; }
    this.marcadores.forEach((m) => m.remove());
    this.marcadores = [];

    this.puntos.forEach((p, i) => {
      const m = L.marker(p, { draggable: true }).addTo(this.map);
      m.on('drag', () => {
        this.puntos[i] = m.getLatLng();
        this.actualizarPoligono();
      });
      m.on('dragend', () => this.zone.run(() => this.chequearSuperposicion()));
      this.marcadores.push(m);
    });

    this.actualizarPoligono();
    this.chequearSuperposicion();
  }

  private actualizarPoligono(): void {
    if (this.poligono) { this.poligono.remove(); this.poligono = null; }
    if (this.puntos.length < 3) return;
    this.poligono = L.polygon(this.puntos, { color: '#d32f2f', weight: 2, fillOpacity: 0.18 })
      .addTo(this.map);
  }

  /**
   * Aviso, no bloqueo: superponer zonas es legítimo (una chica dentro de una
   * grande) y el servidor desempata por `orden`. Sólo hace falta que quien
   * dibuja lo sepa.
   */
  private chequearSuperposicion(): void {
    if (this.puntos.length < 3) { this.superpone = false; return; }
    const propio = this.puntos.map((p) => [p.lng, p.lat] as [number, number]);
    this.superpone = (this.data.otras || []).some((otra) => {
      const anillo = this.aLatLngs(otra.poligono);
      if (anillo.length < 3) return false;
      const otroLngLat = anillo.map(([lat, lng]) => [lng, lat] as [number, number]);
      return propio.some(([lng, lat]) => this.dentro(lng, lat, otroLngLat))
        || otroLngLat.some(([lng, lat]) => this.dentro(lng, lat, propio));
    });
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
