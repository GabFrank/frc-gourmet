import { Component, OnInit, Inject, ViewChild } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatSortModule, Sort, MatSort } from '@angular/material/sort';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RepositoryService } from 'src/app/database/repository.service';
import { Moneda } from 'src/app/database/entities/financiero/moneda.entity';
import { MonedaBillete } from 'src/app/database/entities/financiero/moneda-billete.entity';
import { ConfirmationDialogComponent } from 'src/app/shared/components/confirmation-dialog/confirmation-dialog.component';
import { CurrencyInputComponent } from 'src/app/shared/components/currency-input/currency-input.component';

@Component({
  selector: 'app-lista-billetes-dialog',
  templateUrl: './lista-billetes-dialog.component.html',
  styleUrls: ['./lista-billetes-dialog.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    NgClass,
    MatDialogModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatTableModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSortModule,
    MatTooltipModule,
    MatMenuModule,
    FormsModule,
    ReactiveFormsModule,
    ConfirmationDialogComponent,
    CurrencyInputComponent
  ]
})
export class ListaBilletesDialogComponent implements OnInit {
  displayedColumns: string[] = ['valor', 'activo', 'acciones'];
  dataSource = new MatTableDataSource<MonedaBillete>([]);
  moneda: Moneda;
  loading = false;
  saving = false;
  error: string | null = null;
  newBilleteValor: number | null = null;
  currentSort: Sort = { active: '', direction: '' };

  @ViewChild(MatSort) sort!: MatSort;

  constructor(
    private dialogRef: MatDialogRef<ListaBilletesDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { moneda: Moneda },
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog
  ) {
    this.moneda = data.moneda;
  }

  ngOnInit(): void {
    this.loadBilletes();
  }

  private loadBilletes(): void {
    this.loading = true;
    this.error = null;

    this.repositoryService.getMonedasBilletes().subscribe(
      (billetes) => {
        const filteredBilletes = billetes.filter(b => b.moneda && b.moneda.id === this.moneda.id);
        this.dataSource.data = filteredBilletes;
        this.loading = false;
      },
      (error) => {
        console.error('Error loading billetes:', error);
        this.error = 'Error al cargar los billetes de la moneda';
        this.loading = false;
      }
    );
  }

  sortData(sort: Sort): void {
    this.currentSort = sort;

    if (!sort.active || sort.direction === '') {
      return;
    }

    this.dataSource.data = this.dataSource.data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'valor': return this.compare(a.valor, b.valor, isAsc);
        default: return 0;
      }
    });
  }

  private compare(a: number, b: number, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }

  addBillete(): void {
    if (!this.newBilleteValor || this.newBilleteValor <= 0) {
      this.snackBar.open('Por favor ingrese un valor válido', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    // Format value for Guarani currency (no decimals)
    let formattedValue = this.newBilleteValor;
    if (this.moneda?.denominacion?.toUpperCase() === 'PYG' ||
        this.moneda?.denominacion?.toUpperCase() === 'GUARANI') {
      formattedValue = Math.round(formattedValue);
    }

    // Check if this value already exists
    const valueExists = this.dataSource.data.some(b => b.valor === formattedValue);
    if (valueExists) {
      this.snackBar.open('Esta denominación ya existe', 'Cerrar', {
        duration: 3000
      });
      return;
    }

    this.saving = true;

    const billeteData: Partial<MonedaBillete> = {
      moneda: this.moneda,
      valor: formattedValue,
      activo: true
    };

    this.repositoryService.createMonedaBillete(billeteData).subscribe(
      (result) => {
        // Create a new array with the added item to trigger change detection
        const currentData = [...this.dataSource.data];
        currentData.push(result);

        // Update the data source
        this.dataSource.data = currentData;

        // Re-apply the current sort if any
        if (this.currentSort.active && this.currentSort.direction) {
          this.sortData(this.currentSort);
        }

        this.newBilleteValor = null;
        this.saving = false;
        this.snackBar.open('Billete agregado exitosamente', 'Cerrar', {
          duration: 3000
        });
      },
      (error) => {
        console.error('Error creating billete:', error);
        this.saving = false;
        this.snackBar.open('Error al crear el billete', 'Cerrar', {
          duration: 3000
        });
      }
    );
  }

  toggleActivo(billete: MonedaBillete): void {
    this.saving = true;

    const billeteData: Partial<MonedaBillete> = {
      ...billete,
      activo: !billete.activo
    };

    this.repositoryService.updateMonedaBillete(billete.id!, billeteData).subscribe(
      () => {
        // Update the actual object in the array
        billete.activo = !billete.activo;

        // Refresh the data source to trigger change detection
        this.dataSource.data = [...this.dataSource.data];

        this.saving = false;
        this.snackBar.open(
          `Billete ${billete.activo ? 'activado' : 'desactivado'} exitosamente`,
          'Cerrar',
          { duration: 3000 }
        );
      },
      (error) => {
        console.error('Error toggling billete status:', error);
        this.saving = false;
        this.snackBar.open('Error al actualizar el billete', 'Cerrar', {
          duration: 3000
        });
      }
    );
  }

  deleteBillete(billete: MonedaBillete): void {
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, {
      width: '400px',
      data: {
        title: 'Eliminar Billete',
        message: `¿Está seguro que desea eliminar el billete de valor ${this.moneda.simbolo} ${billete.valor.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2})}?`
      }
    });

    dialogRef.afterClosed().subscribe(confirmed => {
      if (confirmed) {
        this.saving = true;

        this.repositoryService.deleteMonedaBillete(billete.id!).subscribe(
          () => {
            // Filter out the deleted item and update the data source
            this.dataSource.data = this.dataSource.data.filter(b => b.id !== billete.id);

            this.saving = false;
            this.snackBar.open('Billete eliminado exitosamente', 'Cerrar', {
              duration: 3000
            });
          },
          (error) => {
            console.error('Error deleting billete:', error);
            this.saving = false;
            this.snackBar.open('Error al eliminar el billete', 'Cerrar', {
              duration: 3000
            });
          }
        );
      }
    });
  }

  get billetes(): MonedaBillete[] {
    return this.dataSource.data;
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSave(): void {
    this.dialogRef.close(true);
  }
}
