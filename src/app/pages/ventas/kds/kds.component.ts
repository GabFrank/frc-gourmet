import { Component, OnInit, OnDestroy, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { firstValueFrom } from 'rxjs';
import { RepositoryService } from 'src/app/database/repository.service';

interface KdsRow {
  id: number;
  estado: string;
  observacion?: string;
  createdAt: string | Date;
  fechaEnPreparacion?: string | Date;
  fechaListo?: string | Date;
  sectorId: number | null;
  sectorNombre?: string;
  ventaId: number;
  ventaItemId: number;
  cantidad: number;
  ensambladoDescripcion?: string;
  productoNombre?: string;
  mesaNumero?: number;
  comandaCodigo?: string;
  comandaNumero?: number;
}

interface KdsItem {
  id: number;            // comandaItemId
  productoNombre: string;
  cantidad: number;
  observacion?: string;
  ensamblado?: string;
  estado: string;
  sectorNombre?: string;
}

interface KdsTicket {
  numero: number;        // posición (para el numpad/bump bar)
  ventaId: number;
  ref: string;           // MESA X / COMANDA Y
  createdAt: number;     // ms
  minutos: number;       // precomputado para el template
  semaforo: 'verde' | 'amarillo' | 'rojo';
  todoListo: boolean;
  items: KdsItem[];
}

/**
 * KDS (Kitchen Display System) — pantalla de cocina.
 *
 * Muestra las comandas en preparación agrupadas en tickets, filtradas por los
 * sectores que esta pantalla atiende. Tiempo real vía el canal IPC
 * `comanda-item-updates` (con poll de respaldo). Interacción por mouse (clic en
 * item/ticket) o teclado numérico (escribir el número del ticket + Enter = bump).
 *
 * Fase 1: se abre como tab en la misma PC. Reusable tal cual cuando se sirva
 * standalone para Google TV (Fase 3) — la fuente de datos abstrae IPC/HTTP.
 */
@Component({
  selector: 'app-kds',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatChipsModule,
    MatTooltipModule,
    MatSlideToggleModule,
  ],
  templateUrl: './kds.component.html',
  styleUrls: ['./kds.component.scss'],
})
export class KdsComponent implements OnInit, OnDestroy {
  sectores: any[] = [];
  sectorChips: { id: number; nombre: string; activo: boolean }[] = [];
  selectedSectorIds: number[] = [];
  pantallas: any[] = [];
  pantallaId: number | null = null;
  tickets: KdsTicket[] = [];
  allDay = false;
  allDayResumen: { nombre: string; total: number }[] = [];
  loading = false;
  conectado = false;
  numpadBuffer = '';

  // Umbrales de semáforo (minutos). Fase 2 los hará configurables por pantalla.
  umbralAmarillo = 5;
  umbralRojo = 10;

  private rawRows: KdsRow[] = [];
  private offComandaEvent?: () => void;
  private eventSource?: EventSource;
  private pollTimer?: any;
  private tickTimer?: any;
  private reloadDebounce?: any;

  private readonly LS_KEY = 'kds.sectores';

  // Modo web (servido a Google TV): sin window.api → datos por HTTP /api/rpc y
  // eventos por SSE. En Electron (tab o cliente) se usa IPC. token/server se
  // leen de la query (?token=&server=) o localStorage.
  private get esWeb(): boolean { return !((window as any).api?.callIpc); }
  private webToken = '';
  private webBase = '';

  constructor(
    private repo: RepositoryService,
    private elementRef: ElementRef,
  ) {}

  async ngOnInit(): Promise<void> {
    // Modo web: leer token/server de la query o localStorage
    if (this.esWeb) {
      const params = new URLSearchParams(window.location.search);
      this.webToken = params.get('token') || localStorage.getItem('kds.token') || '';
      this.webBase = params.get('server') || localStorage.getItem('kds.server') || '';
      if (this.webToken) localStorage.setItem('kds.token', this.webToken);
      if (this.webBase) localStorage.setItem('kds.server', this.webBase);
    }

    // 1. Sectores activos + selección persistida
    try {
      const secs: any[] = this.esWeb
        ? ((await this.invokeData('getSectoresActivos', 'IMPRESION')) || [])
        : ((await firstValueFrom(this.repo.getSectoresActivos('IMPRESION'))) || []);
      this.sectores = secs || [];
    } catch { this.sectores = []; }
    // Pantallas configuradas (Fase 2). Si hay una elegida, aplica sus sectores.
    try {
      this.pantallas = (await this.invokeData('get-kds-pantallas')) || [];
    } catch { this.pantallas = []; }

    const savedPantalla = this.leerPantallaId();
    const pantalla = savedPantalla ? this.pantallas.find(p => p.id === savedPantalla) : null;
    if (pantalla) {
      this.aplicarPantallaObj(pantalla);
    } else {
      const saved = this.leerSeleccion();
      this.selectedSectorIds = saved.length > 0 ? saved : this.sectores.map(s => s.id);
    }
    this.rebuildSectorChips();

    // 2. Carga inicial
    await this.loadComandas();

    // 3. Tiempo real: IPC (Electron) o SSE (web) + poll de respaldo
    this.conectarEventos();
    this.pollTimer = setInterval(() => this.loadComandas(), 12_000);

    // 4. Tick de 1s para refrescar timers/semáforo sin recargar datos
    this.tickTimer = setInterval(() => this.recomputarTimers(), 1_000);
  }

  ngOnDestroy(): void {
    if (this.offComandaEvent) this.offComandaEvent();
    if (this.eventSource) this.eventSource.close();
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.reloadDebounce) clearTimeout(this.reloadDebounce);
  }

  /** Conecta el canal de tiempo real según el transporte disponible. */
  private conectarEventos(): void {
    const api: any = (window as any).api;
    if (api?.onComandaEvent) {
      this.offComandaEvent = api.onComandaEvent(() => this.scheduleReload());
      this.conectado = true;
      return;
    }
    // Web: SSE
    try {
      const secs = this.selectedSectorIds.join(',');
      const url = `${this.webBase}/api/kds/stream?token=${encodeURIComponent(this.webToken)}&sectores=${secs}`;
      this.eventSource = new EventSource(url);
      this.eventSource.onmessage = () => this.scheduleReload();
      this.eventSource.onopen = () => { this.conectado = true; };
      this.eventSource.onerror = () => { this.conectado = false; };
    } catch (e) {
      console.warn('[KDS] SSE no disponible:', e);
    }
  }

  /**
   * Invoca un handler del backend. En Electron usa `window.api.callIpc` (que en
   * modo cliente ya viaja por RPC). En navegador puro (Google TV) usa fetch a
   * `/api/rpc` con el token. Devuelve el resultado o null.
   */
  private async invokeData(method: string, ...params: any[]): Promise<any> {
    const api: any = (window as any).api;
    if (api?.callIpc) {
      return await api.callIpc(method, ...params);
    }
    const res = await fetch(`${this.webBase}/api/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.webToken ? { Authorization: `Bearer ${this.webToken}` } : {}),
      },
      body: JSON.stringify({ method, params }),
    });
    if (!res.ok) throw new Error(`RPC ${method} → ${res.status}`);
    return await res.json();
  }

  setData(_d: any): void { /* hook tab/standalone */ }

  private leerSeleccion(): number[] {
    try {
      const raw = localStorage.getItem(this.LS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.map(Number).filter(n => !!n) : [];
    } catch { return []; }
  }

  private guardarSeleccion(): void {
    try { localStorage.setItem(this.LS_KEY, JSON.stringify(this.selectedSectorIds)); } catch { /* noop */ }
  }

  private leerPantallaId(): number | null {
    try { const v = localStorage.getItem('kds.pantallaId'); return v ? Number(v) : null; } catch { return null; }
  }

  private aplicarPantallaObj(p: any): void {
    this.pantallaId = p.id;
    let secs: number[] = [];
    try { const arr = p.sectores ? JSON.parse(p.sectores) : []; secs = Array.isArray(arr) ? arr.map(Number) : []; } catch { secs = []; }
    this.selectedSectorIds = secs.length > 0 ? secs : this.sectores.map(s => s.id);
    if (p.umbralAmarillo) this.umbralAmarillo = p.umbralAmarillo;
    if (p.umbralRojo) this.umbralRojo = p.umbralRojo;
  }

  onPantallaChange(ev: Event): void {
    const v = (ev.target as HTMLSelectElement).value;
    this.seleccionarPantalla(v ? Number(v) : null);
  }

  /** El usuario elige qué pantalla es esta TV (o "Personalizado"). */
  seleccionarPantalla(id: number | null): void {
    this.pantallaId = id;
    try {
      if (id) localStorage.setItem('kds.pantallaId', String(id));
      else localStorage.removeItem('kds.pantallaId');
    } catch { /* noop */ }
    const p = id ? this.pantallas.find(x => x.id === id) : null;
    if (p) {
      this.aplicarPantallaObj(p);
    } else {
      const saved = this.leerSeleccion();
      this.selectedSectorIds = saved.length > 0 ? saved : this.sectores.map(s => s.id);
    }
    this.rebuildSectorChips();
    this.loadComandas();
  }

  private scheduleReload(): void {
    if (this.reloadDebounce) clearTimeout(this.reloadDebounce);
    this.reloadDebounce = setTimeout(() => this.loadComandas(), 250);
  }

  async loadComandas(): Promise<void> {
    try {
      const rows: KdsRow[] = await this.invokeData('get-kds-comandas', {
        sectorIds: this.selectedSectorIds,
      });
      this.rawRows = rows || [];
      this.agrupar();
    } catch (e) {
      console.warn('[KDS] loadComandas falló:', e);
    }
  }

  private agrupar(): void {
    const porVenta = new Map<number, KdsRow[]>();
    for (const r of this.rawRows) {
      if (!porVenta.has(r.ventaId)) porVenta.set(r.ventaId, []);
      porVenta.get(r.ventaId)!.push(r);
    }
    // Ticket más viejo primero (por el item más viejo de la venta)
    const grupos = Array.from(porVenta.entries()).map(([ventaId, rows]) => {
      const createdAt = Math.min(...rows.map(r => new Date(r.createdAt).getTime()));
      return { ventaId, rows, createdAt };
    }).sort((a, b) => a.createdAt - b.createdAt);

    this.tickets = grupos.map((g, idx) => {
      const ref = this.refTicket(g.rows[0]);
      const items: KdsItem[] = g.rows.map(r => ({
        id: r.id,
        productoNombre: (r.productoNombre || 'PRODUCTO').toUpperCase(),
        cantidad: Number(r.cantidad) || 1,
        observacion: r.observacion || undefined,
        ensamblado: r.ensambladoDescripcion || undefined,
        estado: r.estado,
        sectorNombre: r.sectorNombre,
      }));
      const todoListo = items.every(i => i.estado === 'LISTO');
      return {
        numero: idx + 1,
        ventaId: g.ventaId,
        ref,
        createdAt: g.createdAt,
        minutos: 0,
        semaforo: 'verde' as const,
        todoListo,
        items,
      };
    });
    this.recomputarTimers();
    this.recomputarAllDay();
  }

  private refTicket(r: KdsRow): string {
    if (r.mesaNumero != null) return `MESA ${r.mesaNumero}`;
    if (r.comandaCodigo) return `COMANDA ${r.comandaCodigo}`;
    if (r.comandaNumero != null) return `COMANDA #${r.comandaNumero}`;
    return `VENTA #${r.ventaId}`;
  }

  private recomputarTimers(): void {
    const now = Date.now();
    for (const t of this.tickets) {
      const mins = Math.floor((now - t.createdAt) / 60000);
      t.minutos = mins;
      t.semaforo = mins >= this.umbralRojo ? 'rojo' : mins >= this.umbralAmarillo ? 'amarillo' : 'verde';
    }
  }

  private recomputarAllDay(): void {
    const map = new Map<string, number>();
    for (const t of this.tickets) {
      for (const it of t.items) {
        if (it.estado === 'LISTO') continue; // all-day = lo que falta preparar
        map.set(it.productoNombre, (map.get(it.productoNombre) || 0) + it.cantidad);
      }
    }
    this.allDayResumen = Array.from(map.entries())
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);
  }

  // ─── Interacción ──────────────────────────────────────────────────────────

  toggleSector(id: number): void {
    const i = this.selectedSectorIds.indexOf(id);
    if (i >= 0) this.selectedSectorIds.splice(i, 1);
    else this.selectedSectorIds.push(id);
    this.guardarSeleccion();
    this.rebuildSectorChips();
    this.loadComandas();
  }

  private rebuildSectorChips(): void {
    this.sectorChips = this.sectores.map(s => ({
      id: s.id,
      nombre: (s.nombre || '').toUpperCase(),
      activo: this.selectedSectorIds.includes(s.id),
    }));
  }

  /** Clic en un item: avanza su estado (PENDIENTE→EN_PREPARACION→LISTO→ENTREGADO). */
  async avanzarItem(item: KdsItem): Promise<void> {
    await this.invocar('bump-comanda-item', item.id);
  }

  /** Recall (clic derecho): retrocede un paso. */
  async recallItem(item: KdsItem, ev: MouseEvent): Promise<void> {
    ev.preventDefault();
    await this.invocar('recall-comanda-item', item.id);
  }

  /** Bump de todo el ticket: avanza cada item un paso. */
  async bumpTicket(t: KdsTicket): Promise<void> {
    for (const it of t.items) {
      await this.invocar('bump-comanda-item', it.id, false);
    }
    await this.loadComandas();
  }

  private async invocar(channel: string, id: number, reload = true): Promise<void> {
    try {
      await this.invokeData(channel, id);
      if (reload) await this.loadComandas();
    } catch (e) {
      console.warn(`[KDS] ${channel} falló:`, e);
    }
  }

  toggleAllDay(): void {
    this.allDay = !this.allDay;
    if (this.allDay) this.recomputarAllDay();
  }

  trackTicket = (_: number, t: KdsTicket) => t.ventaId;
  trackItem = (_: number, i: KdsItem) => i.id;
  trackResumen = (_: number, r: { nombre: string }) => r.nombre;

  // ─── Teclado numérico (bump bar) ─────────────────────────────────────────
  // Escribir el número del ticket + Enter = bump del ticket. Backspace borra,
  // Escape limpia. Guard de visibilidad: el listener es a nivel window y este
  // componente vive en un tab — si no está visible, ignora las teclas.
  @HostListener('window:keydown', ['$event'])
  onKeyDown(ev: KeyboardEvent): void {
    if (!this.elementRef.nativeElement?.offsetParent) return; // tab no visible
    if (ev.key >= '0' && ev.key <= '9') {
      this.numpadBuffer = (this.numpadBuffer + ev.key).slice(0, 3);
      ev.preventDefault();
    } else if (ev.key === 'Backspace') {
      this.numpadBuffer = this.numpadBuffer.slice(0, -1);
      ev.preventDefault();
    } else if (ev.key === 'Escape') {
      this.numpadBuffer = '';
      ev.preventDefault();
    } else if (ev.key === 'Enter') {
      const n = parseInt(this.numpadBuffer, 10);
      this.numpadBuffer = '';
      const t = this.tickets.find(x => x.numero === n);
      if (t) this.bumpTicket(t);
      ev.preventDefault();
    }
  }
}
