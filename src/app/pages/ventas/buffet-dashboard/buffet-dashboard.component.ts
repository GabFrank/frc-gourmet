import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RepositoryService } from 'src/app/database/repository.service';
import { DashStatChipComponent } from 'src/app/shared/components/dashboard/stat-chip/dash-stat-chip.component';
import { DashSectionHeaderComponent } from 'src/app/shared/components/dashboard/section-header/dash-section-header.component';
import { BuffetMetricasResult } from 'src/app/shared/utils/buffet-metricas.util';

@Component({
  selector: 'app-buffet-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    DashStatChipComponent,
    DashSectionHeaderComponent,
  ],
  templateUrl: './buffet-dashboard.component.html',
  styleUrls: ['./buffet-dashboard.component.scss'],
})
export class BuffetDashboardComponent implements OnInit {
  loading = false;
  desde: string;
  hasta: string;
  metricas: BuffetMetricasResult | null = null;

  constructor(private repositoryService: RepositoryService) {
    const hoy = new Date();
    const iso = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    this.desde = iso;
    this.hasta = iso;
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading = true;
    this.repositoryService
      .getBuffetMetricas({
        desde: `${this.desde}T00:00:00`,
        hasta: `${this.hasta}T23:59:59`,
      })
      .subscribe({
        next: (res: BuffetMetricasResult) => {
          this.metricas = res;
          this.loading = false;
        },
        error: (err: any) => {
          console.error('Error cargando métricas de buffet:', err);
          this.loading = false;
        },
      });
  }
}
