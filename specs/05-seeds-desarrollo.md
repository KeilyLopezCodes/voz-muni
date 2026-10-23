# SPEC 05 — Seeds de desarrollo con configuración municipal de ejemplo

> **Estado:** Implementado
> **Depende de:** SPEC 03
> **Fecha:** 2026-10-22
> **Objetivo:** Cargar con `npm run seed:dev` dependencias, categorías, zonas, políticas SLA y el calendario laboral 2026–2027 de ejemplo, solo en entornos que no son de producción, para tener un entorno de desarrollo funcional.

## Por qué existe esta spec

CLAUDE.md prohíbe fijar en el código categorías, dependencias o SLA municipales: son datos que el administrador gestiona (RF-41).
Aun así, desarrollar y probar el registro de quejas, la asignación y el SLA requiere catálogos con datos.
Esta spec carga una configuración **de ejemplo**, separada de los seeds base y bloqueada en producción, para que nunca se confunda con configuración real.

## Alcance

**Incluido:**

- Carpeta `seeds-desarrollo/` con 5 seeds idempotentes: dependencias, categorías, zonas, políticas SLA y calendario laboral.
- Script `npm run seed:dev`, que se niega a ejecutarse con `NODE_ENV=production`.
- Función pura `generarCalendario()` que produce una fila por día, con sus pruebas unitarias.
- Prueba en `test:db` que ejecuta los seeds dos veces y comprueba los conteos y fechas clave.
- Comando y orden de ejecución en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Roles. Ya los siembra `01_roles` de SPEC 03 con `seed:run`.
- Usuarios de desarrollo y contraseñas (spec de autenticación, RNF-08). `dependencias.coordinador_id` queda en `null`.
- Tickets, comentarios y demás datos transaccionales de ejemplo.
- `categorias.campos_extra` con contenido. Queda en `'[]'`, porque su forma la define la spec de RF-09.
- Asuetos locales (feria titular, 15 de agosto en la capital) y años posteriores a 2027.
- Pantallas de administración de catálogos (RF-41).
- Calendario y catálogos reales de producción, que carga el administrador.

## Modelo de datos

Esta spec no crea tablas ni columnas. Solo inserta filas en las tablas de SPEC 03.

### Archivos

```text
backend/
  package.json                                        # script seed:dev
  src/infrastructure/database/
    knexfile-desarrollo.ts                            # extiende knexfile: seeds → seeds-desarrollo/; lanza error si NODE_ENV=production
    seed-helpers/calendario.ts                        # generarCalendario(desde, hasta, asuetos): FilaCalendario[]
    seed-helpers/asuetos-guatemala.ts                 # ASUETOS_2026_2027 (lista literal)
    seeds-desarrollo/01_dependencias.ts
    seeds-desarrollo/02_categorias.ts
    seeds-desarrollo/03_zonas.ts
    seeds-desarrollo/04_politicas_sla.ts
    seeds-desarrollo/05_calendario_laboral.ts
  tests/
    unit/calendario.test.ts
    db/seeds-desarrollo.test.ts
CLAUDE.md
```

Los ayudantes viven en `seed-helpers/`, fuera de `seeds-desarrollo/`, porque Knex ejecuta como seed todo archivo de esa carpeta.

### Tipos

```ts
// seed-helpers/calendario.ts
export interface Asueto {
  fecha: string;        // 'AAAA-MM-DD'
  descripcion: string;
  mediodia: boolean;    // true = asueto desde mediodía, el día sigue siendo hábil
}
export interface FilaCalendario {
  fecha: string;        // 'AAAA-MM-DD'
  es_habil: boolean;
  descripcion: string | null;
}
// generarCalendario('2026-01-01', '2027-12-31', ASUETOS_2026_2027): FilaCalendario[]
```

Reglas de `generarCalendario`, calculadas en UTC:

- El sábado y el domingo tienen `es_habil = false`, con descripción `null` si no son asueto.
- Un asueto de día completo tiene `es_habil = false` y su descripción.
- Un asueto de mediodía tiene `es_habil = true` y la descripción `'<nombre> (asueto desde mediodía)'`.
- Los demás días tienen `es_habil = true` y descripción `null`.

### Contenido de ejemplo

**Dependencias** (`activa = true`, `coordinador_id = null`):

| nombre |
| --- |
| Dirección de Agua Potable |
| Dirección de Alumbrado Público |
| Dirección de Servicios Públicos |
| Dirección de Obras |

**Categorías** (`activa = true`, `campos_extra = '[]'`):

| nombre | dependencia |
| --- | --- |
| Agua potable | Dirección de Agua Potable |
| Alumbrado público | Dirección de Alumbrado Público |
| Recolección de basura | Dirección de Servicios Públicos |
| Baches | Dirección de Obras |

**Zonas:**

| nombre | tipo |
| --- | --- |
| Zona 1 | `zona` |
| Zona 2 | `zona` |
| Zona 3 | `zona` |
| Barrio El Centro | `colonia` |
| Colonia La Esperanza | `colonia` |
| Aldea San José | `aldea` |

**Políticas SLA:** la misma matriz para las 4 categorías, en horas hábiles. Son 16 filas en total.

| prioridad | horas_respuesta | horas_resolucion |
| --- | --- | --- |
| `urgente` | 2 | 24 |
| `alta` | 8 | 48 |
| `media` | 24 | 72 |
| `baja` | 48 | 120 |

La fila `Baches` / `media` = 72 h de resolución corresponde al ejemplo de la sección 1 del documento de definición.

**Asuetos (`ASUETOS_2026_2027`):**

| Fecha 2026 | Fecha 2027 | Descripción | Tipo |
| --- | --- | --- | --- |
| 01-01 | 01-01 | Año Nuevo | completo |
| 04-02 | 03-25 | Jueves Santo | completo |
| 04-03 | 03-26 | Viernes Santo | completo |
| 04-04 | 03-27 | Sábado Santo | completo |
| 05-01 | 05-01 | Día del Trabajo | completo |
| 06-30 | 06-30 | Día del Ejército | completo |
| 09-15 | 09-15 | Día de la Independencia | completo |
| 10-20 | 10-20 | Día de la Revolución | completo |
| 11-01 | 11-01 | Día de Todos los Santos | completo |
| 12-24 | 12-24 | Nochebuena | mediodía |
| 12-25 | 12-25 | Navidad | completo |
| 12-31 | 12-31 | Fin de año | mediodía |

Valores esperados de `calendario_laboral`:

- 2026: 365 filas y 253 días hábiles.
- 2027: 365 filas y 254 días hábiles.
- En total, 730 filas.

### Idempotencia

Cada seed usa `INSERT ... ON CONFLICT DO NOTHING` sobre su clave natural:

| Tabla | Clave natural |
| --- | --- |
| `dependencias` | `nombre` |
| `categorias` | `nombre` |
| `zonas` | (`nombre`, `tipo`) |
| `politicas_sla` | (`categoria_id`, `prioridad`) |
| `calendario_laboral` | `fecha` |

`categorias` y `politicas_sla` resuelven sus claves foráneas buscando por `nombre` la dependencia o la categoría. No usan ids fijos.

## Plan de implementación

1. Crear `seed-helpers/calendario.ts` con `generarCalendario()` y `seed-helpers/asuetos-guatemala.ts` con la lista literal. Crear `tests/unit/calendario.test.ts`, que comprueba:
   - 730 filas.
   - 253 y 254 días hábiles.
   - `2026-04-03` no hábil con `Viernes Santo`.
   - `2026-12-24` hábil con la descripción de mediodía.
   - `2026-10-24` (sábado) no hábil con descripción `null`.
   - `2026-10-22` (jueves) hábil.

   Verificación: `npm test` pasa.
2. Crear `knexfile-desarrollo.ts`, que reutiliza `buildKnexConfig`, apunta los seeds a `seeds-desarrollo/` y lanza un error con el mensaje `seed:dev no se ejecuta en producción` si `NODE_ENV=production`. Agregar el script `seed:dev` con el mismo patrón de `seed:run`. Crear `01_dependencias.ts`. Verificación: `npm run build && npm run seed:dev` termina en 0 y deja 4 dependencias. `NODE_ENV=production npm run seed:dev` termina con código distinto de 0.
3. Crear `02_categorias.ts` y `03_zonas.ts`. Verificación: `npm run seed:dev` deja 4 categorías, cada una con su dependencia correcta, y 6 zonas.
4. Crear `04_politicas_sla.ts`. Verificación: `npm run seed:dev` deja 16 políticas, y la de `Baches`/`media` tiene 24/72.
5. Crear `05_calendario_laboral.ts`, que inserta las filas de `generarCalendario()` en lotes. Verificación: `npm run seed:dev` deja 730 filas.
6. Crear `tests/db/seeds-desarrollo.test.ts`: migra, ejecuta `seed.run()` con el directorio `dist/.../seeds-desarrollo` **dos veces** y comprueba los conteos 4/4/6/16/730, la FK de cada categoría y la fila `2026-04-03`. Verificación: `npm run test:db` pasa.
7. Actualizar `CLAUDE.md` con `npm run seed:dev`, su orden (`migrate:latest` → `seed:run` → `seed:dev`) y la regla "los datos de `seeds-desarrollo/` son ficticios y nunca se cargan en producción".

## Criterios de aceptación

- [ x] Sobre una base recién migrada, `npm run seed:dev` termina con código 0.
- [ x] Después de `seed:dev` hay exactamente 4 dependencias, 4 categorías, 6 zonas, 16 políticas SLA y 730 filas de calendario.
- [x ] Ejecutar `npm run seed:dev` una segunda vez termina con código 0 y deja los mismos conteos.
- [ x] Si se cambia a mano el nombre de una zona y se vuelve a ejecutar `seed:dev`, el cambio se conserva y se agrega otra vez la zona original.
- [x ] `NODE_ENV=production npm run seed:dev` termina con código distinto de 0, muestra `seed:dev no se ejecuta en producción` y no inserta filas.
- [x ] `npm run seed:run` no inserta dependencias, categorías, zonas, políticas ni calendario.
- [ x] Cada categoría apunta a la dependencia de la tabla de contenido.
- [ x] La política `Baches` / `media` tiene `horas_respuesta = 24` y `horas_resolucion = 72`.
- [ x] `calendario_laboral` tiene 253 días hábiles en 2026 y 254 en 2027.
- [ x] `2026-04-03` tiene `es_habil = false` y descripción `Viernes Santo`.
- [x ] `2026-12-24` tiene `es_habil = true` y una descripción que contiene `asueto desde mediodía`.
- [ x] Todos los sábados y domingos de 2026 y 2027 tienen `es_habil = false`.
- [ x] Todas las dependencias tienen `coordinador_id = null` y todas las categorías tienen `campos_extra = '[]'`.
- [ x] `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [x ] `CLAUDE.md` documenta `seed:dev` y su orden de ejecución.

## Decisiones

- **Sí:** carpeta `seeds-desarrollo/` y script `seed:dev` separados de `seeds/` y `seed:run`. Los datos ficticios no pueden llegar a producción por accidente.
- **No:** todo en `seed:run`, ni una guarda de `NODE_ENV` dentro de cada seed (es fácil olvidarla en un seed nuevo).
- **Sí:** la guarda de producción vive en `knexfile-desarrollo.ts`. Un solo punto bloquea todos los seeds de desarrollo, incluidos los futuros.
- **Sí:** contenido propuesto en esta spec y basado en los ejemplos del documento (Agua Potable, alumbrado, basura, baches, Zona 1, Barrio El Centro, 72 h para baches). El usuario lo ajusta al revisar la spec.
- **Sí:** misma matriz de SLA para todas las categorías. Es suficiente para probar el cálculo de SLA, y las diferencias por categoría las configura el administrador.
- **Sí:** calendario 2026 y 2027 completo, una fila por día. Cubre tickets creados hoy cuyos plazos caen el año siguiente.
- **No:** solo asuetos, ni solo 2026.
- **Sí:** calendario en desarrollo, no en base. En producción, el administrador carga el calendario oficial con los asuetos locales.
- **Sí:** `generarCalendario()` como función pura con pruebas unitarias. La regla de días hábiles se prueba sin base de datos.
- **Sí:** Semana Santa como lista literal por año (2026: 2–4 de abril; 2027: 25–27 de marzo). Es explícita y fácil de revisar.
- **No:** calcular la fecha de Pascua con un algoritmo.
- **Sí:** el 24 y el 31 de diciembre quedan hábiles, con descripción de asueto desde mediodía. `es_habil` es booleano y no puede expresar medio día.
- **No:** marcarlos como no hábiles.
- **Sí:** `ON CONFLICT DO NOTHING` por clave natural. Respeta cambios hechos a mano, igual que `01_roles` de SPEC 03. Para volver al estado inicial: `migrate:rollback` hasta vaciar, `migrate:latest`, `seed:run` y `seed:dev`.
- **No:** `ON CONFLICT DO UPDATE`.
- **Sí:** claves foráneas resueltas por nombre, no por id. Las identidades dependen del orden de inserción y no son estables entre bases.
- **No:** usuarios de desarrollo. Requieren decidir el hash de contraseñas, que es de la spec de autenticación.

## Vacíos detectados en el modelo de datos

| Requerimiento | Falta |
| --- | --- |
| RF-27 | `calendario_laboral.es_habil` es booleano y no representa medios días hábiles (24 y 31 de diciembre). La spec de SLA decide si necesita horas hábiles por día. |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La lista de asuetos no coincide con el calendario oficial, por ejemplo si una ley traslada un feriado a lunes | Es data de desarrollo. La lista literal está en un solo archivo y se corrige editando una línea. En producción carga el calendario el administrador. |
| Alguien ejecuta `seed:dev` en producción con `NODE_ENV` sin definir | La guarda solo actúa con `NODE_ENV=production`. La spec de despliegue debe fijar `NODE_ENV=production` en el contenedor. |
| La matriz única de SLA oculta errores que solo aparecen con plazos distintos por categoría | Las pruebas de la spec de SLA deben crear sus propias políticas y no depender de estos seeds. |
| Los nombres de ejemplo se parecen a dependencias reales de una municipalidad | La regla de `CLAUDE.md` y el nombre de la carpeta dejan claro que son ficticios. |

## Lo que **no** está en esta spec

- Roles (ya están en SPEC 03).
- Usuarios y contraseñas.
- Tickets y datos transaccionales de ejemplo.
- Contenido de `campos_extra`.
- Asuetos locales y años posteriores a 2027.
- Administración de catálogos y carga de datos de producción.

Cada uno de estos temas, cuando llegue, va en su propia spec.
