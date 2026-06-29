import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '../../../../database/repository.service';
import { Factura } from '../../../../database/entities/facturacion/factura.entity';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { FacturarDialogComponent } from '../facturar-dialog/facturar-dialog.component';

@Component({
  selector: 'app-list-facturas',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './list-facturas.component.html',
  styleUrls: ['./list-facturas.component.scss'],
})
export class ListFacturasComponent implements OnInit {
  facturas: Factura[] = [];
  displayedColumns = ['numero', 'fecha', 'cliente', 'tipo', 'total', 'estado', 'acciones'];
  isLoading = false;
  filterForm: FormGroup;

  constructor(
    private fb: FormBuilder,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
  ) {
    this.filterForm = this.fb.group({ estado: [''], tipoFacturacion: [''] });
  }

  ngOnInit(): void {
    this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    try {
      const f = this.filterForm.value;
      const filtros: any = { limit: 200 };
      if (f.estado) filtros.estado = f.estado;
      if (f.tipoFacturacion) filtros.tipoFacturacion = f.tipoFacturacion;
      this.facturas = await firstValueFrom(this.repositoryService.getFacturas(filtros));
    } catch (error) {
      console.error('Error loading facturas:', error);
      this.snackBar.open('Error al cargar facturas', 'Cerrar', { duration: 3000 });
    } finally {
      this.isLoading = false;
    }
  }

  buscar(): void {
    this.load();
  }

  clearFilters(): void {
    this.filterForm.reset({ estado: '', tipoFacturacion: '' });
    this.load();
  }

  facturar(): void {
    const ref = this.dialog.open(FacturarDialogComponent, {
      width: '860px',
      maxHeight: '92vh',
      disableClose: true,
    });
    ref.afterClosed().subscribe((r) => { if (r) this.load(); });
  }

  anular(factura: Factura): void {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      width: '420px',
      data: {
        title: 'Anular factura',
        message: `¿Anular la factura ${factura.numeroCompleto || factura.id}? El número queda registrado como anulado.`,
      },
    });
    ref.afterClosed().subscribe((ok) => {
      if (!ok) return;
      firstValueFrom(this.repositoryService.anularFactura(factura.id!, 'ANULACION SOLICITADA POR USUARIO'))
        .then(() => { this.snackBar.open('Factura anulada', 'Cerrar', { duration: 2500 }); this.load(); })
        .catch((e) => this.snackBar.open(e?.message || 'No se pudo anular', 'Cerrar', { duration: 4000 }));
    });
  }
}
