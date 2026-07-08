import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';

@Component({
  selector: 'app-pdv-config-dialog',
  templateUrl: './pdv-config-dialog.component.html',
  styleUrls: ['./pdv-config-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ]
})
export class PdvConfigDialogComponent implements OnInit {
  loading = true;
  isSaving = false;
  configForm: FormGroup;
  pdvConfigId: number | null = null;

  constructor(
    private dialogRef: MatDialogRef<PdvConfigDialogComponent>,
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar
  ) {
    this.configForm = this.fb.group({
      pdvTabDefault: ['MESAS'],
      comandasHabilitadas: [false],
      ocuparMesaAlVincularComanda: [false],
      pizzaMaxSabores: [2],
      pizzaEstrategiaPrecio: ['MAYOR_PRECIO'],
      umbralDiferenciaBaja: [5],
      umbralDiferenciaAlta: [15],
      deliveryTiempoAmarillo: [30],
      deliveryTiempoRojo: [60],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      const config = await firstValueFrom(this.repositoryService.getPdvConfig());
      const cfg = Array.isArray(config) ? config[0] : config;
      if (cfg) {
        this.pdvConfigId = cfg.id;
        this.configForm.patchValue({
          pdvTabDefault: cfg.pdvTabDefault || 'MESAS',
          comandasHabilitadas: cfg.comandasHabilitadas || false,
          ocuparMesaAlVincularComanda: cfg.ocuparMesaAlVincularComanda || false,
          pizzaMaxSabores: cfg.pizzaMaxSabores || 2,
          pizzaEstrategiaPrecio: cfg.pizzaEstrategiaPrecio || 'MAYOR_PRECIO',
          umbralDiferenciaBaja: cfg.umbralDiferenciaBaja || 5,
          umbralDiferenciaAlta: cfg.umbralDiferenciaAlta || 15,
          deliveryTiempoAmarillo: cfg.deliveryTiempoAmarillo || 30,
          deliveryTiempoRojo: cfg.deliveryTiempoRojo || 60,
        });
      }
    } catch (error) {
      console.error('Error loading PdvConfig:', error);
    } finally {
      this.loading = false;
    }
  }

  async guardar(): Promise<void> {
    if (!this.pdvConfigId) return;
    this.isSaving = true;
    try {
      const data = this.configForm.value;
      await firstValueFrom(this.repositoryService.updatePdvConfig(this.pdvConfigId, data));
      this.snackBar.open('Configuracion guardada', 'OK', { duration: 2000 });
      this.dialogRef.close(true);
    } catch (error) {
      console.error('Error saving PdvConfig:', error);
      this.snackBar.open('Error al guardar', 'OK', { duration: 3000 });
    } finally {
      this.isSaving = false;
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}
