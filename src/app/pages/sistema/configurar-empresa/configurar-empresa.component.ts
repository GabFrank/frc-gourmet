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
import { firstValueFrom } from 'rxjs';
import { EmpresaService } from '../../../shared/services/empresa.service';
import { FileUploadComponent, FileUploadResult } from '../../../shared/components/file-upload/file-upload.component';
import { RepositoryService } from '../../../database/repository.service';
import { resolveAppUrl } from '../../../shared/utils/image-url.util';

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
    FileUploadComponent,
  ],
  templateUrl: './configurar-empresa.component.html',
  styleUrls: ['./configurar-empresa.component.scss'],
})
export class ConfigurarEmpresaComponent implements OnInit {
  form!: FormGroup;
  loading = false;
  saving = false;

  /**
   * URL del logo. NO va al form (lo persistimos directo al subir/remover,
   * no espera al "Guardar cambios" — es lo natural con file uploads).
   */
  logoUrl: string | null = null;

  constructor(
    private fb: FormBuilder,
    private empresaService: EmpresaService,
    private snackBar: MatSnackBar,
    private repository: RepositoryService,
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
        this.logoUrl = empresa.logoUrl || null;
        this.form.markAsPristine();
      }
    } catch (err: any) {
      this.snackBar.open('Error al cargar datos de empresa: ' + (err?.message || err), 'Cerrar', { duration: 5000 });
    } finally {
      this.loading = false;
    }
  }

  /**
   * URL resuelta para preview en la card. Usamos el original (no derivada
   * .medium.jpg) para preservar transparencia de PNGs — los logos suelen ser
   * PNG con fondo transparente y `.medium.jpg` los aplana a blanco/negro.
   */
  get logoPreviewUrl(): string | null {
    if (!this.logoUrl) return null;
    return resolveAppUrl(this.logoUrl) || null;
  }

  /**
   * Sube el logo nuevo. Si habia uno previo, lo borra del disco para no
   * acumular basura en `userData/logos/`. El logo se persiste inmediato
   * (no espera "Guardar cambios") — patron natural para uploads.
   */
  async onLogoUploaded(result: FileUploadResult): Promise<void> {
    const previous = this.logoUrl;
    this.logoUrl = result.url;
    try {
      await this.empresaService.update({ logoUrl: result.url });
      // Borrar el viejo solo si el update salio OK.
      if (previous && previous !== result.url) {
        try {
          await firstValueFrom(this.repository.deleteFile(previous));
        } catch (err) {
          console.warn('No se pudo borrar logo previo:', err);
        }
      }
      this.snackBar.open('Logo actualizado.', 'Cerrar', { duration: 2500 });
    } catch (err: any) {
      // Revertir UI si fallo el update
      this.logoUrl = previous;
      this.snackBar.open('Error al guardar el logo: ' + (err?.message || err), 'Cerrar', { duration: 5000 });
    }
  }

  /**
   * Quita el logo. `<app-file-upload>` ya borro el archivo del disco al
   * confirmar; aca solo nuleamos la columna en BD.
   */
  async onLogoRemoved(): Promise<void> {
    this.logoUrl = null;
    try {
      await this.empresaService.update({ logoUrl: null as any });
      this.snackBar.open('Logo removido.', 'Cerrar', { duration: 2500 });
    } catch (err: any) {
      this.snackBar.open('Error al remover logo: ' + (err?.message || err), 'Cerrar', { duration: 5000 });
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
