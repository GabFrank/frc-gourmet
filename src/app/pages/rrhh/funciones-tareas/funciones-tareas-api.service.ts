/**
 * Funciones y Tareas (FT) — puente a `electron/handlers/funciones-tareas.handler.ts`.
 *
 * Usa el passthrough genérico `window.api.callIpc` (mismo patrón que Disciplina): en modo
 * cliente el preload re-rutea a `/api/rpc`. Cada handler valida su permiso adentro.
 */
import { Injectable } from '@angular/core';

export const FT_TIPOS = ['SIMPLE', 'CHECKLIST'];
export const FT_RECURRENCIAS = ['DIARIA', 'DIAS_SEMANA', 'MENSUAL', 'UNICA', 'EVENTO'];
export const FT_EVENTOS = ['CAJA_ABIERTA', 'CAJA_CERRADA', 'COMPRA_RECIBIDA'];
export const FT_ANCLAS = ['INICIO_TURNO', 'FIN_TURNO', 'HORA_FIJA', 'EVENTO'];
export const FT_EVIDENCIAS = ['NINGUNA', 'NOTA', 'FOTO'];
export const FT_MOMENTOS_AVISO = ['ANTES_INICIO', 'ANTES_VENCER', 'AL_VENCER', 'ESCALAMIENTO'];
export const FT_CANALES = ['APP', 'WHATSAPP', 'AMBOS', 'GERENTE'];
export const FT_ESTADOS_TAREA = ['PENDIENTE', 'HECHA', 'VERIFICADA', 'VENCIDA', 'NO_APLICA', 'RECHAZADA'];
export const FT_ESTADOS_AVISO = ['PENDIENTE', 'ENVIADO', 'FALLIDO', 'PARA_GERENTE'];
export const FT_ESTADOS_PROPUESTA = ['PENDIENTE', 'REGISTRADA', 'DESCARTADA'];

export interface FtConfigRespuesta {
  valores: Record<string, string>;
  ultimoTick: any;
  lock: any;
}

/** Quita el prefijo de Electron «Error invoking remote method 'x': Error: …». */
export function ftMensajeError(e: any): string {
  const raw = e?.message || String(e ?? 'ERROR');
  const m = raw.match(/Error invoking remote method '[^']+': (?:\w*Error: )?(.*)/s);
  return (m ? m[1] : raw).trim();
}

@Injectable({ providedIn: 'root' })
export class FuncionesTareasApiService {
  private get api(): any {
    return (window as any).api;
  }

  call<T = any>(channel: string, ...args: any[]): Promise<T> {
    return this.api.callIpc(channel, ...args);
  }

  // Funciones
  funcionesList(filtros: { cargoId?: number; funcionarioId?: number; incluirInactivas?: boolean } = {}) {
    return this.call<any[]>('ft-funciones-list', filtros);
  }
  funcionesSave(data: any) { return this.call('ft-funciones-save', data); }
  funcionesSetActivo(id: number, activo: boolean) { return this.call('ft-funciones-set-activo', id, activo); }
  funcionesDelete(id: number) { return this.call('ft-funciones-delete', id); }
  funcionesDe(funcionarioId?: number, fecha?: string) { return this.call('ft-funciones-de', funcionarioId, fecha); }

  // Plantillas
  plantillasList(filtros: any = {}) { return this.call<any[]>('ft-plantillas-list', filtros); }
  plantillasGet(id: number) { return this.call('ft-plantillas-get', id); }
  plantillasSave(data: any) { return this.call('ft-plantillas-save', data); }
  plantillasSetActivo(id: number, activo: boolean) { return this.call('ft-plantillas-set-activo', id, activo); }
  plantillasDelete(id: number) { return this.call('ft-plantillas-delete', id); }

  // Config del motor
  configGet() { return this.call<FtConfigRespuesta>('ft-config-get'); }
  configSet(valores: Record<string, unknown>) { return this.call('ft-config-set', valores); }

  // Operación
  misTareasHoy() { return this.call<any[]>('ft-mis-tareas-hoy'); }
  tareasList(filtros: { desde?: string; hasta?: string; funcionarioId?: number; estado?: string } = {}) {
    return this.call<any[]>('ft-tareas-list', filtros);
  }
  tareaMarcar(tareaId: number, data: any = {}) { return this.call('ft-tarea-marcar', tareaId, data); }
  tareaNoAplica(tareaId: number, motivo: string) { return this.call('ft-tarea-no-aplica', tareaId, motivo); }
  tareaVerificar(tareaId: number, nota?: string) { return this.call('ft-tarea-verificar', tareaId, nota); }
  tareaRechazar(tareaId: number, motivo: string) { return this.call('ft-tarea-rechazar', tareaId, motivo); }
  tareaCrearManual(data: any) { return this.call('ft-tarea-crear-manual', data); }
  tareaSubirFoto(tareaId: number, data: any) { return this.call('ft-tarea-subir-foto', tareaId, data); }

  // Avisos y propuestas
  avisos(filtros: { desde?: string; hasta?: string; canal?: string; estado?: string; momento?: string; funcionarioId?: number } = {}) {
    return this.call<any[]>('ft-avisos', filtros);
  }
  propuestasList(filtros: { estado?: string; desde?: string; hasta?: string; funcionarioId?: number } = {}) {
    return this.call<any[]>('ft-propuestas-list', filtros);
  }
  propuestaResolver(id: number, data: { estado: 'REGISTRADA' | 'DESCARTADA'; nota?: string }) {
    return this.call('ft-propuesta-resolver', id, data);
  }
}
