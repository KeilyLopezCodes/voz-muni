# SPEC 08 — Inicio de sesión, tokens y autorización por rol

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 05
> **Fecha:** 2026-10-22
> **Objetivo:** Exponer en el backend login, renovación y cierre de sesión con un token de acceso JWT y un token de renovación rotativo, con bloqueo por intentos fallidos, y proteger los endpoints con middlewares que verifican la sesión y los permisos del rol guardados en `roles.permisos`.

## Por qué existe esta spec

Todas las specs de negocio (registro de quejas, asignación, atención) necesitan saber quién hace la petición y si su rol puede hacerla (RF-05). Hoy no existe autenticación: ningún usuario tiene contraseña y no hay endpoints de sesión.
Esta spec cubre solo el backend. El formulario de login y la sesión del frontend van en una spec aparte.
Además mueve los roles del seed `01_roles` de SPEC 03 a una migración, que también carga la matriz de permisos.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición (modelo de datos y endpoints) antes de las migraciones.
- Migración `0005_autenticacion`: columnas de bloqueo en `usuarios` y tabla `sesiones`.
- Migración `0006_roles`: inserta los 6 roles con su matriz de permisos en `roles.permisos`.
- Eliminación del seed `01_roles`. `seed:run` se conserva, y `postbuild` crea `dist/.../seeds/`.
- Endpoints `POST /api/v1/auth/login`, `POST /api/v1/auth/refresh`, `POST /api/v1/auth/logout` y `GET /api/v1/auth/sesion`.
- Token de acceso JWT de 15 min y token de renovación opaco de 7 días, guardado como hash, con rotación en cada uso y detección de reuso (RNF-09).
- Bloqueo temporal de 15 min después de 5 intentos fallidos (RNF-09).
- Límite de peticiones en `/auth/login` con express-rate-limit (RNF-10).
- Middlewares `autenticar` y `requierePermiso(accion)` (RF-05).
- Manejador global de errores con cuerpo `{ codigo, mensaje }`, y 404 para rutas desconocidas de `/api/v1`.
- Seed de desarrollo `06_usuarios`, con un usuario por rol.
- Variables de entorno nuevas validadas con Zod.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantalla de login, sesión real en `SessionProvider`, renovación automática y cierre de sesión en el frontend.
- Registro del vecino y verificación de correo (RF-01).
- Recuperación de contraseña (RF-03).
- Gestión de usuarios por el administrador y desbloqueo manual (RF-04).
- Política de contraseña al crearla (RNF-08). Aquí solo se verifica en el login.
- Restricción por recurso según dependencia o propietario. Cada spec de negocio la aplica en su servicio con el `alcance` y el usuario que deja `autenticar`.
- Qué transiciones concretas puede ejecutar cada rol (spec de RF-18).
- Pantalla de administración de permisos (RF-41).
- Registro de inicios de sesión en `bitacora` (spec de RF-42).
- Limpieza periódica de sesiones vencidas.
- helmet, HTTPS, HSTS y `trust proxy` detrás de Nginx.
- Traducción de los errores de dominio de SPEC 04 a HTTP.

## Modelo de datos

### Cambios en el documento de definición

Antes de las migraciones se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- Tabla `usuarios`: se agregan `intentos_fallidos` y `bloqueado_hasta`.
- Tabla nueva `sesiones`.
- Endpoints: se agregan `POST /api/v1/auth/logout` y `GET /api/v1/auth/sesion`.

En la tabla de vacíos de SPEC 02, la fila de RF-01, RF-02, RF-03 y RNF-09 queda resuelta en lo que toca a tokens de renovación e intentos fallidos. Siguen pendientes la verificación de correo y la recuperación de contraseña.

### `0005_autenticacion`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `usuarios` | `intentos_fallidos` | integer | NOT NULL, DEFAULT 0, CHECK >= 0 |
| | `bloqueado_hasta` | timestamptz | NULL |
| `sesiones` | `id` | bigint identity | PK |
| | `usuario_id` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| | `token_hash` | text | NOT NULL, UNIQUE (SHA-256 en hexadecimal del token de renovación) |
| | `expira_en` | timestamptz | NOT NULL |
| | `revocada_en` | timestamptz | NULL |
| | `reemplazada_por` | bigint | NULL, FK `sesiones` ON DELETE RESTRICT |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |

- Índice: `sesiones (usuario_id)`.
- El `down` borra `sesiones` y después las dos columnas de `usuarios`.
- El token de renovación nunca se guarda en claro.

### `0006_roles`

- El `up` inserta los 6 roles con sus `permisos`. Usa `ON CONFLICT (nombre) DO UPDATE SET permisos = EXCLUDED.permisos`, porque en las bases donde ya corrió el seed `01_roles` los roles existen con `permisos = '{}'`.
- El `down` ejecuta `DELETE FROM roles WHERE nombre IN (<los 6>)`. Si algún usuario tiene uno de esos roles, falla por `ON DELETE RESTRICT`, y hay que borrar esos usuarios antes del rollback.
- Los datos van escritos de forma literal en la migración. No importa constantes de `domain/`, porque una migración aplicada no puede cambiar de comportamiento si cambia el código.

### Matriz de permisos (`roles.permisos`)

`permisos` es un objeto `{ [accion]: alcance }`. Si una acción no aparece, el rol no tiene ese permiso.

```ts
// domain/auth/roles.ts — mismos nombres que frontend/src/shared/auth/roles.ts
export const ROLES = ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'] as const;
export type Rol = (typeof ROLES)[number];

// domain/auth/permisos.ts
export const ACCIONES = [
  'tickets.crear', 'tickets.ver', 'tickets.clasificar', 'tickets.asignar',
  'tickets.trasladar', 'tickets.cambiar_estado', 'comentarios.publico',
  'comentarios.interno', 'reportes.ver', 'admin.catalogos', 'bitacora.ver',
] as const;
export type Accion = (typeof ACCIONES)[number];

export const ALCANCES = [
  'propia', 'a_nombre_de_vecino', 'registradas', 'asignadas',
  'dependencia', 'todas', 'solicitar', 'si',
] as const;
export type Alcance = (typeof ALCANCES)[number];

export type Permisos = Partial<Record<Accion, Alcance>>;
```

Contenido que carga `0006_roles`, traducido de la matriz de la sección 2 (`—` = sin permiso):

| Acción | vecino | receptor | tecnico | coordinador | supervisor | administrador |
| --- | --- | --- | --- | --- | --- | --- |
| `tickets.crear` | `propia` | `a_nombre_de_vecino` | — | — | `todas` | — |
| `tickets.ver` | `propia` | `registradas` | `asignadas` | `dependencia` | `todas` | `todas` |
| `tickets.clasificar` | — | `todas` | — | `todas` | `todas` | — |
| `tickets.asignar` | — | — | — | `dependencia` | `todas` | — |
| `tickets.trasladar` | — | — | `solicitar` | `solicitar` | `todas` | — |
| `tickets.cambiar_estado` | `propia` | — | `asignadas` | `dependencia` | `todas` | — |
| `comentarios.publico` | `si` | `si` | `si` | `si` | `si` | — |
| `comentarios.interno` | — | `si` | `si` | `si` | `si` | — |
| `reportes.ver` | — | — | `propia` | `dependencia` | `todas` | `todas` |
| `admin.catalogos` | — | — | — | — | — | `si` |
| `bitacora.ver` | — | — | — | `dependencia` | `todas` | `todas` |

Reglas de traducción:

- "Propia(s)" y "Propios" se traducen a `propia`. "Sí", "Todas" y "Globales" se traducen a `todas`.
- Para los comentarios y la administración se usa `si`, que significa "permitido": el alcance real lo da la visibilidad del ticket, o no existe.
- `tickets.cambiar_estado` lleva el alcance de cada rol. Qué transiciones concretas puede hacer (el vecino solo reabrir y cerrar, el técnico solo las de atención) lo define la spec de RF-18.

### Tokens

| Elemento | Valor |
| --- | --- |
| Token de acceso | JWT HS256 firmado con `JWT_SECRET`. Payload `{ sub: '<usuario_id>', rol, dep: <dependencia_id or null> }`. Vence en 15 min. |
| Token de renovación | 32 bytes aleatorios (`crypto.randomBytes`) en base64url. Vence 7 días después de emitirse. |
| Transporte | Los dos tokens viajan en el cuerpo JSON. El cliente envía el de renovación en el cuerpo de `/auth/refresh` y `/auth/logout`. |
| Hash de contraseña | bcrypt con costo 12, mediante `bcryptjs`. |

### Bloqueo (`domain/auth/bloqueo.ts`)

- `MAX_INTENTOS = 5` y `DURACION_BLOQUEO_MS = 15 * 60 * 1000`.
- Si `bloqueado_hasta > ahora`, el login responde `423 CUENTA_BLOQUEADA` sin verificar la contraseña y sin sumar intentos.
- Una contraseña incorrecta suma 1 a `intentos_fallidos`. Los intentos 1 a 4 responden `401 CREDENCIALES_INVALIDAS`. El intento 5 fija `bloqueado_hasta = ahora + 15 min`, deja `intentos_fallidos = 0` y responde `423 CUENTA_BLOQUEADA`.
- Un login correcto deja `intentos_fallidos = 0` y `bloqueado_hasta = null`.
- Un correo inexistente, un usuario inactivo o un usuario sin `password_hash` responden `401 CREDENCIALES_INVALIDAS` y no suman intentos. Si el correo no existe, se compara igual contra un hash ficticio, para que el tiempo de respuesta no revele qué correos existen.
- Las funciones de bloqueo son puras: reciben `ahora` y devuelven el estado nuevo.

### Renovación, reuso y cierre

- `POST /auth/refresh` busca la sesión por el SHA-256 del `refreshToken` recibido.
  - No existe o venció: `401 SESION_INVALIDA`.
  - El usuario está inactivo: se revoca la sesión y responde `401 SESION_INVALIDA`.
  - Ya fue revocada (reuso): se revocan todas las sesiones activas del usuario y responde `401 SESION_INVALIDA`.
  - Está vigente: en una transacción se crea una sesión nueva, que vence 7 días después, y la anterior queda con `revocada_en = ahora` y `reemplazada_por = <nueva>`. Responde con tokens nuevos.
- `POST /auth/logout` revoca la sesión del `refreshToken` si existe y está vigente. Responde siempre `204`, para no revelar si el token existía.

### Endpoints

| Método y ruta | Entrada | Respuesta correcta | Errores |
| --- | --- | --- | --- |
| `POST /api/v1/auth/login` | `{ email, password }` | `200` `RespuestaSesion` | `400 VALIDACION`, `401 CREDENCIALES_INVALIDAS`, `423 CUENTA_BLOQUEADA`, `429 DEMASIADAS_PETICIONES` |
| `POST /api/v1/auth/refresh` | `{ refreshToken }` | `200` `RespuestaSesion` | `400 VALIDACION`, `401 SESION_INVALIDA` |
| `POST /api/v1/auth/logout` | `{ refreshToken }` | `204` | `400 VALIDACION` |
| `GET /api/v1/auth/sesion` | `Authorization: Bearer <accessToken>` | `200` `{ usuario, permisos }` | `401 NO_AUTENTICADO`, `401 TOKEN_INVALIDO` |

```ts
// application/dto/auth.dto.ts
export interface UsuarioSesion {
  id: number;
  nombre: string;
  rol: Rol;
  dependenciaId: number | null;
}
export interface RespuestaSesion {
  accessToken: string;
  accessExpiraEn: string;    // ISO 8601 en UTC
  refreshToken: string;
  refreshExpiraEn: string;   // ISO 8601 en UTC
  usuario: UsuarioSesion;
}
export interface UsuarioAutenticado extends UsuarioSesion {
  permisos: Permisos;
}
```

Validación con Zod:

- `email` es un correo válido y se compara en minúsculas.
- `password` es un texto de 1 a 200 caracteres.
- `refreshToken` es un texto de 1 a 200 caracteres.

El límite de `/auth/login` es de `LOGIN_LIMITE_POR_VENTANA` peticiones (por defecto 10) por IP cada 15 min.

### Middlewares (`presentation/middlewares/`)

- `autenticar`:
  - Lee `Authorization: Bearer <token>`. Sin encabezado responde `401 NO_AUTENTICADO`, y con una firma inválida o un token vencido responde `401 TOKEN_INVALIDO`.
  - En cada petición carga desde la base el usuario activo y los permisos de su rol, con una consulta. Si el usuario no existe o está inactivo, responde `401 TOKEN_INVALIDO`.
  - Deja el resultado en `req.usuario: UsuarioAutenticado`.
- `requierePermiso(accion)`: va después de `autenticar`. Si `req.usuario.permisos[accion]` no existe, responde `403 PERMISO_DENEGADO`. Si existe, deja `req.alcance: Alcance`.
- `manejadorErrores`: es el último middleware de `app.ts`.
  - Traduce `ErrorDeAplicacion` (con `codigo`) al status de la tabla de abajo.
  - Un `ZodError` responde `400 VALIDACION`, y un JSON mal formado también.
  - Cualquier otro error responde `500 ERROR_INTERNO`, sin la traza en el cuerpo.
- Una ruta desconocida bajo `/api/v1` responde `404 NO_ENCONTRADO`.

| `codigo` | Status |
| --- | --- |
| `VALIDACION` | 400 |
| `NO_AUTENTICADO`, `TOKEN_INVALIDO`, `CREDENCIALES_INVALIDAS`, `SESION_INVALIDA` | 401 |
| `PERMISO_DENEGADO` | 403 |
| `NO_ENCONTRADO` | 404 |
| `CUENTA_BLOQUEADA` | 423 |
| `DEMASIADAS_PETICIONES` | 429 |
| `ERROR_INTERNO` | 500 |

Cuerpo de todo error: `{ "codigo": "<CODIGO>", "mensaje": "<texto para desarrolladores>" }`. Es el formato que ya lee `frontend/src/shared/api/http-client.ts` (SPEC 06).

### Variables de entorno (`infrastructure/config/env.ts`)

| Variable | Regla | Ejemplo en `.env.example` |
| --- | --- | --- |
| `JWT_SECRET` | Obligatoria, al menos 32 caracteres | `cambia-este-secreto-de-desarrollo-de-32-chars` |
| `NODE_ENV` | `development`, `test` o `production`. Por defecto `development` | `development` |
| `LOGIN_LIMITE_POR_VENTANA` | Entero > 0. Por defecto 10 | `10` |

### Usuarios de desarrollo (`seeds-desarrollo/06_usuarios.ts`)

- Seis usuarios, `vecino@vozmuni.test` … `administrador@vozmuni.test`, cada uno con su rol, `activo = true` y la contraseña fija `Desarrollo2026`, escrita en el seed y hasheada al ejecutarlo.
- `tecnico` y `coordinador` tienen el `dependencia_id` de `Dirección de Obras` (SPEC 05), y los demás `null`. El `vecino` además tiene `telefono = '55550000'`.
- `dependencias.coordinador_id` no se modifica, porque SPEC 05 exige que quede `null`.
- Es idempotente: `ON CONFLICT ((lower(email))) DO NOTHING`.
- Lo bloquea en producción la guarda de `knexfile-desarrollo.ts` de SPEC 05.

### Archivos nuevos, modificados o eliminados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: usuarios, sesiones, endpoints
CLAUDE.md
frontend/src/shared/auth/roles.ts                # solo el comentario: los roles salen de 0006_roles
backend/
  package.json                                   # jsonwebtoken, bcryptjs, express-rate-limit (+ @types/jsonwebtoken); postbuild crea seeds/
  .env.example                                   # JWT_SECRET, NODE_ENV, LOGIN_LIMITE_POR_VENTANA
  src/
    app.ts                                       # express.json, rutas /api/v1/auth, 404 y manejadorErrores
    container.ts                                 # repositorios, adaptadores y servicios de auth
    domain/auth/
      roles.ts  permisos.ts  bloqueo.ts
      password-hasher.ts                         # interfaz PasswordHasher
      token-service.ts                           # interfaz TokenService
    domain/repositories/
      usuario-repository.ts                      # interfaz UsuarioRepository
      sesion-repository.ts                       # interfaz SesionRepository
    application/
      errors/error-de-aplicacion.ts              # ErrorDeAplicacion { codigo }
      dto/auth.dto.ts
      services/auth.service.ts                   # login, renovar, cerrarSesion
      services/autorizacion.service.ts           # usuarioAutenticado(accessToken)
    infrastructure/
      auth/bcrypt-password-hasher.ts
      auth/jwt-token-service.ts
      repositories/knex-usuario-repository.ts
      repositories/knex-sesion-repository.ts
      config/env.ts
      database/migrations/0005_autenticacion.ts
      database/migrations/0006_roles.ts
      database/seeds/01_roles.ts                 # se elimina
      database/seeds-desarrollo/06_usuarios.ts
    presentation/
      validators/auth.validators.ts
      controllers/auth.controller.ts
      routes/auth.routes.ts
      middlewares/autenticar.ts
      middlewares/requiere-permiso.ts
      middlewares/limite-login.ts
      middlewares/manejador-errores.ts
      http/request-usuario.d.ts                  # amplía Request con usuario y alcance
  tests/
    unit/env.test.ts                             # se amplía
    unit/auth/bloqueo.test.ts
    unit/auth/auth.service.test.ts               # con repositorios y adaptadores falsos
    unit/auth/jwt-token-service.test.ts
    unit/presentation/manejador-errores.test.ts
    unit/presentation/autorizacion.middleware.test.ts
    db/schema.test.ts                            # sesiones, columnas nuevas, roles por migración, 15 tablas
    db/auth.api.test.ts                          # Supertest contra Postgres real
    db/usuarios-desarrollo.test.ts
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con las columnas de `usuarios`, la tabla `sesiones` y los endpoints `logout` y `sesion`. Actualizar la tabla de vacíos de SPEC 02 según lo que resuelve esta spec. Verificación: revisión del diff.
2. Crear `ErrorDeAplicacion`, `manejadorErrores` y el 404 de `/api/v1`, y agregar `express.json()` en `app.ts`. Crear `tests/unit/presentation/manejador-errores.test.ts` con Supertest. Debe cubrir:
   - Ruta desconocida → `404 NO_ENCONTRADO`.
   - JSON mal formado → `400 VALIDACION`.
   - `ErrorDeAplicacion('PERMISO_DENEGADO')` → `403`.
   - Un error cualquiera → `500 ERROR_INTERNO` sin `stack` en el cuerpo.

   Verificación: `npm test` pasa y `/health` sigue igual.
3. Agregar `JWT_SECRET`, `NODE_ENV` y `LOGIN_LIMITE_POR_VENTANA` a `env.ts` y `.env.example`. Ampliar `tests/unit/env.test.ts` con estos casos: falta `JWT_SECRET`, `JWT_SECRET` de 31 caracteres y valores por defecto. Verificación: `npm test` y `npm run typecheck` pasan.
4. Crear `0005_autenticacion.ts`. Ampliar `schema.test.ts` con `sesiones` y las columnas nuevas de `usuarios`, y cambiar la prueba de rollback completo a 15 tablas. Agregar casos: `intentos_fallidos = -1` es rechazado y dos sesiones con el mismo `token_hash` violan UNIQUE. Verificación: `npm run test:db` pasa.
5. Crear `domain/auth/roles.ts` y `domain/auth/permisos.ts`, y la migración `0006_roles.ts` con la matriz literal. Borrar `seeds/01_roles.ts`, y agregar `seeds/` al `postbuild`. En `schema.test.ts`, reemplazar la prueba del seed por estas:
   - Después de `migrate.latest()` hay exactamente 6 roles, y cada `permisos` coincide con la matriz de esta spec.
   - Si los roles ya existían con `permisos = '{}'`, la migración los actualiza.
   - El `down` de `0006` falla si un usuario tiene uno de esos roles.
   - `seed.run()` termina sin error con la carpeta `seeds/` vacía.

   Verificación: `npm run test:db` pasa, y `npm run build && npm run seed:run` termina en 0.
6. Crear `domain/auth/bloqueo.ts`, las interfaces `PasswordHasher` y `TokenService`, y las de `domain/repositories/`. Crear `tests/unit/auth/bloqueo.test.ts`. Casos:
   - 4 fallos no bloquean.
   - El 5.º bloquea 15 min y reinicia el contador.
   - Sigue bloqueado justo antes de que venza, y se desbloquea justo después.
   - Un éxito limpia el estado.

   Verificación: `npm test` y `npm run lint:deps` pasan.
7. Crear `bcrypt-password-hasher.ts` y `jwt-token-service.ts` en `infrastructure/auth/`, y los repositorios Knex. Crear `tests/unit/auth/jwt-token-service.test.ts`. Casos:
   - Un token emitido se verifica.
   - Un token firmado con otro secreto falla.
   - Un token vencido falla.
   - El payload tiene `sub`, `rol` y `dep`.
   - El hash de un token de renovación es SHA-256 en hexadecimal.

   Verificación: `npm test` pasa.
8. Crear `AuthService` (`login`, `renovar`, `cerrarSesion`) y `AutorizacionService`, y `tests/unit/auth/auth.service.test.ts` con falsos. Casos:
   - Login correcto.
   - Correo inexistente: compara contra el hash ficticio.
   - Usuario inactivo y usuario sin `password_hash`.
   - Bloqueo en el 5.º intento y `423` mientras dura.
   - Rotación de la renovación.
   - Reuso: revoca todas las sesiones.
   - Renovación vencida.
   - `cerrarSesion` idempotente.

   Verificación: `npm test` y `npm run lint:deps` pasan.
9. Crear `auth.validators.ts`, `auth.controller.ts`, `auth.routes.ts` y `limite-login.ts`, y conectar todo en `container.ts` y `app.ts`. Crear `tests/db/auth.api.test.ts` con Supertest contra Postgres real. Casos:
   - Login correcto: `200` con los dos tokens y sus vencimientos.
   - Correo con mayúsculas: inicia sesión.
   - Contraseña incorrecta: `401`.
   - Cinco fallos: el 5.º responde `423`, y después la contraseña correcta también responde `423`.
   - `refresh` devuelve tokens nuevos, y el `refreshToken` anterior ya no sirve.
   - Reusar un `refreshToken` rotado revoca las demás sesiones del usuario.
   - `logout`: `204`, y después `refresh` con ese token responde `401`.
   - Con `LOGIN_LIMITE_POR_VENTANA=2`, la 3.ª petición responde `429`.
   - `sesiones.token_hash` no contiene el token en claro.

   Verificación: `npm run test:db` pasa.
10. Crear `autenticar.ts`, `requiere-permiso.ts` y `request-usuario.d.ts`, y la ruta `GET /api/v1/auth/sesion`. Crear `tests/unit/presentation/autorizacion.middleware.test.ts` con una app de prueba que monta `requierePermiso('admin.catalogos')`. Casos:
    - Sin token → `401 NO_AUTENTICADO`.
    - Token vencido → `401 TOKEN_INVALIDO`.
    - Vecino → `403 PERMISO_DENEGADO`.
    - Administrador → `200` con `alcance = 'si'`.

    Agregar a `auth.api.test.ts`: `GET /auth/sesion` devuelve los permisos del rol, y responde `401` si el usuario se desactiva después de emitido el token. Verificación: `npm test`, `npm run test:db` y `npm run lint:deps` pasan.
11. Crear `seeds-desarrollo/06_usuarios.ts`. Crear `tests/db/usuarios-desarrollo.test.ts`: después de `seed:dev` dos veces hay 6 usuarios, cada uno con su rol, `tecnico` y `coordinador` están en `Dirección de Obras`, y todos inician sesión con `Desarrollo2026`. Verificación: `npm run test:db` pasa y `NODE_ENV=production npm run seed:dev` sigue fallando.
12. Actualizar `CLAUDE.md` y el comentario de `frontend/src/shared/auth/roles.ts`. En `CLAUDE.md`:
    - Las variables nuevas de `.env`.
    - Que los roles salen de la migración `0006_roles` y `seed:run` ya no los crea.
    - El orden `migrate:latest` → `seed:run` → `seed:dev`.
    - Los usuarios de desarrollo con su contraseña.
    - Que todo endpoint de negocio debe usar `autenticar` y `requierePermiso`.

    Verificación: revisión del diff.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye `usuarios.intentos_fallidos`, `usuarios.bloqueado_hasta`, la tabla `sesiones` y los endpoints `logout` y `sesion`.
- [ ] `npm run migrate:latest` sobre una base vacía crea `sesiones`, las dos columnas nuevas y los 6 roles, y cada `roles.permisos` coincide exactamente con la matriz de esta spec.
- [ ] En una base donde los roles ya existían con `permisos = '{}'`, `0006_roles` les carga la matriz sin duplicarlos.
- [ ] Un rollback completo, sin usuarios, no deja ninguna de las 15 tablas, y el `down` de `0006_roles` falla si existe un usuario con uno de esos roles.
- [ ] `seeds/01_roles.ts` ya no existe, y `npm run build && npm run seed:run` termina con código 0.
- [ ] `POST /api/v1/auth/login` con credenciales correctas responde `200` con `accessToken` (vence en 15 min), `refreshToken` (vence en 7 días), sus fechas de vencimiento y `usuario`.
- [ ] La tabla `sesiones` guarda el SHA-256 del token de renovación, nunca el token en claro.
- [ ] Una contraseña incorrecta, un correo inexistente, un usuario inactivo y un usuario sin `password_hash` responden `401 CREDENCIALES_INVALIDAS` con el mismo cuerpo.
- [ ] El 5.º intento fallido seguido responde `423 CUENTA_BLOQUEADA`. Durante los 15 min siguientes, incluso la contraseña correcta responde `423`. Pasado el bloqueo, la contraseña correcta inicia sesión y deja `intentos_fallidos = 0`.
- [ ] Con `LOGIN_LIMITE_POR_VENTANA=2`, la 3.ª petición a `/auth/login` desde la misma IP responde `429 DEMASIADAS_PETICIONES`.
- [ ] `POST /auth/refresh` con un `refreshToken` vigente devuelve tokens nuevos, y el anterior deja de servir.
- [ ] Reusar un `refreshToken` ya rotado responde `401 SESION_INVALIDA` y revoca todas las sesiones activas del usuario.
- [ ] `POST /auth/logout` responde `204` con un token vigente, revocado o inexistente, y después `refresh` con ese token responde `401`.
- [ ] `GET /auth/sesion` sin token responde `401 NO_AUTENTICADO`, con un token vencido o mal firmado responde `401 TOKEN_INVALIDO`, y con un token válido devuelve el usuario y sus permisos.
- [ ] Un token de acceso válido de un usuario desactivado después de emitirlo responde `401`.
- [ ] `requierePermiso('admin.catalogos')` responde `403 PERMISO_DENEGADO` al vecino y deja pasar al administrador con `alcance = 'si'`.
- [ ] Toda respuesta de error de `/api/v1` tiene la forma `{ codigo, mensaje }`, y un error inesperado responde `500 ERROR_INTERNO` sin traza.
- [ ] El backend no arranca sin `JWT_SECRET` o con un `JWT_SECRET` de menos de 32 caracteres.
- [ ] `seed:dev` crea los 6 usuarios de desarrollo, cada uno inicia sesión con `Desarrollo2026`, y ejecutarlo dos veces no los duplica.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta las variables nuevas, el origen de los roles, el orden de los seeds, los usuarios de desarrollo y la regla de usar `autenticar` y `requierePermiso` en los endpoints de negocio.

## Decisiones

- **Sí:** login, renovación, logout, bloqueo (RNF-09), middleware de autenticación y autorización por rol (RF-05) en una sola spec. Son las piezas que toda spec de negocio necesita juntas.
- **No:** RF-01, RF-03 ni RF-04. Cada uno va en su propia spec.
- **Sí:** solo backend. El login del frontend va en una spec aparte, porque esta ya es grande con RF-05 incluido.
- **Sí:** token de renovación aleatorio, guardado como SHA-256 en `sesiones`, con rotación en cada uso. Permite revocarlo en el logout y detectar reuso, y el backend sigue sin estado en memoria (RNF-03).
- **No:** token de renovación JWT sin tabla.
- **Sí:** los dos tokens en el cuerpo JSON, como eligió el usuario.
- **No:** cookie httpOnly. Por eso `/auth/refresh` y `/auth/logout` reciben `{ refreshToken }` y no se usa cookie-parser.
- **Sí:** ante el reuso de un token rotado se revocan todas las sesiones del usuario. Con el token expuesto al JavaScript del cliente, esta defensa contra robo pesa más.
- **No:** solo rechazar el token reusado.
- **Sí:** renovación de 7 días desde cada rotación (ventana deslizante). Un usuario activo no tiene que volver a entrar cada semana.
- **Sí:** bloqueo temporal de 15 min, con columnas en `usuarios`. Se desbloquea solo, porque todavía no existe RF-04.
- **No:** bloqueo hasta que el administrador desbloquee.
- **Sí:** el intento que bloquea responde `423`, y los anteriores `401`.
- **Sí:** el mismo `401` para un correo inexistente, un usuario inactivo o sin contraseña, comparando contra un hash ficticio. No revela qué correos existen.
- **Sí:** matriz de permisos en `roles.permisos` (jsonb). Es lo que SPEC 03 dejó pendiente, y el administrador podrá editarla sin desplegar (RNF-22).
- **No:** constante de permisos en el código.
- **Sí:** roles y permisos cargados en la migración `0006_roles`, como eligió el usuario. Eso **cambia la decisión de SPEC 03**, que los cargaba con el seed `01_roles`. El seed se elimina para que haya una sola fuente.
- **No:** un seed nuevo `02_permisos_roles`, ni cambiar `01_roles` a `DO UPDATE`.
- **Sí:** `0006_roles` usa `DO UPDATE` sobre `permisos`, para cubrir las bases donde el seed ya creó los roles vacíos.
- **Sí:** el `down` de `0006_roles` borra los 6 roles y falla si hay usuarios con esos roles. Es el inverso exacto del `up`, como exige la convención de SPEC 03, y coherente con `ON DELETE RESTRICT`.
- **No:** borrar en cascada los usuarios, ni solo vaciar `permisos`.
- **Sí:** los datos de `0006_roles` van literales en la migración, sin importar `domain/auth/`. Una migración aplicada no puede cambiar de comportamiento si cambia el código.
- **Sí:** se conserva `seed:run`, y `postbuild` crea `dist/.../seeds/` aunque la carpeta quede vacía. Queda lista para futuros seeds base.
- **Sí:** permisos leídos de la base en cada petición. Un cambio de permisos o una desactivación se aplica de inmediato. El JWT lleva solo `sub`, `rol` y `dep`.
- **No:** permisos dentro del JWT.
- **Sí:** el middleware solo decide si la acción está permitida y deja `usuario` y `alcance` en la petición. Aplicar el alcance al recurso es de cada servicio.
- **No:** un helper genérico de alcance en esta spec.
- **Sí:** manejador global de errores con `{ codigo, mensaje }` en el primer nivel, el formato que ya lee el cliente HTTP de SPEC 06.
- **Sí:** express-rate-limit en `/auth/login`, con límite configurable para poder probarlo.
- **Sí:** `bcryptjs` con costo 12. Es el mismo algoritmo (RNF-08), no necesita compilar, y npm en este entorno bloquea los scripts de instalación de paquetes nativos.
- **No:** `bcrypt` nativo ni `argon2`.
- **Sí:** usuarios de desarrollo en `seeds-desarrollo/` de SPEC 05, uno por rol, con la contraseña fija `Desarrollo2026` en el seed, como eligió el usuario.
- **No:** contraseña desde `.env`.
- **Sí:** los correos `<rol>@vozmuni.test`, y `Dirección de Obras` para el técnico y el coordinador, son una propuesta de esta spec. El usuario puede ajustarlos al revisarla.
- **Sí:** `GET /auth/sesion` como endpoint protegido mínimo. Permite probar `autenticar` de punta a punta antes de que exista un endpoint de negocio.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La contraseña fija `Desarrollo2026` llega a producción | Los usuarios viven en `seeds-desarrollo/`, que la guarda de SPEC 05 bloquea con `NODE_ENV=production`. `CLAUDE.md` lo advierte. La spec de despliegue debe fijar `NODE_ENV=production`. |
| El token de renovación en el cuerpo JSON queda expuesto si el frontend sufre un XSS | La rotación y la revocación total ante reuso limitan el daño. La spec del frontend debe decidir dónde guardarlo. |
| Dos peticiones simultáneas de `refresh` con el mismo token cierran todas las sesiones del usuario | La spec del frontend debe compartir una sola renovación en curso entre las peticiones. |
| SPEC 05 todavía no está implementada y el paso 11 la necesita | Los pasos 1 a 10 no dependen de ella. Si SPEC 05 no está lista, el paso 11 espera. |
| El rollback de `0006_roles` falla en una base con usuarios | Es intencional, y el mensaje de error lo explica. Para volver a cero hay que borrar los usuarios antes, o recrear la base con `docker compose down -v`. |
| Mover los roles a una migración contradice SPEC 03, que ya está implementada | Se registra aquí como decisión, `0006_roles` actualiza las bases existentes, y `CLAUDE.md` documenta el cambio. |
| Detrás de Nginx todas las peticiones llegan con la misma IP y el límite de login bloquea a todos | `trust proxy` queda para la spec de despliegue, y debe configurarse antes de exponer el sistema. |
| Leer los permisos de la base en cada petición agrega latencia | Es una consulta por id con índice de clave primaria. Si RNF-01 lo exige, una spec futura agrega caché con invalidación. |
| Las sesiones vencidas se acumulan en `sesiones` | Una spec futura agrega un job de limpieza en `infrastructure/jobs/`. |
| `bcryptjs` con costo 12 hace lentas las pruebas de bloqueo | Son pocos logins por prueba. Si molesta, el costo puede inyectarse en el adaptador y bajarse en las pruebas. |

## Lo que **no** está en esta spec

- Login, sesión y renovación en el frontend.
- Registro del vecino, verificación de correo y recuperación de contraseña.
- Gestión de usuarios por el administrador y desbloqueo manual.
- Política de contraseña al crearla.
- Restricción por recurso según dependencia y transiciones permitidas por rol.
- Pantalla de administración de permisos.
- Bitácora de inicios de sesión.
- Limpieza de sesiones vencidas.
- helmet, HTTPS, HSTS y `trust proxy`.

Cada uno de estos temas, cuando llegue, va en su propia spec.
