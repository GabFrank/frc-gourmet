import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';
import { HasPermissionDirective } from 'src/app/shared/directives/has-permission.directive';
import { firstValueFrom, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from '../../../services/auth.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';

/**
 * Bandeja de PEDIDOS ONLINE (Fase 4): panel de OBSERVACIÓN Y ACCIÓN.
 *
 * ⚠️ DOS PANTALLAS, UN PEDIDO (F10). La pantalla de ATENCIÓN es la cola del diálogo de delivery
 * del PdV (`delivery-dialog.component.ts`): ahí se acepta, rechaza, responde la cancelación, se
 * manda a cocina y se registra la devolución. Esta bandeja sigue viva para mirar todos los pedidos
 * (historial, filtros, mesa QR) y actuar sin entrar al PdV. Toda regla o acción nueva de atención
 * va en LAS DOS, o la una muestra algo que la otra no sabe hacer. Detalle en
 * .claude/skills/frc-gourmet-expert/domains/pedidos-online.md, «Dos pantallas, un pedido».
 */
@Component({
  selector: 'app-list-pedidos-online',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatSnackBarModule,
    MatDialogModule,
    HasPermissionDirective,
  ],
  templateUrl: './list-pedidos-online.component.html',
  styleUrls: ['./list-pedidos-online.component.scss'],
})
export class ListPedidosOnlineComponent implements OnInit, OnDestroy {
  pedidos: any[] = [];
  cargando = false;
  filtroEstado = 'ACTIVOS';
  confirmandoRechazoId: number | null = null;
  /** F9: pedido cuya solicitud de cancelación se está respondiendo (y con qué). */
  resolviendoId: number | null = null;
  resolviendoAprobar = false;
  respuestaCancelacion = '';
  resolviendo = false;

  private timer: any = null;

  readonly estados = [
    { value: 'ACTIVOS', label: 'Activos' },
    // F10: lo mismo que la cola del diálogo de delivery (y el badge del PdV).
    { value: 'ATENCION', label: 'Para atender' },
    { value: 'SOLICITUD_CANCELACION', label: 'Piden cancelar' },
    { value: 'PENDIENTE_PAGO', label: 'Esperando pago' },
    { value: 'RECIBIDO', label: 'Recibidos' },
    { value: 'ACEPTADO', label: 'Aceptados' },
    { value: 'EN_PREPARACION', label: 'En preparación' },
    { value: 'LISTO', label: 'Listos' },
    { value: 'EN_CAMINO', label: 'En camino' },
    { value: 'ENTREGADO', label: 'Entregados' },
    { value: 'RECHAZADO', label: 'Rechazados' },
    { value: 'CANCELADO', label: 'Cancelados' },
  ];

  private readonly estadoLabels: Record<string, string> = {
    PENDIENTE_PAGO: 'Esperando pago',
    RECIBIDO: 'Recibido',
    ACEPTADO: 'Aceptado',
    EN_PREPARACION: 'En preparación',
    LISTO: 'Listo',
    EN_CAMINO: 'En camino',
    ENTREGADO: 'Entregado',
    RECHAZADO: 'Rechazado',
    CANCELADO: 'Cancelado',
  };

  estadoLabel(estado: string): string {
    return this.estadoLabels[estado] || estado;
  }

  constructor(
    private repo: RepositoryService,
    private snack: MatSnackBar,
    private auth: AuthService,
    private dialog: MatDialog,
  ) {}

  private get api(): any {
    return (window as any).api;
  }

  /**
   * Recovery MESA_QR: materializa manualmente un pedido de mesa que no se
   * materializó solo (ej. no había caja abierta al crearse) → lo vuelca en la
   * cuenta de la mesa y lo manda a cocina. Resuelve la única caja abierta; si hay
   * más de una, avisa (habría que materializar desde el PdV de esa caja).
   */
  async enviarACocina(p: any): Promise<void> {
    const usuarioId = this.auth.currentUser?.id;
    const caja: any = usuarioId
      ? await firstValueFrom(this.repo.getCajaAbiertaByUsuario(usuarioId).pipe(catchError(() => of(null))))
      : null;
    this.api.callIpc('materializar-pedido-online-en-venta', p.id, caja?.id ? { cajaId: caja.id } : undefined).then((res: any) => {
      if (res?.ventaId) {
        this.snack.open(`Pedido ${p.numero} enviado a cocina`, 'OK', { duration: 2500 });
        this.cargar(true);
      } else {
        this.snack.open('No se pudo enviar a cocina', 'OK', { duration: 3500 });
      }
    }).catch((e: any) => {
      const msg = String(e?.message || e);
      const amigable = /no_hay_caja_abierta/.test(msg) ? 'No hay una caja abierta.'
        : /pedido_sin_pago_confirmado/.test(msg) ? 'El pago con tarjeta todavía no está confirmado.'
        : /pedido_no_aceptado|no_materializable/.test(msg) ? 'Primero hay que aceptar el pedido.'
        : /caja_ambigua/.test(msg) ? 'Hay más de una caja abierta; abrí el pedido desde el PdV de la caja correspondiente.'
        : msg;
      this.snack.open('No se pudo enviar a cocina: ' + amigable, 'OK', { duration: 5000 });
    });
  }

  ngOnInit(): void {
    this.cargar();
    // Auto-refresh cada 15s para detectar pedidos nuevos.
    this.timer = setInterval(() => this.cargar(true), 15000);
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  cargar(silencioso = false): void {
    if (!silencioso) this.cargando = true;
    const filtros: any = {};
    if (this.filtroEstado === 'ACTIVOS') {
      filtros.estados = ['RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO', 'EN_CAMINO'];
    } else if (this.filtroEstado === 'ATENCION') {
      filtros.atencion = true;
    } else if (this.filtroEstado === 'SOLICITUD_CANCELACION') {
      filtros.cancelacionPendiente = true;
    } else {
      filtros.estado = this.filtroEstado;
    }
    this.repo.getPedidosOnlineAdmin(filtros).subscribe({
      next: (res) => {
        // El detalle de cada ítem se calcula acá: el template no llama funciones.
        this.pedidos = (res || []).map((p: any) => ({
          ...p,
          siguiente: this.siguienteEstado(p),
          // Pre-computados: el template no llama funciones.
          estadoTexto: this.estadoLabel(p.estado),
          tipoTexto: this.tipoLabel(p.tipoPedido),
          pagoTexto: p.metodoPago && !p.pagoResumen ? this.pagoLabel(p.metodoPago) : '',
          insignia: this.pagoInsignia(p),
          mapa: this.mapaUrl(p),
          // F10: con qué números aparece en el PdV (lista de delivery, ticket, venta).
          numerosPdv: [
            p.deliveryId ? `${p.tipoPedido === 'PICKUP' ? 'Retiro' : 'Delivery'} N° ${p.deliveryId}` : '',
            p.ventaId ? `Venta #${p.ventaId}` : '',
          ].filter(Boolean).join(' · '),
          // F9: el cliente pidió cancelar y espera respuesta.
          pideCancelar: !!p.cancelacionSolicitadaEn && ['RECIBIDO', 'ACEPTADO', 'EN_PREPARACION', 'LISTO'].includes(p.estado),
          items: (p.items || []).map((it: any) => ({ ...it, ...this.detalleItem(it) })),
        }));
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      },
    });
  }

  /**
   * Acepta y materializa contra la caja abierta del usuario (si tiene una). El server
   * nunca crea la venta sin caja abierta: si falla, el pedido queda aceptado y se le
   * muestra al operador por qué no llegó a cocina (PLAN-tienda-online M7).
   */
  aceptar(p: any): void {
    const usuarioId = this.auth.currentUser?.id;
    const caja$ = usuarioId
      ? this.repo.getCajaAbiertaByUsuario(usuarioId).pipe(catchError(() => of(null)))
      : of(null);
    caja$.pipe(
      switchMap((caja: any) => this.repo.aceptarPedidoOnline(p.id, caja?.id ? { cajaId: caja.id } : undefined)),
    ).subscribe({
      next: (res) => {
        if (res?.success) {
          if (res.errorMaterializacion) {
            this.snack.open(
              `Pedido ${p.numero} aceptado, pero no llegó a cocina: ${this.motivoMaterializacion(res.errorMaterializacion)}`,
              'OK', { duration: 8000 },
            );
          } else {
            this.snack.open(`Pedido ${p.numero} aceptado`, 'OK', { duration: 2500 });
          }
          this.cargar(true);
        } else if (res?.error === 'sin_caja') {
          this.snack.open('Para aceptar un pedido tenés que tener tu caja abierta.', 'OK', { duration: 5000 });
        } else {
          this.snack.open('No se pudo aceptar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  motivoMaterializacion(msg: string): string {
    if (/no_hay_caja_abierta/.test(msg)) return 'no hay una caja abierta. Abrí una caja y usá «Enviar a cocina».';
    if (/caja_ambigua/.test(msg)) return 'hay más de una caja abierta. Abrí el pedido desde el PdV de la caja que corresponde.';
    return msg;
  }

  tipoLabel(tipo: string): string {
    return ({ PICKUP: 'Retiro', DELIVERY: 'Delivery', MESA_QR: 'Mesa (QR)' } as Record<string, string>)[tipo] || tipo;
  }

  pagoLabel(m: string): string {
    return ({ EFECTIVO: 'Efectivo', BANCARD: 'Bancard', UPAY: 'uPay', PAGOPAR: 'Pagopar' } as Record<string, string>)[m] || m;
  }

  /** Insignia del pago con tarjeta (F4); null en pedidos en efectivo. */
  pagoInsignia(p: any): { texto: string; clase: string } | null {
    switch (p?.estadoPago) {
      case 'PAGADO': return { texto: 'Pagado con tarjeta', clase: 'ok' };
      case 'PENDIENTE': return { texto: 'Esperando pago', clase: 'espera' };
      case 'FALLIDO': return { texto: 'Pago rechazado', clase: 'mal' };
      case 'EXPIRADO': return { texto: 'Pago vencido', clase: 'mal' };
      case 'REEMBOLSO_PENDIENTE': return { texto: `Devolver ₲ ${Number(p.pagoMonto || 0).toLocaleString('es-PY')}`, clase: 'mal' };
      case 'DEVUELTO': return { texto: 'Pago devuelto', clase: 'neutro' };
      default: return null;
    }
  }

  marcarDevuelto(p: any): void {
    const monto = Number(p.pagoMonto || 0).toLocaleString('es-PY');
    // El diálogo del repo, no `confirm()`: el nativo bloquea la ventana y no sigue el tema.
    this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: `Devolución de ${p.numero}`,
        message: `¿Ya devolviste ₲ ${monto} desde el panel de uPay?`,
        confirmText: 'Sí, ya devolví',
        cancelText: 'Volver',
      },
    }).afterClosed().subscribe((ok) => { if (ok) this.registrarDevuelto(p); });
  }

  private registrarDevuelto(p: any): void {
    this.repo.marcarPagoDevueltoPedidoOnline(p.id).subscribe({
      next: (res) => {
        if (res?.success) {
          this.snack.open(`Pedido ${p.numero}: devolución registrada`, 'OK', { duration: 2500 });
          this.cargar(true);
        } else {
          this.snack.open('No se pudo marcar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  /** Sabores, adicionales, preferencias y nota de la línea (lo que cocina tiene que ver). */
  /**
   * Lo que el cocinero tiene que leer de un ítem: la línea general (adicionales de la pizza,
   * observaciones, nota) y, si algún sabor se personalizó (F6b), una línea por sabor con lo
   * que se sacó, cambió y agregó.
   */
  private detalleItem(it: any): { detalle: string; detalleSabores: string[] } {
    let p = it?.personalizacion;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = null; } }
    if (!p) return { detalle: '', detalleSabores: [] };
    const sabores: any[] = Array.isArray(p.sabores) ? p.sabores : [];
    const detalleSabores = sabores
      .filter((s: any) => s?.personalizacion)
      .map((s: any) => {
        const ps = s.personalizacion;
        const partes = [
          ...(ps.quitados || []).map((q: any) => `SIN ${q.nombre}`),
          ...(ps.cambios || []).map((c: any) => `${c.nombre} → ${c.reemplazoNombre}`),
          ...(ps.adicionales || []).map((a: any) => `+ ${a.nombre}`),
        ].filter(Boolean);
        return partes.length ? `${s.nombre}: ${partes.join(', ')}` : '';
      })
      .filter(Boolean);
    const parts: string[] = [];
    if (sabores.length > 1) parts.push(sabores.map((s: any) => s.nombre).join(' / '));
    for (const a of p.adicionales || []) parts.push(`+ ${a.nombre}`);
    for (const o of p.observaciones || []) parts.push(typeof o === 'string' ? o : o?.descripcion);
    if (p.notaLibre) parts.push(`"${p.notaLibre}"`);
    return { detalle: parts.filter(Boolean).join(' · '), detalleSabores };
  }

  mapaUrl(p: any): string | null {
    if (p.latitud == null || p.longitud == null) return null;
    return `https://www.google.com/maps?q=${Number(p.latitud)},${Number(p.longitud)}`;
  }

  confirmarRechazo(p: any): void {
    this.confirmandoRechazoId = p.id;
  }

  cancelarRechazo(): void {
    this.confirmandoRechazoId = null;
  }

  rechazar(p: any): void {
    this.repo.rechazarPedidoOnline(p.id, 'RECHAZADO POR EL LOCAL').subscribe({
      next: (res) => {
        this.confirmandoRechazoId = null;
        if (res?.success) {
          const dev = Number(res.montoDevolver || 0);
          this.snack.open(
            dev > 0
              ? `Pedido ${p.numero} rechazado. Estaba pagado: devolvé ₲ ${dev.toLocaleString('es-PY')} desde uPay y marcalo como devuelto.`
              : `Pedido ${p.numero} rechazado`,
            'OK', { duration: dev > 0 ? 10000 : 2500 });
          this.cargar(true);
        } else {
          this.snack.open('No se pudo rechazar: ' + (res?.error || ''), 'OK', { duration: 3500 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  // ====== F9: solicitud de cancelación del cliente ======
  empezarResolucion(p: any, aprobar: boolean): void {
    this.resolviendoId = p.id;
    this.resolviendoAprobar = aprobar;
    this.respuestaCancelacion = '';
  }

  cancelarResolucion(): void {
    this.resolviendoId = null;
  }

  resolverCancelacion(p: any): void {
    if (this.resolviendo) return;
    this.resolviendo = true;
    const aprobar = this.resolviendoAprobar;
    this.repo.resolverCancelacionPedidoOnline(p.id, aprobar, this.respuestaCancelacion || undefined).subscribe({
      next: (res) => {
        this.resolviendo = false;
        if (res?.success) {
          this.resolviendoId = null;
          const dev = Number(res.montoDevolver || 0);
          this.snack.open(
            !aprobar ? `Se le avisó al cliente que ${p.numero} sigue en curso`
              : dev > 0 ? `Pedido ${p.numero} cancelado. Estaba pagado: devolvé ₲ ${dev.toLocaleString('es-PY')} desde uPay y marcalo como devuelto.`
              : `Pedido ${p.numero} cancelado`,
            'OK', { duration: dev > 0 ? 10000 : 3000 });
          this.cargar(true);
        } else {
          this.snack.open('No se pudo: ' + this.motivoResolucion(res), 'OK', { duration: 6000 });
        }
      },
      error: (e) => { this.resolviendo = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 5000 }); },
    });
  }

  /** El delivery explica por qué no avanza (p. ej. venta sin cobrar): se muestra eso, no el código. */
  private motivoAvance(res: any): string {
    switch (res?.error) {
      case 'sin_venta': return 'el pedido todavía no tiene venta. Usá «Enviar a cocina» con tu caja abierta.';
      case 'transicion_invalida': return `el pedido ya está en ${res?.estadoActual || 'otro estado'}. Actualizá la lista.`;
      case 'delivery_rechazo_transicion': return res?.detalle || 'el delivery no permite ese cambio.';
      case 'pedido_desfasado_del_delivery': return 'el delivery avanzó pero el pedido no. Repetí la acción.';
      default: return res?.detalle || res?.error || '';
    }
  }

  private motivoResolucion(res: any): string {
    switch (res?.error) {
      case 'mesa_ya_materializada': return 'el pedido ya está en la cuenta de la mesa. Quitá los ítems desde el PdV y después rechazá la solicitud.';
      case 'sin_solicitud': return 'la solicitud ya fue respondida.';
      case 'estado_no_rechazable': return 'el pedido ya no se puede cancelar (ya salió o terminó).';
      case 'pedido_cambio_reintentar': return 'el pedido cambió mientras tanto. Volvé a intentarlo.';
      default: return res?.detalle || res?.error || '';
    }
  }

  avanzar(p: any, nuevoEstado: string): void {
    this.repo.avanzarEstadoPedidoOnline(p.id, nuevoEstado).subscribe({
      next: (res) => {
        if (res?.success) {
          this.cargar(true);
        } else {
          this.snack.open('No se pudo actualizar: ' + this.motivoAvance(res), 'OK', { duration: 6000 });
        }
      },
      error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 }),
    });
  }

  /** Próximo estado sugerido según el estado actual y el tipo de pedido. */
  private siguienteEstado(p: any): { estado: string; label: string } | null {
    switch (p.estado) {
      case 'ACEPTADO':
        // F5 (C2): sin venta, el camino es «Enviar a cocina» (que crea la venta).
        if (!p.ventaId) return null;
        return { estado: 'EN_PREPARACION', label: 'Marcar en preparación' };
      case 'EN_PREPARACION':
        return { estado: 'LISTO', label: 'Marcar listo' };
      case 'LISTO':
        return p.tipoPedido === 'DELIVERY'
          ? { estado: 'EN_CAMINO', label: 'Enviar (en camino)' }
          : { estado: 'ENTREGADO', label: 'Marcar entregado' };
      case 'EN_CAMINO':
        return { estado: 'ENTREGADO', label: 'Marcar entregado' };
      default:
        return null;
    }
  }
}
