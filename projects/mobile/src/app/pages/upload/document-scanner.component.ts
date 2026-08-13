import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface Point {
  x: number;
  y: number;
}

/**
 * Escáner de documentos estilo Google Drive: cámara en vivo → captura → ajuste
 * manual de las 4 esquinas → corrección de perspectiva + realce → JPEG.
 *
 * Implementado en canvas puro (homografía + muestreo bilineal), sin OpenCV, para
 * compilar limpio y funcionar offline. Devuelve un data-URL JPEG al cerrar, o
 * `null` si se cancela o la cámara no está disponible (contexto no seguro / HTTP).
 *
 * Requiere contexto seguro (HTTPS) para `getUserMedia`. Sobre LAN HTTP la cámara
 * en vivo no está disponible → devuelve null y la página cae a "tomar foto".
 */
@Component({
  selector: 'app-document-scanner',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './document-scanner.component.html',
  styleUrls: ['./document-scanner.component.scss'],
})
export class DocumentScannerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('preview') previewRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('stage') stageRef!: ElementRef<HTMLDivElement>;

  private readonly dialogRef = inject(MatDialogRef<DocumentScannerComponent, string | null>);
  private readonly zone = inject(NgZone);

  state: 'camera' | 'adjust' | 'processing' = 'camera';
  camaraOk = false;
  mensaje = '';
  enhance = true;

  // Esquinas en coordenadas del canvas de preview (px).
  corners: Point[] = [];
  activeCorner = -1;
  previewW = 0;
  previewH = 0;

  // Frame capturado a resolución completa.
  private frame: HTMLCanvasElement | null = null;
  private displayScale = 1; // previewPx / framePx

  private stream: MediaStream | null = null;
  private cerrado = false;

  async ngAfterViewInit(): Promise<void> {
    await this.startCamera();
  }

  private async startCamera(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) {
      this.mensaje = !window.isSecureContext
        ? 'El escáner en vivo requiere una conexión segura (HTTPS). Usá "Tomar foto".'
        : 'Tu navegador no soporta la cámara.';
      this.camaraOk = false;
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.camaraOk = true;
    } catch {
      this.mensaje = 'No se pudo acceder a la cámara. Revisá los permisos o usá "Tomar foto".';
      this.camaraOk = false;
      this.stopCamera();
    }
  }

  private stopCamera(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  /** Congela el frame actual y pasa al modo de ajuste de esquinas. */
  capture(): void {
    const video = this.videoRef?.nativeElement;
    if (!video || video.readyState < 2) return;
    const fw = video.videoWidth;
    const fh = video.videoHeight;
    if (!fw || !fh) return;

    const frame = document.createElement('canvas');
    frame.width = fw;
    frame.height = fh;
    frame.getContext('2d')!.drawImage(video, 0, 0, fw, fh);
    this.frame = frame;
    this.stopCamera();

    // Cambiar de estado PRIMERO: el bloque de ajuste (con #stage/#preview) está
    // detrás de *ngIf y no existe en el DOM mientras state === 'camera'. Dibujar
    // el preview recién cuando Angular lo renderizó (siguiente ciclo).
    this.state = 'adjust';
    setTimeout(() => this.renderPreview(), 0);
  }

  /** Dibuja el frame capturado en el canvas de preview e inicializa las esquinas. */
  private renderPreview(attempt = 0): void {
    const frame = this.frame;
    // El *ngIf pudo no haber renderizado aún el canvas → reintentar unas veces.
    if (!frame || !this.stageRef?.nativeElement || !this.previewRef?.nativeElement) {
      if (attempt < 10) setTimeout(() => this.renderPreview(attempt + 1), 30);
      return;
    }
    const stageW = this.stageRef.nativeElement.clientWidth || Math.min(window.innerWidth, 480);
    const scale = Math.min(1, stageW / frame.width);
    const pw = Math.round(frame.width * scale);
    const ph = Math.round(frame.height * scale);
    this.displayScale = scale;

    const preview = this.previewRef.nativeElement;
    preview.width = pw;
    preview.height = ph;
    preview.getContext('2d')!.drawImage(frame, 0, 0, pw, ph);
    this.previewW = pw;
    this.previewH = ph;

    // Esquinas iniciales con un margen del 8% (el usuario ajusta).
    const mx = pw * 0.08;
    const my = ph * 0.08;
    this.corners = [
      { x: mx, y: my },
      { x: pw - mx, y: my },
      { x: pw - mx, y: ph - my },
      { x: mx, y: ph - my },
    ];
  }

  retake(): void {
    this.frame = null;
    this.corners = [];
    this.state = 'camera';
    // El <video> vuelve a montarse con el *ngIf; arrancar la cámara tras el render.
    setTimeout(() => this.startCamera(), 0);
  }

  toggleEnhance(): void {
    this.enhance = !this.enhance;
  }

  // --- Arrastre de esquinas (pointer events) ---
  onPointerDown(index: number, ev: PointerEvent): void {
    ev.preventDefault();
    this.activeCorner = index;
    (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent): void {
    if (this.activeCorner < 0) return;
    const canvas = this.previewRef.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(canvas.width, ev.clientX - rect.left));
    const y = Math.max(0, Math.min(canvas.height, ev.clientY - rect.top));
    this.corners[this.activeCorner] = { x, y };
  }

  onPointerUp(): void {
    this.activeCorner = -1;
  }

  cancelar(): void {
    this.cerrado = true;
    this.stopCamera();
    this.dialogRef.close(null);
  }

  /** Corrige la perspectiva usando las 4 esquinas y devuelve un JPEG. */
  confirmar(): void {
    if (!this.frame || this.corners.length !== 4) return;
    this.state = 'processing';
    // Correr fuera de Angular; es CPU-bound.
    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        try {
          const dataUrl = this.warpAndEnhance();
          this.zone.run(() => {
            this.cerrado = true;
            this.dialogRef.close(dataUrl);
          });
        } catch (e) {
          this.zone.run(() => {
            this.mensaje = 'No se pudo procesar la imagen.';
            this.state = 'adjust';
          });
        }
      }, 0);
    });
  }

  private warpAndEnhance(): string {
    const frame = this.frame!;
    const inv = 1 / this.displayScale;
    // Esquinas en resolución completa, orden [tl, tr, br, bl].
    const src = this.corners.map((c) => ({ x: c.x * inv, y: c.y * inv }));

    const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const wTop = dist(src[0], src[1]);
    const wBot = dist(src[3], src[2]);
    const hLeft = dist(src[0], src[3]);
    const hRight = dist(src[1], src[2]);
    let outW = Math.round(Math.max(wTop, wBot));
    let outH = Math.round(Math.max(hLeft, hRight));
    // Acotar el lado mayor para limitar el costo del remapeo.
    const MAX = 1500;
    const longest = Math.max(outW, outH);
    if (longest > MAX) {
      const k = MAX / longest;
      outW = Math.round(outW * k);
      outH = Math.round(outH * k);
    }
    outW = Math.max(1, outW);
    outH = Math.max(1, outH);

    // Homografía que mapea el rectángulo destino → el cuadrilátero fuente.
    const dst: Point[] = [
      { x: 0, y: 0 },
      { x: outW, y: 0 },
      { x: outW, y: outH },
      { x: 0, y: outH },
    ];
    const H = computeHomography(dst, src);

    const srcCtx = frame.getContext('2d')!;
    const srcData = srcCtx.getImageData(0, 0, frame.width, frame.height);
    const sd = srcData.data;
    const sw = frame.width;
    const sh = frame.height;

    const out = document.createElement('canvas');
    out.width = outW;
    out.height = outH;
    const outCtx = out.getContext('2d')!;
    const outImg = outCtx.createImageData(outW, outH);
    const od = outImg.data;

    for (let y = 0; y < outH; y++) {
      for (let x = 0; x < outW; x++) {
        const denom = H[6] * x + H[7] * y + 1;
        const sxf = (H[0] * x + H[1] * y + H[2]) / denom;
        const syf = (H[3] * x + H[4] * y + H[5]) / denom;
        const oi = (y * outW + x) * 4;
        // Muestreo bilineal con clamp de bordes.
        if (sxf < 0 || syf < 0 || sxf > sw - 1 || syf > sh - 1) {
          od[oi] = od[oi + 1] = od[oi + 2] = 255;
          od[oi + 3] = 255;
          continue;
        }
        const x0 = Math.floor(sxf);
        const y0 = Math.floor(syf);
        const x1 = Math.min(sw - 1, x0 + 1);
        const y1 = Math.min(sh - 1, y0 + 1);
        const fx = sxf - x0;
        const fy = syf - y0;
        const i00 = (y0 * sw + x0) * 4;
        const i10 = (y0 * sw + x1) * 4;
        const i01 = (y1 * sw + x0) * 4;
        const i11 = (y1 * sw + x1) * 4;
        for (let c = 0; c < 3; c++) {
          const top = sd[i00 + c] * (1 - fx) + sd[i10 + c] * fx;
          const bot = sd[i01 + c] * (1 - fx) + sd[i11 + c] * fx;
          od[oi + c] = top * (1 - fy) + bot * fy;
        }
        od[oi + 3] = 255;
      }
    }

    if (this.enhance) {
      applyDocumentEnhance(od);
    }

    outCtx.putImageData(outImg, 0, 0);
    return out.toDataURL('image/jpeg', 0.9);
  }

  ngOnDestroy(): void {
    this.cerrado = true;
    this.stopCamera();
  }
}

/**
 * Homografía (DLT) que mapea 4 puntos `from` → 4 puntos `to`. Devuelve un array
 * plano [a,b,c,d,e,f,g,h] tal que:
 *   toX = (a*x + b*y + c) / (g*x + h*y + 1)
 *   toY = (d*x + e*y + f) / (g*x + h*y + 1)
 */
function computeHomography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }
  const h = solveLinear(A, b); // 8 incógnitas
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];
}

/** Resuelve A·x = b (n×n) por eliminación gaussiana con pivoteo parcial. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    [M[col], M[piv]] = [M[piv], M[col]];
    const pivVal = M[col][col] || 1e-9;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col] / pivVal;
      for (let c = col; c <= n; c++) M[r][c] -= factor * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = 0; i < n; i++) x[i] = M[i][n] / (M[i][i] || 1e-9);
  return x;
}

/**
 * Realce "documento": escala de grises + estiramiento de contraste + un leve
 * aclarado del fondo. Da el look de escaneado sin perder legibilidad.
 */
function applyDocumentEnhance(data: Uint8ClampedArray): void {
  // Estadísticas rápidas para normalizar contraste.
  let min = 255;
  let max = 0;
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    const g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    if (g < min) min = g;
    if (g > max) max = g;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < n; i += 4) {
    let g = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    // Normalizar al rango completo y subir un poco los medios/altos (fondo).
    g = ((g - min) / range) * 255;
    g = Math.min(255, g * 1.08 + 8);
    data[i] = data[i + 1] = data[i + 2] = g;
  }
}
