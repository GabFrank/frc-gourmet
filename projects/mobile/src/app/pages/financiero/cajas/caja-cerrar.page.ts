import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';
import { ConteoFormComponent, ConteoGrupo } from './conteo-form.component';
import { buildGruposConteo, detallesDeGrupos } from './caja-conteo.util';

interface EsperadoRow {
  denominacion: string;
  simbolo: string;
  montoFmt: string;
}

/**
 * Cierre de caja desde la PWA: conteo de cierre por denominación + marcar la
 * caja CERRADO. Muestra el efectivo esperado por moneda (apertura + ventas) como
 * referencia. El backend rechaza si hay ventas abiertas o si el usuario no es
 * quien abrió la caja.
 */
@Component({
  selector: 'app-caja-cerrar',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, MatSnackBarModule, ConteoFormComponent,
  ],
  templateUrl: './caja-cerrar.page.html',
  styleUrls: ['./cajas.scss'],
})
export class CajaCerrarPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaId!: number;
  loading = true;
  saving = false;
  error: string | null = null;

  grupos: ConteoGrupo[] = [];
  esperados: EsperadoRow[] = [];

  async ngOnInit(): Promise<void> {
    this.cajaId = Number(this.route.snapshot.paramMap.get('id'));
    this.loading = true;
    try {
      const [resumen, cajasMonedas, billetes] = await Promise.all([
        firstValueFrom(this.repo.getResumenCaja(this.cajaId)),
        firstValueFrom(this.repo.getCajasMonedas()),
        firstValueFrom(this.repo.getMonedasBilletes()),
      ]);
      this.grupos = buildGruposConteo(cajasMonedas || [], billetes || []);

      // Efectivo esperado por moneda (apertura + ventas en efectivo), como guía.
      const esperadoMap: { [id: number]: number } = (resumen && resumen.esperadoPorMoneda) || {};
      this.esperados = this.grupos.map((g) => ({
        denominacion: g.denominacion,
        simbolo: g.simbolo,
        montoFmt: Number(esperadoMap[g.monedaId] || 0).toLocaleString('es-PY', {
          maximumFractionDigits: g.decimales || 0,
        }),
      }));
    } catch {
      this.error = 'No se pudieron cargar los datos de cierre';
    } finally {
      this.loading = false;
    }
  }

  async cerrar(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    try {
      const conteo: any = await firstValueFrom(this.repo.createConteo({
        activo: true,
        tipo: 'CIERRE',
        fecha: new Date(),
        observaciones: 'CONTEO DE CIERRE DE CAJA',
      } as any));
      const detalles = detallesDeGrupos(this.grupos);
      for (const d of detalles) {
        await firstValueFrom(this.repo.createConteoDetalle({ ...d, conteo: { id: conteo.id } } as any));
      }
      await firstValueFrom(this.repo.updateCaja(this.cajaId, {
        estado: 'CERRADO',
        fechaCierre: new Date(),
        conteoCierre: { id: conteo.id },
      } as any));
      this.snack.open('Caja cerrada', 'OK', { duration: 2500 });
      await this.router.navigateByUrl('/financiero/cajas');
    } catch (e: any) {
      const msg = (e?.message || 'No se pudo cerrar la caja').replace(/^Error:\s*/, '');
      this.snack.open(msg, 'CERRAR', { duration: 6000 });
      this.saving = false;
    }
  }

  volver(): void {
    this.location.back();
  }
}
