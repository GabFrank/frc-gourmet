import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { Cliente } from 'src/app/database/entities/personas/cliente.entity';
import { Persona } from 'src/app/database/entities/personas/persona.entity';
import { TipoCliente } from 'src/app/database/entities/personas/tipo-cliente.entity';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { CurrencyInputDirective } from 'src/app/shared/directives/currency-input.directive';
import { CreateEditTipoClienteDialogComponent } from '../create-edit-tipo-cliente-dialog/create-edit-tipo-cliente-dialog.component';
import { CreateEditPersonaComponent } from '../../personas/create-edit-persona.component';

@Component({
  selector: 'app-create-edit-cliente-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatSnackBarModule,
    CurrencyInputDirective,
  ],
  templateUrl: './create-edit-cliente-dialog.component.html',
  styleUrls: ['./create-edit-cliente-dialog.component.scss'],
})
export class CreateEditClienteDialogComponent implements OnInit {
  isEditing = false;
  loading = false;
  saving = false;
  form!: FormGroup;

  personas: Persona[] = [];
  tiposCliente: TipoCliente[] = [];
  monedaPrincipal: Moneda | null = null;

  // Autocomplete persona
  personaControl = new FormControl<Persona | string | null>(null, Validators.required);
  filteredPersonas: Persona[] = [];
  selectedPersona: Persona | null = null;
  personaSinDocumento = false;

  saldoActual = 0;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<CreateEditClienteDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { cliente?: Cliente | null },
  ) {
    this.isEditing = !!data?.cliente;
  }

  async ngOnInit(): Promise<void> {
    this.form = this.fb.group(
      {
        ruc: [''],
        razon_social: [''],
        tributa: [false],
        tipo_cliente_id: [null, Validators.required],
        credito: [false],
        limite_credito: [0, [Validators.min(0)]],
        activo: [true],
      },
      { validators: [this.rucRequeridoSiTributa] },
    );

    this.loading = true;
    try {
      const [personas, tipos, monedas] = await Promise.all([
        firstValueFrom(this.repositoryService.getPersonas()),
        firstValueFrom(this.repositoryService.getTipoClientes()),
        firstValueFrom(this.repositoryService.getMonedas()),
      ]);
      this.personas = (personas || []).filter((p: any) => p.activo);
      this.tiposCliente = (tipos || []).filter((t: any) => t.activo);
      this.monedaPrincipal = (monedas || []).find((m: any) => m.principal) || null;
      this.filteredPersonas = this.personas.slice(0, 50);
      this.setupPersonaAutocomplete();

      if (this.isEditing && this.data.cliente) {
        this.prefillFromCliente(this.data.cliente);
      } else {
        this.applyCreditoToggle(false);
      }

      this.form.get('credito')!.valueChanges.subscribe((v: boolean) => this.applyCreditoToggle(v));
    } catch (error) {
      console.error('Error cargando datos cliente:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  private prefillFromCliente(c: Cliente): void {
    this.saldoActual = Number(c.saldoActual) || 0;
    this.form.patchValue({
      ruc: c.ruc || '',
      razon_social: c.razon_social || '',
      tributa: !!c.tributa,
      tipo_cliente_id: c.tipo_cliente?.id || null,
      credito: !!c.credito,
      limite_credito: Number(c.limite_credito) || 0,
      activo: !!c.activo,
    });
    if (c.persona) {
      const personaExistente = this.personas.find((p) => p.id === c.persona.id) || (c.persona as Persona);
      this.selectedPersona = personaExistente;
      this.personaSinDocumento = !(personaExistente.documento || '').trim();
      this.personaControl.setValue(personaExistente, { emitEvent: false });
    }
    this.applyCreditoToggle(!!c.credito);
  }

  private setupPersonaAutocomplete(): void {
    this.personaControl.valueChanges.subscribe((value) => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredPersonas = this.personas
          .filter((p) => this.personaLabel(p).toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedPersona && this.personaLabel(this.selectedPersona).toUpperCase() !== filter) {
          this.selectedPersona = null;
        }
      } else {
        this.filteredPersonas = this.personas.slice(0, 50);
      }
    });
  }

  private personaLabel(p: Persona | null): string {
    if (!p) return '';
    const apellido = p.apellido ? ` ${p.apellido}` : '';
    const documento = p.documento ? ` - ${p.documento}` : '';
    return `${p.nombre || ''}${apellido}${documento}`.trim();
  }

  displayPersona = (p: any): string => (p && typeof p === 'object' ? this.personaLabel(p) : '');

  onPersonaSelected(persona: Persona): void {
    this.selectedPersona = persona;
    this.personaSinDocumento = !(persona.documento || '').trim();
    // Auto-llenar razon_social si está vacía
    const currentRazon = (this.form.get('razon_social')?.value || '').trim();
    if (!currentRazon) {
      const apellido = persona.apellido ? ` ${persona.apellido}` : '';
      this.form.patchValue({ razon_social: `${persona.nombre || ''}${apellido}`.trim() });
    }
  }

  clearPersona(): void {
    this.selectedPersona = null;
    this.personaSinDocumento = false;
    this.personaControl.setValue('');
    this.filteredPersonas = this.personas.slice(0, 50);
  }

  private applyCreditoToggle(enabled: boolean): void {
    const limite = this.form.get('limite_credito');
    if (!limite) return;
    if (enabled) {
      limite.enable({ emitEvent: false });
    } else {
      limite.setValue(0, { emitEvent: false });
      limite.disable({ emitEvent: false });
    }
  }

  private rucRequeridoSiTributa: ValidatorFn = (group): ValidationErrors | null => {
    const tributa = group.get('tributa')?.value;
    const ruc = (group.get('ruc')?.value || '').trim();
    if (tributa && !ruc) return { rucRequerido: true };
    return null;
  };

  openNuevaPersonaDialog(): void {
    const ref = this.dialog.open(CreateEditPersonaComponent, {
      width: '720px',
      maxHeight: '90vh',
      data: {},
      disableClose: true,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.success && result?.persona) {
        const personas = await firstValueFrom(this.repositoryService.getPersonas());
        this.personas = (personas || []).filter((p: any) => p.activo);
        const nueva = this.personas.find((p) => p.id === result.persona.id) || (result.persona as Persona);
        this.filteredPersonas = this.personas.slice(0, 50);
        if (nueva) {
          this.selectedPersona = nueva;
          this.personaControl.setValue(nueva, { emitEvent: false });
          this.onPersonaSelected(nueva);
        }
        this.snackBar.open('Persona creada', 'Cerrar', { duration: 2000 });
      }
    });
  }

  openTipoClienteDialog(tipo?: TipoCliente | null): void {
    const ref = this.dialog.open(CreateEditTipoClienteDialogComponent, {
      width: '480px',
      data: { tipoCliente: tipo || null },
      disableClose: true,
    });
    ref.afterClosed().subscribe(async (result) => {
      if (result?.saved) {
        const tipos = await firstValueFrom(this.repositoryService.getTipoClientes());
        this.tiposCliente = (tipos || []).filter((t: any) => t.activo);
        if (result.tipoCliente?.id) {
          this.form.patchValue({ tipo_cliente_id: result.tipoCliente.id });
        }
      }
    });
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (!this.selectedPersona) {
      this.snackBar.open('Debe seleccionar una persona', 'Cerrar', { duration: 3000 });
      return;
    }
    if (this.form.invalid) {
      if (this.form.errors?.['rucRequerido']) {
        this.snackBar.open('RUC es obligatorio cuando el cliente tributa', 'Cerrar', { duration: 3500 });
      }
      this.form.markAllAsTouched();
      return;
    }
    if (this.form.get('credito')?.value && !(this.selectedPersona.documento || '').trim()) {
      this.snackBar.open(
        'Para asignar crédito, la persona debe tener documento. Edítela desde Personas para agregarlo.',
        'Cerrar',
        { duration: 5000 },
      );
      return;
    }

    this.saving = true;
    const v = this.form.getRawValue();
    const payload: any = {
      persona: { id: this.selectedPersona.id },
      tipo_cliente: { id: v.tipo_cliente_id },
      ruc: (v.ruc || '').trim().toUpperCase() || null,
      razon_social: (v.razon_social || '').trim().toUpperCase() || null,
      tributa: !!v.tributa,
      activo: !!v.activo,
      credito: !!v.credito,
      limite_credito: Number(v.limite_credito) || 0,
    };

    try {
      let cliente: Cliente;
      if (this.isEditing && this.data.cliente?.id) {
        const res: any = await firstValueFrom(
          this.repositoryService.updateCliente(this.data.cliente.id, payload),
        );
        cliente = res?.cliente || { ...this.data.cliente, ...payload } as Cliente;
        this.snackBar.open('Cliente actualizado', 'Cerrar', { duration: 2500 });
      } else {
        cliente = await firstValueFrom(this.repositoryService.createCliente(payload));
        this.snackBar.open('Cliente creado', 'Cerrar', { duration: 2500 });
      }
      this.dialogRef.close({ saved: true, cliente });
    } catch (error) {
      console.error('Error guardando cliente:', error);
      this.snackBar.open('Error al guardar cliente', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
