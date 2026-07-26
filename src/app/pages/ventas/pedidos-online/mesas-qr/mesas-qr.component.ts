import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

interface MesaQr {
  id: number;
  numero: number;
  token: string;
  url: string;
  qr: string;
}

/**
 * Láminas QR imprimibles por mesa (canal MESA_QR autoservicio — F1b).
 *
 * Genera/asegura el `qr_token` de cada mesa activa (handler `get-qr-mesas`) y
 * muestra una grilla imprimible: por mesa, su número y el QR que apunta a
 * `<urlPublica>/tienda?mesa=<token>`. En web /admin la URL pública se deduce del
 * origin; en desktop se puede tipear (ej. https://app.frc-gourmet.com).
 */
@Component({
  selector: 'app-mesas-qr',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  templateUrl: './mesas-qr.component.html',
  styleUrls: ['./mesas-qr.component.scss'],
})
export class MesasQrComponent implements OnInit {
  baseUrl = '';
  mesas: MesaQr[] = [];
  cargando = false;
  faltaUrlPublica = false;

  constructor(private snackBar: MatSnackBar) {}

  private get api(): any {
    return (window as any).api;
  }

  ngOnInit(): void {
    const origin = window.location?.origin || '';
    this.baseUrl =
      /^https?:\/\//i.test(origin) && !origin.includes('localhost')
        ? origin
        : 'https://app.frc-gourmet.com';
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const data = await this.api.callIpc('get-qr-mesas', { baseUrl: this.baseUrl });
      this.mesas = Array.isArray(data) ? data : [];
      this.faltaUrlPublica = this.mesas.some((m: any) => m && m.urlAbsoluta === false);
    } catch (e: any) {
      this.snackBar.open('Error al generar los QR: ' + (e?.message || e), 'OK', { duration: 5000 });
    } finally {
      this.cargando = false;
    }
  }

  imprimir(): void {
    window.print();
  }
}
