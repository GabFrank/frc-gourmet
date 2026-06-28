# Menú lateral (sidenav)

Árbol según `src/app/app.component.html` y `app.component.ts`. **7 secciones expandibles + Dashboard** (más un divider antes de Configuración). Cada item está protegido por `*appHasPermission="'CODIGO'"`; cada sección por `*appHasAnyPermission="[...]"` (la sección aparece si el usuario tiene alguno de sus permisos). Directivas en `src/app/shared/directives/has-permission.directive.ts`.

## Estructura

```
☰ Dashboard                          dashboard      → HomeComponent                       [HOME_DASHBOARD_VER]
▾ Ventas                             shopping_cart
   ├ Dashboard                       dashboard      → VentasDashboardComponent            [VENTAS_DASHBOARD_VER]
   ├ Buffet por kilo                 scale          → BuffetDashboardComponent            [VENTAS_DASHBOARD_VER]
   ├ KDS — Cocina                    restaurant     → KdsComponent                        [COMANDAS_KDS_VER]
   └ Pantallas KDS                   tv             → ListKdsPantallasComponent           [COMANDAS_KDS_CONFIGURAR]
▾ Recursos Humanos                   people
   ├ Dashboard RRHH                  dashboard      → RrhhDashboardComponent              [RRHH_DASHBOARD_VER]
   ├ Notificaciones [badge]          notifications  → ListNotificacionesRrhhComponent     [RRHH_NOTIFICACIONES_VER]
   ├ Reportes RRHH                   assessment     → ReportesRrhhPageComponent           [RRHH_REPORTE_GENERAR]
   ├ Personas                        person         → ListPersonasComponent               [PERSONAS_VER]
   ├ Usuarios                        account_circle → ListUsuariosComponent               [USUARIOS_GESTIONAR]
   ├ Clientes                        business       → ListClientesComponent               [CLIENTES_VER]
   ├ Convenios                       handshake      → ListConveniosComponent              [CLIENTES_VER]
   ├ Cargos                          work           → ListCargosComponent                 [RRHH_FUNCIONARIO_VER]
   ├ Funcionarios                    badge          → ListFuncionariosComponent           [RRHH_FUNCIONARIO_VER]
   ├ Turnos                          schedule       → ListTurnosComponent                 [RRHH_FUNCIONARIO_VER]
   ├ Asistencias                     fact_check     → ListAsistenciasComponent            [RRHH_ASISTENCIA_REGISTRAR]
   ├ Penalizaciones                  gavel          → ListPenalizacionesComponent         [RRHH_PENALIZACION_REGISTRAR]
   ├ Horas extra                     more_time      → ListHorasExtraComponent             [RRHH_ASISTENCIA_JUSTIFICAR]
   ├ Vales                           receipt_long   → ListValesComponent                  [RRHH_VALE_CREAR]
   ├ Motivos de vale                 label          → ListMotivosValeComponent            [RRHH_VALE_CREAR]
   ├ Préstamos                       account_balance→ ListPrestamosFuncionariosComponent  [RRHH_PRESTAMO_OTORGAR]
   ├ Liquidaciones                   request_quote  → ListLiquidacionesSueldoComponent    [RRHH_LIQUIDACION_GENERAR]
   ├ Bonos                           card_giftcard  → ListBonosComponent                  [RRHH_BONO_OTORGAR]
   ├ Aguinaldos                      star           → ListAguinaldosComponent             [RRHH_LIQUIDACION_GENERAR]
   ├ Vacaciones                      beach_access   → ListVacacionesComponent             [RRHH_VACACION_GESTIONAR]
   ├ Feriados                        celebration    → ListFeriadosComponent               [RRHH_CONFIG_EDITAR]
   ├ Permisos                        verified_user  → ListPermisosComponent               [SISTEMA_PERMISO_GESTIONAR]
   └ Config RRHH                     tune           → ListConfiguracionRrhhComponent      [RRHH_CONFIG_EDITAR]
▾ Comisiones                         percent
   ├ Reglas                          rule           → ListReglasComisionComponent         [COMISION_REGLA_VER]
   ├ Equipos                         group          → ListEquiposComisionComponent        [COMISION_EQUIPO_GESTIONAR]
   └ Liquidaciones                   receipt        → ListLiquidacionesComisionComponent  [COMISION_LIQUIDACION_GENERAR]
▾ Productos                          inventory_2
   ├ Dashboard                       dashboard      → ProductosDashboardComponent         [PRODUCTOS_DASHBOARD_VER]
   ├ Categorías                      category       → (TODO — handler comentado, no-op)   [CATEGORIAS_GESTIONAR]
   ├ Productos                       restaurant     → ListProductosComponent              [PRODUCTOS_VER]
   ├ Recetas                         menu_book      → ListRecetasComponent                [RECETAS_VER]
   ├ Gestión de Sabores             auto_awesome   → ListSaboresComponent                [SABORES_VER]
   ├ Adicionales                     add_circle     → ListAdicionalesComponent            [ADICIONALES_VER]
   ├ Ingredientes                    egg            → (TODO — handler comentado, no-op)   [INGREDIENTES_VER]
   └ Movimientos de Stock           inventory      → (TODO — handler comentado, no-op)   [STOCK_MOVIMIENTO_VER]
▾ Compras                            shopping_cart
   ├ Dashboard                       dashboard      → ComprasDashboardComponent           [COMPRAS_DASHBOARD_VER]
   ├ Compras                         shopping_cart  → ListComprasComponent                [COMPRAS_VER]
   └ Importaciones IA                auto_awesome   → ListFacturaImportsComponent         [COMPRAS_IMPORTAR_FACTURA]
▾ Financiero                         attach_money
   ├ Dashboard                       dashboard      → FinancieroDashboardComponent        [FINANCIERO_DASHBOARD_VER]
   ├ Cajas                           point_of_sale  → ListCajasComponent                  [FINANCIERO_CAJA_VER]
   ├ Monedas                         monetization_on→ ListMonedasComponent                [MONEDAS_GESTIONAR]
   ├ Tipos de Precio                 sell           → (TODO — handler comentado, no-op)   [PRODUCTOS_GESTIONAR]
   ├ Caja Mayor                      account_balance→ CajaMayorDashboardComponent         [CAJA_MAYOR_DASHBOARD_VER]
   └ Cuentas por Cobrar              request_quote  → ListCuentasPorCobrarComponent       [CPC_GESTIONAR]
─────  (mat-divider)
▾ Configuración                      settings
   ├ Datos de la Empresa             business       → ConfigurarEmpresaComponent          [EMPRESA_CONFIGURAR]
   ├ Impresoras                      print          → PrinterSettingsComponent (DIALOG)   [IMPRESORAS_GESTIONAR]
   ├ Sectores e impresoras           device_hub     → SectoresImpresorasSettingsComponent (DIALOG) [SECTORES_IMPRESORAS_CONFIGURAR]
   ├ Dispositivos y puntos de venta  devices        → ListDispositivosComponent           [DISPOSITIVOS_GESTIONAR]
   ├ Backup y Restauración           backup         → BackupRestoreComponent              [SISTEMA_BACKUP]
   ├ Configurar IA                   auto_awesome   → IaConfigComponent                   [SISTEMA_CONFIGURAR_IA]
   ├ Configurar BD                   storage        → DbConfigComponent                   [SISTEMA_BD_CONFIGURAR]
   └ Modo de operación              hub            → ModeConfigComponent                 [SISTEMA_MODO_CONFIGURAR]
─────
[Salir]                              exit_to_app    → logout()                            (sin permiso)
```

## Detalles

- Modo **collapsed (60px)**: solo iconos centrados. Modo **expanded (250px)**: iconos + título + paneles.
- `isMenuExpanded` persiste durante la sesión (no en localStorage). `expandedMenu` controla qué panel está abierto (uno solo).
- Click fuera del sidenav cierra el menú (`HostListener('document:click')`).
- La mayoría de `openXxxTab()` usa `tabsService.openTab(title, Component, {source:'navigation'}, key, true)` + `closeMenu()`. **Impresoras** y **Sectores e impresoras** abren como **dialog** (`dialog.open(...)`), no tab.

## openXxxTab típico

```typescript
openFuncionariosTab() {
  this.tabsService.openTab('Funcionarios', ListFuncionariosComponent, { source: 'navigation' }, 'funcionarios-tab', true);
  this.closeMenu();
}
```

`id` estable evita duplicados (si la tab ya existe, la activa).

## Items TODO (handler comentado, no-op)

`openCategoriasTab`, `openIngredientesTab`, `openMovimientosStockTab`, `openTipoPrecioTab` tienen el cuerpo comentado: el item es visible (gated por permiso) pero el click no hace nada (ni siquiera `closeMenu()`).

> Inconsistencia conocida: "Tipos de Precio" (en Financiero) está protegido por `PRODUCTOS_GESTIONAR`, no por un permiso financiero.

## Toolbar (header)

De izquierda a derecha:
- **☰** toggle sidenav (`menu_open` / `menu`).
- **Logo + nombre de empresa** (si configurados) + `FRC Gourmet v{appVersion}` + chip de modo (`SERVIDOR`/`CLIENTE`, oculto en standalone).
- **Bloque central:** cotizaciones USD/BRL (con tooltip + estado de error) y reloj en vivo (`HH:mm:ss` + fecha).
- **Menú de usuario** (`matMenuTriggerFor`): avatar + nombre + flecha. Dropdown: header de usuario, **Mi Perfil** (inerte, sin handler), **Tema claro/oscuro** (`toggleTheme()`), **Actualizaciones** (`openUpdateDialog()` → `UpdateChannelDialogComponent`, con badge según estado), **Cerrar Sesión** (`logout()`).
- **Controles de ventana custom** (`*ngIf="!isMacOS"`): minimizar / maximizar-restaurar / cerrar (vía IPC `window:*`).

> El botón de notificaciones con `matBadge` está **comentado** en el template. El badge de notificaciones RRHH vive en el item "Notificaciones" del sidenav.
