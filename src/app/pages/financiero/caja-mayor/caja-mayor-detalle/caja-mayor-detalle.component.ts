import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginatorModule, MatPaginator, PageEvent } from '@angular/material/paginator';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { confirmarSaldosNegativos, SaldoNegativoCheck } from 'src/app/shared/utils/saldo-negativo-confirm';
import { RegistrarIngresoDialogComponent } from '../registrar-ingreso-dialog/registrar-ingreso-dialog.component';
import { RegistrarEgresoDialogComponent } from '../registrar-egreso-dialog/registrar-egreso-dialog.component';
import { CreateEditGastoDialogComponent } from '../gastos/create-edit-gasto/create-edit-gasto-dialog.component';
import { EditMovimientoDialogComponent } from '../edit-movimiento-dialog/edit-movimiento-dialog.component';
import { CreateEditEntradaVariaDialogComponent } from '../entradas-varias/create-edit-entrada-varia/create-edit-entrada-varia-dialog.component';
import { CreateOperacionFinancieraDialogComponent } from '../operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component';
import { EmitirChequeDialogComponent } from '../cheques/emitir-cheque/emitir-cheque-dialog.component';

interface MovimientoConsolidado {
  fecha: Date;
  tipoMovimiento: string;
  detalles: { monedaSimbolo: string; formaPagoNombre: string; monto: number }[];
  responsableNombre: string;
  observacion: string;
  gastoId?: number;
  retiroCajaId?: number;
  movimientoIds: number[];
  esAnulacion: boolean;
}

@Component({
  selector: 'app-caja-mayor-detalle',
  templateUrl: './caja-mayor-detalle.component.html',
  styleUrls: ['./caja-mayor-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule,
    MatDividerModule,
    MatTooltipModule,
    MatMenuModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    DatePipe,
  ]
})
export class CajaMayorDetalleComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  cajaMayor: any = null;
  saldosPorFormaPago: { formaPagoNombre: string; monedas: { simbolo: string; denominacion: string; saldo: number }[] }[] = [];
  movimientosConsolidados: MovimientoConsolidado[] = [];
  loading = false;
  loadingMovimientos = false;
  movimientosColumns = ['fecha', 'tipoMovimiento', 'detalles', 'responsable', 'observacion', 'actions'];

  // Paginacion
  pageSize = 15;
  pageIndex = 0;
  total = 0;

  // Filtros
  filtrosForm!: FormGroup;
  showFiltros = false;
  tipoMovimientoOptions = [
    'INGRESO_RETIRO_CAJA', 'INGRESO_CIERRE_CAJA', 'INGRESO_ENTRADA_VARIA', 'INGRESO_OPERACION_FINANCIERA',
    'INGRESO_RETIRO_BANCO', 'TRANSFERENCIA_ENTRADA', 'AJUSTE_POSITIVO',
    'EGRESO_GASTO', 'EGRESO_COMPRA', 'EGRESO_CUOTA_COMPRA', 'EGRESO_CUOTA_PRESTAMO', 'EGRESO_VALE',
    'EGRESO_SALARIO', 'EGRESO_CHEQUE', 'EGRESO_OPERACION_FINANCIERA', 'EGRESO_DEPOSITO_BANCO',
    'EGRESO_CAJA_INICIAL', 'TRANSFERENCIA_SALIDA', 'AJUSTE_NEGATIVO', 'ANULACION'
  ];
  proveedores: any[] = [];
  responsables: any[] = [];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
  ) {}

  ngOnInit(): void {
    this.filtrosForm = this.fb.group({
      fechaDesde: [null],
      fechaHasta: [null],
      tipoMovimiento: [null],
      proveedorId: [null],
      responsableId: [null],
    });

    this.loadLookups();

    if (this.cajaMayor) {
      this.loadData();
    }
  }

  setData(data: any): void {
    if (data?.cajaMayor) {
      this.cajaMayor = data.cajaMayor;
      this.loadData();
    } else if (data?.cajaMayorIdShortcut) {
      // Llamado desde un acceso directo: solo recibimos el id.
      this.repositoryService.getCajaMayor(data.cajaMayorIdShortcut).subscribe({
        next: (cm) => {
          if (cm) {
            this.cajaMayor = cm;
            this.loadData();
          }
        },
        error: (e) => console.error('Error cargando caja mayor desde shortcut:', e),
      });
    }
  }

  private async loadLookups(): Promise<void> {
    try {
      const [proveedores, usuarios] = await Promise.all([
        firstValueFrom(this.repositoryService.getProveedores()),
        firstValueFrom(this.repositoryService.getUsuarios()),
      ]);
      this.proveedores = proveedores || [];
      this.responsables = usuarios || [];
    } catch (error) {
      console.error('Error loading lookups:', error);
    }
  }

  async loadData(): Promise<void> {
    if (!this.cajaMayor?.id) return;

    this.loading = true;
    try {
      const saldos = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(this.cajaMayor.id));
      this.saldosPorFormaPago = this.agruparSaldosPorFormaPago(saldos || []);
      await this.loadMovimientos();
    } catch (error) {
      console.error('Error loading caja mayor details:', error);
      this.snackBar.open('Error al cargar detalles de caja mayor', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  async loadMovimientos(): Promise<void> {
    if (!this.cajaMayor?.id) return;
    this.loadingMovimientos = true;
    try {
      const f = this.filtrosForm.value;
      const filtros: any = {
        page: this.pageIndex,
        pageSize: this.pageSize,
      };
      if (f.fechaDesde) filtros.fechaDesde = f.fechaDesde;
      if (f.fechaHasta) {
        const hasta = new Date(f.fechaHasta);
        hasta.setHours(23, 59, 59, 999);
        filtros.fechaHasta = hasta;
      }
      if (f.tipoMovimiento) filtros.tipoMovimiento = f.tipoMovimiento;
      if (f.proveedorId) filtros.proveedorId = f.proveedorId;
      if (f.responsableId) filtros.responsableId = f.responsableId;

      const result: any = await firstValueFrom(this.repositoryService.getCajaMayorMovimientos(this.cajaMayor.id, filtros));
      const items = result?.items || [];
      this.total = result?.total || 0;
      this.movimientosConsolidados = this.consolidarMovimientos(items);
    } catch (error) {
      console.error('Error loading movimientos:', error);
      this.snackBar.open('Error al cargar movimientos', 'Cerrar', { duration: 3000 });
    } finally {
      this.loadingMovimientos = false;
    }
  }

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.loadMovimientos();
  }

  toggleFiltros(): void {
    this.showFiltros = !this.showFiltros;
  }

  aplicarFiltros(): void {
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadMovimientos();
  }

  limpiarFiltros(): void {
    this.filtrosForm.reset();
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadMovimientos();
  }

  private agruparSaldosPorFormaPago(saldos: any[]): { formaPagoNombre: string; monedas: { simbolo: string; denominacion: string; saldo: number }[] }[] {
    // Solo mostrar formas de pago que movimentan caja (efectivo)
    const saldosEfectivo = saldos.filter(s => s.formaPago?.movimentaCaja === true);

    const map = new Map<string, { formaPagoNombre: string; monedas: { simbolo: string; denominacion: string; saldo: number }[] }>();

    for (const s of saldosEfectivo) {
      const fpNombre = s.formaPago?.nombre || 'EFECTIVO';
      if (!map.has(fpNombre)) {
        map.set(fpNombre, { formaPagoNombre: fpNombre, monedas: [] });
      }
      map.get(fpNombre)!.monedas.push({
        simbolo: s.moneda?.simbolo || '',
        denominacion: s.moneda?.denominacion || '',
        saldo: Number(s.saldo),
      });
    }

    return Array.from(map.values());
  }

  private consolidarMovimientos(movimientos: any[]): MovimientoConsolidado[] {
    const grupos = new Map<string, MovimientoConsolidado>();
    // Ordenar ascendente para que el movimiento original venga antes que su anulacion
    const ordenados = [...movimientos].sort(
      (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime(),
    );

    for (const mov of ordenados) {
      const gastoId = mov.gasto?.id;
      const retiroCajaId = mov.retiroCaja?.id;
      const isAnulacion = mov.tipoMovimiento === 'ANULACION';
      const key = gastoId ? `gasto-${gastoId}` :
                  retiroCajaId ? `retiro-${retiroCajaId}` :
                  `mov-${mov.id}`;

      // Si es anulacion vinculada a un gasto/retiro existente: solo marcar el grupo
      if (isAnulacion && (gastoId || retiroCajaId) && grupos.has(key)) {
        const grupo = grupos.get(key)!;
        grupo.esAnulacion = true;
        grupo.movimientoIds.push(mov.id);
        continue;
      }

      const detalle = {
        monedaSimbolo: mov.moneda?.simbolo || '-',
        formaPagoNombre: mov.formaPago?.nombre || '-',
        monto: Number(mov.monto),
      };

      if (grupos.has(key)) {
        const grupo = grupos.get(key)!;
        grupo.detalles.push(detalle);
        grupo.movimientoIds.push(mov.id);
      } else {
        grupos.set(key, {
          fecha: mov.fecha,
          tipoMovimiento: mov.tipoMovimiento,
          detalles: [detalle],
          responsableNombre: mov.responsable?.persona?.nombre || mov.responsable?.nickname || '-',
          observacion: mov.observacion || '-',
          gastoId,
          retiroCajaId,
          movimientoIds: [mov.id],
          esAnulacion: isAnulacion,
        });
      }
    }

    // Mostrar mas recientes primero
    return Array.from(grupos.values()).sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime(),
    );
  }

  registrarIngreso(): void {
    const dialogRef = this.dialog.open(RegistrarIngresoDialogComponent, {
      width: '550px',
      data: { cajaMayorId: this.cajaMayor?.id },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      } else {
        this.detectarYEscucharSubdialog([
          CreateEditEntradaVariaDialogComponent,
          CreateOperacionFinancieraDialogComponent,
        ]);
      }
    });
  }

  registrarEgreso(): void {
    const dialogRef = this.dialog.open(RegistrarEgresoDialogComponent, {
      width: '550px',
      data: { cajaMayorId: this.cajaMayor?.id },
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      } else {
        this.detectarYEscucharSubdialog([
          CreateEditGastoDialogComponent,
          CreateOperacionFinancieraDialogComponent,
          EmitirChequeDialogComponent,
        ]);
      }
    });
  }

  // Cuando un diálogo "selector" se cierra con false, puede haber abierto un sub-diálogo.
  // Buscamos el primer diálogo abierto que coincida con los componentes esperados,
  // y nos suscribimos a su cierre para recargar datos.
  private detectarYEscucharSubdialog(componentes: any[]): void {
    setTimeout(() => {
      const openDialogs = this.dialog.openDialogs;
      const sub = openDialogs.find(d => componentes.some(c => d.componentInstance instanceof c));
      if (sub) {
        sub.afterClosed().subscribe(r => {
          if (r) this.loadData();
        });
      }
    }, 300);
  }

  editarMovimiento(mov: MovimientoConsolidado): void {
    if (mov.gastoId) {
      // Editar gasto: abrir diálogo de gasto en modo edición
      const dialogRef = this.dialog.open(CreateEditGastoDialogComponent, {
        width: '700px',
        data: { cajaMayorId: this.cajaMayor?.id, gastoId: mov.gastoId },
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result) this.loadData();
      });
    } else {
      // Editar movimiento suelto (ajuste)
      const detalle = mov.detalles[0];
      const moneda = this.findMonedaBySimbolo(detalle?.monedaSimbolo);
      const formaPago = this.findFormaPagoByNombre(detalle?.formaPagoNombre);

      const dialogRef = this.dialog.open(EditMovimientoDialogComponent, {
        width: '450px',
        data: {
          movimientoId: mov.movimientoIds[0],
          tipoMovimiento: mov.tipoMovimiento,
          cajaMayorId: this.cajaMayor?.id,
          detalle: {
            monedaId: moneda?.id,
            formaPagoId: formaPago?.id,
            monto: detalle?.monto,
          },
          observacion: mov.observacion !== '-' ? mov.observacion : '',
        },
      });
      dialogRef.afterClosed().subscribe(result => {
        if (result) this.loadData();
      });
    }
  }

  private findMonedaBySimbolo(simbolo: string): any {
    // Buscar en saldos cargados
    for (const grupo of this.saldosPorFormaPago) {
      for (const m of grupo.monedas) {
        if (m.simbolo === simbolo) return m;
      }
    }
    return null;
  }

  private findFormaPagoByNombre(nombre: string): any {
    return null; // Se resuelve en el diálogo cargando lookups
  }

  async anularMovimiento(mov: MovimientoConsolidado): Promise<void> {
    if (mov.esAnulacion) return;

    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Movimiento',
        message: '¿Esta seguro que desea anular este movimiento? Se creara un contra-movimiento para revertir el saldo.',
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      // Si anular un ingreso dejaria saldo negativo, pedir confirmacion adicional
      const okSaldo = await this.verificarSaldoAnular(mov);
      if (!okSaldo) return;
      try {
        // Si es un gasto, anular el gasto completo
        if (mov.gastoId) {
          await firstValueFrom(this.repositoryService.anularGasto(mov.gastoId, 'ANULACION MANUAL'));
        } else {
          // Anular cada movimiento individual
          for (const movId of mov.movimientoIds) {
            await firstValueFrom(this.repositoryService.anularCajaMayorMovimiento(movId, 'ANULACION MANUAL'));
          }
        }
        this.snackBar.open('Movimiento anulado correctamente', 'Cerrar', { duration: 3000 });
        this.loadData();
      } catch (error) {
        console.error('Error anulando movimiento:', error);
        this.snackBar.open('Error al anular movimiento', 'Cerrar', { duration: 3000 });
      }
    }
  }

  // Si el movimiento a anular es un INGRESO, su contra-movimiento (egreso) puede
  // dejar el saldo negativo. Pre-validar y pedir confirmacion.
  private async verificarSaldoAnular(mov: MovimientoConsolidado): Promise<boolean> {
    const tipo = mov.tipoMovimiento || '';
    const esIngreso = tipo.startsWith('INGRESO_') || tipo === 'TRANSFERENCIA_ENTRADA' || tipo === 'AJUSTE_POSITIVO';
    if (!esIngreso) return true; // anular un egreso REPONE saldo, no lo deja negativo
    if (!this.cajaMayor?.id) return true;

    try {
      const saldos: any[] = await firstValueFrom(this.repositoryService.getCajaMayorSaldos(this.cajaMayor.id));
      const checks: SaldoNegativoCheck[] = [];
      // Sumar montos a debitar por (moneda+fp) — todos los detalles del grupo
      const map = new Map<string, { simbolo: string; denominacion: string; fp: string; monto: number }>();
      for (const d of mov.detalles) {
        const key = `${d.monedaSimbolo}-${d.formaPagoNombre}`;
        const existing = map.get(key);
        if (existing) {
          existing.monto += Number(d.monto);
        } else {
          map.set(key, {
            simbolo: d.monedaSimbolo,
            denominacion: '',
            fp: d.formaPagoNombre,
            monto: Number(d.monto),
          });
        }
      }
      for (const grupo of map.values()) {
        const s = (saldos || []).find(x => x.moneda?.simbolo === grupo.simbolo && x.formaPago?.nombre === grupo.fp);
        const saldoActual = s ? Number(s.saldo) : 0;
        checks.push({
          label: `${s?.moneda?.denominacion || grupo.simbolo} / ${grupo.fp}`,
          saldoActual,
          monto: grupo.monto,
          monedaSimbolo: grupo.simbolo,
        });
      }
      return confirmarSaldosNegativos(this.dialog, checks);
    } catch (e) {
      console.error('Error verificando saldo en anular:', e);
      return true;
    }
  }

  async cerrarCajaMayor(): Promise<void> {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cerrar Caja Mayor',
        message: '¿Esta seguro que desea cerrar la caja mayor "' + this.cajaMayor.nombre + '"? Esta accion no se puede deshacer.',
      }
    });

    const result = await firstValueFrom(dialogRef.afterClosed());
    if (result) {
      try {
        await firstValueFrom(this.repositoryService.updateCajaMayor(this.cajaMayor.id, { estado: 'CERRADA', fechaCierre: new Date() }));
        this.cajaMayor.estado = 'CERRADA';
        this.cajaMayor.fechaCierre = new Date();
        this.snackBar.open('Caja mayor cerrada correctamente', 'Cerrar', { duration: 3000 });
      } catch (error) {
        console.error('Error closing caja mayor:', error);
        this.snackBar.open('Error al cerrar caja mayor', 'Cerrar', { duration: 3000 });
      }
    }
  }
}
