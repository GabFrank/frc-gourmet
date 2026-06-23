import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ConnectionService } from '../data/connection.service';

/**
 * Banner global "sin conexión". En el MVP no hay modo offline: si el server no
 * responde, se muestra esto y la UI bloquea acciones.
 */
@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="offline-banner" *ngIf="(online$ | async) === false">
      <mat-icon>cloud_off</mat-icon>
      <span>Sin conexión con el servidor</span>
    </div>
  `,
  styles: [
    `
      .offline-banner {
        position: fixed;
        left: 50%;
        bottom: calc(72px + env(safe-area-inset-bottom));
        transform: translateX(-50%);
        z-index: 1000;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        border-radius: 999px;
        background: var(--warning-color);
        color: #fff;
        font-size: 0.9rem;
        font-weight: 500;
        box-shadow: 0 4px 16px var(--shadow-color);
      }
      mat-icon {
        font-size: 20px;
        height: 20px;
        width: 20px;
      }
    `,
  ],
})
export class OfflineBannerComponent {
  private readonly connection = inject(ConnectionService);
  readonly online$ = this.connection.online$;
}
