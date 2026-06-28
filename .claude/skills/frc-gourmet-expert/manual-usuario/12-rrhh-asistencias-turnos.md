# Capítulo 12 — Asistencias, turnos, feriados, horas extra, penalizaciones

## 1. Turnos

**Menu → Recursos Humanos → Turnos → "Nuevo turno"**.

- **Nombre**: "MAÑANA", "TARDE", "NOCHE", "TURNO ROTATIVO", etc.
- **Hora entrada**: '08:00'.
- **Hora salida**: '16:00'.
- **Tolerancia tardanza** (minutos): default 5.

## 2. Asignar turnos a funcionarios

**Tab "Turnos" del funcionario** o **Menu → Recursos Humanos → Funcionarios → click → "Asignar turno"**.

- Turno.
- Fecha desde.
- Fecha hasta (opcional, dejar vacío = vigente).

Permite historial de cambios de turno. Si un funcionario rota turnos, asignás varios con sus respectivas vigencias.

## 3. Registrar asistencia

### Individual

**Menu → Recursos Humanos → Asistencias → "Nueva asistencia"** (TODO: dialog actual es masivo).

- Funcionario.
- Fecha.
- Hora entrada / salida.
- Estado: PRESENTE / AUSENTE / TARDANZA / MEDIA_FALTA / JUSTIFICADO / FERIADO / VACACION.
- Observación.

### Masiva

**Menu → Recursos Humanos → Asistencias → "Marcar asistencia masiva"**.

⚠️ **Layout actual roto**: columnas se desbordan. TODO rediseñar.

Permite marcar asistencia para varios funcionarios a la vez (un día específico).

## 4. Cómo se calcula la tardanza

Si el funcionario tiene turno asignado y se ingresa hora de entrada:

```
diff = diffMinutos(horaEntrada, turno.horaEntrada)
si diff > turno.toleranciaTardanzaMinutos:
   estado = TARDANZA
   minutosTardanza = diff
```

### Penalización automática

Si:
- estado = TARDANZA
- NOT justificada
- `config.PENALIZACION_AUTO_TARDANZA = true`

→ Sistema crea automáticamente una **Penalización**:

```
montoFijo = config.PENALIZACION_MONTO_TARDANZA
montoPorMinuto = config.PENALIZACION_MONTO_POR_MINUTO_TARDANZA
monto = montoFijo + (montoPorMinuto × minutosTardanza)
```

Ej: con `montoFijo=50000`, `montoPorMin=2000`, tardanza 15 min → 50000 + 2000*15 = 80.000 PYG.

Configurar montos en **Menu → Recursos Humanos → Config RRHH** (capítulo 2).

## 5. Justificar asistencia

Si el funcionario tuvo motivo válido (médico, emergencia):

Click en la asistencia → "Justificar":
- Motivo.
- Comprobante (opcional, archivo).

Sistema:
- Estado → JUSTIFICADO.
- Anula automáticamente la Penalización auto-generada asociada.

## 6. Feriados

**Menu → Recursos Humanos → Feriados**.

Crear feriados (legales o internos):
- Fecha (única).
- Descripción.
- Es nacional (✅).
- Recargo porcentaje (default 100% = doble pago).

Afecta cálculo de horas extra (recargo HE feriado configurable, default +100%).

## 7. Horas extra

**Menu → Recursos Humanos → Horas extra → "Nueva HE"**.

- Funcionario.
- Fecha.
- Horas (decimal, ej 2.5).
- Tipo:
  - **DIURNA**: recargo +50%.
  - **NOCTURNA**: recargo +100%.
  - **FERIADO**: recargo +100%.
- Recargo porcentaje (auto según tipo, podés sobreescribir).
- Monto calculado (TODO calcular automático — actualmente manual).
- Autorizado por.

⚠️ **`montoCalculado` no se calcula automáticamente al crear**. Debes ingresarlo o calcularlo aparte (recargo% × salario_diario_promedio × horas).

En liquidación de sueldo se incluye como item HABER tipo HORA_EXTRA.

## 8. Penalizaciones

### Manuales

**Menu → Recursos Humanos → Penalizaciones → "Nueva penalización"**.

- Funcionario.
- Tipo:
  - TARDANZA / AUSENCIA / QUEJA_CLIENTE / AMBIENTE_LABORAL / DANIO_MATERIAL / OTRO.
  - **COMISION_DESCUENTO**: resta de comisiones (no de sueldo).
- Monto.
- Fecha.
- Observación.

### Auto-generadas

Tardanzas (capítulo 12.4). Identificadas con chip naranja "AUTO" en la lista.

- **Botón "Editar"** oculto (mantener trazabilidad).
- Solo permite "Anular".

### Anular penalización

Click ⋮ → "Anular".

Estado `anulada=true`. NO se borra. NO suma en liquidación.

## 9. Configuración

**Menu → Recursos Humanos → Config RRHH**.

Valores relevantes para asistencias:
- `TOLERANCIA_TARDANZA_MIN` (5)
- `PENALIZACION_AUTO_TARDANZA` (true/false)
- `PENALIZACION_MONTO_TARDANZA` (monto fijo en PYG)
- `PENALIZACION_MONTO_POR_MINUTO_TARDANZA` (PYG/min)
- `RECARGO_HE_DIURNA` (50)
- `RECARGO_HE_NOCTURNA` (100)
- `RECARGO_HE_FERIADO` (100)

⚠️ **Cambios aplican al siguiente registro**. Las asistencias / HE existentes no se recalculan.

## 10. Errores comunes

### "Asistencia no se registra como TARDANZA"

- Verificá que el funcionario tenga turno asignado en esa fecha.
- Verificá que la hora de entrada se haya ingresado.
- Diff debe ser > tolerancia (default 5 min).

### "No se generó la penalización auto"

- `PENALIZACION_AUTO_TARDANZA` está en false?
- Asistencia ya está marcada como justificada?
- Montos en config son 0? → genera penalización con monto 0 (correcto si está pensado así).

### "Penalización auto duplicada al regenerar liquidación"

Idempotencia: al regenerar liquidación BORRADOR, los items auto se borran y se recrean. Las penalizaciones manuales (`manual=true`) se preservan.

### "Asistencias del funcionario salen mucho — performance lenta"

Hay índice (funcionario, fecha) en BD pero si tenés 5+ años, considerar archivar (TODO).

---

**Próximo capítulo →** [13 — Vales y préstamos](13-rrhh-vales-prestamos.md)
