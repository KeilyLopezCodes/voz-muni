# SPEC 10 — Gestión de usuarios internos

> **Estado:** Implementado
> **Depende de:** SPEC 08, SPEC 09
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el administrador cree usuarios internos con rol y dependencia, los invite por correo a definir su contraseña, los edite, los desactive y reactive, y los desbloquee, mediante endpoints `/api/v1/admin/usuarios` protegidos por el permiso `admin.usuarios`.

## Por qué existe esta spec

RF-04 es un requerimiento **M**: el administrador crea usuarios internos, les asigna rol y dependencia, y puede desactivarlos.
Hoy los únicos usuarios con contraseña son los de desarrollo (SPEC 08). Sin esta spec no hay forma de dar de alta a un receptor, un técnico o un coordinador en un entorno real.
Reutiliza la autenticación de SPEC 08 y el correo, las plantillas, la política de contraseña y los enlaces de un solo uso de SPEC 09. Además amplía SPEC 09 en dos puntos, descritos abajo.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición (endpoints y modelo de datos) antes de las migraciones.
- Migración `0009_permiso_admin_usuarios`: acción `admin.usuarios` para el rol `administrador`.
- Migración `0010_invitaciones`: columna `tipo` en `restablecimientos` y plantillas `invitacion_usuario` y `cuenta_desactivada`.
- Reglas de usuario interno en `domain/usuarios/`: roles asignables, dependencia según rol, DPI de 13 dígitos y protección de administradores.
- Endpoints de alta, listado paginado con filtros, detalle, edición, desactivación, reactivación y desbloqueo.
- Invitación por correo con un enlace de un solo uso que vence en 24 h, que se usa en `/auth/restablecer` de SPEC 09.
- Revocación de sesiones al cambiar el rol o la dependencia y al desactivar.
- Correo de aviso al desactivar.
- **Ampliaciones de SPEC 09:**
  - `/auth/recuperar` también envía el enlace a usuarios internos activos sin contraseña. Así un usuario cuya invitación venció puede obtener otro enlace.
  - `/auth/restablecer` no envía el aviso `password_cambiado` cuando el token es de invitación.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantalla de administración de usuarios en el frontend.
- Registro de vecinos (RF-01) y alta de vecinos en ventanilla (RF-07). El rol `vecino` no se asigna aquí, y los vecinos no aparecen en el listado.
- Endpoint para reenviar la invitación. El usuario usa "olvidé mi contraseña".
- Edición del correo y del DPI.
- `dependencias.coordinador_id`, que se gestiona con el catálogo de dependencias (RF-41).
- Qué pasa con los tickets asignados a un técnico que cambia de dependencia o se desactiva (specs de asignación, RF-14).
- Validación del dígito verificador del DPI.
- Registro en `bitacora` (spec de RF-42).
- Borrado de usuarios. Nunca se borran (SPEC 03).

## Modelo de datos

### Cambios en el documento de definición

Antes de las migraciones se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- Tabla `restablecimientos`: se agrega `tipo`.
- Endpoints: la fila `/api/v1/admin/*` se detalla con los 7 endpoints de `/api/v1/admin/usuarios`.

### `0009_permiso_admin_usuarios`

- `up`: `UPDATE roles SET permisos = permisos || '{"admin.usuarios": "si"}' WHERE nombre = 'administrador'`.
- `down`: `UPDATE roles SET permisos = permisos - 'admin.usuarios' WHERE nombre = 'administrador'`.
- `domain/auth/permisos.ts` agrega `'admin.usuarios'` a `ACCIONES`.

### `0010_invitaciones`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `restablecimientos` | `tipo` | text | NOT NULL, DEFAULT `'recuperacion'`, CHECK `IN ('recuperacion', 'invitacion')` |

- El `up` también inserta 2 plantillas en `plantillas_notificacion` con `ON CONFLICT (clave) DO NOTHING`.
- El `down` borra esas 2 plantillas y la columna `tipo`.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `invitacion_usuario` | `VozMuni: activa tu cuenta` | `{{nombre}}`, `{{rol}}`, `{{enlace}}` |
| `cuenta_desactivada` | `VozMuni: tu cuenta fue desactivada` | `{{nombre}}` |

Cuerpo de texto de `invitacion_usuario`:

```text
Hola {{nombre}}:

La municipalidad creó tu cuenta de VozMuni con el rol {{rol}}.
Abre este enlace en las próximas 24 horas para definir tu contraseña:

{{enlace}}

Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.
```

Cuerpo de texto de `cuenta_desactivada`:

```text
Hola {{nombre}}:

Tu cuenta de VozMuni fue desactivada y se cerraron todas tus sesiones.
Si crees que es un error, comunícate con el administrador del sistema.
```

`cuerpo_html` tiene el mismo texto, con párrafos `<p>` y el enlace como `<a href="{{enlace}}">`.

### Vigencia de los enlaces

| `tipo` | Vence en | Lo crea | Aviso `password_cambiado` al usarlo |
| --- | --- | --- | --- |
| `recuperacion` | 30 min | `/auth/recuperar` (SPEC 09) | Sí |
| `invitacion` | 24 h | alta de usuario (esta spec) | No |

Los dos tipos se usan en `POST /api/v1/auth/restablecer`, con las mismas reglas de SPEC 09. El enlace es el mismo, `APP_URL/restablecer?token=…`. Crear cualquiera de los dos invalida los pendientes del usuario, sean del tipo que sean.

### Reglas (`domain/usuarios/usuario-interno.ts`)

```ts
export const ROLES_INTERNOS = ['receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'] as const;
export type RolInterno = (typeof ROLES_INTERNOS)[number];
export const ROLES_CON_DEPENDENCIA: readonly RolInterno[] = ['tecnico', 'coordinador'];

export function esRolInterno(rol: string): rol is RolInterno;

// Lanza ReglaDeNegocioError: DEPENDENCIA_REQUERIDA si el rol la exige y es null,
// DEPENDENCIA_NO_PERMITIDA si el rol no la admite y no es null.
export function validarAsignacion(rol: RolInterno, dependenciaId: number | null): void;

// Quita espacios; devuelve los 13 dígitos o lanza ReglaDeNegocioError DPI_INVALIDO.
export function normalizarDpi(dpi: string): string;

// Protección de administradores. Lanza ReglaDeNegocioError:
// OPERACION_SOBRE_SI_MISMO si actor = objetivo y la operación desactiva o quita el rol administrador;
// ULTIMO_ADMINISTRADOR si la operación deja 0 administradores activos.
export function verificarProteccionAdmin(p: {
  actorId: number; objetivoId: number; objetivoEsAdminActivo: boolean;
  quedaraAdminActivo: boolean; adminsActivos: number;
}): void;
```

`ReglaDeNegocioError` es la de SPEC 04 (`domain/errors/`).

### DTO (`application/dto/usuario-interno.dto.ts`)

```ts
export interface UsuarioInternoDto {
  id: number;
  nombre: string;
  email: string;
  telefono: string | null;
  dpi: string;                    // 13 dígitos, siempre completo (el endpoint es solo de admin)
  rol: RolInterno;
  dependenciaId: number | null;
  activo: boolean;
  tienePassword: boolean;         // false = invitación pendiente
  bloqueadoHasta: string | null;  // ISO 8601 en UTC
}
export interface PaginaUsuarios {
  datos: UsuarioInternoDto[];
  pagina: number;
  tamano: number;
  total: number;
}
```

### Endpoints

Todos usan `autenticar` y `requierePermiso('admin.usuarios')` de SPEC 08. Un `:id` que no existe o que es de un vecino responde `404 NO_ENCONTRADO`.

| Método y ruta | Entrada | Respuesta correcta | Errores propios |
| --- | --- | --- | --- |
| `GET /api/v1/admin/usuarios` | query `pagina` (≥ 1, por defecto 1), `tamano` (1–100, por defecto 20), `rol`, `dependenciaId`, `activo`, `busqueda` | `200` `PaginaUsuarios`, ordenado por `nombre` y luego `id` | `400 VALIDACION` |
| `GET /api/v1/admin/usuarios/:id` | — | `200` `UsuarioInternoDto` | `404` |
| `POST /api/v1/admin/usuarios` | `{ nombre, email, dpi, telefono?, rol, dependenciaId? }` | `201` `{ usuario, invitacionEnviada }` | `400 ROL_NO_PERMITIDO`, `400 DEPENDENCIA_REQUERIDA`, `400 DEPENDENCIA_NO_PERMITIDA`, `400 DEPENDENCIA_INVALIDA`, `400 DPI_INVALIDO`, `409 EMAIL_DUPLICADO`, `409 DPI_DUPLICADO` |
| `PATCH /api/v1/admin/usuarios/:id` | `{ nombre?, telefono?, rol?, dependenciaId? }` (al menos uno) | `200` `UsuarioInternoDto` | los de dependencia y rol, `409 OPERACION_SOBRE_SI_MISMO`, `409 ULTIMO_ADMINISTRADOR` |
| `POST /api/v1/admin/usuarios/:id/desactivacion` | — | `200` `UsuarioInternoDto` | `409 OPERACION_SOBRE_SI_MISMO`, `409 ULTIMO_ADMINISTRADOR` |
| `POST /api/v1/admin/usuarios/:id/activacion` | — | `200` `UsuarioInternoDto` | — |
| `POST /api/v1/admin/usuarios/:id/desbloqueo` | — | `200` `UsuarioInternoDto` | — |

Reglas de entrada:

- `nombre`: texto recortado, de 1 a 150 caracteres.
- `email`: correo válido, guardado en minúsculas.
- `telefono`: texto de 8 a 20 caracteres, o `null` en `PATCH` para borrarlo.
- `dpi`: 13 dígitos, se aceptan espacios entre ellos.
- `rol`: debe ser uno de `ROLES_INTERNOS`. `vecino` o un valor desconocido responden `ROL_NO_PERMITIDO`.
- `dependenciaId`: debe existir y estar activa, o responde `DEPENDENCIA_INVALIDA`.
- `busqueda` filtra por `nombre` o `email` con `ILIKE`, de 1 a 100 caracteres.
- En `PATCH`, la regla de dependencia se valida sobre el **estado final**. Para cambiar un técnico a supervisor hay que enviar también `dependenciaId: null`.
- Los campos no editables (`email`, `dpi`, `activo`) en `PATCH` responden `400 VALIDACION`.

### Efectos de cada operación

| Operación | Efectos |
| --- | --- |
| Alta | Crea el usuario con `activo = true` y `password_hash = null`. En la misma transacción crea un enlace `invitacion` de 24 h. Después del commit envía `invitacion_usuario` **esperando el resultado**: si falla, responde `201` con `invitacionEnviada: false` y registra el error en el log. |
| Edición | Si cambia `rol` o `dependenciaId`, revoca todas las sesiones activas del usuario. Un cambio solo de `nombre` o `telefono` no las revoca. |
| Desactivación | `activo = false`. Revoca todas sus sesiones e invalida sus enlaces pendientes. Después envía `cuenta_desactivada` sin esperar; si falla, se registra en el log. Si el usuario ya estaba inactivo, no hace nada y responde `200`. |
| Reactivación | `activo = true`. No envía correo ni crea un enlace: si no tiene contraseña, usa "olvidé mi contraseña". Si ya estaba activo, responde `200`. |
| Desbloqueo | `intentos_fallidos = 0` y `bloqueado_hasta = null`. |

Protección de administradores. Se aplica a la desactivación y a un `PATCH` que cambia el rol de un administrador:

- El actor no puede desactivarse ni quitarse el rol `administrador` a sí mismo (`409 OPERACION_SOBRE_SI_MISMO`).
- Ninguna operación puede dejar 0 administradores activos (`409 ULTIMO_ADMINISTRADOR`).
- El conteo se hace dentro de la transacción, con `SELECT ... FOR UPDATE` sobre los administradores activos. Así, dos administradores que se desactivan entre sí al mismo tiempo no dejan el sistema sin ninguno.

### Cambios en SPEC 09

| Punto de SPEC 09 | Cambio |
| --- | --- |
| Flujo `/auth/recuperar`, paso 2 | Ya no se descarta a un usuario sin `password_hash` si su rol es interno. Solo se ignoran los correos inexistentes, los usuarios inactivos y los vecinos sin contraseña. La respuesta sigue siendo `202` idéntica. |
| Flujo `/auth/restablecer`, paso 6 | El aviso `password_cambiado` se envía solo si el token es de tipo `recuperacion`. |
| `RestablecimientoRepository.crear` | Recibe `tipo` y calcula `expira_en` según la tabla de vigencias. |

### Códigos de error nuevos

Se agregan a la tabla del manejador de errores de SPEC 08:

| `codigo` | Status |
| --- | --- |
| `ROL_NO_PERMITIDO`, `DEPENDENCIA_REQUERIDA`, `DEPENDENCIA_NO_PERMITIDA`, `DEPENDENCIA_INVALIDA`, `DPI_INVALIDO` | 400 |
| `EMAIL_DUPLICADO`, `DPI_DUPLICADO`, `OPERACION_SOBRE_SI_MISMO`, `ULTIMO_ADMINISTRADOR` | 409 |

`EMAIL_DUPLICADO` y `DPI_DUPLICADO` se obtienen traduciendo la violación de UNIQUE (`23505`) de `usuarios_email_lower_unique` y de `usuarios_dpi_key` en el repositorio. Un correo o DPI que ya usa un **vecino** también es duplicado.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts                                           # rutas /api/v1/admin/usuarios
    container.ts                                     # repositorio y servicio de usuarios
    domain/auth/permisos.ts                          # + 'admin.usuarios'
    domain/usuarios/usuario-interno.ts
    domain/repositories/usuario-admin-repository.ts  # interfaz UsuarioAdminRepository
    domain/repositories/restablecimiento-repository.ts   # crear() recibe tipo
    application/dto/usuario-interno.dto.ts
    application/services/usuarios.service.ts         # listar, obtener, crear, actualizar, desactivar, activar, desbloquear
    application/services/recuperacion.service.ts     # cambios de SPEC 09
    infrastructure/
      repositories/knex-usuario-admin-repository.ts
      repositories/knex-restablecimiento-repository.ts
      database/migrations/0009_permiso_admin_usuarios.ts
      database/migrations/0010_invitaciones.ts
    presentation/
      validators/usuarios.validators.ts
      controllers/usuarios.controller.ts
      routes/usuarios.routes.ts
      middlewares/manejador-errores.ts               # 9 códigos nuevos
  tests/
    unit/usuarios/usuario-interno.test.ts
    unit/usuarios/usuarios.service.test.ts           # con repositorios y enviador falsos
    unit/auth/recuperacion.service.test.ts           # casos nuevos de SPEC 09
    db/schema.test.ts                                # columna tipo, plantillas y permiso
    db/usuarios-admin.api.test.ts                    # Supertest contra Postgres real, enviador falso
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `restablecimientos.tipo` y los 7 endpoints de `/api/v1/admin/usuarios`. Verificación: revisión del diff.
2. Crear `0009_permiso_admin_usuarios.ts` y agregar `'admin.usuarios'` a `ACCIONES`. Ampliar `schema.test.ts`:
   - Después de `migrate.latest()`, `administrador` tiene `admin.usuarios = 'si'` y ningún otro rol lo tiene.
   - Al revertir solo esa migración, la clave desaparece y el resto de los permisos queda igual.

   Verificación: `npm run test:db` y `npm run typecheck` pasan.
3. Crear `0010_invitaciones.ts`. Ampliar `schema.test.ts`:
   - Existe `tipo` con `'recuperacion'` por defecto.
   - `tipo = 'otro'` es rechazado.
   - Existen las plantillas `invitacion_usuario` y `cuenta_desactivada`.

   Verificación: `npm run test:db` pasa.
4. Crear `domain/usuarios/usuario-interno.ts` y `tests/unit/usuarios/usuario-interno.test.ts`. Casos:
   - `esRolInterno` rechaza `vecino`.
   - `validarAsignacion`: técnico sin dependencia → `DEPENDENCIA_REQUERIDA`; supervisor con dependencia → `DEPENDENCIA_NO_PERMITIDA`; coordinador con dependencia → válido.
   - `normalizarDpi('2547 12345 0101')` devuelve `2547123450101`; 12 dígitos o letras → `DPI_INVALIDO`.
   - `verificarProteccionAdmin`: desactivarse a sí mismo → `OPERACION_SOBRE_SI_MISMO`; desactivar al único administrador activo → `ULTIMO_ADMINISTRADOR`; desactivar a otro con 2 activos → válido.

   Verificación: `npm test` y `npm run lint:deps` pasan.
5. Crear la interfaz `UsuarioAdminRepository` y `knex-usuario-admin-repository.ts`:
   - `listar` con filtros, paginación y total, excluyendo vecinos.
   - `obtenerInterno`, `crear` y `actualizar`.
   - `contarAdminsActivosParaActualizar`, con `FOR UPDATE`.
   - Traducción de `23505` a `EMAIL_DUPLICADO` y `DPI_DUPLICADO`.

   Cambiar `RestablecimientoRepository.crear` para que reciba `tipo`. Verificación: `npm run typecheck` y `npm run test:db` pasan.
6. Crear `UsuariosService` y `tests/unit/usuarios/usuarios.service.test.ts` con falsos. Casos:
   - El alta crea el usuario y el enlace `invitacion` de 24 h, y envía `invitacion_usuario` con el nombre, el rol y el enlace.
   - Un fallo del enviador en el alta devuelve `invitacionEnviada: false` y el usuario igual queda creado.
   - Cambiar el rol o la dependencia revoca las sesiones; cambiar solo el nombre no.
   - Desactivar revoca las sesiones, invalida los enlaces y envía `cuenta_desactivada`.
   - Desactivar a un usuario ya inactivo no hace nada.
   - Reactivar no envía correo.
   - Desbloquear limpia el bloqueo.
   - La protección de administradores se aplica en la desactivación y en el `PATCH` de rol.

   Verificación: `npm test` y `npm run lint:deps` pasan.
7. Aplicar los cambios de SPEC 09 en `RecuperacionService` y ampliar `recuperacion.service.test.ts`:
   - Un usuario interno activo sin contraseña recibe el enlace de recuperación.
   - Un vecino sin contraseña no recibe nada.
   - Restablecer con un token `invitacion` no envía `password_cambiado`.
   - Restablecer con un token `recuperacion` sí lo envía.

   Verificación: `npm test` pasa.
8. Crear `usuarios.validators.ts`, `usuarios.controller.ts` y `usuarios.routes.ts`, agregar los 9 códigos al manejador de errores y conectar todo en `container.ts` y `app.ts`. Crear `tests/db/usuarios-admin.api.test.ts` con el enviador falso. Casos:
   - Sin token → `401`; con un rol que no es administrador → `403`.
   - Alta de un técnico → `201` con `invitacionEnviada: true`. El correo capturado tiene un enlace con el que `/auth/restablecer` define la contraseña, inicia sesión y no envía `password_cambiado`. Después, `/auth/login` funciona.
   - Un token de invitación con más de 24 h → `400 TOKEN_RECUPERACION_INVALIDO`.
   - Alta con un correo en mayúsculas de un usuario existente → `409 EMAIL_DUPLICADO`; con un DPI repetido → `409 DPI_DUPLICADO`; con `rol: 'vecino'` → `400 ROL_NO_PERMITIDO`; un supervisor con dependencia → `400`; con una dependencia inactiva → `400 DEPENDENCIA_INVALIDA`.
   - Listado: pagina 20 por defecto, filtra por `rol`, `dependenciaId`, `activo` y `busqueda`, no incluye vecinos, y `total` es correcto.
   - `PATCH` de rol: el `refreshToken` previo del usuario responde `401`. Un `PATCH` con `email` → `400`.
   - Desactivar: el usuario no puede iniciar sesión, su token de acceso vigente responde `401`, y llega `cuenta_desactivada`. Reactivar: puede volver a iniciar sesión.
   - El administrador se desactiva a sí mismo → `409 OPERACION_SOBRE_SI_MISMO`. Desactivar al único administrador activo desde otro rol no es posible por permisos; con dos administradores, el segundo puede desactivar al primero, y después ya no puede desactivarse a sí mismo.
   - Desbloqueo: un usuario bloqueado (5 fallos, SPEC 08) puede iniciar sesión de inmediato.
   - `/auth/recuperar` para un usuario interno con la invitación vencida envía un enlace nuevo.

   Verificación: `npm run test:db` pasa.
9. Actualizar `CLAUDE.md`: los endpoints de `/api/v1/admin/usuarios`, que el alta envía una invitación de 24 h y no hay reenvío (se usa "olvidé mi contraseña"), y que los usuarios nunca se borran. Verificación manual con Ethereal: `administrador@vozmuni.test` da de alta un técnico, el correo de invitación aparece en Ethereal, y con su enlace el técnico define su contraseña e inicia sesión.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `restablecimientos.tipo` y los 7 endpoints de `/api/v1/admin/usuarios`.
- [x] Después de `migrate:latest`, solo el rol `administrador` tiene `admin.usuarios = 'si'`, y existen las plantillas `invitacion_usuario` y `cuenta_desactivada`.
- [x] Un rollback completo, sin usuarios, sigue sin dejar tablas, y revertir `0009` y `0010` deja los permisos y `restablecimientos` como estaban después de SPEC 09.
- [x] Todos los endpoints de `/api/v1/admin/usuarios` responden `401` sin token y `403 PERMISO_DENEGADO` a cualquier rol distinto de `administrador`.
- [x] El alta de un usuario interno responde `201`, lo deja activo y sin contraseña, y envía `invitacion_usuario` con un enlace que vence a las 24 h.
- [x] Con el enlace de invitación, `/auth/restablecer` define la contraseña e inicia sesión sin enviar `password_cambiado`, y después `/auth/login` funciona con esa contraseña.
- [x] Si el envío de la invitación falla, el alta responde `201` con `invitacionEnviada: false`, y el usuario existe.
- [x] El alta rechaza `rol: 'vecino'` (`ROL_NO_PERMITIDO`), un técnico o coordinador sin dependencia (`DEPENDENCIA_REQUERIDA`), un receptor, supervisor o administrador con dependencia (`DEPENDENCIA_NO_PERMITIDA`), y una dependencia inexistente o inactiva (`DEPENDENCIA_INVALIDA`).
- [x] El alta rechaza un DPI que no tiene 13 dígitos (`DPI_INVALIDO`), acepta `2547 12345 0101` y lo guarda como `2547123450101`.
- [x] Un correo repetido, sin distinguir mayúsculas, responde `409 EMAIL_DUPLICADO`, y un DPI repetido responde `409 DPI_DUPLICADO`, aunque el existente sea de un vecino.
- [x] El listado está paginado (20 por defecto, máximo 100), filtra por `rol`, `dependenciaId`, `activo` y `busqueda`, nunca incluye vecinos, y devuelve el `total` correcto.
- [x] `GET /admin/usuarios/:id` con el id de un vecino responde `404 NO_ENCONTRADO`.
- [x] `PATCH` cambia nombre, teléfono, rol y dependencia, valida la regla de dependencia sobre el estado final, y rechaza `email`, `dpi` y `activo` con `400 VALIDACION`.
- [x] Un `PATCH` que cambia el rol o la dependencia revoca todas las sesiones del usuario, y uno que cambia solo el nombre no.
- [x] La desactivación deja `activo = false`, revoca las sesiones, invalida los enlaces pendientes y envía `cuenta_desactivada`. Después, el login responde `401` y el token de acceso vigente también.
- [x] La reactivación deja `activo = true` y el usuario puede volver a iniciar sesión con su contraseña.
- [x] Un administrador no puede desactivarse ni quitarse el rol a sí mismo (`409 OPERACION_SOBRE_SI_MISMO`), y ninguna operación deja 0 administradores activos (`409 ULTIMO_ADMINISTRADOR`).
- [x] El desbloqueo permite iniciar sesión de inmediato a un usuario bloqueado por 5 intentos fallidos.
- [x] `/auth/recuperar` envía un enlace a un usuario interno activo sin contraseña, no envía nada a un vecino sin contraseña, y responde `202` idéntica en ambos casos.
- [x] Ningún asunto ni cuerpo de correo nuevo está escrito en `src/` fuera de la migración `0010_invitaciones`.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta los endpoints, la invitación y su vigencia, y que los usuarios nunca se borran.

## Decisiones

- **Sí:** solo backend. La pantalla de administración va en una spec de frontend, igual que SPEC 08 y 09.
- **Sí:** el usuario se crea sin contraseña y recibe una invitación por correo, con un enlace de un solo uso para definirla. El administrador nunca conoce la contraseña.
- **No:** que el admin defina una contraseña temporal, ni que se genere y se muestre una vez.
- **Sí:** la invitación vence en 24 h, como eligió el usuario.
- **No:** 72 h, ni 30 min como la recuperación.
- **Sí:** la invitación reutiliza `restablecimientos` y `/auth/restablecer` de SPEC 09, con una columna `tipo` que fija la vigencia y omite el aviso `password_cambiado` en la primera contraseña.
- **No:** un endpoint propio `/auth/activar`.
- **Sí:** no hay endpoint de reenvío; si la invitación vence, el usuario usa "olvidé mi contraseña". Para que eso funcione, esta spec **amplía `/auth/recuperar` de SPEC 09** a usuarios internos activos sin contraseña. Los vecinos sin contraseña siguen sin recibir nada, porque eso es RF-01.
- **No:** endpoint `POST /admin/usuarios/:id/invitacion`, ni editar SPEC 09 directamente.
- **Sí:** acción nueva `admin.usuarios`, separada de `admin.catalogos`, para que un rol futuro pueda tener una sin la otra.
- **Sí:** los 5 roles internos son asignables, incluido `administrador`. `vecino` no, porque los vecinos se registran solos (RF-01) o en ventanilla (RF-07).
- **Sí:** técnico y coordinador exigen dependencia, y receptor, supervisor y administrador no la llevan, porque la matriz de la sección 2 solo limita a los dos primeros.
- **No:** dependencia obligatoria u opcional para todos.
- **Sí:** `dependencias.coordinador_id` no se toca aquí. Es un dato del catálogo de dependencias (RF-41).
- **Sí:** se pueden editar el nombre, el teléfono, el rol y la dependencia. El correo no, porque identifica el login y es el destino de los enlaces.
- **Sí:** el DPI es obligatorio para los internos, tiene 13 dígitos, y el administrador siempre lo ve completo. Como no se eligió como editable, no se puede cambiar después del alta. La validación del dígito verificador queda fuera.
- **No:** DPI opcional, ni enmascarado en el listado.
- **Sí:** cambiar el rol o la dependencia revoca las sesiones del usuario, como eligió el usuario, para que el próximo token refleje el rol nuevo. Cambiar solo el nombre o el teléfono no las revoca.
- **Sí:** la desactivación revoca las sesiones, invalida los enlaces pendientes y avisa por correo, y existe la reactivación. Los usuarios nunca se borran (SPEC 03).
- **Sí:** la desactivación y la reactivación son idempotentes.
- **Sí:** un administrador no puede desactivarse ni quitarse el rol a sí mismo, y nunca puede quedar el sistema sin administradores activos. El conteo usa `FOR UPDATE` para que dos operaciones simultáneas no lo dejen en 0.
- **Sí:** endpoint de desbloqueo manual, que SPEC 08 dejó para RF-04.
- **Sí:** listado paginado con filtros por rol, dependencia, estado y búsqueda (RNF-04), solo de usuarios internos.
- **Sí:** si la invitación no se puede enviar, el alta responde `201` con `invitacionEnviada: false`. Aquí no hay riesgo de revelar correos, porque el endpoint es solo de administradores. Por eso este envío sí se espera, a diferencia de SPEC 09.
- **No:** revertir el alta, ni registrar el fallo solo en el log.
- **Sí:** el aviso `cuenta_desactivada` se envía sin esperar y un fallo se registra en el log, porque la desactivación ya ocurrió y no debe depender del correo. No se preguntó explícitamente y puede revisarse.
- **Sí:** los textos de las plantillas, los nombres de los endpoints (`/desactivacion`, `/activacion`, `/desbloqueo`) y los códigos de error los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| SPEC 08 y 09 todavía están en Borrador, y esta spec usa y amplía ambas | Se implementa después de las dos. Si cambian, se revisa esta antes de aprobarla. |
| Ampliar `/auth/recuperar` cambia el comportamiento definido en SPEC 09 | El cambio está documentado en "Cambios en SPEC 09" y probado en el paso 7. La respuesta sigue siendo `202` idéntica, así que no se revelan correos. |
| Un técnico desactivado o movido de dependencia deja tickets asignados sin atender | Queda fuera de alcance. La spec de asignación (RF-14) debe definir la reasignación. |
| El DPI no se puede corregir si el administrador lo escribe mal | Se puede desactivar el usuario y crear otro, pero el DPI queda ocupado por UNIQUE. Una spec futura puede agregar la edición del DPI si hace falta. |
| El DPI completo en el listado expone un dato sensible (RNF-12) | Solo lo ven los administradores, por el permiso `admin.usuarios`. Si RNF-12 lo exige, una spec futura lo enmascara. |
| Un correo de invitación que no llega deja al usuario sin forma de entrar | `invitacionEnviada: false` avisa al administrador, y el usuario puede usar "olvidé mi contraseña" con la ampliación de SPEC 09. |
| Cambiar el rol de un usuario cierra sus sesiones en medio de su trabajo | Es intencional. La alternativa de no revocar se descartó. |

## Lo que **no** está en esta spec

- Pantalla de administración de usuarios.
- Registro de vecinos y alta en ventanilla.
- Reenvío de invitaciones.
- Edición del correo y del DPI, y validación de su dígito verificador.
- Coordinador de cada dependencia.
- Reasignación de tickets de usuarios movidos o desactivados.
- Bitácora y borrado de usuarios.

Cada uno de estos temas, cuando llegue, va en su propia spec.
