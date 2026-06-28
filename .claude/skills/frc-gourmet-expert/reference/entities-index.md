# Índice de entidades

**157 archivos `*.entity.ts`** en `src/app/database/entities/` (incluye `base.entity.ts` abstracto). Todas las entidades concretas extienden `BaseModel` (id, createdAt, updatedAt, createdBy, updatedBy). Listadas en `getEntitiesList()` de `database.config.ts`. Lista regenerada del filesystem.

> El esquema se gestiona **solo por migraciones** (`synchronize: false`). Una entity nueva exige también una migración driver-aware. Ver [architecture/database.md](../architecture/database.md).

## Auth (`auth/`) — 2

| Entidad | Notas |
|---|---|
| LoginSession | Sesiones de login (token NO persistido) |
| RefreshToken | Refresh tokens (modo server/client) |

## Personas (`personas/`) — 9

| Entidad | Notas |
|---|---|
| Persona | Entidad raíz para Usuario/Cliente/Funcionario |
| Usuario | nickname UNIQUE, password **bcrypt**, `mustChangePassword` |
| Role | Rol del sistema |
| UsuarioRole | M:N Usuario↔Role |
| Permission | codigo UNIQUE UPPERCASE |
| RolePermission | M:N Role↔Permission |
| Cliente | Persona + datos comerciales (saldoActual, credito) |
| TipoCliente | Catálogo de tipos de cliente |
| Convenio | Convenio comercial de cliente (cobro consolidado) |

## Personalización (`personalizacion/`) — 2

| Entidad | Notas |
|---|---|
| DashboardShortcut | Accesos rápidos personalizados de Home |
| OnboardingTaskOverride | Override de tareas de onboarding |

## Productos (`productos/`) — 33

| Entidad | Notas |
|---|---|
| Familia / Subfamilia | Jerarquía de clasificación |
| Producto | tipo: ProductoTipo. `subfamilia` nullable (productos parciales). `iva`, `registroCompleto` |
| Presentacion | Presentaciones del producto |
| CodigoBarra | N por presentación |
| PrecioVenta | Polimórfico (presentacion / receta / producto / recetaPresentacion); con vigencia |
| PrecioCosto | fuente: COMPRA / MANUAL / AJUSTE_RECETA |
| Receta | + costoCalculado cache |
| RecetaIngrediente / RecetaIngredienteIntercambiable | Ingredientes y alternativas |
| RecetaFase / RecetaFaseIngrediente | Preparación por fases |
| RecetaMaterial | Materiales de receta |
| Adicional / RecetaAdicionalVinculacion | Adicionales y su precio por receta |
| Observacion / ProductoObservacion | Observaciones (M:N) |
| TamanhoPizza / SaborPizza / EnsambladoPizza / EnsambladoPizzaSabor | LEGACY (sistema viejo de pizzas) |
| Combo / ComboProducto | Combos y sus componentes |
| Promocion / PromocionPresentacion | Promociones (M:N) |
| Sabor | Para ELABORADO_CON_VARIACION |
| RecetaPresentacion | Variación = Presentación × Sabor + Receta única (eager → Receta) |
| Produccion / ProduccionIngrediente | Producción |
| StockMovimiento | Movimientos de stock |
| ProductoSector | M2M Producto↔Sector (routing de comanda) |
| ConfiguracionMonetaria | Moneda principal del sistema |
| ConversionMoneda | Histórico de tasas |

## Ventas (`ventas/`) — 24

| Entidad | Notas |
|---|---|
| Venta | estado: ABIERTA / CONCLUIDA / CANCELADA |
| VentaItem | estado: ACTIVO / MODIFICADO / CANCELADO |
| VentaItemSabor / VentaItemAdicional | Multi-sabor / extras |
| VentaItemIngredienteModificacion | REMOVIDO / INTERCAMBIADO |
| VentaItemObservacion | predefinida o libre |
| PdvMesa | estado: DISPONIBLE / OCUPADO |
| Sector / SectorImpresora | Sectores y su mapeo a impresoras |
| Reserva | UI parcial |
| Delivery / PrecioDelivery | Delivery y zonas |
| Comanda / ComandaItem | Tarjeta cocina + items |
| KdsPantalla | Pantallas de KDS |
| PdvGrupoCategoria / PdvCategoria / PdvCategoriaItem / PdvItemProducto | LEGACY (categorías PdV) |
| PdvAtajoGrupo / PdvAtajoGrupoItem / PdvAtajoItem / PdvAtajoItemProducto | Sistema actual de atajos |
| PdvConfig | Config global PdV (1 fila) |

## Compras (`compras/`) — 12

| Entidad | Notas |
|---|---|
| Proveedor / ProveedorProducto | Proveedores e histórico de precios |
| Compra / CompraDetalle | estado: ABIERTO / FINALIZADO / CANCELADO |
| CompraCategoria | Jerárquica |
| CompraCuota | DEPRECATED (reemplazado por CuentaPorPagarCuota) |
| Pago / PagoDetalle | DEPRECATED |
| FormasPago | Tabla general |
| DocumentoCompraImportado | Factura subida vía OCR + IA |
| OcrAliasProveedor / OcrAliasProducto | Aprendizaje de mapeos OCR |

## Financiero (`financiero/`) — 35

| Entidad | Notas |
|---|---|
| Moneda / MonedaBillete / MonedaCambio | Monedas, denominaciones, tasas |
| TipoPrecio | NORMAL / etc. |
| Dispositivo | Hardware POS |
| Caja / CajaMoneda | Registradora + M:N moneda |
| Conteo / ConteoDetalle | Apertura/cierre por billete |
| CajaMayor / CajaMayorMovimiento / CajaMayorSaldo / CajaMayorConfiguracion | Ledger central |
| Gasto / GastoCategoria / GastoDetalle | Gastos (multi-moneda) |
| RetiroCaja / RetiroCajaDetalle | Retiros |
| EntradaVaria / EntradaVariaCategoria | Entradas varias |
| OperacionFinanciera / OperacionFinancieraCategoria | Cambio divisa, depósito, retiro, transferencia |
| CuentaBancaria / MovimientoBancario | Cuentas + movimientos manuales |
| MaquinaPos / AcreditacionPos | POS + acreditaciones (scheduler) |
| Chequera / Cheque | Cheques |
| CuentaPorPagar / CuentaPorPagarCuota | CPP |
| CuentaPorCobrar / CuentaPorCobrarCuota | CPC |
| MovimientoCliente | Tracking saldoActual cliente |
| CobroConsolidado / CobroConsolidadoDetalle | Cobro consolidado de convenios |

## RRHH (`rrhh/`) — 34

| Entidad | Notas |
|---|---|
| ConfiguracionRrhh | clave UNIQUE (parámetros legales) |
| Cargo / Funcionario / HistoricoCargo / HistoricoSalario | Funcionarios e históricos |
| FuncionarioDocumento | Filesystem path |
| Turno / FuncionarioTurno | Turnos y vigencia |
| Asistencia / Penalizacion / Feriado / HoraExtra | Asistencia |
| Vale / MotivoVale | Vales/adelantos |
| LiquidacionSueldo / LiquidacionItem / LiquidacionConcepto | Liquidación de sueldo |
| Bono / Aguinaldo | Bonos y aguinaldos |
| Vacacion / VacacionPeriodo / VacacionVenta | Vacaciones |
| LiquidacionFinal / LiquidacionFinalItem | Liquidación final |
| ReglaComision / ReglaComisionProducto / ReglaComisionRequisito | Reglas de comisión |
| FuncionarioReglaComision | Vigencia |
| EquipoComision / EquipoComisionMiembro / EquipoComisionRegla | Equipos |
| LiquidacionComision / LiquidacionComisionItem | Liquidación de comisión |
| NotificacionRrhh | claveDedupe UNIQUE |

## IA (`ia/`) — 2

| Entidad | Notas |
|---|---|
| IaPromptConfig | Configuración de prompts de IA |
| IaPromptSugerencia | Sugerencias de prompts |

## Sistema (`sistema/`) — 1

| Entidad | Notas |
|---|---|
| Empresa | Singleton: datos + branding + fiscal |

## Shared (`shared/`) — 1

| Entidad | Notas |
|---|---|
| Adjunto | Adjunto polimórfico vinculable a cualquier entidad |

## Top-level — 2

| Entidad | Notas |
|---|---|
| BaseModel (`base.entity.ts`) | **Abstracta** — base de todas las entidades |
| Printer (`printer.entity.ts`) | epson / star / thermal |

## Listas programáticas

Lista completa en `getEntitiesList()` de `src/app/database/database.config.ts`. Para verificar el conteo: `find src/app/database/entities -name '*.entity.ts' | wc -l`.
