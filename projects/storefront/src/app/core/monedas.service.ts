import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { PublicApiService } from './public-api.service';
import { MonedaTienda, convertir, formatear } from './moneda-tienda';

const CLAVE = 'frc_sf_moneda';

/**
 * Moneda en la que el cliente VE la carta (F8). Sólo visual: el pedido y su total van en la
 * principal; otra moneda importa recién si paga en efectivo con ella (paso de pago).
 */
@Injectable({ providedIn: 'root' })
export class MonedasService {
  private api = inject(PublicApiService);
  monedas: MonedaTienda[] = [];
  principal: MonedaTienda | null = null;
  seleccionada: MonedaTienda | null = null;
  /** Hay más de una para elegir (si no, el selector no se muestra). */
  hayOtras = false;
  /** La elegida no es la principal: la carta avisa que los precios son aproximados. */
  esOtra = false;
  /** Avisa cuando llegan las monedas o cambia la elegida (el checkout se recalcula). */
  cambios = new Subject<void>();

  cargar(): void {
    this.api.call<any[]>('monedas.get').subscribe({
      next: (lista) => {
        this.monedas = Array.isArray(lista) ? lista : [];
        this.principal = this.monedas.find((m) => m.principal) || null;
        let id: number | null = null;
        try { id = Number(localStorage.getItem(CLAVE)) || null; } catch { id = null; }
        this.aplicar(this.monedas.find((m) => m.id === id) || this.principal);
      },
      error: () => { /* sin monedas: todo sigue en la principal */ },
    });
  }

  elegir(m: MonedaTienda): void {
    this.aplicar(m);
    try { localStorage.setItem(CLAVE, String(m.id)); } catch { /* sin almacenamiento: sólo esta visita */ }
  }

  private aplicar(m: MonedaTienda | null): void {
    this.seleccionada = m;
    this.hayOtras = this.monedas.length > 1;
    this.esOtra = !!m && !m.principal;
    this.cambios.next();
  }

  /** Texto de un monto (en la principal) en la moneda elegida. */
  texto(valorPrincipal: number | null | undefined, m: MonedaTienda | null = this.seleccionada): string {
    const mon = m || this.principal;
    if (!mon) return `₲ ${new Intl.NumberFormat('es-PY').format(Math.round(Number(valorPrincipal) || 0))}`;
    return formatear(convertir(Number(valorPrincipal) || 0, mon), mon);
  }
}
