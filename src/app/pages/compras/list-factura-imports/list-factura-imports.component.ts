import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { FacturaImportItem, FacturaImportService } from 'src/app/services/factura-import.service';
import { TabsService } from 'src/app/services/tabs.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { ImportarFacturaDialogComponent } from '../importar-factura-dialog/importar-factura-dialog.component';
import { CreateEditCompraComponent } from '../create-edit-compra/create-edit-compra.component';
import { CompraDetalleComponent } from '../compra-detalle/compra-detalle.component';

@Component({
  selector: 'app-list-factura-imports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatChipsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule,
    MatTableModule,
    MatTooltipModule,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './list-factura-imports.component.html',
  styleUrls: ['./list-factura-imports.component.scss'],
})
export class ListFacturaImportsComponent implements OnInit {
  @ViewChild(MatPaginator) paginator?: MatPaginator;

  loading = false;
  importing = false;
  items: FacturaImportItem[] = [];
  total = 0;
  page = 1;
  pageSize = 25;
  estadoFiltro: string | null = null;

  estadosDisponibles = [
    { value: null, label: 'Todos' },
    { value: 'PROCESANDO', label: 'Procesando' },
    { value: 'REQUIERE_REVISION', label: 'Requiere revisión' },
    { value: 'CONFIRMADO', label: 'Confirmado' },
    { value: 'ERROR', label: 'Error' },
    { value: 'DESCARTADO', label: 'Descartado' },
  ];

  displayedColumns = ['archivo', 'fecha', 'estado', 'modelo', 'tokens', 'compra', 'acciones'];

  constructor(
    private service: FacturaImportService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.service.list({ page: this.page, pageSize: this.pageSize, estado: this.estadoFiltro || undefined }).subscribe({
      next: (res) => {
        this.items = res.items || [];
        this.total = res.total || 0;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.snackBar.open('Error: ' + err?.message, 'Cerrar', { duration: 5000 });
      },
    });
  }

  filtrar(): void {
    this.page = 1;
    this.load();
  }

  onPage(e: PageEvent): void {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.load();
  }

  estadoChipClass(estado: string): string {
    switch (estado) {
      case 'CONFIRMADO': return 'chip-verde';
      case 'REQUIERE_REVISION': return 'chip-amarillo';
      case 'PROCESANDO': return 'chip-celeste';
      case 'ERROR': return 'chip-rojo';
      case 'DESCARTADO': return 'chip-gris';
      default: return '';
    }
  }

  costoTotal(it: FacturaImportItem): number {
    const inP = (it.tokensPrompt || 0) / 1000;
    const inC = (it.tokensCompletion || 0) / 1000;
    if (it.modeloUsado?.includes('mini')) {
      return inP * 0.00015 + inC * 0.0006;
    }
    return inP * 0.0025 + inC * 0.01;
  }

  proveedorDetectado(it: FacturaImportItem): string {
    if (!it.jsonValidado) return '';
    try {
      const j = JSON.parse(it.jsonValidado);
      return j?.proveedor?.nombre || '';
    } catch { return ''; }
  }

  totalDetectado(it: FacturaImportItem): number | null {
    if (!it.jsonValidado) return null;
    try {
      const j = JSON.parse(it.jsonValidado);
      return j?.documento?.totalDocumento || null;
    } catch { return null; }
  }

  async nuevaImportacion(): Promise<void> {
    if (this.importing) return;
    try {
      const pick = await firstValueFrom(this.service.pickFile());
      if (pick.canceled || !pick.filePath) return;
      this.importing = true;
      this.snackBar.open('Procesando con IA, esto puede tardar 10-30s...', 'Cerrar', { duration: 5000 });
      const proc = await firstValueFrom(this.service.process(pick.filePath));
      this.importing = false;
      if (!proc.success || !proc.documentoId) {
        this.snackBar.open('Error al procesar: ' + (proc.error || 'desconocido'), 'Cerrar', { duration: 7000 });
        this.load();
        return;
      }
      this.revisar(proc.documentoId);
    } catch (e: any) {
      this.importing = false;
      this.snackBar.open('Error: ' + e?.message, 'Cerrar', { duration: 6000 });
    }
  }

  revisar(documentoId: number): void {
    const ref = this.dialog.open(ImportarFacturaDialogComponent, {
      width: '95vw',
      maxWidth: '95vw',
      height: '90vh',
      data: { documentoId },
      panelClass: 'importar-factura-dialog-panel',
    });
    ref.afterClosed().subscribe((res: any) => {
      this.load();
      if (res?.compraId) {
        this.tabsService.openTab(
          `Compra #${res.compraId} (borrador)`,
          CreateEditCompraComponent,
          { mode: 'edit', compraId: res.compraId },
          `editar-compra-${res.compraId}`,
          true,
        );
      }
    });
  }

  reprocesar(it: FacturaImportItem): void {
    this.snackBar.open('Reprocesando con IA...', 'Cerrar', { duration: 4000 });
    this.service.reprocess(it.id).subscribe({
      next: (res) => {
        this.load();
        if (res.success) {
          this.snackBar.open('Reprocesado OK.', 'Cerrar', { duration: 3000 });
        } else {
          this.snackBar.open('Error: ' + res.error, 'Cerrar', { duration: 6000 });
        }
      },
      error: (err) => this.snackBar.open('Error: ' + err?.message, 'Cerrar', { duration: 5000 }),
    });
  }

  descartar(it: FacturaImportItem): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Descartar importación',
        message: `¿Confirma descartar la importación "${it.archivoNombre}"?`,
        confirmText: 'Descartar',
        cancelText: 'Cancelar',
      },
    });
    ref.afterClosed().subscribe((ok: boolean) => {
      if (!ok) return;
      this.service.descartar(it.id).subscribe({
        next: (res) => {
          if (res.success) {
            this.snackBar.open('Descartado.', 'Cerrar', { duration: 3000 });
            this.load();
          }
        },
        error: (err) => this.snackBar.open('Error: ' + err?.message, 'Cerrar', { duration: 5000 }),
      });
    });
  }

  verCompra(it: FacturaImportItem): void {
    if (!it.compra?.id) return;
    this.tabsService.openTab(
      `Compra #${it.compra.id}`,
      CompraDetalleComponent,
      { compraId: it.compra.id },
      `detalle-compra-${it.compra.id}`,
      true,
    );
  }
}
