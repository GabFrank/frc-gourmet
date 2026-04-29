import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormBuilder } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { EmitirChequeDialogComponent } from '../emitir-cheque/emitir-cheque-dialog.component';
import { Optional, Inject } from '@angular/core';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

@Component({
  selector: 'app-list-cheques',
  templateUrl: './list-cheques.component.html',
  styleUrls: ['./list-cheques.component.scss'],
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    MatTableModule, MatButtonModule, MatIconModule, MatMenuModule, MatCardModule,
    MatProgressSpinnerModule, MatChipsModule, MatDialogModule, MatSnackBarModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatDatepickerModule,
    MatNativeDateModule, MatTooltipModule, MatPaginatorModule,
    DatePipe, DecimalPipe,
  ]
})
export class ListChequesComponent implements OnInit {
  cheques: any[] = [];
  chequeras: any[] = [];
  loading = false;
  total = 0;
  page = 0;
  pageSize = 15;
  pageSizeOptions = [10, 15, 25, 50];
  displayedColumns = ['fechaEmision', 'numeroCheque', 'chequera', 'beneficiario', 'monto', 'fechaPago', 'estado', 'actions'];

  filterForm!: FormGroup;
  estados = ['EMITIDO', 'DIFERIDO', 'COBRADO', 'ANULADO'];

  // Modo dialog: cuando se abre como historico de una chequera especifica
  esDialog = false;
  chequeraIdFijo: number | null = null;
  chequeraNombre = '';

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private fb: FormBuilder,
    @Optional() public dialogRef: MatDialogRef<ListChequesComponent>,
    @Optional() @Inject(MAT_DIALOG_DATA) public dialogData: any,
  ) {
    this.esDialog = !!dialogRef;
    this.chequeraIdFijo = this.dialogData?.chequeraId || null;
    this.chequeraNombre = this.dialogData?.chequeraNombre || '';
  }

  ngOnInit(): void {
    this.filterForm = this.fb.group({
      estado: [null],
      chequeraId: [this.chequeraIdFijo],
      fechaDesde: [null],
      fechaHasta: [null],
    });

    this.loadChequeras();
    this.loadData();
  }

  cerrarDialog(): void {
    this.dialogRef?.close();
  }

  setData(_data: any): void {}

  async loadChequeras(): Promise<void> {
    try {
      this.chequeras = await firstValueFrom(this.repositoryService.getChequeras());
    } catch (error) {
      console.error('Error loading chequeras:', error);
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      const filtros: any = { ...this.filterForm.value, page: this.page, pageSize: this.pageSize };
      const result = await firstValueFrom(this.repositoryService.getCheques(filtros));
      if (result && result.items) {
        this.cheques = result.items;
        this.total = result.total;
      } else {
        this.cheques = result || [];
        this.total = this.cheques.length;
      }
    } catch (error) {
      console.error('Error loading cheques:', error);
      this.snackBar.open('Error al cargar cheques', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPageChange(e: PageEvent): void {
    this.page = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadData();
  }

  aplicarFiltros(): void {
    this.page = 0;
    this.loadData();
  }

  limpiarFiltros(): void {
    this.filterForm.reset();
    this.page = 0;
    this.loadData();
  }

  openEmitirDialog(): void {
    const ref = this.dialog.open(EmitirChequeDialogComponent, {
      width: '720px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) this.loadData();
    });
  }

  async cobrar(cheque: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Cobrar Cheque',
        message: `¿Marcar el cheque #${cheque.numeroCheque} como COBRADO? Se descontara el saldo de la cuenta bancaria.`,
      }
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.cobrarCheque(cheque.id));
      this.snackBar.open('Cheque cobrado', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error: any) {
      console.error('Error cobrando cheque:', error);
      this.snackBar.open(error?.message || 'Error al cobrar cheque', 'Cerrar', { duration: 3000 });
    }
  }

  async anular(cheque: any): Promise<void> {
    const ref = this.dialog.open(ConfirmationDialogComponent, {
      data: {
        title: 'Anular Cheque',
        message: `¿Anular el cheque #${cheque.numeroCheque}? Si era diferido se liberara el saldo reservado.`,
      }
    });
    const ok = await firstValueFrom(ref.afterClosed());
    if (!ok) return;
    try {
      await firstValueFrom(this.repositoryService.anularCheque(cheque.id, 'ANULACION MANUAL'));
      this.snackBar.open('Cheque anulado', 'Cerrar', { duration: 3000 });
      this.loadData();
    } catch (error: any) {
      console.error('Error anulando cheque:', error);
      this.snackBar.open(error?.message || 'Error al anular cheque', 'Cerrar', { duration: 3000 });
    }
  }

  estadoColor(e: string): string {
    switch (e) {
      case 'EMITIDO': return '#1976d2';
      case 'DIFERIDO': return '#ff9800';
      case 'COBRADO': return '#4caf50';
      case 'ANULADO': return '#f44336';
      default: return '#757575';
    }
  }
}
