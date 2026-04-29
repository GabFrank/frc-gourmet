import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { AgregarItemDialogComponent } from '../agregar-item-dialog/agregar-item-dialog.component';
import { PagarLiquidacionDialogComponent } from '../pagar-dialog/pagar-liquidacion-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-liquidacion-sueldo-detalle',
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="page" *ngIf="!loading; else loadingTpl">
      <mat-card *ngIf="liquidacion">
        <mat-card-content>
          <div class="header">
            <div class="header-left">
              <h2>
                Liquidacion {{ liquidacion.periodo }}
                <mat-chip-listbox class="estado-chip">
                  <mat-chip [color]="getColorEstado(liquidacion.estado)" highlighted>
                    {{ liquidacion.estado }}
                  </mat-chip>
                </mat-chip-listbox>
              </h2>
              <p class="meta">
                {{ liquidacion.funcionario?.persona?.nombre }} {{ liquidacion.funcionario?.persona?.apellido || '' }}
                — {{ liquidacion.funcionario?.cargo?.nombre || '' }}
              </p>
              <p class="totales">
                Haberes: <strong class="haber">{{ liquidacion.totalHaberes | number:'1.0-2' }}</strong>
                | Descuentos: <strong class="desc">{{ liquidacion.totalDescuentos | number:'1.0-2' }}</strong>
                | Neto: <strong class="neto">{{ liquidacion.totalNeto | number:'1.0-2' }}</strong>
                {{ liquidacion.monedaPago?.simbolo }}
              </p>
            </div>
            <div class="header-actions">
              <button mat-stroked-button color="primary" (click)="regenerar()" *ngIf="puedeEditar()">
                <mat-icon>refresh</mat-icon> Regenerar
              </button>
              <button mat-stroked-button color="primary" (click)="agregarItem()" *ngIf="puedeEditar()">
                <mat-icon>add</mat-icon> Item manual
              </button>
              <button mat-flat-button color="primary" [matMenuTriggerFor]="menu">
                <mat-icon>more_vert</mat-icon> Acciones
              </button>
              <mat-menu #menu="matMenu">
                <button mat-menu-item (click)="aprobar()" [disabled]="liquidacion.estado !== 'BORRADOR'">
                  <mat-icon>check_circle</mat-icon> Aprobar
                </button>
                <button mat-menu-item (click)="volverBorrador()" [disabled]="liquidacion.estado !== 'APROBADA'">
                  <mat-icon>undo</mat-icon> Volver a BORRADOR
                </button>
                <button mat-menu-item (click)="pagar()" [disabled]="liquidacion.estado !== 'APROBADA'">
                  <mat-icon>payments</mat-icon> Pagar
                </button>
                <button mat-menu-item (click)="anular()" [disabled]="liquidacion.estado === 'ANULADA'">
                  <mat-icon>cancel</mat-icon> Anular
                </button>
              </mat-menu>
            </div>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-header><mat-card-title>Items</mat-card-title></mat-card-header>
        <mat-card-content>
          <table mat-table [dataSource]="items" class="full">
            <ng-container matColumnDef="tipo">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let i">
                <span class="tipo-tag" [class.haber]="i.tipo === 'HABER'" [class.desc]="i.tipo === 'DESCUENTO'">
                  {{ i.tipo }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="concepto">
              <th mat-header-cell *matHeaderCellDef>Concepto</th>
              <td mat-cell *matCellDef="let i">{{ i.concepto?.codigo || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="descripcion">
              <th mat-header-cell *matHeaderCellDef>Descripcion</th>
              <td mat-cell *matCellDef="let i">
                {{ i.descripcion }}
                <mat-icon *ngIf="i.manual" class="manual-icon" matTooltip="Manual">edit_note</mat-icon>
              </td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let i">
                <span [class.haber]="i.tipo === 'HABER'" [class.desc]="i.tipo === 'DESCUENTO'">
                  {{ i.tipo === 'DESCUENTO' ? '-' : '+' }}{{ i.monto | number:'1.0-2' }}
                </span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col"></th>
              <td mat-cell *matCellDef="let i">
                <button mat-icon-button (click)="eliminarItem(i)" *ngIf="puedeEditar() && i.manual" matTooltip="Eliminar item manual">
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="items.length === 0" class="empty">Sin items.</div>
        </mat-card-content>
      </mat-card>
    </div>
    <ng-template #loadingTpl>
      <div class="spinner"><mat-progress-spinner mode="indeterminate" diameter="48"></mat-progress-spinner></div>
    </ng-template>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
    .header-left h2 {
      margin: 0; display: flex; align-items: center; gap: 8px;
      .estado-chip { margin-left: 8px; }
    }
    .meta { margin: 8px 0; opacity: 0.85; }
    .totales { margin: 8px 0; font-size: 15px; }
    .header-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .full { width: 100%; }
    .acc-col { width: 60px; }
    .haber { color: #2e7d32; }
    .desc { color: #c62828; }
    .neto { font-size: 18px; }
    .tipo-tag {
      padding: 2px 8px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 500;
      &.haber { background: #e8f5e9; }
      &.desc { background: #ffebee; }
    }
    .manual-icon { font-size: 16px; width: 16px; height: 16px; vertical-align: middle; opacity: 0.6; margin-left: 6px; }
    .spinner { display: flex; justify-content: center; padding: 48px; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
  `],
})
export class LiquidacionSueldoDetalleComponent implements OnInit {
  @Input() data: any;
  liquidacionId: number | null = null;
  liquidacion: any = null;
  items: any[] = [];
  loading = false;
  cols = ['tipo', 'concepto', 'descripcion', 'monto', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  setData(data: any): void {
    this.data = data;
    if (data?.liquidacionId) {
      this.liquidacionId = data.liquidacionId;
      this.load();
    }
  }

  ngOnInit(): void {
    if (this.data?.liquidacionId) {
      this.liquidacionId = this.data.liquidacionId;
      this.load();
    }
  }

  async load(): Promise<void> {
    if (!this.liquidacionId) return;
    this.loading = true;
    try {
      const res = await firstValueFrom(this.repositoryService.getLiquidacionSueldo(this.liquidacionId));
      this.liquidacion = res;
      this.items = res?.items || [];
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error cargando liquidacion', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  puedeEditar(): boolean {
    return this.liquidacion?.estado === 'BORRADOR';
  }

  getColorEstado(estado: string): string {
    if (estado === 'APROBADA') return 'accent';
    if (estado === 'PAGADA') return 'primary';
    return '';
  }

  async regenerar(): Promise<void> {
    if (!this.liquidacion) return;
    try {
      await firstValueFrom(this.repositoryService.generarLiquidacionBorrador({
        funcionarioId: this.liquidacion.funcionario.id,
        periodo: this.liquidacion.periodo,
      }));
      this.snackBar.open('Liquidacion regenerada', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    }
  }

  agregarItem(): void {
    if (!this.liquidacionId) return;
    const ref = this.dialog.open(AgregarItemDialogComponent, {
      width: '700px',
      data: { liquidacionId: this.liquidacionId },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  async eliminarItem(item: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Eliminar item', message: '¿Eliminar este item manual?', confirmText: 'Eliminar', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.eliminarItemLiquidacion(item.id));
      this.load();
    } catch (e) {
      console.error(e);
    }
  }

  async aprobar(): Promise<void> {
    if (!this.liquidacionId) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Aprobar liquidacion', message: '¿Aprobar esta liquidacion? Despues de aprobar no se podran agregar items hasta volver a BORRADOR.', confirmText: 'Aprobar', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.aprobarLiquidacionSueldo(this.liquidacionId));
      this.snackBar.open('Liquidacion APROBADA', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    }
  }

  async volverBorrador(): Promise<void> {
    if (!this.liquidacionId) return;
    try {
      await firstValueFrom(this.repositoryService.volverBorradorLiquidacionSueldo(this.liquidacionId));
      this.load();
    } catch (e) { console.error(e); }
  }

  pagar(): void {
    if (!this.liquidacion) return;
    const ref = this.dialog.open(PagarLiquidacionDialogComponent, {
      width: '700px',
      data: { liquidacion: this.liquidacion },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  async anular(): Promise<void> {
    if (!this.liquidacionId) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Anular liquidacion', message: '¿Anular esta liquidacion? Si esta PAGADA se generara un contra-movimiento.', confirmText: 'Anular', cancelText: 'Cancelar' },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularLiquidacionSueldo(this.liquidacionId, ''));
      this.load();
    } catch (e) { console.error(e); }
  }
}
