import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService, PersonaTipo } from '@frc/shared-core';

/**
 * Placeholder de F0: prueba el cableado de `@frc/shared-core` (DI de un servicio
 * browser-safe + uso de un enum de dominio) y que el build mobile compila.
 * Se reemplaza por el shell real en F3.
 */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  // Smoke test de DI: el servicio compartido se resuelve en el contexto browser.
  private readonly theme = inject(ThemeService);

  // Smoke test de enum compartido (valor en runtime, no solo tipo).
  readonly tiposPersona = Object.values(PersonaTipo);

  readonly version = 'F0 — cimientos';
}
