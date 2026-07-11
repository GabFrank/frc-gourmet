import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { FaceCapture, FaceRecognitionService } from 'src/app/services/face-recognition.service';

/**
 * Cámara + detección facial reutilizable (desktop + PWA). Abre la cámara,
 * carga @vladmandic/human on-device y, al capturar, emite el embedding + señales
 * de liveness del rostro detectado. NO hace matching ni persiste nada.
 *
 * Requiere contexto seguro (HTTPS) para getUserMedia.
 */
@Component({
  selector: 'app-face-capture',
  templateUrl: './face-capture.component.html',
  styleUrls: ['./face-capture.component.scss'],
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
})
export class FaceCaptureComponent implements OnInit, OnDestroy {
  /** Cámara a usar: 'user' (frontal, enrollment) o 'environment'. */
  @Input() facingMode: 'user' | 'environment' = 'user';
  /** Texto del botón de captura. */
  @Input() captureLabel = 'Capturar';
  /** Si true, muestra el botón de captura manual (enrollment). */
  @Input() showCaptureButton = true;

  @Output() captured = new EventEmitter<FaceCapture>();
  @Output() cameraError = new EventEmitter<string>();

  status: 'init' | 'loading-models' | 'ready' | 'detecting' | 'error' = 'init';
  message = '';
  secureContextOk = true;

  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;

  constructor(private faceService: FaceRecognitionService) {}

  async ngOnInit(): Promise<void> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.secureContextOk = false;
      this.status = 'error';
      this.message = 'La cámara requiere una conexión segura (HTTPS).';
      return;
    }
    await this.startCamera();
    await this.loadModels();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  /** Registra el elemento <video> del template. */
  registerVideo(el: HTMLVideoElement): void {
    this.videoEl = el;
    if (this.stream && el && !el.srcObject) {
      el.srcObject = this.stream;
    }
  }

  private async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (this.videoEl) this.videoEl.srcObject = this.stream;
    } catch (e: any) {
      this.status = 'error';
      this.message = 'No se pudo acceder a la cámara: ' + (e?.message || e);
      this.cameraError.emit(this.message);
    }
  }

  private async loadModels(): Promise<void> {
    if (this.status === 'error') return;
    this.status = 'loading-models';
    this.message = 'Cargando modelos de reconocimiento…';
    try {
      await this.faceService.load();
      this.status = 'ready';
      this.message = '';
    } catch (e: any) {
      this.status = 'error';
      this.message = 'No se pudieron cargar los modelos faciales. Ejecutá "npm run models:face". ' + (e?.message || '');
      this.cameraError.emit(this.message);
    }
  }

  /** Captura un frame, detecta el rostro y emite la captura. */
  async capture(): Promise<void> {
    if (this.status !== 'ready' || !this.videoEl) return;
    this.status = 'detecting';
    this.message = 'Detectando rostro…';
    try {
      const result = await this.faceService.detect(this.videoEl);
      if (!result) {
        this.status = 'ready';
        this.message = 'No se detectó un rostro claro. Acercate y mirá a la cámara.';
        return;
      }
      this.status = 'ready';
      this.message = '';
      this.captured.emit(result);
    } catch (e: any) {
      this.status = 'ready';
      this.message = 'Error al detectar: ' + (e?.message || e);
    }
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}
