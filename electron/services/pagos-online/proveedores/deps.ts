/**
 * Dependencias inyectables del pago online (tests): red, secretos y aviso al personal.
 * Las fija `setPagosOnlineDeps` (re-exportada desde `pagos-online.service.ts`).
 */
import { FetchLike } from './tipos';

type Avisar = (texto: string, dedupe: string) => Promise<void>;
type SecretoFn = () => Promise<string>;

export const deps: {
  fetch: FetchLike | null;
  /** API Key de uPay (compat: los tests de F4 la inyectan con este nombre). */
  apiKey: SecretoFn | null;
  avisar: Avisar | null;
  /** Secretos de otros proveedores, por id (`BANCARD` → clave privada). */
  secretos: Record<string, SecretoFn>;
} = { fetch: null, apiKey: null, avisar: null, secretos: {} };

export function fetchActual(): FetchLike {
  return deps.fetch || (globalThis as any).fetch;
}
