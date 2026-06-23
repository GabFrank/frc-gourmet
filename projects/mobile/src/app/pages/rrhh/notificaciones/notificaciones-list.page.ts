import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { RepositoryService } from '@frc/shared-core';

interface NotifVM {
  id: number;
  titulo: string;
  mensaje: string;
  fecha: string;
  leida: boolean;
  prioridad?: string;
}

/** Vista (solo lectura) de Notificaciones RRHH. */
@Component({
  selector: 'app-notificaciones-list',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './notificaciones-list.page.html',
})
export class NotificacionesListPage implements OnInit {
  private readonly repo = inject(RepositoryService);

  items: NotifVM[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    this.repo.getNotificacionesRrhh().subscribe({
      next: (data: any) => {
        const arr: any[] = Array.isArray(data) ? data : data?.data || data?.items || [];
        this.items = arr.map((n: any) => ({
          id: n.id,
          titulo: n.titulo || '',
          mensaje: n.mensaje || '',
          fecha: n.fechaGenerada ? String(n.fechaGenerada).slice(0, 10) : '',
          leida: !!n.fechaLeida,
          prioridad: n.prioridad,
        }));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar las notificaciones';
        this.loading = false;
      },
    });
  }
}
