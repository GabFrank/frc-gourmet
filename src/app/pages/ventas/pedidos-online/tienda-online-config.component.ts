import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { RepositoryService } from '../../../database/repository.service';

/**
 * Config de la TIENDA ONLINE (cierre MVP). Una sola fila: apertura, tipos de
 * pedido, prep-time, mínimo, aceptación automática y branding.
 * Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
@Component({
  selector: 'app-tienda-online-config',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSlideToggleModule, MatButtonModule, MatIconModule, MatSnackBarModule,
  ],
  template: `
    <div class="config-container">
      <h2>Configuración de la tienda online</h2>
      <p class="muted" *ngIf="cargando">Cargando…</p>

      <mat-card class="config-card" *ngIf="!cargando">
        <mat-slide-toggle [(ngModel)]="cfg.activa" color="primary" class="row-toggle">
          Tienda activa (toma pedidos)
        </mat-slide-toggle>
        <span class="estado-chip" [class.abierta]="cfg.abiertaAhora">
          {{ cfg.abiertaAhora ? 'Abierta ahora' : 'Cerrada ahora' }}
        </span>

        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>Nombre del comercio</mat-label>
            <input matInput [(ngModel)]="cfg.nombreComercio" maxlength="150">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Color de marca (hex)</mat-label>
            <input matInput [(ngModel)]="cfg.colorPrimario" placeholder="#c0392b" maxlength="20">
          </mat-form-field>
          <mat-form-field appearance="outline" class="full">
            <mat-label>Mensaje de bienvenida</mat-label>
            <input matInput [(ngModel)]="cfg.mensajeBienvenida" maxlength="300">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Prep-time (minutos)</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="cfg.prepTimeMinutos">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Monto mínimo de pedido</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="cfg.montoMinimoPedido">
          </mat-form-field>
        </div>

        <div class="toggles">
          <mat-slide-toggle [(ngModel)]="cfg.permitePickup" color="primary">Permite retiro (pickup)</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="cfg.permiteDelivery" color="primary">Permite delivery</mat-slide-toggle>
          <mat-slide-toggle [(ngModel)]="cfg.aceptacionAutomatica" color="warn">
            Aceptación automática (sin revisión en el PdV)
          </mat-slide-toggle>
        </div>

        <div class="actions">
          <button mat-flat-button color="primary" [disabled]="guardando" (click)="guardar()">
            <mat-icon>save</mat-icon> Guardar
          </button>
        </div>
      </mat-card>
    </div>
  `,
  styles: [`
    .config-container { padding: 16px; height: 100%; overflow-y: auto; box-sizing: border-box; }
    h2 { color: var(--text-primary); margin: 0 0 16px; }
    .muted { color: var(--text-secondary); }
    .config-card { max-width: 760px; padding: 20px; }
    .row-toggle { margin-right: 12px; }
    .estado-chip { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--surface-variant); color: var(--error-color); border: 1px solid var(--error-color); }
    .estado-chip.abierta { color: var(--success-color); border-color: var(--success-color); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px 0 6px; }
    .grid .full { grid-column: 1 / -1; }
    .toggles { display: flex; flex-direction: column; gap: 10px; margin: 8px 0 18px; }
    .actions { display: flex; justify-content: flex-end; }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class TiendaOnlineConfigComponent implements OnInit {
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);

  cfg: any = { activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30, montoMinimoPedido: 0 };
  cargando = true;
  guardando = false;

  ngOnInit(): void {
    this.repo.getTiendaOnlineConfig().subscribe({
      next: (c) => { this.cfg = c || this.cfg; this.cargando = false; },
      error: () => { this.cargando = false; },
    });
  }

  guardar(): void {
    this.guardando = true;
    this.repo.updateTiendaOnlineConfig(this.cfg).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) {
          this.cfg = res.config;
          this.snack.open('Configuración guardada', 'OK', { duration: 2500 });
        } else {
          this.snack.open('No se pudo guardar', 'OK', { duration: 3000 });
        }
      },
      error: (e) => {
        this.guardando = false;
        this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3500 });
      },
    });
  }
}
