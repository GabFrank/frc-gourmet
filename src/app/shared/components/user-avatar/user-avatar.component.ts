import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { thumbUrl, resolveAppUrl } from '../../utils/image-url.util';

/**
 * Avatar circular reusable. Muestra la imagen de perfil de la persona si
 * existe (resuelve thumb 96px + fallback al original on error). Si no hay
 * imagen, cae al icono `account_circle`.
 *
 * Uso típico: `<app-user-avatar [imageUrl]="user?.persona?.imageUrl" [size]="36"></app-user-avatar>`
 */
@Component({
  selector: 'app-user-avatar',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.scss'],
})
export class UserAvatarComponent implements OnChanges {
  @Input() imageUrl: string | null | undefined = null;
  @Input() name: string | null | undefined = null;
  @Input() size: number = 36;

  resolvedThumb: string | undefined;
  resolvedOriginal: string | undefined;
  /** true cuando el thumb falló y ya cayó al original; si el original también falla, mostramos icon. */
  imageFailed = false;
  /** true cuando el thumb falló, para que el template intente el original. */
  triedOriginal = false;

  ngOnChanges(_: SimpleChanges): void {
    this.imageFailed = false;
    this.triedOriginal = false;
    this.resolvedThumb = thumbUrl(this.imageUrl);
    this.resolvedOriginal = resolveAppUrl(this.imageUrl);
  }

  onThumbError(): void {
    // Legacy: imagenes cargadas antes del refactor pueden no tener .thumb.jpg.
    this.triedOriginal = true;
  }

  onOriginalError(): void {
    this.imageFailed = true;
  }
}
