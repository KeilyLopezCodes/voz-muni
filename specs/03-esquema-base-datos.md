# SPEC 03 — Esquema de base de datos

> **Estado:** Aprobado
> **Depende de:** SPEC 02
> **Fecha:** 2026-10-22
> **Objetivo:** Crear con migraciones Knex en TypeScript las 14 tablas del modelo de datos de la sección 6 del documento de definición, con la bitácora protegida contra cambios y un seed de los 6 roles.

## Por qué existe esta spec

Es la segunda mitad del pedido "esquema de base de datos y migraciones Knex del modelo de datos".
La SPEC 02 deja PostgreSQL, Knex y el circuito de migraciones funcionando. Esta spec crea las tablas.
El esquema replica la sección 6 del documento tal cual. Los requerimientos que el documento no modela quedan registrados como vacíos y no se inventan aquí.

## Alcance

**Incluido:**

- Cuatro migraciones por módulo: `0001_catalogos`, `0002_usuarios`, `0003_tickets` y `0004_bitacora`.
- Las 14 tablas de la sección 6, con claves primarias, claves foráneas, restricciones e índices.
- Tipo enum de Postgres `estado_ticket` con los 8 estados.
- Trigger que impide `UPDATE`, `DELETE` y `TRUNCATE` sobre `bitacora` (RNF-13).
- Seed idempotente `01_roles` con los 6 roles y `permisos` vacíos.
- Configuración de seeds en `buildKnexConfig` y script `seed:run`.
- `test:db` compila antes y ejecuta las migraciones desde `dist/`.
- Prueba de esquema en `tests/db/schema.test.ts`.
- Convención para escribir migraciones, documentada en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Los vacíos del modelo de datos (tabla al final de esta spec y de SPEC 02).
- Permisos reales de cada rol (spec de autenticación y autorización).
- Datos municipales de ejemplo: dependencias, categorías, zonas, calendario y políticas SLA.
- Repositorios e implementaciones de acceso a datos.
- Generación del correlativo `Q-AAAA-NNNNNN`. Aquí solo se valida su formato.
- Script `migrate:make` o plantillas de generación.
- Validaciones de negocio en la base: tamaño y tipo de adjuntos, transiciones de estado y relación entre plazos de SLA.

## Modelo de datos

### Convenciones

- Toda clave primaria es `id bigint GENERATED ALWAYS AS IDENTITY`, salvo `calendario_laboral`, que usa `fecha` como clave primaria.
- Toda clave foránea es `bigint` con `ON DELETE RESTRICT`. Nada se borra en cascada: los registros se desactivan con `activo`/`activa`, y los tickets nunca se borran.
- Las fechas con hora son `timestamptz`, y `creado_en` tiene `DEFAULT now()`.
- Los valores cerrados se guardan en `snake_case` sin tildes. Las etiquetas visibles van en los archivos de traducción (RNF-16).
- `estado` usa el enum `estado_ticket`. `prioridad`, `canal` y `zonas.tipo` usan `text` con `CHECK`. `notificaciones.tipo` es `text` sin `CHECK`.
- Las columnas `jsonb` son `NOT NULL` con un valor por defecto vacío.

### Valores cerrados

| Tipo | Valores |
| --- | --- |
| `estado_ticket` (enum) | `nueva`, `en_revision`, `rechazada`, `asignada`, `en_proceso`, `en_espera`, `resuelta`, `cerrada` |
| `prioridad` (CHECK) | `baja`, `media`, `alta`, `urgente` |
| `canal` (CHECK) | `portal`, `ventanilla`, `telefono`, `redes`, `correo` |
| `zonas.tipo` (CHECK) | `zona`, `colonia`, `aldea` |

### `0001_catalogos`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `roles` | `id` | bigint identity | PK |
| | `nombre` | text | NOT NULL, UNIQUE |
| | `permisos` | jsonb | NOT NULL, DEFAULT `'{}'` |
| `dependencias` | `id` | bigint identity | PK |
| | `nombre` | text | NOT NULL, UNIQUE |
| | `coordinador_id` | bigint | NULL (FK a `usuarios` en `0002`) |
| | `activa` | boolean | NOT NULL, DEFAULT true |
| `categorias` | `id` | bigint identity | PK |
| | `nombre` | text | NOT NULL, UNIQUE |
| | `dependencia_id` | bigint | NOT NULL, FK `dependencias` |
| | `campos_extra` | jsonb | NOT NULL, DEFAULT `'[]'` |
| | `activa` | boolean | NOT NULL, DEFAULT true |
| `politicas_sla` | `id` | bigint identity | PK |
| | `categoria_id` | bigint | NOT NULL, FK `categorias` |
| | `prioridad` | text | NOT NULL, CHECK prioridad |
| | `horas_respuesta` | integer | NOT NULL, CHECK > 0 |
| | `horas_resolucion` | integer | NOT NULL, CHECK > 0 |
| | | | UNIQUE (`categoria_id`, `prioridad`) |
| `zonas` | `id` | bigint identity | PK |
| | `nombre` | text | NOT NULL |
| | `tipo` | text | NOT NULL, CHECK zonas.tipo |
| | | | UNIQUE (`nombre`, `tipo`) |
| `calendario_laboral` | `fecha` | date | PK |
| | `es_habil` | boolean | NOT NULL |
| | `descripcion` | text | NULL |

### `0002_usuarios`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `usuarios` | `id` | bigint identity | PK |
| | `nombre` | text | NOT NULL |
| | `email` | text | NULL, índice único sobre `lower(email)` |
| | `telefono` | text | NULL |
| | `dpi` | text | NULL, UNIQUE |
| | `password_hash` | text | NULL (un vecino registrado en ventanilla no tiene cuenta) |
| | `rol_id` | bigint | NOT NULL, FK `roles` |
| | `dependencia_id` | bigint | NULL, FK `dependencias` |
| | `activo` | boolean | NOT NULL, DEFAULT true |
| | | | CHECK (`email` IS NOT NULL OR `telefono` IS NOT NULL) |

Esta migración también agrega la FK `dependencias.coordinador_id → usuarios.id`, porque las dos tablas se referencian mutuamente.

### `0003_tickets`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `tickets` | `id` | bigint identity | PK |
| | `numero` | text | NOT NULL, UNIQUE, CHECK `~ '^Q-[0-9]{4}-[0-9]{6}$'` |
| | `solicitante_id` | bigint | NOT NULL, FK `usuarios` |
| | `categoria_id` | bigint | NOT NULL, FK `categorias` |
| | `dependencia_id` | bigint | NULL, FK `dependencias` (se asigna al aceptar) |
| | `asignado_a` | bigint | NULL, FK `usuarios` |
| | `estado` | estado_ticket | NOT NULL, DEFAULT `'nueva'` |
| | `prioridad` | text | NULL (se define en revisión), CHECK prioridad |
| | `canal` | text | NOT NULL, CHECK canal |
| | `zona_id` | bigint | NOT NULL, FK `zonas` |
| | `direccion` | text | NOT NULL |
| | `lat` | numeric(9,6) | NULL |
| | `lng` | numeric(9,6) | NULL |
| | `datos_extra` | jsonb | NOT NULL, DEFAULT `'{}'` |
| | `vence_respuesta` | timestamptz | NULL |
| | `vence_resolucion` | timestamptz | NULL |
| | `escalado` | boolean | NOT NULL, DEFAULT false |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| | `resuelto_en` | timestamptz | NULL |
| | `cerrado_en` | timestamptz | NULL |
| `ticket_historial` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, FK `tickets` |
| | `estado_anterior` | estado_ticket | NULL (creación) |
| | `estado_nuevo` | estado_ticket | NOT NULL |
| | `usuario_id` | bigint | NULL (transiciones del sistema), FK `usuarios` |
| | `motivo` | text | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `comentarios` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, FK `tickets` |
| | `autor_id` | bigint | NOT NULL, FK `usuarios` |
| | `cuerpo` | text | NOT NULL |
| | `es_interno` | boolean | NOT NULL, DEFAULT false |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `adjuntos` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, FK `tickets` |
| | `comentario_id` | bigint | NULL, FK `comentarios` |
| | `nombre` | text | NOT NULL |
| | `ruta` | text | NOT NULL |
| | `tipo_mime` | text | NOT NULL |
| | `tamano_bytes` | integer | NOT NULL, CHECK > 0 |
| `encuestas` | `id` | bigint identity | PK |
| | `ticket_id` | bigint | NOT NULL, UNIQUE, FK `tickets` |
| | `calificacion` | smallint | NOT NULL, CHECK entre 1 y 5 |
| | `comentario` | text | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `notificaciones` | `id` | bigint identity | PK |
| | `usuario_id` | bigint | NOT NULL, FK `usuarios` |
| | `ticket_id` | bigint | NULL, FK `tickets` |
| | `tipo` | text | NOT NULL |
| | `leida` | boolean | NOT NULL, DEFAULT false |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |

Índices de `0003_tickets`:

- `tickets (estado, dependencia_id)`, `tickets (asignado_a, estado)` y `tickets (vence_resolucion)`, que son los de la sección 6. `tickets (numero)` ya queda cubierto por su UNIQUE.
- `ticket_historial (ticket_id, creado_en)`, para la línea de tiempo (RF-25).
- `comentarios (ticket_id)` y `adjuntos (ticket_id)`.
- `notificaciones (usuario_id, leida)`.

### `0004_bitacora`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `bitacora` | `id` | bigint identity | PK |
| | `usuario_id` | bigint | NULL (acciones del sistema), FK `usuarios` |
| | `accion` | text | NOT NULL |
| | `entidad` | text | NOT NULL |
| | `entidad_id` | text | NULL (texto para cubrir claves no numéricas, como `calendario_laboral.fecha`) |
| | `detalle` | jsonb | NOT NULL, DEFAULT `'{}'` |
| | `ip` | inet | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |

- Índices: `bitacora (entidad, entidad_id)` y `bitacora (creado_en)`.
- La función `bitacora_solo_insercion()` lanza una excepción con el mensaje `bitacora es solo de inserción`.
- El trigger `BEFORE UPDATE OR DELETE ... FOR EACH ROW` llama a esa función.
- El trigger `BEFORE TRUNCATE ... FOR EACH STATEMENT` también la llama.
- El `down` borra los triggers, la función y la tabla.

### Seed `01_roles`

Inserta los roles `vecino`, `receptor`, `tecnico`, `coordinador`, `supervisor` y `administrador`, todos con `permisos = '{}'`. Usa `ON CONFLICT (nombre) DO NOTHING`, así que ejecutarlo dos veces deja exactamente 6 filas.

### Convención de migraciones

- Ubicación: `backend/src/infrastructure/database/migrations/NNNN_modulo.ts`, con prefijo de 4 dígitos.
- Cada archivo exporta `up(knex: Knex)` y `down(knex: Knex)`. El `down` deshace exactamente lo que hace el `up`.
- Las migraciones se escriben a mano. No hay `migrate:make`.
- Una migración ya mergeada a `main` no se edita. Los cambios van en una migración nueva.
- Los seeds siguen el mismo patrón en `seeds/NN_nombre.ts` y deben ser idempotentes.

### Archivos nuevos o modificados

```text
backend/
  package.json                                     # scripts seed:run y test:db (con build previo)
  src/infrastructure/database/
    knex-config.ts                                 # agrega seeds.directory y seeds.loadExtensions ['.js']
    migrations/0001_catalogos.ts                   # nuevo (reemplaza .gitkeep)
    migrations/0002_usuarios.ts                    # nuevo
    migrations/0003_tickets.ts                     # nuevo
    migrations/0004_bitacora.ts                    # nuevo
    seeds/01_roles.ts                              # nuevo (reemplaza .gitkeep)
  tests/db/
    knex-test.ts                                   # nuevo: Knex de pruebas con DATABASE_URL_TEST y directorios de dist/
    database.test.ts                               # cambia: usa knex-test.ts
    schema.test.ts                                 # nuevo
CLAUDE.md                                          # seed:run y convención de migraciones
```

## Plan de implementación

1. Agregar a `buildKnexConfig` la configuración de seeds (carpeta `seeds/` junto al archivo compilado, `loadExtensions: ['.js']`) y el script `seed:run`. Crear `tests/db/knex-test.ts`, que arma Knex con `DATABASE_URL_TEST` y apunta migraciones y seeds a `dist/infrastructure/database/`. Cambiar `test:db` para que ejecute `npm run build` antes de Jest, y hacer que `database.test.ts` use el helper. Verificación: `npm run test:db` pasa igual que en SPEC 02.
2. Crear `0001_catalogos.ts` con `roles`, `dependencias`, `categorias`, `politicas_sla`, `zonas` y `calendario_laboral`. Crear `schema.test.ts`: en `beforeAll` ejecuta `migrate.rollback(all)` y `migrate.latest()`, y comprueba que existen las 6 tablas con sus columnas (`information_schema.columns`). Verificación: `npm run test:db` pasa, y `npm run build && npm run migrate:latest && npm run migrate:rollback` termina en 0.
3. Crear `0002_usuarios.ts` con `usuarios`, el índice único de `lower(email)`, el CHECK de contacto y la FK `dependencias.coordinador_id`. Agregar pruebas para estos casos:
   - Un usuario sin email ni teléfono es rechazado.
   - Dos usuarios con `Ana@x.gt` y `ana@x.gt` violan la unicidad.
   - Borrar una dependencia con categorías falla por `RESTRICT`.

   Verificación: `npm run test:db` pasa.
4. Crear `0003_tickets.ts` con el enum `estado_ticket`, `tickets` (con sus 3 índices) y `ticket_historial`. Agregar pruebas para estos casos:
   - El enum tiene exactamente los 8 valores, en orden.
   - `numero = 'Q-26-1'` es rechazado y `Q-2026-000123` es aceptado.
   - `prioridad = 'critica'` es rechazado.
   - `canal = 'whatsapp'` es rechazado.

   Verificación: `npm run test:db` pasa.
5. Agregar a `0003_tickets.ts` las tablas `comentarios`, `adjuntos`, `encuestas` y `notificaciones`, con sus índices. Agregar pruebas para estos casos:
   - `calificacion = 6` es rechazada.
   - Una segunda encuesta para el mismo ticket viola UNIQUE.
   - Borrar un ticket con comentarios falla por `RESTRICT`.

   Verificación: `npm run test:db` pasa.
6. Crear `0004_bitacora.ts` con la tabla, sus índices, la función y los dos triggers. Agregar pruebas para estos casos:
   - Un `INSERT` funciona.
   - `UPDATE`, `DELETE` y `TRUNCATE` fallan con el mensaje `bitacora es solo de inserción`.

   Verificación: `npm run test:db` pasa.
7. Crear `seeds/01_roles.ts` y quitar los `.gitkeep` de `migrations/` y `seeds/`. Agregar una prueba que ejecuta `seed.run()` dos veces y comprueba 6 roles con los nombres exactos. Agregar una prueba final: después de `migrate.rollback(all)` no queda ninguna de las 14 tablas, ni el enum `estado_ticket`, ni la función `bitacora_solo_insercion`. Verificación: `npm run test:db` pasa.
8. Actualizar `CLAUDE.md` con el comando `npm run seed:run` y la convención de migraciones de esta spec.

## Criterios de aceptación

- [ ] `npm run build && npm run migrate:latest` sobre `vozmuni` vacía termina con código 0 y deja las 14 tablas de la sección 6.
- [ ] `npm run migrate:rollback` ejecutado hasta vaciar deja la base sin ninguna de las 14 tablas, sin `estado_ticket` y sin `bitacora_solo_insercion`.
- [ ] Ejecutar `npm run migrate:latest` otra vez después del rollback termina con código 0.
- [ ] `npm run seed:run` ejecutado dos veces deja exactamente 6 filas en `roles`, con los nombres `vecino`, `receptor`, `tecnico`, `coordinador`, `supervisor` y `administrador`.
- [ ] Toda clave primaria es `bigint` de identidad, salvo `calendario_laboral.fecha`.
- [ ] Toda clave foránea tiene `ON DELETE RESTRICT` (verificado en `information_schema.referential_constraints`).
- [ ] El enum `estado_ticket` tiene exactamente `nueva, en_revision, rechazada, asignada, en_proceso, en_espera, resuelta, cerrada`, en ese orden.
- [ ] `tickets.numero` rechaza valores que no cumplen `Q-AAAA-NNNNNN`.
- [ ] `tickets.prioridad`, `tickets.canal`, `politicas_sla.prioridad` y `zonas.tipo` rechazan valores fuera de su lista.
- [ ] `UPDATE`, `DELETE` y `TRUNCATE` sobre `bitacora` fallan con `bitacora es solo de inserción`.
- [ ] Existen los índices `tickets (estado, dependencia_id)`, `tickets (asignado_a, estado)` y `tickets (vence_resolucion)`.
- [ ] Las columnas con hora son `timestamp with time zone`.
- [ ] `npm run test:db` pasa con Postgres arriba.
- [ ] `npm test`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta `seed:run` y la convención de migraciones.

## Decisiones

- **Sí:** el esquema replica la sección 6 del documento de definición, sin tablas ni columnas extra. El documento es la fuente de verdad, y los vacíos se resuelven en la spec de cada módulo, actualizando primero el documento.
- **No:** completar ahora `titulo`, `descripcion`, traslados, tokens, etc.
- **Sí:** `bigint` de identidad como clave primaria. Es compacto y rápido en índices. El identificador público del ticket es `numero`.
- **No:** `uuid`.
- **Sí:** enum de Postgres solo para `estado_ticket`. Lo pide el documento, y el dominio fija los 8 estados.
- **Sí:** `text` con `CHECK` para `prioridad`, `canal` y `zonas.tipo`. Cambiar una lista es una migración simple. Un enum no permite quitar valores.
- **No:** todos como enum.
- **No:** tabla catálogo `prioridades` ahora. RF-41 la pide, pero la sección 6 no la modela. Queda como vacío.
- **Sí:** `notificaciones.tipo` sin `CHECK`. Sus valores los define la spec de notificaciones.
- **Sí:** valores en `snake_case` sin tildes. Separa datos de presentación (RNF-16).
- **Sí:** `ON DELETE RESTRICT` en todas las claves foráneas. La trazabilidad completa impide perder historial, y las entidades se desactivan en lugar de borrarse.
- **No:** `CASCADE` en los hijos del ticket.
- **Sí:** cuatro migraciones por módulo con prefijo numérico. El orden se lee de un vistazo y el rollback se hace por bloque.
- **No:** una migración por tabla, ni una sola migración.
- **Sí:** la FK `dependencias.coordinador_id` se agrega en `0002_usuarios`. Resuelve la referencia circular entre `dependencias` y `usuarios`.
- **Sí:** trigger en Postgres para la bitácora, incluido `TRUNCATE`. Protege aunque un error del código lo intente.
- **No:** proteger la bitácora solo en la aplicación, ni con un rol de base de datos con `REVOKE`.
- **Sí:** seed idempotente de los 6 roles con `permisos = '{}'`. Los permisos reales los define la spec de autorización.
- **Sí:** `test:db` compila y migra desde `dist/`. Prueba el mismo artefacto que producción y mantiene `loadExtensions: ['.js']` de SPEC 02.
- **No:** cargar migraciones `.ts` con ts-jest.
- **Sí:** `email` y `telefono` opcionales, pero al menos uno obligatorio. RF-07 permite registrar en ventanilla a un vecino sin correo, y RF-35 consulta por cualquiera de los dos.
- **Sí:** `password_hash` opcional. Un vecino registrado por un receptor no tiene cuenta todavía.
- **Sí:** unicidad de `email` sin distinguir mayúsculas, con un índice sobre `lower(email)`.
- **Sí:** `tickets.prioridad` y `tickets.dependencia_id` opcionales. Se definen en la revisión (RF-12, RF-13).
- **Sí:** `zona_id` y `direccion` obligatorias. RF-06 exige la ubicación al registrar.
- **Sí:** `categorias.campos_extra` con valor por defecto `'[]'` (lista de definiciones de campo) y `tickets.datos_extra` con `'{}'` (valores por nombre de campo). La forma exacta la define la spec de RF-09.
- **Sí:** `bitacora.entidad_id` como `text`. Cubre claves no numéricas.
- **Sí:** el formato de `numero` se valida con `CHECK`, pero el correlativo no se genera aquí. La generación es un vacío registrado (RF-08).
- **No:** restricciones de negocio en la base, como tamaño o tipo de adjunto, transiciones de estado o plazos de SLA. Viven en el dominio y en la aplicación, que son configurables.

## Vacíos detectados en el modelo de datos

Se mantienen los de SPEC 02, más el encontrado al definir esta spec:

| Requerimiento | Falta |
| --- | --- |
| RF-41 | Catálogo administrable de prioridades. Hoy `prioridad` es una lista fija en `CHECK`. |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `test:db` es más lento porque compila antes | Es un script aparte. `npm test` no cambia. |
| Una migración mergeada se edita y diverge entre entornos | La convención lo prohíbe y queda en `CLAUDE.md`. |
| El `down` de una migración no deshace todo su `up` | Una prueba exige que, después de `rollback(all)`, no quede ninguna tabla, enum ni función. |
| La lista fija de prioridades contradice "nunca fijar un valor municipal" cuando se implemente RF-41 | Está registrada como vacío. Cambiar el `CHECK` por una FK a un catálogo es una migración nueva. |
| `TRUNCATE` bloqueado complica limpiar la base en pruebas | Las pruebas limpian con `migrate.rollback(all)`, que hace `DROP TABLE`, y los triggers no lo bloquean. |

## Lo que **no** está en esta spec

- Los vacíos del modelo de datos de SPEC 02 y de esta spec.
- Permisos reales de los roles.
- Datos municipales de ejemplo.
- Repositorios.
- Generación del correlativo de `numero`.
- `migrate:make` y plantillas.
- Reglas de negocio en la base de datos.

Cada uno de estos temas, cuando llegue, va en su propia spec.
