/**
 * Helpers de Funciones y Tareas (FT) para la PWA. Mismos handlers que el desktop
 * (`electron/handlers/funciones-tareas.handler.ts`) vía el passthrough
 * `window.api.callIpc` → `/api/rpc` (los canales ft-* no están en preload.ts).
 */

export const FT_PERMISOS = {
  MARCAR_PROPIAS: 'RRHH_FT_MARCAR_PROPIAS',
  VERIFICAR: 'RRHH_FT_VERIFICAR',
} as const;

/** Mismos valores que `FtEstadoTarea` (ft.enums.ts del backend). */
export const FT_ESTADO = {
  PENDIENTE: 'PENDIENTE',
  HECHA: 'HECHA',
  VERIFICADA: 'VERIFICADA',
  VENCIDA: 'VENCIDA',
  NO_APLICA: 'NO_APLICA',
  RECHAZADA: 'RECHAZADA',
} as const;
export type FtEstado = (typeof FT_ESTADO)[keyof typeof FT_ESTADO];

/** Mismos valores que `FtEvidencia` y `FtTipoTarea`. */
export const FT_EVIDENCIA = { NINGUNA: 'NINGUNA', NOTA: 'NOTA', FOTO: 'FOTO' } as const;
export const FT_TIPO = { SIMPLE: 'SIMPLE', CHECKLIST: 'CHECKLIST' } as const;

export const FT_ESTADO_LABEL: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  HECHA: 'Hecha · falta verificar',
  VERIFICADA: 'Verificada',
  VENCIDA: 'Vencida',
  NO_APLICA: 'No aplica',
  RECHAZADA: 'Rechazada · rehacer',
};

/** Clase de color (variables del tema) por estado. */
export const FT_ESTADO_CLASE: Record<string, string> = {
  PENDIENTE: 'info',
  HECHA: 'warn',
  VERIFICADA: 'ok',
  VENCIDA: 'error',
  NO_APLICA: 'off',
  RECHAZADA: 'error',
};

/** Tope de la foto mientras no sepamos el del server (`ft_config.foto_max_kb`, def. 2048). */
export const FT_FOTO_KB_INICIAL = 1024;
const FT_FOTO_LADO_MAX = 1600;
/** Faltando menos de esto para vencer, la hora se marca en amarillo. */
export const FT_MIN_PRONTO = 30;

export function ftCall(channel: string, ...args: any[]): Promise<any> {
  const api = (window as any).api;
  if (!api?.callIpc) return Promise.reject(new Error('API NO DISPONIBLE'));
  return api.callIpc(channel, ...args);
}

/** Mensaje legible de un error del RPC, con textos amables para los casos conocidos. */
export function ftMensajeError(e: unknown, fallback: string): string {
  const raw0 = String((e as any)?.error?.message || (e as Error)?.message || '');
  const m = raw0.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  const raw = (m ? m[1] : raw0).replace(/^Error:\s*/, '').trim();
  if (raw === 'SERVER_UNREACHABLE') return 'No se pudo conectar con el servidor';
  if (/PROPIA TAREA/i.test(raw)) return 'Esta tarea es tuya (o la marcaste vos): la tiene que verificar otra persona.';
  if (/CAMBIÓ DE ESTADO/i.test(raw)) return 'La tarea cambió mientras la mirabas. Ya la actualizamos.';
  if (/PERMISO REQUERIDO/i.test(raw)) return 'No tenés permiso para esta acción.';
  if (/NO ESTÁ VINCULADO A UN FUNCIONARIO/i.test(raw)) return 'Tu usuario no está vinculado a un funcionario. Pedile a RRHH que lo vincule.';
  return raw || fallback;
}

/** Del texto de la nota («… | RECHAZO: MOTIVO») saca el último motivo de rechazo. */
export function ftMotivoRechazo(nota: string | null | undefined): string {
  if (!nota) return '';
  const partes = String(nota).split(' | ');
  for (let i = partes.length - 1; i >= 0; i--) {
    if (partes[i].startsWith('RECHAZO:')) return partes[i].slice('RECHAZO:'.length).trim();
  }
  return '';
}

/** Nota sin las partes de verificación/rechazo (lo que escribió la persona). */
export function ftNotaPropia(nota: string | null | undefined): string {
  if (!nota) return '';
  return String(nota)
    .split(' | ')
    .filter((p) => !p.startsWith('RECHAZO:') && !p.startsWith('VERIFICACIÓN:'))
    .join(' | ')
    .trim();
}

/** Fecha local YYYY-MM-DD. */
export function ftDia(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** «Vence en 25 min», «Venció hace 1 h 10 min». */
export function ftFaltaTexto(vence: Date, ahora: Date): string {
  const min = Math.round((vence.getTime() - ahora.getTime()) / 60000);
  const abs = Math.abs(min);
  const t = abs < 60 ? `${abs} min` : `${Math.floor(abs / 60)} h${abs % 60 ? ` ${abs % 60} min` : ''}`;
  return min >= 0 ? `vence en ${t}` : `venció hace ${t}`;
}

export function ftBytesBase64(dataUrl: string): number {
  const b64 = dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : dataUrl;
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Del error FOTO_EXCEDIDA («… EL MÁXIMO ES 2048 KB») saca el tope; null si no es ese error. */
export function ftTopeFotoDeError(e: unknown): number | null {
  const m = String((e as Error)?.message || '').match(/M[AÁ]XIMO ES (\d+) KB/i);
  return m ? Number(m[1]) : null;
}

function cargarImagen(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

/**
 * Achica la foto (lado mayor ≤ 1600 px) y la pasa a JPEG bajando calidad y tamaño hasta
 * que entre en `maxKb`. Devuelve un data URL (el backend acepta base64 con o sin prefijo
 * y valida la firma JPEG/PNG/WEBP).
 */
export async function ftComprimirFoto(file: File, maxKb: number): Promise<string> {
  const img = await cargarImagen(file);
  const limite = Math.max(20, maxKb) * 1024 * 0.95;
  let lado = FT_FOTO_LADO_MAX;
  for (let intento = 0; intento < 8; intento++) {
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * escala));
    const h = Math.max(1, Math.round(img.naturalHeight * escala));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('El navegador no permite procesar la foto');
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.55]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (ftBytesBase64(data) <= limite) return data;
    }
    lado = Math.round(lado * 0.75);
  }
  throw new Error(`No se pudo achicar la foto a menos de ${maxKb} KB`);
}

/** Estilos compartidos de las pantallas FT (solo variables del tema: claro y oscuro). */
export const FT_MOBILE_STYLES = `
  .ft-resumen { display: flex; gap: 8px; margin: 4px 0 4px; }
  .ft-resumen-item { flex: 1 1 0; min-width: 0; border: 1px solid var(--border-color); border-radius: 12px;
    padding: 8px 10px; background: var(--surface); display: flex; flex-direction: column; gap: 2px; }
  .ft-resumen-num { font-size: 1.3rem; font-weight: 700; color: var(--text-primary); }
  .ft-resumen-lbl { font-size: 0.72rem; color: var(--text-secondary); }
  .ft-grupo { font-size: 0.78rem; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text-secondary); margin: 16px 2px 8px; display: flex; align-items: center; gap: 6px; }
  .ft-grupo mat-icon { font-size: 18px; width: 18px; height: 18px; }
  .ft-card { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; }
  .ft-card.critica { border-left: 4px solid var(--error-color); }
  .ft-fila { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .ft-titulo { font-weight: 600; font-size: 1rem; color: var(--text-primary); line-height: 1.25; }
  .ft-sub { font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .ft-sub mat-icon { font-size: 16px; width: 16px; height: 16px; }
  .ft-sub .urgente { color: var(--error-color); font-weight: 700; }
  .ft-sub .pronto { color: var(--warning-color); font-weight: 700; }
  .ft-tags { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
  .ft-tag { flex: 0 0 auto; font-size: 0.7rem; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap;
    background: color-mix(in srgb, var(--info-color) 16%, transparent); color: var(--info-color); }
  .ft-tag.ok { background: color-mix(in srgb, var(--success-color) 16%, transparent); color: var(--success-color); }
  .ft-tag.warn { background: color-mix(in srgb, var(--warning-color) 18%, transparent); color: var(--warning-color); }
  .ft-tag.error { background: color-mix(in srgb, var(--error-color) 16%, transparent); color: var(--error-color); }
  .ft-tag.off { background: color-mix(in srgb, var(--text-secondary) 16%, transparent); color: var(--text-secondary); }
  .ft-instr { font-size: 0.85rem; color: var(--text-primary); white-space: pre-line; margin: 0; }
  .ft-rechazo { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border-radius: 10px; font-size: 0.88rem;
    color: var(--text-primary); background: color-mix(in srgb, var(--error-color) 12%, transparent); }
  .ft-rechazo mat-icon { color: var(--error-color); flex: 0 0 auto; }
  .ft-nota { font-size: 0.82rem; color: var(--text-secondary); margin: 0; }
  .ft-items { display: flex; flex-direction: column; border: 1px solid var(--border-color); border-radius: 12px; overflow: hidden; }
  .ft-item { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 6px 12px; border: 0;
    border-bottom: 1px solid var(--border-color); background: transparent; color: var(--text-primary);
    font: inherit; text-align: left; cursor: pointer; width: 100%; }
  .ft-item:last-child { border-bottom: 0; }
  .ft-item:disabled { cursor: default; }
  .ft-item mat-icon { color: var(--text-secondary); flex: 0 0 auto; }
  .ft-item.hecho mat-icon { color: var(--success-color); }
  .ft-item.hecho .ft-item-txt { text-decoration: line-through; color: var(--text-secondary); }
  .ft-item-txt { flex: 1; font-size: 0.92rem; }
  .ft-oblig { font-size: 0.68rem; font-weight: 700; color: var(--warning-color); white-space: nowrap; }
  .ft-foto { width: 100%; max-height: 240px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border-color);
    background: var(--surface-variant); cursor: zoom-in; display: block; }
  .ft-foto.grande { max-height: none; object-fit: contain; cursor: zoom-out; }
  .ft-pide { font-size: 0.8rem; color: var(--warning-color); display: flex; gap: 6px; align-items: center; margin: 0; }
  .ft-pide mat-icon { font-size: 18px; width: 18px; height: 18px; }
  .ft-acciones { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  .ft-acciones button { flex: 1 1 120px; min-height: 48px; font-size: 0.95rem; border-radius: 12px; }
  .ft-acciones button.principal { flex-basis: 100%; min-height: 52px; font-size: 1rem; }
  .ft-tabs { display: flex; gap: 8px; padding: 4px 0 12px; }
  .ft-tab { flex: 1 1 0; min-height: 44px; border: 1px solid var(--border-color); background: transparent;
    color: var(--text-secondary); border-radius: 999px; font: inherit; font-size: 0.9rem; font-weight: 600; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .ft-tab.active { background: color-mix(in srgb, var(--info-color) 22%, transparent); border-color: var(--info-color); color: var(--info-color); }
  .ft-badge { min-width: 20px; padding: 0 6px; border-radius: 999px; font-size: 0.72rem; line-height: 20px;
    background: color-mix(in srgb, var(--warning-color) 25%, transparent); color: var(--text-primary); }
  .ft-aviso { display: flex; gap: 6px; align-items: center; margin: 0; font-size: 0.8rem; color: var(--warning-color); }
  .ft-aviso mat-icon { font-size: 18px; width: 18px; height: 18px; flex: 0 0 auto; }
  .ft-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 4px; }
  .ft-top button { min-height: 40px; }
  .ft-hoy { font-size: 0.85rem; color: var(--text-secondary); text-transform: capitalize; }
`;
