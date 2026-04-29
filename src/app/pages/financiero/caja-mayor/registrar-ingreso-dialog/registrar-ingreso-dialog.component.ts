import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateEditEntradaVariaDialogComponent } from '../entradas-varias/create-edit-entrada-varia/create-edit-entrada-varia-dialog.component';
import { CreateOperacionFinancieraDialogComponent } from '../operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component';

type IngresoTipo = 'AJUSTE' | 'RETIRO_CAJA' | 'ENTRADA_VARIA' | 'OPERACION_FINANCIERA' | null;

@Component({
  selector: 'app-registrar-ingreso-dialog',
  templateUrl: './registrar-ingreso-dialog.component.html',
  styleUrls: ['./registrar-ingreso-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDividerModule,
  ]
})
export class RegistrarIngresoDialogComponent implements OnInit {
  tipoSeleccionado: IngresoTipo = null;
  ajusteForm!: FormGroup;
  monedas: any[] = [];
  formasPago: any[] = [];
  retirosFlotantes: any[] = [];
  retirosVinculadosPendientes: any[] = [];
  cajasMayorAbiertas: any[] = [];
  saving = false;
  loading = true;
  cajaMayorId: number = 0;

  tiposIngreso = [
    {
      tipo: 'RETIRO_CAJA' as IngresoTipo,
      titulo: 'Retiro de Caja de Venta',
      descripcion: 'Ingresar un retiro flotante de una caja de venta',
      icono: 'move_up',
      color: '#0d47a1',
    },
    {
      tipo: 'ENTRADA_VARIA' as IngresoTipo,
      titulo: 'Entrada Varia',
      descripcion: 'Préstamos recibidos, devoluciones, intereses, premios, etc.',
      icono: 'trending_up',
      color: '#2e7d32',
    },
    {
      tipo: 'OPERACION_FINANCIERA' as IngresoTipo,
      titulo: 'Operacion Financiera',
      descripcion: 'Cambio de divisa, retiro bancario, transferencia entre cajas',
      icono: 'swap_horiz',
      color: '#6a1b9a',
    },
    {
      tipo: 'AJUSTE' as IngresoTipo,
      titulo: 'Ajuste de Saldo',
      descripcion: 'Ingreso manual con motivo (caja inicial, sobrante, etc.)',
      icono: 'tune',
      color: '#4caf50',
    },
  ];

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    @Optional() public dialogRef: MatDialogRef<RegistrarIngresoDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.cajaMayorId = this.data?.cajaMayorId || 0;
    this.ajusteForm = this.fb.group({
      moneda: [null, Validators.required],
      formaPago: [null, Validators.required],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      motivo: ['', Validators.required],
    });
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const [monedas, formasPago, flotantes, vinculados] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getRetirosCaja({ estado: 'FLOTANTE' })),
        firstValueFrom(this.repositoryService.getRetirosCaja({ estado: 'VINCULADO_PENDIENTE' })),
      ]);
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.retirosFlotantes = flotantes || [];
      // Solo los vinculados a la caja mayor actual
      this.retirosVinculadosPendientes = (vinculados || []).filter(
        (r: any) => r.cajaMayor?.id === this.cajaMayorId,
      );
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      this.loading = false;
    }
  }

  seleccionarTipo(tipo: IngresoTipo): void {
    if (tipo === 'ENTRADA_VARIA') {
      this.dialogRef?.close(false);
      this.dialog.open(CreateEditEntradaVariaDialogComponent, {
        width: '720px',
        data: { cajaMayorId: this.cajaMayorId },
      }).afterClosed().subscribe(result => {
        if (result) this.dialogRef?.close(true);
      });
      return;
    }
    if (tipo === 'OPERACION_FINANCIERA') {
      this.dialogRef?.close(false);
      this.dialog.open(CreateOperacionFinancieraDialogComponent, {
        width: '900px',
        maxHeight: '90vh',
        data: { cajaMayorId: this.cajaMayorId },
      }).afterClosed().subscribe(result => {
        if (result) this.dialogRef?.close(true);
      });
      return;
    }
    this.tipoSeleccionado = tipo;
  }

  volver(): void {
    this.tipoSeleccionado = null;
  }

  async guardarAjuste(): Promise<void> {
    if (this.ajusteForm.invalid) return;

    this.saving = true;
    try {
      const form = this.ajusteForm.value;
      await firstValueFrom(this.repositoryService.createCajaMayorMovimiento({
        cajaMayor: { id: this.cajaMayorId },
        tipoMovimiento: 'AJUSTE_POSITIVO',
        moneda: { id: form.moneda },
        formaPago: { id: form.formaPago },
        monto: form.monto,
        observacion: form.motivo.toUpperCase(),
      }));
      this.snackBar.open('Ingreso registrado correctamente', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error registrando ingreso:', error);
      this.snackBar.open('Error al registrar ingreso', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  async ingresarRetiro(retiro: any): Promise<void> {
    this.saving = true;
    try {
      await firstValueFrom(this.repositoryService.ingresarRetiroCaja(retiro.id, this.cajaMayorId));
      this.snackBar.open('Retiro ingresado correctamente', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error) {
      console.error('Error ingresando retiro:', error);
      this.snackBar.open('Error al ingresar retiro', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close(false);
  }
}
