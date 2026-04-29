import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TabsService } from 'src/app/services/tabs.service';
import { RepositoryService } from 'src/app/database/repository.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-list-notificaciones-rrhh',
  standalone: true,
  templateUrl: './list-notificaciones-rrhh.component.html',
  styleUrls: ['./list-notificaciones-rrhh.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatSelectModule,
    MatFormFieldModule,
    MatTooltipModule,
    MatMenuModule,
    MatDividerModule,
    MatCheckboxModule,
  ],
})
export class ListNotificacionesRrhhComponent implements OnInit {
  cargando = false;
  notificaciones: any[] = [];
  notificacionesFiltradas: any[] = [];

  soloNoLeidas = false;
  tipoFiltro = '';
  tiposDisponibles = [
    { value: '', label: 'Todos' },
    { value: 'CUMPLEANIOS', label: 'Cumpleanos' },
    { value: 'CUOTA_VENCIDA', label: 'Cuota Vencida' },
    { value: 'PRESTAMO_VENCIDO', label: 'Prestamo Vencido' },
    { value: 'VACACION_PROXIMA', label: 'Vacacion Proxima' },
    { value: 'LIQUIDACION_PENDIENTE', label: 'Liquidacion Pendiente' },
    { value: 'COMISION_PENDIENTE', label: 'Comision Pendiente' },
    { value: 'DOCUMENTO_VENCE', label: 'Documento Vence' },
  ];

  displayedColumns = ['prioridad', 'tipo', 'titulo', 'mensaje', 'funcionario', 'fecha', 'acciones'];

  constructor(
    private repo: RepositoryService,
    private tabs: TabsService,
    private snack: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  setData(_data: any): void {}

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      this.notificaciones = await firstValueFrom(
        this.repo.getNotificacionesRrhh({ soloNoLeidas: this.soloNoLeidas })
      );
      this.aplicarFiltros();
    } catch (_e) {
      this.snack.open('Error al cargar notificaciones', 'Cerrar', { duration: 3000 });
    } finally {
      this.cargando = false;
    }
  }

  aplicarFiltros(): void {
    let resultado = [...this.notificaciones];
    if (this.tipoFiltro) {
      resultado = resultado.filter(n => n.tipo === this.tipoFiltro);
    }
    if (this.soloNoLeidas) {
      resultado = resultado.filter(n => !n.fechaLeida);
    }
    this.notificacionesFiltradas = resultado;
  }

  async marcarLeida(notif: any): Promise<void> {
    if (notif.fechaLeida) return;
    try {
      await firstValueFrom(this.repo.marcarNotificacionLeida(notif.id));
      notif.fechaLeida = new Date();
      this.aplicarFiltros();
    } catch (_e) {
      this.snack.open('Error al marcar notificacion', 'Cerrar', { duration: 3000 });
    }
  }

  async marcarTodasLeidas(): Promise<void> {
    try {
      await firstValueFrom(this.repo.marcarTodasNotificacionesLeidas());
      this.snack.open('Todas las notificaciones marcadas como leidas', 'Cerrar', { duration: 3000 });
      await this.cargar();
    } catch (_e) {
      this.snack.open('Error al marcar notificaciones', 'Cerrar', { duration: 3000 });
    }
  }

  getNombreFuncionario(n: any): string {
    const f = n.funcionario;
    if (!f) return '';
    const p = f.persona;
    return p ? `${p.nombre} ${p.apellido || ''}`.trim() : `FUNC ${f.id}`;
  }

  getPrioridadColor(prioridad: string): string {
    switch (prioridad) {
      case 'ALTA': return 'chip-rojo';
      case 'MEDIA': return 'chip-amarillo';
      case 'BAJA': return 'chip-verde';
      default: return '';
    }
  }

  getTipoLabel(tipo: string): string {
    const t = this.tiposDisponibles.find(td => td.value === tipo);
    return t ? t.label : tipo;
  }
}
