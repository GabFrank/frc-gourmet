import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

export interface PresentacionLite {
  id: number;
  nombre: string;
  cantidad: number;
  principal: boolean;
}

@Component({
  selector: 'app-crear-presentacion-inline-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DecimalPipe,
    MatButtonModule,
    MatDialogModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon class="title-icon">add_box</mat-icon>
      Crear presentación
    </h2>
    <mat-dialog-content>
      <p class="hint" *ngIf="data?.productoNombre">
        Producto: <strong>{{ data.productoNombre }}</strong>
      </p>

      <div class="row">
        <mat-form-field appearance="outline" class="grow">
          <mat-label>Nombre presentación</mat-label>
          <input matInput [(ngModel)]="nombre" placeholder="UNIDAD, CAJA, PACK X6..." />
        </mat-form-field>
        <mat-form-field appearance="outline" class="qty">
          <mat-label>Cantidad</mat-label>
          <input matInput type="number" [(ngModel)]="cantidad" />
        </mat-form-field>
      </div>
      <div class="toggles">
        <mat-slide-toggle [(ngModel)]="principal" color="primary">Principal</mat-slide-toggle>
        <button mat-flat-button color="primary" (click)="crear()" [disabled]="saving || !nombre">
          <mat-icon>save</mat-icon>
          <span *ngIf="!saving">Crear y usar</span>
          <mat-spinner *ngIf="saving" diameter="18"></mat-spinner>
        </button>
      </div>

      <mat-divider class="divisor"></mat-divider>
      <h4>Presentaciones existentes</h4>
      <div class="lista" *ngIf="!loadingLista; else cargando">
        <div class="lista-empty" *ngIf="presentaciones.length === 0">Este producto todavía no tiene presentaciones.</div>
        <button type="button" class="pres-row" *ngFor="let p of presentaciones" (click)="usar(p)"
                matTooltip="Usar esta presentación">
          <span class="pres-nombre">{{ p.nombre }}<mat-icon *ngIf="p.principal" class="star" matTooltip="Principal">star</mat-icon></span>
          <span class="pres-cant">{{ p.cantidad | number:'1.0-2' }}</span>
        </button>
      </div>
      <ng-template #cargando><mat-spinner diameter="24" class="lista-spinner"></mat-spinner></ng-template>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancelar()" [disabled]="saving">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .title-icon { vertical-align: middle; margin-right: 6px; color: var(--accent, #ef6c00); }
    .hint { font-size: 12px; color: var(--text-secondary); margin: 0 0 12px 0; strong { color: var(--text-primary); } }
    .row { display: flex; gap: 12px; }
    .grow { flex: 1; }
    .qty { width: 140px; }
    .toggles { display: flex; gap: 16px; align-items: center; padding: 4px 0 8px; flex-wrap: wrap; }
    .toggles button { margin-left: auto; }
    h4 { margin: 4px 0 8px; color: var(--text-secondary); font-size: 13px; }
    .divisor { margin: 8px 0 12px; }
    .lista { display: flex; flex-direction: column; gap: 4px; max-height: 220px; overflow-y: auto; }
    .lista-empty { font-size: 13px; color: var(--text-secondary); padding: 8px 0; }
    .lista-spinner { margin: 8px auto; }
    .pres-row {
      display: flex; justify-content: space-between; align-items: center; gap: 10px;
      width: 100%; text-align: left; cursor: pointer;
      background: var(--surface-variant, rgba(0,0,0,0.04)); border: 1px solid var(--border-color, rgba(0,0,0,0.08));
      border-radius: 6px; padding: 8px 12px; color: var(--text-primary); font: inherit;
    }
    .pres-row:hover { background: var(--hover-color, rgba(0,0,0,0.08)); }
    .pres-nombre { display: flex; align-items: center; gap: 4px; font-weight: 600; }
    .pres-nombre .star { font-size: 16px; width: 16px; height: 16px; color: #f9a825; }
    .pres-cant { color: var(--text-secondary); white-space: nowrap; }
  `],
})
export class CrearPresentacionInlineDialogComponent implements OnInit {
  nombre = '';
  cantidad = 1;
  principal = false;
  saving = false;
  loadingLista = true;
  presentaciones: PresentacionLite[] = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { productoId: number; productoNombre?: string; descripcionOcr?: string },
    private repo: RepositoryService,
    private dialogRef: MatDialogRef<CrearPresentacionInlineDialogComponent>,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargarLista();
  }

  private async cargarLista(): Promise<void> {
    this.loadingLista = true;
    try {
      const res: any = await firstValueFrom(this.repo.getPresentacionesByProducto(this.data.productoId, 0, 50, 'activos'));
      const items: any[] = res?.data || res?.items || (Array.isArray(res) ? res : []) || [];
      this.presentaciones = items.map((p) => ({
        id: p.id,
        nombre: p.nombre || '(sin nombre)',
        cantidad: Number(p.cantidad) || 1,
        principal: !!p.principal,
      }));
      // Si aún no hay presentaciones, la primera que se cree debería ser principal.
      if (this.presentaciones.length === 0) this.principal = true;
    } catch {
      this.presentaciones = [];
    } finally {
      this.loadingLista = false;
    }
  }

  async crear(): Promise<void> {
    if (!this.nombre?.trim() || this.saving) return;
    this.saving = true;
    try {
      const creada: any = await firstValueFrom(this.repo.createPresentacion({
        producto: { id: this.data.productoId } as any,
        nombre: this.nombre.trim().toUpperCase(),
        cantidad: Number(this.cantidad) || 1,
        principal: !!this.principal,
        activo: true,
      } as any));
      this.saving = false;
      const lite: PresentacionLite = {
        id: creada.id,
        nombre: creada.nombre || this.nombre.trim().toUpperCase(),
        cantidad: Number(creada.cantidad) || Number(this.cantidad) || 1,
        principal: !!creada.principal,
      };
      this.dialogRef.close(lite);
    } catch (err: any) {
      this.saving = false;
      this.snackBar.open('Error al crear presentación: ' + (err?.message || ''), 'Cerrar', { duration: 6000 });
    }
  }

  usar(p: PresentacionLite): void {
    this.dialogRef.close(p);
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }
}
