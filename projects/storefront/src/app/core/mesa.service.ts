import { Injectable, inject } from '@angular/core';
import { PublicApiService } from './public-api.service';
import { MesaCtx } from './models';

/**
 * Modo MESA_QR: el cliente escanea el QR de la mesa (`/tienda?mesa=<token>`) y
 * se autoatiende. El token es opaco; el número de mesa y si el autoservicio está
 * habilitado se resuelven server-side (`mesa.get`). El pago es siempre en la caja
 * física, así que el checkout en este modo no pide dirección ni pago.
 */
@Injectable({ providedIn: 'root' })
export class MesaService {
  private api = inject(PublicApiService);
  private readonly KEY = 'sf_mesa_token';

  token: string | null = null;
  ctx: MesaCtx | null = null;
  cargando = false;
  /** Nombre del comensal (invitado) — obligatorio para pedir en mesa. */
  nombre = '';

  get enMesa(): boolean {
    return !!this.token;
  }

  /**
   * Captura el token de la URL (`?mesa=`) o de sessionStorage (persiste mientras
   * dura la pestaña) y resuelve el contexto de la mesa.
   */
  capturar(): void {
    let token: string | null = null;
    try {
      token = new URLSearchParams(window.location.search).get('mesa');
    } catch { /* noop */ }
    if (!token) {
      try { token = sessionStorage.getItem(this.KEY); } catch { /* noop */ }
    }
    if (!token) return;
    this.token = token;
    try { sessionStorage.setItem(this.KEY, token); } catch { /* noop */ }
    this.resolver();
  }

  private resolver(): void {
    if (!this.token) return;
    this.cargando = true;
    this.api.call<any>('mesa.get', [this.token]).subscribe({
      next: (res) => { this.cargando = false; this.ctx = res?.success ? res : null; },
      error: () => { this.cargando = false; this.ctx = null; },
    });
  }

  salir(): void {
    this.token = null;
    this.ctx = null;
    this.nombre = '';
    try { sessionStorage.removeItem(this.KEY); } catch { /* noop */ }
  }
}
