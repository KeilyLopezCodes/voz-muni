# SPEC 31 — Alerta al 80 % del plazo

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 06, SPEC 08, SPEC 15, SPEC 17, SPEC 30
> **Fecha:** 2026-10-23
> **Objetivo:** Avisar dentro de la aplicación al técnico asignado y a los coordinadores de la dependencia cuando una queja llega al porcentaje configurado (80 %) de su plazo de respuesta o de resolución, mediante un job de node-cron que lee instantes precalculados por `SlaService`, y mostrar esos avisos en una campana de notificaciones.

## Por qué existe esta spec

RF-28 (prioridad S) pide que, al llegar al 80 % del plazo, el sistema alerte al técnico y al coordinador. RF-32 pide que los usuarios internos reciban esas alertas de SLA como notificaciones en la aplicación.
La tabla `notificaciones` existe desde SPEC 03, pero nadie la usa, no hay forma de verlas, y `infrastructure/jobs/` está vacío. SPEC 30 ya calcula `vence_respuesta` y `vence_resolucion`. Esta spec agrega el instante del 80 %, el primer job del proyecto y una bandeja mínima de notificaciones, que RF-32 ampliará con las asignaciones y los comentarios.

## Alcance

**Incluido:**

- Migración `0026_alertas_sla`:
  - En `tickets`: columnas `alerta_respuesta_en`, `alerta_resolucion_en`, `alerta_respuesta_enviada_en` y `alerta_resolucion_enviada_en`, con índices parciales.
  - En `notificaciones`: columna `datos` e índice `(usuario_id, creado_en)`.
  - Parámetro `sla_umbral_alerta = 80` en `parametros`.
- **Cambio sobre SPEC 30:** `SlaService` calcula y guarda el instante de la alerta cada vez que calcula un vencimiento, lo deja en `NULL` durante la pausa, y reinicia la marca de enviada al aceptar y al reabrir.
- `AlertasSlaService.procesar(ahora)` en `application/`: reclama las quejas que llegaron al umbral, crea las notificaciones y marca la alerta como enviada, todo en una transacción.
- El job `infrastructure/jobs/alertas-sla.job.ts` con `node-cron`, cada 5 minutos por defecto. Se configura con `SLA_ALERTAS_CRON` y se desactiva con `SLA_ALERTAS_ACTIVO=false`.
- Destinatarios: el técnico asignado y los usuarios activos de la dependencia de la queja cuyo rol tiene `tickets.ver` con alcance `dependencia`.
- API de notificaciones del propio usuario: listar, marcar una como leída y marcar todas.
- Frontend: la campana con el contador de no leídas en `AppLayout` y un menú con las 20 más recientes.
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `.env.example`.

**Fuera de alcance (para specs futuras):**

- El escalamiento al vencer el plazo y el aviso al supervisor (RF-29).
- Las notificaciones de asignaciones y comentarios (el resto de RF-32).
- Alertas por correo, SMS o WhatsApp (RF-31, RF-34).
- Una página `/notificaciones` con todo el historial, filtros o paginación.
- Notificaciones en tiempo real (WebSocket o SSE).
- Borrar o archivar notificaciones, y una política de retención.
- Una pantalla para editar `sla_umbral_alerta`.
- Pino, logs JSON con id de correlación y métricas del job (RNF-21). El job escribe en la salida estándar como el resto del backend hoy.
- Las alertas de las quejas aceptadas antes de esta spec, que no tienen vencimientos (SPEC 30).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0026_alertas_sla.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN alerta_respuesta_en          timestamptz NULL,
  ADD COLUMN alerta_resolucion_en         timestamptz NULL,
  ADD COLUMN alerta_respuesta_enviada_en  timestamptz NULL,
  ADD COLUMN alerta_resolucion_enviada_en timestamptz NULL;

CREATE INDEX tickets_alerta_respuesta_pendiente_idx
  ON tickets (alerta_respuesta_en) WHERE alerta_respuesta_enviada_en IS NULL;
CREATE INDEX tickets_alerta_resolucion_pendiente_idx
  ON tickets (alerta_resolucion_en) WHERE alerta_resolucion_enviada_en IS NULL;

ALTER TABLE notificaciones ADD COLUMN datos jsonb NOT NULL DEFAULT '{}';
CREATE INDEX notificaciones_usuario_creado_idx ON notificaciones (usuario_id, creado_en);
```

El `up` también inserta en `parametros` (con `ON CONFLICT (clave) DO NOTHING`):

| `clave` | `valor` (jsonb) |
| --- | --- |
| `sla_umbral_alerta` | `80` |

El `down` borra el parámetro, los índices y las columnas.

### Tipos de notificación

`notificaciones.tipo` sigue sin `CHECK` (SPEC 03). Esta spec define dos valores:

| `tipo` | `datos` |
| --- | --- |
| `sla_alerta_respuesta` | `{ "vence": "<ISO 8601 UTC de vence_respuesta>", "umbral": 80 }` |
| `sla_alerta_resolucion` | `{ "vence": "<ISO 8601 UTC de vence_resolucion>", "umbral": 80 }` |

`ticket_id` siempre tiene valor en estos tipos. El texto de cada notificación no se guarda: lo arma el frontend con los archivos de traducción.

### Instante de la alerta (cambio sobre SPEC 30)

`domain/sla/vencimientos.ts` suma estas reglas. Llamamos `u` al umbral (de 1 a 99), `T` al plazo de la política en minutos hábiles y `antes(T) = T − floor(T × u / 100)` a los minutos que faltan al llegar al umbral.

| Momento (SPEC 30) | `alerta_respuesta_en` | `alerta_resolucion_en` | Marcas de enviada |
| --- | --- | --- | --- |
| Aceptar (primera vez o tras un traslado) | `sumar(creadoEn, floor(Tresp × u / 100))`, o `NULL` si ya hay `primeraRespuestaEn` | `sumar(inicioResolucion, floor(Tresol × u / 100) + pausaMinutos)` | Las dos vuelven a `NULL` |
| Iniciar | `NULL` | sin cambio | sin cambio |
| Poner en espera | sin cambio | `NULL` | sin cambio |
| Reanudar o respuesta del vecino | sin cambio | `sumar(ahora, restante − antes(Tresol))` si `restante > antes(Tresol)`; si no, `ahora` | sin cambio |
| Reabrir | sin cambio | `sumar(ahora, floor(Tresol × u / 100))` | la de resolución vuelve a `NULL` |

- Reanudar nunca reinicia la marca. Una pausa no devuelve tiempo, así que una alerta ya enviada no se repite al reanudar.
- Si el umbral ya pasó al calcularlo (por ejemplo, un triage largo con prioridad urgente), el instante queda en el pasado, y el job envía la alerta en su siguiente corrida.
- `SlaService` lee `sla_umbral_alerta` con `ParametroRepository` (SPEC 15). Si falta o no es un entero de 1 a 99, responde `409 PARAMETRO_INVALIDO`, igual que la jornada (SPEC 30).
- `CambiosSla` (SPEC 30) suma los 4 campos nuevos, y `TicketEscrituraRepository` los guarda.

### Reclamo y envío (`backend/src/application/services/alertas-sla.service.ts`)

```ts
export type PlazoAlerta = 'respuesta' | 'resolucion';

export interface AlertaPendiente {
  ticketId: number;
  plazo: PlazoAlerta;
  vence: Date;
  dependenciaId: number;
  asignadoA: number | null;
}

// backend/src/domain/repositories/alertas-sla-repository.ts
export interface AlertasSlaRepository {
  // En la transacción: SELECT … FOR UPDATE SKIP LOCKED de hasta `limite` alertas vencidas.
  reclamarPendientes(ahora: Date, limite: number, trx): Promise<AlertaPendiente[]>;
  marcarEnviada(ticketId: number, plazo: PlazoAlerta, ahora: Date, trx): Promise<void>;
  // Coordinadores: usuarios activos de la dependencia cuyo rol tiene tickets.ver = 'dependencia'.
  destinatarios(alerta: AlertaPendiente, trx): Promise<number[]>;
}

export class AlertasSlaService {
  // Procesa por lotes de 200 hasta que no queden pendientes. Devuelve cuántas alertas envió.
  procesar(ahora: Date): Promise<number>;
}
```

Una alerta está pendiente si cumple todas estas condiciones:

| Plazo | Condición |
| --- | --- |
| `respuesta` | `alerta_respuesta_en <= ahora`, `alerta_respuesta_enviada_en IS NULL`, `primera_respuesta_en IS NULL`, `estado IN ('asignada', 'en_proceso')` |
| `resolucion` | `alerta_resolucion_en <= ahora`, `alerta_resolucion_enviada_en IS NULL`, `estado IN ('asignada', 'en_proceso')` |

- El filtro de estado excluye las quejas en revisión (por ejemplo, después de un traslado), en espera, resueltas y finales, sin agregar más llamadas a `SlaService`.
- Por cada alerta, en la misma transacción: se calculan los destinatarios, se inserta una fila de `notificaciones` por destinatario y se marca la alerta como enviada.
- Los destinatarios son el técnico asignado (si existe y está activo) y los coordinadores, sin duplicados. Si no hay ninguno, la alerta se marca igual y se escribe un aviso en el log, para no reintentarla para siempre.
- La regla de los coordinadores depende del alcance de `tickets.ver`, no del nombre del rol. No usa `dependencias.coordinador_id`, que es `NULL` en `seed:dev` (SPEC 05).
- `FOR UPDATE SKIP LOCKED` asegura que dos instancias del backend, o dos corridas solapadas, nunca envíen la misma alerta dos veces.

### Job (`backend/src/infrastructure/jobs/alertas-sla.job.ts`)

```ts
// Programa AlertasSlaService.procesar con node-cron. Devuelve una función para detenerlo.
export function iniciarJobAlertasSla(servicio: AlertasSlaService, config: { cron: string }, reloj: Clock): () => void;
```

- `server.ts` lo inicia después de `listen` si `SLA_ALERTAS_ACTIVO` es `true`, y lo detiene en `shutdown` antes de cerrar Knex. `app.ts` no lo inicia, así que Supertest nunca lo dispara.
- Si una corrida sigue en curso, la siguiente se salta (con una bandera en memoria).
- Un error se registra en el log y no detiene el proceso. La siguiente corrida reintenta.
- Variables nuevas en `infrastructure/config/env.ts` (Zod):

  | Variable | Tipo | Por defecto |
  | --- | --- | --- |
  | `SLA_ALERTAS_ACTIVO` | `true` / `false` | `true` (en `NODE_ENV=test`, `false`) |
  | `SLA_ALERTAS_CRON` | Expresión válida de node-cron | `*/5 * * * *` |

- Dependencia nueva: `node-cron`, con una versión fija.

### API de notificaciones

Las tres rutas usan solo `autenticar`: cada usuario ve únicamente sus propias notificaciones, así que no hace falta un permiso de la matriz.

| Endpoint | Detalle | Respuesta |
| --- | --- | --- |
| `GET /api/v1/notificaciones` | Las 20 más recientes del usuario (`creado_en DESC, id DESC`), y el total de no leídas | `200 { datos: NotificacionDto[], noLeidas: number }` |
| `PATCH /api/v1/notificaciones/:id` | Cuerpo `{ leida: true }` (Zod `strict`). Una notificación de otro usuario o inexistente responde `404` | `200` con el `NotificacionDto` |
| `POST /api/v1/notificaciones/marcar-leidas` | Marca todas las del usuario | `204` |

```ts
export interface NotificacionDto {
  id: number;
  tipo: string;                  // 'sla_alerta_respuesta' | 'sla_alerta_resolucion' por ahora
  leida: boolean;
  creadoEn: string;              // ISO 8601 en UTC
  ticket: { id: number; numero: string; titulo: string } | null;
  datos: Record<string, unknown>;
}
```

Lo implementan `NotificacionesService` y `KnexNotificacionRepository`. Abrir la queja desde la notificación pasa por `GET /tickets/:id`, que aplica el alcance (SPEC 11). Si el usuario ya no tiene acceso, ve el `404` de siempre.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Campana | `shared/notificaciones/CampanaNotificaciones.tsx`, en `AppLayout` (SPEC 06), para cualquier usuario con sesión. Es un `IconButton` con `Badge` del total de no leídas y `aria-label` "Notificaciones, N sin leer". Consulta `GET /notificaciones` cada 60 s con TanStack Query, y también al recuperar el foco |
| Menú | Muestra las 20 más recientes. Las no leídas van en negrita y con la marca textual "Nueva". Sin notificaciones: "No tienes notificaciones" |
| Texto | `sla_alerta_respuesta`: "La queja <numero> llegó al <umbral> % del plazo de respuesta. Vence el <fecha>". `sla_alerta_resolucion`: igual, con "plazo de resolución". Las fechas van en `America/Guatemala`. Un `tipo` desconocido muestra "Nueva notificación" |
| Al hacer clic | Marca la notificación como leída (`PATCH`) y navega a `/tickets/:id` |
| Marcar todas | "Marcar todas como leídas" (`POST`), visible si hay no leídas |
| Ubicación | En `shared/`, porque la usa `AppLayout` y la consumirán varias features (RF-32). No importa nada de `features/` |
| Textos | `locales/es/comun.json`, bajo `notificaciones.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas, notificaciones.datos, 3 endpoints
CLAUDE.md
backend/
  package.json                                       # node-cron
  .env.example                                       # SLA_ALERTAS_ACTIVO, SLA_ALERTAS_CRON
  src/
    server.ts                                        # inicia y detiene el job
    app.ts
    container.ts
    infrastructure/config/env.ts
    domain/
      sla/vencimientos.ts                            # instantes de alerta (cambio sobre SPEC 30)
      repositories/alertas-sla-repository.ts
      repositories/notificacion-repository.ts
    application/
      services/sla.service.ts                        # umbral y marcas (SPEC 30)
      services/alertas-sla.service.ts
      services/notificaciones.service.ts
    infrastructure/
      database/migrations/0026_alertas_sla.ts
      repositories/knex-alertas-sla-repository.ts
      repositories/knex-notificacion-repository.ts
      repositories/knex-ticket-escritura-repository.ts
      jobs/alertas-sla.job.ts
    presentation/
      validators/notificaciones.validators.ts
      controllers/notificaciones.controller.ts
      routes/notificaciones.routes.ts
  tests/
    unit/sla/vencimientos.test.ts                    # instantes de alerta
    unit/sla/alertas-sla.service.test.ts
    unit/jobs/alertas-sla.job.test.ts
    unit/env.test.ts
    db/schema.test.ts                                # 0026
    db/alertas-sla.test.ts                           # reclamo, destinatarios, concurrencia
    db/notificaciones.api.test.ts                    # Supertest contra Postgres real
frontend/
  src/
    shared/notificaciones/notificaciones-api.ts
    shared/notificaciones/CampanaNotificaciones.tsx
    shared/layout/AppLayout.tsx
    locales/es/comun.json
  tests/
    shared/campana-notificaciones.test.tsx
    shared/app-layout.test.tsx
```

## Plan de implementación

1. Agregar a `domain/sla/vencimientos.ts` el cálculo de los instantes de alerta y las reglas de las marcas, y ampliar `vencimientos.test.ts`. Casos:
   - Con `u = 80`, un plazo de respuesta de 8 horas hábiles alerta a las 6 h 24 min hábiles del registro.
   - Iniciar deja `alertaRespuestaEn` en `null`.
   - Poner en espera deja `alertaResolucionEn` en `null`.
   - Reanudar con un restante mayor que el 20 % alerta a `restante − antes(T)` desde ahora. Con un restante menor, alerta en `ahora`.
   - Reanudar no reinicia la marca.
   - Aceptar y reabrir reinician sus marcas.
   - Un umbral ya pasado queda en el pasado.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0026_alertas_sla.ts` y ampliar `tests/db/schema.test.ts`: existen las columnas, los dos índices parciales, `notificaciones.datos`, el índice `(usuario_id, creado_en)` y el parámetro, y el `down` los elimina. Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Conectar el umbral en `SlaService` y guardar los campos nuevos en `KnexTicketEscrituraRepository`. Ampliar `tests/db/sla.api.test.ts` (SPEC 30):
   - Aceptar guarda los dos instantes.
   - Iniciar limpia el de respuesta.
   - La espera limpia el de resolución y la reanudación lo recalcula.
   - Con `sla_umbral_alerta = 0`, aceptar responde `409 PARAMETRO_INVALIDO`.

   Verificación: `npm run test:db` pasa.
4. Crear `AlertasSlaRepository`, `KnexAlertasSlaRepository` y `AlertasSlaService`, con `alertas-sla.service.test.ts` y repositorios falsos. Crear `tests/db/alertas-sla.test.ts`. Casos:
   - Una queja `asignada` con el umbral de respuesta vencido notifica al técnico asignado y al coordinador de la dependencia (`coordinador@vozmuni.test`), y marca la alerta enviada.
   - Una segunda corrida no duplica.
   - No notifica a un coordinador de otra dependencia, ni a un usuario inactivo.
   - Sin técnico asignado, notifica solo a los coordinadores.
   - Sin destinatarios, marca la alerta y no inserta filas.
   - Las quejas en `en_espera`, `en_revision`, `resuelta` o con `primera_respuesta_en` no se reclaman para respuesta.
   - Dos `procesar` simultáneos envían cada alerta una sola vez.
   - Más de 200 pendientes se procesan en varios lotes.

   Verificación: `npm run test:db` y `npm test` pasan.
5. Agregar `node-cron` y las variables a `env.ts` y `.env.example`. Crear `jobs/alertas-sla.job.ts` y `alertas-sla.job.test.ts` con un `node-cron` simulado. Casos:
   - Programa con la expresión configurada.
   - Salta una corrida si la anterior sigue en curso.
   - Un error no detiene el job.
   - La función devuelta lo detiene.

   Iniciarlo y detenerlo en `server.ts`. Ampliar `env.test.ts`: una expresión inválida falla la validación, y en `test` el job queda desactivado por defecto. Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan, y `npm start` muestra en el log que el job quedó programado.
6. Crear `NotificacionRepository`, `KnexNotificacionRepository`, `NotificacionesService`, el validador, el controlador y las rutas, y conectarlos en `container.ts` y `app.ts`. Crear `tests/db/notificaciones.api.test.ts`. Casos:
   - El técnico lista sus notificaciones (20 como máximo, de la más reciente) con `noLeidas` y los datos del ticket.
   - Marcar una suya → `200`. Marcar una de otro usuario → `404`.
   - `{ leida: false }` o un campo extra → `400 VALIDACION`.
   - `marcar-leidas` deja `noLeidas = 0`.
   - Sin sesión → `401`.
   - La lista de un usuario nunca incluye notificaciones de otro.

   Verificación: `npm run test:db` pasa.
7. Frontend: crear `notificaciones-api.ts` y `CampanaNotificaciones.tsx`, y agregarla a `AppLayout`. Crear `campana-notificaciones.test.tsx`. Casos:
   - El contador muestra las no leídas, con el `aria-label`.
   - El menú arma el texto traducido con el número de la queja, el umbral y la fecha en Guatemala.
   - Un clic marca la notificación como leída y navega a `/tickets/:id`.
   - "Marcar todas como leídas" llama al `POST` y se oculta sin no leídas.
   - Un tipo desconocido muestra el texto genérico.
   - Consulta cada 60 s (con temporizadores simulados).

   Ampliar `app-layout.test.tsx`: la campana aparece con sesión. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
8. Actualizar la sección 6 del documento de definición (columnas de `tickets`, `notificaciones.datos`, los 3 endpoints y el job). Actualizar `CLAUDE.md`:
   - Los tipos de notificación y su `datos`.
   - Que `SlaService` también calcula los instantes de alerta.
   - Las variables del job y que no corre en las pruebas.
   - Que RF-29 debe seguir el mismo patrón (instante precalculado, reclamo con `SKIP LOCKED`, job delgado).

   Verificación manual con el backend, `seed:dev` y `SLA_ALERTAS_CRON='* * * * *'`: se acepta una queja `urgente` de `Baches` (2 h de respuesta), se asigna a `tecnico@vozmuni.test` y se adelanta `alerta_respuesta_en` con SQL. En menos de un minuto, el técnico y `coordinador@vozmuni.test` ven la campana con 1, el texto de la alerta y el enlace a la queja.

## Criterios de aceptación

- [ ] La migración `0026_alertas_sla` agrega las 4 columnas de alerta con sus índices parciales, `notificaciones.datos` con su índice y el parámetro `sla_umbral_alerta = 80`. Su `down` los elimina.
- [ ] `SlaService` guarda `alerta_respuesta_en` y `alerta_resolucion_en` al `u %` del plazo en tiempo hábil, con `u` leído de `parametros`. Los deja en `NULL` al iniciar (respuesta) y al poner en espera (resolución), y los recalcula al reanudar, al reabrir y al aceptar.
- [ ] Aceptar y reabrir reinician las marcas de enviada que correspondan. Reanudar no las reinicia.
- [ ] `AlertasSlaService.procesar` crea una notificación `sla_alerta_respuesta` o `sla_alerta_resolucion`, con `datos.vence` y `datos.umbral`, para el técnico asignado y cada coordinador activo de la dependencia. Después marca la alerta como enviada en la misma transacción.
- [ ] Solo se alertan las quejas en `asignada` o `en_proceso`. La alerta de respuesta solo sale si `primera_respuesta_en` es `NULL`.
- [ ] Ninguna alerta se envía dos veces, ni en corridas repetidas ni en corridas simultáneas.
- [ ] Una alerta sin destinatarios se marca como enviada sin insertar notificaciones.
- [ ] El job corre con node-cron según `SLA_ALERTAS_CRON` (cada 5 minutos por defecto), salta una corrida si la anterior no terminó, sobrevive a errores, no corre si `SLA_ALERTAS_ACTIVO=false` ni en `NODE_ENV=test`, y se detiene al cerrar el servidor.
- [ ] `GET /api/v1/notificaciones`, `PATCH /api/v1/notificaciones/:id` y `POST /api/v1/notificaciones/marcar-leidas` operan solo sobre las notificaciones del usuario autenticado. Una ajena responde `404`.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol ni fija el 80 % en el código: los coordinadores salen del alcance de `tickets.ver`, y el umbral de `parametros`.
- [ ] La campana de `AppLayout` muestra el contador de no leídas con texto accesible y se actualiza cada 60 s. El menú muestra las 20 más recientes con el texto traducido y la fecha en `America/Guatemala`. Un clic marca la notificación y abre `/tickets/:id`, y "Marcar todas como leídas" funciona.
- [ ] A 360 px de ancho, la campana y su menú no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición, `CLAUDE.md` y `.env.example` documentan las columnas, los endpoints, los tipos de notificación y las variables del job.

## Decisiones

- **Sí:** la alerta llega dentro de la aplicación, con una bandeja mínima (campana y menú), como pide RF-32 para las alertas de SLA. Deja la base que RF-32 ampliará.
- **No:** solo escribir filas sin mostrarlas, ni usar el correo.
- **Sí:** se alertan los dos plazos, respuesta y resolución, con una alerta como máximo por cada plazo calculado.
- **Sí:** los coordinadores son los usuarios activos de la dependencia cuyo rol tiene `tickets.ver` con alcance `dependencia`. Funciona con `seed:dev` y no menciona roles en el código.
- **No:** `dependencias.coordinador_id`, que hoy es `NULL` en todas las dependencias.
- **Sí:** el instante del 80 % se precalcula en `SlaService` cuando se calcula el vencimiento. El job solo consulta un índice, y el cálculo en tiempo hábil sigue teniendo un único lugar.
- **No:** recalcular el tiempo transcurrido en cada corrida del job.
- **Sí:** el umbral es el parámetro `sla_umbral_alerta = 80`, sin pantalla. Respeta la regla de no fijar valores de SLA en el código.
- **Sí:** un plazo recalculado puede volver a alertar. Aceptar y reabrir reinician la marca. Reanudar no la reinicia, porque una pausa no devuelve tiempo.
- **Sí:** node-cron dentro del proceso del backend, cada 5 minutos por defecto. Se configura y se desactiva por variables de entorno, y nunca corre en las pruebas.
- **Sí:** contra corridas duplicadas, se usa `FOR UPDATE SKIP LOCKED` por fila y una bandera en memoria por proceso. Esto reemplaza al advisory lock mencionado al elegir el job: da la misma garantía por fila y permite que dos instancias repartan el trabajo. Es una propuesta de esta spec y puede ajustarse al revisarla.
- **No:** un endpoint llamado por un cron externo.
- **Sí:** el job es delgado: llama a `AlertasSlaService.procesar`, que vive en `application/`, como pide `CLAUDE.md` para los jobs.
- **Sí:** el texto de la notificación lo arma el frontend con traducciones, a partir de `tipo` y `datos`. Las notificaciones no guardan frases en la base.
- **Sí:** la API de notificaciones solo usa `autenticar`, sin una acción nueva en la matriz, porque cada usuario solo accede a lo suyo.
- **Sí:** la campana vive en `shared/notificaciones/`, porque la usa `AppLayout` y la usarán varias features.
- **Sí:** el tamaño de los lotes (200), la cantidad del menú (20), el intervalo de consulta (60 s) y los textos los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Es el primer job del proyecto: un error de configuración en producción lo deja sin correr y sin aviso | `npm start` registra en el log que el job quedó programado, cada error queda en el log, y `SLA_ALERTAS_CRON` se valida con Zod al arrancar. Las métricas llegan con RNF-21. |
| Si el backend escala a varias instancias, todas corren el job | `FOR UPDATE SKIP LOCKED` reparte las filas y evita duplicados. El paso 4 lo prueba con dos corridas simultáneas. |
| Un coordinador nuevo no recibe las alertas pendientes que ya se enviaron | Es el comportamiento esperado: los destinatarios se calculan al enviar. |
| La campana consulta cada 60 s con cada pestaña abierta | La consulta usa el índice `(usuario_id, creado_en)` y devuelve 20 filas. El tiempo real queda para otra spec. |
| La tabla `notificaciones` crece sin límite | Se registra como pendiente: la retención llega con RF-32 o con una spec de mantenimiento. |
| Depende de SPEC 30 (Borrador), que a su vez toca 5 specs | Se implementa después de SPEC 30. Si cambian `SlaService` o `CambiosSla`, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Escalamiento al vencer (RF-29).
- Notificaciones de asignaciones y comentarios (resto de RF-32).
- Alertas por correo, SMS o WhatsApp.
- Página de historial y notificaciones en tiempo real.
- Retención, borrado y edición del umbral.
- Pino, logs JSON y métricas.

Cada uno de estos temas, cuando llegue, va en su propia spec.
