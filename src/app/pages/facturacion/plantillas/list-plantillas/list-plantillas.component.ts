import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { TabsService } from '../../../../services/tabs.service';
import { FacturaPlantilla } from '../../../../database/entities/facturacion/factura-plantilla.entity';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { CreatePlantillaDialogComponent } from '../create-plantilla-dialog/create-plantilla-dialog.component';
import { FacturaPlantillaDesignerComponent } from '../designer/factura-plantilla-designer.component';

@Component({
  selector: 'app-list-plantillas',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-plantillas.component.html',
  styleUrls: ['./list-plantillas.component.scss'],
})
export class ListPlantillasComponent implements OnInit {
  plantillas: FacturaPlantilla[] = [];
  displayedColumns = ['nombre', 'tipo', 'tamano', 'predeterminada', 'activo', 'acciones'];
  isLoading = false;

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      this.plantillas = await firstValueFrom(this.repositoryService.getFacturaPlantillas());
    } catch (error) {
      console.error('Error loading plantillas:', error);
      this.snackBar.open('Error al cargar plantillas', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  create(): void {
    const ref = this.dialog.open(CreatePlantillaDialogComponent, { width: '520px' });
    ref.afterClosed().subscribe((created: FacturaPlantilla | undefined) => {
      if (created) {
        this.load();
        this.openDesigner(created);
      }
    });
  }

  openDesigner(p: FacturaPlantilla): void {
    this.tabsService.openTab(
      `Diseño: ${p.nombre}`,
      FacturaPlantillaDesignerComponent,
      { plantillaId: p.id },
      `plantilla-designer-${p.id}`,
      true,
    );
  }

  async setDefault(p: FacturaPlantilla): Promise<void> {
    try {
      await firstValueFrom(this.repositoryService.updateFacturaPlantilla(p.id!, { predeterminada: true }));
      this.snackBar.open('Plantilla marcada como predeterminada', 'Cerrar', { duration: 2500 });
      this.load();
    } catch (error: any) {
      this.snackBar.open(error?.message || 'Error', 'Cerrar', { duration: 4000 });
    }
  }

  remove(p: FacturaPlantilla): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '380px',
      data: { title: 'Eliminar plantilla', message: `¿Eliminar la plantilla "${p.nombre}"?` },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      firstValueFrom(this.repositoryService.deleteFacturaPlantilla(p.id!))
        .then(() => { this.snackBar.open('Plantilla eliminada', 'Cerrar', { duration: 2500 }); this.load(); })
        .catch((e) => this.snackBar.open(e?.message || 'No se pudo eliminar', 'Cerrar', { duration: 4000 }));
    });
  }
}
