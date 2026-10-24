# SPEC 19 — Triage del supervisor

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 08, SPEC 11, SPEC 12, SPEC 14, SPEC 17
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el supervisor tome las quejas nuevas, las acepte con prioridad y categoría corregida (asignando la dependencia de esa categoría) o las rechace con motivo, mediante `POST /api/v1/tickets/:id/transiciones`, una bandeja `GET /api/v1/tickets/triage` y la pantalla `/triage`, avisando al vecino por correo.

## Por qué existe esta spec

RF-12 (triage) y RF-13 (asignación de dependencia según la categoría) son requerimientos **M**. Una queja registrada (SPEC 12) se queda en `nueva` hasta que alguien la revisa.
SPEC 04 ya tiene las transiciones (`enviarARevision`, `asignar` y `rechazar`) y SPEC 11 el filtro de alcance, pero no existe ningún endpoint ni pantalla para usarlas.
Esta spec también traduce por primera vez a HTTP los errores del dominio de SPEC 04, que SPEC 08 dejó fuera.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0016_triage`: acción `tickets.triage` solo para el supervisor, y las plantillas `queja_aceptada` y `queja_rechazada`.
- `POST /api/v1/tickets/:id/transiciones` con tres acciones:
  - `tomar`: de `nueva` a `en_revision`.
  - `aceptar`: de `en_revision` a `asignada`, con la prioridad, la categoría final y la dependencia de esa categoría (RF-13).
  - `rechazar`: de `en_revision` a `rechazada`, con motivo.
- `GET /api/v1/tickets/triage`: bandeja paginada de quejas en `nueva` y `en_revision`, de la más antigua a la más reciente.
- Bloqueo de fila al transicionar, para que dos supervisores no actúen sobre la misma queja a la vez.
- Traducción de `InvalidTransitionError` y `ReglaDeNegocioError` (SPEC 04) a HTTP.
- **Cambio sobre SPEC 04:** `Ticket.asignar` acepta una nota opcional para el historial.
- **Cambio sobre SPEC 14** (decidido durante la implementación): `GET /api/v1/categorias` agrega `dependencia: { id, nombre }` a cada categoría, para que el panel muestre la dependencia que quedará asignada. Es aditivo: el formulario de queja no cambia y la respuesta del `PUT` de campos extra tampoco.
- Correos `queja_aceptada` y `queja_rechazada` al solicitante.
- Frontend: ruta `/triage`, solo para el supervisor, con la bandeja y un panel para tomar, aceptar o rechazar.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Reclasificar quejas ya aceptadas (`tickets.clasificar` del receptor y el coordinador).
- Catálogo de motivos de rechazo (RF-41). El motivo es texto libre.
- Elegir una dependencia distinta de la de la categoría al aceptar.
- Asignar técnico (RF-14) y traslados (RF-15).
- Vincular duplicados (RF-17).
- Calcular `vence_respuesta` y `vence_resolucion` al aceptar (spec de SLA, RF-26 y RF-27). Quedan en `null`.
- Validar `datos_extra` contra la categoría nueva.
- Detalle completo del ticket con su línea de tiempo (RF-25).
- Listado general con filtros (RF-36).
- Notificaciones en la aplicación (RF-32).
- Bitácora (RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- Endpoints: se agrega `GET /api/v1/tickets/triage` (Supervisor). La fila `POST /api/v1/tickets/:id/transiciones` documenta las acciones `tomar`, `aceptar` y `rechazar`.
- Se aclara que la "regla configurada para la categoría" de RF-13 es `categorias.dependencia_id`.

### `0016_triage`

- `UPDATE roles SET permisos = permisos || '{"tickets.triage": "todas"}' WHERE nombre = 'supervisor'`. El `down` quita la clave.
- `domain/auth/permisos.ts` agrega `'tickets.triage'` a `ACCIONES`.
- Inserta 2 plantillas con `ON CONFLICT (clave) DO NOTHING`. El `down` las borra.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `queja_aceptada` | `VozMuni: tu queja {{numero}} fue aceptada` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{dependencia}}`, `{{enlace}}` |
| `queja_rechazada` | `VozMuni: tu queja {{numero}} no fue aceptada` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{motivo}}`, `{{enlace}}` |

```text
queja_aceptada:
Hola {{nombre}}:

Revisamos tu queja "{{titulo}}" ({{numero}}) y la enviamos a {{dependencia}}, que se encargará de atenderla.
Puedes seguir su avance en {{enlace}}

queja_rechazada:
Hola {{nombre}}:

Revisamos tu queja "{{titulo}}" ({{numero}}) y no pudimos aceptarla por este motivo:

{{motivo}}

Si crees que es un error, puedes registrar una nueva queja con más detalles. Consulta en {{enlace}}
```

`{{enlace}}` es `APP_URL/consulta?numero=…`, como en SPEC 12.

### Acción `tickets.triage`

| Rol | `tickets.triage` |
| --- | --- |
| supervisor | `todas` |
| los demás | — |

`ConsultaTicketsService.obtenerParaAccion(usuario, 'tickets.triage', id)` (SPEC 11) intersecta este alcance con el de `tickets.ver`. Para el supervisor el resultado es `[]` (todas), y para cualquier otro rol es `null`, así que reciben `403` en el middleware.

### Cambio en SPEC 04

`Ticket.asignar(ctx, dependenciaId, prioridad, nota?: string)`: si `nota` viene y no queda vacía después de `trim()`, se guarda como `motivo` del historial. Si no, el motivo sigue siendo `null`. Las pruebas de SPEC 04 siguen pasando sin cambios.

### `POST /api/v1/tickets/:id/transiciones`

Protegido por `autenticar` y `requierePermiso('tickets.triage')`. El cuerpo es una unión discriminada por `accion` (Zod `strict`):

| `accion` | Cuerpo | Desde → hacia | Dominio (SPEC 04) |
| --- | --- | --- | --- |
| `tomar` | `{ accion: 'tomar' }` | `nueva` → `en_revision` | `enviarARevision(ctx)` |
| `aceptar` | `{ accion: 'aceptar', prioridad, categoriaId? }` | `en_revision` → `asignada` | `asignar(ctx, dependenciaId, prioridad, nota)` |
| `rechazar` | `{ accion: 'rechazar', motivo }` | `en_revision` → `rechazada` | `rechazar(ctx, motivo)` |

Pasos, todos en una transacción:

1. Se lee el ticket con `SELECT … FOR UPDATE`, aplicando el filtro de `tickets.triage`. Si no existe o está fuera de alcance, responde `404 NO_ENCONTRADO` (SPEC 11).
2. Se reconstituye el `Ticket` y se llama al método de dominio, con `ctx = { actorId: usuario.id, ahora }`.
3. Para `aceptar`:
   - La categoría final es `categoriaId` o, si no viene, la actual del ticket. Debe estar activa y su dependencia también; si no, responde `400 CATEGORIA_INVALIDA`.
   - `dependenciaId` es `categorias.dependencia_id` de la categoría final (RF-13).
   - Si la categoría cambia, `nota = "Categoría: <anterior> → <nueva>"` y se actualiza `tickets.categoria_id`.
   - `datos_extra` no se toca.
4. Se guardan el ticket (estado, prioridad, dependencia y categoría) y su fila de `ticket_historial`.

Después del commit:

- Responde `200` con `{ id, numero, estado, prioridad, categoriaId, dependenciaId }`.
- `aceptar` envía `queja_aceptada`, con el nombre de la dependencia, y `rechazar` envía `queja_rechazada`, con el motivo recortado. Los dos van al correo del solicitante, sin esperar el envío; un fallo se registra en el log. Un solicitante sin correo no recibe nada. `tomar` no envía nada.

Errores:

| Código | Status | Cuándo |
| --- | --- | --- |
| `VALIDACION` | 400 | `accion` desconocida, falta `prioridad` o `motivo`, o hay campos extra |
| `MOTIVO_REQUERIDO`, `PRIORIDAD_INVALIDA`, `DEPENDENCIA_INVALIDA` | 400 | `ReglaDeNegocioError` de SPEC 04 |
| `CATEGORIA_INVALIDA` | 400 | la categoría final está inactiva, o su dependencia también |
| `NO_ENCONTRADO` | 404 | el ticket no existe o está fuera de alcance |
| `TRANSICION_INVALIDA` | 409 | `InvalidTransitionError` de SPEC 04: por ejemplo, aceptar una `nueva` o tomar una ya tomada |
| `PERMISO_DENEGADO` | 403 | rol sin `tickets.triage` |

Traducción general de errores de dominio, en el manejador de SPEC 08: `InvalidTransitionError` → `409 TRANSICION_INVALIDA`, y `ReglaDeNegocioError` → `400` con su `codigo`. La aplican también las specs siguientes.

### `GET /api/v1/tickets/triage`

Protegido por `autenticar` y `requierePermiso('tickets.triage')`.

- Query: `estado` (`nueva`, `en_revision` o los dos, por defecto los dos), `pagina` (≥ 1, por defecto 1) y `tamano` (1–50, por defecto 20).
- Orden: `creado_en ASC, id ASC`, de la más antigua a la más reciente.
- Respuesta `200`: `{ datos: TicketTriage[], pagina, tamano, total }`.

```ts
export interface TicketTriage {
  id: number;
  numero: string;
  estado: 'nueva' | 'en_revision';
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  canal: string;
  datosExtra: Record<string, unknown>;
  ubicacion: { lat: number; lng: number } | null;
  solicitanteNombre: string;     // sin correo, teléfono ni DPI (RNF-12)
  creadoEn: string;              // ISO 8601 en UTC
}
```

Lo implementa un repositorio de solo lectura (`TriageLecturaRepository`) que aplica el filtro de SPEC 11 para `tickets.triage`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/triage` en `RUTAS_PROTEGIDAS`: `roles: ['supervisor']`, `enMenu: true`, `etiqueta: 'comun:menu.triage'` |
| Página | `features/tickets/triage/TriagePage.tsx`: lista paginada con un filtro "Nuevas / En revisión / Todas", como tarjetas apiladas desde 360 px. Cada tarjeta muestra el número, el título, la categoría, la zona, el canal y la antigüedad ("hace 3 h", en `America/Guatemala`) |
| Panel | `PanelTriage.tsx`: al elegir una queja se abre el detalle (descripción, dirección, datos adicionales con sus etiquetas, ubicación como texto lat/lng y nombre del solicitante). En pantallas chicas es un `Drawer` a pantalla completa, y en las grandes, un panel lateral |
| Acciones en `nueva` | Botón "Tomar" |
| Acciones en `en_revision` | "Aceptar": un selector de prioridad obligatorio (baja, media, alta, urgente, con sus etiquetas traducidas) y un selector de categoría con la actual preseleccionada (`GET /categorias` de SPEC 14), que muestra la dependencia que quedará asignada. "Rechazar": un motivo obligatorio (texto de 1 a 1000) y una confirmación |
| Después de actuar | Se invalida la bandeja (TanStack Query) y se muestra un aviso: "Queja tomada", "Aceptada y enviada a …" o "Rechazada" |
| `409 TRANSICION_INVALIDA` | "Otra persona ya actuó sobre esta queja", y se recarga la bandeja |
| Textos | `locales/es/tickets.json` y `comun.json`. Las etiquetas de prioridad salen de los archivos de traducción, y las de las categorías y de los datos adicionales vienen de la base |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas de transiciones y triage
    container.ts
    domain/auth/permisos.ts                            # + 'tickets.triage'
    domain/ticket/ticket.ts                            # asignar(..., nota?) (cambio de SPEC 04)
    domain/repositories/ticket-escritura-repository.ts # obtener para actualizar (FOR UPDATE), guardar transición
    domain/repositories/triage-lectura-repository.ts
    application/services/triage.service.ts            # tomar, aceptar, rechazar, listar
    infrastructure/
      repositories/knex-ticket-escritura-repository.ts
      repositories/knex-triage-lectura-repository.ts
      database/migrations/0016_triage.ts
    presentation/
      validators/transiciones.validators.ts
      validators/triage.validators.ts
      controllers/transiciones.controller.ts
      routes/transiciones.routes.ts
      middlewares/manejador-errores.ts                 # errores de dominio → HTTP
  tests/
    unit/ticket/ticket.test.ts                         # asignar con nota
    unit/tickets/triage.service.test.ts                # con repositorios y enviador falsos
    unit/presentation/manejador-errores.test.ts        # InvalidTransitionError → 409
    db/schema.test.ts                                  # permiso y plantillas
    db/triage.api.test.ts                              # Supertest contra Postgres real, enviador falso
frontend/
  src/
    shared/auth/rutas.ts                               # /triage
    app/router.tsx                                     # página de /triage
    features/tickets/api/triage-api.ts
    features/tickets/triage/TriagePage.tsx
    features/tickets/triage/PanelTriage.tsx
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/triage-page.test.tsx
    features/tickets/panel-triage.test.tsx
    app/router.test.tsx                                # /triage solo para supervisor
    shared/app-layout.test.tsx                         # menú del supervisor incluye Triage
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `GET /api/v1/tickets/triage`, las acciones de `POST /tickets/:id/transiciones` y la aclaración de RF-13. Verificación: revisión del diff.
2. Crear `0016_triage.ts` y agregar `'tickets.triage'` a `ACCIONES`. Ampliar `schema.test.ts`: solo el supervisor tiene `tickets.triage = 'todas'`, existen las 2 plantillas, y revertir la migración las quita. Verificación: `npm run test:db` y `npm run typecheck` pasan.
3. Agregar la `nota` opcional a `Ticket.asignar` y ampliar `ticket.test.ts`: con nota se guarda recortada como motivo, y sin nota o con una nota vacía el motivo es `null`. Verificación: `npm test` pasa, incluidas todas las pruebas de SPEC 04.
4. Agregar al manejador de errores la traducción de `InvalidTransitionError` (409) y `ReglaDeNegocioError` (400 con su código), con sus casos en `manejador-errores.test.ts`. Verificación: `npm test` pasa.
5. Crear `TicketEscrituraRepository` y `TriageLecturaRepository` con sus implementaciones Knex (`FOR UPDATE` y los joins de categoría, zona y solicitante), y `TriageService`. Crear `triage.service.test.ts` con falsos. Casos:
   - `tomar` desde `nueva` pasa a `en_revision`, con historial y sin correo.
   - `aceptar` sin `categoriaId` asigna la dependencia de la categoría actual. Con otra categoría cambia `categoria_id`, asigna su dependencia y deja la nota en el historial.
   - `aceptar` con una categoría inactiva lanza `CATEGORIA_INVALIDA`.
   - `rechazar` sin motivo lanza `MOTIVO_REQUERIDO`.
   - `aceptar` desde `nueva` lanza `InvalidTransitionError`.
   - Los correos llevan la dependencia o el motivo, y un fallo del enviador no cambia el resultado.

   Verificación: `npm test` y `npm run lint:deps` pasan.
6. Crear los validadores, el controlador y las rutas, y conectar todo en `container.ts` y `app.ts`. Crear `tests/db/triage.api.test.ts` con el enviador falso. Casos:
   - El supervisor toma → `200`; acepta con `prioridad: 'alta'` → `200`, con `dependencia_id` igual al de la categoría y 2 filas nuevas en `ticket_historial`.
   - Rechaza otra queja con motivo → `200`, y llega el correo con el motivo.
   - Aceptar con otra categoría deja la nota en el historial y conserva `datos_extra`.
   - Tomar dos veces → `409 TRANSICION_INVALIDA`.
   - Aceptar sin `prioridad` → `400 VALIDACION`.
   - El receptor, el coordinador o el vecino → `403`. Un ticket inexistente → `404`.
   - Dos `tomar` simultáneos: uno → `200` y el otro → `409`.
   - `GET /tickets/triage` lista solo `nueva` y `en_revision`, de la más antigua primero, filtra por `estado`, devuelve el `total` y no incluye el correo, el teléfono ni el DPI del solicitante.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
7. Frontend: agregar `/triage` a `rutas.ts` y a `router.tsx`, y crear `triage-api.ts` y `TriagePage.tsx`, con los textos en las traducciones. Ampliar `router.test.tsx` y `app-layout.test.tsx` (solo el supervisor ve y entra a `/triage`). Crear `triage-page.test.tsx` con `fetch` simulado: lista las tarjetas, el filtro cambia la consulta, y la paginación funciona. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
8. Crear `PanelTriage.tsx` y `panel-triage.test.tsx`. Casos:
   - En `nueva` solo aparece "Tomar".
   - En `en_revision`, aceptar exige prioridad, preselecciona la categoría actual y muestra la dependencia que quedará asignada.
   - Rechazar exige motivo y pide confirmación.
   - Un `409` muestra el aviso y recarga.
   - Después de actuar se invalida la bandeja.

   Verificación: `npm test` pasa.
9. Actualizar `CLAUDE.md`: la acción `tickets.triage`, el endpoint de transiciones con su campo `accion` (que ampliarán las specs de RF-18), y la traducción de los errores de dominio a HTTP. Verificación manual con el backend, `seed:dev` y Ethereal:
   - `vecino@vozmuni.test` registra una queja.
   - `supervisor@vozmuni.test` la ve en `/triage`, la toma y la acepta con prioridad media cambiando la categoría.
   - El vecino recibe `queja_aceptada` con la dependencia de la categoría nueva.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `GET /api/v1/tickets/triage`, las acciones de `POST /tickets/:id/transiciones` y la aclaración de RF-13.
- [x] Después de `migrate:latest`, solo el supervisor tiene `tickets.triage = 'todas'`, y existen `queja_aceptada` y `queja_rechazada`.
- [x] `tomar` pasa una queja de `nueva` a `en_revision` y escribe su historial con el supervisor como `usuario_id`.
- [x] `aceptar` pasa de `en_revision` a `asignada` con la prioridad indicada y `dependencia_id` igual al `dependencia_id` de la categoría final.
- [x] Si `aceptar` cambia la categoría, se actualiza `tickets.categoria_id`, el historial guarda `Categoría: <anterior> → <nueva>`, y `datos_extra` no cambia.
- [x] `aceptar` con una categoría inactiva, o con su dependencia inactiva, responde `400 CATEGORIA_INVALIDA`.
- [x] `rechazar` pasa de `en_revision` a `rechazada` y guarda el motivo recortado en el historial. Sin motivo responde `400`.
- [x] Una acción desde un estado no permitido (por ejemplo, aceptar una `nueva`) responde `409 TRANSICION_INVALIDA`, y dos `tomar` simultáneos sobre la misma queja dejan exactamente una transición.
- [x] Todos los roles distintos del supervisor reciben `403` en los dos endpoints, y un ticket inexistente responde `404`.
- [x] El solicitante con correo recibe `queja_aceptada` con la dependencia, o `queja_rechazada` con el motivo. `tomar` no envía correo, y un fallo del envío no cambia la respuesta.
- [x] `GET /api/v1/tickets/triage` devuelve solo quejas en `nueva` y `en_revision`, de la más antigua primero, filtra por `estado`, está paginado con `total`, y no expone el correo, el teléfono ni el DPI del solicitante.
- [x] Un `ReglaDeNegocioError` del dominio responde `400` con su código, y un `InvalidTransitionError` responde `409 TRANSICION_INVALIDA`, en cualquier endpoint.
- [x] Las pruebas de SPEC 04 siguen pasando con la `nota` opcional de `asignar`.
- [x] En el frontend, solo el supervisor ve "Triage" en el menú y puede abrir `/triage`.
- [x] `/triage` lista las quejas pendientes con el filtro y la paginación, y el panel permite tomar, aceptar (con prioridad obligatoria, la categoría preseleccionada y la dependencia visible) y rechazar (con motivo obligatorio y confirmación).
- [x] Después de una acción, la bandeja se actualiza, y un `409` muestra "Otra persona ya actuó sobre esta queja".
- [ ] A 360 px de ancho, `/triage` y el panel no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente. (pendiente de comprobar a 360 px en el navegador: Chromium de Playwright no terminó de instalarse; los textos sí están todos en las traducciones)
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta `tickets.triage`, el endpoint de transiciones y la traducción de los errores de dominio.

## Decisiones

- **Sí:** RF-13 entra aquí. La dependencia sale de `categorias.dependencia_id` de la categoría final. Es la "regla configurada" más simple, y ya existe en el modelo.
- **No:** que el supervisor elija otra dependencia, ni dejar RF-13 para otra spec.
- **Sí:** solo el supervisor hace el triage, literal a la sección 3, con una acción nueva `tickets.triage`. `tickets.clasificar` del receptor y del coordinador queda para la reclasificación posterior.
- **No:** que el receptor o el coordinador también hagan triage.
- **Sí:** el supervisor toma la queja de forma explícita (`nueva → en_revision`), lo que deja ver qué quejas nadie revisó todavía.
- **No:** pasar a revisión al abrirla, ni saltarse `en_revision`.
- **Sí:** el motivo de rechazo es texto libre obligatorio. El catálogo de motivos llega con RF-41.
- **Sí:** la categoría se corrige al aceptar, en una sola acción y con un solo registro de historial, que deja la nota del cambio.
- **No:** una acción aparte "Corregir categoría".
- **Sí:** al cambiar de categoría, los `datos_extra` se conservan tal cual, sin validarlos contra la categoría nueva. Resuelve lo que SPEC 14 dejó pendiente.
- **No:** descartarlos, ni exigir que el supervisor los complete.
- **Sí:** un solo endpoint `POST /tickets/:id/transiciones` con `accion`, como dice el documento. Las specs de RF-18 lo ampliarán con más acciones.
- **No:** un endpoint por acción.
- **Sí:** bandeja `GET /tickets/triage` con las quejas más antiguas primero. Es lo que el supervisor necesita revisar sin esperar a RF-36.
- **Sí:** la pantalla `/triage` entra, como eligió el usuario. Depende de la sesión de SPEC 17.
- **Sí:** se avisa al vecino al aceptar y al rechazar.
- **No:** avisar solo al rechazar, ni esperar a RF-31.
- **Sí:** `GET /categorias` devuelve también la dependencia de cada categoría, como eligió el usuario al implementar. Era la única forma de mostrar la dependencia antes de aceptar sin un endpoint nuevo.
- **No:** mostrar la dependencia solo después de aceptar, ni un endpoint de categorías propio del triage.
- **Sí:** `Ticket.asignar` acepta una nota opcional. Es un cambio menor y compatible sobre SPEC 04, ya implementada, para registrar la corrección de categoría en el historial.
- **Sí:** `SELECT … FOR UPDATE` al transicionar, para que dos supervisores no actúen sobre la misma queja a la vez. El segundo recibe `409`.
- **Sí:** los errores de dominio se traducen a HTTP en el manejador general (`409` para transiciones inválidas y `400` para reglas). Lo que SPEC 08 dejó fuera queda resuelto aquí para todas las specs.
- **Sí:** la bandeja no expone el correo, el teléfono ni el DPI del solicitante, solo su nombre (RNF-12).
- **Sí:** los textos de las plantillas, el formato de la nota, el largo máximo del motivo (1000), los tamaños de página y el diseño de tarjetas y panel los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Los vencimientos de SLA quedan en `null` al aceptar, y las tareas de escalamiento no tienen con qué trabajar | Está fuera de alcance. La spec de SLA debe calcularlos en `aceptar`, o en un servicio que se llame desde aquí. |
| Una queja tomada por un supervisor que luego no la acepta queda en `en_revision` sin dueño | La bandeja la muestra igual, porque incluye `en_revision`, así que cualquier supervisor puede continuarla. La spec de SLA la escalará si se vence. |
| Con muchas quejas nuevas, una bandeja ordenada por antigüedad no prioriza las urgentes | Antes del triage no hay prioridad. Una spec futura puede agregar filtros por categoría o zona. |
| Los `datos_extra` conservados pueden no corresponder a la categoría nueva | Es una decisión explícita. El detalle (RF-25) debe mostrar cada valor con su etiqueta original, o con la clave si la etiqueta ya no existe. |
| El correo de rechazo reproduce un motivo escrito por el supervisor, que podría ser inapropiado | La plantilla escapa el HTML (SPEC 09). El motivo queda en el historial con el supervisor como autor. |
| Depende de 6 specs, 5 de ellas en Borrador | Se implementa después de ellas. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Reclasificación posterior y catálogo de motivos de rechazo.
- Elegir otra dependencia, asignar técnico, traslados y duplicados.
- Cálculo de vencimientos de SLA.
- Detalle con línea de tiempo y listado general.
- Notificaciones en la aplicación y bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
