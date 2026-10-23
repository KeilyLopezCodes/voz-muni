# SPEC 43 — Tablero de quejas e indicadores de SLA

> **Estado:** Borrador
> **Depende de:** SPEC 08, SPEC 11, SPEC 14, SPEC 17, SPEC 21, SPEC 22, SPEC 27, SPEC 30, SPEC 32
> **Fecha:** 2026-10-23
> **Objetivo:** Mostrar en `/reportes`, a partir de `GET /api/v1/reportes/resumen`, cuántas quejas hay por estado, categoría, dependencia y zona entre dos fechas de registro, junto con los tiempos promedio de respuesta y de resolución en horas hábiles y el porcentaje de cumplimiento de SLA por dependencia y por categoría, siempre dentro del alcance de `reportes.ver`.

## Por qué existe esta spec

- **RF-38 (M):** tablero de quejas por estado, categoría, dependencia y zona, filtrable por rango de fechas.
- **RF-39 (M):** tiempo promedio de respuesta y de resolución, y porcentaje de cumplimiento de SLA.

SPEC 11 dejó el filtro de alcance de los reportes (`filtroReportes`) y un conteo por estado sin endpoint. SPEC 30 y 32 dejaron guardados los datos que necesita RF-39: `primera_respuesta_en`, `resuelto_en`, los vencimientos, la pausa y `escalado_en`.
Medir tiempos en horas hábiles al consultar sería lento con 500 000 quejas (RNF-04). Por eso esta spec guarda los minutos hábiles en el momento en que ocurren, y el reporte solo promedia.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición, incluida la corrección del conflicto sobre el técnico.
- Migración `0029_indicadores`: columnas `tickets.minutos_respuesta` y `tickets.minutos_resolucion`, con índices para el tablero.
- **Cambio sobre SPEC 30:**
  - `SlaService.alIniciar` guarda `minutos_respuesta` al registrar la primera respuesta.
  - Un método nuevo, `SlaService.alResolver`, guarda `minutos_resolucion` al resolver. Sin el tiempo en espera, y solo del último ciclo si hubo reapertura.
  - `alReabrir` lo limpia.
- Funciones puras del dominio para clasificar el cumplimiento de cada queja (cumple, incumple o pendiente) y armar los porcentajes.
- `GET /api/v1/reportes/resumen`, con el rango de fechas de registro (por defecto los últimos 30 días y como máximo 366) y los filtros opcionales de dependencia, categoría, zona y prioridad, dentro del alcance de `reportes.ver` (SPEC 11). Devuelve:
  - conteos por estado, categoría, dependencia y zona;
  - indicadores totales y desglosados por dependencia y por categoría.
- Frontend: `/reportes` (SPEC 06), con tarjetas, gráficas de barras de Recharts y una tabla equivalente por cada gráfica, más las tablas de indicadores.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Exportar a Excel o PDF (RF-40).
- Tendencias en el tiempo (series por día o por semana).
- Indicadores por zona o por técnico.
- Calificación de la atención (RF-37).
- Rellenar los minutos de quejas anteriores a esta spec: no cuentan en los promedios.
- Caché o tablas precalculadas de agregados.
- Enmascarado de datos personales en reportes (RNF-12). Este tablero no muestra datos personales.
- Tableros con alcance distinto del de `reportes.ver`.

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- `tickets`: se agregan `minutos_respuesta` y `minutos_resolucion`.
- Endpoints: la fila `GET /api/v1/reportes/resumen` pasa a decir "Técnico, Coordinador, Supervisor, Admin". Así coincide con la matriz de permisos de la sección 2 (Técnico: "Propios"), que es la que ya implementa SPEC 08. Se documentan los parámetros y la forma de la respuesta.

### `0029_indicadores`

```sql
ALTER TABLE tickets
  ADD COLUMN minutos_respuesta  integer NULL CHECK (minutos_respuesta  >= 0),
  ADD COLUMN minutos_resolucion integer NULL CHECK (minutos_resolucion >= 0);

CREATE INDEX tickets_creado_en_idx ON tickets (creado_en);
CREATE INDEX tickets_categoria_creado_idx ON tickets (categoria_id, creado_en);
```

| Columna | Se calcula | Valor |
| --- | --- | --- |
| `minutos_respuesta` | en `iniciar`, la primera vez (cuando se fija `primera_respuesta_en`, SPEC 30) | `minutosHabilesEntre(creado_en, primera_respuesta_en)` |
| `minutos_resolucion` | en `resolver` | `minutosHabilesEntre(sla_inicio_resolucion, resuelto_en) − sla_pausa_minutos`, con un mínimo de 0. Al reabrir vuelve a `NULL`, y se recalcula en la siguiente resolución |

- `minutosHabilesEntre` es la función de SPEC 30, con `jornada_laboral` y `calendario_laboral`.
- Como `alReabrir` reinicia `sla_inicio_resolucion` y `sla_pausa_minutos` (SPEC 30), una queja reabierta mide solo su último ciclo.
- No hay relleno: las quejas que ya tenían primera respuesta o resolución antes de la migración quedan en `NULL` y no cuentan en los promedios.
- El `down` borra los índices y las columnas.

### Cambio sobre SPEC 30

| Punto | Cambio |
| --- | --- |
| `SlaService.alIniciar` | Pasa a ser `async` y recibe `trx`. Cuando fija `primeraRespuestaEn`, también devuelve `minutosRespuesta`. Las llamadas de SPEC 22 se ajustan a la firma nueva |
| `SlaService.alResolver(ticket, resueltoEn, trx)` | Método nuevo. Devuelve `minutosResolucion`. Lo llama `AtencionService.resolver` (SPEC 22) después del método de dominio, dentro de su transacción |
| `SlaService.alReabrir` | Además devuelve `minutosResolucion: null` |
| `CambiosSla` y `TicketEscrituraRepository` | Incluyen y guardan `minutosRespuesta` y `minutosResolucion` |

Si el calendario no cubre el cálculo (`CALENDARIO_INCOMPLETO`, SPEC 27), la transición se revierte, igual que en el resto de SPEC 30.

### Cumplimiento (`domain/reportes/cumplimiento.ts`)

```ts
export type ResultadoPlazo = 'cumple' | 'incumple' | 'pendiente' | 'no_aplica';

export function cumplimientoRespuesta(t: {
  venceRespuesta: Date | null; primeraRespuestaEn: Date | null; estado: EstadoTicket;
}, ahora: Date): ResultadoPlazo;

export function cumplimientoResolucion(t: {
  venceResolucion: Date | null; resueltoEn: Date | null; estado: EstadoTicket;
  slaPausadoDesde: Date | null; slaRestanteMinutos: number | null;
}, ahora: Date): ResultadoPlazo;

// null si no hay medibles (cumple + incumple = 0). Redondeado a 1 decimal.
export function porcentaje(cumple: number, incumple: number): number | null;
```

Reglas, en este orden:

| Plazo | `no_aplica` | `cumple` | `incumple` | `pendiente` |
| --- | --- | --- | --- | --- |
| Respuesta | `venceRespuesta` es `NULL` (no aceptada, rechazada o anterior a SPEC 30) | `primeraRespuestaEn ≤ venceRespuesta` | `primeraRespuestaEn > venceRespuesta`, o sin primera respuesta y `ahora > venceRespuesta` | sin primera respuesta y `ahora ≤ venceRespuesta` |
| Resolución | estado `rechazada`, o nunca tuvo vencimiento (`venceResolucion` y `slaPausadoDesde` en `NULL`) | `resueltoEn ≤ venceResolucion` (en `resuelta` o `cerrada`) | `resueltoEn > venceResolucion`; abierta con `ahora > venceResolucion`; o en `en_espera` con `slaRestanteMinutos = 0` | abierta dentro del plazo, o en `en_espera` con `slaRestanteMinutos > 0` |

- **Las abiertas ya vencidas cuentan como incumplidas**, aunque no estén resueltas.
- El porcentaje es `cumple / (cumple + incumple) × 100`. Las `pendiente` y `no_aplica` no entran.
- En SQL, la misma tabla se expresa con `CASE` sobre las columnas, usando `now()` como `ahora`. Las funciones del dominio son la referencia, y una prueba compara los dos resultados sobre el mismo fixture.

### `GET /api/v1/reportes/resumen`

Protegido por `autenticar` y `requierePermiso('reportes.ver')`, con `filtroReportes(usuario)` de SPEC 11: el técnico ve sus asignadas, el coordinador su dependencia, y el supervisor y el administrador todas.

Query (Zod):

| Parámetro | Regla | Por defecto |
| --- | --- | --- |
| `desde`, `hasta` | `YYYY-MM-DD`, en `America/Guatemala`, días completos. `desde ≤ hasta` y como máximo 366 días; si no, `400 RANGO_INVALIDO` | `hasta` = hoy y `desde` = hoy − 29 días |
| `dependenciaId`, `categoriaId`, `zonaId` | entero > 0, opcional | — |
| `prioridad` | `baja`, `media`, `alta` o `urgente`, opcional | — |

- El rango se convierte a instantes UTC: `[desde 00:00, hasta + 1 día 00:00)` en la zona municipal (`ZONA_MUNICIPAL`, SPEC 27), aplicado sobre `tickets.creado_en`.
- Los filtros opcionales se **intersectan** con el filtro de alcance, nunca lo amplían. Un coordinador que pide otra `dependenciaId` recibe todo en 0, no un error.

Respuesta `200`:

```ts
export interface ResumenReportes {
  rango: { desde: string; hasta: string };
  total: number;
  porEstado: { estado: EstadoTicket; cantidad: number }[];                      // los 8, con 0
  porCategoria: { id: number; nombre: string; cantidad: number }[];             // solo las que tienen quejas, de mayor a menor
  porDependencia: { id: number | null; nombre: string | null; cantidad: number }[]; // null = sin dependencia (en revisión)
  porZona: { id: number; nombre: string; tipo: string; cantidad: number }[];
  indicadores: Indicadores;
  indicadoresPorDependencia: ({ id: number; nombre: string } & Indicadores)[];
  indicadoresPorCategoria: ({ id: number; nombre: string } & Indicadores)[];
  generadoEn: string;                                                           // ISO 8601 en UTC
}

export interface Indicadores {
  cantidad: number;
  horasPromedioRespuesta: number | null;     // promedio de minutos_respuesta / 60, 1 decimal; null sin datos
  horasPromedioResolucion: number | null;    // promedio de minutos_resolucion / 60, 1 decimal
  cumplimientoRespuesta: { cumple: number; incumple: number; pendiente: number; porcentaje: number | null };
  cumplimientoResolucion: { cumple: number; incumple: number; pendiente: number; porcentaje: number | null };
  escaladasAbiertas: number;                 // escalado = true y estado no final
}
```

- Los promedios solo usan las quejas con la columna llena.
- `horasPromedioResolucion` usa las quejas con `minutos_resolucion`, es decir, resueltas o cerradas, sin reapertura pendiente.
- Las listas se ordenan por `cantidad DESC` y luego por `nombre`.

Implementación (`ReporteLecturaRepository` de SPEC 11, ampliado):

- Un método `resumen(filtro, rango, filtrosOpcionales)` ejecuta consultas `GROUP BY` con el filtro de alcance traducido por `knex-filtro.ts` (SPEC 11), en una transacción de solo lectura (`REPEATABLE READ`), para que todas las cifras sean coherentes entre sí.
- `contarPorEstado` de SPEC 11 se mantiene y se reutiliza para `porEstado`.
- Un filtro de alcance `null` devuelve el resumen en cero sin consultar la base (SPEC 11).
- Meta de rendimiento: p95 < 500 ms con 500 000 quejas y un rango de 366 días (RNF-01 y RNF-04). Se apoya en los índices `tickets (creado_en)`, `(categoria_id, creado_en)` y `(estado, dependencia_id)` de SPEC 03.

Código nuevo en el manejador de errores: `RANGO_INVALIDO` (400).

### Frontend (`features/reportes/`)

| Elemento | Detalle |
| --- | --- |
| Filtros | Desde y hasta (por defecto los últimos 30 días), dependencia, categoría, zona y prioridad. Las opciones salen de `GET /dependencias` (SPEC 21), `GET /categorias` y `GET /zonas` (SPEC 14). El selector de dependencia se oculta si el alcance es `dependencia` o `propia`. "Aplicar" y "Limpiar". Los filtros se reflejan en la URL (query), para poder compartir el enlace |
| Tarjetas | Total de quejas, horas promedio de respuesta y de resolución, % de cumplimiento de respuesta y de resolución (con "cumple / incumple / pendiente" debajo), y escaladas abiertas. `—` cuando el valor es `null` |
| Gráficas | Barras de Recharts: por estado (8 barras, etiquetas traducidas), por categoría, por dependencia (con "Sin dependencia") y por zona (las 10 con más quejas y "Otras"). Las gráficas se cargan de forma diferida (`React.lazy`), así que Recharts no entra en el bundle inicial |
| Accesibilidad | Cada gráfica tiene título, `aria-describedby` y un botón "Ver como tabla" con los mismos datos. Los colores no son la única forma de distinguir |
| Tablas de indicadores | Por dependencia y por categoría: cantidad, horas de respuesta, horas de resolución, % de cumplimiento de respuesta y de resolución, y escaladas abiertas. Se pueden ordenar por cualquier columna |
| Estados | Cargando (esqueletos), sin quejas en el rango ("No hay quejas registradas entre … y …"), error (aviso con "Reintentar"), y `RANGO_INVALIDO` en el campo de fechas |
| Responsive | Desde 360 px, tarjetas y gráficas apiladas, y tablas con scroll horizontal **dentro** de su contenedor, nunca de la página |
| Textos | `locales/es/reportes.json`. Números y porcentajes con `Intl.NumberFormat('es-GT')` |

La ruta `/reportes` y sus roles (técnico, coordinador, supervisor y administrador) no cambian respecto de SPEC 06.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts  container.ts
    domain/reportes/cumplimiento.ts
    domain/reportes/rango-fechas.ts                    # validar y convertir el rango a UTC
    domain/repositories/reporte-lectura-repository.ts  # + resumen
    application/services/sla.service.ts                # alIniciar async, alResolver, alReabrir (cambio de SPEC 30)
    application/services/atencion.service.ts           # llama a alResolver (SPEC 22)
    application/services/reportes.service.ts           # resumen
    infrastructure/
      repositories/knex-reporte-lectura-repository.ts
      repositories/knex-ticket-escritura-repository.ts # guarda los minutos
      database/migrations/0029_indicadores.ts
    presentation/
      validators/reportes.validators.ts
      controllers/reportes.controller.ts
      routes/reportes.routes.ts
      middlewares/manejador-errores.ts                 # RANGO_INVALIDO
  tests/
    unit/reportes/cumplimiento.test.ts
    unit/reportes/rango-fechas.test.ts
    unit/sla/sla.service.test.ts                       # minutos de respuesta y resolución
    db/schema.test.ts                                  # columnas e índices
    db/reportes.api.test.ts                            # Supertest contra Postgres real, fixture de alcance
    db/reportes.rendimiento.test.ts                    # 500 000 quejas sintéticas, se ejecuta a pedido
frontend/
  package.json                                         # recharts
  src/
    features/reportes/api/reportes-api.ts
    features/reportes/pages/ReportesPage.tsx
    features/reportes/componentes/FiltrosReportes.tsx
    features/reportes/componentes/TarjetasIndicadores.tsx
    features/reportes/componentes/GraficaBarras.tsx    # carga diferida, con tabla equivalente
    features/reportes/componentes/TablaIndicadores.tsx
    locales/es/reportes.json
  tests/
    features/reportes/reportes-page.test.tsx
    features/reportes/tabla-indicadores.test.tsx
  e2e/reportes.spec.ts                                 # 360 px, API simulada
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición: las columnas nuevas, los roles de `GET /reportes/resumen` (agregando al Técnico, que resuelve el conflicto con la matriz) y sus parámetros y respuesta. Verificación: revisión del diff.
2. Crear `0029_indicadores.ts`. Ampliar `schema.test.ts`: existen las columnas y los índices, y un valor negativo es rechazado. Verificación: `npm run test:db` pasa.
3. Aplicar el cambio de SPEC 30: `alIniciar` async con `minutosRespuesta`, `alResolver` y la limpieza en `alReabrir`, con el guardado en `TicketEscrituraRepository` y la llamada desde `AtencionService.resolver`. Ampliar `sla.service.test.ts`, con la jornada 08:00–16:00 y fechas fijas:
   - Registrada el lunes 15:00 e iniciada el martes 09:00 → `minutosRespuesta = 120`.
   - Con 60 minutos hábiles en espera, `minutosResolucion` los descuenta.
   - Al reabrir, `minutosResolucion` vuelve a `null`, y al resolver de nuevo cuenta solo desde la reapertura.
   - Un segundo `iniciar` (después de reanudar) no cambia `minutosRespuesta`.

   Verificación: `npm test` pasa, incluidas las pruebas de SPEC 22 y 30.
4. Crear `domain/reportes/cumplimiento.ts` y `rango-fechas.ts`, con sus pruebas. Casos:
   - Un caso por cada celda de la tabla de cumplimiento, incluida la abierta vencida → `incumple` y la en espera con `slaRestanteMinutos = 0` → `incumple`.
   - `porcentaje(0, 0)` devuelve `null`, y `porcentaje(2, 1)` devuelve `66.7`.
   - El rango por defecto son 30 días que terminan hoy en Guatemala.
   - 367 días → `RANGO_INVALIDO`.
   - `desde > hasta` → `RANGO_INVALIDO`.
   - `2026-10-01..2026-10-31` se convierte a `[2026-10-01T06:00Z, 2026-11-01T06:00Z)`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
5. Ampliar `ReporteLecturaRepository` con `resumen` y crear `ReportesService`, el validador, el controlador y la ruta. Crear `tests/db/reportes.api.test.ts`, reutilizando los usuarios del fixture de SPEC 11 y agregando quejas con fechas, estados, minutos y vencimientos controlados. Casos:
   - El supervisor ve los conteos por estado, categoría, dependencia y zona, que suman el `total`.
   - El coordinador de A solo cuenta quejas de A, y con `dependenciaId` de B recibe todo en 0.
   - El técnico solo cuenta sus asignadas.
   - El vecino y el receptor → `403`.
   - Las quejas fuera del rango no cuentan, y el borde del día se resuelve en hora de Guatemala.
   - Los promedios ignoran los `NULL`.
   - El cumplimiento coincide con `cumplimiento.ts` sobre el mismo fixture, incluida una abierta vencida contada como incumplida.
   - `escaladasAbiertas` excluye las finales.
   - Los indicadores por dependencia y por categoría suman los totales.
   - Un rango de 400 días → `400 RANGO_INVALIDO`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Crear `tests/db/reportes.rendimiento.test.ts`, excluido de `test:db` y ejecutado con `npx jest tests/db/reportes.rendimiento.test.ts`. Inserta 500 000 quejas sintéticas con `generate_series` y mide 20 llamadas al resumen con un rango de 366 días como supervisor. Verificación: el p95 es menor a 500 ms, y el resultado se anota en el PR.
7. Frontend: instalar `recharts` y crear `reportes-api.ts`, `FiltrosReportes.tsx`, `TarjetasIndicadores.tsx` y `ReportesPage.tsx` (que reemplaza el placeholder). Crear `reportes-page.test.tsx` con `fetch` simulado. Casos:
   - Los filtros por defecto piden los últimos 30 días.
   - Cambiar los filtros actualiza la URL y la consulta.
   - El coordinador no ve el selector de dependencia.
   - Las tarjetas muestran `—` con `null`.
   - Hay mensaje vacío, error con "Reintentar" y `RANGO_INVALIDO` en el campo de fechas.

   Verificación: `npm test` y `npm run build` pasan en `frontend/`.
8. Crear `GraficaBarras.tsx` (carga diferida, con "Ver como tabla") y `TablaIndicadores.tsx` (ordenable), con `tabla-indicadores.test.tsx`. Casos:
   - Cada gráfica ofrece su tabla con los mismos números.
   - La zona agrupa en "Otras" a partir de la 11.ª.
   - Ordenar por % de cumplimiento funciona y deja los `null` al final.

   Crear `e2e/reportes.spec.ts` a 360×740 con la API simulada: no hay scroll horizontal de página, y las tablas se desplazan dentro de su contenedor. Verificación: `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` pasan, y Recharts sale en un chunk aparte.
9. Actualizar `CLAUDE.md`:
   - Los indicadores se calculan sobre `minutos_respuesta` y `minutos_resolucion`, guardados por `SlaService`.
   - La definición de cumplimiento: las abiertas vencidas cuentan como incumplidas.
   - El tablero filtra por fecha de registro.
   - Los filtros opcionales nunca amplían el alcance.

   Verificación manual con el backend, `seed:dev` y algunas quejas recorridas de punta a punta: `supervisor@vozmuni.test` ve en `/reportes` los conteos e indicadores, y `coordinador@vozmuni.test` solo los de Dirección de Obras.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye las columnas nuevas, y `GET /reportes/resumen` lista al Técnico, en coherencia con la matriz de permisos.
- [ ] Después de `migrate:latest`, `tickets` tiene `minutos_respuesta` y `minutos_resolucion`, que no aceptan valores negativos, y existen los índices nuevos.
- [ ] La primera vez que una queja pasa a `en_proceso` se guardan los minutos hábiles desde su registro, y no cambian en transiciones posteriores.
- [ ] Al resolver se guardan los minutos hábiles del último ciclo de resolución sin el tiempo en espera. Al reabrir vuelven a `NULL`, y al resolver de nuevo cuentan solo desde la reapertura.
- [ ] `GET /api/v1/reportes/resumen` sin parámetros devuelve las quejas registradas en los últimos 30 días (en hora de Guatemala). Un rango de más de 366 días, o con `desde > hasta`, responde `400 RANGO_INVALIDO`.
- [ ] Los conteos por estado (los 8, con 0), por categoría, por dependencia (incluida "sin dependencia") y por zona suman el `total`.
- [ ] El técnico solo ve sus quejas asignadas, el coordinador solo las de su dependencia, y el supervisor y el administrador todas. El vecino y el receptor reciben `403`.
- [ ] Los filtros de dependencia, categoría, zona y prioridad reducen el resultado dentro del alcance, y nunca muestran quejas fuera de él.
- [ ] Las horas promedio de respuesta y de resolución se calculan sobre los minutos guardados, ignoran las quejas sin dato y valen `null` si no hay ninguna.
- [ ] El porcentaje de cumplimiento de respuesta y el de resolución siguen la tabla de esta spec: las quejas abiertas ya vencidas cuentan como incumplidas, y las pendientes y las que no aplican no entran.
- [ ] Los indicadores se devuelven en total y desglosados por dependencia y por categoría, e incluyen las escaladas abiertas.
- [ ] Con 500 000 quejas y un rango de 366 días, el p95 del resumen es menor a 500 ms en la prueba de rendimiento.
- [ ] En `/reportes`, los usuarios con `reportes.ver` ven los filtros (reflejados en la URL), las tarjetas, las gráficas por estado, categoría, dependencia y zona, y las tablas de indicadores ordenables.
- [ ] Cada gráfica tiene una tabla equivalente accesible, y los colores no son la única forma de distinguir los datos.
- [ ] Recharts no está en el bundle inicial.
- [ ] A 360 px de ancho, `/reportes` no produce scroll horizontal de página, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] `CLAUDE.md` documenta de dónde salen los indicadores, la definición de cumplimiento y que el tablero filtra por fecha de registro.

## Decisiones

- **Sí:** RF-38 y RF-39 en una sola spec, como eligió el usuario: el mismo endpoint, la misma pantalla y el mismo alcance.
- **No:** separar los indicadores de RF-39.
- **Sí:** el rango de fechas se aplica a la fecha de registro (`creado_en`), en días completos de Guatemala, y los conteos muestran el estado actual de esas quejas.
- **No:** la actividad en el rango, ni criterios distintos para conteos y tiempos.
- **Sí:** los tiempos en horas hábiles, guardados en `minutos_respuesta` y `minutos_resolucion` cuando ocurren. Coincide con cómo se mide el SLA y mantiene el reporte rápido con 500 000 quejas.
- **No:** calcularlos al consultar, ni usar horas de reloj.
- **Sí:** para una queja reabierta y vuelta a resolver, el tiempo de resolución es **solo el del último ciclo**, como eligió el usuario. Coincide con el plazo de SLA de SPEC 30, pero una queja mal resuelta y reabierta puede parecer rápida. Está registrado en Riesgos.
- **No:** medir desde el registro hasta la última resolución.
- **Sí:** el cumplimiento cuenta las quejas abiertas ya vencidas como incumplidas, como eligió el usuario. Se calcula por separado para la respuesta y para la resolución, porque sus plazos y responsables son distintos. Lo de separarlos no se preguntó explícitamente.
- **No:** contar solo las quejas cerradas, ni un único porcentaje combinado.
- **Sí:** los indicadores se desglosan por dependencia y por categoría, y la zona aparece solo en los conteos.
- **Sí:** filtros opcionales de dependencia, categoría, zona y prioridad, como eligió el usuario, que siempre se intersectan con el alcance.
- **No:** solo el rango, ni solo dependencia y categoría.
- **Sí:** por defecto los últimos 30 días, y como máximo 366 días por consulta, para cumplir RNF-01 y RNF-04.
- **Sí:** el técnico ve el tablero con sus quejas asignadas. Así se resuelve el conflicto del documento a favor de la matriz de permisos, que es la que ya implementan SPEC 08 y 11, y se corrige la tabla de endpoints.
- **No:** quitarle el acceso al técnico.
- **Sí:** tarjetas, gráficas de Recharts (del stack del documento) con una tabla equivalente, y tablas de indicadores. Recharts se carga de forma diferida.
- **No:** solo tablas, ni solo backend.
- **Sí:** sin relleno de los minutos de quejas anteriores. Cuentan solo las quejas medidas desde esta spec, y el tablero lo indica con `—` cuando no hay datos.
- **Sí:** una transacción `REPEATABLE READ` para que todas las cifras del resumen sean coherentes entre sí.
- **Sí:** el agrupamiento "Otras" en zonas a partir de la 11.ª, los decimales, el redondeo y los textos los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Medir solo el último ciclo hace parecer rápida una queja mal resuelta y reabierta | Es una decisión explícita. El cumplimiento de resolución y la línea de tiempo (SPEC 28) siguen mostrando la reapertura. Si hace falta, una spec futura agrega un indicador de reaperturas. |
| El cumplimiento con las abiertas vencidas cambia de un día a otro sin que nadie actúe | Es el comportamiento deseado: refleja el atraso real. `generadoEn` indica cuándo se calculó. |
| Las quejas anteriores a esta spec no tienen minutos y sesgan los promedios de los primeros meses | Quedan fuera de los promedios (no se cuentan como 0). Si la municipalidad lo pide, una tarea aparte puede recalcularlos con el calendario. |
| Cambiar `jornada_laboral` o `calendario_laboral` después no recalcula los minutos ya guardados | Los minutos reflejan la regla vigente cuando ocurrió cada hecho, igual que los vencimientos de SPEC 30. |
| Las consultas `GROUP BY` sobre 500 000 quejas superan los 500 ms | Hay índices nuevos, un máximo de 366 días y una prueba de rendimiento antes de cerrar la spec. Si no alcanza, una spec futura agrega agregados precalculados. |
| `alIniciar` pasa a ser asíncrona y cambia su firma en SPEC 30 y 22 | El paso 3 la ajusta junto con sus llamadas, y conserva las pruebas existentes. |
| Depende de 7 specs, 6 de ellas en Borrador | Se implementa después de SPEC 32. Si cambian sus columnas o servicios, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Exportación a Excel y PDF.
- Tendencias en el tiempo.
- Indicadores por zona y por técnico.
- Satisfacción del vecino.
- Relleno de minutos históricos.
- Caché o agregados precalculados.

Cada uno de estos temas, cuando llegue, va en su propia spec.
