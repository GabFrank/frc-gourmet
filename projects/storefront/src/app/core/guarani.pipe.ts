import { Pipe, PipeTransform } from '@angular/core';

const FMT = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });

/** Formato único de montos de la tienda: «₲ 110.000». */
export function guarani(n: number | null | undefined): string {
  return `₲ ${FMT.format(Math.round(Number(n) || 0))}`;
}

@Pipe({ name: 'guarani', standalone: true })
export class GuaraniPipe implements PipeTransform {
  transform(n: number | null | undefined): string {
    return guarani(n);
  }
}
