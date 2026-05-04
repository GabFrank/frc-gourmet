import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatChipsModule } from '@angular/material/chips';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface DialogData {
  compraId: number;
  total: number;
  moneda?: any;
  credito: boolean;
  formaPagoIdInicial?: number | null;
}

@Component({
  selector: 'app-finalizar-compra-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatChipsModule,
    DecimalPipe,
  ],
  template: `
    <h2 mat-dialog-title>Finalizar compra #{{ data.compraId }}</h2>
    <mat-dialog-content [formGroup]="form" class="content">
      <div class="resumen">
        <div class="resumen-row">
          <span class="lbl">Total:</span>
          <span class="val mono">{{ data.total | number:'1.0-2' }} {{ data.moneda?.simbolo || '' }}</span>
        </div>
        <div class="resumen-row">
          <span class="lbl">Tipo de pago:</span>
          <span class="chip" [class.chip-naranja]="data.credito" [class.chip-celeste]="!data.credito">
            {{ data.credito ? 'A crédito' : 'Contado' }}
          </span>
        </div>
      </div>

      <ng-container *ngIf="!data.credito">
        <h3>Pago de contado</h3>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>Caja Mayor *</mat-label>
            <mat-select formControlName="cajaMayorId">
              <mat-option *ngFor="let c of cajasMayor" [value]="c.id">{{ c.nombre || ('CM #' + c.id) }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Forma de pago *</mat-label>
            <mat-select formControlName="formaPagoId">
              <mat-option *ngFor="let fp of formasPago" [value]="fp.id">{{ fp.nombre }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>
        <p class="hint">
          Al confirmar se generará un movimiento <strong>EGRESO_COMPRA</strong> en Caja Mayor por {{ data.total | number:'1.0-2' }}.
        </p>
      </ng-container>

      <ng-container *ngIf="data.credito">
        <h3>Pago a crédito</h3>
        <div class="grid">
          <mat-form-field appearance="outline">
            <mat-label>Cantidad de cuotas *</mat-label>
            <input matInput type="number" min="1" max="60" formControlName="cantidadCuotas" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>Fecha primera cuota *</mat-label>
            <input matInput [matDatepicker]="pCre" formControlName="fechaCreditoInicio" />
            <mat-datepicker-toggle matSuffix [for]="pCre"></mat-datepicker-toggle>
            <mat-datepicker #pCre></mat-datepicker>
          </mat-form-field>
        </div>
        <div class="cuota-preview" *ngIf="form.value.cantidadCuotas > 0">
          Se generarán <strong>{{ form.value.cantidadCuotas }}</strong> cuotas mensuales
          de <strong class="mono">{{ (data.total / form.value.cantidadCuotas) | number:'1.0-2' }}</strong>
          (la última ajusta diferencia por redondeo).
        </div>
        <p class="hint">
          Se creará una <strong>Cuenta por Pagar</strong> tipo COMPRA vinculada. No se afecta Caja Mayor hasta que pagues cada cuota.
        </p>
      </ng-container>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button color="primary" (click)="confirmar()" [disabled]="!isValido()">
        Confirmar finalización
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .content { display: flex; flex-direction: column; min-width: 480px; padding-top: 8px; }
    h3 { margin: 8px 0 12px 0; font-size: 14px; text-transform: uppercase; color: var(--mat-sys-on-surface-variant); }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      ::ng-deep .mat-mdc-form-field-subscript-wrapper { display: none; }
    }
    .resumen {
      background: var(--mat-sys-surface-variant, #f5f5f5);
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;

      .resumen-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        .lbl { color: var(--mat-sys-on-surface-variant); font-size: 13px; }
        .val { font-size: 18px; font-weight: 500; }
      }
    }
    .chip {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;

      &.chip-naranja { background: #fff3e0; color: #bf360c; border: 1px solid #ffb74d; }
      &.chip-celeste { background: #e1f5fe; color: #01579b; border: 1px solid #81d4fa; }
    }
    .cuota-preview {
      padding: 8px 12px;
      background: #f3e5f5;
      color: #4a148c;
      border-radius: 4px;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .hint {
      font-size: 12px;
      color: var(--mat-sys-on-surface-variant);
      margin-top: 8px;
    }
    .mono { font-feature-settings: 'tnum'; }
  `],
})
export class FinalizarCompraDialogComponent implements OnInit {
  form!: FormGroup;
  cajasMayor: any[] = [];
  formasPago: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<FinalizarCompraDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private fb: FormBuilder,
    private repo: RepositoryService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      cajaMayorId: [null],
      formaPagoId: [this.data.formaPagoIdInicial || null],
      cantidadCuotas: [1, [Validators.min(1), Validators.max(60)]],
      fechaCreditoInicio: [new Date()],
    });

    if (!this.data.credito) {
      this.form.get('cajaMayorId')?.setValidators(Validators.required);
      this.form.get('formaPagoId')?.setValidators(Validators.required);
    } else {
      this.form.get('cantidadCuotas')?.setValidators([Validators.required, Validators.min(1)]);
      this.form.get('fechaCreditoInicio')?.setValidators(Validators.required);
    }

    try {
      const [cms, fps] = await Promise.all([
        firstValueFrom(this.repo.getCajasMayor()),
        firstValueFrom(this.repo.getFormasPago()),
      ]);
      this.cajasMayor = ((cms as any[]) || []).filter(c => c.estado === 'ABIERTA');
      this.formasPago = (fps as any[]) || [];
      // Default caja mayor unica si solo hay una
      if (this.cajasMayor.length === 1 && !this.form.value.cajaMayorId) {
        this.form.patchValue({ cajaMayorId: this.cajasMayor[0].id });
      }
    } catch (e) {
      console.error('Error cargando datos finalizar', e);
    }
  }

  isValido(): boolean {
    if (!this.form) return false;
    if (this.data.credito) {
      const f = this.form.value;
      return Number(f.cantidadCuotas) >= 1 && !!f.fechaCreditoInicio;
    }
    return !!this.form.value.cajaMayorId && !!this.form.value.formaPagoId;
  }

  confirmar(): void {
    const f = this.form.value;
    const payload: any = {};
    if (this.data.credito) {
      payload.cantidadCuotas = Number(f.cantidadCuotas);
      payload.fechaCreditoInicio = this.formatDate(f.fechaCreditoInicio);
    } else {
      payload.cajaMayorId = f.cajaMayorId;
      payload.formaPagoId = f.formaPagoId;
    }
    this.dialogRef.close({ confirmed: true, payload });
  }

  formatDate(d: Date | string): string {
    const dt = typeof d === 'string' ? new Date(d) : d;
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
}
