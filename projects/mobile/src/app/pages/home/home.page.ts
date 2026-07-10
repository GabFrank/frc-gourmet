import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Observable, firstValueFrom } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { AuthService, PermissionService, Usuario } from '@frc/shared-core';
import { NAV_ITEMS, NavItem } from '../../core/shell/nav';
import { PwaInstallService } from '../../core/services/pwa-install.service';
import { BarcodeScannerDialogComponent } from '../ventas/mesas/barcode-scanner-dialog.component';

/** Dashboard de inicio: saludo + accesos rápidos a las secciones. */
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatDialogModule, MatSnackBarModule],
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly permissions = inject(PermissionService);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);
  readonly pwa = inject(PwaInstallService);

  readonly user: Usuario | null = this.auth.currentUser;
  // Ventas primero; Compras/Finanzas/RRHH solo si el usuario tiene permiso.
  readonly accesos$: Observable<NavItem[]> = this.permissions.codigos$.pipe(
    map((set) =>
      NAV_ITEMS.filter(
        (i) => !i.exact && (!i.permisos || i.permisos.some((p) => set.has(p.toUpperCase()))),
      ),
    ),
    shareReplay(1),
  );

  /**
   * Abre el lector de QR (cámara) para escanear el código mostrado en la PC.
   * El QR codifica una URL `…/upload?session=<id>`; extraemos la sesión y
   * navegamos a la página de subida sin salir de la app.
   */
  async scanQr(): Promise<void> {
    const ref = this.dialog.open(BarcodeScannerDialogComponent, {
      width: '100vw',
      maxWidth: '100vw',
      height: '100dvh',
      maxHeight: '100dvh',
      panelClass: 'fullscreen-dialog',
      autoFocus: false,
    });
    const raw: string | undefined = await firstValueFrom(ref.afterClosed());
    if (!raw) return;
    const session = extractSession(raw);
    if (!session) {
      this.snack.open('El código no corresponde a una subida.', 'Cerrar', { duration: 3500 });
      return;
    }
    void this.router.navigate(['/upload'], { queryParams: { session } });
  }
}

/** Extrae el parámetro `session` de una URL o texto de QR. */
function extractSession(raw: string): string | null {
  try {
    const u = new URL(raw);
    const s = u.searchParams.get('session');
    if (s) return s;
  } catch {
    /* no era una URL */
  }
  const m = raw.match(/session=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}
