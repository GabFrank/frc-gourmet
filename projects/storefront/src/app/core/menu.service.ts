import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PublicApiService } from './public-api.service';
import { MenuSnapshot, MenuProducto } from './models';

/** Cachea la carta (menu.get) para compartirla entre el menú y el detalle. */
@Injectable({ providedIn: 'root' })
export class MenuService {
  private snapshot: MenuSnapshot | null = null;

  constructor(private api: PublicApiService) {}

  cargar(force = false): Observable<MenuSnapshot> {
    if (this.snapshot && !force) return of(this.snapshot);
    return this.api.call<MenuSnapshot>('menu.get').pipe(tap((m) => (this.snapshot = m)));
  }

  get actual(): MenuSnapshot | null {
    return this.snapshot;
  }

  producto(id: number): MenuProducto | null {
    return this.snapshot?.productos.find((p) => p.id === id) || null;
  }
}
