import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export type UpdateChannel = 'stable' | 'beta' | 'alpha';

export interface UpdateConfig {
  channel: UpdateChannel;
  autoCheck: boolean;
  lastCheckAt?: string;
}

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'progress'
  | 'downloaded'
  | 'error';

export interface UpdateStatusEvent {
  status: UpdateStatus;
  payload?: any;
}

// `window.api` esta tipado parcialmente en database.service.ts. Las funciones
// de auto-update viven en el mismo bridge (preload.ts) pero no estan tipadas
// alli. Casteamos puntualmente para no tocar ese .d.ts global.
function api(): any {
  const w: any = window as any;
  return w.api ?? {};
}

@Injectable({ providedIn: 'root' })
export class UpdateService {
  private statusSubject = new BehaviorSubject<UpdateStatusEvent>({ status: 'idle' });
  status$: Observable<UpdateStatusEvent> = this.statusSubject.asObservable();

  private unsubscribe?: () => void;

  constructor(private zone: NgZone) {
    const a = api();
    if (typeof a.autoUpdateOnStatus === 'function') {
      this.unsubscribe = a.autoUpdateOnStatus((status: UpdateStatus, payload: any) => {
        this.zone.run(() => this.statusSubject.next({ status, payload }));
      });
    }
  }

  isAvailable(): boolean {
    return typeof api().autoUpdateGetConfig === 'function';
  }

  async getConfig(): Promise<UpdateConfig | null> {
    if (!this.isAvailable()) return null;
    return api().autoUpdateGetConfig();
  }

  async setChannel(channel: UpdateChannel): Promise<UpdateConfig | null> {
    if (!this.isAvailable()) return null;
    return api().autoUpdateSetChannel(channel);
  }

  async setAutoCheck(enabled: boolean): Promise<UpdateConfig | null> {
    if (!this.isAvailable()) return null;
    return api().autoUpdateSetAutoCheck(enabled);
  }

  async checkNow(): Promise<void> {
    if (!this.isAvailable()) return;
    await api().autoUpdateCheckNow();
  }

  async quitAndInstall(): Promise<void> {
    if (!this.isAvailable()) return;
    await api().autoUpdateQuitAndInstall();
  }

  ngOnDestroy(): void {
    if (this.unsubscribe) this.unsubscribe();
  }
}
