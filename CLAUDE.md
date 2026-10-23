# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repository contains the project foundations. There is no business logic yet.

- `backend/`: the layered backend skeleton with `GET /health` and the layer dependency rules (SPEC 01), plus PostgreSQL 17 in docker-compose, Knex wiring, config validated with Zod, and `/health` reporting the database state (SPEC 02), plus the 14 tables of section 6 as Knex migrations, the insert-only `bitacora` trigger (SPEC 03), fictional development catalogs loaded with `seed:dev` (SPEC 05), and login, token renewal, logout, lockout, the `autenticar` / `requierePermiso` middlewares, the global error handler and the 6 roles with their permission matrix (SPEC 08).
- `frontend/`: the React + Vite SPA scaffold (SPEC 06), with the shared HTTP client, the role-based route guards, the MUI layout, the Spanish translation files and the feature-boundary rules. The pages are placeholders, and there is no login yet, so the browser session is always `null`.

It also contains:

- `Sistema de Gestión de Quejas Municipales — Definición de la Solución.md`: the product definition for **VozMuni**, a municipal complaint/ticketing system. It covers roles, the permission matrix, the ticket lifecycle, requirements RF-01–RF-42 and RNF-01–RNF-23, the architecture, the data model and the endpoints. Treat it as the source of truth. When a spec or the code disagrees with it, flag the conflict instead of picking one silently.
- `.agents/skills/spec` and `.agents/skills/spec-impl`: the spec-driven workflow skills. `skills-lock.json` pins them from `Klerith/fernando-skills`.

## Commands

Database (run from the repository root):

- `docker compose up -d`: start PostgreSQL 17 with the `vozmuni` and `vozmuni_test` databases. Set `POSTGRES_PORT` to publish a port other than 5432.
- `docker compose down -v`: remove the container and its volume. The init script that creates `vozmuni_test` only runs on an empty volume, so use this to recreate it.

Backend (run from `backend/`):

- `npm install`: install dependencies.
- `cp .env.example .env`: create the local configuration. `npm start`, `migrate:latest`, `migrate:rollback` and `test:db` read `backend/.env` through `--env-file-if-exists`; without it they use the process environment. The variables are validated with Zod in `infrastructure/config/env.ts`:
  - `DATABASE_URL`: required.
  - `JWT_SECRET`: required by the app, at least 32 characters. The backend does not start without it. The Knex CLI (`migrate:*`, `seed:*`) only needs `DATABASE_URL`.
  - `NODE_ENV`: `development`, `test` or `production`. Defaults to `development`.
  - `LOGIN_LIMITE_POR_VENTANA`: requests per IP to `/api/v1/auth/login` every 15 minutes. Defaults to 10.
  - `PORT`: defaults to 3000.
- `npm run typecheck`: type-check `src/` and `tests/` without emitting.
- `npm run build`: compile `src/` to `dist/`.
- `npm start`: run `dist/server.js` (port from `PORT`, default 3000). Requires `npm run build` first.
- `npm run migrate:latest` / `npm run migrate:rollback`: run the Knex CLI against the compiled migrations in `dist/`. Requires `npm run build` first.
- `npm run seed:run`: run the compiled base seeds in `dist/infrastructure/database/seeds/`. The folder is empty today: the 6 roles and their permissions come from the migration `0006_roles` (SPEC 08), not from a seed. Requires `npm run build` and `migrate:latest` first. Seeds are idempotent, so running it twice is safe.
- `npm run seed:dev`: run the compiled development seeds in `dist/infrastructure/database/seeds-desarrollo/` (example dependencias, categorias, zonas, politicas_sla, the 2026–2027 calendario_laboral and one user per role). Run it after the others: `migrate:latest` → `seed:run` → `seed:dev`. It refuses to run with `NODE_ENV=production`.
  - Development users: `vecino@vozmuni.test`, `receptor@vozmuni.test`, `tecnico@vozmuni.test`, `coordinador@vozmuni.test`, `supervisor@vozmuni.test` and `administrador@vozmuni.test`, all with the password `Desarrollo2026`. `tecnico` and `coordinador` belong to `Dirección de Obras`. These credentials are public and must never reach production.
  - To reset the example data, delete the users (or run `docker compose down -v`), roll back all migrations and run the three commands again. The `down` of `0006_roles` fails on purpose while any user has one of the 6 roles.
- `npm test`: run the Jest tests in `tests/` except `tests/db/`. Does not need Docker. Use `npx jest tests/unit/health.service.test.ts` for a single file.
- `npm run test:db`: build, then run `tests/db/` against real PostgreSQL using `DATABASE_URL_TEST`, with the migrations and seeds compiled in `dist/`. Requires `docker compose up -d`.
- `npm run lint:deps`: check the layer dependency rules in `.dependency-cruiser.cjs` (RNF-17).

Migration convention (SPEC 03):

- Migrations live in `backend/src/infrastructure/database/migrations/NNNN_modulo.ts`, with a 4-digit prefix.
- Each file exports `up(knex: Knex)` and `down(knex: Knex)`. The `down` undoes exactly what the `up` does.
- Migrations are written by hand. There is no `migrate:make`.
- A migration already merged to `main` is never edited. Changes go in a new migration.
- Seeds follow the same pattern in `seeds/NN_nombre.ts` and must be idempotent.
- The data in `seeds-desarrollo/` is fictional and is never loaded in production (SPEC 05). Helpers used by seeds live in `seed-helpers/`, because Knex runs every file in a seeds folder as a seed.

Frontend (run from `frontend/`):

- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server on `http://localhost:5173`. It proxies `/api` and `/health` to `http://localhost:3000`, so the backend must be running there (`npm start` in `backend/`) for API calls to work.
- `npm run build`: type-check `src/` and `tests/` and build to `dist/`.
- `npm test`: run the Vitest tests in `tests/`. Use `npx vitest run tests/shared/http-client.test.ts` for a single file.
- `npm run lint:deps`: check the feature boundaries in `.dependency-cruiser.cjs`.

## Workflow: spec-driven development

Work goes through numbered specs in `specs/NN-slug.md`, which follow `.agents/skills/spec/template.md`:

1. `/spec <one-sentence feature>` asks clarifying questions, then writes `specs/NN-slug.md` with state Draft. It never writes code.
2. A human changes the state to Approved. The agent never does this.
3. `/spec-impl NN-slug` refuses unless the state means Approved. It creates branch `spec-NN-slug` (controlled by `AutoCreateBranch` in `specs/.spec-config.yml`) and implements the plan one step at a time, pausing for diff review after each step. It never commits on its own and never adds anything outside the spec's scope.

The definition document is in Spanish. Write specs in one language and keep their state labels consistent (for example Borrador / Aprobado / Implementado) across all specs.

The project is a git repository with `main` as the base branch. `/spec-impl` needs a clean working tree before it creates the spec branch, so commit or stash pending changes first.

## Planned architecture

These points are spread across the definition document. Follow them when writing specs and code:

- **Generic core, municipal configuration.** The core is a generic ticket manager. Municipal concepts are configuration data, not code. Examples: Queja = Ticket, Vecino = Solicitante, Dependencia = Equipo. Categories, departments, SLAs, extra fields (`jsonb`) and notification templates are all admin-editable. Never hardcode a municipal category, department or SLA value.
- **Stack.** Both sides use TypeScript. The backend runs Node.js + Express with Zod validation, Knex + node-postgres and PostgreSQL. Tests use Jest + Supertest. The frontend is a React + Vite SPA with React Router, TanStack Query, React Hook Form and MUI. Everything runs in Docker / docker-compose behind Nginx.
- **Layered backend (`backend/src/`).** The layers are `presentation → application → domain ← infrastructure`.
  - `domain/` must not import Express, Knex or any database code. It defines repository interfaces that `infrastructure/repositories/` implements.
  - The interfaces and services are wired together in `container.ts`.
  - Controllers only translate between HTTP and DTOs and contain no business logic.
  - CI is expected to enforce these dependency rules (RNF-17).
- **Frontend layout.** The frontend is split into `features/{auth,tickets,reportes,admin}` plus `shared/`. `shared/` holds the HTTP client and the role-based route guards.
  - The route guards (`RequireRole`) are not security. They only avoid showing screens a role cannot use. Real authorization lives in the backend (RF-05), and every endpoint must enforce it on its own.
- **One home for business rules.** The node-cron jobs (80 % SLA alert, escalation, auto-close) live in `infrastructure/jobs/`. They call the same application services as the API and must not duplicate rules.
- **Ticket lifecycle** (section 3 of the definition document):
  - There are 8 states. Only `Cerrada` and `Rechazada` are final. The domain layer rejects any transition not in the table.
  - "Escalada" is a flag, not a state.
  - Time spent in `En espera` does not count toward the resolution SLA.
  - Reopening is allowed only from `Resuelta`, inside the confirmation window.
  - An approved transfer sends the ticket back to `En revisión`.
  - Every transition writes a `ticket_historial` row.
- **Authorization.** Permissions depend on role and are limited to the user's own department. Use the permission matrix in section 2 of the definition document.
  - The matrix lives in `roles.permisos` (jsonb) as `{ [accion]: alcance }`, loaded by `0006_roles` (SPEC 08). The actions and scopes are typed in `domain/auth/permisos.ts`.
  - Every business endpoint must use the `autenticar` middleware followed by `requierePermiso(accion)` (`presentation/middlewares/`). `autenticar` reads the user and the role's permissions from the database on every request and leaves `req.usuario`; `requierePermiso` returns `403 PERMISO_DENEGADO` or leaves `req.alcance`.
  - The middleware only decides whether the role may perform the action. Applying `req.alcance` to the resource (own tickets, department, assigned) is the job of each application service.
  - Errors leave the API as `{ codigo, mensaje }`. Use cases throw `ErrorDeAplicacion` (`application/errors/`), and `manejadorErrores` maps its `codigo` to the HTTP status.
- **Cross-cutting conventions:**
  - API routes start with `/api/v1` and are documented in OpenAPI 3.
  - Ticket numbers use the format `Q-AAAA-NNNNNN`.
  - Times are stored as `timestamptz` in UTC and displayed in `America/Guatemala`.
  - SLAs are measured in business hours against `calendario_laboral`.
  - `bitacora` is insert-only.
  - Logs are JSON from Pino with a correlation id, and the service exposes `/health`.
  - UI text lives in translation files, with Spanish as the default language.
