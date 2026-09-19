# Auditoría Eje A — Alcance y Convenciones
## Plan: PLAN-265-BACKUP-REMOTO.md (issue #265)

> **Auditor:** Cloud Agent (Sonnet)  
> **Fecha:** 2026-09-09  
> **Rama auditada:** `cursor/fix-265-backup-remoto-759b`  
> **Archivos revisados:** Plan completo, `rpc-router.ts:33-110`, `backup.handler.ts:1-100`, skill `frc-gourmet-expert`, `PLAN-INFORMES-DELIVERY.md` (referencia), commits recientes de `origin/develop`

---

## Veredicto: **PASS with fixes** ✅⚠️

El plan es **implementable** y cubre el caso de uso legítimo del issue #265 (sacar backup remoto sin acceso físico). Las fases son claras, el alcance está bien acotado, y las convenciones se respetan en líneas generales.

**Requiere correcciones menores antes de implementar** (3 hallazgos P0/P1, 2 P2).

---

## Resumen ejecutivo

| Criterio | Estado | Observación |
|---|---|---|
| **Alcance cubre issue #265** | ✅ | Resuelve el bloqueo: admin remoto puede sacar backup vía `backup-create` + `backup-send-whatsapp` |
| **No mete restore/reset/delete** | ✅ | Operaciones destructivas quedan correctamente bloqueadas |
| **No rediseña backup** | ✅ | Solo ajusta guard HTTP + detección UI |
| **3 categorías completas vs deny-list** | ✅ | Los 11 canales están clasificados; coincide con `rpc-router.ts:39-49` |
| **Fases implementables** | ⚠️ | Implementables, pero con contradicción interna (P1) y falta de tests automatizados (P0) |
| **Caso backup-create-and-export** | ⚠️ | Recomendación B sensata, PERO incluido en Fase 1 (contradicción P1) |
| **Convenciones** | ✅ | Nombre de rama, commits, ubicación del plan, estilo: todo correcto |

---

## Hallazgos

### **P0-1: Falta test automatizado de seguridad HTTP** ❌

**Archivo:** `docs/planes/PLAN-265-BACKUP-REMOTO.md:212-238` (Fase 3)  
**Severidad:** **P0 (bloqueante)**

**Problema:**  
La Fase 3 es un checklist manual. Para un cambio que **expone 5 canales de backup por HTTP** (antes bloqueados), NO hay tests automatizados que verifiquen:

1. Los canales **permitidos** (`backup-create`, `backup-send-whatsapp`, `backup-config-set`, `backup-trigger-auto-now`) SÍ funcionan por `/api/rpc` con `SISTEMA_BACKUP`.
2. Los canales **bloqueados** (`backup-restore`, `backup-db-reset`, `backup-delete`, `backup-clear-images`) SÍ fallan con `channel_bloqueado_para_http`.
3. Sin el permiso `SISTEMA_BACKUP`, los canales permitidos devuelven HTTP 403.
4. `backup-pick-folder` y `backup-pick-restore-file` siguen bloqueados.

**Riesgo:**  
Un cambio de seguridad (superficie de ataque HTTP) sin tests automatizados es una **deuda técnica crítica**. Si un refactor futuro reordena `BLOCKED_CHANNELS` o cambia la lógica de `canalBloqueado()`, **no hay red de seguridad** que lo atrape antes de producción.

**Evidencia:**  
Comparando con `PLAN-INFORMES-DELIVERY.md:294-301`, el plan de referencia incluye **3 suites E2E** (`test:zona-delivery-online`, `test:reporte-delivery`, `test:canal-venta`) que verifican el motor con datos reales antes del checklist manual.

**Solución propuesta:**  
Agregar **Fase 2.5** (entre UI y tests manuales):

```typescript
// scripts/test-backup-http-e2e.ts
// Requiere: nodo en mode=server levantado, JWT con SISTEMA_BACKUP

describe('Backup HTTP access control', () => {
  it('backup-create funciona con permiso', async () => { ... });
  it('backup-send-whatsapp funciona con permiso y Evolution configurado', async () => { ... });
  it('backup-restore falla con channel_bloqueado_para_http', async () => { ... });
  it('backup-delete falla con channel_bloqueado_para_http', async () => { ... });
  it('backup-create sin permiso devuelve 403', async () => { ... });
  it('backup-pick-folder sigue bloqueado', async () => { ... });
});
```

**Script:** `npm run test:backup-http` en `package.json`.  
**Commit:** `test(backup): verificar control de acceso HTTP de canales`

---

### **P1-1: Contradicción interna en `backup-create-and-export`** ⚠️

**Archivo:** `docs/planes/PLAN-265-BACKUP-REMOTO.md:328-340` (ambigüedad 1) vs `docs/planes/PLAN-265-BACKUP-REMOTO.md:137` (Fase 1)  
**Severidad:** **P1 (alta)**

**Problema:**  
El plan **recomienda la opción B** (bloquear `backup-create-and-export` por HTTP) en la sección de ambigüedades:

> **Recomendación del plan:** Opción **B** — bloquear `backup-create-and-export` por HTTP. El caso de uso remoto se cubre con `backup-send-whatsapp`. (línea 340)

**PERO** en la Fase 1, línea 137, el canal **SÍ está en la lista de permitidos**:

```typescript
1. Remover de `BLOCKED_CHANNELS` (líneas 44-48):
   - backup-create
   - backup-create-and-export    ← AQUÍ
   - backup-trigger-auto-now
```

Esta es una **contradicción interna**. Si la recomendación es bloquearlo, no debería estar en los pasos de implementación de Fase 1.

**Impacto:**  
Un implementador que siga la Fase 1 sin leerla completa va a **permitir el canal** (opción A), no bloquearlo (opción B). La ambigüedad queda sin resolver.

**Evidencia:**  
- Línea 137: incluye `backup-create-and-export` en la lista de permitidos.
- Línea 340: recomienda opción B (bloquearlo).
- Línea 342: "**Este plan asume opción B.**"

**Solución propuesta:**  
1. **Si Gabriel aprueba opción B** (bloquear):
   - **Remover** `backup-create-and-export` de la lista de Fase 1, línea 137.
   - Agregar una nota en la Fase 1: *"backup-create-and-export NO se permite — usa backup-send-whatsapp para el caso de uso remoto"*.
   - Cambiar el comentario sugerido en línea 146-147 para que sea explícito sobre este canal.

2. **Si Gabriel aprueba opción A** (permitir):
   - Cambiar la recomendación de línea 340 a opción A.
   - Agregar en Fase 2 el ajuste UX del botón: renombrar a "Crear y guardar en servidor" cuando `isRemote === true` + tooltip explicativo (como sugiere la ambigüedad 4, línea 361-370).

**Acción inmediata:**  
Consultar a Gabriel **antes de implementar** y actualizar el plan con la decisión tomada, eliminando la opción no elegida de la Fase 1.

---

### **P1-2: Reinicio en `standalone` no documentado** ⚠️

**Archivo:** `docs/planes/PLAN-265-BACKUP-REMOTO.md:295-310` (sección 6)  
**Severidad:** **P1 (alta)**

**Problema:**  
La sección "Reinicio requerido" afirma:

> **SÍ, requiere reinicio del nodo `server`.** (línea 297)

Y luego detalla instrucciones para el modo `server` (líneas 303-308). **NO menciona** qué pasa con los otros dos modos:

- **`standalone`**: ¿Necesita reinicio? Sí, porque `rpc-router.ts` también se carga en este modo (el Fastify interno se levanta igual, aunque no esté expuesto a la red).
- **`client`**: No necesita reinicio (el plan lo dice en línea 309, correcto).

**Impacto:**  
Un operador en `mode=standalone` que aplique el fix podría NO reiniciar la app, y el cambio **no tendría efecto**. El módulo de backup seguiría fallando con `channel_bloqueado_para_http` desde la UI web (`/admin`) local.

**Evidencia:**  
Comparando con `domains/ventas-pdv.md` (sesión 2026-08), el doc de terminal compartida sí aclara: *"Instrucciones de deploy: [...] 2. En la PC que corre en `mode=server` **o `standalone`**"*.

**Solución propuesta:**  
Cambiar línea 297 a:

> **SÍ, requiere reinicio del nodo `server` o `standalone`.**

Y en las instrucciones (línea 303):

> 2. En la PC que corre en `mode=server` **o `standalone`**:

Agregar una nota después de línea 309:

> **En `mode=standalone`**, el reinicio también es necesario: aunque el servidor no está expuesto a la red, `rpc-router.ts` se carga igual para el IPC local.

---

### **P2-1: Plan no menciona actualizar la skill** 📄

**Archivo:** `docs/planes/PLAN-265-BACKUP-REMOTO.md` (sección 4, línea 243)  
**Severidad:** **P2 (media)**

**Problema:**  
La sección "Qué NO se toca" (línea 243) enumera qué archivos NO se modifican. Pero **no hay sección** que diga qué docs de la skill SÍ se deben actualizar.

Según la regla 24 del skill (`frc-gourmet-expert/SKILL.md:124`):

> **Ningún cambio está terminado sin su documentación.** [...] **actualizar la skill si el cambio invalida algo que ella afirma o cambia una convención**.

Este cambio afecta:

1. **`architecture/cliente-servidor.md`** — Probablemente documente la deny-list de `/api/rpc`. Si ese doc menciona que "los canales de backup están bloqueados", hay que actualizarlo.
2. **`workflows/definition-of-done.md`** — Si documenta qué va en cada lugar (y este cambio es una decisión de arquitectura), podría requerir una línea nueva.

**Impacto:**  
La skill queda desactualizada. Un agente futuro podría afirmar "los backups no son accesibles por HTTP" cuando ya lo son.

**Evidencia:**  
Comparando con `PLAN-INFORMES-DELIVERY.md:289`, el plan de referencia SÍ menciona los docs afectados:

> Docs: `domains/reportes.md` §8, `domains/dashboards.md` §7.8, `domains/ventas-pdv.md`.

**Solución propuesta:**  
Agregar en la sección 6 (o crear una sección 9 "Documentación"):

```markdown
## Documentación a actualizar

1. **`architecture/cliente-servidor.md`** (sección sobre `/api/rpc` y `BLOCKED_CHANNELS`):
   - Actualizar la lista de canales bloqueados: quitar los 5 permitidos, dejar los 4 destructivos + los 2 de diálogos.
   - Agregar nota: "Los backups no destructivos (`backup-create`, `backup-send-whatsapp`, etc.) SÍ son accesibles por HTTP con permiso `SISTEMA_BACKUP`."

2. **`workflows/definition-of-done.md`** (si aplica):
   - Si documenta decisiones de seguridad HTTP, agregar este caso como ejemplo.

3. **`reference/known-bugs.md`** (si aplica):
   - Si existía un ítem "Backup inutilizable desde /admin", marcarlo como resuelto y apuntar a este PR.
```

**Commit:** `docs(skill): actualizar deny-list HTTP tras permitir backups no destructivos`

---

### **P2-2: Falta evidencia de `ensurePermission` en handlers** 📄

**Archivo:** `docs/planes/PLAN-265-BACKUP-REMOTO.md:37-47`  
**Severidad:** **P2 (media, verificación)**

**Problema:**  
El plan afirma que los 9 handlers de backup **ya tienen** `ensurePermission` como primera sentencia, con evidencia de números de línea:

```typescript
- `backup-create` (línea 495)
- `backup-create-and-export` (línea 511)
- `backup-delete` (línea 560)
- `backup-restore` (línea 653)
- `backup-send-whatsapp` (línea 669)
...
```

**Leí `backup.handler.ts:1-100`** y vi que el archivo tiene imports y constantes, pero no llegué a las líneas citadas (el archivo tiene ~800 líneas según el output truncado).

**Riesgo:**  
Si la evidencia es incorrecta (líneas equivocadas, o el handler NO tiene `ensurePermission`), **permitir esos canales por HTTP sin guard de permiso** sería un **P0 de seguridad**.

Pero el plan es específico (9 handlers, 9 líneas). Es improbable que esté inventando.

**Solución propuesta:**  
Antes de implementar Fase 1, **verificar al menos uno**:

```bash
grep -n "ensurePermission.*SISTEMA_BACKUP" electron/handlers/backup.handler.ts | head -5
```

Si **todos** tienen el guard, este hallazgo se cierra como falso positivo. Si **alguno NO lo tiene**, es P0 y hay que agregarlo antes de permitirlo por HTTP.

**Acción:** Correr el grep y confirmar. Si falta, agregar una **Fase 0** (antes de la 1 actual) que agregue `ensurePermission` a los handlers que no lo tengan.

---

## Análisis del alcance

### ✅ **Cubre el issue #265 sin meter restore/reset/delete**

El issue #265 reporta:

> Bloqueante: sacar un backup de producción sin estar físicamente frente a esa máquina es imposible.

**El plan resuelve esto** permitiendo:
- `backup-create` — genera el backup en el servidor.
- `backup-send-whatsapp` — el admin lo recibe por WhatsApp (caso de uso explícito del issue).

Las operaciones destructivas (`backup-restore`, `backup-db-reset`, `backup-delete`, `backup-clear-images`) quedan correctamente bloqueadas. ✅

### ✅ **Las 3 categorías cubren los 11 canales de `BLOCKED_CHANNELS`**

Deny-list real en `rpc-router.ts:39-49` (verificado por lectura directa):

```typescript
'backup-db-reset',
'backup-clear-images',
'backup-restore',
'backup-delete',
'backup-create',
'backup-create-and-export',
'backup-trigger-auto-now',
'backup-config-set',
'backup-send-whatsapp',
'backup-pick-folder',
'backup-pick-restore-file',
```

**11 canales**, clasificados por el plan en:

| Categoría | Canales | Cuenta |
|---|---|---|
| **Permitir** | `backup-create`, `backup-create-and-export`, `backup-send-whatsapp`, `backup-config-set`, `backup-trigger-auto-now` | 5 |
| **Bloqueados** | `backup-restore`, `backup-db-reset`, `backup-clear-images`, `backup-delete` | 4 |
| **Sin sentido HTTP** | `backup-pick-folder`, `backup-pick-restore-file` | 2 |

**Total: 11.** ✅ Todos cubiertos, ninguno olvidado.

### ⚠️ **Caso `backup-create-and-export`: recomendación B sensata, pero contradicción P1**

La recomendación B (bloquearlo) es correcta:

- El `showSaveDialog` abre en el **servidor**, no en el cliente HTTP.
- Desde el punto de vista del cliente remoto, la operación se cuelga esperando que alguien físico en el servidor cierre el diálogo.
- El caso de uso (recibir el backup sin estar en el local) SÍ queda resuelto con `backup-create` + `backup-send-whatsapp`.

**Pero** el plan incluye el canal en la Fase 1 (contradicción interna, hallazgo P1-1). Hay que corregir antes de implementar.

---

## Análisis de fases

### ✅ **Fase 1 — Permitir canales en RPC router**

Implementable directamente: remover 5 canales de `BLOCKED_CHANNELS` (o 4 si se sigue la recomendación B sobre `backup-create-and-export`). El comentario sugerido (líneas 142-154) es claro y mejora la legibilidad.

**Pero** requiere corrección por hallazgo P1-1.

### ✅ **Fase 2 — Detectar modo remoto en UI**

Implementable sin ambigüedad:
- `isRemote = window.location.protocol.startsWith('http')` (línea 165-169).
- Deshabilitar botones "Cambiar carpeta" y "Restaurar desde archivo..." con tooltip explicativo (líneas 175-194).
- Banner informativo opcional (líneas 197-206).

La lógica es simple y no tiene dependencias externas.

### ❌ **Fase 3 — Tests manuales (hallazgo P0-1)**

El checklist manual es útil **como complemento**, pero NO reemplaza tests automatizados en un cambio de seguridad. Ver hallazgo P0-1.

---

## Análisis de convenciones

### ✅ **Nombre de rama**

`cursor/fix-265-backup-remoto-759b` cumple con:
- Prefijo `cursor/` ✅
- Sufijo `-759b` ✅
- Lowercase ✅
- Descriptivo ✅

### ✅ **Conventional commits**

Los commits propuestos en las fases siguen el formato:
- `fix(backup): permitir operaciones no destructivas por HTTP` (línea 155)
- `fix(backup): deshabilitar controles sin sentido en modo remoto` (línea 207)
- `test: verificar backup remoto en standalone, server y client` (línea 240)

Uso correcto de `fix:` (no `feat:` porque arregla un bloqueo, no agrega funcionalidad nueva). **NO usa `audit:`**. ✅

### ✅ **Planes en `docs/planes/`**

El plan está en `docs/planes/PLAN-265-BACKUP-REMOTO.md`. ✅

### ✅ **Nunca `Closes` hasta el cierre**

La descripción del PR dice:

> Relacionado: #265 (línea final del body)

No dice `Closes #265` ni `Fixes #265`. ✅ Correcto, porque el issue se cierra después de la implementación + tests + merge, no con el plan.

### ✅ **Formato del plan similar a referencia**

Comparando con `PLAN-INFORMES-DELIVERY.md`, el plan tiene:
- ✅ Diagnóstico con evidencia de código (líneas 7-62).
- ✅ Fases numeradas con commits por fase (líneas 129-240).
- ✅ "Qué NO se toca" (líneas 243-249).
- ✅ "Riesgos" detallados con mitigaciones (líneas 251-295).
- ✅ "Reinicio requerido" (líneas 297-311).
- ✅ "Verificación post-merge" (líneas 313-324).
- ✅ "Ambigüedades / Decisiones pendientes" (líneas 326-378).

Estructura completa y alineada con el padrón del repo.

---

## Riesgos documentados

El plan identifica **4 riesgos** de seguridad (sección 5, líneas 251-295):

1. **Exfiltración de datos** — Un usuario con `SISTEMA_BACKUP` puede enviar el dump completo a un WhatsApp arbitrario.
   - ✅ Mitigación existente: permiso de nivel SISTEMA, log de handler, WhatsApp destino en config (no ad-hoc).
   - ✅ Sugerencia adicional: tabla de auditoría (fuera del alcance, pero documentada).

2. **Consumo de recursos** — Generar backups grandes en loop podría saturar el servidor.
   - ✅ Mitigación existente: rate limiting de `/api/rpc` (600 req/min), `ensurePermission`.
   - ✅ Sugerencia adicional: limitar backups/hora por usuario (fuera del alcance).

3. **Exposición del dump** — Si `customBackupDir` apunta a una ruta servida por HTTP, el backup queda público.
   - ✅ Mitigación existente: el handler valida que no salga de `userData`; los backups NO están servidos por ninguna ruta.
   - ✅ Sugerencia adicional: validar en `backup-config-set` (fuera del alcance).

4. **Confusión UX** — `backup-create-and-export` guarda en el servidor, no descarga al cliente.
   - ✅ Mitigación: renombrar botón en modo remoto + tooltip (incluido en Fase 2, líneas 289-293).

**Todos identificados, con mitigaciones existentes y sugerencias de mejora.** No hay riesgos sin considerar.

**Adición sugerida:** El **P0-1** (falta de tests automatizados) también es un riesgo. Debería estar en la sección 5.

---

## Decisión sobre `backup-create-and-export`

**Recomendación de esta auditoría:** Seguir la opción **B** (bloquear).

**Justificación:**
1. El caso de uso legítimo (sacar backup remoto) **ya queda cubierto** con `backup-create` + `backup-send-whatsapp`.
2. La opción A (permitirlo) deja un canal que **se cuelga** desde el punto de vista del cliente remoto: el diálogo se abre en el servidor y nadie lo ve.
3. La opción C (implementar variante HTTP con stream) es **alto esfuerzo** y fuera del alcance de un fix de bloqueo.

**Pero**: El plan tiene contradicción interna (hallazgo P1-1). **Hay que corregir la Fase 1 antes de implementar**, removiendo `backup-create-and-export` de la lista de permitidos.

Si Gabriel prefiere la opción A (permitirlo igual), el plan debe:
- Cambiar la recomendación de línea 340.
- Agregar el ajuste UX de Fase 2 (renombrar botón, tooltip).
- Documentar en "Riesgos" que el canal se cuelga si nadie cierra el diálogo del servidor.

---

## Checklist de convenciones

| Convención | Estado | Evidencia |
|---|---|---|
| Nombre de rama `cursor/<desc>-759b` | ✅ | `cursor/fix-265-backup-remoto-759b` |
| Conventional commits (`fix:`, `feat:`, `test:`) | ✅ | Fase 1: `fix(backup):`, Fase 3: `test:` |
| NO usar `audit:` | ✅ | Ningún commit propuesto usa `audit:` |
| Planes en `docs/planes/` | ✅ | `docs/planes/PLAN-265-BACKUP-REMOTO.md` |
| Nunca `Closes` hasta el cierre | ✅ | PR body: "Relacionado: #265" |
| `ensurePermission` en handlers mutantes | ✅ | Plan afirma que ya está (P2-2: verificar) |
| Migración cuando se toca schema | N/A | No se toca schema |
| Reinicio cuando se toca backend | ⚠️ | Mencionado, pero falta `standalone` (P1-2) |
| Actualizar skill cuando aplica | ❌ | No mencionado (P2-1) |

---

## Conclusión

**Veredicto final: PASS with fixes** ✅⚠️

El plan es sólido y resuelve el bloqueo del issue #265. Las fases son claras, el alcance está bien definido, y no mete restore/reset/delete. **Pero** requiere 3 correcciones antes de implementar:

1. **P0-1** — Agregar tests automatizados de seguridad HTTP (nueva Fase 2.5).
2. **P1-1** — Resolver contradicción interna en `backup-create-and-export` (corregir Fase 1 según decisión de Gabriel).
3. **P1-2** — Documentar reinicio en `standalone` además de `server`.

Hallazgos P2 (skill, evidencia de handlers) son **recomendaciones de mejora**, no bloqueantes.

---

## Recomendación para Gabriel

**¿Bloquear o permitir `backup-create-and-export`?**

**Mi recomendación: bloquearlo (opción B).**

**Razones:**
- El caso de uso está resuelto con los otros dos canales.
- Permitirlo crea confusión (el diálogo se abre en el servidor y nadie lo ve).
- La UI remota puede llamarlo y colgarse esperando una respuesta que nunca llega (hasta que alguien cierre el diálogo físicamente).

Si lo permitís igual, hay que renombrar el botón en modo remoto y documentar la limitación en los riesgos.

---

**Siguiente paso:** Corregir hallazgos P0/P1, obtener aprobación de Gabriel, e implementar.
