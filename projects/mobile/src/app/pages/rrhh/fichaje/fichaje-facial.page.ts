import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService, FaceRecognitionService, FaceCaptureComponent, FaceCapture } from '@frc/shared-core';

interface FichajeResultado {
  clase: 'ok' | 'tardanza' | 'error';
  titulo: string;
  detalle: string;
}

type Modo = 'ENTRADA' | 'SALIDA';

/** Umbrales de liveness pasivo (antispoof + liveness de Human). */
const LIVENESS_MIN = 0.5;
const QUEUE_KEY = 'frc_fichaje_pendientes';

/**
 * Kiosco de fichaje facial. El tablet queda abierto en esta pantalla. El
 * funcionario elige ENTRADA (verde) o SALIDA (rojo), la cámara se abre, reconoce
 * el rostro y marca. Vuelve solo al estado inicial. Cola offline en localStorage.
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

  modo: Modo | null = null;
  procesando = false;
  resultado: FichajeResultado | null = null;
  pendientes = 0;
  private limpiarTimer: any = null;

  ngOnInit(): void {
    this.actualizarPendientes();
    window.addEventListener('online', () => this.flushCola());
    this.flushCola();
  }

  iniciar(modo: Modo): void {
    this.resultado = null;
    this.modo = modo;
  }

  cancelar(): void {
    this.modo = null;
    this.resultado = null;
  }

  get captureLabel(): string {
    return this.modo === 'ENTRADA' ? 'Marcar entrada' : 'Marcar salida';
  }

  async onCaptured(cap: FaceCapture): Promise<void> {
    if (this.procesando || !this.modo) return;
    this.procesando = true;
    const livenessOk = cap.real >= LIVENESS_MIN && cap.live >= LIVENESS_MIN;
    const payload = {
      tipo: this.modo,
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
      if (!navigator.onLine) {
        this.encolar(payload);
        this.resultado = { clase: 'error', titulo: 'Sin conexión', detalle: 'Fichaje guardado, se enviará al reconectar.' };
      } else {
        this.resultado = { clase: 'error', titulo: 'Error', detalle: e?.message || 'No se pudo fichar.' };
      }
    } finally {
      this.procesando = false;
      this.volverAInicioLuego();
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
      this.resultado = { clase: 'error', titulo: 'No reconocido', detalle: motivos[res?.reason] || 'Intentá de nuevo.' };
      return;
    }
    const nombre = res.funcionario?.nombre || 'Funcionario';
    if (res.sinEntrada) {
      this.resultado = { clase: 'error', titulo: nombre, detalle: 'No tenés una entrada abierta hoy.' };
      return;
    }
    if (res.tipo === 'YA_COMPLETO') {
      this.resultado = { clase: 'error', titulo: nombre, detalle: `Ya fichaste hoy (${res.horaEntrada} - ${res.horaSalida}).` };
      return;
    }
    if (res.yaRegistrado && res.tipo === 'ENTRADA') {
      this.resultado = { clase: 'error', titulo: nombre, detalle: `Ya marcaste entrada hoy (${res.horaEntrada}).` };
      return;
    }
    if (res.tipo === 'ENTRADA') {
      const tarde = res.estado === 'TARDANZA';
      this.resultado = {
        clase: tarde ? 'tardanza' : 'ok',
        titulo: `¡Hola ${nombre}!`,
        detalle: `Entrada ${res.horaEntrada}${tarde ? ' · Llegaste tarde' : ''}`,
      };
    } else {
      this.resultado = { clase: 'ok', titulo: `¡Hasta luego ${nombre}!`, detalle: `Salida ${res.horaSalida}` };
    }
  }

  private volverAInicioLuego(): void {
    if (this.limpiarTimer) clearTimeout(this.limpiarTimer);
    this.limpiarTimer = setTimeout(() => {
      this.modo = null;
      this.resultado = null;
    }, 5000);
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
