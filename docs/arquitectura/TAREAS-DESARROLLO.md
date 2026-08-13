# TAREAS DE DESARROLLO — FRC Gourmet

> **Revisado: 2026-06-28.** El tracker original (2026-03-15) quedó obsoleto: describía un sistema con
> ~69 entidades, `synchronize: true` y módulos sin UI que hoy ya existen. Esta versión refleja el estado
> verificado contra el código de `develop`. Para el detalle vivo del PdV ver
> [`../guia-funcionamiento-punto-de-venta.md`](../guia-funcionamiento-punto-de-venta.md); para la
> radiografía general, [`RADIOGRAFIA-SISTEMA.md`](./RADIOGRAFIA-SISTEMA.md).

---

## Estado general

El sistema creció muy por encima del alcance del tracker original. Hoy hay **157 archivos `.entity.ts`**,
**54 handlers IPC**, driver dual SQLite/PostgreSQL con migraciones (sin `synchronize`), modos
standalone/server/client y una PWA mobile. Las "acciones inmediatas" y la mayoría de las fases del
tracker viejo **ya están resueltas**.

## Ya implementado (verificado)

- **Migraciones / esquema:** `synchronize: false`, migraciones driver-aware que corren al arranque.
- **Cliente/servidor + PWA mobile:** ver [`../plan-cliente-servidor.md`](../plan-cliente-servidor.md) y
  [`mobile-pwa-plan.md`](./mobile-pwa-plan.md).
- **Entidad legacy `RecetaAdicional`:** eliminada (reemplazada por `RecetaAdicionalVinculacion`).
- **Compras:** UI reconstruida — `list-compras` + `create-edit-compra` + categorías; importación de
  facturas con OCR/IA (`factura-import.handler.ts`).
- **Combos:** UI en `gestionar-producto/components/producto-combo`.
- **Stock:** UI en `gestionar-producto/components/producto-stock`; descuento automático de stock al
  concluir ventas (`procesarStockVenta`) y reversión al cancelar.
- **Producción (buffet):** `produccion-buffet-dialog` (reutiliza `Produccion`/`ProduccionIngrediente`).
- **Buffet por peso + precios programados:** ver [`../buffet-por-kilo.md`](../buffet-por-kilo.md).
- **Impresión térmica:** tickets de venta (auto al concluir), comanda, pre-cuenta, recibos, etc., con
  ruteo por sector y KDS en tiempo real (SSE). Ver `documentos-tickets.handler.ts`.
- **RRHH / comisiones:** suite completa (funcionarios, asistencias, vales, liquidaciones, comisiones,
  vacaciones, aguinaldos, etc.).
- **Delivery / Comandas:** implementados en el PdV.

## Pendiente / parcial (verificado a 2026-06-28)

- **Promociones:** entidades `Promocion` / `PromocionPresentacion` existen, sin UI dedicada.
- **TipoPrecio:** entidad y handlers existen, sin pantalla de ABM dedicada.
- **Reservas de mesa:** entidad `Reserva` existe, falta UI de gestión/calendario.
- **Ensamblado de pizza:** entidades `EnsambladoPizza`/`EnsambladoPizzaSabor` existen, sin UI.
- **Pre-cuenta avanzada / categorías PdV (menú rápido):** parcial — ver la guía del PdV.
- **Seguridad:** endurecer el JWT secret hardcodeado antes de exponer por WAN.
- **TLS del mesh** para la PWA por WAN (acción de infraestructura del usuario).

> Esta lista no es exhaustiva: para el detalle funcional módulo por módulo, la fuente de verdad es la
> guía del PdV y la radiografía del sistema enlazadas arriba.
