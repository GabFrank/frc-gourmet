<!--
Título del PR: seguí conventional commits en español →  tipo(scope): descripción
  tipos: feat | fix | docs | refactor | chore | test | perf
  ej:   feat(compras): pago mixto de cuota con varias formas de pago
Completá las secciones que apliquen y borrá las que no.
-->

## Resumen

<!-- Qué cambia y por qué, en 1-3 líneas. -->

## Cambios

<!-- Detalle de los cambios. Agrupá por capa (backend/IPC/frontend), dominio o fase.
     Usá tablas si ayuda (Handler | Permiso | Canales). Mencioná archivos clave. -->

## Verificación

<!-- Cómo se validó. Dejá los comandos con su resultado (exit code / N tests OK).
     Recordá: la app no se corre con `npm start`; validar por compilación + tests. -->

- [ ] `npm run check` (AOT producción) → OK
- [ ] `npm run build:mobile` → OK  <!-- si tocaste projects/mobile -->
- [ ] Tests: `npm run test:<...>` → N/N OK

## ⚠️ Migración / Reinicio

<!-- ¿Hay migración nueva (driver-aware, idempotente)? ¿Requiere reiniciar la app
     (backend/handlers/preload/main/entidad/database.config) o es solo Angular
     (hot reload)? Impacto en roles/permisos sembrados. Borrar si no aplica. -->

## Docs

<!-- Skill `frc-gourmet-expert` y/o `docs/` actualizados. Borrar si no aplica. -->

## Pendiente

<!-- Fuera de alcance / próximas fases / diferido documentado. Borrar si no aplica. -->

## Notas

<!-- Lo que el revisor deba saber: no probado en vivo, decisiones abiertas,
     riesgos, etc. Borrar si no aplica. -->
