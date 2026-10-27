import { Component, OnInit, Optional } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface Candidata {
  id: number;
  fechaTransaccion: string;
  fechaEsperada: string;
  maquina: string;
  medio: string;
  montoOriginal: number;
  montoEsperado: number;
  seleccionada: boolean;
}

/**
 * Concilia un crédito real del extracto bancario contra varias acreditaciones POS pendientes (issue #320).
 * El sistema sugiere; la persona confirma o cambia la selección. Se puede deshacer desde «Conciliaciones».
 */
@Component({
  selector: 'app-conciliar-credito-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule, MatCheckboxModule, MatSnackBarModule, DatePipe, DecimalPipe],
  template: `
    <h2 mat-dialog-title>Conciliar crédito del banco</h2>
    <mat-dialog-content class="cc">
      <p class="hint">Cargá el crédito como figura en el extracto. Se suma al saldo de la cuenta y las ventas elegidas quedan conciliadas.</p>
      <div class="row">
        <mat-form-field appearance="outline" class="flex">
          <mat-label>Cuenta</mat-label>
          <mat-select [(ngModel)]="cuentaId" (ngModelChange)="buscar()">
            <mat-option *ngFor="let c of cuentas" [value]="c.id">{{ c.nombre }} — {{ c.banco }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field appearance="outline" class="flex">
          <mat-label>Fecha del crédito</mat-label>
          <input matInput type="date" [(ngModel)]="fecha" (ngModelChange)="buscar()">
        </mat-form-field>
        <mat-form-field appearance="outline" class="flex">
          <mat-label>Monto acreditado</mat-label>
          <input matInput type="number" [(ngModel)]="monto" (ngModelChange)="buscar()">
        </mat-form-field>
        <mat-form-field appearance="outline" class="flex">
          <mat-label>Referencia (nro. de resumen)</mat-label>
          <input matInput [(ngModel)]="referencia">
        </mat-form-field>
      </div>

      <p class="hint" *ngIf="cuentaId && !candidatas.length">No hay acreditaciones pendientes de esa cuenta cerca de esa fecha (±2 días).</p>
      <table class="tabla" *ngIf="candidatas.length">
        <thead><tr><th></th><th>Venta</th><th>Esperada</th><th>Máquina</th><th>Medio</th><th class="num">Bruto</th><th class="num">Esperado</th></tr></thead>
        <tbody>
          <tr *ngFor="let c of candidatas" [class.sel]="c.seleccionada">
            <td><mat-checkbox [(ngModel)]="c.seleccionada" (ngModelChange)="recalcular()"></mat-checkbox></td>
            <td>{{ c.fechaTransaccion | date:'dd/MM HH:mm' }}</td>
            <td>{{ c.fechaEsperada | date:'dd/MM' }}</td>
            <td>{{ c.maquina }}</td>
            <td>{{ c.medio }}</td>
            <td class="num">{{ c.montoOriginal | number:'1.0-2' }}</td>
            <td class="num">{{ c.montoEsperado | number:'1.0-2' }}</td>
          </tr>
        </tbody>
      </table>
      <div class="totales" *ngIf="candidatas.length">
        <span>Seleccionadas: <b>{{ cantidadSel }}</b></span>
        <span>Esperado: <b>{{ sumaSel | number:'1.0-2' }}</b></span>
        <span>Crédito: <b>{{ (monto || 0) | number:'1.0-2' }}</b></span>
        <span [class.dif]="diferencia !== 0">Diferencia: <b>{{ diferencia | number:'1.0-2' }}</b></span>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cerrar(false)" [disabled]="guardando">Cancelar</button>
      <button mat-raised-button color="primary" (click)="conciliar()" [disabled]="guardando || !puedeConciliar">Conciliar</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .cc { min-width: 860px; }
    .hint { font-size: 12px; opacity: .75; margin: 0 0 8px; }
    .row { display: flex; gap: 10px; } .flex { flex: 1; }
    .tabla { width: 100%; border-collapse: collapse; font-size: 13px; }
    .tabla th, .tabla td { padding: 4px 6px; border-bottom: 1px solid rgba(128,128,128,.25); text-align: left; }
    .tabla .num { text-align: right; }
    .tabla tr.sel { background: rgba(33,150,243,.12); }
    .totales { display: flex; gap: 24px; margin-top: 10px; }
    .dif { color: #f0883e; }
  `],
})
export class ConciliarCreditoDialogComponent implements OnInit {
  cuentas: any[] = [];
  cuentaId: number | null = null;
  fecha = '';
  monto: number | null = null;
  referencia = '';
  candidatas: Candidata[] = [];
  cantidadSel = 0;
  sumaSel = 0;
  diferencia = 0;
  puedeConciliar = false;
  guardando = false;
  private busqueda = 0;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<ConciliarCreditoDialogComponent>,
  ) {}

  cerrar(r: boolean): void { this.dialogRef?.close(r); }

  async ngOnInit(): Promise<void> {
    const hoy = new Date();
    this.fecha = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    const cs = await firstValueFrom(this.repositoryService.getCuentasBancarias());
    this.cuentas = (cs || []).filter((c: any) => c.activo !== false);
  }

  async buscar(): Promise<void> {
    if (!this.cuentaId || !this.fecha) { this.candidatas = []; this.recalcular(); return; }
    const n = ++this.busqueda;
    const r: any = await firstValueFrom(this.repositoryService.sugerirConciliacionPos({
      cuentaBancariaId: this.cuentaId, fechaCredito: this.fecha, montoCredito: this.monto || undefined,
    }));
    if (n !== this.busqueda) return;
    const sug = new Set<number>(r?.sugeridas || []);
    this.candidatas = (r?.candidatas || []).map((a: any) => ({
      id: a.id,
      fechaTransaccion: a.fechaTransaccion,
      fechaEsperada: a.fechaEsperadaAcreditacion,
      maquina: a.maquinaPos?.nombre || '',
      medio: a.medio || '—',
      montoOriginal: Number(a.montoOriginal),
      montoEsperado: Number(a.montoEsperado),
      seleccionada: sug.has(a.id),
    }));
    this.recalcular();
  }

  recalcular(): void {
    const sel = this.candidatas.filter((c) => c.seleccionada);
    this.cantidadSel = sel.length;
    this.sumaSel = +sel.reduce((s, c) => s + c.montoEsperado, 0).toFixed(2);
    this.diferencia = +((Number(this.monto) || 0) - this.sumaSel).toFixed(2);
    this.puedeConciliar = !!this.cuentaId && !!this.fecha && Number(this.monto) > 0 && sel.length > 0;
  }

  async conciliar(): Promise<void> {
    this.guardando = true;
    try {
      await firstValueFrom(this.repositoryService.conciliarAcreditacionesPos({
        cuentaBancariaId: this.cuentaId,
        fechaCredito: this.fecha,
        montoCredito: Number(this.monto),
        referencia: this.referencia || undefined,
        acreditacionIds: this.candidatas.filter((c) => c.seleccionada).map((c) => c.id),
      }));
      this.snackBar.open('Crédito conciliado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      const m = String(e?.message || '');
      const txt = m.includes('DUPLICADA') ? 'Ese crédito ya está conciliado'
        : m.includes('YA_PROCESADA') ? 'Alguna venta ya fue conciliada o acreditada: actualizá la lista'
        : 'No se pudo conciliar';
      this.snackBar.open(txt, 'Cerrar', { duration: 5000 });
    } finally {
      this.guardando = false;
    }
  }
}
