import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, FaceRecognitionService, FaceCaptureComponent, FaceCapture } from '@frc/shared-core';

interface FichajeResultado {
  ok: boolean;
  clase: 'ok' | 'tardanza' | 'error';
  titulo: string;
  detalle: string;
}

/** Umbrales de liveness pasivo (antispoof + liveness de Human). */
const LIVENESS_MIN = 0.5;
const QUEUE_KEY = 'frc_fichaje_pendientes';

/**
 * Pantalla de fichaje facial (kiosco). Corre en el tablet de la entrada.
 * Detecta on-device, envía el embedding al backend que identifica al funcionario
 * y marca entrada/salida. Cola offline básica en localStorage.
 */
@Component({
  selector: 'app-fichaje-facial',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, FaceCaptureComponent,
  ],
  templateUrl: './fichaje-facial.page.html',
  styleUrls: ['./fichaje-facial.page.scss'],
})
export class FichajeFacialPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly location = inject(Location);

  procesando = false;
  resultado: FichajeResultado | null = null;
  pendientes = 0;
  private limpiarTimer: any = null;

  ngOnInit(): void {
    this.actualizarPendientes();
    window.addEventListener('online', () => this.flushCola());
    this.flushCola();
  }

  async onCaptured(cap: FaceCapture): Promise<void> {
    if (this.procesando) return;
    this.procesando = true;
    this.resultado = null;
    const livenessOk = cap.real >= LIVENESS_MIN && cap.live >= LIVENESS_MIN;
    const payload = {
      embedding: cap.embedding,
      dimension: FaceRecognitionService.DIMENSION,
      modelo: FaceRecognitionService.MODEL_NAME,
      livenessOk,
      real: cap.real,
      live: cap.live,
    };
    try {
      const res: any = await firstValueFrom(this.repo.ficharFacial(payload));
      this.mostrarResultado(res);
    } catch (e: any) {
      // Sin conexión → encolar para reintentar
      if (!navigator.onLine) {
        this.encolar(payload);
        this.resultado = { ok: false, clase: 'error', titulo: 'Sin conexión', detalle: 'Fichaje guardado, se enviará al reconectar.' };
      } else {
        this.resultado = { ok: false, clase: 'error', titulo: 'Error', detalle: e?.message || 'No se pudo fichar.' };
      }
    } finally {
      this.procesando = false;
      this.autoLimpiar();
    }
  }

  private mostrarResultado(res: any): void {
    if (!res?.matched) {
      const motivos: Record<string, string> = {
        LIVENESS: 'No se pudo verificar prueba de vida. Mirá a la cámara.',
        NO_MATCH: 'No se reconoció el rostro. Intentá de nuevo.',
        BAJO_MARGEN: 'Coincidencia ambigua. Intentá de nuevo.',
        SIN_ROSTROS: 'No hay rostros registrados.',
      };
      this.resultado = { ok: false, clase: 'error', titulo: 'No reconocido', detalle: motivos[res?.reason] || 'Intentá de nuevo.' };
      return;
    }
    const nombre = res.funcionario?.nombre || 'Funcionario';
    if (res.tipo === 'ENTRADA') {
      const tarde = res.estado === 'TARDANZA';
      this.resultado = {
        ok: true, clase: tarde ? 'tardanza' : 'ok',
        titulo: `¡Hola ${nombre}!`,
        detalle: `Entrada ${res.horaEntrada}${tarde ? ' · Llegaste tarde' : ''}`,
      };
    } else if (res.tipo === 'SALIDA') {
      this.resultado = { ok: true, clase: 'ok', titulo: `¡Hasta luego ${nombre}!`, detalle: `Salida ${res.horaSalida}` };
    } else {
      this.resultado = { ok: true, clase: 'ok', titulo: nombre, detalle: `Ya fichaste hoy (${res.horaEntrada} - ${res.horaSalida})` };
    }
  }

  private autoLimpiar(): void {
    if (this.limpiarTimer) clearTimeout(this.limpiarTimer);
    this.limpiarTimer = setTimeout(() => (this.resultado = null), 6000);
  }

  // ---- Cola offline ----
  private encolar(payload: any): void {
    const cola = this.leerCola();
    cola.push({ ...payload, ts: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(cola));
    this.actualizarPendientes();
  }

  private leerCola(): any[] {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
  }

  async flushCola(): Promise<void> {
    if (!navigator.onLine) return;
    const cola = this.leerCola();
    if (!cola.length) return;
    const restantes: any[] = [];
    for (const item of cola) {
      try {
        await firstValueFrom(this.repo.ficharFacial(item));
      } catch {
        restantes.push(item);
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(restantes));
    this.actualizarPendientes();
  }

  private actualizarPendientes(): void {
    this.pendientes = this.leerCola().length;
  }

  volver(): void {
    this.location.back();
  }
}
