import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { EmpresaService } from '../../../shared/services/empresa.service';

/** Validador formato RUC Paraguay: 1..8 digitos, guion, 1 digito verificador. */
function rucValidator(control: AbstractControl): ValidationErrors | null {
  const v = (control.value || '').toString().trim();
  if (!v) return null; // opcional
  return /^\d{1,8}-\d{1}$/.test(v) ? null : { rucFormato: true };
}

@Component({
  selector: 'app-configurar-empresa',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './configurar-empresa.component.html',
  styleUrls: ['./configurar-empresa.component.scss'],
})
export class ConfigurarEmpresaComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  saving = false;

  constructor(
    private fb: FormBuilder,
    private empresaService: EmpresaService,
    private snackBar: MatSnackBar,
  ) {
    this.form = this.fb.group({
      nombre: ['', [Validators.required, Validators.maxLength(120)]],
      nombreComercial: ['', [Validators.maxLength(120)]],
      razonSocial: ['', [Validators.maxLength(180)]],
      ruc: ['', [rucValidator, Validators.maxLength(20)]],
      direccion: ['', [Validators.maxLength(200)]],
      telefono: ['', [Validators.maxLength(60)]],
      email: ['', [Validators.email, Validators.maxLength(120)]],
      sitioWeb: ['', [Validators.maxLength(200)]],
      timbradoNumero: ['', [Validators.maxLength(40)]],
      timbradoVigenciaHasta: [null],
      puntoExpedicion: ['', [Validators.maxLength(20)]],
      pais: ['PARAGUAY', [Validators.required, Validators.maxLength(60)]],
      zonaHoraria: ['America/Asuncion', [Validators.required, Validators.maxLength(60)]],
      actividadEconomica: ['', [Validators.maxLength(120)]],
    });
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.loading = true;
    try {
      const empresa = await this.empresaService.load();
      if (empresa) {
        this.form.patchValue({
          nombre: empresa.nombre || '',
          nombreComercial: empresa.nombreComercial || '',
          razonSocial: empresa.razonSocial || '',
          ruc: empresa.ruc || '',
          direccion: empresa.direccion || '',
          telefono: empresa.telefono || '',
          email: empresa.email || '',
          sitioWeb: empresa.sitioWeb || '',
          timbradoNumero: empresa.timbradoNumero || '',
          timbradoVigenciaHasta: empresa.timbradoVigenciaHasta ? new Date(empresa.timbradoVigenciaHasta) : null,
          puntoExpedicion: empresa.puntoExpedicion || '',
          pais: empresa.pais || 'PARAGUAY',
          zonaHoraria: empresa.zonaHoraria || 'America/Asuncion',
          actividadEconomica: empresa.actividadEconomica || '',
        });
        this.form.markAsPristine();
      }
    } catch (err: any) {
      this.snackBar.open('Error al cargar datos de empresa: ' + (err?.message || err), 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  async guardar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.snackBar.open('Revise los campos marcados.', 'Cerrar', { duration: 3000 });
      return;
    }
    this.saving = true;
    try {
      const raw = this.form.value;
      const payload: any = {
        nombre: raw.nombre,
        nombreComercial: raw.nombreComercial,
        razonSocial: raw.razonSocial,
        ruc: raw.ruc,
        direccion: raw.direccion,
        telefono: raw.telefono,
        email: raw.email,
        sitioWeb: raw.sitioWeb,
        timbradoNumero: raw.timbradoNumero,
        timbradoVigenciaHasta: raw.timbradoVigenciaHasta || null,
        puntoExpedicion: raw.puntoExpedicion,
        pais: raw.pais,
        zonaHoraria: raw.zonaHoraria,
        actividadEconomica: raw.actividadEconomica,
      };
      await this.empresaService.update(payload);
      this.form.markAsPristine();
      this.snackBar.open('Datos de empresa actualizados.', 'Cerrar', { duration: 3000 });
      // Recarga para reflejar el normalizado UPPERCASE del backend en el form.
      await this.load();
    } catch (err: any) {
      this.snackBar.open('Error al guardar: ' + (err?.message || err), 'Cerrar', { duration: 5000 });
    } finally {
      this.saving = false;
    }
  }
}
