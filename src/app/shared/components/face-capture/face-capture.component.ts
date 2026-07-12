import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
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
export class FaceCaptureComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Cámara a usar: 'user' (frontal, enrollment) o 'environment'. */
  @Input() facingMode: 'user' | 'environment' = 'user';
  /** Texto del botón de captura. */
  @Input() captureLabel = 'Capturar';
  /** Si true, muestra el botón de captura manual (enrollment). */
  @Input() showCaptureButton = true;
  /** Base URL de los modelos. Desktop pasa una URL absoluta al server local. */
  @Input() modelBasePath?: string;

  @Output() captured = new EventEmitter<FaceCapture>();
  @Output() cameraError = new EventEmitter<string>();

  @ViewChild('video') videoRef?: ElementRef<HTMLVideoElement>;

  status: 'init' | 'loading-models' | 'ready' | 'detecting' | 'error' = 'init';
  message = '';
  secureContextOk = true;

  private stream: MediaStream | null = null;

  constructor(private faceService: FaceRecognitionService) {}

  async ngOnInit(): Promise<void> {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      this.secureContextOk = false;
      this.status = 'error';
      this.message = 'La cámara requiere una conexión segura (HTTPS).';
      return;
    }
    if (this.modelBasePath) this.faceService.setModelBasePath(this.modelBasePath);
    await this.loadModels();
  }

  ngAfterViewInit(): void {
    // La cámara arranca acá, cuando el <video> ya existe en el DOM (evita el
    // deadlock de asignar el stream a una referencia todavía nula).
    if (this.secureContextOk) this.startCamera();
  }

  ngOnDestroy(): void {
    this.stopCamera();
  }

  private async startCamera(): Promise<void> {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const el = this.videoRef?.nativeElement;
      if (el) {
        el.srcObject = this.stream;
        try { await el.play(); } catch { /* autoplay ya lo maneja */ }
      }
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
      this.message = 'No se pudieron cargar los modelos faciales. Descargalos en Configuración → Reconocimiento facial. ' + (e?.message || '');
      this.cameraError.emit(this.message);
    }
  }

  /** Captura un frame, detecta el rostro y emite la captura. */
  async capture(): Promise<void> {
    const el = this.videoRef?.nativeElement;
    if (this.status !== 'ready' || !el) return;
    this.status = 'detecting';
    this.message = 'Detectando rostro…';
    try {
      const result = await this.faceService.detect(el);
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
