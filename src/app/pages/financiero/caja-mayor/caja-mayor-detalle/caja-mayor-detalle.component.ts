import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormControl, FormGroup } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
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
import { CobrarCpcRapidoDialogComponent } from '../cuentas-por-cobrar/cobrar-cpc-rapido-dialog/cobrar-cpc-rapido-dialog.component';
import { RegistrarEgresoDialogComponent } from '../registrar-egreso-dialog/registrar-egreso-dialog.component';
import { CreateEditGastoDialogComponent } from '../gastos/create-edit-gasto/create-edit-gasto-dialog.component';
import { CreateEditValeDialogComponent } from '../../../rrhh/vales/create-edit-vale-dialog.component';
import { EditMovimientoDialogComponent } from '../edit-movimiento-dialog/edit-movimiento-dialog.component';
import { CreateEditEntradaVariaDialogComponent } from '../entradas-varias/create-edit-entrada-varia/create-edit-entrada-varia-dialog.component';
import { CreateOperacionFinancieraDialogComponent } from '../operaciones-financieras/create-operacion-financiera/create-operacion-financiera-dialog.component';
import { EmitirChequeDialogComponent } from '../cheques/emitir-cheque/emitir-cheque-dialog.component';
import { PagarComprasDialogComponent } from '../pagar-compras-dialog/pagar-compras-dialog.component';
import { MovimientosCuentaBancariaDialogComponent } from '../bancos/movimientos-cuenta-bancaria-dialog/movimientos-cuenta-bancaria-dialog.component';
import { TabsService } from 'src/app/services/tabs.service';

interface MovimientoConsolidado {
  fuente: 'CAJA' | 'BANCO';
  fuenteLabel: string;        // 'CAJA MAYOR' | nombre de cuenta (ej. 'STONE')
  fuenteCuentaId?: number;    // id de cuenta bancaria (filas de banco); undefined si CAJA
  fecha: Date;
  tipoMovimiento: string;
  tipoLabel: string;
  tipoIsIngreso: boolean;
  detalles: { monedaSimbolo: string; formaPagoNombre?: string; monto: number }[];
  responsableNombre: string;
  observacion: string;
  anulado: boolean;
  origen: string;             // 'GASTO'|'VALE'|'COBRO_CLIENTE'|... ('' para caja)
  gastoId?: number;
  retiroCajaId?: number;
  movimientoIds: number[];
  esAnulacion: boolean; // este grupo es un contra-movimiento (toggle "Ver anulaciones")
  anulacion?: {
    id: number;
    fecha: Date;
    motivo: string;
    responsableNombre: string | null;
  } | null;
  contraDeId?: number; // si esta fila ES la contra de otra (toggle ON), referencia al original
}

@Component({
  selector: 'app-caja-mayor-detalle',
  templateUrl: './caja-mayor-detalle.component.html',
  styleUrls: ['./caja-mayor-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatAutocompleteModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatButtonToggleModule,
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
  cuentasBancariasCards: Array<{
    id: number;
    nombre: string;
    banco: string;
    numeroCuenta: string;
    monedaSimbolo: string;
    saldo: number;
    saldoFuturo: number;
    saldoReservado: number;
  }> = [];
  // Cards CPP/CPC: visibilidad por config + buckets por moneda
  mostrarCpp = false;
  mostrarCpc = false;
  cppResumen: Array<{
    monedaId: number; monedaSimbolo: string; monedaDenominacion: string;
    esteMes: number; mesQueViene: number; total: number; vencidas: number;
  }> = [];
  cpcResumen: Array<{
    monedaId: number; monedaSimbolo: string; monedaDenominacion: string;
    esteMes: number; mesQueViene: number; total: number; vencidas: number;
  }> = [];
  // IDs de FPs visibles (null = sin config previa, mostrar todas).
  private formasPagoVisiblesIds: Set<number> | null = null;
  movimientosConsolidados: MovimientoConsolidado[] = [];
  loading = false;
  loadingMovimientos = false;
  movimientosColumns = ['fuente', 'fecha', 'tipoMovimiento', 'detalles', 'observacion', 'responsable', 'actions'];

  // Filtro de fuente del panel consolidado: 'TODO' | 'CAJA' | 'BANCO' | '<accountId>'
  fuenteFilter: string = 'TODO';

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
  filteredProveedores: any[] = [];
  proveedorControl = new FormControl<any | string | null>(null);
  selectedProveedor: any | null = null;
  responsables: any[] = [];

  // Etiquetas humanizadas para los tipos de movimiento (display only).
  private readonly tipoLabelMap: Record<string, string> = {
    INGRESO_RETIRO_CAJA: 'Retiro de Caja (entrada)',
    INGRESO_CIERRE_CAJA: 'Cierre de Caja',
    INGRESO_ENTRADA_VARIA: 'Entrada Varia',
    INGRESO_OPERACION_FINANCIERA: 'Operacion Financiera (entrada)',
    INGRESO_RETIRO_BANCO: 'Retiro de Banco',
    INGRESO_COBRO_CUOTA_PRESTAMO_FUNCIONARIO: 'Cobro cuota prestamo func.',
    INGRESO_COBRO_CUENTA_POR_COBRAR: 'Cobro cuenta por cobrar',
    TRANSFERENCIA_ENTRADA: 'Transferencia (entrada)',
    AJUSTE_POSITIVO: 'Ajuste (+)',
    EGRESO_GASTO: 'Gasto',
    EGRESO_COMPRA: 'Compra',
    EGRESO_CUOTA_COMPRA: 'Cuota compra',
    EGRESO_CUOTA_PRESTAMO: 'Cuota prestamo',
    EGRESO_VALE: 'Vale',
    EGRESO_SALARIO: 'Salario',
    EGRESO_CHEQUE: 'Cheque',
    EGRESO_OPERACION_FINANCIERA: 'Operacion Financiera (salida)',
    EGRESO_DEPOSITO_BANCO: 'Deposito a Banco',
    EGRESO_CAJA_INICIAL: 'Caja Inicial (salida)',
    EGRESO_DESEMBOLSO_PRESTAMO_FUNCIONARIO: 'Desembolso prestamo func.',
    TRANSFERENCIA_SALIDA: 'Transferencia (salida)',
    AJUSTE_NEGATIVO: 'Ajuste (-)',
    ANULACION: 'Anulacion',
  };

  tipoLabel(tipo: string): string {
    return this.tipoLabelMap[tipo] || tipo;
  }

  // Toggle para mostrar tambien las contra-anulaciones (default: ocultas)
  verAnulaciones = false;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.filtrosForm = this.fb.group({
      fechaDesde: [null],
      fechaHasta: [null],
      tipoMovimiento: [null],
      proveedorId: [null],
      responsableId: [null],
      esIngreso: [null], // null = todos, true = ingresos, false = egresos
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
      this.filteredProveedores = this.proveedores.slice(0, 50);
      this.setupProveedorAutocomplete();
      this.responsables = usuarios || [];
    } catch (error) {
      console.error('Error loading lookups:', error);
    }
  }

  private setupProveedorAutocomplete(): void {
    this.proveedorControl.valueChanges.subscribe(value => {
      if (typeof value === 'string') {
        const filter = value.toUpperCase();
        this.filteredProveedores = this.proveedores
          .filter(p => (p.nombre || '').toUpperCase().includes(filter))
          .slice(0, 50);
        if (this.selectedProveedor && (this.selectedProveedor.nombre || '').toUpperCase() !== filter) {
          this.selectedProveedor = null;
          this.filtrosForm.patchValue({ proveedorId: null });
        }
      } else {
        this.filteredProveedores = this.proveedores.slice(0, 50);
      }
    });
  }

  displayProveedor = (p: any): string => (p && typeof p === 'object') ? (p.nombre || '') : '';

  onProveedorSelected(proveedor: any): void {
    this.selectedProveedor = proveedor;
    this.filtrosForm.patchValue({ proveedorId: proveedor.id });
  }

  clearProveedor(): void {
    this.selectedProveedor = null;
    this.proveedorControl.setValue('');
    this.filtrosForm.patchValue({ proveedorId: null });
    this.filteredProveedores = this.proveedores.slice(0, 50);
  }

  async loadData(): Promise<void> {
    if (!this.cajaMayor?.id) return;

    this.loading = true;
    try {
      const [saldos, config] = await Promise.all([
        firstValueFrom(this.repositoryService.getCajaMayorSaldos(this.cajaMayor.id)),
        firstValueFrom(this.repositoryService.getCajaMayorConfiguracion(this.cajaMayor.id)),
      ]);

      // Aplica filtros de config: si no hay config, mostrar todas las FPs y ninguna CB.
      this.formasPagoVisiblesIds = config?.formasPagoVisibles
        ? new Set<number>((config.formasPagoVisibles as any[]).map((fp) => fp.id))
        : null;

      this.mostrarCpp = !!config?.mostrarCuentasPorPagar;
      this.mostrarCpc = !!config?.mostrarCuentasPorCobrar;

      this.saldosPorFormaPago = this.agruparSaldosPorFormaPago(saldos || []);

      const cbIds: number[] = config?.cuentasBancariasVisibles
        ? (config.cuentasBancariasVisibles as any[]).map((cb) => cb.id)
        : [];
      if (cbIds.length > 0) {
        const resumenes = await firstValueFrom(this.repositoryService.getCuentasBancariasResumenes(cbIds));
        this.cuentasBancariasCards = (resumenes || []).map((r: any) => ({
          id: r.id,
          nombre: r.nombre,
          banco: r.banco,
          numeroCuenta: r.numeroCuenta,
          monedaSimbolo: r.moneda?.simbolo || '-',
          saldo: Number(r.saldo) || 0,
          saldoFuturo: Number(r.saldoFuturo) || 0,
          saldoReservado: Number(r.saldoReservado) || 0,
        }));
      } else {
        this.cuentasBancariasCards = [];
      }

      // Resumenes CPP/CPC en paralelo (solo si configurados como visibles)
      const tareas: Promise<any>[] = [];
      if (this.mostrarCpp) {
        tareas.push(
          firstValueFrom(this.repositoryService.getCajaMayorCppResumen())
            .then((r) => (this.cppResumen = r || []))
            .catch((e) => { console.error('Error CPP resumen:', e); this.cppResumen = []; }),
        );
      } else {
        this.cppResumen = [];
      }
      if (this.mostrarCpc) {
        tareas.push(
          firstValueFrom(this.repositoryService.getCajaMayorCpcResumen())
            .then((r) => (this.cpcResumen = r || []))
            .catch((e) => { console.error('Error CPC resumen:', e); this.cpcResumen = []; }),
        );
      } else {
        this.cpcResumen = [];
      }
      if (tareas.length > 0) await Promise.all(tareas);

      await this.loadMovimientos();
    } catch (error) {
      console.error('Error loading caja mayor details:', error);
      this.snackBar.open('Error al cargar detalles de caja mayor', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  abrirConfiguracion(): void {
    if (!this.cajaMayor?.id) return;
    import('../configurar-caja-mayor-dialog/configurar-caja-mayor-dialog.component').then((m) => {
      const ref = this.dialog.open(m.ConfigurarCajaMayorDialogComponent, {
        width: '560px',
        data: { cajaMayorId: this.cajaMayor.id },
      });
      ref.afterClosed().subscribe((result) => {
        if (result) this.loadData();
      });
    });
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
      if (f.proveedorId) filtros.proveedorId = f.proveedorId;
      if (f.responsableId) filtros.responsableId = f.responsableId;
      if (f.esIngreso !== null && f.esIngreso !== undefined && f.esIngreso !== '') {
        filtros.esIngreso = f.esIngreso === true || f.esIngreso === 'true';
      }
      if (this.verAnulaciones) filtros.incluirAnulaciones = true;

      // Fuente y alcance de cuentas bancarias visibles para esta caja
      filtros.fuente = this.fuenteFilter;
      filtros.cuentasBancariasIds = this.cuentasBancariasCards.map((c) => c.id);

      const result: any = await firstValueFrom(
        this.repositoryService.getCajaMayorMovimientosConsolidados(this.cajaMayor.id, filtros),
      );
      this.movimientosConsolidados = result?.items || [];
      this.total = result?.total || 0;
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

  onToggleVerAnulaciones(): void {
    this.verAnulaciones = !this.verAnulaciones;
    this.pageIndex = 0;
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
    this.selectedProveedor = null;
    this.proveedorControl.setValue('', { emitEvent: false });
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadMovimientos();
  }

  private agruparSaldosPorFormaPago(saldos: any[]): { formaPagoNombre: string; monedas: { simbolo: string; denominacion: string; saldo: number }[] }[] {
    // Solo mostrar formas de pago que movimentan caja (efectivo)
    let saldosEfectivo = saldos.filter(s => s.formaPago?.movimentaCaja === true);

    // Si hay configuracion previa, restringir al subconjunto de FPs visibles.
    if (this.formasPagoVisiblesIds) {
      saldosEfectivo = saldosEfectivo.filter(s => this.formasPagoVisiblesIds!.has(s.formaPago?.id));
    }

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

  // Cambio del toggle de fuente (Todo / Caja / Banco / cuenta puntual)
  onFuenteChange(fuente: string): void {
    this.fuenteFilter = fuente;
    this.pageIndex = 0;
    if (this.paginator) this.paginator.firstPage();
    this.loadMovimientos();
  }

  // Abre el detalle de la cuenta bancaria de una fila de banco (solo lectura)
  verMovimientoBanco(row: MovimientoConsolidado): void {
    if (!row?.fuenteCuentaId) return;
    this.abrirMovimientosCuentaBancaria({ id: row.fuenteCuentaId, nombre: row.fuenteLabel });
  }

  abrirMovimientosCuentaBancaria(cb: any): void {
    if (!cb?.id) return;
    this.tabsService.openTabWithData(
      `Cuenta: ${cb.nombre}`,
      MovimientosCuentaBancariaDialogComponent,
      { cuentaBancariaId: cb.id, cuentaBancaria: cb },
      `cb-mov-${cb.id}`,
      true,
    );
  }

  async abrirCuentasPorPagar(): Promise<void> {
    const { ListCuentasPorPagarComponent } = await import(
      '../cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component'
    );
    this.tabsService.openTab('Cuentas por Pagar', ListCuentasPorPagarComponent);
  }

  async abrirCuentasPorCobrar(): Promise<void> {
    const { ListCuentasPorCobrarComponent } = await import(
      '../cuentas-por-cobrar/list-cuentas-por-cobrar/list-cuentas-por-cobrar.component'
    );
    this.tabsService.openTab('Cuentas por Cobrar', ListCuentasPorCobrarComponent);
  }

  cobrarCpcRapido(): void {
    const dialogRef = this.dialog.open(CobrarCpcRapidoDialogComponent, {
      width: '720px',
      maxHeight: '90vh',
      data: { cajaMayorId: this.cajaMayor?.id },
      disableClose: true,
    });
    dialogRef.afterClosed().subscribe((result) => {
      if (result?.success) {
        this.loadData();
      }
    });
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
          PagarComprasDialogComponent,
          CreateEditValeDialogComponent,
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
      const formaPago = this.findFormaPagoByNombre(detalle?.formaPagoNombre || '');

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
      } catch (error: any) {
        console.error('Error anulando movimiento:', error);
        const msg = this.extraerMensajeError(error) || 'Error al anular movimiento';
        this.snackBar.open(msg, 'Cerrar', { duration: 8000, panelClass: ['error-snackbar'] });
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
            fp: d.formaPagoNombre || '',
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

  private extraerMensajeError(error: any): string | null {
    if (!error) return null;
    const raw = error.message || (typeof error === 'string' ? error : '');
    if (!raw) return null;
    // Los errores que vienen del proceso main de Electron por IPC
    // suelen llegar prefijados con "Error invoking remote method '...': Error: <mensaje real>".
    const match = raw.match(/Error:\s*([^]*)$/);
    return (match ? match[1] : raw).trim();
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
