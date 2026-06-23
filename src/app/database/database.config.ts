import { DataSource, DataSourceOptions } from 'typeorm';
import * as path from 'path';
import * as electron from 'electron';

// Import all entities
import { Printer } from './entities/printer.entity';
import { Persona } from './entities/personas/persona.entity';
import { Usuario } from './entities/personas/usuario.entity';
import { Role } from './entities/personas/role.entity';
import { UsuarioRole } from './entities/personas/usuario-role.entity';
import { TipoCliente } from './entities/personas/tipo-cliente.entity';
import { Cliente } from './entities/personas/cliente.entity';
import { Convenio } from './entities/personas/convenio.entity';
import { Permission } from './entities/personas/permission.entity';
import { RolePermission } from './entities/personas/role-permission.entity';
import { LoginSession } from './entities/auth/login-session.entity';
import { RefreshToken } from './entities/auth/refresh-token.entity';
import { Adjunto } from './entities/shared/adjunto.entity';

// RRHH entities
import { ConfiguracionRrhh } from './entities/rrhh/configuracion-rrhh.entity';
import { Cargo } from './entities/rrhh/cargo.entity';
import { Funcionario } from './entities/rrhh/funcionario.entity';
import { HistoricoCargo } from './entities/rrhh/historico-cargo.entity';
import { HistoricoSalario } from './entities/rrhh/historico-salario.entity';
import { FuncionarioDocumento } from './entities/rrhh/funcionario-documento.entity';
import { Turno } from './entities/rrhh/turno.entity';
import { FuncionarioTurno } from './entities/rrhh/funcionario-turno.entity';
import { Asistencia } from './entities/rrhh/asistencia.entity';
import { Penalizacion } from './entities/rrhh/penalizacion.entity';
import { Feriado } from './entities/rrhh/feriado.entity';
import { HoraExtra } from './entities/rrhh/hora-extra.entity';
import { Vale } from './entities/rrhh/vale.entity';
import { MotivoVale } from './entities/rrhh/motivo-vale.entity';
import { LiquidacionSueldo } from './entities/rrhh/liquidacion-sueldo.entity';
import { LiquidacionItem } from './entities/rrhh/liquidacion-item.entity';
import { LiquidacionConcepto } from './entities/rrhh/liquidacion-concepto.entity';
import { Bono } from './entities/rrhh/bono.entity';
import { Aguinaldo } from './entities/rrhh/aguinaldo.entity';
import { Vacacion } from './entities/rrhh/vacacion.entity';
import { VacacionPeriodo } from './entities/rrhh/vacacion-periodo.entity';
import { VacacionVenta } from './entities/rrhh/vacacion-venta.entity';
import { LiquidacionFinal } from './entities/rrhh/liquidacion-final.entity';
import { LiquidacionFinalItem } from './entities/rrhh/liquidacion-final-item.entity';
// RRHH Fase 6 - Comisiones
import { ReglaComision } from './entities/rrhh/regla-comision.entity';
import { ReglaComisionProducto } from './entities/rrhh/regla-comision-producto.entity';
import { ReglaComisionRequisito } from './entities/rrhh/regla-comision-requisito.entity';
import { FuncionarioReglaComision } from './entities/rrhh/funcionario-regla-comision.entity';
import { EquipoComision } from './entities/rrhh/equipo-comision.entity';
import { EquipoComisionMiembro } from './entities/rrhh/equipo-comision-miembro.entity';
import { EquipoComisionRegla } from './entities/rrhh/equipo-comision-regla.entity';
import { LiquidacionComision } from './entities/rrhh/liquidacion-comision.entity';
import { LiquidacionComisionItem } from './entities/rrhh/liquidacion-comision-item.entity';
// RRHH Fase 8 - Notificaciones
import { NotificacionRrhh } from './entities/rrhh/notificacion-rrhh.entity';

import { Moneda } from './entities/financiero/moneda.entity';
import { TipoPrecio } from './entities/financiero/tipo-precio.entity';

// Import productos entities
import { Familia } from './entities/productos/familia.entity';
import { Subfamilia } from './entities/productos/subfamilia.entity';
import { Producto } from './entities/productos/producto.entity';
import { Presentacion } from './entities/productos/presentacion.entity';
import { CodigoBarra } from './entities/productos/codigo-barra.entity';
import { PrecioVenta } from './entities/productos/precio-venta.entity';
import { PrecioCosto } from './entities/productos/precio-costo.entity';
import { Receta } from './entities/productos/receta.entity';
import { RecetaIngrediente } from './entities/productos/receta-ingrediente.entity';
import { Adicional } from './entities/productos/adicional.entity';
import { RecetaAdicionalVinculacion } from './entities/productos/receta-adicional-vinculacion.entity';
import { RecetaIngredienteIntercambiable } from './entities/productos/receta-ingrediente-intercambiable.entity';
import { Observacion } from './entities/productos/observacion.entity';
import { ProductoObservacion } from './entities/productos/producto-observacion.entity';
import { TamanhoPizza } from './entities/productos/tamanho-pizza.entity';
import { SaborPizza } from './entities/productos/sabor-pizza.entity';
import { EnsambladoPizza } from './entities/productos/ensamblado-pizza.entity';
import { EnsambladoPizzaSabor } from './entities/productos/ensamblado-pizza-sabor.entity';
import { Produccion } from './entities/productos/produccion.entity';
import { ProduccionIngrediente } from './entities/productos/produccion-ingrediente.entity';
import { StockMovimiento } from './entities/productos/stock-movimiento.entity';
import { Combo } from './entities/productos/combo.entity';
import { ComboProducto } from './entities/productos/combo-producto.entity';
import { Promocion } from './entities/productos/promocion.entity';
import { PromocionPresentacion } from './entities/productos/promocion-presentacion.entity';
import { ConversionMoneda } from './entities/productos/conversion-moneda.entity';
import { ConfiguracionMonetaria } from './entities/productos/configuracion-monetaria.entity';
// ✅ NUEVAS ENTIDADES PARA ARQUITECTURA CON VARIACIONES
import { Sabor } from './entities/productos/sabor.entity';
import { RecetaPresentacion } from './entities/productos/receta-presentacion.entity';

// Import new financial entities
import { MonedaBillete } from './entities/financiero/moneda-billete.entity';
import { Dispositivo } from './entities/financiero/dispositivo.entity';
import { Conteo } from './entities/financiero/conteo.entity';
import { ConteoDetalle } from './entities/financiero/conteo-detalle.entity';
import { Caja } from './entities/financiero/caja.entity';
import { CajaMoneda } from './entities/financiero/caja-moneda.entity';
import { MonedaCambio } from './entities/financiero/moneda-cambio.entity';

// Caja Mayor entities
import { CajaMayor } from './entities/financiero/caja-mayor.entity';
import { CajaMayorSaldo } from './entities/financiero/caja-mayor-saldo.entity';
import { CajaMayorMovimiento } from './entities/financiero/caja-mayor-movimiento.entity';
import { CajaMayorConfiguracion } from './entities/financiero/caja-mayor-configuracion.entity';
import { GastoCategoria } from './entities/financiero/gasto-categoria.entity';
import { Gasto } from './entities/financiero/gasto.entity';
import { RetiroCaja } from './entities/financiero/retiro-caja.entity';
import { RetiroCajaDetalle } from './entities/financiero/retiro-caja-detalle.entity';
import { GastoDetalle } from './entities/financiero/gasto-detalle.entity';

// Banking entities (Fase 2)
import { CuentaBancaria } from './entities/financiero/cuenta-bancaria.entity';
import { MaquinaPos } from './entities/financiero/maquina-pos.entity';
import { AcreditacionPos } from './entities/financiero/acreditacion-pos.entity';
import { MovimientoBancario } from './entities/financiero/movimiento-bancario.entity';

// Compras + CuentasPorPagar (Fase 3)
import { CompraCategoria } from './entities/compras/compra-categoria.entity';
import { CompraCuota } from './entities/compras/compra-cuota.entity';
import { CuentaPorPagar } from './entities/financiero/cuenta-por-pagar.entity';
import { CuentaPorPagarCuota } from './entities/financiero/cuenta-por-pagar-cuota.entity';

// CuentasPorCobrar + MovimientosCliente (Fase 7)
import { CuentaPorCobrar } from './entities/financiero/cuenta-por-cobrar.entity';
import { CuentaPorCobrarCuota } from './entities/financiero/cuenta-por-cobrar-cuota.entity';
import { CobroConsolidado } from './entities/financiero/cobro-consolidado.entity';
import { CobroConsolidadoDetalle } from './entities/financiero/cobro-consolidado-detalle.entity';
import { MovimientoCliente } from './entities/financiero/movimiento-cliente.entity';

// Entradas Varias + Operaciones Financieras (caja mayor)
import { EntradaVariaCategoria } from './entities/financiero/entrada-varia-categoria.entity';
import { EntradaVaria } from './entities/financiero/entrada-varia.entity';
import { OperacionFinancieraCategoria } from './entities/financiero/operacion-financiera-categoria.entity';
import { OperacionFinanciera } from './entities/financiero/operacion-financiera.entity';

// Chequeras + Cheques (banking)
import { Chequera } from './entities/financiero/chequera.entity';
import { Cheque } from './entities/financiero/cheque.entity';

// Personalización
import { DashboardShortcut } from './entities/personalizacion/dashboard-shortcut.entity';
import { OnboardingTaskOverride } from './entities/personalizacion/onboarding-task-override.entity';

// Sistema (config global)
import { Empresa } from './entities/sistema/empresa.entity';

// Import compras entities
import { Proveedor } from './entities/compras/proveedor.entity';
import { Pago } from './entities/compras/pago.entity';
import { PagoDetalle } from './entities/compras/pago-detalle.entity';
import { Compra } from './entities/compras/compra.entity';
import { CompraDetalle } from './entities/compras/compra-detalle.entity';
import { ProveedorProducto } from './entities/compras/proveedor-producto.entity';
import { FormasPago } from './entities/compras/forma-pago.entity';
import { DocumentoCompraImportado } from './entities/compras/documento-compra-importado.entity';
import { OcrAliasProveedor } from './entities/compras/ocr-alias-proveedor.entity';
import { OcrAliasProducto } from './entities/compras/ocr-alias-producto.entity';

// IA Prompt config
import { IaPromptConfig } from './entities/ia/ia-prompt-config.entity';
import { IaPromptSugerencia } from './entities/ia/ia-prompt-sugerencia.entity';

// Migrations baseline + futuras

// Import new PDV entities
import { PrecioDelivery } from './entities/ventas/precio-delivery.entity';
import { Delivery } from './entities/ventas/delivery.entity';
import { Venta } from './entities/ventas/venta.entity';
import { VentaItem } from './entities/ventas/venta-item.entity';
import { VentaItemObservacion } from './entities/ventas/venta-item-observacion.entity';
import { VentaItemAdicional } from './entities/ventas/venta-item-adicional.entity';
import { VentaItemIngredienteModificacion } from './entities/ventas/venta-item-ingrediente-modificacion.entity';
import { PdvGrupoCategoria } from './entities/ventas/pdv-grupo-categoria.entity';
import { PdvCategoria } from './entities/ventas/pdv-categoria.entity';
import { PdvCategoriaItem } from './entities/ventas/pdv-categoria-item.entity';
import { PdvItemProducto } from './entities/ventas/pdv-item-producto.entity';
import { PdvConfig } from './entities/ventas/pdv-config.entity';
// Import new entities for Mesas, Reservas, and Comandas
import { PdvMesa } from './entities/ventas/pdv-mesa.entity';
import { Reserva } from './entities/ventas/reserva.entity';
import { Comanda } from './entities/ventas/comanda.entity';
import { ComandaItem } from './entities/ventas/comanda-item.entity';
import { KdsPantalla } from './entities/ventas/kds-pantalla.entity';
import { Sector } from './entities/ventas/sector.entity';
import { SectorImpresora } from './entities/ventas/sector-impresora.entity';
import { ProductoSector } from './entities/productos/producto-sector.entity';
// Migrations
import { Baseline1778378410416 } from './migrations/1778378410416-Baseline';
import { BaselinePostgres1778380893207 } from './migrations/1778380893207-BaselinePostgres';
import { AddDispositivoIdToTrackedEntities1778390000000 } from './migrations/1778390000000-AddDispositivoIdToTrackedEntities';
import { AddOnboardingTaskOverrides1778400000000 } from './migrations/1778400000000-AddOnboardingTaskOverrides';
import { AddEmpresa1778500000000 } from './migrations/1778500000000-AddEmpresa';
import { AddMustChangePasswordToUsuario1778600000000 } from './migrations/1778600000000-AddMustChangePasswordToUsuario';
import { AddSistemaDocumentos1779000000000 } from './migrations/1779000000000-AddSistemaDocumentos';
import { AddRequiereComandaToProducto1779100000000 } from './migrations/1779100000000-AddRequiereComandaToProducto';
import { AddPrinterTicketToDispositivo1779200000000 } from './migrations/1779200000000-AddPrinterTicketToDispositivo';
import { AddCuentaBancariaToLiquidacionSueldo1779400000000 } from './migrations/1779400000000-AddCuentaBancariaToLiquidacionSueldo';
import { AddConveniosCobroConsolidado1779500000000 } from './migrations/1779500000000-AddConveniosCobroConsolidado';
import { AddVacacionVentas1779600000000 } from './migrations/1779600000000-AddVacacionVentas';
import { AddCuentaBancariaToPagosCobros1779700000000 } from './migrations/1779700000000-AddCuentaBancariaToPagosCobros';
import { AddCotizacionBancariaToPagosCobros1779800000000 } from './migrations/1779800000000-AddCotizacionBancariaToPagosCobros';
import { AddKdsToComandaItem1780000000000 } from './migrations/1780000000000-AddKdsToComandaItem';
import { AddKdsPantalla1780100000000 } from './migrations/1780100000000-AddKdsPantalla';
// Atajo (accesos rápidos) entities
import { PdvAtajoGrupo } from './entities/ventas/pdv-atajo-grupo.entity';
import { PdvAtajoItem } from './entities/ventas/pdv-atajo-item.entity';
import { PdvAtajoGrupoItem } from './entities/ventas/pdv-atajo-grupo-item.entity';
import { PdvAtajoItemProducto } from './entities/ventas/pdv-atajo-item-producto.entity';
import { VentaItemSabor } from './entities/ventas/venta-item-sabor.entity';

/**
 * Override de conexion. F1.1: el caller (main.ts) lo construye leyendo
 * app-settings.database + keytar para password Postgres. Si no se pasa,
 * default = SQLite en `userData/frc-gourmet.db` (back compat).
 */
export interface DbConnectionOverride {
  type: 'sqlite' | 'postgres';
  // sqlite
  sqlitePath?: string; // 'default' o path absoluto
  // postgres
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string; // resuelto desde keytar antes de llegar aca
  schema?: string;
  ssl?: boolean;
}

/**
 * Get the configuration for TypeORM
 * @param userDataPath Path to store the database file
 * @param override     Si se pasa, define backend (sqlite custom o postgres)
 * @returns DataSourceOptions for TypeORM configuration
 */
export function getDataSourceOptions(
  userDataPath: string,
  override?: DbConnectionOverride,
): DataSourceOptions {
  const entities = getEntitiesList();
  const driverType: 'sqlite' | 'postgres' = override?.type === 'postgres' ? 'postgres' : 'sqlite';
  const sharedOptions = {
    entities,
    // F1.5: synchronize eliminado definitivamente. Toda nueva entity exige
    // migration generada con `npm run migration:generate`.
    // DatabaseService corre las migrations manualmente tras backup pre-migrate.
    synchronize: false,
    logging: process.env['NODE_ENV'] === 'development',
    migrations: getMigrations(driverType),
    migrationsRun: false,
    migrationsTableName: 'typeorm_migrations',
  };

  if (override?.type === 'postgres') {
    return {
      type: 'postgres',
      host: override.host || 'localhost',
      port: override.port || 5432,
      database: override.database || 'frc_gourmet',
      username: override.username || 'postgres',
      password: override.password || '',
      schema: override.schema,
      ssl: override.ssl,
      ...sharedOptions,
    } as DataSourceOptions;
  }

  // sqlite default o con path custom
  const dbPath =
    override?.sqlitePath && override.sqlitePath !== 'default'
      ? override.sqlitePath
      : path.join(userDataPath, 'frc-gourmet.db');
  return {
    type: 'sqlite',
    database: dbPath,
    ...sharedOptions,
  };
}

function getEntitiesList(): any[] {
  return [
      // Entity classes
      Printer,
      Persona,
      Usuario,
      Role,
      UsuarioRole,
      TipoCliente,
      Cliente,
      Convenio,
      Permission,
      RolePermission,
      LoginSession,
      RefreshToken,
      // Shared
      Adjunto,
      // RRHH entities
      ConfiguracionRrhh,
      Cargo,
      Funcionario,
      HistoricoCargo,
      HistoricoSalario,
      FuncionarioDocumento,
      Turno,
      FuncionarioTurno,
      Asistencia,
      Penalizacion,
      Feriado,
      HoraExtra,
      Vale,
      MotivoVale,
      LiquidacionSueldo,
      LiquidacionItem,
      LiquidacionConcepto,
      Bono,
      Aguinaldo,
      Vacacion,
      VacacionPeriodo,
      VacacionVenta,
      LiquidacionFinal,
      LiquidacionFinalItem,
      // RRHH Fase 6 - Comisiones
      ReglaComision,
      ReglaComisionProducto,
      ReglaComisionRequisito,
      FuncionarioReglaComision,
      EquipoComision,
      EquipoComisionMiembro,
      EquipoComisionRegla,
      LiquidacionComision,
      LiquidacionComisionItem,
      // RRHH Fase 8 - Notificaciones
      NotificacionRrhh,
      // Financiero entities
      Moneda,
      TipoPrecio,
      MonedaBillete,
      Dispositivo,
      Conteo,
      ConteoDetalle,
      Caja,
      CajaMoneda,
      MonedaCambio,
      // Caja Mayor entities
      CajaMayor,
      CajaMayorSaldo,
      CajaMayorMovimiento,
      CajaMayorConfiguracion,
      GastoCategoria,
      Gasto,
      GastoDetalle,
      RetiroCaja,
      RetiroCajaDetalle,
      // Banking (Fase 2)
      CuentaBancaria,
      MaquinaPos,
      AcreditacionPos,
      MovimientoBancario,
      // CuentasPorPagar (Fase 3)
      CompraCategoria,
      CompraCuota,
      CuentaPorPagar,
      CuentaPorPagarCuota,
      // CuentasPorCobrar + MovimientosCliente (Fase 7)
      CuentaPorCobrar,
      CuentaPorCobrarCuota,
      CobroConsolidado,
      CobroConsolidadoDetalle,
      MovimientoCliente,
      // Entradas Varias + Operaciones Financieras + Chequeras + Cheques
      EntradaVariaCategoria,
      EntradaVaria,
      OperacionFinancieraCategoria,
      OperacionFinanciera,
      Chequera,
      Cheque,
      // Personalización
      DashboardShortcut,
      OnboardingTaskOverride,
      // Sistema (config global)
      Empresa,
      // Productos entities
      Familia,
      Subfamilia,
      Producto,
      Presentacion,
      CodigoBarra,
      PrecioVenta,
      PrecioCosto,
      Receta,
      RecetaIngrediente,
      Adicional,
      RecetaAdicionalVinculacion,
      RecetaIngredienteIntercambiable,
      Observacion,
      ProductoObservacion,
      TamanhoPizza,
      SaborPizza,
      EnsambladoPizza,
      EnsambladoPizzaSabor,
      Produccion,
      ProduccionIngrediente,
      StockMovimiento,
      Combo,
      ComboProducto,
      Promocion,
      PromocionPresentacion,
      ConversionMoneda,
      ConfiguracionMonetaria,
      // ✅ NUEVAS ENTIDADES PARA VARIACIONES
      Sabor,
      RecetaPresentacion,
      // Compras entities
      Proveedor,
      Pago,
      PagoDetalle,
      Compra,
      CompraDetalle,
      ProveedorProducto,
      FormasPago,
      DocumentoCompraImportado,
      OcrAliasProveedor,
      OcrAliasProducto,
      // IA Prompt config + sugerencias
      IaPromptConfig,
      IaPromptSugerencia,
      // Ventas entities
      PrecioDelivery,
      Delivery,
      Venta,
      VentaItem,
      VentaItemObservacion,
      VentaItemAdicional,
      VentaItemIngredienteModificacion,
      // PDV entities
      PdvGrupoCategoria,
      PdvCategoria,
      PdvCategoriaItem,
      PdvItemProducto,
      PdvConfig,
      // Mesa, Reserva, and Comanda entities
      PdvMesa,
      Reserva,
      Comanda,
      ComandaItem,
      KdsPantalla,
      Sector,
      SectorImpresora,
      ProductoSector,
      // Atajo (accesos rápidos) entities
      PdvAtajoGrupo,
      PdvAtajoItem,
      PdvAtajoGrupoItem,
      PdvAtajoItemProducto,
      // VentaItem sabores (variaciones multi-sabor)
      VentaItemSabor,
  ];
}

/** Detecta si la app corre empaquetada (instalador) vs en dev. */
export function isPackagedApp(): boolean {
  if (process.env['ELECTRON_IS_PACKAGED'] === '1') return true;
  if (process.env['NODE_ENV'] === 'production') return true;
  try {
    // electron.app no existe en el renderer; sólo en el proceso principal.
    return !!(electron as any)?.app?.isPackaged;
  } catch {
    return false;
  }
}

/**
 * Lista de migraciones a ejecutar. Se importan acá para que el bundler las incluya.
 *
 * F1.4: la baseline difiere por driver porque `migration:generate` produce SQL
 * específico al driver target. Mantenemos dos baselines y elegimos según
 * el driver activo. Migraciones incrementales (post-baseline) van al final
 * y deben ser portables (testear en ambos drivers o usar guard `if (driverType)`).
 */
function getMigrations(driverType: 'sqlite' | 'postgres'): Function[] {
  const baseline = driverType === 'postgres'
    ? BaselinePostgres1778380893207
    : Baseline1778378410416;
  return [
    baseline,
    // Migraciones incrementales — corren post-baseline. Driver-aware si
    // necesitan SQL especifico de cada driver. Ver docs/MIGRATIONS.md
    AddDispositivoIdToTrackedEntities1778390000000,
    AddOnboardingTaskOverrides1778400000000,
    AddEmpresa1778500000000,
    AddMustChangePasswordToUsuario1778600000000,
    AddSistemaDocumentos1779000000000,
    AddRequiereComandaToProducto1779100000000,
    AddPrinterTicketToDispositivo1779200000000,
    AddCuentaBancariaToLiquidacionSueldo1779400000000,
    AddConveniosCobroConsolidado1779500000000,
    AddVacacionVentas1779600000000,
    AddCuentaBancariaToPagosCobros1779700000000,
    AddCotizacionBancariaToPagosCobros1779800000000,
    AddKdsToComandaItem1780000000000,
    AddKdsPantalla1780100000000,
  ];
}

/**
 * Create a new TypeORM DataSource
 * @param userDataPath Path to store the database file
 * @param override     Connection override (sqlite path o postgres). Default sqlite.
 * @returns Promise with DataSource
 */
export function createDataSource(
  userDataPath: string,
  override?: DbConnectionOverride,
): Promise<DataSource> {
  const dataSource = new DataSource(getDataSourceOptions(userDataPath, override));
  return dataSource.initialize();
}
