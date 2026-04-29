import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
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
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-create-edit-funcionario-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
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

  constructor(
    private dialogRef: MatDialogRef<CreateEditFuncionarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionario?: any },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
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
        // En modo editar bloqueamos cambios criticos (cargo y salario son via dialogos especificos)
        this.form.get('personaId')?.disable();
        this.form.get('cargoId')?.disable();
        this.form.get('fechaIngreso')?.disable();
        this.form.get('salarioBase')?.disable();
        this.form.get('monedaSalarioId')?.disable();
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.snackBar.open('Error al cargar datos', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
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
