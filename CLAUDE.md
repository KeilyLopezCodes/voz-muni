# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

This repository contains the project foundations. There is no business logic yet.

- `backend/`: the layered backend skeleton with `GET /health` and the layer dependency rules (SPEC 01), plus PostgreSQL 17 in docker-compose, Knex wiring, config validated with Zod, and `/health` reporting the database state (SPEC 02), plus the 14 tables of section 6 as Knex migrations, the insert-only `bitacora` trigger (SPEC 03), fictional development catalogs loaded with `seed:dev` (SPEC 05), and login, token renewal, logout, lockout, the `autenticar` / `requierePermiso` middlewares, the global error handler and the 6 roles with their permission matrix (SPEC 08), password recovery by email with Nodemailer and templates stored in the database (SPEC 09), internal user management by the administrator under `/api/v1/admin/usuarios` (SPEC 10), the per-resource scope filters for tickets, reports and the audit log with read-only repositories (SPEC 11), complaint registration with `POST /api/v1/tickets` and the neighbor lookup `GET /api/v1/vecinos` (SPEC 12), the walk-in neighbor sign-up `POST /api/v1/vecinos` (SPEC 13), and per-category extra fields with `GET /api/v1/categorias`, `GET /api/v1/zonas` and `PUT /api/v1/admin/categorias/:id/campos-extra` (SPEC 14), and optional complaint coordinates validated against the municipality bounding box stored in the generic `parametros` table (SPEC 15), and the neighbor's own sign-up with email verification `POST /api/v1/auth/registro` and `POST /api/v1/auth/verificar` (SPEC 16), and the supervisor's triage with `POST /api/v1/tickets/:id/transiciones` and `GET /api/v1/tickets/triage` (SPEC 19).
- `frontend/`: the React + Vite SPA scaffold (SPEC 06), with the shared HTTP client, the role-based route guards, the MUI layout, the Spanish translation files and the feature-boundary rules. The public sign-up pages `/registro` and `/verificar` work (SPEC 16, with React Hook Form). Login, the real browser session with token renewal shared across tabs, logout, `/recuperar` and `/restablecer` work (SPEC 17). The step-by-step complaint form in `/tickets/nueva` works for the vecino and for the walk-in desk, with extra fields per category and an optional Leaflet map, verified at 360×740 with Playwright (SPEC 18), and the supervisor's `/triage` inbox with its side panel (SPEC 19). The other business pages (`/tickets`, `/reportes`, `/admin`) are still placeholders.

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
  - `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`: required. `SMTP_PORT` defaults to 587 and `SMTP_SECURE` to `false` (STARTTLS).
  - `MAIL_FROM`: required, `Nombre <correo>` or just an address.
  - `APP_URL`: required, the frontend URL without a trailing slash. Recovery links point to `APP_URL/restablecer?token=…`.
  - `RECUPERACION_LIMITE_POR_VENTANA`: requests per IP to `/api/v1/auth/recuperar` every 15 minutes. Defaults to 5.
- Email in development (SPEC 09): create a free Ethereal account at `https://ethereal.email/create` and copy its user and password into `SMTP_USER` / `SMTP_PASS` with `SMTP_HOST=smtp.ethereal.email`. Ethereal never delivers to real inboxes. After each send the backend logs a preview link (`vista previa en https://ethereal.email/message/…`), and every message is also in that account's inbox at `https://ethereal.email/messages`. Tests never use SMTP: they inject an in-memory `EnviadorCorreo` through `buildContainer(env, { enviadorCorreo })`.
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
- `npm run test:e2e`: run the Playwright tests in `e2e/` (project `chromium-360`, viewport 360×740). Install the browser once with `npx playwright install chromium`: npm in this environment blocks install scripts, so it is not downloaded by `npm install`. The config starts `npm run dev` (or reuses one already on `5173`), and the tests mock the API, the session and the OpenStreetMap tiles with `page.route`, so they need no backend, database or internet. Use `npx playwright test e2e/registro-vecino.spec.ts` for a single file. They are not part of `npm test` (Vitest only runs `tests/**/*.test.{ts,tsx}`) nor of CI yet.

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
- **Browser session (SPEC 17).** `main.tsx` mounts `features/auth/AuthProvider`, which hands the session to `SessionProvider` in `shared/`; `shared/` never imports the feature.
  - **Where each token lives:** the access token (15 min) only in memory, in a module variable of `AuthProvider.tsx`; the refresh token (7 days) in `localStorage['vozmuni.refreshToken']` through `features/auth/sesion/almacen-sesion.ts` (in memory if `localStorage` is blocked). Never put a token in `sessionStorage`, cookies or logs.
  - **Renew only with `renovar()`** (`features/auth/sesion/renovador.ts`). Never call `/auth/refresh` directly: the backend rotates the token and revokes every session when a rotated one is reused (SPEC 08). `renovar()` shares one promise per tab and, across tabs, runs inside `navigator.locks` (`vozmuni-refresh`), rereading `localStorage` once it holds the lock. Accepted risk (SPEC 17): Chromium propagates `localStorage` between tabs asynchronously, so about 1 in 25 truly simultaneous renewals in two tabs still presents a rotated token and the backend revokes every session (the user logs in again). The fix, if needed, is IndexedDB inside the lock.
  - The HTTP client calls `setUnauthorizedHandler` on a `401` (never for `/auth/*`) and retries the request once. Pages just use `apiClient`; they never handle token expiry. A network error while renewing keeps the session.
  - The session is shared across tabs with the `storage` event: a logout in one tab sends the others to `/login`, and a login recovers the session in the others.
  - `useCerrarSesion()` (`shared/auth/session.ts`) clears the token, the session and the TanStack Query cache and goes to `/login`, even if `/auth/logout` fails. `useIniciarSesion()` (`AuthProvider`) is used after a response of login or `restablecer`; a role outside `ROLES` creates no session.
  - While the stored session is being recovered, `RequireRole` shows a spinner instead of redirecting. When it does send to `/login`, it passes the original path in `state.desde`; `destinoTrasLogin` returns there only if it is an internal protected route allowed for the role.
  - Login messages per `codigo` (`CREDENCIALES_INVALIDAS`, `CUENTA_BLOQUEADA`, `CORREO_NO_VERIFICADO` with a link to `/registro`, `DEMASIADAS_PETICIONES`, network) live in `locales/es/auth.json`. `/restablecer` serves both recovery and invitation links and logs in with the response.
- **One home for business rules.** The node-cron jobs (80 % SLA alert, escalation, auto-close) live in `infrastructure/jobs/`. They call the same application services as the API and must not duplicate rules.
- **Complaint registration (SPEC 12).** `POST /api/v1/tickets` uses `autenticar` + `requierePermiso('tickets.crear')`, and the scope decides the body:
  - `propia` (vecino): registers for themself, `canal` is always `portal`, and sending `solicitanteId` or `canal` is a `400`.
  - `a_nombre_de_vecino` (receptor) and `todas` (supervisor): must send `solicitanteId` (an active vecino) and a `canal` other than `portal`. They find the neighbor with `GET /api/v1/vecinos?email=|telefono=|dpi=` (exact match, masked contact, never the DPI).
  - `registrado_por` is always the authenticated user, and the first `ticket_historial` row has `estado_anterior = null`. Every ticket is born through `Ticket.registrar()` in `domain/ticket/ticket.ts`.
  - Numbers are `Q-AAAA-NNNNNN`: the year is the calendar year in `America/Guatemala` (`anioGuatemala`), and the counter comes from the `correlativos` table, incremented with `INSERT … ON CONFLICT DO UPDATE … RETURNING` in the same transaction as the ticket and its history, so concurrent registrations get consecutive numbers and a rollback leaves no gaps. Never compute the number with `MAX(numero) + 1`.
  - The body is a strict Zod schema; extra fields such as `datosExtra`, `lat`, `lng`, `prioridad` or `estado` answer `400` until their specs exist. Title, description and address ranges are domain rules (`TITULO_INVALIDO`, `DESCRIPCION_INVALIDA`, `DIRECCION_INVALIDA`).
  - The `queja_registrada` email is sent after the commit without waiting, with the link `APP_URL/consulta?numero=…`.
- **Walk-in flow (SPEC 13).** A receptor or supervisor (scope `a_nombre_de_vecino` or `todas` of `tickets.crear`) serves a neighbor in three steps:
  1. Look them up with `GET /api/v1/vecinos?email=|telefono=|dpi=`.
  2. If they do not exist, create them with `POST /api/v1/vecinos` `{ nombre, dpi, email?, telefono? }`: DPI is required, plus an email or a phone. The neighbor is active, has no password and no department. Duplicate email or DPI answers `409` with no data about the existing user.
  3. Register the complaint with `POST /api/v1/tickets` using that `solicitanteId` and a channel other than `portal`.
  - Neighbor phones are Guatemalan, 8 digits, normalized with `normalizarTelefono` (`5555-0000` → `55550000`) both when saving and when searching. Phones are not unique; email and DPI are.
  - A neighbor with an email receives the `invitacion_vecino` email with a 24-hour single-use link (`restablecimientos.tipo = 'invitacion'`) to set their password in `/auth/restablecer`. If it expires, `/auth/recuperar` sends a new link: it serves any active user with an email, with or without a password.
  - Neighbor rules live in `domain/usuarios/vecino.ts`.
- **Extra fields per category (SPEC 14).** `categorias.campos_extra` is admin-edited data, never code:
  - It is a list of up to 20 definitions `{ clave, etiqueta, ayuda?, requerido, orden, tipo, … }` with types `texto` (`min`, `max` ≤ 500, `patron`), `numero` (`min`, `max`, `entero`), `fecha` (`min`, `max`, `noFutura`), `seleccion` (`opciones`) and `si_no`. `validarDefinicion` in `domain/categorias/campo-extra.ts` is the only gate for a definition.
  - `tickets.datos_extra` stores the values by `clave`, validated by `validarDatosExtra` (`domain/categorias/datos-extra.ts`): unknown keys are rejected, texts are trimmed, only present fields are stored, and `noFutura` compares against today in `America/Guatemala`. Registration reads the category's fields in the same transaction (`FOR SHARE`) and validates before taking the ticket number.
  - The admin replaces the whole list with `PUT /api/v1/admin/categorias/:id/campos-extra` (`admin.catalogos`). If the category already has tickets, only compatible changes are allowed (`cambiosIncompatibles` in `domain/categorias/compatibilidad.ts`): labels, help, order, dropping `requerido`, widening limits, adding options or adding optional fields. Removing a field, changing its type, making it required, adding a required field, narrowing limits, changing the pattern or removing an option answer `409 CAMBIO_INCOMPATIBLE`.
  - The form reads `GET /api/v1/categorias` (active categories with an active department, with their `camposExtra` and, since SPEC 19, their `dependencia: { id, nombre }`) and `GET /api/v1/zonas`, both behind `tickets.crear`.
- **Municipal parameters (SPEC 15).** Values that belong to a municipality (limits, deadlines, …) live as rows of the generic `parametros (clave, valor jsonb)` table, edited by the admin through endpoints that run the key's domain validator. Never write them as constants in `src/`, migrations or seeds.
  - `limites_municipio` is `{ latMin, latMax, lngMin, lngMax }` (`domain/ubicacion/limites-municipio.ts`). It is set with `PUT /api/v1/admin/parametros/limites-municipio` (`admin.catalogos`) and read by the form with `GET /api/v1/parametros/limites-municipio` (`tickets.crear`), which answers `{ limites: null }` until it is configured.
  - `POST /api/v1/tickets` accepts optional `lat` and `lng` (JSON numbers, both or neither, also enforced by the `tickets_ubicacion_completa` CHECK). `validarUbicacion` rounds them to 6 decimals and requires them inside the box (edges included). Without `limites_municipio`, any coordinates answer `400 UBICACION_NO_CONFIGURADA`; a complaint without coordinates is still accepted. Configuring the box is part of setting up a municipality.
  - Changing the box does not rewrite tickets already registered.
- **Neighbor sign-up and email verification (SPEC 16).** A neighbor creates their own account in `/registro` and activates it in `/verificar`:
  - `POST /api/v1/auth/registro` (public) takes `{ nombre, dpi, email, telefono?, password }` as a strict schema. Invalid data answers `400` (`NOMBRE_INVALIDO`, `DPI_INVALIDO`, `EMAIL_INVALIDO`, `TELEFONO_INVALIDO`, `POLITICA_PASSWORD`, `VALIDACION`), because that reveals nothing about existing accounts.
  - Valid data **always** answers `202 { mensaje }` with the same body, before any email is sent, and bcrypt runs in every case so the timing does not leak either. The case is decided in a transaction by `decidirCasoRegistro` (`domain/usuarios/registro-vecino.ts`) and told only by email:
    1. New email and DPI: creates an active vecino with `correo_verificado_en = null` and sends `verificacion_correo`.
    2. A pending sign-up (active vecino with a password, not verified) with the same email: replaces its name, DPI, phone and password, invalidates its old links and sends a new `verificacion_correo`.
    3. The email belongs to a verified account, a walk-in neighbor or an internal user: changes nothing and sends `cuenta_existente`. A walk-in neighbor does not claim the account here; they use "olvidé mi contraseña".
    4. The DPI belongs to another user: changes nothing and sends `registro_no_completado` to the email entered.
    5. The email's user is inactive: changes nothing and sends nothing.
  - A concurrent `23505` is treated as case 3 or 4. Never answer `409` from this endpoint.
  - `POST /api/v1/auth/verificar` (public) takes `{ token }`, sets `correo_verificado_en` and uses the token. It does not open a session. A used, expired, missing or wrong-type token answers `400 TOKEN_VERIFICACION_INVALIDO`.
  - **Without a verified email there is no login.** With the correct password, an unverified account answers `403 CORREO_NO_VERIFICADO` with no tokens (the failed-attempt counter is still reset). A wrong password answers `401 CREDENCIALES_INVALIDAS` as always, so the state is not revealed.
  - **Any email link that is used marks the email as verified**: verification, and also recovery or invitation links in `/auth/restablecer`. Migration `0015` marked every user that already had a password as verified, and `seed:dev` creates its users verified. A test fixture that inserts a user with a password and expects to log in must set `correo_verificado_en`.
  - Single-use links in `restablecimientos` (only the SHA-256 is stored). `buscarVigente` always receives the expected types, so a link only works on its own endpoint:

    | `tipo` | Expires in | Created by | Used in |
    | --- | --- | --- | --- |
    | `recuperacion` | 30 min | `/auth/recuperar` (SPEC 09) | `/auth/restablecer` |
    | `invitacion` | 24 h | user or walk-in neighbor creation (SPEC 10 and 13) | `/auth/restablecer` |
    | `verificacion` | 24 h | `/auth/registro` (SPEC 16) | `/auth/verificar` |
  - There is no rate limit on `/auth/registro` (accepted risk in SPEC 16). Add one before exposing the portal.
  - The frontend copies the rules in `features/auth/validacion-registro.ts` (including `validarPassword`); the backend stays the source of truth, and a server `400` is shown on its field. `/verificar` calls the API exactly once, guarded with a `useRef` against StrictMode, because the token is single-use.
- **Complaint form (SPEC 18).** `/tickets/nueva` mounts `features/tickets/registro/FormularioQueja`, one React Hook Form for every step, with the steps from `pasosPara(rol)`:
  - vecino: Categoría → Descripción → Ubicación → Resumen. Receptor and supervisor first get Solicitante (search with `GET /vecinos`, or sign up with `POST /vecinos`, then a channel other than `portal`).
  - Each step validates only its own fields before "Siguiente" (`CAMPOS_POR_PASO`). A new step goes in `CONTENIDO` and `CAMPOS_POR_PASO`, and adds its section to `PasoResumen`.
  - **No draft is saved.** The state lives only in memory: reloading loses what was typed, so no neighbor data stays on shared devices. Never put form data in `localStorage` or `sessionStorage`.
  - The client copies the backend rules, which stay the source of truth: text ranges in `estado-registro.ts` (`LIMITES`), extra fields in `validar-datos-extra.ts` (SPEC 14), and DPI, phone and email in `shared/validacion/datos-personales.ts`, shared with SPEC 16 because a feature cannot import another one. Change them together with the backend.
  - Extra-field values are kept as typed and converted only when sending (`datosExtraParaEnvio`): numbers as `number`, sí/no as `boolean`, absent fields omitted. Changing the category empties `datosExtra`.
  - `cuerpoDelRegistro` builds the `POST /tickets` body: `solicitanteId` and `canal` only for the walk-in desk, `datosExtra` only if not empty, `lat`/`lng` only if a point was marked.
  - Backend errors go to their step and field through the table in `errores-registro.ts` (`destinoDeError`), without losing data; `DATOS_EXTRA_INVALIDOS` uses `ApiError.detalles`, which the HTTP client now keeps. A new error code goes in that table, with its text in `locales/es/tickets.json`.
  - `MapaUbicacion` (Leaflet + react-leaflet, OpenStreetMap tiles) is loaded with `React.lazy` only in Ubicación, so it is a separate chunk outside the initial bundle. It is hidden while `limites_municipio` is `null`. "Usar mi ubicación" and "Quitar ubicación" live in `PasoUbicacion`, which rejects points outside the box.
  - **Attachments will be added in this same form** by the attachments spec (up to 5 files, RF-06); this form registers the complaint without files.
- **Supervisor triage (SPEC 19).** Only the supervisor has `tickets.triage` (`todas`, migration `0016_triage`). Both endpoints use `autenticar` + `requierePermiso('tickets.triage')`:
  - `POST /api/v1/tickets/:id/transiciones` takes a body discriminated by `accion` (Zod `strict` per branch): `tomar` (nueva → en_revision), `aceptar` with `prioridad` and an optional `categoriaId` (en_revision → asignada) and `rechazar` with `motivo` (en_revision → rechazada). **The RF-18 specs extend this same endpoint with new `accion` branches**; do not add one endpoint per action.
  - `TriageService` runs each transition in one `Transaccion`: `TicketEscrituraRepository.obtenerParaActualizar` reads the ticket with `SELECT … FOR UPDATE` and the scope filter, calls the `Ticket` method and saves the ticket plus its `ticket_historial` row. A concurrent second action waits for the lock and then gets `409`.
  - RF-13: the department is `categorias.dependencia_id` of the final category, which must be active with an active department (`400 CATEGORIA_INVALIDA`). A category change writes `Categoría: <anterior> → <nueva>` as the history note (`Ticket.asignar(…, nota?)`) and keeps `datos_extra` as is. SLA due dates stay `null` until the SLA spec.
  - After the commit, `queja_aceptada` (with the department) or `queja_rechazada` (with the trimmed reason) goes to the requester without waiting; `tomar` sends nothing.
  - `GET /api/v1/tickets/triage?estado=&pagina=&tamano=` (`TriageLecturaRepository`) lists `nueva` and `en_revision`, oldest first, paginated up to 50, with only the requester's name (RNF-12).
  - Frontend: `/triage` (supervisor only) is `features/tickets/triage/TriagePage` with cards, a filter and pagination, plus `PanelTriage` (full-width `Drawer` on small screens). After an action it invalidates `CLAVES_TRIAGE.bandeja`; a `409` shows "Otra persona ya actuó sobre esta queja".
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
  - The middleware only decides whether the role may perform the action. Applying the scope to the records is done with the filters of SPEC 11, never by hand:
    - Every read of or action on tickets, reports or the audit log goes through `domain/autorizacion/` (`filtroTicketsParaAccion`, `filtroReportes`, `filtroBitacora`) and the read-only repositories that apply them (`TicketLecturaRepository`, `ReporteLecturaRepository`, `BitacoraLecturaRepository`). Never write a role-specific `WHERE` by hand.
    - To load a ticket before acting on it, use `ConsultaTicketsService.obtenerParaAccion(usuario, accion, id)`. The filter is the action's scope intersected with `tickets.ver`: nobody acts on a ticket they cannot see.
    - A record outside the user's scope answers `404 NO_ENCONTRADO`, exactly like a missing one, so the API never reveals that it exists.
    - A `null` filter means no records and must not query the database. Column names in filters come only from the fixed maps in `infrastructure/repositories/knex-filtro.ts`.
    - Specs that create tickets must fill `tickets.registrado_por`, and the audit-log spec must fill `bitacora.dependencia_id`; otherwise the `registradas` and per-department scopes find nothing.
  - Errors leave the API as `{ codigo, mensaje }`. Use cases throw `ErrorDeAplicacion` (`application/errors/`), and `manejadorErrores` maps its `codigo` to the HTTP status. Errors that validate a whole form at once (`DEFINICION_INVALIDA`, `DATOS_EXTRA_INVALIDOS`, `CAMBIO_INCOMPATIBLE`) add `detalles: [{ campo, problema }]` with every problem; domain rules carry them in `ReglaDeNegocioError.detalles`, and `conReglasDeNegocio` passes them through.
  - Domain errors that no service translated are mapped by `manejadorErrores` for every endpoint (SPEC 19): `InvalidTransitionError` → `409 TRANSICION_INVALIDA`, and `ReglaDeNegocioError` → `400` with its own `codigo` (and `detalles` if present). Services that call `Ticket` methods can let these errors through instead of wrapping them.
- **Email templates live in the database.** Subjects and bodies are rows of `plantillas_notificacion` (RF-33), read on every send with `{{variable}}` placeholders rendered by `domain/notificaciones/plantilla.ts`. Never write an email subject or body in `src/`; a new template goes in a migration as data. Emails go through the `EnviadorCorreo` port and are sent without blocking the HTTP response; a failed send is logged with the `usuario_id`, never with a token.
- **Password policy.** Any password a user defines must pass `validarPassword` from `domain/auth/politica-password.ts` (RNF-08: 8–200 characters, at least one letter and one digit). The frontend uses its copy in `features/auth/validacion-registro.ts` and must change with it.
- **Internal users (SPEC 10).** The administrator manages them through `/api/v1/admin/usuarios`, protected by `autenticar` + `requierePermiso('admin.usuarios')`:
  - `GET /` (paginated, 20 per page by default, max 100, filters `rol`, `dependenciaId`, `activo`, `busqueda`), `GET /:id`, `POST /`, `PATCH /:id`, `POST /:id/desactivacion`, `POST /:id/activacion` and `POST /:id/desbloqueo`. Vecinos never appear here and their ids answer `404`.
  - Only the 5 internal roles are assignable. `tecnico` and `coordinador` require a dependency; the other roles must not have one. The DPI has 13 digits. Email and DPI cannot be edited.
  - A new user is active with no password and receives the `invitacion_usuario` email with a single-use link valid for 24 hours (`restablecimientos.tipo = 'invitacion'`), used in `/auth/restablecer`. There is no resend endpoint: if the invitation expires, the user asks for a new link with "olvidé mi contraseña" (`/auth/recuperar` also serves internal users without a password).
  - Changing the role or dependency, or deactivating, revokes the user's sessions. An administrator cannot deactivate or demote themselves, and no operation may leave 0 active administrators (counted with `FOR UPDATE`).
  - Users are never deleted: they are deactivated.
  - Domain rules live in `domain/usuarios/usuario-interno.ts`. Operations that touch several tables use the `Transaccion` port.
- **Cross-cutting conventions:**
  - API routes start with `/api/v1` and are documented in OpenAPI 3.
  - Ticket numbers use the format `Q-AAAA-NNNNNN`.
  - Times are stored as `timestamptz` in UTC and displayed in `America/Guatemala`.
  - SLAs are measured in business hours against `calendario_laboral`.
  - `bitacora` is insert-only.
  - Logs are JSON from Pino with a correlation id, and the service exposes `/health`.
  - UI text lives in translation files, with Spanish as the default language.
