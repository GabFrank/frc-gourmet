import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';

import { RepositoryService } from '../../../../database/repository.service';
import { ConfirmationDialogComponent } from '../../../../shared/components/confirmation-dialog/confirmation-dialog.component';
import { BuscarClienteDialogComponent } from '../../../../shared/components/buscar-cliente-dialog/buscar-cliente-dialog.component';
import { HasPermissionDirective } from '../../../../shared/directives/has-permission.directive';

type FiltroVinculo = 'TODAS' | 'VINCULADAS' | 'SIN_VINCULAR';

/** Fila con todo pre-computado: la vista no llama funciones. */
interface FilaCuenta {
  id: number;
  nombre: string;
  email: string | null;
  telefonoTexto: string;
  telefonoNota: string;
  pedidos: number;
  ultimoLogin: string | null;
  cliente: { id: number; nombre: string; ruc: string | null; credito: boolean } | null;
  vinculoTexto: string;
}

interface FilaHistorial {
  id: number;
  accion: string;
  accionTexto: string;
  cliente: string;
  usuario: string;
  fecha: string;
  motivo: string | null;
}

const ERRORES: Record<string, string> = {
  cuenta_no_encontrada: 'la cuenta ya no existe.',
  cuenta_ya_vinculada: 'la cuenta ya está vinculada a otro cliente. Desvinculala primero.',
  cliente_no_disponible: 'el cliente no existe o está inactivo.',
  cliente_ya_tiene_cuenta: 'ese cliente ya tiene otra cuenta web vinculada. Un cliente puede tener una sola.',
  motivo_requerido: 'indicá el motivo.',
  cuenta_cambio_reintentar: 'la cuenta cambió mientras tanto. Actualizá la lista.',
  datos_invalidos: 'datos inválidos.',
};

/**
 * F8b fase 1: cuentas de la tienda online y su vínculo con el Cliente interno. El vínculo es
 * manual (nunca por coincidencia de teléfono o correo) y queda registrado quién lo hizo.
 */
@Component({
  selector: 'app-list-cuentas-tienda',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatTableModule, MatPaginatorModule, MatButtonModule,
    MatIconModule, MatMenuModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatTooltipModule, MatSnackBarModule, MatDialogModule, HasPermissionDirective,
  ],
  templateUrl: './list-cuentas-tienda.component.html',
  styleUrls: ['./list-cuentas-tienda.component.scss'],
})
export class ListCuentasTiendaComponent implements OnInit {
  readonly columnas = ['cuenta', 'telefono', 'pedidos', 'ultimoLogin', 'cliente', 'acciones'];
  readonly opcionesVinculo: { valor: FiltroVinculo; texto: string }[] = [
    { valor: 'TODAS', texto: 'Todas' },
    { valor: 'VINCULADAS', texto: 'Vinculadas a un cliente' },
    { valor: 'SIN_VINCULAR', texto: 'Sin vincular' },
  ];

  texto = '';
  vinculo: FiltroVinculo = 'TODAS';
  filas: FilaCuenta[] = [];
  total = 0;
  page = 1;
  pageSize = 25;
  cargando = false;
  procesandoId: number | null = null;

  historialDe: FilaCuenta | null = null;
  historial: FilaHistorial[] = [];
  historialVacio = false;

  constructor(private repo: RepositoryService, private dialog: MatDialog, private snack: MatSnackBar) {}

  ngOnInit(): void {
    this.cargar();
  }

  buscar(): void {
    this.page = 1;
    this.cargar();
  }

  limpiar(): void {
    this.texto = '';
    this.vinculo = 'TODAS';
    this.buscar();
  }

  cambiarPagina(e: PageEvent): void {
    this.page = e.pageIndex + 1;
    this.pageSize = e.pageSize;
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando = true;
    try {
      const res: any = await firstValueFrom(this.repo.getCuentasTienda({
        texto: this.texto.trim() || undefined, vinculo: this.vinculo, page: this.page, pageSize: this.pageSize,
      }));
      this.total = Number(res?.total) || 0;
      this.filas = (res?.data || []).map((c: any) => this.mapFila(c));
      if (this.historialDe) {
        const sigue = this.filas.find((f) => f.id === this.historialDe!.id);
        if (sigue) await this.verHistorial(sigue); else this.cerrarHistorial();
      }
    } catch (e: any) {
      this.snack.open(`No se pudieron cargar las cuentas: ${e?.message || e}`, 'CERRAR', { duration: 5000 });
    } finally {
      this.cargando = false;
    }
  }

  private mapFila(c: any): FilaCuenta {
    const fecha = (d: any) => (d ? new Date(d).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : null);
    let telefonoTexto = '—';
    let telefonoNota = '';
    if (c.telefono) {
      telefonoTexto = c.telefono;
      telefonoNota = c.telefonoVerificado ? 'Verificado (ingreso por código)' : 'Sin verificar';
    } else if (c.telefonoContacto) {
      telefonoTexto = c.telefonoContacto;
      telefonoNota = 'De contacto, sin verificar';
    }
    const vinculoTexto = c.cliente
      ? [c.vinculadoPor ? `por ${c.vinculadoPor}` : '', fecha(c.vinculadoEn) || ''].filter(Boolean).join(' · ')
      : '';
    return {
      id: c.id,
      nombre: c.nombre || 'SIN NOMBRE',
      email: c.email || null,
      telefonoTexto,
      telefonoNota,
      pedidos: Number(c.pedidos) || 0,
      ultimoLogin: fecha(c.ultimoLogin),
      cliente: c.cliente,
      vinculoTexto,
    };
  }

  async vincular(f: FilaCuenta): Promise<void> {
    const elegido: any = await firstValueFrom(this.dialog.open(BuscarClienteDialogComponent, { width: '800px', maxWidth: '95vw' }).afterClosed());
    if (!elegido?.id) return;
    const nombreCli = (String(elegido.razon_social || '').trim() || [elegido.persona?.nombre, elegido.persona?.apellido].map((x: any) => String(x || '').trim()).filter(Boolean).join(' ') || `CLIENTE #${elegido.id}`);
    const nota = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      width: '480px',
      data: {
        title: 'Vincular cuenta web',
        message: `La cuenta «${f.nombre}» (${f.telefonoTexto}) queda unida al cliente ${nombreCli}. `
          + 'Sus próximos pedidos salen a nombre de ese cliente. Verificá que sea la misma persona.',
        confirmText: 'Vincular',
        cancelText: 'Volver',
        showInput: true,
        inputLabel: 'Nota (opcional): cómo se verificó',
        inputRequerido: false,
      },
    }).afterClosed());
    if (nota === undefined || nota === false || nota === null) return;
    await this.ejecutar(f.id, () => this.repo.vincularCuentaTienda(f.id, elegido.id, nota || undefined), `Cuenta vinculada a ${nombreCli}.`);
  }

  async desvincular(f: FilaCuenta): Promise<void> {
    if (!f.cliente) return;
    const motivo = await firstValueFrom(this.dialog.open(ConfirmationDialogComponent, {
      width: '480px',
      data: {
        title: 'Desvincular cuenta web',
        message: `La cuenta «${f.nombre}» deja de estar unida a ${f.cliente.nombre}. Los pedidos que ya hizo siguen a nombre de ese cliente.`,
        confirmText: 'Desvincular',
        cancelText: 'Volver',
        showInput: true,
        inputLabel: 'Motivo',
      },
    }).afterClosed());
    if (!motivo) return;
    await this.ejecutar(f.id, () => this.repo.desvincularCuentaTienda(f.id, motivo), 'Cuenta desvinculada.');
  }

  private async ejecutar(id: number, accion: () => any, ok: string): Promise<void> {
    this.procesandoId = id;
    try {
      const res: any = await firstValueFrom(accion());
      if (res?.success) {
        this.snack.open(ok, 'OK', { duration: 4000 });
      } else {
        this.snack.open(`No se pudo: ${ERRORES[res?.error] || res?.error || 'error desconocido'}`, 'CERRAR', { duration: 6000 });
      }
    } catch (e: any) {
      this.snack.open(`No se pudo: ${e?.message || e}`, 'CERRAR', { duration: 6000 });
    } finally {
      this.procesandoId = null;
      await this.cargar();
    }
  }

  async verHistorial(f: FilaCuenta): Promise<void> {
    this.historialDe = f;
    try {
      const res: any = await firstValueFrom(this.repo.getVinculosCuentaTienda(f.id));
      this.historial = (res?.data || []).map((h: any) => ({
        id: h.id,
        accion: h.accion,
        accionTexto: h.accion === 'VINCULAR' ? 'Vinculó' : 'Desvinculó',
        cliente: h.cliente?.nombre || '',
        usuario: h.usuario || '—',
        fecha: h.fecha ? new Date(h.fecha).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '',
        motivo: h.motivo || null,
      }));
      this.historialVacio = this.historial.length === 0;
    } catch (e: any) {
      this.snack.open(`No se pudo cargar el historial: ${e?.message || e}`, 'CERRAR', { duration: 5000 });
    }
  }

  cerrarHistorial(): void {
    this.historialDe = null;
    this.historial = [];
    this.historialVacio = false;
  }
}
