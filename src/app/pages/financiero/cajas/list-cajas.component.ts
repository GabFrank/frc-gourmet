import { Component, OnInit, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatMenuModule } from '@angular/material/menu';
import { debounceTime, startWith, switchMap } from 'rxjs/operators';
import { Observable, firstValueFrom } from 'rxjs';
import { Caja, CajaEstado } from 'src/app/database/entities/financiero/caja.entity';
import { Usuario } from 'src/app/database/entities/personas/usuario.entity';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateCajaDialogComponent } from './create-caja-dialog/create-caja-dialog.component';
import { ResumenCajaDialogComponent } from 'src/app/shared/components/resumen-caja-dialog/resumen-caja-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AuthService } from 'src/app/services/auth.service';

// Confirmation dialog for existing open caja
@Component({
  selector: 'app-caja-confirmation-dialog',
  template: `
    <h2 mat-dialog-title>Caja ya abierta</h2>
    <mat-dialog-content>
      <p>Ya tienes una caja abierta:</p>
      <div class="caja-info">
        <div><strong>ID:</strong> {{ data.caja.id }}</div>
        <div><strong>Dispositivo:</strong> {{ data.caja.dispositivo?.nombre || 'N/A' }}</div>
        <div><strong>Apertura:</strong> {{ data.caja.fechaApertura | date: 'dd/MM/yyyy HH:mm' }}</div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="'cancel'">Cancelar</button>
      <button mat-button [mat-dialog-close]="'new'">Abrir nueva caja</button>
      <button mat-raised-button color="primary" [mat-dialog-close]="'existing'">Ir a caja existente</button>
    </mat-dialog-actions>
  `,
  styles: [`.caja-info { padding: 12px; border-radius: 4px; margin: 12px 0; background: rgba(0,0,0,0.04); }`],
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule]
})
export class CajaConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<CajaConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { caja: any }
  ) {}
}

interface CajaRow {
  caja: Caja;
  cajeroNombre: string;
  totalVentas: number;
  saludColor: string; // 'green' | 'yellow' | 'red' | 'gray'
  saludTooltip: string;
  diferenciaPct: number | null;
}

@Component({
  selector: 'app-list-cajas',
  templateUrl: './list-cajas.component.html',
  styleUrls: ['./list-cajas.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatChipsModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatMenuModule,
    CreateCajaDialogComponent
  ]
})
export class ListCajasComponent implements OnInit {
  displayedColumns = ['id', 'cajero', 'fechaApertura', 'fechaCierre', 'estado', 'totalVentas', 'salud', 'actions'];
  cajaRows: CajaRow[] = [];
  allCajaRows: CajaRow[] = [];
  loading = true;
  cajaEstado = CajaEstado;
  currentUser: Usuario | null = null;

  // Umbrales
  umbralBaja = 5;
  umbralAlta = 15;

  // Moneda principal ID
  principalMonedaId: number | null = null;

  // Filtros
  filterForm = new FormGroup({
    cajaId: new FormControl(''),
    dateType: new FormControl('apertura'),
    fechaInicio: new FormControl<Date | null>(null),
    fechaFin: new FormControl<Date | null>(null),
    usuario: new FormControl('')
  });

  usuarios: Usuario[] = [];
  filteredUsuarios: Observable<Usuario[]> = this.filterForm.get('usuario')!.valueChanges.pipe(
    startWith(''),
    switchMap(value => this._filterUsuarios(value || ''))
  );

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private authService: AuthService
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.currentUser;
    await this.loadConfig();
    await this.loadPrincipalMoneda();
    this.loadUsuarios();
    await this.loadCajas();

    this.filterForm.valueChanges.pipe(debounceTime(500)).subscribe(() => {
      this.applyFilters();
    });
  }

  private async loadConfig(): Promise<void> {
    try {
      const config = await firstValueFrom(this.repositoryService.getPdvConfig());
      if (config) {
        this.umbralBaja = config.umbralDiferenciaBaja || 5;
        this.umbralAlta = config.umbralDiferenciaAlta || 15;
      }
    } catch (e) {
      // Use defaults
    }
  }

  private async loadPrincipalMoneda(): Promise<void> {
    try {
      const monedas = await firstValueFrom(this.repositoryService.getMonedas());
      const principal = monedas.find((m: any) => m.principal);
      this.principalMonedaId = principal?.id || null;
    } catch (e) {
      // Ignore
    }
  }

  async loadCajas(): Promise<void> {
    this.loading = true;
    try {
      const cajas = await firstValueFrom(this.repositoryService.getCajas());
      const rows: CajaRow[] = [];

      for (const caja of cajas) {
        let totalVentas = 0;
        let saludColor = 'gray';
        let saludTooltip = '-';
        let diferenciaPct: number | null = null;

        // Total ventas
        if (caja.id) {
          try {
            const totals = await firstValueFrom(this.repositoryService.getVentasTotalByCaja(caja.id));
            const principalRow = totals.find((t: any) => t.monedaId === this.principalMonedaId);
            totalVentas = principalRow?.totalVentas || 0;
          } catch (e) {
            // Ignore
          }
        }

        // Indicador de salud (solo cajas cerradas con cierre)
        if (caja.estado === CajaEstado.CERRADO && caja.conteoCierre) {
          try {
            const resumen = await firstValueFrom(this.repositoryService.getResumenCaja(caja.id!));
            const esperado = resumen.esperadoPorMoneda[this.principalMonedaId!] || 0;
            const cierre = resumen.conteoCierre.find((c: any) => c.monedaId === this.principalMonedaId)?.total || 0;
            const diferencia = cierre - esperado;

            if (esperado > 0) {
              diferenciaPct = Math.abs(diferencia / esperado * 100);
              if (diferenciaPct <= this.umbralBaja) {
                saludColor = 'green';
                saludTooltip = `Diferencia: ${diferenciaPct.toFixed(1)}% (${diferencia >= 0 ? '+' : ''}${diferencia.toLocaleString()})`;
              } else if (diferenciaPct <= this.umbralAlta) {
                saludColor = 'yellow';
                saludTooltip = `Diferencia: ${diferenciaPct.toFixed(1)}% (${diferencia >= 0 ? '+' : ''}${diferencia.toLocaleString()})`;
              } else {
                saludColor = 'red';
                saludTooltip = `Diferencia: ${diferenciaPct.toFixed(1)}% (${diferencia >= 0 ? '+' : ''}${diferencia.toLocaleString()})`;
              }
            } else {
              saludColor = 'green';
              saludTooltip = 'Sin movimiento';
            }
          } catch (e) {
            saludColor = 'gray';
            saludTooltip = 'Error al calcular';
          }
        }

        rows.push({
          caja,
          cajeroNombre: (caja as any).createdBy?.persona?.nombre || '-',
          totalVentas,
          saludColor,
          saludTooltip,
          diferenciaPct,
        });
      }

      this.allCajaRows = rows;
      this.cajaRows = [...rows];
      this.loading = false;
    } catch (error) {
      console.error('Error loading cajas:', error);
      this.loading = false;
    }
  }

  loadUsuarios(): void {
    this.repositoryService.getUsuarios().subscribe(u => this.usuarios = u);
  }

  private _filterUsuarios(value: string): Observable<Usuario[]> {
    const filter = typeof value === 'string' ? value.toLowerCase() : '';
    return new Observable(observer => {
      observer.next(!filter ? this.usuarios : this.usuarios.filter(u =>
        u.persona?.nombre?.toLowerCase().includes(filter) || u.nickname?.toLowerCase().includes(filter)
      ));
      observer.complete();
    });
  }

  displayUsuario(usuario: Usuario): string {
    return usuario?.persona ? usuario.persona.nombre : '';
  }

  applyFilters(): void {
    const f = this.filterForm.value;
    let filtered = [...this.allCajaRows];

    if (f.cajaId) {
      filtered = filtered.filter(r => r.caja.id?.toString().includes(f.cajaId!));
    }
    if (f.fechaInicio || f.fechaFin) {
      const start = f.fechaInicio ? new Date(f.fechaInicio) : null;
      const end = f.fechaFin ? new Date(f.fechaFin) : null;
      if (end) end.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => {
        const d = f.dateType === 'apertura' ? new Date(r.caja.fechaApertura) : r.caja.fechaCierre ? new Date(r.caja.fechaCierre) : null;
        if (f.dateType === 'cierre' && !d) return false;
        if (start && end) return d && d >= start && d <= end;
        if (start) return d && d >= start;
        if (end) return d && d <= end;
        return true;
      });
    }
    if (f.usuario && typeof f.usuario === 'object') {
      const uid = (f.usuario as Usuario).id;
      if (uid) {
        filtered = filtered.filter(r => (r.caja as any).createdBy?.id === uid);
      }
    }
    this.cajaRows = filtered;
  }

  clearFilters(): void {
    this.filterForm.reset({ cajaId: '', dateType: 'apertura', fechaInicio: null, fechaFin: null, usuario: '' });
    this.cajaRows = [...this.allCajaRows];
  }

  verResumen(caja: Caja): void {
    this.dialog.open(ResumenCajaDialogComponent, {
      width: '80vw',
      height: '80vh',
      data: { cajaId: caja.id },
    });
  }

  goToConteo(caja: Caja): void {
    const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
      width: '80vw',
      height: '80vh',
      disableClose: true,
      data: { cajaId: caja.id, mode: 'conteo' }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snackBar.open('CONTEO ACTUALIZADO', 'CERRAR', { duration: 3000 });
        this.loadCajas();
      }
    });
  }

  /**
   * Genera (manual) un retiro por el efectivo del cierre de una caja CERRADA.
   * Queda pendiente de ingreso a una caja mayor (no toca saldos hasta ingresarlo).
   */
  async generarRetiroCierre(caja: Caja): Promise<void> {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmationDialogComponent, {
          width: '440px',
          data: {
            title: 'Generar retiro del cierre',
            message:
              `Se generará un retiro con el EFECTIVO contado en el cierre de la caja #${caja.id}.\n\n` +
              `Quedará PENDIENTE de ingreso a una caja mayor — el efectivo "se toca" recién cuando lo ingreses allí. ¿Continuar?`,
          },
        })
        .afterClosed(),
    );
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.generarRetiroCierreCaja(caja.id!));
      this.snackBar.open('Retiro del cierre generado (pendiente de ingreso a caja mayor)', 'CERRAR', {
        duration: 4000,
      });
    } catch (e) {
      console.error('Error generando retiro de cierre:', e);
      this.snackBar.open('No se pudo generar el retiro del cierre', 'CERRAR', { duration: 4000 });
    }
  }

  openCaja(): void {
    if (!this.currentUser) return;
    const openCaja = this.allCajaRows.find(r =>
      r.caja.estado === CajaEstado.ABIERTO && (r.caja as any).createdBy?.id === this.currentUser?.id
    );

    if (openCaja) {
      const dialogRef = this.dialog.open(CajaConfirmationDialogComponent, {
        width: '400px',
        data: { caja: openCaja.caja }
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result === 'new') this.openCreateCajaDialog(openCaja.caja.dispositivo?.id);
        else if (result === 'existing') this.goToConteo(openCaja.caja);
      });
    } else {
      this.openCreateCajaDialog();
    }
  }

  private openCreateCajaDialog(excludeDispositivoId?: number): void {
    const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
      width: '80vw',
      height: '80vh',
      disableClose: true,
      data: { excludeDispositivoId }
    });
    dialogRef.afterClosed().subscribe(result => {
      if (result?.success) {
        this.snackBar.open('CAJA ABIERTA CON ÉXITO', 'CERRAR', { duration: 3000 });
        this.loadCajas();
      }
    });
  }
}
