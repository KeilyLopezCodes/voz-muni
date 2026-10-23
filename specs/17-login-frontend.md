# SPEC 17 — Sesión y login en el frontend

> **Estado:** Aprobado
> **Depende de:** SPEC 06, SPEC 08, SPEC 09, SPEC 16
> **Fecha:** 2026-10-22
> **Objetivo:** Conectar la SPA con la autenticación de SPEC 08 mediante un formulario de login, una sesión real que sobrevive a recargar, renovación automática del token coordinada entre pestañas, cierre de sesión, y las pantallas `/recuperar` y `/restablecer` de SPEC 09.

## Por qué existe esta spec

Desde SPEC 06, la sesión del navegador es siempre `null`, así que ninguna pantalla protegida se puede usar. SPEC 08 construyó la autenticación en el backend y dejó para el frontend dos decisiones de seguridad: dónde guardar el token de renovación y cómo evitar que dos renovaciones simultáneas cierren todas las sesiones del usuario.
El formulario de queja (RF-06, RNF-14) necesita esta spec para poder usarse y medirse en el navegador. También la necesitan los enlaces de los correos de recuperación e invitación (SPEC 09, 10 y 13), que apuntan a `/restablecer`.

## Alcance

**Incluido:**

- Formulario de login en `/login`, con React Hook Form, que conserva el indicador de estado del servidor de SPEC 06 y el enlace "Crear cuenta" de SPEC 16.
- `AuthProvider` en `features/auth`:
  - Guarda el token de acceso solo en memoria y el de renovación en `localStorage`.
  - Recupera la sesión al cargar la app y la entrega a `SessionProvider`.
- Renovación ante un `401` con un solo reintento. Dentro de una pestaña se comparte una sola renovación en curso, y entre pestañas se usa `navigator.locks`.
- Sincronización entre pestañas con el evento `storage`: un login o un logout en una pestaña se refleja en las demás.
- Cierre de sesión desde `AppLayout`, que limpia el estado local aunque falle la red.
- Vuelta a la página que el usuario intentó abrir después de iniciar sesión.
- Pantallas públicas `/recuperar` y `/restablecer`. `/restablecer` también sirve para las invitaciones de SPEC 10 y 13, e inicia sesión con la respuesta.
- Mensajes traducidos para los errores de login, incluido `CORREO_NO_VERIFICADO` (SPEC 16).
- Validación del rol recibido contra `ROLES` (riesgo registrado en SPEC 06).
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Formulario de queja (`/tickets/nueva`). Va en su propia spec y depende de esta.
- Mostrar el nombre del usuario o un perfil en la barra.
- Cambio de contraseña con la sesión iniciada.
- Recordar el correo o la opción "mantener sesión iniciada".
- Cookie httpOnly para el token de renovación. Exigiría cambiar SPEC 08.
- Renovación proactiva con temporizador.
- Content Security Policy y cabeceras de seguridad (spec de despliegue).
- Auditoría formal de WCAG 2.1 AA (RNF-15). Esta spec solo aplica sus prácticas básicas en los formularios.

## Modelo de datos

Esta spec no crea datos en el backend. Introduce estos elementos en el cliente.

### Almacenamiento (`features/auth/sesion/almacen-sesion.ts`)

| Dato | Dónde | Por qué |
| --- | --- | --- |
| `accessToken` | memoria (variable del módulo) | dura 15 min y se pide de nuevo con el de renovación |
| `refreshToken` | `localStorage['vozmuni.refreshToken']` | la sesión sobrevive a recargar y a cerrar la pestaña durante 7 días |
| `Session` (SPEC 06) | estado de React en `AuthProvider` | sale de `RespuestaSesion.usuario` |

```ts
export function leerRefresh(): string | null;           // try/catch: si localStorage falla, devuelve null
export function guardarRefresh(token: string): void;    // try/catch: si falla, la sesión dura solo esta pestaña
export function borrarRefresh(): void;
export const CLAVE_REFRESH = 'vozmuni.refreshToken';
```

### Renovador (`features/auth/sesion/renovador.ts`)

```ts
// Devuelve la RespuestaSesion nueva, o null si no hay sesión válida.
export function renovar(): Promise<RespuestaSesion | null>;
```

1. Si ya hay una renovación en curso en esta pestaña, devuelve la misma promesa.
2. Si existe `navigator.locks`, ejecuta todo dentro de `navigator.locks.request('vozmuni-refresh', …)`. Sin él (navegadores viejos), sigue solo con la promesa compartida.
3. Ya con el lock, relee `localStorage`:
   - Si el token cambió respecto del que tenía esta pestaña, otra pestaña ya renovó. Se usa ese token y se pide un token de acceso con él.
   - Si no cambió, se llama a `POST /auth/refresh`.
4. Si responde `200`, guarda el `refreshToken` nuevo y devuelve la respuesta. Si responde `401`, borra el token y devuelve `null`.

Ningún paso guarda tokens en `sessionStorage`, en cookies ni en los logs.

### Cliente HTTP (`shared/api/http-client.ts`, SPEC 06)

- Agrega `setUnauthorizedHandler(fn: () => Promise<boolean>)`, junto a `setTokenProvider`.
- Ante un `401` en una ruta que no empieza con `/auth/`, llama al handler una vez. Si devuelve `true`, repite la petición **una sola vez** con el token nuevo. Si devuelve `false` o el reintento vuelve a dar `401`, lanza el `ApiError` original.
- Las rutas `/auth/*` nunca disparan el handler, para no entrar en bucles.

### Sesión compartida (`shared/auth/`)

- `session.ts` agrega `CerrarSesionContext` y `useCerrarSesion(): () => Promise<void>`. `Session` no cambia: sigue con `usuarioId`, `rol` y `dependenciaId`.
- `SessionProvider` recibe también `cerrarSesion`, y `cargando: boolean`.
- `RequireRole`:
  - Mientras `cargando` es `true`, muestra un indicador y no redirige. Sin esto, recargar `/tickets` llevaría a `/login` antes de recuperar la sesión.
  - Al mandar a `/login`, pasa la ruta original en `state.desde`.

### `AuthProvider` (`features/auth/AuthProvider.tsx`)

- **Al montar:** si hay `refreshToken` en `localStorage`, llama a `renovar()`. Mientras tanto, `cargando = true`.
- **Al obtener una sesión:** valida que `usuario.rol` esté en `ROLES`. Si no, la descarta y borra el token. Luego registra `setTokenProvider` y `setUnauthorizedHandler`. Este último llama a `renovar()` y, si devuelve `null`, cierra la sesión local.
- **Evento `storage`** sobre `CLAVE_REFRESH`:
  - Si el valor pasa a `null`, otra pestaña cerró sesión: se limpia la sesión local y se navega a `/login`.
  - Si aparece un valor y esta pestaña no tenía sesión, otra pestaña inició sesión: se llama a `renovar()`.
- **`cerrarSesion()`:** llama a `POST /auth/logout` con el `refreshToken`, sin esperar el resultado para limpiar. Siempre borra `localStorage`, el token en memoria, la sesión y la caché de TanStack Query (`queryClient.clear()`), y navega a `/login`.
- **`iniciarSesion(respuesta)`:** lo usan `/login` y `/restablecer`. Guarda los tokens y fija la sesión.

`main.tsx` monta `AuthProvider` en lugar de `<SessionProvider session={null}>`. `AuthProvider` vive en `features/auth` y entrega la sesión a `SessionProvider` de `shared`, lo que respeta la regla `shared-no-features` de SPEC 06.

### Pantallas

| Ruta | Acceso | Contenido | Al terminar |
| --- | --- | --- | --- |
| `/login` | pública. Con sesión, redirige a `inicioPorRol` | Correo y contraseña. Enlaces "Olvidé mi contraseña" (`/recuperar`) y "Crear cuenta" (`/registro`, SPEC 16). Indicador del servidor (SPEC 06) | Va a `state.desde` si es una ruta interna permitida para su rol; si no, a `inicioPorRol(rol)` |
| `/recuperar` | pública | Correo | Siempre muestra "Si el correo está registrado, recibirás un enlace" (respuesta `202` de SPEC 09) |
| `/restablecer` | pública | Lee `token` de la query. Contraseña nueva y su confirmación, con la política de RNF-08 validada en el cliente | `iniciarSesion` con la respuesta de SPEC 09 y va a `inicioPorRol` |

Mensajes por código (todos en `locales/es/auth.json`):

| Pantalla | `codigo` | Mensaje (resumen) |
| --- | --- | --- |
| `/login` | `CREDENCIALES_INVALIDAS` | Correo o contraseña incorrectos |
| `/login` | `CUENTA_BLOQUEADA` | Cuenta bloqueada por intentos fallidos; espera 15 minutos o restablece tu contraseña |
| `/login` | `CORREO_NO_VERIFICADO` | Tu correo no está verificado. Revisa tu bandeja o vuelve a registrarte con el mismo correo para recibir un enlace nuevo, con un enlace a `/registro` |
| `/login`, `/recuperar` | `DEMASIADAS_PETICIONES` | Demasiados intentos; espera unos minutos |
| `/restablecer` | `TOKEN_RECUPERACION_INVALIDO` | El enlace no es válido o venció, con un enlace a `/recuperar` |
| `/restablecer` | `POLITICA_PASSWORD` | La contraseña no cumple los requisitos, en el campo |
| todas | `RED_NO_DISPONIBLE`, `TIEMPO_AGOTADO` | No se pudo conectar con el servidor |
| todas | otro código | Ocurrió un error; intenta de nuevo |

Reglas comunes de los formularios (RNF-14, RNF-15 y RNF-16):

- Cada campo tiene un `<label>` asociado y el `autocomplete` correcto (`email`, `current-password` o `new-password`).
- Los errores se anuncian con `role="alert"`, y al fallar el envío el foco va al primer campo con error.
- El botón de envío se deshabilita mientras la petición está en curso, para no enviar dos veces.
- No hay scroll horizontal a 360 px.
- Ningún texto visible está fijo en un componente.
- La política de contraseña del cliente reutiliza la de `features/auth/validacion-registro.ts` (SPEC 16).

`state.desde` solo se usa si empieza con `/` y no con `//`. Así se evita redirigir a un sitio externo.

### Archivos nuevos o modificados

```text
CLAUDE.md
frontend/
  src/
    main.tsx                                       # monta AuthProvider
    app/App.tsx                                    # expone queryClient a AuthProvider
    app/router.tsx                                 # /recuperar y /restablecer públicas
    shared/api/http-client.ts                      # setUnauthorizedHandler
    shared/auth/session.ts                         # CerrarSesionContext, useCerrarSesion
    shared/auth/SessionProvider.tsx                # cerrarSesion, cargando
    shared/auth/RequireRole.tsx                    # indicador mientras carga; state.desde
    shared/layout/AppLayout.tsx                    # botón "Cerrar sesión"
    features/auth/AuthProvider.tsx
    features/auth/sesion/almacen-sesion.ts
    features/auth/sesion/renovador.ts
    features/auth/api/auth-api.ts                  # login, refresh, logout, recuperar, restablecer
    features/auth/pages/LoginPage.tsx              # formulario
    features/auth/pages/RecuperarPage.tsx
    features/auth/pages/RestablecerPage.tsx
    locales/es/auth.json  locales/es/comun.json
  tests/
    shared/http-client.test.ts                     # setUnauthorizedHandler
    shared/require-role.test.tsx                   # cargando y state.desde
    shared/app-layout.test.tsx                     # botón de cierre
    features/almacen-sesion.test.ts
    features/renovador.test.ts                     # promesa única, locks simulados, relectura
    features/auth-provider.test.tsx
    features/login-page.test.tsx
    features/recuperar-page.test.tsx
    features/restablecer-page.test.tsx
    app/router.test.tsx                            # rutas públicas nuevas
```

## Plan de implementación

1. Agregar `setUnauthorizedHandler` a `http-client.ts` y ampliar `http-client.test.ts`. Casos:
   - Ante un `401` el handler se llama una vez.
   - Con `true`, la petición se repite una vez con el token nuevo.
   - Con `false`, se lanza el error original.
   - Un segundo `401` en el reintento no vuelve a llamar al handler.
   - Las rutas `/auth/*` no lo llaman.

   Verificación: `npm test` pasa en `frontend/`.
2. Crear `almacen-sesion.ts` y `renovador.ts`, con sus pruebas. Casos:
   - `localStorage` que lanza al leer o escribir no rompe nada.
   - Dos llamadas simultáneas a `renovar()` hacen una sola petición.
   - Con `navigator.locks` simulado, si el token en `localStorage` cambió al obtener el lock, no se llama a `/auth/refresh` con el viejo.
   - Un `401` borra el token y devuelve `null`.
   - Sin `navigator.locks`, funciona con la promesa compartida.

   Verificación: `npm test` pasa.
3. Crear `auth-api.ts` y `AuthProvider.tsx`. Ampliar `session.ts`, `SessionProvider.tsx` y `RequireRole.tsx`, y montar `AuthProvider` en `main.tsx`. Crear `auth-provider.test.tsx` y ampliar `require-role.test.tsx`. Casos:
   - Con un token guardado recupera la sesión, y mientras tanto `RequireRole` no redirige.
   - Sin token, la sesión queda `null` sin llamar a la API.
   - Un rol desconocido se descarta.
   - El evento `storage` con `null` cierra la sesión y lleva a `/login`.
   - El evento `storage` con un token nuevo recupera la sesión.
   - Un `401` de la API renueva y reintenta.
   - Si la renovación falla, se cierra la sesión.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
4. Agregar "Cerrar sesión" en `AppLayout` y ampliar `app-layout.test.tsx`. Casos:
   - Se ve solo con sesión.
   - Llama a `/auth/logout`, borra `localStorage` y la caché, y va a `/login`.
   - Si `/auth/logout` falla con un error de red, igual limpia todo.

   Verificación: `npm test` pasa.
5. Reescribir `LoginPage.tsx` con React Hook Form y los textos en `auth.json`. Ampliar `login-page.test.tsx` con `fetch` simulado. Casos:
   - Un login correcto guarda el refresh y va a `/tickets` (vecino) o `/admin` (administrador).
   - Con `state.desde = '/tickets/nueva'`, el vecino vuelve ahí. Con `state.desde = '//evil.com'`, va a su inicio.
   - Cada código de la tabla muestra su mensaje.
   - `CORREO_NO_VERIFICADO` muestra el enlace a `/registro`.
   - Con sesión, `/login` redirige.
   - El indicador del servidor sigue funcionando.
   - El botón se deshabilita mientras envía.

   Verificación: `npm test` pasa.
6. Crear `RecuperarPage.tsx` y `RestablecerPage.tsx`, agregar las rutas públicas en `router.tsx` y ampliar `router.test.tsx`. Crear sus pruebas. Casos:
   - `/recuperar` muestra el mismo mensaje con `202`.
   - `/restablecer` valida la política y la confirmación, y con `200` inicia sesión y va al inicio del rol.
   - `TOKEN_RECUPERACION_INVALIDO` muestra el enlace a `/recuperar`.
   - Sin `token`, muestra el error sin llamar a la API.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
7. Actualizar `CLAUDE.md`: dónde vive cada token, la regla de renovar solo con `renovar()` (nunca llamar a `/auth/refresh` directo), y que la sesión se comparte entre pestañas. Verificación manual con el backend en `3000`, `seed:dev` y Ethereal:
   - Iniciar sesión como `vecino@vozmuni.test` lleva a `/tickets`, y recargar conserva la sesión.
   - Con dos pestañas abiertas, cerrar sesión en una lleva la otra a `/login`.
   - Con el token de acceso vencido (esperar 15 min o borrarlo de memoria), la siguiente navegación funciona sin volver a iniciar sesión.
   - "Olvidé mi contraseña" envía el correo a Ethereal, y su enlace abre `/restablecer`, define la contraseña y entra.

## Criterios de aceptación

- [ ] `vecino@vozmuni.test` inicia sesión en `/login` y llega a `/tickets`, y `administrador@vozmuni.test` llega a `/admin`.
- [ ] Al abrir `/tickets/nueva` sin sesión, el usuario va a `/login`, y después de iniciar sesión vuelve a `/tickets/nueva`. Un `desde` externo (`//…` o `http…`) se ignora.
- [ ] Recargar la página con una sesión activa la conserva sin pasar por `/login`, y mientras se recupera no hay redirección.
- [ ] El `refreshToken` está en `localStorage['vozmuni.refreshToken']`, y el `accessToken` no está en `localStorage`, en `sessionStorage` ni en cookies.
- [ ] Con el token de acceso vencido, la siguiente petición se renueva y se reintenta una sola vez sin que el usuario lo note. Si la renovación falla, la sesión se cierra y se va a `/login`.
- [ ] Varias peticiones que reciben `401` al mismo tiempo en una pestaña generan una sola llamada a `/auth/refresh`.
- [ ] Con dos pestañas abiertas que necesitan renovar a la vez, solo una llama a `/auth/refresh`, la otra usa el token ya renovado, y el backend no revoca las sesiones del usuario.
- [ ] Cerrar sesión en una pestaña lleva a las demás a `/login`, e iniciar sesión en una recupera la sesión en las demás.
- [ ] "Cerrar sesión" llama a `/auth/logout`, borra el token de renovación, la sesión y la caché de datos, y lleva a `/login`, aunque la llamada falle por la red.
- [ ] Un rol que no está en `ROLES` no crea sesión.
- [ ] `/login` muestra un mensaje traducido distinto para credenciales inválidas, cuenta bloqueada, correo no verificado (con un enlace a `/registro`), demasiadas peticiones y red no disponible.
- [ ] `/recuperar` muestra siempre el mismo mensaje después de enviar.
- [ ] `/restablecer?token=…` valida la política de RNF-08 y la confirmación en el cliente, inicia sesión con la respuesta y lleva al inicio del rol. Con un enlace inválido muestra un enlace a `/recuperar`. Funciona con enlaces de recuperación y de invitación.
- [ ] Los formularios tienen etiquetas asociadas, `autocomplete` correcto, errores anunciados con `role="alert"`, foco en el primer error y botón deshabilitado mientras envían.
- [ ] A 360 px de ancho, `/login`, `/recuperar` y `/restablecer` no producen scroll horizontal.
- [ ] Ningún texto visible de las páginas nuevas o modificadas está fijo en un componente.
- [ ] En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta dónde vive cada token y la regla de renovar solo con `renovar()`.

## Decisiones

- **Sí:** esta spec va antes del formulario de queja, como eligió el usuario. Sin sesión no se puede usar ni medir RNF-14 en el navegador.
- **No:** escribir el formulario de queja con una sesión simulada, ni meter el login dentro de esa spec.
- **Sí:** el token de renovación en `localStorage` y el de acceso solo en memoria, como eligió el usuario. Para un vecino en celular, la sesión sobrevive a recargar y a cerrar la pestaña. El riesgo de XSS lo limitan la rotación y la revocación por reuso de SPEC 08, y que la app no inyecta HTML.
- **No:** `sessionStorage`, guardarlo solo en memoria, ni cambiar SPEC 08 a una cookie httpOnly.
- **Sí:** las renovaciones se coordinan entre pestañas con `navigator.locks`, releyendo `localStorage` al obtener el lock, más una promesa única por pestaña. Así se evita que dos pestañas presenten el mismo token y el backend revoque todo.
- **No:** solo una promesa por pestaña, ni una gracia en el backend.
- **Sí:** las pestañas se sincronizan con el evento `storage`.
- **Sí:** se renueva solo al recibir un `401`, con un único reintento.
- **No:** un temporizador antes del vencimiento.
- **Sí:** después del login se vuelve a la página que se intentó abrir, si es interna y la permite el rol. Si no, se va al inicio del rol.
- **Sí:** las pantallas `/recuperar` y `/restablecer` van aquí, porque los enlaces de los correos de SPEC 09, 10 y 13 llevan a `/restablecer`.
- **Sí:** `CORREO_NO_VERIFICADO` muestra un enlace a `/registro`. Volver a registrarse reenvía el enlace (SPEC 16).
- **Sí:** esta spec depende de SPEC 16, que crea `/registro` y el enlace "Crear cuenta", que esta conserva.
- **Sí:** el cierre de sesión limpia el estado local aunque falle la red, así una sesión nunca queda "pegada" en el navegador.
- **Sí:** `RequireRole` muestra un indicador mientras se recupera la sesión. Es un cambio menor a SPEC 06, necesario para que recargar no lleve a `/login`.
- **Sí:** el rol recibido se valida contra `ROLES`, como pedía el riesgo de SPEC 06.
- **Sí:** la clave `vozmuni.refreshToken`, el nombre del lock `vozmuni-refresh` y los textos de los mensajes los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un XSS lee el `refreshToken` de `localStorage` | La app no usa `dangerouslySetInnerHTML` y React escapa el contenido. La rotación y la revocación por reuso (SPEC 08) cortan la sesión robada en cuanto la víctima renueva. La spec de despliegue debe agregar una Content Security Policy. |
| Un navegador sin `navigator.locks` renueva en dos pestañas a la vez y el backend revoca todas las sesiones | Los navegadores actuales lo soportan. Sin él, el usuario vuelve a iniciar sesión, que es un efecto molesto pero seguro. |
| `localStorage` bloqueado (modo privado estricto) | Las lecturas y escrituras van en `try/catch`. La sesión funciona, pero dura solo mientras la pestaña esté abierta. |
| Un `401` por un motivo distinto del vencimiento (usuario desactivado) dispara una renovación inútil | La renovación también falla, y se cierra la sesión. Es el comportamiento correcto. |
| Depende de SPEC 08, 09 y 16, que siguen en Borrador | Se implementa después de ellas. Si cambian sus endpoints o códigos, se revisa esta antes de aprobarla. |
| El formulario de queja (RF-06, RNF-14) sigue sin spec | Es la siguiente spec, que dependerá de esta. |

## Lo que **no** está en esta spec

- Formulario de queja.
- Perfil, nombre en la barra y cambio de contraseña.
- "Mantener sesión iniciada".
- Cookie httpOnly y renovación con temporizador.
- Content Security Policy.
- Auditoría formal de accesibilidad.

Cada uno de estos temas, cuando llegue, va en su propia spec.

