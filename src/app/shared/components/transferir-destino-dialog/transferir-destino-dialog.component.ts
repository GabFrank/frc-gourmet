import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';

export type TransferirContenedorTipo = 'MESA' | 'COMANDA';

export interface TransferirDestinoDialogData {
  /** Contenedor del que sale la cuenta; se excluye de la lista de destinos. */
  origen: { tipo: TransferirContenedorTipo; id: number; etiqueta: string };
  alcance: 'COMPLETA' | 'ITEMS';
  /** Solo para el titulo cuando el alcance es ITEMS. */
  cantidadItems?: number;
}

export interface TransferirDestinoResult {
  tipo: TransferirContenedorTipo;
  id: number;
  etiqueta: string;
}

/** Fila de la grilla, ya resuelta: el template no llama funciones. */
interface DestinoVm {
  id: number;
  numero: number;
  etiqueta: string;
  ocupado: boolean;
  detalle: string;
}

@Component({
  selector: 'app-transferir-destino-dialog',
  templateUrl: './transferir-destino-dialog.component.html',
  styleUrls: ['./transferir-destino-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatTooltipModule,
  ],
})
export class TransferirDestinoDialogComponent implements OnInit {
  tipoDestino: TransferirContenedorTipo = 'MESA';
  mesas: DestinoVm[] = [];
  comandas: DestinoVm[] = [];
  destinos: DestinoVm[] = [];
  seleccionado: DestinoVm | null = null;
  loading = true;

  titulo = '';
  textoConfirmar = 'TRANSFERIR';
  vacioMensaje = '';

  constructor(
    public dialogRef: MatDialogRef<TransferirDestinoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TransferirDestinoDialogData,
    private repositoryService: RepositoryService,
  ) {}

  async ngOnInit(): Promise<void> {
    this.titulo = this.data.alcance === 'ITEMS'
      ? `MOVER ${this.data.cantidadItems || ''} ITEM(S) DE ${this.data.origen.etiqueta}`.replace('  ', ' ')
      : `TRANSFERIR ${this.data.origen.etiqueta}`;

    // Se listan TODAS las mesas y comandas activas, no solo las libres: transferir
    // a una cuenta ya abierta es un caso valido (juntar dos cuentas).
    const [mesas, comandas] = await Promise.all([
      firstValueFrom(this.repositoryService.getPdvMesas()),
      firstValueFrom(this.repositoryService.getComandasActivas()),
    ]);

    const esOrigenMesa = this.data.origen.tipo === 'MESA';
    const esOrigenComanda = this.data.origen.tipo === 'COMANDA';

    this.mesas = (mesas || [])
      .filter((m: any) => m.activo && !(esOrigenMesa && m.id === this.data.origen.id))
      .sort((a: any, b: any) => a.numero - b.numero)
      .map((m: any) => ({
        id: m.id,
        numero: m.numero,
        etiqueta: `MESA ${m.numero}`,
        ocupado: m.estado === 'OCUPADO',
        detalle: m.estado === 'OCUPADO' ? `Mesa ${m.numero} — ocupada, se une a su cuenta` : `Mesa ${m.numero} — libre`,
      }));

    this.comandas = (comandas || [])
      .filter((c: any) => c.activo && !(esOrigenComanda && c.id === this.data.origen.id))
      .sort((a: any, b: any) => a.numero - b.numero)
      .map((c: any) => ({
        id: c.id,
        numero: c.numero,
        etiqueta: `COMANDA ${c.numero}`,
        ocupado: c.estado === 'OCUPADO',
        detalle: c.estado === 'OCUPADO'
          ? `Comanda ${c.numero} — ocupada, se une a su cuenta`
          : `Comanda ${c.numero} — libre`,
      }));

    this.loading = false;
    this.aplicarTipo();
  }

  cambiarTipo(tipo: TransferirContenedorTipo): void {
    if (this.tipoDestino === tipo) return;
    this.tipoDestino = tipo;
    this.seleccionado = null;
    this.aplicarTipo();
  }

  seleccionar(destino: DestinoVm): void {
    this.seleccionado = destino;
    this.textoConfirmar = `TRANSFERIR A ${destino.etiqueta}`;
  }

  confirmar(): void {
    if (!this.seleccionado) return;
    const { id, etiqueta } = this.seleccionado;
    this.dialogRef.close({ tipo: this.tipoDestino, id, etiqueta } as TransferirDestinoResult);
  }

  cancelar(): void {
    this.dialogRef.close(null);
  }

  private aplicarTipo(): void {
    this.destinos = this.tipoDestino === 'MESA' ? this.mesas : this.comandas;
    this.textoConfirmar = 'TRANSFERIR';
    this.vacioMensaje = this.tipoDestino === 'MESA'
      ? 'No hay otras mesas activas.'
      : 'No hay comandas activas. Creá comandas desde la configuración del PdV.';
  }
}
