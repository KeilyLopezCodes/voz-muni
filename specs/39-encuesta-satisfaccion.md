# SPEC 39 — Encuesta de satisfacción al cerrar

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 11, SPEC 15, SPEC 25, SPEC 27, SPEC 33, SPEC 36, SPEC 38
> **Fecha:** 2026-10-23
> **Objetivo:** Permitir que el vecino solicitante califique de 1 a 5, con un comentario opcional, la atención de su queja cerrada, una sola vez y dentro de un plazo configurable de 30 días, mediante `POST /api/v1/tickets/:id/encuesta`, con el formulario en el detalle, la marca en "Mis quejas" y un aviso a los coordinadores ante una calificación baja.

## Por qué existe esta spec

RF-37 (prioridad S) pide que, al cerrar, el vecino califique la atención de 1 a 5 y deje un comentario opcional.
La tabla `encuestas` existe desde SPEC 03, con una encuesta por queja (`ticket_id UNIQUE`), y la sección 6 define `POST /api/v1/tickets/:id/encuesta` para el vecino. Una queja llega a `cerrada` cuando la confirman (SPEC 27) o cuando el sistema la cierra por vencimiento (SPEC 33). SPEC 27 dejó la encuesta fuera.

## Alcance

**Incluido:**

- Migración `0032_encuestas`:
  - `CHECK` del largo del comentario en `encuestas`.
  - Parámetros `encuesta_plazo_dias = 30` y `encuesta_umbral_alerta = 2`.
- Reglas en el dominio (`domain/encuestas/encuesta.ts`):
  - Solo se califica una queja `cerrada`, dentro de `encuesta_plazo_dias` días naturales desde `cerrado_en`.
  - La calificación es un entero de 1 a 5, y el comentario es opcional, de hasta 1000 caracteres.
  - Una sola encuesta por queja, definitiva.
- `POST /api/v1/tickets/:id/encuesta`: solo el solicitante de la queja.
- Si la calificación es `<= encuesta_umbral_alerta`, se notifica `encuesta_baja` a los coordinadores de la dependencia, por la campana de SPEC 36.
- Lectura:
  - **Cambio sobre SPEC 25:** `GET /tickets/:id` agrega `encuesta`, `puedeCalificar` y `encuestaVenceEn`, visibles para el solicitante y los internos con alcance.
  - **Cambio sobre SPEC 38:** `GET /tickets` agrega `pendienteCalificar` a cada elemento.
- Frontend:
  - El bloque "Califica la atención" en el detalle. Aparece en cuanto se confirma la solución, y en cualquier queja cerrada sin calificar.
  - La calificación enviada, en solo lectura.
  - La marca "Califica la atención" en "Mis quejas".
  - El texto de `encuesta_baja` en la campana.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Promedios, porcentajes y reportes de satisfacción (RF-39).
- Pedir la encuesta por correo, o enlazarla desde `queja_cerrada` y `queja_cerrada_automaticamente`.
- Calificar quejas rechazadas.
- Que un receptor registre la calificación en nombre del vecino.
- Editar o borrar una encuesta.
- Mostrar la encuesta en la consulta pública (SPEC 37).
- Moderar los comentarios de las encuestas.
- Encuestas con varias preguntas o configurables.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0032_encuestas.ts`

```sql
ALTER TABLE encuestas
  ADD CONSTRAINT encuestas_comentario_largo
    CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 1000);
```

El `up` también inserta en `parametros` (con `ON CONFLICT (clave) DO NOTHING`):

| `clave` | `valor` | Rango válido |
| --- | --- | --- |
| `encuesta_plazo_dias` | `30` | entero de 1 a 365 |
| `encuesta_umbral_alerta` | `2` | entero de 0 a 5 (0 desactiva la alerta) |

El `down` borra los parámetros y el `CHECK`. La tabla `encuestas` (SPEC 03) no cambia de forma.

### Reglas (`backend/src/domain/encuestas/encuesta.ts`)

```ts
export const CALIFICACION_MIN = 1;
export const CALIFICACION_MAX = 5;
export const COMENTARIO_MAX = 1000;

export interface DatosEncuesta { calificacion: number; comentario: string | null }

// Valida que la calificación sea un entero de 1 a 5, y recorta el comentario (uno vacío pasa a null).
// Lanza ReglaDeNegocioError ENCUESTA_INVALIDA.
export function validarEncuesta(calificacion: unknown, comentario: unknown): DatosEncuesta;

// Lanza ENCUESTA_NO_DISPONIBLE si estado !== 'cerrada',
// y ENCUESTA_VENCIDA si ahora > cerradoEn + plazoDias (en días naturales).
export function exigirCalificable(estado: EstadoTicket, cerradoEn: Date | null, ahora: Date, plazoDias: number): void;

// El último instante para calificar, o null si la queja no está cerrada.
export function venceEncuesta(cerradoEn: Date | null, plazoDias: number): Date | null;
```

- El plazo se cuenta en días naturales, porque es un plazo para el vecino y no un plazo de trabajo municipal. El instante exacto `cerradoEn + plazoDias` todavía es válido.
- Las quejas `rechazada` no se califican: no hubo atención.
- Una queja `cerrada` por el sistema (SPEC 33) se califica igual que una confirmada.

### `POST /api/v1/tickets/:id/encuesta`

Protegido por `autenticar` y `requierePermiso('tickets.ver')`. Pasos, en una transacción:

1. Se obtiene el ticket con `ConsultaTicketsService.obtenerParaAccion(usuario, 'tickets.ver', id)` (SPEC 11), y se bloquea con `FOR UPDATE`. Fuera de alcance responde `404 NO_ENCONTRADO`.
2. Si el usuario no es el solicitante, responde `403 PERMISO_DENEGADO`. Así un interno con alcance no puede calificar. La regla es "ser el solicitante" y no agrega una acción a la matriz.
3. Se aplican `exigirCalificable`, con `encuesta_plazo_dias`, y `validarEncuesta`.
4. Se inserta la fila. Si ya existe una para el ticket, el `UNIQUE` responde `409 ENCUESTA_EXISTENTE`.
5. Si `calificacion <= encuesta_umbral_alerta`, se llama a `NotificacionesInternasService.notificar` (SPEC 36):

   | `tipo` | `datos` | Destinatarios |
   | --- | --- | --- |
   | `encuesta_baja` | `{ "calificacion": number }` | Los coordinadores de la dependencia de la queja (`DestinatariosRepository`, SPEC 36) |

   Se aplican los filtros comunes de SPEC 36: activos, con alcance, y nunca el autor.

Cuerpo (Zod `strict`): `{ calificacion: number; comentario?: string }`.

Respuestas:

| Caso | Respuesta |
| --- | --- |
| Correcto | `201` con `{ calificacion, comentario, creadoEn }` |
| Calificación fuera de 1–5 o no entera, comentario de más de 1000 caracteres, o campos extra | `400 VALIDACION` |
| La queja no está `cerrada` | `409 ENCUESTA_NO_DISPONIBLE` |
| Pasó el plazo | `409 ENCUESTA_VENCIDA` |
| Ya tiene encuesta | `409 ENCUESTA_EXISTENTE` |
| No es el solicitante | `403 PERMISO_DENEGADO` |
| Fuera de alcance | `404 NO_ENCONTRADO` |

Si `encuesta_plazo_dias` o `encuesta_umbral_alerta` faltan o no son válidos, responde `409 PARAMETRO_INVALIDO` y no guarda nada (el mismo código de SPEC 27).

Lo implementa `EncuestasService` (`application/services/encuestas.service.ts`), con `EncuestaRepository` y `KnexEncuestaRepository`.

### Lectura

`TicketDetalle` (SPEC 25) agrega:

```ts
export interface TicketDetalle {
  // … campos de SPEC 25, 26, 27 y 33
  encuesta: { calificacion: number; comentario: string | null; creadoEn: string } | null;
  puedeCalificar: boolean;           // solicitante && cerrada && sin encuesta && dentro del plazo
  encuestaVenceEn: string | null;    // solo si puedeCalificar
}
```

- `encuesta` lo ven el solicitante y los internos que tienen la queja en su alcance de `tickets.ver`.
- `puedeCalificar` solo es `true` para el solicitante.

`TicketListado` (SPEC 25 y 38) agrega `pendienteCalificar: boolean`, con la misma regla que `puedeCalificar`. `GET /tickets` no cambia de parámetros.

### Frontend

| Elemento | Detalle |
| --- | --- |
| "Califica la atención" | `features/tickets/mis-quejas/CalificarAtencion.tsx`, en `SolucionQueja` (SPEC 26), si `puedeCalificar`. Como la confirmación (SPEC 27) invalida el detalle, aparece en cuanto el vecino confirma |
| Calificación | 5 opciones como grupo de radio accesible (estrellas con `aria-label` "1 de 5" … "5 de 5"), con navegación por teclado. Es obligatoria |
| Comentario | "¿Quieres contarnos algo más? (opcional)", de hasta 1000 caracteres, con contador |
| Plazo | "Puedes calificar hasta el <fecha>", con `encuestaVenceEn` en `America/Guatemala` |
| Enviar | "Enviar calificación". Al terminar: "Gracias por tu opinión", y se invalidan el detalle, la lista y el resumen de "Mis quejas" (SPEC 38). Un `409` muestra su mensaje y recarga |
| Ya calificada | Para el vecino: "Tu calificación: 4 de 5", con el comentario. Para los internos: "Calificación del vecino: 4 de 5", con el comentario en texto plano |
| "Mis quejas" | Marca "Califica la atención", con ícono y texto, en las tarjetas con `pendienteCalificar` |
| Campana | `encuesta_baja`: "La queja <numero> recibió una calificación de <n> de 5" (SPEC 31 y 36) |
| Textos | `locales/es/tickets.json` y `comun.json` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: endpoint, parámetros
CLAUDE.md
backend/
  src/
    app.ts
    container.ts
    domain/encuestas/encuesta.ts
    domain/repositories/encuesta-repository.ts
    domain/repositories/ticket-lectura-repository.ts   # encuesta, puedeCalificar, pendienteCalificar
    domain/notificaciones/tipos-notificacion.ts       # encuesta_baja (SPEC 36)
    application/services/encuestas.service.ts
    application/services/consulta-tickets.service.ts
    infrastructure/
      database/migrations/0032_encuestas.ts
      repositories/knex-encuesta-repository.ts
      repositories/knex-ticket-lectura-repository.ts
    presentation/
      validators/encuestas.validators.ts
      controllers/encuestas.controller.ts
      routes/encuestas.routes.ts
      middlewares/manejador-errores.ts                # códigos nuevos
  tests/
    unit/encuestas/encuesta.test.ts
    unit/encuestas/encuestas.service.test.ts
    db/schema.test.ts                                 # 0032
    db/encuestas.api.test.ts                          # Supertest contra Postgres real
    db/tickets-lectura.api.test.ts                    # encuesta y pendienteCalificar
frontend/
  src/
    features/tickets/api/tickets-api.ts               # encuesta, enviar
    features/tickets/mis-quejas/CalificarAtencion.tsx
    features/tickets/mis-quejas/SolucionQueja.tsx
    features/tickets/mis-quejas/MisQuejas.tsx         # marca
    shared/notificaciones/CampanaNotificaciones.tsx   # encuesta_baja
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/calificar-atencion.test.tsx
    features/tickets/mis-quejas.test.tsx
    shared/campana-notificaciones.test.tsx
```

## Plan de implementación

1. Crear `domain/encuestas/encuesta.ts` y su prueba. Casos:
   - Las calificaciones 1 y 5 son válidas. Las 0, 6 y 3.5 lanzan `ENCUESTA_INVALIDA`.
   - Un comentario de solo espacios pasa a `null`. Uno de 1001 caracteres es inválido.
   - Una queja `resuelta` o `rechazada` lanza `ENCUESTA_NO_DISPONIBLE`.
   - En el instante `cerradoEn + 30 días` todavía se puede calificar. Un milisegundo después lanza `ENCUESTA_VENCIDA`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0032_encuestas.ts` y ampliar `tests/db/schema.test.ts`: existen los parámetros y el `CHECK`, un comentario vacío es rechazado, y el `down` los elimina. Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Crear `EncuestaRepository`, `KnexEncuestaRepository` y `EncuestasService`, con `encuestas.service.test.ts` y falsos, y la ruta `POST /tickets/:id/encuesta`. Crear `tests/db/encuestas.api.test.ts`. Casos:
   - El vecino califica su queja cerrada con 4 y un comentario → `201`.
   - Una segunda vez → `409 ENCUESTA_EXISTENTE`.
   - Una queja cerrada automáticamente (SPEC 33) también se califica.
   - Una queja `resuelta` → `409 ENCUESTA_NO_DISPONIBLE`. Fuera de plazo → `409 ENCUESTA_VENCIDA`.
   - El coordinador de la dependencia → `403`. Otro vecino → `404`. Sin sesión → `401`.
   - Una calificación de 2 notifica `encuesta_baja` a `coordinador@vozmuni.test`. Una de 3, no. Con el umbral en 0, nunca.
   - Una calificación de 7 o un campo extra → `400`.
   - Dos envíos simultáneos dejan una sola encuesta.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
4. Agregar `encuesta`, `puedeCalificar` y `encuestaVenceEn` al detalle, y `pendienteCalificar` al listado. Ampliar `tests/db/tickets-lectura.api.test.ts`. Casos:
   - El solicitante de una cerrada sin encuesta ve `puedeCalificar: true` y `pendienteCalificar: true`.
   - Después de calificar, los dos son `false` y `encuesta` tiene los datos.
   - El coordinador ve `encuesta` con `puedeCalificar: false`.
   - Fuera de plazo, los dos son `false`.

   Verificación: `npm run test:db` pasa.
5. Frontend: crear `CalificarAtencion.tsx` y conectarlo a `SolucionQueja`. Agregar la marca en `MisQuejas` y el texto de `encuesta_baja` en la campana. Crear `calificar-atencion.test.tsx` y ampliar las pruebas existentes. Casos:
   - No se puede enviar sin calificación.
   - Las estrellas se manejan con el teclado y tienen su `aria-label`.
   - El contador del comentario llega a 1000.
   - Al enviar aparece "Gracias por tu opinión" y se invalidan el detalle y la lista.
   - Los `409` muestran su mensaje.
   - La calificación ya enviada se muestra en solo lectura, para el vecino y para los internos.
   - La marca aparece en "Mis quejas".
   - La campana muestra `encuesta_baja`.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Actualizar la sección 6 del documento de definición (`POST /api/v1/tickets/:id/encuesta` con sus reglas y los parámetros) y `CLAUDE.md`:
   - Quién y cuándo puede calificar.
   - El plazo en días naturales.
   - Que la encuesta es definitiva.
   - La alerta `encuesta_baja`.
   - Que los promedios llegan con RF-39.

   Verificación manual con el backend y `seed:dev`: `vecino@vozmuni.test` confirma la solución de una queja (SPEC 27), ve "Califica la atención" y envía 2 estrellas con un comentario. "Mis quejas" ya no muestra la marca. `coordinador@vozmuni.test` ve en la campana "recibió una calificación de 2 de 5", y en el detalle la calificación y el comentario. A 360 px, el bloque no produce scroll horizontal.

## Criterios de aceptación

- [ ] La migración `0032_encuestas` agrega el `CHECK` del comentario y los parámetros `encuesta_plazo_dias = 30` y `encuesta_umbral_alerta = 2`, y su `down` los elimina.
- [ ] `POST /api/v1/tickets/:id/encuesta` guarda una calificación entera de 1 a 5 y un comentario opcional de hasta 1000 caracteres, recortado, y responde `201`.
- [ ] Solo el solicitante puede calificar. Un interno con alcance recibe `403`, y alguien sin alcance recibe `404`.
- [ ] Solo se califican las quejas `cerrada` (confirmadas o cerradas por el sistema), dentro de `encuesta_plazo_dias` días naturales desde `cerrado_en`. Fuera de esas condiciones responde `409 ENCUESTA_NO_DISPONIBLE` o `409 ENCUESTA_VENCIDA`.
- [ ] Una queja admite una sola encuesta, que no se puede cambiar. Un segundo envío, aunque sea simultáneo, responde `409 ENCUESTA_EXISTENTE`.
- [ ] Una calificación menor o igual a `encuesta_umbral_alerta` notifica `encuesta_baja` a los coordinadores de la dependencia, y con el umbral en 0 no notifica nunca.
- [ ] `GET /api/v1/tickets/:id` incluye `encuesta` para el solicitante y para los internos con alcance, y `puedeCalificar` y `encuestaVenceEn` solo son verdaderos o tienen valor para el solicitante dentro del plazo.
- [ ] `GET /api/v1/tickets` marca `pendienteCalificar` en las quejas del solicitante que puede calificar.
- [ ] El detalle muestra "Califica la atención" en cuanto el vecino confirma, y en cualquier queja cerrada sin calificar, con las estrellas accesibles por teclado, el comentario opcional y la fecha límite en `America/Guatemala`.
- [ ] La calificación enviada se muestra en solo lectura en el detalle, "Mis quejas" muestra la marca "Califica la atención", y la campana muestra `encuesta_baja`.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol ni fija el plazo o el umbral en el código.
- [ ] A 360 px de ancho, el bloque de calificación no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan el endpoint, sus reglas, los parámetros y la alerta.

## Decisiones

- **Sí:** se califica toda queja `cerrada`, la haya confirmado el vecino o la haya cerrado el sistema. Es literal a "al cerrar".
- **No:** calificar solo las confirmadas, ni calificar las rechazadas.
- **Sí:** el plazo es de 30 días naturales desde el cierre (el parámetro `encuesta_plazo_dias`), para que RF-39 no mezcle calificaciones muy tardías.
- **Sí:** el plazo va en días naturales y no hábiles, porque es un plazo del vecino y no de la municipalidad. Es una propuesta de esta spec.
- **Sí:** la encuesta se pide en el portal: en el detalle (que aparece al confirmar) y con una marca en "Mis quejas".
- **No:** pedirla por correo, por ahora.
- **Sí:** la encuesta la ven el solicitante y los internos con alcance. Los promedios llegan con RF-39.
- **Sí:** solo el solicitante califica. La regla es "ser el solicitante", así que no se agrega una acción a la matriz de permisos.
- **No:** que un receptor califique en nombre del vecino.
- **Sí:** la encuesta es definitiva, apoyada en el `UNIQUE` de SPEC 03.
- **Sí:** una calificación de 1 o 2 (el parámetro `encuesta_umbral_alerta`) avisa a los coordinadores con `encuesta_baja` en la campana de SPEC 36. Con el umbral en 0, la alerta se desactiva.
- **Sí:** la encuesta no aparece en la consulta pública (SPEC 37), porque es una opinión del vecino y no un estado de la queja.
- **Sí:** los textos, el diseño de las estrellas y el rango de los parámetros los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Pocos vecinos califican si solo se pide en el portal | La marca en "Mis quejas" y la aparición inmediata al confirmar ayudan. Pedirla por correo queda para otra spec. |
| Los vecinos de ventanilla sin cuenta activa no pueden calificar | Es una consecuencia de "solo el solicitante, con sesión". La invitación de SPEC 13 les permite activar su cuenta. |
| Un comentario ofensivo queda visible para los internos | Se muestra como texto plano y solo a los internos con alcance. La moderación queda para otra spec. |
| Las quejas cerradas automáticamente pueden recibir calificaciones bajas solo por el cierre | Las encuestas guardan la queja, y RF-39 puede separar las cerradas automáticamente (`cierreAutomatico`, SPEC 33). |
| Depende de SPEC 25, 27, 33, 36 y 38 (Borrador) | Se implementa después de SPEC 38. Si cambian `TicketDetalle` o `NotificacionesInternasService`, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Reportes y promedios de satisfacción (RF-39).
- Encuesta por correo.
- Calificar quejas rechazadas o en nombre del vecino.
- Edición, moderación y encuestas configurables.
- La encuesta en la consulta pública.

Cada uno de estos temas, cuando llegue, va en su propia spec.
