import * as fs from 'fs';
import * as path from 'path';

const THUMB_MAX = 96;
const MEDIUM_MAX = 400;
const THUMB_QUALITY = 0.8;
const MEDIUM_QUALITY = 0.85;

interface ResizeResult {
  thumbPath: string;
  mediumPath: string;
  thumbCreated: boolean;
  mediumCreated: boolean;
}

/**
 * Generates two derivatives next to the original image:
 * - <base>.thumb.jpg (max 96px on longest side, 80% quality)
 * - <base>.medium.jpg (max 400px on longest side, 85% quality)
 *
 * Skips re-encoding if the original is already smaller than the target on its
 * longest side (just copies the bytes — keeps quality, avoids JPG-of-JPG loss).
 *
 * Failures are caught and logged; never throws — the original save flow must not
 * be blocked by a thumbnail generation error.
 */
export async function generateImageDerivatives(absolutePath: string): Promise<ResizeResult> {
  const dir = path.dirname(absolutePath);
  const ext = path.extname(absolutePath);
  const base = path.basename(absolutePath, ext);
  const thumbPath = path.join(dir, `${base}.thumb.jpg`);
  const mediumPath = path.join(dir, `${base}.medium.jpg`);

  const result: ResizeResult = {
    thumbPath,
    mediumPath,
    thumbCreated: false,
    mediumCreated: false,
  };

  try {
    const napiCanvas = require('@napi-rs/canvas');
    const buf = fs.readFileSync(absolutePath);
    const img = await napiCanvas.loadImage(buf);
    const w = img.width;
    const h = img.height;
    const longest = Math.max(w, h);

    result.thumbCreated = await writeDerivative(napiCanvas, img, w, h, longest, THUMB_MAX, THUMB_QUALITY, thumbPath, absolutePath);
    result.mediumCreated = await writeDerivative(napiCanvas, img, w, h, longest, MEDIUM_MAX, MEDIUM_QUALITY, mediumPath, absolutePath);
  } catch (err) {
    console.warn('[image-resize] failed for', absolutePath, err);
  }

  return result;
}

async function writeDerivative(
  napiCanvas: any,
  img: any,
  w: number,
  h: number,
  longest: number,
  maxSide: number,
  quality: number,
  outPath: string,
  originalPath: string,
): Promise<boolean> {
  try {
    if (longest <= maxSide) {
      // Original ya entra en el tamaño objetivo — copiar directo (sin re-encode).
      fs.copyFileSync(originalPath, outPath);
      return true;
    }
    const ratio = maxSide / longest;
    const tw = Math.max(1, Math.round(w * ratio));
    const th = Math.max(1, Math.round(h * ratio));
    const canvas = napiCanvas.createCanvas(tw, th);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, tw, th);
    const out = await canvas.encode('jpeg', Math.round(quality * 100));
    fs.writeFileSync(outPath, out);
    return true;
  } catch (err) {
    console.warn('[image-resize] derivative failed:', outPath, err);
    return false;
  }
}

/**
 * Deletes the original file at app:// URL plus its derivatives.
 * Silent on missing files. Use when an entity's imageUrl changes or is cleared.
 */
export function deleteImageByUrl(url: string | null | undefined): void {
  if (!url) return;
  try {
    const { app } = require('electron');
    const rest = url.replace(/^app:\/\//, '');
    const abs = path.join(app.getPath('userData'), rest);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
    deleteImageDerivatives(abs);
  } catch (err) {
    console.warn('[image-resize] deleteImageByUrl failed:', url, err);
  }
}

/**
 * Removes <base>.thumb.jpg and <base>.medium.jpg next to the original.
 * Silent if they don't exist.
 */
export function deleteImageDerivatives(absolutePath: string): void {
  const dir = path.dirname(absolutePath);
  const ext = path.extname(absolutePath);
  const base = path.basename(absolutePath, ext);
  for (const suffix of ['.thumb.jpg', '.medium.jpg']) {
    const p = path.join(dir, `${base}${suffix}`);
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch (err) {
      console.warn('[image-resize] failed to delete derivative:', p, err);
    }
  }
}
