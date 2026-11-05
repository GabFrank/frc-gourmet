import { Pipe, PipeTransform, inject } from '@angular/core';
import { MonedasService } from './monedas.service';

/**
 * Precio en la moneda que eligió el cliente para ver la carta (F8). Impuro a propósito: cambia
 * cuando cambia la moneda, sin recargar la página. Lo que se registra (mis pedidos, pago) sigue
 * con `guarani`.
 */
@Pipe({ name: 'precio', standalone: true, pure: false })
export class PrecioPipe implements PipeTransform {
  private monedas = inject(MonedasService);
  transform(valorPrincipal: number | null | undefined): string {
    return this.monedas.texto(valorPrincipal);
  }
}
