import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRippleModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from '@frc/shared-core';

interface ClienteVM {
  id: number;
  nombre: string;
  doc?: string;
  telefono?: string;
  tipo?: string;
}

/**
 * Buscar/crear cliente para asociar a la cuenta de una mesa — pantalla completa
 * (mismo patrón que "tomar pedido"). La búsqueda es proactiva (nombre/documento/
 * ruc). "Nuevo cliente" oculta el buscador y muestra el formulario de alta en la
 * MISMA pantalla. Al elegir o crear, asigna el cliente a la venta y vuelve.
 */
@Component({
  selector: 'app-cliente-mesa',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatRippleModule,
    MatSnackBarModule,
  ],
  templateUrl: './cliente-mesa.page.html',
  styleUrls: ['./mesas.scss'],
})
export class ClienteMesaPage implements OnInit {
  private readonly repo = inject(RepositoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);

  mesaId = 0;
  ventaId: number | null = null;
  titulo = 'Cliente';

  termino = '';
  resultados: ClienteVM[] = [];
  buscando = false;
  guardando = false;
  private searchTimer: any = null;

  modoCrear = false;
  nuevo = { nombre: '', documento: '', ruc: '', telefono: '' };

  ngOnInit(): void {
    this.mesaId = Number(this.route.snapshot.paramMap.get('id'));
    this.repo.getPdvMesa(this.mesaId).subscribe({
      next: (m: any) => {
        this.ventaId = m?.venta?.id ?? null;
        this.titulo = m?.numero != null ? `Mesa ${m.numero} — cliente` : 'Cliente';
      },
      error: () => {
        /* sin venta no se puede asignar; se avisa al elegir */
      },
    });
  }

  onTermino(valor: string): void {
    this.termino = (valor || '').toUpperCase();
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.termino.trim().length < 2) {
      this.resultados = [];
      return;
    }
    this.searchTimer = setTimeout(() => this.buscar(), 300);
  }

  buscar(): void {
    const t = this.termino.trim();
    if (t.length < 2) return;
    this.buscando = true;
    this.repo.getClientes({ termino: t } as any).subscribe({
      next: (data: any[]) => {
        this.resultados = (data || []).map((c) => this.toVM(c));
        this.buscando = false;
      },
      error: () => {
        this.snack.open('Error al buscar clientes', 'CERRAR', { duration: 3000 });
        this.buscando = false;
      },
    });
  }

  private toVM(c: any): ClienteVM {
    const nombre = [c.persona?.nombre, c.persona?.apellido].filter(Boolean).join(' ') || 'Cliente';
    const doc = c.ruc || c.persona?.documento || c.razon_social || undefined;
    return {
      id: c.id,
      nombre,
      doc,
      telefono: c.persona?.telefono || undefined,
      tipo: c.tipo_cliente?.nombre || undefined,
    };
  }

  abrirCrear(): void {
    if (this.termino.trim() && !this.nuevo.nombre) this.nuevo.nombre = this.termino.trim();
    this.modoCrear = true;
  }

  volverBuscar(): void {
    this.modoCrear = false;
  }

  async elegir(c: ClienteVM): Promise<void> {
    await this.asignar(c.id, c.nombre);
  }

  async crear(): Promise<void> {
    if (!this.nuevo.nombre.trim() || this.guardando) return;
    const api = (window as any).api;
    if (!api?.callIpc) {
      this.snack.open('No se pudo crear el cliente', 'CERRAR', { duration: 3000 });
      return;
    }
    this.guardando = true;
    try {
      const cli: any = await api.callIpc('crear-cliente-mesa', {
        nombre: this.nuevo.nombre,
        documento: this.nuevo.documento || undefined,
        ruc: this.nuevo.ruc || undefined,
        telefono: this.nuevo.telefono || undefined,
      });
      const nombre = cli?.persona?.nombre || this.nuevo.nombre.trim().toUpperCase();
      await this.asignar(cli?.id, nombre);
    } catch {
      this.snack.open('No se pudo crear el cliente', 'CERRAR', { duration: 4000 });
      this.guardando = false;
    }
  }

  private async asignar(clienteId: number, nombre: string): Promise<void> {
    if (!clienteId) return;
    if (!this.ventaId) {
      this.snack.open('La mesa no tiene una cuenta abierta', 'CERRAR', { duration: 3500 });
      return;
    }
    this.guardando = true;
    try {
      await firstValueFrom(
        this.repo.updateVenta(this.ventaId, {
          cliente: { id: clienteId },
          nombreCliente: nombre,
        } as any),
      );
      this.snack.open(`Cliente asignado: ${nombre}`, undefined, { duration: 1800 });
      this.location.back();
    } catch {
      this.snack.open('No se pudo asignar el cliente', 'CERRAR', { duration: 4000 });
      this.guardando = false;
    }
  }

  volver(): void {
    this.location.back();
  }
}
