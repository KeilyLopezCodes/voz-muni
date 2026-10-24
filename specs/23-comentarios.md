# SPEC 23 — Comentarios públicos y notas internas

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 08, SPEC 11, SPEC 17, SPEC 19, SPEC 20, SPEC 22
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que los usuarios internos escriban comentarios públicos o notas internas en una queja, y que el vecino comente sus quejas (reanudándolas si estaban en espera, RF-22), con edición del autor durante 5 minutos, mediante `/api/v1/tickets/:id/comentarios` y un hilo en los paneles de triage, asignación y atención.

## Por qué existe esta spec

RF-19 (**M**) pide que los usuarios internos agreguen comentarios públicos, visibles para el vecino, o notas internas. RF-22 (**M**) pide que el vecino responda una solicitud de información y que la queja vuelva a `en_proceso`.
La tabla `comentarios` existe desde SPEC 03, y los permisos `comentarios.publico` y `comentarios.interno` desde SPEC 08, pero nadie puede usarlos.
SPEC 22 registró el riesgo de que una queja quede en espera indefinidamente porque el vecino no puede responder. Esta spec habilita la respuesta del lado del backend.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0019_comentarios`: columna `editado_en`, `CHECK` del largo del cuerpo e índice para el hilo.
- `POST /api/v1/tickets/:id/comentarios`:
  - Comentario público, con `comentarios.publico`, o nota interna, con `comentarios.interno`.
  - Acceso según `tickets.ver` (SPEC 11).
- Si el solicitante comenta una queja en `en_espera`, la queja pasa a `en_proceso` (`Ticket.reanudar`, SPEC 04) en la misma transacción.
- `GET /api/v1/tickets/:id/comentarios`: el hilo, en el que el vecino ve solo los públicos.
- `PATCH /api/v1/tickets/:id/comentarios/:comentarioId`: el autor edita el texto durante 5 minutos, sin conservar la versión anterior.
- En quejas `rechazada` o `cerrada` solo se aceptan notas internas.
- Frontend: componente `HiloComentarios` en los paneles de `/triage` (SPEC 19), `/asignacion` (SPEC 20) y `/atencion` (SPEC 22).
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantalla del vecino para leer y responder (detalle de "Mis quejas", RF-25 y RF-36).
- Avisos por correo al vecino sobre comentarios nuevos (RF-31) y avisos internos (RF-32).
- Adjuntos en comentarios (`adjuntos.comentario_id`), que van con la spec de adjuntos.
- Historial de versiones de un comentario editado.
- Borrar comentarios.
- Menciones, respuestas anidadas y formato enriquecido.
- Línea de tiempo combinada (RF-25).
- Bitácora (RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- `comentarios`: se agrega `editado_en`.
- Endpoints:
  - La fila `POST /api/v1/tickets/:id/comentarios` documenta `{ cuerpo, interno }`.
  - Se agregan `GET /api/v1/tickets/:id/comentarios` y `PATCH /api/v1/tickets/:id/comentarios/:comentarioId`.
- Se anota que un comentario del vecino en una queja en espera la reanuda (RF-22).

### `0019_comentarios`

| Tabla | Cambio |
| --- | --- |
| `comentarios` | `editado_en timestamptz NULL` |
| `comentarios` | CHECK `comentarios_cuerpo_largo`: `char_length(cuerpo) BETWEEN 1 AND 4000` |
| `comentarios` | Índice `comentarios_ticket_creado_idx` sobre `(ticket_id, creado_en)`, que reemplaza a `comentarios_ticket_idx` de SPEC 03 |

El `down` restaura el índice original y borra el `CHECK` y la columna. No hay tablas nuevas: el esquema sigue en 21.

### Reglas (`domain/comentarios/comentario.ts`)

```ts
export const CUERPO_MAX = 4000;
export const VENTANA_EDICION_MS = 5 * 60 * 1000;

// Recorta y valida 1–4000 caracteres; lanza ReglaDeNegocioError CUERPO_INVALIDO.
export function validarCuerpo(cuerpo: string): string;

// Lanza ReglaDeNegocioError QUEJA_FINALIZADA si el ticket es final (rechazada, cerrada) y el comentario es público.
export function exigirComentable(estadoTicket: EstadoTicket, interno: boolean): void;

// El solicitante que comenta en en_espera reanuda la queja (RF-22).
export function debeReanudar(p: { estadoTicket: EstadoTicket; autorId: number; solicitanteId: number; interno: boolean }): boolean;
// estado === 'en_espera' && autorId === solicitanteId && !interno

// Lanza ReglaDeNegocioError EDICION_VENCIDA si ahora > creadoEn + 5 min. Solo el autor llega aquí (el resto recibe 404).
export function exigirEditable(creadoEn: Date, ahora: Date): void;
```

`esFinal` viene de SPEC 04.

### Permisos y visibilidad

| Operación | Permiso | Filtro sobre el ticket (SPEC 11) |
| --- | --- | --- |
| Comentario público | `comentarios.publico` | `tickets.ver` |
| Nota interna | `comentarios.interno` | `tickets.ver` |
| Ver el hilo | `tickets.ver` | `tickets.ver` |
| Ver las notas internas del hilo | además, `comentarios.interno` | — |
| Editar | autor del comentario | `tickets.ver` |

- Con la matriz de SPEC 08, el vecino solo comenta en público y nunca ve las notas internas. Receptor, técnico, coordinador y supervisor hacen las dos cosas y ven todo.
- El administrador no tiene ninguno de los dos permisos, así que recibe `403` al comentar.
- Un ticket fuera del alcance de `tickets.ver` responde `404 NO_ENCONTRADO`.
- Las notas internas se filtran en la consulta (`WHERE es_interno = false`) cuando el usuario no tiene `comentarios.interno`, nunca después en memoria.

### `POST /api/v1/tickets/:id/comentarios`

Protegido por `autenticar`. Cuerpo (Zod `strict`): `{ cuerpo: string; interno?: boolean }`, con `interno` en `false` por defecto. El permiso se elige según `interno`; si el rol no lo tiene, responde `403 PERMISO_DENEGADO`.

En una transacción:

1. Se lee el ticket con `SELECT … FOR UPDATE` y el filtro de `tickets.ver`. Fuera de alcance responde `404`.
2. `exigirComentable(estado, interno)` y `validarCuerpo(cuerpo)`.
3. Se inserta el comentario, con `autor_id` del usuario y `es_interno = interno`.
4. Si `debeReanudar(…)`, se llama a `Ticket.reanudar(ctx)` y se guardan el estado `en_proceso` y su fila de `ticket_historial`, con `usuario_id` del vecino y `motivo = null`.

Responde `201` con `{ comentario: ComentarioDto, ticket: { id, estado } }`, que es el estado después de reanudar, si correspondió. No envía correos.

### `GET /api/v1/tickets/:id/comentarios`

Protegido por `autenticar` y `requierePermiso('tickets.ver')`, con el filtro de SPEC 11. Devuelve `200 { datos: ComentarioDto[] }`, ordenado por `creado_en ASC, id ASC`, con como máximo 500 comentarios (los 500 más recientes, en orden). Las notas internas se incluyen solo si el usuario tiene `comentarios.interno`.

```ts
export interface ComentarioDto {
  id: number;
  cuerpo: string;
  interno: boolean;
  autor: { id: number; nombre: string; rol: Rol };
  esDelSolicitante: boolean;
  creadoEn: string;           // ISO 8601 en UTC
  editadoEn: string | null;
  editable: boolean;          // true si el usuario es el autor y no pasaron 5 min
}
```

### `PATCH /api/v1/tickets/:id/comentarios/:comentarioId`

Protegido por `autenticar`. Cuerpo: `{ cuerpo: string }`.

- El comentario debe pertenecer al ticket, que debe estar en el alcance de `tickets.ver`, y su autor debe ser el usuario. Si no, responde `404 NO_ENCONTRADO`.
- `exigirEditable(creadoEn, ahora)`: pasados 5 minutos responde `409 EDICION_VENCIDA`.
- `exigirComentable(estadoTicket, interno)`: un comentario público en una queja final responde `409 QUEJA_FINALIZADA`.
- No se puede cambiar `interno`, que en el cuerpo responde `400 VALIDACION`.
- Actualiza `cuerpo` y `editado_en = ahora`. El texto anterior no se conserva.
- Editar no reanuda la queja.
- Responde `200` con el `ComentarioDto`.

Códigos nuevos en el manejador de errores: `CUERPO_INVALIDO` (400), `QUEJA_FINALIZADA` (409) y `EDICION_VENCIDA` (409).

### Frontend: `HiloComentarios` (`features/tickets/comentarios/`)

| Elemento | Detalle |
| --- | --- |
| Dónde | Al pie de `PanelTriage` (SPEC 19), `PanelAsignacion` (SPEC 20) y `PanelAtencion` (SPEC 22) |
| Lista | Cada comentario muestra el autor, su rol traducido, la fecha relativa en `America/Guatemala`, la marca "Nota interna" con otro fondo y una etiqueta textual (no solo color, por WCAG), "editado" si corresponde, y "Vecino" si es del solicitante |
| Caja | Un texto multilínea con contador de 1 a 4000, un selector "Público" / "Nota interna" (por defecto "Nota interna", para no publicar sin querer) y "Enviar". El selector se oculta si el rol no tiene `comentarios.interno`, y en una queja final solo se permite la nota interna |
| Editar | "Editar" aparece solo si `editable`, y se convierte en un campo con "Guardar" y "Cancelar". Un `409 EDICION_VENCIDA` muestra "Ya no se puede editar" y recarga |
| Después de enviar | Se invalida el hilo. Si la respuesta cambió el estado de la queja, también se invalida la bandeja del panel |
| Textos | `locales/es/tickets.json` |

El permiso para mostrar el selector sale de la sesión (SPEC 17), y la verdad sigue en el backend.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas de comentarios
    container.ts
    domain/comentarios/comentario.ts
    domain/repositories/comentario-repository.ts       # crear, listar por visibilidad, obtener del autor, editar
    application/services/comentarios.service.ts       # comentar (con reanudación), listar, editar
    infrastructure/
      repositories/knex-comentario-repository.ts
      database/migrations/0019_comentarios.ts
    presentation/
      validators/comentarios.validators.ts
      controllers/comentarios.controller.ts
      routes/comentarios.routes.ts
      middlewares/manejador-errores.ts                 # 3 códigos nuevos
  tests/
    unit/comentarios/comentario.test.ts
    unit/comentarios/comentarios.service.test.ts
    db/schema.test.ts                                  # editado_en, CHECK e índice
    db/comentarios.api.test.ts                         # Supertest contra Postgres real
frontend/
  src/
    features/tickets/api/comentarios-api.ts
    features/tickets/comentarios/HiloComentarios.tsx
    features/tickets/triage/PanelTriage.tsx            # + hilo
    features/tickets/asignacion/PanelAsignacion.tsx    # + hilo
    features/tickets/atencion/PanelAtencion.tsx        # + hilo
    locales/es/tickets.json
  tests/
    features/tickets/hilo-comentarios.test.tsx
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `comentarios.editado_en`, los 3 endpoints y la regla de RF-22. Verificación: revisión del diff.
2. Crear `0019_comentarios.ts`. Ampliar `schema.test.ts`: existe la columna, un cuerpo de 4001 caracteres o vacío es rechazado, y el índice nuevo existe y reemplaza al anterior. Verificación: `npm run test:db` pasa.
3. Crear `domain/comentarios/comentario.ts` y su prueba. Casos:
   - `validarCuerpo` recorta y rechaza `'   '` y 4001 caracteres.
   - `exigirComentable` rechaza un público en `cerrada` y `rechazada`, y acepta una nota interna.
   - `debeReanudar` es `true` solo para el solicitante, en público y en `en_espera`.
   - `exigirEditable` acepta a los 5 minutos exactos y rechaza 1 ms después.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `ComentarioRepository` y su implementación Knex, y `ComentariosService`. Crear `comentarios.service.test.ts` con falsos. Casos:
   - Un interno comenta en público y en privado.
   - El vecino comenta en `en_espera`: la queja pasa a `en_proceso` con historial del vecino.
   - El vecino comenta en `en_proceso`: no cambia el estado.
   - Un receptor comenta en público en `en_espera`: no reanuda.
   - Una nota interna en `cerrada` se acepta, y un público lanza `QUEJA_FINALIZADA`.
   - El listado sin `comentarios.interno` no incluye notas.
   - Editar fuera de plazo → `EDICION_VENCIDA`; editar no reanuda.

   Verificación: `npm test` pasa.
5. Crear los validadores, el controlador y las rutas, agregar los 3 códigos y conectar todo. Crear `tests/db/comentarios.api.test.ts`. Casos:
   - El técnico asignado escribe una nota interna y un público → `201`.
   - El vecino lee el hilo: ve el público y no la nota.
   - El vecino comenta su queja en espera → `201` con `ticket.estado = 'en_proceso'`, y una fila de historial.
   - El vecino intenta una nota interna → `403`.
   - El vecino comenta una queja ajena → `404`.
   - El administrador comenta → `403`.
   - Un público en una queja `rechazada` → `409 QUEJA_FINALIZADA`, y una nota interna en ella → `201`.
   - El autor edita a los 2 minutos → `200`, con `editado_en`.
   - Editar el comentario de otro → `404`.
   - Editar pasados 5 minutos (con el reloj del contenedor simulado) → `409 EDICION_VENCIDA`.
   - Un `interno` en el `PATCH` → `400`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Frontend: crear `comentarios-api.ts` y `HiloComentarios.tsx`, e integrarlo en los 3 paneles. Crear `hilo-comentarios.test.tsx` con `fetch` simulado. Casos:
   - Muestra las notas internas marcadas con texto.
   - El selector tiene "Nota interna" por defecto.
   - En una queja final, el selector solo permite la nota interna.
   - El contador bloquea más de 4000 caracteres.
   - "Editar" aparece solo si `editable`.
   - `EDICION_VENCIDA` muestra el aviso.
   - Enviar invalida el hilo, y la bandeja si cambió el estado.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
7. Actualizar `CLAUDE.md`:
   - Que las notas internas se filtran en la consulta.
   - Que el comentario público del solicitante reanuda la queja en espera.
   - Que la edición dura 5 minutos y no guarda versiones.
   - Que el vecino comentará desde el detalle (RF-25).

   Verificación manual con el backend y `seed:dev`: `tecnico@vozmuni.test` pone una queja en espera y deja un comentario público con la pregunta. Con `POST /api/v1/tickets/:id/comentarios` como `vecino@vozmuni.test`, la queja vuelve a `en_proceso`, y el técnico ve la respuesta en `/atencion`.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `comentarios.editado_en`, los 3 endpoints y la regla de reanudación de RF-22.
- [x] Después de `migrate:latest`, `comentarios` tiene `editado_en`, rechaza cuerpos vacíos o de más de 4000 caracteres, y tiene el índice `(ticket_id, creado_en)`.
- [x] Receptor, técnico, coordinador y supervisor escriben comentarios públicos y notas internas en las quejas de su alcance, y reciben `404` fuera de él.
- [x] El vecino escribe comentarios públicos solo en sus quejas, recibe `403` al intentar una nota interna, y nunca ve notas internas en el hilo.
- [x] El administrador recibe `403` al comentar.
- [x] Un comentario público del solicitante en una queja `en_espera` la pasa a `en_proceso` en la misma transacción, con una fila de `ticket_historial` a su nombre. El mismo comentario en otro estado, o escrito por otra persona, no cambia el estado.
- [x] En quejas `rechazada` o `cerrada`, un comentario público responde `409 QUEJA_FINALIZADA`, y una nota interna se acepta.
- [x] `GET /tickets/:id/comentarios` devuelve el hilo en orden cronológico, con autor, rol, `interno`, `esDelSolicitante`, `editadoEn` y `editable`, y omite las notas internas en la consulta para quien no tiene `comentarios.interno`.
- [x] El autor puede editar el texto durante 5 minutos desde que lo creó, lo que deja `editado_en`. Después responde `409 EDICION_VENCIDA`. Nadie más puede editarlo (`404`), y `interno` no se puede cambiar.
- [x] Editar no reanuda la queja ni conserva el texto anterior.
- [x] En los paneles de `/triage`, `/asignacion` y `/atencion` se ve el hilo, se puede escribir con el selector "Público" / "Nota interna" (por defecto nota interna) y editar dentro del plazo.
- [x] Las notas internas se distinguen en el hilo con una etiqueta de texto, no solo con color.
- [ ] A 360 px de ancho, el hilo no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente. (pendiente de comprobar a 360 px en el navegador: Chromium de Playwright no está instalado; los textos sí están todos en las traducciones)
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta la visibilidad de las notas, la reanudación por respuesta del vecino y la regla de edición.

## Decisiones

- **Sí:** el vecino comenta sus quejas, y su comentario público en `en_espera` reanuda la queja. Cierra RF-22 del lado del backend sin un endpoint aparte.
- **No:** que el vecino comente sin reanudar, ni que solo comenten los usuarios internos.
- **Sí:** solo reanuda el **solicitante**. Un receptor que comenta en su nombre no reanuda, porque la respuesta tiene que venir del vecino o pasar por el técnico, que reanuda a mano (SPEC 22). Es una precisión que no se preguntó explícitamente.
- **Sí:** en quejas finales solo se aceptan notas internas, para que el vecino no use los comentarios como reapertura (RF-24).
- **No:** congelar todo, ni permitir todo.
- **Sí:** el autor puede editar durante 5 minutos, como eligió el usuario, y el texto anterior **no se conserva**. Así lo eligió el usuario, aunque reduce la trazabilidad.
- **No:** prohibir la edición, ni guardar las versiones.
- **Sí:** no se pueden borrar comentarios.
- **Sí:** sin avisos por correo, como eligió el usuario. Van con RF-31 y RF-32.
- **No:** el correo `comentario_publico`.
- **Sí:** las notas internas se filtran en la consulta (`WHERE`), nunca después en memoria, para que un error de presentación no las exponga al vecino (RNF-12).
- **Sí:** el hilo va en los paneles internos existentes. El vecino comentará desde el detalle de "Mis quejas" (RF-25 y RF-36).
- **No:** una pantalla mínima del vecino en esta spec, ni solo backend.
- **Sí:** el selector tiene "Nota interna" por defecto, para no publicar al vecino por descuido. Lo propone esta spec.
- **Sí:** se agrega un `CHECK` del largo en la base, igual que en SPEC 12, como límite del dato y no como regla configurable.
- **Sí:** el máximo de 500 comentarios por hilo, el largo de 4000 caracteres y los códigos `CUERPO_INVALIDO`, `QUEJA_FINALIZADA` y `EDICION_VENCIDA` los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El vecino todavía no tiene pantalla para responder, así que RF-22 solo funciona contra la API | El endpoint ya lo permite. La spec del detalle de "Mis quejas" (RF-25 y RF-36) debe incluir el hilo público y la caja de respuesta. |
| Sin avisos, ni el vecino ni el técnico se enteran de los comentarios nuevos | El técnico ve el estado reanudado en `/atencion`. RF-31 y RF-32 agregan los avisos. |
| Editar sin conservar el texto anterior permite cambiar lo dicho sin rastro durante 5 minutos | Es una decisión explícita. `editado_en` deja constancia de que hubo una edición, y la ventana es corta. Si una auditoría lo exige, una spec futura guarda versiones. |
| Un interno publica al vecino algo pensado como nota interna | El selector tiene "Nota interna" por defecto, y la marca es visible. Como los comentarios no se pueden borrar, la edición en 5 minutos permite corregir el texto, pero no el tipo. |
| Un hilo muy largo hace pesada la respuesta | El tope de 500 comentarios y el índice `(ticket_id, creado_en)` lo limitan. La paginación queda para el detalle (RF-25) si hace falta. |
| Depende de 7 specs, 6 de ellas en Borrador | Se implementa después de SPEC 22. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Pantalla del vecino para comentar.
- Avisos por correo e internos.
- Adjuntos en comentarios.
- Historial de versiones y borrado.
- Menciones, hilos anidados y formato.
- Línea de tiempo y bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
