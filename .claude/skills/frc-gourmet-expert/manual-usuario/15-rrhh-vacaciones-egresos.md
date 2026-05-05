# Capítulo 15 — Vacaciones y liquidación final (egreso)

## 1. Vacaciones — modelo

Por cada **año de servicio**, el funcionario acumula días según antigüedad:

| Antigüedad | Días vacación |
|---|---|
| < 5 años | 12 |
| 5 - 10 años | 18 |
| > 10 años | 30 |

Configurables en **Config RRHH** (`DIAS_VACACIONES_HASTA_5A`, etc.).

### Auto-generación

Al cumplir cada aniversario (fecha de ingreso + 1 año, +2 años, ...), el sistema crea automáticamente un registro `Vacacion` con:
- `anioServicio` (1, 2, 3, ...).
- `diasGenerados` (12 / 18 / 30 según antigüedad).
- `fechaCorte` (la fecha del aniversario).
- `prescrita = false`.

⚠️ **Trigger automático no implementado**. Por ahora se generan manualmente o vía botón "Generar vacaciones del año".

## 2. Programar vacaciones

Cuando el funcionario va a tomar días:

**Menu → Recursos Humanos → Vacaciones → click funcionario → "Programar período"**.

- **Fecha desde**.
- **Fecha hasta**.
- **Días usados** (auto-calculado, descontando feriados).
- **Vacación específica** (cuál usa, ej Vacacion del año 3).
- **Autorizado por**.
- **Observación**.

Validación: `Vacacion.diasGozados + diasNuevos ≤ Vacacion.diasGenerados`. No podés gozar más días de los acumulados.

Estado: **PROGRAMADA**.

## 3. Estados de un período

```
PROGRAMADA  ─→ EN_CURSO  ─→ GOZADA
                              ↑
                           o CANCELADA
```

### EN_CURSO

Cuando llega la fecha desde y el funcionario empieza a tomar.

### GOZADA

Marcar manualmente cuando termina:
- Click "Marcar como GOZADA".
- Sistema:
  - Si `asistenciasGeneradas=false`: crea `Asistencia` estado=VACACION para cada día del rango (que no tenga asistencia previa).
  - `Vacacion.diasGozados += diasUsados`.
  - `asistenciasGeneradas = true` (idempotencia).

### CANCELADA

Si se canceló antes de tomar.

## 4. Prescripción

Tras 24 meses (configurable: `PRESCRIPCION_VACACIONES_MESES`) de la `fechaCorte`, las vacaciones no gozadas **prescriben** (`prescrita=true`). No se pagan en liquidación final.

Sistema marca esto automáticamente (TODO trigger).

## 5. Liquidación final (egreso)

Al egresar un funcionario (capítulo 11), generás su liquidación final:

**Menu → Recursos Humanos → Liquidaciones final → "Nueva liquidación"**.

- **Funcionario** (debe estar egresado).
- **Fecha egreso** (la del egreso).
- **Motivo egreso**: RENUNCIA / DESPIDO_JUSTIFICADO / DESPIDO_INJUSTIFICADO / MUTUO_ACUERDO / JUBILACION / FALLECIMIENTO / OTRO.

### Cálculos automáticos

```
1. Antigüedad:
   antiguedadDias = diff(fechaIngreso, fechaEgreso)
   antiguedadMeses = ÷ 30
   antiguedadAnios = ÷ 365

2. Salario promedio:
   = avg(totalHaberes) últimas 6 LiquidacionSueldo APROBADA/PAGADA

3. Indemnización:
   IF motivoEgreso == DESPIDO_INJUSTIFICADO AND antiguedadDias >= 90:
     valorDia = salarioPromedio / 30
     indemnizacion = valorDia × INDEMNIZACION_DIAS_POR_ANIO × max(1, anios)
     indemnizacionAplica = true
   ELSE:
     indemnizacion = 0
     indemnizacionAplica = false

4. Vacaciones no gozadas:
   diasNoGozados = SUM(Vacacion.diasGenerados - diasGozados)
                   de todas Vacacion no prescritas
   montoVacaciones = diasNoGozados × (salarioPromedio / 30)

5. Aguinaldo proporcional:
   totalGanadoAnioActual = SUM totalHaberes de liquidaciones APROBADA/PAGADA del año en curso
   aguinaldoProporcional = totalGanadoAnioActual / 12

6. Total:
   totalLiquidado = indemnizacion + montoVacaciones + aguinaldoProporcional
```

### Items generados

- INDEMNIZACION (si aplica).
- VACACIONES_NO_GOZADAS (si > 0).
- AGUINALDO_PROPORCIONAL (si > 0).

## 6. Estados liquidación final

```
BORRADOR  ─→ APROBADA  ─→ PAGADA  →  (ANULADA)
```

### Aprobar

Click "Aprobar". Requiere permiso.

### Pagar

Click "Pagar". Análogo a liquidación de sueldo:
- Genera `EGRESO_SALARIO` con observación "LIQUIDACION FINAL".
- Saldo Caja Mayor disminuye en `totalLiquidado`.
- Estado → PAGADA.

### Anular

Genera contra-movimiento. Estado → ANULADA.

## 7. Caso: re-contratación

Si un ex funcionario vuelve:

Opción A (mismo registro):
- Editar funcionario, poner `fechaEgreso = null`, `activo = true`.
- Crear nuevo HistoricoCargo con motivo "REINGRESO".

Opción B (registro nuevo):
- La Persona se reusa.
- Crear un Funcionario nuevo (mismo persona_id).
- El histórico anterior queda accesible mediante búsqueda con incluir inactivos.

## 8. Errores comunes

### "Indemnización no aparece en liquidación final"

- Solo aplica si `motivoEgreso == DESPIDO_INJUSTIFICADO`.
- Antigüedad mínima 90 días (configurable: `INDEMNIZACION_ANTIGUEDAD_MIN_DIAS`).

### "Vacaciones acumuladas se prescribieron sin avisarme"

- TODO: notificación auto-generada para vacaciones próximas a prescribir.
- Workaround: revisar manualmente periódicamente.

### "Salario promedio no coincide con mi cálculo"

- Sistema usa SOLO liquidaciones APROBADA/PAGADA. BORRADOR no cuenta.
- Toma últimas 6 liquidaciones disponibles (no necesariamente últimos 6 meses calendario).

### "Funcionario sigue apareciendo activo después de pagar liquidación final"

- Verificar que `Funcionario.activo = false` se haya actualizado al egresarlo (capítulo 11).
- Si no: editar manualmente.

---

**Próximo capítulo →** [16 — Comisiones](16-comisiones.md)
