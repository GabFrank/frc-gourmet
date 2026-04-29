import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { RepositoryService } from '../database/repository.service';
import { AuthService } from './auth.service';

/**
 * Servicio de permisos granulares. Carga los permisos del usuario logueado y
 * permite chequear con `has(codigo)`. Refrescar con `refresh()` tras cambios
 * en role-permission. Cachea en memoria.
 */
@Injectable({ providedIn: 'root' })
export class PermissionService {
  private codigosSubject = new BehaviorSubject<Set<string>>(new Set());
  public codigos$: Observable<Set<string>> = this.codigosSubject.asObservable();

  constructor(
    private repositoryService: RepositoryService,
    private authService: AuthService,
  ) {
    // Recargar permisos cuando cambia el usuario logueado.
    this.authService.currentUser$.subscribe((u) => {
      if (u && u.id) {
        this.loadForUser(u.id);
      } else {
        this.codigosSubject.next(new Set());
      }
    });
  }

  private loadForUser(userId: number): void {
    this.repositoryService.getPermissionsByUser(userId).pipe(
      tap((perms) => {
        const set = new Set<string>((perms || []).map((p: any) => (p?.codigo || '').toUpperCase()));
        this.codigosSubject.next(set);
      }),
      catchError((err) => {
        console.error('Error cargando permisos del usuario:', err);
        this.codigosSubject.next(new Set());
        return of([]);
      }),
    ).subscribe();
  }

  /**
   * Refrescar manualmente los permisos del usuario actual.
   */
  refresh(): void {
    const user = this.authService.currentUser;
    if (user && user.id) {
      this.loadForUser(user.id);
    }
  }

  /**
   * Chequea si el usuario actual tiene un permiso. Las comparaciones son UPPERCASE.
   */
  has(codigo: string): boolean {
    if (!codigo) return false;
    return this.codigosSubject.value.has(codigo.toUpperCase());
  }

  /**
   * Chequea si el usuario tiene al menos uno de los codigos pasados.
   */
  hasAny(codigos: string[]): boolean {
    return (codigos || []).some((c) => this.has(c));
  }

  /**
   * Chequea si el usuario tiene todos los codigos pasados.
   */
  hasAll(codigos: string[]): boolean {
    return (codigos || []).every((c) => this.has(c));
  }
}
