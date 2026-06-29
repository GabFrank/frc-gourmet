import { Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';

/**
 * Servicio Angular para la configuracion de Notificaciones (Email + WhatsApp).
 * Usa `window.api.callIpc` (ruteado automaticamente por IPC en standalone/server
 * y por /api/rpc en mode=client), igual que DocumentoService. No hace falta
 * agregar wrappers en RepositoryService.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private get api(): any {
    return (window as any).api;
  }

  // ----- Configuracion -----
  getConfig(): Observable<any> {
    return from(this.api.callIpc('get-notif-config') as Promise<any>);
  }
  updateConfig(items: Array<{ clave: string; valor: string }>): Observable<any> {
    return from(this.api.callIpc('update-notif-config', items) as Promise<any>);
  }
  setSecret(tipo: 'smtp' | 'evolution', valor: string): Observable<any> {
    return from(this.api.callIpc('set-notif-secret', { tipo, valor }) as Promise<any>);
  }

  // ----- Eventos -----
  getEventos(): Observable<any[]> {
    return from(this.api.callIpc('get-notif-eventos') as Promise<any[]>);
  }
  updateEvento(id: number, data: { activo?: boolean; canal?: string }): Observable<any> {
    return from(this.api.callIpc('update-notif-evento', id, data) as Promise<any>);
  }

  // ----- Receptores -----
  getReceptores(): Observable<any[]> {
    return from(this.api.callIpc('get-notif-receptores') as Promise<any[]>);
  }
  createReceptor(data: any): Observable<any> {
    return from(this.api.callIpc('create-notif-receptor', data) as Promise<any>);
  }
  updateReceptor(id: number, data: any): Observable<any> {
    return from(this.api.callIpc('update-notif-receptor', id, data) as Promise<any>);
  }
  deleteReceptor(id: number): Observable<any> {
    return from(this.api.callIpc('delete-notif-receptor', id) as Promise<any>);
  }

  // ----- Suscripciones -----
  getSuscripciones(eventoId?: number): Observable<any[]> {
    return from(this.api.callIpc('get-notif-suscripciones', eventoId) as Promise<any[]>);
  }
  createSuscripcion(data: { eventoId: number; receptorId: number; canal: string }): Observable<any> {
    return from(this.api.callIpc('create-notif-suscripcion', data) as Promise<any>);
  }
  deleteSuscripcion(id: number): Observable<any> {
    return from(this.api.callIpc('delete-notif-suscripcion', id) as Promise<any>);
  }

  // ----- Log -----
  getLogs(filtros?: { page?: number; pageSize?: number }): Observable<{ items: any[]; total: number }> {
    return from(this.api.callIpc('get-notif-logs', filtros || {}) as Promise<{ items: any[]; total: number }>);
  }

  // ----- Apoyo -----
  getPersonas(): Observable<any[]> {
    return from(this.api.callIpc('get-personas') as Promise<any[]>);
  }

  // ----- Pruebas / estado -----
  testEmail(to: string): Observable<any> {
    return from(this.api.callIpc('test-notif-email', to) as Promise<any>);
  }
  testWhatsapp(to: string): Observable<any> {
    return from(this.api.callIpc('test-notif-whatsapp', to) as Promise<any>);
  }
  getEvolutionState(): Observable<any> {
    return from(this.api.callIpc('get-notif-evolution-state') as Promise<any>);
  }
}
