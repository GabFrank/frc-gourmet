/**
 * Tokens de seguimiento del invitado de mesa (sin cuenta). Viven en sessionStorage:
 * se pierden al cerrar la pestaña, igual que el pedido de esa visita.
 */
const KEY = 'frc_sf_seguimiento';

export function tokensSeguimiento(): string[] {
  try {
    const arr = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(arr) ? arr.filter((t) => typeof t === 'string') : [];
  } catch {
    return [];
  }
}

export function guardarSeguimiento(token: string): void {
  const arr = [token, ...tokensSeguimiento().filter((t) => t !== token)].slice(0, 10);
  sessionStorage.setItem(KEY, JSON.stringify(arr));
}

export function quitarSeguimiento(token: string): void {
  sessionStorage.setItem(KEY, JSON.stringify(tokensSeguimiento().filter((t) => t !== token)));
}
