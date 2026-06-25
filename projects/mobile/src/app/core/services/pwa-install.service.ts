import { Injectable, NgZone, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

/**
 * Maneja el prompt de instalación de la PWA ("Agregar a la pantalla de inicio").
 * El evento `beforeinstallprompt` se captura tan temprano como sea posible (en
 * main.ts se stashéa en window.__pwaPrompt); este servicio lo recoge y expone un
 * observable + método install(). Requiere HTTPS + manifest + service worker.
 */
@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  private readonly zone = inject(NgZone);
  private deferred: any = (window as any).__pwaPrompt || null;
  readonly canInstall$ = new BehaviorSubject<boolean>(!!this.deferred && !this.installed);

  constructor() {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferred = e;
      this.zone.run(() => this.canInstall$.next(!this.installed));
    });
    window.addEventListener('appinstalled', () => {
      this.deferred = null;
      this.zone.run(() => this.canInstall$.next(false));
    });
  }

  get installed(): boolean {
    return (
      window.matchMedia?.('(display-mode: standalone)')?.matches === true ||
      (navigator as any).standalone === true
    );
  }

  async install(): Promise<void> {
    if (!this.deferred) return;
    this.deferred.prompt();
    try {
      await this.deferred.userChoice;
    } catch {
      /* el usuario canceló */
    }
    this.deferred = null;
    this.zone.run(() => this.canInstall$.next(false));
  }
}
