# SPEC 45 — Listado de quejas para los usuarios internos

> **Estado:** Implementado
> **Depende de:** SPEC 11, SPEC 21, SPEC 25, SPEC 30, SPEC 32, SPEC 38, SPEC 43, SPEC 44
> **Fecha:** 2026-10-27
> **Objetivo:** Reemplazar el placeholder de `/tickets` para los roles internos por un listado de consulta de las quejas de su alcance, con filtros por estado, búsqueda, dependencia, categoría, prioridad, rango de fechas de registro y escaladas reflejados en la URL, sobre `GET /api/v1/tickets` ampliado.

## Por qué existe esta spec

RF-36 pide un panel de quejas filtrado por estado. SPEC 38 lo completó para el vecino y dejó el listado de los internos para otra spec, con el backend preparado con parámetros genéricos (`estado` y `q`).
Hoy el receptor, el técnico, el coordinador, el supervisor y el administrador ven en `/tickets` el texto "Esta pantalla estará disponible próximamente". Trabajan en sus bandejas (`/triage`, `/asignacion`, `/atencion`, `/escaladas`), pero no tienen un lugar para buscar cualquier queja de su alcance, por ejemplo una cerrada hace dos semanas o todas las urgentes de una categoría.
Esta spec agrega ese listado. Es de consulta: las acciones siguen en las bandejas y en el detalle `/tickets/:id`.

## Alcance

**Incluido:**

- **Cambio sobre SPEC 25 y 38:** `GET /api/v1/tickets` acepta además `dependenciaId`, `categoriaId`, `prioridad`, `desde`, `hasta` y `escalado`, siempre intersectados con el alcance de `tickets.ver`.
- **Cambio sobre SPEC 25 y 38:** cada elemento del listado agrega el bloque `interno` (prioridad, categoría, dependencia, técnico y `sla`), que es `null` con el alcance `propia` de `tickets.ver`.
- **Cambio sobre SPEC 38:** con un alcance distinto de `propia`, el orden es `creado_en DESC, id DESC`. El orden "acción pendiente primero" de SPEC 38 sigue igual para el alcance `propia`.
- **Cambio sobre SPEC 38:** `GET /api/v1/tickets/resumen` acepta los mismos filtros nuevos, para que los contadores por estado coincidan con el listado.
- **Cambio sobre SPEC 14 y SPEC 21:** `GET /api/v1/categorias` y `GET /api/v1/dependencias` aceptan también a quien tiene `tickets.ver` con un alcance distinto de `propia`, para llenar los selectores de filtro.
- Frontend: `TicketsPage` muestra `ListadoInterno` a todo rol que no tenga el alcance `propia`. Tiene una tabla desde `md` y tarjetas por debajo, filtros reflejados en la URL, paginación y un enlace a `/tickets/:id` por fila.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Exportar el listado a Excel, PDF o CSV (RF-40).
- Acciones en la fila o paneles laterales (tomar, asignar, atender, trasladar). Siguen en `/triage`, `/asignacion`, `/atencion`, `/traslados` y en el detalle.
- Cambiar el orden a pedido del usuario.
- Filtro por zona, por canal o por técnico.
- Búsqueda en la descripción o de texto completo. Se mantiene la de SPEC 38 (número o título).
- Guardar filtros favoritos, o recordarlos en `localStorage`.
- Cambios en "Mis quejas" del vecino (SPEC 25 y 38), que conserva su contrato y su pantalla.

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones.

### `GET /api/v1/tickets` (cambio sobre SPEC 25 y 38)

Protección igual: `autenticar`, `requierePermiso('tickets.ver')` y el filtro de alcance de SPEC 11. Los filtros nuevos se **intersectan** con el alcance y nunca lo amplían: un coordinador que pide otra `dependenciaId` recibe una lista vacía, no un error, igual que en `/reportes` (SPEC 43).

Query nueva (Zod `strict`, además de `pagina`, `tamano`, `estado` y `q` de SPEC 38):

| Parámetro | Regla |
| --- | --- |
| `dependenciaId` | Entero > 0, opcional. Las quejas sin dependencia (`nueva`, `en_revision`) no coinciden |
| `categoriaId` | Entero > 0, opcional |
| `prioridad` | Opcional, uno de `PRIORIDADES` (`domain/ticket/prioridad.ts`). Las quejas sin prioridad no coinciden |
| `desde`, `hasta` | Opcionales, `AAAA-MM-DD`. Si llega al menos uno, el rango se resuelve con `rangoReportes` (`domain/reportes/rango-fechas.ts`, SPEC 43): días completos en `America/Guatemala`, ambos inclusive, `desde ≤ hasta` y como máximo 366 días. Sin ninguno de los dos, el backend no filtra por fecha |
| `escalado` | Opcional, solo el literal `true`. Filtra `tickets.escalado = true` |

Un valor inválido responde `400 VALIDACION`, y un rango inválido `400 RANGO_INVALIDO` (SPEC 43).

`CriteriosListado` (SPEC 38) agrega los campos:

```ts
export interface CriteriosListado {
  estados: readonly EstadoTicket[];
  busqueda: Busqueda | null;
  dependenciaId: number | null;
  categoriaId: number | null;
  prioridad: Prioridad | null;
  registro: { inicio: Date; fin: Date } | null;   // fin exclusivo, de rangoReportes
  soloEscaladas: boolean;
}
```

Orden:

| Alcance de `tickets.ver` | Orden |
| --- | --- |
| `propia` | El de SPEC 38, sin cambios |
| Cualquier otro | `creado_en DESC, id DESC` |

La regla depende del alcance, nunca del nombre del rol. La decide `ConsultaTicketsService`, que pasa al repositorio un `orden: 'accion_pendiente' | 'recientes'`.

`TicketListado` agrega un campo. Lo lee `KnexTicketLecturaRepository.listarConTitulo` con `LEFT JOIN` a `categorias`, `dependencias` y `usuarios` (técnico), y con `COLUMNA_SLA` / `slaDeFila` de SPEC 30:

```ts
export interface InternoListado {
  prioridad: Prioridad | null;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null;
  tecnico: { id: number; nombre: string } | null;
  sla: SlaLectura;               // SPEC 30 y 32: vencimientos, pausa, escalado
}

// En la respuesta de GET /tickets:
interno: InternoListado | null;  // null con el alcance propia de tickets.ver
```

- El listado nunca incluye el correo, el teléfono ni el DPI del solicitante, ni su nombre (RNF-12).
- Para el vecino la respuesta es la misma de SPEC 38, más `interno: null`.

### `GET /api/v1/tickets/resumen` (cambio sobre SPEC 38)

Acepta `q`, `dependenciaId`, `categoriaId`, `prioridad`, `desde`, `hasta` y `escalado`, con las mismas reglas. Sigue sin aceptar `estado`. `contarPorEstado` recibe los mismos `CriteriosListado` sin `estados`.

### Lectura de catálogos (cambio sobre SPEC 14 y SPEC 21)

| Endpoint | Antes | Ahora |
| --- | --- | --- |
| `GET /api/v1/categorias` | `tickets.crear` | `tickets.crear`, o `tickets.ver` con un alcance distinto de `propia` |
| `GET /api/v1/dependencias` | `tickets.trasladar` | `tickets.trasladar`, o `tickets.ver` con un alcance distinto de `propia` |

- La combinación vive en un middleware `requiereAlgunPermiso([{ accion, alcances? }])` (`presentation/middlewares/requiere-permiso.ts`): deja pasar si se cumple al menos uno y si no responde `403 PERMISO_DENEGADO`.
- Las respuestas no cambian: solo categorías y dependencias activas.
- El vecino conserva el acceso a `GET /categorias` por `tickets.crear`, y sigue sin acceso a `GET /dependencias`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Entrada | `TicketsPage` muestra `MisQuejas` (SPEC 25 y 38) al rol `vecino` y `features/tickets/listado/ListadoInterno.tsx` a los demás. Desaparece el placeholder |
| Filtros | `FiltrosListado.tsx`, encima de la lista: búsqueda "Buscar por número o título" (300 ms de espera y mínimo 2 caracteres, como en SPEC 38), selector múltiple de estados con el contador de `/tickets/resumen` junto a cada uno, selectores de dependencia, categoría y prioridad, fechas "Desde" y "Hasta", el interruptor "Solo escaladas" y "Limpiar filtros". En celular los filtros se pliegan en un `Accordion` "Filtros (N activos)" |
| Valores por defecto | Estados: todos menos `cerrada` y `rechazada`. Fechas: los últimos 30 días que terminan hoy, en `America/Guatemala`. Los demás sin valor. Los valores por defecto no se escriben en la URL |
| Opciones | Dependencias de `GET /dependencias`, categorías de `GET /categorias` y prioridades de `tickets:prioridades`. El selector de dependencia se oculta si el alcance de `tickets.ver` es `dependencia`, `asignadas` o `registradas`, como en `/reportes` |
| URL | `?estado=&q=&dependenciaId=&categoriaId=&prioridad=&desde=&hasta=&escalado=&pagina=`. Cambiar cualquier filtro vuelve a `pagina=1`. Atrás y Adelante restauran los filtros. Un valor inválido en la URL se ignora y se usa el valor por defecto. Nada se guarda en `localStorage` ni en `sessionStorage` |
| Tabla (desde `md`) | `TablaQuejas.tsx`: número, título, estado (chip de `mis-quejas/estado-chip.ts`), prioridad, categoría, dependencia ("Sin dependencia"), técnico ("Sin técnico"), registro (fecha en `America/Guatemala`, con la antigüedad de `antiguedad.ts`) y `IndicadorSla` (SPEC 30), que ya muestra la marca "Escalada" (SPEC 32). El número es un enlace a `/tickets/:id` |
| Tarjetas (por debajo de `md`) | `TarjetaQueja.tsx` con los mismos datos apilados y la tarjeta entera como enlace a `/tickets/:id` |
| Paginación | 20 por página, con `Pagination` y el total ("N quejas") |
| Estados de carga | Esqueleto mientras carga. Si falla: "No pudimos cargar las quejas" con "Reintentar". Sin resultados con filtros: "No hay quejas con estos filtros" y "Limpiar filtros". Sin ninguna queja en el alcance: "Todavía no hay quejas" |
| Datos | TanStack Query: `['tickets', 'lista', criterios]` y `['tickets', 'resumen', criterios sin estados]`, el mismo prefijo de SPEC 38. Así las invalidaciones que ya existen también refrescan este listado |
| Accesibilidad | La tabla tiene `caption` (oculto visualmente) y encabezados `th` con `scope="col"`. Los chips de estado y la marca "Escalada" llevan texto, no solo color. El selector de estados anuncia el contador |
| Textos | `locales/es/tickets.json`, bajo `listadoInterno.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: parámetros de GET /tickets y /resumen, permisos de /categorias y /dependencias
CLAUDE.md
backend/
  src/
    domain/repositories/ticket-lectura-repository.ts      # CriteriosListado, InternoListado, orden
    application/services/consulta-tickets.service.ts      # filtros nuevos, orden por alcance, interno null con propia
    infrastructure/repositories/knex-ticket-lectura-repository.ts
    presentation/
      validators/tickets.validators.ts                    # dependenciaId, categoriaId, prioridad, desde, hasta, escalado
      controllers/tickets.controller.ts
      middlewares/requiere-permiso.ts                     # requiereAlgunPermiso
      routes/catalogos.routes.ts                          # GET /categorias
      routes/traslados.routes.ts                          # GET /dependencias
  tests/
    unit/autorizacion/consulta-tickets.service.test.ts
    unit/presentation/requiere-permiso.test.ts
    db/tickets-lectura.api.test.ts
    db/catalogos.api.test.ts                              # o la suite que hoy cubre /categorias y /dependencias
frontend/
  src/
    features/tickets/api/tickets-api.ts                   # criterios nuevos, InternoListado
    features/tickets/listado/criterios-url.ts             # URL ↔ criterios, valores por defecto
    features/tickets/listado/ListadoInterno.tsx
    features/tickets/listado/FiltrosListado.tsx
    features/tickets/listado/TablaQuejas.tsx
    features/tickets/listado/TarjetaQueja.tsx
    features/tickets/pages/TicketsPage.tsx
    locales/es/tickets.json
  tests/
    features/tickets/criterios-url.test.ts
    features/tickets/listado-interno.test.tsx
  e2e/
    listado-interno.spec.ts                               # 360×740, sin scroll horizontal
```

## Plan de implementación

1. Agregar `requiereAlgunPermiso` y usarlo en `GET /categorias` y `GET /dependencias`. Pruebas:
   - Unitarias: pasa con el primer permiso, pasa con el segundo, `403` sin ninguno, y `propia` no cuenta como alcance de `tickets.ver`.
   - `test:db`: el técnico, el receptor y el administrador reciben `200` en los dos endpoints. El vecino recibe `200` en `/categorias` y `403` en `/dependencias`.

   Verificación: `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan en `backend/`.
2. Ampliar el validador de `GET /tickets` y de `/tickets/resumen`, `CriteriosListado` y `listarConTitulo` / `contarPorEstado` con los filtros nuevos. Ampliar `tests/db/tickets-lectura.api.test.ts`. Casos:
   - Cada filtro reduce el resultado, y combinados se intersectan.
   - Un coordinador con la `dependenciaId` de otra dependencia recibe `datos: []` y `total: 0`.
   - Con `desde=2026-10-01&hasta=2026-10-01`, una queja de las 23:30 de ese día en Guatemala entra y una de las 00:10 del día siguiente no.
   - Un rango de 367 días o con `desde > hasta` → `400 RANGO_INVALIDO`. Una `prioridad` desconocida o `escalado=false` → `400 VALIDACION`.
   - `/tickets/resumen` con `categoriaId` cuenta solo esa categoría.

   Verificación: `npm run test:db` pasa, y las pruebas de SPEC 25 y 38 siguen pasando.
3. Agregar `interno` a cada elemento y el orden por alcance en `ConsultaTicketsService`. Pruebas unitarias y de `test:db`:
   - El vecino recibe `interno: null` y el orden de SPEC 38.
   - El supervisor recibe `interno` con prioridad, categoría, dependencia, técnico y `sla`, ordenado por `creado_en DESC`.
   - Una queja en `nueva` tiene `dependencia: null` y `tecnico: null`.
   - Una queja escalada tiene `sla.escalado = true`.
   - La respuesta no contiene el correo, el teléfono, el DPI ni el nombre del solicitante.

   Verificación: `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
4. Frontend: ampliar `tickets-api.ts` y crear `criterios-url.ts` con `criterios-url.test.ts`. Casos:
   - La URL vacía da los valores por defecto (estados activos y los últimos 30 días según una fecha simulada en Guatemala).
   - Los valores por defecto no se escriben en la URL.
   - Un valor inválido (`prioridad=x`, `desde=2026-13-01`, `pagina=0`) se ignora.
   - Cambiar un filtro vuelve a la página 1.
   - `estado` repetido se lee y se escribe en el mismo orden.

   Verificación: `npm test` pasa en `frontend/`.
5. Crear `ListadoInterno`, `FiltrosListado`, `TablaQuejas` y `TarjetaQueja`, y conectarlos en `TicketsPage`. Crear `listado-interno.test.tsx`. Casos:
   - El vecino sigue viendo "Mis quejas", y un supervisor ve el listado y no el placeholder.
   - Los contadores del selector de estados salen de `/tickets/resumen`.
   - Elegir una categoría cambia la consulta y escribe `?categoriaId=` en la URL. Atrás restaura el filtro anterior.
   - El selector de dependencia se oculta para el coordinador.
   - "Solo escaladas" envía `escalado=true`.
   - Cada fila enlaza a `/tickets/:id`, y una queja sin dependencia muestra "Sin dependencia".
   - Se muestran el esqueleto, el error con "Reintentar" y los dos mensajes de vacío.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Crear `e2e/listado-interno.spec.ts` con la API simulada (como las pruebas de SPEC 18): a 360×740 se ven tarjetas, los filtros se pliegan y la página no tiene scroll horizontal. A 1280 px se ve la tabla. Verificación: `npm run test:e2e` pasa.
7. Actualizar la sección 6 del documento de definición: la fila de `GET /api/v1/tickets` con los filtros nuevos y `interno`, `GET /api/v1/tickets/resumen`, y los permisos de `GET /categorias` y `GET /dependencias`. Actualizar `CLAUDE.md`:
   - `/tickets` deja de ser un placeholder para los internos.
   - Los filtros nuevos se intersectan con el alcance.
   - `interno` es `null` con el alcance `propia`.
   - El orden depende del alcance.
   - `requiereAlgunPermiso`.

   Verificación manual con el backend y `seed:dev`, con las quejas de prueba en varios estados:
   - `supervisor@vozmuni.test` abre `/tickets` y ve la tabla con las quejas activos de los últimos 30 días. Filtra por la categoría `Baches` y prioridad `alta`, la URL lo refleja, recarga y el filtro se mantiene. Abre una queja con el enlace y vuelve con Atrás a la misma página filtrada.
   - `coordinador@vozmuni.test` no ve el selector de dependencia y solo ve quejas de `Dirección de Obras`.
   - `administrador@vozmuni.test` ve el listado y las opciones de categoría y dependencia.
   - `vecino@vozmuni.test` sigue viendo "Mis quejas".

## Criterios de aceptación

- [ ] `GET /api/v1/tickets` filtra por `dependenciaId`, `categoriaId`, `prioridad`, `desde`/`hasta` y `escalado=true`, además de `estado` y `q`, y los filtros se intersectan con el alcance de `tickets.ver` sin ampliarlo nunca.
- [ ] El rango de fechas usa días completos en `America/Guatemala`, ambos inclusive, con un máximo de 366 días. Sin `desde` ni `hasta`, el backend no filtra por fecha.
- [ ] Los parámetros inválidos responden `400 VALIDACION`, y los rangos inválidos `400 RANGO_INVALIDO`.
- [ ] Con un alcance distinto de `propia`, cada elemento trae `interno` (prioridad, categoría, dependencia, técnico y `sla`) y el listado se ordena por `creado_en DESC, id DESC`. Con `propia`, `interno` es `null` y el orden es el de SPEC 38.
- [ ] Ninguna respuesta del listado incluye el nombre, el correo, el teléfono ni el DPI del solicitante.
- [ ] `GET /api/v1/tickets/resumen` acepta los mismos filtros (salvo `estado`) y sus contadores coinciden con el listado.
- [ ] `GET /api/v1/categorias` y `GET /api/v1/dependencias` responden `200` al receptor, al técnico, al coordinador, al supervisor y al administrador. El vecino conserva `/categorias` y sigue recibiendo `403` en `/dependencias`.
- [ ] En `/tickets`, los internos ven el listado con tabla desde `md` y tarjetas por debajo, y el vecino sigue viendo "Mis quejas".
- [ ] Los filtros arrancan con los estados activos y los últimos 30 días, se reflejan en la URL, se restauran al recargar y con Atrás, y vuelven a la página 1 al cambiar.
- [ ] El selector de dependencia solo aparece con el alcance `todas` de `tickets.ver`.
- [ ] Cada queja enlaza a `/tickets/:id` y muestra `IndicadorSla` con la marca "Escalada" cuando corresponde.
- [ ] Ningún archivo nuevo o modificado compara nombres de rol en el backend, ni guarda filtros en `localStorage` o `sessionStorage`.
- [ ] A 360 px de ancho, el listado no produce scroll horizontal en la página, y ningún texto ni color está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan los filtros, el bloque `interno`, el orden por alcance y los permisos de lectura de los catálogos.

## Decisiones

- **Sí:** la pantalla es el listado de `/tickets` para los internos. El vecino conserva "Mis quejas", y el detalle no cambia.
- **Sí:** se amplía `GET /api/v1/tickets`, como preparó SPEC 38 con parámetros genéricos.
- **No:** un endpoint `GET /tickets/internas`, que duplicaría el filtro de alcance, la búsqueda y la paginación.
- **Sí:** los datos internos van en un bloque `interno`, `null` con el alcance `propia`, como `sla` en el detalle (SPEC 30). Así el contrato del vecino no cambia y la regla depende del alcance, no del rol.
- **Sí:** los filtros de dependencia, categoría, prioridad, rango de fechas y "Solo escaladas", como eligió el usuario, siempre intersectados con el alcance.
- **No:** filtros por zona, canal o técnico.
- **Sí:** el rango de fechas arranca en los últimos 30 días, con un máximo de 366, como en `/reportes`. El valor por defecto vive en el frontend, y el backend solo filtra si recibe alguna fecha. Así el contrato del vecino no cambia y el listado del vecino sigue sin rango.
- **Sí:** el rango reutiliza `rangoReportes` de SPEC 43, para que las mismas fechas den el mismo conjunto en el listado y en el tablero.
- **Sí:** "Solo escaladas" también en el listado. `/escaladas` sigue siendo la bandeja del supervisor, pero los coordinadores ven las escaladas de su dependencia.
- **Sí:** el estado se elige con un selector múltiple de los 8 estados, que por defecto deja fuera `cerrada` y `rechazada`, con los contadores de `/tickets/resumen`.
- **No:** grupos de estados para los internos como los del vecino.
- **Sí:** el orden es fijo, de la más reciente a la más antigua, para los internos. Las bandejas ya ordenan por prioridad y vencimiento.
- **No:** un orden elegible por el usuario.
- **Sí:** el listado es solo de consulta: cada queja abre `/tickets/:id`.
- **No:** acciones en la fila ni los paneles laterales de las bandejas.
- **Sí:** tabla desde `md` y tarjetas por debajo, para cumplir 360 px sin scroll horizontal (RNF-14).
- **Sí:** los filtros se guardan en la URL, como en "Mis quejas" y `/reportes`. Nada en el almacenamiento del navegador.
- **Sí:** las opciones de los filtros salen de `GET /categorias` y `GET /dependencias`, abiertos a `tickets.ver` con un alcance distinto de `propia` con el nuevo `requiereAlgunPermiso`. Exponen solo nombres de catálogos activos, y además arreglan los selectores de `/reportes` para el técnico y el administrador.
- **No:** un endpoint `GET /tickets/filtros`, ni ocultar los filtros a los roles sin acceso.
- **No:** exportar el listado (RF-40). Merece su propia spec, con formatos, límites y RNF-12.
- **Sí:** los textos, el tamaño de página (20), el `Accordion` en celular y la ubicación de los componentes los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un filtro nuevo amplía el alcance y muestra quejas de otra dependencia | Los filtros se agregan con `AND` sobre la consulta que ya aplica `knex-filtro.ts` (SPEC 11). El paso 2 prueba un coordinador pidiendo otra dependencia. |
| El bloque `interno` se filtra al vecino y expone el técnico o la prioridad | Se calcula por el alcance `propia` en el servicio, y el paso 3 prueba la respuesta del vecino. |
| Abrir `GET /categorias` y `GET /dependencias` expone datos de más | Solo devuelven nombres, ids y campos adicionales de catálogos activos, que no son datos personales. El vecino no gana acceso a `/dependencias`. |
| El `LEFT JOIN` y el filtro de fechas vuelven lento el listado con muchas quejas (RNF-04) | La consulta sigue paginada y acotada a 366 días por defecto. Los índices existentes cubren estado, dependencia y técnico. Si hace falta, otra spec agrega un índice sobre `creado_en`. |
| El rango por defecto de 30 días oculta quejas viejas todavía abiertas | El rango se ve en los filtros, y "Limpiar filtros" lo vuelve al valor por defecto. Para ver más atrás se amplía hasta 366 días. Las quejas abiertas también siguen en las bandejas. |
| Los contadores de `/tickets/resumen` no coinciden con el listado | Los dos reciben los mismos criterios desde `criterios-url.ts`, y el paso 2 prueba los dos endpoints con los mismos filtros. |

## Lo que **no** está en esta spec

- Exportar el listado (RF-40).
- Acciones o paneles laterales en el listado.
- Orden elegible, filtros por zona, canal o técnico, y búsqueda de texto completo.
- Filtros guardados.
- Cambios en "Mis quejas" o en el detalle.

Cada uno de estos temas, cuando llegue, va en su propia spec.
