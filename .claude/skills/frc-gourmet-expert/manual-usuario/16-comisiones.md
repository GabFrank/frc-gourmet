# Capítulo 16 — Comisiones

Sistema de incentivos para vendedores. Reglas configurables que se evalúan contra ventas reales para calcular comisiones a pagar.

## Pre-requisitos

- Funcionarios con `usuario_id` vinculado (sin esto, el motor no encuentra sus ventas).
- Productos creados (las reglas suelen aplicar a productos específicos).
- Ventas con `vendedor_id` set (default: `created_by` al crear venta).

## 1. Tipos de regla

| Tipo | Cómo se calcula |
|---|---|
| **META_UNIDADES** | Si vende ≥ N unidades de productos X → monto fijo |
| **PORCENTAJE_VENTA** | % sobre el total de productos X vendidos |
| **META_VENTA_LOCAL** | Si total monto vendido ≥ X → monto fijo |
| **EXTRA_MANUAL** | Monto fijo (bono manual mensual) |
| **PENALIZACION_MANUAL** | Resta monto fijo |
| **EQUIPO_PORCENTAJE** | Para equipos: distribuye entre miembros según porcentajeReparto |

## 2. Crear regla

**Menu → Comisiones → Reglas → "Nueva regla"**.

- **Nombre**: "Comisión Pizza Calabresa", "Bonus mensual mozos", etc.
- **Descripción**.
- **Tipo** (uno de los 6).
- **Monto base** (META_*, EXTRA_MANUAL): ej 150.000 PYG.
- **Porcentaje** (PORCENTAJE_VENTA): ej 5.
- **Meta unidades** (META_UNIDADES): ej 50.
- **Meta monto local** (META_VENTA_LOCAL): ej 1.000.000 PYG.
- **Modo validación**:
  - **TODO_O_NADA**: cumple meta o cero.
  - **PROPORCIONAL**: reduce proporcional al cumplimiento.
- **Recurrencia**: UNICA / DEFINIDA / INDEFINIDA.
- **Fecha inicio / fin**.
- **Es equipo** (✅): si aplica a un EquipoComision.

### Productos efectivos

Click "Productos" en la regla:
- Agregar productos a los que aplica (lista N productos).
- Si está vacío: aplica a TODOS los productos.

### Requisitos

Click "Requisitos" en la regla:

Tipos de requisito:
- **TARDANZA_MAX**: tardanzas totales ≤ X minutos en el período.
- **QUEJA_MAX**: penalizaciones tipo QUEJA_CLIENTE ≤ X.
- **ASISTENCIA_MIN**: días asistidos ≥ X.
- **CUSTOM**: lógica personalizada (TODO).

Por requisito:
- Tipo.
- Umbral.
- Peso (default 1).
- Descripción.

Ej: "TARDANZA_MAX = 30 min" → si el funcionario acumuló más de 30 min de tardanzas en el período, la regla NO se cumple.

## 3. Asignar regla a funcionario

**Menu → Comisiones → Reglas → click regla → "Asignar a funcionario"**.

- Funcionario.
- Fecha desde.
- Fecha hasta (opcional).
- Activo.

Múltiples funcionarios pueden tener la misma regla.

## 4. Equipos de comisión

Si la comisión se reparte entre varios:

**Menu → Comisiones → Equipos → "Nuevo equipo"**.

- Nombre: "Vendedores Zona Centro", "Mozos turno noche".
- Descripción.

### Agregar miembros

Click "Miembros":
- Funcionario.
- Porcentaje reparto: ej 50% (la suma debe ser 100%).

### Asignar reglas al equipo

Click "Reglas":
- Regla.
- Fecha desde / hasta.

Cuando se evalúa, el monto se distribuye entre miembros según `porcentajeReparto`.

## 5. Motor de evaluación

`evaluarReglaParaFuncionario(reglaId, funcionarioId, periodo)`:

```
1. Query VentaItem JOIN Venta:
   - venta.estado = CONCLUIDA
   - ventaItem.estado != CANCELADO
   - producto_id IN reglaProductos (si vacío: todos)
   - COALESCE(ventaItem.vendedor_id, venta.vendedor_id) = funcionario.usuario_id
   - fecha IN [fechaInicio, fechaFin del período]

2. Métricas:
   - totalUnidades = SUM(quantity)
   - totalMontoProductos = SUM(monto)
   - totalMontoVentaLocal = SUM(montoEnMonedaLocal)

3. Evaluar requisitos:
   FOR EACH requisito:
     IF tipo == TARDANZA_MAX:
       totalTardanzas = SUM(minutosTardanza) Asistencia TARDANZA del período
       cumple = totalTardanzas <= umbral
     IF tipo == ASISTENCIA_MIN:
       diasPresentes = COUNT (PRESENTE | TARDANZA)
       cumple = diasPresentes >= umbral
     IF tipo == QUEJA_MAX:
       quejas = COUNT Penalizacion (QUEJA_CLIENTE)
       cumple = quejas <= umbral

   IF NOT cumple:
     IF modoValidacion == TODO_O_NADA: return monto = 0
     ELSE IF modoValidacion == PROPORCIONAL: aplicar descuento

4. Calcular monto según tipo:
   META_UNIDADES:        monto = totalUnidades >= metaUnidades ? montoBase : 0
   PORCENTAJE_VENTA:     monto = totalMontoProductos × (porcentaje / 100)
   META_VENTA_LOCAL:     monto = totalMontoLocal >= metaMontoLocal ? montoBase : 0
   EXTRA_MANUAL:         monto = montoBase
   PENALIZACION_MANUAL:  monto = -montoBase

5. Restar penalizaciones COMISION_DESCUENTO del período

6. Si EQUIPO_PORCENTAJE: distribuir entre miembros

7. Snapshot parámetros en LiquidacionComisionItem.observacion
```

## 6. Generar liquidación de comisión

**Menu → Comisiones → Liquidaciones → "Nueva liquidación"**.

- Funcionario.
- Período (YYYY-MM).

Sistema:
1. Si existe BORRADOR: borra items y regenera.
2. Por cada `FuncionarioReglaComision` activa del funcionario en el período:
   - Evalúa.
   - Crea `LiquidacionComisionItem` con monto + snapshot de parámetros.
3. Por cada `EquipoComisionMiembro` del funcionario activa:
   - Por cada regla del equipo: evalúa, distribuye.
4. `totalCalculado = SUM items`.

Estado: **BORRADOR**.

## 7. Estados liquidación de comisión

```
BORRADOR (auto-generada al evaluar)
   ↓ aprobar
APROBADA
   ↓ se incluye en liquidación de sueldo PAGADA
INTEGRADA
   ↓ anular liq sueldo
ANULADA (revierte)
```

## 8. Aprobar

Click "Aprobar". Requiere permiso `COMISION_LIQUIDACION_APROBAR`.

Estado → APROBADA. Pasa a estar disponible para incluir en próxima liquidación de sueldo.

## 9. Integrar en liquidación de sueldo

Al generar liquidación de sueldo borrador del funcionario, si tiene LiquidacionComision APROBADA del período → se agrega como item HABER tipo COMISION (referenciaTipo=LIQUIDACION_COMISION).

Al pagar la liquidación de sueldo: comisión → INTEGRADA.

## 10. Anular liquidación de comisión

Click ⋮ → "Anular".

- Si era APROBADA pero NO INTEGRADA: estado → ANULADA. Sin efectos.
- Si era INTEGRADA: necesitás anular **primero la liquidación de sueldo** (cap 14), que automáticamente revertirá la comisión a APROBADA.

## 11. Snapshot de parámetros

`LiquidacionComisionItem.observacion` guarda los parámetros aplicados al momento de evaluación:

```
"Regla META_UNIDADES — meta 50u, vendido 60u — monto base 150.000 PYG"
```

Si la regla cambia después, la liquidación previa preserva la lógica original.

## 12. Errores comunes

### "Vendedor no aparece como dueño de las ventas"

- Verificá que el funcionario tenga `usuario_id` set.
- Verificá que las ventas tengan `vendedor_id` set (no solo `created_by`).
- En migración 1-vez, ventas viejas se asignaron `vendedor_id = created_by`. Para nuevas: el PdV asigna el usuario del cajero por default. Si querés diferenciarlo (mozo vs cajero), editar la venta manualmente.

### "Comisión calculó 0 aunque vendió mucho"

- Algún requisito no se cumplió. Ver el `observacion` del item para detalle.
- Si `modoValidacion=TODO_O_NADA` y un requisito falla: 0.

### "Equipo no distribuyó proporcionalmente"

- Verificá que la suma de `porcentajeReparto` de los miembros sea 100%.
- Verificá que el funcionario sea miembro del equipo.

### "Cambié la regla pero la liquidación previa sigue con el monto viejo"

✅ Correcto. Snapshot en `observacion` preserva la lógica al momento de evaluación. Si querés re-calcular con la nueva regla, regenerá la liquidación BORRADOR (perderás los manuales).

## 13. Verificación end-to-end (ejemplo)

Setup:
- Funcionario A, MOZO, salario 2.500.000.
- Cargo, turno asignado.
- Caja mayor PYG EFECTIVO abierta.
- Producto "Pizza Parrilla" creado.
- Regla "Comisión Pizza" → META_UNIDADES, productos=[Parrilla], meta=50, monto=150.000.
- FuncionarioReglaComision: A activa este mes.

Operación:
- 60 ventas vendedor=A producto Parrilla durante el mes.

Generar liquidación:
- Comisión: 60 ≥ 50 → 150.000 PYG.
- Aprobar.

Generar liquidación de sueldo:
- Items: SALARIO 2.500.000 + COMISION 150.000 - IPS 225.000 = 2.425.000 neto.

Pagar liquidación de sueldo:
- EGRESO_SALARIO 2.425.000.
- Comisión → INTEGRADA.

---

**Próximo capítulo →** [17 — Reportes y dashboards](17-reportes-y-dashboards.md)
