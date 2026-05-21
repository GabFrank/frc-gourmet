import { Subject } from 'rxjs';

/**
 * Emite cuando la sesión expiró irrecuperablemente (un RPC dio 401 y el refresh
 * también falló). El shim (`api-http.ts`, fuera de Angular) lo dispara; el
 * AppComponent lo escucha para hacer logout + redirigir a /login.
 */
export const sessionExpired$ = new Subject<void>();
