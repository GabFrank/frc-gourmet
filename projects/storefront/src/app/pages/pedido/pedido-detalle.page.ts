import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, firstValueFrom, merge } from 'rxjs';
import { PublicApiService } from '../../core/public-api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { CartService } from '../../core/cart.service';
import { MenuService } from '../../core/menu.service';
import { MonedasService } from '../../core/monedas.service';
import { GuaraniPipe } from '../../core/guarani.pipe';
import { IconComponent } from '../../core/icon.component';
import { PedidoResumen } from '../../core/models';
import { VistaEstadoPedido, vistaEstadoPedido } from '../../core/estado-pedido';
import { textoEstadoPago } from '../../core/pago-online';
import { mensajeError } from '../../core/errores';
import { lineasDesdePedido } from '../../core/repetir-pedido';
import { textoCompartirPedido, urlTelefono, urlWhatsapp } from '../../core/compartir-pedido';
import { detallePersonalizacion, textoPagoCliente } from './pedido-detalle.utils';

const TERMINALES = ['ENTREGADO', 'RECHAZADO', 'CANCELADO'];
const TIPOS: Record<string, string> = { PICKUP: 'Retiro en el local', DELIVERY: 'Delivery', MESA_QR: 'En la mesa' };

type Confirmando = null | 'cancelar' | 'modificar';

/**
 * F9: detalle de un pedido del cliente, con lo que puede hacer según en qué está:
 * pedir que se cancele (lo resuelve el local), modificarlo mientras espera confirmación (se
 * cancela y vuelve al carrito), repetirlo, compartirlo y comunicarse con el local.
 * Qué botones hay lo decide el servidor (`pedido.acciones`); la página sólo los muestra.
 */
@Component({
  selector: 'sf-pedido-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, GuaraniPipe, IconComponent],
  templateUrl: './pedido-detalle.page.html',
  styleUrls: ['./pedido-detalle.page.scss'],
})
export class PedidoDetallePage implements OnInit, OnDestroy {
  private api = inject(PublicApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private cart = inject(CartService);
  private menu = inject(MenuService);
  private monedas = inject(MonedasService);
  private cfg = inject(ConfigService);
  auth = inject(AuthService);

  numero = '';
  pedido: (PedidoResumen & { items: any[] }) | null = null;
  vista: VistaEstadoPedido | null = null;
  tipoLabel = '';
  pagoTexto: string | null = null;
  pagoTarjeta: string | null = null;
  /** Solicitud de cancelación en manos del local (y todavía cancelable). */
  cancelacionPendiente = false;
  /** El local respondió que no se puede cancelar. */
  respuestaLocal: string | null = null;
  acciones = { solicitarCancelacion: false, modificar: false, repetir: false, compartir: false };

  cargando = true;
  noEncontrado = false;
  /** Error al cargar el pedido (arriba de la página; lo borra la siguiente carga buena). */
  errorCarga: string | null = null;
  /** Resultado de una acción (se muestra junto a los botones). */
  error: string | null = null;
  ok: string | null = null;
  trabajando = false;
  confirmando: Confirmando = null;
  motivo = '';
  copiado = false;

  // Enlaces precalculados (el template no llama funciones).
  waCompartir: string | null = null;
  puedeCompartirNativo = false;
  telLocal: string | null = null;
  waLocal: string | null = null;

  private poll: any = null;
  private crudo: any = null;
  private subs = new Subscription();

  ngOnInit(): void {
    this.numero = String(this.route.snapshot.paramMap.get('numero') || '');
    this.puedeCompartirNativo = typeof navigator !== 'undefined' && typeof (navigator as any).share === 'function';
    if (!this.auth.isAuthenticated) { this.cargando = false; return; }
    if (!this.monedas.monedas.length) this.monedas.cargar();
    // Monedas y config pueden llegar después del pedido: el pago y los enlaces se recalculan.
    this.subs.add(merge(this.monedas.cambios, this.cfg.cambios$).subscribe(() => { if (this.crudo) this.aplicar(this.crudo); }));
    this.cargar();
    this.poll = setInterval(() => this.cargar(), 12000);
  }

  ngOnDestroy(): void {
    if (this.poll) clearInterval(this.poll);
    this.subs.unsubscribe();
  }

  cargar(): void {
    this.api.call<any>('pedido.estado', [this.numero]).subscribe({
      next: (res) => {
        this.cargando = false;
        if (res?.success && res.pedido) {
          this.noEncontrado = false;
          this.errorCarga = null;
          this.aplicar(res.pedido);
        } else if (res?.error === 'pedido_no_encontrado') {
          this.noEncontrado = true;
          this.pararPoll();
        } else {
          this.errorCarga = mensajeError(res?.error);
          // Sesión vencida o cuenta inactiva: insistir cada 12 s no lo arregla.
          if (['no_autenticado', 'cliente_no_autenticado', 'cuenta_invalida'].includes(res?.error)) this.pararPoll();
        }
      },
      error: (e) => {
        this.cargando = false;
        if (!this.pedido) this.errorCarga = mensajeError(e);
        if (e?.status === 401) this.pararPoll();
      },
    });
  }

  private aplicar(p: any): void {
    this.crudo = p;
    this.pedido = {
      ...p,
      items: (p.items || []).map((it: any) => ({ ...it, detalle: detallePersonalizacion(it.personalizacion) })),
    };
    this.vista = vistaEstadoPedido(p.estado, p.tipoPedido);
    this.tipoLabel = TIPOS[p.tipoPedido] || p.tipoPedido;
    this.pagoTexto = textoPagoCliente(p, this.monedas.monedas);
    this.pagoTarjeta = textoEstadoPago(p.estadoPago, p.pagoMonto ?? p.total, p.metodoPago);
    this.acciones = { solicitarCancelacion: false, modificar: false, repetir: false, compartir: false, ...(p.acciones || {}) };
    this.cancelacionPendiente = !!p.cancelacionSolicitadaEn && !TERMINALES.includes(p.estado);
    this.respuestaLocal = !p.cancelacionSolicitadaEn && p.cancelacionRespuesta && !TERMINALES.includes(p.estado)
      ? p.cancelacionRespuesta : null;
    const comercio = this.cfg.config.nombreComercio;
    const texto = textoCompartirPedido(p, { comercio, estado: this.vista.chip });
    this.waCompartir = urlWhatsapp(texto);
    const tel = this.cfg.config.telefonoContacto || null;
    this.telLocal = urlTelefono(tel);
    this.waLocal = tel ? urlWhatsapp(`Hola, te escribo por mi pedido ${p.numero}.`, tel) : null;
    if (TERMINALES.includes(p.estado)) this.pararPoll();
  }

  private pararPoll(): void {
    if (this.poll) { clearInterval(this.poll); this.poll = null; }
  }

  async copiarNumero(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.numero);
      this.copiado = true;
      setTimeout(() => (this.copiado = false), 2000);
    } catch { /* sin portapapeles: el número igual se ve */ }
  }

  async compartirNativo(): Promise<void> {
    if (!this.pedido) return;
    const text = textoCompartirPedido(this.pedido, { comercio: this.cfg.config.nombreComercio, estado: this.vista?.chip });
    try { await (navigator as any).share({ title: `Pedido ${this.numero}`, text }); } catch { /* el cliente cerró el menú */ }
  }

  pedirConfirmacion(c: Confirmando): void {
    this.confirmando = c;
    this.error = null;
    this.ok = null;
    this.motivo = '';
    // El botón que tenía el foco desaparece: el foco pasa al panel (teclado y lector de pantalla).
    setTimeout(() => {
      const id = c === 'cancelar' ? 'motivo' : c === 'modificar' ? 'titulo-modificar' : 'acciones-pedido';
      (document.getElementById(id) as HTMLElement | null)?.focus();
    });
  }

  async solicitarCancelacion(): Promise<void> {
    if (this.trabajando) return;
    this.trabajando = true;
    this.error = null;
    try {
      const res: any = await firstValueFrom(this.api.call('pedido.cancelacion.solicitar', [this.numero, this.motivo.trim() || null]));
      if (res?.success) {
        this.confirmando = null;
        this.ok = 'Listo, le avisamos al local. Te mostramos acá su respuesta.';
        this.aplicar(res.pedido);
      } else {
        this.error = res?.error === 'cancelacion_no_disponible'
          ? 'Tu pedido ya no se puede cancelar desde acá. Comunicate con el local.'
          : mensajeError(res?.error);
        this.cargar();
      }
    } catch (e) {
      this.error = mensajeError(e);
    } finally {
      this.trabajando = false;
    }
  }

  /** Cancela el pedido (sólo mientras el local no lo confirmó) y vuelve a armarlo en el carrito. */
  async modificar(): Promise<void> {
    if (this.trabajando || !this.pedido) return;
    this.trabajando = true;
    this.error = null;
    try {
      const res: any = await firstValueFrom(this.api.call('pedido.modificar', [this.numero]));
      if (!res?.success) {
        this.error = res?.error === 'modificar_no_disponible'
          ? 'El local ya está con tu pedido: ya no se puede modificar. Podés pedir que lo cancelen.'
          : mensajeError(res?.error);
        this.confirmando = null;
        this.cargar();
        return;
      }
      this.aplicar(res.pedido);
      // El carrito pasa a ser este pedido: lo que hubiera antes se reemplaza (así lo dice el aviso).
      await this.alCarrito(true);
    } catch (e) {
      // Si ya se canceló y lo que falló fue cargar la carta, el cliente tiene que saberlo.
      if (this.pedido?.estado === 'CANCELADO') {
        this.confirmando = null;
        this.error = 'Tu pedido quedó cancelado, pero no pudimos cargar la carta. Tocá «Repetir pedido» para volver a armarlo.';
      } else {
        this.error = mensajeError(e);
      }
    } finally {
      this.trabajando = false;
    }
  }

  async repetir(): Promise<void> {
    if (this.trabajando || !this.pedido) return;
    this.trabajando = true;
    this.error = null;
    try {
      await this.alCarrito(false);
    } catch (e) {
      this.error = mensajeError(e, 'No pudimos cargar la carta. Probá de nuevo.');
    } finally {
      this.trabajando = false;
    }
  }

  private async alCarrito(reemplazar: boolean): Promise<void> {
    const menu = await firstValueFrom(this.menu.cargar(true));
    const r = lineasDesdePedido(this.pedido!.items, menu);
    if (reemplazar) this.cart.limpiar();
    for (const l of r.lineas) this.cart.agregar(l);
    const avisos = [
      ...r.faltantes.map((n) => `«${n}» ya no está disponible como lo pediste: agregalo de nuevo desde la carta.`),
      ...r.avisos,
    ];
    if (!r.lineas.length) {
      // Nada para poner: se queda acá con el aviso (el pedido modificado ya está cancelado).
      this.confirmando = null;
      this.error = reemplazar
        ? 'Tu pedido quedó cancelado, pero sus productos ya no están en la carta como los pediste. Armalo de nuevo desde la carta.'
        : 'Los productos de este pedido ya no están en la carta como los pediste.';
      return;
    }
    this.router.navigate(['/carrito'], { state: { avisosRepetir: avisos } });
  }
}
