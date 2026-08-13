import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
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
type Fase = 'inicio' | 'preparando' | 'contando' | 'procesando' | 'exito' | 'fallo';

const LIVENESS_MIN = 0.5;
const QUEUE_KEY = 'frc_fichaje_pendientes';
const COUNTDOWN_SEG = 5;

/**
 * Kiosco de fichaje facial. El tablet queda abierto. El funcionario elige ENTRADA
 * (verde) o SALIDA (rojo); la cámara se abre, da 5s para posicionarse y captura
 * automáticamente. Si falla, ofrece Reintentar / Tomar foto / Cancelar.
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
export class FichajeFacialPage implements OnInit, OnDestroy {
  private readonly repo = inject(RepositoryService);
  private readonly location = inject(Location);

  @ViewChild('captura') captura?: FaceCaptureComponent;

  modo: Modo | null = null;
  fase: Fase = 'inicio';
  countdown = 0;
  resultado: FichajeResultado | null = null;
  pendientes = 0;

  private countdownTimer: any = null;
  private resetTimer: any = null;
  private coords: { lat: number; lng: number } | null = null;

  ngOnInit(): void {
    this.actualizarPendientes();
    window.addEventListener('online', () => this.flushCola());
    this.flushCola();
    this.obtenerUbicacion();
  }

  private obtenerUbicacion(): void {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => { this.coords = { lat: p.coords.latitude, lng: p.coords.longitude }; },
      () => { /* permiso denegado / no disponible — el server decide según geocerca */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    );
  }

  ngOnDestroy(): void {
    this.limpiarTimers();
  }

  get overlayText(): string | undefined {
    return this.fase === 'contando' && this.countdown > 0 ? String(this.countdown) : undefined;
  }

  // --- Inicio ---
  iniciar(modo: Modo): void {
    this.limpiarTimers();
    this.resultado = null;
    this.modo = modo;
    this.fase = 'preparando';
    this.obtenerUbicacion(); // refrescar ubicación al iniciar
  }

  onCaptureReady(): void {
    // La cámara + modelos están listos → arrancar la cuenta regresiva.
    if (this.fase === 'preparando') this.iniciarCuenta();
  }

  private iniciarCuenta(): void {
    this.limpiarTimers();
    this.fase = 'contando';
    this.countdown = COUNTDOWN_SEG;
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        this.dispararCaptura();
      }
    }, 1000);
  }

  private dispararCaptura(): void {
    this.fase = 'procesando';
    this.captura?.capture();
  }

  // --- Resultado de captura ---
  async onCaptured(cap: FaceCapture): Promise<void> {
    if (!this.modo) return;
    this.fase = 'procesando';
    const livenessOk = cap.real >= LIVENESS_MIN && cap.live >= LIVENESS_MIN;
    const payload = {
      tipo: this.modo,
      embedding: cap.embedding,
      dimension: FaceRecognitionService.DIMENSION,
      modelo: FaceRecognitionService.MODEL_NAME,
      livenessOk, real: cap.real, live: cap.live,
      lat: this.coords?.lat, lng: this.coords?.lng,
    };
    try {
      const res: any = await firstValueFrom(this.repo.ficharFacial(payload));
      this.procesarResultado(res);
    } catch (e: any) {
      if (!navigator.onLine) {
        this.encolar(payload);
        this.exito({ clase: 'error', titulo: 'Sin conexión', detalle: 'Fichaje guardado, se enviará al reconectar.' });
      } else {
        this.fallo({ clase: 'error', titulo: 'Error', detalle: e?.message || 'No se pudo fichar.' });
      }
    }
  }

  onNoFace(): void {
    // La captura no encontró rostro → ofrecer reintentar / tomar foto / cancelar.
    if (this.fase === 'procesando' || this.fase === 'contando') {
      this.fallo({ clase: 'error', titulo: 'No se detectó rostro', detalle: 'Posicionate en el óvalo e intentá de nuevo.' });
    }
  }

  private procesarResultado(res: any): void {
    if (!res?.matched) {
      if (res?.reason === 'FUERA_UBICACION') {
        this.fallo({ clase: 'error', titulo: 'Fuera de la empresa', detalle: `Estás a ${res.distancia} m (máx ${res.radio} m). Acercate para fichar.` });
        return;
      }
      if (res?.reason === 'SIN_UBICACION') {
        this.fallo({ clase: 'error', titulo: 'Sin ubicación', detalle: 'Activá el GPS y el permiso de ubicación del navegador.' });
        return;
      }
      const motivos: Record<string, string> = {
        LIVENESS: 'No se pudo verificar prueba de vida. Mirá a la cámara.',
        NO_MATCH: 'No se reconoció el rostro. Intentá de nuevo.',
        BAJO_MARGEN: 'Coincidencia ambigua. Intentá de nuevo.',
        SIN_ROSTROS: 'No hay rostros registrados.',
      };
      this.fallo({ clase: 'error', titulo: 'No reconocido', detalle: motivos[res?.reason] || 'Intentá de nuevo.' });
      return;
    }
    const nombre = res.funcionario?.nombre || 'Funcionario';
    if (res.sinEntrada) {
      this.fallo({ clase: 'error', titulo: nombre, detalle: 'No tenés una entrada abierta hoy.' });
      return;
    }
    if (res.tipo === 'YA_COMPLETO') {
      this.fallo({ clase: 'error', titulo: nombre, detalle: `Ya fichaste hoy (${res.horaEntrada} - ${res.horaSalida}).` });
      return;
    }
    if (res.yaRegistrado && res.tipo === 'ENTRADA') {
      this.fallo({ clase: 'error', titulo: nombre, detalle: `Ya tenés una entrada abierta (${res.horaEntrada}).` });
      return;
    }
    if (res.tipo === 'ENTRADA') {
      const tarde = res.estado === 'TARDANZA';
      this.exito({
        clase: tarde ? 'tardanza' : 'ok',
        titulo: `¡Hola ${nombre}!`,
        detalle: `Entrada ${res.horaEntrada}${tarde ? ' · Llegaste tarde' : ''}`,
      });
    } else {
      this.exito({ clase: 'ok', titulo: `¡Hasta luego ${nombre}!`, detalle: `Salida ${res.horaSalida}` });
    }
  }

  private exito(r: FichajeResultado): void {
    this.resultado = r;
    this.fase = 'exito';
    this.resetTimer = setTimeout(() => this.volverAInicio(), 5000);
  }

  private fallo(r: FichajeResultado): void {
    this.resultado = r;
    this.fase = 'fallo';
  }

  // --- Botones de fallback ---
  reintentar(): void {
    this.resultado = null;
    this.iniciarCuenta();
  }

  tomarFoto(): void {
    this.resultado = null;
    this.dispararCaptura();
  }

  cancelar(): void {
    this.volverAInicio();
  }

  private volverAInicio(): void {
    this.limpiarTimers();
    this.modo = null;
    this.fase = 'inicio';
    this.resultado = null;
    this.countdown = 0;
  }

  private limpiarTimers(): void {
    if (this.countdownTimer) { clearInterval(this.countdownTimer); this.countdownTimer = null; }
    if (this.resetTimer) { clearTimeout(this.resetTimer); this.resetTimer = null; }
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
      try { await firstValueFrom(this.repo.ficharFacial(item)); } catch { restantes.push(item); }
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
