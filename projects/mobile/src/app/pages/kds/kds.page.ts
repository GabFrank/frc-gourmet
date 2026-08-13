import { Component } from '@angular/core';
import { KdsComponent } from '@frc/shared-core';

/**
 * Ruta `/kds` del PWA para pantallas de cocina (Google/Xiaomi TV). Envuelve el
 * componente KDS compartido con el desktop. Corre a pantalla completa, fuera del
 * shell. La auth la maneja el authGuard + el shim HTTP (login + refresh): el TV
 * se loguea una vez con un usuario de servicio y el token se renueva solo.
 *
 * El componente KDS detecta que `window.api.callIpc` existe (shim HTTP) y hace
 * los pedidos autenticados a /api/rpc; el refresco en tiempo real usa el poll de
 * 12s (el SSE requiere token en query, no disponible en este modo).
 */
@Component({
  selector: 'app-kds-page',
  standalone: true,
  imports: [KdsComponent],
  template: '<app-kds></app-kds>',
  styles: [':host { display: block; width: 100%; height: 100%; }'],
})
export class KdsPage {}
