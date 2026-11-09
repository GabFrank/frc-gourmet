/**
 * Formas de pago online = CUENTAS de los proveedores (PLAN-tienda-pagos-multi-icpay): la tabla de
 * Config Tienda Online con «Adicionar» y el diálogo de alta/edición.
 *
 * - Puede haber varias cuentas, también del mismo proveedor.
 * - Los datos NO secretos van a `formas_pago_online.config_json`; los secretos, al almacén seguro
 *   por cuenta, y nunca vuelven a la pantalla (solo «guardado sí/no»).
 * - Quitar una cuenta con pedidos la DESACTIVA: esos pedidos se siguen consultando y devolviendo
 *   con ella.
 */
import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { FormaPagoOnline } from '../../src/app/database/entities/pedidos-online/forma-pago-online.entity';
import { PedidoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.entity';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { cuentaDeForma, listarFormasPago, resolverForma } from '../services/pagos-online/cuentas-pago';
import { urlPublicaTienda } from '../services/pagos-online/pagos-online.service';
import { listarProveedores, proveedorPorId, PROVEEDOR_UPAY } from '../services/pagos-online/proveedores';
import { secretoProveedor, validarCampo, valoresProveedor } from '../services/pagos-online/proveedores/config-proveedor';
import { fetchActual } from '../services/pagos-online/proveedores/deps';
import { ensurePermission } from '../utils/auth.utils';
import { cargarCredencialesTienda } from '../utils/tienda-ingreso.utils';
import { almacenSeguroDisponible, setSecretoPago } from '../utils/tienda-secrets.util';

const PERM = 'PEDIDOS_ONLINE_CONFIGURAR';

/** Lo que el servidor entiende de un alta/edición. */
interface FormaInput {
  id?: number | null;
  proveedor?: string;
  nombre?: string;
  activo?: boolean;
  permitePickup?: boolean;
  permiteDelivery?: boolean;
  /** Campos NO secretos del proveedor. */
  valores?: Record<string, string>;
  /** Secretos nuevos (vacío = no cambia). */
  secretos?: Record<string, string>;
  /** Secretos a borrar. */
  secretosBorrar?: string[];
}

/** Proveedores que se pueden adicionar (uPay no: se dio de baja y se configura con sus columnas viejas). */
function catalogo() {
  return listarProveedores()
    .filter((p) => p.id !== PROVEEDOR_UPAY)
    .map((p) => ({ id: p.id, nombre: p.nombre, etiqueta: p.etiqueta, medio: p.medio, campos: p.campos, devuelvePorApi: !!p.devolver }));
}

export function registerFormasPagoOnlineHandlers(dataSource: DataSource, getCurrentUser: () => Usuario | null) {
  const repo = () => dataSource.getRepository(FormaPagoOnline);
  const cfgActual = () => dataSource.getRepository(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } });

  async function vista(f: FormaPagoOnline, cfg: TiendaOnlineConfig | null) {
    const prov = proveedorPorId(f.proveedor);
    const cuenta = cuentaDeForma(f);
    const secretosGuardados: Record<string, boolean> = {};
    for (const c of (prov?.campos || []).filter((x) => x.secreto)) secretosGuardados[c.clave] = !!(await secretoProveedor(f.proveedor, c.clave, cuenta));
    const pedidos = await dataSource.getRepository(PedidoOnline).count({ where: { formaPagoOnlineId: f.id } as any });
    return {
      id: f.id,
      proveedor: f.proveedor,
      proveedorNombre: prov?.nombre || f.proveedor,
      medio: prov?.medio || null,
      nombre: f.nombre,
      activo: !!f.activo,
      orden: f.orden,
      permitePickup: !!f.permitePickup,
      permiteDelivery: !!f.permiteDelivery,
      valores: prov ? valoresProveedor(cfg, prov, cuenta) : {},
      secretosGuardados,
      listo: !!(await resolverForma(dataSource, cfg, f)),
      datosPortal: prov?.datosPortal ? prov.datosPortal(urlPublicaTienda(), cuenta.legado ? null : f.id) : [],
      pedidos,
    };
  }

  ipcMain.handle('get-formas-pago-online', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const cfg = await cfgActual();
    const formas = await listarFormasPago(dataSource);
    const data = [];
    for (const f of formas) data.push(await vista(f, cfg));
    return { success: true, data, catalogo: catalogo(), almacenSeguroDisponible: almacenSeguroDisponible() };
  });

  ipcMain.handle('guardar-forma-pago-online', async (_e: any, input: FormaInput) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    if (!input || typeof input !== 'object') return { success: false, error: 'datos_invalidos' };
    const existente = input.id ? await repo().findOne({ where: { id: Number(input.id) } }) : null;
    if (input.id && !existente) return { success: false, error: 'forma_no_encontrada' };
    const provId = String(existente?.proveedor || input.proveedor || '').toUpperCase();
    const prov = proveedorPorId(provId);
    // Alta: solo del catálogo. Edición de una de uPay (convertida por la migración): solo nombre,
    // activo y tipos.
    if (!prov || (!existente && !catalogo().some((c) => c.id === provId))) return { success: false, error: 'pago_proveedor_invalido' };
    const nombre = String(input.nombre ?? existente?.nombre ?? '').trim().toUpperCase();
    if (!nombre || nombre.length > 80) return { success: false, error: 'nombre_invalido' };
    const pickup = input.permitePickup ?? existente?.permitePickup ?? true;
    const delivery = input.permiteDelivery ?? existente?.permiteDelivery ?? true;
    if (!pickup && !delivery) return { success: false, error: 'forma_sin_tipo' };

    // Datos no secretos: se validan contra los campos del proveedor.
    const config: Record<string, string> = { ...(existente ? cuentaDeForma(existente).config : {}) };
    for (const c of prov.campos.filter((x) => !x.secreto)) {
      if (input.valores?.[c.clave] === undefined) continue;
      const v = String(input.valores[c.clave] ?? '').trim();
      const err = validarCampo(prov, c, v);
      if (err) return { success: false, error: err };
      if (v) config[c.clave] = v; else delete config[c.clave];
    }
    // Secretos: se validan antes; se escriben DESPUÉS de guardar la fila (para tener el id).
    const secretos: { clave: string; valor: string }[] = [];
    for (const [clave, valor] of Object.entries(input.secretos || {})) {
      const c = prov.campos.find((x) => x.secreto && x.clave === clave);
      if (!c) return { success: false, error: 'pago_proveedor_invalido' };
      const v = String(valor ?? '').trim();
      if (!v) continue;
      const err = validarCampo(prov, c, v);
      if (err) return { success: false, error: err };
      secretos.push({ clave, valor: v });
    }
    for (const clave of input.secretosBorrar || []) {
      if (!prov.campos.some((x) => x.secreto && x.clave === clave)) return { success: false, error: 'pago_proveedor_invalido' };
      secretos.push({ clave, valor: '' });
    }
    if (secretos.some((x) => x.valor) && !almacenSeguroDisponible()) return { success: false, error: 'almacen_seguro_no_disponible' };

    const f = existente || repo().create({ proveedor: prov.id } as any) as unknown as FormaPagoOnline;
    f.nombre = nombre;
    f.activo = input.activo ?? existente?.activo ?? true;
    f.permitePickup = !!pickup;
    f.permiteDelivery = !!delivery;
    f.configJson = JSON.stringify(config);
    if (!existente) {
      const ult = await repo().createQueryBuilder('f').select('MAX(f.orden)', 'm').getRawOne();
      f.orden = Number(ult?.m || 0) + 1;
    }
    const guardada = await repo().save(f);
    // La cuenta que convirtió la migración sigue con los secretos de antes.
    const legado = cuentaDeForma(guardada).legado;
    let ok = true;
    for (const s of secretos) ok = (await setSecretoPago(prov.id, s.clave, s.valor, legado ? null : guardada.id)) && ok;
    await cargarCredencialesTienda(dataSource);
    if (!ok) return { success: false, error: 'token_no_guardado' };
    return { success: true, data: await vista(guardada, await cfgActual()) };
  });

  ipcMain.handle('eliminar-forma-pago-online', async (_e: any, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const f = await repo().findOne({ where: { id: Number(id) } });
    if (!f) return { success: false, error: 'forma_no_encontrada' };
    const usada = await dataSource.getRepository(PedidoOnline).count({ where: { formaPagoOnlineId: f.id } as any });
    if (usada) {
      // Tiene pedidos: se desactiva (se siguen consultando y devolviendo con ella).
      f.activo = false;
      await repo().save(f);
      await cargarCredencialesTienda(dataSource);
      return { success: true, desactivada: true };
    }
    const prov = proveedorPorId(f.proveedor);
    const legado = cuentaDeForma(f).legado;
    await repo().delete({ id: f.id });
    if (prov && !legado) for (const c of prov.campos.filter((x) => x.secreto)) await setSecretoPago(prov.id, c.clave, '', f.id);
    await cargarCredencialesTienda(dataSource);
    return { success: true, eliminada: true };
  });

  ipcMain.handle('mover-forma-pago-online', async (_e: any, id: number, direccion: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const formas = await listarFormasPago(dataSource);
    const i = formas.findIndex((x) => x.id === Number(id));
    const j = i + (Number(direccion) < 0 ? -1 : 1);
    if (i < 0) return { success: false, error: 'forma_no_encontrada' };
    if (j < 0 || j >= formas.length) return { success: true };
    [formas[i], formas[j]] = [formas[j], formas[i]];
    // Se renumera todo: el orden queda 1..n sin huecos ni empates.
    await dataSource.transaction(async (m) => {
      for (let k = 0; k < formas.length; k++) await m.getRepository(FormaPagoOnline).update({ id: formas[k].id }, { orden: k + 1 });
    });
    await cargarCredencialesTienda(dataSource);
    return { success: true };
  });

  ipcMain.handle('probar-forma-pago-online', async (_e: any, id: number) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const f = await repo().findOne({ where: { id: Number(id) } });
    if (!f) return { success: false, error: 'forma_no_encontrada' };
    const r = await resolverForma(dataSource, await cfgActual(), f);
    if (!r) return { success: false, error: 'pago_faltan_credenciales', proveedor: f.proveedor };
    const p = await r.prov.probarConexion(r.creds, { fetch: fetchActual() });
    return p.ok
      ? { success: true, proveedor: r.prov.nombre, ...(p.detalle ? { detalle: p.detalle } : {}) }
      : { success: false, error: p.error, proveedor: r.prov.nombre, ...(p.detalle ? { detalle: p.detalle } : {}) };
  });
}
