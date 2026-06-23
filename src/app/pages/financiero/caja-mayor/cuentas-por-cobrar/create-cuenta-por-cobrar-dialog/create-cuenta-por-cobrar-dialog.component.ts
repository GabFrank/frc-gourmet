import { Component, OnInit, Optional, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { preselectSingleOrPrincipal } from 'src/app/shared/utils/preselect';

@Component({
  selector: 'app-create-cuenta-por-cobrar-dialog',
  templateUrl: './create-cuenta-por-cobrar-dialog.component.html',
  styleUrls: ['./create-cuenta-por-cobrar-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ]
})
export class CreateCuentaPorCobrarDialogComponent implements OnInit {
  form!: FormGroup;
  saving = false;
  monedas: any[] = [];
  clientes: any[] = [];
  filteredClientes: any[] = [];
  clienteControl = new FormControl<any | string | null>(null);
  selectedCliente: any | null = null;
  tipoOptions = ['CREDITO_VENTA', 'PRESTAMO_CLIENTE', 'OTRO'];
  decimalesMoneda = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    @Optional() public dialogRef: MatDialogRef<CreateCuentaPorCobrarDialogComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public data: any,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group({
      clienteId: [this.data?.clienteId || null, Validators.required],
      tipo: ['OTRO', Validators.required],
      descripcion: [''],
      montoTotal: [null, [Validators.required, Validators.min(0.01)]],
      monedaId: [null, Validators.required],
      fechaInicio: [new Date(), Validators.required],
      cantidadCuotas: [1, [Validators.required, Validators.min(1)]],
      observacion: [''],
    });
    this.loadLookups();
    this.form.get('monedaId')!.valueChanges.subscribe(() => this.recalcDecimalesMoneda());
  }

  private recalcDecimalesMoneda(): void {
    const id = this.form?.get('monedaId')?.value;
    const m = this.monedas.find((x: any) => x.id === id);
    const dec = Number(m?.decimales);
    this.decimalesMoneda = Number.isFinite(dec) ? dec : 0;
  }

  async loadLookups(): Promise<void> {
    try {
      const [monedas, clientes] = await Promise.all([
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getClientes()),
      ]);
      this.monedas = monedas || [];
      this.clientes = (clientes as any[] || []).filter((c: any) => c.activo !== false);
      this.filteredClientes = this.clientes.slice(0, 50);
      this.setupClienteAutocomplete();

      // Pre-seleccionar moneda principal/única (solo si está vacía).
      if (!this.form.get('monedaId')?.value) {
        const m = preselectSingleOrPrincipal(this.monedas);
        if (m) this.form.patchValue({ monedaId: m.id });
      }

      // Pre-seleccionar cliente si vino en data
      const preId = this.data?.clienteId;
      if (preId) {
        const c = this.clientes.find((x: any) => x.id === preId);
        if (c) {
          this.selectedCliente = c;
          this.clienteControl.setValue(c, { emitEvent: false });
        }
      }
      this.recalcDecimalesMoneda();
    } catch (e) { console.error(e); }
  }

  clienteLabel(c: any): string {
    if (!c) return '';
    return c.razon_social || c.persona?.nombre || `Cliente #${c.id}`;
  }

  private setupClienteAutocomplete(): void {
    this.clienteControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredClientes = this.clientes
          .filter(c => this.clienteLabel(c).toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedCliente && this.clienteLabel(this.selectedCliente).toUpperCase() !== filter) {
          this.selectedCliente = null;
          this.form.patchValue({ clienteId: null });
        }
      } else {
        this.filteredClientes = this.clientes.slice(0, 50);
      }
    });
  }

  displayCliente = (c: any): string => (c && typeof c === 'object') ? this.clienteLabel(c) : '';

  onClienteSelected(cliente: any): void {
    this.selectedCliente = cliente;
    this.form.patchValue({ clienteId: cliente.id });
  }

  clearCliente(): void {
    this.selectedCliente = null;
    this.clienteControl.setValue('');
    this.form.patchValue({ clienteId: null });
    this.filteredClientes = this.clientes.slice(0, 50);
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    try {
      const f = this.form.value;
      await firstValueFrom(this.repositoryService.createCuentaPorCobrar({
        clienteId: f.clienteId,
        tipo: f.tipo,
        descripcion: f.descripcion || null,
        montoTotal: f.montoTotal,
        monedaId: f.monedaId,
        fechaInicio: f.fechaInicio,
        cantidadCuotas: f.cantidadCuotas,
        observacion: f.observacion || null,
      }));
      this.snackBar.open('Cuenta por cobrar creada', 'Cerrar', { duration: 3000 });
      this.dialogRef?.close(true);
    } catch (e: any) {
      console.error(e);
      this.snackBar.open(e?.message || 'Error al crear', 'Cerrar', { duration: 3000 });
    } finally {
      this.saving = false;
    }
  }

  onCancel(): void { this.dialogRef?.close(false); }
}
