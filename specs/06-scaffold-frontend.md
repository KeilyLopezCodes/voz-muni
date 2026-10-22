# SPEC 06 — Scaffold del frontend

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-22
> **Objetivo:** Crear la SPA `frontend/` en React + Vite organizada por funcionalidad, con cliente HTTP compartido, guardas de ruta por rol, layout MUI, textos en archivos de traducción y fronteras entre features verificadas con dependency-cruiser.

## Por qué existe esta spec

Todas las specs de pantallas (login, registro de quejas, reportes, administración) necesitan la misma base: router, guardas por rol, cliente HTTP, i18n y tema.
Si cada una la arma por su cuenta, aparecen reglas de acceso duplicadas y textos fijos.
Todavía no existe autenticación, así que las guardas se construyen y se prueban con una sesión simulada. La spec de autenticación conectará la fuente real de la sesión sin tocar las guardas.

## Alcance

**Incluido:**

- Proyecto `frontend/` con npm, Vite, React, TypeScript `strict`, React Router, TanStack Query y MUI.
- Estructura `src/app/`, `src/shared/` y `src/features/{auth,tickets,reportes,admin}/`.
- Cliente HTTP en `shared/api/` basado en `fetch`, con `ApiError`, `X-Request-Id`, tiempo límite y un proveedor de token que todavía no se usa.
- Sesión (`Session`, `SessionProvider`, `useSession`) y guarda `RequireRole` en `shared/auth/`. En el navegador la sesión es siempre `null`.
- Tabla única de rutas y roles, que usan tanto las guardas como el menú.
- Páginas placeholder para cada ruta, `AppLayout` con menú filtrado por rol y páginas 403 y 404.
- react-i18next con español por defecto. Ningún texto visible queda fijo en un componente.
- Proxy de Vite hacia el backend e indicador de estado del servidor (`/health`) en `/login`.
- Vitest + Testing Library.
- dependency-cruiser con las fronteras entre features y el script `lint:deps`.
- Comandos del frontend en `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Formulario de login, JWT, renovación de token y logout (spec de autenticación). `/login` solo muestra el estado del servidor.
- Selector de rol para desarrollo.
- Contenido real de las páginas: listados, formularios, reportes y administración.
- Otros idiomas además del español.
- Dockerfile del frontend, Nginx y HTTPS.
- ESLint y Prettier.
- CI.
- Accesibilidad WCAG 2.1 AA verificada (RNF-15) y métricas de carga (RNF-02).

## Modelo de datos

Esta spec no introduce datos persistentes. Introduce estos tipos del lado del cliente:

```ts
// shared/auth/roles.ts — mismos nombres que el seed 01_roles de SPEC 03
export const ROLES = [
  'vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador',
] as const;
export type Rol = (typeof ROLES)[number];

// shared/auth/session.ts
export interface Session {
  usuarioId: number;
  rol: Rol;
  dependenciaId: number | null;
}
// <SessionProvider session={Session | null}> — en main.tsx siempre recibe null en esta spec
// useSession(): Session | null

// shared/auth/rutas.ts — fuente única para guardas y menú
export interface RutaProtegida {
  path: string;
  roles: readonly Rol[];
  etiqueta: string;      // clave i18n
  enMenu: boolean;
}

// shared/api/api-error.ts
export class ApiError extends Error {
  status: number;        // 0 = red no disponible o tiempo agotado
  codigo: string;        // del cuerpo de error del backend si existe; si no, 'HTTP_<status>', 'RED_NO_DISPONIBLE' o 'TIEMPO_AGOTADO'
}

// shared/api/http-client.ts
// createHttpClient(baseUrl: string): { get<T>(path), post<T>(path, body), put<T>(path, body), patch<T>(path, body), delete<T>(path) }
// apiClient  = createHttpClient('/api/v1')   — para los endpoints de negocio
// rootClient = createHttpClient('')          — para /health, que vive fuera de /api/v1
// setTokenProvider(fn: () => string | null)  — si devuelve token, se envía Authorization: Bearer <token>
```

Comportamiento del cliente HTTP:

- Envía `Accept: application/json`, y `Content-Type: application/json` cuando hay cuerpo.
- Agrega `X-Request-Id: crypto.randomUUID()` a cada petición.
- Tiene un tiempo límite de 15 s con `AbortController`.
- Una respuesta `2xx` devuelve el JSON parseado, o `undefined` si es `204`.
- Una respuesta fuera de `2xx` lanza `ApiError` con su `status`.
- Un error de red lanza `ApiError` con status 0 y código `RED_NO_DISPONIBLE`, y un tiempo agotado lo hace con código `TIEMPO_AGOTADO`.

### Rutas

| Ruta | Acceso | En el menú | Feature |
| --- | --- | --- | --- |
| `/login` | pública | no | `auth` |
| `/consulta` | pública (RF-35) | no | `tickets` |
| `/403` | pública | no | `shared` |
| `*` (404) | pública | no | `shared` |
| `/` | sesión requerida | no | redirige: `administrador` → `/admin`; los demás → `/tickets` |
| `/tickets` | los 6 roles | sí | `tickets` |
| `/tickets/nueva` | `vecino`, `receptor`, `supervisor` | sí | `tickets` |
| `/reportes` | `tecnico`, `coordinador`, `supervisor`, `administrador` | sí | `reportes` |
| `/admin` | `administrador` | sí | `admin` |

Comportamiento de `RequireRole`:

- Sin sesión, redirige a `/login`.
- Con una sesión cuyo rol no está en `roles`, redirige a `/403`.
- Con un rol permitido, muestra la página dentro de `AppLayout`.

### Estructura

```text
frontend/
  package.json  tsconfig.json  vite.config.ts  index.html  .gitignore  .dependency-cruiser.cjs
  src/
    main.tsx                      # monta <App/> con SessionProvider session={null}
    app/
      App.tsx                     # providers: QueryClient, ThemeProvider, I18nextProvider
      router.tsx                  # une rutas públicas, protegidas y páginas de features
    shared/
      api/        http-client.ts  api-error.ts  health.ts (useEstadoServidor con TanStack Query)
      auth/       roles.ts  session.ts  SessionProvider.tsx  RequireRole.tsx  rutas.ts  inicio-por-rol.ts
      layout/     AppLayout.tsx   # AppBar + menú lateral filtrado por rol; responsive desde 360 px
      pages/      NoAutorizadoPage.tsx  NoEncontradoPage.tsx
      theme/      theme.ts
      i18n/       i18n.ts         # es por defecto, namespaces: comun, auth, tickets, reportes, admin
    features/
      auth/pages/LoginPage.tsx            # muestra estado del servidor
      tickets/pages/TicketsPage.tsx  NuevoTicketPage.tsx  ConsultaPage.tsx
      reportes/pages/ReportesPage.tsx
      admin/pages/AdminPage.tsx
    locales/es/  comun.json  auth.json  tickets.json  reportes.json  admin.json
  tests/
    setup.ts
    shared/http-client.test.ts  shared/require-role.test.tsx  shared/app-layout.test.tsx
    app/router.test.tsx
    features/login-page.test.tsx
CLAUDE.md
```

### Proxy de desarrollo (`vite.config.ts`)

- El servidor de desarrollo usa el puerto `5173`.
- Las rutas `/api` y `/health` se redirigen a `http://localhost:3000`.
- Vitest usa el entorno `jsdom` y el archivo `tests/setup.ts`.

### Reglas de dependencia (`frontend/.dependency-cruiser.cjs`)

| Regla | Prohíbe |
| --- | --- |
| `feature-no-otra-feature` | `src/features/X` → `src/features/Y`, con X ≠ Y |
| `shared-no-features` | `src/shared` → `src/features` |
| `shared-no-app` | `src/shared` → `src/app` |
| `features-no-app` | `src/features` → `src/app` |
| `no-circular` | cualquier ciclo dentro de `src/` |

## Plan de implementación

1. Crear `frontend/` con Vite + React + TypeScript (plantilla `react-ts`) y quitar el contenido de ejemplo. Activar `strict` y agregar `.gitignore`. Instalar Vitest, Testing Library y jsdom, y crear `tests/setup.ts` con una prueba mínima de que `App` se monta. Verificación: `npm run build` y `npm test` pasan, y `npm run dev` sirve la página en `5173`.
2. Instalar MUI, TanStack Query, react-i18next e i18next. Crear `shared/theme/theme.ts`, `shared/i18n/i18n.ts` y los 5 archivos `locales/es/*.json`, y montar los providers en `App.tsx`. La prueba comprueba que el título de la app viene de `comun.json`. Verificación: `npm test` pasa.
3. Crear `shared/api/api-error.ts` y `shared/api/http-client.ts` con `apiClient`, `rootClient` y `setTokenProvider`. Crear `tests/shared/http-client.test.ts` con `fetch` simulado, que comprueba:
   - El prefijo `/api/v1`.
   - Los encabezados `X-Request-Id`, `Content-Type` y `Authorization` (solo si el proveedor devuelve token).
   - La respuesta `204`.
   - `ApiError` en `404`/`500` con su código.
   - Error de red con `RED_NO_DISPONIBLE` y tiempo agotado con `TIEMPO_AGOTADO`.

   Verificación: `npm test` pasa.
4. Crear `shared/auth/` (`roles.ts`, `session.ts`, `SessionProvider.tsx`, `RequireRole.tsx`, `rutas.ts`, `inicio-por-rol.ts`) y las páginas 403 y 404. Crear `tests/shared/require-role.test.tsx`, que prueba sin sesión → `/login`, rol no permitido → `/403` y rol permitido → contenido. Verificación: `npm test` pasa.
5. Crear las páginas placeholder de las 4 features, `AppLayout` y `app/router.tsx`, con la tabla de rutas. Crear `tests/app/router.test.tsx`, que recorre los 6 roles × 4 rutas protegidas comparando con la tabla y prueba la redirección de `/` según el rol. Crear `tests/shared/app-layout.test.tsx`, que comprueba que el menú de cada rol muestra exactamente sus rutas. Verificación: `npm test` pasa y, en el navegador, `/tickets` redirige a `/login`.
6. Configurar el proxy en `vite.config.ts`. Crear `shared/api/health.ts` con `useEstadoServidor()` (TanStack Query sobre `rootClient.get('/health')`) y mostrar en `LoginPage` "Servidor disponible" o "Servidor no disponible" usando claves de `auth.json`. Crear `tests/features/login-page.test.tsx` con `fetch` simulado para los dos estados. Verificación: con el backend en `3000`, `/login` muestra "Servidor disponible"; con el backend detenido, muestra "Servidor no disponible".
7. Instalar `dependency-cruiser`, crear `frontend/.dependency-cruiser.cjs` con las reglas de la tabla y el script `lint:deps`. Verificación: `npm run lint:deps` termina en 0. Al inyectar a mano un import de `features/admin` dentro de `features/tickets`, falla con `feature-no-otra-feature`.
8. Actualizar `CLAUDE.md`:
   - Comandos del frontend (`npm install`, `npm run dev`, `npm run build`, `npm test`, `npm run lint:deps`, desde `frontend/`).
   - Que el backend debe correr en `3000` para el proxy.
   - Quitar la frase "The frontend does not exist yet".

## Criterios de aceptación

- [x] Desde `frontend/`, `npm install`, `npm run build`, `npm test` y `npm run lint:deps` terminan con código 0.
- [x] `npm run dev` sirve la app en `http://localhost:5173`.
- [x] En el navegador, sin sesión, `/tickets`, `/tickets/nueva`, `/reportes`, `/admin` y `/` redirigen a `/login`.
- [x] `/login` y `/consulta` cargan sin sesión. Una ruta inexistente muestra la página 404.
- [x] Con el backend corriendo, `/login` muestra el texto "Servidor disponible". Con el backend detenido, muestra "Servidor no disponible".
- [x] La prueba del router confirma, para los 6 roles y las 4 rutas protegidas, que se muestra la página si el rol está en la tabla de rutas y se redirige a `/403` si no.
- [x] `/` redirige a `/admin` con el rol `administrador` y a `/tickets` con cualquier otro rol.
- [x] El menú de cada rol muestra exactamente las rutas de la tabla con `enMenu = true` permitidas para ese rol.
- [x] El cliente HTTP antepone `/api/v1` en `apiClient`, envía `X-Request-Id` en cada petición y envía `Authorization` solo cuando `setTokenProvider` devuelve un token.
- [x] Una respuesta `500` lanza `ApiError` con `status = 500`, y un error de red lanza `ApiError` con `status = 0` y `codigo = 'RED_NO_DISPONIBLE'`.
- [x] `ROLES` coincide con los nombres del seed `01_roles` de SPEC 03.
- [x] Ningún archivo `.tsx` de `src/` contiene texto visible en español fijo: todo pasa por `t()` y existe en `locales/es/`.
- [x] A 360 px de ancho, `AppLayout` no produce scroll horizontal.
- [x] Un import de `features/admin` dentro de `features/tickets` hace fallar `npm run lint:deps` con `feature-no-otra-feature`. Un import de `features/` dentro de `shared/` falla con `shared-no-features`.
- [x] `CLAUDE.md` lista los comandos del frontend.

## Decisiones

- **Sí:** guardas construidas y probadas con una sesión simulada. En el navegador la sesión es siempre `null` hasta la spec de autenticación. Así no hay código de desarrollo que haya que quitar después.
- **No:** selector de rol para desarrollo, ni incluir login real (requiere primero la autenticación del backend).
- **Sí:** `SessionProvider` recibe la sesión por prop. La spec de autenticación solo cambia de dónde viene; `RequireRole` no cambia.
- **Sí:** una tabla única de rutas y roles (`rutas.ts`) para guardas y menú. Evita que el menú muestre enlaces que la guarda bloquea.
- **Sí:** mapa de rutas derivado de la matriz de permisos de la sección 2: crear queja (vecino, receptor, supervisor), ver reportes (técnico, coordinador, supervisor, admin) y administrar (admin).
- **No:** una ruta por feature sin roles.
- **Sí:** el administrador entra a `/admin` y los demás a `/tickets`. Es la pantalla principal de cada rol según la sección 2.
- **Sí:** roles con los mismos nombres que el seed de SPEC 03. El token de la spec de autenticación traerá esos valores.
- **Sí:** `fetch` nativo envuelto. No agrega dependencias, y TanStack Query maneja caché y reintentos.
- **No:** axios.
- **Sí:** dos instancias del cliente, `apiClient` (`/api/v1`) y `rootClient` (raíz). `/health` vive fuera de `/api/v1` (SPEC 01).
- **Sí:** `X-Request-Id` generado en el cliente. Prepara el id de correlación de RNF-21 para cuando el backend use Pino.
- **Sí:** tiempo límite de 15 s.
- **Sí:** react-i18next desde el inicio, con un namespace por feature. RNF-16 y CLAUDE.md exigen textos en archivos de traducción, y externalizarlos después cuesta más.
- **Sí:** Vitest + Testing Library. Se integra con Vite y tiene la misma API que Jest.
- **No:** Jest en el frontend, ni un scaffold sin pruebas.
- **Sí:** pruebas en `frontend/tests/`, igual que en el backend.
- **Sí:** `AppLayout` MUI con menú filtrado por rol, responsive desde 360 px (RNF-14).
- **Sí:** proxy de Vite y estado del servidor en `/login`. Prueba el cliente contra el backend real sin endpoints nuevos.
- **Sí:** dependency-cruiser con fronteras entre features. Solo `app/` une las features, igual que la regla de capas del backend.
- **Sí:** npm, sin ESLint ni Prettier, igual que el backend.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| En el navegador no se puede ver ninguna página protegida hasta que exista la autenticación | Es intencional. Las pruebas del router cubren todas las combinaciones de rol y ruta. |
| `ROLES` diverge del seed de roles | Un criterio de aceptación exige que coincidan. La spec de autenticación debe validar el rol del token contra `ROLES`. |
| `/health` responde `503` con la base caída (SPEC 02), y `/login` muestra "no disponible" aunque la API responda | Es el comportamiento deseado: sin base de datos el sistema no funciona. |
| La guarda del frontend se toma como seguridad | La seguridad real está en el backend (RF-05). La guarda solo evita mostrar pantallas inútiles, y así queda dicho en `CLAUDE.md`. |
| Un texto fijo se cuela en un componente | Un criterio de aceptación lo revisa. Una regla de ESLint (`i18next/no-literal-string`) puede llegar con la spec de lint. |

## Lo que **no** está en esta spec

- Login, JWT, renovación de token y logout.
- Selector de rol para desarrollo.
- Contenido real de las pantallas.
- Otros idiomas.
- Docker, Nginx y HTTPS del frontend.
- ESLint, Prettier y CI.
- Verificación formal de accesibilidad y rendimiento.

Cada uno de estos temas, cuando llegue, va en su propia spec.
