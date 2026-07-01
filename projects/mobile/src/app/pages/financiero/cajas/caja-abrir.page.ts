import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConteoFormComponent, ConteoGrupo } from './conteo-form.component';
import { buildGruposConteo, detallesDeGrupos } from './caja-conteo.util';

interface TerminalOpt {
  id: number;
  nombre: string;
}

/**
 * Apertura de caja desde la PWA: elegir terminal (dispositivo isCaja libre) +
 * conteo inicial por denominación. Replica el flujo del desktop:
 * createConteo(APERTURA) → createConteoDetalle[] → createCaja(ABIERTO). El
 * backend rechaza si la terminal ya tiene una caja abierta.
 */
@Component({
  selector: 'app-caja-abrir',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, MatSnackBarModule, ConteoFormComponent,
  ],
  templateUrl: './caja-abrir.page.html',
  styleUrls: ['./cajas.scss'],
})
export class CajaAbrirPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  loading = true;
  saving = false;
  error: string | null = null;

  terminales: TerminalOpt[] = [];
  terminalId: number | null = null;
  grupos: ConteoGrupo[] = [];

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const [dispositivos, abiertas, cajasMonedas, billetes] = await Promise.all([
        firstValueFrom(this.repo.getDispositivos()),
        firstValueFrom(this.repo.getCajasAbiertas()),
        firstValueFrom(this.repo.getCajasMonedas()),
        firstValueFrom(this.repo.getMonedasBilletes()),
      ]);
      // Terminales de caja libres (isCaja, activas, sin caja abierta).
      const ocupadas = new Set(
        (abiertas || []).map((c: any) => c?.dispositivo?.id).filter((v: any) => v != null),
      );
      this.terminales = (dispositivos || [])
        .filter((d: any) => d && d.isCaja && d.activo && !ocupadas.has(d.id))
        .map((d: any) => ({ id: d.id, nombre: String(d.nombre || `Terminal #${d.id}`) }));
      if (this.terminales.length === 1) this.terminalId = this.terminales[0].id;

      this.grupos = buildGruposConteo(cajasMonedas || [], billetes || []);
      if (!this.terminales.length) {
        this.error = 'No hay terminales de caja libres. Cerrá una caja o configurá una terminal.';
      }
    } catch {
      this.error = 'No se pudieron cargar los datos de apertura';
    } finally {
      this.loading = false;
    }
  }

  async abrir(): Promise<void> {
    if (this.saving) return;
    if (this.terminalId == null) {
      this.snack.open('Elegí una terminal', 'OK', { duration: 3000 });
      return;
    }
    this.saving = true;
    try {
      const conteo: any = await firstValueFrom(this.repo.createConteo({
        activo: true,
        tipo: 'APERTURA',
        fecha: new Date(),
        observaciones: 'CONTEO INICIAL DE APERTURA DE CAJA',
      } as any));
      const detalles = detallesDeGrupos(this.grupos);
      for (const d of detalles) {
        await firstValueFrom(this.repo.createConteoDetalle({ ...d, conteo: { id: conteo.id } } as any));
      }
      await firstValueFrom(this.repo.createCaja({
        dispositivo: { id: this.terminalId },
        estado: 'ABIERTO',
        fechaApertura: new Date(),
        conteoApertura: { id: conteo.id },
        activo: true,
      } as any));
      this.snack.open('Caja abierta', 'OK', { duration: 2500 });
      await this.router.navigateByUrl('/financiero/cajas');
    } catch (e: any) {
      const msg = (e?.message || 'No se pudo abrir la caja').replace(/^Error:\s*/, '');
      this.snack.open(msg, 'CERRAR', { duration: 5000 });
      this.saving = false;
    }
  }

  volver(): void {
    this.location.back();
  }
}
