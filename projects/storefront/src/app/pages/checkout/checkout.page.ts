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

  // Ubicación (mapa). El pin es obligatorio para DELIVERY: sin coordenadas no
  // hay zona que resolver y el envío no se puede cotizar.
  lat: number | null = null;
  lng: number | null = null;
  direccionMapa = '';
  private map: any = null;
  private geocodeT: any = null;

  costoEnvio = 0;
  total = 0;

  // Cotización del envío. La resuelve el servidor a partir del pin: la zona es
  // un dato interno del local y el cliente no la elige.
  cotizando = false;
  cubierto: boolean | null = null;
  zonaNombre: string | null = null;
  montoMinimoZona = 0;
  private cotizarT: any = null;

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
    clearTimeout(this.cotizarT);
    this.cotizarT = setTimeout(() => this.cotizarEnvio(c.lat, c.lng), 500);
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

  recomputar(): void {
    if (this.tipo !== 'DELIVERY') this.costoEnvio = 0;
    this.total = this.cart.subtotal + this.costoEnvio;
  }

  /**
   * Pregunta al servidor cuánto sale el envío a este punto. Es sólo una
   * previsualización para que el cliente decida con el precio a la vista: el
   * monto que se cobra lo recalcula el backend al crear el pedido.
   */
  private cotizarEnvio(lat: number, lng: number): void {
    if (this.tipo !== 'DELIVERY') return;
    this.cotizando = true;
    this.api.call<any>('envio.cotizar', [lat, lng]).subscribe({
      next: (res) => {
        this.cotizando = false;
        if (!res?.success) { this.cubierto = null; return; }
        this.cubierto = res.cubierto !== false;
        this.zonaNombre = res.zona?.nombre ?? null;
        this.montoMinimoZona = Number(res.montoMinimo) || 0;
        this.costoEnvio = this.cubierto ? (Number(res.costoEnvio) || 0) : 0;
        this.recomputar();
      },
      error: () => { this.cotizando = false; this.cubierto = null; },
    });
  }

  irLogin(): void {
    this.router.navigate(['/login'], { queryParams: { volver: '/checkout' } });
  }

  confirmar(): void {
    this.error = null;

    // ── Modo MESA_QR: invitado con nombre, sin dirección ni pago (paga en caja) ──
    if (this.mesa.enMesa) {
      if (!this.mesa.ctx) {
        this.error = 'No pudimos validar la mesa. Volvé a escanear el QR de la mesa.';
        return;
      }
      if (!this.mesa.ctx.habilitada) {
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
    // El pin manda: la dirección escrita es un complemento para el repartidor,
    // no un sustituto. Sin coordenadas no hay zona que resolver y el envío no se
    // puede cotizar.
    const direccionFinal = [
      this.direccion.trim(),
      this.direccionMapa,
    ].filter(Boolean).join(' · ')
      || (coords ? `UBICACIÓN GPS: ${this.lat!.toFixed(5)}, ${this.lng!.toFixed(5)}` : '');
    if (this.tipo === 'DELIVERY') {
      if (!coords) { this.error = 'Mové el mapa para marcar dónde entregamos.'; return; }
      if (this.cubierto === false) {
        this.error = 'Todavía no llegamos a esa zona. Podés elegir Retiro, o escribirnos.';
        return;
      }
      if (this.montoMinimoZona > 0 && this.cart.subtotal < this.montoMinimoZona) {
        this.error = `El mínimo para tu zona es ${this.montoMinimoZona}. Tu pedido suma ${this.cart.subtotal}.`;
        return;
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
    if (this.tipo === 'DELIVERY' && coords) {
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
      case 'falta_ubicacion_mapa': return 'Marcá en el mapa dónde entregamos.';
      case 'fuera_de_cobertura': return 'Todavía no llegamos a esa zona. Podés elegir Retiro, o escribirnos.';
      case 'monto_minimo_global': return `El pedido mínimo es ${res.montoMinimo}. Tu subtotal es ${res.subtotal}.`;
      case 'tienda_cerrada': return 'La tienda está cerrada en este momento.';
      case 'pickup_no_disponible': return 'El retiro no está disponible.';
      case 'delivery_no_disponible': return 'El delivery no está disponible.';
      case 'mesa_no_disponible': return 'Los pedidos en mesa no están habilitados.';
      case 'mesa_invalida': return 'El código de la mesa no es válido. Escaneá de nuevo el QR.';
      case 'mesa_no_habilitada': return 'La mesa no está habilitada. Pedile al mozo que active el autoservicio.';
      case 'fuera_de_red_local': return 'Para pedir en la mesa tenés que estar conectado al WiFi del local.';
      case 'falta_nombre': return 'Ingresá tu nombre para el pedido.';
      default: return res?.error || 'No se pudo crear el pedido.';
    }
  }
}
