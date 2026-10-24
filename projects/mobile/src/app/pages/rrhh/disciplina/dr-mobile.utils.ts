/**
 * Helpers de Disciplina y Reconocimiento (DR) para la PWA. Mismos handlers que el desktop
 * (`electron/handlers/disciplina*.ts`) vía el passthrough `window.api.callIpc` → `/api/rpc`.
 */

export interface DrFuncionarioVM {
  id: number;
  nombre: string;
  codigo?: string;
}

export function drCall(channel: string, ...args: any[]): Promise<any> {
  const api = (window as any).api;
  if (!api?.callIpc) return Promise.reject(new Error('API NO DISPONIBLE'));
  return api.callIpc(channel, ...args);
}

/** Quita el prefijo «Error invoking remote method 'x': Error: …». */
export function drMensajeError(e: any): string {
  const raw = e?.error?.message || e?.message || String(e ?? 'ERROR');
  const m = String(raw).match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  return (m ? m[1] : raw).trim();
}

export function drFechaIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  if (typeof d === 'string') return d.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function drNombreFuncionario(f: any): string {
  const n = `${f?.persona?.nombre ?? ''} ${f?.persona?.apellido ?? ''}`.trim();
  return n || (f?.id ? `#${f.id}` : '-');
}

/** Monto sin decimales (guaraníes): «₲ 50.000». El símbolo sale de la moneda configurada. */
export function drMonto(monto: number, simbolo?: string | null): string {
  const n = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(Math.round(Number(monto) || 0));
  return `${simbolo || '₲'} ${n}`;
}

export async function drCargarFuncionarios(): Promise<DrFuncionarioVM[]> {
  const funcs: any[] = (await drCall('get-funcionarios', { soloActivos: true })) ?? [];
  return funcs
    .filter((f) => f?.activo !== false)
    .map((f) => ({ id: f.id, nombre: drNombreFuncionario(f), codigo: f.codigoInterno ?? undefined }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export function drFiltrar(lista: DrFuncionarioVM[], q: string): DrFuncionarioVM[] {
  const s = q.trim().toLowerCase();
  if (!s) return lista;
  return lista.filter((f) => f.nombre.toLowerCase().includes(s) || (f.codigo || '').toLowerCase().includes(s));
}

/** Estilos compartidos de las pantallas DR (solo variables del tema: claro y oscuro). */
export const DR_MOBILE_STYLES = `
  .dr-step-title { font-size: 0.8rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text-secondary); margin: 14px 2px 8px; display: flex; align-items: center; gap: 6px; }
  .dr-step-num { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--primary-color, #3f51b5) 22%, transparent); color: var(--primary-color, #3f51b5); font-size: 0.75rem; }
  .dr-tipos { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .dr-tipo { min-height: 72px; border-radius: 14px; border: 1px solid var(--border-color); background: var(--surface);
    color: var(--text-primary); padding: 10px 12px; text-align: left; cursor: pointer; font: inherit;
    display: flex; flex-direction: column; justify-content: center; gap: 4px; }
  .dr-tipo.sel { border-color: var(--primary-color, #3f51b5); background: color-mix(in srgb, var(--primary-color, #3f51b5) 16%, var(--surface)); }
  .dr-tipo-nombre { font-weight: 700; font-size: 0.9rem; line-height: 1.2; }
  .dr-tipo-sub { font-size: 0.72rem; color: var(--text-secondary); }
  .dr-funcs { display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: 12px;
    max-height: 46vh; overflow-y: auto; background: var(--surface); }
  .dr-func { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 12px; border: 0;
    border-bottom: 1px solid var(--border-color); background: transparent; color: var(--text-primary); font: inherit; text-align: left; cursor: pointer; }
  .dr-func:last-child { border-bottom: 0; }
  .dr-func.sel { background: color-mix(in srgb, var(--primary-color, #3f51b5) 14%, transparent); }
  .dr-func mat-icon { color: var(--text-secondary); }
  .dr-func.sel mat-icon { color: var(--primary-color, #3f51b5); }
  .dr-func-nombre { flex: 1; }
  .dr-func-extra { font-size: 0.75rem; font-weight: 600; }
  .dr-sel-bar { display: flex; align-items: center; gap: 8px; margin: 6px 2px; font-size: 0.8rem; color: var(--text-secondary); flex-wrap: wrap; }
  .dr-sel-bar button { min-height: 36px; }
  .dr-full { width: 100%; }
  .dr-actions { position: sticky; bottom: 0; padding: 12px 0 calc(12px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, var(--surface-variant, var(--surface)) 70%, transparent); }
  .dr-actions button { width: 100%; height: 52px; font-size: 1rem; border-radius: 12px; }
  .dr-box { border: 1px solid var(--border-color); border-radius: 12px; padding: 12px; background: var(--surface); color: var(--text-primary); }
  .dr-adv { color: var(--warning-color); font-weight: 700; }
  .dr-multa { color: var(--error-color); font-weight: 700; }
  .dr-ok { color: var(--success-color); font-weight: 700; }
  .dr-muted { color: var(--text-secondary); font-size: 0.8rem; }
  .dr-res-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--border-color); }
  .dr-res-row:last-child { border-bottom: 0; }
  .dr-chip { font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--primary-color, #3f51b5) 16%, transparent); color: var(--primary-color, #3f51b5); }
`;
