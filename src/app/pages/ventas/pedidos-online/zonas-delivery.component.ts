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
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { RepositoryService } from '../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { MapaZonasDialogComponent } from './mapa-zonas-dialog/mapa-zonas-dialog.component';

/** ABM de Zonas de Delivery (tarifa + mínimo por zona) para pedidos online. */
@Component({
  selector: 'app-zonas-delivery',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatFormFieldModule, MatInputModule,
    MatSlideToggleModule, MatButtonModule, MatIconModule, MatSnackBarModule, MatDialogModule, MatMenuModule,
  ],
  template: `
    <div class="zonas-container">
      <div class="header">
        <h2>Zonas de Delivery</h2>
        <button mat-flat-button color="primary" (click)="nueva()"><mat-icon>add</mat-icon> Nueva zona</button>
      </div>

      <mat-card class="form-card" *ngIf="editando">
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>Nombre</mat-label>
            <input matInput [(ngModel)]="editando.nombre" maxlength="150">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Tarifa de envío</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="editando.tarifa">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Monto mínimo</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="editando.montoMinimo">
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Orden</mat-label>
            <input matInput type="number" [(ngModel)]="editando.orden">
          </mat-form-field>
        </div>
        <mat-slide-toggle [(ngModel)]="editando.activa" color="primary">Activa</mat-slide-toggle>
        <div class="actions">
          <button mat-button (click)="editando = null">Cancelar</button>
          <button mat-flat-button color="primary" [disabled]="guardando" (click)="guardar()">Guardar</button>
        </div>
      </mat-card>

      <p class="muted" *ngIf="cargando">Cargando…</p>
      <p class="muted" *ngIf="!cargando && !zonas.length">No hay zonas cargadas. El delivery necesita al menos una.</p>
      <p class="aviso" *ngIf="!cargando && zonas.length && !algunaDibujada">
        Ninguna zona tiene su área dibujada todavía: hasta que dibujes al menos una, el sistema
        no puede calcular el costo del envío de un pedido online.
      </p>

      <table class="tabla" *ngIf="zonas.length">
        <thead>
          <tr><th>Zona</th><th>Envío</th><th>Mínimo</th><th>Cobertura</th><th>Estado</th><th></th></tr>
        </thead>
        <tbody>
          <tr *ngFor="let z of zonas">
            <td>{{ z.nombre }}</td>
            <td>{{ z.tarifa | number:'1.0-2' }}</td>
            <td>{{ z.montoMinimo | number:'1.0-2' }}</td>
            <td>
              <span class="chip" [class.on]="z.poligono" [class.warn]="!z.poligono">
                {{ z.poligono ? 'Dibujada' : 'Sin dibujar' }}
              </span>
            </td>
            <td><span class="chip" [class.on]="z.activa">{{ z.activa ? 'Activa' : 'Inactiva' }}</span></td>
            <td class="acc">
              <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="dibujar(z)">
                  <mat-icon>map</mat-icon><span>Dibujar en el mapa</span>
                </button>
                <button mat-menu-item (click)="editar(z)">
                  <mat-icon>edit</mat-icon><span>Editar datos</span>
                </button>
                <button mat-menu-item (click)="eliminar(z)">
                  <mat-icon color="warn">delete</mat-icon><span>Eliminar</span>
                </button>
              </mat-menu>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  styles: [`
    .zonas-container { padding: 16px; height: 100%; overflow-y: auto; box-sizing: border-box; }
    .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
    .header h2 { margin: 0; color: var(--text-primary); }
    .muted { color: var(--text-secondary); }
    .aviso { color: var(--warning-color); max-width: 760px; }
    .form-card { padding: 16px; margin-bottom: 16px; max-width: 760px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
    .tabla { width: 100%; border-collapse: collapse; max-width: 760px; }
    .tabla th, .tabla td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border-color); color: var(--text-primary); }
    .tabla th { color: var(--text-secondary); font-size: 13px; }
    .acc { text-align: right; white-space: nowrap; }
    .chip { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 20px; background: var(--surface-variant); color: var(--text-secondary); }
    .chip.on { color: var(--success-color); border: 1px solid var(--success-color); }
    .chip.warn { color: var(--warning-color); border: 1px solid var(--warning-color); }
    @media (max-width: 600px) { .grid { grid-template-columns: 1fr; } }
  `],
})
export class ZonasDeliveryComponent implements OnInit {
  private repo = inject(RepositoryService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  zonas: any[] = [];
  /** Precomputado: en el template no se llaman funciones. */
  algunaDibujada = false;
  cargando = true;
  guardando = false;
  editando: any = null;

  ngOnInit(): void { this.cargar(); }

  cargar(): void {
    this.cargando = true;
    this.repo.getZonasDeliveryAdmin().subscribe({
      next: (z) => {
        this.zonas = z || [];
        this.algunaDibujada = this.zonas.some((x) => !!x.poligono);
        this.cargando = false;
      },
      error: () => { this.cargando = false; },
    });
  }

  nueva(): void { this.editando = { nombre: '', tarifa: 0, montoMinimo: 0, activa: true, orden: 0, poligono: null }; }
  editar(z: any): void { this.editando = { ...z }; }

  guardar(): void {
    if (!this.editando?.nombre?.trim()) { this.snack.open('Ingresá un nombre', 'OK', { duration: 2500 }); return; }
    this.guardando = true;
    this.repo.guardarZonaDelivery(this.editando).subscribe({
      next: (res) => {
        this.guardando = false;
        if (res?.success) { this.editando = null; this.cargar(); this.snack.open('Zona guardada', 'OK', { duration: 2000 }); }
        else this.snack.open('No se pudo guardar: ' + (res?.error || ''), 'OK', { duration: 3000 });
      },
      error: (e) => { this.guardando = false; this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }); },
    });
  }

  /** Abre el mapa para dibujar el área de la zona y guarda el polígono. */
  dibujar(z: any): void {
    const ref = this.dialog.open(MapaZonasDialogComponent, {
      width: '90vw', maxWidth: '1100px',
      data: { zona: z, otras: this.zonas.filter((o) => o.id !== z.id) },
    });
    ref.afterClosed().subscribe((poligono: string | undefined) => {
      if (!poligono) return;
      this.repo.guardarZonaDelivery({ ...z, poligono }).subscribe({
        next: (res: any) => {
          if (res?.success) { this.cargar(); this.snack.open('Zona dibujada', 'OK', { duration: 2000 }); }
          else this.snack.open('No se pudo guardar: ' + (res?.error || ''), 'OK', { duration: 3000 });
        },
        error: (e: any) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }),
      });
    });
  }

  eliminar(z: any): void {
    // Borrar una zona referenciada por pedidos históricos les rompe la
    // trazabilidad, así que se confirma como cualquier destructivo del sistema.
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar zona',
        message: `¿Eliminar la zona "${z.nombre}"? Los pedidos que la usaron van a quedar sin zona.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe((confirmado: boolean) => {
      if (!confirmado) return;
      this.repo.eliminarZonaDelivery(z.id).subscribe({
        next: () => { this.cargar(); this.snack.open('Zona eliminada', 'OK', { duration: 2000 }); },
        error: (e) => this.snack.open('Error: ' + (e?.message || ''), 'OK', { duration: 3000 }),
      });
    });
  }
}
