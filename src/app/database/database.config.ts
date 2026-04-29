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
import { Permission } from './entities/personas/permission.entity';
import { RolePermission } from './entities/personas/role-permission.entity';
import { LoginSession } from './entities/auth/login-session.entity';

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

// Import compras entities
import { Proveedor } from './entities/compras/proveedor.entity';
import { Pago } from './entities/compras/pago.entity';
import { PagoDetalle } from './entities/compras/pago-detalle.entity';
import { Compra } from './entities/compras/compra.entity';
import { CompraDetalle } from './entities/compras/compra-detalle.entity';
import { ProveedorProducto } from './entities/compras/proveedor-producto.entity';
import { FormasPago } from './entities/compras/forma-pago.entity';

// Migrations deshabilitadas en desarrollo: usamos synchronize=true

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
import { Sector } from './entities/ventas/sector.entity';
// Atajo (accesos rápidos) entities
import { PdvAtajoGrupo } from './entities/ventas/pdv-atajo-grupo.entity';
import { PdvAtajoItem } from './entities/ventas/pdv-atajo-item.entity';
import { PdvAtajoGrupoItem } from './entities/ventas/pdv-atajo-grupo-item.entity';
import { PdvAtajoItemProducto } from './entities/ventas/pdv-atajo-item-producto.entity';
import { VentaItemSabor } from './entities/ventas/venta-item-sabor.entity';

/**
 * Get the configuration for TypeORM
 * @param userDataPath Path to store the database file
 * @returns DataSourceOptions for TypeORM configuration
 */
export function getDataSourceOptions(userDataPath: string): DataSourceOptions {
  return {
    type: 'sqlite',
    database: path.join(userDataPath, 'frc-gourmet.db'),
    entities: [
      // Entity classes
      Printer,
      Persona,
      Usuario,
      Role,
      UsuarioRole,
      TipoCliente,
      Cliente,
      Permission,
      RolePermission,
      LoginSession,
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
      // Entradas Varias + Operaciones Financieras + Chequeras + Cheques
      EntradaVariaCategoria,
      EntradaVaria,
      OperacionFinancieraCategoria,
      OperacionFinanciera,
      Chequera,
      Cheque,
      // Personalización
      DashboardShortcut,
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
      Sector,
      // Atajo (accesos rápidos) entities
      PdvAtajoGrupo,
      PdvAtajoItem,
      PdvAtajoGrupoItem,
      PdvAtajoItemProducto,
      // VentaItem sabores (variaciones multi-sabor)
      VentaItemSabor
    ],
    synchronize: true, // Automatically creates tables in development
    logging: process.env['NODE_ENV'] === 'development',
    migrations: [],
  };
}

/**
 * Create a new TypeORM DataSource
 * @param userDataPath Path to store the database file
 * @returns Promise with DataSource
 */
export function createDataSource(userDataPath: string): Promise<DataSource> {
  const dataSource = new DataSource(getDataSourceOptions(userDataPath));
  return dataSource.initialize();
}
