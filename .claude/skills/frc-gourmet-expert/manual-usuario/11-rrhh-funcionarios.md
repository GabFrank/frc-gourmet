# Capítulo 11 — RRHH: funcionarios

## Pre-requisitos

- Persona creada (capítulo 3).
- Cargos definidos.
- ConfiguracionRrhh con valores PY (capítulo 2).

## 1. Cargos

**Menu → Recursos Humanos → Cargos**.

Crear cada puesto laboral:
- **Nombre** (UPPERCASE): "MOZO", "PARRILLERO", "BARMAN", "GERENTE", "CAJERO", "ENCARGADO COCINA".
- **Salario referencia** (opcional): sueldo de referencia para ese cargo.

⚠️ **Cargo ≠ Rol del sistema**. Cargo es laboral. Rol es de permisos (capítulo 3).

## 2. Crear funcionario

**Menu → Recursos Humanos → Funcionarios → "Nuevo funcionario"**.

Campos:
- **Persona**: seleccionar (debe existir).
- **Cargo** actual.
- **Usuario** (opcional): vincular con Usuario del sistema. Necesario si el funcionario debe loguearse.
- **Salario base**.
- **Moneda salario**.
- **Es jornalero** (✅): paga por día trabajado.
- **Valor jornal** (si jornalero).
- **IPS activo** (✅): aporta al IPS Paraguay.
- **Número IPS** (si activo).
- **Cuenta bancaria propia** (campo libre, TODO: enum).
- **Fecha ingreso**.
- **Código interno** (opcional, único).

Click "Guardar".

### Lo que pasa al crear

Transacción atómica:
1. Se crea Funcionario.
2. Se crea **HistoricoCargo** (fechaDesde=fechaIngreso, motivo="INGRESO").
3. Se crea **HistoricoSalario** (salarioNuevo=salarioBase, fechaVigencia=fechaIngreso, motivo="INGRESO").

Cualquier cambio futuro de cargo o salario genera nuevos registros históricos.

## 3. Detalle del funcionario

Click en funcionario → vista de detalle con tabs:

### Tab Datos
Editar datos personales y laborales.

### Tab Históricos
- Histórico de cargos: cuándo fue ascendido / cambió de puesto.
- Histórico de salarios: cuándo cambió el sueldo.

### Tab Documentos
Subir y gestionar documentos del funcionario:
- **Tipo**: CEDULA / CONTRATO / CERTIFICADO / CV / ANTECEDENTES / CARNET_SALUD / TITULO_ACADEMICO / OTRO.
- **Vencimiento** (opcional): para alertas (carnet de salud vence anualmente, etc.).
- **Archivo**: PDF, JPG, PNG. Se guarda en `userData/funcionario-documentos/<id>/`.

⚠️ **Backup**: la BD `.db` no incluye los archivos. Backup completo debe abarcar también esa carpeta.

### Tab Asistencia
Histórico de asistencias del funcionario.

### Tab Vales
Vales solicitados, confirmados, descontados, anulados.

### Tab Préstamos
CPP tipo PRESTAMO_FUNCIONARIO de este empleado.

### Tab Vacaciones
Acumulado por año de servicio + períodos programados/gozados.

### Tab Liquidaciones
Liquidaciones de sueldo y final.

## 4. Cambiar cargo

Tab Históricos → "Cambiar cargo":
- Nuevo cargo.
- Fecha desde.
- Motivo.

Sistema:
- Cierra el HistoricoCargo anterior con fechaHasta.
- Crea uno nuevo con el nuevo cargo.
- Actualiza `funcionario.cargo` actual.

## 5. Cambiar salario

Tab Históricos → "Cambiar salario":
- Nuevo salario.
- Fecha vigencia.
- Motivo (AUMENTO_ANUAL, MERITO, AJUSTE_LEY, etc.).
- Autorizado por.

Sistema:
- Cierra HistoricoSalario anterior.
- Crea nuevo.
- Actualiza `funcionario.salarioBase`.

## 6. Egreso del funcionario

Cuando el empleado se va:

**Tab Datos → "Egresar funcionario"**:
- Fecha egreso.
- Motivo: RENUNCIA / DESPIDO_JUSTIFICADO / DESPIDO_INJUSTIFICADO / MUTUO_ACUERDO / JUBILACION / FALLECIMIENTO / OTRO.

Sistema:
- Marca `Funcionario.activo = false`.
- Asigna `fechaEgreso` y `motivoEgreso`.

Después podés generar la **Liquidación final** (capítulo 15).

## 7. Lista de funcionarios

**Menu → Recursos Humanos → Funcionarios**.

Filtros:
- Activo (default ✅).
- Cargo.
- Búsqueda por nombre.

Acciones (⋮):
- Ver / Editar.
- Egresar.

## 8. Errores comunes

### "Persona ya está vinculada a otro funcionario"

Una Persona puede ser un solo Funcionario. Si querés re-contratar a alguien que egresó:
- Usá la misma Persona, edita el funcionario egresado para reactivarlo.
- O creá un funcionario nuevo y reactivá la persona.

### "No puedo subir documento — archivo muy grande"

Límite ~10 MB por archivo (configurable en handler). Comprime PDF si pesa más.

### "El funcionario no aparece en el buscador de PdV (vendedor)"

Para que aparezca como vendedor en comisiones / PdV, debe tener `usuario_id` vinculado.

### "Cambié el salario, no se actualizó la liquidación"

La liquidación se calcula al **generarla** (no en cascada). Generá una liquidación nueva o regenerá el borrador.

---

**Próximo capítulo →** [12 — Asistencias y turnos](12-rrhh-asistencias-turnos.md)
