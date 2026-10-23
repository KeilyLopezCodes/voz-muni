# SPEC 21 — Solicitud y aprobación de traslado entre dependencias

> **Estado:** Borrador
> **Depende de:** SPEC 04, SPEC 08, SPEC 11, SPEC 17, SPEC 19, SPEC 20
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el técnico asignado o el coordinador soliciten con motivo el traslado de una queja a otra dependencia, que el supervisor la apruebe (la queja vuelve a `en_revision`), la rechace con motivo o la traslade directamente, guardando cada solicitud en la tabla `solicitudes_traslado`, con una bandeja `/traslados` para el supervisor.

## Por qué existe esta spec

RF-15 es un requerimiento **M**. La sección 3 del documento dice: *"lo solicita el técnico o el coordinador; al aprobarlo el supervisor, la queja regresa a En revisión"*.
SPEC 04 ya tiene el efecto de un traslado aprobado (`Ticket.trasladar`), pero dejó fuera la solicitud y la aprobación, y SPEC 02 registró como vacío la tabla de solicitudes.
Además, SPEC 20 prohíbe asignar técnicos de otra dependencia y señala el traslado como el camino correcto.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición, y del vacío de RF-15 en SPEC 02, antes de la migración.
- Migración `0018_traslados`: tabla `solicitudes_traslado`, con como máximo una solicitud pendiente por queja.
- `POST /api/v1/tickets/:id/traslados`:
  - El técnico asignado o el coordinador **solicitan**, con motivo y una dependencia sugerida opcional.
  - El supervisor **traslada directamente**.
- `GET /api/v1/traslados`: bandeja de solicitudes, solo para el supervisor.
- `POST /api/v1/traslados/:id/aprobacion`, `/rechazo` (con motivo) y `/retiro` (lo hace quien la creó).
- La aprobación aplica `Ticket.trasladar` de SPEC 04: la queja vuelve a `en_revision` sin dependencia ni técnico, y se escribe su historial.
- Una solicitud deja de tener efecto si la queja ya no está en `asignada` ni `en_proceso` al aprobarla.
- `GET /api/v1/dependencias`: las dependencias activas, para elegir la sugerida.
- **Cambio sobre SPEC 19:** la bandeja y el panel de triage muestran la sugerencia y el motivo del último traslado aprobado.
- Frontend:
  - Ruta `/traslados` para el supervisor.
  - En el panel de `/asignacion` (SPEC 20): "Solicitar traslado" para el coordinador y "Trasladar" para el supervisor.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantalla del técnico para solicitar el traslado. Llegará con el detalle del ticket (RF-25).
- Aplicar la dependencia sugerida sin volver a revisión.
- Traslado desde `en_espera`, que requeriría cambiar la tabla de transiciones de SPEC 04.
- Notificaciones al solicitante, al supervisor o al vecino (RF-31, RF-32).
- Que la solicitud pendiente congele la queja.
- Ver el estado de las propias solicitudes desde el detalle del ticket (RF-25).
- Bitácora (RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- Tabla nueva `solicitudes_traslado`.
- Endpoints:
  - La fila `POST /api/v1/tickets/:id/traslados` documenta la solicitud y el traslado directo.
  - Se agregan `GET /api/v1/traslados`, `POST /api/v1/traslados/:id/aprobacion`, `/rechazo` y `/retiro`, y `GET /api/v1/dependencias`.

En la tabla de vacíos de SPEC 02, la fila de RF-15 queda resuelta.

### `0018_traslados`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `solicitudes_traslado` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, FK `tickets` ON DELETE RESTRICT |
| | `solicitado_por` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| | `dependencia_origen_id` | bigint | NOT NULL, FK `dependencias` ON DELETE RESTRICT |
| | `dependencia_sugerida_id` | bigint | NULL, FK `dependencias` ON DELETE RESTRICT, CHECK `<> dependencia_origen_id` |
| | `motivo` | text | NOT NULL, CHECK `char_length(motivo) BETWEEN 1 AND 1000` |
| | `estado` | text | NOT NULL, DEFAULT `'pendiente'`, CHECK `IN ('pendiente', 'aprobada', 'rechazada', 'retirada', 'sin_efecto')` |
| | `resuelto_por` | bigint | NULL, FK `usuarios` ON DELETE RESTRICT |
| | `motivo_resolucion` | text | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| | `resuelto_en` | timestamptz | NULL |

- Índice único parcial `solicitudes_traslado_una_pendiente` sobre `(ticket_id) WHERE estado = 'pendiente'`: como máximo una pendiente por queja.
- Índice `solicitudes_traslado (estado, creado_en)`, para la bandeja.
- El `down` borra la tabla.
- Con esta spec el esquema pasa de 20 a 21 tablas.

### Estados de una solicitud

| Estado | Lo produce | Campos |
| --- | --- | --- |
| `pendiente` | el técnico o el coordinador | `solicitado_por`, `motivo` y `dependencia_sugerida_id` opcional |
| `aprobada` | el supervisor (aprobación o traslado directo) | `resuelto_por`, `resuelto_en` |
| `rechazada` | el supervisor | `resuelto_por`, `resuelto_en`, `motivo_resolucion` obligatorio |
| `retirada` | quien la solicitó | `resuelto_por` (el mismo solicitante), `resuelto_en` |
| `sin_efecto` | el supervisor al aprobar, si la queja ya no está en `asignada` ni `en_proceso` | `resuelto_por`, `resuelto_en` |

Solo una solicitud `pendiente` puede cambiar de estado. Las demás son finales.

### Reglas (`domain/traslado/solicitud-traslado.ts`)

```ts
export const ESTADOS_SOLICITUD = ['pendiente', 'aprobada', 'rechazada', 'retirada', 'sin_efecto'] as const;
export type EstadoSolicitud = (typeof ESTADOS_SOLICITUD)[number];
export const ORIGENES_TRASLADO: readonly EstadoTicket[] = ['asignada', 'en_proceso'];   // los de Ticket.trasladar (SPEC 04)

// Lanza ReglaDeNegocioError: MOTIVO_REQUERIDO, DEPENDENCIA_INVALIDA (la sugerida es igual a la de origen).
export function validarSolicitud(p: { motivo: string; dependenciaOrigenId: number; dependenciaSugeridaId: number | null }): { motivo: string };

// Lanza ReglaDeNegocioError TRASLADO_YA_RESUELTO si la solicitud no está pendiente.
export function exigirPendiente(estado: EstadoSolicitud): void;

export function puedeTrasladarse(estadoTicket: EstadoTicket): boolean;   // ORIGENES_TRASLADO.includes(...)
```

El cambio de estado del ticket lo hace `Ticket.trasladar(ctx, motivo)` de SPEC 04. Esta spec no cambia SPEC 04.

### `POST /api/v1/tickets/:id/traslados`

Protegido por `autenticar` y `requierePermiso('tickets.trasladar')`. Cuerpo (Zod `strict`): `{ motivo: string; dependenciaSugeridaId?: number }`.

Todo va en una transacción, con `SELECT … FOR UPDATE` sobre el ticket y aplicando el filtro de `tickets.trasladar` (SPEC 11): el técnico ve sus asignadas, el coordinador su dependencia y el supervisor todas. Fuera de alcance responde `404`.

| Alcance | Rol | Efecto |
| --- | --- | --- |
| `solicitar` | técnico, coordinador | Crea una solicitud `pendiente` con `dependencia_origen_id` igual a la dependencia actual del ticket. La queja no cambia. Responde `201` con la solicitud |
| `todas` | supervisor | Crea una solicitud ya `aprobada` (`solicitado_por = resuelto_por = supervisor`) y aplica `Ticket.trasladar`. Responde `200` con la solicitud y `{ ticket: { id, numero, estado: 'en_revision' } }` |

Errores:

| Código | Status | Cuándo |
| --- | --- | --- |
| `VALIDACION` | 400 | cuerpo inválido |
| `MOTIVO_REQUERIDO` | 400 | motivo vacío |
| `DEPENDENCIA_INVALIDA` | 400 | la sugerida no existe, está inactiva o es la de origen |
| `TRANSICION_INVALIDA` | 409 | el ticket no está en `asignada` ni `en_proceso` |
| `TRASLADO_PENDIENTE` | 409 | ya hay una solicitud pendiente para esa queja, detectado por el índice único parcial (`23505`) |
| `NO_ENCONTRADO` | 404 | el ticket no existe o está fuera de alcance |
| `PERMISO_DENEGADO` | 403 | rol sin `tickets.trasladar` |

### Bandeja y decisiones del supervisor

Los 4 endpoints exigen `autenticar`, `requierePermiso('tickets.trasladar')` y el alcance `todas`, salvo el retiro. Un rol con `solicitar` recibe `403 PERMISO_DENEGADO` en la bandeja, la aprobación y el rechazo.

| Método y ruta | Cuerpo | Efecto | Respuesta |
| --- | --- | --- | --- |
| `GET /api/v1/traslados` | query `estado` (por defecto `pendiente`), `pagina`, `tamano` (1–50) | lista ordenada por `creado_en ASC` | `200` `{ datos: SolicitudTraslado[], pagina, tamano, total }` |
| `POST /api/v1/traslados/:id/aprobacion` | — | bloquea la solicitud y el ticket; si el ticket está en `asignada` o `en_proceso`, aplica `Ticket.trasladar(ctx, solicitud.motivo)` y deja la solicitud `aprobada`; si no, la deja `sin_efecto` y responde `409 TRASLADO_SIN_EFECTO` | `200` con la solicitud y el ticket en `en_revision` |
| `POST /api/v1/traslados/:id/rechazo` | `{ motivo }` (1–1000) | la solicitud pasa a `rechazada` con `motivo_resolucion` y la queja no cambia | `200` con la solicitud |
| `POST /api/v1/traslados/:id/retiro` | — | solo si `solicitado_por` es el usuario autenticado; si no, `404`. La solicitud pasa a `retirada` | `200` con la solicitud |

- Una solicitud que no está `pendiente` responde `409 TRASLADO_YA_RESUELTO` en la aprobación, el rechazo y el retiro.
- Un `:id` inexistente responde `404 NO_ENCONTRADO`.

```ts
export interface SolicitudTraslado {
  id: number;
  estado: EstadoSolicitud;
  motivo: string;
  ticket: { id: number; numero: string; titulo: string; estado: EstadoTicket };
  dependenciaOrigen: { id: number; nombre: string };
  dependenciaSugerida: { id: number; nombre: string } | null;
  solicitadoPor: { id: number; nombre: string; rol: Rol };
  resueltoPor: { id: number; nombre: string } | null;
  motivoResolucion: string | null;
  creadoEn: string;
  resueltoEn: string | null;
}
```

Al aprobar, `Ticket.trasladar` deja `dependencia_id` y `asignado_a` en `null` y escribe la fila de `ticket_historial` con el motivo de la solicitud. Así la queja aparece otra vez en la bandeja de triage (SPEC 19).

### `GET /api/v1/dependencias`

Protegido por `autenticar` y `requierePermiso('tickets.trasladar')`. Devuelve `[{ id, nombre }]` con las dependencias activas, ordenadas por `nombre`.

### Cambio sobre SPEC 19

`TicketTriage` agrega `trasladoReciente: { dependenciaOrigen: string; dependenciaSugerida: string | null; motivo: string } | null`. Es la última solicitud `aprobada` de la queja, si la queja está en `nueva` o `en_revision`. `PanelTriage` la muestra sobre las acciones: "Trasladada desde <origen>. Sugerencia: <sugerida>. Motivo: …". Esto orienta al supervisor al aceptarla de nuevo.

Códigos nuevos en el manejador de errores, todos 409: `TRASLADO_PENDIENTE`, `TRASLADO_YA_RESUELTO` y `TRASLADO_SIN_EFECTO`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/traslados` en `RUTAS_PROTEGIDAS`: `roles: ['supervisor']`, `enMenu: true`, `etiqueta: 'comun:menu.traslados'` |
| Página | `features/tickets/traslados/TrasladosPage.tsx`: un filtro por estado (Pendientes por defecto), y tarjetas con el número y el título de la queja, el origen, la sugerencia, quién lo pide y su rol, el motivo y la antigüedad. Paginación |
| Acciones | "Aprobar", con una confirmación que dice "La queja volverá a revisión sin dependencia ni técnico". "Rechazar", con motivo obligatorio. Después se invalida la bandeja y aparece un aviso. Un `409` muestra "La solicitud ya fue resuelta" o "La queja cambió de estado; la solicitud quedó sin efecto" |
| `/asignacion` (SPEC 20) | En `PanelAsignacion`: el coordinador ve "Solicitar traslado", con el motivo y una dependencia sugerida opcional (`GET /dependencias`, sin incluir la actual). El supervisor ve "Trasladar", que actúa en el momento y pide confirmación. `409 TRASLADO_PENDIENTE` muestra "Ya hay una solicitud pendiente" |
| `/triage` (SPEC 19) | `PanelTriage` muestra `trasladoReciente` |
| Textos | `locales/es/tickets.json` y `comun.json` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6 y vacíos
CLAUDE.md
backend/
  src/
    app.ts                                               # rutas de traslados y dependencias
    container.ts
    domain/traslado/solicitud-traslado.ts
    domain/repositories/traslado-repository.ts           # crear, obtener para actualizar, resolver, listar
    application/services/traslados.service.ts            # solicitar o trasladar, aprobar, rechazar, retirar, listar
    application/services/triage.service.ts               # trasladoReciente (cambio de SPEC 19)
    infrastructure/
      repositories/knex-traslado-repository.ts
      repositories/knex-triage-lectura-repository.ts     # + trasladoReciente
      repositories/knex-catalogo-lectura-repository.ts   # + dependencias activas
      database/migrations/0018_traslados.ts
    presentation/
      validators/traslados.validators.ts
      controllers/traslados.controller.ts
      routes/traslados.routes.ts
      middlewares/manejador-errores.ts                   # 3 códigos nuevos
  tests/
    unit/traslado/solicitud-traslado.test.ts
    unit/traslado/traslados.service.test.ts
    db/schema.test.ts                                    # tabla, índice único parcial; 21 tablas
    db/traslados.api.test.ts                             # Supertest contra Postgres real
frontend/
  src/
    shared/auth/rutas.ts                                 # /traslados
    app/router.tsx
    features/tickets/api/traslados-api.ts
    features/tickets/traslados/TrasladosPage.tsx
    features/tickets/asignacion/PanelAsignacion.tsx      # solicitar / trasladar
    features/tickets/triage/PanelTriage.tsx              # trasladoReciente
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/traslados-page.test.tsx
    features/tickets/panel-asignacion.test.tsx           # casos de traslado
    features/tickets/panel-triage.test.tsx               # trasladoReciente
    app/router.test.tsx
    shared/app-layout.test.tsx
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición (`solicitudes_traslado` y los 6 endpoints) y marcar como resuelto el vacío de RF-15. Verificación: revisión del diff.
2. Crear `0018_traslados.ts`. Ampliar `schema.test.ts`:
   - Columnas e índices.
   - Una segunda solicitud `pendiente` para el mismo ticket viola el índice único parcial, y una segunda con otro estado se acepta.
   - `dependencia_sugerida_id = dependencia_origen_id` es rechazado.
   - Un motivo vacío es rechazado.
   - El rollback completo contempla 21 tablas.

   Verificación: `npm run test:db` pasa.
3. Crear `domain/traslado/solicitud-traslado.ts` y su prueba. Casos:
   - Un motivo `'   '` → `MOTIVO_REQUERIDO`.
   - La sugerida igual a la de origen → `DEPENDENCIA_INVALIDA`.
   - `exigirPendiente` sobre cada estado final → `TRASLADO_YA_RESUELTO`.
   - `puedeTrasladarse` es `true` solo en `asignada` y `en_proceso`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `TrasladoRepository` y su implementación Knex, y `TrasladosService`. Crear `traslados.service.test.ts` con falsos. Casos:
   - El técnico crea una pendiente y la queja no cambia.
   - El supervisor traslada directo: la queja queda en `en_revision` sin dependencia ni técnico, y la solicitud queda `aprobada`.
   - Aprobar aplica `trasladar` con el motivo de la solicitud.
   - Aprobar con la queja en `resuelta` deja la solicitud `sin_efecto` y lanza `TRASLADO_SIN_EFECTO`.
   - Rechazar exige motivo.
   - Retirar solo lo hace el solicitante.
   - Resolver una ya resuelta → `TRASLADO_YA_RESUELTO`.

   Verificación: `npm test` pasa.
5. Crear los validadores, el controlador y las rutas, agregar `GET /dependencias` y los 3 códigos, y conectar todo. Crear `tests/db/traslados.api.test.ts`. Casos:
   - El técnico asignado solicita → `201`. El técnico de otra queja → `404`. Una segunda solicitud → `409 TRASLADO_PENDIENTE`.
   - El coordinador de la dependencia solicita con sugerencia → `201`.
   - El supervisor ve la bandeja y aprueba → `200`. La queja queda en `en_revision`, con `dependencia_id` y `asignado_a` en `null` y una fila de historial con el motivo, y aparece en `GET /tickets/triage` con `trasladoReciente`.
   - Rechazar sin motivo → `400`; con motivo → `200`, y la queja sigue igual.
   - El solicitante retira → `200`. Otro usuario retira → `404`.
   - El técnico pide la bandeja o aprueba → `403`.
   - El supervisor traslada directo una `en_proceso` → `200`. Sobre una `nueva` → `409 TRANSICION_INVALIDA`.
   - Aprobar después de que la queja pasó a `resuelta` → `409 TRASLADO_SIN_EFECTO`, y la solicitud queda `sin_efecto`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Aplicar el cambio de SPEC 19: `trasladoReciente` en el repositorio, el servicio y `TicketTriage`, con sus casos en las pruebas de triage. Verificación: `npm run test:db` pasa.
7. Frontend: agregar `/traslados` a `rutas.ts` y `router.tsx`, y crear `traslados-api.ts` y `TrasladosPage.tsx`, con sus pruebas. Casos: las tarjetas muestran la sugerencia y el motivo; "Aprobar" pide confirmación; "Rechazar" exige motivo; un `409` muestra su aviso; solo el supervisor ve el menú. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
8. Ampliar `PanelAsignacion` (SPEC 20) con "Solicitar traslado" y "Trasladar", y `PanelTriage` (SPEC 19) con `trasladoReciente`, y ampliar sus pruebas:
   - El coordinador envía el motivo y la sugerencia, y la lista de dependencias no incluye la actual.
   - El supervisor traslada con confirmación.
   - `TRASLADO_PENDIENTE` muestra su aviso.
   - El panel de triage muestra la sugerencia.

   Verificación: `npm test` y `npm run build` pasan.
9. Actualizar `CLAUDE.md`: `solicitudes_traslado` y sus estados, que solo el supervisor aprueba o traslada directo, y que aprobar devuelve la queja a revisión. Verificación manual con el backend y `seed:dev`:
   - `coordinador@vozmuni.test` solicita el traslado de una queja desde `/asignacion` sugiriendo otra dependencia.
   - `supervisor@vozmuni.test` la aprueba en `/traslados`, la ve en `/triage` con la sugerencia, y la acepta con la categoría de la nueva dependencia.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye `solicitudes_traslado` y los 6 endpoints, y el vacío de RF-15 figura como resuelto.
- [ ] `npm run migrate:latest` crea `solicitudes_traslado`, la base impide una segunda solicitud pendiente para la misma queja, y un rollback completo no deja ninguna de las 21 tablas.
- [ ] El técnico asignado (sobre sus quejas) y el coordinador (sobre las de su dependencia) crean una solicitud pendiente con motivo y una dependencia sugerida opcional, solo si la queja está en `asignada` o `en_proceso`. La queja no cambia mientras está pendiente.
- [ ] Una segunda solicitud para la misma queja con otra pendiente responde `409 TRASLADO_PENDIENTE`.
- [ ] El supervisor ve las solicitudes en `GET /api/v1/traslados`, de la más antigua primero, filtradas por estado y paginadas, y ningún otro rol puede verlas.
- [ ] Aprobar deja la solicitud `aprobada` y la queja en `en_revision`, con `dependencia_id` y `asignado_a` en `null` y una fila de `ticket_historial` con el motivo de la solicitud.
- [ ] Una queja trasladada aparece en `GET /tickets/triage` con `trasladoReciente`, que muestra el origen, la sugerencia y el motivo.
- [ ] Aprobar una solicitud cuya queja ya no está en `asignada` ni `en_proceso` la deja `sin_efecto` y responde `409 TRASLADO_SIN_EFECTO`, y la queja no cambia.
- [ ] Rechazar exige motivo y no cambia la queja. Retirar solo lo puede hacer quien la solicitó. Resolver una solicitud que no está pendiente responde `409 TRASLADO_YA_RESUELTO`.
- [ ] El supervisor traslada directamente una queja en `asignada` o `en_proceso`: queda en `en_revision`, con una solicitud `aprobada` a su nombre.
- [ ] Un usuario fuera del alcance de la queja recibe `404`, y los roles sin `tickets.trasladar` reciben `403`.
- [ ] En el frontend, solo el supervisor ve "Traslados" en el menú. `/traslados` permite aprobar (con confirmación) y rechazar (con motivo).
- [ ] En `/asignacion`, el coordinador puede solicitar un traslado con motivo y sugerencia, y el supervisor puede trasladar directamente.
- [ ] A 360 px de ancho, las pantallas nuevas y los paneles modificados no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta `solicitudes_traslado`, sus estados y quién decide.

## Decisiones

- **Sí:** la dependencia destino es una sugerencia opcional. Al aprobar, la queja vuelve a `en_revision`, literal a la sección 3, y el supervisor la acepta de nuevo en el triage con la sugerencia a la vista.
- **No:** aplicar la dependencia sugerida al aprobar, ni pedir solo el motivo.
- **Sí:** mientras la solicitud está pendiente, la queja sigue su curso, y solo puede haber una pendiente por queja (índice único parcial).
- **No:** congelar la queja.
- **Sí:** una solicitud que ya no aplica, porque la queja cambió de estado, queda `sin_efecto` al intentar aprobarla. El supervisor ve que se intentó, y la solicitud no queda pendiente para siempre.
- **Sí:** el supervisor puede trasladar directo, y el traslado queda registrado igual en `solicitudes_traslado` (solicitado y aprobado por él). Así todo traslado se rastrea en un mismo lugar.
- **No:** que el supervisor solo apruebe solicitudes.
- **Sí:** solicitan el técnico asignado y el coordinador de la dependencia, solo desde `asignada` o `en_proceso`, que son los orígenes de `trasladar` en SPEC 04.
- **No:** ampliar a `en_espera`.
- **Sí:** el rechazo exige motivo.
- **Sí:** quien solicitó puede retirar su solicitud.
- **Sí:** sin avisos en esta spec. Van con RF-32, igual que en SPEC 20.
- **Sí:** en el frontend, la bandeja `/traslados` para el supervisor y los botones en `/asignacion` (SPEC 20). El técnico solicitará desde el detalle del ticket (RF-25).
- **No:** solo backend, ni una pantalla mínima para el técnico.
- **Sí:** `GET /api/v1/dependencias` mínimo, para elegir la sugerida. El CRUD de dependencias es de RF-41.
- **Sí:** la bandeja de triage de SPEC 19 muestra el último traslado aprobado. Es un cambio menor sobre SPEC 19 para que la sugerencia llegue a quien decide.
- **Sí:** SPEC 04 no cambia: `Ticket.trasladar` ya cubre el efecto del traslado aprobado.
- **Sí:** los estados `retirada` y `sin_efecto`, los códigos `TRASLADO_*`, el máximo de 1000 caracteres para el motivo y el diseño de la bandeja los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El técnico no tiene pantalla para solicitar el traslado | El endpoint ya lo permite, y el detalle del ticket (RF-25) lo expondrá. Mientras tanto, el coordinador lo solicita desde `/asignacion`. |
| Sin avisos, el supervisor no se entera de las solicitudes nuevas, y el solicitante no se entera de la decisión | La bandeja `/traslados` es el punto de consulta del supervisor. RF-32 agrega los avisos. |
| Al aprobar, se pierde el técnico que atendía la queja, y su trabajo en curso queda sin dueño | Es el efecto definido en SPEC 04 (el supervisor reasigna desde cero). El historial y la solicitud registran de dónde venía. |
| Mientras está pendiente, la queja sigue avanzando, y el traslado puede quedar sin sentido | Al aprobar se comprueba el estado, y la solicitud queda `sin_efecto` si ya no aplica. |
| El SLA sigue corriendo durante el traslado y la nueva revisión | Lo decide la spec de SLA (RF-26 y RF-27), que puede reiniciarlo al volver a `en_revision`. |
| Depende de 6 specs, 5 de ellas en Borrador | Se implementa después de SPEC 20. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Pantalla del técnico y estado de sus solicitudes en el detalle.
- Aplicar la sugerencia sin revisión y traslado desde `en_espera`.
- Notificaciones.
- Congelar la queja mientras hay una solicitud pendiente.
- Bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
