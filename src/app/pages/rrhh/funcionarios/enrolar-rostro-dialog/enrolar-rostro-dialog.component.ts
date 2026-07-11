import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { FaceCaptureComponent } from 'src/app/shared/components/face-capture/face-capture.component';
import { FaceCapture, FaceRecognitionService } from 'src/app/services/face-recognition.service';

/**
 * Registra 1..N rostros de un funcionario capturando desde la webcam.
 * El match se hace en el backend; acá solo generamos embeddings on-device.
 */
@Component({
  selector: 'app-enrolar-rostro-dialog',
  standalone: true,
  templateUrl: './enrolar-rostro-dialog.component.html',
  styleUrls: ['./enrolar-rostro-dialog.component.scss'],
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    FaceCaptureComponent,
  ],
})
export class EnrolarRostroDialogComponent {
  readonly maxCapturas = 5;
  capturas: FaceCapture[] = [];
  saving = false;

  constructor(
    private dialogRef: MatDialogRef<EnrolarRostroDialogComponent>,
    private repository: RepositoryService,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: { funcionarioId: number; funcionarioNombre?: string },
  ) {}

  onCaptured(cap: FaceCapture): void {
    if (this.capturas.length >= this.maxCapturas) {
      this.snackBar.open(`Máximo ${this.maxCapturas} capturas`, 'OK', { duration: 2500 });
      return;
    }
    this.capturas.push(cap);
  }

  quitarCaptura(i: number): void {
    this.capturas.splice(i, 1);
  }

  onCameraError(msg: string): void {
    this.snackBar.open(msg, 'OK', { duration: 4000 });
  }

  async guardar(): Promise<void> {
    if (!this.capturas.length || this.saving) return;
    this.saving = true;
    try {
      for (const cap of this.capturas) {
        await firstValueFrom(this.repository.enrolarRostro({
          funcionarioId: this.data.funcionarioId,
          embedding: cap.embedding,
          dimension: FaceRecognitionService.DIMENSION,
          modelo: FaceRecognitionService.MODEL_NAME,
        }));
      }
      this.snackBar.open(`${this.capturas.length} rostro(s) registrado(s)`, 'OK', { duration: 3000 });
      this.dialogRef.close(true);
    } catch (e: any) {
      this.snackBar.open('Error al guardar: ' + (e?.message || e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  cancelar(): void {
    this.dialogRef.close(false);
  }
}
