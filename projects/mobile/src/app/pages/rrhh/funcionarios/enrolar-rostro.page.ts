import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, FaceRecognitionService, FaceCaptureComponent, FaceCapture } from '@frc/shared-core';

/**
 * Enrollment facial desde la PWA (tablet). Captura 1..N rostros de un funcionario
 * y los registra. El match se hace en el backend; acá solo generamos embeddings.
 */
@Component({
  selector: 'app-enrolar-rostro',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatChipsModule, MatProgressBarModule, MatSnackBarModule, FaceCaptureComponent,
  ],
  templateUrl: './enrolar-rostro.page.html',
})
export class EnrolarRostroPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snackBar = inject(MatSnackBar);

  readonly maxCapturas = 5;
  funcionarioId!: number;
  funcionarioNombre = '';
  rostros: any[] = [];
  capturas: FaceCapture[] = [];
  saving = false;

  async ngOnInit(): Promise<void> {
    this.funcionarioId = Number(this.route.snapshot.paramMap.get('id'));
    await Promise.all([this.loadFuncionario(), this.loadRostros()]);
  }

  private async loadFuncionario(): Promise<void> {
    try {
      const f: any = await firstValueFrom(this.repo.getFuncionario(this.funcionarioId));
      this.funcionarioNombre = `${f?.persona?.nombre || ''} ${f?.persona?.apellido || ''}`.trim();
    } catch { /* nombre opcional */ }
  }

  async loadRostros(): Promise<void> {
    try {
      this.rostros = await firstValueFrom(this.repo.getRostrosFuncionario(this.funcionarioId)) || [];
    } catch { this.rostros = []; }
  }

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
        await firstValueFrom(this.repo.enrolarRostro({
          funcionarioId: this.funcionarioId,
          embedding: cap.embedding,
          dimension: FaceRecognitionService.DIMENSION,
          modelo: FaceRecognitionService.MODEL_NAME,
        }));
      }
      this.snackBar.open(`${this.capturas.length} rostro(s) registrado(s)`, 'OK', { duration: 3000 });
      this.capturas = [];
      await this.loadRostros();
    } catch (e: any) {
      this.snackBar.open('Error al guardar: ' + (e?.message || e), 'OK', { duration: 4000 });
    } finally {
      this.saving = false;
    }
  }

  async eliminarRostro(r: any): Promise<void> {
    try {
      await firstValueFrom(this.repo.eliminarRostro(r.id));
      await this.loadRostros();
    } catch (e: any) {
      this.snackBar.open('Error al eliminar: ' + (e?.message || e), 'OK', { duration: 3500 });
    }
  }

  volver(): void {
    this.location.back();
  }
}
