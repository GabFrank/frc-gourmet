# Checklist manual — monto de venta de comisiones y Top 5 Vendedores

Cubre el fix de la issue #239 (2026-08-17). `Venta.total` no se escribe nunca, así
que todo lo que la leía obtenía 0: la regla `META_VENTA_LOCAL` **no pagaba nunca**
y el widget "Top 5 Vendedores" del dashboard RRHH mostraba 0 para todos.

> **Requiere reiniciar la app** (cambios de backend).

**Preparación:**

- Un funcionario con `usuario` vinculado (sin eso la evaluación de comisiones
  lanza error a propósito).
- Una regla de comisión tipo **META_VENTA_LOCAL** asignada a ese funcionario, con
  una meta que sepas que las ventas del período superan (ej. meta 300.000 si el
  período tiene ~500.000 vendidos).
- Algunas ventas CONCLUIDAS del período con ese vendedor.

---

## 1. La comisión por meta vuelve a pagar

- [ ] *Comisiones → Liquidaciones* → generá la liquidación del período.
- [ ] La regla `META_VENTA_LOCAL` **paga** su monto base. *(Antes daba 0 siempre,
      sin error ni aviso.)*
- [ ] En el snapshot/observación de la comisión, el monto de venta del local es
      un número real y coherente con las ventas del período.
- [ ] Subí la meta por encima de lo vendido y regenerá: ahora **no paga**. Es el
      control de que la comparación realmente se está haciendo.

## 2. El monto se mide como corresponde

- [ ] Cargá una venta con un ítem de **cantidad 2 y un adicional** (ej. 2
      hamburguesas con extra queso de 10.000). El monto del período sube
      **20.000** por ese extra, no 10.000. *(El adicional es por unidad; antes se
      contaba una sola vez.)*
- [ ] Cancelá un ítem de una venta del período: ese ítem **no** suma al monto.
- [ ] Hacé una venta con **descuento global** en el cobro: el monto del período
      sube por el neto, no por el bruto.
- [ ] Si usás varias monedas, hacé un descuento **en dólares**: se convierte a
      guaraníes con la cotización vigente.

## 3. Top 5 Vendedores (dashboard RRHH)

- [ ] *RRHH → Dashboard*: el widget muestra montos **reales**, no 0.
- [ ] El orden del ranking se corresponde con esos montos.
- [ ] La cantidad de ventas por vendedor es la esperada.
- [ ] ⚠️ **Una venta del día 1 del mes cuenta en ese mes.** *(Era el otro bug: el
      filtro de fechas se comía el día 1 entero en SQLite.)*
- [ ] Una venta del día 1 del mes **siguiente** NO aparece en el mes actual.

## 4. Cotizaciones cargadas "al revés" (no regresión)

- [ ] En *Financiero → Monedas*, mirá cómo está cargado el par de cambio (desde
      qué moneda lo diste de alta).
- [ ] En *RRHH → Funcionario → resumen financiero*, los montos en otra moneda se
      muestran convertidos y **no** aparece el aviso de "sin cotización".
      *(Antes, si la fila estaba cargada en la dirección contraria, el sistema
      decía que no había cotización aunque estuviera cargada.)*
- [ ] El total de nómina del dashboard RRHH tampoco reporta "sin cotización".

---

## Cobertura automática

`npm run test:comision-meta-venta` (17 asserts): fórmula de la línea con el
adicional por unidad, ítem cancelado que no suma, descuento y aumento globales,
conversión multimoneda **en las dos direcciones** del par, total que no queda
negativo, la meta pagando y no pagando, y el Top 5 del handler real con una venta
el día 1, otra a mitad de mes y otra del mes siguiente.

Lo que queda para este checklist es la parte que pasa por la UI: generar la
liquidación y mirar el dashboard.

> **Pendiente relacionado:** los reportes y dashboards de **Ventas** tienen
> todavía el mismo bug del filtro de fechas (pierden el día 1 del período en
> SQLite) — issue
> [#249](https://github.com/GabFrank/frc-gourmet/issues/249). Al arreglarlo, esos
> totales van a cambiar respecto de lo que se venía viendo.
