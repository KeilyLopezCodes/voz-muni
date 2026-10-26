# SPEC 32 — Escalamiento automático al vencer el SLA

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 19, SPEC 21, SPEC 28, SPEC 30, SPEC 31
> **Fecha:** 2026-10-23
> **Objetivo:** Marcar como escalada, con fecha y plazo, toda queja activa cuyo plazo de primera respuesta o de resolución venció, notificar a quienes tienen `tickets.triage` desde el mismo job de SLA de SPEC 31, y darle al supervisor la bandeja `/escaladas`, con el evento en la línea de tiempo interna.

## Por qué existe esta spec

RF-29 pide que, al vencer el plazo, la queja se marque como escalada y se notifique al supervisor. La sección 3 del documento agrega que "Escalada" es una marca, no un estado, que se activa al vencer el SLA en cualquier estado activo. La tabla de roles le asigna al supervisor la "atención de escalamientos".
SPEC 04 ya implementa `marcarEscalado()`, y `reabrir` limpia la marca. SPEC 30 calcula los vencimientos, y SPEC 31 deja el patrón del job, las notificaciones y la campana. Falta decidir cuándo se marca, a quién se avisa y dónde lo atiende el supervisor.

## Alcance

**Incluido:**

- Migración `0027_escalamiento`:
  - Columnas `tickets.escalado_en` y `tickets.escalado_por`, con `CHECK` de consistencia con `escalado`.
  - Índices parciales para el reclamo y para la bandeja.
- **Cambio sobre SPEC 04:** `marcarEscalado(ahora, plazo)` guarda la fecha y el plazo, y `reabrir` también los limpia.
- `EscalamientoService.procesar(ahora)`: reclama con `FOR UPDATE SKIP LOCKED` las quejas activas con un plazo vencido, las marca con el dominio y crea una notificación `sla_escalamiento` para cada usuario activo cuyo rol tiene `tickets.triage`.
- **Cambio sobre SPEC 31:**
  - `alertas-sla.job.ts` pasa a ser `sla.job.ts`, que en cada corrida ejecuta las alertas y después el escalamiento.
  - Las variables pasan a llamarse `SLA_JOB_ACTIVO` y `SLA_JOB_CRON`.
- `GET /api/v1/tickets/escaladas`, protegido por `tickets.triage`: las quejas escaladas en `asignada`, `en_proceso`, `en_espera` o `en_revision`, de la escalada más antigua a la más reciente, filtrables por dependencia y paginadas.
- **Cambio sobre SPEC 28:** un evento `escalamiento` en la línea de tiempo, solo en la vista interna.
- Frontend:
  - La pantalla `/escaladas` para el supervisor.
  - La marca "Escalada" en `IndicadorSla` (SPEC 30), que se ve en las bandejas y el detalle.
  - El texto de la notificación en la campana (SPEC 31).
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `.env.example`.

**Fuera de alcance (para specs futuras):**

- Quitar la marca al recalcular un plazo con vencimiento futuro, por ejemplo al volver a aceptar tras un traslado. Solo `reabrir` la limpia.
- Notificar del escalamiento al técnico o a los coordinadores.
- Correos, SMS o WhatsApp (RF-31, RF-34).
- Acciones nuevas del supervisor sobre una queja escalada. Usa las que ya existen: reasignar (SPEC 20), trasladar (SPEC 21) y las transiciones (SPEC 22).
- Escalamientos en varios niveles, o volver a escalar una queja ya escalada.
- Los indicadores de cumplimiento (RF-39). `escalado_en` y `escalado_por` quedan para calcularlos.
- El cierre automático por la confirmación vencida (RF-30).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0027_escalamiento.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN escalado_en  timestamptz NULL,
  ADD COLUMN escalado_por text NULL CHECK (escalado_por IN ('respuesta', 'resolucion')),
  ADD CONSTRAINT tickets_escalado_consistente
    CHECK (escalado = (escalado_en IS NOT NULL) AND (escalado_en IS NULL) = (escalado_por IS NULL));

-- Reclamo del job.
CREATE INDEX tickets_escalar_respuesta_idx
  ON tickets (vence_respuesta) WHERE NOT escalado AND primera_respuesta_en IS NULL;
CREATE INDEX tickets_escalar_resolucion_idx
  ON tickets (vence_resolucion) WHERE NOT escalado;

-- Bandeja /escaladas.
CREATE INDEX tickets_escaladas_idx ON tickets (escalado_en) WHERE escalado;
```

- Las quejas existentes tienen `escalado = false`, así que cumplen el `CHECK`.
- El `down` borra los índices, el `CHECK` y las dos columnas.

### Cambio sobre SPEC 04 (`backend/src/domain/ticket/ticket.ts`)

```ts
export type TipoPlazo = 'respuesta' | 'resolucion';

// Se agregan a las props del Ticket.
readonly escaladoEn: Date | null;
readonly escaladoPor: TipoPlazo | null;
```

| Método | Antes (SPEC 04) | Ahora |
| --- | --- | --- |
| `marcarEscalado` | `marcarEscalado()` | `marcarEscalado(ahora: Date, plazo: TipoPlazo)`. Fija `escalado = true`, `escaladoEn = ahora` y `escaladoPor = plazo`. Si ya estaba escalada, devuelve el mismo ticket y conserva la fecha y el plazo originales. Sigue rechazando los estados finales con `OPERACION_NO_PERMITIDA` |
| `reabrir` | limpia `escalado` | limpia también `escaladoEn` y `escaladoPor` |

`marcarEscalado` sigue sin escribir `ticket_historial`, porque no es un cambio de estado. Las pruebas de SPEC 04 se ajustan a la firma nueva.

### Cuándo se escala

Una queja está pendiente de escalar si `escalado = false`, su estado es `asignada`, `en_proceso`, `en_espera` o `en_revision`, y cumple al menos una de estas condiciones:

| Plazo | Condición |
| --- | --- |
| `respuesta` | `vence_respuesta <= ahora` y `primera_respuesta_en IS NULL` |
| `resolucion` | `vence_resolucion <= ahora` |

- Si vencieron los dos, `escalado_por` es el plazo con el vencimiento más antiguo.
- `resuelta` no escala: la resolución ya se cumplió, aunque haya sido tarde. Los estados finales no escalan (SPEC 04).
- `nueva` no tiene vencimientos (SPEC 30), así que nunca entra.
- En `en_espera`, `vence_resolucion` es `NULL` (SPEC 30), así que la pausa no escala por resolución. Una queja escalada antes de la pausa sigue escalada.
- En `en_revision` después de un traslado (SPEC 21), los vencimientos anteriores siguen vigentes hasta volver a aceptarla. Si vencen, la queja escala. Es literal a "cualquier estado activo".
- La marca no se quita al reanudar ni al volver a aceptar. Solo `reabrir` la quita.

### `EscalamientoService` (`backend/src/application/services/escalamiento.service.ts`)

```ts
// backend/src/domain/repositories/escalamiento-repository.ts
export interface EscalamientoPendiente { ticketId: number; plazo: TipoPlazo; vence: Date }

export interface EscalamientoRepository {
  // En la transacción: SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` quejas pendientes.
  reclamarPendientes(ahora: Date, limite: number, trx): Promise<EscalamientoPendiente[]>;
  // Usuarios activos cuyo rol tiene tickets.triage (cualquier alcance).
  supervisores(trx): Promise<number[]>;
}

export class EscalamientoService {
  // Procesa por lotes de 200 hasta que no queden pendientes. Devuelve cuántas quejas escaló.
  procesar(ahora: Date): Promise<number>;
}
```

Por cada queja reclamada, en la misma transacción:

1. Se reconstituye el ticket y se llama a `marcarEscalado(ahora, plazo)`.
2. `TicketEscrituraRepository` guarda `escalado`, `escalado_en` y `escalado_por`.
3. Se inserta una notificación para cada supervisor:

   | `tipo` | `datos` |
   | --- | --- |
   | `sla_escalamiento` | `{ "plazo": "respuesta" \| "resolucion", "vence": "<ISO 8601 UTC>" }` |

- Sin supervisores activos, la queja se escala igual y se escribe un aviso en el log.
- La regla de los destinatarios depende de la acción `tickets.triage`, no del nombre del rol. No usa `tickets.ver` con alcance `todas`, que también incluiría al administrador.
- `FOR UPDATE SKIP LOCKED` y la condición `NOT escalado` evitan escalar o notificar dos veces.

### Cambio sobre SPEC 31: un solo job de SLA

| Antes (SPEC 31) | Ahora |
| --- | --- |
| `infrastructure/jobs/alertas-sla.job.ts` | `infrastructure/jobs/sla.job.ts` |
| `iniciarJobAlertasSla(servicio, config, reloj)` | `iniciarJobSla({ alertas, escalamiento }, config, reloj)` |
| `SLA_ALERTAS_ACTIVO`, `SLA_ALERTAS_CRON` | `SLA_JOB_ACTIVO`, `SLA_JOB_CRON`, con los mismos valores por defecto |

- En cada corrida se ejecuta primero `AlertasSlaService.procesar(ahora)` y después `EscalamientoService.procesar(ahora)`, con el mismo `ahora`.
- Un error en un paso se registra en el log y no impide el otro.
- La bandera "corrida en curso" cubre los dos pasos.

### `GET /api/v1/tickets/escaladas`

Protegido por `autenticar` y `requierePermiso('tickets.triage')`. El alcance de `tickets.triage` es `todas` (SPEC 19), así que no hace falta un filtro adicional.

- Query:
  - `dependenciaId`: opcional. Las quejas en `en_revision` sin dependencia solo aparecen sin este filtro.
  - `pagina` (≥ 1) y `tamano` (1–50, por defecto 20).
- Orden: `escalado_en ASC, id ASC`.
- Respuesta `200`: `{ datos: TicketEscalado[], pagina, tamano, total }`.

```ts
export interface TicketEscalado {
  id: number;
  numero: string;
  titulo: string;
  estado: 'asignada' | 'en_proceso' | 'en_espera' | 'en_revision';
  prioridad: Prioridad;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null;
  tecnico: { id: number; nombre: string } | null;
  escaladoEn: string;                  // ISO 8601 en UTC
  escaladoPor: TipoPlazo;
  sla: SlaDto;                         // SPEC 30
}
```

No incluye los datos de contacto ni el DPI del solicitante (RNF-12). Lo implementa `EscaladasLecturaRepository`, de solo lectura.

### `SlaDto` (cambio sobre SPEC 30)

`SlaDto` agrega `escalado: boolean`, `escaladoEn: string | null` y `escaladoPor: TipoPlazo | null`. Llega a las bandejas y al detalle de los internos, igual que el resto de `SlaDto`.

### Cambio sobre SPEC 28: evento `escalamiento`

| `tipo` | Origen | Instante | Vista pública |
| --- | --- | --- | --- |
| `escalamiento` | `tickets.escalado_en`, si no es `NULL` | `escalado_en` | no |

- `DetalleEvento` agrega `{ tipo: 'escalamiento'; plazo: TipoPlazo }`. El actor es `{ tipo: 'sistema' }` y el `id` es `escalamiento:<ticketId>`.
- Como `reabrir` limpia `escalado_en`, la línea de tiempo muestra solo el escalamiento vigente. Uno anterior a una reapertura no queda registrado.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/escaladas` en `RUTAS_PROTEGIDAS`: `roles: ['supervisor']`, `enMenu: true`, `etiqueta: 'comun:menu.escaladas'` |
| Página | `features/tickets/escaladas/EscaladasPage.tsx`: un filtro por dependencia (`GET /dependencias`, SPEC 21) y tarjetas con el número, el título, el estado, la prioridad, la dependencia ("Sin dependencia" en revisión), el técnico, "Escalada por <respuesta/resolución> el <fecha>", `IndicadorSla` y un enlace "Ver detalle" a `/tickets/:id`. Paginación. Sin quejas: "No hay quejas escaladas" |
| `IndicadorSla` | Si `escalado`, muestra la marca textual "Escalada" con un ícono (no solo color), en todas las bandejas y en el detalle donde ya aparece |
| Campana | `sla_escalamiento`: "La queja <numero> se escaló por vencer el plazo de <respuesta/resolución> el <fecha>". Las fechas van en `America/Guatemala` |
| Línea de tiempo | `escalamiento`: "VozMuni escaló la queja por vencer el plazo de <respuesta/resolución>" |
| Textos | `locales/es/tickets.json` y `comun.json` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas, endpoint, job
CLAUDE.md
backend/
  .env.example                                       # SLA_JOB_ACTIVO, SLA_JOB_CRON
  src/
    server.ts                                        # iniciarJobSla
    app.ts
    container.ts
    infrastructure/config/env.ts                     # renombre de variables (SPEC 31)
    domain/
      ticket/ticket.ts                               # marcarEscalado(ahora, plazo); reabrir
      repositories/escalamiento-repository.ts
      repositories/escaladas-lectura-repository.ts
      repositories/linea-tiempo-repository.ts        # DetalleEvento escalamiento (SPEC 28)
    application/
      services/escalamiento.service.ts
      services/escaladas.service.ts
      services/sla.service.ts                        # SlaDto con escalado (SPEC 30)
    infrastructure/
      database/migrations/0027_escalamiento.ts
      repositories/knex-escalamiento-repository.ts
      repositories/knex-escaladas-lectura-repository.ts
      repositories/knex-ticket-escritura-repository.ts
      repositories/knex-linea-tiempo-repository.ts   # rama escalamiento
      jobs/sla.job.ts                                # reemplaza alertas-sla.job.ts
    presentation/
      validators/escaladas.validators.ts
      controllers/escaladas.controller.ts
      routes/escaladas.routes.ts
  tests/
    unit/ticket/ticket.test.ts                       # marcarEscalado y reabrir
    unit/sla/escalamiento.service.test.ts
    unit/jobs/sla.job.test.ts                        # reemplaza alertas-sla.job.test.ts
    unit/env.test.ts
    db/schema.test.ts                                # 0027
    db/escalamiento.test.ts                          # reclamo, notificación, concurrencia
    db/escaladas.api.test.ts                         # Supertest contra Postgres real
    db/linea-tiempo.api.test.ts                      # evento escalamiento
frontend/
  src/
    shared/auth/rutas.ts                             # /escaladas
    app/router.tsx
    shared/notificaciones/CampanaNotificaciones.tsx  # texto sla_escalamiento
    features/tickets/api/escaladas-api.ts
    features/tickets/escaladas/EscaladasPage.tsx
    features/tickets/sla/IndicadorSla.tsx            # marca Escalada
    features/tickets/linea-tiempo/EventoLineaTiempo.tsx
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/escaladas-page.test.tsx
    features/tickets/indicador-sla.test.tsx
    features/tickets/evento-linea-tiempo.test.tsx
    shared/campana-notificaciones.test.tsx
    app/router.test.tsx
```

## Plan de implementación

1. Cambiar el dominio: props `escaladoEn` y `escaladoPor`, `marcarEscalado(ahora, plazo)`, y `reabrir` limpiando los tres campos. Ajustar `tests/unit/ticket/ticket.test.ts` y `transiciones.test.ts`. Casos:
   - Marcar guarda la fecha y el plazo.
   - Marcar dos veces conserva los valores originales.
   - Marcar en `cerrada` o `rechazada` lanza `OPERACION_NO_PERMITIDA`.
   - Reabrir limpia los tres campos.

   Verificación: `npm test` y `npm run typecheck` pasan.
2. Crear la migración `0027_escalamiento.ts` y ampliar `tests/db/schema.test.ts`:
   - Las columnas y los 3 índices existen.
   - `escalado = true` sin `escalado_en`, o `escalado_por = 'otro'`, viola los `CHECK`.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Crear `EscalamientoRepository`, `KnexEscalamientoRepository` y `EscalamientoService`, con `escalamiento.service.test.ts` y falsos. Ampliar `KnexTicketEscrituraRepository` con los campos nuevos. Crear `tests/db/escalamiento.test.ts`. Casos:
   - Una queja `asignada` con la respuesta vencida escala con `escalado_por = 'respuesta'` y notifica al supervisor.
   - Una queja `en_proceso` con la resolución vencida escala por resolución.
   - Con los dos vencidos, gana el más antiguo.
   - Una queja `en_revision` trasladada con la resolución vencida escala, con `dependencia_id` en `NULL`.
   - No escalan: una en `en_espera` sin escalar (vencimiento `NULL`), una `resuelta`, una final, una `nueva`, ni una con `primera_respuesta_en` y la respuesta vencida pero la resolución vigente.
   - Una segunda corrida no vuelve a escalar ni a notificar.
   - Ni el administrador ni el coordinador reciben la notificación.
   - Sin supervisores activos, escala igual.
   - Dos `procesar` simultáneos escalan cada queja una sola vez.
   - Reabrir una queja escalada deja `escalado`, `escalado_en` y `escalado_por` limpios.

   Verificación: `npm run test:db` y `npm test` pasan.
4. Renombrar el job de SPEC 31 a `sla.job.ts` con los dos pasos, y las variables a `SLA_JOB_*` en `env.ts` y `.env.example`. Reemplazar `alertas-sla.job.test.ts` por `sla.job.test.ts`. Casos:
   - Ejecuta las alertas y después el escalamiento con el mismo `ahora`.
   - Un error en las alertas no impide el escalamiento.
   - Salta la corrida si la anterior sigue en curso.

   Ajustar `env.test.ts` a las variables nuevas. Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan, y `npm start` registra el job programado.
5. Crear `EscaladasLecturaRepository`, `EscaladasService`, el validador, el controlador y la ruta `GET /tickets/escaladas`. Agregar los campos de escalamiento a `SlaDto`. Crear `tests/db/escaladas.api.test.ts`. Casos:
   - El supervisor ve las escaladas en los 4 estados activos, ordenadas por `escalado_en`, con `escaladoPor`, `sla` y sin datos de contacto.
   - No aparecen las resueltas, las finales ni las no escaladas.
   - `dependenciaId` filtra, y deja fuera las que están en revisión sin dependencia.
   - La paginación devuelve `total`.
   - El técnico, el coordinador, el vecino y el administrador → `403`. Sin sesión → `401`.

   Verificación: `npm run test:db` pasa.
6. Agregar la rama `escalamiento` a `KnexLineaTiempoRepository` (SPEC 28) y ampliar `tests/db/linea-tiempo.api.test.ts`: el coordinador ve el evento con actor `sistema`, y el vecino no lo ve. Verificación: `npm run test:db` pasa.
7. Frontend: agregar `/escaladas` a `rutas.ts` y `router.tsx`, y crear `escaladas-api.ts` y `EscaladasPage.tsx`. Agregar la marca "Escalada" a `IndicadorSla`, el texto `sla_escalamiento` a la campana y el evento a `EventoLineaTiempo`. Crear `escaladas-page.test.tsx` y ampliar las pruebas existentes. Casos:
   - Solo el supervisor ve "Escaladas" en el menú.
   - El filtro por dependencia cambia la consulta.
   - Las tarjetas muestran "Escalada por resolución el…" en Guatemala.
   - La marca "Escalada" es texto visible.
   - La campana y la línea de tiempo muestran sus textos.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
8. Actualizar la sección 6 del documento de definición: las columnas, `GET /api/v1/tickets/escaladas` (Supervisor) y el job de SLA. Actualizar `CLAUDE.md`:
   - Cuándo escala una queja y que solo `reabrir` quita la marca.
   - Los destinatarios por `tickets.triage`.
   - El job único `sla.job.ts` con sus dos pasos y las variables `SLA_JOB_*`.
   - El tipo `sla_escalamiento`.

   Verificación manual con el backend, `seed:dev` y `SLA_JOB_CRON='* * * * *'`: se acepta y se asigna una queja, y se adelanta `vence_respuesta` con SQL. En menos de un minuto, `supervisor@vozmuni.test` ve la campana con "se escaló…" y la queja en `/escaladas`. `coordinador@vozmuni.test` ve la marca "Escalada" en `/asignacion` y el evento en la línea de tiempo. `vecino@vozmuni.test` no ve nada de eso.

## Criterios de aceptación

- [ ] La migración `0027_escalamiento` agrega `escalado_en` y `escalado_por` con su `CHECK` de consistencia y los 3 índices parciales, y su `down` los elimina.
- [ ] `marcarEscalado(ahora, plazo)` fija `escalado`, `escalado_en` y `escalado_por`, conserva los valores originales si ya estaba escalada y rechaza los estados finales. `reabrir` limpia los tres.
- [ ] El job escala toda queja no escalada en `asignada`, `en_proceso`, `en_espera` o `en_revision` con `vence_respuesta <= ahora` sin primera respuesta, o con `vence_resolucion <= ahora`, y guarda como `escalado_por` el plazo que venció primero.
- [ ] Las quejas en `nueva`, `resuelta`, `cerrada` o `rechazada` nunca escalan, y una queja en pausa no escala por resolución.
- [ ] Cada queja escalada genera una notificación `sla_escalamiento` para cada usuario activo cuyo rol tiene `tickets.triage`, y para nadie más.
- [ ] Ninguna queja se escala ni se notifica dos veces, ni en corridas repetidas ni en corridas simultáneas.
- [ ] `sla.job.ts` reemplaza a `alertas-sla.job.ts`: en cada corrida ejecuta las alertas y después el escalamiento, un error en un paso no impide el otro, y se configura con `SLA_JOB_ACTIVO` y `SLA_JOB_CRON`.
- [ ] `GET /api/v1/tickets/escaladas` devuelve al supervisor las escaladas activas, ordenadas por `escalado_en`, filtrables por dependencia, paginadas con `total` y sin datos de contacto. Los demás roles reciben `403`.
- [ ] `SlaDto` incluye `escalado`, `escaladoEn` y `escaladoPor`, e `IndicadorSla` muestra la marca textual "Escalada" en las bandejas y el detalle.
- [ ] La línea de tiempo interna muestra el evento `escalamiento` con actor `sistema`, y la vista pública del vecino no lo incluye.
- [ ] La pantalla `/escaladas` aparece en el menú solo para el supervisor y muestra cada queja con "Escalada por <plazo> el <fecha>" en `America/Guatemala`.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol: los destinatarios y la bandeja dependen de `tickets.triage`.
- [ ] A 360 px de ancho, `/escaladas` no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición, `CLAUDE.md` y `.env.example` documentan las columnas, el endpoint, el job único y las variables.

## Decisiones

- **Sí:** escala el vencimiento de cualquiera de los dos plazos, como dice "al vencer el SLA". Una queja escala una sola vez.
- **No:** escalar solo por resolución.
- **Sí:** las quejas en `en_revision` con vencimientos anteriores pueden escalar, literal a "cualquier estado activo" de la sección 3. Una `resuelta` no escala, porque la resolución ya se cumplió. Es una consecuencia de las reglas del documento, no una pregunta aparte.
- **Sí:** se notifica a quienes tienen `tickets.triage`, que hoy es solo el supervisor.
- **No:** `tickets.ver` con alcance `todas`, que incluiría al administrador, ni sumar al técnico y a los coordinadores.
- **Sí:** solo `reabrir` quita la marca, como ya hace el dominio. La marca registra que el plazo venció, y un recálculo no la borra.
- **No:** quitar la marca al recalcular con un vencimiento futuro.
- **Sí:** se guardan `escalado_en` y `escalado_por`. Ordenan la bandeja, se muestran en la interfaz, alimentan la línea de tiempo y sirven para RF-39.
- **Sí:** un solo job de SLA con dos pasos (las alertas y después el escalamiento). Es un cambio sobre SPEC 31, con las variables renombradas a `SLA_JOB_*`.
- **No:** un job separado con su propia configuración.
- **Sí:** la bandeja `/escaladas` para el supervisor, con las escaladas activas ordenadas por antigüedad del escalamiento.
- **No:** incluir las resueltas pendientes de confirmación.
- **Sí:** el escalamiento aparece en la línea de tiempo interna. Es un cambio sobre SPEC 28, que lo había dejado fuera.
- **Sí:** como `reabrir` limpia `escalado_en`, un escalamiento anterior a una reapertura no queda en la línea de tiempo. Es una consecuencia de guardar solo el escalamiento vigente. Si se necesita el historial completo, otra spec agrega una tabla de escalamientos.
- **Sí:** se reutiliza el patrón de SPEC 31: reclamo con `SKIP LOCKED`, lotes de 200, un servicio en `application/` y el job delgado.
- **Sí:** los textos, el tamaño de página (20) y la disposición de la bandeja los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Renombrar las variables de SPEC 31 rompe un `.env` existente | SPEC 31 sigue en Borrador. Si ya está implementada al llegar aquí, `env.ts` acepta temporalmente los nombres viejos con un aviso en el log, y el paso 4 lo prueba. |
| Muchas quejas vencidas a la vez (por ejemplo, al activar el job por primera vez) llenan la campana del supervisor | Las quejas aceptadas antes de SPEC 30 no tienen vencimientos y no escalan. El supervisor ve el detalle en `/escaladas`. |
| Una queja trasladada escala mientras está en revisión, antes de que la nueva dependencia la vea | Es el comportamiento elegido (el plazo corre desde el registro). La bandeja muestra "Sin dependencia" y el supervisor puede aceptarla de inmediato. |
| Se pierde el registro de un escalamiento anterior a una reapertura | Es una decisión explícita. Queda registrado aquí como posible spec futura. |
| Cambia contratos de SPEC 04 (Implementado), SPEC 28, SPEC 30 y SPEC 31 | Ningún caso de uso llama todavía a `marcarEscalado`. Las otras tres siguen en Borrador. Se implementa después de SPEC 31. |

## Lo que **no** está en esta spec

- Quitar la marca al recalcular.
- Notificar del escalamiento al técnico y a los coordinadores.
- Correos, SMS y WhatsApp.
- Acciones nuevas del supervisor, niveles de escalamiento e historial de escalamientos.
- Indicadores de cumplimiento (RF-39) y cierre automático (RF-30).

Cada uno de estos temas, cuando llegue, va en su propia spec.
