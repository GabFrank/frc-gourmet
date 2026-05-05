# Menú lateral (sidenav)

Árbol completo según `src/app/app.component.html` y `app.component.ts`. 8 secciones expandibles + Dashboard.

## Estructura visual

```
☰ Dashboard                          (item simple)
▾ Ventas                              shopping_cart
   └ Dashboard                          dashboard         → VentasDashboardComponent
▾ Recursos Humanos                    people
   ├ Dashboard RRHH                    dashboard         → RrhhDashboardComponent
   ├ Notificaciones [badge]            notifications     → ListNotificacionesRrhhComponent
   ├ Reportes RRHH                     assessment        → ReportesRrhhPageComponent
   ├ Personas                          person            → ListPersonasComponent
   ├ Usuarios                          account_circle    → ListUsuariosComponent
   ├ Clientes                          business          → ListClientesComponent
   ├ Cargos                            work              → ListCargosComponent
   ├ Funcionarios                      badge             → ListFuncionariosComponent
   ├ Turnos                            schedule          → ListTurnosComponent
   ├ Asistencias                       fact_check        → ListAsistenciasComponent
   ├ Penalizaciones                    gavel             → ListPenalizacionesComponent
   ├ Horas extra                       more_time         → ListHorasExtraComponent
   ├ Vales                             receipt_long      → ListValesComponent
   ├ Motivos de vale                   label             → ListMotivosValeComponent
   ├ Préstamos                         account_balance   → ListPrestamosFuncionariosComponent
   ├ Liquidaciones                     request_quote     → ListLiquidacionesSueldoComponent
   ├ Bonos                             card_giftcard     → ListBonosComponent
   ├ Aguinaldos                        star              → ListAguinaldosComponent
   ├ Feriados                          celebration       → ListFeriadosComponent
   ├ Permisos                          verified_user     → ListPermisosComponent
   └ Config RRHH                       tune              → ListConfiguracionRrhhComponent
▾ Comisiones                          percent
   ├ Reglas                            rule              → ListReglasComisionComponent
   ├ Equipos                           group             → ListEquiposComisionComponent
   └ Liquidaciones                     receipt           → ListLiquidacionesComisionComponent
▾ Productos                           inventory_2
   ├ Dashboard                         dashboard         → ProductosDashboardComponent
   ├ Categorías                        category          → (TODO — handler vacío)
   ├ Productos                         restaurant        → ListProductosComponent
   ├ Recetas                           menu_book         → ListRecetasComponent
   ├ Gestión de Sabores                auto_awesome      → ListSaboresComponent
   ├ Adicionales                       add_circle        → ListAdicionalesComponent
   ├ Ingredientes                      egg               → (TODO — handler vacío)
   └ Movimientos de Stock              inventory         → (TODO — handler vacío)
▾ Compras                             shopping_cart
   ├ Dashboard                         dashboard         → ComprasDashboardComponent
   └ Compras                           shopping_cart     → ListComprasComponent
▾ Financiero                          attach_money
   ├ Dashboard                         dashboard         → FinancieroDashboardComponent
   ├ Cajas                             point_of_sale     → ListCajasComponent
   ├ Monedas                           monetization_on   → ListMonedasComponent
   ├ Tipos de Precio                   sell              → (TODO — handler vacío)
   ├ Caja Mayor                        account_balance   → CajaMayorDashboardComponent
   └ Cuentas por Cobrar                request_quote     → ListCuentasPorCobrarComponent
─────
▾ Configuración                        settings
   ├ Impresoras                        print             → PrinterSettingsComponent (dialog)
   └ Dispositivos y Puntos de Venta    devices           → ListDispositivosComponent
─────
[Salir]                               exit_to_app       → logout()
```

## Detalles

- Modo **collapsed (60px)**: solo iconos centrados.
- Modo **expanded (250px)**: iconos + título + paneles expandibles.
- **`isMenuExpanded`** persiste durante la sesión, no en localStorage.
- **`expandedMenu`** (string | null) controla qué panel está abierto a la vez (uno solo).
- **Click fuera del sidenav** cierra el menú (`HostListener('document:click')`).

## Cada `openXxxTab()` típico

```typescript
openFuncionariosTab() {
  this.tabsService.openTab(
    'Funcionarios',                  // título
    ListFuncionariosComponent,       // componente
    { source: 'navigation' },        // data
    'funcionarios-tab',              // id estable
    true                             // closable
  );
  this.closeMenu();
}
```

`id` estable evita duplicados (si la tab ya está abierta, la activa en vez de crear una nueva).

## Toolbar (header)

```
[☰] FRC Gourmet      [☀ ⇄ 🌙] [🔔5] [👤 Mi Perfil ▾]
```

- **☰**: toggle sidenav.
- **☀/🌙**: theme toggle (mat-slide-toggle, persiste en localStorage).
- **🔔**: badge con `notificacionesNoLeidas` reales (refresh cada 5 min vía `repo.countNotificacionesNoLeidas()`). El "5" hardcoded en el template se sobreescribe.
- **Mi Perfil ▾**: dropdown con "Mi Perfil" (TODO) y "Cerrar Sesión" (logout).

## TODOs de menú

- `openCategoriasTab` — handler vacío (categorías productos).
- `openIngredientesTab` — handler vacío.
- `openMovimientosStockTab` — handler vacío.
- `openTipoPrecioTab` — handler vacío.
- Estos están comentados en `app.component.ts` con `// this.tabsService.addTab(...)`.
