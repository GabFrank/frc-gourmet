import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { FormasPago } from '../../src/app/database/entities/compras/forma-pago.entity';
import { Proveedor } from '../../src/app/database/entities/compras/proveedor.entity';
import { GastoCategoria } from '../../src/app/database/entities/financiero/gasto-categoria.entity';
import { CuentaBancaria } from '../../src/app/database/entities/financiero/cuenta-bancaria.entity';
import { MaquinaPos } from '../../src/app/database/entities/financiero/maquina-pos.entity';
import { CompraCategoria } from '../../src/app/database/entities/compras/compra-categoria.entity';

export async function seedInitialData(dataSource: DataSource): Promise<void> {
  console.log('Checking if seed data is needed...');

  try {
    await seedMonedas(dataSource);
    await seedFormasPago(dataSource);
    await seedGastoCategorias(dataSource);
    await seedProveedores(dataSource);
    await seedCompraCategorias(dataSource);
    await linkFormasPagoBancarias(dataSource);
    console.log('Seed data check complete.');
  } catch (error) {
    console.error('Error during seed data:', error);
  }
}

// ===================== MONEDAS =====================
async function seedMonedas(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Moneda);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Monedas: ${count} already exist, skipping.`);
    return;
  }

  const monedas = [
    { denominacion: 'GUARANI', simbolo: '₲', principal: true, decimales: 0, activo: true, countryCode: 'PY' },
    { denominacion: 'DOLAR', simbolo: '$', principal: false, decimales: 2, activo: true, countryCode: 'US' },
    { denominacion: 'REAL', simbolo: 'R$', principal: false, decimales: 2, activo: true, countryCode: 'BR' },
  ];

  for (const data of monedas) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  Monedas: ${monedas.length} created.`);
}

// ===================== FORMAS DE PAGO =====================
async function seedFormasPago(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(FormasPago);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  FormasPago: ${count} already exist, skipping.`);
    return;
  }

  const formasPago = [
    { nombre: 'EFECTIVO', movimentaCaja: true, principal: true, orden: 1 },
    { nombre: 'TARJETA DEBITO', movimentaCaja: false, principal: false, orden: 2 },
    { nombre: 'TARJETA CREDITO', movimentaCaja: false, principal: false, orden: 3 },
    { nombre: 'TRANSFERENCIA', movimentaCaja: false, principal: false, orden: 4 },
    { nombre: 'PIX', movimentaCaja: false, principal: false, orden: 5 },
    { nombre: 'CHEQUE', movimentaCaja: false, principal: false, orden: 6 },
  ];

  for (const data of formasPago) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  FormasPago: ${formasPago.length} created.`);
}

// ===================== CATEGORIAS DE GASTO =====================
async function seedGastoCategorias(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(GastoCategoria);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  GastoCategorias: ${count} already exist, skipping.`);
    return;
  }

  const categorias: { nombre: string; icono?: string; hijos?: { nombre: string; icono?: string }[] }[] = [
    {
      nombre: 'SERVICIOS BASICOS', icono: 'bolt',
      hijos: [
        { nombre: 'ELECTRICIDAD', icono: 'electrical_services' },
        { nombre: 'AGUA', icono: 'water_drop' },
        { nombre: 'INTERNET', icono: 'wifi' },
        { nombre: 'TELEFONO', icono: 'phone' },
        { nombre: 'GAS', icono: 'local_fire_department' },
      ]
    },
    {
      nombre: 'MANTENIMIENTO', icono: 'build',
      hijos: [
        { nombre: 'REPARACIONES', icono: 'handyman' },
        { nombre: 'LIMPIEZA', icono: 'cleaning_services' },
        { nombre: 'FUMIGACION', icono: 'pest_control' },
      ]
    },
    {
      nombre: 'OPERATIVO', icono: 'settings',
      hijos: [
        { nombre: 'DESCARTABLES', icono: 'takeout_dining' },
        { nombre: 'PRODUCTOS DE LIMPIEZA', icono: 'soap' },
        { nombre: 'COMBUSTIBLE', icono: 'local_gas_station' },
        { nombre: 'UNIFORMES', icono: 'checkroom' },
        { nombre: 'UTENSILIOS', icono: 'restaurant' },
      ]
    },
    {
      nombre: 'PERSONAL', icono: 'people',
      hijos: [
        { nombre: 'VALES', icono: 'request_quote' },
        { nombre: 'BONIFICACIONES', icono: 'card_giftcard' },
        { nombre: 'CAPACITACION', icono: 'school' },
        { nombre: 'SEGURO MEDICO', icono: 'health_and_safety' },
      ]
    },
    {
      nombre: 'IMPUESTOS Y TASAS', icono: 'account_balance',
      hijos: [
        { nombre: 'IMPUESTOS MUNICIPALES' },
        { nombre: 'IMPUESTOS NACIONALES' },
        { nombre: 'TASAS VARIAS' },
      ]
    },
    {
      nombre: 'MARKETING', icono: 'campaign',
      hijos: [
        { nombre: 'PUBLICIDAD', icono: 'ads_click' },
        { nombre: 'REDES SOCIALES', icono: 'share' },
        { nombre: 'IMPRESOS', icono: 'print' },
      ]
    },
    {
      nombre: 'ALQUILER', icono: 'home',
      hijos: [
        { nombre: 'ALQUILER LOCAL', icono: 'storefront' },
        { nombre: 'ALQUILER EQUIPOS', icono: 'precision_manufacturing' },
      ]
    },
    {
      nombre: 'TRANSPORTE', icono: 'local_shipping',
      hijos: [
        { nombre: 'FLETE', icono: 'fire_truck' },
        { nombre: 'DELIVERY TERCERIZADO', icono: 'delivery_dining' },
        { nombre: 'TAXI / MOVILIDAD', icono: 'local_taxi' },
      ]
    },
    {
      nombre: 'GASTOS FINANCIEROS', icono: 'trending_down',
      hijos: [
        { nombre: 'COMISIONES BANCARIAS' },
        { nombre: 'INTERESES' },
        { nombre: 'MANTENIMIENTO DE CUENTA' },
      ]
    },
    {
      nombre: 'OTROS GASTOS', icono: 'more_horiz'
    },
  ];

  let total = 0;
  for (const cat of categorias) {
    const padre = repo.create({ nombre: cat.nombre, icono: cat.icono, activo: true });
    const savedPadre = await repo.save(padre);
    total++;

    if (cat.hijos) {
      for (const hijo of cat.hijos) {
        const sub = repo.create({ nombre: hijo.nombre, icono: hijo.icono, padre: savedPadre, activo: true });
        await repo.save(sub);
        total++;
      }
    }
  }
  console.log(`  GastoCategorias: ${total} created (${categorias.length} padres + subcategorias).`);
}

// ===================== PROVEEDORES =====================
async function seedProveedores(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(Proveedor);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  Proveedores: ${count} already exist, skipping.`);
    return;
  }

  const proveedores = [
    { nombre: 'PROVEEDOR GENERAL', activo: true },
  ];

  for (const data of proveedores) {
    const entity = repo.create(data);
    await repo.save(entity);
  }
  console.log(`  Proveedores: ${proveedores.length} created.`);
}

// ===================== CATEGORIAS DE COMPRA =====================
async function seedCompraCategorias(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository(CompraCategoria);
  const count = await repo.count();
  if (count > 0) {
    console.log(`  CompraCategorias: ${count} already exist, skipping.`);
    return;
  }

  const categorias: { nombre: string; icono?: string; hijos?: { nombre: string; icono?: string }[] }[] = [
    {
      nombre: 'INSUMOS', icono: 'inventory_2',
      hijos: [
        { nombre: 'CARNES', icono: 'lunch_dining' },
        { nombre: 'VERDURAS', icono: 'local_florist' },
        { nombre: 'LACTEOS', icono: 'icecream' },
        { nombre: 'GRANOS Y CEREALES', icono: 'grain' },
        { nombre: 'CONDIMENTOS', icono: 'spa' },
      ],
    },
    {
      nombre: 'BEBIDAS', icono: 'local_bar',
      hijos: [
        { nombre: 'BEBIDAS SIN ALCOHOL' },
        { nombre: 'CERVEZAS' },
        { nombre: 'VINOS Y LICORES' },
      ],
    },
    {
      nombre: 'DESCARTABLES', icono: 'takeout_dining' },
    {
      nombre: 'EQUIPAMIENTO', icono: 'precision_manufacturing',
      hijos: [
        { nombre: 'COCINA' },
        { nombre: 'SALON' },
        { nombre: 'TECNOLOGIA' },
      ],
    },
    {
      nombre: 'PRODUCTOS DE LIMPIEZA', icono: 'cleaning_services' },
    {
      nombre: 'OTROS', icono: 'more_horiz' },
  ];

  let total = 0;
  for (const cat of categorias) {
    const padre = repo.create({ nombre: cat.nombre, icono: cat.icono, activo: true });
    const savedPadre = await repo.save(padre);
    total++;

    if (cat.hijos) {
      for (const hijo of cat.hijos) {
        const sub = repo.create({ nombre: hijo.nombre, icono: hijo.icono, padre: savedPadre, activo: true });
        await repo.save(sub);
        total++;
      }
    }
  }
  console.log(`  CompraCategorias: ${total} created (${categorias.length} padres + subcategorias).`);
}

// ===================== LINK FORMAS PAGO -> BANCOS / POS =====================
// Vincula formas de pago tipicas a maquinas POS (puede ser >1) y cuentas bancarias.
// Idempotente: solo agrega vinculaciones que aún no existen. Si no hay POS ni
// cuentas creadas (cliente nuevo recien instalado), es no-op silencioso.
async function linkFormasPagoBancarias(dataSource: DataSource): Promise<void> {
  const fpRepo = dataSource.getRepository(FormasPago);
  const cbRepo = dataSource.getRepository(CuentaBancaria);
  const mpRepo = dataSource.getRepository(MaquinaPos);

  const todasMaquinas = await mpRepo.find({ where: { activo: true } });
  const todasCuentas = await cbRepo.find({ where: { activo: true } });

  if (todasMaquinas.length === 0 && todasCuentas.length === 0) {
    console.log('  LinkFormasPago: skipping, no banking entities created yet.');
    return;
  }

  const formas = await fpRepo.find({ relations: ['maquinasPos', 'cuentasBancarias'] });
  let updated = 0;

  for (const fp of formas) {
    let modified = false;
    const nombre = (fp.nombre || '').toUpperCase();
    const yaMaquinasIds = new Set((fp.maquinasPos || []).map((m: any) => m.id));
    const yaCuentasIds = new Set((fp.cuentasBancarias || []).map((c: any) => c.id));

    // Tarjetas → habilitar TODAS las maquinas POS por defecto (operador elige al cobrar)
    if (nombre.includes('TARJETA') || nombre.includes('CREDITO') || nombre.includes('DEBITO')) {
      const aAgregar = todasMaquinas.filter(m => !yaMaquinasIds.has(m.id));
      if (aAgregar.length > 0) {
        fp.maquinasPos = [...(fp.maquinasPos || []), ...aAgregar];
        modified = true;
      }
    }

    // Transferencia / PIX → habilitar TODAS las cuentas bancarias activas
    if (nombre.includes('TRANSFERENCIA') || nombre.includes('PIX')) {
      const aAgregar = todasCuentas.filter(c => !yaCuentasIds.has(c.id));
      if (aAgregar.length > 0) {
        fp.cuentasBancarias = [...(fp.cuentasBancarias || []), ...aAgregar];
        modified = true;
      }
    }

    if (modified) {
      await fpRepo.save(fp);
      updated++;
    }
  }

  if (updated > 0) {
    console.log(`  LinkFormasPago: ${updated} formas vinculadas a banco/POS.`);
  } else {
    console.log('  LinkFormasPago: nothing to update.');
  }
}
