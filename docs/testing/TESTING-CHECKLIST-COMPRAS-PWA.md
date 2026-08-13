# Testing Checklist — Compras (PWA mobile)

Manual de pruebas manuales para la paridad del módulo de **Compras** en el cliente mobile
(`projects/mobile`), consumido por HTTP contra un nodo en modo `server`.

**Precondiciones**
- Un nodo desktop corriendo en modo `server` con datos: al menos 1 caja mayor ABIERTA,
  monedas (una principal), una forma de pago EFECTIVO (`movimentaCaja`), y opcionalmente
  cuentas bancarias y cotizaciones (`MonedaCambio`) para probar multi-moneda.
- Usuario con permisos `COMPRAS_VER`, `COMPRAS_GESTIONAR`, `PROVEEDORES_VER`,
  `PROVEEDORES_GESTIONAR`, `COMPRAS_DASHBOARD_VER`.
- Probar en **dark y light theme**.

---

## Fase 1 — Lista de compras

- [ ] Menú Compras → Compras: la lista carga como cards (proveedor, nota, fecha, total).
- [ ] Chips de estado: Borrador (celeste) / Finalizada (verde) / Anulada (rojo).
- [ ] Chip de estado de pago: Pagado (verde) / Parcial (amarillo) / Pendiente (naranja) + "Cuotas x/y".
- [ ] Filtro por búsqueda (nota/proveedor) con botón **Filtrar** (no filtra en vivo).
- [ ] Filtro por proveedor, estado y condición (Todas/Contado/Crédito) + rango de fechas.
- [ ] Botón **Limpiar** resetea filtros y recarga.
- [ ] **Cargar más** agrega la página siguiente; desaparece al llegar al final.
- [ ] Con error de red, "Cargar más" muestra snackbar y no rompe la lista.
- [ ] FAB "+" visible solo con `COMPRAS_GESTIONAR`; abre "Nueva compra".
- [ ] Tap en una card abre el detalle.

## Fase 2 — Detalle de compra + Finalizar + Anular

- [ ] Detalle muestra cabecera (proveedor, total, estado, nota, fecha, condición, categoría).
- [ ] Ítems: lista con producto/presentación/cantidad × costo = subtotal; si es simplificada,
      muestra "Compra simplificada (sin detalle de ítems)".
- [ ] Cuotas del CPP con estado y "Ir a Cuenta por Pagar".
- [ ] Compra **ANULADA**: no muestra la sección de cuotas ni el enlace a CxP.
- [ ] Menú de acciones (⋮) solo con `COMPRAS_GESTIONAR`.
- [ ] **Finalizar** visible solo si estado ABIERTO:
  - [ ] Compra contado: opción "Pagar al finalizar" → al confirmar navega a CxP a cobrar la cuota.
  - [ ] Compra crédito: pide cantidad de cuotas + fecha primera cuota.
  - [ ] Tras finalizar, el estado pasa a Finalizada y se genera el CPP.
- [ ] **Anular** visible si no está CANCELADA: pide motivo → estado pasa a Anulada.
- [ ] Anular una compra finalizada con cuotas pagadas → el backend rechaza con mensaje claro.

## Fase 3 — Alta de compra simplificada

- [ ] FAB de la lista → formulario full-screen.
- [ ] Proveedor por autocomplete (solo activos); moneda (principal preseleccionada); total > 0.
- [ ] Categoría, N° nota, tipo de boleta y fecha opcionales; nota se guarda en MAYÚSCULAS.
- [ ] Toggle **A crédito** → pide cuotas + fecha primera cuota.
- [ ] Toggle **Pagar al finalizar** (solo contado) → fuente Caja Mayor (efectivo) o Banco.
  - [ ] Caja Mayor: exige caja; bloquea si no hay forma EFECTIVO configurada.
  - [ ] Banco: solo se listan cuentas de la **misma moneda** de la compra.
- [ ] Guardar → crea la compra FINALIZADA y navega a su detalle.
- [ ] Si fallan los catálogos (red), muestra error persistente con botón **Reintentar**.

## Fase 4 — CRUD de proveedores

- [ ] Lista de proveedores con buscador (nombre/RUC).
- [ ] FAB "+" y menú por card (Editar/Eliminar) solo con `PROVEEDORES_GESTIONAR`.
- [ ] Alta: nombre requerido; razón social, RUC, teléfono, dirección opcionales; activo.
- [ ] Los textos se guardan en MAYÚSCULAS (verificar en BD/desktop).
- [ ] Edición carga los datos y guarda cambios.
- [ ] Eliminar con confirmación; si el proveedor tiene compras, muestra el mensaje del backend
      (sugiere desactivarlo).

## Fase 5 — Pago mixto de cuota + anulación

- [ ] En CxP → detalle de una CxP de **compra**, el menú de la cuota ofrece Pagar / Pago mixto.
- [ ] Pago mixto: N líneas (moneda + forma + monto); cada línea muestra el convertido a la
      moneda de la deuda; total y restante correctos.
- [ ] Línea en otra moneda sin cotización → marca "sin cotización" y bloquea el pago.
- [ ] No permite pagar más que el saldo.
- [ ] Pago mixto correcto → cuota pasa a Parcial/Pagada; saldo actualizado.
- [ ] "Anular pago mixto" aparece en cuotas con pago mixto; pide motivo (opcional) y revierte
      los movimientos de caja mayor.
- [ ] Pago mixto solo se ofrece en CxP de tipo COMPRA (no en préstamos).

## Fase 6 — Dashboard de compras

- [ ] Menú Compras → Dashboard de compras (solo con `COMPRAS_DASHBOARD_VER`).
- [ ] KPIs: compras del mes (cantidad + total), cuotas por vencer (7d), total vencido.
- [ ] Top proveedores con barras de porcentaje.
- [ ] Próximos vencimientos con urgencia (Vencida / Vence hoy / En Nd) y color.
- [ ] Compras por mes en mini-barras.
- [ ] Con error de red, muestra mensaje de error.

## Regresión / permisos

- [ ] Un usuario sin `COMPRAS_GESTIONAR` ve la lista/detalle pero no el FAB ni las acciones.
- [ ] Un usuario sin `PROVEEDORES_GESTIONAR` ve proveedores en solo lectura.
- [ ] Rutas full-screen (nueva compra, detalle, proveedor) funcionan por deep-link.
- [ ] Dark y light theme: chips, barras y estados legibles en ambos.

---

## Diferido (documentado, NO parte de esta iteración)

- **Compra compleja multi-ítem** (editor con panel productos-proveedor e histórico): en mobile el
  alta primaria es la compra simplificada. Ver `domains/compras-cpp.md`.
- **Importación de facturas OCR + IA**: se mantiene en desktop; el celular alimenta fotos vía la
  subida por QR existente.
