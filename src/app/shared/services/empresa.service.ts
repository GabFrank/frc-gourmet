import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../database/repository.service';
import { Empresa } from '../../database/entities/sistema/empresa.entity';

/**
 * Singleton de la fila `empresa` (id=1) cacheada en memoria. El header de la
 * app, KuDEs/tickets de impresion y reportes exportados consumen `empresa$`.
 *
 * - `load()` se dispara una vez al construir el servicio (despues del login,
 *   cuando el RepositoryService ya esta autenticado).
 * - `update(data)` hace upsert via handler + recarga el BehaviorSubject para
 *   que toda la UI reactiva (header, formularios) se sincronice sin reload.
 *
 * Nota: si el usuario aun no se autentico, `load()` puede fallar (handler
 * existe pero el repo http en modo cliente lanza). El catch dejara empresa$
 * en `null` y `nombre` caera al fallback "MI EMPRESA" hasta que el componente
 * vuelva a invocar load().
 */
@Injectable({ providedIn: 'root' })
export class EmpresaService {
  private empresa$ = new BehaviorSubject<Empresa | null>(null);
  readonly empresa: Observable<Empresa | null> = this.empresa$.asObservable();

  constructor(private repo: RepositoryService) {}

  /** Devuelve el ultimo valor cacheado (null si aun no se cargo). */
  get current(): Empresa | null {
    return this.empresa$.value;
  }

  /** Nombre visible. Cae a "MI EMPRESA" si todavia no se cargo. */
  get nombre(): string {
    return this.empresa$.value?.nombre || 'MI EMPRESA';
  }

  /**
   * Carga la empresa desde backend. Idempotente — invocable cada vez que
   * cambia el usuario autenticado o tras un update. Errores se logean y
   * dejan el subject como estaba (no rompen la UI).
   */
  async load(): Promise<Empresa | null> {
    try {
      const empresa = await firstValueFrom(this.repo.getEmpresa());
      this.empresa$.next(empresa || null);
      return empresa || null;
    } catch (err) {
      console.warn('EmpresaService.load() fallo:', err);
      return this.empresa$.value;
    }
  }

  /** Upsert sobre id=1. Devuelve la fila actualizada y refresca el subject. */
  async update(data: Partial<Empresa>): Promise<Empresa | null> {
    const updated = await firstValueFrom(this.repo.updateEmpresa(data));
    this.empresa$.next(updated || null);
    return updated || null;
  }
}
