import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificacionesService } from '../../../services/notificaciones.service';

interface ReceptorForm {
  id?: number;
  tipo: string;
  nombre: string;
  valor: string;
  personaId: number | null;
}

@Component({
  selector: 'app-configuracion-notificaciones',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatTooltipModule,
  ],
  templateUrl: './configuracion-notificaciones.component.html',
  styleUrls: ['./configuracion-notificaciones.component.scss'],
})
export class ConfiguracionNotificacionesComponent implements OnInit {
  loading = false;
  saving = false;

  // --- General / config ---
  globalActivo = false;
  smtpHost = '';
  smtpPort = '587';
  smtpSecure = false;
  smtpUser = '';
  smtpFrom = '';
  smtpFromName = '';
  smtpPassword = '';
  evolutionUrl = '';
  evolutionInstance = '';
  evolutionApiKey = '';
  secrets = { smtpPassword: false, evolutionApiKey: false };

  // --- Eventos ---
  eventos: any[] = [];
  canalEventoOpciones = [
    { value: 'AMBOS', label: 'Email y WhatsApp' },
    { value: 'EMAIL', label: 'Solo Email' },
    { value: 'WHATSAPP', label: 'Solo WhatsApp' },
  ];

  // --- Receptores ---
  receptores: any[] = [];
  personas: any[] = [];
  tipoReceptorOpciones = [
    { value: 'PERSONA', label: 'Persona del sistema' },
    { value: 'EMAIL', label: 'Email' },
    { value: 'NUMERO', label: 'Numero WhatsApp' },
    { value: 'GRUPO_WHATSAPP', label: 'Grupo WhatsApp' },
  ];
  receptorForm: ReceptorForm = this.emptyReceptorForm();

  // --- Suscripciones ---
  selectedEventoId: number | null = null;
  suscripciones: any[] = [];
  nuevoReceptorId: number | null = null;
  nuevoCanal = 'WHATSAPP';
  canalOpciones = [
    { value: 'WHATSAPP', label: 'WhatsApp' },
    { value: 'EMAIL', label: 'Email' },
  ];

  // --- Log ---
  logs: any[] = [];
  logTotal = 0;
  logPage = 0;
  logPageSize = 50;

  // --- Pruebas ---
  testEmailTo = '';
  testWhatsappTo = '';
  evolutionState = '';

  constructor(
    private notif: NotificacionesService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    this.cargarTodo();
  }

  private emptyReceptorForm(): ReceptorForm {
    return { tipo: 'EMAIL', nombre: '', valor: '', personaId: null };
  }

  private notify(msg: string, error = false): void {
    this.snackBar.open(msg, 'Cerrar', {
      duration: 4000,
      panelClass: error ? 'error-snackbar' : 'success-snackbar',
    });
  }

  cargarTodo(): void {
    this.loading = true;
    this.notif.getConfig().subscribe({
      next: (res) => {
        const map = new Map<string, string>();
        (res?.items || []).forEach((it: any) => map.set(it.clave, it.valor ?? ''));
        this.globalActivo = (map.get('NOTIF_GLOBAL_ACTIVO') || 'false') === 'true';
        this.smtpHost = map.get('NOTIF_SMTP_HOST') || '';
        this.smtpPort = map.get('NOTIF_SMTP_PORT') || '587';
        this.smtpSecure = (map.get('NOTIF_SMTP_SECURE') || 'false') === 'true';
        this.smtpUser = map.get('NOTIF_SMTP_USER') || '';
        this.smtpFrom = map.get('NOTIF_SMTP_FROM') || '';
        this.smtpFromName = map.get('NOTIF_SMTP_FROM_NAME') || '';
        this.evolutionUrl = map.get('NOTIF_EVOLUTION_URL') || '';
        this.evolutionInstance = map.get('NOTIF_EVOLUTION_INSTANCE') || '';
        this.secrets = res?.secrets || this.secrets;
        this.loading = false;
      },
      error: (e) => {
        this.loading = false;
        this.notify('Error al cargar configuracion: ' + (e?.message || e), true);
      },
    });
    this.cargarEventos();
    this.cargarReceptores();
    this.cargarLogs();
    this.notif.getPersonas().subscribe({
      next: (ps) => (this.personas = ps || []),
      error: () => (this.personas = []),
    });
  }

  // ===================== GENERAL =====================
  guardarConfig(): void {
    this.saving = true;
    const items = [
      { clave: 'NOTIF_GLOBAL_ACTIVO', valor: this.globalActivo ? 'true' : 'false' },
      { clave: 'NOTIF_SMTP_HOST', valor: this.smtpHost || '' },
      { clave: 'NOTIF_SMTP_PORT', valor: String(this.smtpPort || '587') },
      { clave: 'NOTIF_SMTP_SECURE', valor: this.smtpSecure ? 'true' : 'false' },
      { clave: 'NOTIF_SMTP_USER', valor: this.smtpUser || '' },
      { clave: 'NOTIF_SMTP_FROM', valor: this.smtpFrom || '' },
      { clave: 'NOTIF_SMTP_FROM_NAME', valor: this.smtpFromName || '' },
      { clave: 'NOTIF_EVOLUTION_URL', valor: this.evolutionUrl || '' },
      { clave: 'NOTIF_EVOLUTION_INSTANCE', valor: this.evolutionInstance || '' },
    ];
    this.notif.updateConfig(items).subscribe({
      next: () => {
        this.saving = false;
        this.notify('Configuracion guardada');
      },
      error: (e) => {
        this.saving = false;
        this.notify('Error al guardar: ' + (e?.message || e), true);
      },
    });
  }

  guardarSecretoSmtp(): void {
    if (!this.smtpPassword) return;
    this.notif.setSecret('smtp', this.smtpPassword).subscribe({
      next: () => {
        this.smtpPassword = '';
        this.secrets.smtpPassword = true;
        this.notify('Password SMTP guardado de forma segura');
      },
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  guardarSecretoEvolution(): void {
    if (!this.evolutionApiKey) return;
    this.notif.setSecret('evolution', this.evolutionApiKey).subscribe({
      next: () => {
        this.evolutionApiKey = '';
        this.secrets.evolutionApiKey = true;
        this.notify('API key de Evolution guardada de forma segura');
      },
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  probarEmail(): void {
    if (!this.testEmailTo) return;
    this.notif.testEmail(this.testEmailTo).subscribe({
      next: (r) => this.notify(r?.estado === 'ENVIADO' ? 'Email enviado correctamente' : 'No se envio: ' + (r?.error || ''), r?.estado !== 'ENVIADO'),
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  probarWhatsapp(): void {
    if (!this.testWhatsappTo) return;
    this.notif.testWhatsapp(this.testWhatsappTo).subscribe({
      next: (r) => this.notify(r?.estado === 'ENVIADO' ? 'WhatsApp enviado correctamente' : 'No se envio: ' + (r?.error || ''), r?.estado !== 'ENVIADO'),
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  verificarEvolution(): void {
    this.evolutionState = '...';
    this.notif.getEvolutionState().subscribe({
      next: (r) => (this.evolutionState = r?.state || 'desconocido'),
      error: (e) => (this.evolutionState = 'error: ' + (e?.message || e)),
    });
  }

  // ===================== EVENTOS =====================
  cargarEventos(): void {
    this.notif.getEventos().subscribe({
      next: (evs) => (this.eventos = evs || []),
      error: () => (this.eventos = []),
    });
  }

  toggleEvento(ev: any): void {
    this.notif.updateEvento(ev.id, { activo: ev.activo }).subscribe({
      next: () => this.notify(`Evento "${ev.nombre}" ${ev.activo ? 'activado' : 'desactivado'}`),
      error: (e) => {
        ev.activo = !ev.activo;
        this.notify('Error: ' + (e?.message || e), true);
      },
    });
  }

  cambiarCanalEvento(ev: any): void {
    this.notif.updateEvento(ev.id, { canal: ev.canal }).subscribe({
      next: () => this.notify('Canal actualizado'),
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  // ===================== RECEPTORES =====================
  cargarReceptores(): void {
    this.notif.getReceptores().subscribe({
      next: (rs) => (this.receptores = rs || []),
      error: () => (this.receptores = []),
    });
  }

  editarReceptor(r: any): void {
    this.receptorForm = {
      id: r.id,
      tipo: r.tipo,
      nombre: r.nombre,
      valor: r.valor || '',
      personaId: r.persona?.id || null,
    };
  }

  cancelarReceptor(): void {
    this.receptorForm = this.emptyReceptorForm();
  }

  guardarReceptor(): void {
    const f = this.receptorForm;
    if (!f.nombre) {
      this.notify('El nombre es obligatorio', true);
      return;
    }
    if (f.tipo === 'PERSONA' && !f.personaId) {
      this.notify('Selecciona una persona', true);
      return;
    }
    if (f.tipo !== 'PERSONA' && !f.valor) {
      this.notify('El valor (email/numero/grupo) es obligatorio', true);
      return;
    }
    const payload = {
      tipo: f.tipo,
      nombre: f.nombre,
      valor: f.tipo === 'PERSONA' ? null : f.valor,
      personaId: f.tipo === 'PERSONA' ? f.personaId : null,
    };
    const obs = f.id
      ? this.notif.updateReceptor(f.id, payload)
      : this.notif.createReceptor(payload);
    obs.subscribe({
      next: () => {
        this.notify('Receptor guardado');
        this.receptorForm = this.emptyReceptorForm();
        this.cargarReceptores();
      },
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  eliminarReceptor(r: any): void {
    this.notif.deleteReceptor(r.id).subscribe({
      next: () => {
        this.notify('Receptor eliminado');
        this.cargarReceptores();
      },
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  // ===================== SUSCRIPCIONES =====================
  onEventoSeleccionado(): void {
    if (!this.selectedEventoId) {
      this.suscripciones = [];
      return;
    }
    this.notif.getSuscripciones(this.selectedEventoId).subscribe({
      next: (ss) => (this.suscripciones = ss || []),
      error: () => (this.suscripciones = []),
    });
  }

  agregarSuscripcion(): void {
    if (!this.selectedEventoId || !this.nuevoReceptorId) {
      this.notify('Selecciona evento y receptor', true);
      return;
    }
    this.notif
      .createSuscripcion({ eventoId: this.selectedEventoId, receptorId: this.nuevoReceptorId, canal: this.nuevoCanal })
      .subscribe({
        next: () => {
          this.notify('Suscripcion agregada');
          this.nuevoReceptorId = null;
          this.onEventoSeleccionado();
        },
        error: (e) => this.notify('Error: ' + (e?.message || e), true),
      });
  }

  eliminarSuscripcion(s: any): void {
    this.notif.deleteSuscripcion(s.id).subscribe({
      next: () => {
        this.notify('Suscripcion eliminada');
        this.onEventoSeleccionado();
      },
      error: (e) => this.notify('Error: ' + (e?.message || e), true),
    });
  }

  // ===================== LOG =====================
  cargarLogs(): void {
    this.notif.getLogs({ page: this.logPage, pageSize: this.logPageSize }).subscribe({
      next: (res) => {
        this.logs = res?.items || [];
        this.logTotal = res?.total || 0;
      },
      error: () => (this.logs = []),
    });
  }

  paginaLogAnterior(): void {
    if (this.logPage > 0) {
      this.logPage--;
      this.cargarLogs();
    }
  }

  paginaLogSiguiente(): void {
    if ((this.logPage + 1) * this.logPageSize < this.logTotal) {
      this.logPage++;
      this.cargarLogs();
    }
  }
}
