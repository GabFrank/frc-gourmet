import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { CreateEditFuncionarioDialogComponent } from '../create-edit-funcionario-dialog/create-edit-funcionario-dialog.component';
import { DocumentViewerDialogComponent } from 'src/app/shared/components/document-viewer-dialog/document-viewer-dialog.component';
import { CambioCargoDialogComponent } from '../cambio-cargo-dialog/cambio-cargo-dialog.component';
import { CambioSalarioDialogComponent } from '../cambio-salario-dialog/cambio-salario-dialog.component';
import { EgresarFuncionarioDialogComponent } from '../egresar-funcionario-dialog/egresar-funcionario-dialog.component';
import { UploadDocumentoDialogComponent } from '../upload-documento-dialog/upload-documento-dialog.component';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { AsignarTurnoFuncionarioDialogComponent } from '../asignar-turno-dialog/asignar-turno-funcionario-dialog.component';

@Component({
  selector: 'app-funcionario-detalle',
  templateUrl: './funcionario-detalle.component.html',
  styleUrls: ['./funcionario-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTabsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    AsignarTurnoFuncionarioDialogComponent,
  ],
})
export class FuncionarioDetalleComponent implements OnInit {
  @Input() data: any;
  funcionarioId: number | null = null;
  funcionario: any = null;
  loading = false;

  historicoCargos: any[] = [];
  historicoSalarios: any[] = [];
  documentos: any[] = [];
  turnos: any[] = [];
  loadingHistorico = false;
  loadingDocumentos = false;
  loadingTurnos = false;

  cargosColumns = ['fechaDesde', 'fechaHasta', 'cargo', 'motivo'];
  salariosColumns = ['fechaVigencia', 'salarioAnterior', 'salarioNuevo', 'moneda', 'motivo'];
  documentosColumns = ['tipo', 'nombre', 'tamano', 'fechaSubida', 'vencimiento', 'actions'];
  turnosColumns = ['turno', 'horario', 'fechaDesde', 'fechaHasta', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
  ) {}

  setData(data: any): void {
    this.data = data;
    if (data?.funcionarioId) {
      this.funcionarioId = data.funcionarioId;
      this.loadFuncionario();
    }
  }

  ngOnInit(): void {
    if (this.data?.funcionarioId) {
      this.funcionarioId = this.data.funcionarioId;
      this.loadFuncionario();
    }
  }

  async loadFuncionario(): Promise<void> {
    if (!this.funcionarioId) return;
    this.loading = true;
    try {
      this.funcionario = await firstValueFrom(this.repositoryService.getFuncionario(this.funcionarioId));
      this.loadHistoricos();
      this.loadDocumentos();
      this.loadTurnos();
    } catch (error) {
      console.error('Error loading funcionario:', error);
      this.snackBar.open('Error al cargar funcionario', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  async loadHistoricos(): Promise<void> {
    if (!this.funcionarioId) return;
    this.loadingHistorico = true;
    try {
      const [hc, hs] = await Promise.all([
        firstValueFrom(this.repositoryService.getHistoricoCargos(this.funcionarioId)),
        firstValueFrom(this.repositoryService.getHistoricoSalarios(this.funcionarioId)),
      ]);
      this.historicoCargos = hc || [];
      this.historicoSalarios = hs || [];
    } catch (e) {
      console.error('Error cargando historicos:', e);
    } finally {
      this.loadingHistorico = false;
    }
  }

  async loadDocumentos(): Promise<void> {
    if (!this.funcionarioId) return;
    this.loadingDocumentos = true;
    try {
      this.documentos = await firstValueFrom(this.repositoryService.getFuncionarioDocumentos(this.funcionarioId)) || [];
    } catch (e) {
      console.error('Error cargando documentos:', e);
    } finally {
      this.loadingDocumentos = false;
    }
  }

  async loadTurnos(): Promise<void> {
    if (!this.funcionarioId) return;
    this.loadingTurnos = true;
    try {
      this.turnos = await firstValueFrom(this.repositoryService.getFuncionarioTurnos(this.funcionarioId)) || [];
    } catch (e) {
      console.error('Error cargando turnos del funcionario:', e);
    } finally {
      this.loadingTurnos = false;
    }
  }

  abrirAsignarTurno(): void {
    if (!this.funcionarioId || !this.funcionario) return;
    const nombre = `${this.funcionario.persona?.nombre || ''} ${this.funcionario.persona?.apellido || ''}`.trim();
    const ref = this.dialog.open(AsignarTurnoFuncionarioDialogComponent, {
      width: '560px',
      data: { funcionarioId: this.funcionarioId, funcionarioNombre: nombre },
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) {
        this.snackBar.open('Turno asignado', 'Cerrar', { duration: 2500 });
        this.loadTurnos();
      }
    });
  }

  editarTurno(t: any): void {
    if (!this.funcionarioId || !this.funcionario) return;
    const nombre = `${this.funcionario.persona?.nombre || ''} ${this.funcionario.persona?.apellido || ''}`.trim();
    const ref = this.dialog.open(AsignarTurnoFuncionarioDialogComponent, {
      width: '560px',
      data: {
        funcionarioId: this.funcionarioId,
        funcionarioNombre: nombre,
        funcionarioTurnoId: t.id,
        turnoId: t.turno?.id,
        fechaDesde: t.fechaDesde,
      },
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) {
        this.snackBar.open('Asignacion actualizada', 'Cerrar', { duration: 2500 });
        this.loadTurnos();
      }
    });
  }

  cerrarTurno(t: any): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Cerrar asignacion de turno',
        message: `Cerrar la asignacion del turno "${t.turno?.nombre || ''}" con fecha de hoy?`,
      },
    });
    ref.afterClosed().subscribe(async (ok) => {
      if (!ok) return;
      try {
        await firstValueFrom(this.repositoryService.cerrarFuncionarioTurno(t.id));
        this.snackBar.open('Asignacion cerrada', 'Cerrar', { duration: 2500 });
        this.loadTurnos();
      } catch (e: any) {
        console.error(e);
        this.snackBar.open(`Error: ${e?.message || 'no se pudo cerrar'}`, 'Cerrar', { duration: 4000 });
      }
    });
  }

  abrirEditar(): void {
    if (!this.funcionario) return;
    const ref = this.dialog.open(CreateEditFuncionarioDialogComponent, {
      width: '780px',
      data: { funcionario: this.funcionario },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.loadFuncionario(); });
  }

  abrirCambioCargo(): void {
    if (!this.funcionario) return;
    const ref = this.dialog.open(CambioCargoDialogComponent, {
      width: '560px',
      data: { funcionario: this.funcionario },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.loadFuncionario(); });
  }

  abrirCambioSalario(): void {
    if (!this.funcionario) return;
    const ref = this.dialog.open(CambioSalarioDialogComponent, {
      width: '640px',
      data: { funcionario: this.funcionario },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.loadFuncionario(); });
  }

  abrirEgreso(): void {
    if (!this.funcionario) return;
    const ref = this.dialog.open(EgresarFuncionarioDialogComponent, {
      width: '560px',
      data: { funcionario: this.funcionario },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.loadFuncionario(); });
  }

  abrirSubirDocumento(): void {
    if (!this.funcionarioId) return;
    const ref = this.dialog.open(UploadDocumentoDialogComponent, {
      width: '640px',
      data: { funcionarioId: this.funcionarioId },
    });
    ref.afterClosed().subscribe((res) => { if (res?.saved) this.loadDocumentos(); });
  }

  async eliminarDocumento(doc: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Eliminar documento',
        message: `¿Eliminar el documento "${doc.nombreArchivo}"? Esta accion borra el archivo del filesystem.`,
        confirmText: 'Eliminar',
        cancelText: 'Cancelar',
      },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.deleteFuncionarioDocumento(doc.id));
      this.snackBar.open('Documento eliminado', 'Cerrar', { duration: 2500 });
      this.loadDocumentos();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al eliminar documento', 'Cerrar', { duration: 3500 });
    }
  }

  verDocumento(doc: any): void {
    const url = doc.archivoUrl || (doc.rutaRelativa ? `app://${doc.rutaRelativa}` : null);
    if (!url) {
      this.snackBar.open('Documento sin URL', 'Cerrar', { duration: 2500 });
      return;
    }
    this.dialog.open(DocumentViewerDialogComponent, {
      width: '80vw',
      maxWidth: '1100px',
      height: '85vh',
      maxHeight: '900px',
      panelClass: 'document-viewer-panel',
      data: {
        url,
        fileName: doc.nombreArchivo,
        mimeType: doc.mimeType || 'application/octet-stream',
        title: doc.tipo ? `${doc.tipo} — ${doc.nombreArchivo}` : doc.nombreArchivo,
      },
    });
  }

  async descargarDocumento(doc: any): Promise<void> {
    try {
      const data = await firstValueFrom(this.repositoryService.getFuncionarioDocumentoBase64(doc.id));
      if (!data?.base64) {
        this.snackBar.open('Documento no disponible', 'Cerrar', { duration: 2500 });
        return;
      }
      const mime = data.mimeType || 'application/octet-stream';
      const link = document.createElement('a');
      link.href = `data:${mime};base64,${data.base64}`;
      link.download = doc.nombreArchivo;
      link.click();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al descargar documento', 'Cerrar', { duration: 3500 });
    }
  }
}
