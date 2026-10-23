# SPEC 13 — Alta de vecino en ventanilla

> **Estado:** Borrador
> **Depende de:** SPEC 09, SPEC 10, SPEC 12
> **Fecha:** 2026-10-22
> **Objetivo:** Exponer `POST /api/v1/vecinos` para que un receptor o supervisor dé de alta a un vecino nuevo sin cuenta (nombre, DPI y correo o teléfono), invitándolo por correo a definir su contraseña si dio un correo, para luego registrar su queja con `POST /api/v1/tickets` de SPEC 12.

## Por qué existe esta spec

RF-07 pide que el receptor registre una queja a nombre de un vecino **existente o nuevo**. SPEC 12 ya cubre al vecino existente: el registro con `solicitanteId` y `canal`, y la búsqueda `GET /api/v1/vecinos`.
Falta el alta del vecino nuevo. Sin ella, quien llama por teléfono o llega a ventanilla sin cuenta en el portal no puede presentar una queja.
SPEC 03 ya lo previó: un vecino puede existir sin contraseña, con correo **o** teléfono.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición (endpoint nuevo) antes de la migración.
- Migración `0013_invitacion_vecino`: plantilla `invitacion_vecino`.
- Reglas del vecino en `domain/usuarios/vecino.ts`: nombre, DPI obligatorio, correo o teléfono, y teléfono guatemalteco de 8 dígitos.
- `POST /api/v1/vecinos` para el receptor y el supervisor: crea el vecino activo, sin contraseña.
- Si el vecino dio correo, una invitación de 24 h (`restablecimientos.tipo = 'invitacion'`, de SPEC 10) con la plantilla `invitacion_vecino`.
- Respuesta `201` con `invitacionEnviada`.
- Duplicados por correo o DPI: `409` sin datos del registro existente.
- **Cambio sobre SPEC 09 y 10:** `/auth/recuperar` envía el enlace a cualquier usuario activo con correo, incluidos los vecinos sin contraseña.
- **Cambio sobre SPEC 12:** `GET /api/v1/vecinos?telefono=` normaliza el teléfono antes de buscar.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantalla de ventanilla en el frontend (buscar, dar de alta y registrar la queja).
- Registro de la queja dentro del mismo `POST`. El vecino y la queja son dos llamadas.
- Registro propio del vecino en el portal con verificación de correo (RF-01).
- Edición y desactivación de vecinos.
- Teléfonos extranjeros o con prefijo internacional.
- Unicidad del teléfono.
- Validación del dígito verificador del DPI.
- Envío de la invitación por SMS (RF-34).
- Registro en `bitacora` (spec de RF-42).

## Modelo de datos

Esta spec no crea tablas ni columnas. Usa `usuarios` (SPEC 03), `restablecimientos` con `tipo` (SPEC 09 y 10) y `plantillas_notificacion` (SPEC 09).

### Cambios en el documento de definición

Antes de la migración se agrega a los endpoints de la sección 6 la fila `POST /api/v1/vecinos` (Receptor, Supervisor), junto a `GET /api/v1/vecinos` de SPEC 12.

### `0013_invitacion_vecino`

El `up` inserta la plantilla con `ON CONFLICT (clave) DO NOTHING`, y el `down` la borra.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `invitacion_vecino` | `VozMuni: sigue tus quejas en el portal` | `{{nombre}}`, `{{enlace}}` |

```text
Hola {{nombre}}:

La municipalidad te registró en VozMuni para atender tu queja.
Si quieres seguirla y presentar nuevas quejas desde el portal, define tu contraseña
con este enlace en las próximas 24 horas:

{{enlace}}

Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.
Sin contraseña también puedes consultar tus quejas con su número y tu correo o teléfono.
```

`cuerpo_html` tiene el mismo texto, con párrafos `<p>` y el enlace como `<a href="{{enlace}}">`. `{{enlace}}` es `APP_URL/restablecer?token=…`, el mismo de SPEC 09 y 10.

### Reglas (`domain/usuarios/vecino.ts`)

```ts
export interface DatosVecinoNuevo {
  nombre: string;
  dpi: string;
  email: string | null;
  telefono: string | null;
}

// Quita espacios y guiones; devuelve 8 dígitos o lanza ReglaDeNegocioError TELEFONO_INVALIDO.
export function normalizarTelefono(telefono: string): string;

// Recorta el nombre, normaliza el DPI (normalizarDpi de SPEC 10), el teléfono y el correo (minúsculas),
// y exige al menos un medio de contacto. Devuelve los datos normalizados.
export function validarVecinoNuevo(datos: DatosVecinoNuevo): DatosVecinoNuevo;
```

| Regla | Código de `ReglaDeNegocioError` |
| --- | --- |
| `nombre` de 1 a 150 caracteres, después de recortar | `NOMBRE_INVALIDO` |
| `dpi` obligatorio, 13 dígitos, se aceptan espacios | `DPI_INVALIDO` (SPEC 10) |
| `telefono`, si viene: 8 dígitos, se aceptan espacios y guiones (`5555-0000` → `55550000`) | `TELEFONO_INVALIDO` |
| `email`, si viene: correo válido, guardado en minúsculas | `EMAIL_INVALIDO` |
| al menos uno de `email` o `telefono` | `CONTACTO_REQUERIDO` |

### `POST /api/v1/vecinos`

Protegido por `autenticar` y `requierePermiso('tickets.crear')`, con alcance `a_nombre_de_vecino` o `todas` (receptor o supervisor), igual que `GET /api/v1/vecinos` de SPEC 12. El vecino, que tiene el alcance `propia`, recibe `403 PERMISO_DENEGADO`, y los demás roles también.

Cuerpo (Zod `strict`): `{ nombre, dpi, email?, telefono? }`. Cualquier otro campo, como `rol`, `password` o `activo`, responde `400 VALIDACION`.

Transacción:

1. `validarVecinoNuevo`.
2. Se inserta el usuario: rol `vecino`, `activo = true`, `password_hash = null`, `dependencia_id = null`.
3. Si tiene `email`, se crea un enlace `invitacion` de 24 h.

Después del commit:

- Si tiene `email`, se envía `invitacion_vecino` **esperando el resultado**, como la invitación de SPEC 10. Si falla, se responde igual y se registra el error en el log.
- Responde `201` con `{ vecino: VecinoEncontrado, invitacionEnviada: boolean }`.
  - `VecinoEncontrado` es el tipo de SPEC 12, con el correo y el teléfono enmascarados y sin el DPI.
  - `invitacionEnviada` es `false` si no hay correo o si el envío falló.

Errores:

| Código | Status | Cuándo |
| --- | --- | --- |
| `VALIDACION` | 400 | cuerpo con campos desconocidos o tipos inválidos |
| `NOMBRE_INVALIDO`, `DPI_INVALIDO`, `TELEFONO_INVALIDO`, `EMAIL_INVALIDO`, `CONTACTO_REQUERIDO` | 400 | reglas de la tabla anterior |
| `EMAIL_DUPLICADO` | 409 | el correo, sin distinguir mayúsculas, ya pertenece a cualquier usuario |
| `DPI_DUPLICADO` | 409 | el DPI ya pertenece a cualquier usuario |
| `PERMISO_DENEGADO` | 403 | rol sin alcance `a_nombre_de_vecino` o `todas` |

Los dos `409` no incluyen datos del registro existente. El receptor lo encuentra con `GET /api/v1/vecinos` de SPEC 12. Se traducen desde la violación de UNIQUE (`23505`) de `usuarios_email_lower_unique` y `usuarios_dpi_key`, como en SPEC 10.

El teléfono no es único: dos vecinos pueden compartirlo.

### Cambios en specs anteriores

| Spec | Punto | Cambio |
| --- | --- | --- |
| SPEC 09 y 10 | `/auth/recuperar`, paso 2 | Se envía el enlace a **cualquier usuario activo con correo**, tenga o no contraseña y sea interno o vecino. Solo se ignoran los correos inexistentes y los usuarios inactivos. La respuesta sigue siendo `202` idéntica. |
| SPEC 12 | `GET /api/v1/vecinos?telefono=` | El valor se normaliza con `normalizarTelefono` antes de la búsqueda exacta, así que `5555-0000` encuentra a `55550000`. Un teléfono inválido responde `400 TELEFONO_INVALIDO`. |
| SPEC 12 | `VecinoRepository` | Agrega `crear(datos): Promise<{ id: number }>`, que traduce `23505` a `EMAIL_DUPLICADO` o `DPI_DUPLICADO`. |

Con el enlace de invitación, el vecino define su contraseña en `/auth/restablecer` (SPEC 09). Inicia sesión automáticamente, no recibe el aviso `password_cambiado` (SPEC 10), y desde entonces entra al portal como cualquier vecino.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: POST /api/v1/vecinos
CLAUDE.md
backend/
  src/
    domain/usuarios/vecino.ts
    domain/repositories/vecino-repository.ts             # + crear
    application/services/vecinos.service.ts              # + crear (con invitación)
    application/services/recuperacion.service.ts         # regla nueva de /auth/recuperar
    infrastructure/
      repositories/knex-vecino-repository.ts             # + crear, búsqueda con teléfono normalizado
      database/migrations/0013_invitacion_vecino.ts
    presentation/
      validators/vecinos.validators.ts                   # cuerpo del alta; teléfono normalizado en la búsqueda
      controllers/vecinos.controller.ts                  # + crear
      routes/vecinos.routes.ts                           # + POST
      middlewares/manejador-errores.ts                   # NOMBRE_INVALIDO, TELEFONO_INVALIDO, EMAIL_INVALIDO, CONTACTO_REQUERIDO
  tests/
    unit/usuarios/vecino.test.ts
    unit/tickets/vecinos.service.test.ts                 # casos del alta
    unit/auth/recuperacion.service.test.ts               # vecino sin contraseña recibe enlace
    db/schema.test.ts                                    # plantilla invitacion_vecino
    db/vecinos.api.test.ts                               # Supertest contra Postgres real, enviador falso
```

## Plan de implementación

1. Agregar `POST /api/v1/vecinos` (Receptor, Supervisor) a los endpoints de la sección 6 del documento de definición. Verificación: revisión del diff.
2. Crear `0013_invitacion_vecino.ts`. Ampliar `schema.test.ts`: después de `migrate.latest()` existe `invitacion_vecino`, y al revertir solo esa migración desaparece. Verificación: `npm run test:db` pasa.
3. Crear `domain/usuarios/vecino.ts` y `tests/unit/usuarios/vecino.test.ts`. Casos:
   - `normalizarTelefono('5555-0000')` devuelve `55550000`, y `'5555 0000'` también.
   - Con 7 o 9 dígitos, o con letras, lanza `TELEFONO_INVALIDO`.
   - Sin correo ni teléfono, lanza `CONTACTO_REQUERIDO`.
   - Sin DPI, lanza `DPI_INVALIDO`.
   - Un nombre solo con espacios lanza `NOMBRE_INVALIDO`.
   - El correo se guarda en minúsculas.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Agregar `crear` a `VecinoRepository` y a `knex-vecino-repository.ts`, con la traducción de `23505`, y normalizar el teléfono en la búsqueda. Ampliar las pruebas de `test:db` del repositorio:
   - Crear dos vecinos con el mismo teléfono funciona.
   - El mismo correo en mayúsculas → `EMAIL_DUPLICADO`.
   - El mismo DPI → `DPI_DUPLICADO`.

   Verificación: `npm run test:db` pasa.
5. Agregar `crear` a `VecinosService` y ampliar `vecinos.service.test.ts` con falsos. Casos:
   - Con correo, crea el vecino y el enlace `invitacion` de 24 h, y envía `invitacion_vecino` con el nombre y el enlace.
   - Sin correo, no crea el enlace ni envía nada, y devuelve `invitacionEnviada: false`.
   - Un fallo del enviador devuelve `invitacionEnviada: false`, y el vecino igual queda creado.
   - La respuesta enmascara el correo y el teléfono y no incluye el DPI.

   Verificación: `npm test` pasa.
6. Cambiar la regla de `/auth/recuperar` en `RecuperacionService` y ampliar `recuperacion.service.test.ts`:
   - Un vecino activo sin contraseña y con correo recibe el enlace.
   - Un usuario inactivo no recibe nada.
   - Un vecino sin correo no puede pedir el enlace (no hay correo al cual buscarlo).

   Verificación: `npm test` pasa.
7. Agregar `POST /api/v1/vecinos` al validador, el controlador y las rutas, y los 4 códigos nuevos al manejador de errores. Crear `tests/db/vecinos.api.test.ts` con el enviador falso. Casos:
   - El receptor da de alta un vecino con correo → `201` con `invitacionEnviada: true`. El correo capturado tiene un enlace con el que `/auth/restablecer` define la contraseña, inicia sesión y no envía `password_cambiado`. Después, `/auth/login` funciona.
   - El receptor da de alta un vecino solo con teléfono `5555-0000` → `201`, con el teléfono guardado como `55550000` e `invitacionEnviada: false`.
   - Luego, `POST /api/v1/tickets` con ese `solicitanteId` y `canal: 'telefono'` → `201` (SPEC 12).
   - El supervisor también puede dar de alta.
   - El vecino, el técnico, el coordinador y el administrador → `403`. Sin token → `401`.
   - Un correo o un DPI repetidos → `409` sin datos del existente. El mismo teléfono que otro vecino → `201`.
   - Un cuerpo con `rol` o `password` → `400 VALIDACION`.
   - `GET /api/v1/vecinos?telefono=5555-0000` encuentra a los vecinos con `55550000`.
   - `/auth/recuperar` con el correo de un vecino de ventanilla cuya invitación venció envía un enlace nuevo.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Actualizar `CLAUDE.md` con el flujo de ventanilla: buscar con `GET /vecinos`, dar de alta con `POST /vecinos` si no existe, y registrar con `POST /tickets` y `solicitanteId`. También: el formato del teléfono (8 dígitos) y que el vecino con correo recibe una invitación de 24 h. Verificación manual con Ethereal: `receptor@vozmuni.test` da de alta un vecino con correo, la invitación aparece en Ethereal, y con su enlace el vecino define su contraseña y entra.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye `POST /api/v1/vecinos`.
- [ ] Después de `migrate:latest` existe la plantilla `invitacion_vecino`, y ningún texto de correo nuevo está escrito en `src/` fuera de la migración `0013_invitacion_vecino`.
- [ ] Un receptor y un supervisor dan de alta un vecino con `POST /api/v1/vecinos` y reciben `201`. El usuario queda con rol `vecino`, `activo = true`, `password_hash = null` y `dependencia_id = null`.
- [ ] El vecino, el técnico, el coordinador y el administrador reciben `403 PERMISO_DENEGADO`, y una petición sin token recibe `401`.
- [ ] El alta exige nombre, DPI de 13 dígitos y al menos correo o teléfono, con los códigos `NOMBRE_INVALIDO`, `DPI_INVALIDO` y `CONTACTO_REQUERIDO`.
- [ ] El teléfono acepta espacios y guiones, se guarda como 8 dígitos, y cualquier otra forma responde `400 TELEFONO_INVALIDO`.
- [ ] Un correo (sin distinguir mayúsculas) o un DPI que ya pertenecen a cualquier usuario responden `409 EMAIL_DUPLICADO` o `409 DPI_DUPLICADO`, sin datos del registro existente.
- [ ] Dos vecinos pueden compartir el mismo teléfono.
- [ ] Un vecino con correo recibe `invitacion_vecino` con un enlace que vence a las 24 h, y la respuesta tiene `invitacionEnviada: true`. Un vecino sin correo no recibe nada y tiene `invitacionEnviada: false`.
- [ ] Si el envío de la invitación falla, la respuesta es `201` con `invitacionEnviada: false`, y el vecino existe.
- [ ] Con el enlace de invitación, `/auth/restablecer` define la contraseña e inicia sesión sin enviar `password_cambiado`, y después `/auth/login` funciona.
- [ ] La respuesta del alta enmascara el correo y el teléfono, y nunca incluye el DPI.
- [ ] Con el id devuelto, el receptor registra una queja con `POST /api/v1/tickets` y un canal distinto de `portal` (SPEC 12).
- [ ] `GET /api/v1/vecinos?telefono=5555-0000` encuentra a los vecinos guardados con `55550000`.
- [ ] `/auth/recuperar` envía un enlace a un vecino activo sin contraseña que tiene correo, y responde `202` idéntica en todos los casos.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta el flujo de ventanilla, el formato del teléfono y la invitación del vecino.

## Decisiones

- **Sí:** esta spec cubre solo el alta del vecino nuevo. El vecino existente, el canal y la búsqueda ya están en SPEC 12.
- **No:** la pantalla de ventanilla, ni reabrir lo definido en SPEC 12.
- **Sí:** endpoint propio `POST /api/v1/vecinos`, como eligió el usuario. Es reutilizable, y el receptor registra la queja después con `POST /tickets`.
- **No:** crear el vecino dentro del mismo `POST /tickets`. Como consecuencia, si la queja no llega a registrarse, queda un vecino sin quejas. Está anotado en Riesgos.
- **Sí:** DPI obligatorio, además del nombre y de correo o teléfono, como eligió el usuario.
- **No:** DPI opcional, ni exigir correo y teléfono a la vez.
- **Sí:** teléfono guatemalteco de 8 dígitos, normalizado. Así la búsqueda exacta de SPEC 12 funciona sin importar cómo se escribió.
- **No:** texto libre ni E.164.
- **Sí:** el teléfono no es único, porque una familia puede compartirlo. El DPI, obligatorio y único, ya identifica a la persona.
- **No:** índice único sobre el teléfono.
- **Sí:** un duplicado de correo o DPI responde `409` **sin datos** del existente, como eligió el usuario. El receptor lo busca con `GET /vecinos`.
- **No:** devolver el id del vecino existente, ni devolver el existente con `200`.
- **Sí:** se usan los códigos `EMAIL_DUPLICADO` y `DPI_DUPLICADO` de SPEC 10, aunque el duplicado sea un usuario interno. El receptor no necesita saber de qué tipo de usuario se trata.
- **Sí:** un vecino con correo recibe una invitación de 24 h para definir su contraseña, con la plantilla nueva `invitacion_vecino`. Reutiliza los enlaces de tipo `invitacion` de SPEC 10.
- **No:** dejarlo para RF-01, una invitación opcional, ni reutilizar la plantilla `invitacion_usuario` (habla de rol y de cuenta de trabajo).
- **Sí:** el envío de la invitación se espera, y un fallo responde `201` con `invitacionEnviada: false`, igual que en SPEC 10. El receptor puede avisarle en persona.
- **Sí:** `/auth/recuperar` pasa a enviar el enlace a cualquier usuario activo con correo, incluidos los vecinos sin contraseña. Es necesario para que un vecino con la invitación vencida pueda pedir otro enlace. Simplifica la regla de SPEC 10: ya no distingue por rol.
- **Sí:** el alta la pueden hacer el receptor y el supervisor, con el mismo criterio de alcance que la búsqueda de SPEC 12. No se preguntó explícitamente: es la consecuencia directa de la matriz (crear queja a nombre de vecino).
- **Sí:** los textos de la plantilla, los límites del nombre y los códigos `NOMBRE_INVALIDO`, `TELEFONO_INVALIDO`, `EMAIL_INVALIDO` y `CONTACTO_REQUERIDO` los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Queda un vecino dado de alta sin queja si el receptor no completa el segundo paso | El vecino sigue siendo válido y el siguiente intento lo encuentra con `GET /vecinos`. La pantalla de ventanilla debe encadenar los dos pasos. |
| Un vecino de ventanilla que no tiene DPI a mano no puede registrar su queja | Es una decisión del usuario. Si la municipalidad lo necesita, una spec futura vuelve el DPI opcional. |
| El `409` sin datos obliga al receptor a una búsqueda extra | La búsqueda por correo o DPI es exacta y rápida. |
| Un vecino que da el correo de otra persona hace que esa persona reciba una invitación | La invitación explica de qué se trata y vence en 24 h. Si no se usa, no pasa nada. RF-01 agregará la verificación de correo. |
| El teléfono de 8 dígitos no admite números extranjeros | Está fuera de alcance. Un vecino extranjero puede registrarse con correo. |
| Los teléfonos de usuarios internos (SPEC 10) siguen siendo texto libre, distinto de los vecinos | La búsqueda de SPEC 12 solo encuentra vecinos, así que no se cruzan. Una spec futura puede unificar el formato. |
| Esta spec cambia otra vez la regla de `/auth/recuperar` (SPEC 09 → 10 → 13) | El cambio está en la tabla "Cambios en specs anteriores" y probado en el paso 6. La regla final es más simple. |
| SPEC 09, 10 y 12 todavía están en Borrador | Se implementa después de ellas. Si cambian, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Pantalla de ventanilla.
- Alta de vecino y queja en un solo paso.
- Registro propio del vecino con verificación de correo (RF-01).
- Edición y desactivación de vecinos.
- Teléfonos extranjeros y unicidad del teléfono.
- Invitación por SMS y bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
