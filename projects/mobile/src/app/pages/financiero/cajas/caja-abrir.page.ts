import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, mensajeDeErrorCaja } from '@frc/shared-core';
import { ConteoFormComponent, ConteoGrupo } from './conteo-form.component';
import { buildGruposConteo, detallesDeGrupos, detallesResumidoDeGrupos } from './caja-conteo.util';

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
    MatProgressBarModule, MatSlideToggleModule, MatSnackBarModule, ConteoFormComponent,
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
  // Conteo completo (por denominación) por defecto; resumido = total por moneda.
  resumido = false;

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
      // M6: revalidar ANTES de crear el `Conteo`. La lista de terminales libres
      // se armó en `ngOnInit` y es un snapshot: entre que se pintó y que el
      // encargado toca ABRIR pueden haber pasado minutos y otra terminal (o el
      // desktop) ya abrió la caja de esta. Sin esto el rechazo llegaba recién en
      // `createCaja` y el `Conteo` + sus detalles quedaban huérfanos en base.
      const ocupadaPor = await this.cajaAbiertaDeTerminal(this.terminalId);
      if (ocupadaPor) {
        // El nombre de la terminal va en el mensaje porque la apertura deja
        // ELEGIRLA: puede no ser la que el encargado tiene en la mano.
        const terminal = this.terminales.find((t) => t.id === this.terminalId)?.nombre || 'Esta terminal';
        this.snack.open(
          `${terminal} ya tiene una caja abierta (caja #${ocupadaPor}). Cerrá esa caja antes de abrir otra.`,
          'CERRAR', { duration: 7000 },
        );
        this.saving = false;
        return;
      }

      const conteo: any = await firstValueFrom(this.repo.createConteo({
        activo: true,
        tipo: 'APERTURA',
        fecha: new Date(),
        observaciones: 'CONTEO INICIAL DE APERTURA DE CAJA',
      } as any));
      const detalles = this.resumido ? detallesResumidoDeGrupos(this.grupos) : detallesDeGrupos(this.grupos);
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
      // `CAJA_ABIERTA_DUPLICADA` es el rechazo esperable acá (esta terminal ya
      // tiene su caja del turno abierta) y quedó sin traducir en la Fase 2: sin
      // esto la PWA mostraba el código crudo, o directamente el JSON del 500
      // que devuelve `/api/rpc`.
      this.snack.open(mensajeDeErrorCaja(e, 'No se pudo abrir la caja'), 'CERRAR', { duration: 6000 });
      this.saving = false;
    }
  }

  /**
   * Id de la caja `ABIERTO` de esta terminal, o `null` (M6).
   *
   * **Fail-open**: si la consulta falla se sigue con la apertura y decide el
   * índice único parcial del backend, que es el control primario. Lo que este
   * chequeo evita es el `Conteo` huérfano en el caso frecuente.
   */
  private async cajaAbiertaDeTerminal(terminalId: number | null): Promise<number | null> {
    const id = Number(terminalId) || 0;
    if (!id) return null;
    try {
      const abiertas = (await firstValueFrom(this.repo.getCajasAbiertas())) || [];
      const caja = (abiertas as any[]).find((c: any) => Number(c?.dispositivo?.id) === id);
      return caja?.id != null ? Number(caja.id) : null;
    } catch {
      return null;
    }
  }

  volver(): void {
    this.location.back();
  }
}
