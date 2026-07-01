import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

export interface VincularProductoResult {
  productoId: number;
  productoNombre: string;
}

/**
 * Busca un producto para vincularlo a la receta (completa la pre-receta).
 * Devuelve el producto elegido; el llamador hace updateProducto({recetaId}).
 */
@Component({
  selector: 'app-vincular-producto-dialog',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatProgressBarModule,
  ],
  template: `
    <h2 mat-dialog-title>Vincular producto</h2>
    <mat-dialog-content class="vp-content">
      <mat-form-field appearance="outline" class="vp-field">
        <mat-label>Buscar producto</mat-label>
        <input matInput [ngModel]="termino" (ngModelChange)="onTermino($event)" autocapitalize="characters" />
      </mat-form-field>
      <mat-progress-bar *ngIf="buscando" mode="indeterminate"></mat-progress-bar>
      <div class="vp-resultados">
        <button class="vp-resultado" *ngFor="let p of resultados" (click)="elegir(p)">{{ p.nombre }}</button>
        <p *ngIf="!buscando && termino.length >= 2 && resultados.length === 0" class="vp-empty">Sin resultados.</p>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()">Cancelar</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .vp-content { display: flex; flex-direction: column; min-width: 280px; }
      .vp-field { width: 100%; }
      .vp-resultados { display: flex; flex-direction: column; max-height: 260px; overflow-y: auto; }
      .vp-resultado {
        text-align: left; padding: 12px; border: none; border-bottom: 1px solid var(--border-color);
        background: transparent; color: var(--text-primary); font-size: 0.9rem; cursor: pointer;
      }
      .vp-resultado:hover { background: var(--hover-bg, rgba(127,127,127,0.1)); }
      .vp-empty { color: var(--text-secondary); padding: 12px; }
    `,
  ],
})
export class VincularProductoDialogComponent {
  private readonly repo = inject(RepositoryService);
  private readonly dialogRef = inject(MatDialogRef<VincularProductoDialogComponent, VincularProductoResult>);

  termino = '';
  buscando = false;
  resultados: { id: number; nombre: string }[] = [];
  private searchTimer: any = null;

  onTermino(valor: string): void {
    this.termino = (valor || '').toUpperCase();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.termino.trim().length < 2) {
      this.resultados = [];
      return;
    }
    this.searchTimer = setTimeout(() => this.buscar(), 300);
  }

  private buscar(): void {
    const t = this.termino.trim();
    if (!t) return;
    this.buscando = true;
    this.repo.searchProductosByNombre(t, 'venta').subscribe({
      next: (data: any[]) => {
        this.resultados = (data || []).map((p) => ({ id: p.id, nombre: p.nombre }));
        this.buscando = false;
      },
      error: () => {
        this.buscando = false;
      },
    });
  }

  elegir(p: { id: number; nombre: string }): void {
    this.dialogRef.close({ productoId: p.id, productoNombre: p.nombre });
  }

  cancelar(): void {
    this.dialogRef.close();
  }
}
