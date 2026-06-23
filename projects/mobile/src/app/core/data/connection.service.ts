import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { online$ } from './connection-state';

/**
 * Expone a los componentes el estado de conexión con el server.
 * En el MVP: si `online === false`, la UI bloquea acciones (no hay modo offline).
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  readonly online$: Observable<boolean> = online$.asObservable();

  get online(): boolean {
    return online$.value;
  }
}
