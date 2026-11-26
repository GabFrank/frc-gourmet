/**
 * «Guardar mi tarjeta» en la tienda (PLAN-tienda-tarjeta-guardada): catastro de dinelco.
 *
 * El cliente (con teléfono verificado y casilla de consentimiento marcada) abre el catastro; la
 * tarjeta queda ACTIVA solo si dinelco lo confirma: consultando la sesión o, si la consulta no trae
 * el resultado, con el callback del catastro, que sin firma solo vale para un catastro PENDIENTE de
 * esa misma referencia abierto hace menos de 30 minutos. El cobro con un toque está en
 * `pagos-online.service.ts` (`pagarConTarjetaGuardada`).
 */
import { DataSource } from 'typeorm';
import { CuentaCliente } from '../../../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { TarjetaGuardada } from '../../../src/app/database/entities/pedidos-online/tarjeta-guardada.entity';
import { cuentasListas, CuentaResuelta } from './cuentas-pago';
import { fetchActual } from './proveedores/deps';
import {
  consultarCatastro, crearSesionCatastro, DinelcoConfig, interpretarCatastroDinelco, PROVEEDOR_DINELCO, REF_REGISTRO,
  referenciaRegistro, ResultadoCatastro,
} from './proveedores/dinelco.proveedor';
import { ProveedorError } from './proveedores/tipos';
import { getCfg, urlPublicaTienda } from './pagos-online.service';

const VIGENCIA_REGISTRO_MS = 30 * 60_000;
const MAX_REGISTROS_HORA = 5;

const ctx = () => ({ fetch: fetchActual() });

export interface TarjetaVista {
  id: number;
  marca: string | null;
  enmascarada: string | null;
  tipo: string | null;
  ultimoUsoEn: Date | null;
}

function vista(t: TarjetaGuardada): TarjetaVista {
  return { id: t.id, marca: t.marca ?? null, enmascarada: t.enmascarada ?? null, tipo: t.tipo ?? null, ultimoUsoEn: t.ultimoUsoEn ?? null };
}

/** La cuenta DINELCO con «Permitir guardar tarjetas» prendido (la primera lista). */
export async function cuentaTarjetas(ds: DataSource): Promise<CuentaResuelta | null> {
  const listas = await cuentasListas(ds, await getCfg(ds));
  return listas.find((c) => c.prov.id === PROVEEDOR_DINELCO && !!(c.creds as DinelcoConfig)?.tarjetaGuardada) ?? null;
}

/** Lo que ve el cliente: si puede guardar tarjetas, el tope y sus tarjetas activas de esa cuenta. */
export async function listarTarjetas(ds: DataSource, cuentaClienteId: number): Promise<{ disponible: boolean; tope: number | null; tarjetas: TarjetaVista[] }> {
  const c = await cuentaTarjetas(ds);
  if (!c) return { disponible: false, tope: null, tarjetas: [] };
  const formaId = c.forma?.id ?? null;
  const q = ds.getRepository(TarjetaGuardada).createQueryBuilder('t')
    .where('t.cuenta_cliente_id = :c AND t.estado = :a', { c: cuentaClienteId, a: 'ACTIVA' });
  if (formaId == null) q.andWhere('t.forma_pago_online_id IS NULL');
  else q.andWhere('t.forma_pago_online_id = :f', { f: formaId });
  const ts = await q.orderBy('t.id', 'DESC').getMany();
  return { disponible: true, tope: Number((c.creds as DinelcoConfig).topeTarjetaGuardada) || null, tarjetas: ts.map(vista) };
}

/** Abre el catastro embebido. Solo cuentas activas con teléfono verificado y con consentimiento. */
export async function abrirCatastro(
  ds: DataSource, cuentaClienteId: number, opts: { consentimiento?: boolean; ahora?: Date } = {},
): Promise<{ success: true; ref: string; token: string; validarUrl: string; hosts: string[] } | { success: false; error: string }> {
  if (opts.consentimiento !== true) return { success: false, error: 'tarjeta_sin_consentimiento' };
  const ahora = opts.ahora ?? new Date();
  const cuenta = await ds.getRepository(CuentaCliente).findOne({ where: { id: cuentaClienteId, activo: true } });
  if (!cuenta) return { success: false, error: 'cuenta_invalida' };
  if (!cuenta.telefonoVerificado) return { success: false, error: 'telefono_no_verificado' };
  const c = await cuentaTarjetas(ds);
  if (!c) return { success: false, error: 'tarjeta_no_disponible' };
  const repo = ds.getRepository(TarjetaGuardada);
  const recientes = await repo.createQueryBuilder('t')
    .where('t.cuenta_cliente_id = :c AND t.created_at >= :d', { c: cuentaClienteId, d: new Date(ahora.getTime() - 3600_000) })
    .getCount();
  if (recientes >= MAX_REGISTROS_HORA) return { success: false, error: 'demasiados_intentos' };

  const ref = referenciaRegistro(cuentaClienteId);
  const formaId = c.forma?.id ?? null;
  const fila = await repo.save(repo.create({ cuentaClienteId, formaPagoOnlineId: formaId, registroRef: ref, estado: 'PENDIENTE', consentimientoEn: ahora } as any)) as unknown as TarjetaGuardada;
  const base = urlPublicaTienda();
  const ruta = formaId ? `dinelco-${formaId}` : 'dinelco';
  try {
    const s = await crearSesionCatastro(c.creds as DinelcoConfig, {
      ref, targetOrigin: new URL(base).origin, urlAviso: `${new URL(base).origin}/pub/pagos/${ruta}/aviso`, urlVuelta: `${base}/tienda/`,
    }, ctx());
    await repo.update({ id: fila.id }, { registroSesionId: s.sessionId } as any);
    return { success: true, ref, token: s.token, validarUrl: s.validarUrl, hosts: c.prov.hosts };
  } catch (e: any) {
    await repo.update({ id: fila.id }, { estado: 'FALLIDA', detalle: String(e?.message || e).slice(0, 250) } as any);
    return { success: false, error: e instanceof ProveedorError && e.codigo === 'dinelco_credenciales' ? 'tarjeta_no_disponible' : 'tarjeta_error' };
  }
}

/** Aplica un resultado a un catastro PENDIENTE (UPDATE condicionado: el callback y la consulta no se pisan). */
async function aplicarCatastro(ds: DataSource, fila: TarjetaGuardada, r: ResultadoCatastro): Promise<'ACTIVA' | 'FALLIDA' | 'PENDIENTE'> {
  const repo = ds.getRepository(TarjetaGuardada);
  if (r.tipo === 'PENDIENTE') return 'PENDIENTE';
  if (r.tipo === 'FALLIDA') {
    await repo.createQueryBuilder().update(TarjetaGuardada).set({ estado: 'FALLIDA', detalle: r.detalle } as any)
      .where('id = :id AND estado = :p', { id: fila.id, p: 'PENDIENTE' }).execute();
    return 'FALLIDA';
  }
  // La misma tarjeta ya guardada en esta cuenta: no se duplica.
  const yaEsta = await repo.createQueryBuilder('t')
    .where('t.cuenta_cliente_id = :c AND t.estado = :a AND t.token_id = :tk AND t.id <> :id', { c: fila.cuentaClienteId, a: 'ACTIVA', tk: r.tokenId, id: fila.id })
    .getCount();
  if (yaEsta) {
    await repo.createQueryBuilder().update(TarjetaGuardada).set({ estado: 'FALLIDA', detalle: 'esta tarjeta ya estaba guardada' } as any)
      .where('id = :id AND estado = :p', { id: fila.id, p: 'PENDIENTE' }).execute();
    return 'ACTIVA';
  }
  await repo.createQueryBuilder().update(TarjetaGuardada)
    .set({ estado: 'ACTIVA', tokenId: r.tokenId, marca: r.marca, enmascarada: r.enmascarada, tipo: r.tipoTarjeta, detalle: null } as any)
    .where('id = :id AND estado = :p', { id: fila.id, p: 'PENDIENTE' }).execute();
  return 'ACTIVA';
}

/**
 * El storefront recibió `registry.success` (el evento no trae la tarjeta): se pregunta a dinelco.
 * Solo un catastro de ESTA cuenta de cliente.
 */
export async function confirmarCatastro(
  ds: DataSource, cuentaClienteId: number, ref: string,
): Promise<{ success: boolean; error?: string; estado?: string; detalle?: string | null; tarjeta?: TarjetaVista }> {
  if (!REF_REGISTRO.test(String(ref || ''))) return { success: false, error: 'tarjeta_no_encontrada' };
  const repo = ds.getRepository(TarjetaGuardada);
  const fila = await repo.findOne({ where: { registroRef: ref, cuentaClienteId } });
  if (!fila) return { success: false, error: 'tarjeta_no_encontrada' };
  if (fila.estado === 'PENDIENTE') {
    const c = await cuentaTarjetas(ds);
    if (c && (c.forma?.id ?? null) === (fila.formaPagoOnlineId ?? null)) {
      try {
        const r = await consultarCatastro(c.creds as DinelcoConfig, ref, fila.registroSesionId ?? null, ctx());
        await aplicarCatastro(ds, fila, r.resultado);
      } catch { /* sin respuesta: sigue PENDIENTE (puede llegar el callback) */ }
    }
  }
  const f = await repo.findOne({ where: { id: fila.id } });
  if (f?.estado === 'FALLIDA' && f.detalle === 'esta tarjeta ya estaba guardada') {
    return { success: true, estado: 'ACTIVA', detalle: f.detalle };
  }
  return { success: true, estado: f?.estado, detalle: f?.detalle ?? null, ...(f?.estado === 'ACTIVA' ? { tarjeta: vista(f) } : {}) };
}

/** ¿Este aviso de dinelco es de un catastro? (`FRCR-…`). */
export function esAvisoCatastro(body: any): boolean {
  return REF_REGISTRO.test(String(body?.clientReferenceId ?? ''));
}

/**
 * Callback del catastro (`/pub/pagos/dinelco[-<cuenta>]/aviso`). Sin firma: solo completa un
 * catastro PENDIENTE de esa referencia, de la misma cuenta DINELCO, abierto hace menos de 30 min.
 */
export async function avisoCatastro(ds: DataSource, proveedorRuta: string, body: any, ahora = new Date()): Promise<{ http: number; respuesta: any }> {
  const ref = String(body?.clientReferenceId ?? '');
  const repo = ds.getRepository(TarjetaGuardada);
  const fila = REF_REGISTRO.test(ref) ? await repo.findOne({ where: { registroRef: ref } }) : null;
  const m = String(proveedorRuta || '').toUpperCase().match(/^DINELCO(?:-(\d+))?$/);
  const formaRuta = m?.[1] ? Number(m[1]) : null;
  const vigente = fila && fila.estado === 'PENDIENTE' && ahora.getTime() - new Date(fila.createdAt).getTime() <= VIGENCIA_REGISTRO_MS;
  if (!m || !fila || !vigente || (fila.formaPagoOnlineId ?? null) !== formaRuta) return { http: 400, respuesta: { status: 'error' } };
  await aplicarCatastro(ds, fila, interpretarCatastroDinelco(body, ref));
  return { http: 200, respuesta: { recibido: true } };
}

/** «Quitar»: deja de usarse en Don Franco y se borra el identificador de la tarjeta de nuestra base. */
export async function quitarTarjeta(ds: DataSource, cuentaClienteId: number, id: number, ahora = new Date()): Promise<{ success: boolean; error?: string }> {
  const r = await ds.getRepository(TarjetaGuardada).createQueryBuilder().update(TarjetaGuardada)
    .set({ estado: 'QUITADA', quitadaEn: ahora, tokenId: null } as any)
    .where('id = :id AND cuenta_cliente_id = :c AND estado = :a', { id: Number(id) || 0, c: cuentaClienteId, a: 'ACTIVA' })
    .execute();
  return r.affected ? { success: true } : { success: false, error: 'tarjeta_no_encontrada' };
}
