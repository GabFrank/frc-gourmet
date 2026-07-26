import { Component, OnInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { CartService } from '../../core/cart.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { MesaService } from '../../core/mesa.service';
import { IconComponent } from '../../core/icon.component';
import { TipoPedido } from '../../core/models';

declare const L: any;

@Component({
  selector: 'sf-checkout',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent],
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
  mesa = inject(MesaService);

  tipo: TipoPedido = 'PICKUP';
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
    if (this.mesa.enMesa) {
      // Modo mesa: no hay pickup/delivery ni mapa; se paga en la caja.
      this.tipo = 'MESA_QR';
      this.recomputar();
      return;
    }
    if (!this.config.config.permitePickup && this.config.config.permiteDelivery) this.tipo = 'DELIVERY';
    this.recomputar();
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

  setUbicacion(manual: boolean): void {
    if (this.manual === manual) return;
    this.manual = manual;
    if (this.manual) { if (this.map) { this.map.remove(); this.map = null; } }
    else if (this.tipo === 'DELIVERY') this.initMapaLazy();
  }

  recomputar(): void {
    // El envío se cotiza cuando la tienda acepta el pedido (según la ubicación).
    this.costoEnvio = 0;
    this.total = this.cart.subtotal + this.costoEnvio;
  }

  irLogin(): void {
    this.router.navigate(['/login'], { queryParams: { volver: '/checkout' } });
  }

  confirmar(): void {
    this.error = null;

    // ── Modo MESA_QR: invitado con nombre, sin dirección ni pago (paga en caja) ──
    if (this.mesa.enMesa) {
      if (!this.mesa.ctx?.habilitada) {
        this.error = 'La mesa todavía no está habilitada para autoservicio. Pedile al mozo que la active.';
        return;
      }
      const nombre = (this.mesa.nombre || '').trim();
      if (!nombre) { this.error = 'Ingresá tu nombre para el pedido.'; return; }
      this.enviando = true;
      const payloadMesa: any = {
        tipoPedido: 'MESA_QR',
        mesaToken: this.mesa.token,
        nombreCliente: nombre,
        items: this.cart.toPedidoItems(),
        notas: this.notas.trim() || null,
      };
      this.api.call<any>('pedido.crear', [payloadMesa]).subscribe({
        next: (res) => {
          this.enviando = false;
          if (res?.success) {
            this.cart.limpiar();
            this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: res.numero } });
          } else {
            this.error = this.mensajeError(res);
          }
        },
        error: (e) => { this.enviando = false; this.error = 'No se pudo enviar el pedido. ' + (e?.message || ''); },
      });
      return;
    }

    const coords = this.lat != null && this.lng != null;
    const direccionFinal = this.manual
      ? this.direccion.trim()
      : (this.direccionMapa || (coords ? `UBICACIÓN GPS: ${this.lat!.toFixed(5)}, ${this.lng!.toFixed(5)}` : ''));
    if (this.tipo === 'DELIVERY') {
      if (this.manual) {
        if (!direccionFinal) { this.error = 'Ingresá tu dirección.'; return; }
      } else if (!coords) {
        this.error = 'Mové el mapa para marcar tu ubicación.'; return;
      }
    }
    this.enviando = true;
    const payload: any = {
      tipoPedido: this.tipo,
      items: this.cart.toPedidoItems(),
      direccionEntrega: this.tipo === 'DELIVERY' ? direccionFinal : null,
      referenciaDireccion: this.referencia.trim() || null,
      notas: this.notas.trim() || null,
      metodoPago: 'EFECTIVO',
    };
    if (this.tipo === 'DELIVERY' && !this.manual && coords) {
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
      case 'falta_ubicacion': return 'Indicá dónde entregamos: marcá el mapa o escribí tu dirección.';
      case 'falta_zona_delivery': return 'Elegí una zona de entrega.';
      case 'falta_direccion': return 'Ingresá la dirección.';
      case 'monto_minimo_global': return `El pedido mínimo es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'tienda_cerrada': return 'La tienda está cerrada en este momento.';
      case 'pickup_no_disponible': return 'El retiro no está disponible.';
      case 'delivery_no_disponible': return 'El delivery no está disponible.';
      case 'mesa_no_disponible': return 'Los pedidos en mesa no están habilitados.';
      case 'mesa_invalida': return 'El código de la mesa no es válido. Escaneá de nuevo el QR.';
      case 'mesa_no_habilitada': return 'La mesa no está habilitada. Pedile al mozo que active el autoservicio.';
      case 'falta_nombre': return 'Ingresá tu nombre para el pedido.';
      default: return res?.error || 'No se pudo crear el pedido.';
    }
  }
}
