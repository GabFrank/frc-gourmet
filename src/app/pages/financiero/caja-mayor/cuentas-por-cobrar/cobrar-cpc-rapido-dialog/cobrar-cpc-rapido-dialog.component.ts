import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from 'src/app/database/repository.service';
import { CobrarCuotaDialogComponent } from '../cobrar-cuota-dialog/cobrar-cuota-dialog.component';

interface CpcRow {
  id: number;
  clienteNombre: string;
  ventaId: number | null;
  montoTotal: number;
  montoCobrado: number;
  montoPendiente: number;
  fechaInicio: Date;
  monedaSimbolo: string;
  _label: string;
}

interface CuotaRow {
  id: number;
  numero: number;
  fechaVencimiento: Date;
  monto: number;
  montoCobrado: number;
  restante: number;
  estado: string;
}

export interface CobrarCpcRapidoDialogData {
  cajaMayorId?: number;
}

@Component({
  selector: 'app-cobrar-cpc-rapido-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatAutocompleteModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatSnackBarModule,
  ],
  templateUrl: './cobrar-cpc-rapido-dialog.component.html',
  styleUrls: ['./cobrar-cpc-rapido-dialog.component.scss'],
})
export class CobrarCpcRapidoDialogComponent implements OnInit {
  loading = false;
  cpcs: CpcRow[] = [];
  filteredCpcs: CpcRow[] = [];
  searchControl = new FormControl<CpcRow | string | null>(null);

  selectedCpc: CpcRow | null = null;
  cuotas: CuotaRow[] = [];
  proximaCuotaRaw: any = null;
  cuotaColumns = ['numero', 'fechaVencimiento', 'monto', 'restante', 'estado', 'acciones'];

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<CobrarCpcRapidoDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: CobrarCpcRapidoDialogData,
  ) {}

  async ngOnInit(): Promise<void> {
    this.loading = true;
    try {
      const list: any = await firstValueFrom(
        this.repositoryService.getCuentasPorCobrar({ estado: 'ACTIVO' }),
      );
      const rows: any[] = Array.isArray(list) ? list : list?.items || [];
      this.cpcs = rows.map((c: any) => this.toRow(c));
      this.filteredCpcs = this.cpcs.slice(0, 50);
      this.setupSearch();
    } catch (e) {
      console.error('Error cargando CPCs activas:', e);
      this.snackBar.open('Error al cargar cuentas por cobrar', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  private toRow(c: any): CpcRow {
    const persona = c.cliente?.persona;
    const apellido = persona?.apellido ? ` ${persona.apellido}` : '';
    const clienteNombre = `${persona?.nombre || ''}${apellido}`.trim() || c.cliente?.razon_social || `Cliente #${c.cliente?.id}`;
    const montoTotal = Number(c.montoTotal) || 0;
    const montoCobrado = Number(c.montoCobrado) || 0;
    const ventaPart = c.ventaId ? ` · Venta #${c.ventaId}` : '';
    const monedaSimbolo = c.moneda?.simbolo || '';
    return {
      id: c.id,
      clienteNombre,
      ventaId: c.ventaId || null,
      montoTotal,
      montoCobrado,
      montoPendiente: +(montoTotal - montoCobrado).toFixed(2),
      fechaInicio: c.fechaInicio,
      monedaSimbolo,
      _label: `${clienteNombre}${ventaPart} · Pendiente ${(montoTotal - montoCobrado).toLocaleString('es-PY')} ${monedaSimbolo}`,
    };
  }

  private setupSearch(): void {
    this.searchControl.valueChanges.subscribe((value) => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredCpcs = this.cpcs
          .filter((c) => c._label.toUpperCase().includes(filter))
          .slice(0, 50);
      } else {
        this.filteredCpcs = this.cpcs.slice(0, 50);
      }
    });
  }

  displayCpc = (c: any): string => (c && typeof c === 'object' ? c._label : '');

  async onCpcSelected(cpc: CpcRow): Promise<void> {
    this.selectedCpc = cpc;
    this.loading = true;
    try {
      const detalle: any = await firstValueFrom(this.repositoryService.getCuentaPorCobrar(cpc.id));
      const cuotas = Array.isArray(detalle?.cuotas) ? detalle.cuotas : [];
      cuotas.sort((a: any, b: any) =>
        new Date(a.fechaVencimiento || a.fecha_vencimiento).getTime() -
        new Date(b.fechaVencimiento || b.fecha_vencimiento).getTime()
      );
      this.cuotas = cuotas.map((q: any) => ({
        id: q.id,
        numero: q.numero,
        fechaVencimiento: q.fechaVencimiento || q.fecha_vencimiento,
        monto: Number(q.monto) || 0,
        montoCobrado: Number(q.montoCobrado) || 0,
        restante: +((Number(q.monto) || 0) - (Number(q.montoCobrado) || 0)).toFixed(2),
        estado: q.estado,
      }));
      const proxRaw = cuotas.find((q: any) => q.estado === 'PENDIENTE' || q.estado === 'PARCIAL');
      this.proximaCuotaRaw = proxRaw
        ? { ...proxRaw, cuentaPorCobrar: detalle }
        : null;
    } catch (e) {
      console.error('Error cargando cuotas:', e);
      this.snackBar.open('Error al cargar cuotas', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  clearSelection(): void {
    this.selectedCpc = null;
    this.cuotas = [];
    this.proximaCuotaRaw = null;
    this.searchControl.setValue('');
    this.filteredCpcs = this.cpcs.slice(0, 50);
  }

  cobrarCuota(cuotaRow: CuotaRow): void {
    if (!this.selectedCpc) return;
    const fullCuota = this.proximaCuotaRaw && this.proximaCuotaRaw.id === cuotaRow.id
      ? this.proximaCuotaRaw
      : this.buildCuotaPayload(cuotaRow);

    const ref = this.dialog.open(CobrarCuotaDialogComponent, {
      width: '640px',
      data: {
        cuota: fullCuota,
        contextoLabel: this.selectedCpc.clienteNombre,
        cajaMayorId: this.data?.cajaMayorId,
      },
      disableClose: true,
    });

    ref.afterClosed().subscribe((result) => {
      if (result) {
        this.dialogRef.close({ success: true, cpcId: this.selectedCpc?.id });
      } else {
        // Refrescar cuotas por si quedó parcial
        if (this.selectedCpc) this.onCpcSelected(this.selectedCpc);
      }
    });
  }

  private buildCuotaPayload(row: CuotaRow): any {
    return {
      id: row.id,
      numero: row.numero,
      fechaVencimiento: row.fechaVencimiento,
      monto: row.monto,
      montoCobrado: row.montoCobrado,
      estado: row.estado,
      cuentaPorCobrar: this.selectedCpc,
    };
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
