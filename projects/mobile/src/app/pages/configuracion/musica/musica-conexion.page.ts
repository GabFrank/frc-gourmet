import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MusicaService, DispositivoSpotify } from '@frc/shared-core';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog.component';

/**
 * Conexión Spotify en la PWA — espejo de la card "Conexión" + "Salida de audio"
 * del desktop (`src/app/pages/configuracion/musica/musica.component`).
 *
 * Diferencia obligada: `musica-conectar`, `musica-cancelar-conexion` y
 * `musica-abrir-spotify` están en la deny-list HTTP del server
 * (electron/server/rpc-router.ts) → 403. Abren el navegador OAuth y la app de
 * Spotify EN LA PC DEL LOCAL, así que la vinculación se hace desde el desktop.
 * Acá se edita la configuración, se elige el dispositivo de salida y se puede
 * desvincular (ese canal sí está permitido).
 */
@Component({
  selector: 'app-musica-conexion',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSlideToggleModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './musica-conexion.page.html',
  styleUrls: ['./musica-conexion.page.scss'],
})
export class MusicaConexionPage implements OnInit {
  private readonly musica = inject(MusicaService);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  loading = false;
  guardando = false;
  buscando = false;

  spotifyClientId = '';
  redirectPort = 8888;
  redirectUri = '';
  habilitado = false;
  conectado = false;

  estadoTexto = 'SIN CONEXIÓN';
  estadoClase = 'off';

  deviceIdSeleccionado: string | null = null;
  deviceNombreSeleccionado: string | null = null;
  dispositivos: DispositivoSpotify[] = [];

  async ngOnInit(): Promise<void> {
    await this.cargar();
  }

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      const cfg = await this.musica.getConfig();
      this.spotifyClientId = cfg.spotifyClientId;
      this.redirectPort = cfg.redirectPort;
      this.redirectUri = cfg.redirectUri;
      this.habilitado = cfg.habilitado;
      this.conectado = cfg.conectado;
      this.deviceIdSeleccionado = cfg.deviceId;
      this.deviceNombreSeleccionado = cfg.deviceNombre;
      this.aplicarEstado();
    } catch (e: any) {
      this.error(e);
    } finally {
      this.loading = false;
    }
  }

  private aplicarEstado(): void {
    this.estadoTexto = this.conectado ? 'CONECTADO' : 'SIN CONEXIÓN';
    this.estadoClase = this.conectado ? 'ok' : 'off';
  }

  async guardar(): Promise<void> {
    this.guardando = true;
    try {
      await this.musica.setConfig({
        spotifyClientId: this.spotifyClientId,
        redirectPort: this.redirectPort,
        habilitado: this.habilitado,
      });
      await this.cargar();
      this.snack.open('Configuración guardada', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.error(e);
    } finally {
      this.guardando = false;
    }
  }

  async buscarDispositivos(): Promise<void> {
    this.buscando = true;
    try {
      this.dispositivos = await this.musica.listarDispositivos();
      if (this.dispositivos.length === 0) {
        this.snack.open(
          'No se encontraron dispositivos. Abrí Spotify en la PC del local.',
          'OK',
          { duration: 5000 },
        );
      }
    } catch (e: any) {
      this.error(e);
    } finally {
      this.buscando = false;
    }
  }

  async usarDispositivo(d: DispositivoSpotify): Promise<void> {
    try {
      await this.musica.seleccionarDispositivo(d.id, d.nombre);
      this.deviceIdSeleccionado = d.id;
      this.deviceNombreSeleccionado = d.nombre;
      this.snack.open(`Salida de audio: ${d.nombre}`, 'OK', { duration: 3000 });
    } catch (e: any) {
      this.error(e);
    }
  }

  async desvincular(): Promise<void> {
    const ok = await this.dialog
      .open(ConfirmDialogComponent, {
        data: {
          title: 'Desvincular Spotify',
          message:
            'Se desvinculará la cuenta de Spotify del local. Para volver a vincularla tenés que hacerlo desde la PC del local (Configuración → Música ambiente en el desktop). ¿Continuar?',
          confirmText: 'Desvincular',
          cancelText: 'Cancelar',
          danger: true,
        },
      })
      .afterClosed()
      .toPromise();
    if (!ok) return;
    try {
      await this.musica.desconectar();
      this.dispositivos = [];
      await this.cargar();
      this.snack.open('Spotify desvinculado', 'OK', { duration: 2500 });
    } catch (e: any) {
      this.error(e);
    }
  }

  private error(e: any): void {
    const msg = (e?.message || String(e) || 'Error').replace(/^Error:\s*/i, '');
    this.snack.open(msg, 'CERRAR', { duration: 7000 });
  }
}
