# SPEC 30 — Cálculo de vencimientos con calendario laboral

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 04, SPEC 15, SPEC 19, SPEC 20, SPEC 21, SPEC 22, SPEC 23, SPEC 25, SPEC 27, SPEC 29
> **Fecha:** 2026-10-23
> **Objetivo:** Calcular en horas hábiles (jornada del parámetro `jornada_laboral` sobre `calendario_laboral`) los vencimientos `vence_respuesta` y `vence_resolucion` de cada queja al aceptarla, congelarlos durante `en_espera`, recalcularlos al reanudar, al reabrir y al volver a aceptar tras un traslado, y mostrarlos a los internos en `/asignacion`, `/atencion` y `/tickets/:id`.

## Por qué existe esta spec

RF-27 pide calcular los vencimientos con el calendario laboral municipal (días hábiles y asuetos). RF-26 define los plazos en horas hábiles, y SPEC 29 los hace administrables.
La sección 3 del documento fija estas reglas:

- La primera respuesta corre desde el registro hasta que la queja pasa a `En proceso`.
- La resolución corre desde el registro hasta `Resuelta`, descontando el tiempo en `En espera`.
- La reapertura reinicia el plazo de resolución.

Hoy nadie calcula `vence_respuesta` ni `vence_resolucion`. SPEC 12, 19, 21 y 22 los dejaron en `null` para "la spec de SLA".
Además, "horas hábiles" necesita una jornada, y `calendario_laboral` solo dice si un día es hábil. SPEC 05 ya señaló ese vacío.

## Alcance

**Incluido:**

- Migración `0025_sla`:
  - Columnas de seguimiento en `tickets`: `primera_respuesta_en`, `sla_inicio_resolucion`, `sla_pausa_minutos`, `sla_pausado_desde` y `sla_restante_minutos`.
  - Parámetro `jornada_laboral` en `parametros` (SPEC 15).
- Aritmética de tiempo hábil en el dominio (`domain/calendario/tiempo-habil.ts`): sumar minutos hábiles a un instante y contar los minutos hábiles entre dos instantes.
- Reglas de vencimiento en el dominio (`domain/sla/vencimientos.ts`) y un `SlaService` que las aplica en los 6 momentos del ciclo:

  | Momento | Spec del caso de uso | Efecto |
  | --- | --- | --- |
  | `aceptar` en el triage | SPEC 19 | Calcula los dos vencimientos desde el registro. Sin SLA completo, `409 SLA_NO_CONFIGURADO` |
  | `iniciar` | SPEC 22 | Fija `primera_respuesta_en` la primera vez |
  | `poner_en_espera` | SPEC 22 | Congela el restante de resolución |
  | `reanudar` | SPEC 22 | Recalcula la resolución desde ahora con el restante |
  | Respuesta del vecino en espera | SPEC 23 | Igual que `reanudar` |
  | `reabrir` | SPEC 27 | Reinicia la resolución desde la reapertura |

  Volver a aceptar después de un traslado (SPEC 21) recalcula los dos vencimientos desde el registro, con la categoría y la prioridad nuevas, descontando la pausa acumulada.
- Exposición de los datos de SLA a los internos en las bandejas de SPEC 20 y SPEC 22 y en el detalle de SPEC 25. El vecino no los ve.
- El componente `IndicadorSla` en las tarjetas de `/asignacion` y `/atencion` y en el detalle `/tickets/:id`.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- La alerta al 80 % del plazo (RF-28) y el escalamiento al vencer (RF-29), que son jobs de node-cron en `infrastructure/jobs/`.
- El cierre automático por vencimiento de la confirmación (RF-30).
- Los indicadores de cumplimiento de SLA en los reportes (RF-39). `primera_respuesta_en`, `resuelto_en` y los vencimientos ya quedan guardados para calcularlos.
- Medios días hábiles, jornadas distintas por día de la semana y pausas para almorzar.
- Recalcular las quejas abiertas al cambiar una política o el calendario (SPEC 29 ya lo decidió).
- Reclasificar la prioridad o la categoría de una queja ya aceptada. No existe todavía.
- Mostrar los vencimientos al vecino.
- Una pantalla para editar `jornada_laboral`.
- Rellenar los vencimientos de las quejas ya aceptadas antes de esta spec.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0025_sla.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN primera_respuesta_en  timestamptz NULL,
  ADD COLUMN sla_inicio_resolucion timestamptz NULL,
  ADD COLUMN sla_pausa_minutos     integer NOT NULL DEFAULT 0 CHECK (sla_pausa_minutos >= 0),
  ADD COLUMN sla_pausado_desde     timestamptz NULL,
  ADD COLUMN sla_restante_minutos  integer NULL CHECK (sla_restante_minutos >= 0),
  ADD CONSTRAINT tickets_sla_pausa_completa
    CHECK ((sla_pausado_desde IS NULL) = (sla_restante_minutos IS NULL));
```

| Columna | Significado |
| --- | --- |
| `vence_respuesta` (SPEC 03) | Límite de la primera respuesta |
| `vence_resolucion` (SPEC 03) | Límite de la resolución. `NULL` mientras la queja está en `en_espera` |
| `primera_respuesta_en` | Primera vez que la queja pasó a `en_proceso`. No cambia después |
| `sla_inicio_resolucion` | Desde cuándo corre el plazo de resolución: `creado_en`, o el instante de la última reapertura |
| `sla_pausa_minutos` | Minutos hábiles acumulados en `en_espera` desde `sla_inicio_resolucion` |
| `sla_pausado_desde` | Cuándo empezó la espera actual. Solo tiene valor en `en_espera` |
| `sla_restante_minutos` | Minutos hábiles de resolución que faltaban al entrar en espera (0 si ya estaba vencida). Solo tiene valor en `en_espera` |

El `up` también inserta en `parametros` (con `ON CONFLICT (clave) DO NOTHING`):

| `clave` | `valor` (jsonb) |
| --- | --- |
| `jornada_laboral` | `{ "inicio": "08:00", "fin": "16:00" }` |

El `down` borra el parámetro, el `CHECK` y las 5 columnas. No hay relleno: las quejas aceptadas antes de esta spec quedan con los vencimientos en `NULL`.

### Jornada (`backend/src/domain/calendario/jornada.ts`)

```ts
export interface JornadaLaboral {
  inicio: string;   // 'HH:MM', 24 h, en ZONA_MUNICIPAL (SPEC 27)
  fin: string;      // 'HH:MM', estrictamente mayor que inicio
}

// Lanza ReglaDeNegocioError PARAMETRO_INVALIDO si el formato o el orden no son válidos.
export function validarJornada(valor: unknown): JornadaLaboral;
export function minutosPorJornada(jornada: JornadaLaboral): number;   // 480 con 08:00–16:00
```

La misma jornada aplica a todos los días con `es_habil = true` de `calendario_laboral`.

### Tiempo hábil (`backend/src/domain/calendario/tiempo-habil.ts`)

```ts
// Fechas hábiles (YYYY-MM-DD) que cubren el rango pedido, en orden.
export type DiasHabiles = readonly string[];

// El instante que resulta de sumar `minutos` hábiles a `desde`.
// Lanza CALENDARIO_INCOMPLETO si los días recibidos no alcanzan.
export function sumarMinutosHabiles(desde: Date, minutos: number, dias: DiasHabiles, jornada: JornadaLaboral): Date;

// Minutos hábiles en el intervalo [desde, hasta). Es 0 si hasta <= desde.
export function minutosHabilesEntre(desde: Date, hasta: Date, dias: DiasHabiles, jornada: JornadaLaboral): number;
```

Reglas:

- Un instante antes del inicio de la jornada de un día hábil empieza a contar en el inicio de ese día.
- Un instante después del fin, o en un día no hábil, empieza a contar en el inicio del siguiente día hábil.
- Si la suma termina exactamente al fin de una jornada, el resultado es ese fin, no el inicio del día siguiente.
- `sumarMinutosHabiles(x, 0, …)` devuelve el primer instante hábil desde `x`.
- Las horas se convierten a la zona municipal con `Intl.DateTimeFormat` (como en SPEC 27), sin desfase fijo en el código.
- Las funciones son puras y trabajan en minutos enteros.

Ejemplo con la jornada 08:00–16:00, sin asuetos:

| `desde` (Guatemala) | Minutos | Resultado |
| --- | --- | --- |
| Lunes 15:00 | 120 | Martes 09:00 |
| Viernes 18:00 | 60 | Lunes 09:00 |
| Lunes 08:00 | 480 | Lunes 16:00 |

### Puerto de calendario (SPEC 27)

`CalendarioRepository` de SPEC 27 suma dos métodos:

```ts
export interface CalendarioRepository {
  diasHabilesPosteriores(desde: string, cantidad: number): Promise<string[]>;  // SPEC 27
  // Hasta `cantidad` fechas con es_habil = true y fecha >= desde (incluye el día de inicio).
  diasHabilesDesde(desde: string, cantidad: number): Promise<string[]>;
  // Todas las fechas hábiles en [desde, hasta]. Lanza CALENDARIO_INCOMPLETO si falta alguna fila del rango.
  diasHabilesEntre(desde: string, hasta: string): Promise<string[]>;
}
```

Para sumar, el servicio pide `ceil(minutos / minutosPorJornada) + 1` días desde la fecha local de inicio.

### Reglas de vencimiento (`backend/src/domain/sla/vencimientos.ts`)

```ts
export interface EstadoSla {
  creadoEn: Date;
  venceRespuesta: Date | null;
  venceResolucion: Date | null;
  primeraRespuestaEn: Date | null;
  inicioResolucion: Date | null;
  pausaMinutos: number;
  pausadoDesde: Date | null;
  restanteMinutos: number | null;
}

export type CambiosSla = Partial<Omit<EstadoSla, 'creadoEn'>>;
```

| Momento | Cálculo |
| --- | --- |
| Aceptar (primera vez o después de un traslado) | `inicioResolucion ??= creadoEn`. `venceRespuesta = sumar(creadoEn, horasRespuesta × 60)`. `venceResolucion = sumar(inicioResolucion, horasResolucion × 60 + pausaMinutos)` |
| Iniciar | Si `primeraRespuestaEn` es `null`, toma `ahora`. Los vencimientos no cambian |
| Poner en espera | `restanteMinutos = minutosEntre(ahora, venceResolucion)` (0 si ya venció). `pausadoDesde = ahora`. `venceResolucion = null` |
| Reanudar o respuesta del vecino | `pausaMinutos += minutosEntre(pausadoDesde, ahora)`. `venceResolucion = sumar(ahora, restanteMinutos)`. `pausadoDesde = null`. `restanteMinutos = null` |
| Reabrir | `inicioResolucion = ahora`. `pausaMinutos = 0`. `venceResolucion = sumar(ahora, horasResolucion × 60)`, con la política vigente de la categoría y la prioridad. `venceRespuesta` y `primeraRespuestaEn` no cambian |

- `horasRespuesta` y `horasResolucion` salen de `politicas_sla` para la categoría y la prioridad de la queja en ese momento (SPEC 29).
- Después de un traslado, la queja ya no está en `en_espera` (`trasladar` solo parte de `asignada` o `en_proceso`, SPEC 04). Así que al volver a aceptar no hay una pausa abierta.
- Tras un traslado, si la queja ya había pasado por `en_proceso`, `primeraRespuestaEn` se conserva. La primera respuesta ya se cumplió una vez.

### `SlaService` (`backend/src/application/services/sla.service.ts`)

```ts
export class SlaService {
  alAceptar(ticket: EstadoSla & { categoriaId: number; prioridad: Prioridad }, trx): Promise<CambiosSla>;
  alIniciar(ticket: EstadoSla, ahora: Date): CambiosSla;
  alPonerEnEspera(ticket: EstadoSla, ahora: Date, trx): Promise<CambiosSla>;
  alReanudar(ticket: EstadoSla, ahora: Date, trx): Promise<CambiosSla>;
  alReabrir(ticket: EstadoSla & { categoriaId: number; prioridad: Prioridad }, ahora: Date, trx): Promise<CambiosSla>;
}
```

- Lee `jornada_laboral` con `ParametroRepository` (SPEC 15), los días con `CalendarioRepository` y la política con `PoliticaSlaRepository` (SPEC 29).
- Los casos de uso lo llaman dentro de su transacción, después del método de dominio. `TicketEscrituraRepository` guarda los `CambiosSla` junto con el resto de la transición.
- `alReanudar` es el único camino para salir de la pausa: lo llaman `AtencionService.reanudar` (SPEC 22) y el comentario del solicitante que reanuda la queja (SPEC 23). Así la regla vive en un solo lugar.
- Errores:

  | Código | HTTP | Cuándo |
  | --- | --- | --- |
  | `SLA_NO_CONFIGURADO` | 409 | La categoría no tiene política para la prioridad (`aceptar` o `reabrir`) |
  | `CALENDARIO_INCOMPLETO` | 409 | El calendario no cubre el cálculo (SPEC 27) |
  | `PARAMETRO_INVALIDO` | 409 | `jornada_laboral` ausente o inválida (SPEC 27) |

  En todos los casos la transacción se revierte y la queja no cambia.

### Cambios sobre specs anteriores

| Spec | Caso de uso | Cambio |
| --- | --- | --- |
| SPEC 19 | `aceptar` | Llama a `SlaService.alAceptar`. Puede responder `409 SLA_NO_CONFIGURADO`. La respuesta `200` agrega `venceRespuesta` y `venceResolucion` |
| SPEC 22 | `iniciar`, `poner_en_espera`, `reanudar` | Llaman a `alIniciar`, `alPonerEnEspera` y `alReanudar` |
| SPEC 23 | Comentario del solicitante en `en_espera` | Llama a `alReanudar` en la misma transacción que la transición |
| SPEC 27 | `reabrir` | Llama a `alReabrir` |
| SPEC 20 y SPEC 22 | Bandejas `por-asignar` y `atencion` | Agregan `sla: SlaDto` a cada elemento |
| SPEC 25 | `GET /tickets/:id` | Agrega `sla: SlaDto \| null`, que es `null` con alcance `propia` de `tickets.ver` |

```ts
export interface SlaDto {
  venceRespuesta: string | null;
  primeraRespuestaEn: string | null;
  venceResolucion: string | null;
  pausado: boolean;                      // estado === 'en_espera'
  restanteMinutosEnPausa: number | null;
}
```

El estado "vencido" lo calcula el frontend comparando con la hora actual. Así el dato no queda viejo en la caché.

### Frontend

| Elemento | Detalle |
| --- | --- |
| `IndicadorSla` | `features/tickets/sla/IndicadorSla.tsx`, en las tarjetas de `/asignacion` y `/atencion` y en el detalle `/tickets/:id` para los internos |
| Respuesta | Sin `primeraRespuestaEn`: "Responder antes de <fecha>", o "Respuesta vencida" si ya pasó. Con `primeraRespuestaEn`: "Respondida", y "fuera de plazo" si fue después de `venceRespuesta` |
| Resolución | `pausado`: "En pausa: quedan <h> h <m> min hábiles". Si no: "Resolver antes de <fecha>", o "Resolución vencida". No se muestra en `resuelta`, `cerrada` ni `rechazada` |
| Sin datos | Si los dos vencimientos son `null` y no está en pausa (quejas sin aceptar, o anteriores a esta spec), no se muestra nada |
| Accesibilidad | El estado vencido lleva el texto "vencida" y un ícono, no solo color (WCAG). Las fechas van en `America/Guatemala` |
| Triage | `PanelTriage` (SPEC 19) muestra "Esta categoría no tiene SLA configurado" ante un `409 SLA_NO_CONFIGURADO` |
| Textos | `locales/es/tickets.json`, bajo `sla.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas de tickets, parámetro
CLAUDE.md
backend/
  src/
    container.ts
    domain/
      calendario/jornada.ts
      calendario/tiempo-habil.ts
      sla/vencimientos.ts
      repositories/calendario-repository.ts            # diasHabilesDesde, diasHabilesEntre
    application/
      services/sla.service.ts
      services/triage.service.ts                       # aceptar (SPEC 19)
      services/atencion.service.ts                     # iniciar, poner en espera, reanudar (SPEC 22)
      services/comentarios.service.ts                  # reanudación por el vecino (SPEC 23)
      services/confirmacion.service.ts                 # reabrir (SPEC 27)
      services/consulta-tickets.service.ts             # sla en el detalle
      errors/error-de-aplicacion.ts                    # SLA_NO_CONFIGURADO
    infrastructure/
      database/migrations/0025_sla.ts
      repositories/knex-calendario-repository.ts
      repositories/knex-ticket-escritura-repository.ts # guarda CambiosSla
      repositories/knex-atencion-lectura-repository.ts
      repositories/knex-por-asignar-lectura-repository.ts
      repositories/knex-ticket-lectura-repository.ts
    presentation/middlewares/manejador-errores.ts      # SLA_NO_CONFIGURADO → 409
  tests/
    unit/calendario/jornada.test.ts
    unit/calendario/tiempo-habil.test.ts
    unit/sla/vencimientos.test.ts
    unit/sla/sla.service.test.ts
    db/schema.test.ts                                  # 0025
    db/sla.api.test.ts                                 # el ciclo completo contra Postgres real
frontend/
  src/
    features/tickets/sla/IndicadorSla.tsx
    features/tickets/api/*.ts                          # tipo SlaDto en bandejas y detalle
    features/tickets/asignacion/PanelAsignacion.tsx    # y su tarjeta
    features/tickets/atencion/AtencionPage.tsx
    features/tickets/triage/PanelTriage.tsx            # aviso SLA_NO_CONFIGURADO
    features/tickets/mis-quejas/DetalleQueja.tsx
    locales/es/tickets.json
  tests/
    features/tickets/indicador-sla.test.tsx
```

## Plan de implementación

1. Crear `domain/calendario/jornada.ts` y su prueba. Casos:
   - `08:00–16:00` es válida, con 480 minutos.
   - `16:00–08:00`, `8:00` y `25:00` dan `PARAMETRO_INVALIDO`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear `domain/calendario/tiempo-habil.ts` y su prueba. Casos:
   - Los tres ejemplos de la tabla.
   - Un asueto en medio salta al siguiente día hábil.
   - Un instante antes de las 08:00 empieza a las 08:00.
   - Terminar justo a las 16:00 devuelve las 16:00.
   - `minutosHabilesEntre` de viernes 15:00 a lunes 09:00 es 120, y de un instante a sí mismo es 0.
   - Con días insuficientes, lanza `CALENDARIO_INCOMPLETO`.
   - Un instante a las 23:30 en Guatemala usa la fecha local.

   Verificación: `npm test` pasa.
3. Crear `domain/sla/vencimientos.ts` y su prueba, con días y jornada fijos. Casos:
   - Aceptar calcula los dos vencimientos desde `creadoEn`.
   - Iniciar fija `primeraRespuestaEn` solo la primera vez.
   - Poner en espera congela el restante, con 0 si ya estaba vencida, y deja `venceResolucion` en `null`.
   - Reanudar suma la pausa y recalcula desde ahora.
   - Reabrir reinicia desde ahora con la pausa en 0 y conserva la primera respuesta.
   - Aceptar de nuevo después de un traslado parte de `inicioResolucion` y suma la pausa acumulada.

   Verificación: `npm test` pasa.
4. Crear la migración `0025_sla.ts` y ampliar `tests/db/schema.test.ts`:
   - Las 5 columnas existen con sus `CHECK`.
   - `sla_pausado_desde` sin `sla_restante_minutos` viola `tickets_sla_pausa_completa`.
   - Existe `jornada_laboral`.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
5. Ampliar `CalendarioRepository` y su implementación Knex. Crear `SlaService` y `sla.service.test.ts` con repositorios falsos. Casos:
   - Sin política → `SLA_NO_CONFIGURADO`.
   - Con la jornada inválida → `PARAMETRO_INVALIDO`.
   - Con el calendario corto → `CALENDARIO_INCOMPLETO`.
   - Pide la cantidad de días correcta para sumar.

   Verificación: `npm test` pasa.
6. Conectar `SlaService` en `aceptar` (SPEC 19) y en `iniciar`, `poner_en_espera` y `reanudar` (SPEC 22). Ampliar `KnexTicketEscrituraRepository` para guardar `CambiosSla`. Crear `tests/db/sla.api.test.ts`, con fechas controladas por el reloj de pruebas y el calendario de `seed:dev`. Casos:
   - Aceptar guarda los dos vencimientos según la política y la jornada.
   - Aceptar en una categoría sin SLA → `409 SLA_NO_CONFIGURADO`, y la queja sigue en `en_revision`.
   - Iniciar fija `primera_respuesta_en`.
   - Poner en espera deja `vence_resolucion` en `NULL` y guarda el restante.
   - Reanudar 2 horas hábiles después corre `vence_resolucion` 2 horas hábiles respecto del original.

   Verificación: `npm run test:db` pasa, y `tests/db/triage.api.test.ts` y `atencion.api.test.ts` siguen pasando.
7. Conectar `alReanudar` en el comentario del solicitante (SPEC 23), `alReabrir` en `reabrir` (SPEC 27) y el recálculo al volver a aceptar (SPEC 21). Ampliar `sla.api.test.ts`:
   - La respuesta del vecino en espera recalcula igual que `reanudar`.
   - Reabrir deja `vence_resolucion = reapertura + horas_resolucion` y `sla_pausa_minutos = 0`.
   - Trasladar y volver a aceptar con otra categoría recalcula los dos desde `creado_en` con la política nueva, sumando la pausa acumulada, y conserva `primera_respuesta_en`.

   Verificación: `npm run test:db` pasa.
8. Agregar `sla` a las bandejas `por-asignar` y `atencion` y al detalle (`null` con alcance `propia`). Ampliar sus pruebas de `test:db`: los internos reciben `sla`, y el vecino recibe `sla: null` en el detalle. Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
9. Frontend: crear `IndicadorSla.tsx` e `indicador-sla.test.tsx`, y usarlo en las tarjetas de `/asignacion` y `/atencion` y en el detalle. Agregar el aviso de `SLA_NO_CONFIGURADO` en `PanelTriage`. Casos:
   - Cada combinación de la tabla muestra su texto.
   - "vencida" se calcula con la hora actual simulada.
   - En pausa muestra el restante en horas y minutos.
   - Sin datos no muestra nada.
   - El vecino no ve el indicador.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
10. Actualizar la sección 6 del documento de definición (la fila `tickets` con las 5 columnas y el parámetro `jornada_laboral`). Actualizar `CLAUDE.md`:
    - La jornada única y la regla del tiempo hábil.
    - Las 5 reglas de vencimiento por momento.
    - Que `SlaService` es el único lugar donde se calculan.
    - Que los jobs de RF-28 y RF-29 deben leer `vence_respuesta` y `vence_resolucion`, ignorando las quejas en pausa.

    Verificación manual con el backend y `seed:dev`: `supervisor@vozmuni.test` acepta una queja de `Baches` con prioridad `alta`. `coordinador@vozmuni.test` ve en `/asignacion` "Responder antes de…" a 8 horas hábiles del registro. `tecnico@vozmuni.test` la inicia ("Respondida"), la pone en espera ("En pausa: quedan …") y la reanuda. La fecha de resolución se corre según el tiempo hábil que estuvo en pausa.

## Criterios de aceptación

- [ ] La migración `0025_sla` agrega las 5 columnas con sus `CHECK` y el parámetro `jornada_laboral = { inicio: '08:00', fin: '16:00' }`. Su `down` los elimina.
- [ ] `sumarMinutosHabiles` y `minutosHabilesEntre` respetan la jornada, los días no hábiles y los asuetos de `calendario_laboral`, y la zona `America/Guatemala`. Los tres ejemplos de la spec dan el resultado indicado.
- [ ] Al aceptar, `vence_respuesta = creado_en + horas_respuesta` y `vence_resolucion = sla_inicio_resolucion + horas_resolucion + sla_pausa_minutos`, en tiempo hábil, con la política de la categoría y la prioridad finales.
- [ ] Aceptar una queja cuya categoría no tiene política para la prioridad responde `409 SLA_NO_CONFIGURADO`, y la queja no cambia.
- [ ] `iniciar` fija `primera_respuesta_en` solo la primera vez que la queja pasa a `en_proceso`.
- [ ] `poner_en_espera` deja `vence_resolucion` en `NULL` y guarda `sla_pausado_desde` y `sla_restante_minutos` (0 si ya estaba vencida).
- [ ] `reanudar` y la respuesta del vecino en espera recalculan `vence_resolucion = ahora + sla_restante_minutos`, suman la pausa a `sla_pausa_minutos` y limpian la pausa, por el mismo método de `SlaService`.
- [ ] `reabrir` deja `sla_inicio_resolucion = ahora`, `sla_pausa_minutos = 0` y `vence_resolucion = ahora + horas_resolucion`, sin tocar `vence_respuesta` ni `primera_respuesta_en`.
- [ ] Volver a aceptar después de un traslado recalcula los dos vencimientos desde `creado_en` (o desde la última reapertura) con la política nueva y la pausa acumulada.
- [ ] Con el calendario incompleto o la jornada inválida, la acción responde `409 CALENDARIO_INCOMPLETO` o `409 PARAMETRO_INVALIDO`, y la queja no cambia.
- [ ] Las bandejas `por-asignar` y `atencion` y el detalle incluyen `sla` para los internos. El detalle devuelve `sla: null` al vecino.
- [ ] `IndicadorSla` muestra "Responder antes de…", "Respondida", "En pausa: quedan…", "Resolver antes de…" y los estados vencidos con texto, en `America/Guatemala`, en `/asignacion`, `/atencion` y `/tickets/:id`.
- [ ] Ningún archivo nuevo o modificado fija en el código horas de jornada, horas de SLA, asuetos ni el desfase horario de Guatemala.
- [ ] A 360 px de ancho, el indicador no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las columnas, la jornada y las reglas de vencimiento.

## Decisiones

- **Sí:** esta spec cubre el cálculo al aceptar, la pausa y los reinicios. Todas las reglas que mueven un vencimiento viven en `SlaService`, como pide `CLAUDE.md` ("una sola casa para las reglas").
- **No:** el 80 % y el escalamiento. Son jobs con su propia configuración y sus propias pruebas.
- **Sí:** una sola jornada en `parametros.jornada_laboral` (08:00–16:00 por defecto), para todos los días hábiles. Resuelve el vacío de SPEC 05.
- **No:** horas por fecha en `calendario_laboral`, ni jornadas por día de la semana. Los medios días quedan sin modelar.
- **Sí:** el plazo corre desde el registro (`creado_en`), literal a la sección 3, aunque se calcule recién al aceptar. El tiempo en el triage cuenta.
- **No:** contar desde la aceptación.
- **Sí:** aceptar sin SLA completo responde `409 SLA_NO_CONFIGURADO`. Nunca se inventa un plazo, coherente con `CALENDARIO_INCOMPLETO` de SPEC 27.
- **No:** aceptar con los vencimientos en `null`.
- **Sí:** la pausa congela el restante (`sla_restante_minutos`) y deja `vence_resolucion` en `NULL`. Así nadie ve una fecha engañosa durante la espera, y los jobs de RF-28 y RF-29 ignoran las quejas en pausa con solo mirar el `NULL`.
- **No:** extender la fecha al reanudar.
- **Sí:** además del restante se acumula `sla_pausa_minutos`. Hace falta para recalcular "desde el registro descontando la espera" después de un traslado. Es una consecuencia de combinar las respuestas del usuario, no una pregunta aparte.
- **Sí:** la reapertura reinicia la resolución desde ese instante, con el plazo completo. La primera respuesta no cambia.
- **Sí:** volver a aceptar después de un traslado recalcula desde el registro con la categoría y la prioridad nuevas. El error de dependencia no le da tiempo extra a la municipalidad.
- **No:** reiniciar desde la nueva aceptación, ni conservar los vencimientos originales.
- **Sí:** se guarda `primera_respuesta_en`, para mostrar "Respondida" sin leer el historial y para los reportes de RF-39.
- **Sí:** el cálculo de tiempo hábil son funciones puras del dominio, y `SlaService` les pasa los días. El cálculo no consulta la base, y la prueba no necesita Postgres.
- **Sí:** los vencimientos se muestran a los internos en las bandejas y en el detalle, y no al vecino.
- **Sí:** "vencido" se calcula en el frontend con la hora actual, para que el dato no quede viejo en la caché.
- **Sí:** sin relleno de las quejas ya aceptadas. No hay datos de producción, y los de desarrollo se regeneran.
- **Sí:** la jornada por defecto, los textos del indicador y el formato del restante los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Toca los casos de uso de 5 specs (19, 21, 22, 23 y 27), todas en Borrador | Se implementa después de SPEC 29. Cada paso conserva las pruebas existentes de esas specs. Si cambian sus contratos, se revisa esta antes de aprobarla. |
| La reanudación por comentario del vecino (SPEC 23) olvida recalcular, y la queja queda sin `vence_resolucion` | `alReanudar` es el único camino de salida de la pausa, y el paso 7 prueba los dos orígenes. El `CHECK` `tickets_sla_pausa_completa` impide estados de pausa a medias. |
| `calendario_laboral` solo cubre 2026 y 2027 | Las acciones responden `409 CALENDARIO_INCOMPLETO` en lugar de calcular mal. Cargar el calendario es tarea de la administración de catálogos. |
| Los medios días hábiles (24 y 31 de diciembre) cuentan como jornadas completas | Es una decisión explícita. Si hace falta, otra spec agrega horas por fecha al calendario. |
| Un plazo largo pide muchos días al calendario | Se piden `ceil(minutos / 480) + 1` días, con un índice por la clave primaria `fecha`. |
| Las quejas aceptadas antes de esta spec no tienen vencimientos y nunca escalarán | Solo existen en desarrollo. El indicador no muestra nada para ellas. |
| Quejas trasladadas varias veces acumulan recálculos y pueden quedar vencidas al volver a aceptarlas | Es el comportamiento elegido: el vecino espera desde el registro. El supervisor las ve vencidas en las bandejas. |

## Lo que **no** está en esta spec

- Alerta del 80 % y escalamiento (RF-28, RF-29).
- Cierre automático (RF-30).
- Indicadores de cumplimiento en los reportes (RF-39).
- Medios días, jornadas por día y pausa de almuerzo.
- Recálculo al cambiar políticas o el calendario, y reclasificación.
- Vencimientos para el vecino y edición de la jornada.

Cada uno de estos temas, cuando llegue, va en su propia spec.
