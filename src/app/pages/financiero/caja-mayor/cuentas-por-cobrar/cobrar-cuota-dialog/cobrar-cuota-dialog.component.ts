import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { confirmarSaldosNegativos } from 'src/app/shared/utils/saldo-negativo-confirm';

interface CobrarCuotaDialogData {
  cuota: any;
  contextoLabel?: string;
}

@Component({
  selector: 'app-cobrar-cuota-dialog',
  templateUrl: './cobrar-cuota-dialog.component.html',
  styleUrls: ['./cobrar-cuota-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
  ]
})
export class CobrarCuotaDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;

  cuota: any = null;
  contextoLabel = '';
  restante = 0;

  cajasMayor: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<CobrarCuotaDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: CobrarCuotaDialogData,
  ) {}

  ngOnInit(): void {
    this.cuota = this.data?.cuota;
    this.contextoLabel = this.data?.contextoLabel || '';
    this.restante = +(Number(this.cuota?.monto || 0) - Number(this.cuota?.montoCobrado || 0)).toFixed(2);

    this.form = this.fb.group({
      montoCobrar: [this.restante, [Validators.required, Validators.min(0.01)]],
      cajaMayorId: [null, Validators.required],
      monedaId: [null, Validators.required],
      formaPagoId: [null, Validators.required],
      observacion: [''],
    });

    this.loadLookups();
  }

  async loadLookups(): Promise<void> {
    try {
      const [cajas, monedas, formas] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
      ]);
      this.cajasMayor = (cajas || []).filter((c: any) => c.estado === 'ABIERTA');
      this.monedas = monedas || [];
      this.formasPago = (formas || []).filter((f: any) => f.movimentaCaja);
    } catch (e) { console.error(e); }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid || !this.cuota?.id) return;
    const f = this.form.value;
    const monto = Number(f.montoCobrar);
    if (monto > this.restante + 0.005) {
      this.snackBar.open(`Monto excede el restante (${this.restante})`, 'Cerrar', { duration: 3000 });
      return;
    }

    // Verificar saldo negativo
    const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(f.cajaMayorId));
    const s = (saldos || []).find((x: any) => x.moneda?.id === f.monedaId && x.formaPago?.id === f.formaPagoId);
    const saldoActual = s ? Number(s.saldo) : 0;
    const cm = this.cajasMayor.find(c => c.id === f.cajaMayorId);
    const fp = this.formasPago.find(p => p.id === f.formaPagoId);
    const moneda = this.monedas.find(m => m.id === f.monedaId);
    const label = `${cm?.nombre || 'Caja Mayor'} (${moneda?.denominacion || ''} / ${fp?.nombre || ''})`;

    const ok = await confirmarSaldosNegativos(this.dialog, [{ label, saldoActual, monto, monedaSimbolo: moneda?.simbolo || '' }]);
    if (!ok) return;

    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.cobrarCpcCuota({
        cuotaId: this.cuota.id,
        montoCobrar: monto,
        cajaMayorId: f.cajaMayorId,
        monedaId: f.monedaId,
        formaPagoId: f.formaPagoId,
        observacion: f.observacion || null,
      }));
      this.snackBar.open('Cobro registrado', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      console.error(e);
      this.snackBar.open(e?.message || 'Error al registrar cobro', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }
}
