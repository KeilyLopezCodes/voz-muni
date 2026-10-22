# SPEC 01 — Estructura del backend en capas

> **Estado:** Aprobado
> **Depende de:** —
> **Fecha:** 2026-10-22
> **Objetivo:** Crear el proyecto `backend/` en TypeScript con las cuatro capas (presentation, application, domain, infrastructure), un `GET /health` que las atraviesa y la regla de dependencias entre capas verificada con dependency-cruiser.

## Por qué existe esta spec

Todas las specs siguientes escriben código dentro de estas capas.
Si la regla de dependencias (RNF-17) no existe desde el primer commit, la primera violación pasa desapercibida y se vuelve patrón.
El ejemplo `/health` existe solo para demostrar el cableado `domain ← infrastructure` a través de `container.ts`. No introduce reglas de negocio.

## Prerrequisito

`/spec-impl` crea la rama `spec-01-estructura-backend-capas` antes del paso 1, así que la carpeta tiene que ser un repositorio git **antes** de implementar:

- `git init` en la raíz del proyecto, con la rama `main`.
- Commit inicial con los archivos existentes (documento de definición, `CLAUDE.md`, `.agents/`, `skills-lock.json` y esta spec).
- Árbol de trabajo limpio (`git status --short` vacío).

Esto no forma parte del plan de implementación.

## Alcance

**Incluido:**

- Proyecto `backend/` con npm, Node 22 LTS, TypeScript en modo `strict` y Jest con ts-jest.
- Árbol completo de carpetas de la sección 6 del documento de definición, con `.gitkeep` en las carpetas vacías.
- Express mínimo: `src/app.ts`, `src/server.ts` y `src/container.ts`.
- `GET /health` atravesando las capas: puerto `Clock` en domain, `SystemClock` en infrastructure, `HealthService` en application, controller y ruta en presentation.
- Prueba unitaria de `HealthService` y prueba de integración de `GET /health` con Supertest.
- Reglas de dependencia entre capas en `backend/.dependency-cruiser.cjs` y el script `npm run lint:deps`.
- `backend/.gitignore`.
- Sección de comandos reales en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pino, logs JSON e id de correlación (RNF-21, salvo el endpoint `/health`).
- Middleware de errores, helmet, rate limiting y CORS.
- Docker, docker-compose, Nginx y PostgreSQL.
- Knex, `knexfile`, migraciones y seeds (solo se crean las carpetas vacías).
- Prefijo `/api/v1`, OpenAPI y Swagger UI.
- Pipeline de CI (GitHub Actions u otro).
- ESLint y Prettier.
- Frontend.
- Cualquier entidad de negocio (Ticket, SLA, usuarios).

## Modelo de datos

Esta spec no introduce tablas ni persistencia. Solo introduce los tipos del ejemplo `/health`.

```ts
// src/domain/health/health-status.ts
export interface HealthStatus {
  status: 'ok';
  timestamp: Date; // UTC
}

// src/domain/health/clock.ts  — puerto que implementa infrastructure
export interface Clock {
  now(): Date;
}

// src/application/dto/health.dto.ts — lo que sale por HTTP
export interface HealthDto {
  status: 'ok';
  timestamp: string; // ISO 8601 en UTC, p. ej. "2026-10-22T15:04:05.000Z"
}

// src/container.ts
export interface Container {
  healthService: HealthService;
}
```

Respuesta de `GET /health`: `200` con cuerpo `{ "status": "ok", "timestamp": "<ISO UTC>" }`.

### Árbol de archivos resultante

```text
backend/
  package.json
  package-lock.json
  tsconfig.json              # strict, incluye src/ y tests/, para typecheck y ts-jest
  tsconfig.build.json        # extiende tsconfig.json, solo src/, salida en dist/
  jest.config.js
  .dependency-cruiser.cjs
  .gitignore                 # node_modules/, dist/, coverage/, .env
  src/
    presentation/
      routes/                # health.routes.ts
      controllers/           # health.controller.ts
      middlewares/           # .gitkeep
      validators/            # .gitkeep
    application/
      services/              # health.service.ts
      dto/                   # health.dto.ts
    domain/
      health/                # health-status.ts, clock.ts
      ticket/                # .gitkeep
      sla/                   # .gitkeep
      repositories/          # .gitkeep
      errors/                # .gitkeep
    infrastructure/
      clock/                 # system-clock.ts
      database/
        migrations/          # .gitkeep
        seeds/               # .gitkeep
      repositories/          # .gitkeep
      mail/                  # .gitkeep
      storage/               # .gitkeep
      jobs/                  # .gitkeep
    container.ts
    app.ts                   # createApp(container): Express
    server.ts                # lee PORT (por defecto 3000) y llama listen
  tests/
    unit/health.service.test.ts
    integration/health.test.ts
```

### Reglas de dependencia (`.dependency-cruiser.cjs`)

| Regla | Prohíbe |
| --- | --- |
| `domain-no-capas-externas` | `src/domain` → `src/application`, `src/presentation`, `src/infrastructure`, `src/container.ts`, `src/app.ts`, `src/server.ts` |
| `domain-no-frameworks` | `src/domain` → paquetes `express`, `knex`, `pg` |
| `application-no-capas-externas` | `src/application` → `src/presentation`, `src/infrastructure` |
| `application-no-frameworks` | `src/application` → paquetes `express`, `knex`, `pg` |
| `presentation-no-infrastructure` | `src/presentation` → `src/infrastructure` |
| `infrastructure-no-presentation` | `src/infrastructure` → `src/presentation` |
| `infrastructure-application-solo-jobs` | `src/infrastructure` (excepto `src/infrastructure/jobs`) → `src/application` |
| `entrada-no-infrastructure` | `src/app.ts`, `src/server.ts` → `src/infrastructure` |
| `no-circular` | Cualquier ciclo de dependencias dentro de `src/` |

Todas las reglas tienen severidad `error`. `src/container.ts` es el único archivo fuera de `src/infrastructure` que puede importar desde `src/infrastructure`.

## Plan de implementación

1. Crear `backend/package.json` (con `"engines": { "node": ">=22" }`), `tsconfig.json`, `tsconfig.build.json` y `.gitignore`. Instalar `express`, y como dependencias de desarrollo `typescript`, `@types/node` y `@types/express`. Crear `src/domain/health/health-status.ts` y `src/domain/health/clock.ts`. Agregar los scripts `typecheck` (`tsc --noEmit`) y `build` (`tsc -p tsconfig.build.json`). Verificación: `npm run typecheck` termina sin errores.
2. Crear el resto del árbol de carpetas de `src/` con `.gitkeep` en cada carpeta vacía. Verificación: el árbol coincide con la sección "Árbol de archivos resultante" y `npm run typecheck` sigue pasando.
3. Crear `src/infrastructure/clock/system-clock.ts`, `src/application/dto/health.dto.ts` y `src/application/services/health.service.ts`. `HealthService` recibe un `Clock` por constructor y devuelve un `HealthDto`. Verificación: `npm run typecheck` pasa.
4. Instalar `jest`, `ts-jest` y `@types/jest`. Crear `jest.config.js`, el script `test` y `tests/unit/health.service.test.ts`, que usa un `Clock` falso con fecha fija y comprueba el `HealthDto` exacto. Verificación: `npm test` pasa.
5. Crear `src/presentation/controllers/health.controller.ts`, `src/presentation/routes/health.routes.ts`, `src/container.ts`, `src/app.ts` y `src/server.ts`. Agregar el script `start` (`node dist/server.js`). Verificación: `npm run build && npm start` y `curl http://localhost:3000/health` devuelven `200` con `{ "status": "ok", "timestamp": ... }`.
6. Instalar `supertest` y `@types/supertest`. Crear `tests/integration/health.test.ts`, que usa `createApp(buildContainer())` sin abrir un puerto. Verificación: `npm test` ejecuta las dos pruebas y ambas pasan.
7. Instalar `dependency-cruiser`. Crear `.dependency-cruiser.cjs` con las reglas de la tabla y el script `lint:deps` (`depcruise src --config .dependency-cruiser.cjs`). Verificación: `npm run lint:deps` termina con código 0 sobre el código actual.
8. Agregar a `CLAUDE.md` una sección de comandos del backend (`npm install`, `npm run typecheck`, `npm run build`, `npm start`, `npm test`, `npm run lint:deps`, todos desde `backend/`) y quitar la frase que dice que todavía no hay comandos de backend.

## Criterios de aceptación

- [ ] Desde `backend/`, `npm install` termina sin errores.
- [ ] `npm run typecheck` termina con código 0.
- [ ] `npm run build` genera `dist/server.js` y no incluye archivos de `tests/` en `dist/`.
- [ ] Con `npm start` corriendo, `GET http://localhost:3000/health` responde `200` con `status` igual a `"ok"` y `timestamp` en formato ISO 8601 terminado en `Z`.
- [ ] Con `PORT=4000 npm start`, el servidor escucha en el puerto 4000.
- [ ] `npm test` ejecuta exactamente 2 archivos de prueba (unitaria e integración) y ambos pasan.
- [ ] La prueba unitaria de `HealthService` no importa nada de `src/infrastructure` ni de `express`.
- [ ] `npm run lint:deps` termina con código 0 sobre el código entregado.
- [ ] Si se agrega temporalmente `import express from 'express';` en `src/domain/health/clock.ts`, `npm run lint:deps` termina con código distinto de 0 y menciona `domain-no-frameworks`.
- [ ] Si se agrega temporalmente un import de `src/infrastructure/clock/system-clock` en `src/application/services/health.service.ts`, `npm run lint:deps` falla y menciona `application-no-capas-externas`.
- [ ] Si se agrega temporalmente un import de `src/infrastructure/clock/system-clock` en `src/presentation/controllers/health.controller.ts`, `npm run lint:deps` falla y menciona `presentation-no-infrastructure`.
- [ ] Existen todas las carpetas de la sección 6 del documento de definición: `middlewares/`, `validators/`, `ticket/`, `sla/`, `repositories/` (en domain e infrastructure), `errors/`, `database/migrations/`, `database/seeds/`, `mail/`, `storage/` y `jobs/`.
- [ ] `src/domain/` no contiene ningún import de un paquete de `node_modules`.
- [ ] `CLAUDE.md` lista los comandos reales del backend.

## Decisiones

- **Sí:** dependency-cruiser para RNF-17. Las reglas son declarativas, se ejecutan con un solo comando y luego se llevan a CI sin cambios.
- **No:** eslint-plugin-boundaries. Obliga a introducir ESLint ahora, y ESLint quedó fuera de esta spec.
- **No:** pruebas de arquitectura con ts-arch en Jest. La librería es menos madura.
- **Sí:** Express mínimo con `/health` atravesando las capas. Demuestra el patrón puerto/adaptador y el cableado en `container.ts` sin reglas de negocio.
- **No:** solo carpetas vacías. Las reglas de dependencia no se pueden probar si no hay imports reales entre capas.
- **No:** usar la entidad Ticket como ejemplo. Eso pertenece a la spec del ciclo de vida.
- **Sí:** puerto `Clock` en domain para el ejemplo. Es la dependencia externa más simple que permite probar `HealthService` con una fecha fija.
- **Sí:** crear todo el árbol de la sección 6 desde ahora, con `.gitkeep`. Fija la estructura acordada antes de que las specs siguientes la llenen.
- **Sí:** se agregan `domain/health/` e `infrastructure/clock/`, que no están en el árbol del documento de definición. Son la casa del ejemplo `/health`.
- **Sí:** `infrastructure/jobs/` puede importar de `application`. CLAUDE.md exige que los jobs llamen a los mismos servicios de aplicación que la API. El resto de `infrastructure` no puede.
- **Sí:** `/health` fuera de `/api/v1`. RNF-21 nombra el endpoint como `/health`, y el prefijo `/api/v1` queda para otra spec.
- **Sí:** pruebas en `backend/tests/` separadas de `src/`. Así dependency-cruiser analiza solo código de producción y `dist/` no lleva pruebas.
- **Sí:** npm, Node 22 LTS, TypeScript `strict` y Jest con ts-jest, sin ESLint ni Prettier por ahora.
- **Sí:** puerto por defecto 3000, configurable con la variable de entorno `PORT`.
- **Sí:** `git init` como prerrequisito y no como paso del plan. `/spec-impl` necesita un repositorio para crear la rama antes del paso 1.
- **No:** CI en esta spec. Los scripts quedan listos para que una spec posterior los ejecute en un pipeline.
- **No:** Pino, Docker, PostgreSQL ni Knex. Cada uno amplía el alcance a otra área del sistema.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Las reglas de dependency-cruiser tienen un patrón mal escrito y nunca se disparan | Los criterios de aceptación exigen provocar tres violaciones a mano y ver que fallan. |
| Sin CI, nadie ejecuta `npm run lint:deps` y la regla se rompe en silencio | `CLAUDE.md` lista el comando. La spec de CI lo vuelve obligatorio. |
| Node 22 sale de soporte LTS en abril de 2027 | `engines` usa `>=22`. Migrar a Node 24 es un cambio aislado en una spec posterior. |
| Las carpetas con `.gitkeep` sugieren que algo ya está implementado | Las carpetas solo contienen `.gitkeep`, y cada spec futura reemplaza el `.gitkeep` al crear su primer archivo. |

## Lo que **no** está en esta spec

- Pino, id de correlación y logs JSON.
- Middleware de errores, helmet, rate limiting y CORS.
- Docker, docker-compose, Nginx, PostgreSQL y Knex.
- Prefijo `/api/v1` y OpenAPI.
- Pipeline de CI.
- ESLint y Prettier.
- Frontend.
- Entidades y reglas de negocio.

Cada uno de estos temas, cuando llegue, va en su propia spec.
