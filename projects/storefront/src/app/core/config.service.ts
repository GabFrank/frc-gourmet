import { Injectable } from '@angular/core';
import { PublicApiService } from './public-api.service';

export interface TiendaConfig {
  activa: boolean;
  abiertaAhora: boolean;
  nombreComercio: string | null;
  mensajeBienvenida: string | null;
  colorPrimario: string | null;
  permitePickup: boolean;
  permiteDelivery: boolean;
  prepTimeMinutos: number;
  montoMinimoPedido: number;
  googleClientId?: string | null;
}

/** Carga la config pública de la tienda y aplica el branding (nombre/color). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  config: TiendaConfig = {
    activa: true, abiertaAhora: true, nombreComercio: null, mensajeBienvenida: null,
    colorPrimario: null, permitePickup: true, permiteDelivery: true,
    prepTimeMinutos: 30, montoMinimoPedido: 0,
  };
  loaded = false;

  constructor(private api: PublicApiService) {}

  load(): void {
    this.api.call<TiendaConfig>('tienda.config').subscribe({
      next: (c) => {
        if (c) {
          this.config = c;
          if (c.colorPrimario) {
            document.documentElement.style.setProperty('--sf-primary', c.colorPrimario);
          }
        }
        this.loaded = true;
      },
      error: () => (this.loaded = true),
    });
  }
}
