import { Component, Inject, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

export interface TransferirMesaData {
  mesaActualId: number;
}

export interface MesaDestino {
  id: number;
  numero: string;
  ventaId: number | null;
}

interface MesaVM {
  id: number;
  numero: string;
  sector?: string;
  ocupada: boolean;
  ventaId: number | null;
}

/**
 * Diálogo para elegir la mesa destino al transferir una cuenta. Lista las mesas
 * activas (menos la actual) con su estado. Devuelve la mesa elegida (con su
 * ventaId si está ocupada) o `undefined`.
 */
@Component({
  selector: 'app-transferir-mesa-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule, MatProgressBarModule],
  template: `
    <h2 mat-dialog-title>Transferir a…</h2>
    <mat-progress-bar *ngIf="cargando" mode="indeterminate"></mat-progress-bar>
    <mat-dialog-content>
      <div class="lista">
        <button
          *ngFor="let m of mesas"
          class="mrow"
          (click)="ref.close({ id: m.id, numero: m.numero, ventaId: m.ventaId })"
        >
          <div class="mrow-main">
            <span class="mrow-num">Mesa {{ m.numero }}</span>
            <span class="mrow-sector" *ngIf="m.sector">{{ m.sector }}</span>
          </div>
          <span class="mrow-estado" [class.off]="!m.ocupada">{{ m.ocupada ? 'Ocupada' : 'Libre' }}</span>
        </button>
      </div>
      <p *ngIf="!cargando && mesas.length === 0" class="vacio">No hay otras mesas disponibles.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="ref.close(undefined)">Cancelar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .lista {
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 260px;
      }
      .mrow {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border: 1px solid var(--border-color, rgba(0, 0, 0, 0.12));
        background: var(--card-background, #fff);
        color: var(--text-primary, inherit);
        border-radius: 8px;
        padding: 10px 12px;
        cursor: pointer;
        text-align: left;
      }
      .mrow-main {
        display: flex;
        flex-direction: column;
      }
      .mrow-num {
        font-weight: 600;
      }
      .mrow-sector {
        font-size: 0.8rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
      .mrow-estado {
        font-size: 0.8rem;
        color: var(--warn-color, #c62828);
        font-weight: 600;
      }
      .mrow-estado.off {
        color: var(--success-color, #2e7d32);
      }
      .vacio {
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
        font-size: 0.9rem;
      }
    `,
  ],
})
export class TransferirMesaDialogComponent implements OnInit {
  private readonly repo = inject(RepositoryService);

  cargando = true;
  mesas: MesaVM[] = [];

  constructor(
    public ref: MatDialogRef<TransferirMesaDialogComponent, MesaDestino | undefined>,
    @Inject(MAT_DIALOG_DATA) public data: TransferirMesaData,
  ) {}

  ngOnInit(): void {
    this.repo.getPdvMesasActivas().subscribe({
      next: (data: any[]) => {
        this.mesas = (data || [])
          .filter((m) => m.id !== this.data.mesaActualId)
          .map((m) => ({
            id: m.id,
            numero: m.numero,
            sector: m.sector?.nombre,
            ocupada: !!m.venta?.id || m.estado === 'OCUPADO',
            ventaId: m.venta?.id ?? null,
          }));
        this.cargando = false;
      },
      error: () => {
        this.cargando = false;
      },
    });
  }
}
