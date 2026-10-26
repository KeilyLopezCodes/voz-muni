# SPEC 38 — Panel del vecino con sus quejas filtradas por estado

> **Estado:** Aprobado
> **Depende de:** SPEC 11, SPEC 25, SPEC 27
> **Fecha:** 2026-10-23
> **Objetivo:** Ampliar "Mis quejas" (`/tickets`) con filtros por grupos de estado pensados para el vecino, con contadores, búsqueda por número o título, la marca "Confirma la solución" y el filtro en la URL, sobre `GET /api/v1/tickets` con `estado` y `q`, y el nuevo `GET /api/v1/tickets/resumen`.

## Por qué existe esta spec

RF-36 pide que el vecino vea en su panel todas sus quejas, filtradas por estado. SPEC 25 creó "Mis quejas" en `/tickets` con un listado paginado sin filtros, y dejó explícitamente para RF-36 los filtros por estado. SPEC 27 dejó fuera la marca en la tarjeta de las quejas resueltas pendientes de confirmar.
Esta spec completa el panel del vecino. El listado general con filtros para los internos queda para otra spec, pero el backend se diseña con parámetros genéricos para reutilizarlo.

## Alcance

**Incluido:**

- **Cambio sobre SPEC 25:** `GET /api/v1/tickets` acepta `estado` (repetible) y `q`. El orden pone primero lo que requiere acción, y cada elemento agrega `confirmacionVenceEn`.
- `GET /api/v1/tickets/resumen`: la cantidad de quejas por estado dentro del alcance de `tickets.ver`, con el mismo `q`.
- Frontend de "Mis quejas":
  - 5 grupos: Todas, Necesitan tu respuesta, En curso, Por confirmar y Finalizadas, con su contador.
  - La búsqueda.
  - La marca "Confirma la solución antes del <fecha>".
  - El grupo, la búsqueda y la página en la URL (`?grupo=&q=&pagina=`).
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- El listado general de `/tickets` para los internos, con filtros por dependencia, categoría, prioridad o fechas. Los internos siguen viendo el placeholder de SPEC 25 y usan sus bandejas.
- Una búsqueda de texto completo en la descripción, o un índice de trigramas. Basta con `ILIKE` mientras el listado sea del vecino.
- Cambiar el orden a pedido del usuario.
- Exportar el listado (RF-40).
- Un indicador de comentarios nuevos sin leer en la tarjeta.

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones.

### `GET /api/v1/tickets` (cambio sobre SPEC 25)

Protección igual a SPEC 25: `autenticar`, `requierePermiso('tickets.ver')` y el filtro de alcance de SPEC 11.

Query nueva (Zod):

| Parámetro | Regla |
| --- | --- |
| `estado` | Opcional y repetible (`?estado=nueva&estado=en_revision`). Cada valor es uno de los 8 estados (SPEC 04), sin repetidos y como máximo 8. Sin `estado`, no se filtra |
| `q` | Opcional, de 2 a 100 caracteres después de recortar. Si tiene el formato `Q-AAAA-NNNNNN` (sin distinguir mayúsculas), busca ese número exacto. Si no, busca `titulo ILIKE '%q%'` o `numero ILIKE '%q%'`, escapando `%`, `_` y `\` |
| `pagina`, `tamano` | Sin cambios (SPEC 25) |

Un valor inválido responde `400 VALIDACION`.

El orden reemplaza el de SPEC 25 ("en espera primero"), que queda contenido en el nuevo:

1. `en_espera`.
2. `resuelta` con `confirmacion_vence_en >= ahora` (plazo vigente, SPEC 27).
3. El resto.

Dentro de cada grupo se ordena por `creado_en DESC, id DESC`.

`TicketListado` (SPEC 25) agrega un campo:

```ts
export interface TicketListado {
  // … campos de SPEC 25
  confirmacionVenceEn: string | null;   // ISO 8601 en UTC; solo si estado === 'resuelta'
}
```

### `GET /api/v1/tickets/resumen`

Mismas protecciones y mismo filtro de alcance que el listado. Acepta `q` con las mismas reglas, y no acepta `estado`.

```ts
export interface ResumenTickets {
  porEstado: Record<EstadoTicket, number>;   // los 8 estados, con 0 si no hay
  total: number;
}
```

- Se registra antes de `GET /tickets/:id` en el enrutador, para que `resumen` no se interprete como un id.
- Lo implementan un método `contarPorEstado` en `TicketLecturaRepository` (SPEC 11 y 25) y `ConsultaTicketsService`, con el mismo filtro de alcance que `listarConTitulo`. Así un rol nunca cuenta quejas que no puede ver.

### Grupos del vecino (`frontend/src/features/tickets/mis-quejas/grupos.ts`)

```ts
export const GRUPOS_VECINO = {
  todas:        [],                                                 // sin filtro
  respuesta:    ['en_espera'],
  en_curso:     ['nueva', 'en_revision', 'asignada', 'en_proceso'],
  por_confirmar:['resuelta'],
  finalizadas:  ['cerrada', 'rechazada'],
} as const satisfies Record<string, readonly EstadoTicket[]>;

export type GrupoVecino = keyof typeof GRUPOS_VECINO;
```

- Los grupos solo existen en el frontend. El backend recibe los estados del grupo como `estado`.
- El contador de cada grupo es la suma de `porEstado` de sus estados, y el de `todas` es `total`.
- Un grupo desconocido en la URL se trata como `todas`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Filtros | Encima de la lista de `MisQuejas` (SPEC 25): 5 chips seleccionables con la etiqueta y el contador ("Necesitan tu respuesta (2)"). El seleccionado se marca con `aria-pressed` y con estilo, no solo con color. En celular, los chips se desplazan horizontalmente dentro de su contenedor, sin desbordar la página |
| Búsqueda | Un campo "Buscar por número o título" con 300 ms de espera antes de consultar, y un botón para limpiarlo. Con menos de 2 caracteres no se envía `q` |
| URL | `?grupo=&q=&pagina=`. Cambiar el grupo o la búsqueda vuelve a `pagina=1`. Atrás y Adelante restauran el filtro. Los valores por defecto (`todas`, sin `q`, página 1) no se escriben en la URL |
| Inicio | Sin `grupo` en la URL, se muestra "Todas" |
| Marcas | "Necesita tu respuesta" (SPEC 25). En `resuelta` con `confirmacionVenceEn` en el futuro: "Confirma la solución antes del <fecha>", en `America/Guatemala`. Si el plazo venció: sin marca. Las dos marcas llevan texto e ícono |
| Vacíos | Sin quejas: "Todavía no registraste quejas", con el botón a `/tickets/nueva` (SPEC 25). En un grupo vacío: "No tienes quejas en este grupo". Con una búsqueda sin resultados: "No encontramos quejas con «<q>»" y "Limpiar búsqueda" |
| Datos | TanStack Query: `['tickets', 'lista', { estados, q, pagina }]` y `['tickets', 'resumen', { q }]`. Las mutaciones que ya invalidan `['tickets', 'lista']` (SPEC 25 y 27) también invalidan el resumen |
| Textos | `locales/es/tickets.json`, bajo `misQuejas.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: parámetros de GET /tickets y GET /tickets/resumen
CLAUDE.md
backend/
  src/
    domain/repositories/ticket-lectura-repository.ts      # filtros de listarConTitulo, contarPorEstado
    application/services/consulta-tickets.service.ts      # listar con filtros, resumen
    infrastructure/repositories/knex-ticket-lectura-repository.ts
    presentation/
      validators/tickets.validators.ts                    # estado, q
      controllers/tickets.controller.ts                   # resumen
      routes/tickets.routes.ts                            # /tickets/resumen antes de /tickets/:id
  tests/
    unit/autorizacion/consulta-tickets.service.test.ts
    db/tickets-lectura.api.test.ts
frontend/
  src/
    features/tickets/api/tickets-api.ts                   # estados, q, resumen
    features/tickets/mis-quejas/grupos.ts
    features/tickets/mis-quejas/FiltrosMisQuejas.tsx
    features/tickets/mis-quejas/MisQuejas.tsx
    locales/es/tickets.json
  tests/
    features/tickets/grupos.test.ts
    features/tickets/mis-quejas.test.tsx
```

## Plan de implementación

1. Ampliar el validador de `GET /tickets` con `estado` y `q`, y `listarConTitulo` con los filtros y el orden nuevo. Agregar `confirmacionVenceEn` a `TicketListado`. Ampliar `tests/db/tickets-lectura.api.test.ts`. Casos:
   - `estado=en_espera` devuelve solo las de ese estado. Dos estados devuelven las dos.
   - Un estado inválido, uno repetido o un `q` de 1 carácter → `400`.
   - `q=q-2026-000001` encuentra ese número exacto.
   - `q=bache` encuentra por título sin distinguir mayúsculas.
   - `q=50%` no se interpreta como comodín.
   - El orden es: en espera, después las resueltas con plazo vigente, después el resto por fecha. Una resuelta con el plazo vencido cae en el tercer grupo.
   - El vecino nunca ve quejas de otro vecino, aunque busque su número.
   - `confirmacionVenceEn` solo viene en `resuelta`.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan, y las pruebas existentes de SPEC 25 siguen pasando.
2. Crear `contarPorEstado`, el método de `ConsultaTicketsService` y la ruta `GET /tickets/resumen`, registrada antes de `/tickets/:id`. Ampliar las pruebas. Casos:
   - El vecino recibe los 8 estados, con 0 donde no tiene, y `total`.
   - Con `q`, cuenta solo las coincidencias.
   - Un técnico cuenta solo sus asignadas (alcance de SPEC 11).
   - Sin sesión → `401`.
   - `GET /tickets/resumen` no responde como si fuera un id.

   Verificación: `npm run test:db` y `npm test` pasan.
3. Frontend: crear `grupos.ts` y `grupos.test.ts`. Casos:
   - Cada grupo convierte a sus estados.
   - Los contadores suman bien desde `porEstado`.
   - Un grupo desconocido es `todas`.

   Ampliar `tickets-api.ts` con `estados`, `q` y `resumen`. Verificación: `npm test` pasa en `frontend/`.
4. Crear `FiltrosMisQuejas.tsx` y conectarlo a `MisQuejas.tsx`, con la URL, la búsqueda con espera, las marcas y los vacíos. Ampliar `mis-quejas.test.tsx`. Casos:
   - Los chips muestran los contadores, y elegir uno cambia la consulta y escribe `?grupo=`.
   - Atrás restaura el grupo anterior.
   - La búsqueda espera 300 ms y vuelve a la página 1.
   - Menos de 2 caracteres no envían `q`.
   - "Confirma la solución antes del…" aparece solo con el plazo vigente, en hora de Guatemala.
   - Se muestran los 3 mensajes de vacío.
   - El chip seleccionado tiene `aria-pressed="true"`.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
5. Actualizar la sección 6 del documento de definición (los parámetros `estado` y `q` de `GET /api/v1/tickets` y `GET /api/v1/tickets/resumen`) y `CLAUDE.md`:
   - Los grupos del vecino viven en el frontend y el backend filtra por estados genéricos.
   - El orden de acción pendiente.
   - Que el resumen respeta el alcance.

   Verificación manual con el backend y `seed:dev`: `vecino@vozmuni.test` tiene una queja en espera, una resuelta y una cerrada. En `/tickets` ve "Todas (3)", con la de espera primero y la resuelta con "Confirma la solución antes del…". Elige "Finalizadas (1)", y la URL cambia a `?grupo=finalizadas`. Recarga y el filtro se mantiene. Busca por el número de la resuelta y solo aparece esa. A 360 px no hay scroll horizontal.

## Criterios de aceptación

- [ ] `GET /api/v1/tickets` filtra por uno o varios `estado` y por `q` (número exacto, o título o número que contiene el texto, con los comodines escapados), siempre dentro del alcance de `tickets.ver`.
- [ ] Los parámetros inválidos (un estado desconocido o repetido, o un `q` fuera de 2 a 100 caracteres) responden `400 VALIDACION`.
- [ ] El orden del listado es: `en_espera`, después `resuelta` con el plazo vigente, después el resto, y dentro de cada grupo por `creado_en DESC, id DESC`.
- [ ] Cada elemento del listado incluye `confirmacionVenceEn` cuando la queja está en `resuelta`.
- [ ] `GET /api/v1/tickets/resumen` devuelve la cantidad de quejas por cada uno de los 8 estados y el `total`, dentro del alcance del usuario y con el mismo `q`.
- [ ] "Mis quejas" muestra los 5 grupos (Todas, Necesitan tu respuesta, En curso, Por confirmar y Finalizadas) con su contador, y elegir uno filtra el listado.
- [ ] La búsqueda filtra por número o título con 300 ms de espera, y los mensajes de vacío distinguen entre no tener quejas, un grupo vacío y una búsqueda sin resultados.
- [ ] El grupo, la búsqueda y la página se reflejan en la URL, se restauran al recargar y con Atrás, y vuelven a la página 1 al cambiar el filtro.
- [ ] Las quejas resueltas con el plazo vigente muestran "Confirma la solución antes del <fecha>" en `America/Guatemala`, con texto e ícono.
- [ ] Ningún archivo del backend conoce los grupos del vecino ni compara nombres de rol.
- [ ] A 360 px de ancho, los filtros y la lista no producen scroll horizontal en la página, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan los parámetros, el resumen, el orden y los grupos.

## Decisiones

- **Sí:** esta spec cubre solo el panel del vecino. El listado general de los internos con filtros va en su propia spec.
- **Sí:** el backend recibe estados genéricos (`estado` repetible) y un `q`. Los grupos del vecino viven en el frontend, y el futuro listado interno reutilizará los mismos parámetros.
- **No:** un parámetro `grupo` en el backend.
- **Sí:** 5 grupos pensados para el vecino, en lugar de los 8 estados técnicos. Cumplen "filtradas por estado" con un lenguaje que el vecino entiende.
- **Sí:** contadores por grupo, a partir de `GET /tickets/resumen`, que respeta el alcance y la búsqueda.
- **Sí:** la búsqueda por número exacto, o por título o número que contiene el texto, con `ILIKE` y los comodines escapados. Alcanza para las quejas de un vecino.
- **No:** búsqueda de texto completo ni índices de trigramas por ahora.
- **Sí:** la marca "Confirma la solución antes del <fecha>", pendiente de SPEC 27.
- **Sí:** el filtro en la URL, sin escribir los valores por defecto.
- **Sí:** el orden pone primero lo que requiere acción (en espera, y después resueltas con plazo vigente), y reemplaza el de SPEC 25 manteniendo su intención.
- **Sí:** se entra en "Todas". Con el orden de acción pendiente, lo urgente ya queda arriba.
- **No:** abrir en "Necesitan tu respuesta" cuando hay alguna.
- **Sí:** los textos, la espera de 300 ms y el largo de `q` (2 a 100) los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Cambiar el orden de `GET /tickets` rompe pruebas de SPEC 25 que esperaban "en espera primero" | El orden nuevo mantiene en espera primero. El paso 1 vuelve a ejecutar las pruebas de SPEC 25. |
| `ILIKE '%q%'` es lento cuando el listado se use para los internos con miles de quejas | Para el vecino no importa. La spec del listado interno debe evaluar un índice de trigramas. |
| El resumen y el listado pueden desincronizarse si llega una queja entre las dos consultas | Es un desfase momentáneo. Las dos se invalidan juntas después de cada mutación. |
| Depende de SPEC 25 y 27 (Borrador) | Se implementa después de SPEC 27. Si cambia `TicketListado`, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Listado general de los internos con filtros.
- Búsqueda de texto completo e índices.
- Orden configurable y exportación.
- Indicador de comentarios sin leer.

Cada uno de estos temas, cuando llegue, va en su propia spec.
