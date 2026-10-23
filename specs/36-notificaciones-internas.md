# SPEC 36 — Notificaciones en la aplicación para usuarios internos

> **Estado:** Borrador
> **Depende de:** SPEC 11, SPEC 15, SPEC 20, SPEC 21, SPEC 23, SPEC 27, SPEC 31, SPEC 32, SPEC 34
> **Fecha:** 2026-10-23
> **Objetivo:** Notificar en la campana de SPEC 31 a los usuarios internos que corresponde sobre asignaciones, comentarios (agrupados por queja), respuestas del vecino, reaperturas y traslados, escribiendo en `notificaciones` dentro de la transacción de cada caso de uso, y purgar las leídas después de un plazo configurable.

## Por qué existe esta spec

RF-32 pide que los usuarios internos reciban notificaciones en la aplicación de las asignaciones, los comentarios y las alertas de SLA.
Las alertas de SLA ya existen: `sla_alerta_*` (SPEC 31) y `sla_escalamiento` (SPEC 32), junto con la campana y la API de notificaciones. Faltan los avisos de las asignaciones y los comentarios. El usuario también eligió avisar de las reaperturas (pendiente de SPEC 27) y de los traslados.
SPEC 31 también dejó pendiente la retención de la tabla `notificaciones`.

## Alcance

**Incluido:**

- Migración `0031_notificaciones_internas`:
  - Columna `notificaciones.leida_en`, con relleno y `CHECK`.
  - Índice único parcial para agrupar los comentarios.
  - Parámetro `notificaciones_retencion_dias = 30`.
- 7 tipos nuevos de notificación:

  | `tipo` | Evento | Destinatarios |
  | --- | --- | --- |
  | `asignacion_recibida` | Asignar o reasignar técnico (SPEC 20) | El técnico nuevo |
  | `asignacion_retirada` | Reasignar técnico (SPEC 20) | El técnico anterior |
  | `comentario_nuevo` | Comentario público o nota interna (SPEC 23) | El técnico asignado y los internos que ya comentaron. Las notas internas, solo a quien tiene `comentarios.interno` |
  | `respuesta_vecino` | Comentario del solicitante que reanuda una queja en espera (SPEC 23) | El técnico asignado, o los coordinadores si no hay técnico |
  | `queja_reabierta` | Reabrir (SPEC 27) | El técnico asignado y los coordinadores de la dependencia |
  | `traslado_solicitado` | Solicitar un traslado (SPEC 21) | Quienes tienen `tickets.triage` |
  | `traslado_resuelto` | Aprobar, rechazar o dejar sin efecto una solicitud, o traslado directo (SPEC 21) | Quien lo solicitó y, si se aprobó, el técnico que tenía la queja |

- Reglas comunes de destinatarios:
  - Nunca se notifica al autor del evento.
  - Solo a usuarios activos.
  - Solo a quien hoy tiene la queja en su alcance de `tickets.ver` (SPEC 11).
- `comentario_nuevo` se agrupa: si el usuario ya tiene uno sin leer de esa queja, se actualiza la cantidad y la fecha en lugar de crear otro.
- Purga diaria de las notificaciones leídas con más de `notificaciones_retencion_dias` días, con una segunda programación en `correos.job.ts` (cambio sobre SPEC 34).
- **Cambio sobre SPEC 31:** marcar como leída también guarda `leida_en`.
- Frontend: los textos de los 7 tipos en la campana.
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `.env.example`.

**Fuera de alcance (para specs futuras):**

- Una página `/notificaciones` con todo el historial y filtros.
- Notificaciones en tiempo real (WebSocket o SSE). La campana sigue consultando cada 60 s (SPEC 31).
- Preferencias por usuario para silenciar tipos.
- Correos o SMS a los internos.
- Avisar del escalamiento al técnico y a los coordinadores (SPEC 32 lo dejó fuera).
- Avisar cuando un técnico retira su propia solicitud de traslado.
- Notificaciones al vecino dentro de la aplicación. Él recibe correos (SPEC 34 y 35).
- Una pantalla para editar `notificaciones_retencion_dias`.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0031_notificaciones_internas.ts`

```sql
ALTER TABLE notificaciones ADD COLUMN leida_en timestamptz NULL;
UPDATE notificaciones SET leida_en = creado_en WHERE leida;
ALTER TABLE notificaciones
  ADD CONSTRAINT notificaciones_leida_consistente CHECK (leida = (leida_en IS NOT NULL));

-- Una sola notificación de comentarios sin leer por usuario y queja.
CREATE UNIQUE INDEX notificaciones_comentario_sin_leer_uq
  ON notificaciones (usuario_id, ticket_id) WHERE tipo = 'comentario_nuevo' AND NOT leida;

-- Purga.
CREATE INDEX notificaciones_leidas_idx ON notificaciones (leida_en) WHERE leida;
```

El `up` también inserta en `parametros` (con `ON CONFLICT (clave) DO NOTHING`):

| `clave` | `valor` |
| --- | --- |
| `notificaciones_retencion_dias` | `30` |

El `down` borra el parámetro, los índices, el `CHECK` y la columna.

### Tipos y `datos`

| `tipo` | `datos` |
| --- | --- |
| `asignacion_recibida` | `{}` |
| `asignacion_retirada` | `{}` |
| `comentario_nuevo` | `{ "cantidad": number, "incluyeInternas": boolean }` |
| `respuesta_vecino` | `{}` |
| `queja_reabierta` | `{}` |
| `traslado_solicitado` | `{ "solicitudId": number }` |
| `traslado_resuelto` | `{ "solicitudId": number, "resultado": "aprobada" \| "rechazada" \| "sin_efecto" }` |

- Todas tienen `ticket_id`, y el texto lo arma el frontend con los archivos de traducción, como en SPEC 31.
- `traslado_resuelto` no incluye el motivo del rechazo. Se lee en la línea de tiempo interna (SPEC 28).

### Destinatarios (`backend/src/application/services/notificaciones-internas.service.ts`)

```ts
export interface EventoInterno {
  tipo: TipoNotificacionInterna;
  ticketId: number;
  autorId: number | null;           // nunca se le notifica
  candidatos: number[];             // calculados por el caso de uso según la tabla de alcance
  datos: Record<string, unknown>;
  requiereComentariosInternos?: boolean;   // notas internas
}

export class NotificacionesInternasService {
  // En la transacción del caso de uso: filtra los candidatos e inserta (o agrupa) las filas.
  notificar(evento: EventoInterno, trx): Promise<number>;
}
```

`notificar` aplica estos filtros, en orden:

1. Quita duplicados y quita al `autorId`.
2. Quita a los usuarios inactivos.
3. Quita a quien no tiene la queja en el alcance de `tickets.ver`. Usa `ConsultaTicketsService.obtenerParaAccion(destinatario, 'tickets.ver', ticketId)` de SPEC 11, que es la misma regla que aplica `GET /tickets/:id`.
4. Si `requiereComentariosInternos`, quita a quien no tiene `comentarios.interno`.

Los grupos de destinatarios salen de reglas por permiso y alcance, nunca del nombre del rol:

| Grupo | Regla |
| --- | --- |
| Técnico asignado | `tickets.asignado_a` |
| Coordinadores | Usuarios de la dependencia de la queja cuyo rol tiene `tickets.ver` con alcance `dependencia` (la misma regla de SPEC 31) |
| Supervisores | Usuarios cuyo rol tiene `tickets.triage` (la misma regla de SPEC 32) |
| Participantes | Autores de comentarios de la queja que no son el solicitante |

Las consultas de los grupos viven en un `DestinatariosRepository`, que se reutiliza en SPEC 31 y SPEC 32 para no repetirlas.

### Agrupación de `comentario_nuevo`

Se inserta con `INSERT … ON CONFLICT (usuario_id, ticket_id) WHERE tipo = 'comentario_nuevo' AND NOT leida DO UPDATE`, que hace lo siguiente:

- `datos.cantidad = cantidad + 1`.
- `datos.incluyeInternas = incluyeInternas OR <el comentario es interno>`.
- `creado_en = ahora`, para que la notificación vuelva arriba en la campana.

Cuando el usuario la marca como leída, el siguiente comentario crea una fila nueva con `cantidad = 1`.

### Puntos de notificación en los casos de uso

| Spec | Caso de uso | Notificación |
| --- | --- | --- |
| SPEC 20 | Asignar técnico | `asignacion_recibida` al técnico nuevo. Si había otro, `asignacion_retirada` al anterior |
| SPEC 23 | Crear un comentario del solicitante que reanuda la queja | `respuesta_vecino` al técnico asignado, o a los coordinadores si no hay técnico. No genera además un `comentario_nuevo` |
| SPEC 23 | Crear cualquier otro comentario | `comentario_nuevo` agrupado al técnico asignado y a los participantes. Si es interno, con `requiereComentariosInternos` |
| SPEC 27 | Reabrir | `queja_reabierta` al técnico asignado y a los coordinadores |
| SPEC 21 | Solicitar un traslado | `traslado_solicitado` a los supervisores |
| SPEC 21 | Aprobar, rechazar o dejar sin efecto una solicitud | `traslado_resuelto` al solicitante y, si se aprobó, al técnico que tenía la queja (se toma `asignado_a` antes de aplicar `trasladar`) |
| SPEC 21 | Traslado directo del supervisor | `traslado_resuelto` con `resultado: 'aprobada'` al técnico que tenía la queja |

- Todo se escribe en la misma transacción del caso de uso. Si se revierte, no queda notificación.
- Un fallo al notificar revierte el caso de uso, porque es una escritura en la misma base y no un canal externo. A diferencia del correo (SPEC 34), aquí no hay un servicio externo que pueda fallar por separado.
- Editar un comentario (SPEC 23) no notifica.

### Purga (cambio sobre SPEC 34)

```ts
export class NotificacionesService {
  // SPEC 31, más:
  // DELETE de las leídas con leida_en < ahora - retencion. Devuelve cuántas borró.
  purgarLeidas(ahora: Date): Promise<number>;
}
```

- `correos.job.ts` suma una segunda programación de node-cron, independiente de la de correos, con `NOTIFICACIONES_PURGA_CRON` (por defecto `0 3 * * *`, a las 03:00 en `America/Guatemala` con la opción `timezone` de node-cron). Se activa con el mismo `CORREOS_JOB_ACTIVO`.
- Las no leídas nunca se purgan.
- `notificaciones_retencion_dias` debe ser un entero de 1 a 365. Si falta o no es válido, la purga no borra nada y registra un error en el log.
- El `DELETE` es idempotente, así que no hace falta coordinar varias instancias.

### Cambio sobre SPEC 31: marcar como leída

`PATCH /api/v1/notificaciones/:id` y `POST /api/v1/notificaciones/marcar-leidas` también fijan `leida_en = ahora`. La respuesta no cambia.

### Frontend

`CampanaNotificaciones` (SPEC 31, en `shared/notificaciones/`) suma los textos de los 7 tipos. Todos enlazan a `/tickets/:id`:

| `tipo` | Texto |
| --- | --- |
| `asignacion_recibida` | "Te asignaron la queja <numero>" |
| `asignacion_retirada` | "La queja <numero> se asignó a otro técnico" |
| `comentario_nuevo` | "1 comentario nuevo en <numero>" o "<cantidad> comentarios nuevos en <numero>", con "(incluye notas internas)" si corresponde |
| `respuesta_vecino` | "El vecino respondió en <numero>. La queja volvió a En proceso" |
| `queja_reabierta` | "Se reabrió la queja <numero>" |
| `traslado_solicitado` | "Se solicitó trasladar la queja <numero>" |
| `traslado_resuelto` | "Se aprobó el traslado de <numero>", "Se rechazó el traslado de <numero>" o "El traslado de <numero> quedó sin efecto" |

Los textos van en `locales/es/comun.json`, bajo `notificaciones.*`, con la pluralización de i18next.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: notificaciones.leida_en, tipos, parámetro
CLAUDE.md
backend/
  .env.example                                         # NOTIFICACIONES_PURGA_CRON
  src/
    container.ts
    infrastructure/config/env.ts
    domain/notificaciones/tipos-notificacion.ts        # TipoNotificacionInterna y sus datos
    domain/repositories/destinatarios-repository.ts
    domain/repositories/notificacion-repository.ts     # insertar, agrupar, purgar (SPEC 31)
    application/services/
      notificaciones-internas.service.ts
      notificaciones.service.ts                        # purgarLeidas, leida_en (SPEC 31)
      alertas-sla.service.ts  escalamiento.service.ts  # usan DestinatariosRepository (SPEC 31, 32)
      asignacion.service.ts                            # SPEC 20
      comentarios.service.ts                           # SPEC 23
      confirmacion.service.ts                          # SPEC 27
      traslados.service.ts                             # SPEC 21
    infrastructure/
      database/migrations/0031_notificaciones_internas.ts
      repositories/knex-destinatarios-repository.ts
      repositories/knex-notificacion-repository.ts
      jobs/correos.job.ts                              # programación de la purga (SPEC 34)
  tests/
    unit/notificaciones/notificaciones-internas.service.test.ts
    unit/jobs/correos.job.test.ts
    unit/env.test.ts
    db/schema.test.ts                                  # 0031
    db/notificaciones-internas.test.ts                 # los 7 tipos contra Postgres real
    db/notificaciones.api.test.ts                      # leida_en y purga
frontend/
  src/
    shared/notificaciones/CampanaNotificaciones.tsx
    locales/es/comun.json
  tests/
    shared/campana-notificaciones.test.tsx
```

## Plan de implementación

1. Crear la migración `0031_notificaciones_internas.ts` y ampliar `tests/db/schema.test.ts`:
   - Existen `leida_en`, el `CHECK`, el índice único parcial, el índice de purga y el parámetro.
   - Las notificaciones leídas antes de la migración quedan con `leida_en = creado_en`.
   - Dos `comentario_nuevo` sin leer del mismo usuario y queja violan el índice único.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
2. Actualizar el marcado de leídas para fijar `leida_en` (SPEC 31) y ampliar `notificaciones.api.test.ts`. Verificación: `npm run test:db` pasa.
3. Crear `DestinatariosRepository` y su implementación Knex, con los 4 grupos, y hacer que `AlertasSlaService` (SPEC 31) y `EscalamientoService` (SPEC 32) lo usen sin cambiar su comportamiento. Verificación: `tests/db/alertas-sla.test.ts` y `escalamiento.test.ts` pasan sin cambios.
4. Crear `domain/notificaciones/tipos-notificacion.ts` y `NotificacionesInternasService`, con `notificaciones-internas.service.test.ts` y falsos. Casos:
   - Se quitan el autor, los duplicados y los inactivos.
   - Se quita a quien no tiene la queja en su alcance de `tickets.ver`.
   - Con `requiereComentariosInternos`, se quita a quien no tiene `comentarios.interno`.

   Verificación: `npm test` pasa.
5. Conectar las notificaciones en SPEC 20 (asignación) y SPEC 27 (reapertura). Crear `tests/db/notificaciones-internas.test.ts`. Casos:
   - El coordinador asigna a `tecnico@vozmuni.test`, que recibe `asignacion_recibida`. El coordinador no recibe nada.
   - Una reasignación notifica al técnico nuevo y al anterior.
   - El vecino reabre: el técnico y el coordinador reciben `queja_reabierta`.
   - Si reabre el coordinador, solo el técnico recibe la notificación.

   Verificación: `npm run test:db` pasa.
6. Conectar SPEC 23 (comentarios). Ampliar `notificaciones-internas.test.ts`. Casos:
   - El técnico comenta: el coordinador que ya había comentado recibe `comentario_nuevo` con `cantidad = 1`, y un segundo comentario lo deja en 2 sin fila nueva.
   - Después de marcarla como leída, el siguiente comentario crea otra con `cantidad = 1`.
   - Una nota interna no llega a quien no tiene `comentarios.interno`, y marca `incluyeInternas`.
   - Un participante que ya no tiene la queja en su alcance (por ejemplo, un técnico reasignado) no recibe nada.
   - El vecino responde en espera: el técnico recibe `respuesta_vecino`, y no `comentario_nuevo`.
   - Sin técnico asignado, la reciben los coordinadores.
   - Un comentario del vecino fuera de la espera llega como `comentario_nuevo`.

   Verificación: `npm run test:db` pasa.
7. Conectar SPEC 21 (traslados). Ampliar `notificaciones-internas.test.ts`. Casos:
   - El técnico solicita: el supervisor recibe `traslado_solicitado`.
   - Al aprobar, el técnico (que también es el solicitante) recibe un único `traslado_resuelto` con `aprobada`.
   - Si lo solicitó el coordinador, recibe `aprobada` y el técnico que tenía la queja también.
   - Rechazar notifica solo al solicitante.
   - `sin_efecto` notifica al solicitante.
   - Un traslado directo del supervisor notifica al técnico anterior.
   - Un caso de uso revertido (`409`) no deja notificaciones.

   Verificación: `npm run test:db` pasa.
8. Agregar `purgarLeidas` y la programación de la purga en `correos.job.ts`, con `NOTIFICACIONES_PURGA_CRON` en `env.ts` y `.env.example`. Ampliar `correos.job.test.ts` y `notificaciones.api.test.ts`. Casos:
   - Borra las leídas con `leida_en` de hace más de 30 días.
   - Conserva las leídas recientes y todas las no leídas.
   - Con el parámetro inválido, no borra nada y registra el error.
   - La programación usa la zona `America/Guatemala`.

   Verificación: `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
9. Frontend: agregar los textos de los 7 tipos a `CampanaNotificaciones` y a `comun.json`, con la pluralización. Ampliar `campana-notificaciones.test.tsx`: cada tipo muestra su texto, `comentario_nuevo` usa el singular y el plural y la marca de notas internas, y cada uno enlaza a `/tickets/:id`. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
10. Actualizar la sección 6 del documento de definición (`notificaciones.leida_en`, el parámetro y la purga) y `CLAUDE.md`:
    - La tabla de los tipos internos, con su evento y sus destinatarios.
    - Los filtros comunes de destinatarios.
    - La agrupación de `comentario_nuevo`.
    - Que las notificaciones se escriben en la transacción del caso de uso.
    - La purga.

    Verificación manual con el backend y `seed:dev`: `coordinador@vozmuni.test` asigna una queja a `tecnico@vozmuni.test`, y el técnico ve "Te asignaron la queja …" en la campana. El coordinador comenta dos veces, y el técnico ve "2 comentarios nuevos". El técnico pide información, `vecino@vozmuni.test` responde, y el técnico ve "El vecino respondió…".

## Criterios de aceptación

- [ ] La migración `0031_notificaciones_internas` agrega `leida_en` con su relleno y su `CHECK`, el índice único parcial de comentarios sin leer, el índice de purga y el parámetro `notificaciones_retencion_dias = 30`. Su `down` los elimina.
- [ ] Asignar o reasignar notifica `asignacion_recibida` al técnico nuevo y `asignacion_retirada` al anterior.
- [ ] Un comentario notifica `comentario_nuevo` al técnico asignado y a los internos que ya comentaron. Si el usuario tiene uno sin leer de esa queja, se actualizan la cantidad y la fecha, sin crear otra fila.
- [ ] Las notas internas solo llegan a quien tiene `comentarios.interno`, y la notificación indica que incluye notas internas.
- [ ] El comentario del solicitante que reanuda una queja en espera notifica `respuesta_vecino` al técnico asignado, o a los coordinadores si no hay técnico, y no genera además un `comentario_nuevo`.
- [ ] Reabrir notifica `queja_reabierta` al técnico asignado y a los coordinadores de la dependencia.
- [ ] Solicitar un traslado notifica `traslado_solicitado` a quienes tienen `tickets.triage`. Resolverlo notifica `traslado_resuelto` con el resultado al solicitante y, si se aprobó, al técnico que tenía la queja.
- [ ] Nunca se notifica al autor del evento, a un usuario inactivo, ni a quien no tiene la queja en su alcance de `tickets.ver`.
- [ ] Las notificaciones se escriben en la transacción del caso de uso, y un caso de uso revertido no deja ninguna.
- [ ] Marcar como leída fija `leida_en`. La purga diaria borra solo las leídas con más de `notificaciones_retencion_dias` días.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol: los grupos de destinatarios dependen de permisos y alcances.
- [ ] La campana muestra el texto traducido de los 7 tipos, con singular y plural en `comentario_nuevo`, y cada notificación abre `/tickets/:id`.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición, `CLAUDE.md` y `.env.example` documentan los tipos, los destinatarios, la agrupación, la purga y la variable nueva.

## Decisiones

- **Sí:** se avisan las asignaciones, los comentarios, las reaperturas y los traslados. Con SPEC 31 y SPEC 32, esto cierra RF-32.
- **Sí:** los comentarios se avisan al técnico asignado y a los internos que ya participaron, sin el autor y solo si hoy tienen la queja en su alcance.
- **No:** avisar solo al técnico, ni a todos los coordinadores en cada comentario.
- **Sí:** `comentario_nuevo` se agrupa por usuario y queja mientras no se lee, con un índice único parcial y un `upsert`. Una conversación no llena la campana.
- **No:** una notificación por comentario.
- **Sí:** `respuesta_vecino` es un tipo propio, que no se agrupa, porque reanuda la queja y pide acción.
- **Sí:** la reapertura avisa al técnico y a los coordinadores, porque la solución no convenció al vecino.
- **Sí:** los traslados avisan al supervisor al solicitarlos, y al solicitante y al técnico que pierde la queja al resolverlos.
- **Sí:** se purgan las leídas después de `notificaciones_retencion_dias` días (30 por defecto, parámetro), como pidió el usuario. Las no leídas se conservan.
- **Sí:** la purga se mide con `leida_en`, una columna nueva. Usar `creado_en` borraría una notificación vieja que el usuario acaba de leer.
- **Sí:** la purga es una segunda programación diaria de `correos.job.ts`, a las 03:00 en Guatemala. Es un cambio sobre SPEC 34, y reutiliza el proceso del job sin crear otro interruptor.
- **No:** una página de historial. Con la purga y la agrupación, alcanzan las 20 más recientes de la campana.
- **Sí:** las notificaciones se escriben en la transacción del caso de uso, y un error al escribirlas revierte el caso de uso. A diferencia del correo, no hay un canal externo que pueda fallar por separado.
- **Sí:** los grupos de destinatarios se centralizan en `DestinatariosRepository`, que también usan SPEC 31 y SPEC 32, para no repetir las reglas.
- **Sí:** el filtro de alcance reutiliza `ConsultaTicketsService.obtenerParaAccion` (SPEC 11), la misma regla que el detalle. Así una notificación nunca lleva a una queja que el usuario no puede abrir.
- **Sí:** los textos, el horario de la purga y el rango del parámetro (1 a 365) los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El filtro de alcance por destinatario hace una consulta por cada uno | Los destinatarios por evento son pocos (el técnico, unos coordinadores, los participantes). Si crece, se puede resolver con una sola consulta. |
| Un error al notificar revierte una acción de negocio | Es una escritura simple en la misma base. Las pruebas cubren cada punto de notificación. |
| Toca los casos de uso de SPEC 20, 21, 23 y 27, y los servicios de SPEC 31 y 32 | Se implementa después de SPEC 35. El paso 3 conserva las pruebas de SPEC 31 y 32, y cada spec debe seguir pasando. |
| Un coordinador que nunca comentó no se entera de las respuestas en quejas de su dependencia | Es una decisión explícita, para limitar el ruido. Ve la actividad en la línea de tiempo y en las bandejas. |
| Las notificaciones no leídas se acumulan sin límite | Es una decisión explícita: no se borra lo que el usuario no vio. La agrupación limita los comentarios. |

## Lo que **no** está en esta spec

- Página de historial y tiempo real.
- Preferencias por tipo.
- Correos o SMS a los internos.
- Avisos de escalamiento al técnico y a los coordinadores.
- Aviso al retirar un traslado.
- Notificaciones en la aplicación para el vecino.
- Edición del plazo de retención.

Cada uno de estos temas, cuando llegue, va en su propia spec.
