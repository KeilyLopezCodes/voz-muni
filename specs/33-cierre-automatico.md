# SPEC 33 — Cierre automático de quejas resueltas

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 09, SPEC 17, SPEC 22, SPEC 25, SPEC 26, SPEC 27, SPEC 32
> **Fecha:** 2026-10-23
> **Objetivo:** Cerrar automáticamente, como tercer paso del job de SLA, las quejas en `resuelta` cuyo plazo de confirmación (`confirmacion_vence_en`) venció, avisando al vecino con `queja_resuelta` al resolver y con `queja_cerrada_automaticamente` al cerrar, y mostrar en el detalle que el cierre fue automático.

## Por qué existe esta spec

RF-30 pide cerrar automáticamente las quejas resueltas sin respuesta del vecino al vencer el plazo de confirmación. La sección 3 del documento dice que el vecino tiene 5 días hábiles para confirmar o reabrir y que, sin respuesta, el sistema cierra la queja.
SPEC 04 ya implementa `cerrarPorVencimiento(ctx, confirmacionVenceEn)` en el dominio, y SPEC 27 guarda `tickets.confirmacion_vence_en`. SPEC 32 deja un único `sla.job.ts`.
SPEC 27 registró un riesgo: el correo `queja_resuelta` tenía que llegar antes de activar el cierre automático, porque si no, el sistema cerraría quejas que el vecino nunca supo que estaban resueltas. Esta spec lo agrega.

## Alcance

**Incluido:**

- Migración `0028_cierre_automatico`:
  - Plantillas `queja_resuelta` y `queja_cerrada_automaticamente` en `plantillas_notificacion` (SPEC 09).
  - Índice parcial sobre `confirmacion_vence_en` para las quejas en `resuelta`.
- **Cambio sobre SPEC 22:** `resolver` envía `queja_resuelta` al solicitante, con la solución, la fecha límite y el enlace `APP_URL/tickets/:id`, después de confirmar la transacción.
- `CierreAutomaticoService.procesar(ahora)`: reclama con `FOR UPDATE SKIP LOCKED` las quejas vencidas, aplica `cerrarPorVencimiento` con `actorId = null` y envía `queja_cerrada_automaticamente`.
- Las quejas en `resuelta` sin `confirmacion_vence_en` se ignoran, y se informa en el log cuántas hay.
- **Cambio sobre SPEC 32:** `sla.job.ts` agrega un tercer paso (alertas, escalamiento y cierre).
- **Cambio sobre SPEC 25:** `TicketDetalle` agrega `cierreAutomatico`, y el detalle muestra "Cerrada automáticamente porque venció el plazo de confirmación".
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Notificar el cierre automático a los internos (RF-32).
- La encuesta de satisfacción al cerrar (RF-37).
- Un recordatorio al vecino antes de que venza el plazo.
- Calcular al vuelo el plazo de las quejas resueltas sin `confirmacion_vence_en`.
- Reabrir una queja cerrada automáticamente. `cerrada` es final (sección 3).
- Correos de cambio de estado distintos de estos dos (el resto de RF-31).
- La edición de las plantillas desde la administración (RF-33).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0028_cierre_automatico.ts`

```sql
CREATE INDEX tickets_confirmacion_pendiente_idx
  ON tickets (confirmacion_vence_en) WHERE estado = 'resuelta';
```

El `up` también inserta en `plantillas_notificacion` (con `ON CONFLICT (clave) DO NOTHING`) estas dos plantillas:

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `queja_resuelta` | `VozMuni: resolvimos tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{solucion}}`, `{{fecha_limite}}`, `{{enlace}}` |
| `queja_cerrada_automaticamente` | `VozMuni: cerramos tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{enlace}}` |

```text
queja_resuelta:
Hola {{nombre}}:

Resolvimos tu queja "{{titulo}}" ({{numero}}). Esta es la solución:

{{solucion}}

Tienes hasta el {{fecha_limite}} para confirmar la solución o reabrir la queja en {{enlace}}
Si no respondes antes de esa fecha, la cerraremos.

queja_cerrada_automaticamente:
Hola {{nombre}}:

Cerramos tu queja "{{titulo}}" ({{numero}}) porque venció el plazo para confirmar la solución.
Puedes consultarla en {{enlace}}
```

- En los dos correos, `{{enlace}}` es `APP_URL + '/tickets/' + id`. Sin sesión, la ruta protegida lleva a `/login`, que vuelve a la queja por `state.desde` (SPEC 17).
- `{{fecha_limite}}` es `confirmacion_vence_en` en `America/Guatemala`, con fecha y hora (por ejemplo, "lunes 9 de noviembre de 2026, 23:59"). Lo arma `Intl.DateTimeFormat('es-GT', …)` en la capa de aplicación.
- `{{solucion}}` es `tickets.resolucion` (SPEC 26). `renderizar` la escapa en la versión html (SPEC 09).
- El `down` borra las dos plantillas y el índice.
- No hay tablas ni columnas nuevas.

### Cambio sobre SPEC 22: correo al resolver

Después de confirmar la transacción de `resolver`, `AtencionService` envía `queja_resuelta` al solicitante, si tiene correo. Funciona igual que los correos de SPEC 12 y SPEC 19:

- El envío no se espera.
- Un fallo se registra en el log y no cambia la respuesta `200`.
- Un solicitante sin correo no recibe nada.

La respuesta de `resolver` no cambia.

### `CierreAutomaticoService` (`backend/src/application/services/cierre-automatico.service.ts`)

```ts
// backend/src/domain/repositories/cierre-automatico-repository.ts
export interface CierreAutomaticoRepository {
  // En la transacción: SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` ids con
  // estado = 'resuelta' AND confirmacion_vence_en < ahora.
  reclamarVencidas(ahora: Date, limite: number, trx): Promise<number[]>;
  // Quejas en resuelta con confirmacion_vence_en NULL.
  contarSinPlazo(): Promise<number>;
}

export class CierreAutomaticoService {
  // Procesa por lotes de 200 hasta que no queden vencidas. Devuelve cuántas cerró.
  procesar(ahora: Date): Promise<number>;
}
```

Por cada queja reclamada, en una transacción por lote:

1. Se reconstituye el ticket con `TicketEscrituraRepository`.
2. Se llama a `cerrarPorVencimiento({ actorId: null, ahora }, confirmacionVenceEn)` (SPEC 04). Así queda una fila de `ticket_historial` de `resuelta` a `cerrada`, con `usuario_id` y `motivo` en `NULL`.
3. Se guarda `cerrado_en = ahora`.

Después de confirmar el lote, se envía `queja_cerrada_automaticamente` a cada solicitante con correo, con el mismo manejo de fallos que `resolver`.

- La condición `confirmacion_vence_en < ahora` es estricta. En el instante exacto del vencimiento el plazo sigue vigente, coherente con SPEC 04 y SPEC 27, y el vecino todavía puede confirmar.
- Si el vecino confirma o reabre mientras el job procesa la misma queja, el bloqueo de fila hace que una de las dos acciones gane. La otra encuentra la queja en otro estado: el job la salta, y el vecino recibe `409 TRANSICION_INVALIDA` (SPEC 27).
- Al terminar, si `contarSinPlazo()` es mayor que 0, se escribe en el log un aviso con la cantidad. Esas quejas no se cierran.
- La marca `escalado` (SPEC 32) no cambia al cerrar.

### Cambio sobre SPEC 32: tercer paso del job

`iniciarJobSla({ alertas, escalamiento, cierre }, config, reloj)`. En cada corrida, con el mismo `ahora`:

1. `AlertasSlaService.procesar`.
2. `EscalamientoService.procesar`.
3. `CierreAutomaticoService.procesar`.

Un error en un paso se registra en el log y no impide los siguientes. Las variables siguen siendo `SLA_JOB_ACTIVO` y `SLA_JOB_CRON`.

### Cambio sobre SPEC 25: detalle

```ts
export interface TicketDetalle {
  // … campos de SPEC 25, 26 y 27
  cierreAutomatico: boolean;   // estado === 'cerrada' y la última fila de historial a 'cerrada' tiene usuario_id NULL
}
```

Lo calcula `obtenerDetalle` de `KnexTicketLecturaRepository`, con la misma consulta de la última fila de historial que ya usa `informacionSolicitada` (SPEC 25).

### Frontend

| Elemento | Detalle |
| --- | --- |
| Detalle | En `SolucionQueja.tsx` (SPEC 26 y 27), si `cierreAutomatico`: "Cerrada automáticamente porque venció el plazo de confirmación", con la fecha de `cerradoEn` en `America/Guatemala`. Si la queja está `cerrada` sin cierre automático: "Solución confirmada" |
| Línea de tiempo | No cambia: el evento `estado` a `cerrada` ya muestra "VozMuni" como actor (SPEC 28) |
| Textos | `locales/es/tickets.json`, bajo `detalle.cierre.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: plantillas, job
CLAUDE.md
backend/
  src/
    server.ts                                         # iniciarJobSla con el cierre
    container.ts
    domain/repositories/cierre-automatico-repository.ts
    domain/repositories/ticket-lectura-repository.ts  # cierreAutomatico
    application/
      services/cierre-automatico.service.ts
      services/atencion.service.ts                    # correo queja_resuelta (SPEC 22)
      services/consulta-tickets.service.ts
    infrastructure/
      database/migrations/0028_cierre_automatico.ts
      repositories/knex-cierre-automatico-repository.ts
      repositories/knex-ticket-lectura-repository.ts
      jobs/sla.job.ts                                 # tercer paso (SPEC 32)
  tests/
    unit/sla/cierre-automatico.service.test.ts
    unit/jobs/sla.job.test.ts
    unit/atencion/atencion.service.test.ts            # correo al resolver
    db/schema.test.ts                                 # 0028
    db/cierre-automatico.test.ts                      # contra Postgres real
    db/atencion.api.test.ts                           # queja_resuelta
    db/tickets-lectura.api.test.ts                    # cierreAutomatico
frontend/
  src/
    features/tickets/api/tickets-api.ts               # cierreAutomatico
    features/tickets/mis-quejas/SolucionQueja.tsx
    locales/es/tickets.json
  tests/
    features/tickets/solucion-queja.test.tsx
```

## Plan de implementación

1. Crear la migración `0028_cierre_automatico.ts` con las dos plantillas y el índice. Ampliar `tests/db/schema.test.ts`: existen las plantillas con sus asuntos y el índice, y el `down` los elimina. Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
2. Enviar `queja_resuelta` desde `resolver` (SPEC 22). Ampliar `atencion.service.test.ts` y `tests/db/atencion.api.test.ts` con el enviador falso. Casos:
   - Al resolver, el solicitante con correo recibe `queja_resuelta` con la solución, la fecha límite en Guatemala y el enlace `APP_URL/tickets/<id>`.
   - Un solicitante sin correo no recibe nada.
   - Un fallo del enviador no cambia el `200`.
   - Una solución con `<script>` va escapada en el html.

   Verificación: `npm test` y `npm run test:db` pasan.
3. Crear `CierreAutomaticoRepository`, `KnexCierreAutomaticoRepository` y `CierreAutomaticoService`, con `cierre-automatico.service.test.ts` y falsos. Crear `tests/db/cierre-automatico.test.ts`. Casos:
   - Una queja `resuelta` con `confirmacion_vence_en` en el pasado queda `cerrada`, con `cerrado_en`, una fila de historial con `usuario_id` `NULL`, y el correo `queja_cerrada_automaticamente`.
   - Con `confirmacion_vence_en = ahora`, no se cierra.
   - Una queja en otro estado no se cierra.
   - Una queja `resuelta` sin `confirmacion_vence_en` no se cierra y aparece en el aviso del log.
   - Una segunda corrida no cierra ni envía nada nuevo.
   - Dos `procesar` simultáneos cierran cada queja una sola vez.
   - Si el vecino confirma la queja bloqueada por el job, una de las dos acciones gana y la otra no aplica cambios.
   - Más de 200 vencidas se cierran en varios lotes.
   - Un fallo del enviador no revierte el cierre.

   Verificación: `npm run test:db` y `npm test` pasan.
4. Agregar el tercer paso a `sla.job.ts` (SPEC 32) y conectarlo en `server.ts` y `container.ts`. Ampliar `sla.job.test.ts`:
   - Ejecuta los 3 pasos en orden con el mismo `ahora`.
   - Un error en el escalamiento no impide el cierre.

   Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan, y `npm start` registra el job programado.
5. Agregar `cierreAutomatico` a `TicketDetalle`, `obtenerDetalle` y `ConsultaTicketsService`. Ampliar `tests/db/tickets-lectura.api.test.ts`: una queja cerrada por el job devuelve `true`, una confirmada por el vecino devuelve `false`, y una en otro estado devuelve `false`. Verificación: `npm run test:db` pasa.
6. Frontend: agregar `cierreAutomatico` al tipo y mostrar el texto en `SolucionQueja.tsx`. Ampliar `solucion-queja.test.tsx`:
   - Con `cierreAutomatico`, muestra "Cerrada automáticamente…" con la fecha en Guatemala.
   - Cerrada sin cierre automático, muestra "Solución confirmada".
   - Sin botones en los dos casos.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
7. Actualizar la sección 6 del documento de definición (las plantillas y el tercer paso del job). Actualizar `CLAUDE.md`:
   - El cierre automático como tercer paso de `sla.job.ts`.
   - La condición estricta `confirmacion_vence_en < ahora`.
   - Que el cierre lo hace el sistema (`usuario_id` `NULL`).
   - Los correos `queja_resuelta` y `queja_cerrada_automaticamente`.
   - Que las quejas sin plazo se informan en el log.

   Verificación manual con el backend, `seed:dev` y `SLA_JOB_CRON='* * * * *'`: `tecnico@vozmuni.test` resuelve una queja, y el enviador de desarrollo registra `queja_resuelta` con la fecha límite y el enlace a `/tickets/:id`. Se adelanta `confirmacion_vence_en` con SQL. En menos de un minuto, la queja queda `cerrada`, el enviador registra `queja_cerrada_automaticamente`, y `vecino@vozmuni.test` ve en `/tickets/:id` "Cerrada automáticamente…" y "VozMuni" en la línea de tiempo.

## Criterios de aceptación

- [ ] La migración `0028_cierre_automatico` agrega las plantillas `queja_resuelta` y `queja_cerrada_automaticamente` y el índice parcial, y su `down` los elimina.
- [ ] Al resolver, el solicitante con correo recibe `queja_resuelta` con la solución, la fecha límite en `America/Guatemala` y el enlace `APP_URL/tickets/<id>`. Un fallo del envío no cambia la respuesta.
- [ ] El job cierra cada queja en `resuelta` con `confirmacion_vence_en < ahora` usando `cerrarPorVencimiento` con `actorId = null`. Fija `cerrado_en` y escribe una fila de historial con `usuario_id` `NULL`.
- [ ] Una queja con `confirmacion_vence_en = ahora`, en otro estado o sin `confirmacion_vence_en` no se cierra. Las que no tienen plazo se cuentan en un aviso del log.
- [ ] Ninguna queja se cierra ni se avisa dos veces, ni en corridas repetidas ni en corridas simultáneas, y una confirmación simultánea del vecino no produce un estado inconsistente.
- [ ] Cada queja cerrada por el job envía `queja_cerrada_automaticamente` al solicitante con correo, después de confirmar la transacción. Un fallo del envío no revierte el cierre.
- [ ] `sla.job.ts` ejecuta en cada corrida las alertas, el escalamiento y el cierre, en ese orden y con el mismo `ahora`, y un error en un paso no impide los siguientes.
- [ ] `GET /api/v1/tickets/:id` devuelve `cierreAutomatico: true` solo para las quejas cerradas por el sistema.
- [ ] El detalle muestra "Cerrada automáticamente porque venció el plazo de confirmación" o "Solución confirmada" según corresponda, con la fecha en `America/Guatemala`.
- [ ] Ningún asunto ni cuerpo de correo está escrito en `src/` fuera de la migración `0028_cierre_automatico`, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las plantillas, el tercer paso del job y la regla del cierre.

## Decisiones

- **Sí:** se agrega `queja_resuelta` al resolver, para cerrar el riesgo de SPEC 27. Revierte lo que se decidió en SPEC 27, y el usuario lo confirmó en esta spec.
- **Sí:** el enlace de `queja_resuelta` y de `queja_cerrada_automaticamente` es `APP_URL/tickets/:id`, porque confirmar y reabrir requieren sesión. Los demás correos siguen usando `/consulta?numero=`.
- **No:** `/consulta?numero=`, que no permite confirmar.
- **Sí:** el cierre es el tercer paso de `sla.job.ts` (alertas, escalamiento y cierre). Mantiene un solo cron y un solo interruptor.
- **No:** un job propio.
- **Sí:** la plantilla `queja_cerrada_automaticamente`, distinta de `queja_cerrada` de SPEC 27, que agradece una confirmación que no ocurrió.
- **Sí:** las quejas en `resuelta` sin `confirmacion_vence_en` se ignoran y se informan en el log. Nunca se inventa un plazo, coherente con SPEC 27.
- **No:** calcular el plazo al vuelo en el job.
- **Sí:** la condición `confirmacion_vence_en < ahora` es estricta, porque el instante exacto sigue siendo vigente para el vecino (SPEC 04).
- **Sí:** el detalle muestra que el cierre fue automático, con `cierreAutomatico` derivado del historial, sin una columna nueva.
- **Sí:** sin avisos internos. Es el desenlace normal de una queja resuelta. RF-32 puede agregarlos.
- **Sí:** se reutiliza el patrón de SPEC 31 y 32: reclamo con `SKIP LOCKED`, lotes de 200 y un servicio en `application/`. Los correos se envían después de confirmar cada lote.
- **Sí:** el texto de las plantillas, el formato de la fecha límite y los textos del detalle los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las quejas resueltas antes de esta spec nunca recibieron `queja_resuelta`, y se cerrarán sin aviso previo | Solo existen en desarrollo. Antes de activar el job en producción, todas las resoluciones habrán pasado por el correo nuevo. |
| Un vecino registrado por ventanilla sin cuenta activa (SPEC 13) recibe un enlace que pide iniciar sesión | El correo explica la fecha límite. La invitación de SPEC 13 le permite activar su cuenta. La consulta pública (RF-35) mostrará el estado sin sesión. |
| El correo se pierde o cae en spam, y la queja se cierra sin que el vecino se entere | Es el comportamiento que pide RF-30. El cierre automático también envía un correo, y la queja queda en "Mis quejas". |
| Activar el job por primera vez cierra muchas quejas de golpe | Se procesan en lotes de 200 dentro de la misma corrida, sin bloquear la API. |
| Encadena cambios sobre SPEC 22, 25 y 32, en Borrador | Se implementa después de SPEC 32. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Avisos internos del cierre (RF-32).
- Encuesta de satisfacción (RF-37).
- Recordatorio antes del vencimiento.
- Cálculo del plazo al vuelo.
- Edición de plantillas (RF-33) y demás correos de RF-31.

Cada uno de estos temas, cuando llegue, va en su propia spec.
