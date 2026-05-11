import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { Usuario } from '../../../database/entities/personas/usuario.entity';
import { FormasPago } from '../../../database/entities/compras/forma-pago.entity';
import { Moneda } from '../../../database/entities/financiero/moneda.entity';
import { PdvMesa } from '../../../database/entities/ventas/pdv-mesa.entity';
import { Dispositivo } from '../../../database/entities/financiero/dispositivo.entity';

export interface FiltrosAvanzados {
  mozoId?: number;
  formasPagoIds?: number[];
  monedaIds?: number[];
  mesaId?: number;
  monedaValorId?: number;
  valorMin?: number | null;
  valorMax?: number | null;
  tieneDescuento?: string;
  /** F5 paso 4: filtrar por dispositivo (multi-PC). */
  dispositivoId?: number;
}

@Component({
  selector: 'app-filtros-ventas-dialog',
  templateUrl: './filtros-ventas-dialog.component.html',
  styleUrls: ['./filtros-ventas-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatAutocompleteModule,
  ],
})
export class FiltrosVentasDialogComponent implements OnInit {
  // Opciones para selects
  usuarios: Usuario[] = [];
  filteredUsuarios: Usuario[] = [];
  formasPago: FormasPago[] = [];
  monedas: Moneda[] = [];
  mesas: PdvMesa[] = [];
  dispositivos: Dispositivo[] = [];

  // Autocomplete mozo
  mozoControl = new FormControl('');
  selectedMozo: Usuario | null = null;

  // Valores del form
  mozoId: number | null = null;
  formasPagoIds: number[] = [];
  monedaIds: number[] = [];
  mesaId: number | null = null;
  monedaValorId: number | null = null;
  valorMin: number | null = null;
  valorMax: number | null = null;
  tieneDescuento: string = '';
  dispositivoId: number | null = null;

  constructor(
    public dialogRef: MatDialogRef<FiltrosVentasDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FiltrosAvanzados,
    private repositoryService: RepositoryService
  ) {
    // Restaurar estado previo
    if (data) {
      this.mozoId = data.mozoId || null;
      this.formasPagoIds = data.formasPagoIds || [];
      this.monedaIds = data.monedaIds || [];
      this.mesaId = data.mesaId || null;
      this.monedaValorId = data.monedaValorId || null;
      this.valorMin = data.valorMin ?? null;
      this.valorMax = data.valorMax ?? null;
      this.tieneDescuento = data.tieneDescuento || '';
      this.dispositivoId = data.dispositivoId || null;
    }
  }

  async ngOnInit(): Promise<void> {
    const [usuarios, formasPago, monedas, mesas, dispositivos] = await Promise.all([
      firstValueFrom(this.repositoryService.getUsuarios()),
      firstValueFrom(this.repositoryService.getFormasPago()),
      firstValueFrom(this.repositoryService.getMonedas()),
      firstValueFrom(this.repositoryService.getPdvMesas()),
      firstValueFrom(this.repositoryService.getDispositivos()),
    ]);
    this.usuarios = usuarios.filter((u: any) => u.activo);
    this.filteredUsuarios = [...this.usuarios];
    this.formasPago = formasPago.filter((fp: any) => fp.activo);
    this.monedas = monedas;
    this.mesas = mesas.filter((m: any) => m.activo).sort((a: any, b: any) => a.numero - b.numero);
    this.dispositivos = (dispositivos || []).filter((d: any) => d.activo);

    // Restaurar mozo seleccionado
    if (this.mozoId) {
      this.selectedMozo = this.usuarios.find(u => u.id === this.mozoId) || null;
      if (this.selectedMozo) {
        this.mozoControl.setValue(this.getUsuarioNombre(this.selectedMozo));
      }
    }

    // Filtrar autocomplete al escribir
    this.mozoControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredUsuarios = this.usuarios.filter(u =>
          this.getUsuarioNombre(u).toUpperCase().includes(filter)
        );
      }
    });
  }

  getUsuarioNombre(u: Usuario): string {
    return (u as any).persona?.nombre || (u as any).nickname || '';
  }

  onMozoSelected(usuario: Usuario): void {
    this.selectedMozo = usuario;
    this.mozoId = usuario.id;
    this.mozoControl.setValue(this.getUsuarioNombre(usuario));
  }

  clearMozo(): void {
    this.selectedMozo = null;
    this.mozoId = null;
    this.mozoControl.setValue('');
  }

  aplicar(): void {
    const result: FiltrosAvanzados = {};
    if (this.mozoId) result.mozoId = this.mozoId;
    if (this.formasPagoIds.length) result.formasPagoIds = this.formasPagoIds;
    if (this.monedaIds.length) result.monedaIds = this.monedaIds;
    if (this.mesaId) result.mesaId = this.mesaId;
    if (this.monedaValorId) {
      result.monedaValorId = this.monedaValorId;
      if (this.valorMin != null) result.valorMin = this.valorMin;
      if (this.valorMax != null) result.valorMax = this.valorMax;
    }
    if (this.tieneDescuento) result.tieneDescuento = this.tieneDescuento;
    if (this.dispositivoId) result.dispositivoId = this.dispositivoId;
    this.dialogRef.close(result);
  }

  reset(): void {
    this.mozoId = null;
    this.selectedMozo = null;
    this.mozoControl.setValue('');
    this.formasPagoIds = [];
    this.monedaIds = [];
    this.mesaId = null;
    this.monedaValorId = null;
    this.valorMin = null;
    this.valorMax = null;
    this.tieneDescuento = '';
    this.dispositivoId = null;
    this.dialogRef.close({} as FiltrosAvanzados);
  }

  cancelar(): void {
    this.dialogRef.close(undefined);
  }
}
