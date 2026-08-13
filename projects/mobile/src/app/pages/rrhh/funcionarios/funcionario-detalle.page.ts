import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { forkJoin } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

/**
 * Detalle read-only del funcionario para mobile: datos básicos + resumen
 * financiero (vales, préstamos, consumo a crédito, total adeudado) y próximos
 * vencimientos. Los workflows (editar, liquidar) siguen siendo desktop.
 */
@Component({
  selector: 'app-funcionario-detalle',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressBarModule,
  ],
  templateUrl: './funcionario-detalle.page.html',
  styleUrls: ['./funcionario-detalle.page.scss'],
})
export class FuncionarioDetallePage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);

  id: number | null = null;
  funcionario: any = null;
  resumen: any = null;
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.id = raw ? Number(raw) : null;
    if (!this.id) { this.error = 'Funcionario inválido'; this.loading = false; return; }
    this.cargar();
  }

  cargar(): void {
    if (!this.id) return;
    this.loading = true;
    this.error = null;
    forkJoin({
      funcionario: this.repo.getFuncionario(this.id),
      resumen: this.repo.getFuncionarioResumenFinanciero(this.id),
    }).subscribe({
      next: ({ funcionario, resumen }) => {
        this.funcionario = funcionario;
        this.resumen = resumen;
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar el funcionario';
        this.loading = false;
      },
    });
  }
}
