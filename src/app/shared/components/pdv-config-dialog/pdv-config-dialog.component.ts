import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
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
    MatSlideToggleModule,
  ]
})
export class PdvConfigDialogComponent implements OnInit {
  loading = true;
  isSaving = false;
  configForm: FormGroup;
  pdvConfigId: number | null = null;
  /** Zonas de entrega activas, para el selector de zona por defecto. */
  preciosDelivery: any[] = [];

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
      // Validators de verdad: `min`/`max` en el HTML son sugerencias del
      // navegador. Sin esto se guardaba un 24 o un -1, el backend lo descartaba
      // en silencio y volvia a 7 — el admin creia haber configurado otro corte.
      inicioJornadaHora: [7, [Validators.required, Validators.min(0), Validators.max(23)]],
      umbralDiferenciaBaja: [5],
      umbralDiferenciaAlta: [15],
      // --- Delivery ---
      // `deliveryTiempoAmarillo` / `deliveryTiempoRojo` ya estaban en el form
      // pero NO tenian campo en el HTML: de hecho eran 30 y 60 fijos salvo que
      // se editara la base a mano.
      deliveryHabilitado: [true],
      deliveryTiempoAmarillo: [30],
      deliveryTiempoRojo: [60],
      deliveryPrecioDefaultId: [null],
      deliveryCobroAnticipadoDefault: [false],
      deliveryRequiereDireccion: [true],
      deliveryRequiereRepartidor: [true],
      deliveryTelefonoMinDigitos: [4],
      deliveryPageSize: [20],
      deliveryMostrarPendientesOtrasCajas: [true],
      deliveryAutoImprimirAlCrear: [false],
      deliveryAutoImprimirAlEnviar: [false],
      whatsappCierreCajaActivo: [false],
      whatsappCierreCajaDestino: [''],
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      // Zonas de entrega, para elegir la preseleccionada al crear un delivery.
      // `valor` es decimal -> string en Postgres: el Number() evita que el
      // orden salga alfabetico ("10000" < "5000").
      try {
        const precios = await firstValueFrom(this.repositoryService.getPreciosDelivery());
        this.preciosDelivery = (precios || [])
          .filter((p: any) => p.activo)
          .sort((a: any, b: any) => Number(a.valor) - Number(b.valor));
      } catch (e) {
        console.warn('No se pudieron cargar las zonas de delivery:', e);
      }

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
          // `?? 7` y no `|| 7`: 0 es un valor valido (jornada = dia calendario)
          // y con `||` se convertiria en 7 cada vez que se abre el dialogo.
          inicioJornadaHora: cfg.inicioJornadaHora ?? 7,
          umbralDiferenciaBaja: cfg.umbralDiferenciaBaja || 5,
          umbralDiferenciaAlta: cfg.umbralDiferenciaAlta || 15,
          deliveryHabilitado: cfg.deliveryHabilitado !== false,
          deliveryTiempoAmarillo: cfg.deliveryTiempoAmarillo || 30,
          deliveryTiempoRojo: cfg.deliveryTiempoRojo || 60,
          deliveryPrecioDefaultId: cfg.deliveryPrecioDefaultId ?? null,
          deliveryCobroAnticipadoDefault: cfg.deliveryCobroAnticipadoDefault || false,
          deliveryRequiereDireccion: cfg.deliveryRequiereDireccion !== false,
          deliveryRequiereRepartidor: cfg.deliveryRequiereRepartidor !== false,
          deliveryTelefonoMinDigitos: cfg.deliveryTelefonoMinDigitos || 4,
          deliveryPageSize: cfg.deliveryPageSize || 20,
          deliveryMostrarPendientesOtrasCajas: cfg.deliveryMostrarPendientesOtrasCajas !== false,
          deliveryAutoImprimirAlCrear: cfg.deliveryAutoImprimirAlCrear || false,
          deliveryAutoImprimirAlEnviar: cfg.deliveryAutoImprimirAlEnviar || false,
          whatsappCierreCajaActivo: cfg.whatsappCierreCajaActivo || false,
          whatsappCierreCajaDestino: cfg.whatsappCierreCajaDestino || '',
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
    if (this.configForm.invalid) {
      this.configForm.markAllAsTouched();
      this.snackBar.open('Revisá los campos marcados', 'OK', { duration: 3000 });
      return;
    }
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
