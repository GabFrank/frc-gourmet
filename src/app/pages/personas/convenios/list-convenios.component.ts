import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../database/repository.service';
import { TabsService } from '../../../services/tabs.service';
import { ConfirmationDialogComponent } from '../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreateEditConvenioDialogComponent } from './create-edit-convenio-dialog/create-edit-convenio-dialog.component';
import { AsignarClientesDialogComponent } from './asignar-clientes-dialog/asignar-clientes-dialog.component';
import { CobroConsolidadoComponent } from './cobro-consolidado/cobro-consolidado.component';

@Component({
  selector: 'app-list-convenios',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-convenios.component.html',
  styleUrls: ['./list-convenios.component.scss'],
})
export class ListConveniosComponent implements OnInit {
  displayedColumns = ['nombre', 'contacto', 'clientes', 'deuda', 'estado', 'acciones'];
  convenios: any[] = [];
  loading = false;

  constructor(
    private repo: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  setData(_d: any): void {}

  async cargar(): Promise<void> {
    this.loading = true;
    try {
      this.convenios = (await firstValueFrom(this.repo.getConvenios())) || [];
    } catch (e: any) {
      this.snackBar.open('Error al cargar convenios', 'Cerrar', { duration: 4000 });
    } finally {
      this.loading = false;
    }
  }

  nuevo(): void {
    const ref = this.dialog.open(CreateEditConvenioDialogComponent, { data: {}, disableClose: true });
    ref.afterClosed().subscribe((r) => { if (r?.saved) this.cargar(); });
  }

  editar(convenio: any): void {
    const ref = this.dialog.open(CreateEditConvenioDialogComponent, { data: { convenio }, disableClose: true });
    ref.afterClosed().subscribe((r) => { if (r?.saved) this.cargar(); });
  }

  asignarClientes(convenio: any): void {
    const ref = this.dialog.open(AsignarClientesDialogComponent, { data: { convenio }, disableClose: true });
    ref.afterClosed().subscribe((r) => { if (r?.saved) this.cargar(); });
  }

  cobroConsolidado(convenio: any): void {
    this.tabsService.openTab(
      `Cobro: ${convenio.nombre}`,
      CobroConsolidadoComponent,
      { convenioId: convenio.id },
      `cobro-consolidado-${convenio.id}`,
      true,
    );
  }

  async eliminar(convenio: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: { title: 'Desactivar convenio', message: `¿Desactivar el convenio "${convenio.nombre}"?` },
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repo.deleteConvenio(convenio.id));
      this.snackBar.open('Convenio desactivado', 'Cerrar', { duration: 2500 });
      this.cargar();
    } catch (e: any) {
      this.snackBar.open('Error: ' + (e?.message || ''), 'Cerrar', { duration: 4000 });
    }
  }
}
