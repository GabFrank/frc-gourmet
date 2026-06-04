import { Component } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { DocumentoService } from '../../../../services/documento.service';

@Component({
  selector: 'app-cobro-consolidado',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    DecimalPipe,
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './cobro-consolidado.component.html',
  styleUrls: ['./cobro-consolidado.component.scss'],
})
export class CobroConsolidadoComponent {
  convenioId!: number;
  loading = false;
  exportando = false;
  registrando = false;
  mostrarFormCobro = false;

  preview: any = null;
  historial: any[] = [];

  cajasMayor: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cuentasBancarias: any[] = [];

  form!: FormGroup;
  colsDeuda = ['nombre', 'documento', 'cuotas', 'deuda'];
  colsHistorial = ['fecha', 'monto', 'clientes', 'estado', 'acciones'];

  constructor(
    private fb: FormBuilder,
    private repo: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private documentoService: DocumentoService,
  ) {
    this.form = this.fb.group({
      fuente: ['CAJA_MAYOR', Validators.required],
      cajaMayorId: [null],
      monedaId: [null],
      formaPagoId: [null],
      cuentaBancariaId: [null],
      observacion: [''],
    });
    this.form.get('fuente')!.valueChanges.subscribe(() => this.aplicarValidadoresFuente());
    this.aplicarValidadoresFuente();
  }

  setData(data: any): void {
    if (data?.convenioId) {
      this.convenioId = data.convenioId;
      this.cargar();
    }
  }

  private aplicarValidadoresFuente(): void {
    const fuente = this.form.get('fuente')!.value;
    const cm = this.form.get('cajaMayorId')!;
    const mon = this.form.get('monedaId')!;
    const fp = this.form.get('formaPagoId')!;
    const cb = this.form.get('cuentaBancariaId')!;
    if (fuente === 'CAJA_MAYOR') {
      cm.setValidators([Validators.required]);
      mon.setValidators([Validators.required]);
      fp.setValidators([Validators.required]);
      cb.clearValidators();
    } else {
      cm.clearValidators();
      mon.clearValidators();
      fp.clearValidators();
      cb.setValidators([Validators.required]);
    }
    [cm, mon, fp, cb].forEach((c) => c.updateValueAndValidity({ emitEvent: false }));
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const [preview, cajas, monedas, formas, cuentas, historial] = await Promise.all([
        firstValueFrom(this.repo.getCobroConsolidadoPreview(this.convenioId)),
        firstValueFrom(this.repo.getCajasMayor()),
        firstValueFrom(this.repo.getMonedas()),
        firstValueFrom(this.repo.getFormasPago()),
        firstValueFrom(this.repo.getCuentasBancarias()),
        firstValueFrom(this.repo.getCobrosConsolidados({ convenioId: this.convenioId })),
      ]);
      this.preview = preview;
      this.cajasMayor = ((cajas as any[]) || []).filter((c: any) => c.estado === 'ABIERTA');
      this.monedas = (monedas as any[]) || [];
      this.formasPago = ((formas as any[]) || []).filter((f: any) => f.movimentaCaja);
      this.cuentasBancarias = ((cuentas as any[]) || []).filter((c: any) => c.activo !== false);
      this.historial = (historial as any[]) || [];
    } catch (e: any) {
      this.snackBar.open('Error al cargar: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  async exportarReporte(): Promise<void> {
    this.exportando = true;
    try {
      const res = await firstValueFrom(this.repo.exportCobroConsolidadoPreviewPdf(this.convenioId));
      this.documentoService.abrirEnVisor(res);
    } catch (e: any) {
      this.snackBar.open('Error al exportar: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    } finally {
      this.exportando = false;
    }
  }

  async registrar(): Promise<void> {
    if (this.form.invalid || !this.preview || this.preview.total <= 0) return;
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Registrar cobro consolidado',
        message: `Se cobrara la deuda de ${this.preview.cantidadConDeuda} cliente(s) por un total de ${this.preview.total.toLocaleString('es-PY')}.\n\nEsta accion no se puede deshacer facilmente. ¿Continuar?`,
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;

    this.registrando = true;
    try {
      const v = this.form.value;
      const payload: any = { convenioId: this.convenioId, fuente: v.fuente, observacion: v.observacion };
      if (v.fuente === 'CUENTA_BANCARIA') {
        payload.cuentaBancariaId = v.cuentaBancariaId;
      } else {
        payload.cajaMayorId = v.cajaMayorId;
        payload.monedaId = v.monedaId;
        payload.formaPagoId = v.formaPagoId;
      }
      const res = await firstValueFrom(this.repo.registrarCobroConsolidado(payload));
      this.snackBar.open(`Cobro registrado: ${res.cantidadClientes} cliente(s), total ${Number(res.montoTotal).toLocaleString('es-PY')}`, 'Cerrar', { duration: 4000 });
      this.mostrarFormCobro = false;
      // Descargar recibos automaticamente
      await this.descargarRecibos(res.cobroConsolidadoId);
      await this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error al registrar: ' + (e?.message || ''), 'Cerrar', { duration: 6000 });
    } finally {
      this.registrando = false;
    }
  }

  async descargarRecibos(cobroId: number): Promise<void> {
    try {
      const res = await firstValueFrom(this.repo.exportReciboCobroConsolidadoPdf(cobroId));
      this.documentoService.abrirEnVisor(res);
    } catch (e: any) {
      this.snackBar.open('Error al generar recibos: ' + (e?.message || ''), 'Cerrar', { duration: 5000 });
    }
  }
}
