import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { RepositoryService } from '@frc/shared-core';

interface ClienteVM {
  id: number;
  nombre: string;
  doc?: string;
}

export interface ClienteSeleccionado {
  id: number;
  nombre: string;
}

/**
 * Buscar/crear cliente para asociar a la cuenta de una mesa. La búsqueda es
 * proactiva (igual que el buscador de productos). "Nuevo cliente" abre un
 * formulario donde solo el nombre es obligatorio (documento/ruc importantes
 * pero opcionales; teléfono/dirección opcionales).
 */
@Component({
  selector: 'app-cliente-mesa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatRippleModule,
  ],
  template: `
    <h2 mat-dialog-title class="cm-title">{{ modoCrear ? 'Nuevo cliente' : 'Cliente' }}</h2>
    <mat-progress-bar *ngIf="cargando" mode="indeterminate"></mat-progress-bar>

    <mat-dialog-content class="cm-content">
      <!-- Búsqueda -->
      <ng-container *ngIf="!modoCrear">
        <mat-form-field appearance="outline" class="cm-field">
          <mat-label>Buscar por nombre o documento</mat-label>
          <input
            matInput
            class="cm-upper"
            [ngModel]="termino"
            (ngModelChange)="onTermino($event)"
            placeholder="NOMBRE / DOC / RUC"
            autofocus
          />
          <mat-icon matSuffix>search</mat-icon>
        </mat-form-field>

        <div class="cm-list" *ngIf="termino.length >= 2">
          <button
            *ngFor="let c of resultados"
            class="cm-item"
            mat-ripple
            (click)="elegir(c)"
          >
            <span class="cm-item-nombre">{{ c.nombre }}</span>
            <span class="cm-item-doc" *ngIf="c.doc">{{ c.doc }}</span>
          </button>
          <p *ngIf="resultados.length === 0 && !cargando" class="cm-empty">
            Sin resultados. Podés crear un cliente nuevo.
          </p>
        </div>
        <p *ngIf="termino.length < 2" class="cm-hint">Escribí al menos 2 caracteres para buscar.</p>
      </ng-container>

      <!-- Alta -->
      <ng-container *ngIf="modoCrear">
        <mat-form-field appearance="outline" class="cm-field">
          <mat-label>Nombre *</mat-label>
          <input matInput class="cm-upper" [(ngModel)]="nuevo.nombre" autofocus />
        </mat-form-field>
        <mat-form-field appearance="outline" class="cm-field">
          <mat-label>Documento</mat-label>
          <input matInput class="cm-upper" [(ngModel)]="nuevo.documento" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="cm-field">
          <mat-label>RUC</mat-label>
          <input matInput class="cm-upper" [(ngModel)]="nuevo.ruc" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="cm-field">
          <mat-label>Teléfono</mat-label>
          <input matInput [(ngModel)]="nuevo.telefono" />
        </mat-form-field>
      </ng-container>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button *ngIf="modoCrear" (click)="modoCrear = false" [disabled]="cargando">Volver</button>
      <button mat-button *ngIf="!modoCrear" (click)="abrirCrear()">Nuevo cliente</button>
      <button mat-button (click)="cerrar()" [disabled]="cargando">Cancelar</button>
      <button
        *ngIf="modoCrear"
        mat-flat-button
        color="primary"
        [disabled]="!nuevo.nombre.trim() || cargando"
        (click)="crear()"
      >
        Guardar y asignar
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .cm-title { margin: 0; font-size: 1.15rem; }
      .cm-content { display: flex; flex-direction: column; gap: 4px; min-width: 280px; }
      .cm-field { width: 100%; }
      .cm-upper { text-transform: uppercase; }
      .cm-list { display: flex; flex-direction: column; }
      .cm-item {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 2px;
        text-align: left;
        border: none;
        background: transparent;
        padding: 10px 8px;
        border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
        cursor: pointer;
        color: var(--text-primary, rgba(0, 0, 0, 0.87));
      }
      .cm-item-nombre { font-weight: 700; font-size: 1rem; }
      .cm-item-doc { font-size: 0.85rem; color: var(--text-secondary, rgba(0, 0, 0, 0.6)); }
      .cm-empty, .cm-hint {
        margin: 8px 0;
        font-size: 0.9rem;
        color: var(--text-secondary, rgba(0, 0, 0, 0.6));
      }
    `,
  ],
})
export class ClienteMesaDialogComponent {
  private readonly repo = inject(RepositoryService);
  private readonly dialogRef = inject(MatDialogRef<ClienteMesaDialogComponent>);

  termino = '';
  resultados: ClienteVM[] = [];
  cargando = false;
  modoCrear = false;
  private searchTimer: any = null;

  nuevo = { nombre: '', documento: '', ruc: '', telefono: '' };

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
    if (t.length < 2) return;
    this.cargando = true;
    this.repo.getClientes({ termino: t } as any).subscribe({
      next: (data: any[]) => {
        this.resultados = (data || []).map((c) => this.toVM(c));
        this.cargando = false;
      },
      error: () => {
        this.resultados = [];
        this.cargando = false;
      },
    });
  }

  private toVM(c: any): ClienteVM {
    const nombre = [c.persona?.nombre, c.persona?.apellido].filter(Boolean).join(' ') || 'Cliente';
    const doc = c.ruc || c.persona?.documento || c.razon_social || undefined;
    return { id: c.id, nombre, doc };
  }

  abrirCrear(): void {
    // Prellenar el nombre con lo tipeado en la búsqueda.
    if (this.termino.trim() && !this.nuevo.nombre) this.nuevo.nombre = this.termino.trim();
    this.modoCrear = true;
  }

  elegir(c: ClienteVM): void {
    this.dialogRef.close({ id: c.id, nombre: c.nombre } as ClienteSeleccionado);
  }

  async crear(): Promise<void> {
    if (!this.nuevo.nombre.trim()) return;
    const api = (window as any).api;
    if (!api?.callIpc) return;
    this.cargando = true;
    try {
      const cli: any = await api.callIpc('crear-cliente-mesa', {
        nombre: this.nuevo.nombre,
        documento: this.nuevo.documento || undefined,
        ruc: this.nuevo.ruc || undefined,
        telefono: this.nuevo.telefono || undefined,
      });
      const nombre = cli?.persona?.nombre || this.nuevo.nombre.trim().toUpperCase();
      this.dialogRef.close({ id: cli?.id, nombre } as ClienteSeleccionado);
    } catch {
      this.cargando = false;
    }
  }

  cerrar(): void {
    this.dialogRef.close();
  }
}
