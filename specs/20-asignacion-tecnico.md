# SPEC 20 — Asignación y reasignación de técnico

> **Estado:** Borrador
> **Depende de:** SPEC 04, SPEC 08, SPEC 11, SPEC 17, SPEC 19
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el coordinador asigne o reasigne un técnico de su dependencia a una queja, y que el supervisor lo haga en cualquier dependencia, registrando cada cambio en una tabla nueva `ticket_asignaciones`, con una bandeja de quejas por asignar, una lista de técnicos con su carga y la pantalla `/asignacion`.

## Por qué existe esta spec

RF-14 es un requerimiento **M**: el coordinador asigna la queja a un técnico de su dependencia y puede reasignarla. Después del triage (SPEC 19), las quejas quedan en `asignada` sin técnico, y `iniciar()` de SPEC 04 exige uno. Hoy nadie puede asignarlo.
Asignar un técnico no cambia el estado, así que no escribe en `ticket_historial`. RF-25 pide que la línea de tiempo muestre las asignaciones, y por eso se agrega una tabla propia.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0017_asignaciones`: tabla `ticket_asignaciones`, solo de inserción, protegida con un trigger.
- `PATCH /api/v1/tickets/:id/asignacion`, para el coordinador (su dependencia) y el supervisor (todas):
  - Asigna o reasigna un técnico activo de la dependencia del ticket.
  - El motivo es obligatorio al reasignar.
  - Se permite en `asignada` y `en_proceso` (SPEC 04).
- `GET /api/v1/tickets/por-asignar`: bandeja de quejas sin técnico o de quejas abiertas, ordenada por prioridad y antigüedad.
- `GET /api/v1/dependencias/:id/tecnicos`: técnicos activos con su carga de quejas abiertas.
- Bloqueo de fila al asignar, para que dos personas no asignen la misma queja a la vez.
- Frontend: ruta `/asignacion` para el coordinador y el supervisor, con la bandeja y un panel para elegir técnico.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Asignación automática al técnico con menor carga (RF-16).
- Notificaciones al técnico, en la aplicación o por correo (RF-32).
- Avisos al vecino sobre el técnico asignado (RF-31). SPEC 19 ya avisa al aceptar.
- Quitar el técnico sin poner otro.
- Asignar técnicos de otra dependencia. Requiere un traslado (RF-15).
- Línea de tiempo del ticket (RF-25). Esta spec solo guarda los datos.
- Reasignar las quejas de un técnico desactivado o movido de dependencia (riesgo de SPEC 10).
- Coordinador de cada dependencia (`dependencias.coordinador_id`, RF-41).
- Bitácora (RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- Tabla nueva `ticket_asignaciones`.
- Endpoints:
  - La fila `PATCH /api/v1/tickets/:id/asignacion` documenta el cuerpo `{ tecnicoId, motivo? }`.
  - Se agregan `GET /api/v1/tickets/por-asignar` y `GET /api/v1/dependencias/:id/tecnicos`, los dos para Coordinador y Supervisor.

### `0017_asignaciones`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `ticket_asignaciones` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, FK `tickets` ON DELETE RESTRICT |
| | `tecnico_anterior` | bigint | NULL (primera asignación), FK `usuarios` ON DELETE RESTRICT |
| | `tecnico_nuevo` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| | `asignado_por` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| | `motivo` | text | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| | | | CHECK `tecnico_anterior IS DISTINCT FROM tecnico_nuevo` |

- Índice: `ticket_asignaciones (ticket_id, creado_en)`, para la línea de tiempo.
- La función `ticket_asignaciones_solo_insercion()` lanza `ticket_asignaciones es solo de inserción`. Un trigger `BEFORE UPDATE OR DELETE … FOR EACH ROW` y otro `BEFORE TRUNCATE … FOR EACH STATEMENT` la llaman, igual que en `bitacora` (SPEC 03).
- El `down` borra los triggers, la función y la tabla.
- Con esta spec el esquema pasa de 19 a 20 tablas.

### Reglas (`domain/asignacion/`)

```ts
// domain/asignacion/asignacion-tecnico.ts
export interface TecnicoCandidato { id: number; rol: Rol; activo: boolean; dependenciaId: number | null }

// Lanza ReglaDeNegocioError:
// TECNICO_NO_ELEGIBLE si no es tecnico, está inactivo o su dependencia no es la del ticket;
// TECNICO_SIN_CAMBIO si ya es el técnico asignado;
// MOTIVO_REQUERIDO si el ticket ya tenía técnico y el motivo está vacío.
export function validarAsignacion(p: {
  ticketDependenciaId: number | null;
  tecnicoActual: number | null;
  candidato: TecnicoCandidato;
  motivo: string | undefined;
}): { motivo: string | null };   // motivo recortado, o null en la primera asignación sin motivo

export interface RegistroAsignacion {
  ticketId: number;
  tecnicoAnterior: number | null;
  tecnicoNuevo: number;
  asignadoPor: number;
  motivo: string | null;
  creadoEn: Date;
}
```

El cambio de `asignado_a` lo hace `Ticket.asignarTecnico(tecnicoId)` de SPEC 04. Ese método ya rechaza los estados fuera de `asignada` y `en_proceso` (`OPERACION_NO_PERMITIDA`) y los ids inválidos (`TECNICO_INVALIDO`). Esta spec no cambia SPEC 04.

### `PATCH /api/v1/tickets/:id/asignacion`

Protegido por `autenticar` y `requierePermiso('tickets.asignar')`. Cuerpo (Zod `strict`): `{ tecnicoId: number; motivo?: string }`, con el motivo de 1 a 1000 caracteres.

Pasos, todos en una transacción:

1. Se lee el ticket con `SELECT … FOR UPDATE`, aplicando el filtro de `tickets.asignar` (SPEC 11). Para el coordinador, el filtro es "su dependencia", porque es la intersección con `tickets.ver`. Si no existe o está fuera de alcance, responde `404 NO_ENCONTRADO`.
2. Se lee el candidato y se aplica `validarAsignacion`.
3. `Ticket.reconstituir(…).asignarTecnico(tecnicoId)`.
4. Se guarda `tickets.asignado_a` y se inserta la fila de `ticket_asignaciones`, con `asignado_por` igual al usuario autenticado.

Responde `200` con `{ id, numero, estado, asignadoA, tecnicoAnterior }`. El estado no cambia: una queja `en_proceso` sigue `en_proceso` con el técnico nuevo.

| Código | Status | Cuándo |
| --- | --- | --- |
| `VALIDACION` | 400 | falta `tecnicoId`, tipo inválido o campos extra |
| `TECNICO_NO_ELEGIBLE` | 400 | no es técnico activo de la dependencia del ticket |
| `TECNICO_SIN_CAMBIO` | 400 | ya es el técnico asignado |
| `MOTIVO_REQUERIDO` | 400 | reasignación sin motivo |
| `OPERACION_NO_PERMITIDA` | 400 | el ticket no está en `asignada` ni `en_proceso` (SPEC 04) |
| `NO_ENCONTRADO` | 404 | el ticket no existe o está fuera de alcance |
| `PERMISO_DENEGADO` | 403 | rol sin `tickets.asignar` |

### `GET /api/v1/tickets/por-asignar`

Protegido por `autenticar` y `requierePermiso('tickets.asignar')`, con el filtro de SPEC 11.

- Query:
  - `vista`: `sin_tecnico` (por defecto) muestra las quejas en `asignada` con `asignado_a IS NULL`. `abiertas` muestra las quejas en `asignada`, `en_proceso` o `en_espera`, tengan o no técnico.
  - `pagina` (≥ 1) y `tamano` (1–50, por defecto 20).
- Orden: prioridad (`urgente`, `alta`, `media`, `baja`), luego `creado_en ASC` e `id ASC`.
- Respuesta `200`: `{ datos: TicketPorAsignar[], pagina, tamano, total }`.

```ts
export interface TicketPorAsignar {
  id: number;
  numero: string;
  estado: 'asignada' | 'en_proceso' | 'en_espera';
  prioridad: Prioridad;
  titulo: string;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  tecnico: { id: number; nombre: string } | null;
  creadoEn: string;
}
```

Sin datos de contacto ni DPI del solicitante (RNF-12).

### `GET /api/v1/dependencias/:id/tecnicos`

Protegido por `autenticar` y `requierePermiso('tickets.asignar')`.

- El coordinador solo puede pedir su propia dependencia; cualquier otro `:id` responde `404 NO_ENCONTRADO`. El supervisor (`todas`) puede pedir cualquiera.
- Devuelve los usuarios con rol `tecnico`, `activo = true` y esa dependencia, ordenados por `carga ASC` y luego `nombre`.

```ts
export interface TecnicoConCarga {
  id: number;
  nombre: string;
  carga: number;   // tickets con asignado_a = id y estado en (asignada, en_proceso, en_espera)
}
```

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/asignacion` en `RUTAS_PROTEGIDAS`: `roles: ['coordinador', 'supervisor']`, `enMenu: true`, `etiqueta: 'comun:menu.asignacion'` |
| Página | `features/tickets/asignacion/AsignacionPage.tsx`: un selector "Sin técnico / Todas abiertas", y tarjetas con el número, el título, la prioridad (con su color y su etiqueta traducida), la categoría, la zona, la dependencia (la ve el supervisor), el técnico actual y la antigüedad. Paginación |
| Panel | `PanelAsignacion.tsx`: un `Drawer` a pantalla completa en celular y un panel lateral en escritorio. Lista de técnicos de la dependencia del ticket (`GET /dependencias/:id/tecnicos`) con su carga ("3 abiertas"), y el técnico actual marcado. Si ya hay técnico, el motivo es obligatorio. Botón "Asignar" o "Reasignar" |
| Después de asignar | Se invalida la bandeja y aparece el aviso "Asignada a <nombre>" |
| Errores | `TECNICO_NO_ELEGIBLE` muestra "Ese técnico ya no está disponible" y recarga la lista. `OPERACION_NO_PERMITIDA` muestra "La queja cambió de estado" y recarga la bandeja |
| Textos | `locales/es/tickets.json` y `comun.json`. Las etiquetas de prioridad son las de SPEC 19 |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts                                                 # rutas de asignación, bandeja y técnicos
    container.ts
    domain/asignacion/asignacion-tecnico.ts
    domain/repositories/asignacion-repository.ts           # candidato, registrar asignación, técnicos con carga
    domain/repositories/por-asignar-lectura-repository.ts
    application/services/asignacion.service.ts            # asignar, listar por asignar, técnicos de una dependencia
    infrastructure/
      repositories/knex-asignacion-repository.ts
      repositories/knex-por-asignar-lectura-repository.ts
      repositories/knex-ticket-escritura-repository.ts     # guarda asignado_a (de SPEC 19)
      database/migrations/0017_asignaciones.ts
    presentation/
      validators/asignacion.validators.ts
      controllers/asignacion.controller.ts
      routes/asignacion.routes.ts
      middlewares/manejador-errores.ts                     # TECNICO_NO_ELEGIBLE, TECNICO_SIN_CAMBIO
  tests/
    unit/asignacion/asignacion-tecnico.test.ts
    unit/asignacion/asignacion.service.test.ts
    db/schema.test.ts                                      # ticket_asignaciones y su trigger; 20 tablas
    db/asignacion.api.test.ts                              # Supertest contra Postgres real
frontend/
  src/
    shared/auth/rutas.ts                                   # /asignacion
    app/router.tsx
    features/tickets/api/asignacion-api.ts
    features/tickets/asignacion/AsignacionPage.tsx
    features/tickets/asignacion/PanelAsignacion.tsx
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/asignacion-page.test.tsx
    features/tickets/panel-asignacion.test.tsx
    app/router.test.tsx                                    # /asignacion para coordinador y supervisor
    shared/app-layout.test.tsx
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `ticket_asignaciones` y los 3 endpoints. Verificación: revisión del diff.
2. Crear `0017_asignaciones.ts`. Ampliar `schema.test.ts`:
   - Columnas e índice.
   - `tecnico_anterior = tecnico_nuevo` es rechazado.
   - `UPDATE`, `DELETE` y `TRUNCATE` fallan con `ticket_asignaciones es solo de inserción`.
   - El rollback completo contempla 20 tablas.

   Verificación: `npm run test:db` pasa.
3. Crear `domain/asignacion/asignacion-tecnico.ts` y su prueba. Casos:
   - Un técnico de la misma dependencia es válido.
   - Un técnico de otra dependencia, uno inactivo, un coordinador y un ticket sin dependencia → `TECNICO_NO_ELEGIBLE`.
   - El mismo técnico → `TECNICO_SIN_CAMBIO`.
   - Reasignar sin motivo o con `'   '` → `MOTIVO_REQUERIDO`.
   - En la primera asignación, el motivo es opcional y se recorta.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear los repositorios (`AsignacionRepository` y `PorAsignarLecturaRepository`) con sus implementaciones Knex, y `AsignacionService`. Crear `asignacion.service.test.ts` con falsos. Casos:
   - La primera asignación guarda `asignado_a` y una fila con `tecnico_anterior` null.
   - La reasignación guarda el anterior y el motivo.
   - En `en_proceso` el estado no cambia.
   - En `resuelta` → `OPERACION_NO_PERMITIDA`.
   - La carga cuenta solo `asignada`, `en_proceso` y `en_espera`.

   Verificación: `npm test` pasa.
5. Crear los validadores, el controlador y las rutas, agregar los 2 códigos al manejador y conectar todo. Crear `tests/db/asignacion.api.test.ts`. Casos:
   - El coordinador de A asigna un técnico de A a una queja `asignada` de A → `200` y una fila nueva en `ticket_asignaciones`.
   - Reasignar sin motivo → `400`; con motivo → `200`.
   - Un técnico de B → `400 TECNICO_NO_ELEGIBLE`.
   - Una queja de B, para el coordinador de A → `404`.
   - El supervisor asigna en B → `200`.
   - El técnico, el receptor y el vecino → `403`.
   - Dos asignaciones simultáneas sobre la misma queja: las dos quedan registradas en orden, y `asignado_a` es la segunda.
   - `por-asignar` respeta la vista, el orden por prioridad y antigüedad, y el alcance del coordinador.
   - `dependencias/:id/tecnicos` devuelve la carga correcta, y responde `404` a un coordinador que pide otra dependencia.
   - Después de asignar, `iniciar` (SPEC 04) ya no lanza `TECNICO_REQUERIDO`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Frontend: agregar `/asignacion` a `rutas.ts` y `router.tsx`, y crear `asignacion-api.ts` y `AsignacionPage.tsx`. Ampliar `router.test.tsx` y `app-layout.test.tsx` (solo el coordinador y el supervisor). Crear `asignacion-page.test.tsx`: la vista cambia la consulta, las tarjetas muestran la prioridad traducida, y la paginación funciona. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
7. Crear `PanelAsignacion.tsx` y `panel-asignacion.test.tsx`. Casos:
   - Lista los técnicos con su carga y marca el actual.
   - Sin técnico previo, el botón dice "Asignar" y no pide motivo.
   - Con técnico, dice "Reasignar" y exige motivo.
   - `TECNICO_NO_ELEGIBLE` recarga la lista.
   - Después de asignar se invalida la bandeja.

   Verificación: `npm test` pasa.
8. Actualizar `CLAUDE.md`: `ticket_asignaciones` como registro de asignaciones (solo de inserción) para la línea de tiempo, y que solo se asignan técnicos de la dependencia del ticket. Verificación manual con el backend y `seed:dev`, después del triage de SPEC 19:
   - `coordinador@vozmuni.test` ve la queja en `/asignacion`, la asigna a `tecnico@vozmuni.test` y la reasigna con motivo.
   - En la base hay 2 filas en `ticket_asignaciones`.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye `ticket_asignaciones` y los 3 endpoints.
- [ ] `npm run migrate:latest` crea `ticket_asignaciones`, y `UPDATE`, `DELETE` y `TRUNCATE` sobre ella fallan con `ticket_asignaciones es solo de inserción`. Un rollback completo no deja ninguna de las 20 tablas.
- [ ] El coordinador asigna a una queja `asignada` de su dependencia un técnico activo de esa dependencia. `tickets.asignado_a` cambia, el estado no, y se inserta una fila con `tecnico_anterior` null, `asignado_por` del coordinador y `motivo` opcional.
- [ ] La reasignación exige motivo, guarda el técnico anterior, y en `en_proceso` mantiene el estado.
- [ ] Un técnico de otra dependencia, inactivo o con otro rol responde `400 TECNICO_NO_ELEGIBLE`, y el mismo técnico ya asignado responde `400 TECNICO_SIN_CAMBIO`.
- [ ] Asignar en un estado distinto de `asignada` o `en_proceso` responde `400 OPERACION_NO_PERMITIDA`.
- [ ] El coordinador recibe `404` sobre quejas de otra dependencia. El supervisor asigna en cualquier dependencia. El técnico, el receptor, el vecino y el administrador reciben `403`.
- [ ] Dos asignaciones simultáneas sobre la misma queja se serializan: quedan las dos filas en orden, y `asignado_a` es la última.
- [ ] `GET /tickets/por-asignar` devuelve las quejas sin técnico (o las abiertas, según `vista`) dentro del alcance del usuario, ordenadas por prioridad y antigüedad, paginadas con `total`, y sin datos de contacto del solicitante.
- [ ] `GET /dependencias/:id/tecnicos` devuelve los técnicos activos de la dependencia con su carga de quejas abiertas, y responde `404` al coordinador que pide otra dependencia.
- [ ] Después de asignar un técnico, la transición `iniciar` de SPEC 04 funciona sobre esa queja.
- [ ] En el frontend, solo el coordinador y el supervisor ven "Asignación" en el menú y pueden abrir `/asignacion`.
- [ ] `/asignacion` muestra la bandeja con las vistas y la paginación. El panel lista los técnicos con su carga, pide motivo solo al reasignar, y actualiza la bandeja después de asignar.
- [ ] A 360 px de ancho, `/asignacion` y el panel no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta `ticket_asignaciones` y la regla de técnicos elegibles.

## Decisiones

- **Sí:** tabla nueva `ticket_asignaciones`, solo de inserción, para cada asignación y reasignación. `ticket_historial` sigue siendo solo de cambios de estado (SPEC 03 y 04), y la línea de tiempo (RF-25) unirá las dos.
- **No:** una fila en `ticket_historial` con el mismo estado, ni registrarlo solo en la bitácora.
- **Sí:** el trigger de solo inserción sigue el mismo patrón que `bitacora`, con su propia función y su propio mensaje. Lo propone esta spec.
- **Sí:** solo se asignan técnicos activos de la dependencia del ticket, también para el supervisor. Un técnico de otra dependencia requiere un traslado (RF-15).
- **No:** que el coordinador se asigne a sí mismo, ni asignar técnicos de otra dependencia.
- **Sí:** el motivo es obligatorio al reasignar y opcional en la primera asignación.
- **Sí:** no se puede quitar el técnico sin poner otro.
- **Sí:** sin avisos en esta spec, como eligió el usuario. Las notificaciones internas van con RF-32.
- **No:** avisos en la aplicación o por correo al técnico.
- **Sí:** bandeja `GET /tickets/por-asignar` y lista `GET /dependencias/:id/tecnicos` con la carga de cada técnico, para que el coordinador elija sin esperar a RF-36.
- **Sí:** la pantalla `/asignacion` para el coordinador y el supervisor, con el mismo patrón de bandeja y panel que `/triage` (SPEC 19).
- **Sí:** asignar el mismo técnico responde `400 TECNICO_SIN_CAMBIO`, para no registrar asignaciones vacías. Lo propone esta spec.
- **Sí:** "carga" son los tickets del técnico en `asignada`, `en_proceso` o `en_espera`. Lo propone esta spec y puede ajustarse.
- **Sí:** la bandeja se ordena por prioridad (urgente primero) y luego por antigüedad. Lo propone esta spec.
- **Sí:** `SELECT … FOR UPDATE` al asignar, reutilizando `TicketEscrituraRepository` de SPEC 19.
- **Sí:** SPEC 04 no cambia: `asignarTecnico` ya cubre el cambio de técnico y sus reglas de estado.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin notificación, el técnico no se entera de que tiene una queja nueva | Verá sus quejas en su listado (alcance `asignadas`, SPEC 11) cuando exista RF-36. RF-32 agrega el aviso. |
| Un técnico desactivado o movido de dependencia conserva quejas asignadas | La bandeja con la vista `abiertas` las muestra con su técnico, y el coordinador puede reasignarlas. Una spec futura puede marcarlas o reasignarlas sola al desactivar. |
| Contar la carga con una consulta por dependencia es lento con muchos tickets | Usa el índice `tickets (asignado_a, estado)` de SPEC 03. |
| La regla de "solo la misma dependencia" impide al supervisor resolver urgencias con un técnico de otra dependencia | Es intencional. El camino es el traslado (RF-15), que mantiene la coherencia de la dependencia del ticket. |
| Depende de 5 specs, 4 de ellas en Borrador | Se implementa después de SPEC 19. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Asignación automática por carga (RF-16).
- Notificaciones al técnico y al vecino.
- Desasignar y asignar técnicos de otra dependencia.
- Línea de tiempo.
- Reasignación por desactivación del técnico.
- Coordinador de la dependencia y bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
