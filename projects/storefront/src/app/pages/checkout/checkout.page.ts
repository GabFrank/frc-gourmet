import { Component, OnInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { CartService } from '../../core/cart.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { ZonaDelivery, TipoPedido } from '../../core/models';

declare const L: any;

@Component({
  selector: 'sf-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './checkout.page.html',
  styleUrls: ['./checkout.page.scss'],
})
export class CheckoutPage implements OnInit, OnDestroy {
  private api = inject(PublicApiService);
  private router = inject(Router);
  private zone = inject(NgZone);
  cart = inject(CartService);
  auth = inject(AuthService);
  config = inject(ConfigService);

  tipo: TipoPedido = 'PICKUP';
  zonas: ZonaDelivery[] = [];
  zonaId: number | null = null;
  direccion = '';
  referencia = '';
  notas = '';
  enviando = false;
  error: string | null = null;

  // Ubicación (mapa)
  manual = false;
  lat: number | null = null;
  lng: number | null = null;
  direccionMapa = '';
  private map: any = null;
  private geocodeT: any = null;

  costoEnvio = 0;
  total = 0;

  ngOnInit(): void {
    if (!this.config.config.permitePickup && this.config.config.permiteDelivery) this.tipo = 'DELIVERY';
    this.recomputar();
    this.api.call<ZonaDelivery[]>('zonas.get').subscribe({
      next: (z) => (this.zonas = z || []),
      error: () => {},
    });
    if (this.tipo === 'DELIVERY') this.initMapaLazy();
  }

  ngOnDestroy(): void {
    if (this.map) { this.map.remove(); this.map = null; }
  }

  setTipo(t: TipoPedido): void {
    this.tipo = t;
    this.recomputar();
    if (t === 'DELIVERY') this.initMapaLazy();
    else if (this.map) { this.map.remove(); this.map = null; }
  }

  private initMapaLazy(): void {
    if (this.manual) return;
    setTimeout(() => this.initMapa(), 60);
  }

  private initMapa(): void {
    if (this.map || typeof L === 'undefined') return;
    const el = document.getElementById('sf-map');
    if (!el) return;
    // Centro por defecto: Asunción, PY.
    const centro = [-25.2822, -57.6351];
    this.map = L.map(el, { zoomControl: true }).setView(centro, 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap · © CARTO',
    }).addTo(this.map);
    this.map.on('moveend', () => this.zone.run(() => this.onMapMove()));
    this.onMapMove();
    // Intentar geolocalización del usuario.
    this.usarMiUbicacion(true);
  }

  private onMapMove(): void {
    if (!this.map) return;
    const c = this.map.getCenter();
    this.lat = c.lat; this.lng = c.lng;
    clearTimeout(this.geocodeT);
    this.geocodeT = setTimeout(() => this.reverseGeocode(c.lat, c.lng), 500);
  }

  private async reverseGeocode(lat: number, lng: number): Promise<void> {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`);
      const j: any = await res.json();
      this.zone.run(() => (this.direccionMapa = j?.display_name || ''));
    } catch { /* offline */ }
  }

  usarMiUbicacion(silent = false): void {
    if (!navigator.geolocation) { if (!silent) this.error = 'Tu navegador no permite ubicación.'; return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => this.zone.run(() => this.map?.setView([pos.coords.latitude, pos.coords.longitude], 17)),
      () => { if (!silent) this.zone.run(() => (this.error = 'No se pudo obtener tu ubicación.')); },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }

  toggleManual(): void {
    this.manual = !this.manual;
    if (this.manual && this.map) { this.map.remove(); this.map = null; }
    else if (!this.manual && this.tipo === 'DELIVERY') this.initMapaLazy();
  }

  recomputar(): void {
    const z = this.zonas.find((x) => x.id === this.zonaId);
    this.costoEnvio = this.tipo === 'DELIVERY' && z ? z.tarifa : 0;
    this.total = this.cart.subtotal + this.costoEnvio;
  }

  irLogin(): void {
    this.router.navigate(['/login'], { queryParams: { volver: '/checkout' } });
  }

  confirmar(): void {
    this.error = null;
    const direccionFinal = this.manual ? this.direccion.trim() : (this.direccionMapa || this.direccion.trim());
    if (this.tipo === 'DELIVERY') {
      if (!this.zonaId) { this.error = 'Elegí una zona de entrega.'; return; }
      if (!direccionFinal) { this.error = this.manual ? 'Ingresá la dirección.' : 'Movéel mapa a tu ubicación.'; return; }
    }
    this.enviando = true;
    const payload: any = {
      tipoPedido: this.tipo,
      items: this.cart.toPedidoItems(),
      zonaDeliveryId: this.tipo === 'DELIVERY' ? this.zonaId : null,
      direccionEntrega: this.tipo === 'DELIVERY' ? direccionFinal : null,
      referenciaDireccion: this.referencia.trim() || null,
      notas: this.notas.trim() || null,
      metodoPago: 'EFECTIVO',
    };
    if (this.tipo === 'DELIVERY' && !this.manual && this.lat != null && this.lng != null) {
      payload.latitud = this.lat; payload.longitud = this.lng;
    }
    this.api.call<any>('pedido.crear', [payload]).subscribe({
      next: (res) => {
        this.enviando = false;
        if (res?.success) { this.cart.limpiar(); this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: res.numero } }); }
        else this.error = this.mensajeError(res);
      },
      error: (e) => { this.enviando = false; this.error = 'No se pudo enviar el pedido. ' + (e?.message || ''); },
    });
  }

  private mensajeError(res: any): string {
    switch (res?.error) {
      case 'monto_minimo_no_alcanzado': return `El mínimo para esta zona es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'falta_zona_delivery': return 'Elegí una zona de entrega.';
      case 'falta_direccion': return 'Ingresá la dirección.';
      case 'monto_minimo_global': return `El pedido mínimo es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'tienda_cerrada': return 'La tienda está cerrada en este momento.';
      case 'pickup_no_disponible': return 'El retiro no está disponible.';
      case 'delivery_no_disponible': return 'El delivery no está disponible.';
      default: return res?.error || 'No se pudo crear el pedido.';
    }
  }
}
