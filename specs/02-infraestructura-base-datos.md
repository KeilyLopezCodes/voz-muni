# SPEC 02 — Infraestructura de base de datos

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-22
> **Objetivo:** Levantar PostgreSQL 17 con docker-compose y conectar el backend con Knex, con configuración validada, el circuito de migraciones listo y `/health` informando el estado de la base de datos.

## Por qué existe esta spec

El pedido original fue "esquema de base de datos y migraciones Knex del modelo de datos".
Al revisarlo, se dividió en dos specs, porque hoy no existe base de datos que migrar.
Esta spec deja la infraestructura funcionando y verificable.
La SPEC 03 crea las tablas de la sección 6 del documento de definición sobre esta base.

## Alcance

**Incluido:**

- `docker-compose.yml` en la raíz con un único servicio `postgres` (imagen `postgres:17-alpine`), volumen nombrado y healthcheck.
- Script de inicialización que crea la base de pruebas `vozmuni_test` junto a `vozmuni`.
- Configuración del backend leída de `process.env` y validada con Zod al arrancar.
- `backend/.env.example` y carga de `.env` con el flag nativo `--env-file-if-exists` de Node.
- Configuración de Knex compartida por la app y la CLI, con la zona horaria de sesión en UTC.
- Scripts `migrate:latest` y `migrate:rollback` que ejecutan la CLI de Knex sobre `dist/`.
- Puerto `DatabaseHealthCheck` en el dominio y su adaptador con Knex.
- `GET /health` responde `200` si la base está arriba y `503` si está caída.
- Cierre ordenado del servidor HTTP y de Knex en `SIGINT` y `SIGTERM`.
- Pruebas contra Postgres real en un script aparte `npm run test:db`. `npm test` sigue sin necesitar Docker.
- Comandos nuevos en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Todas las tablas, tipos enum e índices del modelo de datos (SPEC 03).
- Convención para escribir migraciones en TypeScript (`migrate:make`, plantilla, nombres de archivo), que se define en SPEC 03.
- Seeds.
- Implementaciones de repositorios.
- Dockerfile del backend, Nginx y HTTPS.
- Pino, logs JSON y middleware de errores.
- CI.
- Respaldos de la base (RNF-06).
- Los vacíos del modelo de datos listados más abajo.

## Modelo de datos

Esta spec no crea tablas propias. La única tabla nueva es `knex_migrations` (con `knex_migrations_lock`), que crea Knex al ejecutar la primera migración.

Tipos que se agregan o cambian:

```ts
// src/domain/health/database-health-check.ts — nuevo puerto
export interface DatabaseHealthCheck {
  isUp(): Promise<boolean>;
}

// src/domain/health/health-status.ts — cambia
export interface HealthStatus {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: Date; // UTC
}

// src/application/dto/health.dto.ts — cambia
export interface HealthDto {
  status: 'ok' | 'degraded';
  database: 'up' | 'down';
  timestamp: string; // ISO 8601 en UTC
}

// src/application/services/health.service.ts — cambia la firma
//   constructor(clock: Clock, databaseHealthCheck: DatabaseHealthCheck)
//   check(): Promise<HealthDto>

// src/infrastructure/config/env.ts — nuevo
export interface Env {
  PORT: number;          // por defecto 3000
  DATABASE_URL: string;  // obligatoria, URL postgres://
}

// src/container.ts — cambia
export interface Container {
  port: number;
  healthService: HealthService;
  dispose(): Promise<void>; // cierra Knex
}
```

Respuestas de `GET /health`:

| Base de datos | Código | Cuerpo |
| --- | --- | --- |
| Arriba | `200` | `{ "status": "ok", "database": "up", "timestamp": "<ISO UTC>" }` |
| Caída o sin respuesta en 2 s | `503` | `{ "status": "degraded", "database": "down", "timestamp": "<ISO UTC>" }` |

Variables de entorno (`backend/.env.example`):

```text
PORT=3000
DATABASE_URL=postgres://vozmuni:vozmuni@localhost:5432/vozmuni
DATABASE_URL_TEST=postgres://vozmuni:vozmuni@localhost:5432/vozmuni_test
```

`DATABASE_URL_TEST` solo la leen las pruebas de `tests/db/`. No forma parte de `Env`.

### Archivos nuevos o modificados

```text
docker-compose.yml                                  # nuevo, en la raíz
docker/postgres/init/01-create-test-db.sql          # nuevo: CREATE DATABASE vozmuni_test
backend/
  .env.example                                      # nuevo
  package.json                                      # engines >=22.9, scripts, knex, pg, zod
  jest.config.js                                    # ignora tests/db/
  jest.db.config.js                                 # nuevo, solo tests/db/
  src/
    domain/health/database-health-check.ts          # nuevo
    domain/health/health-status.ts                  # cambia
    application/dto/health.dto.ts                   # cambia
    application/services/health.service.ts          # cambia
    presentation/controllers/health.controller.ts   # cambia: 200 / 503
    infrastructure/config/env.ts                    # nuevo: loadEnv() con Zod
    infrastructure/database/knex-config.ts          # nuevo: buildKnexConfig(url)
    infrastructure/database/knexfile.ts             # nuevo: config para la CLI
    infrastructure/database/knex-database-health-check.ts  # nuevo
    container.ts                                    # cambia
    server.ts                                       # cambia: puerto del container y apagado
  tests/
    unit/env.test.ts                                # nuevo
    unit/health.service.test.ts                     # cambia
    integration/health.test.ts                      # cambia: Container con fakes
    db/database.test.ts                             # nuevo
CLAUDE.md                                           # comandos nuevos
```

### `docker-compose.yml`

- Servicio `postgres` con la imagen `postgres:17-alpine`.
- Variables `POSTGRES_USER=vozmuni`, `POSTGRES_PASSWORD=vozmuni` y `POSTGRES_DB=vozmuni`. Son credenciales solo de desarrollo.
- Puerto `${POSTGRES_PORT:-5432}:5432`.
- Volumen nombrado `vozmuni-pgdata` en `/var/lib/postgresql/data`.
- `./docker/postgres/init` montado de solo lectura en `/docker-entrypoint-initdb.d`.
- Healthcheck con `pg_isready -U vozmuni -d vozmuni`.

### Configuración de Knex (`buildKnexConfig(url)`)

- `client: 'pg'` y `connection: url`.
- `pool.afterCreate` ejecuta `SET TIME ZONE 'UTC'` en cada conexión (RNF-23).
- `migrations.directory` es la carpeta `migrations/` junto al archivo compilado. `migrations.loadExtensions` es `['.js']`, para ignorar los `.d.ts` y `.map`.
- `migrations.tableName` es `knex_migrations`.

## Plan de implementación

1. Crear `docker-compose.yml` y `docker/postgres/init/01-create-test-db.sql`. Verificación: `docker compose up -d` deja `postgres` en estado `healthy`. `docker compose exec postgres psql -U vozmuni -lqt` lista `vozmuni` y `vozmuni_test`.
2. Instalar `zod`. Crear `src/infrastructure/config/env.ts`, donde `loadEnv(source = process.env)` devuelve `Env` o lanza un error que nombra la variable inválida. Crear `backend/.env.example` y `tests/unit/env.test.ts`, con tres casos: entrada válida, `DATABASE_URL` ausente y `PORT` por defecto 3000. Cambiar `engines` a `>=22.9` y el script `start` a `node --env-file-if-exists=.env dist/server.js`. Verificación: `npm test` pasa.
3. Instalar `knex` y `pg`. Crear `knex-config.ts` y `knexfile.ts`. Agregar un script `postbuild` que cree `dist/infrastructure/database/migrations`, porque `tsc` no emite carpetas vacías. Agregar los scripts `migrate:latest` y `migrate:rollback`, que ejecutan `node --env-file-if-exists=.env node_modules/knex/bin/cli.js --knexfile dist/infrastructure/database/knexfile.js`. Verificación: con `.env` copiado de `.env.example`, `npm run build && npm run migrate:latest` termina en 0 y crea `knex_migrations` en `vozmuni`, y `npm run migrate:rollback` termina en 0.
4. Crear el puerto `src/domain/health/database-health-check.ts` y `src/infrastructure/database/knex-database-health-check.ts`. El adaptador ejecuta `SELECT 1` en competencia con un tiempo límite de 2 s, y cualquier error o timeout devuelve `false`. Crear `jest.db.config.js`, el script `test:db` (`node --env-file-if-exists=.env node_modules/jest/bin/jest.js --config jest.db.config.js --runInBand`) y `tests/db/database.test.ts`. Esa prueba comprueba:
   - `SELECT 1` funciona.
   - `SHOW TIME ZONE` devuelve `UTC`.
   - `migrate.latest()` crea `knex_migrations`.
   - `isUp()` devuelve `true` con `DATABASE_URL_TEST`.
   - `isUp()` devuelve `false` en menos de 3 s con una URL hacia un puerto cerrado.

   Agregar `testPathIgnorePatterns` para `tests/db/` en `jest.config.js`. Verificación: `npm run test:db` pasa con Docker arriba, y `npm test` sigue pasando sin tocar Postgres.
5. Cablear `/health` con la base de datos:
   - `HealthStatus`, `HealthDto` y `HealthService` pasan a la forma del modelo de datos.
   - El controller responde `200` o `503` según `database`.
   - `buildContainer()` llama a `loadEnv()`, crea Knex y `KnexDatabaseHealthCheck`, y expone `port` y `dispose()`.
   - `server.ts` usa `container.port`.
   - Actualizar `tests/unit/health.service.test.ts`, con los casos base arriba → `ok`/`up` y base caída → `degraded`/`down`.
   - Reescribir `tests/integration/health.test.ts` con un `Container` armado a mano y un `DatabaseHealthCheck` falso, para cubrir `200` y `503`.

   Verificación: `npm test` pasa sin Docker. Con Docker arriba, `curl localhost:3000/health` da `200`. Con `docker compose stop postgres`, da `503`.
6. En `server.ts`, manejar `SIGINT` y `SIGTERM`: cerrar el servidor HTTP, luego `container.dispose()`, y terminar con código 0. Verificación: Ctrl+C sobre el backend (`node --env-file-if-exists=.env dist/server.js`) termina con código 0 y no quedan conexiones del backend en `pg_stat_activity`.
7. Actualizar `CLAUDE.md`:
   - Comandos `docker compose up -d`, `cp .env.example .env`, `npm run migrate:latest`, `npm run migrate:rollback` y `npm run test:db`.
   - Aclarar que `npm start` y los scripts de migración leen `backend/.env`.

## Criterios de aceptación

- [x] `docker compose up -d` deja el servicio `postgres` en estado `healthy` en `docker compose ps`.
- [x] Las bases `vozmuni` y `vozmuni_test` existen después del primer `docker compose up -d` sobre un volumen vacío.
- [x] Con `POSTGRES_PORT=5433 docker compose up -d`, Postgres queda expuesto en el puerto 5433.
- [x] Sin `DATABASE_URL` (y sin `.env`), `npm start` termina con código distinto de 0 y un mensaje que contiene `DATABASE_URL`.
- [x] Con `.env` copiado de `.env.example` y Postgres arriba, `GET /health` responde `200` con `{ "status": "ok", "database": "up", "timestamp": ... }`.
- [x] Con `docker compose stop postgres` y el backend corriendo, `GET /health` responde `503` con `{ "status": "degraded", "database": "down", ... }` en menos de 3 s.
- [x] Al volver a levantar Postgres, `GET /health` vuelve a `200` sin reiniciar el backend.
- [x] `npm run build && npm run migrate:latest` termina con código 0 y crea `knex_migrations` y `knex_migrations_lock` en `vozmuni`.
- [x] `npm run migrate:rollback` termina con código 0.
- [x] `npm test` pasa con Docker detenido.
- [x] `npm run test:db` pasa con Postgres arriba, e incluye la comprobación de que `SHOW TIME ZONE` devuelve `UTC`.
- [x] Ctrl+C sobre el backend (`node --env-file-if-exists=.env dist/server.js`) termina el proceso con código 0. Después, `SELECT count(*) FROM pg_stat_activity WHERE datname = 'vozmuni' AND pid <> pg_backend_pid()` devuelve 0. Nota: en Windows, Ctrl+C sobre `npm start` deja las mismas 0 conexiones, pero npm devuelve código 1 aunque el backend termine con 0, porque la señal también llega al proceso de npm.
- [x] `npm run typecheck`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] `src/domain/` y `src/application/` no importan `knex`, `pg` ni `zod`.
- [x] `CLAUDE.md` lista los comandos nuevos.

## Decisiones

- **Sí:** dividir el pedido en dos specs, infraestructura (esta) y esquema (SPEC 03). Cada una se verifica por separado, y el esquema necesita una base funcionando para probarse.
- **No:** infraestructura y esquema en una sola spec. Junta demasiadas decisiones de dominios distintos.
- **No:** infraestructura más tablas de catálogos ahora. Parte el modelo de datos en un punto arbitrario.
- **Sí:** solo Postgres en docker-compose. El backend sigue corriendo con npm. Dockerfile y Nginx van en su propia spec (RNF-20).
- **Sí:** Postgres 17. Está más probado con Knex y `pg` que la 18.
- **Sí:** `DATABASE_URL` validada con Zod al arrancar. Si la configuración es inválida, el proceso falla de inmediato con un mensaje claro, en vez de fallar en la primera consulta.
- **No:** variables sueltas `PG*` sin validación.
- **Sí:** `.env` cargado con `--env-file-if-exists` de Node (≥22.9). No agrega dependencias. En producción las variables llegan del entorno.
- **No:** el paquete `dotenv`.
- **Sí:** `loadEnv()` vive en `infrastructure/config/` y solo lo llama `container.ts`. Así `server.ts` respeta la regla `entrada-no-infrastructure` y obtiene el puerto del `Container`.
- **Sí:** una sola función `buildKnexConfig(url)` para la app, la CLI y las pruebas. Evita tres configuraciones que se desincronicen.
- **Sí:** `SET TIME ZONE 'UTC'` en cada conexión. Garantiza RNF-23 sin importar la configuración del servidor Postgres.
- **Sí:** migraciones en TypeScript compiladas a `dist/` y ejecutadas con la CLI de Knex desde ahí. No hace falta un loader de TS en producción.
- **No:** `tsx` o `ts-node` en runtime, ni migraciones en `.js`.
- **Sí:** `postbuild` crea `dist/infrastructure/database/migrations`. `tsc` no emite carpetas vacías y Knex falla si el directorio no existe.
- **Sí:** ninguna migración en esta spec. El circuito se prueba con la carpeta vacía (Knex crea `knex_migrations`), y la primera migración real llega en SPEC 03.
- **No:** migración baseline vacía, ni adelantar el enum de estados.
- **Sí:** `/health` comprueba la base de datos y responde `503` si está caída. Un balanceador o un orquestador pueden actuar sobre ese código.
- **Sí:** tiempo límite de 2 s dentro de `KnexDatabaseHealthCheck`, y no en la configuración global de Knex. Acota la espera de `/health` sin cambiar el comportamiento de las demás consultas.
- **Sí:** script aparte `test:db` con su propio `jest.db.config.js`. `npm test` sigue rápido y sin depender de Docker.
- **No:** todas las pruebas en `npm test`.
- **Sí:** base `vozmuni_test` creada por un script de inicialización de Postgres. Separa los datos de prueba de los de desarrollo en el mismo contenedor.
- **No:** un segundo contenedor para pruebas, ni usar la base de desarrollo.
- **Sí:** cierre ordenado en `SIGINT` y `SIGTERM`. Evita conexiones colgadas en Postgres al reiniciar.
- **Sí:** el esquema de SPEC 03 replicará la sección 6 del documento de definición tal cual. Los vacíos detectados se resuelven en la spec del módulo que los necesita, previa actualización del documento.

## Vacíos detectados en el modelo de datos

Durante la definición de esta spec se encontró que la sección 6 del documento de definición no cubre estos requerimientos **M**. No se resuelven aquí ni en SPEC 03. Quedan registrados para que la spec de cada módulo actualice primero el documento y luego agregue su migración.

| Requerimiento | Falta |
| --- | --- |
| RF-06 | `tickets.titulo` y `tickets.descripcion` |
| RF-08 | Mecanismo del correlativo anual de `Q-AAAA-NNNNNN` |
| RF-15 | Tabla de solicitudes de traslado con aprobación |
| RF-17 | Referencia de la queja duplicada a la original |
| RF-41 | Catálogo de motivos de rechazo |
| RF-33 | Tabla de plantillas de notificación |
| Sección 3 | Parámetros configurables (plazo de confirmación de 5 días hábiles) |
| RF-01, RF-03 | Verificación de correo y recuperación de contraseña. Los tokens de renovación y los intentos fallidos de inicio de sesión (RF-02, RNF-09) quedan resueltos en SPEC 08. |

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El puerto 5432 ya está ocupado por otro Postgres local | `POSTGRES_PORT` cambia el puerto publicado. `DATABASE_URL` en `.env` se ajusta igual. |
| El script de inicialización solo corre con el volumen vacío, así que un volumen previo queda sin `vozmuni_test` | `CLAUDE.md` documenta `docker compose down -v` para recrear el volumen. |
| `loadExtensions: ['.js']` impide que las pruebas con ts-jest encuentren migraciones `.ts` en SPEC 03 | SPEC 03 decide cómo cargar migraciones `.ts` en `test:db` (por ejemplo, `loadExtensions` según el entorno). Hoy no hay migraciones, así que no se rompe nada. |
| Con Postgres caído, el pool de Knex tarda en reconectar después de que la base vuelve | Un criterio de aceptación exige que `/health` vuelva a `200` sin reiniciar el backend. |
| Las credenciales `vozmuni/vozmuni` llegan a un entorno real | Solo existen en `docker-compose.yml` y `.env.example`, para desarrollo. La spec de despliegue define los secretos de producción. |

## Lo que **no** está en esta spec

- Tablas, enums e índices del modelo de datos (SPEC 03).
- Convención de migraciones en TypeScript (`migrate:make`).
- Seeds y repositorios.
- Dockerfile del backend, Nginx y HTTPS.
- Pino, logs JSON y middleware de errores.
- CI.
- Respaldos.
- Los vacíos del modelo de datos de la tabla anterior.

Cada uno de estos temas, cuando llegue, va en su propia spec.
