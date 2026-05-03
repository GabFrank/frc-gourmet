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
import { MatExpansionModule } from '@angular/material/expansion';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CrearPrestamoFuncionarioDialogComponent } from './crear-prestamo-funcionario-dialog.component';
import { PagarCuotaDialogComponent } from 'src/app/pages/financiero/caja-mayor/cuentas-por-pagar/pagar-cuota-dialog/pagar-cuota-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

@Component({
  selector: 'app-list-prestamos-funcionarios',
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
    MatExpansionModule,
  ],
  template: `
    <div class="page">
      <mat-card>
        <mat-card-content>
          <div class="header">
            <div class="title"><mat-icon>account_balance</mat-icon> <h2>Prestamos a funcionarios</h2></div>
            <button mat-flat-button color="primary" (click)="abrirCrear()">
              <mat-icon>add</mat-icon> Nuevo prestamo
            </button>
          </div>
          <p class="info">
            Para pagar cuotas, ir a <strong>Caja Mayor &gt; Cuentas por pagar</strong> y usar el dialogo de pagar cuota.
            Aqui solo se ven los prestamos activos y su progreso.
          </p>
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
                <mat-option value="ACTIVO">ACTIVO</mat-option>
                <mat-option value="PAGADO">PAGADO</mat-option>
                <mat-option value="CANCELADO">CANCELADO</mat-option>
              </mat-select>
            </mat-form-field>
            <button mat-flat-button color="primary" (click)="load()">
              <mat-icon>search</mat-icon> Filtrar
            </button>
          </div>

          <div *ngIf="loading" class="spinner"><mat-progress-spinner mode="indeterminate" diameter="40"></mat-progress-spinner></div>

          <mat-accordion *ngIf="!loading">
            <mat-expansion-panel *ngFor="let p of prestamos" (opened)="cargarCuotas(p)">
              <mat-expansion-panel-header>
                <mat-panel-title>
                  <strong>{{ p.descripcion }}</strong>
                  <span class="separator">|</span>
                  {{ p.funcionario?.persona?.nombre }} {{ p.funcionario?.persona?.apellido || '' }}
                </mat-panel-title>
                <mat-panel-description>
                  <span>{{ p.montoPagado | number:'1.0-2' }} / {{ p.montoTotal | number:'1.0-2' }}</span>
                  <span class="separator">|</span>
                  <span [class.estado-pagado]="p.estado === 'PAGADO'" [class.estado-cancelado]="p.estado === 'CANCELADO'">{{ p.estado }}</span>
                </mat-panel-description>
              </mat-expansion-panel-header>

              <div class="detalle-grid">
                <div><strong>Fecha inicio:</strong> {{ p.fechaInicio | date:'shortDate' }}</div>
                <div><strong>Cuotas:</strong> {{ p.cantidadCuotas }}</div>
                <div><strong>Moneda:</strong> {{ p.moneda?.denominacion }}</div>
                <div><strong>Saldo a cobrar:</strong> {{ (p.montoTotal - p.montoPagado) | number:'1.0-2' }}</div>
                <div class="full" *ngIf="p.observacion"><strong>Observacion:</strong> {{ p.observacion }}</div>
              </div>

              <div class="cuotas-section">
                <h4>Cuotas</h4>
                <div *ngIf="p._loadingCuotas" class="spinner-mini"><mat-progress-spinner mode="indeterminate" diameter="28"></mat-progress-spinner></div>
                <table mat-table [dataSource]="p._cuotas || []" *ngIf="!p._loadingCuotas && p._cuotas?.length" class="cuotas-table">
                  <ng-container matColumnDef="numero">
                    <th mat-header-cell *matHeaderCellDef>#</th>
                    <td mat-cell *matCellDef="let c">{{ c.numero }}</td>
                  </ng-container>
                  <ng-container matColumnDef="fechaVencimiento">
                    <th mat-header-cell *matHeaderCellDef>Vencimiento</th>
                    <td mat-cell *matCellDef="let c">{{ c.fechaVencimiento | date:'shortDate' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="monto">
                    <th mat-header-cell *matHeaderCellDef>Monto</th>
                    <td mat-cell *matCellDef="let c">{{ c.monto | number:'1.0-2' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="montoPagado">
                    <th mat-header-cell *matHeaderCellDef>Cobrado</th>
                    <td mat-cell *matCellDef="let c">{{ c.montoPagado | number:'1.0-2' }}</td>
                  </ng-container>
                  <ng-container matColumnDef="estado">
                    <th mat-header-cell *matHeaderCellDef>Estado</th>
                    <td mat-cell *matCellDef="let c">
                      <span [class.estado-pagado]="c.estado === 'PAGADO'" [class.estado-cancelado]="c.estado === 'CANCELADA'">{{ c.estado }}</span>
                    </td>
                  </ng-container>
                  <ng-container matColumnDef="actions">
                    <th mat-header-cell *matHeaderCellDef class="acc-col">Acciones</th>
                    <td mat-cell *matCellDef="let c">
                      <button mat-icon-button [matMenuTriggerFor]="menuC" *ngIf="c.estado !== 'PAGADO' && c.estado !== 'CANCELADA'">
                        <mat-icon>more_vert</mat-icon>
                      </button>
                      <mat-menu #menuC="matMenu">
                        <button mat-menu-item (click)="pagarCuota(p, c)">
                          <mat-icon>payments</mat-icon><span>Cobrar cuota</span>
                        </button>
                        <button mat-menu-item (click)="anularCuota(p, c)" *ngIf="(c.montoPagado || 0) === 0">
                          <mat-icon>cancel</mat-icon><span>Anular cuota</span>
                        </button>
                      </mat-menu>
                    </td>
                  </ng-container>
                  <tr mat-header-row *matHeaderRowDef="cuotasCols"></tr>
                  <tr mat-row *matRowDef="let row; columns: cuotasCols"></tr>
                </table>
                <div *ngIf="!p._loadingCuotas && (!p._cuotas || p._cuotas.length === 0)" class="empty">Sin cuotas.</div>
              </div>
            </mat-expansion-panel>
          </mat-accordion>

          <div *ngIf="!loading && prestamos.length === 0" class="empty">Sin prestamos.</div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .page { display: flex; flex-direction: column; gap: 16px; padding: 16px; }
    .header { display: flex; justify-content: space-between; align-items: center; }
    .title { display: flex; align-items: center; gap: 8px; h2 { margin: 0; font-size: 20px; } }
    .info { opacity: 0.75; font-size: 13px; margin: 8px 0 0; }
    .filtros { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .spinner { display: flex; justify-content: center; padding: 24px; }
    .empty { padding: 16px; text-align: center; opacity: 0.7; }
    .separator { margin: 0 8px; opacity: 0.5; }
    .detalle-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; padding: 12px 0; }
    .full { grid-column: 1 / -1; }
    .estado-pagado { color: #43a047; }
    .estado-cancelado { color: #e53935; }
    .cuotas-section { margin-top: 12px; }
    .cuotas-section h4 { margin: 12px 0 8px; }
    .cuotas-table { width: 100%; }
    .acc-col { width: 60px; }
    .spinner-mini { display: flex; justify-content: center; padding: 16px; }
  `],
})
export class ListPrestamosFuncionariosComponent implements OnInit {
  prestamos: any[] = [];
  funcionarios: any[] = [];
  loading = false;
  filtroFuncionarioId: number | null = null;
  filtroEstado: string | null = null;
  cuotasCols = ['numero', 'fechaVencimiento', 'monto', 'montoPagado', 'estado', 'actions'];

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
      const filtros: any = {
        soloPrestamosFuncionario: true,
      };
      if (this.filtroFuncionarioId) filtros.funcionarioId = this.filtroFuncionarioId;
      if (this.filtroEstado) filtros.estado = this.filtroEstado;
      const result = await firstValueFrom(this.repositoryService.getCuentasPorPagar(filtros));
      this.prestamos = Array.isArray(result) ? result : (result?.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading = false;
    }
  }

  abrirCrear(): void {
    const ref = this.dialog.open(CrearPrestamoFuncionarioDialogComponent, { width: '780px' });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.load(); });
  }

  async cargarCuotas(p: any): Promise<void> {
    if (p._cuotas && !p._refresh) return;
    p._loadingCuotas = true;
    try {
      p._cuotas = await firstValueFrom(this.repositoryService.getCuentaPorPagarCuotas(p.id));
      p._refresh = false;
    } catch (e) {
      console.error(e);
    } finally {
      p._loadingCuotas = false;
    }
  }

  pagarCuota(p: any, cuota: any): void {
    const ref = this.dialog.open(PagarCuotaDialogComponent, {
      width: '720px',
      data: {
        cuotaTipo: 'CPP',
        cuota: { ...cuota, cuentaPorPagar: p },
        contextoLabel: `Prestamo funcionario: ${p.funcionario?.persona?.nombre || ''} ${p.funcionario?.persona?.apellido || ''}`,
        direccion: 'COBRAR',
      },
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) {
        p._refresh = true;
        this.cargarCuotas(p);
        this.load();
      }
    });
  }

  anularCuota(p: any, cuota: any): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Anular cuota',
        message: `Anular la cuota #${cuota.numero} por ${cuota.monto}?\nEl saldo del prestamo se reducira en ese monto.`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await firstValueFrom(this.repositoryService.cancelarCppCuota({ cuotaId: cuota.id }));
        this.snackBar.open('Cuota anulada', 'Cerrar', { duration: 2500 });
        p._refresh = true;
        this.cargarCuotas(p);
        this.load();
      } catch (e: any) {
        console.error(e);
        this.snackBar.open(`Error: ${e?.message || 'no se pudo anular la cuota'}`, 'Cerrar', { duration: 4000 });
      }
    });
  }
}
