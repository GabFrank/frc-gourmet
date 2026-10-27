/**
 * Disciplina y Reconocimiento (DR) — puente a los handlers `electron/handlers/disciplina*.ts`.
 *
 * Usa el passthrough genérico `window.api.callIpc` (mismo patrón que MusicaService y
 * DocumentoService): en modo cliente el preload re-rutea a `/api/rpc`, así desktop y PWA
 * consumen los mismos handlers. Cada handler valida su permiso adentro.
 *
 * `cargarEjemploCocina` es una función pura sobre una interfaz mínima (`DrIpc`) para poder
 * probarla con un api en memoria (scripts/test-disciplina-ejemplo.ts).
 */
import { Injectable } from '@angular/core';
import {
  EJEMPLO_AREA,
  EJEMPLO_ENCUESTA,
  EJEMPLO_GRAVEDADES,
  EJEMPLO_GRUPO,
  EJEMPLO_PREMIOS,
  EJEMPLO_TIPOS_ERROR,
  EJEMPLO_TIPOS_FALTA,
} from './ejemplo-cocina';

/** Catálogos genéricos: dr-get-<canal> / dr-save-<canal>. */
export type DrCanal =
  | 'gravedades'
  | 'tipos-error'
  | 'criterios'
  | 'premios'
  | 'grupos'
  | 'grupo-miembros'
  | 'encuestas'
  | 'encuesta-preguntas'
  | 'checklist-items';

export interface DrIpc {
  call(channel: string, ...args: any[]): Promise<any>;
}

export interface DrRegistrarFaltaResultado {
  creadas: any[];
  loteId: string | null;
  ignoradas: { funcionarioId: number; motivo: string }[];
}

export interface DrEjemploResultado {
  creados: string[];
  existentes: string[];
}

/** Quita el prefijo de Electron «Error invoking remote method 'x': Error: …». */
export function drMensajeError(e: any): string {
  const raw = e?.message || String(e ?? 'ERROR');
  const m = raw.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  return (m ? m[1] : raw).trim();
}

/** El backend no deja resolver una falta registrada por uno mismo (código AUTO_RESOLUCION). */
export function drEsAutoResolucion(e: any): boolean {
  const msg = drMensajeError(e);
  return e?.code === 'AUTO_RESOLUCION' || /AUTO_RESOLUCION|FALTA QUE REGISTRASTE VOS/.test(msg);
}

const norm = (s: unknown) => String(s ?? '').trim().toUpperCase();

/**
 * Carga los datos de ejemplo de cocina. Idempotente: si ya existe un registro con el mismo
 * nombre (o título/texto, según el catálogo), lo reutiliza y no crea otro. Todo lo nuevo se
 * crea con activo=false. `monedaId` (opcional) es la moneda de multas y premios.
 */
export async function cargarEjemploCocina(api: DrIpc, opciones: { monedaId?: number | null } = {}): Promise<DrEjemploResultado> {
  const creados: string[] = [];
  const existentes: string[] = [];
  const moneda = opciones.monedaId ? { id: opciones.monedaId } : null;

  /** Busca por clave en `lista`; si no existe, guarda con activo=false. Devuelve el registro. */
  const asegurar = async (lista: any[], campo: string, valor: string, canalSave: string, datos: any, etiqueta: string) => {
    const ya = lista.find((x) => norm(x?.[campo]) === norm(valor));
    if (ya) {
      existentes.push(etiqueta);
      return ya;
    }
    const guardado = await api.call(canalSave, { ...datos, [campo]: valor, activo: false });
    lista.push(guardado);
    creados.push(etiqueta);
    return guardado;
  };
  const todos = (canal: string, filtros: any = {}) => api.call(`dr-get-${canal}`, { ...filtros, incluirInactivos: true }).then((r) => r ?? []);

  // Grupo
  const grupos = await todos('grupos');
  const grupo = await asegurar(grupos, 'nombre', EJEMPLO_GRUPO.nombre, 'dr-save-grupos',
    { area: EJEMPLO_GRUPO.area, descripcion: EJEMPLO_GRUPO.descripcion }, `GRUPO ${EJEMPLO_GRUPO.nombre}`);

  // Gravedades
  const gravedades = await todos('gravedades');
  const gravedadPorNombre: Record<string, any> = {};
  for (const g of EJEMPLO_GRAVEDADES) {
    gravedadPorNombre[g.nombre] = await asegurar(gravedades, 'nombre', g.nombre, 'dr-save-gravedades',
      { area: EJEMPLO_AREA, puntos: g.puntos, color: g.color, orden: g.orden }, `GRAVEDAD ${g.nombre}`);
  }

  // Tipos de falta
  const tiposFalta = (await api.call('dr-get-tipos-falta', { incluirInactivos: true })) ?? [];
  for (const t of EJEMPLO_TIPOS_FALTA) {
    const { nombre, ...resto } = t;
    await asegurar(tiposFalta, 'nombre', nombre, 'dr-save-tipo-falta',
      { ...resto, area: EJEMPLO_AREA, grupo: { id: grupo.id }, moneda }, `TIPO DE FALTA ${nombre}`);
  }

  // Tipos de error
  const tiposError = await todos('tipos-error');
  for (const t of EJEMPLO_TIPOS_ERROR) {
    await asegurar(tiposError, 'nombre', t.nombre, 'dr-save-tipos-error', {
      descripcion: t.descripcion, area: EJEMPLO_AREA, orden: t.orden,
      gravedad: { id: gravedadPorNombre[t.gravedad].id }, grupo: { id: grupo.id },
    }, `TIPO DE ERROR ${t.nombre}`);
  }

  // Encuesta (para el premio por votación) y sus preguntas
  const encuestas = await todos('encuestas');
  const encuesta = await asegurar(encuestas, 'titulo', EJEMPLO_ENCUESTA.titulo, 'dr-save-encuestas', {
    descripcion: EJEMPLO_ENCUESTA.descripcion, area: EJEMPLO_AREA, horasAbierta: EJEMPLO_ENCUESTA.horasAbierta, grupo: { id: grupo.id },
  }, `ENCUESTA ${EJEMPLO_ENCUESTA.titulo}`);
  const preguntas = await todos('encuesta-preguntas', { encuestaId: encuesta.id });
  for (const p of EJEMPLO_ENCUESTA.preguntas) {
    const { texto, ...resto } = p;
    await asegurar(preguntas, 'texto', texto, 'dr-save-encuesta-preguntas', { ...resto, encuesta: { id: encuesta.id } }, `PREGUNTA ${texto}`);
  }

  // Premios y criterios
  const premios = await todos('premios');
  for (const p of EJEMPLO_PREMIOS) {
    const { criterios, usaEncuesta, nombre, ...resto } = p;
    const premio = await asegurar(premios, 'nombre', nombre, 'dr-save-premios', {
      ...resto, area: EJEMPLO_AREA, moneda, grupo: { id: grupo.id }, encuesta: usaEncuesta ? { id: encuesta.id } : null,
    }, `PREMIO ${nombre}`);
    if (criterios?.length) {
      const existentesCrit = await todos('criterios', { premioId: premio.id });
      for (const c of criterios) {
        const { texto, ...rc } = c;
        await asegurar(existentesCrit, 'texto', texto, 'dr-save-criterios', { ...rc, premio: { id: premio.id } }, `CRITERIO ${texto} (${nombre})`);
      }
    }
  }
  return { creados, existentes };
}

@Injectable({ providedIn: 'root' })
export class DisciplinaApiService implements DrIpc {
  call(channel: string, ...args: any[]): Promise<any> {
    const api = (window as any).api;
    if (!api?.callIpc) return Promise.reject(new Error('API NO DISPONIBLE'));
    return api.callIpc(channel, ...args);
  }

  // ── Catálogos ──
  getTiposFalta(incluirInactivos = true): Promise<any[]> { return this.call('dr-get-tipos-falta', { incluirInactivos }); }
  saveTipoFalta(data: any): Promise<any> { return this.call('dr-save-tipo-falta', data); }
  setTipoFaltaActivo(id: number, activo: boolean): Promise<{ ok: boolean }> { return this.call('dr-set-tipo-falta-activo', id, activo); }
  getCatalogo(canal: DrCanal, filtros: any = {}): Promise<any[]> { return this.call(`dr-get-${canal}`, filtros); }
  saveCatalogo(canal: DrCanal, data: any): Promise<any> { return this.call(`dr-save-${canal}`, data); }

  // ── Faltas ──
  getFaltas(filtros: { desde?: string; hasta?: string; funcionarioId?: number | null; estado?: string | null; limite?: number }): Promise<any[]> {
    return this.call('dr-get-faltas', filtros);
  }
  registrarFalta(data: { tipoFaltaId: number; fecha: string; funcionarioIds: number[]; observacion?: string; minutosTardanza?: number | null }): Promise<DrRegistrarFaltaResultado> {
    return this.call('dr-registrar-falta', data);
  }
  aprobarFalta(faltaId: number, resolucion?: string): Promise<any> { return this.call('dr-aprobar-falta', faltaId, resolucion); }
  justificarFalta(faltaId: number, motivo: string): Promise<any> { return this.call('dr-justificar-falta', faltaId, motivo); }
  anularFalta(faltaId: number, motivo: string): Promise<any> { return this.call('dr-anular-falta', faltaId, motivo); }

  // ── Errores ──
  getErrores(filtros: { desde?: string; hasta?: string; funcionarioId?: number | null; estado?: string | null }): Promise<any[]> {
    return this.call('dr-get-errores', filtros);
  }
  registrarError(data: { fecha: string; tipoErrorId: number; funcionarioIds: number[]; detalle?: string }): Promise<{ id: number; funcionarioId: number; puntos: number }[]> {
    return this.call('dr-registrar-error', data);
  }
  anularError(errorId: number, motivo: string): Promise<any> { return this.call('dr-anular-error', errorId, motivo); }

  // ── Premios ──
  getPeriodos(filtros: { estado?: string; conPremio?: boolean } = {}): Promise<any[]> { return this.call('dr-get-periodos', filtros); }
  calcularPremio(periodoId: number): Promise<any> { return this.call('dr-calcular-premio', periodoId); }
  aprobarPremio(periodoId: number): Promise<any> { return this.call('dr-aprobar-premio', periodoId); }
  cerrarPeriodo(periodoId: number): Promise<any> { return this.call('dr-cerrar-periodo', periodoId); }
  getResultadosPremio(periodoId: number): Promise<any[]> { return this.call('dr-get-resultados-premio', periodoId); }
  ajustarResultadoPremio(d: { periodoId: number; resultadoId: number; montoAprobado?: number | null; ganador?: boolean }): Promise<any> {
    return this.call('dr-ajustar-resultado-premio', d);
  }
  getResultadosEncuesta(periodoId: number): Promise<any> { return this.call('dr-get-resultados-encuesta', periodoId); }

  // ── Tablero y reportes (fase 4, solo lectura) ──
  getTablero(q: { desde: string; hasta: string; grupoId?: number | null }): Promise<any> { return this.call('dr-tablero', q); }
  getReportePersona(q: { funcionarioId: number; desde: string; hasta: string }): Promise<any> { return this.call('dr-reporte-persona', q); }

  // ── Ejemplo ──
  cargarEjemploCocina(monedaId?: number | null): Promise<DrEjemploResultado> { return cargarEjemploCocina(this, { monedaId }); }
}

/** 'YYYY-MM-DD' local de un Date (los handlers trabajan con fechas sin zona). */
export function drFechaIso(d: Date | string | null | undefined): string | undefined {
  if (!d) return undefined;
  if (typeof d === 'string') return d.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Nombre visible de un funcionario (persona.nombre + apellido). */
export function drNombreFuncionario(f: any): string {
  const n = `${f?.persona?.nombre ?? ''} ${f?.persona?.apellido ?? ''}`.trim();
  return n || (f?.id ? `#${f.id}` : '-');
}

/** 'YYYY-MM-DD' (o Date) → 'dd/MM/yyyy' sin pasar por zona horaria. */
export function drFechaVista(f: any): string {
  if (!f) return '-';
  const s = f instanceof Date ? drFechaIso(f)! : String(f).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Clase del chip de estado (paleta verde/amarillo/naranja/rojo/celeste, vía variables del tema). */
export function drClaseEstado(estado: string): string {
  switch (estado) {
    case 'APROBADA': case 'APROBADO': case 'VIGENTE': case 'JUSTIFICADA': return 'chip chip-verde';
    case 'APELADA': case 'DESIERTO': return 'chip chip-naranja';
    case 'ANULADA': case 'ANULADO': return 'chip chip-rojo';
    default: return 'chip chip-celeste'; // REGISTRADA, PROPUESTO, ABIERTO…
  }
}
