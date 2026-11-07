import { Component, OnInit, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { PublicApiService } from '../../core/public-api.service';
import { CartService, avisosRevalidacion } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { guardarSeguimiento } from '../../core/seguimiento';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { MesaService } from '../../core/mesa.service';
import { IconComponent } from '../../core/icon.component';
import { TipoPedido } from '../../core/models';
import { GuaraniPipe, guarani } from '../../core/guarani.pipe';
import { PrecioPipe } from '../../core/precio.pipe';
import { mensajeError } from '../../core/errores';
import { esUrlPagoPermitida } from '../../core/pago-online';
import { MonedasService } from '../../core/monedas.service';
import { MonedaTienda, convertir, formatear, parsearMonto, sugerenciasVuelto } from '../../core/moneda-tienda';

/** F8: métodos para pagar al recibir / retirar (el local elige cuáles ofrece). */
const METODOS: Record<string, { label: string; icono: string; ayuda: string }> = {
  EFECTIVO: { label: 'Efectivo', icono: 'cash', ayuda: '' },
  TARJETA_POS: { label: 'Tarjeta', icono: 'card', ayuda: 'Pagás con tarjeta (débito o crédito) en el POS al recibir o retirar.' },
  QR: { label: 'QR', icono: 'qr', ayuda: 'Te mostramos el QR al recibir o retirar el pedido.' },
  PIX: { label: 'PIX', icono: 'qr', ayuda: 'Pagás por PIX al recibir o retirar el pedido.' },
  TRANSFERENCIA: { label: 'Transferencia', icono: 'transfer', ayuda: 'Transferís al recibir o retirar; te pasamos los datos en ese momento.' },
  // F8b: sólo si la tienda lo ofrece y la cuenta está vinculada con crédito (lo arma `recalcularPago`).
  CREDITO: { label: 'A cuenta', icono: 'card', ayuda: 'Se carga a tu cuenta del local y lo pagás a fin de mes.' },
};

declare const L: any;

const IDEM_STORAGE = 'sf-pedido-idem';

@Component({
  selector: 'sf-checkout',
  standalone: true,
  imports: [GuaraniPipe, PrecioPipe, CommonModule, FormsModule, IconComponent],
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
  private menuSvc = inject(MenuService);
  /** Cambios de precio o productos quitados al revalidar contra la carta. */
  avisos: string[] = [];
  /**
   * La cuenta entró con Google o email y no tiene teléfono: se pide uno de contacto (avisos del
   * pedido por WhatsApp, y el repartidor lo puede llamar). Queda en la cuenta para la próxima.
   */
  telefonoContacto = '';
  get pideTelefono(): boolean {
    return !this.mesa.enMesa && this.auth.isAuthenticated && !this.auth.cuenta?.telefono;
  }

  /** M5: la cuenta entró por código y nunca cargó su nombre; se pide acá. */
  nombreCuenta = '';
  get faltaNombreCuenta(): boolean {
    return !this.mesa.enMesa && this.auth.isAuthenticated && !String(this.auth.cuenta?.nombre || '').trim();
  }

  tipo: TipoPedido = 'PICKUP';
  /** F4/F8: el método (UPAY = tarjeta online; el resto se paga al recibir o retirar). */
  metodoPago: string = 'EFECTIVO';
  monedas = inject(MonedasService);
  // ── F8: paso de pago. Todo precalculado: el template no calcula. ──
  modalidad: 'AL_RECIBIR' | 'ONLINE' = 'AL_RECIBIR';
  metodosDisponibles: { valor: string; label: string; icono: string; ayuda: string }[] = [];
  ayudaMetodo = '';
  /** F8b: eligió «A cuenta» y el disponible no alcanza para este total. */
  aCuentaNoAlcanza = false;
  monedaPago: MonedaTienda | null = null;
  necesitaVuelto = false;
  vueltoPara: number | null = null;
  /** Lo que escribe el cliente («10,50»); `vueltoPara` es su valor numérico. */
  vueltoTexto = '';
  sugerencias: { valor: number; texto: string }[] = [];
  totalEnMonedaPago = 0;
  totalEnMonedaPagoTexto = '';
  vueltoEstimadoTexto = '';
  pagoObservacion = '';
  get pagoOnline(): boolean {
    return !this.mesa.enMesa && !!this.config.config?.pagoOnline;
  }
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

  /** Config y monedas llegan en paralelo: cuando llegan (o cambia la moneda), el pago se recalcula. */
  private subsPago: { unsubscribe(): void }[] = [];

  ngOnInit(): void {
    this.telefonoContacto = this.auth.cuenta?.telefonoContacto || '';
    this.subsPago.push(this.config.cambios$.subscribe(() => this.recalcularPago()));
    // F8b: si puede comprar a cuenta y cuánto le queda (el servidor lo vuelve a validar al pedir).
    if (!this.mesa.enMesa && this.auth.isAuthenticated) {
      this.auth.cargarCredito().subscribe({ next: () => this.recalcularPago(), error: () => {} });
    }
    this.subsPago.push(this.monedas.cambios.subscribe(() => { this.monedaPago = null; this.recalcularPago(); }));
    this.menuSvc.cargar(true).subscribe({
      next: (m) => {
        this.avisos = avisosRevalidacion(this.cart.revalidar(m));
        if (!this.cart.items.length) { this.router.navigate(['/carrito']); return; }
        this.recomputar();
      },
      error: () => {}, // sin carta: el server valida igual al confirmar
    });
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
    this.subsPago.forEach((x) => x.unsubscribe());
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
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
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
    this.recalcularPago();
  }

  // ─── F8: pago ──────────────────────────────────────────────────────────

  /** Métodos que ofrece la tienda (config) y estado derivado del paso de pago. */
  recalcularPago(): void {
    const ofrecidos: string[] = [...(this.config.config?.metodosPago || ['EFECTIVO'])];
    if (!this.mesa.enMesa && this.config.config?.compraACuenta && this.auth.credito) ofrecidos.push('CREDITO');
    this.metodosDisponibles = ofrecidos.filter((m) => METODOS[m]).map((m) => ({ valor: m, ...METODOS[m] }));
    if (this.modalidad === 'ONLINE' && !this.pagoOnline) this.modalidad = 'AL_RECIBIR';
    if (this.modalidad === 'AL_RECIBIR' && !this.metodosDisponibles.some((m) => m.valor === this.metodoPago)) {
      this.metodoPago = this.metodosDisponibles[0]?.valor || 'EFECTIVO';
    }
    if (this.modalidad === 'ONLINE') this.metodoPago = this.config.config?.pagoOnlineProveedor || 'UPAY';
    this.ayudaMetodo = METODOS[this.metodoPago]?.ayuda || '';
    this.aCuentaNoAlcanza = false;
    if (this.metodoPago === 'CREDITO' && this.auth.credito) {
      const disp = this.auth.credito.disponible;
      if (!this.auth.credito.sinTope && disp != null) {
        this.aCuentaNoAlcanza = disp < this.total;
        this.ayudaMetodo = this.aCuentaNoAlcanza
          ? `No te alcanza: tenés ${guarani(disp)} disponibles a cuenta. Elegí otro medio de pago.`
          : `${this.ayudaMetodo} Disponible: ${guarani(disp)}.`;
      }
    }
    // Moneda del efectivo: por defecto, la que eligió para ver la carta.
    if (!this.monedaPago || !this.monedas.monedas.some((m) => m.id === this.monedaPago!.id)) {
      this.monedaPago = this.monedas.seleccionada || this.monedas.principal;
    }
    const m = this.monedaPago;
    if (!m) { this.sugerencias = []; this.totalEnMonedaPagoTexto = ''; this.vueltoEstimadoTexto = ''; return; }
    this.totalEnMonedaPago = convertir(this.total, m);
    this.totalEnMonedaPagoTexto = formatear(this.totalEnMonedaPago, m);
    this.sugerencias = sugerenciasVuelto(this.totalEnMonedaPago, m.billetes).map((v) => ({ valor: v, texto: formatear(v, m) }));
    this.calcularVueltoEstimado();
  }

  elegirModalidad(mod: 'AL_RECIBIR' | 'ONLINE'): void { this.modalidad = mod; this.recalcularPago(); }
  elegirMetodo(valor: string): void { this.metodoPago = valor; this.recalcularPago(); }
  elegirMonedaPago(m: MonedaTienda): void { this.monedaPago = m; this.vueltoPara = null; this.vueltoTexto = ''; this.recalcularPago(); }
  elegirSugerencia(v: number): void {
    this.vueltoPara = v;
    this.vueltoTexto = this.monedaPago ? formatear(v, this.monedaPago).replace(`${this.monedaPago.simbolo} `, '') : String(v);
    this.calcularVueltoEstimado();
  }
  onVueltoTexto(): void { this.vueltoPara = parsearMonto(this.vueltoTexto); this.calcularVueltoEstimado(); }

  /** «Te damos de vuelto ₲ 75.000»: el vuelto va siempre en la principal. */
  calcularVueltoEstimado(): void {
    const m = this.monedaPago, p = this.monedas.principal;
    const v = Number(this.vueltoPara);
    if (!this.necesitaVuelto || !m || !p || !(v > this.totalEnMonedaPago)) { this.vueltoEstimadoTexto = ''; return; }
    const vuelto = Math.max(0, Math.round(v * (m.principal ? 1 : m.cotizacion) - this.total));
    this.vueltoEstimadoTexto = `Te damos de vuelto ${formatear(vuelto, p)} (aprox.)`;
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
    if (!this.mesa.enMesa && this.modalidad === 'AL_RECIBIR' && this.metodoPago === 'CREDITO' && this.aCuentaNoAlcanza) {
      this.error = 'No te alcanza el crédito disponible para este pedido. Elegí otro medio de pago.';
      return;
    }

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
        idempotencyKey: this.claveIntento(),
        items: this.cart.toPedidoItems(),
        notas: this.notas.trim() || null,
      };
      this.api.call<any>('pedido.crear', [payloadMesa]).subscribe({
        next: (res) => {
          this.enviando = false;
          this.idemKey = null;
          if (res?.success) {
            this.cart.limpiar();
            if (res.seguimientoToken) guardarSeguimiento(res.seguimientoToken);
            this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: res.numero } });
          } else {
            this.error = this.mensajeError(res);
          }
        },
        error: (e) => { this.enviando = false; this.error = mensajeError(e, 'No se pudo enviar el pedido. Probá de nuevo.'); },
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
        this.error = `El mínimo para tu zona es ${guarani(this.montoMinimoZona)}. Tu pedido suma ${guarani(this.cart.subtotal)}.`;
        return;
      }
    }
    this.enviando = true;
    const payload: any = {
      tipoPedido: this.tipo,
      idempotencyKey: this.claveIntento(),
      items: this.cart.toPedidoItems(),
      direccionEntrega: this.tipo === 'DELIVERY' ? direccionFinal : null,
      referenciaDireccion: this.referencia.trim() || null,
      notas: this.notas.trim() || null,
      metodoPago: this.metodoPago,
      pagoObservacion: this.pagoObservacion.trim() || null,
    };
    if (this.metodoPago === 'EFECTIVO' && this.monedaPago) {
      payload.pagoMonedaId = this.monedaPago.id;
      if (this.necesitaVuelto) {
        // Redondeado a los decimales de la moneda, como lo guarda el servidor.
        const f = Math.pow(10, Math.max(0, this.monedaPago.decimales));
        const v = Math.round(Number(this.vueltoPara) * f) / f;
        if (!(v > this.totalEnMonedaPago)) {
          this.enviando = false;
          this.error = `«Vuelto para» tiene que ser mayor que el total (${this.totalEnMonedaPagoTexto}).`;
          return;
        }
        payload.vueltoPara = v;
      }
    }
    if (this.faltaNombreCuenta) {
      const nombre = this.nombreCuenta.trim();
      if (!nombre) { this.enviando = false; this.error = 'Ingresá tu nombre para el pedido.'; return; }
      payload.nombreCliente = nombre;
    }
    if (this.pideTelefono) {
      const digitos = this.telefonoContacto.replace(/\D+/g, '');
      if (digitos.length < 8 || digitos.length > 15) {
        this.enviando = false;
        this.error = 'Ingresá un teléfono válido para que podamos avisarte y contactarte.';
        return;
      }
      payload.telefonoContacto = this.telefonoContacto;
    }
    if (this.tipo === 'DELIVERY' && coords) {
      payload.latitud = this.lat; payload.longitud = this.lng;
    }
    this.api.call<any>('pedido.crear', [payload]).subscribe({
      next: (res) => {
        this.enviando = false;
        this.idemKey = null;
        if (res?.success) {
          if (this.faltaNombreCuenta && this.auth.cuenta) this.auth.cuenta.nombre = this.nombreCuenta.trim().toUpperCase();
          if (this.pideTelefono && this.auth.cuenta) this.auth.cuenta.telefonoContacto = this.telefonoContacto.replace(/\D+/g, '');
          this.cart.limpiar();
          // Tarjeta: a la página del proveedor (solo si la dirección es de un host suyo). Si el
          // proveedor arma su formulario en nuestra página (Bancard), va a /pago/<numero>.
          if (res.checkoutUrl) {
            if (esUrlPagoPermitida(res.checkoutUrl, res.pagoHosts || this.config.config?.pagoOnlineHosts)) { window.location.href = res.checkoutUrl; return; }
            this.router.navigate(['/pago', res.numero]);
            return;
          }
          this.router.navigate(['/mis-pedidos'], { queryParams: { nuevo: res.numero } });
        }
        else this.error = this.mensajeError(res);
      },
      error: (e) => { this.enviando = false; this.error = mensajeError(e, 'No se pudo enviar el pedido. Probá de nuevo.'); },
    });
  }

  /**
   * Clave de idempotencia del intento: se mantiene mientras el envío falle por red (el
   * server pudo haberlo guardado y el reintento devuelve ese mismo pedido) y se descarta
   * cuando el server contesta, con éxito o con un error de negocio (no se guardó nada).
   */
  private _idemKey: string | null = null;
  /**
   * F5 (auditoría M-F2-5): la clave también se guarda en sessionStorage, atada al contenido
   * del carrito: si el envío se cortó y el cliente recarga la página, el reintento reusa la
   * misma clave y no duplica el pedido. Si cambió el carrito, es otro pedido y otra clave.
   */
  private get idemKey(): string | null { return this._idemKey; }
  private set idemKey(v: string | null) {
    this._idemKey = v;
    if (v == null) { try { sessionStorage.removeItem(IDEM_STORAGE); } catch { /* sin storage */ } }
  }
  private claveIntento(): string {
    const firma = JSON.stringify(this.cart.toPedidoItems());
    if (!this._idemKey) {
      try {
        const g = JSON.parse(sessionStorage.getItem(IDEM_STORAGE) || 'null');
        if (g?.firma === firma && typeof g?.clave === 'string') this._idemKey = g.clave;
      } catch { /* sin storage o dato roto */ }
    }
    if (!this._idemKey) {
      const c: any = (globalThis as any).crypto;
      this._idemKey = typeof c?.randomUUID === 'function'
        ? c.randomUUID()
        : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
          const r = (Math.random() * 16) | 0;
          return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
        });
      try { sessionStorage.setItem(IDEM_STORAGE, JSON.stringify({ clave: this._idemKey, firma })); } catch { /* sin storage */ }
    }
    return this._idemKey!;
  }

  private mensajeError(res: any): string {
    switch (res?.error) {
      case 'monto_minimo_no_alcanzado': return `El mínimo para esta zona es ${guarani(res.montoMinimo)}. Tu subtotal es ${guarani(res.subtotal)}.`;
      case 'falta_ubicacion': return 'Indicá dónde entregamos: marcá el mapa o escribí tu dirección.';
      case 'falta_zona_delivery': return 'Elegí una zona de entrega.';
      case 'falta_direccion': return 'Ingresá la dirección.';
      case 'falta_ubicacion_mapa': return 'Marcá en el mapa dónde entregamos.';
      case 'fuera_de_cobertura': return 'Todavía no llegamos a esa zona. Podés elegir Retiro, o escribirnos.';
      case 'delivery_no_disponible': return 'Por ahora no hacemos delivery por la tienda. Podés elegir Retiro.';
      case 'monto_minimo_global': return `El pedido mínimo es ${guarani(res.montoMinimo)}. Tu subtotal es ${guarani(res.subtotal)}.`;
      case 'tienda_cerrada': return 'La tienda está cerrada en este momento.';
      case 'pickup_no_disponible': return 'El retiro no está disponible.';
      case 'mesa_no_disponible': return 'Los pedidos en mesa no están habilitados.';
      case 'mesa_invalida': return 'El código de la mesa no es válido. Escaneá de nuevo el QR.';
      case 'mesa_no_habilitada': return 'La mesa no está habilitada. Pedile al mozo que active el autoservicio.';
      case 'fuera_de_red_local': return 'Para pedir en la mesa tenés que estar conectado al WiFi del local.';
      case 'falta_nombre': return 'Ingresá tu nombre para el pedido.';
      case 'falta_telefono': return 'Ingresá un teléfono para que podamos avisarte y contactarte.';
      case 'telefono_invalido': return 'Ese teléfono no parece válido. Revisalo, por favor.';
      case 'metodo_pago_no_disponible': return 'Ese medio de pago no está disponible ahora. Elegí otro.';
      case 'vuelto_insuficiente': return 'El monto para el vuelto tiene que ser mayor que el total.';
      case 'vuelto_invalido': return 'Revisá el monto para el vuelto.';
      case 'moneda_no_disponible': return 'Esa moneda ya no se acepta. Elegí otra.';
      case 'pago_no_iniciado': return 'No pudimos abrir el pago con tarjeta. Probá de nuevo o elegí efectivo.';
      default: return mensajeError(res?.error, 'No se pudo crear el pedido. Probá de nuevo.');
    }
  }
}
