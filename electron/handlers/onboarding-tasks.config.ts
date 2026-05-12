import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { Funcionario } from '../../src/app/database/entities/rrhh/funcionario.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MaquinaPos } from '../../src/app/database/entities/financiero/maquina-pos.entity';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { Familia } from '../../src/app/database/entities/productos/familia.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { PdvMesa } from '../../src/app/database/entities/ventas/pdv-mesa.entity';
import { UsuarioRole } from '../../src/app/database/entities/personas/usuario-role.entity';
import { DashboardShortcut } from '../../src/app/database/entities/personalizacion/dashboard-shortcut.entity';
import { verifyPassword } from '../utils/password.utils';

export interface OnboardingTaskDef {
  /** Identificador único persistido en onboarding_task_overrides.task_key */
  key: string;
  titulo: string;
  descripcion: string;
  /** Icono Material */
  icono: string;
  /** El frontend mapea este key a una llamada tabsService.openTab(...) */
  actionTabKey: string;
  /** Si true, NO se autodetecta — solo se completa marcándola manualmente */
  manualOnly?: boolean;
  /** Si true, el override y la detección son per-user (usa userId actual) */
  perUser?: boolean;
  /** count > threshold = completa. Default 0. */
  threshold?: number;
  /** Función de autodetección. Devuelve count actual. */
  detect?: (ds: DataSource, userId?: number) => Promise<{ count: number }>;
}

/**
 * Lista declarativa de tareas de onboarding. El orden de este array
 * determina el orden de aparición en la UI.
 *
 * IMPORTANTE: si cambias un `key`, las filas viejas en onboarding_task_overrides
 * quedan huérfanas. Considerá una migration de rename si hace falta.
 */
export const ONBOARDING_TASKS: OnboardingTaskDef[] = [
  {
    key: 'PASSWORD_ADMIN',
    titulo: 'Cambiar password del admin',
    descripcion: 'Por seguridad, modificá la contraseña del usuario admin.',
    icono: 'lock',
    actionTabKey: 'USUARIOS',
    // Detecta si el password del usuario "admin" ya NO es "admin" — devuelve
    // count=1 cuando el operador cambio la contrasenia. Si el usuario admin
    // no existe (fue renombrado/eliminado), consideramos la tarea completa.
    detect: async (ds) => {
      const admin = await ds
        .getRepository(Usuario)
        .findOne({ where: { nickname: 'admin' } });
      if (!admin) return { count: 1 };
      const stillDefault = await verifyPassword('admin', admin.password);
      return { count: stillDefault ? 0 : 1 };
    },
  },
  {
    key: 'FUNCIONARIOS',
    titulo: 'Cargar funcionarios',
    descripcion: 'Registrá a tu equipo para habilitar asistencias, vales y liquidaciones.',
    icono: 'badge',
    actionTabKey: 'FUNCIONARIOS',
    detect: async (ds) => ({
      count: await ds.getRepository(Funcionario).count({ where: { activo: true } }),
    }),
  },
  {
    key: 'MONEDAS_CAMBIO',
    titulo: 'Configurar tasas de cambio',
    descripcion: 'Cargá las tasas USD/BRL → PYG vigentes.',
    icono: 'currency_exchange',
    actionTabKey: 'MONEDAS',
    detect: async (ds) => ({
      count: await ds.getRepository(MonedaCambio).count(),
    }),
  },
  {
    key: 'CUENTAS_BANCARIAS',
    titulo: 'Agregar cuentas bancarias',
    descripcion: 'Para registrar transferencias, pagos electrónicos y conciliaciones.',
    icono: 'account_balance',
    actionTabKey: 'CUENTAS_BANCARIAS',
    detect: async (ds) => ({
      count: await ds.getRepository(CuentaBancaria).count({ where: { activo: true } }),
    }),
  },
  {
    key: 'MAQUINAS_POS',
    titulo: 'Agregar máquinas POS',
    descripcion: 'Bancard, Infonet u otros — con comisión real y minutos de acreditación.',
    icono: 'point_of_sale',
    actionTabKey: 'MAQUINAS_POS',
    detect: async (ds) => ({
      count: await ds.getRepository(MaquinaPos).count({ where: { activo: true } }),
    }),
  },
  {
    key: 'PROVEEDORES',
    titulo: 'Crear proveedores',
    descripcion: 'Más allá del genérico inicial — para vincular compras.',
    icono: 'local_shipping',
    actionTabKey: 'PROVEEDORES',
    threshold: 1,
    detect: async (ds) => ({
      count: await ds.getRepository(Proveedor).count(),
    }),
  },
  {
    key: 'FAMILIAS',
    titulo: 'Organizar familias y subfamilias',
    descripcion: 'Reemplazá la familia GENERAL por la categorización real de tu negocio.',
    icono: 'category',
    actionTabKey: 'FAMILIAS',
    threshold: 1,
    detect: async (ds) => ({
      count: await ds.getRepository(Familia).count(),
    }),
  },
  {
    key: 'PRODUCTOS',
    titulo: 'Cargar productos',
    descripcion: 'Sin productos no podés vender ni comprar.',
    icono: 'inventory_2',
    actionTabKey: 'PRODUCTOS',
    detect: async (ds) => ({
      count: await ds.getRepository(Producto).count({ where: { activo: true } }),
    }),
  },
  {
    key: 'PDV_CONFIG',
    titulo: 'Revisar configuración del PdV',
    descripcion: 'Definí tab por default, comandas, grilla de atajos, estrategia de precio en pizzas, etc.',
    icono: 'tune',
    actionTabKey: 'PDV_CONFIG',
    detect: async (ds) => ({
      count: await ds.getRepository(PdvConfig).count(),
    }),
  },
  {
    key: 'PDV_MESAS',
    titulo: 'Crear mesas del salón',
    descripcion: 'Solo si tu negocio atiende mesas. Marcalo como "No aplica" si sos delivery puro.',
    icono: 'table_restaurant',
    actionTabKey: 'PDV_MESAS',
    detect: async (ds) => ({
      count: await ds.getRepository(PdvMesa).count(),
    }),
  },
  {
    key: 'CLIENTES',
    titulo: 'Registrar clientes',
    descripcion: 'Componente de Clientes en desarrollo — marcalo manualmente o como "No aplica" si no usás crédito/fidelización.',
    icono: 'people',
    actionTabKey: 'CLIENTES',
    // TODO: cambiar a auto-detect cuando se implemente el frontend.
    // Backend ya tiene CRUD completo (get-clientes, create-cliente, etc.).
    manualOnly: true,
  },
  {
    key: 'ROLES_USUARIOS',
    titulo: 'Asignar usuarios a roles',
    descripcion: 'Crear más usuarios y asignarles GERENTE/CAJERO/MOZO según corresponda.',
    icono: 'admin_panel_settings',
    actionTabKey: 'USUARIOS',
    detect: async (ds) => ({
      count: await ds.getRepository(UsuarioRole).count(),
    }),
  },
  {
    key: 'SHORTCUT_PERSONAL',
    titulo: 'Crear tu primer acceso directo',
    descripcion: 'Personalizá tu dashboard con shortcuts a las pantallas que más usás.',
    icono: 'star',
    actionTabKey: 'HOME',
    perUser: true,
    detect: async (ds, userId) => {
      if (!userId) return { count: 0 };
      return {
        count: await ds.getRepository(DashboardShortcut).count({
          where: {
            dashboardKey: 'HOME',
            usuario: { id: userId },
            activo: true,
          },
        }),
      };
    },
  },
];
