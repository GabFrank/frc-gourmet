import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { CajaMayorDashboardComponent } from 'src/app/pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { abrirShortcut } from 'src/app/shared/utils/dashboard-shortcut-router';

interface AccesoRapido {
  titulo: string;
  descripcion: string;
  icono: string;
  color: string;
  key: string;
}

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatSnackBarModule,
  ]
})
export class HomeComponent implements OnInit {
  accesosRapidos: AccesoRapido[] = [
    {
      titulo: 'Caja Mayor',
      descripcion: 'Control financiero, gastos, retiros y movimientos',
      icono: 'account_balance',
      color: '#1b5e20',
      key: 'caja-mayor',
    },
  ];

  shortcuts: any[] = [];

  constructor(
    private tabsService: TabsService,
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.loadShortcuts();
  }

  setData(_data: any): void {}

  abrir(acceso: AccesoRapido): void {
    if (acceso.key === 'caja-mayor') {
      this.tabsService.openTab('Caja Mayor', CajaMayorDashboardComponent);
    }
  }

  async loadShortcuts(): Promise<void> {
    try {
      const list = await firstValueFrom(this.repositoryService.getDashboardShortcuts('HOME'));
      this.shortcuts = list || [];
    } catch (e) { console.error(e); }
  }

  abrirShortcut(s: any): void {
    abrirShortcut(s, this.tabsService);
  }

  async eliminarShortcut(s: any, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await firstValueFrom(this.repositoryService.deleteDashboardShortcut(s.id));
      this.snackBar.open('Acceso directo eliminado', 'Cerrar', { duration: 2000 });
      this.loadShortcuts();
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al eliminar', 'Cerrar', { duration: 3000 });
    }
  }
}
