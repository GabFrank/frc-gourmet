import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';
import { TabsService } from 'src/app/services/tabs.service';
import { CreateEditFuncionarioDialogComponent } from '../create-edit-funcionario-dialog/create-edit-funcionario-dialog.component';
import { FuncionarioDetalleComponent } from '../funcionario-detalle/funcionario-detalle.component';

@Component({
  selector: 'app-list-funcionarios',
  templateUrl: './list-funcionarios.component.html',
  styleUrls: ['./list-funcionarios.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
    MatDialogModule,
    MatTooltipModule,
    MatSlideToggleModule,
  ],
})
export class ListFuncionariosComponent implements OnInit {
  funcionarios: any[] = [];
  cargos: any[] = [];
  loading = false;
  busqueda = '';
  filtroCargoId: number | null = null;
  soloActivos = true;
  displayedColumns = ['codigo', 'nombre', 'cargo', 'fechaIngreso', 'salario', 'activo', 'actions'];

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
    private dialog: MatDialog,
    private tabsService: TabsService,
  ) {}

  ngOnInit(): void {
    this.loadCargos();
    this.loadData();
  }

  async loadCargos(): Promise<void> {
    try {
      this.cargos = await firstValueFrom(this.repositoryService.getCargos());
    } catch (e) {
      console.error('Error loading cargos:', e);
    }
  }

  async loadData(): Promise<void> {
    this.loading = true;
    try {
      this.funcionarios = await firstValueFrom(this.repositoryService.getFuncionarios({
        soloActivos: this.soloActivos,
        cargoId: this.filtroCargoId,
        busqueda: this.busqueda?.trim() || undefined,
      }));
    } catch (error) {
      console.error('Error loading funcionarios:', error);
      this.snackBar.open('Error al cargar funcionarios', 'Cerrar', { duration: 3500 });
    } finally {
      this.loading = false;
    }
  }

  buscar(): void {
    this.loadData();
  }

  limpiarFiltros(): void {
    this.busqueda = '';
    this.filtroCargoId = null;
    this.soloActivos = true;
    this.loadData();
  }

  abrirCrear(): void {
    const ref = this.dialog.open(CreateEditFuncionarioDialogComponent, {
      width: '780px',
      data: {},
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) this.loadData();
    });
  }

  abrirEditar(f: any): void {
    const ref = this.dialog.open(CreateEditFuncionarioDialogComponent, {
      width: '780px',
      data: { funcionario: f },
    });
    ref.afterClosed().subscribe((res) => {
      if (res?.saved) this.loadData();
    });
  }

  abrirDetalle(f: any): void {
    this.tabsService.openTab(
      `Funcionario: ${f.persona?.nombre || ''}`,
      FuncionarioDetalleComponent,
      { funcionarioId: f.id },
      `funcionario-detalle-${f.id}`,
      true,
    );
  }
}
