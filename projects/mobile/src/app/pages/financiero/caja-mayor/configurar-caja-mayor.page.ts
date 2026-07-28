import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface CuentaRow {
  id: number;
  titulo: string;
  simbolo: string;
  visible: boolean;
}

/**
 * Configurar Caja Mayor (mobile): qué cuentas bancarias se muestran en el
 * sidebar del detalle, en qué orden (drag & drop), y si se muestran los
 * resúmenes de Cuentas por Pagar / Cobrar. No toca las formas de pago (en
 * caja mayor solo circula EFECTIVO). El handler no exige permiso extra.
 */
@Component({
  selector: 'app-configurar-caja-mayor',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, DragDropModule, MatToolbarModule, MatIconModule,
    MatButtonModule, MatCheckboxModule, MatSlideToggleModule, MatProgressBarModule, MatSnackBarModule,
  ],
  templateUrl: './configurar-caja-mayor.page.html',
  styles: [
    `
      .cfg-section { margin-bottom: 20px; }
      .cfg-title { margin: 0 0 4px; font-size: 1rem; color: var(--text-primary); }
      .cfg-hint { margin: 0 0 12px; font-size: 0.8rem; color: var(--text-secondary); }
      .cfg-list { display: flex; flex-direction: column; gap: 6px; }
      .cfg-row {
        display: flex; align-items: center; gap: 8px;
        padding: 8px 10px; border: 1px solid var(--border-color, rgba(128,128,128,0.3));
        border-radius: 8px; background: var(--surface, transparent);
      }
      .cfg-drag { cursor: move; color: var(--text-secondary); touch-action: none; }
      .cfg-check { flex: 1; }
      .cfg-cuenta { color: var(--text-primary); }
      .cfg-moneda { margin-left: 8px; font-size: 0.8rem; color: var(--text-secondary); }
      .cfg-toggles { display: flex; flex-direction: column; gap: 12px; }
      .cdk-drag-preview { border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
      .cdk-drag-placeholder { opacity: 0.4; }
    `,
  ],
})
export class ConfigurarCajaMayorPage implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  cajaMayorId = 0;
  cuentas: CuentaRow[] = [];
  loading = true;
  saving = false;

  readonly form = this.fb.nonNullable.group({
    mostrarCuentasPorPagar: [false],
    mostrarCuentasPorCobrar: [false],
  });

  ngOnInit(): void {
    this.cajaMayorId = Number(this.route.snapshot.paramMap.get('id'));
    this.cargar();
  }

  private cargar(): void {
    this.loading = true;
    Promise.all([
      firstValueFrom(this.repo.getCuentasBancarias()),
      firstValueFrom(this.repo.getCajaMayorConfiguracion(this.cajaMayorId)),
    ])
      .then(([cuentas, cfg]: [any[], any]) => {
        const visiblesIds = new Set<number>(((cfg?.cuentasBancariasVisibles || []) as any[]).map((c) => c.id));
        const rows: CuentaRow[] = (cuentas || []).map((c: any) => ({
          id: c.id,
          titulo: `${c.banco ? c.banco + ' · ' : ''}${c.nombre}`,
          simbolo: c.moneda?.simbolo || '',
          visible: visiblesIds.has(c.id),
        }));
        this.cuentas = this.ordenar(rows, cfg?.cuentasBancariasOrden);
        this.form.patchValue({
          mostrarCuentasPorPagar: cfg?.mostrarCuentasPorPagar === true,
          mostrarCuentasPorCobrar: cfg?.mostrarCuentasPorCobrar === true,
        });
        this.loading = false;
      })
      .catch(() => {
        this.snack.open('No se pudo cargar la configuración', 'OK', { duration: 3000 });
        this.loading = false;
      });
  }

  /** Ordena las visibles primero según el orden guardado; el resto por id. */
  private ordenar(rows: CuentaRow[], ordenRaw: string | null | undefined): CuentaRow[] {
    let orden: number[] = [];
    if (ordenRaw) {
      try {
        const arr = JSON.parse(ordenRaw);
        if (Array.isArray(arr)) orden = arr.map((x) => Number(x)).filter((x) => !isNaN(x));
      } catch { orden = []; }
    }
    const pos = new Map<number, number>();
    orden.forEach((id, i) => pos.set(id, i));
    return [...rows].sort((a, b) => {
      const pa = pos.has(a.id) ? pos.get(a.id)! : Number.MAX_SAFE_INTEGER;
      const pb = pos.has(b.id) ? pos.get(b.id)! : Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });
  }

  drop(event: CdkDragDrop<CuentaRow[]>): void {
    moveItemInArray(this.cuentas, event.previousIndex, event.currentIndex);
  }

  volver(): void {
    this.location.back();
  }

  async guardar(): Promise<void> {
    if (this.saving) return;
    this.saving = true;
    const v = this.form.getRawValue();
    // El orden de la lista define el orden en el sidebar; solo las visibles se envían.
    const cuentaBancariaIds = this.cuentas.filter((c) => c.visible).map((c) => c.id);
    try {
      await firstValueFrom(
        this.repo.saveCajaMayorConfiguracion(this.cajaMayorId, {
          cuentaBancariaIds,
          mostrarCuentasPorPagar: v.mostrarCuentasPorPagar,
          mostrarCuentasPorCobrar: v.mostrarCuentasPorCobrar,
        }),
      );
      this.snack.open('Configuración guardada', 'OK', { duration: 2500 });
      this.location.back();
    } catch (e) {
      this.snack.open(/PERMISO/.test(String((e as Error)?.message)) ? 'Sin permiso' : 'No se pudo guardar', 'OK', { duration: 3000 });
      this.saving = false;
    }
  }
}
