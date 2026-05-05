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
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface DialogData {
  compraId: number;
  total: number;
  moneda?: any;
  credito: boolean;
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
    MatButtonToggleModule,
    MatSlideToggleModule,
    DecimalPipe,
  ],
  templateUrl: './finalizar-compra-dialog.component.html',
  styleUrls: ['./finalizar-compra-dialog.component.scss'],
})
export class FinalizarCompraDialogComponent implements OnInit {
  form!: FormGroup;
  cuentasBancarias: any[] = [];

  constructor(
    private dialogRef: MatDialogRef<FinalizarCompraDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    private fb: FormBuilder,
    private repo: RepositoryService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      formaPagoCompra: ['EFECTIVO', Validators.required],
      cuentaBancariaId: [null],
      cantidadCuotas: [1, [Validators.min(1), Validators.max(60)]],
      fechaCreditoInicio: [new Date()],
      pagarAhora: [false],
    });

    if (this.data.credito) {
      this.form.get('cantidadCuotas')?.setValidators([Validators.required, Validators.min(1)]);
      this.form.get('fechaCreditoInicio')?.setValidators(Validators.required);
      this.form.get('cantidadCuotas')?.updateValueAndValidity();
      this.form.get('fechaCreditoInicio')?.updateValueAndValidity();
    }

    try {
      const cbs = await firstValueFrom(this.repo.getCuentasBancarias());
      this.cuentasBancarias = (cbs as any[]) || [];
    } catch (e) {
      console.error('Error cargando cuentas bancarias', e);
    }
  }

  isValido(): boolean {
    if (!this.form) return false;
    const f = this.form.value;
    if (!f.formaPagoCompra) return false;
    if (this.data.credito) {
      return Number(f.cantidadCuotas) >= 1 && !!f.fechaCreditoInicio;
    }
    return true;
  }

  confirmar(): void {
    const f = this.form.value;
    const payload: any = {
      formaPagoCompra: f.formaPagoCompra,
      cuentaBancariaId: f.cuentaBancariaId || null,
    };
    if (this.data.credito) {
      payload.cantidadCuotas = Number(f.cantidadCuotas);
      payload.fechaCreditoInicio = this.formatDate(f.fechaCreditoInicio);
    } else {
      payload.pagarAhora = !!f.pagarAhora;
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
