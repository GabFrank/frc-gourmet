import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, QrUploadedFile } from 'src/app/database/repository.service';
import { QrUploadDialogComponent } from 'src/app/shared/components/qr-upload-dialog/qr-upload-dialog.component';

const TIPOS = [
  'CEDULA',
  'CONTRATO',
  'CERTIFICADO',
  'CV',
  'ANTECEDENTES',
  'CARNET_SALUD',
  'TITULO_ACADEMICO',
  'OTRO',
];

@Component({
  selector: 'app-upload-documento-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>Subir documento</h2>
    <mat-dialog-content>
      <form [formGroup]="form" class="form">
        <mat-form-field appearance="outline" class="full">
          <mat-label>Tipo</mat-label>
          <mat-select formControlName="tipo">
            <mat-option *ngFor="let t of tipos" [value]="t">{{ t }}</mat-option>
          </mat-select>
        </mat-form-field>
        <div class="file-row full">
          <button type="button" mat-stroked-button (click)="picker.click()">
            <mat-icon>upload_file</mat-icon>
            Seleccionar archivo
          </button>
          <button type="button" mat-stroked-button (click)="openQrUpload()" [disabled]="qrLoading"
                  matTooltip="Subir desde el celular (QR)">
            <mat-icon>qr_code_2</mat-icon>
            Celular
          </button>
          <span *ngIf="fileName" class="file-name">{{ fileName }} ({{ (fileSize/1024) | number:'1.0-2' }} KB)</span>
          <input type="file" #picker style="display:none" (change)="onFileSelected($event)" />
        </div>
        <mat-form-field appearance="outline">
          <mat-label>Vencimiento (opcional)</mat-label>
          <input matInput [matDatepicker]="p" formControlName="vencimiento" />
          <mat-datepicker-toggle matSuffix [for]="p"></mat-datepicker-toggle>
          <mat-datepicker #p></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Observacion</mat-label>
          <input matInput formControlName="observacion" />
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="cancel()" [disabled]="saving">Cancelar</button>
      <button mat-flat-button color="primary" (click)="submit()" [disabled]="!base64 || form.invalid || saving">
        Subir
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; min-width: 540px; }
    .full { grid-column: 1 / -1; }
    .file-row { display: flex; align-items: center; gap: 12px; }
    .file-name { opacity: 0.85; font-size: 14px; }
  `],
})
export class UploadDocumentoDialogComponent {
  form: FormGroup;
  saving = false;
  tipos = TIPOS;
  fileName = '';
  fileSize = 0;
  base64 = '';
  mimeType = '';
  qrLoading = false;

  constructor(
    private dialogRef: MatDialogRef<UploadDocumentoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { funcionarioId: number },
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.form = this.fb.group({
      tipo: ['CEDULA', Validators.required],
      vencimiento: [null],
      observacion: [''],
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) {
      this.snackBar.open('Archivo demasiado grande (max 10MB)', 'Cerrar', { duration: 3500 });
      return;
    }
    this.fileName = file.name;
    this.fileSize = file.size;
    this.mimeType = file.type;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.base64 = result.replace(/^data:[^;]+;base64,/, '');
    };
    reader.readAsDataURL(file);
  }

  /**
   * Sube el documento desde el celular vía QR. El archivo llega al bucket
   * `funcionario-documentos`; lo leemos de vuelta a base64 para reusar el flujo
   * normal (`submit()` → `uploadFuncionarioDocumento`, que lo persiste bajo
   * `funcionario-documentos/{id}/` + crea el registro) y borramos el temporal.
   */
  async openQrUpload(): Promise<void> {
    const ref = this.dialog.open(QrUploadDialogComponent, {
      data: { carpeta: 'funcionario-documentos', accept: 'image/*,application/pdf', maxSizeMB: 10, multiple: false },
      width: '420px',
      maxWidth: '95vw',
    });
    const files: QrUploadedFile[] | undefined = await firstValueFrom(ref.afterClosed());
    const f = files?.[0];
    if (!f) return;
    this.qrLoading = true;
    try {
      const { base64, mimeType } = await firstValueFrom(this.repositoryService.readFileBase64(f.url));
      this.base64 = base64;
      this.fileName = f.fileName;
      this.fileSize = f.tamanoBytes;
      this.mimeType = f.mimeType || mimeType;
      // Limpiar el archivo temporal del bucket (submit lo re-guarda por funcionario).
      this.repositoryService.deleteFile(f.url).subscribe({ error: () => { /* best-effort */ } });
    } catch (e) {
      console.error(e);
      this.snackBar.open('No se pudo leer el archivo subido.', 'Cerrar', { duration: 3500 });
    } finally {
      this.qrLoading = false;
    }
  }

  cancel(): void { this.dialogRef.close(); }

  async submit(): Promise<void> {
    if (this.form.invalid || !this.base64) return;
    this.saving = true;
    const v = this.form.value;
    try {
      await firstValueFrom(this.repositoryService.uploadFuncionarioDocumento({
        funcionarioId: this.data.funcionarioId,
        tipo: v.tipo,
        nombreArchivo: this.fileName,
        mimeType: this.mimeType,
        base64: this.base64,
        vencimiento: v.vencimiento,
        observacion: v.observacion,
      }));
      this.snackBar.open('Documento subido', 'Cerrar', { duration: 2500 });
      this.dialogRef.close({ saved: true });
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error subiendo documento', 'Cerrar', { duration: 3500 });
    } finally {
      this.saving = false;
    }
  }
}
