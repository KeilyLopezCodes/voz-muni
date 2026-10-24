# SPEC 27 — Confirmar o reabrir la solución

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 09, SPEC 11, SPEC 15, SPEC 19, SPEC 22, SPEC 25, SPEC 26
> **Fecha:** 2026-10-23
> **Objetivo:** Agregar a `POST /api/v1/tickets/:id/transiciones` las acciones `confirmar` y `reabrir` para quejas en `resuelta`, dentro de un plazo de días hábiles que se calcula al resolver y se guarda en `tickets.confirmacion_vence_en`, con un máximo configurable de reaperturas y los botones en `/tickets/:id`.

## Por qué existe esta spec

RF-24 pide que el vecino confirme la solución (la queja se cierra) o la rechace (la queja se reabre) dentro del plazo configurado. La sección 3 del documento fija ese plazo en "5 días hábiles (parámetro)". Ahí también dice que la reapertura exige motivo, vuelve al mismo técnico y reinicia el plazo de resolución.
SPEC 04 ya implementa en el dominio `confirmarSolucion(ctx, confirmacionVenceEn)` y `reabrir(ctx, motivo, confirmacionVenceEn)`, pero el dominio solo compara fechas. Nadie calcula todavía `confirmacionVenceEn`: `domain/sla/` está vacío y no hay ninguna spec de días hábiles (RF-27).
Esta spec calcula el plazo al resolver, lo guarda y habilita las dos acciones. El cierre automático al vencer el plazo (RF-30) solo tendrá que leer esa columna.

## Alcance

**Incluido:**

- Migración `0022_confirmacion`:
  - Columnas `tickets.confirmacion_vence_en` y `tickets.reaperturas`.
  - Parámetros `plazo_confirmacion_dias_habiles` (5) y `max_reaperturas` (2) en la tabla `parametros` (SPEC 15).
  - Plantillas `queja_cerrada` y `queja_reabierta` en `plantillas_notificacion` (SPEC 09).
  - Relleno de las quejas ya resueltas.
- Cálculo del vencimiento: el fin del N-ésimo día hábil posterior al día de la resolución, a las 23:59:59.999 en `America/Guatemala`, guardado en UTC, con N leído de `calendario_laboral`.
- **Cambio sobre SPEC 22:** `resolver` calcula y guarda `confirmacion_vence_en` en la misma transacción. Si el calendario no alcanza, responde `409 CALENDARIO_INCOMPLETO` y la queja no cambia.
- **Cambio sobre SPEC 04:** `resolver` recibe el vencimiento. `confirmarSolucion` acepta un motivo opcional. `reabrir` controla el máximo de reaperturas, suma una y limpia el vencimiento.
- Acciones `confirmar` y `reabrir` en `/transiciones`, para el vecino solicitante, el coordinador de la dependencia y el supervisor, como dice la matriz. Un interno que confirma en nombre del vecino debe dar un motivo.
- Correos al solicitante: `queja_cerrada` al confirmar y `queja_reabierta` al reabrir.
- `GET /api/v1/tickets/:id` (SPEC 25) agrega el bloque `confirmacion`.
- Frontend: en el bloque "Solución" de `/tickets/:id` (SPEC 26), el plazo y los botones "Confirmar solución" y "Reabrir". Reemplaza el texto temporal de SPEC 26.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Cierre automático al vencer el plazo (RF-30, job node-cron en `infrastructure/jobs/`). Usa `confirmacion_vence_en` y el método `cerrarPorVencimiento` de SPEC 04.
- El correo `queja_resuelta` al resolver, con la fecha límite (RF-31). El usuario decidió dejarlo fuera.
- La encuesta de satisfacción (`POST /api/v1/tickets/:id/encuesta`).
- Avisos internos al técnico o al coordinador cuando se reabre (RF-32).
- Recalcular el SLA de resolución al reabrir (RF-26, RF-27). La spec de SLA define cómo se reinicia `vence_resolucion`.
- Endpoints o pantalla para editar los parámetros `plazo_confirmacion_dias_habiles` y `max_reaperturas`.
- Mostrar en la tarjeta de "Mis quejas" que hay una solución pendiente de confirmar.
- Mostrar el plazo en la consulta pública (RF-35).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0022_confirmacion.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN confirmacion_vence_en timestamptz NULL,
  ADD COLUMN reaperturas integer NOT NULL DEFAULT 0 CHECK (reaperturas >= 0);
```

- `confirmacion_vence_en`: el fin del plazo para confirmar o reabrir. Solo tiene valor mientras la queja está en `resuelta` o después de cerrarla. Vuelve a `NULL` al reabrir.
- `reaperturas`: cuántas veces se reabrió la queja. Nunca disminuye.

El `up` también:

- Inserta en `parametros` (con `ON CONFLICT (clave) DO NOTHING`):

  | `clave` | `valor` (jsonb) |
  | --- | --- |
  | `plazo_confirmacion_dias_habiles` | `5` |
  | `max_reaperturas` | `2` |

- Inserta en `plantillas_notificacion` las plantillas `queja_cerrada` y `queja_reabierta` (con `ON CONFLICT (clave) DO NOTHING`).
- Rellena `reaperturas` con la cantidad de filas de `ticket_historial` con `estado_anterior = 'resuelta'` y `estado_nuevo = 'en_proceso'` de cada queja.
- Rellena `confirmacion_vence_en` de las quejas en `resuelta` o `cerrada` con la regla de cálculo de abajo, desde `resuelto_en`. Para las quejas en `cerrada` se calcula sobre su último `resuelto_en`. Si el calendario no tiene suficientes días hábiles, queda `NULL`.

El `down` borra las dos plantillas, los dos parámetros y las dos columnas.

### Plantillas

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `queja_cerrada` | `VozMuni: tu queja {{numero}} fue cerrada` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{enlace}}` |
| `queja_reabierta` | `VozMuni: reabrimos tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{motivo}}`, `{{enlace}}` |

```text
queja_cerrada:
Hola {{nombre}}:

Tu queja "{{titulo}}" ({{numero}}) quedó cerrada con la solución confirmada. Gracias por ayudarnos a mejorar.
Puedes consultarla en {{enlace}}

queja_reabierta:
Hola {{nombre}}:

Reabrimos tu queja "{{titulo}}" ({{numero}}) por este motivo:

{{motivo}}

El mismo equipo la volverá a atender. Puedes seguir su avance en {{enlace}}
```

`{{enlace}}` es `APP_URL/consulta?numero=…`, como en SPEC 12 y SPEC 19.

### Cálculo del plazo (`backend/src/domain/calendario/plazo-confirmacion.ts`)

```ts
export const ZONA_MUNICIPAL = 'America/Guatemala';

// Fecha local (YYYY-MM-DD) de un instante en la zona municipal.
export function fechaLocal(instante: Date): string;

// Fin del último día hábil recibido, a las 23:59:59.999 en ZONA_MUNICIPAL, como instante UTC.
// Lanza ReglaDeNegocioError CALENDARIO_INCOMPLETO si diasHabiles tiene menos de `cantidad` fechas.
export function calcularVencimientoConfirmacion(
  diasHabiles: readonly string[],   // fechas hábiles posteriores a fechaLocal(resueltoEn), en orden
  cantidad: number,
): Date;
```

- El día de la resolución no cuenta, aunque sea hábil. Si una queja se resuelve el lunes y N = 5, vence el lunes siguiente a las 23:59:59.999, siempre que no haya asuetos en medio.
- La conversión a UTC se hace con `Intl.DateTimeFormat`, sin un desfase fijo en el código.
- Las funciones son puras y no importan Knex ni Express.

### Puertos

```ts
// backend/src/domain/repositories/calendario-repository.ts
export interface CalendarioRepository {
  // Hasta `cantidad` fechas con es_habil = true y fecha > desde, en orden ascendente.
  diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]>;
}
```

`ParametroRepository.obtener(clave)` de SPEC 15 lee los dos parámetros. Un `PlazosConfirmacionService` (`application/services/plazos-confirmacion.service.ts`) los valida:

| Parámetro | Válido | Si falta o no es válido |
| --- | --- | --- |
| `plazo_confirmacion_dias_habiles` | Entero de 1 a 30 | `409 PARAMETRO_INVALIDO` |
| `max_reaperturas` | Entero de 0 a 10 | `409 PARAMETRO_INVALIDO` |

### Cambios en el dominio (`backend/src/domain/ticket/ticket.ts`, SPEC 04)

```ts
// Se agregan a las props del Ticket.
readonly confirmacionVenceEn: Date | null;
readonly reaperturas: number;
```

| Método | Antes (SPEC 04) | Ahora |
| --- | --- | --- |
| `resolver` | `resolver(ctx, descripcion)` | `resolver(ctx, descripcion, confirmacionVenceEn: Date)`. Además de lo de SPEC 04 y SPEC 26, fija `confirmacionVenceEn` |
| `confirmarSolucion` | `confirmarSolucion(ctx, confirmacionVenceEn)` | `confirmarSolucion(ctx, confirmacionVenceEn, motivo?: string)`. Si `motivo` viene y no queda vacío después de `trim()`, se guarda como `motivo` del historial |
| `reabrir` | `reabrir(ctx, motivo, confirmacionVenceEn)` | `reabrir(ctx, motivo, confirmacionVenceEn, maxReaperturas: number)`. Si `reaperturas >= maxReaperturas`, lanza `ReglaDeNegocioError('LIMITE_REAPERTURAS')`. Si no, suma 1 a `reaperturas` y pone `confirmacionVenceEn = null`, junto con lo que ya limpia (SPEC 04 y SPEC 26) |

- El límite de reaperturas se comprueba después del estado de origen y del plazo. Así una queja que no está en `resuelta` sigue respondiendo `TRANSICION_INVALIDA`, y un plazo vencido sigue respondiendo `PLAZO_CONFIRMACION_VENCIDO`.
- Las pruebas de SPEC 04 se ajustan a las firmas nuevas. Los casos existentes siguen pasando.

### Cambio sobre SPEC 22: `resolver`

Dentro de la misma transacción de `resolver`, después del `SELECT … FOR UPDATE`:

1. Se lee `plazo_confirmacion_dias_habiles`.
2. Se piden a `CalendarioRepository` los días hábiles posteriores a `fechaLocal(ahora)`.
3. Se calcula `confirmacionVenceEn` y se pasa a `ticket.resolver`.
4. `KnexTicketEscrituraRepository` guarda `confirmacion_vence_en` con los demás cambios.

Si el calendario no alcanza, responde `409 CALENDARIO_INCOMPLETO` y no se escribe nada. El cuerpo y la respuesta `200` de `resolver` no cambian.

### Acciones `confirmar` y `reabrir`

| `accion` | De → a | Permiso | Condición adicional |
| --- | --- | --- | --- |
| `confirmar` | `resuelta` → `cerrada` | `tickets.cambiar_estado` | `puedeConfirmar(alcance)` |
| `reabrir` | `resuelta` → `en_proceso` | `tickets.cambiar_estado` | `puedeConfirmar(alcance)` |

```ts
// backend/src/domain/atencion/acciones-confirmacion.ts
// Alcances de tickets.cambiar_estado que habilitan confirmar y reabrir (matriz, sección 2).
export const ALCANCES_CONFIRMACION: readonly Alcance[] = ['propia', 'dependencia', 'todas'];

export function puedeConfirmar(alcance: Alcance | undefined): boolean;
// Confirmar exige motivo para todo alcance distinto de 'propia'.
export function exigeMotivoAlConfirmar(alcance: Alcance): boolean;
```

Con la matriz actual queda así:

| Rol | `tickets.cambiar_estado` | Confirmar y reabrir |
| --- | --- | --- |
| vecino | `propia` | sí, sobre sus quejas. Confirmar sin motivo |
| coordinador | `dependencia` | sí, sobre las quejas de su dependencia. Confirmar con motivo |
| supervisor | `todas` | sí, sobre todas. Confirmar con motivo |
| técnico | `asignadas` | no (`403`). La matriz no le da cerrar ni reabrir |
| receptor, administrador | — | no (`403`) |

El filtro sobre el ticket es la intersección de `tickets.cambiar_estado` con `tickets.ver` (SPEC 11), como en SPEC 22. Fuera de alcance responde `404`.

Cuerpos (unión discriminada por `accion`, Zod `strict`):

| `accion` | Cuerpo | Reglas |
| --- | --- | --- |
| `confirmar` | `{ accion: 'confirmar', motivo? }` | Motivo de 1 a 1000 caracteres. Obligatorio si `exigeMotivoAlConfirmar(alcance)`; si falta, `400 MOTIVO_REQUERIDO` |
| `reabrir` | `{ accion: 'reabrir', motivo }` | Motivo de 1 a 1000 caracteres, siempre obligatorio. Sin él, `400 MOTIVO_REQUERIDO` |

Pasos, en una transacción, iguales a SPEC 19 y SPEC 22:

1. Se lee el ticket con `SELECT … FOR UPDATE` y el filtro de alcance.
2. Si `confirmacion_vence_en` es `NULL`, responde `409 PLAZO_NO_DEFINIDO`.
3. Para `reabrir`, se lee `max_reaperturas`.
4. Se llama al método de dominio, con `ctx = { actorId: usuario.id, ahora }`.
5. Se guardan los cambios (`cerrado_en`, o `reaperturas`, `confirmacion_vence_en`, `resuelto_en`, `resolucion`, `resuelto_por` y `escalado`) y la fila de `ticket_historial`.

Después de confirmar la transacción se envía el correo al solicitante, si tiene correo. Un fallo del envío no cambia la respuesta, como en SPEC 12.

Responde `200` con `{ id, numero, estado, asignadoA, resueltoEn, cerradoEn, reaperturas }`.

| Caso | Respuesta |
| --- | --- |
| La queja no está en `resuelta` | `409 TRANSICION_INVALIDA` |
| `ahora > confirmacion_vence_en` | `409 PLAZO_CONFIRMACION_VENCIDO` |
| `reaperturas >= max_reaperturas` (para todos, sin excepciones) | `409 LIMITE_REAPERTURAS` |
| Sin vencimiento guardado | `409 PLAZO_NO_DEFINIDO` |
| Parámetro ausente o inválido | `409 PARAMETRO_INVALIDO` |

### Lectura: `GET /api/v1/tickets/:id`

Se agrega un campo a `TicketDetalle` (SPEC 25 y SPEC 26):

```ts
export interface ConfirmacionDetalle {
  venceEn: string;                 // ISO 8601 en UTC
  vencida: boolean;                // ahora > venceEn
  reaperturasRestantes: number;    // max(0, max_reaperturas - reaperturas)
  puedeConfirmar: boolean;         // puedeConfirmar(alcance) && !vencida
  puedeReabrir: boolean;           // puedeConfirmar(alcance) && !vencida && reaperturasRestantes > 0
  exigeMotivoAlConfirmar: boolean;
}

export interface TicketDetalle {
  // … campos de SPEC 25 y SPEC 26
  confirmacion: ConfirmacionDetalle | null;   // solo si estado === 'resuelta' y hay vencimiento
}
```

El alcance que se evalúa es el de `tickets.cambiar_estado` del usuario. Para el técnico, el receptor y el administrador, `puedeConfirmar` y `puedeReabrir` son `false`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Plazo | En `SolucionQueja.tsx` (SPEC 26), si hay `confirmacion`. El vecino ve "Tienes hasta el <fecha> para confirmar la solución o reabrir la queja". Los internos ven "El vecino tiene hasta el <fecha> para confirmar". La fecha va en `America/Guatemala`. Reemplaza el texto temporal de SPEC 26 |
| Plazo vencido | "El plazo para confirmar venció." Sin botones |
| "Confirmar solución" | Visible si `puedeConfirmar`. Abre un diálogo de confirmación. Si `exigeMotivoAlConfirmar`, el diálogo pide "¿Cómo confirmó el vecino?" (obligatorio) |
| "Reabrir" | Visible si `puedeReabrir`. Abre un diálogo con "¿Por qué la solución no resolvió el problema?" (obligatorio) y el texto "Puedes reabrirla N veces más" |
| Límite alcanzado | Si `reaperturasRestantes === 0` y el plazo sigue vigente: "Esta queja ya no se puede reabrir. Si el problema continúa, registra una queja nueva", con un enlace a `/tickets/nueva` para el vecino |
| Después de actuar | Se invalidan el detalle y la lista de "Mis quejas", y aparece un aviso: "Gracias, cerramos tu queja" o "Reabrimos tu queja" |
| Errores | Un `409` muestra "La queja cambió. Actualizamos la información" y recarga el detalle |
| Textos | `locales/es/tickets.json`, bajo `detalle.confirmacion.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas de tickets, parámetros, plantillas, acciones
CLAUDE.md
backend/
  src/
    container.ts
    domain/
      calendario/plazo-confirmacion.ts
      atencion/acciones-confirmacion.ts
      repositories/calendario-repository.ts
      repositories/ticket-lectura-repository.ts        # TicketDetalle.confirmacion
      ticket/ticket.ts                                 # props y firmas de resolver, confirmarSolucion, reabrir
    application/
      services/plazos-confirmacion.service.ts
      services/atencion.service.ts                     # resolver calcula el plazo (SPEC 22)
      services/confirmacion.service.ts                 # confirmar y reabrir, con correos
      services/consulta-tickets.service.ts             # detalle con confirmacion
      errors/error-de-aplicacion.ts                    # códigos nuevos
    infrastructure/
      database/migrations/0022_confirmacion.ts
      repositories/knex-calendario-repository.ts
      repositories/knex-ticket-escritura-repository.ts # confirmacion_vence_en y reaperturas
      repositories/knex-ticket-lectura-repository.ts
    presentation/
      validators/transiciones.validators.ts            # confirmar y reabrir
      controllers/transiciones.controller.ts           # permiso por acción
      middlewares/manejador-errores.ts                 # estados HTTP de los códigos nuevos
  tests/
    unit/calendario/plazo-confirmacion.test.ts
    unit/atencion/acciones-confirmacion.test.ts
    unit/ticket/transiciones.test.ts
    unit/atencion/confirmacion.service.test.ts
    db/schema.test.ts                                  # 0022: columnas, parámetros, plantillas, relleno
    db/atencion.api.test.ts                            # resolver guarda el plazo
    db/confirmacion.api.test.ts                        # Supertest contra Postgres real
frontend/
  src/
    features/tickets/api/tickets-api.ts                # ConfirmacionDetalle, confirmar, reabrir
    features/tickets/mis-quejas/SolucionQueja.tsx
    features/tickets/mis-quejas/DialogoConfirmar.tsx
    features/tickets/mis-quejas/DialogoReabrir.tsx
    locales/es/tickets.json
  tests/
    features/tickets/solucion-queja.test.tsx
    features/tickets/dialogos-confirmacion.test.tsx
```

## Plan de implementación

1. Crear `domain/calendario/plazo-confirmacion.ts` y su prueba. Casos:
   - Resuelta el lunes 2026-11-02 con N = 5 y sin asuetos, vence el lunes 2026-11-09 a las 23:59:59.999 en Guatemala (2026-11-10T05:59:59.999Z).
   - El día de la resolución no cuenta, aunque sea hábil.
   - Un asueto en medio corre el vencimiento un día hábil.
   - Una resolución a las 23:30 en Guatemala (05:30 UTC del día siguiente) usa la fecha local.
   - Con menos fechas que `cantidad`, lanza `CALENDARIO_INCOMPLETO`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear `domain/atencion/acciones-confirmacion.ts` y su prueba: `puedeConfirmar` es `true` para `propia`, `dependencia` y `todas`, y `false` para `asignadas`, `undefined` y el resto. `exigeMotivoAlConfirmar` es `false` solo para `propia`. Verificación: `npm test` pasa.
3. Cambiar el dominio: props `confirmacionVenceEn` y `reaperturas`, y las firmas nuevas de `resolver`, `confirmarSolucion` y `reabrir`. Ajustar `tests/unit/ticket/transiciones.test.ts`. Casos nuevos:
   - `resolver` fija `confirmacionVenceEn`.
   - `confirmarSolucion` con motivo lo deja en el historial, y sin motivo deja `null`.
   - `reabrir` suma 1 a `reaperturas` y limpia `confirmacionVenceEn`.
   - Con `reaperturas = maxReaperturas`, `reabrir` lanza `LIMITE_REAPERTURAS`.
   - Con el plazo vencido, `reabrir` lanza `PLAZO_CONFIRMACION_VENCIDO` aunque también esté en el límite.

   Verificación: `npm test` y `npm run typecheck` pasan.
4. Crear la migración `0022_confirmacion.ts` con las columnas, los parámetros, las plantillas, el relleno y el `down`. Ampliar `tests/db/schema.test.ts`:
   - Las columnas existen, y `reaperturas` rechaza negativos.
   - Los dos parámetros y las dos plantillas existen.
   - Una queja resuelta antes de la migración queda con su vencimiento y su cantidad de reaperturas.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
5. Crear `CalendarioRepository` y `knex-calendario-repository.ts`, y `PlazosConfirmacionService`. Cambiar `resolver` en `AtencionService` (SPEC 22) para calcular el plazo, y ampliar `KnexTicketEscrituraRepository`. Ampliar `tests/db/atencion.api.test.ts`:
   - `resolver` guarda `confirmacion_vence_en` según el calendario de `seed:dev`.
   - Con el calendario vacío, `resolver` responde `409 CALENDARIO_INCOMPLETO` y la queja sigue en `en_proceso`.
   - Con `plazo_confirmacion_dias_habiles` inválido, responde `409 PARAMETRO_INVALIDO`.

   Verificación: `npm run test:db` pasa.
6. Crear `ConfirmacionService` con `confirmar` y `reabrir`, y `confirmacion.service.test.ts` con repositorios y enviador falsos. Ampliar el validador y el controlador de `/transiciones`, y el manejador de errores. Crear `tests/db/confirmacion.api.test.ts`. Casos:
   - El vecino confirma su queja → `200`, `cerrada`, `cerrado_en` lleno, una fila de historial y el correo `queja_cerrada` enviado.
   - El vecino reabre con motivo → `200`, `en_proceso`, el mismo técnico, `reaperturas = 1`, sin vencimiento ni resolución, y el correo `queja_reabierta` con el motivo.
   - El vecino de otra queja → `404`.
   - El coordinador de la dependencia confirma sin motivo → `400 MOTIVO_REQUERIDO`, y con motivo → `200`. El de otra dependencia → `404`.
   - El supervisor reabre cualquiera → `200`.
   - El técnico asignado, el receptor y el administrador → `403`.
   - Reabrir sin motivo → `400`. Confirmar una queja en `en_proceso` → `409 TRANSICION_INVALIDA`.
   - Con el plazo vencido → `409 PLAZO_CONFIRMACION_VENCIDO`. En el instante exacto del vencimiento → `200`.
   - Después de 2 reaperturas, una tercera → `409 LIMITE_REAPERTURAS`, también para el supervisor.
   - Sin vencimiento guardado → `409 PLAZO_NO_DEFINIDO`.
   - Un fallo del enviador no cambia el `200`. Un vecino sin correo no recibe nada.
   - Dos acciones simultáneas: una → `200` y la otra → `409`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
7. Agregar `confirmacion` a `TicketDetalle`, a `obtenerDetalle` y a `ConsultaTicketsService`. Ampliar `tests/db/tickets-lectura.api.test.ts`:
   - Una queja en `resuelta` pedida por su vecino → `puedeConfirmar` y `puedeReabrir` en `true`, y `exigeMotivoAlConfirmar` en `false`.
   - Pedida por el técnico → los dos en `false`.
   - Con el plazo vencido → `vencida: true` y los dos en `false`.
   - En el límite de reaperturas → `puedeReabrir: false` y `reaperturasRestantes: 0`.
   - En otro estado → `confirmacion: null`.

   Verificación: `npm run test:db` pasa.
8. Frontend: ampliar `tickets-api.ts`, crear `DialogoConfirmar.tsx` y `DialogoReabrir.tsx`, y cambiar `SolucionQueja.tsx`. Agregar los textos a `tickets.json`. Crear `dialogos-confirmacion.test.tsx` y ampliar `solucion-queja.test.tsx`. Casos:
   - El vecino ve el plazo y los dos botones. El técnico ve el plazo sin botones.
   - El coordinador ve el campo de motivo obligatorio al confirmar, y el vecino no.
   - "Reabrir" exige motivo y muestra cuántas reaperturas quedan.
   - En el límite se muestra el aviso con el enlace a `/tickets/nueva`.
   - Con el plazo vencido no hay botones.
   - Un `409` muestra el aviso y recarga.
   - Después de actuar se invalidan el detalle y "Mis quejas".

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
9. Actualizar la sección 6 del documento de definición (fila `tickets`, acciones de `/transiciones`) y `CLAUDE.md`:
   - El plazo de confirmación se calcula al resolver y vive en `tickets.confirmacion_vence_en`.
   - La regla del fin del N-ésimo día hábil en `America/Guatemala`.
   - Los parámetros `plazo_confirmacion_dias_habiles` y `max_reaperturas`.
   - Quién puede confirmar y reabrir, y el motivo obligatorio para los internos.
   - Que RF-30 debe usar `confirmacion_vence_en`.

   Verificación manual con el backend y `seed:dev`, después de resolver una queja: `vecino@vozmuni.test` abre `/tickets/:id`, ve "Tienes hasta el …", reabre con un motivo y ve "Puedes reabrirla 1 vez más" en la siguiente resolución. Después de una nueva resolución, confirma y la queja queda `cerrada`. El enviador de desarrollo registra `queja_reabierta` y `queja_cerrada`.

## Criterios de aceptación

- [x] La migración `0022_confirmacion` agrega `tickets.confirmacion_vence_en` y `tickets.reaperturas`, los parámetros `plazo_confirmacion_dias_habiles = 5` y `max_reaperturas = 2`, y las plantillas `queja_cerrada` y `queja_reabierta`. Su `down` lo elimina todo.
- [x] `resolver` guarda en `confirmacion_vence_en` el fin (23:59:59.999 en `America/Guatemala`) del N-ésimo día hábil de `calendario_laboral` posterior al día de la resolución, con N leído de `parametros`.
- [x] Si el calendario no tiene suficientes días hábiles, `resolver` responde `409 CALENDARIO_INCOMPLETO` y la queja no cambia.
- [x] `confirmar` pasa la queja de `resuelta` a `cerrada`, fija `cerrado_en` y escribe una fila de `ticket_historial`.
- [x] `reabrir` pasa la queja de `resuelta` a `en_proceso` con el mismo técnico, suma 1 a `reaperturas`, limpia `confirmacion_vence_en`, `resuelto_en`, `resolucion` y `resuelto_por`, y guarda el motivo en el historial.
- [x] El vecino solicitante, el coordinador de la dependencia y el supervisor pueden confirmar y reabrir dentro de su alcance. Fuera de alcance reciben `404`. El técnico, el receptor y el administrador reciben `403`.
- [x] Reabrir sin motivo responde `400`. Confirmar sin motivo responde `400 MOTIVO_REQUERIDO` para el coordinador y el supervisor, y `200` para el vecino.
- [x] Con `ahora > confirmacion_vence_en`, las dos acciones responden `409 PLAZO_CONFIRMACION_VENCIDO`. En el instante exacto del vencimiento, funcionan.
- [x] Con `reaperturas >= max_reaperturas`, `reabrir` responde `409 LIMITE_REAPERTURAS` para todos los roles.
- [x] Al confirmar, el solicitante con correo recibe `queja_cerrada`. Al reabrir, recibe `queja_reabierta` con el motivo. Un fallo del envío no cambia el `200`.
- [x] Dos acciones simultáneas sobre la misma queja dejan exactamente una aplicada, y la otra responde `409`.
- [x] `GET /api/v1/tickets/:id` devuelve `confirmacion` solo para quejas en `resuelta`, con `venceEn`, `vencida`, `reaperturasRestantes`, `puedeConfirmar`, `puedeReabrir` y `exigeMotivoAlConfirmar` según el alcance del usuario.
- [x] Ningún archivo nuevo o modificado del backend compara el nombre de un rol, ni fija en el código el plazo, el máximo de reaperturas o el desfase horario de Guatemala.
- [x] En `/tickets/:id`, el bloque "Solución" muestra el plazo en `America/Guatemala` y los botones según los permisos del detalle. Los diálogos exigen los motivos obligatorios, y el texto temporal de SPEC 26 ya no aparece.
- [x] A 360 px de ancho, el bloque y los diálogos no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] La sección 6 del documento de definición y `CLAUDE.md` documentan las columnas, los parámetros, la regla del plazo y quién puede confirmar y reabrir.

## Decisiones

- **Sí:** el cierre automático (RF-30) va en su propia spec. Esta deja el vencimiento guardado para que el job solo tenga que leerlo.
- **No:** incluir el primer job de node-cron aquí.
- **Sí:** el vencimiento se calcula al resolver y se guarda en `tickets.confirmacion_vence_en`. Cambiar el calendario o el parámetro no altera los plazos ya comunicados.
- **No:** calcularlo al vuelo en cada lectura.
- **Sí:** el plazo vence al final del N-ésimo día hábil posterior al día de la resolución, en `America/Guatemala`. Es fácil de comunicar ("tienes hasta el lunes 9").
- **No:** la misma hora N días hábiles después, ni horas hábiles. La segunda opción requiere una jornada laboral que todavía no existe.
- **Sí:** el cálculo vive en `domain/calendario/` como funciones puras. La spec de SLA (RF-27) puede reutilizar el puerto `CalendarioRepository`.
- **Sí:** confirmar y reabrir siguen la matriz literal: el vecino, el coordinador de su dependencia y el supervisor. El técnico no puede, porque la matriz solo le da "en proceso, en espera, resuelta".
- **No:** solo el vecino, ni el vecino y el supervisor.
- **Sí:** un interno que confirma debe dar un motivo, para que el historial explique por qué cerró alguien que no es el vecino. Reabrir siempre exige motivo, como dice la sección 3.
- **Sí:** el parámetro vive en la tabla `parametros` (SPEC 15), cargado por la migración y sin endpoint para editarlo.
- **No:** una variable de entorno, porque el documento lo define como parámetro administrable.
- **Sí:** si el calendario no alcanza, `resolver` responde `409 CALENDARIO_INCOMPLETO`. Nunca se inventa un plazo.
- **No:** usar lunes a viernes como respaldo, porque ignoraría los asuetos sin aviso.
- **Sí:** los correos `queja_cerrada` y `queja_reabierta`, como eligió el usuario.
- **No:** el correo `queja_resuelta`. El usuario confirmó dejarlo fuera aunque el vecino no reciba aviso del inicio del plazo. Queda registrado como riesgo.
- **No:** la encuesta de satisfacción. Tiene su tabla, su endpoint y sus reportes.
- **Sí:** un máximo configurable de reaperturas (`max_reaperturas = 2`) que se cuenta en `tickets.reaperturas`. Al alcanzarlo, nadie puede reabrir, ni siquiera el supervisor. El vecino registra una queja nueva.
- **No:** reaperturas sin límite, ni una excepción para el supervisor.
- **No:** contar las reaperturas en `ticket_historial`. La columna permite que el dominio aplique la regla sin consultar el historial.
- **Sí:** sin avisos internos al reabrir. La queja vuelve a aparecer en `/atencion` del técnico. RF-32 agrega las notificaciones.
- **Sí:** los botones viven en el detalle `/tickets/:id`, el mismo para el vecino y los internos, con permisos calculados por el backend.
- **Sí:** el rango de los parámetros (1 a 30 días, 0 a 10 reaperturas), el largo de los motivos (1000), los códigos de error y los textos de la interfaz y los correos los propone esta spec. El usuario puede ajustarlos al revisarla.
- **Sí:** cambiar las firmas de `resolver`, `confirmarSolucion` y `reabrir` del dominio (SPEC 04, Implementado). Ningún caso de uso los llama todavía, porque SPEC 22 sigue en Borrador.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin `queja_resuelta`, el vecino no sabe que su plazo corre, y RF-30 cerrará quejas que nunca vio resueltas | Es una decisión explícita. La spec de RF-30 o la de RF-31 debe agregar `queja_resuelta` antes de activar el cierre automático. El vecino ve el plazo si entra a `/tickets/:id`. |
| `calendario_laboral` solo tiene 2026 y 2027 (`seed:dev`), y en producción puede no estar cargado | `resolver` responde `409 CALENDARIO_INCOMPLETO` en lugar de inventar un plazo. Cargar el calendario de producción es tarea de la administración de catálogos. |
| Un hueco en medio del calendario (un día sin fila) se salta sin aviso | El cálculo solo cuenta filas con `es_habil = true`. Mantener el calendario completo es responsabilidad de su administración. La prueba del paso 1 documenta el comportamiento. |
| Las quejas resueltas antes de la migración sin calendario suficiente quedan sin plazo | Las acciones responden `409 PLAZO_NO_DEFINIDO`. Se puede volver a resolver la queja después de cargar el calendario. |
| Con el límite sin excepciones, un problema real sin solucionar después de 2 reaperturas queda sin salida en la misma queja | Es una decisión explícita. El vecino ve el aviso y el enlace para registrar una queja nueva. |
| Al reabrir no se recalcula `vence_resolucion` | Lo resuelve la spec de SLA. La reapertura queda en el historial con su fecha. |
| Depende de 8 specs, 7 de ellas en Borrador (SPEC 09, 11, 15, 19, 22, 25 y 26) | Se implementa después de SPEC 26. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Cierre automático por vencimiento (RF-30).
- Correo `queja_resuelta`.
- Encuesta de satisfacción.
- Avisos internos al reabrir (RF-32).
- Recalcular el SLA al reabrir.
- Edición de los parámetros desde la administración.
- Aviso en la tarjeta de "Mis quejas" y en la consulta pública.

Cada uno de estos temas, cuando llegue, va en su propia spec.
