/**
 * Dashboard de Zonas de Delivery: a qué zona va cada envío del período.
 *
 * Los envíos llegan del motor (`enviosPorZonaYCanal`) agrupados por puerta de
 * entrada, zona del pedido web y tarifa del PdV. Acá se asignan a una zona:
 *
 * - **Web con zona** → la zona del pedido (la que resolvió el pin del cliente).
 *   Si esa zona ya no existe → «Zona eliminada» (la FK no tiene constraint).
 * - **Teléfono, o web sin zona** (p. ej. un retiro web convertido a delivery en el
 *   PdV) → la zona que tiene vinculada **esa** tarifa del PdV.
 *   - Ninguna zona con esa tarifa → «Tarifa X · sin zona».
 *   - Más de una (dato previo a la regla «una tarifa por zona») → «Tarifa X ·
 *     varias zonas». No se adivina ni se reparte.
 * - **Sin tarifa** → «Sin zona».
 *
 * Invariante: cada envío cae en exactamente una fila, así que la suma de las filas
 * es el total de los KPIs. El test lo verifica.
 */
import type { FilaZonaCanal } from '../handlers/reportes-delivery.helper';

export interface ZonaDashboard {
  id: number;
  nombre: string;
  activa: boolean;
  orden: number;
  poligono: string | null;
  precioDeliveryId: number | null;
}

export interface TarifaDashboard {
  id: number;
  descripcion: string;
}

export type TipoFilaZona = 'ZONA' | 'TARIFA_SIN_ZONA' | 'TARIFA_COMPARTIDA' | 'ZONA_ELIMINADA' | 'SIN_ZONA';

export interface MetricaCanal {
  envios: number;
  facturacion: number;
}

export interface FilaDashboardZona {
  clave: string;
  tipo: TipoFilaZona;
  zonaId: number | null;
  tarifaId: number | null;
  nombre: string;
  tienda: MetricaCanal;
  telefono: MetricaCanal;
  envios: number;
  facturacion: number;
  envioRecaudado: number;
  /** % de la facturación de delivery del período. */
  pct: number;
}

export interface KpisDashboardZonas {
  zonasActivas: number;
  zonasSinDibujar: number;
  zonasSinTarifa: number;
  tarifasCompartidas: number;
  enviosTienda: number;
  enviosTelefono: number;
  envios: number;
  facturacion: number;
  envioRecaudado: number;
  ticketPromedio: number;
  /** Envíos que no se pudieron asignar a una zona (filas especiales). */
  enviosSinAsignar: number;
}

const vacia = (): MetricaCanal => ({ envios: 0, facturacion: 0 });

export function asignarEnviosAZonas(
  zonas: ZonaDashboard[],
  tarifas: TarifaDashboard[],
  filas: FilaZonaCanal[],
): { filas: FilaDashboardZona[]; kpis: KpisDashboardZonas } {
  const porId = new Map(zonas.map((z) => [z.id, z]));
  const zonasPorTarifa = new Map<number, ZonaDashboard[]>();
  for (const z of zonas) {
    if (z.precioDeliveryId == null) continue;
    const lista = zonasPorTarifa.get(z.precioDeliveryId) || [];
    lista.push(z);
    zonasPorTarifa.set(z.precioDeliveryId, lista);
  }
  const nombreTarifa = (id: number) => tarifas.find((t) => t.id === id)?.descripcion || `TARIFA #${id}`;

  const acc = new Map<string, FilaDashboardZona>();
  const fila = (clave: string, tipo: TipoFilaZona, nombre: string, zonaId: number | null, tarifaId: number | null) => {
    if (!acc.has(clave)) {
      acc.set(clave, {
        clave, tipo, zonaId, tarifaId, nombre,
        tienda: vacia(), telefono: vacia(), envios: 0, facturacion: 0, envioRecaudado: 0, pct: 0,
      });
    }
    return acc.get(clave)!;
  };
  // Toda zona aparece, aunque no haya tenido envíos: su cero es el dato.
  for (const z of [...zonas].sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))) {
    fila(`Z${z.id}`, 'ZONA', z.nombre, z.id, z.precioDeliveryId);
  }

  for (const f of filas) {
    let destino: FilaDashboardZona;
    if (f.canal === 'WEB' && f.zonaPedidoId != null) {
      destino = porId.has(f.zonaPedidoId)
        ? fila(`Z${f.zonaPedidoId}`, 'ZONA', porId.get(f.zonaPedidoId)!.nombre, f.zonaPedidoId, null)
        : fila('ELIMINADA', 'ZONA_ELIMINADA', 'Zona eliminada', null, null);
    } else if (f.tarifaId != null) {
      const candidatas = zonasPorTarifa.get(f.tarifaId) || [];
      if (candidatas.length === 1) {
        const z = candidatas[0];
        destino = fila(`Z${z.id}`, 'ZONA', z.nombre, z.id, z.precioDeliveryId);
      } else if (candidatas.length === 0) {
        destino = fila(`T${f.tarifaId}`, 'TARIFA_SIN_ZONA', `${nombreTarifa(f.tarifaId)} · sin zona`, null, f.tarifaId);
      } else {
        destino = fila(`C${f.tarifaId}`, 'TARIFA_COMPARTIDA', `${nombreTarifa(f.tarifaId)} · varias zonas`, null, f.tarifaId);
      }
    } else {
      destino = fila('SIN', 'SIN_ZONA', 'Sin zona', null, null);
    }
    const canal = f.canal === 'WEB' ? destino.tienda : destino.telefono;
    canal.envios += f.envios;
    canal.facturacion += f.facturacion;
    destino.envios += f.envios;
    destino.facturacion += f.facturacion;
    destino.envioRecaudado += f.envioRecaudado;
  }

  const lista = [...acc.values()];
  const facturacion = lista.reduce((s, x) => s + x.facturacion, 0);
  for (const x of lista) x.pct = facturacion > 0 ? +((x.facturacion / facturacion) * 100).toFixed(1) : 0;

  const activas = zonas.filter((z) => z.activa);
  const envios = lista.reduce((s, x) => s + x.envios, 0);
  const kpis: KpisDashboardZonas = {
    zonasActivas: activas.length,
    zonasSinDibujar: activas.filter((z) => !z.poligono).length,
    zonasSinTarifa: activas.filter((z) => z.precioDeliveryId == null).length,
    tarifasCompartidas: [...zonasPorTarifa.values()].filter((l) => l.length > 1).length,
    enviosTienda: lista.reduce((s, x) => s + x.tienda.envios, 0),
    enviosTelefono: lista.reduce((s, x) => s + x.telefono.envios, 0),
    envios,
    facturacion,
    envioRecaudado: lista.reduce((s, x) => s + x.envioRecaudado, 0),
    ticketPromedio: envios > 0 ? Math.round(facturacion / envios) : 0,
    enviosSinAsignar: lista.filter((x) => x.tipo !== 'ZONA').reduce((s, x) => s + x.envios, 0),
  };
  // Zonas primero (en su orden), después las filas especiales con algo adentro.
  const zonasFilas = lista.filter((x) => x.tipo === 'ZONA');
  const especiales = lista.filter((x) => x.tipo !== 'ZONA' && x.envios > 0);
  return { filas: [...zonasFilas, ...especiales], kpis };
}

/** Coordenada redondeada a 3 decimales (~110 m): alcanza para el mapa y no ubica una casa. */
export function redondearCoordenada(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}
