import { BehaviorSubject } from 'rxjs';

/**
 * Estado de conexión con el server, compartido entre el transporte HTTP
 * (`api-http.ts`, fuera de Angular) y `ConnectionService` (dentro de Angular).
 * `true` = el último request alcanzó al server; `false` = error de red.
 */
export const online$ = new BehaviorSubject<boolean>(true);

export function setOnline(value: boolean): void {
  if (online$.value !== value) {
    online$.next(value);
  }
}
