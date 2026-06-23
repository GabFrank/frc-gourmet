import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

/**
 * Página genérica "Próximamente" para secciones que aún no tienen su módulo
 * (se reemplazan por el CRUD real en cada ola). El contenido sale de `route.data`.
 */
@Component({
  selector: 'app-placeholder',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <section class="placeholder">
      <mat-icon class="ph-icon">{{ icon }}</mat-icon>
      <h2 class="ph-title">{{ title }}</h2>
      <p class="ph-text">Módulo en construcción. Llega en una próxima ola del MVP administrativo.</p>
    </section>
  `,
  styles: [
    `
      .placeholder {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 8px;
        padding: 48px 24px;
        min-height: 60vh;
        color: var(--text-secondary);
      }
      .ph-icon {
        font-size: 56px;
        height: 56px;
        width: 56px;
        color: var(--text-secondary);
      }
      .ph-title {
        margin: 8px 0 0;
        color: var(--text-primary);
      }
      .ph-text {
        max-width: 360px;
        margin: 0;
      }
    `,
  ],
})
export class PlaceholderPage {
  private readonly route = inject(ActivatedRoute);
  private readonly data = this.route.snapshot.data;

  readonly title = typeof this.data['title'] === 'string' ? this.data['title'] : 'Sección';
  readonly icon = typeof this.data['icon'] === 'string' ? this.data['icon'] : 'construction';
}
