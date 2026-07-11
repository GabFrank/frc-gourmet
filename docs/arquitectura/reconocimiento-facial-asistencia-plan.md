# Plan: Marcación de asistencia con reconocimiento facial (PWA)

> Estado: **IMPLEMENTADO (F1–F4)**. Branch: `claude/facial-recognition-attendance-r7ahb0`.
> Objetivo: que los funcionarios fichen entrada/salida desde un tablet en la entrada usando
> reconocimiento facial, de la forma más eficiente y confiable, sin exponer imágenes.

## Estado de implementación

- **F1 (datos)** ✅ — `FuncionarioRostro`, columnas `metodo_registro`/`similitud_facial`, migración
  driver-aware (embedding como `text` JSON en ambos drivers), seeds `FACIAL_*`.
- **F2 (enrollment)** ✅ — `FaceRecognitionService` (Human lazy) + `FaceCaptureComponent` compartidos;
  handler `enrolar/get/eliminar-rostro`; tab "Rostros" en desktop + página PWA. Bucket `rostros`.
- **F3 (fichaje)** ✅ — `fichar-facial`: match coseno 1:N (`elegirMejorMatch`, en `electron/utils/face-match.ts`),
  entrada/salida automática reusando `crearAsistenciaInterno`; pantalla kiosco PWA con cola offline.
- **F4 (liveness + tuning + tests)** ✅ — liveness **server-authoritative** con `antispoof`+`liveness`
  de Human (scores `real`/`live` ≥ `FACIAL_LIVENESS_MIN`); test puro `npm run test:fichaje-facial`.

### Decisiones resueltas (vs. §7 abajo)

1. **Auth del kiosco:** la pantalla de fichaje va detrás de `authGuard` (usuario kiosco logueado en el
   tablet) y `fichar-facial` exige `RRHH_ASISTENCIA_REGISTRAR` — reusa el auth existente, sin infra nueva.
   Device-token queda como mejora futura.
2. **Entrada/salida:** auto-detección (sin registro hoy → ENTRADA; entrada sin salida → SALIDA; ambas →
   YA_COMPLETO), mostrada en pantalla.
3. **Liveness MVP:** en vez de blink+Z a mano, se usan los modelos dedicados `antispoof` (foto/pantalla) y
   `liveness` de Human — cubren el intent de "profundidad/prueba de vida" y son server-authoritative.
4. **Modelo:** `faceres` 1024-D. Pendiente medir en el tablet real y ajustar `FACIAL_UMBRAL_SIMILITUD`.

> **Requisito operativo:** correr `npm run models:face` una vez por máquina/deploy para bajar los pesos de
> Human a `assets/models/human/` (no se versionan). Sin eso, las pantallas de rostro muestran error de carga.

## 1. Decisiones tomadas

- **Enrollment (registrar la cara):** en **ambos** — RRHH desktop (webcam) y PWA/tablet (modo admin).
- **Liveness (anti-spoofing) v1:** **MVP = parpadeo (blink/EAR) + profundidad Z** del face-mesh. Sin
  modelo dedicado en v1.
- **Motor de ML:** **on-device en el browser** con `@vladmandic/human` (MIT, mantenido). El server
  **nunca recibe la imagen**, solo el embedding (vector). Match 1:N en JS plano en el server (sin
  `@tensorflow/tfjs-node`, sin binarios nativos en el build Electron).

## 2. Arquitectura

```
Tablet en la entrada (PWA, modo client)          Server (nodo Electron modo server, Fastify)
  cámara getUserMedia (HTTPS obligatorio)
  → @vladmandic/human en WebWorker (WebGL)
     detección → alineación (face-mesh)
     → liveness (parpadeo + Z-depth)
     → embedding 1024-D (Float32)
  → POST solo { embedding, tipo?, deviceId,     ──►  match 1:N euclidiano en JS plano
     timestamp, livenessOk }                          umbral + margen contra 2º candidato
                                                       → identifica Funcionario
                                                       → crea/actualiza Asistencia (entrada|salida)
                                                  ◄──  { funcionario, tipo, asistencia, similitud }
  muestra "Hola Juan — ENTRADA 08:03" (verde /
  ámbar si tardanza)
```

**Por qué on-device:** menor latencia (sin mandar JPEG por LAN), privacidad (solo vectores ~4 KB,
no reversibles a foto), y **evita `@tensorflow/tfjs-node`** — la dependencia nativa que rompería el
empaquetado de Electron. Modelos (~8–15 MB) cacheados por el service worker.

## 3. Lo que YA existe en el repo (a favor)

| Pieza | Dónde |
|---|---|
| Cámara en vivo en PWA (getUserMedia + canvas) | `projects/mobile/src/app/pages/upload/document-scanner.component.ts` |
| HTTPS (requisito de getUserMedia) | túnel `startTunnel()` (remote-tunnel.handler) + listener HTTPS 7443 |
| Ruta Fastify pública sin JWT (patrón) | `electron/server/qr-upload-routes.ts` (`/api/qr-upload/:id`) |
| Servir assets estáticos (los modelos ML) | `@fastify/static` sirve `dist/mobile` en `/` |
| Modelo de asistencias | `Asistencia`, `Turno`, `FuncionarioTurno`, penalización auto por tardanza |
| Lógica de creación con tardanza | `asistencias.handler.ts` → `crearAsistenciaInterno` (L23) |
| `create-asistencia` alcanzable desde mobile | `api-channel-map.generated.ts` (ya mapeado) |
| Foto de referencia del funcionario | `persona.imageUrl` (bucket `profile-images`) |
| Device linking (para auth del kiosco) | `/vincular-dispositivo` + device grant (auth-routes) |
| Adjunto polimórfico con tipo `ASISTENCIA` | `adjuntos.handler.ts` (para foto de auditoría opcional) |

## 4. Gaps a construir

1. Sin librería de ML → agregar `@vladmandic/human` + servir sus modelos.
2. Sin entidad de embeddings → nueva `FuncionarioRostro`.
3. Sin separación entrada/salida → hoy `create-asistencia` graba la `Asistencia` completa; falta lógica
   "entrada si no hay hoy / salida si ya hay entrada".
4. Asistencias en mobile es read-only → falta UI de fichaje + UI de enrollment.
5. Liveness → parpadeo + Z (salen del face-mesh de Human).

## 5. Fases

### F1 — Capa de datos (backend, requiere reinicio)

**Entidad `FuncionarioRostro`** (`src/app/database/entities/rrhh/funcionario-rostro.entity.ts`):

```
@Entity('funcionario_rostros')
@Index(['funcionario'])
FuncionarioRostro extends BaseModel {
  funcionario: Funcionario        // ManyToOne, funcionario_id
  embedding: string               // text/jsonb — JSON.stringify(number[])
  dimension: number               // 1024
  modelo: string                  // 'HUMAN-FACERES-1024' (UPPERCASE, versionado)
  thumbnailUrl?: string           // app://... opcional (auditoría); v1 puede quedar null
  capturadaEn: Date
  activo: boolean                 // soft-delete / re-enroll
}
```

- Guardar **3–5 vectores por funcionario** (no promediar). ~4 KB × 5 × 50 ≈ 1 MB total.
- Registrar en `database.config.ts` → `getEntitiesList()` (L330).

**Columnas additivas en `asistencias`** (auditoría del método):
- `metodo_registro` varchar nullable — `'FACIAL' | 'MANUAL'`.
- `similitud_facial` numeric nullable — score del match.

**Migración** driver-aware (`src/app/database/migrations/<epoch-ms>-AddReconocimientoFacial.ts`):
- `CREATE TABLE IF NOT EXISTS funcionario_rostros (...)` — `embedding` = `jsonb` en Postgres / `text`
  en SQLite; branch por `queryRunner.connection.options.type === 'postgres'`.
- `ALTER TABLE asistencias ADD COLUMN ... IF NOT EXISTS` para las 2 columnas.
- Timestamp real con `date +%s%3N`. Registrar en `getMigrations()` (L557).

**Config RRHH** (seed en `configuracion-rrhh.handler.ts`, tipo NUMBER):
- `FACIAL_UMBRAL_SIMILITUD` (default 0.6)
- `FACIAL_MARGEN_MIN` (default 0.05) — margen mínimo contra el 2º candidato.
- `FACIAL_LIVENESS_OBLIGATORIO` (BOOLEAN, default true)

### F2 — Enrollment (registrar caras)

**Handler `asistencia-facial.handler.ts`** (nuevo, registrado en `main.ts`; queda en `handlerRegistry`
→ disponible por `/api/rpc`):
- `enrolar-rostro({ funcionarioId, embedding, dimension, modelo, thumbnailBase64? })` — permiso
  `RRHH_FUNCIONARIO_EDITAR`. Guarda el vector; si viene thumbnail, `saveFileToBucket` (bucket nuevo
  `rostros` en los 3 lugares: `file-save.utils.ts`, `main.ts:registerAppProtocol`, `file-routes.ts`).
- `get-rostros-funcionario(funcionarioId)` — lista los enrolados (para gestionar/borrar).
- `eliminar-rostro(id)` — soft-delete; invalida cache de embeddings.

**Desktop** — nuevo tab **"Rostros"** en `src/app/pages/rrhh/funcionarios/funcionario-detalle/`:
captura 3–5 con webcam (getUserMedia funciona en el renderer Electron), corre Human, muestra
thumbnails, guarda vía `RepositoryService`.

**PWA** — página admin `projects/mobile/src/app/pages/rrhh/funcionarios/enrolar-rostro.page.ts`
(detrás de `authGuard` + permiso). Mismo flujo de captura.

### F3 — Fichaje (marcación)

**Handler `fichar-facial(payload)`** en `asistencia-facial.handler.ts`:
1. Cargar en memoria (cache invalidable) los `FuncionarioRostro` activos con el mismo `modelo`/`dimension`.
2. Distancia euclidiana query vs cada uno → mejor + 2º mejor.
3. Aceptar si `similitud ≥ FACIAL_UMBRAL_SIMILITUD` **y** margen `≥ FACIAL_MARGEN_MIN` **y**
   (`livenessOk` o `!FACIAL_LIVENESS_OBLIGATORIO`).
4. **Entrada vs salida:** buscar `Asistencia` de hoy del funcionario.
   - Sin registro → crear con `horaEntrada = now` (reusar `crearAsistenciaInterno`: turno, tardanza,
     penalización auto). `metodo_registro='FACIAL'`, `similitud_facial`.
   - Con entrada y sin salida → `horaSalida = now`, calcular `horasTrabajadas`.
   - Con ambas → devolver "ya fichó salida hoy" (o abrir 2º turno; decidir en implementación).
5. Devolver `{ funcionario, tipo, asistencia, similitud }`.

**PWA** — página lazy `projects/mobile/src/app/pages/rrhh/fichaje/fichaje-facial.page.ts`:
- Cámara con óvalo guía; Human en WebWorker (WebGL, WASM fallback).
- Liveness: parpadeo (EAR) + Z-depth del mesh.
- Al matchear → `repo.ficharFacial(...)` → feedback grande (verde / ámbar si tardanza).
- **Cola offline** en localStorage si el server no responde (reintento).
- **Lazy load** de la ruta para no inflar el bundle general con Human + TF.js.

**Modelos de Human:** copiar a `projects/mobile/src/assets/models/human/` y sumar el glob en
`angular.json` (proyecto `mobile` → `assets`). Se sirven en `/assets/models/...` por `@fastify/static`.
Human con `modelBasePath: '/assets/models/human'`. Para el desktop, replicar en `src/assets/models/human/`.

### F4 — Liveness + tuning + integración fina

- Ajustar umbral/margen con datos reales (config RRHH ya editable).
- Guía de encuadre (óvalo), input size ~224, correr detección solo con cara presente.
- Foto de auditoría opcional por fichada → `Adjunto(entidadTipo='ASISTENCIA', entidadId=asistenciaId)`
  (convención ya existe). Off por default (privacidad).

## 6. Checklist de capas (regla del proyecto)

1. **Entity** `FuncionarioRostro` + `database.config.ts:getEntitiesList()`.
2. **Migración** + `getMigrations()`.
3. **Handler** `asistencia-facial.handler.ts` + registro en `main.ts`.
4. **Preload** — exponer `enrolarRostro`, `getRostrosFuncionario`, `eliminarRostro`, `ficharFacial`
   (o `callIpc`). **Regenerar** el mapa mobile: `npm run generate:mobile-api`.
5. **RepositoryService** abstract + `repository-ipc.service.ts` — métodos nuevos.
6. `npm run check` (AOT) antes de pushear. Validar mobile: `npx ng build mobile`.

## 7. Decisiones pendientes (para resolver al implementar)

1. **Auth del endpoint de fichaje** (tablet compartido sin usuario logueado):
   - **Recomendado:** device token reusando `/vincular-dispositivo` (el tablet es un dispositivo
     autorizado; la cara es la identidad del funcionario). Evita mantener una sesión de usuario abierta.
   - Alternativas: usuario "kiosco" dedicado con permiso `RRHH_ASISTENCIA_REGISTRAR`; o ruta pública
     estilo `qr-upload` (más superficie de riesgo).
2. **¿Auto-detectar entrada/salida o botones explícitos?** Recomendado: auto-detectar mostrando en
   pantalla qué se registrará; permitir override.
3. **Modelo de embedding:** `faceres` 1024-D (mejor precisión) vs `mobilefacenet` (más liviano). Arrancar
   con faceres; medir en el tablet real.
4. **Doble turno / segunda entrada el mismo día:** definir política (rechazar 2ª salida vs nuevo par).

## 8. Riesgos

- **HTTPS obligatorio** para `getUserMedia` — usar túnel HTTPS o listener LAN con cert (ya existe). HTTP
  plano no sirve.
- **Iluminación** = causa #1 de fallos → enrolar con la luz de la entrada; tablet sin contraluz.
- **Performance tablets baratos** → WebWorker, input size chico, detección solo con cara.
- **Cambio de modelo = re-enrollment total** → `modelo` versionado en la entidad.
- **Gemelos/hermanos parecidos** → umbral estricto + margen contra 2º candidato.
