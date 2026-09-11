# PLAN: Mesa Una Venta Abierta (Fix Multi-cuenta)

**Fecha**: 2026-09-11  
**Rama**: `fix/mesa-una-venta-abierta-4619`  
**Issue**: Bug producción Alpha Don Franco (2026-09-10/11)  
**Severidad**: ALTA — pérdida de dinero silenciosa

---

## 1. Contexto Forense

### Caso Real (Alpha Don Franco)

**Mesa 4 con 3 ventas de mesa concurrentes**:

| Venta | Estado | Abierta | Cobrada | Monto | Observaciones |
|-------|--------|---------|---------|-------|---------------|
| 3738  | CONCLUIDA | 19:51 PY | 22:11 | 326k | OK |
| 3739  | CONCLUIDA | 19:52 PY | 01:34 | 460k | Ticket 00:43 a 406k; pago 450k + desc 10k |
| **3771** | **CONCLUIDA** | **22:21 PY** | **NUNCA** | **0** | **Ítems 254k (Salto×8 + Mitaí + Guaraná); marcada CONCLUIDA sin pago** |

**Síntomas percibidos**:
- PdV mostraba venta 3771 (254k)
- Ticket impreso era de 3739 → desfase visible
- Al cobrar 3739, la venta 3771 se **cerró sola sin cobro**
- `fechaCierre` null, `montoCubierto` 0

**No es error de suma**: es multi-cuenta en misma mesa + cierre silencioso de hermanas.

---

## 2. Root Cause (Análisis del Código)

### 2.1. `createVenta` — Admite Múltiples Abiertas

**Ubicación**: `electron/handlers/ventas.handler.ts:936-990`

```typescript
// Líneas 974-979
if (mesa && mesa.estado !== PdvMesaEstado.OCUPADO) {
  mesa.estado = PdvMesaEstado.OCUPADO;
  await mesaRepo.save(mesa);
}
```

**Problema**:
- Si `mesa.estado !== OCUPADO` → marca OCUPADO y crea venta ✅
- Si `mesa.estado === OCUPADO` → **NO marca, pero igual crea la venta** ❌

El código comenta (línea 974-979):
> "Nunca degrada una mesa ya ocupada por otra venta."

Pero **no rechaza** crear la segunda venta. El lock `withMesaLock` (línea 985) sólo serializa races concurrentes; **no impide** la segunda cuenta.

**Comportamiento actual**:
1. Primera cuenta → `mesa.estado = DISPONIBLE` → se marca `OCUPADO` → venta 1 creada
2. Segunda cuenta **sobre la misma mesa** → `mesa.estado = OCUPADO` → **no marca**, pero **sí crea venta 2**
3. Resultado: **2 ventas ABIERTAS** con `mesa_id` = 4, `comanda_id` IS NULL

### 2.2. `cerrarVentasAbiertasMesa` — Cierra TODAS

**Ubicación**: `electron/handlers/ventas.handler.ts:842-872`

```typescript
// Líneas 848-849
const ventasAbiertas = await repo.find({
  where: { mesa: { id: mesaId }, estado: VentaEstado.ABIERTA, comanda: IsNull() },
  relations: ['caja'],
});
```

**Problema**:
- Busca **TODAS** las ventas abiertas de la mesa
- Las pone **TODAS** en `estado = CONCLUIDA` (línea 862)
- Se llama desde el flujo de cobro **sin pasar por `updateVenta`** → tercer camino de finalización

**Comportamiento en el caso 3771**:
1. Cajero cobra venta 3739 → `updateVenta(3739, CONCLUIDA)` + `cerrarVentasAbiertasMesa(4, CONCLUIDA)`
2. `cerrarVentasAbiertasMesa` encuentra **2 ventas**: 3739 (ya CONCLUIDA) + **3771** (todavía ABIERTA)
3. Pone ambas en CONCLUIDA con `repo.save` directo
4. Venta 3771: `estado = CONCLUIDA`, pero **sin `Pago`, sin `fechaCierre`, `montoCubierto = 0`**

---

## 3. Invariante de Producto

**REGLA DURA**:
```
mesa ocupada ⟺ existe Venta ABIERTA con mesa_id = X y comanda_id IS NULL
```

Como **máximo UNA** venta de mesa (comanda IS NULL) en estado ABIERTA por `mesaId`.

**Consecuencias**:
- Crear segunda venta sobre mesa ocupada → **ERROR explícito**
- Cobro / cierre → **no concluir hermanas** sin pago
- Si hay otra ABIERTA → **bloquear cobro** con mensaje claro

---

## 4. Objetivo del Fix

### 4.1. Prevención (Alta)

**`createVenta` con mesa**:
- Si **ya existe** venta ABIERTA con `mesa_id = X` y `comanda_id IS NULL`:
  - **Rechazar** con error claro: `MESA_YA_TIENE_VENTA_ABIERTA`
  - Frontend: `SnackbarService` con mensaje + sugerencia de abrir la existente

**Decisión tomada**: **error explícito**, no reusar silenciosamente.  
**Justificación**:
- Mergear ítems sin avisar → confusión sobre quién pidió qué
- Reusar → silencioso, cliente no ve que se unió a cuenta ajena
- Error + UI que abra existente → control explícito del cajero

### 4.2. Protección (Cobro)

**Cobro / `cerrarVentasAbiertasMesa` / `updateVenta`→CONCLUIDA**:

**Opción A** (elegida):
- Antes de concluir una venta de mesa, verificar que **no haya otra ABIERTA**
- Si hay hermana → rechazar cobro: `MESA_TIENE_OTRAS_VENTAS_ABIERTAS`
- Frontend: mensaje claro + sugerencia de transferir/unir

**Opción B** (descartada):
- Permitir cobro parcial + dejar hermanas ABIERTAS
- Más complejo; no impide el bug

**Opción C** (descartada):
- Cerrar hermanas con estado especial `PENDIENTE_COBRO`
- Requiere nuevo estado + UI para resolverlo

### 4.3. Surfacing (Detección Legacy)

**Si detecta >1 ABIERTA** (datos legacy pre-fix):
- PdV: **badge rojo** en mesa con texto `"⚠ 2 CUENTAS"`
- Click en mesa: **lista de cuentas** con botones individuales
- Sugerencia: transferir/unir antes de cobrar

**Implementación mínima viable**:
- Contador en `getPdvMesasActivas` → campo `ventasAbiertas: number`
- Badge si `> 1`
- Diálogo simple que liste las ventas

### 4.4. Testing

**Tests que deben FALLAR sin el fix**:
1. Crear 2ª venta ABIERTA sobre mesa ocupada → debe rechazar
2. Cobrar venta con hermana ABIERTA → debe rechazar
3. `cerrarVentasAbiertasMesa` con 2 ABIERTAS → debe rechazar

**Tests que deben PASAR**:
- Crear venta sobre mesa DISPONIBLE → OK
- Crear comanda sobre mesa ocupada → OK (comanda ≠ cuenta de mesa)
- Cobrar venta única → cierra y libera mesa
- Transferir venta a otra mesa → libera mesa origen si vacía

---

## 5. Fases de Implementación

### Fase 1: Backend — Prevención en `createVenta`

**Archivo**: `electron/handlers/ventas.handler.ts`

**Cambios**:
```typescript
// Línea 964, ANTES de crear la venta
if (ocupaMesa) {
  // Verificar que no exista otra venta ABIERTA en esta mesa
  const ventasAbiertas = await dataSource.getRepository(Venta).count({
    where: { 
      mesa: { id: Number(mesaId) }, 
      estado: VentaEstado.ABIERTA, 
      comanda: IsNull() 
    }
  });
  
  if (ventasAbiertas > 0) {
    throw new Error('MESA_YA_TIENE_VENTA_ABIERTA');
  }
}
```

**Guard debe estar**:
- **Dentro** de `withMesaLock` (línea 985)
- **Antes** de `repo.create(data)` (línea 966)
- **Dentro** de la transacción (línea 964)

**Riesgos**:
- Lock debe cubrir verificación + creación (ya lo hace con `withMesaLock`)
- Verificación debe ser **por count**, no por `find` (performance)

### Fase 2: Backend — Protección en `cerrarVentasAbiertasMesa`

**Archivo**: `electron/handlers/ventas.handler.ts`

**Cambios**:
```typescript
// Línea 848, DESPUÉS de buscar ventas abiertas
if (ventasAbiertas.length > 1 && estado === VentaEstado.CONCLUIDA) {
  throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
}
```

**Rationale**:
- Si hay **>1 ABIERTA** → alguien debe decidir qué hacer con las hermanas
- No cerrar automáticamente sin pago
- Aplica **sólo a CONCLUIDA** (cobro); cancelar mesa es válido con múltiples

**Edge cases**:
- Mesa con 1 venta ABIERTA + 1 CONCLUIDA → OK (la CONCLUIDA no cuenta)
- Mesa con 2 ABIERTAS → **rechaza** cobro de cualquiera
- Mesa con comandas vinculadas → no afecta (comandas tienen `comanda_id NOT NULL`)

### Fase 3: Backend — Protección en `updateVenta`

**Archivo**: `electron/handlers/ventas.handler.ts`

**Ubicación**: Handler `updateVenta`, antes de `repo.save`

**Cambios**:
```typescript
// Si la transición es a CONCLUIDA y es venta de mesa
if (
  updateData.estado === VentaEstado.CONCLUIDA &&
  existingEntity.mesa?.id &&
  !existingEntity.comanda?.id
) {
  const hermanas = await repo.count({
    where: {
      mesa: { id: existingEntity.mesa.id },
      estado: VentaEstado.ABIERTA,
      comanda: IsNull(),
      id: Not(id) // Excluir la venta actual
    }
  });
  
  if (hermanas > 0) {
    throw new Error('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
  }
}
```

**Rationale**:
- `updateVenta` es el camino principal de finalización
- `cerrarVentasAbiertasMesa` es el segundo camino (ya gateado en Fase 2)
- Cobro a crédito usa `updateVenta` → queda cubierto

### Fase 4: Frontend — Manejo de Errores

**Archivo**: `src/app/pages/ventas/pdv/pdv.component.ts`

**Cambios**:
1. **Al crear venta** (`createVenta`):
```typescript
catch (error: any) {
  if (error.message === 'MESA_YA_TIENE_VENTA_ABIERTA') {
    this.snackBar.open(
      'Esta mesa ya tiene una cuenta abierta. ¿Deseas abrirla?',
      'ABRIR',
      { duration: 8000 }
    ).onAction().subscribe(() => {
      // Buscar y cargar la venta existente
      this.loadMesaExistente(mesaId);
    });
  } else {
    this.snackBar.open('Error al crear venta: ' + error.message, 'Cerrar');
  }
}
```

2. **Al cobrar** (`cobrar-venta-dialog.component.ts`):
```typescript
catch (error: any) {
  if (error.message === 'MESA_TIENE_OTRAS_VENTAS_ABIERTAS') {
    this.snackBar.open(
      'Esta mesa tiene otras cuentas abiertas. Transfiere o une las cuentas antes de cobrar.',
      'Cerrar',
      { duration: 8000 }
    );
  } else {
    this.snackBar.open('Error al cobrar: ' + error.message, 'Cerrar');
  }
}
```

**Helpers necesarios**:
- `loadMesaExistente(mesaId)`: buscar y seleccionar venta ABIERTA de mesa
- Revisar que `cobrar-venta-dialog` ya maneja errores (línea ~finalizar)

### Fase 5: Frontend — Surfacing Legacy

**Archivo**: `src/app/pages/ventas/pdv/pdv.component.ts`

**Backend**: Modificar `getPdvMesasActivas` para devolver `ventasAbiertas: number`

```typescript
// En electron/handlers/ventas.handler.ts
ipcMain.handle('getPdvMesasActivas', async () => {
  const mesas = await getMesasWithEstado(dataSource);
  
  // Contar ventas abiertas por mesa
  for (const mesa of mesas) {
    const count = await dataSource.getRepository(Venta).count({
      where: { 
        mesa: { id: mesa.id }, 
        estado: VentaEstado.ABIERTA, 
        comanda: IsNull() 
      }
    });
    (mesa as any).ventasAbiertas = count;
  }
  
  return mesas;
});
```

**Frontend**: Badge en mesa

```typescript
// En pdv.component.html, dentro del card de mesa
<span *ngIf="mesa.ventasAbiertas > 1" class="badge-multi-cuenta">
  ⚠ {{mesa.ventasAbiertas}} CUENTAS
</span>
```

**Diálogo de lista** (opcional, si tiempo alcanza):
- Click en mesa con múltiples → abrir diálogo `lista-ventas-mesa-dialog`
- Lista simple con botones "ABRIR" por venta
- Mensaje: "Esta mesa tiene múltiples cuentas. Selecciona una o transfiérelas."

---

## 6. Testing

### 6.1. Tests Unitarios Backend

**Archivo**: `scripts/test-mesa-una-venta-abierta-e2e.ts`

**Casos**:

```typescript
describe('Mesa Una Venta Abierta', () => {
  it('rechaza crear 2ª venta ABIERTA en mesa ocupada', async () => {
    // Setup: crear venta 1 en mesa 5
    const v1 = await createVenta({ mesa: { id: 5 }, caja: { id: 1 } });
    expect(v1.estado).toBe(VentaEstado.ABIERTA);
    
    // Act: intentar crear venta 2 en misma mesa
    await expect(
      createVenta({ mesa: { id: 5 }, caja: { id: 1 } })
    ).rejects.toThrow('MESA_YA_TIENE_VENTA_ABIERTA');
    
    // Assert: sigue habiendo sólo 1 venta
    const count = await countVentasAbiertas(5);
    expect(count).toBe(1);
  });
  
  it('permite crear comanda sobre mesa ocupada', async () => {
    // Setup: venta de mesa
    await createVenta({ mesa: { id: 5 }, caja: { id: 1 } });
    
    // Act: crear comanda vinculada a esa mesa
    const comanda = await abrirComanda({ pdvMesa: { id: 5 } });
    const v2 = await createVenta({ 
      comanda: { id: comanda.id }, 
      mesa: { id: 5 },
      caja: { id: 1 } 
    });
    
    // Assert: 2 ventas OK (comanda ≠ cuenta de mesa)
    expect(v2.estado).toBe(VentaEstado.ABIERTA);
  });
  
  it('rechaza cobrar si hay hermana ABIERTA', async () => {
    // Setup: forzar 2 ventas ABIERTAS (bypasseando el guard)
    const v1 = await createVentaDirecto({ mesa_id: 5 });
    const v2 = await createVentaDirecto({ mesa_id: 5 });
    
    // Act: intentar cobrar v1
    await expect(
      updateVenta(v1.id, { estado: VentaEstado.CONCLUIDA })
    ).rejects.toThrow('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
    
    // Assert: ambas siguen ABIERTAS
    const v1After = await getVenta(v1.id);
    const v2After = await getVenta(v2.id);
    expect(v1After.estado).toBe(VentaEstado.ABIERTA);
    expect(v2After.estado).toBe(VentaEstado.ABIERTA);
  });
  
  it('permite cobrar venta única', async () => {
    // Setup: 1 venta
    const v1 = await createVenta({ mesa: { id: 5 }, caja: { id: 1 } });
    await addItem(v1.id, { producto: { id: 1 }, cantidad: 1 });
    
    // Act: cobrar
    await updateVenta(v1.id, { 
      estado: VentaEstado.CONCLUIDA,
      pago: { /* ... */ }
    });
    
    // Assert: venta cerrada, mesa liberada
    const v1After = await getVenta(v1.id);
    expect(v1After.estado).toBe(VentaEstado.CONCLUIDA);
    
    const mesa = await getMesa(5);
    expect(mesa.estado).toBe(PdvMesaEstado.DISPONIBLE);
  });
  
  it('cerrarVentasAbiertasMesa rechaza con múltiples', async () => {
    // Setup: 2 ventas ABIERTAS
    await createVentaDirecto({ mesa_id: 5 });
    await createVentaDirecto({ mesa_id: 5 });
    
    // Act: cerrar mesa
    await expect(
      cerrarVentasAbiertasMesa(5, VentaEstado.CONCLUIDA)
    ).rejects.toThrow('MESA_TIENE_OTRAS_VENTAS_ABIERTAS');
  });
  
  it('transferir venta libera mesa origen si vacía', async () => {
    // Setup: venta en mesa 5
    const v1 = await createVenta({ mesa: { id: 5 }, caja: { id: 1 } });
    await addItem(v1.id, { producto: { id: 1 }, cantidad: 1 });
    
    // Act: transferir completa a mesa 6
    await transferirVentaPdv({
      origen: { tipo: 'MESA', id: 5 },
      destino: { tipo: 'MESA', id: 6 },
      alcance: 'COMPLETA'
    });
    
    // Assert: mesa 5 libre, mesa 6 ocupada
    const mesa5 = await getMesa(5);
    const mesa6 = await getMesa(6);
    expect(mesa5.estado).toBe(PdvMesaEstado.DISPONIBLE);
    expect(mesa6.estado).toBe(PdvMesaEstado.OCUPADO);
  });
});
```

**Comando**: `npm run test:mesa-una-venta-abierta`

**Configuración en `package.json`**:
```json
"scripts": {
  "test:mesa-una-venta-abierta": "tsx scripts/test-mesa-una-venta-abierta-e2e.ts"
}
```

### 6.2. Test de Reversión

**Propósito**: Verificar que revertir el fix vuelve a permitir el bug

**Implementación**:
1. Comentar guards en `createVenta` / `cerrarVentasAbiertasMesa` / `updateVenta`
2. Correr tests → deben FALLAR
3. Descomentar → deben PASAR

**Comando**: `npm run test:mesa-revertir-fix`

### 6.3. Tests de Regresión

**Verificar que no rompen**:
- `npm run test:transferencia-pdv` — transferencias entre mesas/comandas
- `npm run test:terminal-caja` — cobro por dispositivo
- `npm run test:delivery` — ventas de delivery (no tienen mesa)
- `npm run test:cobro-parcial` — cobro parcial por ítems

---

## 7. Riesgos y Mitigaciones

### 7.1. Riesgo: Bloqueo Legítimo

**Escenario**: Cajero cancela venta A, intenta crear B en misma mesa → rechaza por race

**Mitigación**:
- Guard cuenta ventas **ABIERTAS** (no CANCELADAS)
- Cancelar pone `estado = CANCELADA` → no cuenta para el guard
- Si race en cancelación + creación → `withMesaLock` serializa

### 7.2. Riesgo: Comandas Bloqueadas

**Escenario**: Mesa con cuenta propia + comanda → rechaza crear comanda

**Mitigación**:
- Guard filtra `comanda: IsNull()`
- Comandas tienen `comanda_id NOT NULL` → no cuentan
- Test explícito: "permite crear comanda sobre mesa ocupada"

### 7.3. Riesgo: Permisos

**Escenario**: Handler nuevo `getPdvMesasActivas` con contador → rompe permisos

**Mitigación**:
- Handler ya existe (no es nuevo)
- Ya tiene `ensurePermission('VENTAS_PDV')` (verificar)
- Contador es agregado de datos ya visibles

### 7.4. Riesgo: Modo RPC

**Escenario**: `/api/rpc` default-allow → cliente evade guard

**Mitigación**:
- Guard está en **handler**, no en UI
- `ensurePermission('VENTAS_PDV')` ya existe en `createVenta` (línea 938)
- Cliente HTTP pasa por mismo código que IPC

### 7.5. Riesgo: Reinicio Alpha

**Escenario**: Fix implica reiniciar Alpha Don Franco → interrupción operativa

**Mitigación**:
- **No tocar datos legacy** (ventas 3771 existentes)
- Fix es **preventivo** (no correctivo)
- Reinicio en horario de baja afluencia (consultar con usuario)
- Backup pre-deploy (obligatorio)

---

## 8. Impacto en Alpha Don Franco

### 8.1. Datos Legacy

**Ventas 3771 (y similares)**:
- Estado: `CONCLUIDA`, `fechaCierre = null`, `montoCubierto = 0`
- **NO se tocan** en este PR
- Requieren corrección manual:
  - Opción A: Cancelar con motivo "ERROR MULTI-CUENTA"
  - Opción B: Cobrar manualmente + ajustar caja cerrada

**Runbook de corrección** (fuera de alcance, opcional):
```sql
-- 1. Identificar ventas CONCLUIDAS sin pago
SELECT id, mesa_id, created_at, estado
FROM ventas
WHERE estado = 'CONCLUIDA' 
  AND pago_id IS NULL 
  AND fecha_cierre IS NULL
  AND comanda_id IS NULL;

-- 2. Revisar ítems de cada venta
SELECT vi.id, vi.producto_id, p.nombre, vi.cantidad, vi.precio_venta_unitario
FROM venta_items vi
JOIN productos p ON p.id = vi.producto_id
WHERE vi.venta_id = 3771
  AND vi.estado = 'ACTIVO';

-- 3. Decisión manual por venta (script Node.js recomendado)
```

### 8.2. Reinicio Requerido

**Afecta**:
- `electron/handlers/ventas.handler.ts` → backend
- `src/app/pages/ventas/pdv/pdv.component.ts` → frontend

**Reinicio**: **SÍ**, porque toca handlers IPC

**Timing**:
- Consultar con usuario horario de baja afluencia
- Backup pre-deploy
- Verificar que no haya cajas abiertas con trabajo pendiente

### 8.3. Rollback

**Plan de rollback**:
1. Revertir commit del fix
2. Reiniciar aplicación
3. Volver a estado previo (guards deshabilitados)

**Rollback forzoso si**:
- Fix rompe creación de ventas legítimas
- Cajeros reportan bloqueos inexplicables
- Tests en producción fallan

---

## 9. Fuera de Alcance

### 9.1. Corrección Retroactiva

**NO incluido en este PR**:
- Script para corregir ventas 3771 existentes
- Migración de datos legacy
- Ajuste automático de cajas cerradas con deuda

**Justificación**:
- Requiere decisión de negocio por venta (¿cancelar? ¿cobrar?)
- Ajustar cajas cerradas → alterar auditoría
- Mejor: runbook manual + revisión caso por caso

### 9.2. Índice Único Parcial

**NO incluido en este PR**:
```sql
CREATE UNIQUE INDEX idx_venta_mesa_abierta
ON ventas (mesa_id)
WHERE estado = 'ABIERTA' AND comanda_id IS NULL;
```

**Justificación**:
- Postgres soporta índices parciales ✅
- SQLite **también** (desde 3.8.0, tenemos 3.x) ✅
- **Pero**: índice parcial + TypeORM puede tener gotchas
- Invariante en app + tests basta para MVP
- Si se agrega después: migración nueva, no en este PR

### 9.3. Merge Automático de Ítems

**NO incluido en este PR**:
- Al detectar 2ª cuenta, oferta mergear ítems automáticamente
- Requiere UI compleja (selección de ítems a unir)
- Decisión de negocio (¿siempre mergear? ¿preguntar?)

**Mejor**: error explícito + sugerencia de transferir manualmente

### 9.4. Reabrir Venta 3771

**NO incluido en este PR**:
- Reabrir venta CONCLUIDA mal cerrada
- Requiere:
  - Reversión de estado mesa
  - Desbloqueo de ítems
  - Recálculo de stock si aplica
- Riesgo alto de inconsistencia

**Mejor**: cancelar + crear nueva venta manualmente

---

## 10. Documentación

### 10.1. Actualizar Skill

**Archivo**: `.claude/skills/frc-gourmet-expert/domains/ventas-pdv.md`

**Sección**: "El modelo mesa ↔ comanda"

**Agregar**:
```markdown
### Invariante de una venta por mesa (2026-09-11)

**REGLA DURA**: como máximo UNA venta de mesa (`comanda_id IS NULL`) en 
estado ABIERTA por `mesaId`.

**Prevención**: `createVenta` rechaza con `MESA_YA_TIENE_VENTA_ABIERTA` si 
ya existe una venta ABIERTA en esa mesa.

**Protección**: `cerrarVentasAbiertasMesa` y `updateVenta` rechazan con 
`MESA_TIENE_OTRAS_VENTAS_ABIERTAS` si hay hermanas al cobrar.

**Bug histórico**: Antes del fix, era posible crear múltiples cuentas en la 
misma mesa, y al cobrar una se cerraban todas sin pago. Caso real: mesa 4 de 
Alpha Don Franco con ventas 3738/3739/3771 (2026-09-10/11).

**Test**: `npm run test:mesa-una-venta-abierta`
```

### 10.2. Actualizar Known Bugs

**Archivo**: `.claude/skills/frc-gourmet-expert/reference/known-bugs.md`

**Sección**: "Ventas / PdV"

**Agregar**:
```markdown
### ✅ RESUELTO — Múltiples ventas ABIERTAS en misma mesa (2026-09-11)

**Síntoma**: Mesa con 2+ cuentas concurrentes; al cobrar una, las hermanas se 
cierran sin pago. Caso real: Alpha Don Franco mesa 4, ventas 3738/3739/3771 
(2026-09-10/11). La 3771 quedó CONCLUIDA con `montoCubierto = 0`.

**Causa**: `createVenta` no rechazaba crear 2ª venta sobre mesa ocupada; 
`cerrarVentasAbiertasMesa` cerraba TODAS las ABIERTAS con `repo.save` directo.

**Fix**: Invariante "1 venta ABIERTA por mesa" con guards en:
- `createVenta`: rechaza si ya existe ABIERTA
- `cerrarVentasAbiertasMesa`: rechaza si hay >1 ABIERTA
- `updateVenta`: rechaza transición a CONCLUIDA si hay hermanas

**Test**: `npm run test:mesa-una-venta-abierta`  
**Docs**: `docs/planes/PLAN-MESA-UNA-VENTA-ABIERTA.md`
```

### 10.3. Manual de Usuario

**NO incluido en este PR** (alcance limitado a fix técnico)

**Futuro**:
- Sección en manual: "Qué hacer si una mesa tiene múltiples cuentas"
- Capturas de pantalla del badge/diálogo
- Flujo recomendado: transferir/unir antes de cobrar

---

## 11. Checklist de Terminado

### Backend
- [ ] Guard en `createVenta` (Fase 1)
- [ ] Guard en `cerrarVentasAbiertasMesa` (Fase 2)
- [ ] Guard en `updateVenta` (Fase 3)
- [ ] Handler `getPdvMesasActivas` con contador

### Frontend
- [ ] Manejo de error `MESA_YA_TIENE_VENTA_ABIERTA` en PdV
- [ ] Manejo de error `MESA_TIENE_OTRAS_VENTAS_ABIERTAS` en cobro
- [ ] Badge de múltiples cuentas en mesa (opcional)
- [ ] Diálogo lista-ventas-mesa (opcional)

### Tests
- [ ] Script `test-mesa-una-venta-abierta-e2e.ts`
- [ ] Casos: crear 2ª / cobrar con hermana / transferir / comanda
- [ ] Test de reversión (comentar guards → falla)
- [ ] Regresión: transferencias / terminal-caja / delivery

### Documentación
- [ ] Actualizar `ventas-pdv.md` con invariante
- [ ] Marcar como RESUELTO en `known-bugs.md`
- [ ] Plan completo en `docs/planes/`

### Pre-deploy
- [ ] `npm run check` (AOT) pasa
- [ ] `npm run test:all` pasa
- [ ] Backup Alpha Don Franco
- [ ] Coordinar horario de reinicio

---

## 12. Notas Finales

**Decisiones clave tomadas**:
1. **Error explícito** > reusar silencioso → control del cajero
2. **Rechazar cobro** > cerrar sin pago → no pérdida silenciosa
3. **Surfacing legacy** > corrección automática → visibilidad del problema
4. **Invariante en app** > índice único parcial → suficiente para MVP

**No negociables**:
- Invariante "1 venta ABIERTA por mesa"
- Guards en los 3 caminos (crear / cerrar / updateVenta)
- Tests que fallen sin el fix
- Documentación en skill + known-bugs

**Si algo no se puede cumplir**: avisar, nunca saltear en silencio.

---

**Autor**: Claude Sonnet 4.5  
**Revisión**: Pendiente  
**Estado**: DRAFT — listo para auditoría
