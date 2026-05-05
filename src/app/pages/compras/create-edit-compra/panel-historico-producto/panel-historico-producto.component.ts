import { Component, Input, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

@Component({
  selector: 'app-panel-historico-producto',
  standalone: true,
  templateUrl: './panel-historico-producto.component.html',
  styleUrls: ['./panel-historico-producto.component.scss'],
  imports: [
    CommonModule,
    MatTableModule,
    MatPaginatorModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    DecimalPipe,
    DatePipe,
  ],
})
export class PanelHistoricoProductoComponent implements OnInit {
  private _productoId: number | null = null;
  @Input()
  set productoId(v: number | null) {
    if (this._productoId === v) return;
    this._productoId = v;
    this.pageIndex = 0;
    if (v) this.load();
    else this.resetState();
  }
  get productoId(): number | null {
    return this._productoId;
  }

  readonly displayedColumns = ['fecha', 'proveedor', 'cantidad', 'costo'];

  items: any[] = [];
  total = 0;
  pageIndex = 0;
  pageSize = 5;
  pageSizeOptions = [5, 10, 25];
  loading = false;

  private requestId = 0;

  constructor(private repo: RepositoryService) {}

  ngOnInit(): void {}

  onPageChange(event: PageEvent): void {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }

  private async load(): Promise<void> {
    if (!this._productoId) {
      this.resetState();
      return;
    }
    const myReq = ++this.requestId;
    this.loading = true;
    try {
      const result = await firstValueFrom(this.repo.getUltimasComprasProducto({
        productoId: this._productoId,
        page: this.pageIndex,
        pageSize: this.pageSize,
      }));
      if (myReq !== this.requestId) return;
      this.items = result?.items || [];
      this.total = result?.total || 0;
    } catch (e) {
      console.error('Error cargando historico de compras', e);
      if (myReq !== this.requestId) return;
      this.items = [];
      this.total = 0;
    } finally {
      if (myReq === this.requestId) this.loading = false;
    }
  }

  private resetState(): void {
    this.items = [];
    this.total = 0;
    this.pageIndex = 0;
    this.loading = false;
  }
}
