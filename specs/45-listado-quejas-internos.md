# SPEC 45 — Listado de quejas para el personal interno

> **Estado:** Implementado
> **Depende de:** SPEC 11, SPEC 25, SPEC 30, SPEC 38
> **Fecha:** 2026-10-28
> **Objetivo:** Reemplazar el placeholder de `/tickets` para los roles internos por una tabla paginada de las quejas de su alcance, con filtros por estado, búsqueda, dependencia, categoría, prioridad, fechas de registro y técnico, sobre los nuevos `GET /api/v1/tickets/gestion` y `GET /api/v1/tickets/gestion/opciones`.

## Por qué existe esta spec

SPEC 25 dejó `/tickets` como placeholder para los internos ("Esta pantalla estará disponible próximamente"), y SPEC 38 dejó explícitamente para otra spec "el listado general de `/tickets` para los internos, con filtros por dependencia, categoría, prioridad o fechas".
Hoy el personal solo ve las quejas a través de sus bandejas (`/triage`, `/asignacion`, `/atencion`, `/escaladas`), y cada una muestra únicamente los estados que le tocan. Una queja cerrada, resuelta o rechazada no aparece en ninguna, y el receptor y el administrador no tienen ninguna bandeja. En uso real esto se percibe como "quejas que no aparecen".

## Alcance

**Incluido:**

- `GET /api/v1/tickets/gestion`: listado paginado para los alcances internos de `tickets.ver` (`registradas`, `asignadas`, `dependencia`, `todas`), con filtros y un orden fijo.
- `GET /api/v1/tickets/gestion/opciones`: las dependencias, categorías y técnicos que pueden elegirse en los filtros, dentro del alcance del usuario.
- Frontend: `/tickets` muestra a los internos una tabla con filtros. A 360 px pasa a tarjetas. Los filtros y la página viven en la URL. Una fila abre el detalle `/tickets/:id` que ya existe.
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `docs/README-roles.md`.

**Fuera de alcance (para specs futuras):**

- Cambiar los alcances de `tickets.ver` (SPEC 11). El coordinador sigue sin ver las quejas en `nueva` o `en_revision`, que todavía no tienen dependencia.
- Elegir el orden por columna.
- Exportar el listado (RF-40).
- Acciones desde el listado (asignar, aceptar, cambiar estado). Se siguen haciendo en las bandejas y en el detalle.
- Búsqueda en la descripción o por nombre del solicitante.
- Agregar al seed de desarrollo un técnico por dependencia.
- Cambios en "Mis quejas" del vecino y en `GET /api/v1/tickets`.

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones.

### `GET /api/v1/tickets/gestion`

Protección: `autenticar` y `requierePermiso('tickets.ver', ['registradas', 'asignadas', 'dependencia', 'todas'])`. El vecino (alcance `propia`) recibe `403 PERMISO_DENEGADO`. Aplica el filtro de alcance de SPEC 11 (`filtroTicketsParaAccion(usuario, 'tickets.ver')`).

Query (Zod, `strict()`; un parámetro desconocido o inválido responde `400 VALIDACION`):

| Parámetro | Regla |
| --- | --- |
| `pagina`, `tamano` | Como en SPEC 25: `pagina` ≥ 1 (por defecto 1), `tamano` de 1 a 50 (por defecto 20) |
| `estado` | Igual que en SPEC 38: opcional y repetible, uno de los 8 estados, sin repetidos |
| `q` | Igual que en SPEC 38: de 2 a 100 caracteres. Busca el número exacto o hace `ILIKE` en título y número |
| `dependenciaId` | Entero positivo, opcional |
| `categoriaId` | Entero positivo, opcional |
| `prioridad` | Una de `baja`, `media`, `alta`, `urgente`, opcional |
| `desde`, `hasta` | `YYYY-MM-DD`, opcionales e independientes. Son días completos de `creado_en` en America/Guatemala: `desde` 00:00 incluido y el día siguiente a `hasta` 00:00 excluido. Un formato inválido, o `hasta` anterior a `desde`, responde `400 RANGO_INVALIDO`. No hay rango máximo |
| `tecnico` | Un entero positivo (el id de un técnico) o `sin_asignar` (`asignado_a IS NULL`), opcional |

Los filtros se intersecan con el alcance. Un `dependenciaId` o un `tecnico` fuera del alcance del usuario no es un error: el resultado sale vacío, igual que con un id que no existe.

Orden fijo, en tres grupos:

1. Abiertas y escaladas: `escalado = true` y estado en `nueva`, `en_revision`, `asignada`, `en_proceso` o `en_espera`.
2. Las demás abiertas (los mismos 5 estados).
3. Finalizadas: `resuelta`, `cerrada` y `rechazada`.

En los grupos 1 y 2 se ordena por prioridad (urgente, alta, media, baja y la nula al final), luego `creado_en ASC` e `id ASC`. En el grupo 3 se ordena por `creado_en DESC` e `id DESC`.

Respuesta `200`: `Pagina<TicketGestionDto>`.

```ts
// application/dto/gestion-tickets.dto.ts
export interface TicketGestionDto {
  id: number;
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  prioridad: Prioridad | null;                    // null en nueva y en_revision
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string } | null;
  zona: { id: number; nombre: string };
  tecnico: { id: number; nombre: string } | null;
  creadoEn: string;                               // ISO 8601 en UTC
  sla: SlaDto;                                    // aSlaDto (SPEC 30)
}
```

No incluye datos de contacto ni el DPI del solicitante (RNF-12).

### `GET /api/v1/tickets/gestion/opciones`

Las mismas protecciones. Sin query.

```ts
export interface OpcionesGestionDto {
  dependencias: { id: number; nombre: string; activa: boolean }[];
  categorias: { id: number; nombre: string; dependenciaId: number; activa: boolean }[];
  tecnicos: { id: number; nombre: string; dependenciaId: number; activo: boolean }[];
}
```

El contenido depende del alcance de `tickets.ver`:

| Alcance | `dependencias` | `categorias` | `tecnicos` |
| --- | --- | --- | --- |
| `dependencia` (coordinador) | La suya | Las de su dependencia | Los técnicos de su dependencia |
| `asignadas` (técnico) | La suya | Las de su dependencia | `[]` |
| `registradas` (receptor), `todas` (supervisor, administrador) | Todas | Todas | Todos los técnicos |

Se incluyen las inactivas, porque una queja antigua puede pertenecer a una dependencia, categoría o técnico desactivado. Cada lista va ordenada por nombre.

### Dominio y repositorio

- `domain/ticket/rango-creacion.ts`: la función `rangoCreacion(desde?, hasta?)` devuelve `{ inicio: Date | null; fin: Date | null }`. Reutiliza `esFechaValida` e `instanteLocal`, y lanza `ReglaDeNegocioError('RANGO_INVALIDO', …)`.
- `domain/repositories/gestion-lectura-repository.ts`: `GestionLecturaRepository` con `listar(filtro, criterios, pagina, tamano)` y `opciones(filtro)`. `CriteriosGestion` lleva `estados`, `busqueda`, `dependenciaId`, `categoriaId`, `prioridad`, `inicio`, `fin` y `tecnico: number | 'sin_asignar' | null`. Un filtro `null` no consulta la base.
- `infrastructure/repositories/knex-gestion-lectura-repository.ts` implementa el puerto con `aplicarFiltro`, `COLUMNAS_SLA_LECTURA` y la búsqueda de SPEC 38.
- `application/services/gestion-tickets.service.ts`: `GestionTicketsService` con `listar` y `opciones`.

### Frontend (`features/tickets/gestion/`)

- `TicketsPage.tsx`: el vecino sigue con `MisQuejas`. Los demás roles ven `ListadoGestion`.
- `ListadoGestion.tsx`: título "Quejas", `FiltrosGestion`, la tabla o las tarjetas, la paginación y los estados de carga, error con "Reintentar" y vacío. Hay dos mensajes de vacío: "No hay quejas en tu alcance" sin filtros, y "Ninguna queja coincide con los filtros" con el botón "Limpiar filtros".
- `FiltrosGestion.tsx`: búsqueda (con espera de 300 ms, como SPEC 38), estados (selección múltiple), dependencia, categoría, prioridad, desde y hasta (`type="date"`) y técnico.
  - El filtro de dependencia se oculta cuando `opciones.dependencias` tiene un solo elemento.
  - Las categorías se limitan a la dependencia elegida.
  - El filtro de técnico ofrece "Sin asignar" y los técnicos de `opciones.tecnicos` (limitados a la dependencia elegida). Se oculta cuando el rol es `tecnico`.
  - Cambiar cualquier filtro vuelve a la página 1.
- `TablaGestion.tsx`: columnas Número, Título, Estado (con `estado-chip.ts`), Prioridad, Dependencia, Técnico ("Sin asignar" si es null), SLA (`IndicadorSla`) y Registrada (fecha de Guatemala). Desde el breakpoint `md` es una tabla. Por debajo, son tarjetas con los mismos datos. Cada fila o tarjeta es un enlace a `/tickets/:id`.
- `filtros-url.ts`: convierte entre `URLSearchParams` y los filtros (`estado` repetible, `q`, `dependenciaId`, `categoriaId`, `prioridad`, `desde`, `hasta`, `tecnico`, `pagina`). Un valor inválido en la URL se ignora.
- `api/gestion-api.ts`: `listarGestion(filtros)` y `opcionesGestion()`.
- Textos en `locales/es/tickets.json`, bajo `gestion.*`.

### Archivos nuevos o modificados

Backend:

- Nuevos:
  - `src/domain/ticket/rango-creacion.ts`
  - `src/domain/repositories/gestion-lectura-repository.ts`
  - `src/infrastructure/repositories/knex-gestion-lectura-repository.ts`
  - `src/application/dto/gestion-tickets.dto.ts`
  - `src/application/services/gestion-tickets.service.ts`
  - `src/presentation/validators/gestion-tickets.validators.ts`
  - `src/presentation/controllers/gestion-tickets.controller.ts`
  - `src/presentation/routes/gestion-tickets.routes.ts`
  - `tests/unit/ticket/rango-creacion.test.ts`
  - `tests/db/gestion-tickets.api.test.ts`
- Modificados: `src/container.ts` y `src/app.ts`. Se monta en `/api/v1/tickets` antes de `ticketsRoutes`, para que `GET /:id` no tape `/gestion`.

Frontend:

- Nuevos:
  - `src/features/tickets/api/gestion-api.ts`
  - `src/features/tickets/gestion/ListadoGestion.tsx`
  - `src/features/tickets/gestion/FiltrosGestion.tsx`
  - `src/features/tickets/gestion/TablaGestion.tsx`
  - `src/features/tickets/gestion/filtros-url.ts`
  - `tests/features/tickets/filtros-url.test.ts`
  - `tests/features/tickets/listado-gestion.test.tsx`
- Modificados: `src/features/tickets/pages/TicketsPage.tsx` y `src/locales/es/tickets.json`.

Documentación: `Sistema de Gestión de Quejas Municipales — Definición de la Solución.md` (sección 6), `CLAUDE.md` y `docs/README-roles.md`.

## Plan de implementación

1. Crear `rangoCreacion` con su prueba unitaria. Casos:
   - Sin fechas devuelve `{ inicio: null, fin: null }`.
   - Solo `desde` o solo `hasta`.
   - `hasta = desde` cubre ese día completo en Guatemala (`fin` es el día siguiente a las 06:00 UTC).
   - Un formato inválido o `hasta < desde` → `RANGO_INVALIDO`.

   Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan en `backend/`.
2. Crear el puerto, el repositorio Knex, el DTO, el servicio, el validador, el controlador y la ruta `GET /tickets/gestion`, y conectarlos en `container.ts` y `app.ts`. Crear `tests/db/gestion-tickets.api.test.ts`. Casos:
   - El vecino → `403`. Sin sesión → `401`.
   - El coordinador solo recibe quejas de su dependencia, aunque envíe otro `dependenciaId`, que da una lista vacía.
   - El técnico solo recibe sus asignadas. El receptor, las que registró. El supervisor y el administrador, todas.
   - Cada filtro reduce el resultado: `estado` (uno y varios), `q`, `dependenciaId`, `categoriaId`, `prioridad`, `desde`/`hasta` en el borde del día de Guatemala, `tecnico=<id>` y `tecnico=sin_asignar`.
   - Valores inválidos → `400 VALIDACION`. Un rango inválido → `400 RANGO_INVALIDO`.
   - El orden: abiertas escaladas, abiertas por prioridad y antigüedad, y finalizadas de la más reciente a la más antigua.
   - La respuesta no tiene correo, teléfono ni DPI. `sla` sigue el formato de SPEC 30.
   - `GET /tickets/gestion` no se interpreta como un id, y `GET /tickets/:id` sigue funcionando.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan, y las pruebas de SPEC 25 y 38 siguen pasando.
3. Agregar `opciones` al repositorio y al servicio, y la ruta `GET /tickets/gestion/opciones`. Ampliar la prueba de BD. Casos:
   - El coordinador recibe su dependencia, sus categorías y sus técnicos.
   - El técnico recibe su dependencia y `tecnicos: []`.
   - El supervisor recibe todo, inactivos incluidos.
   - El vecino → `403`.

   Verificación: `npm run test:db` pasa.
4. Frontend: crear `gestion-api.ts` y `filtros-url.ts` con `filtros-url.test.ts`. Casos:
   - Ida y vuelta de todos los filtros, con `estado` repetido.
   - Un valor inválido se descarta.
   - Sin filtros, la URL queda vacía.

   Verificación: `npm test` pasa en `frontend/`.
5. Crear `ListadoGestion`, `FiltrosGestion` y `TablaGestion`, y conectar `TicketsPage`. Agregar los textos. Crear `listado-gestion.test.tsx` con la API simulada. Casos:
   - El vecino sigue viendo "Mis quejas".
   - El coordinador ve la tabla sin el filtro de dependencia. El supervisor lo ve.
   - El técnico no ve el filtro de técnico.
   - Elegir un filtro escribe la URL y vuelve a la página 1. Atrás restaura el filtro anterior.
   - Las categorías y los técnicos se limitan a la dependencia elegida.
   - Los dos mensajes de vacío y "Limpiar filtros".
   - El error con "Reintentar".
   - La fila enlaza a `/tickets/:id`.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Actualizar la sección 6 del documento de definición (los dos endpoints), `CLAUDE.md` (`/tickets` deja de ser placeholder para los internos) y `docs/README-roles.md` (qué ve cada rol en "Quejas").

   Verificación manual con el backend y la base local:
   - `coordinador@vozmuni.test` ve en `/tickets` las quejas de Dirección de Obras, incluidas las cerradas y resueltas.
   - `supervisor@vozmuni.test` ve las 14 y, al filtrar por "Dirección de Agua Potable" y "Sin asignar", ve Q-2026-000004 y Q-2026-000007.
   - Al recargar se mantienen los filtros.
   - A 360 px se ven tarjetas, sin scroll horizontal.

## Criterios de aceptación

- [ ] `GET /api/v1/tickets/gestion` responde `403` al vecino y `401` sin sesión.
- [ ] Cada rol interno recibe exactamente las quejas de su alcance de `tickets.ver` (SPEC 11), con cualquier combinación de filtros.
- [ ] Los filtros `estado`, `q`, `dependenciaId`, `categoriaId`, `prioridad`, `desde`, `hasta` y `tecnico` (id o `sin_asignar`) funcionan y se combinan con AND.
- [ ] `desde` y `hasta` se interpretan como días completos de America/Guatemala. Un rango invertido o mal formado responde `400 RANGO_INVALIDO`.
- [ ] El orden es: abiertas escaladas, después abiertas por prioridad y antigüedad, y al final las finalizadas de la más reciente a la más antigua.
- [ ] Ninguna respuesta de los dos endpoints incluye correo, teléfono ni DPI.
- [ ] `GET /api/v1/tickets/gestion/opciones` devuelve las listas de la tabla de alcances.
- [ ] Los internos ya no ven el placeholder en `/tickets`, y el vecino sigue viendo "Mis quejas" sin cambios.
- [ ] Los filtros y la página están en la URL y sobreviven a una recarga y a "Atrás".
- [ ] A 360 px el listado se ve como tarjetas, sin scroll horizontal.
- [ ] `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan en `backend/`. `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.

## Decisiones

- **Endpoint nuevo en lugar de ampliar `GET /api/v1/tickets`.** El listado del vecino oculta a propósito el técnico, la prioridad y el SLA (SPEC 25 y 30), y tiene su propio orden de "acción pendiente" (SPEC 38). Mezclar los dos haría depender la forma de la respuesta del rol. Un endpoint propio sigue el patrón de las bandejas (`/triage`, `/por-asignar`, `/atencion`, `/escaladas`).
- **Endpoint de opciones propio.** `GET /categorias` exige `tickets.crear` y `GET /dependencias/:id/tecnicos` exige `tickets.asignar`, así que el técnico, el coordinador y el administrador no tienen hoy una fuente común. Tampoco se cambian los permisos de esas rutas.
- **Filtros fuera del alcance devuelven vacío, no error.** Así no se revela si existe una dependencia o un técnico, y la regla es igual a la de un `GET /tickets/:id` fuera de alcance.
- **"Vencido" se aproxima con `escalado`.** El job de SLA marca `escalado` cuando vence un plazo (SPEC 32, cada 5 minutos). Ordenar por `escalado` evita calcular vencimientos con `ahora` en el `ORDER BY`.
- **Se mantiene el alcance de SPEC 11** (decisión del usuario): el coordinador no ve las quejas sin dependencia.
- **Orden fijo y sin exportar** (decisión del usuario).
- **Tabla con enlace al detalle** (decisión del usuario). Las acciones siguen en las bandejas.
- **Sin rango máximo de fechas**, a diferencia del tablero (SPEC 43). El listado está paginado y no agrega datos.

## Riesgos

- **Rendimiento con muchos filtros opcionales.** Sin índices compuestos nuevos, un `ILIKE` combinado con un orden por `CASE` puede ser lento con cientos de miles de quejas. La paginación lo acota y no se agregan índices en esta spec. Si hiciera falta, iría en una migración aparte.
- **`escalado` puede ir hasta 5 minutos por detrás del vencimiento real.** Es aceptable para un orden de lectura.
- **Muchas columnas a 360 px.** Se mitiga con tarjetas por debajo de `md`, y se verifica manualmente a 360×740.

## Lo que **no** está en esta spec

- Ver las quejas sin dependencia como coordinador.
- Orden configurable, exportación (RF-40) y acciones masivas.
- Persistir en `seed:dev` los técnicos por dependencia (hoy existen solo en la base local).
