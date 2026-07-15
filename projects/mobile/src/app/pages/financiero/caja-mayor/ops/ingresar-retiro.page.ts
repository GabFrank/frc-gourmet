import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConfirmDialogComponent, ConfirmData } from '../../../../core/components/confirm-dialog.component';

interface TotalMoneda {
  simbolo: string;
  monto: number;
  decimales: number;
}

interface RetiroVM {
  id: number;
  origenCaja: string;
  fecha: string;
  responsable?: string;
  estado: string;
  estadoLabel: string;
  estadoClase: string;
  totales: TotalMoneda[];
  observaciones?: string;
}

const ESTADO_LABEL: Record<string, string> = {
  FLOTANTE: 'Flotante',
  VINCULADO_PENDIENTE: 'Vinculado',
};

/**
 * Ingresar retiro de caja a la Caja Mayor — operación full-screen. Lista los
 * retiros pendientes (FLOTANTE + VINCULADO_PENDIENTE), muestra su origen y total
 * por moneda, y permite ingresarlos (ingresarRetiroCaja). Requiere
 * CAJA_MAYOR_OPERAR.
 */
@Component({
  selector: 'app-ingresar-retiro',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, MatDialogModule, MatSnackBarModule,
  ],
  templateUrl: './ingresar-retiro.page.html',
  styleUrls: ['./ingresar-retiro.scss'],
})
export class IngresarRetiroPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly dialog = inject(MatDialog);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;
  retiros: RetiroVM[] = [];
  loading = true;
  procesandoId: number | null = null;
  error: string | null = null;

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.error = null;
    Promise.all([
      firstValueFrom(this.repo.getRetirosCaja({ estado: 'FLOTANTE' })),
      firstValueFrom(this.repo.getRetirosCaja({ estado: 'VINCULADO_PENDIENTE' })),
    ])
      .then(([flotantes, vinculados]: [any[], any[]]) => {
        this.retiros = [...(flotantes || []), ...(vinculados || [])].map((r) => this.toVM(r));
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudieron cargar los retiros pendientes';
        this.loading = false;
      });
  }

  private toVM(r: any): RetiroVM {
    const disp = r.caja?.dispositivo?.nombre || (r.caja?.dispositivo?.id ? `Terminal #${r.caja.dispositivo.id}` : '');
    const p = r.responsableRetiro?.persona;
    const estado = (r.estado || '').toUpperCase();
    const totalesMap = new Map<number, TotalMoneda>();
    for (const d of r.detalles || []) {
      const m = d.moneda;
      if (!m) continue;
      const acc = totalesMap.get(m.id) ?? { simbolo: m.simbolo || '', monto: 0, decimales: m.decimales ?? 0 };
      acc.monto += Number(d.monto) || 0;
      totalesMap.set(m.id, acc);
    }
    return {
      id: r.id,
      origenCaja: `Caja #${r.caja?.id ?? '?'}${disp ? ' · ' + disp : ''}`,
      fecha: r.fechaRetiro,
      responsable: p ? `${p.nombre || ''} ${p.apellido || ''}`.trim() : r.responsableRetiro?.nickname || undefined,
      estado,
      estadoLabel: ESTADO_LABEL[estado] || estado,
      estadoClase: estado === 'FLOTANTE' ? 'warn' : 'info',
      totales: [...totalesMap.values()],
      observaciones: r.observaciones || undefined,
    };
  }

  volver(): void {
    this.location.back();
  }

  async ingresar(r: RetiroVM): Promise<void> {
    if (this.procesandoId != null) return;
    const totalTxt = r.totales.map((t) => `${t.simbolo} ${t.monto.toLocaleString()}`).join(' · ');
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: {
            title: 'Ingresar retiro',
            message: `Ingresar el retiro N° ${r.id} (${totalTxt}) a esta caja mayor.`,
            confirmText: 'Ingresar',
          } as ConfirmData,
          width: '340px',
        })
        .afterClosed(),
    );
    if (!ok) return;
    this.procesandoId = r.id;
    try {
      await firstValueFrom(this.repo.ingresarRetiroCaja(r.id, this.cajaMayorId));
      this.snack.open('Retiro ingresado', 'OK', { duration: 2500 });
      this.retiros = this.retiros.filter((x) => x.id !== r.id);
    } catch (e) {
      const raw = String((e as Error)?.message || '');
      const msg = /PERMISO/.test(raw)
        ? 'Sin permiso para operar'
        : raw.replace(/^Error:\s*/, '') || 'No se pudo ingresar el retiro';
      this.snack.open(msg, 'OK', { duration: 4000 });
    } finally {
      this.procesandoId = null;
    }
  }
}
