# SPEC 25 — "Mis quejas" del vecino y respuesta a solicitudes de información

> **Estado:** Borrador
> **Depende de:** SPEC 11, SPEC 12, SPEC 17, SPEC 18, SPEC 23, SPEC 24
> **Fecha:** 2026-10-22
> **Objetivo:** Dar al vecino una lista de sus quejas en `/tickets` y un detalle en `/tickets/:id` donde ve el estado, lo que la municipalidad le pidió, los comentarios y adjuntos públicos, y responde con un comentario, mediante versiones mínimas de `GET /api/v1/tickets` y `GET /api/v1/tickets/:id`.

## Por qué existe esta spec

RF-22 (**M**) dice: *"El vecino responde la solicitud desde el portal o el correo; la queja vuelve a En proceso"*.
SPEC 23 ya implementa la lógica: un comentario público del solicitante en `en_espera` reanuda la queja. Pero el vecino no tiene ninguna pantalla para verla ni para escribir. `/tickets` sigue siendo un placeholder de SPEC 06, y no existe ningún endpoint de detalle de un ticket.
Esta spec agrega lo mínimo para que el vecino encuentre sus quejas y responda desde el portal. La respuesta por correo queda fuera.

## Alcance

**Incluido:**

- `GET /api/v1/tickets`: listado paginado, dentro del alcance de `tickets.ver` (SPEC 11), con las quejas en espera primero.
- `GET /api/v1/tickets/:id`: detalle básico, sin línea de tiempo, con el motivo de la espera si corresponde.
- Frontend para el vecino:
  - En `/tickets`, la lista "Mis quejas", con la marca "Necesita tu respuesta".
  - La ruta nueva `/tickets/:id`, con los datos, un recuadro con lo que se pidió, el hilo público con la caja de respuesta (SPEC 23) y los adjuntos públicos (SPEC 24).
- Los demás roles siguen viendo el placeholder de `/tickets`.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Responder por correo (correo entrante).
- Avisos al vecino cuando se le pide información o hay un comentario nuevo (RF-31).
- Línea de tiempo de estados, asignaciones y comentarios (RF-25).
- Filtros por estado en "Mis quejas" (RF-36).
- Lista y detalle para los roles internos en `/tickets`, que usan `/triage`, `/asignacion` y `/atencion`.
- Adjuntar archivos al responder (SPEC 24 limita al vecino al registro).
- Confirmar o reabrir una queja resuelta (RF-24).
- Calificar la atención (RF-37).
- Mostrar los datos adicionales de la categoría.

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones. Lee `tickets`, `ticket_historial`, `categorias`, `zonas` y `dependencias`.

### Cambios en el documento de definición

En la sección 6 se aclara que `GET /api/v1/tickets` y `GET /api/v1/tickets/:id` tienen una primera versión sin filtros ni línea de tiempo, que se completa con RF-36 y RF-25.

### `GET /api/v1/tickets`

Protegido por `autenticar` y `requierePermiso('tickets.ver')`, con el filtro de `tickets.ver` (SPEC 11). El vecino ve solo sus quejas, y los internos su alcance.

- Query: `pagina` (≥ 1, por defecto 1) y `tamano` (1–50, por defecto 20).
- Orden: primero las quejas en `en_espera`, luego `creado_en DESC` e `id DESC`.
- Respuesta `200`: `{ datos: TicketListado[], pagina, tamano, total }`.

```ts
export interface TicketListado {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  creadoEn: string;       // ISO 8601 en UTC
  esperaRespuesta: boolean;  // estado === 'en_espera'
}
```

Lo implementa un método nuevo, `listarConTitulo`, en `TicketLecturaRepository` (SPEC 11), que agrega `titulo` y el orden de esta spec sobre el mismo filtro. El `listar` original no cambia.

### `GET /api/v1/tickets/:id`

Protegido por `autenticar` y `requierePermiso('tickets.ver')`. Usa `ConsultaTicketsService.obtenerParaAccion(usuario, 'tickets.ver', id)` (SPEC 11): un ticket inexistente o fuera de alcance responde `404 NO_ENCONTRADO`.

```ts
export interface TicketDetalle {
  id: number;
  numero: string;
  estado: EstadoTicket;
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  dependencia: { id: number; nombre: string } | null;
  creadoEn: string;
  resueltoEn: string | null;
  cerradoEn: string | null;
  informacionSolicitada: string | null;   // motivo de la última transición a en_espera, solo si estado === 'en_espera'
  esSolicitante: boolean;                 // el usuario autenticado es el solicitante
}
```

- `informacionSolicitada` sale de la última fila de `ticket_historial` con `estado_nuevo = 'en_espera'`. Es la misma fuente que `motivoEspera` de SPEC 22.
- **No** incluye datos del solicitante (correo, teléfono ni DPI), la prioridad, el técnico, los datos adicionales, las coordenadas ni las notas internas.
- Los comentarios y los adjuntos se piden aparte, a `GET /tickets/:id/comentarios` (SPEC 23) y `GET /tickets/:id/adjuntos` (SPEC 24). Esos endpoints ya filtran lo interno.

Responder es `POST /api/v1/tickets/:id/comentarios` de SPEC 23 con `interno: false`. Si la queja está en `en_espera` y quien escribe es el solicitante, la queja pasa a `en_proceso`. Esta spec no agrega lógica de backend para responder.

### Frontend

| Elemento | Detalle |
| --- | --- |
| `/tickets` (vecino) | `TicketsPage` muestra `MisQuejas` si `session.rol === 'vecino'`, y el placeholder de SPEC 06 para los demás. Tarjetas con el número, el título, el estado (etiqueta traducida y color, con el texto siempre visible), la fecha en `America/Guatemala` y, si está en espera, la marca "Necesita tu respuesta". Paginación. Sin quejas, "Todavía no registraste quejas" con un botón a `/tickets/nueva` |
| `/tickets/:id` | Ruta nueva protegida, con los mismos roles que `/tickets` y `enMenu: false`. `DetalleQueja` muestra el encabezado (número, estado y título), la descripción, la categoría, la zona y la dirección, la dependencia si ya tiene, y las fechas |
| Si está en espera | Un recuadro destacado `role="status"`: "La municipalidad necesita: <informacionSolicitada>", con el botón "Responder", que lleva el foco a la caja |
| Hilo | `HiloComentarios` de SPEC 23, en modo vecino: sin selector de nota interna y con la caja visible si la queja no es final. Al enviar en espera, aparece el aviso "Gracias, enviamos tu respuesta" y se recargan el detalle y la lista |
| Adjuntos | La lista de `AdjuntosTicket` de SPEC 24 en modo solo lectura, con descarga y vista de imágenes. Sin subir ni borrar, porque el vecino ya no está en el registro |
| Volver | Un enlace "Mis quejas" a `/tickets` |
| Para internos | `/tickets/:id` abre el mismo detalle (es útil desde enlaces), con el hilo y los adjuntos en su modo normal. La versión completa llega con RF-25 |
| Textos | `locales/es/tickets.json`. Las etiquetas de los 8 estados para el vecino van en el namespace `tickets` |

`ExitoRegistro` (SPEC 18) ya tiene "Ver mis quejas" hacia `/tickets`. Esta spec no lo cambia.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: aclaración de las primeras versiones
CLAUDE.md
backend/
  src/
    app.ts
    domain/repositories/ticket-lectura-repository.ts    # + listarConTitulo, obtenerDetalle
    application/services/consulta-tickets.service.ts    # + listarParaUsuario, detalle
    infrastructure/repositories/knex-ticket-lectura-repository.ts
    presentation/
      validators/tickets.validators.ts                  # query de listado
      controllers/tickets.controller.ts                 # GET listado y detalle
      routes/tickets.routes.ts
  tests/
    unit/autorizacion/consulta-tickets.service.test.ts  # detalle e informacionSolicitada
    db/tickets-lectura.api.test.ts                      # Supertest contra Postgres real
frontend/
  src/
    shared/auth/rutas.ts                                # /tickets/:id (enMenu false)
    app/router.tsx
    features/tickets/api/tickets-api.ts                 # listar, detalle
    features/tickets/pages/TicketsPage.tsx              # MisQuejas para el vecino
    features/tickets/pages/DetalleTicketPage.tsx
    features/tickets/mis-quejas/MisQuejas.tsx
    features/tickets/mis-quejas/DetalleQueja.tsx
    features/tickets/comentarios/HiloComentarios.tsx    # modo vecino
    features/tickets/adjuntos/AdjuntosTicket.tsx        # modo solo lectura
    locales/es/tickets.json
  tests/
    features/tickets/mis-quejas.test.tsx
    features/tickets/detalle-queja.test.tsx
    app/router.test.tsx                                 # /tickets/:id
  e2e/respuesta-vecino.spec.ts                          # 360 px, API simulada
```

## Plan de implementación

1. Agregar al documento de definición la aclaración de las primeras versiones de `GET /tickets` y `GET /tickets/:id`. Verificación: revisión del diff.
2. Agregar `listarConTitulo` y `obtenerDetalle` al repositorio de lectura de SPEC 11 (con el filtro en el mismo `WHERE`) y a `ConsultaTicketsService`. Ampliar `consulta-tickets.service.test.ts`:
   - `informacionSolicitada` es el motivo del último paso a `en_espera`, y es `null` en cualquier otro estado.
   - `esSolicitante` es correcto.
   - Fuera de alcance → `NO_ENCONTRADO`.

   Verificación: `npm test` pasa.
3. Crear el validador, el controlador y las rutas de `GET /tickets` y `GET /tickets/:id`. Crear `tests/db/tickets-lectura.api.test.ts`. Casos:
   - El vecino lista solo sus quejas, con las que están en espera primero, y el `total` es correcto.
   - El vecino abre una queja ajena → `404`.
   - Con dos pasos a `en_espera`, el detalle de una queja en espera trae el motivo del último.
   - El detalle no incluye correo, teléfono, DPI, prioridad, técnico ni coordenadas.
   - Un técnico ve solo sus asignadas en el listado.
   - El administrador ve todas.
   - Sin token → `401`.
   - Responder con `POST /comentarios` (SPEC 23) y luego pedir el detalle devuelve `estado: 'en_proceso'` e `informacionSolicitada: null`.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
4. Frontend: crear `tickets-api.ts` y `MisQuejas.tsx`, y mostrarla en `TicketsPage` solo para el vecino. Crear `mis-quejas.test.tsx`:
   - Lista con la marca "Necesita tu respuesta".
   - El estado se muestra con su texto.
   - El mensaje vacío lleva a `/tickets/nueva`.
   - Los demás roles ven el placeholder.

   Verificación: `npm test` pasa en `frontend/`.
5. Agregar `/tickets/:id` a `rutas.ts` y `router.tsx`, y crear `DetalleTicketPage.tsx` y `DetalleQueja.tsx`, con los modos vecino del hilo y solo lectura de los adjuntos. Crear `detalle-queja.test.tsx`:
   - En espera se ve el recuadro, y "Responder" lleva el foco a la caja.
   - El hilo no ofrece nota interna al vecino.
   - Enviar la respuesta muestra el aviso y recarga el detalle.
   - En una queja final no hay caja.
   - Los adjuntos no ofrecen subir ni borrar.
   - Un `404` muestra "No encontramos esta queja".

   Ampliar `router.test.tsx`. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
6. Crear `e2e/respuesta-vecino.spec.ts` a 360×740, con la API simulada: el vecino abre `/tickets`, entra a la queja en espera, lee el pedido, responde, y la queja aparece en proceso, sin scroll horizontal. Verificación: `npm run test:e2e` pasa.
7. Actualizar `CLAUDE.md`: el vecino responde desde `/tickets/:id` con un comentario (SPEC 23); `GET /tickets` y `GET /tickets/:id` son primeras versiones que completarán RF-36 y RF-25; y el detalle nunca expone datos del solicitante. Verificación manual con el backend y `seed:dev`:
   - `tecnico@vozmuni.test` pone una queja en espera con "Envíe el número de contador".
   - `vecino@vozmuni.test` la ve marcada en `/tickets`, abre el detalle, lee el pedido, responde, y la queja queda en proceso.
   - El técnico la ve en `/atencion` con la respuesta en el hilo.

## Criterios de aceptación

- [ ] `GET /api/v1/tickets` devuelve las quejas dentro del alcance de `tickets.ver`, paginadas con `total`, con las que están en espera primero y luego las más recientes, cada una con `numero`, `titulo`, `estado`, `creadoEn` y `esperaRespuesta`.
- [ ] El vecino solo ve sus quejas en el listado, y `GET /api/v1/tickets/:id` de una queja ajena responde `404`.
- [ ] `GET /api/v1/tickets/:id` devuelve los datos básicos de la queja, `esSolicitante`, e `informacionSolicitada` con el motivo del último paso a `en_espera`, solo si está en espera.
- [ ] El detalle no expone correo, teléfono ni DPI del solicitante, ni prioridad, técnico, coordenadas o datos adicionales.
- [ ] En `/tickets`, el vecino ve "Mis quejas", con la marca "Necesita tu respuesta" en las que están en espera, y un mensaje con un acceso a `/tickets/nueva` si no tiene ninguna. Los demás roles siguen viendo el placeholder.
- [ ] `/tickets/:id` muestra la queja. Si está en espera, muestra un recuadro con lo que la municipalidad necesita y un botón que lleva a la caja de respuesta.
- [ ] El vecino responde desde `/tickets/:id`. Si la queja estaba en espera, después de enviar, el detalle y la lista muestran la queja en proceso, sin la marca.
- [ ] El hilo del vecino muestra solo los comentarios públicos y no ofrece nota interna. En quejas finales no hay caja de respuesta.
- [ ] Los adjuntos públicos se pueden descargar desde el detalle, sin opción de subir ni borrar.
- [ ] A 360 px de ancho, `/tickets` y `/tickets/:id` no producen scroll horizontal, los estados se distinguen por su texto y no solo por el color, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] `CLAUDE.md` documenta cómo responde el vecino y que el listado y el detalle son primeras versiones.

## Decisiones

- **Sí:** la pantalla del vecino para responder desde el portal. Completa RF-22 del lado del portal, sobre la lógica de SPEC 23.
- **No:** descartarla hasta RF-25 y RF-36, ni implementar la respuesta por correo entrante.
- **Sí:** primeras versiones de `GET /tickets/:id` y `GET /tickets`, los endpoints del documento, que RF-25 y RF-36 ampliarán en lugar de crear otros.
- **No:** un endpoint propio `/mis-quejas`.
- **Sí:** la lista mínima "Mis quejas" en `/tickets` para el vecino, con las que esperan respuesta primero, para que encuentre sin esfuerzo lo que tiene que contestar.
- **No:** llegar solo por un enlace directo.
- **Sí:** el detalle muestra el hilo público con la caja de respuesta y los adjuntos públicos, más un recuadro destacado con lo que se le pidió.
- **No:** solo el hilo.
- **Sí:** el vecino puede comentar en cualquier estado no final, como define SPEC 23, y el recuadro y el botón "Responder" aparecen solo en espera. No se preguntó explícitamente: es la regla existente de SPEC 23.
- **Sí:** el detalle omite los datos del solicitante, la prioridad, el técnico y las coordenadas. Basta para el vecino, y protege los datos personales (RNF-12) si un interno abre el mismo endpoint. RF-25 decidirá qué más ve cada rol.
- **Sí:** los roles internos siguen viendo el placeholder en `/tickets`, porque su trabajo está en `/triage`, `/asignacion` y `/atencion`. `/tickets/:id` funciona para ellos con el mismo detalle.
- **Sí:** `informacionSolicitada` sale del historial, sin columnas nuevas. Es la misma fuente que usa SPEC 22.
- **Sí:** el orden de la lista, los textos de las marcas y el mensaje vacío los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin aviso por correo (RF-31), el vecino solo se entera del pedido si entra al portal | La marca "Necesita tu respuesta" lo muestra en cuanto entra. RF-31 debe agregar el correo `informacion_solicitada` antes de publicar el portal. |
| RF-22 menciona la respuesta "desde el correo", que queda sin cubrir | Está registrado. Requiere recibir correos, con sus propios riesgos de suplantación, y va en su propia spec si la municipalidad la necesita. |
| `GET /tickets/:id` crece en RF-25 y puede romper esta pantalla | RF-25 debe agregar campos sin quitar ni renombrar los de `TicketDetalle`. |
| El orden "en espera primero" puede ocultar quejas nuevas en una lista larga | Con 20 por página y el orden por fecha dentro de cada grupo, el impacto es bajo. Los filtros llegan con RF-36. |
| Depende de 6 specs en Borrador | Se implementa después de SPEC 24. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Respuesta por correo y avisos al vecino.
- Línea de tiempo y filtros.
- Lista y detalle completos para los internos.
- Adjuntar al responder.
- Confirmar, reabrir y calificar.
- Datos adicionales en el detalle.

Cada uno de estos temas, cuando llegue, va en su propia spec.
