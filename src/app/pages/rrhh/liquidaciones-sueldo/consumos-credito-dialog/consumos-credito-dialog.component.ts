import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

/**
 * Elegir consumos a crédito (cuotas CPC abiertas del funcionario) para descontar
 * en la liquidación. Cada cuota elegida queda como ítem enlazado y se cobra al
 * pagar: así no se repite el descuento «a mano» que dejaba las cuotas abiertas.
 */
@Component({
  selector: 'app-consumos-credito-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatCheckboxModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <h2 mat-dialog-title>Consumos a crédito abiertos</h2>
    <mat-dialog-content>
      <div *ngIf="loading" class="center"><mat-spinner diameter="32"></mat-spinner></div>
      <p *ngIf="!loading && !cuotas.length" class="vacio">El funcionario no tiene consumos a crédito abiertos libres.</p>
      <table *ngIf="!loading && cuotas.length" class="tabla">
        <thead>
          <tr>
            <th><mat-checkbox [checked]="todas()" [indeterminate]="algunas()" (change)="marcarTodas($event.checked)"></mat-checkbox></th>
            <th>Fecha</th><th>Descripción</th><th class="num">Saldo</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let c of cuotas" [class.tomada]="c.yaEnLiquidacion">
            <td><mat-checkbox [checked]="sel.has(c.cuotaId)" [disabled]="c.yaEnLiquidacion" (change)="toggle(c.cuotaId, $event.checked)"></mat-checkbox></td>
            <td>{{ c.fechaVencimiento | date:'dd/MM/yyyy' }}</td>
            <td>{{ c.descripcion }}<span *ngIf="c.yaEnLiquidacion" class="tag">ya en esta liquidación</span></td>
            <td class="num">{{ c.saldo | number:'1.0-2' }}</td>
          </tr>
        </tbody>
      </table>
      <p *ngIf="sel.size" class="total">Elegidos: {{ sel.size }} · Total <strong>{{ total() | number:'1.0-2' }}</strong></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="dialogRef.close()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="!sel.size || saving">Descontar elegidos</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .tabla { width: 100%; border-collapse: collapse; min-width: 620px; }
    .tabla th, .tabla td { padding: 6px 8px; border-bottom: 1px solid rgba(128,128,128,.25); text-align: left; }
    .num { text-align: right !important; }
    .tomada { opacity: .55; }
    .tag { margin-left: 8px; font-size: 11px; opacity: .8; }
    .total { margin-top: 12px; text-align: right; }
    .center { display: flex; justify-content: center; padding: 24px; }
    .vacio { padding: 16px 0; opacity: .8; }
  `],
})
export class ConsumosCreditoDialogComponent implements OnInit {
  loading = true;
  saving = false;
  cuotas: any[] = [];
  sel = new Set<number>();

  constructor(
    public dialogRef: MatDialogRef<ConsumosCreditoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { liquidacionId: number; funcionarioId: number; cuotasEnLiquidacion: number[] },
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const enLiq = new Set(this.data.cuotasEnLiquidacion || []);
      const lista = await firstValueFrom(this.repositoryService.getCpcCuotasAbiertasFuncionario(this.data.funcionarioId, this.data.liquidacionId));
      this.cuotas = (lista || []).map((c: any) => ({ ...c, yaEnLiquidacion: enLiq.has(c.cuotaId) }));
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4500 });
    } finally {
      this.loading = false;
    }
  }

  libres(): any[] { return this.cuotas.filter((c) => !c.yaEnLiquidacion); }
  todas(): boolean { return this.libres().length > 0 && this.libres().every((c) => this.sel.has(c.cuotaId)); }
  algunas(): boolean { return this.sel.size > 0 && !this.todas(); }
  marcarTodas(v: boolean): void { this.sel = new Set(v ? this.libres().map((c) => c.cuotaId) : []); }
  toggle(id: number, v: boolean): void { v ? this.sel.add(id) : this.sel.delete(id); }
  total(): number { return this.cuotas.filter((c) => this.sel.has(c.cuotaId)).reduce((a, c) => a + Number(c.saldo), 0); }

  async submit(): Promise<void> {
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.agregarItemLiquidacion(this.data.liquidacionId, { cpcCuotaIds: Array.from(this.sel) }));
      this.snackBar.open('Consumos agregados', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e: any) {
      console.error(e);
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }
}
