import { Injectable } from '@angular/core';

/**
 * Recuerda dónde estaba el cliente en la carta (categoría elegida y altura de la
 * lista de cada una) para que al volver de un detalle no arranque de cero.
 * Vive en memoria y en sessionStorage, así sobrevive a una recarga de la página.
 */
@Injectable({ providedIn: 'root' })
export class MenuEstadoService {
  private static readonly KEY = 'sf.menu.estado';
  categoria: string | null = null;
  private scrollPorCategoria: Record<string, number> = {};

  constructor() {
    try {
      const raw = sessionStorage.getItem(MenuEstadoService.KEY);
      if (raw) {
        const s = JSON.parse(raw);
        this.categoria = typeof s?.categoria === 'string' ? s.categoria : null;
        this.scrollPorCategoria = s?.scroll && typeof s.scroll === 'object' ? s.scroll : {};
      }
    } catch { /* sin estado previo */ }
  }

  guardar(categoria: string | null, scrollY: number): void {
    this.categoria = categoria;
    if (categoria != null) this.scrollPorCategoria[categoria] = Math.max(0, Math.round(scrollY));
    this.persistir();
  }

  scrollDe(categoria: string | null): number {
    return categoria != null ? this.scrollPorCategoria[categoria] || 0 : 0;
  }

  private persistir(): void {
    try {
      sessionStorage.setItem(MenuEstadoService.KEY, JSON.stringify({ categoria: this.categoria, scroll: this.scrollPorCategoria }));
    } catch { /* storage lleno o bloqueado: no es crítico */ }
  }
}
