# Catálogo de métodos RPC (generado)

> **No editar a mano.** Lo genera `python3 scripts/generate-api-catalog.py` desde `electron/handlers/*.ts`
> y `electron/server/rpc-router.ts`. Cómo llamar a la API: [README.md](README.md).

Total: **1017 métodos** en 79 módulos — 370 lectura (L), 488 escritura (E), 131 destructivos (D), 28 bloqueados por HTTP (B).

Formato: `TIPO método(param1, param2?)` 🔒 permisos que exige (si exige alguno basta tener uno).
Los parámetros van **en ese orden** en `params` (array posicional). `?` = opcional. `obj` = objeto desestructurado.
La clasificación L/E/D es por el nombre del método (heurística, con correcciones manuales): ante la duda, leer el handler.

## Módulos

[adjuntos](#adjuntos) (5) · [app-mode](#app-mode) (3) · [asistencia-facial](#asistencia-facial) (4) · [asistencias](#asistencias) (19) · [auth](#auth) (7) · [backup](#backup) (14) · [banking](#banking) (29) · [busqueda-global](#busqueda-global) (1) · [caja-mayor](#caja-mayor) (54) · [comisiones](#comisiones) (16) · [compras](#compras) (42) · [configuracion-rrhh](#configuracion-rrhh) (6) · [convenios](#convenios) (12) · [cotizacion-mercado](#cotizacion-mercado) (1) · [cuentas-bancarias-destino](#cuentas-bancarias-destino) (5) · [cuentas-por-cobrar](#cuentas-por-cobrar) (11) · [cuentas-por-pagar](#cuentas-por-pagar) (20) · [dashboard-caja-mayor](#dashboard-caja-mayor) (1) · [dashboard-compras](#dashboard-compras) (1) · [dashboard-financiero](#dashboard-financiero) (1) · [dashboard-productos](#dashboard-productos) (1) · [dashboard-rrhh](#dashboard-rrhh) (1) · [dashboard-shortcuts](#dashboard-shortcuts) (4) · [dashboard-ventas](#dashboard-ventas) (1) · [db-config](#db-config) (5) · [delivery](#delivery) (9) · [disciplina-catalogos](#disciplina-catalogos) (2) · [disciplina-premios](#disciplina-premios) (2) · [disciplina-puntos](#disciplina-puntos) (7) · [disciplina-votacion](#disciplina-votacion) (5) · [disciplina](#disciplina) (9) · [documentos-tickets](#documentos-tickets) (12) · [empresa](#empresa) (2) · [equipos-comision](#equipos-comision) (11) · [face-models](#face-models) (3) · [factura-import](#factura-import) (20) · [facturacion](#facturacion) (21) · [feriados](#feriados) (4) · [files](#files) (5) · [financiero](#financiero) (58) · [funcionario-documentos](#funcionario-documentos) (5) · [gastos-caja](#gastos-caja) (5) · [horas-extra](#horas-extra) (3) · [images](#images) (2) · [kds](#kds) (9) · [liquidacion-final](#liquidacion-final) (5) · [liquidacion-sueldo](#liquidacion-sueldo) (17) · [menu-config](#menu-config) (2) · [mesa-qr](#mesa-qr) (3) · [movimientos-cliente](#movimientos-cliente) (4) · [musica](#musica) (63) · [notificaciones-config](#notificaciones-config) (16) · [notificaciones-rrhh](#notificaciones-rrhh) (5) · [onboarding](#onboarding) (2) · [pago-consolidado](#pago-consolidado) (4) · [password-recovery](#password-recovery) (4) · [pdv-egresos](#pdv-egresos) (7) · [pedidos-online-admin](#pedidos-online-admin) (9) · [pedidos-online-auth](#pedidos-online-auth) (9) · [pedidos-online-config](#pedidos-online-config) (3) · [pedidos-online-pedidos](#pedidos-online-pedidos) (6) · [pedidos-online](#pedidos-online) (1) · [permissions](#permissions) (9) · [personas](#personas) (34) · [printers](#printers) (8) · [producto-sectores](#producto-sectores) (2) · [productos](#productos) (69) · [qr-upload](#qr-upload) (4) · [recetas](#recetas) (73) · [remote-tunnel](#remote-tunnel) (3) · [reportes-rrhh](#reportes-rrhh) (17) · [reportes](#reportes) (3) · [rrhh-funcionarios](#rrhh-funcionarios) (16) · [sectores-impresoras](#sectores-impresoras) (5) · [system](#system) (2) · [vacaciones](#vacaciones) (8) · [vales](#vales) (12) · [ventas](#ventas) (129) · [auto-updater](#auto-updater) (5)

## adjuntos

`electron/handlers/adjuntos*.ts` — 5 métodos: 2L 2E 1D 0B

- L `get-adjuntos`(params)
- L `get-adjunto-by-id`(id)
- E `create-adjunto`(data) 🔒 DOCUMENTOS_ADJUNTAR
- E `update-adjunto`(id, data) 🔒 DOCUMENTOS_ADJUNTAR
- D `delete-adjunto`(id) 🔒 DOCUMENTOS_ADJUNTOS_ELIMINAR

## app-mode

`electron/handlers/app-mode*.ts` — 3 métodos: 0L 1E 0D 2B

- E `app-mode-get`()
- B `app-mode-save`(payload) 🔒 SISTEMA_MODO_CONFIGURAR
- B `app-mode-test-server`(payload)

## asistencia-facial

`electron/handlers/asistencia-facial*.ts` — 4 métodos: 1L 2E 1D 0B

- E `enrolar-rostro`(data) 🔒 RRHH_FUNCIONARIO_EDITAR
- L `get-rostros-funcionario`(funcionarioId)
- D `eliminar-rostro`(id) 🔒 RRHH_FUNCIONARIO_EDITAR
- E `fichar-facial`(payload)

## asistencias

`electron/handlers/asistencias*.ts` — 19 métodos: 6L 10E 3D 0B

- L `get-turnos`()
- L `get-turno`(id)
- E `create-turno`(data) 🔒 RRHH_CONFIG_EDITAR
- E `update-turno`(id, data) 🔒 RRHH_CONFIG_EDITAR
- D `delete-turno`(id) 🔒 RRHH_CONFIG_EDITAR
- E `asignar-turno-funcionario`(data) 🔒 RRHH_ASISTENCIA_REGISTRAR
- L `get-funcionario-turnos`(funcionarioId)
- D `cerrar-funcionario-turno`(id, fechaHasta?) 🔒 RRHH_ASISTENCIA_REGISTRAR
- E `update-funcionario-turno`(id, data) 🔒 RRHH_ASISTENCIA_REGISTRAR
- L `get-asistencias`(filtros)
- L `get-asistencia`(id)
- E `create-asistencia`(data) 🔒 RRHH_ASISTENCIA_REGISTRAR
- E `update-asistencia`(id, data) 🔒 RRHH_ASISTENCIA_REGISTRAR
- E `justificar-asistencia`(id, data) 🔒 RRHH_ASISTENCIA_JUSTIFICAR
- E `marcar-asistencia-masiva`(payload) 🔒 RRHH_ASISTENCIA_REGISTRAR
- L `get-penalizaciones`(filtros)
- E `create-penalizacion`(data) 🔒 RRHH_PENALIZACION_REGISTRAR
- E `update-penalizacion`(data) 🔒 RRHH_PENALIZACION_REGISTRAR
- D `anular-penalizacion`(id) 🔒 RRHH_PENALIZACION_REGISTRAR

## auth

`electron/handlers/auth*.ts` — 7 métodos: 3L 3E 1D 0B

- E `login`(loginData)
- L `validate-credentials`(data)
- E `logout`(sessionId)
- E `updateSessionActivity`(sessionId)
- L `getLoginSessions`(usuarioId)
- L `getCurrentUser`()
- D `restoreSession`(payload)

## backup

`electron/handlers/backup*.ts` — 14 métodos: 0L 6E 0D 8B

- E `backup-get-info`()
- E `backup-create`(opts) 🔒 SISTEMA_BACKUP
- B `backup-create-and-export`(opts) 🔒 SISTEMA_BACKUP
- E `backup-list`()
- B `backup-delete`(fullPath) 🔒 SISTEMA_BACKUP
- B `backup-pick-restore-file`()
- B `backup-pick-folder`()
- B `backup-restore`(opts) 🔒 SISTEMA_BACKUP
- E `backup-send-whatsapp`(opts) 🔒 SISTEMA_BACKUP
- E `backup-config-get`()
- B `backup-config-set`(partial) 🔒 SISTEMA_BACKUP
- E `backup-trigger-auto-now`() 🔒 SISTEMA_BACKUP
- B `backup-db-reset`(opts) 🔒 SISTEMA_BACKUP
- B `backup-clear-images`(opts) 🔒 SISTEMA_BACKUP

## banking

`electron/handlers/banking*.ts` — 29 métodos: 12L 13E 4D 0B

- L `get-cuentas-bancarias`()
- L `get-cuenta-bancaria`(id)
- E `create-cuenta-bancaria`(data) 🔒 BANCOS_GESTIONAR
- E `update-cuenta-bancaria`(id, data) 🔒 BANCOS_GESTIONAR
- D `delete-cuenta-bancaria`(id) 🔒 BANCOS_GESTIONAR
- L `get-maquinas-pos`()
- L `get-maquina-pos`(id)
- E `create-maquina-pos`(data) 🔒 BANCOS_GESTIONAR
- E `update-maquina-pos`(id, data) 🔒 BANCOS_GESTIONAR
- D `delete-maquina-pos`(id) 🔒 BANCOS_GESTIONAR
- L `get-acreditaciones-pos`(filtros?)
- L `get-acreditacion-pos`(id)
- E `create-acreditacion-pos`(data) 🔒 VENTAS_COBRAR
- E `procesar-acreditaciones-auto`() 🔒 BANCOS_GESTIONAR
- E `verificar-acreditacion-pos`(id, montoAcreditado) 🔒 BANCOS_GESTIONAR
- E `acreditar-transferencia-bancaria`(payload) 🔒 VENTAS_COBRAR
- L `get-movimientos-cuenta-bancaria`(cuentaBancariaId, filtros?)
- E `create-movimiento-bancario`(data) 🔒 BANCOS_GESTIONAR
- L `get-acreditaciones-pendientes`()
- L `get-chequeras`()
- L `get-chequera`(id)
- E `create-chequera`(data) 🔒 BANCOS_GESTIONAR
- E `update-chequera`(id, data) 🔒 BANCOS_GESTIONAR
- D `delete-chequera`(id) 🔒 BANCOS_GESTIONAR
- L `get-cheques`(filtros?)
- L `get-cheque`(id)
- E `emitir-cheque`(data) 🔒 BANCOS_GESTIONAR
- E `cobrar-cheque`(id, data?) 🔒 BANCOS_GESTIONAR
- D `anular-cheque`(id, motivo) 🔒 BANCOS_GESTIONAR

## busqueda-global

`electron/handlers/busqueda-global*.ts` — 1 métodos: 1L 0E 0D 0B

- L `buscar-global`(termino)

## caja-mayor

`electron/handlers/caja-mayor*.ts` — 54 métodos: 25L 21E 8D 0B

- L `get-cajas-mayor`()
- L `get-caja-mayor`(id)
- E `create-caja-mayor`(data) 🔒 FINANCIERO_CAJA_GESTIONAR
- E `update-caja-mayor`(id, data) 🔒 FINANCIERO_CAJA_GESTIONAR
- D `cerrar-caja-mayor`(id) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-caja-mayor-saldos`(cajaMayorId)
- E `recalcular-saldos`(cajaMayorId) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-caja-mayor-movimientos`(cajaMayorId, filtros?)
- L `get-movimientos-caja-mayor-consolidados`(cajaMayorId, filtros?)
- E `create-caja-mayor-movimiento`(data) 🔒 CAJA_MAYOR_OPERAR
- D `anular-caja-mayor-movimiento`(id, motivo) 🔒 CAJA_MAYOR_OPERAR
- L `get-gasto-categorias`()
- L `get-gasto-categoria`(id)
- E `create-gasto-categoria`(data) 🔒 CAJA_MAYOR_OPERAR
- E `update-gasto-categoria`(id, data) 🔒 CAJA_MAYOR_OPERAR
- D `delete-gasto-categoria`(id) 🔒 CAJA_MAYOR_OPERAR
- L `get-gastos`(filtros?)
- L `get-gasto`(id)
- E `create-gasto`(data) 🔒 CAJA_MAYOR_OPERAR
- D `anular-gasto`(id, motivo) 🔒 CAJA_MAYOR_OPERAR
- E `edit-gasto`(gastoId, data) 🔒 CAJA_MAYOR_OPERAR
- E `edit-caja-mayor-movimiento`(movId, data) 🔒 CAJA_MAYOR_OPERAR
- L `get-gastos-programados`()
- L `get-retiros-caja`(filtros?)
- L `get-retiro-caja`(id)
- E `create-retiro-caja`(data) 🔒 CAJA_MAYOR_OPERAR
- E `ingresar-retiro-caja`(retiroId, cajaMayorId) 🔒 CAJA_MAYOR_OPERAR
- E `generar-retiro-cierre-caja`(cajaId) 🔒 CAJA_MAYOR_OPERAR
- E `egreso-caja-inicial`(data) 🔒 CAJA_MAYOR_OPERAR
- E `abrir-caja-desde-conteo`(conteoId, dispositivoId) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-entrada-varia-categorias`()
- L `get-entrada-varia-categoria`(id)
- E `create-entrada-varia-categoria`(data) 🔒 CAJA_MAYOR_OPERAR
- E `update-entrada-varia-categoria`(id, data) 🔒 CAJA_MAYOR_OPERAR
- D `delete-entrada-varia-categoria`(id) 🔒 CAJA_MAYOR_OPERAR
- L `get-entradas-varias`(filtros?)
- L `get-entrada-varia`(id)
- E `create-entrada-varia`(data) 🔒 CAJA_MAYOR_OPERAR
- D `anular-entrada-varia`(id, motivo) 🔒 CAJA_MAYOR_OPERAR
- L `get-operacion-financiera-categorias`()
- L `get-operacion-financiera-categoria`(id)
- E `create-operacion-financiera-categoria`(data) 🔒 CAJA_MAYOR_OPERAR
- E `update-operacion-financiera-categoria`(id, data) 🔒 CAJA_MAYOR_OPERAR
- D `delete-operacion-financiera-categoria`(id) 🔒 CAJA_MAYOR_OPERAR
- L `get-operaciones-financieras`(filtros?)
- L `get-operacion-financiera`(id)
- E `create-operacion-financiera`(data) 🔒 CAJA_MAYOR_OPERAR
- D `anular-operacion-financiera`(id, motivo) 🔒 CAJA_MAYOR_OPERAR
- L `get-caja-mayor-configuracion`(cajaMayorId)
- E `save-caja-mayor-configuracion`(cajaMayorId, data) 🔒 CAJA_MAYOR_OPERAR
- L `get-caja-mayor-cpp-resumen`()
- L `get-caja-mayor-cpc-resumen`()
- L `get-cuenta-bancaria-resumen`(cuentaBancariaId)
- L `get-cuentas-bancarias-resumenes`(ids)

## comisiones

`electron/handlers/comisiones*.ts` — 16 métodos: 5L 8E 3D 0B

- L `get-reglas-comision`(filtros?)
- L `get-regla-comision`(id)
- E `create-regla-comision`(data) 🔒 COMISION_REGLA_GESTIONAR
- E `update-regla-comision`(id, data) 🔒 COMISION_REGLA_GESTIONAR
- D `delete-regla-comision`(id) 🔒 COMISION_REGLA_GESTIONAR
- L `get-funcionarios-regla`(reglaId)
- E `asignar-funcionario-regla`(data) 🔒 COMISION_REGLA_GESTIONAR
- E `desasignar-funcionario-regla`(asignacionId) 🔒 COMISION_REGLA_GESTIONAR
- L `get-liquidaciones-comision`(filtros?)
- L `get-liquidacion-comision`(id)
- E `generar-liquidacion-comision`(payload) 🔒 COMISION_LIQUIDACION_GENERAR
- E `generar-liquidaciones-comision-mes`(periodo) 🔒 COMISION_LIQUIDACION_GENERAR
- E `aprobar-liquidacion-comision`(id) 🔒 COMISION_LIQUIDACION_APROBAR
- E `agregar-item-manual-liquidacion-comision`(payload) 🔒 COMISION_LIQUIDACION_GENERAR
- D `eliminar-item-liquidacion-comision`(itemId) 🔒 COMISION_LIQUIDACION_GENERAR
- D `anular-liquidacion-comision`(id) 🔒 COMISION_LIQUIDACION_ANULAR

## compras

`electron/handlers/compras*.ts` — 42 métodos: 16L 18E 8D 0B

- L `getProveedores`()
- L `getProveedor`(id)
- E `createProveedor`(data) 🔒 PROVEEDORES_GESTIONAR
- E `updateProveedor`(id, data) 🔒 PROVEEDORES_GESTIONAR
- D `deleteProveedor`(id) 🔒 PROVEEDORES_GESTIONAR
- L `get-compras-paginado`(params)
- L `getCompras`()
- L `getCompra`(id)
- E `create-compra-borrador`(data) 🔒 COMPRAS_GESTIONAR
- E `update-compra-borrador`(id, data) 🔒 COMPRAS_GESTIONAR
- E `finalizar-compra`(id, payload) 🔒 COMPRAS_GESTIONAR
- E `crear-compra-simplificada`(payload) 🔒 COMPRAS_GESTIONAR
- D `anular-compra`(id, motivo) 🔒 COMPRAS_GESTIONAR
- E `createCompra`(data) 🔒 COMPRAS_GESTIONAR
- E `updateCompra`(id, data) 🔒 COMPRAS_GESTIONAR
- D `deleteCompra`(id) 🔒 COMPRAS_GESTIONAR
- L `getCompraDetalles`(compraId)
- E `createCompraDetalle`(data) 🔒 COMPRAS_GESTIONAR
- E `updateCompraDetalle`(id, data) 🔒 COMPRAS_GESTIONAR
- D `deleteCompraDetalle`(id) 🔒 COMPRAS_GESTIONAR
- L `getProveedorProductos`(proveedorId)
- L `getProveedorProducto`(id)
- E `createProveedorProducto`(data) 🔒 PROVEEDORES_GESTIONAR
- E `updateProveedorProducto`(id, data) 🔒 PROVEEDORES_GESTIONAR
- D `deleteProveedorProducto`(id) 🔒 PROVEEDORES_GESTIONAR
- L `getProveedorProductosPaginado`(params)
- L `getUltimasComprasProducto`(params)
- L `getUltimoCostoProducto`(params)
- L `getFormasPago`()
- L `getFormaPago`(id)
- E `createFormaPago`(data) 🔒 COMPRAS_GESTIONAR
- E `updateFormaPago`(id, data) 🔒 COMPRAS_GESTIONAR
- D `deleteFormaPago`(id) 🔒 COMPRAS_GESTIONAR
- L `getPagos`()
- L `getPago`(id)
- E `createPago`(data) 🔒 VENTAS_COBRAR
- E `updatePago`(id, data)
- D `deletePago`(id)
- L `getPagoDetalles`(pagoId)
- E `createPagoDetalle`(data) 🔒 VENTAS_COBRAR
- E `updatePagoDetalle`(id, data)
- D `deletePagoDetalle`(id)

## configuracion-rrhh

`electron/handlers/configuracion-rrhh*.ts` — 6 métodos: 2L 2E 1D 1B

- L `get-configuraciones-rrhh`()
- L `get-configuracion-rrhh`(clave)
- E `create-configuracion-rrhh`(data) 🔒 RRHH_CONFIG_EDITAR
- E `update-configuracion-rrhh`(id, data) 🔒 RRHH_CONFIG_EDITAR
- D `delete-configuracion-rrhh`(id) 🔒 RRHH_CONFIG_EDITAR
- B `seed-configuracion-rrhh`() 🔒 RRHH_CONFIG_EDITAR

## convenios

`electron/handlers/convenios*.ts` — 12 métodos: 7L 4E 1D 0B

- L `get-convenios`(filtros?)
- L `get-convenio`(id)
- E `create-convenio`(data) 🔒 CLIENTES_GESTIONAR
- E `update-convenio`(id, data) 🔒 CLIENTES_GESTIONAR
- D `delete-convenio`(id) 🔒 CLIENTES_GESTIONAR
- E `set-convenio-clientes`(payload) 🔒 CLIENTES_GESTIONAR
- L `get-cobro-consolidado-preview`(convenioId)
- L `export-cobro-consolidado-preview-pdf`(convenioId)
- L `export-recibo-cobro-consolidado-pdf`(cobroConsolidadoId)
- E `registrar-cobro-consolidado`(payload) 🔒 CPC_COBRAR
- L `get-cobros-consolidados`(filtros?)
- L `get-cobro-consolidado`(id)

## cotizacion-mercado

`electron/handlers/cotizacion-mercado*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-cotizacion-mercado`()

## cuentas-bancarias-destino

`electron/handlers/cuentas-bancarias-destino*.ts` — 5 métodos: 2L 2E 1D 0B

- E `create-cuenta-bancaria-destino`(payload) 🔒 FINANCIERO_CTA_BANCARIA_DESTINO_CREAR
- E `update-cuenta-bancaria-destino`(id, payload) 🔒 FINANCIERO_CTA_BANCARIA_DESTINO_ACTUALIZAR
- D `delete-cuenta-bancaria-destino`(id) 🔒 FINANCIERO_CTA_BANCARIA_DESTINO_ELIMINAR
- L `get-cuentas-bancarias-destino-by-persona`(payload)
- L `get-cuenta-bancaria-destino`(id)

## cuentas-por-cobrar

`electron/handlers/cuentas-por-cobrar*.ts` — 11 métodos: 4L 5E 2D 0B

- L `get-cuentas-por-cobrar`(filtros?)
- L `get-cuenta-por-cobrar`(id)
- L `get-cpc-by-venta`(ventaId)
- E `create-cuenta-por-cobrar`(data) 🔒 CPC_GESTIONAR
- E `update-cuenta-por-cobrar`(id, data) 🔒 CPC_GESTIONAR
- D `cancelar-cuenta-por-cobrar`(payload) 🔒 CPC_CANCELAR
- L `get-cuenta-por-cobrar-cuotas`(cpcId)
- E `cobrar-cpc-cuota`(payload) 🔒 CPC_COBRAR
- D `anular-cobro-cpc-cuota`(payload) 🔒 CPC_CANCELAR
- E `recalcular-saldo-cliente`(clienteId) 🔒 CPC_GESTIONAR
- E `cobrar-venta-credito`(data) 🔒 VENTAS_PDV

## cuentas-por-pagar

`electron/handlers/cuentas-por-pagar*.ts` — 20 métodos: 7L 9E 4D 0B

- L `get-compra-categorias`()
- E `create-compra-categoria`(data) 🔒 COMPRAS_GESTIONAR
- E `update-compra-categoria`(id, data) 🔒 COMPRAS_GESTIONAR
- D `delete-compra-categoria`(id) 🔒 COMPRAS_GESTIONAR
- L `get-compra-cuotas`(compraId)
- E `set-compra-cuotas`(compraId, cuotas) 🔒 COMPRAS_GESTIONAR
- E `pagar-compra-cuota`(payload) 🔒 COMPRAS_GESTIONAR
- L `get-cuentas-por-pagar`(filtros?)
- L `get-cuenta-por-pagar`(id)
- E `create-cuenta-por-pagar`(data) 🔒 COMPRAS_GESTIONAR
- E `update-cuenta-por-pagar`(id, data) 🔒 COMPRAS_GESTIONAR
- D `cancelar-cuenta-por-pagar`(id) 🔒 COMPRAS_GESTIONAR
- L `get-cuenta-por-pagar-cuotas`(cppId)
- E `pagar-cpp-cuota`(payload) 🔒 COMPRAS_GESTIONAR
- E `pagar-cpp-cuota-mixto`(payload) 🔒 COMPRAS_GESTIONAR
- D `anular-pago-mixto-cuota`(payload) 🔒 COMPRAS_GESTIONAR
- L `get-cuotas-con-pago-mixto`(cuentaPorPagarId)
- E `pagar-cuotas-compras-lote`(payload) 🔒 COMPRAS_GESTIONAR
- L `get-cuotas-pendientes-compras`(filtros?)
- D `cancelar-cpp-cuota`(payload) 🔒 COMPRAS_GESTIONAR

## dashboard-caja-mayor

`electron/handlers/dashboard-caja-mayor*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-caja-mayor-kpis`(rango)

## dashboard-compras

`electron/handlers/dashboard-compras*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-compras-kpis`(rango)

## dashboard-financiero

`electron/handlers/dashboard-financiero*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-financiero-kpis`()

## dashboard-productos

`electron/handlers/dashboard-productos*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-productos-kpis`(rango)

## dashboard-rrhh

`electron/handlers/dashboard-rrhh*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-rrhh-kpis`(periodo)

## dashboard-shortcuts

`electron/handlers/dashboard-shortcuts*.ts` — 4 métodos: 1L 2E 1D 0B

- L `get-dashboard-shortcuts`(dashboardKey?)
- E `create-dashboard-shortcut`(data)
- E `update-dashboard-shortcut`(id, data)
- D `delete-dashboard-shortcut`(id)

## dashboard-ventas

`electron/handlers/dashboard-ventas*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-dashboard-ventas-kpis`(param)

## db-config

`electron/handlers/db-config*.ts` — 5 métodos: 0L 1E 0D 4B

- E `db-config-get`()
- B `db-config-save`(payload) 🔒 SISTEMA_BD_CONFIGURAR
- B `db-config-test-connection`(payload)
- B `db-config-restart-app`() 🔒 SISTEMA_BD_CONFIGURAR
- B `db-config-init-postgres`(payload) 🔒 SISTEMA_BD_CONFIGURAR

## delivery

`electron/handlers/delivery*.ts` — 9 métodos: 0L 9E 0D 0B

- E `delivery-listar-pdv`(cajaId, filtros?)
- E `delivery-listar-repartidores`()
- E `delivery-crear`(payload) 🔒 VENTAS_PDV
- E `delivery-actualizar-datos`(id, payload) 🔒 VENTAS_PDV
- E `delivery-cambiar-estado`(id, nuevoEstado, opts?) 🔒 VENTAS_PDV
- E `delivery-asignar-repartidor`(id, funcionarioId) 🔒 VENTAS_PDV
- E `delivery-convertir-modo`(id, payload) 🔒 VENTAS_PDV
- E `delivery-cancelar`(id, motivo?) 🔒 VENTAS_DELIVERY_CANCELAR_COBRADO, VENTAS_PDV
- E `delivery-imprimir-ticket`(id, printerId?) 🔒 VENTAS_PDV

## disciplina-catalogos

`electron/handlers/disciplina-catalogos*.ts` — 2 métodos: 0L 2E 0D 0B

- E `dr-get-${c.canal}`(filtros)
- E `dr-save-${c.canal}`(data)

## disciplina-premios

`electron/handlers/disciplina-premios*.ts` — 2 métodos: 0L 2E 0D 0B

- E `dr-calcular-premio`(periodoId)
- E `dr-aprobar-premio`(periodoId)

## disciplina-puntos

`electron/handlers/disciplina-puntos*.ts` — 7 métodos: 0L 6E 1D 0B

- E `dr-registrar-error`(data)
- D `dr-anular-error`(errorId, motivo)
- E `dr-get-errores`(f)
- E `dr-puntuar`(data)
- E `dr-get-puntajes`(f)
- E `dr-mis-puntos`(f)
- E `dr-mis-premios`()

## disciplina-votacion

`electron/handlers/disciplina-votacion*.ts` — 5 métodos: 0L 4E 1D 0B

- E `dr-abrir-periodo`(data)
- E `dr-mis-encuestas-pendientes`()
- E `dr-votar`(periodoId, respuestas)
- D `dr-cerrar-periodo`(periodoId)
- E `dr-get-resultados-encuesta`(periodoId)

## disciplina

`electron/handlers/disciplina*.ts` — 9 métodos: 0L 9E 0D 0B

- E `dr-get-tipos-falta`(filtros)
- E `dr-save-tipo-falta`(data)
- E `dr-set-tipo-falta-activo`(id, activo)
- E `dr-registrar-falta`(data)
- E `dr-get-faltas`(f)
- E `dr-mis-faltas`()
- E `dr-apelar-falta`(faltaId, texto)
- E `dr-renunciar-apelacion`(faltaId)
- E `dr-aprobar-falta`(faltaId, resolucion?)

## documentos-tickets

`electron/handlers/documentos-tickets*.ts` — 12 métodos: 1L 11E 0D 0B

- L `get-detalle-variacion-items`(itemIds)
- E `print-comanda`(params) 🔒 VENTAS_PDV
- E `print-venta-ticket`(params) 🔒 VENTAS_PDV
- E `print-precuenta`(params) 🔒 VENTAS_PDV
- E `print-recibo-cobro-cuota-ticket`(params) 🔒 CPC_COBRAR
- E `print-recibo-pago-cuota-ticket`(params) 🔒 CAJA_MAYOR_OPERAR
- E `print-retiro-caja-ticket`(params) 🔒 CAJA_MAYOR_OPERAR
- E `print-vale-ticket`(params) 🔒 RRHH_VALE_CONFIRMAR
- E `print-pagare-cpc-ticket`(params) 🔒 VENTAS_PDV
- E `print-acreditacion-pos-ticket`(params) 🔒 BANCOS_GESTIONAR
- E `print-conteo-caja-ticket`(params) 🔒 FINANCIERO_CAJA_VER
- E `print-cierre-caja`(params) 🔒 FINANCIERO_CAJA_VER

## empresa

`electron/handlers/empresa*.ts` — 2 métodos: 1L 1E 0D 0B

- L `get-empresa`()
- E `update-empresa`(data) 🔒 EMPRESA_CONFIGURAR

## equipos-comision

`electron/handlers/equipos-comision*.ts` — 11 métodos: 2L 7E 2D 0B

- L `get-equipos-comision`(filtros?)
- L `get-equipo-comision`(id)
- E `create-equipo-comision`(data) 🔒 COMISION_EQUIPO_GESTIONAR
- E `update-equipo-comision`(id, data) 🔒 COMISION_EQUIPO_GESTIONAR
- D `delete-equipo-comision`(id) 🔒 COMISION_EQUIPO_GESTIONAR
- E `agregar-miembro-equipo`(payload) 🔒 COMISION_EQUIPO_GESTIONAR
- D `eliminar-miembro-equipo`(miembroId) 🔒 COMISION_EQUIPO_GESTIONAR
- E `actualizar-porcentaje-miembro`(payload) 🔒 COMISION_EQUIPO_GESTIONAR
- E `asignar-regla-equipo`(payload) 🔒 COMISION_EQUIPO_GESTIONAR
- E `desasignar-regla-equipo`(asignacionId) 🔒 COMISION_EQUIPO_GESTIONAR
- E `evaluar-equipo-periodo`(payload) 🔒 COMISION_LIQUIDACION_GENERAR

## face-models

`electron/handlers/face-models*.ts` — 3 métodos: 2L 1E 0D 0B

- L `get-face-models-status`()
- E `download-face-models`() 🔒 RRHH_CONFIG_EDITAR
- L `get-face-models-base-url`()

## factura-import

`electron/handlers/factura-import*.ts` — 20 métodos: 0L 18E 0D 2B

- E `ia-config-get`()
- E `ia-config-get-raw`()
- B `ia-config-set`(partial) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-prompt-get`()
- E `ia-prompt-set-adiciones`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-prompt-effective`()
- E `ia-prompt-sugerencia-list`(payload)
- E `ia-prompt-sugerencia-create`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-prompt-sugerencia-aprobar`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-prompt-sugerencia-rechazar`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-prompt-sugerencia-delete`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `ia-config-test`()
- B `factura-import-pick-file`()
- E `factura-import-process`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `factura-import-reprocess`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `factura-import-get`(payload)
- E `factura-import-list`(payload)
- E `factura-import-descartar`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA
- E `factura-import-match`(payload)
- E `factura-import-confirm`(payload) 🔒 COMPRAS_IMPORTAR_FACTURA

## facturacion

`electron/handlers/facturacion*.ts` — 21 métodos: 9L 8E 4D 0B

- L `get-timbrados`()
- L `get-timbrado`(id)
- E `create-timbrado`(data) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- E `update-timbrado`(id, data) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- D `delete-timbrado`(id) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- L `get-timbrado-detalles`(timbradoId?)
- E `create-timbrado-detalle`(data) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- E `update-timbrado-detalle`(id, data) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- D `delete-timbrado-detalle`(id) 🔒 FACTURACION_TIMBRADO_GESTIONAR
- L `get-factura-plantillas`(tipo?)
- L `get-factura-plantilla`(id)
- E `create-factura-plantilla`(data) 🔒 FACTURACION_PLANTILLA_GESTIONAR
- E `update-factura-plantilla`(id, data) 🔒 FACTURACION_PLANTILLA_GESTIONAR
- D `delete-factura-plantilla`(id) 🔒 FACTURACION_PLANTILLA_GESTIONAR
- L `get-facturas`(filtros)
- L `get-factura`(id)
- L `get-cliente-por-ruc`(ruc)
- E `create-factura`(data) 🔒 FACTURACION_EMITIR
- L `get-facturacion-config`() — crea config por defecto si falta
- E `save-facturacion-config`(data) 🔒 FACTURACION_CONFIGURAR
- D `anular-factura`(id, motivo) 🔒 FACTURACION_ANULAR

## feriados

`electron/handlers/feriados*.ts` — 4 métodos: 1L 2E 1D 0B

- L `get-feriados`(anio?)
- E `create-feriado`(data) 🔒 RRHH_CONFIG_EDITAR
- E `update-feriado`(id, data) 🔒 RRHH_CONFIG_EDITAR
- D `delete-feriado`(id) 🔒 RRHH_CONFIG_EDITAR

## files

`electron/handlers/files*.ts` — 5 métodos: 0L 4E 1D 0B

- E `save-file`(input) 🔒 DOCUMENTOS_ADJUNTAR
- D `delete-file`(input) 🔒 DOCUMENTOS_ADJUNTOS_ELIMINAR
- E `read-file-base64`(input)
- E `open-file-with-system`(input)
- E `open-base64-file`(input)

## financiero

`electron/handlers/financiero*.ts` — 58 métodos: 28L 21E 9D 0B

- L `getMonedas`()
- L `get-monedas`()
- L `getMoneda`(id)
- L `getMonedaPrincipal`()
- E `createMoneda`(data) 🔒 MONEDAS_GESTIONAR
- E `updateMoneda`(id, data) 🔒 MONEDAS_GESTIONAR
- D `deleteMoneda`(id) 🔒 MONEDAS_GESTIONAR
- L `get-tipo-precios`()
- E `create-tipo-precio`(data) 🔒 MONEDAS_GESTIONAR
- L `get-tipo-precio`(id)
- E `update-tipo-precio`(id, data) 🔒 MONEDAS_GESTIONAR
- D `delete-tipo-precio`(id) 🔒 MONEDAS_GESTIONAR
- L `get-monedas-billetes`()
- L `get-moneda-billete`(id)
- E `create-moneda-billete`(data) 🔒 MONEDAS_GESTIONAR
- E `update-moneda-billete`(id, data) 🔒 MONEDAS_GESTIONAR
- D `delete-moneda-billete`(id) 🔒 MONEDAS_GESTIONAR
- L `get-conteos`()
- L `get-conteo`(id)
- E `create-conteo`(data) 🔒 FINANCIERO_CAJA_OPERAR
- E `update-conteo`(id, data) 🔒 FINANCIERO_CAJA_OPERAR
- D `delete-conteo`(id) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-conteo-detalles`(conteoId)
- L `get-conteo-detalle`(id)
- E `create-conteo-detalle`(data) 🔒 FINANCIERO_CAJA_OPERAR
- E `update-conteo-detalle`(id, data) 🔒 FINANCIERO_CAJA_OPERAR
- D `delete-conteo-detalle`(id) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-dispositivos`()
- L `get-dispositivo`(id)
- E `create-dispositivo`(data) 🔒 DISPOSITIVOS_GESTIONAR
- E `update-dispositivo`(id, data) 🔒 DISPOSITIVOS_GESTIONAR
- D `delete-dispositivo`(id) 🔒 DISPOSITIVOS_GESTIONAR
- L `get-cajas`()
- L `get-cajas-selector`(params)
- L `get-caja`(id)
- L `get-caja-by-dispositivo`(dispositivoId)
- E `create-caja`(data) 🔒 FINANCIERO_CAJA_OPERAR
- E `update-caja`(id, data) 🔒 FINANCIERO_CAJA_AJUSTAR, FINANCIERO_CAJA_OPERAR
- L `puede-ajustar-caja`(cajaId)
- E `finalizar-ajuste-caja`(cajaId, motivo?) 🔒 FINANCIERO_CAJA_AJUSTAR
- E `enviar-resumen-cierre-whatsapp`(params?) 🔒 FINANCIERO_CAJA_GESTIONAR
- D `delete-caja`(id) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-caja-abierta-by-usuario`(usuarioId)
- L `get-cajas-abiertas`()
- L `get-cajas-monedas`()
- L `get-caja-moneda`(id)
- E `create-caja-moneda`(data) 🔒 FINANCIERO_CAJA_GESTIONAR
- E `update-caja-moneda`(id, data) 🔒 FINANCIERO_CAJA_GESTIONAR
- D `delete-caja-moneda`(id) 🔒 FINANCIERO_CAJA_GESTIONAR
- E `save-cajas-monedas`(updates) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-monedas-cambio`()
- L `get-monedas-cambio-by-moneda-origen`(monedaOrigenId)
- L `get-moneda-cambio`(id)
- E `create-moneda-cambio`(data) 🔒 MONEDAS_GESTIONAR
- E `update-moneda-cambio`(id, data) 🔒 MONEDAS_GESTIONAR
- D `delete-moneda-cambio`(id) 🔒 MONEDAS_GESTIONAR
- L `get-moneda-cambio-by-moneda-principal`()
- L `get-valor-en-moneda-principal`(monedaId, valor)

## funcionario-documentos

`electron/handlers/funcionario-documentos*.ts` — 5 métodos: 2L 2E 1D 0B

- L `get-funcionario-documentos`(funcionarioId)
- E `upload-funcionario-documento`(payload) 🔒 RRHH_FUNCIONARIO_EDITAR
- D `delete-funcionario-documento`(id) 🔒 RRHH_FUNCIONARIO_EDITAR
- L `get-funcionario-documento-base64`(id)
- E `update-funcionario-documento`(id, data) 🔒 RRHH_FUNCIONARIO_EDITAR

## gastos-caja

`electron/handlers/gastos-caja*.ts` — 5 métodos: 2L 2E 1D 0B

- E `create-gasto-caja`(data) 🔒 VENTAS_PDV
- L `get-gastos-caja`(cajaId, incluirAnulados?) 🔒 VENTAS_PDV
- D `anular-gasto-caja`(gastoId, motivo?, opts?) 🔒 VENTAS_PDV
- E `edit-gasto-caja`(gastoId, data) 🔒 FINANCIERO_CAJA_GESTIONAR
- L `get-gasto-caja`(gastoId) 🔒 FINANCIERO_CAJA_GESTIONAR

## horas-extra

`electron/handlers/horas-extra*.ts` — 3 métodos: 1L 1E 1D 0B

- L `get-horas-extra`(filtros)
- E `create-hora-extra`(data) 🔒 RRHH_ASISTENCIA_REGISTRAR
- D `anular-hora-extra`(id) 🔒 RRHH_ASISTENCIA_REGISTRAR

## images

`electron/handlers/images*.ts` — 2 métodos: 0L 1E 1D 0B

- E `save-profile-image`(obj)
- D `delete-profile-image`(imageUrl)

## kds

`electron/handlers/kds*.ts` — 9 métodos: 3L 5E 1D 0B

- L `get-kds-comandas`(params) 🔒 COMANDAS_KDS_VER
- E `update-comanda-item-estado`(comandaItemId, nuevoEstado) 🔒 COMANDAS_KDS_OPERAR
- E `bump-comanda-item`(comandaItemId) 🔒 COMANDAS_KDS_OPERAR
- E `recall-comanda-item`(comandaItemId) 🔒 COMANDAS_KDS_OPERAR
- L `get-kds-pantallas`() 🔒 COMANDAS_KDS_VER
- L `get-kds-pantalla`(id) 🔒 COMANDAS_KDS_VER
- E `create-kds-pantalla`(data) 🔒 COMANDAS_KDS_CONFIGURAR
- E `update-kds-pantalla`(id, data) 🔒 COMANDAS_KDS_CONFIGURAR
- D `delete-kds-pantalla`(id) 🔒 COMANDAS_KDS_CONFIGURAR

## liquidacion-final

`electron/handlers/liquidacion-final*.ts` — 5 métodos: 2L 3E 0D 0B

- L `get-liquidaciones-final`(filtros)
- L `get-liquidacion-final`(id)
- E `generar-liquidacion-final`(payload) 🔒 RRHH_LIQUIDACION_FINAL_GENERAR
- E `aprobar-liquidacion-final`(id) 🔒 RRHH_LIQUIDACION_FINAL_GENERAR
- E `pagar-liquidacion-final`(id, payload) 🔒 RRHH_LIQUIDACION_PAGAR

## liquidacion-sueldo

`electron/handlers/liquidacion-sueldo*.ts` — 17 métodos: 5L 8E 3D 1B

- L `get-liquidacion-conceptos`()
- B `seed-liquidacion-conceptos`()
- E `update-liquidacion-concepto`(id, data) 🔒 RRHH_CONFIG_EDITAR
- L `get-liquidaciones-sueldo`(filtros)
- L `get-liquidacion-sueldo`(id)
- E `generar-liquidacion-borrador`(payload) 🔒 RRHH_LIQUIDACION_GENERAR
- E `agregar-item-liquidacion`(liquidacionId, data) 🔒 RRHH_LIQUIDACION_GENERAR
- D `eliminar-item-liquidacion`(itemId) 🔒 RRHH_LIQUIDACION_GENERAR
- E `aprobar-liquidacion-sueldo`(id) 🔒 RRHH_LIQUIDACION_APROBAR
- E `volver-borrador-liquidacion-sueldo`(id) 🔒 RRHH_LIQUIDACION_APROBAR
- E `pagar-liquidacion-sueldo`(id, payload) 🔒 RRHH_LIQUIDACION_PAGAR
- D `anular-liquidacion-sueldo`(id, motivo) 🔒 RRHH_LIQUIDACION_PAGAR
- L `get-bonos`(filtros)
- E `create-bono`(data) 🔒 RRHH_BONO_OTORGAR
- D `anular-bono`(id) 🔒 RRHH_BONO_OTORGAR
- L `get-aguinaldos`(filtros)
- E `calcular-aguinaldos-anio`(anio) 🔒 RRHH_LIQUIDACION_GENERAR

## menu-config

`electron/handlers/menu-config*.ts` — 2 métodos: 1L 1E 0D 0B

- L `get-menu-config`()
- E `save-menu-config`(items) 🔒 SISTEMA_MENU_CONFIGURAR

## mesa-qr

`electron/handlers/mesa-qr*.ts` — 3 métodos: 1L 2E 0D 0B

- E `generar-qr-mesa`(mesaId, opts?) 🔒 VENTAS_PDV
- L `get-qr-mesas`(opts?) 🔒 VENTAS_PDV — crea config por defecto si falta
- E `set-autoservicio-mesa`(mesaId, activo) 🔒 VENTAS_PDV

## movimientos-cliente

`electron/handlers/movimientos-cliente*.ts` — 4 métodos: 4L 0E 0D 0B

- L `get-movimientos-cliente`(clienteId, filtros?)
- L `get-saldo-cliente`(clienteId)
- L `get-cliente-estado-cuenta`(clienteId)
- L `get-movimientos-cliente-stats`(clienteId)

## musica

`electron/handlers/musica*.ts` — 63 métodos: 0L 60E 0D 3B

- E `musica-get-config`()
- E `musica-disponible`()
- E `musica-set-config`(data)
- B `musica-conectar`()
- B `musica-cancelar-conexion`()
- E `musica-desconectar`()
- E `musica-listar-dispositivos`()
- E `musica-seleccionar-dispositivo`(data)
- B `musica-abrir-spotify`()
- E `musica-estado`()
- E `musica-play`(contextUri?)
- E `musica-pausar`()
- E `musica-siguiente`()
- E `musica-anterior`()
- E `musica-volumen`(porcentaje)
- E `musica-semillas-listar`()
- E `musica-semilla-crear`(data)
- E `musica-semilla-biblioteca`()
- E `musica-semilla-eliminar`(id)
- E `musica-semilla-importar`(id)
- E `musica-importar-todas`()
- E `musica-pool-resumen`()
- E `musica-tracks-listar`(filtros?)
- E `musica-track-estado`(data)
- E `musica-bloques-listar`()
- E `musica-bloque-guardar`(data)
- E `musica-bloque-eliminar`(id)
- E `musica-presets-listar`()
- E `musica-aplicar-preset`(data)
- E `musica-estilos-listar`()
- E `musica-estilo-guardar`(datos)
- E `musica-estilo-eliminar`(id)
- E `musica-estilo-alias-asignar`(obj)
- E `musica-estilo-alias-quitar`(id)
- E `musica-estilos-sembrar`()
- E `musica-estilos-reclasificar`()
- E `musica-estilos-clasificar-todo`(opts?)
- E `musica-generos-sin-clasificar`()
- E `musica-generos-listar`()
- E `musica-estilo-preferencia`(data)
- E `musica-estilo-vetar`(data)
- E `musica-track-estilo`(obj)
- E `musica-estilos-desacuerdos`()
- E `musica-mezcla-get`(bloqueId)
- E `musica-mezcla-guardar`(obj)
- E `musica-deficit`(bloqueId?)
- E `musica-vetos-listar`()
- E `musica-veto-crear`(data)
- E `musica-descubrir`(data?)
- E `musica-descubrimiento-criterio`()
- E `musica-rechazar`(data)
- E `musica-me-gusta`(data)
- E `musica-interpretar-brief`(brief)
- E `musica-aplicar-config`(data)
- E `musica-enriquecer`(limite?)
- E `musica-etiquetar`(limite?)
- E `musica-generar-plan`(data?)
- E `musica-plan-del-dia`(fecha?)
- E `stream-token`(scope)
- E `musica-runtime-estado`()
- E `musica-variante`(variante)
- E `musica-runtime-toggle`(activar)
- E `musica-veto-eliminar`(id)

## notificaciones-config

`electron/handlers/notificaciones-config*.ts` — 16 métodos: 6L 7E 2D 1B

- L `get-notif-config`()
- E `update-notif-config`(items)
- B `set-notif-secret`(payload)
- L `get-notif-eventos`()
- E `update-notif-evento`(id, data)
- L `get-notif-receptores`()
- E `create-notif-receptor`(data)
- E `update-notif-receptor`(id, data)
- D `delete-notif-receptor`(id)
- L `get-notif-suscripciones`(eventoId?)
- E `create-notif-suscripcion`(data)
- D `delete-notif-suscripcion`(id)
- L `get-notif-logs`(filtros?)
- E `test-notif-email`(to)
- E `test-notif-whatsapp`(to)
- L `get-notif-evolution-state`()

## notificaciones-rrhh

`electron/handlers/notificaciones-rrhh*.ts` — 5 métodos: 2L 3E 0D 0B

- L `get-notificaciones-rrhh`(filtros?)
- E `marcar-notificacion-leida`(id)
- E `marcar-todas-notificaciones-leidas`(usuarioId?)
- E `generar-notificaciones-rrhh`() 🔒 RRHH_NOTIFICACIONES_VER
- L `count-notificaciones-no-leidas`(usuarioId?)

## onboarding

`electron/handlers/onboarding*.ts` — 2 métodos: 1L 1E 0D 0B

- L `get-onboarding-status`()
- E `mark-onboarding-task`(payload)

## pago-consolidado

`electron/handlers/pago-consolidado*.ts` — 4 métodos: 2L 1E 1D 0B

- L `get-obligaciones-pendientes`(concepto, filtros?)
- E `registrar-pago-consolidado`(payload) 🔒 CPC_DESCUENTO
- L `get-pago-consolidado-detalle`(pagoId)
- D `anular-pago-consolidado`(pagoId, motivo?)

## password-recovery

`electron/handlers/password-recovery*.ts` — 4 métodos: 0L 2E 2D 0B

- D `get-reset-channels`(payload)
- E `request-password-reset`(payload)
- D `reset-password-with-code`(payload)
- E `cleanup-reset-tokens`()

## pdv-egresos

`electron/handlers/pdv-egresos*.ts` — 7 métodos: 2L 4E 1D 0B

- E `crear-vale-caja`(data) 🔒 PDV_PAGAR_VALE
- E `pagar-vale-caja`(data) 🔒 PDV_PAGAR_VALE
- E `crear-compra-simplificada-caja`(data) 🔒 PDV_PAGAR_COMPRA
- E `pagar-compra-cuota-caja`(data) 🔒 PDV_PAGAR_COMPRA
- D `anular-egreso-caja`(egresoId, motivo?) 🔒 PDV_ANULAR_EGRESO
- L `get-egresos-caja`(cajaId, incluirAnulados?) 🔒 VENTAS_PDV
- L `get-vales-pendientes-funcionario`(funcionarioId) 🔒 VENTAS_PDV

## pedidos-online-admin

`electron/handlers/pedidos-online-admin*.ts` — 9 métodos: 2L 6E 1D 0B

- L `get-pedidos-online-admin`(filtros?)
- E `contar-pedidos-online-pendientes`()
- E `aceptar-pedido-online`(pedidoId, data?)
- E `vincular-venta-pedido-online`(pedidoId, ventaId)
- E `rechazar-pedido-online`(pedidoId, motivo) 🔒 VENTAS_DELIVERY_CANCELAR_COBRADO
- L `get-zonas-delivery-admin`()
- E `guardar-zona-delivery`(data)
- D `eliminar-zona-delivery`(zonaId)
- E `avanzar-estado-pedido-online`(pedidoId, nuevoEstado, data?)

## pedidos-online-auth

`electron/handlers/pedidos-online-auth*.ts` — 9 métodos: 0L 9E 0D 0B

- E `pub-otp-request`(telefonoRaw)
- E `pub-otp-verify`(telefonoRaw, codigo)
- E `pub-cliente-login-password`(identificador, password)
- E `pub-cliente-refresh`(refreshToken)
- E `pub-cliente-logout`(refreshToken)
- E `pub-cliente-me`()
- E `pub-cliente-perfil-update`(data)
- E `pub-cliente-registrar`(data)
- E `pub-cliente-google`(idToken)

## pedidos-online-config

`electron/handlers/pedidos-online-config*.ts` — 3 métodos: 2L 1E 0D 0B

- L `get-tienda-online-config-public`()
- L `get-tienda-online-config`()
- E `update-tienda-online-config`(data)

## pedidos-online-pedidos

`electron/handlers/pedidos-online-pedidos*.ts` — 6 métodos: 4L 2E 0D 0B

- L `get-zonas-delivery-online`()
- E `crear-pedido-online`(data)
- L `get-mis-pedidos-online`()
- L `get-pedido-online-estado`(numero)
- L `get-mesa-online-por-token`(token)
- E `cotizar-envio-online`(lat, lng)

## pedidos-online

`electron/handlers/pedidos-online*.ts` — 1 métodos: 1L 0E 0D 0B

- L `get-menu-online`()

## permissions

`electron/handlers/permissions*.ts` — 9 métodos: 4L 3E 1D 1B

- L `get-permissions`(modulo?)
- L `get-all-permissions`()
- E `create-permission`(data) 🔒 SISTEMA_PERMISO_GESTIONAR
- E `update-permission`(id, data) 🔒 SISTEMA_PERMISO_GESTIONAR
- D `delete-permission`(id) 🔒 SISTEMA_PERMISO_GESTIONAR
- L `get-role-permissions`(roleId)
- E `set-role-permissions`(roleId, permissionIds) 🔒 SISTEMA_PERMISO_GESTIONAR
- L `get-permissions-by-user`(userId)
- B `seed-permissions`()

## personas

`electron/handlers/personas*.ts` — 34 métodos: 14L 14E 6D 0B

- L `get-personas`()
- L `get-persona`(personaId)
- E `create-persona`(personaData) 🔒 PERSONAS_GESTIONAR
- E `update-persona`(personaId, personaData) 🔒 PERSONAS_GESTIONAR
- D `delete-persona`(personaId) 🔒 PERSONAS_GESTIONAR
- L `get-usuarios`()
- L `get-usuario`(usuarioId)
- E `create-usuario`(usuarioData) 🔒 USUARIOS_GESTIONAR
- E `update-usuario`(usuarioId, usuarioData) 🔒 USUARIOS_GESTIONAR
- E `change-password`(payload)
- D `delete-usuario`(usuarioId) 🔒 USUARIOS_GESTIONAR
- L `get-usuarios-paginated`(page, pageSize, filters)
- L `get-roles`()
- L `get-role`(roleId)
- E `create-role`(roleData) 🔒 USUARIOS_GESTIONAR
- E `update-role`(roleId, roleData) 🔒 USUARIOS_GESTIONAR
- D `delete-role`(roleId) 🔒 USUARIOS_GESTIONAR
- L `get-usuario-roles`(usuarioId)
- E `assign-role-to-usuario`(usuarioId, roleId) 🔒 USUARIOS_GESTIONAR
- D `remove-role-from-usuario`(usuarioRoleId) 🔒 USUARIOS_GESTIONAR
- L `get-tipo-clientes`()
- L `get-tipo-cliente`(tipoClienteId)
- E `create-tipo-cliente`(tipoClienteData) 🔒 CLIENTES_GESTIONAR
- E `update-tipo-cliente`(tipoClienteId, tipoClienteData) 🔒 CLIENTES_GESTIONAR
- D `delete-tipo-cliente`(tipoClienteId) 🔒 CLIENTES_GESTIONAR
- L `get-clientes`(filters?)
- L `get-cliente`(clienteId)
- E `create-cliente`(clienteData) 🔒 CLIENTES_GESTIONAR
- E `update-cliente`(clienteId, clienteData) 🔒 CLIENTES_GESTIONAR
- D `delete-cliente`(clienteId) 🔒 CLIENTES_GESTIONAR
- L `buscar-cliente-por-telefono`(telefono)
- L `buscar-clientes-por-telefono`(telefono)
- E `crear-cliente-mesa`(data) 🔒 VENTAS_PDV
- E `crear-cliente-rapido`(data) 🔒 VENTAS_PDV

## printers

`electron/handlers/printers*.ts` — 8 métodos: 2L 5E 1D 0B

- L `get-printers`()
- L `list-system-printers`()
- E `scan-network-printers`(opts?)
- E `test-printer-connection`(config)
- E `add-printer`(printer) 🔒 IMPRESORAS_GESTIONAR
- E `update-printer`(printerId, printer) 🔒 IMPRESORAS_GESTIONAR
- D `delete-printer`(printerId) 🔒 IMPRESORAS_GESTIONAR
- E `print-test-page`(printerId)

## producto-sectores

`electron/handlers/producto-sectores*.ts` — 2 métodos: 1L 1E 0D 0B

- L `get-producto-sectores`(productoId)
- E `set-producto-sectores`(productoId, sectorIds) 🔒 PRODUCTOS_GESTIONAR

## productos

`electron/handlers/productos*.ts` — 69 métodos: 34L 26E 9D 0B

- L `get-familias`()
- L `get-familia`(familiaId)
- E `create-familia`(familiaData) 🔒 CATEGORIAS_GESTIONAR
- E `update-familia`(familiaId, familiaData) 🔒 CATEGORIAS_GESTIONAR
- D `delete-familia`(familiaId) 🔒 CATEGORIAS_GESTIONAR
- L `get-subfamilias`()
- L `get-subfamilias-by-familia`(familiaId)
- L `get-subfamilia`(subfamiliaId)
- E `create-subfamilia`(subfamiliaData) 🔒 CATEGORIAS_GESTIONAR
- E `update-subfamilia`(subfamiliaId, subfamiliaData) 🔒 CATEGORIAS_GESTIONAR
- D `delete-subfamilia`(subfamiliaId) 🔒 CATEGORIAS_GESTIONAR
- L `get-productos`()
- L `get-productos-with-filters`(filters)
- L `get-producto`(productoId)
- L `get-productos-con-precio`(search?)
- L `get-producto-detalle-mesa`(productoId)
- E `create-producto`(productoData) 🔒 PRODUCTOS_GESTIONAR
- E `update-producto`(productoId, productoData) 🔒 PRODUCTOS_GESTIONAR
- L `get-presentaciones`()
- L `get-presentaciones-by-producto`(productoId, page, pageSize, filtroActivo)
- E `create-presentacion`(presentacionData) 🔒 PRODUCTOS_GESTIONAR
- E `update-presentacion`(presentacionId, presentacionData) 🔒 PRODUCTOS_GESTIONAR
- E `set-presentacion-principal`(presentacionId) 🔒 PRODUCTOS_GESTIONAR
- E `toggle-presentacion-activo`(presentacionId) 🔒 PRODUCTOS_GESTIONAR
- L `get-presentacion`(presentacionId)
- E `create-codigo-barra`(codigoBarraData) 🔒 PRODUCTOS_GESTIONAR
- E `update-codigo-barra`(codigoBarraId, codigoBarraData) 🔒 PRODUCTOS_GESTIONAR
- D `delete-codigo-barra`(codigoBarraId) 🔒 PRODUCTOS_GESTIONAR
- L `get-codigos-barra-by-presentacion`(presentacionId)
- L `get-stock-movimientos`()
- E `create-stock-movimiento`(stockMovimientoData) 🔒 STOCK_MOVIMIENTO_REGISTRAR
- L `get-stock-movimientos-by-producto`(productoId)
- E `update-stock-movimiento`(stockMovimientoId, stockMovimientoData) 🔒 STOCK_MOVIMIENTO_REGISTRAR
- L `getObservaciones`()
- L `searchObservaciones`(search)
- L `getObservacion`(id)
- E `createObservacion`(data) 🔒 PRODUCTOS_GESTIONAR
- E `updateObservacion`(id, data) 🔒 PRODUCTOS_GESTIONAR
- D `deleteObservacion`(id) 🔒 PRODUCTOS_GESTIONAR
- L `get-observaciones-by-producto`(productoId)
- E `create-producto-observacion`(data) 🔒 PRODUCTOS_GESTIONAR
- D `delete-producto-observacion`(id) 🔒 PRODUCTOS_GESTIONAR
- L `getComboByProducto`(productoId)
- E `createCombo`(data) 🔒 PRODUCTOS_GESTIONAR
- E `updateCombo`(id, data) 🔒 PRODUCTOS_GESTIONAR
- D `deleteCombo`(id) 🔒 PRODUCTOS_GESTIONAR
- L `getComboProductos`(comboId)
- E `createComboProducto`(data) 🔒 PRODUCTOS_GESTIONAR
- E `updateComboProducto`(id, data) 🔒 PRODUCTOS_GESTIONAR
- D `deleteComboProducto`(id) 🔒 PRODUCTOS_GESTIONAR
- E `crear-produccion`(data) 🔒 PRODUCTOS_GESTIONAR
- L `get-producciones`(filtros)
- L `search-productos-by-codigo`(codigo)
- L `buscar-producto-codigo-mesa`(codigo)
- L `search-productos-by-nombre`(nombre, mode)
- L `get-receta-ingredientes-intercambiables`(recetaIngredienteId)
- L `get-precios-venta`()
- L `get-precios-venta-by-presentacion`(presentacionId, activo)
- L `get-precios-venta-by-receta`(recetaId, activo)
- L `get-precios-venta-by-producto`(productoId, activo)
- E `create-precio-venta`(precioVentaData) 🔒 PRODUCTOS_GESTIONAR
- E `update-precio-venta`(precioVentaId, precioVentaData) 🔒 PRODUCTOS_GESTIONAR
- D `delete-precio-venta`(precioVentaId) 🔒 PRODUCTOS_GESTIONAR
- L `get-precios-costo`()
- L `get-precios-costo-by-producto`(productoId)
- E `create-precio-costo`(precioCostoData) 🔒 PRODUCTOS_GESTIONAR
- E `update-precio-costo`(precioCostoId, precioCostoData) 🔒 PRODUCTOS_GESTIONAR
- D `delete-precio-costo`(precioCostoId) 🔒 PRODUCTOS_GESTIONAR
- L `get-recetas-ids-por-variacion-ids`(variacionIds)

## qr-upload

`electron/handlers/qr-upload*.ts` — 4 métodos: 0L 4E 0D 0B

- E `qr-upload-create-session`(input)
- E `qr-upload-enable-remote`(input)
- E `qr-upload-poll`(input)
- E `qr-upload-close`(input)

## recetas

`electron/handlers/recetas*.ts` — 73 métodos: 32L 30E 11D 0B

- L `get-recetas`()
- L `get-recetas-with-filters`(filters)
- L `get-receta`(recetaId)
- E `create-receta`(recetaData) 🔒 RECETAS_GESTIONAR
- E `update-receta`(recetaId, recetaData) 🔒 RECETAS_GESTIONAR
- L `get-recetas-asignables`(params)
- E `vincular-receta-a-producto`(productoId, recetaId) 🔒 PRODUCTOS_GESTIONAR
- D `desvincular-receta-de-producto`(productoId) 🔒 PRODUCTOS_GESTIONAR
- L `check-receta-dependencies`(recetaId)
- D `delete-receta`(recetaId) 🔒 RECETAS_GESTIONAR
- L `get-recetas-by-estado`(activo)
- L `search-recetas-by-nombre`(nombre)
- L `get-recetas-with-ingredientes`()
- L `calcular-costo-receta`(recetaId)
- E `actualizar-costo-receta`(recetaId) 🔒 RECETAS_GESTIONAR
- L `get-receta-ingredientes`(recetaId)
- E `create-receta-ingrediente`(recetaIngredienteData) 🔒 INGREDIENTES_GESTIONAR
- E `update-receta-ingrediente`(recetaIngredienteId, recetaIngredienteData) 🔒 INGREDIENTES_GESTIONAR
- L `get-recetas-con-ingrediente`(data)
- E `agregar-ingrediente-multiples-variaciones`(data) 🔒 INGREDIENTES_GESTIONAR
- D `delete-receta-ingrediente`(recetaIngredienteId) 🔒 INGREDIENTES_GESTIONAR
- D `delete-receta-ingrediente-multiples-variaciones`(data) 🔒 RECETAS_GESTIONAR
- L `get-receta-ingredientes-activos`(recetaId)
- L `calcular-costo-ingrediente`(recetaIngredienteId)
- L `validar-stock-ingrediente`(recetaIngredienteId)
- L `get-adicionales`()
- L `get-adicional`(adicionalId)
- E `create-adicional`(adicionalData) 🔒 ADICIONALES_GESTIONAR
- E `update-adicional`(adicionalId, adicionalData) 🔒 ADICIONALES_GESTIONAR
- D `delete-adicional`(adicionalId) 🔒 ADICIONALES_GESTIONAR
- L `get-adicional-with-receta`(adicionalId)
- E `create-receta-for-adicional`(adicionalId, recetaData) 🔒 ADICIONALES_GESTIONAR
- E `update-receta-for-adicional`(adicionalId, recetaData) 🔒 ADICIONALES_GESTIONAR
- D `delete-receta-for-adicional`(adicionalId) 🔒 ADICIONALES_GESTIONAR
- L `get-adicionales-with-filters`(filters)
- L `get-receta-adicional-vinculaciones`(recetaId)
- L `get-receta-adicional-vinculacion`(vinculacionId)
- E `create-receta-adicional-vinculacion`(vinculacionData) 🔒 ADICIONALES_GESTIONAR
- E `update-receta-adicional-vinculacion`(vinculacionId, vinculacionData) 🔒 ADICIONALES_GESTIONAR
- D `delete-receta-adicional-vinculacion`(vinculacionId) 🔒 ADICIONALES_GESTIONAR
- E `recalculate-all-recipe-costs`() 🔒 RECETAS_GESTIONAR
- E `recalculate-recipe-cost`(recetaId) 🔒 RECETAS_GESTIONAR
- L `get-precios-costo-receta`(recetaId)
- L `get-sabores`()
- L `get-all-sabores`(filtros?)
- L `get-sabores-by-producto`(productoId)
- E `create-sabor`(saborData) 🔒 SABORES_GESTIONAR
- E `reparar-recetas-compartidas`() 🔒 SABORES_GESTIONAR
- E `update-sabor`(id, saborData) 🔒 SABORES_GESTIONAR
- D `delete-sabor`(id) 🔒 SABORES_GESTIONAR
- L `get-sabores-estadisticas`(productoId)
- L `get-variaciones-by-producto`(productoId)
- L `get-variaciones-by-receta`(recetaId)
- L `get-variaciones-by-producto-and-presentacion`(productoId, presentacionId)
- E `create-receta-presentacion`(variacionData) 🔒 RECETAS_GESTIONAR
- E `update-receta-presentacion`(id, data) 🔒 RECETAS_GESTIONAR
- D `delete-receta-presentacion`(id) 🔒 RECETAS_GESTIONAR
- E `bulk-update-variaciones`(updates) 🔒 RECETAS_GESTIONAR
- E `recalcular-costo-variacion`(variacionId) 🔒 RECETAS_GESTIONAR
- E `generate-variaciones-faltantes`(productoId) 🔒 RECETAS_GESTIONAR
- E `create-or-update-sabor`(saborData) 🔒 SABORES_GESTIONAR
- L `get-sabor-details`(categoria)
- L `get-receta-fases`(recetaId)
- E `create-receta-fase`(data) 🔒 RECETAS_GESTIONAR
- E `update-receta-fase`(faseId, data) 🔒 RECETAS_GESTIONAR
- D `delete-receta-fase`(faseId) 🔒 RECETAS_GESTIONAR
- E `reorder-receta-fases`(recetaId, ordenIds) 🔒 RECETAS_GESTIONAR
- E `set-receta-fase-ingredientes`(faseId, recetaIngredienteIds) 🔒 RECETAS_GESTIONAR
- L `get-receta-materiales`(recetaId)
- E `create-receta-material`(data) 🔒 RECETAS_GESTIONAR
- E `update-receta-material`(materialId, data) 🔒 RECETAS_GESTIONAR
- D `delete-receta-material`(materialId) 🔒 RECETAS_GESTIONAR
- L `export-receta-pdf`(recetaId)

## remote-tunnel

`electron/handlers/remote-tunnel*.ts` — 3 métodos: 0L 1E 0D 2B

- E `remote-tunnel-status`()
- B `remote-tunnel-stop`()
- B `remote-tunnel-start`()

## reportes-rrhh

`electron/handlers/reportes-rrhh*.ts` — 17 métodos: 17L 0E 0D 0B

- L `get-reporte-liquidaciones-mes-data`(periodo)
- L `export-reporte-liquidaciones-mes-excel`(periodo)
- L `export-reporte-liquidaciones-mes-pdf`(periodo)
- L `get-reporte-asistencia-mes-data`(periodo, funcionarioId?)
- L `export-reporte-asistencia-mes-excel`(periodo, funcionarioId?)
- L `get-reporte-vales-mes-data`(periodo)
- L `export-reporte-vales-mes-excel`(periodo)
- L `get-reporte-prestamos-activos-data`()
- L `export-reporte-prestamos-activos-excel`()
- L `get-reporte-comisiones-mes-data`(periodo)
- L `export-reporte-comisiones-mes-excel`(periodo)
- L `export-recibo-liquidacion-pdf`(liquidacionId)
- L `get-reporte-aguinaldo-anual-data`(anio)
- L `export-reporte-aguinaldo-anual-excel`(anio)
- L `export-reporte-aguinaldo-anual-pdf`(anio)
- L `get-reporte-resumen-ips-data`(periodo)
- L `export-reporte-resumen-ips-excel`(periodo)

## reportes

`electron/handlers/reportes*.ts` — 3 métodos: 2L 1E 0D 0B

- L `get-reporte-ventas-cierre`(params) 🔒 VENTAS_REPORTES_VER
- L `get-reporte-finanzas-cierre`(params) 🔒 FINANCIERO_REPORTES_VER
- E `enviar-reporte-whatsapp`(params)

## rrhh-funcionarios

`electron/handlers/rrhh-funcionarios*.ts` — 16 métodos: 8L 7E 1D 0B

- L `get-cargos`()
- L `get-cargo`(id)
- E `create-cargo`(data) 🔒 RRHH_CONFIG_EDITAR
- E `update-cargo`(id, data) 🔒 RRHH_CONFIG_EDITAR
- D `delete-cargo`(id) 🔒 RRHH_CONFIG_EDITAR
- L `get-funcionarios`(filtros?)
- L `get-funcionario`(id)
- E `create-funcionario`(data) 🔒 RRHH_FUNCIONARIO_EDITAR
- E `update-funcionario`(id, data) 🔒 RRHH_FUNCIONARIO_EDITAR
- E `cambiar-cargo-funcionario`(id, data) 🔒 RRHH_FUNCIONARIO_EDITAR
- E `cambiar-salario-funcionario`(id, data) 🔒 RRHH_FUNCIONARIO_EDITAR
- E `egresar-funcionario`(id, data) 🔒 RRHH_FUNCIONARIO_EGRESAR
- L `get-historico-cargos`(funcionarioId)
- L `get-historico-salarios`(funcionarioId)
- L `get-funcionario-resumen-financiero`(funcionarioId)
- L `get-funcionario-de-cliente`(clienteId)

## sectores-impresoras

`electron/handlers/sectores-impresoras*.ts` — 5 métodos: 2L 2E 1D 0B

- L `get-sectores-impresoras`()
- L `get-sector-impresoras-by-sector`(sectorId)
- E `create-sector-impresora`(data) 🔒 SECTORES_IMPRESORAS_CONFIGURAR
- E `update-sector-impresora`(id, data) 🔒 SECTORES_IMPRESORAS_CONFIGURAR
- D `delete-sector-impresora`(id) 🔒 SECTORES_IMPRESORAS_CONFIGURAR

## system

`electron/handlers/system*.ts` — 2 métodos: 1L 0E 0D 1B

- L `get-pwa-access`()
- B `get-system-mac-address`()

## vacaciones

`electron/handlers/vacaciones*.ts` — 8 métodos: 2L 4E 2D 0B

- L `get-vacaciones`(filtros)
- L `get-vacacion`(id)
- E `generar-vacaciones-funcionario`(funcionarioId) 🔒 RRHH_VACACION_GESTIONAR
- E `programar-vacacion-periodo`(payload) 🔒 RRHH_VACACION_GESTIONAR
- E `marcar-periodo-gozado`(periodoId) 🔒 RRHH_VACACION_GESTIONAR
- D `cancelar-vacacion-periodo`(periodoId) 🔒 RRHH_VACACION_GESTIONAR
- E `vender-dias-vacacion`(payload) 🔒 RRHH_VACACION_GESTIONAR
- D `anular-venta-vacacion`(ventaId) 🔒 RRHH_VACACION_GESTIONAR

## vales

`electron/handlers/vales*.ts` — 12 métodos: 4L 6E 2D 0B

- L `get-vale`(id)
- L `get-motivos-vale`()
- E `create-motivo-vale`(data) 🔒 RRHH_CONFIG_EDITAR
- E `update-motivo-vale`(id, data) 🔒 RRHH_CONFIG_EDITAR
- D `delete-motivo-vale`(id) 🔒 RRHH_CONFIG_EDITAR
- L `get-vales`(filtros)
- L `get-vales-pendientes-descuento`(funcionarioId)
- E `create-vale`(data) 🔒 RRHH_VALE_CREAR
- E `crear-vale-confirmado`(data) 🔒 RRHH_VALE_CONFIRMAR, RRHH_VALE_CREAR
- E `confirmar-vale`(id, payload) 🔒 RRHH_VALE_CONFIRMAR
- D `anular-vale`(id, motivo) 🔒 RRHH_VALE_CONFIRMAR
- E `marcar-vale-descontado`(id, liquidacionId) 🔒 RRHH_VALE_CONFIRMAR

## ventas

`electron/handlers/ventas*.ts` — 129 métodos: 58L 47E 24D 0B

- L `get-buffet-metricas`(filtros)
- L `getPreciosDelivery`()
- L `getPrecioDelivery`(id)
- E `createPrecioDelivery`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePrecioDelivery`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePrecioDelivery`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getDeliveries`()
- L `getDeliveriesByEstado`(estado)
- L `getDelivery`(id)
- E `createDelivery`() 🔒 VENTAS_PDV
- E `updateDelivery`(id, data) 🔒 VENTAS_PDV
- D `deleteDelivery`(id) 🔒 VENTAS_PDV
- L `getDeliveriesByCaja`(cajaId, filtros?)
- D `cerrarVentasAbiertasMesa`(mesaId, estado, opts?) 🔒 VENTAS_PDV
- L `getVentas`()
- L `getVentasByEstado`(estado)
- L `getVenta`(id)
- E `createVenta`(data) 🔒 VENTAS_PDV
- L `getVentasByDateRange`(desde, hasta, filtros?)
- L `getVentasByCaja`(cajaId)
- L `getResumenCaja`(cajaId)
- L `getVentasTotalByCaja`(cajaId)
- E `updateVenta`(id, data) 🔒 VENTAS_PDV
- D `deleteVenta`(id) 🔒 VENTAS_PDV
- L `getVentaItems`(ventaId)
- L `getVentaItem`(id)
- E `createVentaItem`(data) 🔒 VENTAS_PDV
- E `materializar-pedido-online-en-venta`(pedidoId, opts?) 🔒 VENTAS_PDV
- E `updateVentaItem`(id, data) 🔒 VENTAS_PDV
- D `deleteVentaItem`(id) 🔒 VENTAS_PDV
- L `getObservacionesByVentaItem`(ventaItemId)
- E `createVentaItemObservacion`(data) 🔒 VENTAS_PDV
- D `deleteVentaItemObservacion`(id) 🔒 VENTAS_PDV
- L `getVentaItemAdicionales`(ventaItemId)
- E `createVentaItemAdicional`(data) 🔒 VENTAS_PDV
- D `deleteVentaItemAdicional`(id) 🔒 VENTAS_PDV
- L `getVentaItemIngredienteModificaciones`(ventaItemId)
- E `createVentaItemIngredienteModificacion`(data) 🔒 VENTAS_PDV
- D `deleteVentaItemIngredienteModificacion`(id) 🔒 VENTAS_PDV
- L `getPdvGrupoCategorias`()
- L `getPdvGrupoCategoria`(id)
- E `createPdvGrupoCategoria`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvGrupoCategoria`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvGrupoCategoria`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvCategorias`()
- L `getPdvCategoriasByGrupo`(grupoId)
- L `getPdvCategoria`(id)
- E `createPdvCategoria`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvCategoria`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvCategoria`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvCategoriaItems`()
- L `getPdvCategoriaItemsByCategoria`(categoriaId)
- L `getPdvCategoriaItem`(id)
- E `createPdvCategoriaItem`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvCategoriaItem`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvCategoriaItem`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvItemProductos`()
- L `getPdvItemProductosByItem`(itemId)
- L `getPdvItemProducto`(id)
- E `createPdvItemProducto`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvItemProducto`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvItemProducto`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvConfig`() — crea config por defecto si falta
- E `createPdvConfig`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvConfig`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- L `getReservas`()
- L `getReservasActivas`()
- L `getReserva`(id)
- E `createReserva`(data) 🔒 VENTAS_PDV
- E `updateReserva`(id, data) 🔒 VENTAS_PDV
- D `deleteReserva`(id) 🔒 VENTAS_PDV
- L `getPdvMesas`()
- L `getPdvMesasActivas`()
- L `getPdvMesasDisponibles`()
- L `getPdvMesasBySector`(sectorId)
- L `getPdvMesa`(id)
- E `createPdvMesa`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `createBatchPdvMesas`(batchData) 🔒 VENTAS_PDV_CONFIGURAR
- E `set-pdv-mesa-estado`(mesaId, estado) 🔒 VENTAS_PDV
- E `transferir-venta-pdv`(payload) 🔒 VENTAS_PDV
- E `updatePdvMesa`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvMesa`(id) 🔒 VENTAS_PDV_CONFIGURAR
- L `getComandas`()
- L `getComandasActivas`()
- L `getComandasByMesa`(mesaId)
- L `getComanda`(id)
- E `createComanda`(data) 🔒 VENTAS_PDV
- E `updateComanda`(id, data) 🔒 VENTAS_PDV
- D `deleteComanda`(id) 🔒 VENTAS_PDV
- L `getComandasDisponibles`()
- L `getComandasOcupadas`()
- L `getComandasBySector`(sectorId)
- E `abrirComanda`(comandaId, data) 🔒 VENTAS_PDV
- D `cerrarComanda`(comandaId) 🔒 VENTAS_PDV
- E `createBatchComandas`(batchData) 🔒 VENTAS_PDV
- L `getComandaWithVenta`(comandaId)
- L `getSectores`(tipo?)
- L `getSectoresActivos`(tipo?)
- L `getSector`(id)
- E `createSector`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updateSector`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deleteSector`(id) 🔒 VENTAS_PDV_CONFIGURAR
- E `procesarStockVenta`(ventaId) 🔒 VENTAS_PDV
- D `revertirStockVenta`(ventaId) 🔒 VENTAS_PDV
- L `getPdvAtajoGrupos`()
- L `getPdvAtajoGrupo`(id)
- E `createPdvAtajoGrupo`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvAtajoGrupo`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvAtajoGrupo`(id) 🔒 VENTAS_PDV_CONFIGURAR
- E `reorderPdvAtajoGrupos`(orderedIds) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvAtajoItems`()
- L `getPdvAtajoItem`(id)
- L `getPdvAtajoItemsByGrupo`(grupoId)
- E `createPdvAtajoItem`(data) 🔒 VENTAS_PDV_CONFIGURAR
- E `updatePdvAtajoItem`(id, data) 🔒 VENTAS_PDV_CONFIGURAR
- D `deletePdvAtajoItem`(id) 🔒 VENTAS_PDV_CONFIGURAR
- E `assignAtajoItemToGrupo`(grupoId, itemId, posicion) 🔒 VENTAS_PDV_CONFIGURAR
- D `removeAtajoItemFromGrupo`(grupoId, itemId) 🔒 VENTAS_PDV_CONFIGURAR
- E `reorderAtajoItemsInGrupo`(grupoId, orderedItemIds) 🔒 VENTAS_PDV_CONFIGURAR
- L `getPdvAtajoItemProductos`(atajoItemId)
- E `assignProductoToAtajoItem`(atajoItemId, productoId, data?) 🔒 VENTAS_PDV_CONFIGURAR
- D `removeProductoFromAtajoItem`(id) 🔒 VENTAS_PDV_CONFIGURAR
- E `reorderProductosInAtajoItem`(atajoItemId, orderedIds) 🔒 VENTAS_PDV_CONFIGURAR
- E `createVentaItemSabor`(data) 🔒 VENTAS_PDV
- L `getVentaItemSabores`(ventaItemId)
- D `deleteVentaItemSaboresByItem`(ventaItemId) 🔒 VENTAS_PDV
- L `getEstadoCobroVenta`(ventaId)
- E `registrarCobroParcial`(ventaId, payload) 🔒 VENTAS_COBRAR
- D `anularCobroParcial`(cobroParcialId) 🔒 VENTAS_PDV

## auto-updater

`electron/handlers/auto-updater*.ts` — 5 métodos: 1L 2E 0D 2B

- L `auto-update:get-config`()
- E `auto-update:set-channel`(channel)
- E `auto-update:set-auto-check`(enabled)
- B `auto-update:check-now`()
- B `auto-update:quit-and-install`()
