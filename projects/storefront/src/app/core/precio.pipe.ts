import { Pipe, PipeTransform, inject } from '@angular/core';
import { MonedasService } from './monedas.service';
import { MonedaTienda } from './moneda-tienda';

/**
 * Precio en la moneda que eligió el cliente para ver la carta (F8). Puro: la moneda va como
 * argumento (`valor | precio: monedas.seleccionada`), así se recalcula sólo cuando cambia el
 * monto o la moneda, no en cada ciclo. Lo que se registra (mis pedidos, pago) sigue con `guarani`.
 */
@Pipe({ name: 'precio', standalone: true })
export class PrecioPipe implements PipeTransform {
  private monedas = inject(MonedasService);
  transform(valorPrincipal: number | null | undefined, moneda?: MonedaTienda | null): string {
    return this.monedas.texto(valorPrincipal, moneda ?? this.monedas.seleccionada);
  }
}
