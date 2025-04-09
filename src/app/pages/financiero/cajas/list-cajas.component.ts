import { Component, OnInit, ViewChild, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTableModule, MatTable } from '@angular/material/table';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialogModule, MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { Caja, CajaEstado } from 'src/app/database/entities/financiero/caja.entity';
import { RepositoryService } from 'src/app/database/repository.service';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatMenuModule } from '@angular/material/menu';
import { MatDateRangeInput, MatDateRangePicker } from '@angular/material/datepicker';
import { debounceTime, distinctUntilChanged, map, startWith, switchMap } from 'rxjs/operators';
import { Observable, forkJoin } from 'rxjs';
import { Usuario } from 'src/app/database/entities/personas/usuario.entity';
import { CreateCajaDialogComponent } from './create-caja-dialog/create-caja-dialog.component';
import { AuthService } from 'src/app/services/auth.service';

// Create a dialog component for confirmation
@Component({
  selector: 'app-caja-confirmation-dialog',
  template: `
    <h2 mat-dialog-title>Caja ya abierta</h2>
    <mat-dialog-content>
      <p>Ya tienes una caja abierta en este dispositivo:</p>
      <div *ngIf="data.caja" class="caja-info">
        <div class="caja-info-item">
          <strong>ID:</strong> {{ data.caja.id }}
        </div>
        <div class="caja-info-item">
          <strong>Dispositivo:</strong> {{ data.caja.dispositivo?.nombre || 'N/A' }}
        </div>
        <div class="caja-info-item">
          <strong>Apertura:</strong> {{ data.caja.fechaApertura | date: 'dd/MM/yyyy HH:mm' }}
        </div>
        <div class="caja-info-item" *ngIf="data.caja.createdBy?.persona?.nombre">
          <strong>Cajero:</strong> {{ data.caja.createdBy?.persona?.nombre }}
        </div>
      </div>
      <p class="question">¿Qué deseas hacer?</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="'cancel'">Cancelar</button>
      <button mat-button [mat-dialog-close]="'new'">Abrir nueva caja</button>
      <button mat-raised-button color="primary" [mat-dialog-close]="'existing'">Ir a caja existente</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .caja-info {
      background-color: rgba(0, 0, 0, 0.04);
      padding: 12px;
      border-radius: 4px;
      margin: 12px 0;
    }
    .caja-info-item {
      margin-bottom: 8px;
    }
    .question {
      font-weight: 500;
      margin-top: 16px;
    }
    mat-dialog-actions {
      padding-top: 16px;
    }
  `],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule
  ]
})
export class CajaConfirmationDialogComponent {
  constructor(
    public dialogRef: MatDialogRef<CajaConfirmationDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { caja: CajaWithColors }
  ) {}
}

// Extended interface for Caja with additional UI properties
interface CajaWithColors {
  id?: number;
  dispositivo: any;
  fechaApertura: Date;
  fechaCierre?: Date;
  conteoApertura: any;
  conteoCierre?: any;
  estado: CajaEstado;
  activo: boolean;
  revisado: boolean;
  revisadoPor?: Usuario | any;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: any;
  updatedBy?: any;
  estadoColor: string;
}

@Component({
  selector: 'app-list-cajas',
  templateUrl: './list-cajas.component.html',
  styleUrls: ['./list-cajas.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    MatChipsModule,
    MatSnackBarModule,
    ReactiveFormsModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSlideToggleModule,
    MatButtonToggleModule,
    MatAutocompleteModule,
    MatMenuModule,
    CreateCajaDialogComponent
  ]
})
export class ListCajasComponent implements OnInit {
  displayedColumns: string[] = ['id', 'dispositivo', 'cajero', 'fechaApertura', 'fechaCierre', 'estado', 'actions'];
  originalData: CajaWithColors[] = [];
  dataSource: CajaWithColors[] = [];
  loading = true;
  error: string | null = null;
  cajaEstado = CajaEstado;
  currentUser: Usuario | null = null;

  // Map of estado values to their colors
  estadoColorMap = {
    [CajaEstado.ABIERTO]: 'primary',
    [CajaEstado.CERRADO]: 'accent',
    [CajaEstado.CANCELADO]: 'warn'
  };

  // Filter controls
  filterForm = new FormGroup({
    cajaId: new FormControl(''),
    dateType: new FormControl('apertura'),
    fechaInicio: new FormControl<Date | null>(null),
    fechaFin: new FormControl<Date | null>(null),
    usuario: new FormControl('')
  });

  // For usuario autocomplete
  filteredUsuarios: Observable<Usuario[]> = this.filterForm.get('usuario')!.valueChanges.pipe(
    startWith(''),
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(value => this._filterUsuarios(value || ''))
  );

  usuarios: Usuario[] = [];

  @ViewChild(MatPaginator) paginator!: MatPaginator;
  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatTable) table!: MatTable<CajaWithColors>;
  @ViewChild(MatDateRangePicker) rangePicker!: MatDateRangePicker<Date>;

  constructor(
    private repositoryService: RepositoryService,
    private dialog: MatDialog,
    private snackBar: MatSnackBar,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadCajas();
    this.loadUsuarios();
    this.getCurrentUser();

    // Subscribe to filter changes
    this.filterForm.valueChanges.pipe(
      debounceTime(500)
    ).subscribe(() => {
      this.applyFilters();
    });
  }

  getCurrentUser(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });
  }

  loadCajas(): void {
    this.loading = true;
    this.repositoryService.getCajas().subscribe(
      cajas => {
        // Process cajas to add color information
        this.originalData = cajas.map(caja => {
          return {
            ...caja,
            estadoColor: this.estadoColorMap[caja.estado] || ''
            // createdBy is already part of the caja object from BaseModel
          } as CajaWithColors;
        });

        this.dataSource = [...this.originalData];
        this.loading = false;

        // Initialize table with paginator and sort after data is loaded
        setTimeout(() => {
          if (this.paginator && this.sort && this.table) {
            this.dataSource = [...this.dataSource];
            this.table.dataSource = this.dataSource;
          }
        });
      },
      error => {
        console.error('Error loading cajas:', error);
        this.error = 'Error al cargar las cajas';
        this.loading = false;
      }
    );
  }

  loadUsuarios(): void {
    this.repositoryService.getUsuarios().subscribe(
      usuarios => {
        this.usuarios = usuarios;
      },
      error => {
        console.error('Error loading usuarios:', error);
      }
    );
  }

  private _filterUsuarios(value: string): Observable<Usuario[]> {
    const filterValue = typeof value === 'string' ? value.toLowerCase() : '';

    // Return all usuarios if no value
    if (!filterValue) {
      return new Observable(observer => {
        observer.next(this.usuarios);
        observer.complete();
      });
    }

    return new Observable(observer => {
      observer.next(this.usuarios.filter(usuario =>
        usuario.persona?.nombre?.toLowerCase().includes(filterValue) ||
        usuario.nickname?.toLowerCase().includes(filterValue)
      ));
      observer.complete();
    });
  }

  displayUsuario(usuario: Usuario): string {
    return usuario && usuario.persona ? usuario.persona.nombre : '';
  }

  applyFilters(): void {
    const filterValues = this.filterForm.value;

    let filteredData = [...this.originalData];

    // Filter by ID
    if (filterValues.cajaId) {
      const idFilter = filterValues.cajaId.toString().trim();
      if (idFilter) {
        filteredData = filteredData.filter(caja =>
          caja.id !== undefined && caja.id.toString().includes(idFilter)
        );
      }
    }

    // Filter by date range
    if (filterValues.fechaInicio || filterValues.fechaFin) {
      const startDate = filterValues.fechaInicio ? new Date(filterValues.fechaInicio) : null;
      const endDate = filterValues.fechaFin ? new Date(filterValues.fechaFin) : null;

      // Set end date to end of day if provided
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      if (startDate || endDate) {
        filteredData = filteredData.filter(caja => {
          const cajaDate = filterValues.dateType === 'apertura'
            ? new Date(caja.fechaApertura)
            : caja.fechaCierre ? new Date(caja.fechaCierre) : null;

          // Skip items with no fecha cierre if filtering by cierre
          if (filterValues.dateType === 'cierre' && !cajaDate) {
            return false;
          }

          if (startDate && endDate) {
            return cajaDate && cajaDate >= startDate && cajaDate <= endDate;
          } else if (startDate) {
            return cajaDate && cajaDate >= startDate;
          } else if (endDate) {
            return cajaDate && cajaDate <= endDate;
          }

          return true;
        });
      }
    }

    // Filter by usuario
    if (filterValues.usuario && typeof filterValues.usuario === 'object') {
      const usuario = filterValues.usuario as Usuario;
      if (usuario.id) {
        filteredData = filteredData.filter(caja =>
          // Check createdBy or revisadoPor
          (caja.createdBy && typeof caja.createdBy === 'object' && (caja.createdBy as Usuario).id === usuario.id) ||
          (caja.revisadoPor && typeof caja.revisadoPor === 'object' && (caja.revisadoPor as Usuario).id === usuario.id)
        );
      }
    }

    this.dataSource = filteredData;
    if (this.table) {
      this.table.dataSource = this.dataSource;
    }
  }

  clearFilters(): void {
    this.filterForm.reset({
      cajaId: '',
      dateType: 'apertura',
      fechaInicio: null,
      fechaFin: null,
      usuario: ''
    });
    this.dataSource = [...this.originalData];
    if (this.table) {
      this.table.dataSource = this.dataSource;
    }
  }

  // Method to check if the current user has an open caja
  checkForOpenCajas(): Observable<CajaWithColors[]> {
    if (!this.currentUser || !this.currentUser.id) {
      return new Observable(observer => {
        observer.next([]);
        observer.complete();
      });
    }

    // Instead of filtering the local data, we can make a more accurate query
    // by fetching fresh data from the server
    return new Observable(observer => {
      this.repositoryService.getCajas().subscribe(
        cajas => {
          // Filter for open cajas owned by the current user
          const openCajas = cajas
            .filter(caja =>
              caja.estado === CajaEstado.ABIERTO &&
              caja.createdBy &&
              caja.createdBy.id === this.currentUser?.id
            )
            .map(caja => ({
              ...caja,
              estadoColor: this.estadoColorMap[caja.estado] || ''
            } as CajaWithColors));

          observer.next(openCajas);
          observer.complete();
        },
        error => {
          console.error("Error checking for open cajas:", error);
          observer.next([]);
          observer.complete();
        }
      );
    });
  }

  // Method to open a new caja with confirmation check
  openCaja(): void {
    // First check if the user already has an open caja
    this.checkForOpenCajas().subscribe(openCajas => {
      if (openCajas.length > 0) {
        // User has at least one open caja, show confirmation dialog
        this.showCajaConfirmationDialog(openCajas[0]);
      } else {
        // User has no open cajas, proceed to create a new one
        this.openCreateCajaDialog();
      }
    });
  }

  // Show confirmation dialog for existing open caja
  showCajaConfirmationDialog(openCaja: CajaWithColors): void {
    const dialogRef = this.dialog.open(CajaConfirmationDialogComponent, {
      width: '400px',
      data: { caja: openCaja }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result === 'new') {
        // User wants to create a new caja despite having an open one
        // Pass the existing caja's dispositivo ID to prevent selecting the same device
        this.openCreateCajaDialog(openCaja.dispositivo?.id);
      } else if (result === 'existing') {
        // User wants to go to the existing caja
        this.goToConteo(openCaja);
      }
      // If 'cancel', do nothing
    });
  }

  // Open the create caja dialog
  openCreateCajaDialog(excludeDispositivoId?: number): void {
    const dialogRef = this.dialog.open(CreateCajaDialogComponent, {
      width: '80vw',
      height: '80vh',
      disableClose: true,
      data: {
        excludeDispositivoId: excludeDispositivoId // Pass the dispositivo ID to exclude
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        // Handle the result from the dialog
        this.processNewCaja(result);
      }
    });
  }

  // Process data from the dialog to create a new caja
  private processNewCaja(cajaData: any): void {
    if (cajaData.success) {
      this.snackBar.open('Caja abierta con éxito', 'Cerrar', {
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      });
    } else if (cajaData.error) {
      this.snackBar.open(`Error: ${cajaData.error}`, 'Cerrar', {
        duration: 5000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['error-snackbar']
      });
    }

    // Reload cajas in any case to ensure the list is up to date
    this.loadCajas();
  }

  // Method to handle menu actions
  handleAction(action: string, caja: CajaWithColors): void {
    switch (action) {
      case 'view':
        this.viewCaja(caja);
        break;
      case 'close':
        this.closeCaja(caja);
        break;
      case 'conteo':
        this.goToConteo(caja);
        break;
      default:
        console.error('Unknown action:', action);
    }
  }

  // Method to close a caja
  closeCaja(caja: CajaWithColors): void {
    // Logic to close a caja
    console.log('Close caja:', caja);
  }

  // Method to view caja details
  viewCaja(caja: CajaWithColors): void {
    // Logic to view caja details
    console.log('View caja:', caja);
  }

  // Method to go to conteo
  goToConteo(caja: CajaWithColors): void {
    // Open the CreateCajaDialogComponent with the selected caja data
    console.log('Going to conteo for caja:', caja);

    // Open the dialog with existing caja data for viewing/editing conteo
    const dialogRef = this.dialog.open(CreateCajaDialogComponent,{
      width: '80vw',
      height: '80vh',
      disableClose: true,
      data: {
        cajaId: caja.id,
        mode: 'conteo', // Special mode to indicate we're viewing conteo
        conteoAperturaId: caja.conteoApertura?.id // Pass the conteo apertura ID
      }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result && result.success) {
        this.snackBar.open('Conteo actualizado correctamente', 'Cerrar', {
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom'
        });
        // Reload cajas to reflect any changes
        this.loadCajas();
      } else if (result && result.error) {
        this.snackBar.open(`Error: ${result.error}`, 'Cerrar', {
          duration: 5000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['error-snackbar']
        });
      }
    });
  }
}
