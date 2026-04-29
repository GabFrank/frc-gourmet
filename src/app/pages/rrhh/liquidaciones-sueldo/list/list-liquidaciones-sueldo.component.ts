import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { GenerarLiquidacionDialogComponent } from '../generar-dialog/generar-liquidacion-dialog.component';
import { LiquidacionSueldoDetalleComponent } from '../detalle/liquidacion-sueldo-detalle.component';

const ESTADOS = ['BORRADOR', 'APROBADA', 'PAGADA', 'ANULADA'];

@Component({
  selector: 'app-list-liquidaciones-sueldo',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>request_quote</mat-icon> <h2>Liquidaciones de sueldo</h2></div>
            <button mat-flat-button color="primary" (click)="abrirGenerar()">
              <mat-icon>add</mat-icon> Generar liquidacion
            </button>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card>
        <mat-card-content>
          <div class="filtros">
            <mat-form-field appearance="outline">
              <mat-label>Funcionario</mat-label>
              <mat-select [(ngModel)]="filtroFuncionarioId">
                <mat-option [value]="null">Todos</mat-option>
                <mat-option *ngFor="let f of funcionarios" [value]="f.id">
                  {{ f.persona?.nombre }} {{ f.persona?.apellido || '' }}
                </mat-option>
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Periodo (YYYY-MM)</mat-label>
              <input matInput [(ngModel)]="filtroPeriodo" placeholder="2026-04" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>Estado</mat-label>
              <mat-select [(ngModel)]="filtroEstado">
                <mat-option [value]="null">Todos</mat-option>
                <mat-option *ngFor="let e of estados" [value]="e">{{ e }}</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="load()">
              <mat-icon>search</mat-icon> Filtrar
            </button>
          </div>

          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>

          <table mat-table [dataSource]="liquidaciones" class="full" *ngIf="!loading">
            <ng-container matColumnDef="periodo">
              <th mat-header-cell *matHeaderCellDef>Periodo</th>
              <td mat-cell *matCellDef="let l">{{ l.periodo }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let l">{{ l.funcionario?.persona?.nombre }} {{ l.funcionario?.persona?.apellido || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="haberes">
              <th mat-header-cell *matHeaderCellDef>Haberes</th>
              <td mat-cell *matCellDef="let l">{{ l.totalHaberes | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="descuentos">
              <th mat-header-cell *matHeaderCellDef>Descuentos</th>
              <td mat-cell *matCellDef="let l">{{ l.totalDescuentos | number:'1.0-2' }}</td>
            </ng-container>
            <ng-container matColumnDef="neto">
              <th mat-header-cell *matHeaderCellDef>Neto</th>
              <td mat-cell *matCellDef="let l"><strong>{{ l.totalNeto | number:'1.0-2' }}</strong></td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let l">
                <span class="estado-tag" [ngClass]="'tag-' + l.estado">{{ l.estado }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let l">
                <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="abrirDetalle(l)">
                    <mat-icon>open_in_new</mat-icon><span>Abrir detalle</span>
                  </button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols" (dblclick)="abrirDetalle(row)"></tr>
          </table>
          <div *ngIf="!loading && liquidaciones.length === 0" class="empty">Sin liquidaciones.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    table { width: 100%; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .acc-col { width: 60px; }
    tr.mat-row { cursor: pointer; }
    .estado-tag {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      &.tag-BORRADOR { background: #fff8e1; color: #f57f17; }
      &.tag-APROBADA { background: #e8f5e9; color: #2e7d32; }
      &.tag-PAGADA { background: #e3f2fd; color: #1565c0; }
      &.tag-ANULADA { background: #ffebee; color: #c62828; }
    }
  `],
})
export class ListLiquidacionesSueldoComponent implements OnInit {
  liquidaciones: any[] = [];
  funcionarios: any[] = [];
  loading = false;
  cols = ['periodo', 'funcionario', 'haberes', 'descuentos', 'neto', 'estado', 'actions'];
  estados = ESTADOS;
  filtroFuncionarioId: number | null = null;
  filtroPeriodo: string = '';
  filtroEstado: string | null = null;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      this.funcionarios = await firstValueFrom(this.repositoryService.getFuncionarios({ soloActivos: true }));
    } catch (e) {
      console.error(e);
    }
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.liquidaciones = await firstValueFrom(this.repositoryService.getLiquidacionesSueldo({
        funcionarioId: this.filtroFuncionarioId,
        periodo: this.filtroPeriodo || null,
        estado: this.filtroEstado,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  abrirGenerar(): void {
    const ref = this.dialog.open(GenerarLiquidacionDialogComponent, { width: '700px' });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) {
        this.load();
        if (res.liquidacion) this.abrirDetalle(res.liquidacion);
      }
    });
  }

  abrirDetalle(l: any): void {
    this.tabsService.openTab(
      `Liquidacion ${l.periodo} - ${l.funcionario?.persona?.nombre || ''}`,
      LiquidacionSueldoDetalleComponent,
      { liquidacionId: l.id },
      `liquidacion-detalle-${l.id}`,
      true,
    );
  }
}
