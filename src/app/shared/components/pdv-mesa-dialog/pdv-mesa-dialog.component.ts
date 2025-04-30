import { Component, OnInit, OnDestroy, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatMenuModule } from '@angular/material/menu';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MesaFormDialogComponent } from './mesa-form-dialog/mesa-form-dialog.component';
import { BatchMesaFormDialogComponent } from './batch-mesa-form-dialog/batch-mesa-form-dialog.component';
import { SectorFormDialogComponent } from './sector-form-dialog/sector-form-dialog.component';

/**
 * Interface representing a PdvMesa entity 
 */
interface PdvMesaEntity {
  id?: number;
  numero: number;
  cantidad_personas?: number;
  activo: boolean;
  reservado: boolean;
  sector?: SectorEntity;
  reserva?: any;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interface representing a Sector entity 
 */
interface SectorEntity {
  id?: number;
  nombre: string;
  activo: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

@Component({
  selector: 'app-pdv-mesa-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatMenuModule,
    MesaFormDialogComponent,
    BatchMesaFormDialogComponent,
    SectorFormDialogComponent
  ],
  templateUrl: './pdv-mesa-dialog.component.html',
  styleUrls: ['./pdv-mesa-dialog.component.scss']
})
export class PdvMesaDialogComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // Data for the mesa list
  mesas: PdvMesaEntity[] = [];
  filteredMesas: PdvMesaEntity[] = [];
  sectors: SectorEntity[] = [];
  
  // Filter form
  filterForm: FormGroup;
  
  // Display columns for the table
  displayedColumns: string[] = ['numero', 'capacidad', 'sector', 'activo', 'reservado', 'reserva', 'actions'];
  
  // Loading state
  loading = false;
  submitting = false;
  
  constructor(
    private dialogRef: MatDialogRef<PdvMesaDialogComponent>,
    private dialog: MatDialog,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    @Inject(MAT_DIALOG_DATA) public data: any
  ) {
    this.filterForm = this.fb.group({
      numero: [''],
      sector_id: [''],
      activo: ['true'],
      reservado: ['']
    });
  }
  
  ngOnInit(): void {
    this.loadSectores();
    this.loadMesas();
    
    // Subscribe to filter changes
    this.filterForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.applyFilters());
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  // Method to load sectors
  loadSectores(): void {
    (window as any).api.getSectores()
      .then((response: SectorEntity[]) => {
        this.sectors = response;
      })
      .catch((error: any) => {
        console.error('Error loading sectors:', error);
        this.snackBar.open('Error al cargar sectores', 'Cerrar', { duration: 3000 });
      });
  }
  
  // Method to load all mesas
  loadMesas(): void {
    this.loading = true;
    
    (window as any).api.getPdvMesas()
      .then((response: PdvMesaEntity[]) => {
        this.mesas = response;
        this.applyFilters();
        this.loading = false;
      })
      .catch((error: any) => {
        console.error('Error loading mesas:', error);
        this.snackBar.open('Error al cargar mesas', 'Cerrar', { duration: 3000 });
        this.loading = false;
      });
  }
  
  // Apply filters to the mesa list
  applyFilters(): void {
    const filters = this.filterForm.value;
    
    this.filteredMesas = this.mesas.filter(mesa => {
      // Filter by table number
      if (filters.numero && mesa.numero.toString() !== filters.numero.toString()) {
        return false;
      }
      
      // Filter by sector
      if (filters.sector_id && (!mesa.sector || mesa.sector.id?.toString() !== filters.sector_id.toString())) {
        return false;
      }
      
      // Filter by active status
      if (filters.activo !== '' && mesa.activo.toString() !== filters.activo) {
        return false;
      }
      
      // Filter by reserved status
      if (filters.reservado !== '' && mesa.reservado.toString() !== filters.reservado) {
        return false;
      }
      
      return true;
    });
  }
  
  // Find the highest mesa number
  getNextMesaNumero(): number {
    if (this.mesas.length === 0) {
      return 1;
    }
    
    return Math.max(...this.mesas.map(mesa => mesa.numero)) + 1;
  }
  
  // Method to open the mesa form dialog for creating a new mesa
  openCreateMesaDialog(): void {
    const dialogRef = this.dialog.open(MesaFormDialogComponent, {
      width: '500px',
      data: { nextNumber: this.getNextMesaNumero() }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createMesa(result);
      }
    });
  }
  
  // Method to open the mesa form dialog for editing a mesa
  openEditMesaDialog(mesa: PdvMesaEntity): void {
    const dialogRef = this.dialog.open(MesaFormDialogComponent, {
      width: '500px',
      data: { mesa }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.updateMesa(mesa.id!, result);
      }
    });
  }
  
  // Method to open the batch mesa form dialog
  openBatchMesaDialog(): void {
    const dialogRef = this.dialog.open(BatchMesaFormDialogComponent, {
      width: '500px',
      data: { nextNumber: this.getNextMesaNumero() }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.createBatchMesas(result);
      }
    });
  }
  
  // Method to open the sector form dialog
  openSectorDialog(sector?: SectorEntity): void {
    const dialogRef = this.dialog.open(SectorFormDialogComponent, {
      width: '400px',
      data: { sector }
    });
    
    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        if (sector) {
          this.updateSector(sector.id!, result);
        } else {
          this.createSector(result);
        }
      }
    });
  }
  
  // Method to create a new mesa using provided data from dialog
  createMesa(mesaData: any): void {
    this.submitting = true;
    
    (window as any).api.createPdvMesa(mesaData)
      .then((response: PdvMesaEntity) => {
        this.mesas.push(response);
        this.applyFilters();
        this.snackBar.open('Mesa creada exitosamente', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      })
      .catch((error: any) => {
        console.error('Error creating mesa:', error);
        this.snackBar.open('Error al crear mesa', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      });
  }
  
  // Method to create batch mesas with provided data from dialog
  createBatchMesas(batchData: any): void {
    this.submitting = true;
    
    (window as any).api.createBatchPdvMesas(batchData)
      .then((response: PdvMesaEntity[]) => {
        this.mesas = [...this.mesas, ...response];
        this.applyFilters();
        this.snackBar.open(`${response.length} mesas creadas exitosamente`, 'Cerrar', { duration: 3000 });
        this.submitting = false;
      })
      .catch((error: any) => {
        console.error('Error creating batch mesas:', error);
        this.snackBar.open('Error al crear mesas en lote', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      });
  }
  
  // Method to create a sector
  createSector(sectorData: any): void {
    this.submitting = true;
    
    (window as any).api.createSector(sectorData)
      .then((response: SectorEntity) => {
        this.snackBar.open('Sector creado con éxito', 'Cerrar', { duration: 3000 });
        this.loadSectores();
        this.submitting = false;
      })
      .catch((error: any) => {
        console.error('Error creating sector:', error);
        this.snackBar.open('Error al crear sector', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      });
  }
  
  // Method to update a sector
  updateSector(id: number, sectorData: any): void {
    this.submitting = true;
    
    (window as any).api.updateSector(id, sectorData)
      .then((response: SectorEntity) => {
        this.snackBar.open('Sector actualizado con éxito', 'Cerrar', { duration: 3000 });
        this.loadSectores();
        this.loadMesas(); // Reload mesas to update sector info
        this.submitting = false;
      })
      .catch((error: any) => {
        console.error('Error updating sector:', error);
        this.snackBar.open('Error al actualizar sector', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      });
  }
  
  // Method to delete a sector
  deleteSector(id?: number): void {
    if (confirm('¿Está seguro que desea eliminar este sector?')) {
      (window as any).api.deleteSector(id)
        .then((response: boolean) => {
          this.snackBar.open('Sector eliminado con éxito', 'Cerrar', { duration: 3000 });
          this.loadSectores();
          this.loadMesas(); // Reload mesas to update sector info
        })
        .catch((error: any) => {
          console.error('Error deleting sector:', error);
          this.snackBar.open('Error al eliminar sector: ' + error.message, 'Cerrar', { duration: 5000 });
        });
    }
  }
  
  // Method to update a mesa
  updateMesa(id: number, mesaData: any): void {
    this.submitting = true;
    
    (window as any).api.updatePdvMesa(id, mesaData)
      .then((response: PdvMesaEntity) => {
        this.snackBar.open('Mesa actualizada con éxito', 'Cerrar', { duration: 3000 });
        this.loadMesas();
        this.submitting = false;
      })
      .catch((error: any) => {
        console.error('Error updating mesa:', error);
        this.snackBar.open('Error al actualizar mesa', 'Cerrar', { duration: 3000 });
        this.submitting = false;
      });
  }
  
  // Method to delete a mesa
  deleteMesa(id: number): void {
    if (confirm('¿Está seguro que desea eliminar esta mesa?')) {
      (window as any).api.deletePdvMesa(id)
        .then((response: boolean) => {
          this.snackBar.open('Mesa eliminada con éxito', 'Cerrar', { duration: 3000 });
          this.loadMesas();
        })
        .catch((error: any) => {
          console.error('Error deleting mesa:', error);
          this.snackBar.open('Error al eliminar mesa: ' + error.message, 'Cerrar', { duration: 5000 });
        });
    }
  }
  
  // Method to toggle a mesa's active status
  toggleActive(mesa: PdvMesaEntity): void {
    const updatedMesa = { ...mesa, activo: !mesa.activo };
    this.updateMesa(mesa.id!, updatedMesa);
  }
  
  // Method to toggle a mesa's reserved status
  toggleReserved(mesa: PdvMesaEntity): void {
    const updatedMesa = { ...mesa, reservado: !mesa.reservado };
    this.updateMesa(mesa.id!, updatedMesa);
  }
  
  // Close the dialog
  close(): void {
    this.dialogRef.close();
  }
} 