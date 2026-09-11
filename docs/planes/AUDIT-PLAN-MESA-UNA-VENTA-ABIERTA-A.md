# AUDITORÍA PLAN: Mesa Una Venta Abierta — Eje A (Alcance y Convenciones)

**Fecha auditoría**: 2026-09-11  
**Plan auditado**: `PLAN-MESA-UNA-VENTA-ABIERTA.md`  
**Rama**: `cursor/fix-mesa-una-venta-abierta-4619`  
**Auditor**: Claude Sonnet 4.5

---

## Veredicto: **PASS-with-fixes**

El plan es técnicamente sólido y aborda el problema raíz correctamente. Los guards propuestos cubren el invariante sin romper comandas. Sin embargo, hay **3 hallazgos P0** y **2 P1** que deben corregirse antes de implementar.

---

## Hallazgos

### P0-1: Cancelación de Venta con Hermanas NO está gateada

**Ubicación en plan**: Fase 2, líneas 200-210

**Problema**:  
El plan propone gatear `cerrarVentasAbiertasMesa` **solo cuando `estado === CONCLUIDA`** (línea 201):

```typescript
if (ventasAbiertas.length > 1 && estado === VentaEstado.CONCLUIDA) {
  throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
}
```

**Pero** este handler también se usa para **CANCELAR** mesas (línea 212: "Aplica sólo a CONCLUIDA (cobro); cancelar mesa es válido con múltiples").

**¿Por qué es un problema?**  
Si el cajero **cancela** una venta en una mesa con múltiples cuentas, **las hermanas también se cancelan sin aviso**. Es una pérdida silenciosa igual de grave que el cobro sin pago.

**Caso real posible**:
- Mesa 5: Venta A (250k) + Venta B (180k), ambas ABIERTAS
- Cajero cancela A por error del mozo
- Sistema cancela A **y también B** sin avisar
- Pérdida: 180k no cobrados

**Fix requerido**:  
Gatear **SIEMPRE** que haya múltiples, no solo en CONCLUIDA:

```typescript
if (ventasAbiertas.length > 1) {
  throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
}
```

**Justificación del plan** (línea 212) es incorrecta:  
> "Cancelar mesa es válido con múltiples"

No lo es. Si hay múltiples cuentas, cada una debe cancelarse **explícitamente**, no en batch.

**Impacto si no se corrige**: Bug simétrico al del cobro → pérdida silenciosa por otro camino.

---

### P0-2: Guard en `updateVenta` está DESPUÉS del merge

**Ubicación en plan**: Fase 3, líneas 220-242

**Problema**:  
El plan no especifica **dónde** insertar el guard en el flujo de `updateVenta`. Mirando el handler real (líneas 1264-1600), el flujo es:

1. `repo.findOneBy({ id })` (línea 1268)
2. Extraer flags especiales (`__imprimirTicketVenta`, `__validarDispositivoCaja`)
3. **`repo.merge(entity, data)`** ← AQUÍ se escribe el estado
4. **`repo.save(entity)`** ← AQUÍ se persiste

Si el guard va **después del merge**, el estado ya cambió en memoria. Si falla, la transacción hace rollback, pero **puede haber efectos laterales** si otros hooks leen `entity.estado` antes del save.

**Fix requerido**:  
El guard debe ir **ANTES del merge**, justo después de extraer los flags:

```typescript
// Después de línea 1293 (extraer __validarDispositivoCaja)

// Guard: rechazar finalización si hay hermanas ABIERTAS
if (
  data.estado === VentaEstado.CONCLUIDA &&
  entity.mesa?.id &&
  !entity.comanda?.id
) {
  const hermanas = await repo.count({
    where: {
      mesa: { id: entity.mesa.id },
      estado: VentaEstado.ABIERTA,
      comanda: IsNull(),
      id: Not(id)
    }
  });
  
  if (hermanas > 0) {
    throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
  }
}

// Luego, línea ~1295: camposReservados.forEach(...)
```

**Ubicación exacta**: Entre línea 1293 y 1295 del handler actual.

**Impacto si no se corrige**: El guard funciona, pero es frágil. Mejor defensa en profundidad = validar antes de mutar.

---

### P0-3: Guard en `createVenta` debe cargar la mesa CON relaciones

**Ubicación en plan**: Fase 1, líneas 170-184

**Código propuesto**:
```typescript
const ventasAbiertas = await dataSource.getRepository(Venta).count({
  where: { 
    mesa: { id: Number(mesaId) }, 
    estado: VentaEstado.ABIERTA, 
    comanda: IsNull() 
  }
});
```

**Problema**:  
El plan usa `count()` para performance (línea 190: "debe ser por count, no por find"), **pero** esto falla si:

1. La mesa **no existe** (mesaId inválido) → `count` devuelve 0, crea la venta, luego falla la FK
2. La mesa existe pero está **en otro estado** (ej. RESERVADO) → no lo valida

El handler actual (líneas 972-978) **SÍ carga la mesa** con `findOneBy`:

```typescript
const mesa = await mesaRepo.findOneBy({ id: Number(mesaId) });
if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
  mesa.estado = PdvMesaEstado.OCUPADO;
  await mesaRepo.save(mesa);
}
```

Pero lo hace **dentro** de la transacción y **después** del `count`. Si el count ve 0 porque la mesa no existe, la venta se crea igual.

**Fix requerido**:  
Cargar la mesa **antes** del count, **dentro del lock**, y usarla para marcar OCUPADO:

```typescript
const crear = async (): Promise<any> => dataSource.transaction(async (manager) => {
  // 1. Cargar mesa (valida existencia)
  const mesaRepo = manager.getRepository(PdvMesa);
  const mesa = await mesaRepo.findOneBy({ id: Number(mesaId) });
  if (!mesa) {
    throw new Error('MESA_NO_ENCONTRADA');
  }
  
  // 2. Guard: verificar que no haya otra venta ABIERTA
  const repo = manager.getRepository(Venta);
  const ventasAbiertas = await repo.count({
    where: { mesa: { id: Number(mesaId) }, estado: VentaEstado.ABIERTA, comanda: IsNull() }
  });
  
  if (ventasAbiertas > 0) {
    throw new Error('MESA_YA_TIENE_VENTA_ABIERTA');
  }
  
  // 3. Crear venta
  const entity: any = repo.create(data);
  await setEntityUserTracking(dataSource, entity, userId, false);
  if (deviceId != null) entity.dispositivo = { id: deviceId };
  const saved = await repo.save(entity);
  
  // 4. Marcar mesa OCUPADO (solo si no lo estaba)
  if (mesa.estado !== PdvMesaEstado.OCUPADO) {
    mesa.estado = PdvMesaEstado.OCUPADO;
    await mesaRepo.save(mesa);
  }
  
  return saved;
});
```

**Orden correcto**: Cargar mesa → Count ventas → Crear venta → Marcar ocupado.

**Impacto si no se corrige**: Venta creada con `mesa_id` inválido (falla FK), o mensaje confuso al usuario.

---

### P1-1: Surfacing UI es insuficiente para RESOLVER el problema

**Ubicación en plan**: Fase 5, líneas 290-330

**Propuesta del plan**:
- Badge `⚠ 2 CUENTAS` en mesa
- Contador en `getPdvMesasActivas`
- Diálogo simple que liste ventas (marcado "opcional")

**Problema**:  
El plan detecta el problema pero **no ofrece acción correctiva** en la UI. Si el cajero ve el badge:

1. ¿Qué hace? → No hay botón claro
2. ¿Transferir? → TRANSFERIR ya existe, pero no se menciona en el plan
3. ¿Unir? → No existe, y el plan dice que está fuera de alcance (línea 615)

**Consecuencia**: Datos legacy 3771 quedan **visibles pero irresolubles** sin intervención manual.

**Fix requerido**:  
Agregar **Fase 5.5: Acción Correctiva en UI**:

- El diálogo lista-ventas-mesa debe tener:
  - Botón **TRANSFERIR** por venta (abre `transferir-destino-dialog`)
  - Botón **CANCELAR** por venta (con motivo obligatorio)
  - Tooltip: "Transfiere o cancela las cuentas sobrantes antes de cobrar"

- Actualizar sección de fuera de alcance (línea 615) para clarificar:
  - ✅ INCLUIDO: usar herramientas existentes (transferir/cancelar) desde el diálogo
  - ❌ EXCLUIDO: merge automático de ítems (no existe)

**Severidad P1** (no P0) porque:
- El error ya previene nuevas multi-cuentas
- Los cajeros pueden transferir manualmente desde el flujo normal
- Pero sin esta guía explícita, el badge es solo un adorno

---

### P1-2: Tests de regresión incompletos

**Ubicación en plan**: Fase 6, líneas 460-470

**Lista propuesta**:
```markdown
- npm run test:transferencia-pdv
- npm run test:terminal-caja
- npm run test:delivery
- npm run test:cobro-parcial
```

**Problema**:  
Falta **`npm run test:mesa-estado`**, que específicamente prueba la matriz de colores de mesa (línea 120 de `ventas-pdv.md`):

> **Test:** `npm run test:mesa-estado` fija la matriz de 4 combinaciones × color × tooltip.

El fix toca `getPdvMesasActivas` (agrega contador), que es justo lo que ese test valida. Si el contador rompe el cálculo de estado, ese test lo atrapa.

**Fix requerido**:  
Agregar a la lista:
```markdown
- npm run test:mesa-estado — matriz de estados y colores
```

**Severidad P1** porque:
- Es una cobertura de regresión, no un test del fix
- Pero es **el** test que valida la función modificada

---

## Respuestas a Criterios del Eje A

### ✅ ¿El plan cubre el invariante sin romper comandas?

**SÍ**. El invariante está bien definido (línea 89):
```
mesa ocupada ⟺ existe Venta ABIERTA con mesa_id = X y comanda_id IS NULL
```

Y todos los guards filtran explícitamente `comanda: IsNull()`:
- Fase 1 (línea 176): `comanda: IsNull()`
- Fase 2 (línea 848 handler actual): `comanda: IsNull()`
- Fase 3 (línea 234): `!existingEntity.comanda?.id`

Las comandas quedan **explícitamente fuera** del alcance, con test de validación (líneas 360-374: "permite crear comanda sobre mesa ocupada").

---

### ✅ ¿Errores/mensajes/permisos alineados con el resto del PdV?

**SÍ**. Los tres handlers usan `ensurePermission('VENTAS_PDV')`, que es el permiso canónico del módulo (líneas 938, 844, 1266 de `ventas.handler.ts`).

Los mensajes de error son:
- `MESA_YA_TIENE_VENTA_ABIERTA` (alta) → claro, accionable
- `MESA_TIENE_OTRAS_VENTAS_ABIERTAS` (cobro) → claro, accionable

El manejo frontend (Fase 4) usa `SnackbarService` con botón ABRIR y mensajes informativos, alineado con otros errores del PdV (ej. delivery, terminal ajena).

**Pero**: falta especificar el **color** del snackbar (¿error rojo? ¿warning amarillo?). Recomendación: amarillo con `duration: 8000`, porque es un **bloqueo operativo**, no un error fatal.

---

### ⚠️ ¿Surfacing UI mínimo es suficiente o scope creep?

**CASI**. El badge + contador es mínimo viable para **detectar**, pero insuficiente para **resolver** (hallazgo P1-1). 

**No es scope creep** agregar botones TRANSFERIR/CANCELAR al diálogo, porque esas acciones **ya existen** (líneas 136-175 de `ventas-pdv.md`). Solo falta **conectarlas** desde el diálogo de lista.

El plan correctamente marca como fuera de alcance (línea 615):
- ❌ Merge automático de ítems (no existe, requeriría UI nueva)
- ❌ Reabrir venta 3771 (riesgoso)
- ❌ Índice único parcial (puede agregarse después)

---

### ✅ ¿Fases ordenadas?

**SÍ**. El orden es correcto:

1. Backend prevención (createVenta) → gate en alta
2. Backend protección (cerrarVentasAbiertasMesa, updateVenta) → gate en cobro
3. Frontend manejo de errores → UI reactiva
4. Frontend surfacing → visibilidad de legacy
5. Tests → validación

Cada fase depende de la anterior. No hay saltos de capa (ej. frontend antes que backend).

---

### ✅ ¿Tests discriminan el bug?

**SÍ**. Los tests propuestos (líneas 343-440) son **negativos** (deben fallar sin el fix):

- `'rechaza crear 2ª venta ABIERTA'` → falla sin guard en createVenta
- `'rechaza cobrar si hay hermana ABIERTA'` → falla sin guard en updateVenta
- `'cerrarVentasAbiertasMesa rechaza con múltiples'` → falla sin guard en cerrar

Y tienen test de **reversión** (líneas 453-461):
```typescript
// 1. Comentar guards
// 2. Correr tests → deben FALLAR
// 3. Descomentar → deben PASAR
```

Esto valida que el fix es **necesario** (los tests fallan sin él) y **suficiente** (pasan con él).

---

### ✅ ¿Fuera de alcance correcto?

**SÍ**. Las exclusiones son razonables:

- ❌ Corrección retroactiva (líneas 588-606): requiere decisión de negocio caso por caso
- ❌ Índice único parcial (líneas 599-610): invariante en app basta para MVP
- ❌ Merge automático (líneas 613-620): requiere UI compleja
- ❌ Reabrir venta mal cerrada (líneas 623-630): riesgoso

Todas justificadas. No hay scope creep inverso (dejar fuera algo esencial).

**Pero**: la línea 519 dice que reinicio es "opcional" para Alpha Don Franco. **NO LO ES**. El fix toca handlers IPC → reinicio **obligatorio**. Debería decir:

```markdown
### 8.2. Reinicio Requerido

**Reinicio**: **SÍ, obligatorio**. Afecta handlers IPC en `ventas.handler.ts`.
```

---

### ⚠️ Al menos UN riesgo real (o justificación de por qué no hay)

**INSUFICIENTE**. La sección de riesgos (líneas 473-530) lista 5 riesgos, pero **solo 2 son reales**:

**Riesgos REALES identificados**:
1. **Modo RPC** (líneas 504-511) → default-allow puede evadir guard  
   ✅ Mitigado: guard en handler + `ensurePermission`
2. **Reinicio Alpha** (líneas 513-520) → interrupción operativa  
   ✅ Mitigado: backup + horario de baja

**Riesgos NO REALES**:
1. **Bloqueo legítimo** (líneas 476-485) → race en cancelar + crear  
   ❌ NO es real: `withMesaLock` serializa, como dice la mitigación
2. **Comandas bloqueadas** (líneas 487-494) → comanda rechazada  
   ❌ NO es real: `comanda: IsNull()` las excluye explícitamente
3. **Permisos** (líneas 496-502) → handler rompe permisos  
   ❌ NO es real: handler ya existe, no cambian permisos

**Riesgo REAL faltante** (crítico):
- **Transferencia parcial en progreso** (no mencionado):
  - Si el cajero está **moviendo ítems** de venta A a venta B (flujo transferir-destino-dialog)
  - Y en medio del flujo intenta **cobrar venta A**
  - El guard ve 2 ABIERTAS y **rechaza**
  - Pero el cajero **espera** que rechace solo si son cuentas **completas**, no si está uniendo
  
  **Mitigación**: El flujo de transferir ya es atómico (handler único `transferir-venta-pdv` en una transacción). Pero el mensaje debe ser claro: "Termina de transferir antes de cobrar".

**Fix requerido**: Reescribir sección 7 con riesgos reales solamente:

```markdown
## 7. Riesgos y Mitigaciones

### 7.1. Modo RPC default-allow
**Escenario**: Cliente evade guard vía `/api/rpc`
**Probabilidad**: Media | **Impacto**: Alto
**Mitigación**: Guard en handler + `ensurePermission('VENTAS_PDV')`

### 7.2. Transferencia parcial interrumpida
**Escenario**: Cajero intenta cobrar A mientras transfiere ítems a B
**Probabilidad**: Alta | **Impacto**: Medio
**Mitigación**: Mensaje claro "Termina de transferir antes de cobrar" + botón Transferir

### 7.3. Interrupción operativa en Alpha
**Escenario**: Reinicio en hora pico → ventas perdidas
**Probabilidad**: Media | **Impacto**: Alto
**Mitigación**: Backup + horario coordinado + sin cajas abiertas

### 7.4. Venta en CANCELADA contada como ABIERTA
**Escenario**: Guard cuenta CANCELADA como ocupación
**Probabilidad**: Baja | **Impacto**: Medio
**Mitigación**: Guard filtra `estado: ABIERTA` explícitamente (línea 175)
```

---

## Resumen de Hallazgos por Severidad

### P0 (Bloquean implementación):
1. **Cancelación no gateada** → pérdida simétrica al cobro
2. **Guard en updateVenta después del merge** → frágil
3. **createVenta no valida existencia de mesa** → FK fallido

### P1 (Deben corregirse antes de merge):
1. **Surfacing UI sin acción correctiva** → badge inútil
2. **Test de regresión faltante** (mesa-estado)

### P2 (Nice-to-have, pueden ir en PR separado):
- Especificar color de snackbar (amarillo)
- Reescribir sección de riesgos (eliminar NO-reales)
- Clarificar que reinicio es obligatorio

---

## Checklist de Correcciones (antes de implementar)

- [ ] **P0-1**: Gatear cancelación en `cerrarVentasAbiertasMesa` (eliminar `&& estado === CONCLUIDA`)
- [ ] **P0-2**: Mover guard en `updateVenta` antes del merge (entre líneas 1293-1295)
- [ ] **P0-3**: Cargar mesa antes del count en `createVenta` (validar existencia)
- [ ] **P1-1**: Agregar botones TRANSFERIR/CANCELAR al diálogo lista-ventas-mesa
- [ ] **P1-2**: Agregar `npm run test:mesa-estado` a lista de regresión
- [ ] **P2**: Aclarar reinicio obligatorio (no opcional)
- [ ] **P2**: Reescribir sección 7 (riesgos reales solamente)

---

## Comentarios Finales

El plan es **sólido en su análisis** (root cause correcto, invariante bien definido) y **ordenado en su ejecución** (fases lógicas). Los hallazgos P0 son **errores de detalle**, no de diseño.

**Puntos fuertes**:
- ✅ Invariante claro y justificado
- ✅ Guards en los 3 caminos (crear/cerrar/update)
- ✅ Tests negativos que discriminan el bug
- ✅ No rompe comandas, delivery, transferencias
- ✅ Fuera de alcance razonable

**Áreas de mejora**:
- ⚠️ Cancelación (hueco simétrico al cobro)
- ⚠️ Orden de validaciones en `createVenta`
- ⚠️ Surfacing sin resolución

**Recomendación**: **PASS-with-fixes**. Corregir P0s antes de implementar, P1s antes de merge, P2s pueden ir después.

---

**Estado del plan**: AUDITADO — listo para corrección  
**Próximo paso**: Implementador debe actualizar plan con fixes P0/P1, luego abrir PR  
**Revisor del plan**: Pendiente (post-corrección)
