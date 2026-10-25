# SPEC 28 — Línea de tiempo de la queja

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 11, SPEC 20, SPEC 21, SPEC 23, SPEC 24, SPEC 25
> **Fecha:** 2026-10-23
> **Objetivo:** Exponer en `GET /api/v1/tickets/:id/linea-tiempo` una lista paginada por cursor, de la más reciente a la más antigua, con los cambios de estado, las asignaciones, las solicitudes de traslado, los comentarios y los adjuntos de una queja, filtrada según quien la ve, y mostrarla como "Historial" en `/tickets/:id`.

## Por qué existe esta spec

RF-25 pide que cada queja muestre una línea de tiempo con todos sus cambios de estado, asignaciones y comentarios.
Los datos ya están definidos en cinco tablas: `ticket_historial` (SPEC 03), `ticket_asignaciones` (SPEC 20), `solicitudes_traslado` (SPEC 21), `comentarios` (SPEC 23) y `adjuntos` (SPEC 24). Cada una de esas specs dejó la unión para RF-25. SPEC 25 también dice que "la versión completa del detalle llega con RF-25".
Esta spec no crea datos nuevos. Une lo que existe y decide qué ve cada quien.

### Conflicto con el documento de definición

La sección 6 dice que `GET /api/v1/tickets/:id` es el "Detalle con línea de tiempo", es decir, embebida. Pero SPEC 23 y SPEC 24 ya separaron los comentarios y los adjuntos en endpoints propios.
Esta spec expone la línea de tiempo en un endpoint propio, `GET /api/v1/tickets/:id/linea-tiempo`, y actualiza la sección 6 para reflejarlo.

## Alcance

**Incluido:**

- Migración `0023_linea_tiempo`: índices `(ticket_id, creado_en)` sobre `solicitudes_traslado` y `adjuntos`.
- `GET /api/v1/tickets/:id/linea-tiempo`, con 8 tipos de evento, de la más reciente a la más antigua, paginada por cursor.
- Dos vistas según el alcance de `tickets.ver`:
  - **Vista pública** (alcance `propia`, el vecino): cambios de estado (con el motivo solo cuando está dirigido al vecino), comentarios públicos y adjuntos públicos. Los actores internos aparecen como "Municipalidad".
  - **Vista interna** (cualquier otro alcance): todos los eventos, con el nombre y el rol de cada actor. Las notas internas y los adjuntos internos solo aparecen con `comentarios.interno`.
- Los eventos de comentario y de adjunto muestran solo quién y cuándo, y enlazan al hilo (SPEC 23) o a la lista de adjuntos (SPEC 24). No copian el texto.
- Frontend: la sección "Historial" en `/tickets/:id` (SPEC 25), con "Ver anteriores".
- Frontend: el enlace "Ver detalle completo" en los paneles de `/triage`, `/asignacion` y `/atencion`.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Un feed unificado que reemplace el hilo de comentarios. El hilo de SPEC 23 sigue siendo donde se leen, escriben y editan los comentarios.
- El botón "Solicitar traslado" en el detalle. Ya existe en `/atencion` (SPEC 22). La nota de SPEC 21 que lo ubicaba en el detalle (RF-25) queda resuelta así.
- La línea de tiempo en la consulta pública (RF-35).
- Los eventos de escalamiento y de alertas de SLA (RF-28, RF-29). `escalado` es una marca sin registro propio.
- La bitácora de auditoría (RF-42).
- Exportar la línea de tiempo.
- La línea de tiempo embebida en los paneles laterales.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0023_linea_tiempo.ts`

```sql
CREATE INDEX solicitudes_traslado_ticket_creado_idx ON solicitudes_traslado (ticket_id, creado_en);
CREATE INDEX adjuntos_ticket_creado_idx ON adjuntos (ticket_id, creado_en);
DROP INDEX adjuntos_ticket_idx;   -- lo reemplaza el anterior, como hizo SPEC 23 con comentarios
```

El `down` vuelve a crear `adjuntos_ticket_idx` y borra los dos índices nuevos. No hay tablas ni columnas nuevas.

### Eventos

| `tipo` | Origen | Instante | Vista pública |
| --- | --- | --- | --- |
| `estado` | una fila de `ticket_historial` | `creado_en` | sí |
| `asignacion` | una fila de `ticket_asignaciones` | `creado_en` | no |
| `traslado_solicitado` | `solicitudes_traslado`, salvo los traslados directos del supervisor | `creado_en` | no |
| `traslado_rechazado` | `solicitudes_traslado` con `estado = 'rechazada'` | `resuelto_en` | no |
| `traslado_retirado` | `solicitudes_traslado` con `estado = 'retirada'` | `resuelto_en` | no |
| `traslado_sin_efecto` | `solicitudes_traslado` con `estado = 'sin_efecto'` | `resuelto_en` | no |
| `comentario` | una fila de `comentarios` | `creado_en` | solo si `interno = false` |
| `adjunto` | una fila de `adjuntos` | `creado_en` | solo si `interno = false` |

- Una solicitud `aprobada` no tiene evento de resolución: la aprobación ya aparece como el cambio de estado a `en_revision`.
- Un traslado directo del supervisor (SPEC 21) crea una solicitud ya `aprobada`, con `solicitado_por = resuelto_por` y `creado_en = resuelto_en`. No genera un evento `traslado_solicitado`, porque el cambio de estado ya lo muestra.
- Un adjunto borrado por su autor (SPEC 24) desaparece de la línea, porque se lee en vivo.

### Motivos visibles para el vecino (`backend/src/domain/linea-tiempo/visibilidad.ts`)

En la vista pública, el motivo de un evento `estado` solo se muestra si la transición está dirigida al vecino. El resto se envía como `null`.

| Transición | Qué es el motivo | Visible para el vecino |
| --- | --- | --- |
| `* → rechazada` | Motivo del rechazo (SPEC 19) | sí |
| `en_proceso → en_espera` | Información solicitada (SPEC 22) | sí |
| `en_proceso → resuelta` | Descripción de la solución (SPEC 22) | sí |
| `resuelta → en_proceso` | Motivo de la reapertura (SPEC 27) | sí |
| Cualquier otra | Nota del triage, motivo de un traslado, motivo de una confirmación hecha por un interno, etc. | no |

```ts
import type { EstadoTicket } from '../ticket/estado-ticket';

// true si el motivo de la transición está dirigido al vecino.
export function motivoEsPublico(anterior: EstadoTicket | null, nuevo: EstadoTicket): boolean;

// La vista pública corresponde al alcance 'propia' de tickets.ver.
export function esVistaPublica(alcanceVer: Alcance): boolean;
```

Las reglas son funciones puras. No mencionan roles: dependen del alcance (SPEC 08) y de los estados (SPEC 04).

### Contrato (`backend/src/domain/repositories/linea-tiempo-repository.ts`)

```ts
export type TipoEvento =
  | 'estado' | 'asignacion'
  | 'traslado_solicitado' | 'traslado_rechazado' | 'traslado_retirado' | 'traslado_sin_efecto'
  | 'comentario' | 'adjunto';

export type ActorEvento =
  | { tipo: 'usuario'; id: number; nombre: string; rol: Rol; esSolicitante: boolean }  // vista interna
  | { tipo: 'tu' }              // vista pública: el propio vecino
  | { tipo: 'municipalidad' }   // vista pública: cualquier otro usuario
  | { tipo: 'sistema' };        // usuario_id NULL (transiciones del sistema), en las dos vistas

export type DetalleEvento =
  | { tipo: 'estado'; estadoAnterior: EstadoTicket | null; estadoNuevo: EstadoTicket; motivo: string | null }
  | { tipo: 'asignacion'; tecnicoAnterior: { id: number; nombre: string } | null; tecnicoNuevo: { id: number; nombre: string }; motivo: string | null }
  | { tipo: 'traslado_solicitado'; solicitudId: number; dependenciaOrigen: string; dependenciaSugerida: string | null; motivo: string }
  | { tipo: 'traslado_rechazado' | 'traslado_retirado' | 'traslado_sin_efecto'; solicitudId: number; motivo: string | null }
  | { tipo: 'comentario'; comentarioId: number; interno: boolean }
  | { tipo: 'adjunto'; adjuntoId: number; nombre: string; interno: boolean };

export interface EventoLineaTiempo {
  id: string;            // `${tipo}:${idDeOrigen}`, único dentro de la queja
  ocurridoEn: string;    // ISO 8601 en UTC
  actor: ActorEvento;
  detalle: DetalleEvento;
}

export interface FiltroLineaTiempo {
  vistaPublica: boolean;
  incluirInternos: boolean;          // comentarios.interno
  usuarioId: number;
  antesDe: { ocurridoEn: Date; id: string } | null;
  limite: number;
}

export interface LineaTiempoRepository {
  listar(ticketId: number, filtro: FiltroLineaTiempo): Promise<EventoLineaTiempo[]>;
}
```

- El actor de `traslado_rechazado` y `traslado_sin_efecto` es `resuelto_por`. El de `traslado_retirado` es quien la retiró (`resuelto_por`). El de `traslado_solicitado` es `solicitado_por`.
- El motivo de `traslado_rechazado` es `motivo_resolucion`. El de `traslado_retirado` y `traslado_sin_efecto` es `null`.
- `KnexLineaTiempoRepository` arma un `UNION ALL` de las cinco fuentes, con los filtros de visibilidad dentro de cada rama, y ordena por `ocurrido_en DESC, id DESC`.

### `GET /api/v1/tickets/:id/linea-tiempo`

Protegido por `autenticar` y `requierePermiso('tickets.ver')`, con el filtro de SPEC 11. Un ticket inexistente o fuera de alcance responde `404 NO_ENCONTRADO`.

- Query:
  - `cursor`: opcional y opaco. Es el `base64url` de `{ ocurridoEn, id }` del último evento de la página anterior. Un cursor mal formado responde `400 VALIDACION`.
  - `tamano`: de 1 a 100, por defecto 50.
- Respuesta `200`: `{ datos: EventoLineaTiempo[], siguienteCursor: string | null }`. `siguienteCursor` es `null` cuando no hay más eventos.
- Orden: `ocurridoEn DESC`, y a igual instante, `id DESC`. Con el cursor, se devuelven los eventos estrictamente anteriores a `(ocurridoEn, id)`, así que la paginación es estable aunque lleguen eventos nuevos.
- No incluye datos de contacto ni el DPI del solicitante (RNF-12), ni el texto de los comentarios.

Lo implementa `LineaTiempoService` (`application/services/linea-tiempo.service.ts`). Este servicio:

1. Obtiene el ticket con `ConsultaTicketsService.obtenerParaAccion(usuario, 'tickets.ver', id)` (SPEC 11).
2. Arma el filtro con `esVistaPublica(alcance)` y con el alcance de `comentarios.interno`.
3. Llama al repositorio con `limite = tamano + 1` para saber si hay otra página.
4. En la vista pública, cambia los motivos con `motivoEsPublico` y los actores por `tu`, `municipalidad` o `sistema`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Sección "Historial" | `features/tickets/linea-tiempo/LineaTiempo.tsx`, en `/tickets/:id` (SPEC 25), después de la solución, del hilo y de los adjuntos. Usa `useInfiniteQuery` con la clave `['tickets', id, 'linea-tiempo']`. Al final, "Ver anteriores" mientras haya `siguienteCursor` |
| Evento | `EventoLineaTiempo.tsx`: un ícono por tipo, la frase traducida, el actor y la fecha en `America/Guatemala`. Si hay motivo, se muestra debajo como texto plano con sus saltos de línea |
| Frases | `estado`: "<actor> cambió el estado a <estado>" ("Se registró la queja" si `estadoAnterior` es `null`). `asignacion`: "<actor> asignó a <técnico>" o "reasignó de <anterior> a <nuevo>". `traslado_solicitado`: "<actor> solicitó trasladar a <sugerida>" o "a otra dependencia". `traslado_rechazado`, `traslado_retirado` y `traslado_sin_efecto`: "Se rechazó el traslado", "Se retiró el traslado" o "El traslado quedó sin efecto". `comentario`: "<actor> comentó" o "agregó una nota interna", con un enlace a `#comentario-<id>`. `adjunto`: "<actor> adjuntó <nombre>", con un enlace a `#adjuntos` |
| Actores | `tu` → "Tú". `municipalidad` → "Municipalidad". `sistema` → "VozMuni". `usuario` → "<nombre> (<rol traducido>)", con "Vecino" si `esSolicitante` |
| Marcas | Las notas internas y los adjuntos internos llevan la etiqueta textual "Interno", no solo un color (WCAG) |
| Estados de carga | Esqueleto mientras carga. Si falla, "No pudimos cargar el historial" con "Reintentar" |
| Anclas | `HiloComentarios` (SPEC 23) pone `id="comentario-<id>"` en cada comentario, y `AdjuntosTicket` (SPEC 24) pone `id="adjuntos"` en su contenedor |
| Actualización | Las mutaciones del detalle (comentar, adjuntar, confirmar y reabrir de SPEC 27) también invalidan `['tickets', id, 'linea-tiempo']` |
| Paneles internos | `PanelTriage`, `PanelAsignacion` y `PanelAtencion` agregan el enlace "Ver detalle completo" a `/tickets/:id` |
| Textos | `locales/es/tickets.json`, bajo `lineaTiempo.*`. Las etiquetas de los estados y de los roles salen de los archivos de traducción (RNF-16) |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: GET /tickets/:id y /linea-tiempo
CLAUDE.md
backend/
  src/
    app.ts
    container.ts
    domain/linea-tiempo/visibilidad.ts
    domain/repositories/linea-tiempo-repository.ts
    application/services/linea-tiempo.service.ts
    infrastructure/
      database/migrations/0023_linea_tiempo.ts
      repositories/knex-linea-tiempo-repository.ts
    presentation/
      validators/linea-tiempo.validators.ts
      controllers/linea-tiempo.controller.ts
      routes/tickets.routes.ts                        # GET /tickets/:id/linea-tiempo
  tests/
    unit/linea-tiempo/visibilidad.test.ts
    unit/linea-tiempo/linea-tiempo.service.test.ts
    db/schema.test.ts                                 # índices de 0023
    db/linea-tiempo.api.test.ts                       # Supertest contra Postgres real
frontend/
  src/
    features/tickets/api/linea-tiempo-api.ts
    features/tickets/linea-tiempo/LineaTiempo.tsx
    features/tickets/linea-tiempo/EventoLineaTiempo.tsx
    features/tickets/mis-quejas/DetalleQueja.tsx       # sección Historial
    features/tickets/comentarios/HiloComentarios.tsx   # ancla por comentario
    features/tickets/adjuntos/AdjuntosTicket.tsx       # ancla #adjuntos
    features/tickets/triage/PanelTriage.tsx            # enlace al detalle
    features/tickets/asignacion/PanelAsignacion.tsx
    features/tickets/atencion/PanelAtencion.tsx
    locales/es/tickets.json
  tests/
    features/tickets/linea-tiempo.test.tsx
    features/tickets/evento-linea-tiempo.test.tsx
```

## Plan de implementación

1. Crear `domain/linea-tiempo/visibilidad.ts` y su prueba:
   - `motivoEsPublico` es `true` para las 4 transiciones de la tabla y `false` para el resto. Por ejemplo, `asignada → en_revision` (traslado), `en_revision → asignada` (nota del triage), `resuelta → cerrada` y la creación.
   - `esVistaPublica` es `true` solo para `propia`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0023_linea_tiempo.ts` y ampliar `tests/db/schema.test.ts`: existen `solicitudes_traslado_ticket_creado_idx` y `adjuntos_ticket_creado_idx`, ya no existe `adjuntos_ticket_idx`, y el `down` los restaura. Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Crear `LineaTiempoRepository` y `KnexLineaTiempoRepository` con el `UNION ALL`, los filtros por rama y el cursor. Probarlo en `tests/db/linea-tiempo.api.test.ts` a nivel de repositorio. Casos:
   - Una queja con historial, 2 asignaciones, una solicitud rechazada, un comentario público, una nota interna y un adjunto público devuelve todos los eventos en orden `ocurridoEn DESC, id DESC`.
   - Una solicitud rechazada produce `traslado_solicitado` y `traslado_rechazado`.
   - Un traslado directo del supervisor no produce `traslado_solicitado`.
   - `incluirInternos = false` omite la nota interna y el adjunto interno.
   - `vistaPublica = true` omite asignaciones y traslados.
   - Con `limite` y `antesDe`, dos páginas seguidas no repiten ni saltan eventos, incluso con dos eventos en el mismo instante.

   Verificación: `npm run test:db` pasa.
4. Crear `LineaTiempoService` y `linea-tiempo.service.test.ts` con un repositorio falso. Casos:
   - En la vista pública, los motivos no públicos llegan como `null`, y los públicos se conservan.
   - En la vista pública, el actor es `tu` si es el vecino, `municipalidad` si es otro usuario y `sistema` si es `null`.
   - En la vista interna, el actor trae nombre, rol y `esSolicitante`.
   - `siguienteCursor` es `null` cuando el repositorio devuelve `tamano` eventos o menos.

   Verificación: `npm test` pasa.
5. Crear el validador, el controlador y la ruta `GET /tickets/:id/linea-tiempo`, y conectarlos en `container.ts` y `app.ts`. Ampliar `tests/db/linea-tiempo.api.test.ts`:
   - El vecino de la queja → `200` con la vista pública: ve el rechazo o la información solicitada con su motivo, no ve el motivo de un traslado, ni asignaciones, ni la nota interna. Los internos aparecen como `municipalidad`.
   - Otro vecino → `404`.
   - El técnico asignado, el coordinador de la dependencia y el supervisor → `200` con la vista interna completa.
   - El técnico de otra queja y el coordinador de otra dependencia → `404`.
   - El administrador → `200` sin notas internas ni adjuntos internos, porque no tiene `comentarios.interno`.
   - `cursor` mal formado o `tamano = 101` → `400 VALIDACION`.
   - Sin sesión → `401`.
   - La respuesta no contiene el texto de los comentarios ni los datos de contacto del solicitante.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Frontend: crear `linea-tiempo-api.ts`, `EventoLineaTiempo.tsx` y `evento-linea-tiempo.test.tsx`. Casos:
   - Cada tipo muestra su frase traducida.
   - Los actores `tu`, `municipalidad`, `sistema` y `usuario` se muestran como se definió.
   - El motivo con `<b>` se muestra como texto.
   - La marca "Interno" es un texto visible.
   - Los enlaces de comentario y adjunto apuntan a las anclas.

   Verificación: `npm test` pasa en `frontend/`.
7. Crear `LineaTiempo.tsx` y agregarlo a `DetalleQueja.tsx`. Agregar las anclas a `HiloComentarios` y `AdjuntosTicket`, y la invalidación en las mutaciones del detalle. Crear `linea-tiempo.test.tsx`. Casos:
   - Muestra la primera página.
   - "Ver anteriores" pide el siguiente cursor y se oculta sin `siguienteCursor`.
   - Muestra el esqueleto y el error con "Reintentar".
   - Comentar desde el detalle invalida la línea de tiempo.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
8. Agregar el enlace "Ver detalle completo" a `PanelTriage`, `PanelAsignacion` y `PanelAtencion`, y ampliar sus pruebas para comprobar que el enlace apunta a `/tickets/:id`. Verificación: `npm test` y `npm run build` pasan.
9. Actualizar la sección 6 del documento de definición:
   - `GET /api/v1/tickets/:id` pasa a decir "Detalle".
   - Se agrega `GET /api/v1/tickets/:id/linea-tiempo` ("Línea de tiempo paginada", según visibilidad).

   Actualizar `CLAUDE.md`:
   - Las 5 fuentes de la línea de tiempo y que no tiene tabla propia.
   - Las dos vistas por alcance y la regla `motivoEsPublico`.
   - Que los eventos de comentario y adjunto no copian el contenido.

   Verificación manual con el backend y `seed:dev`, después del triage, la asignación, la atención con una espera y una nota interna, y la resolución: `coordinador@vozmuni.test` abre `/tickets/:id` y ve todos los eventos con nombres, incluida la nota interna. `vecino@vozmuni.test` abre la misma queja y ve los estados, "Municipalidad" como actor, la información solicitada y la solución, sin asignaciones ni la nota interna.

## Criterios de aceptación

- [ ] La migración `0023_linea_tiempo` crea `solicitudes_traslado_ticket_creado_idx` y `adjuntos_ticket_creado_idx` y quita `adjuntos_ticket_idx`. Su `down` lo revierte.
- [ ] `GET /api/v1/tickets/:id/linea-tiempo` devuelve los eventos `estado`, `asignacion`, `traslado_solicitado`, `traslado_rechazado`, `traslado_retirado`, `traslado_sin_efecto`, `comentario` y `adjunto`, ordenados por `ocurridoEn DESC, id DESC`.
- [ ] La paginación por cursor devuelve 50 eventos por defecto (máximo 100) y `siguienteCursor`. Dos páginas seguidas no repiten ni saltan eventos, aunque lleguen eventos nuevos entre una y otra.
- [ ] Una solicitud aprobada no produce un evento de resolución, y un traslado directo del supervisor no produce `traslado_solicitado`.
- [ ] Con alcance `propia` de `tickets.ver`, la respuesta omite asignaciones, traslados, notas internas y adjuntos internos. Los actores internos aparecen como `municipalidad`, y el motivo de un estado solo aparece en las 4 transiciones dirigidas al vecino.
- [ ] Con cualquier otro alcance, la respuesta incluye todos los eventos con el nombre y el rol del actor. Las notas internas y los adjuntos internos solo aparecen si el usuario tiene `comentarios.interno`.
- [ ] Un ticket fuera de alcance responde `404`, sin sesión responde `401`, y un cursor mal formado o un `tamano` fuera de rango responde `400 VALIDACION`.
- [ ] La respuesta nunca incluye el texto de los comentarios ni el correo, el teléfono o el DPI del solicitante.
- [ ] Ningún archivo nuevo del backend compara el nombre de un rol: la vista depende del alcance de `tickets.ver` y de `comentarios.interno`.
- [ ] En `/tickets/:id`, la sección "Historial" muestra los eventos con frases traducidas, el actor, la fecha en `America/Guatemala` y la marca textual "Interno". "Ver anteriores" carga la página siguiente.
- [ ] Los eventos de comentario y de adjunto enlazan al comentario del hilo y a la lista de adjuntos.
- [ ] Comentar, adjuntar, confirmar o reabrir desde el detalle actualiza la línea de tiempo sin recargar la página.
- [ ] Los paneles de `/triage`, `/asignacion` y `/atencion` muestran "Ver detalle completo", que lleva a `/tickets/:id`.
- [ ] A 360 px de ancho, la sección "Historial" no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición lista `GET /api/v1/tickets/:id/linea-tiempo`, y `CLAUDE.md` documenta las fuentes y las reglas de visibilidad.

## Decisiones

- **Sí:** la línea de tiempo incluye los estados, las asignaciones, las solicitudes de traslado, los comentarios y los adjuntos. Cubre lo que pide RF-25 y lo que SPEC 20, 21, 23 y 24 dejaron para ella.
- **Sí:** el hilo de comentarios sigue aparte. La línea solo muestra "X comentó" con un enlace. No duplica el contenido, que además puede editarse durante 5 minutos (SPEC 23).
- **No:** un feed unificado que reemplace `HiloComentarios`, ni pestañas.
- **Sí:** el vecino ve una vista pública: los estados, con el motivo solo cuando va dirigido a él, y sus comentarios y adjuntos públicos. Los actores internos aparecen como "Municipalidad", coherente con SPEC 25, que no expone el técnico.
- **No:** mostrarle al vecino lo mismo que a los internos, porque expondría notas del triage, motivos de traslado y nombres.
- **Sí:** la lista de motivos públicos es explícita (rechazo, información solicitada, solución, reapertura). Cualquier transición nueva queda oculta para el vecino hasta que se agregue a la lista. Es una propuesta de esta spec, derivada de la vista pública que eligió el usuario.
- **Sí:** un endpoint propio, `/tickets/:id/linea-tiempo`, como `/comentarios` y `/adjuntos`. Se actualiza la sección 6 del documento, que la ponía embebida en el detalle.
- **No:** embeberla en `GET /tickets/:id`. El detalle crecería sin límite y se recargaría entero.
- **Sí:** de la más reciente a la más antigua, con un cursor `(ocurridoEn, id)`. Es estable aunque lleguen eventos nuevos mientras se lee.
- **No:** paginar por página ni devolver todo con un tope.
- **Sí:** sin tabla propia: un `UNION ALL` de las 5 fuentes, leído en vivo. Evita duplicar datos y mantener la sincronización.
- **No:** una tabla `eventos_ticket` escrita por cada caso de uso.
- **Sí:** dos índices nuevos `(ticket_id, creado_en)`, para que cada rama del `UNION` use un índice como ya lo hacen el historial, las asignaciones y los comentarios.
- **Sí:** la sección "Historial" en el detalle, el mismo para todos. Los paneles internos solo agregan un enlace.
- **No:** el componente embebido en los paneles laterales.
- **Sí:** el técnico sigue solicitando traslados desde `/atencion` (SPEC 22). La nota de SPEC 21 que lo ubicaba en el detalle queda resuelta sin un botón nuevo.
- **Sí:** el tamaño de página (50, máximo 100), las frases, los íconos y la ubicación de la sección los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una transición nueva con un motivo interno se filtra al vecino | `motivoEsPublico` es una lista explícita de lo permitido: lo que no está, se oculta. La prueba del paso 1 cubre las transiciones conocidas. |
| Una rama del `UNION ALL` sin filtro de visibilidad expone notas o adjuntos internos | Cada filtro va dentro de su rama. El paso 5 prueba la vista del vecino y la del administrador contra Postgres real. |
| Cursor inestable con eventos de distintas tablas en el mismo instante | El desempate usa `id` con el prefijo del tipo, que es único dentro de la queja. El paso 3 prueba dos eventos en el mismo instante en el borde de la página. |
| Depende de 7 specs, 6 de ellas en Borrador (SPEC 11, 20, 21, 23, 24 y 25), con varias tablas aún no implementadas | Se implementa después de SPEC 25. Si cambian las tablas o los componentes, se revisa esta antes de aprobarla. |
| Una queja con muchos eventos hace lento el `UNION ALL` | Cada rama usa su índice `(ticket_id, creado_en)` y la consulta corta en `limite + 1`. |

## Lo que **no** está en esta spec

- Feed unificado con los comentarios.
- "Solicitar traslado" en el detalle.
- Línea de tiempo en la consulta pública.
- Eventos de escalamiento y de SLA.
- Bitácora de auditoría.
- Exportación y línea de tiempo en los paneles laterales.

Cada uno de estos temas, cuando llegue, va en su propia spec.
