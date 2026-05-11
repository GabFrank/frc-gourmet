import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder, Validators, FormControl } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatRadioModule } from '@angular/material/radio';
import { firstValueFrom } from 'rxjs';
import { startWith, map } from 'rxjs/operators';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';

type BeneficiarioModo = 'PROVEEDOR' | 'TEXTO' | 'AL_PORTADOR';

@Component({
  selector: 'app-emitir-cheque-dialog',
  templateUrl: './emitir-cheque-dialog.component.html',
  styleUrls: ['./emitir-cheque-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, MatDialogModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatDatepickerModule, MatNativeDateModule,
    MatProgressSpinnerModule, MatSnackBarModule, MatSlideToggleModule, MatDividerModule,
    MatAutocompleteModule, MatRadioModule,
    CurrencyInputDirective,
  ]
})
export class EmitirChequeDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  decimalesMoneda = 0;

  chequeras: any[] = [];
  monedas: any[] = [];
  formasPago: any[] = [];
  cajasMayor: any[] = [];
  proveedores: any[] = [];
  proveedoresFiltrados: any[] = [];

  chequeraSeleccionada: any = null;
  proveedorFilter = new FormControl('');

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<EmitirChequeDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group({
      chequeraId: [null, Validators.required],
      numeroCheque: [''],
      monto: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],

      // Beneficiario (3 modos)
      beneficiarioModo: ['PROVEEDOR' as BeneficiarioModo],
      proveedorId: [null],
      beneficiarioTexto: [''],

      fechaEmision: [new Date(), Validators.required],
      esDiferido: [false],
      fechaPago: [null],

      // Registro en caja mayor (cuando el dinero del cheque sale fisicamente de una caja)
      registrarEnCajaMayor: [!!this.data?.cajaMayorId],
      cajaMayorId: [this.data?.cajaMayorId || null],
      formaPagoId: [null],

      observacion: [''],
    });

    await this.loadOptions();
    this.setupAutocomplete();

    this.form.get('chequeraId')?.valueChanges.subscribe((id: number) => {
      const ch = this.chequeras.find(c => c.id === id);
      this.chequeraSeleccionada = ch;
      if (ch) {
        this.form.get('numeroCheque')?.setValue(ch.siguienteNumero, { emitEvent: false });
        if (ch.cuentaBancaria?.moneda?.id) {
          this.form.get('monedaId')?.setValue(ch.cuentaBancaria.moneda.id, { emitEvent: false });
          this.recalcDecimalesMoneda();
        }
      }
    });

    this.form.get('monedaId')?.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  private setupAutocomplete(): void {
    this.proveedorFilter.valueChanges.pipe(
      startWith(''),
      map(v => this.filtrarProveedores(typeof v === 'string' ? v : '')),
    ).subscribe(list => this.proveedoresFiltrados = list);
  }

  filtrarProveedores(term: string): any[] {
    const t = (term || '').toLowerCase();
    return this.proveedores.filter(p =>
      (p.persona?.nombre || '').toLowerCase().includes(t)
      || (p.persona?.razonSocial || '').toLowerCase().includes(t)
    ).slice(0, 20);
  }

  displayProveedor = (p: any): string => {
    if (!p) return '';
    return p.persona?.razonSocial || p.persona?.nombre || '';
  };

  onProveedorSelected(p: any): void {
    if (p && typeof p === 'object') {
      this.form.get('proveedorId')?.setValue(p.id);
    }
  }

  onModoChange(modo: BeneficiarioModo): void {
    this.form.get('beneficiarioModo')?.setValue(modo);
    if (modo === 'PROVEEDOR') {
      this.form.get('beneficiarioTexto')?.setValue('');
    } else if (modo === 'TEXTO') {
      this.form.get('proveedorId')?.setValue(null);
      this.proveedorFilter.setValue('');
    } else {
      // AL_PORTADOR: limpia todo
      this.form.get('proveedorId')?.setValue(null);
      this.form.get('beneficiarioTexto')?.setValue('');
      this.proveedorFilter.setValue('');
    }
  }

  async loadOptions(): Promise<void> {
    try {
      const [chequeras, monedas, formasPago, cajasMayor, proveedores] = await Promise.all([
        firstValueFrom(this.repositoryService.getChequeras()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getFormasPago()),
        firstValueFrom(this.repositoryService.getCajasMayor()),
        firstValueFrom(this.repositoryService.getProveedores()),
      ]);
      this.chequeras = (chequeras || []).filter((c: any) => c.estado === 'ACTIVA');
      this.monedas = monedas || [];
      this.formasPago = formasPago || [];
      this.cajasMayor = (cajasMayor || []).filter((cm: any) => cm.estado === 'ABIERTA');
      this.proveedores = proveedores || [];
      this.proveedoresFiltrados = this.proveedores.slice(0, 20);
    } catch (error) {
      console.error('Error loading options:', error);
      this.snackBar.open('Error al cargar opciones', 'Cerrar', { duration: 3000 });
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    try {
      const v = this.form.value;
      const beneficiario = v.beneficiarioModo === 'TEXTO' ? (v.beneficiarioTexto || null) : null;

      const data: any = {
        chequeraId: v.chequeraId,
        numeroCheque: v.numeroCheque || undefined,
        monto: v.monto,
        monedaId: v.monedaId,
        proveedorId: v.beneficiarioModo === 'PROVEEDOR' ? v.proveedorId || null : null,
        beneficiario,
        fechaEmision: v.fechaEmision,
        fechaPago: v.fechaPago || null,
        esDiferido: !!v.esDiferido,
        cajaMayorId: v.registrarEnCajaMayor ? (v.cajaMayorId || null) : null,
        formaPagoId: v.registrarEnCajaMayor ? (v.formaPagoId || null) : null,
        observacion: v.observacion || null,
      };
      await firstValueFrom(this.repositoryService.emitirCheque(data));
      this.snackBar.open('Cheque emitido', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (error: any) {
      console.error('Error emitiendo cheque:', error);
      this.snackBar.open(error?.message || 'Error al emitir cheque', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  cancel(): void {
    this.dialogRef?.close();
  }
}
