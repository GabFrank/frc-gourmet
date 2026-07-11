import { Injectable } from '@angular/core';

/**
 * Resultado de una detección facial lista para enrollment o fichaje.
 */
export interface FaceCapture {
  /** Descriptor facial (embedding). Longitud = DIMENSION. */
  embedding: number[];
  /** Confianza de la detección del rostro (0..1). */
  score: number;
  /** Anti-spoofing: probabilidad de rostro "real" (no foto/pantalla) 0..1. */
  real: number;
  /** Liveness: probabilidad de prueba de vida 0..1. */
  live: number;
  /** Bounding box [x, y, w, h] en px del frame de entrada. */
  box: [number, number, number, number];
}

/**
 * Reconocimiento facial on-device con @vladmandic/human.
 *
 * Solo produce embeddings + señales de liveness a partir de un `<video>`,
 * `<canvas>` o `<img>`. El matching 1:N contra los rostros registrados se hace
 * en el backend (JS plano), nunca acá. Compartido por el desktop (tab Rostros)
 * y la PWA (enrollment + fichaje) vía `@frc/shared-core`.
 *
 * Human se importa dinámicamente (lazy chunk) para no inflar el bundle inicial.
 * Los modelos se sirven localmente desde `assets/models/human/`
 * (ver `npm run models:face`).
 */
@Injectable({ providedIn: 'root' })
export class FaceRecognitionService {
  /** Modelo/versión del embedding. Se guarda en FuncionarioRostro.modelo. */
  static readonly MODEL_NAME = 'HUMAN-FACERES-1024';
  static readonly DIMENSION = 1024;

  private human: any = null;
  private loadingPromise: Promise<void> | null = null;
  private modelBasePath = 'assets/models/human';

  /** Permite override del path de modelos (por si cambia el base-href). */
  setModelBasePath(path: string): void {
    this.modelBasePath = path;
  }

  get isReady(): boolean {
    return !!this.human;
  }

  /**
   * Carga Human + modelos (idempotente). Devuelve cuando está listo para detectar.
   * Lanza si los modelos no están disponibles (no se corrió `npm run models:face`).
   */
  async load(): Promise<void> {
    if (this.human) return;
    if (this.loadingPromise) return this.loadingPromise;
    this.loadingPromise = this.doLoad();
    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async doLoad(): Promise<void> {
    const mod: any = await import('@vladmandic/human');
    const Human = mod.Human || mod.default?.Human || mod.default;
    const config = {
      modelBasePath: this.modelBasePath,
      backend: 'webgl',
      async: true,
      warmup: 'none',
      cacheSensitivity: 0,
      filter: { enabled: true, equalization: false },
      face: {
        enabled: true,
        detector: { rotation: false, maxDetected: 1, minConfidence: 0.4, return: false },
        mesh: { enabled: true },
        iris: { enabled: false },
        description: { enabled: true }, // faceres → embedding
        emotion: { enabled: false },
        antispoof: { enabled: true },
        liveness: { enabled: true },
      },
      body: { enabled: false },
      hand: { enabled: false },
      object: { enabled: false },
      gesture: { enabled: false },
    };
    this.human = new Human(config);
    await this.human.load();
    await this.human.warmup();
  }

  /**
   * Detecta el rostro principal en el input y devuelve su captura, o null si
   * no hay una cara clara.
   */
  async detect(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<FaceCapture | null> {
    if (!this.human) await this.load();
    const result = await this.human.detect(input);
    const faces = result?.face || [];
    if (!faces.length) return null;
    const face = faces[0];
    const embedding: number[] | undefined = face.embedding;
    if (!embedding || !embedding.length) return null;
    const box = (face.box || [0, 0, 0, 0]) as [number, number, number, number];
    return {
      embedding: Array.from(embedding),
      score: typeof face.faceScore === 'number' ? face.faceScore : (face.score || 0),
      real: typeof face.real === 'number' ? face.real : 1,
      live: typeof face.live === 'number' ? face.live : 1,
      box,
    };
  }

  /** Libera recursos de Human (opcional; útil al cerrar la pantalla). */
  dispose(): void {
    // Human no expone un destroy completo; soltamos la referencia para GC.
    this.human = null;
  }
}
