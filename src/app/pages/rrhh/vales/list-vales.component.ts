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
import { CreateEditValeDialogComponent } from './create-edit-vale-dialog.component';
import { ConfirmarValeDialogComponent } from './confirmar-vale-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

const ESTADOS = ['SOLICITADO', 'CONFIRMADO', 'DESCONTADO', 'ANULADO'];

@Component({
  selector: 'app-list-vales',
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
            <div class="title"><mat-icon>receipt_long</mat-icon> <h2>Vales y adelantos</h2></div>
            <button mat-flat-button color="primary" (click)="abrirCrear()">
              <mat-icon>add</mat-icon> Nuevo vale
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
          <table mat-table [dataSource]="vales" class="full" *ngIf="!loading">
            <ng-container matColumnDef="fecha">
              <th mat-header-cell *matHeaderCellDef>Fecha</th>
              <td mat-cell *matCellDef="let v">{{ v.fecha | date:'shortDate' }}</td>
            </ng-container>
            <ng-container matColumnDef="funcionario">
              <th mat-header-cell *matHeaderCellDef>Funcionario</th>
              <td mat-cell *matCellDef="let v">{{ v.funcionario?.persona?.nombre }} {{ v.funcionario?.persona?.apellido || '' }}</td>
            </ng-container>
            <ng-container matColumnDef="motivo">
              <th mat-header-cell *matHeaderCellDef>Motivo</th>
              <td mat-cell *matCellDef="let v">{{ v.motivo?.nombre || '-' }}</td>
            </ng-container>
            <ng-container matColumnDef="adelanto">
              <th mat-header-cell *matHeaderCellDef>Tipo</th>
              <td mat-cell *matCellDef="let v">
                <span [class.adelanto]="v.esAdelanto">{{ v.esAdelanto ? 'ADELANTO' : 'VALE' }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="monto">
              <th mat-header-cell *matHeaderCellDef>Monto</th>
              <td mat-cell *matCellDef="let v">{{ v.monto | number:'1.0-2' }} {{ v.moneda?.simbolo }}</td>
            </ng-container>
            <ng-container matColumnDef="estado">
              <th mat-header-cell *matHeaderCellDef>Estado</th>
              <td mat-cell *matCellDef="let v">
                <span class="estado-tag" [ngClass]="'tag-' + v.estado">{{ v.estado }}</span>
              </td>
            </ng-container>
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
              <td mat-cell *matCellDef="let v">
                <button mat-icon-button [matMenuTriggerFor]="menu"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="confirmar(v)" [disabled]="v.estado !== 'SOLICITADO'">
                    <mat-icon>check_circle</mat-icon><span>Confirmar</span>
                  </button>
                  <button mat-menu-item (click)="anular(v)" [disabled]="v.estado === 'ANULADO' || v.estado === 'DESCONTADO'">
                    <mat-icon>cancel</mat-icon><span>Anular</span>
                  </button>
                </mat-menu>
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="cols"></tr>
            <tr mat-row *matRowDef="let row; columns: cols"></tr>
          </table>
          <div *ngIf="!loading && vales.length === 0" class="empty">Sin vales.</div>
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
    .adelanto { color: #1976d2; font-weight: 500; }
    .estado-tag {
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
      &.tag-SOLICITADO { background: #fff8e1; color: #f57f17; }
      &.tag-CONFIRMADO { background: #e8f5e9; color: #2e7d32; }
      &.tag-DESCONTADO { background: #e3f2fd; color: #1565c0; }
      &.tag-ANULADO { background: #ffebee; color: #c62828; }
    }
  `],
})
export class ListValesComponent implements OnInit {
  vales: any[] = [];
  funcionarios: any[] = [];
  loading = false;
  cols = ['fecha', 'funcionario', 'motivo', 'adelanto', 'monto', 'estado', 'actions'];
  estados = ESTADOS;
  filtroFuncionarioId: number | null = null;
  filtroEstado: string | null = null;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
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
      this.vales = await firstValueFrom(this.repositoryService.getVales({
        funcionarioId: this.filtroFuncionarioId,
        estado: this.filtroEstado,
      }));
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    const ref = this.dialog.open(CreateEditValeDialogComponent, { width: '780px' });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  confirmar(v: any): void {
    const ref = this.dialog.open(ConfirmarValeDialogComponent, { width: '700px', data: { vale: v } });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  async anular(v: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular vale',
        message: `¿Anular el vale #${v.id}? Si estaba CONFIRMADO se generara un contra-movimiento en caja mayor.`,
        confirmText: 'Anular',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularVale(v.id, ''));
      this.snackBar.open('Vale anulado', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error al anular: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    }
  }
}
