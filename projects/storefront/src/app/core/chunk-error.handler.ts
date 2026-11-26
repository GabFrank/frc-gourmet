import { ErrorHandler, Injectable } from '@angular/core';

const RECARGA_KEY = 'sf.recargaPorChunk';
/** Entre una recarga automática y la siguiente: si en ese lapso vuelve a fallar, no se insiste. */
const ESPERA_ENTRE_RECARGAS_MS = 5 * 60 * 1000;

/** ¿El error es que no se pudo bajar una parte de la app (versión nueva publicada, red cortada)? */
export function esErrorDeChunk(err: any): boolean {
  const e = err?.rejection ?? err;
  const nombre = String(e?.name ?? '');
  const msg = String(e?.message ?? e ?? '');
  return nombre === 'ChunkLoadError' || /Loading chunk [\w-]+ failed/i.test(msg)
    || /Failed to fetch dynamically imported module/i.test(msg);
}

/**
 * Si falla la carga de una parte de la app (pasa cuando se publica una versión nueva con la
 * tienda abierta: la página vieja pide archivos que ya no existen), se recarga la página una
 * vez (como mucho cada 5 minutos). El carrito sobrevive porque vive en localStorage. Si después de recargar
 * vuelve a fallar, no se insiste (sin bucle): se muestra un aviso con un botón para recargar.
 */
@Injectable()
export class ChunkErrorHandler implements ErrorHandler {
  handleError(error: any): void {
    if (esErrorDeChunk(error)) {
      if (puedeRecargar(Date.now())) {
        try { sessionStorage.setItem(RECARGA_KEY, String(Date.now())); } catch { /* sin storage */ }
        window.location.reload();
        return;
      }
      mostrarAvisoRecarga();
    }
    console.error(error);
  }
}

function mostrarAvisoRecarga(): void {
  if (document.getElementById('sf-aviso-version')) return;
  const div = document.createElement('div');
  div.id = 'sf-aviso-version';
  div.setAttribute('role', 'alert');
  div.style.cssText = 'position:fixed;left:16px;right:16px;bottom:84px;max-width:688px;margin:0 auto;z-index:100;'
    + 'background:#212121;color:#fff;border-radius:10px;padding:12px 14px;display:flex;align-items:center;gap:12px;'
    + 'box-shadow:0 6px 16px rgba(0,0,0,.18);font:500 14px Inter,system-ui,sans-serif';
  const txt = document.createElement('span');
  txt.style.flex = '1';
  txt.textContent = 'No pudimos cargar esta parte de la tienda. Tu carrito sigue guardado.';
  const btn = document.createElement('button');
  btn.textContent = 'Recargar';
  btn.style.cssText = 'border:none;border-radius:8px;padding:8px 14px;background:var(--sf-primary,#EA1D2C);color:#fff;font-weight:700;cursor:pointer';
  btn.onclick = () => window.location.reload();
  div.append(txt, btn);
  document.body.appendChild(div);
}

/** Sin storage no se recarga sola (no habría cómo frenar un bucle): va directo el aviso. */
export function puedeRecargar(ahora: number): boolean {
  try {
    const ultima = Number(sessionStorage.getItem(RECARGA_KEY) || 0);
    return !ultima || ahora - ultima > ESPERA_ENTRE_RECARGAS_MS;
  } catch {
    return false;
  }
}
