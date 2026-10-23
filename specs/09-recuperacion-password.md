# SPEC 09 — Recuperación de contraseña por correo

> **Estado:** Borrador
> **Depende de:** SPEC 08
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que un usuario con cuenta pida por correo un enlace de un solo uso, válido 30 minutos, y con él defina una contraseña nueva que cumpla RNF-08, enviando los correos con Nodemailer sobre SMTP y plantillas guardadas en la base de datos.

## Por qué existe esta spec

RF-03 es un requerimiento **M**: el usuario puede recuperar su contraseña mediante un enlace enviado a su correo.
Es también la primera vez que el sistema envía correo y la primera vez que define una contraseña. Por eso esta spec introduce el adaptador de correo, una tabla mínima de plantillas (RF-33 pide que sean editables) y la política de contraseña de RNF-08, que reutilizarán RF-01, RF-04 y RF-31.
Cubre solo el backend, igual que SPEC 08. Las pantallas van con la spec de login del frontend.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición (modelo de datos y endpoints) antes de las migraciones.
- Migración `0007_plantillas_notificacion`: tabla mínima y las 2 plantillas de esta spec como datos.
- Migración `0008_restablecimientos`: tabla de tokens de recuperación.
- Endpoints `POST /api/v1/auth/recuperar` y `POST /api/v1/auth/restablecer`.
- Token aleatorio de un solo uso, guardado como SHA-256, que vence en 30 min. Cada solicitud invalida los enlaces pendientes del usuario.
- Respuesta `202` idéntica para cualquier correo, exista o no, incluso si el envío falla (el fallo se registra en el log).
- Política de contraseña de RNF-08 como función pura en `domain/auth/`.
- Al restablecer: cambio del hash, fin del bloqueo, revocación de todas las sesiones, inicio de sesión automático y correo de aviso.
- Adaptador Nodemailer sobre SMTP configurado por variables `SMTP_*`. En desarrollo apunta a una cuenta de Ethereal (`smtp.ethereal.email`), y el log muestra el enlace de vista previa.
- Interpolación de variables `{{nombre}}` y `{{enlace}}` en las plantillas.
- Límite de peticiones por IP en `/auth/recuperar`.
- Variables de entorno nuevas validadas con Zod.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Pantallas "Olvidé mi contraseña" (`/recuperar`) y "Nueva contraseña" (`/restablecer`) en el frontend.
- Edición de plantillas por el administrador (RF-33) y el resto de las plantillas de notificación (RF-31).
- Cola de envíos con reintentos.
- Envío por SMS o WhatsApp (RF-34). Un usuario sin correo no puede recuperar su contraseña por esta vía.
- Primera contraseña de un vecino registrado en ventanilla sin cuenta (RF-01 y RF-07).
- Cambio de contraseña con la sesión iniciada, conociendo la actual.
- Límite por correo (solo hay límite por IP).
- Rechazar que la contraseña nueva repita la anterior.
- Registro en `bitacora` (spec de RF-42).
- Limpieza periódica de tokens vencidos.
- Mailpit u otro servidor SMTP local en docker-compose.

## Modelo de datos

### Cambios en el documento de definición

Antes de las migraciones se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- Tablas nuevas `plantillas_notificacion` y `restablecimientos`.
- Endpoints `POST /api/v1/auth/recuperar` y `POST /api/v1/auth/restablecer`, ambos públicos.

En la tabla de vacíos de SPEC 02:

- La fila de RF-33 queda resuelta en parte: ya existe la tabla de plantillas, y falta su administración.
- En la fila de RF-01, RF-02, RF-03 y RNF-09, la recuperación de contraseña queda resuelta.

### `0007_plantillas_notificacion`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `plantillas_notificacion` | `id` | bigint identity | PK |
| | `clave` | text | NOT NULL, UNIQUE, CHECK `~ '^[a-z][a-z0-9_]*$'` |
| | `asunto` | text | NOT NULL |
| | `cuerpo_texto` | text | NOT NULL |
| | `cuerpo_html` | text | NOT NULL |
| | `actualizado_en` | timestamptz | NOT NULL, DEFAULT now() |

El `up` inserta las 2 plantillas de abajo de forma literal, con `ON CONFLICT (clave) DO NOTHING`. El `down` borra la tabla.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `recuperacion_password` | `VozMuni: restablece tu contraseña` | `{{nombre}}`, `{{enlace}}` |
| `password_cambiado` | `VozMuni: tu contraseña fue cambiada` | `{{nombre}}` |

Cuerpo de texto de `recuperacion_password`:

```text
Hola {{nombre}}:

Recibimos una solicitud para restablecer tu contraseña de VozMuni.
Abre este enlace en los próximos 30 minutos para elegir una nueva:

{{enlace}}

Si no pediste el cambio, ignora este correo. Tu contraseña actual sigue funcionando.
```

Cuerpo de texto de `password_cambiado`:

```text
Hola {{nombre}}:

La contraseña de tu cuenta de VozMuni se cambió y se cerraron todas tus sesiones.
Si no fuiste tú, comunícate con la municipalidad.
```

`cuerpo_html` tiene el mismo texto, con párrafos `<p>` y el enlace como `<a href="{{enlace}}">`.

### `0008_restablecimientos`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `restablecimientos` | `id` | bigint identity | PK |
| | `usuario_id` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| | `token_hash` | text | NOT NULL, UNIQUE (SHA-256 en hexadecimal) |
| | `expira_en` | timestamptz | NOT NULL |
| | `usado_en` | timestamptz | NULL |
| | `invalidado_en` | timestamptz | NULL |
| | `creado_en` | timestamptz | NOT NULL, DEFAULT now() |

- Índice: `restablecimientos (usuario_id)`.
- El `down` borra la tabla.
- Un token es **vigente** si `usado_en IS NULL`, `invalidado_en IS NULL` y `expira_en > ahora`.

Con esta spec el esquema pasa de 15 a 17 tablas.

### Política de contraseña (`domain/auth/politica-password.ts`)

```ts
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

// Devuelve null si cumple RNF-08, o el motivo si no.
export function validarPassword(password: string): 'MUY_CORTA' | 'MUY_LARGA' | 'SIN_LETRA' | 'SIN_NUMERO' | null;
```

- Una letra es cualquier carácter que cumpla `\p{L}` (incluye tildes y ñ), y un número cualquiera que cumpla `\p{Nd}`.
- La longitud se mide en caracteres, sin recortar espacios.

### Plantillas (`domain/notificaciones/plantilla.ts`)

```ts
export interface Plantilla { clave: string; asunto: string; cuerpoTexto: string; cuerpoHtml: string }
export interface CorreoRenderizado { asunto: string; texto: string; html: string }

// Reemplaza {{variable}}; en html escapa & < > " '. Una variable sin valor lanza error.
export function renderizar(plantilla: Plantilla, variables: Record<string, string>): CorreoRenderizado;
```

### Puertos nuevos (`domain/`)

```ts
// domain/notificaciones/enviador-correo.ts
export interface EnviadorCorreo {
  enviar(mensaje: { para: string; asunto: string; texto: string; html: string }): Promise<void>;
}
// domain/repositories/plantilla-repository.ts
export interface PlantillaRepository { buscarPorClave(clave: string): Promise<Plantilla | null> }
// domain/repositories/restablecimiento-repository.ts
export interface RestablecimientoRepository {
  invalidarPendientes(usuarioId: number, ahora: Date): Promise<void>;
  crear(usuarioId: number, tokenHash: string, expiraEn: Date): Promise<void>;
  buscarVigente(tokenHash: string, ahora: Date): Promise<{ id: number; usuarioId: number } | null>;
  marcarUsado(id: number, ahora: Date): Promise<void>;
}
```

### Flujo `POST /api/v1/auth/recuperar`

1. Se valida el cuerpo `{ email }`: un correo válido, comparado en minúsculas.
2. Se busca el usuario por `lower(email)`. Si no existe, está inactivo o no tiene `password_hash`, se responde `202` sin hacer nada más.
3. Si existe, se invalidan sus enlaces pendientes (`invalidado_en = ahora`). Luego se genera un token nuevo (32 bytes aleatorios en base64url), se guarda su hash con `expira_en = ahora + 30 min`, y se arma `enlace = APP_URL + '/restablecer?token=' + token`.
4. Se responde `202` **antes** de enviar el correo. El envío (plantilla `recuperacion_password`) se ejecuta sin esperar a la respuesta, y si falla, el error queda en el log con el `usuario_id` y sin el token.
5. El cuerpo de la respuesta es siempre `{ "mensaje": "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." }`.

### Flujo `POST /api/v1/auth/restablecer`

1. Se valida el cuerpo `{ token, password }`: `token` es un texto de 1 a 200 caracteres.
2. Se aplica `validarPassword(password)`. Si falla, responde `400 POLITICA_PASSWORD`, con el motivo en `mensaje`.
3. Se busca un token vigente por SHA-256. Si no existe, venció, ya se usó o fue invalidado, o el usuario está inactivo, responde `400 TOKEN_RECUPERACION_INVALIDO`.
4. En una transacción:
   - Se guarda el nuevo `password_hash` (bcryptjs, costo 12).
   - Se dejan `intentos_fallidos = 0` y `bloqueado_hasta = null`.
   - Se marca el token como usado.
   - Se revocan todas las sesiones activas del usuario.
   - Se crea una sesión nueva (SPEC 08).
5. Responde `200` con `RespuestaSesion` de SPEC 08, que incluye el token de acceso y el de renovación.
6. Después de responder se envía el aviso `password_cambiado`, sin esperar. Si falla, se registra en el log.

| Método y ruta | Entrada | Respuesta correcta | Errores |
| --- | --- | --- | --- |
| `POST /api/v1/auth/recuperar` | `{ email }` | `202` `{ mensaje }` | `400 VALIDACION`, `429 DEMASIADAS_PETICIONES` |
| `POST /api/v1/auth/restablecer` | `{ token, password }` | `200` `RespuestaSesion` | `400 VALIDACION`, `400 POLITICA_PASSWORD`, `400 TOKEN_RECUPERACION_INVALIDO` |

Se agregan `POLITICA_PASSWORD` y `TOKEN_RECUPERACION_INVALIDO` (400) a la tabla de códigos del manejador de errores de SPEC 08.

### Adaptador de correo (`infrastructure/mail/nodemailer-enviador-correo.ts`)

- Usa `nodemailer.createTransport({ host, port, secure, auth: { user, pass } })` con las variables `SMTP_*`, y `from: MAIL_FROM`.
- Si `SMTP_HOST` es `smtp.ethereal.email`, después de cada envío registra en el log `nodemailer.getTestMessageUrl(info)`, el enlace para ver el correo en la web de Ethereal.
- En las pruebas, `container.ts` acepta un `EnviadorCorreo` falso que guarda los mensajes en memoria.

### Variables de entorno (`infrastructure/config/env.ts`)

| Variable | Regla | Ejemplo en `.env.example` |
| --- | --- | --- |
| `SMTP_HOST` | Obligatoria | `smtp.ethereal.email` |
| `SMTP_PORT` | Entero 1–65535. Por defecto 587 | `587` |
| `SMTP_SECURE` | `true` o `false`. Por defecto `false` (STARTTLS) | `false` |
| `SMTP_USER` | Obligatoria | `usuario-de-ethereal@ethereal.email` |
| `SMTP_PASS` | Obligatoria | `contraseña-de-ethereal` |
| `MAIL_FROM` | Obligatoria, con forma `Nombre <correo>` o un correo | `VozMuni <no-responder@vozmuni.test>` |
| `APP_URL` | URL `http` o `https`, sin barra final | `http://localhost:5173` |
| `RECUPERACION_LIMITE_POR_VENTANA` | Entero > 0. Por defecto 5 (por IP cada 15 min) | `5` |

Para crear la cuenta de Ethereal de desarrollo hay que entrar a `https://ethereal.email/create` y copiar el usuario y la contraseña en `backend/.env`. `CLAUDE.md` lo documenta.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6 y vacíos
CLAUDE.md
backend/
  package.json                                       # nodemailer (+ @types/nodemailer)
  .env.example                                       # SMTP_*, MAIL_FROM, APP_URL, RECUPERACION_LIMITE_POR_VENTANA
  src/
    app.ts                                           # rutas recuperar/restablecer
    container.ts                                     # enviador de correo (real o inyectado), repositorios y servicio
    domain/auth/politica-password.ts
    domain/notificaciones/plantilla.ts
    domain/notificaciones/enviador-correo.ts
    domain/repositories/plantilla-repository.ts
    domain/repositories/restablecimiento-repository.ts
    application/services/recuperacion.service.ts     # solicitar, restablecer
    infrastructure/
      config/env.ts
      mail/nodemailer-enviador-correo.ts             # reemplaza el .gitkeep de mail/
      repositories/knex-plantilla-repository.ts
      repositories/knex-restablecimiento-repository.ts
      database/migrations/0007_plantillas_notificacion.ts
      database/migrations/0008_restablecimientos.ts
    presentation/
      validators/recuperacion.validators.ts
      controllers/recuperacion.controller.ts
      routes/recuperacion.routes.ts
      middlewares/limite-recuperacion.ts
      middlewares/manejador-errores.ts               # 2 códigos nuevos
  tests/
    unit/env.test.ts                                 # se amplía
    unit/auth/politica-password.test.ts
    unit/notificaciones/plantilla.test.ts
    unit/notificaciones/nodemailer-enviador-correo.test.ts
    unit/auth/recuperacion.service.test.ts           # con repositorios y enviador falsos
    db/schema.test.ts                                # 2 tablas nuevas; 17 tablas en el rollback
    db/recuperacion.api.test.ts                      # Supertest contra Postgres real, enviador falso
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con las tablas `plantillas_notificacion` y `restablecimientos` y los 2 endpoints, y la tabla de vacíos de SPEC 02 (RF-33 en parte, RF-03 resuelto). Verificación: revisión del diff.
2. Agregar a `env.ts` y `.env.example` las variables `SMTP_*`, `MAIL_FROM`, `APP_URL` y `RECUPERACION_LIMITE_POR_VENTANA`. Ampliar `tests/unit/env.test.ts`: falta `SMTP_HOST`, `APP_URL` con barra final, `SMTP_SECURE` inválido y valores por defecto. Verificación: `npm test` y `npm run typecheck` pasan.
3. Crear `0007_plantillas_notificacion.ts` con las 2 plantillas. Ampliar `schema.test.ts` con las columnas de la tabla. Casos:
   - Después de `migrate.latest()` existen `recuperacion_password` y `password_cambiado`.
   - Una `clave` con mayúsculas es rechazada.
   - Una `clave` repetida viola UNIQUE.

   Verificación: `npm run test:db` pasa.
4. Crear `0008_restablecimientos.ts`. Ampliar `schema.test.ts` con sus columnas, el caso "dos filas con el mismo `token_hash` violan UNIQUE", y la prueba de rollback completo con 17 tablas. Verificación: `npm run test:db` pasa.
5. Crear `politica-password.ts`, `plantilla.ts`, `enviador-correo.ts` y las 2 interfaces de repositorio. Crear `politica-password.test.ts` y `plantilla.test.ts`. Casos:
   - `Abc12345` cumple.
   - `Abc1234` es `MUY_CORTA`.
   - `12345678` es `SIN_LETRA`.
   - `abcdefgh` es `SIN_NUMERO`.
   - 201 caracteres es `MUY_LARGA`.
   - `Contraseña1` cumple (ñ como letra).
   - `renderizar` reemplaza todas las apariciones, escapa `<script>` en html pero no en texto, y lanza error si falta una variable.

   Verificación: `npm test` y `npm run lint:deps` pasan.
6. Instalar nodemailer y crear `nodemailer-enviador-correo.ts` y los 2 repositorios Knex. Crear `nodemailer-enviador-correo.test.ts` con un transporte `jsonTransport` inyectado. Debe comprobar que `from`, `to`, `subject`, `text` y `html` llegan, y que con host `smtp.ethereal.email` se registra el enlace de vista previa. Verificación: `npm test` pasa.
7. Crear `RecuperacionService` (`solicitar`, `restablecer`) y `recuperacion.service.test.ts` con falsos. Casos:
   - Un correo existente genera un token, invalida el anterior y envía el correo con el enlace `APP_URL/restablecer?token=…`.
   - Un correo inexistente, un usuario inactivo o un usuario sin `password_hash` no envían nada.
   - Un fallo del enviador no propaga el error y lo registra.
   - `restablecer` con una contraseña débil lanza `POLITICA_PASSWORD` y no consume el token.
   - Un token vencido, usado o invalidado lanza `TOKEN_RECUPERACION_INVALIDO`.
   - Un restablecimiento correcto: cambia el hash, limpia el bloqueo, revoca las sesiones, crea una sesión nueva y envía el aviso.

   Verificación: `npm test` y `npm run lint:deps` pasan.
8. Crear `recuperacion.validators.ts`, `recuperacion.controller.ts`, `recuperacion.routes.ts` y `limite-recuperacion.ts`. Agregar los 2 códigos al manejador de errores y conectar todo en `container.ts` y `app.ts`. Crear `tests/db/recuperacion.api.test.ts` con el enviador falso. Casos:
   - `recuperar` responde `202` con el mismo cuerpo para un correo existente y uno inexistente.
   - El correo capturado contiene el enlace, y `restablecimientos.token_hash` no contiene el token en claro.
   - Pedir dos veces deja solo el segundo enlace vigente.
   - `restablecer` con el token responde `200` con tokens. El `refreshToken` previo del usuario deja de servir, se puede iniciar sesión con la contraseña nueva y no con la anterior, y llega el aviso `password_cambiado`.
   - Reusar el token responde `400 TOKEN_RECUPERACION_INVALIDO`.
   - Un token con `expira_en` en el pasado responde `400`.
   - Un usuario bloqueado (SPEC 08) puede entrar de inmediato después de restablecer.
   - Con `RECUPERACION_LIMITE_POR_VENTANA=2`, la 3.ª solicitud responde `429`.

   Verificación: `npm run test:db` pasa.
9. Actualizar `CLAUDE.md`:
   - Las variables nuevas de `.env`.
   - Cómo crear la cuenta de Ethereal en `https://ethereal.email/create` y dónde ver los correos (el enlace de vista previa en el log o la bandeja de la cuenta).
   - Que las plantillas de correo viven en `plantillas_notificacion` y nunca en el código.

   Verificación manual: con una cuenta de Ethereal en `.env`, backend corriendo y los usuarios de `seed:dev`, `POST /api/v1/auth/recuperar` para `vecino@vozmuni.test` deja en el log un enlace de Ethereal. Ese correo muestra el enlace `http://localhost:5173/restablecer?token=…`, y con ese token `POST /api/v1/auth/restablecer` responde `200`.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye `plantillas_notificacion`, `restablecimientos` y los endpoints `recuperar` y `restablecer`, y la tabla de vacíos refleja lo resuelto.
- [ ] `npm run migrate:latest` crea las 2 tablas y las 2 plantillas, y un rollback completo no deja ninguna de las 17 tablas.
- [ ] `POST /auth/recuperar` responde `202` con el mismo cuerpo para un correo registrado, un correo inexistente, un usuario inactivo y un usuario sin contraseña. Solo en el primer caso se envía un correo.
- [ ] `POST /auth/recuperar` responde `202` aunque el envío del correo falle, y el fallo aparece en el log sin el token.
- [ ] El correo de recuperación usa la plantilla `recuperacion_password` de la base, con el nombre del usuario y el enlace `APP_URL/restablecer?token=<token>`.
- [ ] Si se cambia el `asunto` de `recuperacion_password` en la base, el siguiente correo usa el asunto nuevo sin reiniciar el backend.
- [ ] `restablecimientos.token_hash` guarda el SHA-256 del token, nunca el token en claro.
- [ ] Después de dos solicitudes seguidas, solo el token de la segunda restablece la contraseña, y el de la primera responde `400 TOKEN_RECUPERACION_INVALIDO`.
- [ ] Un token deja de servir a los 30 min, y también después de usarse una vez.
- [ ] `POST /auth/restablecer` con `Abc1234`, `12345678` o `abcdefgh` responde `400 POLITICA_PASSWORD`, y el token sigue vigente.
- [ ] Un restablecimiento correcto responde `200` con `RespuestaSesion`. Después: la contraseña nueva inicia sesión y la anterior no; los `refreshToken` previos del usuario responden `401`; `intentos_fallidos = 0` y `bloqueado_hasta = null`; y se envía el correo `password_cambiado`.
- [ ] Con `RECUPERACION_LIMITE_POR_VENTANA=2`, la 3.ª petición a `/auth/recuperar` desde la misma IP responde `429 DEMASIADAS_PETICIONES`.
- [ ] El backend no arranca si falta `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` o `APP_URL`.
- [ ] Con una cuenta de Ethereal configurada, una solicitud real deja en el log un enlace de vista previa de Ethereal, y el correo se ve en la bandeja de esa cuenta.
- [ ] Ningún asunto ni cuerpo de correo está escrito en `src/` fuera de la migración `0007_plantillas_notificacion`.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta las variables nuevas, cómo usar Ethereal en desarrollo y que las plantillas viven en la base.

## Decisiones

- **Sí:** solo backend. Las pantallas `/recuperar` y `/restablecer` van con la spec de login del frontend, que todavía no existe.
- **Sí:** Nodemailer sobre SMTP (es el que nombra el stack), con las credenciales en variables `SMTP_*`. En desarrollo apuntan a Ethereal, como eligió el usuario, y en producción al SMTP de la municipalidad sin cambiar código.
- **No:** Mailpit en docker-compose, ni crear una cuenta de Ethereal automática al arrancar (necesita internet y la cuenta cambia en cada arranque), ni un adaptador de consola.
- **Sí:** token aleatorio guardado como SHA-256 en `restablecimientos`, de un solo uso y que vence en 30 min. Es el mismo patrón que `sesiones` de SPEC 08, y permite invalidarlo.
- **No:** JWT firmado con el `password_hash`.
- **Sí:** cada solicitud invalida los enlaces pendientes del usuario, así que solo sirve el último.
- **Sí:** `202` con el mismo cuerpo para cualquier correo, como en el login de SPEC 08. No revela qué correos están registrados.
- **Sí:** si el envío falla, igual se responde `202` y el fallo se registra en el log. El usuario eligió primero `503 MAIL_NO_DISPONIBLE`, pero luego volvió a `202` siempre, porque un `503` solo aparecería con correos registrados y los revelaría.
- **No:** `503`, verificar el SMTP antes de buscar el usuario, ni una cola con reintentos.
- **Sí:** el correo se envía después de responder, sin esperar. Es consecuencia de la decisión anterior: si la respuesta esperara al SMTP, el tiempo de respuesta revelaría qué correos existen. No se preguntó explícitamente y puede revisarse.
- **Sí:** al restablecer, en una sola transacción, se cambia el hash, se limpia el bloqueo, se revocan todas las sesiones y se crea una sesión nueva. Así se inicia sesión automáticamente, se envía el aviso `password_cambiado`, y la única sesión viva es la nueva.
- **Sí:** política de RNF-08 (mínimo 8 caracteres, con letra y número, máximo 200) como función pura en `domain/auth/`, para que RF-01 y RF-04 la reutilicen. La política se valida antes de buscar el token, así que una contraseña débil no consume el enlace.
- **No:** validarla solo en Zod, ni rechazar que repita la contraseña anterior.
- **Sí:** tabla mínima `plantillas_notificacion` con las 2 plantillas como datos. Cumple la regla de `CLAUDE.md` de no fijar plantillas en el código, y adelanta parte de RF-33. La pantalla de edición queda para RF-33.
- **No:** plantillas en archivos ni como constantes.
- **Sí:** variables `{{nombre}}` y `{{enlace}}` con escape en el HTML. Una variable sin valor lanza un error, para no enviar correos con `{{...}}` visibles.
- **Sí:** las plantillas se leen de la base en cada envío, así que un cambio aplica sin reiniciar.
- **Sí:** enlace `APP_URL + /restablecer?token=…`. La ruta del frontend la crea su spec; mientras tanto el token se prueba directo contra la API.
- **Sí:** límite por IP en `/auth/recuperar`, con `RECUPERACION_LIMITE_POR_VENTANA` (por defecto 5 cada 15 min).
- **No:** límite por correo, ni no tener límite.
- **Sí:** `400 TOKEN_RECUPERACION_INVALIDO` por igual para un token inexistente, vencido, usado o invalidado. No da pistas sobre el estado del token. El status y el nombre del código los propone esta spec.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| SPEC 08 todavía está en Borrador, y esta spec usa sus tablas, servicios y middlewares | Esta spec se implementa después de SPEC 08. Si SPEC 08 cambia, se revisa esta antes de aprobarla. |
| Un fallo del SMTP pasa desapercibido, porque la respuesta siempre es `202` | El fallo queda en el log con el `usuario_id`. Una spec de notificaciones (RF-31) puede agregar una cola con reintentos y alertas. |
| El envío sin esperar se pierde si el proceso se detiene justo después de responder | El usuario puede volver a pedir el enlace. La cola de RF-31 lo resolvería. |
| Las credenciales de Ethereal o del SMTP real llegan al repositorio | Viven solo en `backend/.env`, que git ignora. `.env.example` lleva valores de ejemplo. |
| El enlace apunta a `/restablecer`, que no existe hasta la spec del frontend | Es intencional. La verificación manual usa el token directo contra la API. |
| Ethereal no entrega correos reales, y un usuario de prueba espera recibirlo en su buzón | `CLAUDE.md` explica que en desarrollo los correos solo se ven en Ethereal. |
| Detrás de Nginx todas las peticiones llegan con la misma IP y el límite bloquea a todos | Igual que en SPEC 08: `trust proxy` queda para la spec de despliegue. |
| Los tokens vencidos se acumulan en `restablecimientos` | Una spec futura agrega un job de limpieza junto con el de `sesiones`. |

## Lo que **no** está en esta spec

- Pantallas de recuperación en el frontend.
- Edición de plantillas y el resto de notificaciones.
- Cola de envíos, SMS y WhatsApp.
- Primera contraseña de vecinos de ventanilla y cambio de contraseña con sesión.
- Límite por correo y bloqueo de contraseñas repetidas.
- Bitácora y limpieza de tokens vencidos.
- Servidor SMTP local en docker-compose.

Cada uno de estos temas, cuando llegue, va en su propia spec.
