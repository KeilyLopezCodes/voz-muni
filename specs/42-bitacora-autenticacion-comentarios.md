# SPEC 42 — Bitácora de autenticación, comentarios y adjuntos

> **Estado:** Implementado
> **Depende de:** SPEC 08, SPEC 09, SPEC 10, SPEC 13, SPEC 16, SPEC 23, SPEC 24, SPEC 41
> **Fecha:** 2026-10-23
> **Objetivo:** Completar RF-42 registrando en la bitácora de SPEC 41 los inicios de sesión (correctos, fallidos y bloqueos), los cierres de sesión, la recuperación y definición de contraseñas, el registro y la verificación de vecinos, y la creación y edición de comentarios y la subida y el borrado de adjuntos, con escrituras independientes para los eventos de fallo.

## Por qué existe esta spec

RF-42 pide registrar quién hizo qué acción, sobre qué registro y cuándo. SPEC 41 dejó la base (el puerto `Auditoria`, el catálogo, el saneamiento, la IP por contexto de solicitud y la consulta) e integró las quejas y la administración. Reservó para esta spec `sesion.*`, `usuario.registrar`, `password.*`, `comentario.*` y `adjunto.*`.
Estas acciones tienen casos especiales:

- Un inicio de sesión fallido termina en error, así que no hay una transacción de negocio que confirmar.
- Editar un comentario borra el texto anterior (SPEC 23), y la bitácora pasa a ser su único rastro.

## Alcance

**Incluido:**

- 12 acciones nuevas en `ACCIONES_BITACORA` (SPEC 41):

  | Acción | Entidad | Spec | Cuándo |
  | --- | --- | --- | --- |
  | `sesion.iniciar` | `usuario` | SPEC 08 | Inicio de sesión correcto |
  | `sesion.fallar` | `usuario` | SPEC 08 | Contraseña incorrecta, o intento sobre una cuenta bloqueada o inactiva, de un correo que existe |
  | `sesion.bloquear` | `usuario` | SPEC 08 | El intento que bloquea la cuenta (RNF-09) |
  | `sesion.cerrar` | `usuario` | SPEC 08 | Cierre de sesión |
  | `password.solicitar` | `usuario` | SPEC 09 | Pedido de recuperación de una cuenta existente |
  | `password.definir` | `usuario` | SPEC 09, 10, 13 | Contraseña definida con un enlace de recuperación o de invitación |
  | `usuario.registrar` | `usuario` | SPEC 16 | Cuenta de vecino creada |
  | `usuario.verificar_correo` | `usuario` | SPEC 16 | Correo verificado |
  | `comentario.crear` | `comentario` | SPEC 23 | Comentario público o nota interna |
  | `comentario.editar` | `comentario` | SPEC 23 | Edición dentro de los 5 minutos |
  | `adjunto.subir` | `adjunto` | SPEC 24 | En el registro o durante la atención |
  | `adjunto.borrar` | `adjunto` | SPEC 24 | Borrado por el autor dentro de los 5 minutos |

- `Auditoria.registrarIndependiente(evento)`: en su propia transacción, para los eventos de fallo (`sesion.fallar` y `sesion.bloquear`). Si falla la escritura, se registra en el log y la respuesta no cambia.
- Los eventos de autenticación quedan con `dependencia_id` en `NULL`: solo los ven el supervisor y el administrador.
- Los comentarios guardan su texto truncado a 200 caracteres. La edición guarda el `antes` y el `despues`.
- **Cambio sobre SPEC 41:** el filtro `numero` y el campo `ticketNumero` también cubren los comentarios y los adjuntos.
- Las traducciones de las acciones nuevas en `/bitacora`.
- Actualización de `CLAUDE.md` y de la sección 6 del documento de definición.

**Fuera de alcance (para specs futuras):**

- Los intentos con un correo inexistente, en el inicio de sesión y en la recuperación. El usuario decidió no registrarlos.
- La renovación del token de acceso (`/auth/refresh`). Generaría un registro cada 15 minutos por usuario.
- Las descargas de adjuntos, públicos o internos.
- Los enlaces de recuperación, verificación o invitación inválidos o vencidos, que no tienen usuario.
- Las peticiones cortadas por el límite por IP (`429`), que se rechazan antes del caso de uso.
- Alertas de seguridad, como muchos fallos desde una IP.

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones. Las acciones nuevas cumplen el `CHECK` de formato de SPEC 41 (`^[a-z_]+\.[a-z_]+$`).

### Acciones y detalle

| Acción | `entidad_id` | `usuario_id` (actor) | `dependencia_id` | `datos` |
| --- | --- | --- | --- | --- |
| `sesion.iniciar` | id del usuario | el usuario | `NULL` | `{}` |
| `sesion.fallar` | id del usuario | el usuario | `NULL` | `{ motivo: 'password_incorrecta' \| 'cuenta_bloqueada' \| 'cuenta_inactiva', intentos }` |
| `sesion.bloquear` | id del usuario | el usuario | `NULL` | `{ bloqueadoHasta }` |
| `sesion.cerrar` | id del usuario | el usuario | `NULL` | `{}` |
| `password.solicitar` | id del usuario | el usuario | `NULL` | `{}` |
| `password.definir` | id del usuario | el usuario | `NULL` | `{ tipo: 'recuperacion' \| 'invitacion' }` |
| `usuario.registrar` | id del vecino | el vecino | `NULL` | `{}` (el DPI, el teléfono y el correo, enmascarados en `cambios`) |
| `usuario.verificar_correo` | id del vecino | el vecino | `NULL` | `{}` |
| `comentario.crear` | id del comentario | el autor | la de la queja | `{ ticketId, interno, cuerpo }` (con `cuerpo` truncado) |
| `comentario.editar` | id del comentario | el autor | la de la queja | `{ ticketId, interno }`, con `cambios.cuerpo` `{ antes, despues }` truncados |
| `adjunto.subir` | id del adjunto | quien sube | la de la queja | `{ ticketId, nombre, tipoMime, tamanoBytes, interno, origen }` |
| `adjunto.borrar` | id del adjunto | el autor | la de la queja | `{ ticketId, nombre, interno }` |

- Todo pasa por el saneamiento de SPEC 41: no se guardan contraseñas, tokens ni hashes, los datos personales se enmascaran y los textos se truncan a 200 caracteres.
- `cuenta_inactiva` cubre los dos casos que `AuthService` (SPEC 08) ya trata igual: un usuario con `activo = false` y uno sin contraseña definida (por ejemplo, una invitación sin aceptar). La respuesta sigue siendo `401 CREDENCIALES_INVALIDAS`, igual que para un correo inexistente.
- `sesion.fallar` y `sesion.bloquear` son eventos distintos. El intento que bloquea la cuenta deja los dos, para que el bloqueo se pueda filtrar sin ambigüedad.
- `password.definir` también cubre la aceptación de una invitación (SPEC 10 y 13). Si devuelve una sesión (SPEC 09), no se registra además un `sesion.iniciar`.
- `usuario.registrar` solo se registra cuando el registro crea una cuenta nueva. SPEC 16 responde `202` también cuando el correo ya existe, y ese caso no se registra.
- Los comentarios del vecino también se registran, con el vecino como actor.

### Escritura independiente (cambio sobre SPEC 41)

```ts
export interface Auditoria {
  registrar(evento: EventoAuditoria, trx): Promise<void>;           // SPEC 41
  // Abre su propia transacción. Si falla, registra el error en el log y no lanza.
  registrarIndependiente(evento: EventoAuditoria): Promise<void>;
}
```

| Evento | Cómo se escribe |
| --- | --- |
| `sesion.fallar`, `sesion.bloquear` | `registrarIndependiente`. La respuesta sigue siendo `401 CREDENCIALES_INVALIDAS` o `423 CUENTA_BLOQUEADA` (SPEC 08), aunque la bitácora falle |
| Todos los demás | `registrar` dentro de la transacción del caso de uso, como en SPEC 41. Si la escritura falla, el caso de uso se revierte |

- `registrarIndependiente` se confirma aunque el caso de uso termine en error. Por eso se llama después de guardar el contador de intentos (SPEC 08) y antes de lanzar el error.
- Si `AuthService` (SPEC 08) guarda el bloqueo sin una transacción explícita, esta spec la agrega: `guardarBloqueo` y `sesion.iniciar` comparten la transacción del inicio de sesión correcto.

### Dónde se registra

| Spec | Caso de uso | Acciones |
| --- | --- | --- |
| SPEC 08 | `AuthService.login` | `sesion.iniciar`, `sesion.fallar`, `sesion.bloquear` |
| SPEC 08 | `AuthService.cerrarSesion` | `sesion.cerrar` (solo si el token de renovación era válido) |
| SPEC 09 | `RecuperacionService` (pedir) | `password.solicitar`, solo si la cuenta existe |
| SPEC 09, 10, 13 | `RecuperacionService` (restablecer, con el `tipo` del enlace) | `password.definir` |
| SPEC 16 | `RegistroVecinosService` (registrar y verificar) | `usuario.registrar`, `usuario.verificar_correo` |
| SPEC 23 | `ComentariosService` (crear y editar) | `comentario.crear`, `comentario.editar` |
| SPEC 24 | Servicio de adjuntos (subir y borrar) | `adjunto.subir`, `adjunto.borrar` |

La respuesta de `password.solicitar` sigue siendo la misma para un correo existente y uno inexistente (SPEC 09). Solo cambia lo que se registra por dentro.

### Cambio sobre SPEC 41: comentarios y adjuntos en la consulta

- `ticketNumero` también se completa para las entidades `comentario` y `adjunto`, a partir de `detalle.datos.ticketId`.
- El filtro `numero` también incluye los registros de `comentario` y `adjunto` cuyo `detalle.datos.ticketId` es el de esa queja. Así "todo lo que pasó en Q-…" aparece junto.
- Se agrega un índice de expresión para ese filtro, en una migración nueva:

```sql
-- backend/src/infrastructure/database/migrations/0035_bitacora_ticket_idx.ts
CREATE INDEX bitacora_ticket_datos_idx
  ON bitacora (((detalle -> 'datos' ->> 'ticketId')))
  WHERE entidad IN ('comentario', 'adjunto');
```

El `down` borra el índice.

### Frontend

- `locales/es/reportes.json` suma las etiquetas de las 12 acciones (por ejemplo, `sesion.fallar` → "Inicio de sesión fallido").
- `RegistroBitacora` (SPEC 41) muestra el `motivo` traducido de `sesion.fallar`, y para los comentarios, la marca "Nota interna" o "Público".
- El filtro por acción de `/bitacora` incluye las nuevas, porque salen de `GET /bitacora/acciones`.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: acciones de la bitácora
CLAUDE.md
backend/
  src/
    domain/auditoria/acciones.ts                     # 12 acciones nuevas
    domain/auditoria/auditoria.ts                    # registrarIndependiente
    application/services/
      auth.service.ts                                # SPEC 08
      recuperacion.service.ts                        # SPEC 09, 10, 13
      registro-vecinos.service.ts                    # SPEC 16
      comentarios.service.ts                         # SPEC 23
      adjuntos.service.ts                            # SPEC 24
    infrastructure/
      auditoria/knex-auditoria.ts                    # registrarIndependiente
      database/migrations/0035_bitacora_ticket_idx.ts
      repositories/knex-bitacora-lectura-repository.ts   # numero y ticketNumero (SPEC 41)
  tests/
    unit/auditoria/acciones.test.ts
    db/auditoria.test.ts                             # registrarIndependiente
    db/bitacora-autenticacion.test.ts
    db/bitacora-comentarios-adjuntos.test.ts
    db/bitacora.api.test.ts                          # filtro por número con comentarios
    db/schema.test.ts                                # 0035
frontend/
  src/
    features/reportes/bitacora/RegistroBitacora.tsx
    locales/es/reportes.json
  tests/
    features/reportes/bitacora-page.test.tsx
```

## Plan de implementación

1. Agregar las 12 acciones al catálogo, y `registrarIndependiente` al puerto y a `KnexAuditoria`. Ampliar `acciones.test.ts` y `tests/db/auditoria.test.ts`:
   - Las acciones nuevas cumplen el formato.
   - `registrarIndependiente` confirma aunque la transacción del llamador se revierta.
   - Con la base de la bitácora fallando, no lanza y escribe en el log.

   Verificación: `npm test` y `npm run test:db` pasan.
2. Integrar SPEC 08 (inicio y cierre de sesión). Crear `tests/db/bitacora-autenticacion.test.ts`. Casos:
   - Un inicio correcto deja `sesion.iniciar` con la IP.
   - Una contraseña incorrecta deja `sesion.fallar` con `motivo: 'password_incorrecta'` e `intentos`, y la respuesta sigue siendo `401`.
   - El quinto fallo deja `sesion.fallar` y `sesion.bloquear`.
   - Un intento sobre una cuenta bloqueada deja `sesion.fallar` con `cuenta_bloqueada` y responde `423`.
   - Un correo inexistente no deja nada.
   - Cerrar sesión deja `sesion.cerrar`.
   - La renovación del token no deja nada.
   - Ningún registro contiene la contraseña.
   - Todos tienen `dependencia_id` en `NULL`.

   Verificación: `npm run test:db` pasa, y `tests/db/auth.api.test.ts` sigue pasando.
3. Integrar SPEC 09, 10, 13 y 16. Ampliar `bitacora-autenticacion.test.ts`. Casos:
   - Pedir la recuperación de una cuenta existente deja `password.solicitar`. De una inexistente, nada, y la respuesta es la misma.
   - Restablecer con un enlace de recuperación deja `password.definir` con `tipo: 'recuperacion'`, y con una invitación, `tipo: 'invitacion'`, sin un `sesion.iniciar` extra.
   - Registrar un vecino nuevo deja `usuario.registrar`, con el DPI y el teléfono enmascarados. Registrar un correo existente no deja nada.
   - Verificar el correo deja `usuario.verificar_correo`.

   Verificación: `npm run test:db` pasa, y las pruebas de esas specs siguen pasando.
4. Integrar SPEC 23 y 24. Crear `tests/db/bitacora-comentarios-adjuntos.test.ts`. Casos:
   - Un comentario de 300 caracteres deja `comentario.crear` con `cuerpo` de 200 más `…`, `interno` y la dependencia de la queja.
   - Editarlo deja `comentario.editar` con `antes` y `despues`.
   - Un comentario del vecino lo registra como actor.
   - Subir un adjunto deja `adjunto.subir` con el nombre, el tipo y el tamaño. Borrarlo deja `adjunto.borrar`.
   - Descargar no deja nada.
   - Un comentario rechazado (`409 QUEJA_FINALIZADA`) no deja nada.

   Verificación: `npm run test:db` pasa.
5. Crear la migración `0035_bitacora_ticket_idx.ts`, y ampliar el filtro `numero` y `ticketNumero` en `KnexBitacoraLecturaRepository`. Ampliar `bitacora.api.test.ts` y `schema.test.ts`:
   - `numero=Q-…` devuelve las transiciones, los comentarios y los adjuntos de esa queja, con `ticketNumero`.
   - El coordinador ve los comentarios de su dependencia y no los eventos de autenticación.
   - El índice existe, y el `down` lo elimina.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
6. Frontend: agregar las 12 etiquetas a `reportes.json`, y el motivo y la marca de comentario en `RegistroBitacora`. Ampliar `bitacora-page.test.tsx`: las acciones nuevas aparecen traducidas en el filtro y en la lista, `sesion.fallar` muestra el motivo, y un comentario muestra "Nota interna". Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
7. Actualizar la sección 6 del documento de definición (la lista completa de acciones) y `CLAUDE.md`:
   - Las acciones de autenticación, comentarios y adjuntos.
   - Cuándo se usa `registrarIndependiente`.
   - Lo que no se registra (correos inexistentes, renovación de token y descargas).
   - Que con esta spec RF-42 queda completo.

   Verificación manual con el backend y `seed:dev`: se intenta entrar con `tecnico@vozmuni.test` y una contraseña incorrecta, después se entra bien, se deja un comentario de más de 200 caracteres y se edita. `supervisor@vozmuni.test` ve en `/bitacora` el fallo, el inicio de sesión y el comentario truncado con su edición. `coordinador@vozmuni.test` ve el comentario, pero no los eventos de sesión.

## Criterios de aceptación

- [ ] Las 12 acciones nuevas están en `ACCIONES_BITACORA` y cumplen el formato del `CHECK` de SPEC 41.
- [ ] Cada inicio de sesión correcto, cierre de sesión, pedido de recuperación de una cuenta existente, definición de contraseña (por recuperación o invitación), registro de un vecino nuevo y verificación de correo deja exactamente un registro, en la transacción de su caso de uso.
- [ ] Una contraseña incorrecta, o un intento sobre una cuenta bloqueada o inactiva, deja `sesion.fallar` con su motivo. El intento que bloquea la cuenta deja además `sesion.bloquear`. Los dos se escriben en su propia transacción, aunque la respuesta sea `401` o `423`.
- [ ] Si la escritura independiente falla, la respuesta del inicio de sesión no cambia y el error queda en el log.
- [ ] Los intentos con un correo inexistente, la renovación del token y las descargas de adjuntos no dejan registros.
- [ ] Los eventos de autenticación tienen `dependencia_id` en `NULL`: el coordinador no los ve, y el supervisor y el administrador sí.
- [ ] Crear un comentario guarda su texto truncado a 200 caracteres, y editarlo guarda el `antes` y el `despues` truncados, con la dependencia de la queja.
- [ ] Subir y borrar un adjunto dejan su registro con el nombre, el tipo, el tamaño y si es interno.
- [ ] Ningún registro contiene una contraseña, un token o un hash, y el DPI, el teléfono y el correo aparecen enmascarados.
- [ ] El filtro `numero` de `GET /api/v1/bitacora` devuelve también los comentarios y los adjuntos de esa queja, con `ticketNumero`.
- [ ] `/bitacora` muestra las acciones nuevas traducidas, el motivo de los fallos y la marca de los comentarios internos.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las acciones nuevas, la escritura independiente y lo que no se registra.

## Decisiones

- **Sí:** se registran el inicio de sesión (correcto, fallido y bloqueo), el cierre de sesión, la recuperación y definición de contraseñas, y el registro y la verificación de vecinos, como eligió el usuario. Con esto se completa RF-42.
- **No:** la renovación del token, por el volumen sin valor de auditoría.
- **Sí:** los eventos de autenticación son globales (`dependencia_id` en `NULL`). Solo los ven el supervisor y el administrador, porque son un tema de seguridad.
- **No:** mostrárselos al coordinador.
- **No:** registrar los intentos con un correo inexistente, como decidió el usuario. Se pierde visibilidad de la enumeración de correos, y queda registrado como riesgo.
- **Sí:** los eventos de fallo se escriben en una transacción propia, y un fallo de esa escritura no cambia la respuesta. Si la base no responde, el inicio de sesión tampoco funcionaría de todos modos.
- **No:** devolver `500` cuando falla la escritura.
- **Sí:** los comentarios guardan su texto truncado a 200 caracteres. La edición conserva el `antes`, que SPEC 23 no guarda en ningún otro lado.
- **No:** guardar solo los metadatos.
- **No:** registrar descargas, como eligió el usuario, ni de adjuntos internos.
- **Sí:** `sesion.fallar` y `sesion.bloquear` son eventos separados, para poder filtrar los bloqueos directamente. Es una propuesta de esta spec.
- **Sí:** `password.definir` cubre la recuperación y la invitación con un campo `tipo`, porque SPEC 10 y 13 reutilizan el flujo de SPEC 09.
- **Sí:** el filtro por número de queja incluye los comentarios y los adjuntos, con un índice de expresión, para ver todo lo que pasó en una queja junto.
- **Sí:** los nombres de las acciones y los motivos los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin registrar los correos inexistentes, un ataque de enumeración no deja rastro en la bitácora | El límite por IP de SPEC 08 frena los intentos. Agregarlo es cambiar una regla, si se decide después. |
| Una base caída hace que los fallos de inicio de sesión no queden registrados | Es la decisión elegida: el error queda en el log. El inicio de sesión tampoco funcionaría sin base. |
| El texto truncado de los comentarios puede tener datos personales escritos por el vecino | Solo lo ven los roles con `bitacora.ver` dentro de su alcance, y se trunca a 200 caracteres. La moderación queda para otra spec. |
| El volumen de `sesion.*` crece rápido | Hay índices por acción y por fecha (SPEC 41), y la consulta exige un rango acotado. |
| Toca servicios de SPEC 08 (Implementado), 09, 10, 13, 16, 23 y 24 | Cada paso vuelve a ejecutar las pruebas de esas specs. Se implementa después de SPEC 41. |

## Lo que **no** está en esta spec

- Intentos con correos inexistentes.
- Renovación de token y descargas.
- Enlaces inválidos o vencidos, y peticiones cortadas por el límite.
- Alertas de seguridad.

Cada uno de estos temas, cuando llegue, va en su propia spec.
