import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AppImagePipe } from '../../../core/pipes/app-image.pipe';

interface PrecioVM {
  texto: string;
  principal: boolean;
  tipoPrecio?: string;
  vigencia?: string;
  topes?: string;
}

interface PrecioGrupoVM {
  titulo: string;
  subtitulo?: string;
  precios: PrecioVM[];
}

interface DatoVM {
  label: string;
  valor: string;
}

/**
 * Detalle (solo lectura) de un producto: información general + precios por
 * presentación / receta / combo. La edición se hace en el escritorio.
 */
@Component({
  selector: 'app-producto-detalle',
  standalone: true,
  imports: [
    CommonModule, MatToolbarModule, MatIconModule, MatButtonModule,
    MatProgressBarModule, AppImagePipe,
  ],
  templateUrl: './producto-detalle.page.html',
  styleUrls: ['./producto-detalle.page.scss'],
})
export class ProductoDetallePage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);

  loading = true;
  error: string | null = null;

  nombre = 'Producto';
  tipo = '';
  imageUrl: string | null = null;
  datos: DatoVM[] = [];
  grupos: PrecioGrupoVM[] = [];

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    const api = (window as any).api;
    if (!api?.callIpc) {
      this.error = 'No disponible';
      this.loading = false;
      return;
    }
    api
      .callIpc('get-producto-detalle-mesa', id)
      .then((res: any) => {
        if (!res?.producto) {
          this.error = 'Producto no encontrado';
          this.loading = false;
          return;
        }
        this.construir(res);
        this.loading = false;
      })
      .catch(() => {
        this.error = 'No se pudo cargar el producto';
        this.loading = false;
      });
  }

  private construir(res: any): void {
    const p = res.producto;
    this.nombre = p.nombre || 'Producto';
    this.tipo = p.tipo || '';
    this.imageUrl = p.imageUrl ?? null;

    // --- Información general ---
    const datos: DatoVM[] = [];
    datos.push({ label: 'Tipo', valor: this.tipoLegible(p.tipo) });
    if (p.subfamilia?.familia?.nombre) datos.push({ label: 'Familia', valor: p.subfamilia.familia.nombre });
    if (p.subfamilia?.nombre) datos.push({ label: 'Subfamilia', valor: p.subfamilia.nombre });
    if (p.unidadBase) datos.push({ label: 'Unidad', valor: String(p.unidadBase) });
    if (p.iva != null) datos.push({ label: 'IVA', valor: `${p.iva}%` });
    datos.push({ label: 'Vendible', valor: p.esVendible ? 'Sí' : 'No' });
    datos.push({ label: 'Comprable', valor: p.esComprable ? 'Sí' : 'No' });
    if (p.controlaStock != null) datos.push({ label: 'Controla stock', valor: p.controlaStock ? 'Sí' : 'No' });
    if (p.tipo === 'BUFFET_POR_PESO') {
      if (p.taraGramos != null) datos.push({ label: 'Tara', valor: `${p.taraGramos} g` });
      if (p.pesoMinimoGramos != null) datos.push({ label: 'Peso mínimo', valor: `${p.pesoMinimoGramos} g` });
    }
    this.datos = datos;

    // --- Precios ---
    const grupos: PrecioGrupoVM[] = [];
    for (const pres of p.presentaciones || []) {
      const precios = (pres.preciosVenta || []).filter((pv: any) => pv.activo !== false);
      if (!precios.length) continue;
      grupos.push({
        titulo: pres.nombre || 'Presentación',
        subtitulo: pres.cantidad != null ? `Cantidad: ${pres.cantidad}` : undefined,
        precios: precios.map((pv: any) => this.toPrecioVM(pv, p.tipo === 'BUFFET_POR_PESO')),
      });
    }
    if ((res.preciosReceta || []).length) {
      grupos.push({
        titulo: 'Receta',
        precios: res.preciosReceta.map((pv: any) => this.toPrecioVM(pv, false)),
      });
    }
    if ((res.preciosProducto || []).length) {
      grupos.push({
        titulo: 'Precio directo',
        precios: res.preciosProducto.map((pv: any) => this.toPrecioVM(pv, false)),
      });
    }
    this.grupos = grupos;
  }

  private toPrecioVM(pv: any, esBuffet: boolean): PrecioVM {
    const dec = pv.moneda?.decimales ?? 0;
    const simbolo = pv.moneda?.simbolo || '';
    const valor = this.formatNum(Number(pv.valor) || 0, dec);
    let topes: string | undefined;
    if (esBuffet) {
      const partes: string[] = [];
      if (pv.precioMinimo != null) partes.push(`mín ${simbolo} ${this.formatNum(Number(pv.precioMinimo), dec)}`);
      if (pv.precioMaximo != null) partes.push(`tope ${simbolo} ${this.formatNum(Number(pv.precioMaximo), dec)}`);
      if (partes.length) topes = partes.join(' · ');
    }
    return {
      texto: `${simbolo} ${valor}${esBuffet ? ' / kg' : ''}`,
      principal: !!pv.principal,
      tipoPrecio: pv.tipoPrecio?.nombre || undefined,
      vigencia: this.vigencia(pv),
      topes,
    };
  }

  private vigencia(pv: any): string | undefined {
    const partes: string[] = [];
    if (pv.diasSemana) partes.push(pv.diasSemana);
    if (pv.horaInicio && pv.horaFin) partes.push(`${pv.horaInicio}–${pv.horaFin}`);
    return partes.length ? partes.join(' · ') : undefined;
  }

  private formatNum(n: number, dec: number): string {
    return n.toLocaleString('es-PY', { minimumFractionDigits: 0, maximumFractionDigits: dec });
  }

  private tipoLegible(tipo: string): string {
    const map: Record<string, string> = {
      RETAIL: 'Retail',
      RETAIL_INGREDIENTE: 'Retail / Ingrediente',
      ELABORADO_SIN_VARIACION: 'Elaborado',
      ELABORADO_CON_VARIACION: 'Elaborado con variación',
      COMBO: 'Combo',
      BUFFET_POR_PESO: 'Buffet por kilo',
    };
    return map[tipo] || tipo;
  }

  volver(): void {
    this.location.back();
  }
}
