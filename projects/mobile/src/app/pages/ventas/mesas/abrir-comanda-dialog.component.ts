import { Component, Inject, OnInit, Optional, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RepositoryService } from '@frc/shared-core';

export interface AbrirComandaData {
  /** Modo editar (mover comanda): prefila y cambia el título/botón. */
  modoEditar?: boolean;
  mesaId?: number | null;
  observacion?: string;
}

export interface AbrirComandaResult {
  mesaId?: number;
  observacion?: string;
}

interface MesaOpt {
  id: number;
  numero: number;
}

/**
 * Apertura de comanda (mobile): pasa la comanda de DISPONIBLE a OCUPADO. Pide
 * (opcional) una mesa donde ubicarla y una observación. El sector se sincroniza
 * en el backend a partir de la mesa. Devuelve { mesaId?, observacion? }.
 */
@Component({
  selector: 'app-abrir-comanda-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ modoEditar ? 'Editar comanda' : 'Abrir comanda' }}</h2>
    <mat-dialog-content class="ac-content">
      <mat-form-field appearance="outline" class="ac-field">
        <mat-label>Mesa (opcional)</mat-label>
        <mat-select [(ngModel)]="mesaId">
          <mat-option [value]="null">— Sin mesa —</mat-option>
          <mat-option *ngFor="let m of mesas" [value]="m.id">Mesa {{ m.numero }}</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" class="ac-field">
        <mat-label>Observación (opcional)</mat-label>
        <input matInput class="ac-upper" [(ngModel)]="observacion" placeholder="EJ: SIN PICANTE" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close()">Cancelar</button>
      <button mat-flat-button color="primary" (click)="aceptar()">{{ modoEditar ? 'Guardar' : 'Abrir' }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .ac-content { display: flex; flex-direction: column; gap: 4px; min-width: 280px; }
      .ac-field { width: 100%; }
      .ac-upper { text-transform: uppercase; }
    `,
  ],
})
export class AbrirComandaDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);
  readonly ref = inject(MatDialogRef<AbrirComandaDialogComponent>);

  mesas: MesaOpt[] = [];
  mesaId: number | null = null;
  observacion = '';
  modoEditar = false;

  constructor(@Optional() @Inject(MAT_DIALOG_DATA) data?: AbrirComandaData) {
    if (data) {
      this.modoEditar = !!data.modoEditar;
      this.mesaId = data.mesaId ?? null;
      this.observacion = data.observacion || '';
    }
  }

  ngOnInit(): void {
    this.repo.getPdvMesasActivas().subscribe({
      next: (data: any[]) => {
        this.mesas = (data || []).map((m) => ({ id: m.id, numero: m.numero }));
      },
      error: () => {
        /* sin mesas: queda solo observación */
      },
    });
  }

  aceptar(): void {
    const res: AbrirComandaResult = {};
    if (this.mesaId != null) res.mesaId = this.mesaId;
    if (this.observacion.trim()) res.observacion = this.observacion.trim().toUpperCase();
    this.ref.close(res);
  }
}
