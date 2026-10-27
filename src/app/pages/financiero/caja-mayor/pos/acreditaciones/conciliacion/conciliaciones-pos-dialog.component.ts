import { Component, OnInit, Optional } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { MatDialogModule, MatDialogRef, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';

/**
 * Conciliaciones hechas (con Deshacer) y resumen del mes: pendiente por cuenta y fecha,
 * comisiones, IVA de comisión y retenciones (informativo). Issue #320.
 */
@Component({
  selector: 'app-conciliaciones-pos-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatTabsModule, MatSnackBarModule, DatePipe, DecimalPipe],
  template: `
    <h2 mat-dialog-title>Conciliaciones y resumen POS</h2>
    <mat-dialog-content class="cp">
      <mat-tab-group>
        <mat-tab label="Conciliaciones">
          <p class="hint" *ngIf="!conciliaciones.length">Todavía no hay conciliaciones.</p>
          <table class="tabla" *ngIf="conciliaciones.length">
            <thead><tr><th>Crédito</th><th>Cuenta</th><th>Referencia</th><th class="num">Ventas</th><th class="num">Monto</th><th class="num">Diferencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let c of conciliaciones" [class.deshecha]="c.estado === 'DESHECHA'">
                <td>{{ c.fechaCredito }}</td>
                <td>{{ c.cuentaBancaria?.nombre }}</td>
                <td>{{ c.referencia || '—' }}</td>
                <td class="num">{{ c.cantidadAcreditaciones }}</td>
                <td class="num">{{ c.montoCredito | number:'1.0-2' }}</td>
                <td class="num">{{ c.diferencia | number:'1.0-2' }}</td>
                <td>{{ c.estado === 'ACTIVA' ? 'Activa' : 'Deshecha' }}</td>
                <td><button mat-button color="warn" *ngIf="c.estado === 'ACTIVA'" (click)="deshacer(c)">Deshacer</button></td>
              </tr>
            </tbody>
          </table>
        </mat-tab>
        <mat-tab label="Resumen del mes">
          <p class="hint">{{ resumen?.nota }}</p>
          <h4>Por máquina y medio ({{ desde }} a {{ hasta }})</h4>
          <table class="tabla" *ngIf="resumen">
            <thead><tr><th>Máquina</th><th>Medio</th><th class="num">Ventas</th><th class="num">Bruto</th><th class="num">Comisión</th><th class="num">IVA com.</th><th class="num">Ret. renta</th><th class="num">Ret. IVA</th><th class="num">Neto</th></tr></thead>
            <tbody>
              <tr *ngFor="let r of resumen.porMaquinaYMedio">
                <td>{{ r.maquina }}<span *ngIf="r.moneda" class="hint"> ({{ r.moneda }})</span></td><td>{{ r.medio || 'Sin medio' }}</td><td class="num">{{ r.cantidad }}</td>
                <td class="num">{{ r.bruto | number:'1.0-0' }}</td><td class="num">{{ r.comision | number:'1.0-0' }}</td>
                <td class="num">{{ r.ivaComision | number:'1.0-0' }}</td><td class="num">{{ r.retRenta | number:'1.0-0' }}</td>
                <td class="num">{{ r.retIva | number:'1.0-0' }}</td><td class="num">{{ r.neto | number:'1.0-0' }}</td>
              </tr>
              <!-- Un total por moneda: no se suman guaraníes con reales. -->
              <tr class="total" *ngFor="let t of (resumen.totalesPorMoneda || [resumen.totales])">
                <td colspan="2">Total {{ t.moneda }}</td><td class="num">{{ t.cantidad }}</td>
                <td class="num">{{ t.bruto | number:'1.0-2' }}</td><td class="num">{{ t.comision | number:'1.0-2' }}</td>
                <td class="num">{{ t.ivaComision | number:'1.0-2' }}</td><td class="num">{{ t.retRenta | number:'1.0-2' }}</td>
                <td class="num">{{ t.retIva | number:'1.0-2' }}</td><td class="num">{{ t.neto | number:'1.0-2' }}</td>
              </tr>
            </tbody>
          </table>
          <h4>Pendiente de acreditar, por cuenta y fecha</h4>
          <table class="tabla" *ngIf="resumen?.pendientePorCuentaYFecha?.length">
            <thead><tr><th>Fecha esperada</th><th>Cuenta</th><th class="num">Ventas</th><th class="num">Monto</th><th></th></tr></thead>
            <tbody>
              <tr *ngFor="let p of resumen.pendientePorCuentaYFecha">
                <td>{{ p.fecha }}</td><td>{{ p.cuenta }}</td><td class="num">{{ p.cantidad }}</td>
                <td class="num">{{ p.monto | number:'1.0-0' }}</td><td><span class="vencida" *ngIf="p.vencida">Vencida sin conciliar</span></td>
              </tr>
            </tbody>
          </table>
        </mat-tab>
      </mat-tab-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar(cambio)">Cerrar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cp { min-width: 900px; min-height: 360px; }
    .hint { font-size: 12px; opacity: .75; margin: 8px 0; }
    .tabla { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 12px; }
    .tabla th, .tabla td { padding: 4px 6px; border-bottom: 1px solid rgba(128,128,128,.25); text-align: left; }
    .tabla .num { text-align: right; }
    .tabla tr.deshecha { opacity: .5; }
    .tabla tr.total td { font-weight: 700; }
    .vencida { color: #f0883e; font-weight: 600; }
  `],
})
export class ConciliacionesPosDialogComponent implements OnInit {
  conciliaciones: any[] = [];
  resumen: any = null;
  desde = '';
  hasta = '';
  cambio = false;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<ConciliacionesPosDialogComponent>,
  ) {}

  cerrar(r: boolean): void { this.dialogRef?.close(r); }

  async ngOnInit(): Promise<void> {
    const h = new Date();
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.desde = iso(new Date(h.getFullYear(), h.getMonth(), 1));
    this.hasta = iso(new Date(h.getFullYear(), h.getMonth() + 1, 0));
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.conciliaciones = (await firstValueFrom(this.repositoryService.getConciliacionesPos())) || [];
    this.resumen = await firstValueFrom(this.repositoryService.getResumenAcreditacionesPos({ desde: this.desde, hasta: this.hasta }));
  }

  async deshacer(c: any): Promise<void> {
    const ok = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Deshacer conciliación', message: `Se resta ${Number(c.montoCredito).toLocaleString('es-PY')} del saldo de ${c.cuentaBancaria?.nombre} y las ventas vuelven a pendientes. ¿Seguro?` },
    }).afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deshacerConciliacionPos(c.id));
      this.cambio = true;
      this.snackBar.open('Conciliación deshecha', 'Cerrar', { duration: 3000 });
      await this.cargar();
    } catch {
      this.snackBar.open('No se pudo deshacer', 'Cerrar', { duration: 4000 });
    }
  }
}
