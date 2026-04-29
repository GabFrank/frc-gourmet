import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-cliente-detalle',
  templateUrl: './cliente-detalle.component.html',
  styleUrls: ['./cliente-detalle.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatChipsModule,
    MatTooltipModule,
    MatPaginatorModule,
    DatePipe,
  ]
})
export class ClienteDetalleComponent implements OnInit {
  clienteId: number | null = null;
  cliente: any = null;
  saldoActual = 0;
  cuotasVencidas = 0;
  movimientos: any[] = [];
  totalMovimientos = 0;
  pageSize = 20;
  pageIndex = 0;
  loading = false;
  movColumns = ['fecha', 'tipo', 'monto', 'observacion'];

  constructor(
    private repositoryService: RepositoryService,
    private snackBar: MatSnackBar,
  ) {}

  ngOnInit(): void {
    if (this.clienteId) this.loadData();
  }

  setData(data: any): void {
    this.clienteId = data?.clienteId || null;
    if (this.clienteId) this.loadData();
  }

  async loadData(): Promise<void> {
    if (!this.clienteId) return;
    this.loading = true;
    try {
      const [cliente, saldoInfo, movs] = await Promise.all([
        firstValueFrom(this.repositoryService.getCliente(this.clienteId)),
        firstValueFrom(this.repositoryService.getSaldoCliente(this.clienteId)),
        firstValueFrom(this.repositoryService.getMovimientosCliente(this.clienteId, { page: this.pageIndex, pageSize: this.pageSize })),
      ]);
      this.cliente = cliente;
      this.saldoActual = (saldoInfo as any)?.saldoActual ?? 0;
      this.cuotasVencidas = (saldoInfo as any)?.cuotasVencidas ?? 0;
      const movsTyped = movs as any;
      this.movimientos = movsTyped?.items || movsTyped || [];
      this.totalMovimientos = movsTyped?.total || this.movimientos.length;
    } catch (e) {
      console.error(e);
      this.snackBar.open('Error al cargar', 'Cerrar', { duration: 3000 });
    } finally {
      this.loading = false;
    }
  }

  onPageChange(e: PageEvent): void {
    this.pageIndex = e.pageIndex;
    this.pageSize = e.pageSize;
    this.loadData();
  }

  clienteNombre(): string {
    return this.cliente?.razon_social || this.cliente?.persona?.nombre || '-';
  }

  tipoColor(tipo: string): string {
    switch (tipo) {
      case 'CARGO': return 'orange';
      case 'AJUSTE_POSITIVO': return 'orange';
      case 'PAGO': return 'green';
      case 'AJUSTE_NEGATIVO': return 'red';
      default: return 'gray';
    }
  }
}
