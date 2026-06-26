import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

/**
 * Escáner de códigos de barra / QR con la cámara, usando la API nativa
 * `BarcodeDetector` (disponible en Chromium/Android). Si no está soportada o la
 * cámara falla, cae a una entrada manual del código. Devuelve el código leído
 * (string) al cerrar, o undefined si se cancela.
 */
@Component({
  selector: 'app-barcode-scanner-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  template: `
    <div class="scan-wrap">
      <video #video class="scan-video" [class.hidden]="!camaraOk" playsinline muted autoplay></video>

      <div class="scan-overlay" *ngIf="camaraOk">
        <div class="scan-frame"></div>
        <p class="scan-hint">Apuntá al código de barras</p>
      </div>

      <div class="scan-fallback" *ngIf="!camaraOk">
        <mat-icon class="scan-fallback-icon">photo_camera</mat-icon>
        <p>{{ mensaje || 'No se pudo abrir la cámara.' }}</p>
        <mat-form-field appearance="outline" class="scan-field">
          <mat-label>Ingresar código</mat-label>
          <input
            matInput
            [(ngModel)]="codigoManual"
            (keyup.enter)="confirmarManual()"
            placeholder="CÓDIGO"
            inputmode="numeric"
            autofocus
          />
        </mat-form-field>
        <button mat-flat-button color="primary" [disabled]="!codigoManual.trim()" (click)="confirmarManual()">
          Buscar
        </button>
      </div>

      <button mat-icon-button class="scan-close" (click)="cancelar()" aria-label="Cerrar">
        <mat-icon>close</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      .scan-wrap {
        position: relative;
        width: 100%;
        height: 100%;
        min-height: 60vh;
        background: #000;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .scan-video {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      .scan-video.hidden { display: none; }
      .scan-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
      }
      .scan-frame {
        width: 78%;
        max-width: 320px;
        height: 160px;
        border: 3px solid rgba(255, 255, 255, 0.9);
        border-radius: 12px;
        box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.35);
      }
      .scan-hint {
        margin-top: 16px;
        color: #fff;
        font-weight: 600;
        text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
      }
      .scan-fallback {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 24px;
        color: var(--text-primary, #fff);
        text-align: center;
      }
      .scan-fallback { background: var(--surface, #fff); width: 100%; height: 100%; justify-content: center; }
      .scan-fallback-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--text-secondary, rgba(0, 0, 0, 0.4));
      }
      .scan-field { width: 100%; max-width: 320px; }
      .scan-close {
        position: absolute;
        top: 8px;
        right: 8px;
        color: #fff;
        background: rgba(0, 0, 0, 0.4);
      }
      .scan-fallback ~ .scan-close { color: var(--text-primary, #000); background: transparent; }
    `,
  ],
})
export class BarcodeScannerDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('video') videoRef!: ElementRef<HTMLVideoElement>;
  private readonly dialogRef = inject(MatDialogRef<BarcodeScannerDialogComponent>);
  private readonly zone = inject(NgZone);

  camaraOk = false;
  mensaje = '';
  codigoManual = '';

  private stream: MediaStream | null = null;
  private detector: any = null;
  private rafId: any = null;
  private cerrado = false;

  async ngAfterViewInit(): Promise<void> {
    const BD = (window as any).BarcodeDetector;
    if (!BD || !navigator.mediaDevices?.getUserMedia) {
      this.mensaje = 'Tu navegador no soporta el escaneo por cámara. Ingresá el código manualmente.';
      return;
    }
    try {
      this.detector = new BD({
        formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'itf'],
      });
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      const video = this.videoRef.nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.camaraOk = true;
      this.scanLoop();
    } catch (e) {
      this.mensaje = 'No se pudo acceder a la cámara. Revisá los permisos o ingresá el código manualmente.';
      this.camaraOk = false;
      this.detener();
    }
  }

  private scanLoop(): void {
    // Fuera de Angular para no disparar change-detection en cada frame.
    this.zone.runOutsideAngular(() => {
      const tick = async () => {
        if (this.cerrado || !this.detector) return;
        const video = this.videoRef?.nativeElement;
        if (video && video.readyState >= 2) {
          try {
            const codes = await this.detector.detect(video);
            const value = codes?.[0]?.rawValue;
            if (value) {
              this.zone.run(() => this.emitir(String(value)));
              return;
            }
          } catch {
            /* frame sin lectura */
          }
        }
        this.rafId = requestAnimationFrame(tick);
      };
      this.rafId = requestAnimationFrame(tick);
    });
  }

  private emitir(codigo: string): void {
    if (this.cerrado) return;
    this.cerrado = true;
    this.detener();
    this.dialogRef.close(codigo);
  }

  confirmarManual(): void {
    const c = this.codigoManual.trim();
    if (c) this.emitir(c);
  }

  cancelar(): void {
    this.cerrado = true;
    this.detener();
    this.dialogRef.close();
  }

  private detener(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }

  ngOnDestroy(): void {
    this.cerrado = true;
    this.detener();
  }
}
