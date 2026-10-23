# SPEC 11 — Alcance por recurso: tickets, reportes y bitácora

> **Estado:** Implementado
> **Depende de:** SPEC 08, SPEC 10
> **Fecha:** 2026-10-22
> **Objetivo:** Traducir en el dominio el alcance de cada permiso (`propia`, `registradas`, `asignadas`, `dependencia`, `todas`) a filtros sobre tickets, reportes y bitácora, y aplicarlos en repositorios de solo lectura, de modo que ningún usuario lea o actúe sobre registros fuera de su alcance.

## Por qué existe esta spec

RF-05 pide restringir cada endpoint según el rol **y la dependencia** del usuario. SPEC 08 resolvió la primera mitad: `requierePermiso(accion)` decide si el rol puede hacer la acción y deja el `alcance` en la petición. Pero dejó a cada spec de negocio la tarea de aplicar ese alcance sobre los registros.
Si cada spec lo hace por su cuenta, la misma regla (un técnico solo ve sus asignadas, un coordinador solo su dependencia) termina repetida en listados, detalles, reportes y bitácora, y una sola omisión expone datos de otra dependencia.
Esta spec centraliza la regla en el dominio y la prueba contra Postgres. Así, las specs de RF-06, RF-12, RF-18, RF-36, RF-38 y RF-42 solo la usan.
Esto **revierte la decisión de SPEC 08** de no tener un helper genérico de alcance.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0011_alcance`: columnas `tickets.registrado_por` y `bitacora.dependencia_id`, con sus índices.
- Funciones puras en `domain/autorizacion/` que convierten `(usuario, alcance)` en un filtro, combinan el alcance de la acción con el de `tickets.ver`, y verifican el acceso a un ticket concreto.
- Repositorios de solo lectura que aplican el filtro:
  - Tickets: listar paginado y obtener uno.
  - Reportes: conteo de tickets por estado.
  - Bitácora: listar paginado.
- Servicio de aplicación `ConsultaTicketsService` con `listar` y `obtenerParaAccion`, que responde `404 NO_ENCONTRADO` si el ticket está fuera del alcance.
- Pruebas unitarias de las reglas para los 6 roles y pruebas `test:db` de los repositorios con datos de cada rol.
- Regla en `CLAUDE.md`: toda consulta de negocio usa estos filtros.

**Fuera de alcance (para specs futuras):**

- Endpoints de tickets, reportes y bitácora (specs de RF-36, RF-38 y RF-42). Esta spec no expone rutas nuevas.
- Llenar `tickets.registrado_por` al crear un ticket (specs de RF-06 y RF-07).
- Llenar `bitacora.dependencia_id` al escribir la bitácora (spec de RF-42).
- Pantallas y guardas del frontend según permisos. Las guardas siguen como en SPEC 06 hasta la spec de login del frontend.
- Enmascarado de datos personales según el rol (RNF-12).
- Qué transiciones concretas puede ejecutar cada rol (spec de RF-18).
- Semántica de los alcances que no filtran registros: `a_nombre_de_vecino` (crear), `solicitar` (trasladar) y `si` (comentarios, administración). La define la spec de cada acción.
- Indicadores de tiempo y SLA en reportes (RF-39). Aquí solo existe un conteo por estado, para probar el filtro.
- Row Level Security de Postgres.

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- `tickets`: se agrega `registrado_por`.
- `bitacora`: se agrega `dependencia_id`.

### `0011_alcance`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `tickets` | `registrado_por` | bigint | NULL, FK `usuarios` ON DELETE RESTRICT |
| `bitacora` | `dependencia_id` | bigint | NULL, FK `dependencias` ON DELETE RESTRICT |

Índices nuevos:

- `tickets (solicitante_id)`, para el alcance `propia`.
- `tickets (registrado_por)`, para `registradas`.
- `bitacora (dependencia_id, creado_en)`, para la bitácora por dependencia.

Los alcances `asignadas` y `dependencia` ya están cubiertos por los índices de SPEC 03.

Notas:

- `registrado_por` es `NULL` en los tickets existentes. Cuando lo llene la spec de registro, un vecino que crea su propia queja queda con `registrado_por = solicitante_id`, y una queja de ventanilla queda con el id del receptor.
- `ADD COLUMN` sobre `bitacora` no se bloquea: los triggers de SPEC 03 solo impiden `UPDATE`, `DELETE` y `TRUNCATE` de filas.
- El `down` borra los 3 índices y las 2 columnas.

### Filtros (`domain/autorizacion/filtro.ts`)

```ts
// Condición sobre un campo del registro: campo = valor.
export interface Condicion<C extends string> {
  readonly campo: C;
  readonly valor: number;
}

// null = ningún registro. Lista vacía = todos. Varias condiciones = todas a la vez (AND).
export type Filtro<C extends string> = readonly Condicion<C>[] | null;

export function intersectar<C extends string>(a: Filtro<C>, b: Filtro<C>): Filtro<C>; // null si alguno es null; si no, concatena
```

### Alcance sobre tickets (`domain/autorizacion/alcance-tickets.ts`)

```ts
export type CampoTicket = 'solicitanteId' | 'registradoPor' | 'asignadoA' | 'dependenciaId';
export type FiltroTickets = Filtro<CampoTicket>;

// Los campos del ticket que importan para decidir el acceso.
export interface TicketAlcance {
  solicitanteId: number;
  registradoPor: number | null;
  asignadoA: number | null;
  dependenciaId: number | null;
}

export interface UsuarioAlcance {
  id: number;
  dependenciaId: number | null;
  permisos: Permisos;            // de SPEC 08
}

export function filtroTicketsPorAlcance(usuario: UsuarioAlcance, alcance: Alcance): FiltroTickets;

// tickets.ver ∩ alcance de la acción. null si falta cualquiera de los dos permisos.
export function filtroTicketsParaAccion(usuario: UsuarioAlcance, accion: Accion): FiltroTickets;

export function cumpleFiltro(ticket: TicketAlcance, filtro: FiltroTickets): boolean;
export function puedeAccederTicket(usuario: UsuarioAlcance, accion: Accion, ticket: TicketAlcance): boolean;
```

`filtroTicketsPorAlcance` traduce cada alcance así:

| Alcance | Filtro | Ejemplo |
| --- | --- | --- |
| `propia` | `[{ solicitanteId: usuario.id }]` | el vecino ve sus quejas |
| `registradas` | `[{ registradoPor: usuario.id }]` | el receptor ve las que registró |
| `asignadas` | `[{ asignadoA: usuario.id }]` | el técnico ve las asignadas a él |
| `dependencia` | `[{ dependenciaId: usuario.dependenciaId }]`, o `null` si el usuario no tiene dependencia | el coordinador ve las de su dependencia |
| `todas`, `si`, `solicitar`, `a_nombre_de_vecino` | `[]` (no restringe registros) | el supervisor ve todas |

Reglas de combinación:

- Para la acción `tickets.ver`, el filtro es el de su propio alcance.
- Para cualquier otra acción sobre un ticket existente, el filtro es la **intersección** del alcance de la acción con el de `tickets.ver`: nadie actúa sobre un ticket que no puede ver.
  - Coordinador y `tickets.clasificar` (`todas`): queda `[{ dependenciaId }]`.
  - Técnico y `tickets.cambiar_estado` (`asignadas`): queda `[{ asignadoA }, { asignadoA }]`, que equivale a solo sus asignadas.
  - Supervisor y `tickets.trasladar` (`todas`): queda `[]`.
- Si el rol no tiene la acción o no tiene `tickets.ver`, el filtro es `null` y no accede a ningún ticket.
- Un ticket con `dependencia_id = null` (todavía en `nueva` o `en_revision`) no cumple ningún filtro `dependencia`. Solo lo ven los alcances `todas`, `propia` y `registradas` que correspondan.

`tickets.crear` no se usa con estas funciones: no hay un ticket existente. Su alcance lo interpreta la spec de RF-06 y RF-07.

### Alcance sobre reportes y bitácora

```ts
// domain/autorizacion/alcance-reportes.ts — los reportes cuentan tickets
export function filtroReportes(usuario: UsuarioAlcance): FiltroTickets;   // según permisos['reportes.ver']

// domain/autorizacion/alcance-bitacora.ts
export type CampoBitacora = 'dependenciaId';
export type FiltroBitacora = Filtro<CampoBitacora>;
export function filtroBitacora(usuario: UsuarioAlcance): FiltroBitacora; // según permisos['bitacora.ver']
```

| Alcance | `reportes.ver` (sobre tickets) | `bitacora.ver` (sobre filas de bitácora) |
| --- | --- | --- |
| `propia` | `[{ asignadoA: usuario.id }]`: los reportes del técnico son sobre sus tickets asignados | no se usa → `null` |
| `dependencia` | `[{ dependenciaId }]`, o `null` sin dependencia | `[{ dependenciaId }]`, o `null` sin dependencia |
| `todas` | `[]` | `[]` |
| sin permiso o cualquier otro valor | `null` | `null` |

Las filas de bitácora con `dependencia_id = null` (acciones sobre usuarios, catálogos o el sistema) solo las ven los roles con alcance `todas`.

### Repositorios de solo lectura

```ts
// domain/repositories/ticket-lectura-repository.ts
export interface TicketResumen extends TicketAlcance {
  id: number;
  numero: string;
  estado: EstadoTicket;          // de SPEC 04
  creadoEn: Date;
}
export interface Pagina<T> { datos: T[]; pagina: number; tamano: number; total: number }
export interface TicketLecturaRepository {
  listar(filtro: FiltroTickets, pagina: number, tamano: number): Promise<Pagina<TicketResumen>>; // creado_en DESC, id DESC
  obtener(id: number, filtro: FiltroTickets): Promise<TicketResumen | null>;
}

// domain/repositories/reporte-lectura-repository.ts
export interface ReporteLecturaRepository {
  contarPorEstado(filtro: FiltroTickets): Promise<Record<EstadoTicket, number>>; // los 8 estados, con 0 si no hay
}

// domain/repositories/bitacora-lectura-repository.ts
export interface FilaBitacora {
  id: number; usuarioId: number | null; accion: string; entidad: string;
  entidadId: string | null; dependenciaId: number | null; creadoEn: Date;
}
export interface BitacoraLecturaRepository {
  listar(filtro: FiltroBitacora, pagina: number, tamano: number): Promise<Pagina<FilaBitacora>>; // creado_en DESC, id DESC
}
```

Reglas comunes de las implementaciones Knex (`infrastructure/repositories/`):

- Un filtro `null` devuelve una página vacía con `total = 0`, o `null` en `obtener`, **sin consultar la base**.
- Un filtro `[]` no agrega `WHERE`.
- Cada condición se traduce a `columna = ?` con parámetro. El nombre de columna sale de un mapa fijo (`solicitanteId → solicitante_id`, …), nunca de la entrada del usuario.
- `obtener` aplica el filtro en el mismo `WHERE` que el id (`WHERE id = ? AND …`). No lee el ticket para filtrar después en memoria.
- `pagina` ≥ 1 y `tamano` entre 1 y 100. Los valores fuera de rango los rechaza el servicio.

### Servicio (`application/services/consulta-tickets.service.ts`)

```ts
export class ConsultaTicketsService {
  listar(usuario: UsuarioAutenticado, pagina: number, tamano: number): Promise<Pagina<TicketResumen>>;
  // Para la acción indicada, devuelve el ticket o lanza ErrorDeAplicacion('NO_ENCONTRADO').
  obtenerParaAccion(usuario: UsuarioAutenticado, accion: Accion, id: number): Promise<TicketResumen>;
}
```

- `listar` usa `filtroTicketsParaAccion(usuario, 'tickets.ver')`.
- Un ticket inexistente y un ticket fuera de alcance lanzan el mismo `NO_ENCONTRADO`, que el manejador de SPEC 08 traduce a `404`. Así no se revela que el ticket existe.
- Las specs de negocio llaman a `obtenerParaAccion` antes de clasificar, asignar, cambiar de estado o trasladar, y luego aplican la regla de dominio de SPEC 04.

### Datos de prueba (`tests/db/alcance.test.ts`)

Un fixture inserta 2 dependencias (A y B), un usuario por rol y estos tickets:

| Ticket | Solicitante | Registrado por | Dependencia | Asignado a |
| --- | --- | --- | --- | --- |
| T1 | vecino V1 | V1 | A | técnico TA |
| T2 | vecino V1 | receptor R | B | técnico TB |
| T3 | vecino V2 | receptor R | `null` (en revisión) | `null` |
| T4 | vecino V2 | V2 | A | `null` |

Los usuarios son: el técnico TA y el coordinador CA en A, el técnico TB en B, el receptor R, el supervisor S y el administrador AD.

Tickets que ve cada uno con `tickets.ver`:

| Usuario | Ve |
| --- | --- |
| V1 | T1, T2 |
| V2 | T3, T4 |
| R | T2, T3 |
| TA | T1 |
| TB | T2 |
| CA | T1, T4 |
| S | todos |
| AD | todos |

Las filas de bitácora de prueba son 2 con dependencia A, 1 con B y 1 con `null`. CA ve las 2 de A, y S y AD ven las 4.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    container.ts                                       # repositorios de lectura y ConsultaTicketsService
    domain/autorizacion/filtro.ts
    domain/autorizacion/alcance-tickets.ts
    domain/autorizacion/alcance-reportes.ts
    domain/autorizacion/alcance-bitacora.ts
    domain/repositories/ticket-lectura-repository.ts
    domain/repositories/reporte-lectura-repository.ts
    domain/repositories/bitacora-lectura-repository.ts
    application/services/consulta-tickets.service.ts
    infrastructure/
      repositories/knex-filtro.ts                      # traduce Filtro a WHERE con un mapa fijo de columnas
      repositories/knex-ticket-lectura-repository.ts
      repositories/knex-reporte-lectura-repository.ts
      repositories/knex-bitacora-lectura-repository.ts
      database/migrations/0011_alcance.ts
  tests/
    unit/autorizacion/filtro.test.ts
    unit/autorizacion/alcance-tickets.test.ts
    unit/autorizacion/alcance-reportes-bitacora.test.ts
    unit/autorizacion/consulta-tickets.service.test.ts   # con repositorio falso
    db/schema.test.ts                                    # columnas e índices nuevos
    db/alcance.test.ts                                   # repositorios con el fixture
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `tickets.registrado_por` y `bitacora.dependencia_id`. Verificación: revisión del diff.
2. Crear `0011_alcance.ts`. Ampliar `schema.test.ts` con las 2 columnas y los 3 índices. Agregar un caso: insertar una fila de bitácora con `dependencia_id` funciona, y el trigger de solo inserción sigue bloqueando `UPDATE`. Verificación: `npm run test:db` pasa, y un rollback completo sigue sin dejar tablas.
3. Crear `filtro.ts` y `alcance-tickets.ts`, con `filtro.test.ts` y `alcance-tickets.test.ts`. Casos:
   - `intersectar` con `null`, con `[]` y con 2 condiciones.
   - `filtroTicketsPorAlcance` para cada uno de los 8 alcances, incluido `dependencia` sin dependencia → `null`.
   - `filtroTicketsParaAccion` para los 6 roles × las acciones sobre tickets existentes (`ver`, `clasificar`, `asignar`, `trasladar`, `cambiar_estado`), con los permisos de la matriz de SPEC 08. Debe incluir: coordinador y `clasificar` limitado a su dependencia; receptor y `asignar` → `null`; administrador y `cambiar_estado` → `null`.
   - `puedeAccederTicket` con un ticket de `dependencia_id = null` para el coordinador → `false`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `alcance-reportes.ts` y `alcance-bitacora.ts`, con `alcance-reportes-bitacora.test.ts`. Casos: técnico → `[{ asignadoA }]`; coordinador → `[{ dependenciaId }]`; vecino → `null`; supervisor → `[]`; bitácora del técnico → `null`. Verificación: `npm test` pasa.
5. Crear las 3 interfaces de repositorio, `knex-filtro.ts` y `knex-ticket-lectura-repository.ts`. Crear `tests/db/alcance.test.ts` con el fixture. Casos:
   - `listar` devuelve exactamente los tickets de la tabla "Ve" para cada uno de los 8 usuarios, con el `total` correcto.
   - `obtener(T2)` como TA devuelve `null`.
   - Un filtro `null` no ejecuta ninguna consulta (se comprueba con un contador en `knex.on('query')`).

   Verificación: `npm run test:db` pasa.
6. Crear `knex-reporte-lectura-repository.ts` y `knex-bitacora-lectura-repository.ts`. Ampliar `alcance.test.ts`:
   - `contarPorEstado` devuelve los 8 estados y cuenta solo los tickets del alcance de TA, CA y S.
   - La bitácora de CA devuelve las 2 filas de A, y la de S las 4.

   Verificación: `npm run test:db` pasa.
7. Crear `ConsultaTicketsService` y `consulta-tickets.service.test.ts` con un repositorio falso. Casos:
   - `obtenerParaAccion` con un ticket fuera de alcance y con uno inexistente lanza el mismo `ErrorDeAplicacion('NO_ENCONTRADO')`.
   - El coordinador con `tickets.clasificar` sobre un ticket de otra dependencia lanza `NO_ENCONTRADO`.
   - `listar` pasa al repositorio el filtro de `tickets.ver`.

   Conectar los repositorios y el servicio en `container.ts`. Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Actualizar `CLAUDE.md` con la regla: toda lectura o acción sobre tickets, reportes o bitácora pasa por los filtros de `domain/autorizacion/` (o por `ConsultaTicketsService`), nunca con un `WHERE` escrito a mano por rol, y un ticket fuera de alcance responde `404`. Verificación: revisión del diff.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `tickets.registrado_por` y `bitacora.dependencia_id`.
- [x] `npm run migrate:latest` crea las 2 columnas y los 3 índices, y el trigger de solo inserción de `bitacora` sigue bloqueando `UPDATE`, `DELETE` y `TRUNCATE`.
- [x] `filtroTicketsPorAlcance` traduce `propia`, `registradas`, `asignadas`, `dependencia` y `todas` según la tabla de esta spec, y `dependencia` sin dependencia devuelve `null`.
- [x] Para cualquier acción distinta de `tickets.ver`, el filtro es la intersección con el de `tickets.ver`, y un coordinador no puede clasificar ni asignar un ticket de otra dependencia.
- [x] Un rol sin la acción o sin `tickets.ver` obtiene un filtro `null` y no accede a ningún ticket.
- [x] Con el fixture de esta spec, `listar` devuelve para cada uno de los 8 usuarios exactamente los tickets de la tabla "Ve", con el `total` correcto.
- [x] `obtener` y `obtenerParaAccion` sobre un ticket fuera de alcance se comportan igual que sobre un ticket inexistente: `null` en el repositorio y `NO_ENCONTRADO` en el servicio.
- [x] Un ticket con `dependencia_id = null` no lo ven ni el técnico ni el coordinador, y sí el supervisor, el administrador, su solicitante y quien lo registró.
- [x] Un filtro `null` no ejecuta ninguna consulta a la base.
- [x] `contarPorEstado` devuelve los 8 estados y cuenta solo los tickets del alcance de `reportes.ver`: los asignados para el técnico y su dependencia para el coordinador.
- [x] La bitácora del coordinador devuelve solo las filas de su dependencia. Las filas con `dependencia_id = null` solo las ven el supervisor y el administrador.
- [x] Ningún nombre de columna en `knex-filtro.ts` sale de la entrada: todos vienen de un mapa fijo.
- [x] Ningún archivo de `src/domain/autorizacion/` importa algo fuera de `src/domain/`.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta que toda consulta de negocio usa los filtros de alcance y que un registro fuera de alcance responde `404`.

## Decisiones

- **Sí:** esta spec cubre el alcance por recurso en el backend, la parte de RF-05 que SPEC 08 dejó a cada spec de negocio.
- **No:** las pantallas guiadas por permisos en el frontend, que necesitan antes el login del frontend, ni descartar la spec.
- **Sí:** se aplica a tickets, reportes y bitácora, como eligió el usuario: todas las filas de la matriz que tienen alcance sobre registros.
- **No:** solo tickets.
- **Sí:** se agrega `tickets.registrado_por` para el alcance `registradas` del receptor. Es un filtro directo e indexable, y lo llena la spec de registro.
- **No:** deducirlo del primer registro de `ticket_historial` (un JOIN en cada listado), ni dejarlo como vacío.
- **Sí:** se agrega `bitacora.dependencia_id` para la bitácora del coordinador. Lo llena quien escribe la bitácora (RF-42). Las filas sin dependencia solo las ven los roles con alcance `todas`.
- **No:** unir con `tickets` cuando `entidad = 'ticket'`, ni dejar la bitácora fuera.
- **Sí:** el alcance se expresa como un filtro de dominio (una lista de condiciones `campo = valor`), con una verificación pura para un ticket concreto. Los repositorios lo traducen a `WHERE`. La regla se prueba sin base, y el dominio no conoce SQL. Esto revierte la decisión de SPEC 08 de no tener un helper genérico.
- **No:** un helper Knex en infraestructura, ni Row Level Security de Postgres.
- **Sí:** un ticket fuera de alcance responde `404 NO_ENCONTRADO`, igual que uno inexistente, para no revelar qué tickets existen.
- **No:** `403`.
- **Sí:** para actuar sobre un ticket se exige el alcance de la acción **y** el de `tickets.ver` (intersección). Nadie actúa sobre lo que no puede ver.
- **No:** usar solo el alcance de la acción.
- **Sí:** los alcances `si`, `solicitar` y `a_nombre_de_vecino` no restringen registros (filtro `[]`). Su significado como modo de acción lo define la spec de cada acción. Es una consecuencia de la regla anterior que no se preguntó explícitamente.
- **Sí:** el alcance `propia` de `reportes.ver` del técnico se traduce a "sus tickets asignados", porque un técnico no es solicitante de quejas. Esta interpretación de "Propios" la propone esta spec y puede revisarse.
- **Sí:** la verificación se hace con repositorios de solo lectura probados contra Postgres con un fixture de 8 usuarios, sin endpoints nuevos. Los endpoints los crean las specs de RF-36, RF-38 y RF-42 usando estas piezas.
- **No:** endpoints mínimos de lectura en esta spec.
- **Sí:** un filtro `null` corta antes de consultar la base. Es más barato, y evita que un `WHERE` mal armado devuelva datos.
- **Sí:** los nombres de columna salen de un mapa fijo en `knex-filtro.ts`. Ninguna entrada del usuario llega al nombre de una columna (RNF-10).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una spec futura consulta tickets sin pasar por los filtros y expone datos de otra dependencia | La regla queda en `CLAUDE.md`. `ConsultaTicketsService` es la entrada recomendada, y las pruebas de cada endpoint deben incluir un usuario fuera de alcance. |
| `registrado_por` y `bitacora.dependencia_id` quedan en `NULL` si la spec que escribe esos datos no los llena | Los criterios de las specs de RF-06, RF-07 y RF-42 deben comprobar que se llenan. Mientras tanto, un receptor no ve tickets con `registrado_por = NULL`, que es el comportamiento seguro. |
| La intersección es más estricta que la matriz literal (el coordinador "clasifica: Sí") | Es intencional y está documentado. Si la municipalidad necesita que un rol actúe fuera de lo que ve, se cambia su `tickets.ver` en `roles.permisos`. |
| La interpretación de "Propios" en reportes del técnico no es la que espera la municipalidad | Está registrada como decisión revisable. Cambiarla es una línea en `alcance-reportes.ts`. |
| La numeración `0011` supone que SPEC 09 y 10 se implementaron antes | Si el orden cambia, la migración se renumera al implementarla, antes de llegar a `main`. |
| Repositorios de solo lectura sin endpoints pueden quedar como código sin uso si las specs futuras no los adoptan | `CLAUDE.md` los declara la vía obligatoria, y las specs de RF-36, RF-38 y RF-42 deben depender de esta. |

## Lo que **no** está en esta spec

- Endpoints de tickets, reportes y bitácora.
- Llenar `registrado_por` y `bitacora.dependencia_id`.
- Guardas del frontend según permisos.
- Enmascarado de datos personales (RNF-12).
- Transiciones permitidas por rol y semántica de `solicitar`, `a_nombre_de_vecino` y `si`.
- Indicadores de tiempo y SLA.
- Row Level Security.

Cada uno de estos temas, cuando llegue, va en su propia spec.
