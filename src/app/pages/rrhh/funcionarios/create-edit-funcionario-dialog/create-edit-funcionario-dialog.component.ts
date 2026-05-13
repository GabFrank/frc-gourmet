import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { CreateEditPersonaComponent } from 'src/app/pages/personas/personas/create-edit-persona.component';
import { CreateUsuarioRapidoDialogComponent, CreateUsuarioRapidoDialogData } from 'src/app/pages/personas/usuarios/create-usuario-rapido-dialog/create-usuario-rapido-dialog.component';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-funcionario-dialog',
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
    MatCheckboxModule,
    MatSlideToggleModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './create-edit-funcionario-dialog.component.html',
  styleUrls: ['./create-edit-funcionario-dialog.component.scss'],
})
export class CreateEditFuncionarioDialogComponent implements OnInit {
  isEditing = false;
  loading = false;
  saving = false;
  form!: FormGroup;
  personas: any[] = [];
  cargos: any[] = [];
  monedas: any[] = [];
  usuarios: any[] = [];

  // Autocomplete de Persona
  personaControl = new FormControl<any | string | null>({ value: null, disabled: false });
  filteredPersonas: any[] = [];
  selectedPersona: any | null = null;

  constructor(
    private dialogRef: MatDialogRef<CreateEditFuncionarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionario?: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.isEditing = !!this.data?.funcionario;
    this.form = this.fb.group({
      personaId: [null, Validators.required],
      codigoInterno: [''],
      cargoId: [null, Validators.required],
      fechaIngreso: [new Date(), Validators.required],
      salarioBase: [0, [Validators.required, Validators.min(0)]],
      monedaSalarioId: [null, Validators.required],
      esJornalero: [false],
      valorJornal: [null],
      usuarioId: [null],
      ipsActivo: [false],
      numeroIps: [''],
      cuentaBancariaPropia: [''],
      observacion: [''],
      activo: [true],
    });
  }

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [personas, cargos, monedas, usuarios] = await Promise.all([
        firstValueFrom(this.repositoryService.getPersonas()),
        firstValueFrom(this.repositoryService.getCargos()),
        firstValueFrom(this.repositoryService.getMonedas()),
        firstValueFrom(this.repositoryService.getUsuarios()),
      ]);
      this.personas = (personas || []).filter((p: any) => p.activo);
      this.cargos = (cargos || []).filter((c: any) => c.activo);
      this.monedas = monedas || [];
      this.usuarios = (usuarios || []).filter((u: any) => u.activo);
      this.filteredPersonas = this.personas.slice(0, 50);
      this.setupPersonaAutocomplete();

      if (this.isEditing && this.data.funcionario) {
        const f = this.data.funcionario;
        this.form.patchValue({
          personaId: f.persona?.id,
          codigoInterno: f.codigoInterno,
          cargoId: f.cargo?.id,
          fechaIngreso: f.fechaIngreso,
          salarioBase: f.salarioBase,
          monedaSalarioId: f.monedaSalario?.id,
          esJornalero: f.esJornalero,
          valorJornal: f.valorJornal,
          usuarioId: f.usuario?.id || null,
          ipsActivo: f.ipsActivo,
          numeroIps: f.numeroIps,
          cuentaBancariaPropia: f.cuentaBancariaPropia,
          observacion: f.observacion,
          activo: f.activo,
        });
        // Pre-poblar el autocomplete de Persona
        const personaExistente = this.personas.find(p => p.id === f.persona?.id) || f.persona;
        if (personaExistente) {
          this.selectedPersona = personaExistente;
          this.personaControl.setValue(personaExistente, { emitEvent: false });
        }
        // En modo editar bloqueamos cambios criticos (cargo y salario son via dialogos especificos)
        this.form.get('personaId')?.disable();
        this.form.get('cargoId')?.disable();
        this.form.get('fechaIngreso')?.disable();
        this.form.get('salarioBase')?.disable();
        this.form.get('monedaSalarioId')?.disable();
        this.personaControl.disable({ emitEvent: false });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  private personaLabel(p: any): string {
    if (!p) return '';
    const apellido = p.apellido ? ` ${p.apellido}` : '';
    const documento = p.documento ? ` - ${p.documento}` : '';
    return `${p.nombre || ''}${apellido}${documento}`.trim();
  }

  private setupPersonaAutocomplete(): void {
    this.personaControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredPersonas = this.personas
          .filter(p => this.personaLabel(p).toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedPersona && this.personaLabel(this.selectedPersona).toUpperCase() !== filter) {
          this.selectedPersona = null;
          this.form.patchValue({ personaId: null });
        }
      } else {
        this.filteredPersonas = this.personas.slice(0, 50);
      }
    });
  }

  displayPersona = (p: any): string => (p && typeof p === 'object') ? this.personaLabel(p) : '';

  onPersonaSelected(persona: any): void {
    this.selectedPersona = persona;
    this.form.patchValue({ personaId: persona.id });
  }

  clearPersona(): void {
    this.selectedPersona = null;
    this.personaControl.setValue('');
    this.form.patchValue({ personaId: null });
    this.filteredPersonas = this.personas.slice(0, 50);
  }

  /** Abre el dialogo de Crear Usuario Rapido y, al exito, refresca el select
   * de usuarios y selecciona el recien creado. */
  async crearNuevoUsuario(): Promise<void> {
    // Sugerir nickname a partir del nombre de la persona (si esta seleccionada)
    const nicknameSugerido = this.selectedPersona?.nombre
      ? String(this.selectedPersona.nombre)
          .split(' ')[0]
          .toLowerCase()
          .replace(/[^a-z0-9._-]/g, '')
      : '';

    const dialogData: CreateUsuarioRapidoDialogData = {
      personaId: this.selectedPersona?.id ?? null,
      nicknameSugerido,
    };
    const ref = this.dialog.open(CreateUsuarioRapidoDialogComponent, {
      data: dialogData,
      width: '560px',
      maxWidth: '95vw',
      disableClose: true,
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.success || !result.usuario?.nickname) return;

    try {
      const usuarios = await firstValueFrom(this.repositoryService.getUsuarios());
      this.usuarios = usuarios || [];
      const nuevo = this.usuarios.find((u: any) => u.nickname === result.usuario.nickname);
      if (nuevo) {
        this.form.patchValue({ usuarioId: nuevo.id });
      }
    } catch (e) {
      console.error('Error refrescando usuarios', e);
    }
  }

  /** Abre el dialogo de Crear Persona y, al cerrarse OK, refresca el autocomplete
   * y selecciona la persona recien creada. */
  async crearNuevaPersona(): Promise<void> {
    const ref = this.dialog.open(CreateEditPersonaComponent, {
      data: { persona: undefined },
      width: '720px',
      maxWidth: '95vw',
    });
    const result = await firstValueFrom(ref.afterClosed());
    if (!result?.success || result.action !== 'create' || !result.persona) return;

    try {
      const personas = await firstValueFrom(this.repositoryService.getPersonas());
      this.personas = (personas || []).filter((p: any) => p.activo);
      const nuevaPersona = this.personas.find((p) => p.id === result.persona.id) || result.persona;
      this.filteredPersonas = this.personas.slice(0, 50);
      this.selectedPersona = nuevaPersona;
      this.personaControl.setValue(nuevaPersona, { emitEvent: false });
      this.form.patchValue({ personaId: nuevaPersona.id });
      this.snackBar.open(`Persona ${nuevaPersona.nombre} creada y seleccionada`, 'OK', { duration: 2500 });
    } catch (e) {
      console.error('Error refrescando personas', e);
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving = true;
    const v = this.form.getRawValue();
    try {
      if (this.isEditing && this.data.funcionario) {
        await firstValueFrom(this.repositoryService.updateFuncionario(this.data.funcionario.id, {
          codigoInterno: v.codigoInterno,
          esJornalero: v.esJornalero,
          valorJornal: v.valorJornal,
          usuarioId: v.usuarioId,
          ipsActivo: v.ipsActivo,
          numeroIps: v.numeroIps,
          cuentaBancariaPropia: v.cuentaBancariaPropia,
          observacion: v.observacion,
          activo: v.activo,
        }));
        this.snackBar.open('Funcionario actualizado', 'Cerrar', { duration: 2500 });
      } else {
        await firstValueFrom(this.repositoryService.createFuncionario({
          personaId: v.personaId,
          codigoInterno: v.codigoInterno,
          cargoId: v.cargoId,
          fechaIngreso: v.fechaIngreso,
          salarioBase: v.salarioBase,
          monedaSalarioId: v.monedaSalarioId,
          esJornalero: v.esJornalero,
          valorJornal: v.valorJornal,
          usuarioId: v.usuarioId,
          ipsActivo: v.ipsActivo,
          numeroIps: v.numeroIps,
          cuentaBancariaPropia: v.cuentaBancariaPropia,
          observacion: v.observacion,
          activo: v.activo,
        }));
        this.snackBar.open('Funcionario creado', 'Cerrar', { duration: 2500 });
      }
      this.dialogRef.close({ saved: true });
    } catch (error) {
      console.error('Error guardando funcionario:', error);
      this.snackBar.open('Error al guardar funcionario', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
