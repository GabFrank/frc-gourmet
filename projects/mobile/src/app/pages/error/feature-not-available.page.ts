import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';

/**
 * Página de error amigable para funciones NO disponibles en mobile.
 * 
 * Uso: deep link #/o/pago/{id} → pago consolidado NO existe en mobile.
 * Mensaje claro: "Esta operación solo puede verse en la aplicación de escritorio."
 * 
 * No requiere permisos (público para cualquier usuario logueado).
 */
@Component({
  selector: 'app-feature-not-available',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule, MatCardModule,
  ],
  templateUrl: './feature-not-available.page.html',
  styleUrls: ['./feature-not-available.page.scss'],
})
export class FeatureNotAvailablePage {
  private readonly location = inject(Location);

  goBack(): void {
    this.location.back();
  }

  goHome(): void {
    // Navegar a home (/)
    window.location.href = '/';
  }
}
