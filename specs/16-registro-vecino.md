# SPEC 16 — Registro de vecino con verificación de correo

> **Estado:** Implementado
> **Depende de:** SPEC 06, SPEC 08, SPEC 09, SPEC 10, SPEC 13
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que un vecino cree su cuenta en el portal con nombre, DPI, correo, teléfono opcional y contraseña, y la active con un enlace de verificación de 24 h enviado a su correo, sin revelar qué correos o DPI ya están registrados, con las pantallas `/registro` y `/verificar`.

## Por qué existe esta spec

RF-01 es un requerimiento **M**: el vecino puede registrarse con nombre, DPI, correo y teléfono, y verificar su correo. Hoy los vecinos solo existen por los seeds de desarrollo (SPEC 08) o porque un receptor los dio de alta en ventanilla (SPEC 13).
La verificación de correo es un vacío registrado en SPEC 02. Esta spec lo resuelve e impide iniciar sesión con un correo que no se verificó, lo que obliga a ajustar el login de SPEC 08 y los enlaces de SPEC 09.
Incluye las pantallas públicas `/registro` y `/verificar`, porque no necesitan sesión.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición, y de los vacíos de SPEC 02, antes de la migración.
- Migración `0015_verificacion_correo`:
  - Columna `usuarios.correo_verificado_en`, marcando como verificados a los usuarios que ya tienen contraseña.
  - Tipo `verificacion` en `restablecimientos`.
  - Tres plantillas de correo.
- `POST /api/v1/auth/registro`: responde siempre `202` con el mismo cuerpo, y decide por correo qué mensaje recibe cada caso.
- `POST /api/v1/auth/verificar`: consume el enlace y marca el correo como verificado.
- Reemplazo de los datos de un registro que nunca se verificó cuando se registra de nuevo el mismo correo.
- **Cambio sobre SPEC 08:** el login responde `403 CORREO_NO_VERIFICADO` si la contraseña es correcta pero el correo no está verificado. El seed de desarrollo crea a sus usuarios verificados.
- **Cambio sobre SPEC 09:** usar un enlace en `/auth/restablecer` (de recuperación o de invitación) también marca el correo como verificado.
- Frontend:
  - Rutas públicas `/registro` y `/verificar`.
  - Formulario con React Hook Form y validación en el cliente con las mismas reglas que el backend.
  - Textos en `locales/es/auth.json`.
  - Enlace "Crear cuenta" en `/login`.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Formulario de login en el frontend e inicio de sesión automático después de verificar.
- Que un vecino de ventanilla reclame su cuenta con el registro. Ese vecino usa "olvidé mi contraseña" (SPEC 09 y 13).
- Límite de peticiones y captcha en el registro.
- Verificación del teléfono por SMS (RF-34).
- Cambio de correo de una cuenta.
- Limpieza de cuentas que nunca se verificaron.
- Validación del dígito verificador del DPI.
- Registro en `bitacora` (spec de RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- `usuarios`: se agrega `correo_verificado_en`.
- `restablecimientos.tipo`: se agrega `verificacion`.
- Endpoints: la fila `POST /api/v1/auth/register` pasa a `POST /api/v1/auth/registro`, y se agrega `POST /api/v1/auth/verificar` (Público).

En la tabla de vacíos de SPEC 02, la fila de RF-01, RF-02, RF-03 y RNF-09 queda resuelta por completo.

### `0015_verificacion_correo`

| Tabla | Cambio |
| --- | --- |
| `usuarios` | `correo_verificado_en timestamptz NULL` |
| `restablecimientos` | El CHECK de `tipo` pasa a `IN ('recuperacion', 'invitacion', 'verificacion')` |

El `up` también:

- Ejecuta `UPDATE usuarios SET correo_verificado_en = now() WHERE password_hash IS NOT NULL AND email IS NOT NULL`. Así los usuarios que ya entraban siguen pudiendo hacerlo.
- Inserta las 3 plantillas de abajo con `ON CONFLICT (clave) DO NOTHING`.

El `down`:

- Borra las 3 plantillas y las filas de `restablecimientos` con `tipo = 'verificacion'`.
- Restaura el CHECK anterior.
- Borra la columna.

| `clave` | `asunto` | Variables | Cuándo |
| --- | --- | --- | --- |
| `verificacion_correo` | `VozMuni: confirma tu correo` | `{{nombre}}`, `{{enlace}}` | Un registro nuevo, o el reemplazo de uno no verificado |
| `cuenta_existente` | `VozMuni: ya tienes una cuenta` | — | El correo ya pertenece a una cuenta verificada, a un vecino de ventanilla o a un usuario interno |
| `registro_no_completado` | `VozMuni: no pudimos crear tu cuenta` | — | El DPI ya pertenece a otra cuenta |

```text
verificacion_correo:
Hola {{nombre}}:

Gracias por registrarte en VozMuni. Confirma tu correo abriendo este enlace
en las próximas 24 horas:

{{enlace}}

Si no fuiste tú, ignora este correo y la cuenta no se activará.

cuenta_existente:
Hola:

Alguien intentó crear una cuenta de VozMuni con este correo, pero ya existe una.
Si fuiste tú y no recuerdas tu contraseña, usa "Olvidé mi contraseña" en el portal.
Si no fuiste tú, ignora este correo.

registro_no_completado:
Hola:

No pudimos crear tu cuenta de VozMuni con los datos ingresados.
Si ya registraste una queja en la municipalidad, usa "Olvidé mi contraseña" con el
correo que diste en ventanilla, o acércate a la municipalidad para revisar tus datos.
```

`{{enlace}}` es `APP_URL + '/verificar?token=' + token`. El token tiene 32 bytes aleatorios, se guarda como SHA-256 (SPEC 09) y vence a las 24 h. `cuerpo_html` tiene el mismo texto, con párrafos `<p>` y el enlace como `<a href="{{enlace}}">`.

### Vigencia de los enlaces (amplía la tabla de SPEC 10)

| `tipo` | Vence en | Lo crea | Lo consume |
| --- | --- | --- | --- |
| `recuperacion` | 30 min | `/auth/recuperar` (SPEC 09) | `/auth/restablecer` |
| `invitacion` | 24 h | alta de usuario o vecino (SPEC 10 y 13) | `/auth/restablecer` |
| `verificacion` | 24 h | `/auth/registro` (esta spec) | `/auth/verificar` |

Un token `verificacion` no sirve en `/auth/restablecer`, y uno `recuperacion` o `invitacion` no sirve en `/auth/verificar`.

### `POST /api/v1/auth/registro`

Es público. Cuerpo (Zod `strict`): `{ nombre, dpi, email, telefono?, password }`.

Validaciones, que pueden responder `400` porque no revelan nada sobre cuentas existentes:

| Campo | Regla | Código |
| --- | --- | --- |
| `nombre` | 1–150 caracteres recortados | `NOMBRE_INVALIDO` (SPEC 13) |
| `dpi` | 13 dígitos, se aceptan espacios | `DPI_INVALIDO` (SPEC 10) |
| `email` | correo válido, guardado en minúsculas | `EMAIL_INVALIDO` (SPEC 13) |
| `telefono` | opcional, 8 dígitos, se aceptan espacios y guiones | `TELEFONO_INVALIDO` (SPEC 13) |
| `password` | política de RNF-08 (SPEC 09) | `POLITICA_PASSWORD` |
| campos desconocidos | — | `VALIDACION` |

Si los datos son válidos, la respuesta es **siempre** `202` con `{ "mensaje": "Revisa tu correo para continuar." }`, y se responde **antes** de enviar el correo. Esto evita que el tiempo de respuesta delate el caso. El trabajo se decide así, en una transacción:

| # | Situación (correo = `lower(email)`) | Acción | Correo |
| --- | --- | --- | --- |
| 1 | El correo no existe y el DPI no existe | Crea el vecino: rol `vecino`, `activo = true`, `password_hash`, `correo_verificado_en = null` y un enlace `verificacion` de 24 h | `verificacion_correo` |
| 2 | El correo pertenece a un **registro pendiente** (vecino activo, con contraseña y sin verificar), y el DPI no existe o es de ese mismo usuario | Reemplaza `nombre`, `dpi`, `telefono` y `password_hash`, invalida sus enlaces pendientes y crea uno `verificacion` nuevo | `verificacion_correo` |
| 3 | El correo existe y no es un registro pendiente: una cuenta verificada, un vecino de ventanilla sin contraseña o un usuario interno | No cambia nada | `cuenta_existente`, a ese correo |
| 4 | El correo no existe, o es un registro pendiente, y el DPI es de **otro** usuario | No cambia nada | `registro_no_completado`, al correo ingresado |
| 5 | El usuario del correo está inactivo | No cambia nada | ninguno |

- Los envíos no se esperan, y un fallo se registra en el log (como en SPEC 09).
- Una violación de UNIQUE por concurrencia (`23505`) se trata como el caso 3 o 4 que corresponda, sin cambiar la respuesta.

### `POST /api/v1/auth/verificar`

Es público. Cuerpo: `{ token }`, con un texto de 1 a 200 caracteres.

- Busca un token `verificacion` vigente por SHA-256 (no usado, no invalidado y no vencido) de un usuario activo. Si no lo encuentra, responde `400 TOKEN_VERIFICACION_INVALIDO`.
- Si lo encuentra, en una transacción: `correo_verificado_en = ahora` (solo si era `null`) y el token queda usado.
- Responde `200` con `{ "mensaje": "Correo verificado. Ya puedes iniciar sesión." }`. No emite tokens de sesión.

### Cambios en specs anteriores

| Spec | Punto | Cambio |
| --- | --- | --- |
| SPEC 08 | Login | Después de verificar la contraseña con éxito, si `correo_verificado_en` es `null` responde `403 CORREO_NO_VERIFICADO` y no emite tokens. El éxito igual reinicia `intentos_fallidos`. Con contraseña incorrecta, el comportamiento no cambia, así que un atacante sin la contraseña no sabe si la cuenta está verificada. |
| SPEC 08 | `seeds-desarrollo/06_usuarios.ts` | Los 6 usuarios se crean con `correo_verificado_en = now()`. |
| SPEC 09 | `/auth/restablecer` | Además de lo que ya hace, pone `correo_verificado_en = ahora` si era `null`. Abrir un enlace enviado al correo prueba que el buzón es del usuario. Rechaza tokens `verificacion`. |
| SPEC 09 | `RestablecimientoRepository` | `crear` y `buscarVigente` reciben el `tipo` esperado. |

Códigos nuevos en el manejador de errores: `TOKEN_VERIFICACION_INVALIDO` (400) y `CORREO_NO_VERIFICADO` (403).

### Frontend

| Ruta | Acceso | Página | Comportamiento |
| --- | --- | --- | --- |
| `/registro` | pública | `features/auth/pages/RegistroPage.tsx` | Formulario con React Hook Form. Campos: nombre, DPI, correo, teléfono (opcional), contraseña y confirmación. Valida en el navegador las reglas de la tabla del registro, más que la confirmación coincida. Al recibir `202` cambia a un mensaje "Revisa tu correo". Un `400` del servidor se muestra en el campo correspondiente. |
| `/verificar` | pública | `features/auth/pages/VerificarPage.tsx` | Lee `token` de la query. Al montar llama una sola vez a `POST /auth/verificar` y muestra "Verificando…", luego "Correo verificado" con un enlace a `/login`, o "Enlace inválido o vencido" con un enlace a `/registro`. Sin `token`, muestra directamente el error. |
| `/login` | pública | `LoginPage.tsx` (SPEC 06) | Agrega el enlace "Crear cuenta" a `/registro`. |

- Las reglas del cliente viven en `features/auth/validacion-registro.ts` y replican las del backend. El backend sigue siendo la fuente de verdad.
- `features/auth/api/registro-api.ts` contiene `registrar(datos)` y `verificar(token)` sobre `apiClient` (SPEC 06).
- Todos los textos van en `locales/es/auth.json` (RNF-16).
- `app/router.tsx` agrega `/registro` y `/verificar` a las rutas públicas.
- El formulario funciona a 360 px sin scroll horizontal (RNF-14).

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6 y vacíos
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas de registro y verificación
    container.ts
    domain/usuarios/registro-vecino.ts                 # validarRegistro y decidirCasoRegistro (tabla de 5 casos)
    domain/repositories/registro-vecino-repository.ts  # buscar por correo y DPI, crear, reemplazar pendiente, verificar
    domain/repositories/restablecimiento-repository.ts # tipo esperado en crear y buscarVigente
    application/services/registro-vecinos.service.ts   # registrar, verificar
    application/services/auth.service.ts               # CORREO_NO_VERIFICADO (cambio de SPEC 08)
    application/services/recuperacion.service.ts       # marca verificado al restablecer (cambio de SPEC 09)
    infrastructure/
      repositories/knex-registro-vecino-repository.ts
      repositories/knex-restablecimiento-repository.ts
      database/migrations/0015_verificacion_correo.ts
      database/seeds-desarrollo/06_usuarios.ts         # usuarios verificados
    presentation/
      validators/registro.validators.ts
      controllers/registro.controller.ts
      routes/registro.routes.ts
      middlewares/manejador-errores.ts                 # 2 códigos nuevos
  tests/
    unit/usuarios/registro-vecino.test.ts
    unit/usuarios/registro-vecinos.service.test.ts
    unit/auth/auth.service.test.ts                     # CORREO_NO_VERIFICADO
    unit/auth/recuperacion.service.test.ts             # marca verificado
    db/schema.test.ts                                  # columna, CHECK y plantillas
    db/registro.api.test.ts                            # Supertest contra Postgres real, enviador falso
frontend/
  package.json                                         # react-hook-form
  src/
    app/router.tsx
    features/auth/validacion-registro.ts
    features/auth/api/registro-api.ts
    features/auth/pages/RegistroPage.tsx
    features/auth/pages/VerificarPage.tsx
    features/auth/pages/LoginPage.tsx                  # enlace "Crear cuenta"
    locales/es/auth.json
  tests/
    features/validacion-registro.test.ts
    features/registro-page.test.tsx
    features/verificar-page.test.tsx
    app/router.test.tsx                                # /registro y /verificar públicas
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición (`correo_verificado_en`, `tipo = verificacion` y los endpoints `registro` y `verificar`) y marcar como resuelta la fila de RF-01 en los vacíos de SPEC 02. Verificación: revisión del diff.
2. Crear `0015_verificacion_correo.ts` y actualizar `seeds-desarrollo/06_usuarios.ts`. Ampliar `schema.test.ts`:
   - La columna nueva existe.
   - `tipo = 'verificacion'` se acepta y `'otro'` no.
   - Existen las 3 plantillas.
   - Un usuario con contraseña creado antes de la migración queda verificado.
   - Revertir la migración restaura el CHECK.

   Verificación: `npm run test:db` pasa.
3. Crear `domain/usuarios/registro-vecino.ts` y `registro-vecino.test.ts`:
   - `validarRegistro` reutiliza `normalizarDpi`, `normalizarTelefono` y `validarPassword`, y exige el correo.
   - `decidirCasoRegistro` es una función pura que recibe el usuario del correo y el del DPI y devuelve el caso 1 a 5 de la tabla.
   - Hay un caso de prueba por fila, incluido el reemplazo con el DPI del mismo usuario y el registro pendiente con el DPI de otro (caso 4).

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `RegistroVecinoRepository` y su implementación Knex, y ampliar `RestablecimientoRepository` con el `tipo` esperado. Crear `RegistroVecinosService` (`registrar`, `verificar`) y `registro-vecinos.service.test.ts` con falsos. Casos:
   - Cada caso de la tabla produce su acción y su correo.
   - `registrar` devuelve antes de que termine el envío.
   - Un fallo del enviador no se propaga.
   - `verificar` con un token vencido, usado, de otro tipo o de un usuario inactivo lanza `TOKEN_VERIFICACION_INVALIDO`.

   Verificación: `npm test` pasa.
5. Aplicar los cambios de SPEC 08 y 09: `CORREO_NO_VERIFICADO` en `AuthService.login` y la marca de verificado en `RecuperacionService.restablecer`. Ampliar sus pruebas:
   - La contraseña correcta sin verificar → `CORREO_NO_VERIFICADO`, sin tokens y con el contador reiniciado.
   - La contraseña incorrecta sin verificar → `CREDENCIALES_INVALIDAS`.
   - Restablecer marca como verificado.
   - Un token `verificacion` no sirve en `restablecer`.

   Verificación: `npm test` pasa.
6. Crear el validador, el controlador y las rutas de registro y verificación, y agregar los 2 códigos al manejador. Crear `tests/db/registro.api.test.ts` con el enviador falso. Casos:
   - Registro nuevo → `202`; el login antes de verificar → `403 CORREO_NO_VERIFICADO`; el enlace capturado → `/auth/verificar` `200`; el login después → `200`.
   - Las respuestas de los casos 1 a 5 son idénticas (mismo status y mismo cuerpo), y cada caso envía su correo.
   - Registrar de nuevo un correo pendiente reemplaza el nombre y la contraseña, y el enlace anterior deja de servir.
   - Un vecino de ventanilla (SPEC 13) con correo que se registra recibe `cuenta_existente`, y su cuenta no cambia.
   - Un DPI de 12 dígitos → `400 DPI_INVALIDO`; una contraseña `abcdefgh` → `400 POLITICA_PASSWORD`; un `rol` en el cuerpo → `400 VALIDACION`.
   - Reusar un token de verificación → `400`.
   - Un token `recuperacion` en `/auth/verificar` → `400`.
   - Los usuarios de `seed:dev` siguen iniciando sesión.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
7. Frontend: instalar react-hook-form y crear `validacion-registro.ts`, `registro-api.ts` y `RegistroPage.tsx`, con las rutas en `router.tsx` y los textos en `auth.json`. Crear `validacion-registro.test.ts` y `registro-page.test.tsx` con `fetch` simulado. Casos:
   - Cada regla del cliente muestra su mensaje traducido.
   - La confirmación distinta bloquea el envío.
   - Un envío válido llama a `POST /api/v1/auth/registro` y muestra "Revisa tu correo".
   - Un `400 DPI_INVALIDO` del servidor se muestra en el campo DPI.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
8. Crear `VerificarPage.tsx`, agregar el enlace "Crear cuenta" en `LoginPage` y ampliar `router.test.tsx` (las dos rutas son públicas). Crear `verificar-page.test.tsx`:
   - Con un token válido llama una sola vez a la API y muestra "Correo verificado" con un enlace a `/login`.
   - Con `400` muestra "Enlace inválido o vencido".
   - Sin `token` no llama a la API.

   Verificación: `npm test` y `npm run build` pasan. Verificación manual con Ethereal y el backend en `3000`: registrarse en `http://localhost:5173/registro`, abrir el enlace del correo de Ethereal, ver "Correo verificado", y comprobar con `POST /api/v1/auth/login` que la cuenta ya inicia sesión.
9. Actualizar `CLAUDE.md`:
   - El flujo de registro y verificación, y que el registro siempre responde `202`.
   - Que sin verificar no se inicia sesión.
   - Que cualquier enlace de correo usado marca el correo como verificado.
   - La tabla de tipos de enlace.

   Verificación: revisión del diff.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `correo_verificado_en`, el tipo `verificacion` y los endpoints `POST /api/v1/auth/registro` y `POST /api/v1/auth/verificar`, y el vacío de RF-01 figura como resuelto.
- [x] Después de `migrate:latest`, los usuarios que ya tenían contraseña quedan con `correo_verificado_en` lleno, existen las 3 plantillas, y `restablecimientos.tipo` acepta `verificacion`.
- [x] `POST /api/v1/auth/registro` con datos válidos responde `202` con el mismo cuerpo en los 5 casos de la tabla, y cada caso envía el correo que le corresponde (o ninguno, en el caso 5).
- [x] Un registro nuevo crea un vecino activo, con contraseña hasheada y `correo_verificado_en = null`, y envía `verificacion_correo` con un enlace que vence a las 24 h.
- [x] El registro rechaza con `400` un DPI que no tiene 13 dígitos, un correo inválido, un teléfono que no tiene 8 dígitos, una contraseña que no cumple RNF-08 y cualquier campo desconocido.
- [x] Registrar de nuevo un correo pendiente de verificación reemplaza sus datos y su contraseña, y solo el enlace nuevo sirve.
- [x] Un vecino de ventanilla, una cuenta verificada o un usuario interno con el mismo correo no se modifican, y su correo recibe `cuenta_existente`.
- [x] Un DPI que ya pertenece a otro usuario no crea ni modifica nada, y el correo ingresado recibe `registro_no_completado`.
- [x] Con la contraseña correcta y el correo sin verificar, el login responde `403 CORREO_NO_VERIFICADO` sin tokens. Con la contraseña incorrecta responde `401 CREDENCIALES_INVALIDAS`, como siempre.
- [x] `POST /api/v1/auth/verificar` con un token vigente responde `200` y marca el correo como verificado, y el login funciona después. Un token usado, vencido o de otro tipo responde `400 TOKEN_VERIFICACION_INVALIDO`.
- [x] Usar un enlace de recuperación o de invitación en `/auth/restablecer` marca el correo como verificado, y un token `verificacion` no sirve allí.
- [x] Los usuarios de `seed:dev` inician sesión sin verificar nada.
- [x] En el frontend, `/registro` y `/verificar` cargan sin sesión. `/login` tiene el enlace "Crear cuenta".
- [x] El formulario de `/registro` valida en el navegador cada regla del backend y la confirmación de la contraseña, con textos traducidos. Al registrarse muestra "Revisa tu correo".
- [x] `/verificar?token=…` llama una sola vez a la API y muestra el éxito con un enlace a `/login`, o el error con un enlace a `/registro`.
- [x] Ningún texto visible de las páginas nuevas está fijo en un componente: todos están en `locales/es/auth.json`.
- [x] A 360 px de ancho, `/registro` no produce scroll horizontal.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta el registro, la verificación, la regla del login y los tipos de enlace.

## Decisiones

- **Sí:** backend y pantallas `/registro` y `/verificar`, como eligió el usuario. Son públicas y no necesitan la sesión del frontend, que todavía no existe.
- **Sí:** nombre, DPI, correo y contraseña obligatorios, y teléfono opcional, como eligió el usuario. El correo es el usuario de login y se verifica.
- **No:** los 4 datos obligatorios, ni el DPI opcional.
- **Sí:** verificación con un enlace de un solo uso de 24 h, reutilizando `restablecimientos` con el tipo nuevo `verificacion`, y con la columna `usuarios.correo_verificado_en`.
- **No:** un código de 6 dígitos, ni una tabla de verificaciones aparte.
- **Sí:** sin verificar no se inicia sesión, como eligió el usuario. Ninguna queja sale de un correo no comprobado. El `403` solo aparece con la contraseña correcta, así que no revela el estado de la cuenta.
- **No:** iniciar sesión sin poder registrar quejas, ni no restringir nada.
- **Sí:** cualquier enlace de correo usado (recuperación, invitación o verificación) marca el correo como verificado. La migración verifica a quienes ya tienen contraseña, y el seed de desarrollo crea los suyos verificados. Así los usuarios internos, los de ventanilla y los de desarrollo no quedan bloqueados.
- **No:** aplicar la regla solo a los vecinos.
- **Sí:** un vecino de ventanilla que intenta registrarse con su correo no reclama la cuenta. Recibe `cuenta_existente` y usa "olvidé mi contraseña" (SPEC 13), como eligió el usuario.
- **No:** reclamar la cuenta existente desde el registro.
- **Sí:** el registro responde siempre `202` con el mismo cuerpo y avisa por correo según el caso, así que no revela qué correos o DPI existen. Se responde antes de enviar, igual que en SPEC 09.
- **No:** `409` por duplicado.
- **Sí:** un registro pendiente que se repite con el mismo correo reemplaza sus datos y recibe un enlace nuevo, para que un registro abandonado no "secuestre" el correo.
- **No:** solo reenviar el enlace, ni un endpoint de reenvío aparte.
- **Sí:** sin límite de peticiones en el registro, como eligió el usuario. Está registrado como riesgo principal.
- **No:** límite por IP, ni captcha.
- **Sí:** formulario con React Hook Form (stack del documento) y validación en el cliente con las mismas reglas que el backend, que sigue siendo la fuente de verdad.
- **Sí:** `/verificar` verifica al abrir y no inicia sesión. Lleva a `/login`.
- **No:** un botón "Verificar", ni iniciar sesión automáticamente.
- **Sí:** el endpoint se llama `/auth/registro`, en español como el resto de la API, en lugar de `/auth/register` del documento, que se actualiza en el paso 1. Lo propone esta spec.
- **Sí:** los textos de las 3 plantillas, los mensajes de las respuestas y los códigos `TOKEN_VERIFICACION_INVALIDO` y `CORREO_NO_VERIFICADO` los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Sin límite de peticiones, el registro envía correos a cualquier dirección: alguien puede inundar el buzón de un tercero, o el SMTP de la municipalidad puede quedar marcado como spam** | Es una decisión explícita del usuario. Cada correo para el mismo destinatario reemplaza el enlace anterior. Se recomienda agregar el límite por IP de SPEC 08 (`REGISTRO_LIMITE_POR_VENTANA`) antes de exponer el portal. |
| Un registro pendiente con un DPI ajeno bloquea ese DPI hasta que se repita el registro | El dueño del DPI recibe `registro_no_completado` y puede acudir a la municipalidad. Una spec futura puede limpiar los registros que no se verifican en N días. |
| Un vecino de ventanilla **sin correo** no puede crear cuenta con un correo nuevo, porque su DPI ya existe | Recibe `registro_no_completado`, que le indica acudir a la municipalidad. Agregar un correo a un vecino existente queda para una spec de edición de vecinos. |
| Después de verificar, `/login` todavía no tiene formulario (SPEC 06) | El vecino puede iniciar sesión en cuanto exista la spec de login del frontend. Mientras tanto, la verificación se comprueba contra la API. |
| Un escáner de enlaces del cliente de correo abre `/verificar` y consume el token | El escáner abre la página, pero la verificación necesita ejecutar JavaScript que llama a la API, y la mayoría de los escáneres no lo hacen. Si ocurre, el usuario igual queda verificado, que es el efecto deseado. |
| Las reglas del cliente y del backend divergen con el tiempo | El backend es la fuente de verdad, y un `400` del servidor se muestra igual en el campo. Las pruebas de ambos lados cubren los mismos casos. |
| Esta spec cambia el login de SPEC 08 y `/auth/restablecer` de SPEC 09 | Los cambios están en la tabla "Cambios en specs anteriores" y probados en el paso 5. |
| Depende de 5 specs, 4 de ellas en Borrador | Se implementa después de SPEC 08, 09, 10 y 13. Si cambian, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Formulario de login e inicio de sesión automático.
- Reclamar la cuenta de ventanilla desde el registro.
- Límite de peticiones y captcha.
- Verificación del teléfono.
- Cambio de correo y edición de vecinos.
- Limpieza de registros sin verificar.
- Bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
