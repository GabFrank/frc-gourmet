import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { VerificarAcreditacionDialogComponent } from './verificar-acreditacion-dialog/verificar-acreditacion-dialog.component';
import { ConciliarCreditoDialogComponent } from './conciliacion/conciliar-credito-dialog.component';
import { ConciliacionesPosDialogComponent } from './conciliacion/conciliaciones-pos-dialog.component';

@Component({
  selector: 'app-list-acreditaciones-pos',
  templateUrl: './list-acreditaciones-pos.component.html',
  styleUrls: ['./list-acreditaciones-pos.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    DatePipe,
  ]
})
export class ListAcreditacionesPosComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  acreditaciones: any[] = [];
  total = 0;
  pageSize = 15;
  pageIndex = 0;
  loading = false;
  procesando = false;
  showFiltros = false;

  filtrosForm!: FormGroup;
  estadoOptions = ['PENDIENTE', 'ACREDITADO_AUTO', 'VERIFICADO', 'CON_DIFERENCIA'];
  maquinasPos: any[] = [];

  displayedColumns = ['fechaTransaccion', 'maquina', 'medio', 'cuenta', 'montoOriginal', 'comision', 'montoEsperado', 'montoAcreditado', 'fechaAcred', 'estado', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.filtrosForm = this.fb.group({
      estado: [null],
      maquinaPosId: [null],
      fechaDesde: [null],
      fechaHasta: [null],
    });
    this.loadLookups();
    // Lazy-on-access: procesar pendientes vencidas antes de cargar la lista,
    // asi el usuario ve el estado fresco sin esperar al scheduler de 5min.
    firstValueFrom(this.repositoryService.procesarAcreditacionesAuto())
      .catch(e => console.error('Error en procesar auto on open:', e))
      .finally(() => this.loadData());
  }
  setData(_d: any): void {}

  async loadLookups(): Promise<void> {
    try {
      const m = await firstValueFrom(this.repositoryService.getMaquinasPos());
      this.maquinasPos = m || [];
    } catch (e) { console.error(e); }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const f = this.filtrosForm.value;
      const filtros: any = { page: this.pageIndex, pageSize: this.pageSize };
      if (f.estado) filtros.estado = f.estado;
      if (f.maquinaPosId) filtros.maquinaPosId = f.maquinaPosId;
      if (f.fechaDesde) filtros.fechaDesde = f.fechaDesde;
      if (f.fechaHasta) {
        const h = new Date(f.fechaHasta); h.setHours(23, 59, 59, 999);
        filtros.fechaHasta = h;
      }
      const result: any = await firstValueFrom(this.repositoryService.getAcreditacionesPos(filtros));
      // «Vencida sin conciliar» (#320): pendiente con la fecha esperada ya pasada (máquina sin auto-acreditar).
      const ahora = Date.now();
      this.acreditaciones = (result?.items || []).map((a: any) => {
        const vencida = a.estado === 'PENDIENTE' && new Date(a.fechaEsperadaAcreditacion).getTime() < ahora;
        const estadoLabel = vencida ? 'VENCIDA SIN CONCILIAR' : String(a.estado || '').replace(/_/g, ' ');
        return { ...a, estadoLabel, estadoBg: this.estadoColor(vencida ? 'VENCIDA' : a.estado) };
      });
      this.total = result?.total || 0;
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar acreditaciones', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadData();
  }

  toggleFiltros(): void { this.showFiltros = !this.showFiltros; }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset();
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadData();
  }

  async procesarAuto(): Promise<void> {
    this.procesando = true;
    try {
      const r: any = await firstValueFrom(this.repositoryService.procesarAcreditacionesAuto());
      this.snackBar.open(`${r?.procesadas || 0} acreditaciones procesadas`, 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al procesar', 'Cerrar', { duration: 3000 });
    } finally {
      this.procesando = false;
    }
  }

  verificar(a: any): void {
    const ref = this.dialog.open(VerificarAcreditacionDialogComponent, {
      width: '500px',
      data: { acreditacion: a },
    });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  conciliarCredito(): void {
    const ref = this.dialog.open(ConciliarCreditoDialogComponent, { width: '960px', maxWidth: '95vw' });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  verConciliaciones(): void {
    const ref = this.dialog.open(ConciliacionesPosDialogComponent, { width: '1000px', maxWidth: '95vw' });
    ref.afterClosed().subscribe(r => { if (r) this.loadData(); });
  }

  estadoColor(estado: string): string {
    switch (estado) {
      case 'PENDIENTE': return '#1976d2';
      case 'ACREDITADO_AUTO': return '#ff9800';
      case 'VERIFICADO': return '#4caf50';
      case 'CON_DIFERENCIA': return '#f44336';
      case 'VENCIDA': return '#b26a00';
      default: return '#9e9e9e';
    }
  }
}
