# Notas para la skill `frc-gourmet-expert` — Iniciativa Mobile PWA

> Acumulador de todo lo que, al terminar la iniciativa mobile, hay que **agregar a la skill**
> (`.claude/skills/frc-gourmet-expert/`). También sirve de **tracker de progreso** del run autónomo
> (sobrevive a compactación de contexto). Branch: `feat/mobile-pwa-cliente`.

---

## A. Tracker de progreso (estado vivo)

Leyenda: ⬜ pendiente · 🟦 en progreso · ✅ hecho · ⛔ bloqueado (acción manual del usuario)

### F0 — Cimientos
- ✅ Branch `feat/mobile-pwa-cliente` creada
- ✅ Plan persistido (`docs/arquitectura/mobile-pwa-plan.md`)
- ✅ Este doc de notas creado
- ⬜ `projects/mobile` (application) scaffold
- ⬜ Path-alias `@frc/shared-core` + barrel public-api
- ⬜ PWA shell mínimo que compila
- ⬜ `npm run build` desktop sigue verde + build mobile OK
- ⬜ Commit F0

### F1 — Capa de datos + auth
- ⬜ Script generador `api-http.generated.ts` (parsea `preload.ts`)
- ⬜ Transporte RPC HTTP (Bearer + refresh 401 + cola)
- ⬜ Reuso de la lógica del repositorio sobre el shim
- ⬜ Login HTTP (`/api/auth/login` + refresh)
- ⬜ Estado global "sin conexión"
- ⬜ Commit F1

### F2 — Infra server
- ⬜ `@fastify/static` sirviendo `/app` → `dist/mobile`
- ⛔ TLS del mesh (necesita datos headscale del usuario)
- ⬜ Commit F2

### F3 — Shell mobile + imágenes
- ⬜ Navegación mobile (bottom-nav / drawer)
- ⬜ Theming dark/light
- ⬜ Resolución de imágenes vía `/api/files` (fetch→blobURL)
- ⬜ Commit F3

### F4..Fn — Olas administrativas
- ⬜ Ola 1 RRHH · ⬜ Ola 2 Financiero · ⬜ Ola 3 Compras · ⬜ Ola 4 Productos · ⬜ Ola 5 Clientes/Comisiones

---

## B. Contenido a agregar a la skill (se va llenando durante la ejecución)

### B.1 Nuevo doc propuesto: `architecture/mobile-pwa.md`
- Estructura multi-proyecto del workspace (`projects/mobile` + `@frc/shared-core`).
- Diagrama de capas PWA → `/api/rpc`.
- Cómo funciona el shim `apiHttp` y el generador desde `preload.ts`.
- Auth HTTP (login/refresh, Bearer, manejo de 401).
- Hosting por Fastify (`/app`) + TLS del mesh.
- Política offline (network-only para data, SW solo app-shell).

### B.2 Correcciones a docs existentes de la skill
- `architecture/cliente-servidor.md`: aclarar que **`repository-http.service.ts` quedó como skeleton**
  y que el `mode=client` real usa el **monkey-patch de `ipcRenderer.invoke` en preload**, NO la clase HTTP.
  (La sección "F6 Mobile (fuera de scope)" pasa a apuntar a `architecture/mobile-pwa.md`.)
- `architecture/overview.md`: "Passwords en texto plano" está **desactualizado** — el server usa
  `bcrypt` (`verifyPassword`). Revisar también el estado de auth en `auth-permissions.md`.

### B.3 Quick-facts a actualizar en el índice de la skill
- Agregar un 4º modo conceptual: PWA mobile (browser) que habla al `mode=server` por HTTP.
- Nota: la PWA reutiliza `@frc/shared-core` (entities/enums/abstract repo/servicios browser-safe) y
  **no** reutiliza UI del desktop.

### B.4 Reglas/convenciones nuevas detectadas (candidatas a memoria + skill)
- (se irá llenando: patrones UI mobile elegidos, librerías, breakpoints tablet/phone, etc.)

---

## C. Decisiones técnicas tomadas durante la ejecución (bitácora)

- (fecha) — decisión — motivo.
