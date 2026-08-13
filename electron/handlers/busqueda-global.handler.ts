import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { Cliente } from '../../src/app/database/entities/personas/cliente.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { getUserPermissionCodes } from '../utils/auth.utils';

const LIMIT = 8;

interface ItemResultado {
  id: number;
  titulo: string;
  subtitulo?: string;
}
interface SeccionResultado {
  items: ItemResultado[];
  hasMore: boolean;
}
function vacia(): SeccionResultado {
  return { items: [], hasMore: false };
}
function pack(items: ItemResultado[]): SeccionResultado {
  return { items: items.slice(0, LIMIT), hasMore: items.length > LIMIT };
}

/**
 * Buscador global: en UNA sola llamada busca en varias entidades (productos,
 * clientes, funcionarios, proveedores) y devuelve resultados agrupados por
 * sección. Los datos están en UPPERCASE, así que se busca con el término en
 * mayúsculas. Ranking: coincidencia por prefijo primero, luego alfabético.
 *
 * Gating de permisos SERVER-SIDE (/api/rpc es default-allow): cada sección solo
 * se consulta/devuelve si el usuario tiene el permiso de lectura correspondiente.
 * Los menús y configuraciones se buscan 100% en el cliente (registro de menús),
 * no acá.
 */
export function registerBusquedaGlobalHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
) {
  ipcMain.handle('buscar-global', async (_event, termino: string) => {
    const raw = (termino || '').trim();
    const resultadoVacio = {
      productos: vacia(), clientes: vacia(), funcionarios: vacia(), proveedores: vacia(),
    };
    if (raw.length < 2) return resultadoVacio;

    const t = `%${raw.toUpperCase()}%`;
    const px = `${raw.toUpperCase()}%`;

    const user = getCurrentUser();
    const codes = user ? await getUserPermissionCodes(dataSource, user.id) : new Set<string>();

    const out: any = { ...resultadoVacio };

    // ── Productos ──
    if (codes.has('PRODUCTOS_VER')) {
      const rows = await dataSource.getRepository(Producto).createQueryBuilder('p')
        .select(['p.id AS id', 'p.nombre AS nombre', 'p.tipo AS tipo'])
        .where('UPPER(p.nombre) LIKE :t', { t })
        .andWhere('p.activo = :a', { a: true })
        .addSelect('CASE WHEN UPPER(p.nombre) LIKE :px THEN 0 ELSE 1 END', 'rank')
        .setParameter('px', px)
        .orderBy('rank', 'ASC').addOrderBy('p.nombre', 'ASC')
        .limit(LIMIT + 1).getRawMany();
      out.productos = pack(rows.map((r: any) => ({
        id: Number(r.id), titulo: r.nombre, subtitulo: r.tipo || undefined,
      })));
    }

    // ── Clientes (join persona) ──
    if (codes.has('CLIENTES_VER')) {
      const rows = await dataSource.getRepository(Cliente).createQueryBuilder('c')
        .leftJoin('c.persona', 'p')
        .select(['c.id AS id', 'p.nombre AS nombre', 'p.apellido AS apellido', 'p.documento AS documento', 'c.razon_social AS razon', 'c.ruc AS ruc'])
        .where('(UPPER(p.nombre) LIKE :t OR UPPER(p.apellido) LIKE :t OR UPPER(p.documento) LIKE :t OR UPPER(c.razon_social) LIKE :t OR UPPER(c.ruc) LIKE :t)', { t })
        .andWhere('c.activo = :a', { a: true })
        .addSelect('CASE WHEN UPPER(p.nombre) LIKE :px OR UPPER(p.apellido) LIKE :px OR UPPER(c.razon_social) LIKE :px THEN 0 ELSE 1 END', 'rank')
        .setParameter('px', px)
        .orderBy('rank', 'ASC').addOrderBy('p.nombre', 'ASC')
        .limit(LIMIT + 1).getRawMany();
      out.clientes = pack(rows.map((r: any) => ({
        id: Number(r.id),
        titulo: r.razon || [r.nombre, r.apellido].filter(Boolean).join(' ') || 'CLIENTE',
        subtitulo: r.documento || r.ruc || undefined,
      })));
    }

    // ── Funcionarios (join persona) ──
    if (codes.has('RRHH_FUNCIONARIO_VER')) {
      const rows = await dataSource.getRepository(Funcionario).createQueryBuilder('f')
        .leftJoin('f.persona', 'p')
        .select(['f.id AS id', 'p.nombre AS nombre', 'p.apellido AS apellido', 'p.documento AS documento', 'f.codigo_interno AS codigo'])
        .where('(UPPER(p.nombre) LIKE :t OR UPPER(p.apellido) LIKE :t OR UPPER(p.documento) LIKE :t OR UPPER(f.codigo_interno) LIKE :t)', { t })
        .andWhere('f.activo = :a', { a: true })
        .addSelect('CASE WHEN UPPER(p.nombre) LIKE :px OR UPPER(p.apellido) LIKE :px THEN 0 ELSE 1 END', 'rank')
        .setParameter('px', px)
        .orderBy('rank', 'ASC').addOrderBy('p.nombre', 'ASC')
        .limit(LIMIT + 1).getRawMany();
      out.funcionarios = pack(rows.map((r: any) => ({
        id: Number(r.id),
        titulo: [r.nombre, r.apellido].filter(Boolean).join(' ') || 'FUNCIONARIO',
        subtitulo: r.codigo || r.documento || undefined,
      })));
    }

    // ── Proveedores ──
    if (codes.has('PROVEEDORES_VER')) {
      const rows = await dataSource.getRepository(Proveedor).createQueryBuilder('pr')
        .select(['pr.id AS id', 'pr.nombre AS nombre', 'pr.razon_social AS razon', 'pr.ruc AS ruc'])
        .where('(UPPER(pr.nombre) LIKE :t OR UPPER(pr.razon_social) LIKE :t OR UPPER(pr.ruc) LIKE :t)', { t })
        .andWhere('pr.activo = :a', { a: true })
        .addSelect('CASE WHEN UPPER(pr.nombre) LIKE :px THEN 0 ELSE 1 END', 'rank')
        .setParameter('px', px)
        .orderBy('rank', 'ASC').addOrderBy('pr.nombre', 'ASC')
        .limit(LIMIT + 1).getRawMany();
      out.proveedores = pack(rows.map((r: any) => ({
        id: Number(r.id), titulo: r.nombre || r.razon || 'PROVEEDOR',
        subtitulo: r.ruc || undefined,
      })));
    }

    return out;
  });
}
