# SPEC 41 — Bitácora de auditoría: base, quejas y administración

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 08, SPEC 10, SPEC 13, SPEC 14, SPEC 15, SPEC 19, SPEC 20, SPEC 21, SPEC 22, SPEC 27, SPEC 29, SPEC 32, SPEC 33, SPEC 39, SPEC 40
> **Fecha:** 2026-10-23
> **Objetivo:** Registrar en la tabla inmutable `bitacora`, desde cada caso de uso y en su misma transacción, quién hizo qué acción sobre qué registro y cuándo, con los cambios saneados y la dependencia, para todas las acciones sobre quejas y de administración, y consultarla según `bitacora.ver` en `GET /api/v1/bitacora` y en la pantalla `/bitacora`.

## Por qué existe esta spec

RF-42 pide registrar en una bitácora inmutable quién hizo qué acción, sobre qué registro y cuándo. RNF-13 pide que no se pueda modificar ni borrar desde la aplicación, con una retención mínima de 5 años. La matriz de la sección 2 da "ver bitácora" al coordinador (su dependencia), al supervisor (todas) y al administrador (todas).
La tabla `bitacora` existe desde SPEC 03, con triggers que impiden `UPDATE`, `DELETE` y `TRUNCATE`, pero nadie escribe en ella. Varias specs dejaron su registro para RF-42: SPEC 29 (SLA), SPEC 40 (catálogos) y SPEC 10 (usuarios).

### División de RF-42

El usuario decidió dividir RF-42:

1. **Esta spec (41):** la base (puerto, migración, catálogo de acciones y saneamiento), la consulta (API y pantalla) y la integración de las acciones sobre quejas y de administración.
2. **La siguiente (42):** la autenticación (inicios de sesión correctos y fallidos, bloqueo, cierre de sesión, recuperación y registro de vecinos), los comentarios y los adjuntos. Tienen casos especiales: escrituras fuera de una transacción de negocio, y textos largos.

## Alcance

**Incluido:**

- Migración `0034_bitacora_alcance`:
  - Columna `bitacora.dependencia_id`.
  - `CHECK` del formato de `accion`.
  - Índices para la consulta.
- Catálogo de acciones (`domain/auditoria/acciones.ts`), con las de esta spec y las reservadas para SPEC 42.
- Saneamiento del detalle (`domain/auditoria/saneamiento.ts`):
  - Solo los campos que cambiaron, con su valor `antes` y `despues`.
  - Sin contraseñas ni tokens.
  - DPI, teléfono y correo enmascarados (RNF-12).
  - Textos de más de 200 caracteres truncados.
- Puerto `Auditoria.registrar(evento, trx)`. La IP sale de un contexto de solicitud (`AsyncLocalStorage`) que pone un middleware.
- Integración en cada caso de uso de quejas y de administración, en su transacción. Los jobs registran como actor `sistema`.
- Solo se registran las acciones realizadas, no los intentos rechazados (`403`, `409`).
- `GET /api/v1/bitacora` (filtros y cursor) y `GET /api/v1/bitacora/acciones`, según el alcance de `bitacora.ver`.
- Frontend: la pantalla `/bitacora`, de solo lectura, para el coordinador, el supervisor y el administrador.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- La autenticación, los comentarios y los adjuntos (SPEC 42).
- Los intentos rechazados (`403`, `409`) y los errores.
- Las alertas del 80 % (SPEC 31), la purga de notificaciones (SPEC 36) y los envíos de correo (SPEC 34). No cambian datos de negocio.
- Exportar la bitácora (RF-40).
- Archivar o purgar. La tabla es solo de inserción, y la retención de 5 años se cumple sin borrar nada.
- Detectar alteraciones directas en la base de datos (una cadena de hashes). Los triggers de SPEC 03 cubren lo que pide RNF-13: no modificarla desde la aplicación.
- Reconstruir el estado de un registro a partir de la bitácora.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0034_bitacora_alcance.ts`

```sql
ALTER TABLE bitacora
  ADD COLUMN dependencia_id bigint NULL REFERENCES dependencias (id) ON DELETE RESTRICT,
  ADD CONSTRAINT bitacora_accion_formato CHECK (accion ~ '^[a-z_]+\.[a-z_]+$');

CREATE INDEX bitacora_dependencia_creado_idx ON bitacora (dependencia_id, creado_en);
CREATE INDEX bitacora_usuario_creado_idx     ON bitacora (usuario_id, creado_en);
CREATE INDEX bitacora_accion_creado_idx      ON bitacora (accion, creado_en);
```

- `ALTER TABLE` no dispara los triggers de fila de SPEC 03. La tabla sigue siendo solo de inserción.
- El `down` borra los índices, el `CHECK` y la columna.

### Catálogo de acciones (`backend/src/domain/auditoria/acciones.ts`)

```ts
export const ACCIONES_BITACORA = {
  // Quejas (esta spec)
  'ticket.registrar':          { entidad: 'ticket' },     // SPEC 12 y 13
  'ticket.tomar':              { entidad: 'ticket' },     // SPEC 19
  'ticket.aceptar':            { entidad: 'ticket' },
  'ticket.rechazar':           { entidad: 'ticket' },
  'ticket.asignar':            { entidad: 'ticket' },     // SPEC 20 (asignar y reasignar)
  'ticket.iniciar':            { entidad: 'ticket' },     // SPEC 22
  'ticket.poner_en_espera':    { entidad: 'ticket' },
  'ticket.reanudar':           { entidad: 'ticket' },     // también por respuesta del vecino (SPEC 23)
  'ticket.resolver':           { entidad: 'ticket' },
  'ticket.confirmar':          { entidad: 'ticket' },     // SPEC 27
  'ticket.reabrir':            { entidad: 'ticket' },
  'ticket.trasladar':          { entidad: 'ticket' },     // SPEC 21 (aprobación o traslado directo)
  'ticket.escalar':            { entidad: 'ticket' },     // SPEC 32 (sistema)
  'ticket.cerrar_automatico':  { entidad: 'ticket' },     // SPEC 33 (sistema)
  'traslado.solicitar':        { entidad: 'traslado' },   // SPEC 21
  'traslado.rechazar':         { entidad: 'traslado' },
  'traslado.retirar':          { entidad: 'traslado' },
  'encuesta.registrar':        { entidad: 'encuesta' },   // SPEC 39
  // Administración (esta spec)
  'usuario.crear':             { entidad: 'usuario' },    // SPEC 10 y 13
  'usuario.editar':            { entidad: 'usuario' },
  'usuario.activar':           { entidad: 'usuario' },
  'usuario.desactivar':        { entidad: 'usuario' },
  'usuario.desbloquear':       { entidad: 'usuario' },
  'dependencia.crear':         { entidad: 'dependencia' },  // SPEC 40
  'dependencia.editar':        { entidad: 'dependencia' },
  'categoria.crear':           { entidad: 'categoria' },
  'categoria.editar':          { entidad: 'categoria' },
  'categoria.campos_extra':    { entidad: 'categoria' },  // SPEC 14
  'zona.crear':                { entidad: 'zona' },
  'zona.editar':               { entidad: 'zona' },
  'politica_sla.reemplazar':   { entidad: 'categoria' },  // SPEC 29
  'parametro.actualizar':      { entidad: 'parametro' },  // SPEC 15
  // Reservadas para SPEC 42: sesion.*, usuario.registrar, password.*, comentario.*, adjunto.*
} as const;

export type AccionBitacora = keyof typeof ACCIONES_BITACORA;
```

- Las acciones de usuarios corresponden a los endpoints de SPEC 10: crear (que también envía la invitación), editar, desactivar, activar y desbloquear. El alta en ventanilla (SPEC 13) se registra como `usuario.crear`.
- El catálogo es la única lista de acciones válidas. `Auditoria.registrar` rechaza las que no están en él.
- Activar y desactivar dependencias, categorías y zonas se registra como `*.editar`, con `activa` en `cambios`.

### Saneamiento (`backend/src/domain/auditoria/saneamiento.ts`)

```ts
export type Cambios = Record<string, { antes: unknown; despues: unknown }>;

// Compara dos instantáneas y devuelve solo los campos distintos.
export function calcularCambios(antes: Record<string, unknown> | null, despues: Record<string, unknown>): Cambios;

// Aplica las reglas de abajo, en profundidad, a cambios y datos.
export function sanearDetalle(detalle: { cambios?: Cambios; datos?: Record<string, unknown> }): DetalleBitacora;
```

| Regla | Campos | Resultado |
| --- | --- | --- |
| Se eliminan | `password`, `password_hash`, `passwordHash`, `token`, `token_hash`, `tokenHash`, `refreshToken` y cualquier clave que termine en `_hash` o `Hash` | La clave no aparece |
| Se enmascaran | `dpi` | Solo los 4 últimos dígitos (`*********0101`) |
| | `telefono` | `****0000` (el formato de SPEC 12) |
| | `email` y `correo` | `a***@dominio` (el formato de SPEC 12) |
| Se truncan | Cualquier `string` de más de 200 caracteres | Los primeros 200 seguidos de `…` |

- En `detalle.cambios` van los campos que cambiaron. En `detalle.datos` va el contexto que no es un cambio, como el motivo de una transición, el `plazo` de un escalamiento o la `calificacion` de una encuesta.
- El saneamiento siempre se aplica dentro de `Auditoria.registrar`, así que ningún caso de uso puede saltárselo.

### Puerto y contexto de solicitud

```ts
// backend/src/domain/auditoria/auditoria.ts
export interface EventoAuditoria {
  accion: AccionBitacora;
  entidadId: string | null;
  usuarioId: number | null;          // null = sistema (jobs)
  dependenciaId: number | null;
  cambios?: Cambios;
  datos?: Record<string, unknown>;
}

export interface Auditoria {
  // Inserta en `trx`. Valida la acción, sanea el detalle y toma la IP del contexto de solicitud.
  registrar(evento: EventoAuditoria, trx): Promise<void>;
}

// backend/src/domain/auditoria/contexto-solicitud.ts
export interface ContextoSolicitud {
  ip(): string | null;               // null fuera de una petición HTTP (jobs)
}
```

- `presentation/middlewares/contexto-solicitud.ts` ejecuta cada petición dentro de un `AsyncLocalStorage` con `req.ip`. `infrastructure/auditoria/contexto-solicitud-als.ts` lo lee.
- Así no cambian las firmas de los servicios. La regla `trust proxy` detrás de Nginx queda para la spec de despliegue (como en SPEC 08).
- `KnexAuditoria` implementa el puerto. La `entidad` sale del catálogo.
- Si la inserción falla, la transacción del caso de uso se revierte. No se acepta una acción sin registro.

### Dependencia de cada registro

| Entidad | `dependencia_id` |
| --- | --- |
| `ticket` | La dependencia de la queja después de la acción. Si queda en `NULL` (`ticket.trasladar` o `ticket.rechazar`), la de antes. Si nunca tuvo (`ticket.registrar`), `NULL` |
| `traslado` | `dependencia_origen_id` de la solicitud |
| `encuesta` | La dependencia de la queja |
| `usuario` | `usuarios.dependencia_id`, o `NULL` para los usuarios sin dependencia (vecinos, supervisor, administrador) |
| `dependencia` | Su propio id |
| `categoria` (incluidos el SLA y los campos adicionales) | La dependencia de la categoría después del cambio |
| `zona`, `parametro` | `NULL` |

### Puntos de registro

Cada caso de uso llama a `auditoria.registrar` después de aplicar el cambio y antes de confirmar su transacción. El evento lleva `cambios` con las columnas que cambiaron y `datos` con el contexto:

| Spec | Casos de uso | `datos` |
| --- | --- | --- |
| SPEC 12, 13 | Registrar una queja | `canal`, `categoriaId` |
| SPEC 19 | Tomar, aceptar, rechazar | `motivo` en el rechazo |
| SPEC 20 | Asignar, reasignar | `tecnicoAnterior`, `tecnicoNuevo` |
| SPEC 21 | Solicitar, rechazar y retirar un traslado; aprobar o trasladar directamente | `dependenciaSugeridaId`, `motivo` |
| SPEC 22 | Iniciar, poner en espera, reanudar, resolver | `motivo` o descripción, truncados |
| SPEC 23 | Reanudar por la respuesta del vecino | — (`ticket.reanudar`; el comentario en sí se registra con SPEC 42) |
| SPEC 27 | Confirmar, reabrir | `motivo` |
| SPEC 32 | Escalar (sistema) | `plazo` |
| SPEC 33 | Cerrar automáticamente (sistema) | `confirmacionVenceEn` |
| SPEC 39 | Registrar una encuesta | `calificacion` |
| SPEC 10, 13 | Crear, editar, activar, desactivar y desbloquear usuarios | — (el DPI, el teléfono y el correo, enmascarados en `cambios`) |
| SPEC 14 | Reemplazar los campos adicionales | `cantidadCampos` |
| SPEC 15 | Actualizar un parámetro | `clave` |
| SPEC 29 | Reemplazar la matriz de SLA | `cambios` por prioridad |
| SPEC 40 | Crear y editar dependencias, categorías y zonas | — |

Los nombres de los servicios son los que define cada spec.

### `GET /api/v1/bitacora`

Protegido por `autenticar` y `requierePermiso('bitacora.ver')`.

| Alcance de `bitacora.ver` | Filtro |
| --- | --- |
| `dependencia` (coordinador) | `dependencia_id = usuario.dependenciaId`. No ve las acciones globales (`dependencia_id` `NULL`) |
| `todas` (supervisor, administrador) | Sin filtro |

Query (Zod):

| Parámetro | Regla |
| --- | --- |
| `desde`, `hasta` | Fechas `YYYY-MM-DD`, interpretadas en `America/Guatemala`. `hasta` incluye el día completo, y el rango es de 92 días como máximo |
| `accion` | Repetible, cada valor del catálogo |
| `entidad` | Uno de los valores del catálogo |
| `usuarioId` | Entero |
| `numero` | Un número de queja (`Q-AAAA-NNNNNN`): filtra `entidad = 'ticket'` y `entidad_id` del ticket |
| `cursor` | Opaco, el `base64url` de `{ creadoEn, id }` |
| `tamano` | De 1 a 100, por defecto 50 |

- Orden: `creado_en DESC, id DESC`.
- Respuesta `200`: `{ datos: RegistroBitacoraDto[], siguienteCursor: string | null }`.
- Un parámetro inválido responde `400 VALIDACION`.

```ts
export interface RegistroBitacoraDto {
  id: number;
  creadoEn: string;                                         // ISO 8601 en UTC
  accion: AccionBitacora;
  entidad: string;
  entidadId: string | null;
  ticketNumero: string | null;                              // si entidad === 'ticket' o 'encuesta'
  usuario: { id: number; nombre: string; rol: Rol } | null; // null = sistema
  dependencia: { id: number; nombre: string } | null;
  ip: string | null;
  detalle: DetalleBitacora;                                 // ya saneado al escribir
}
```

`GET /api/v1/bitacora/acciones`, con la misma protección, devuelve las claves del catálogo con su entidad, para el filtro de la pantalla.

Lo implementan `BitacoraService` y `BitacoraLecturaRepository`, de solo lectura.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/bitacora` en `RUTAS_PROTEGIDAS`: `roles: ['coordinador', 'supervisor', 'administrador']`, `enMenu: true`, `etiqueta: 'comun:menu.bitacora'` |
| Página | `features/reportes/bitacora/BitacoraPage.tsx`. Filtros: rango de fechas (por defecto los últimos 7 días), acción (selector múltiple con las etiquetas traducidas), número de queja y usuario (se fija al hacer clic en un usuario de la lista, con un chip para quitarlo). Los filtros van en la URL |
| Lista | Cada registro muestra la fecha en `America/Guatemala`, el usuario (o "VozMuni" para el sistema), la acción traducida, la entidad con un enlace a `/tickets/:id` cuando es una queja, y la dependencia |
| Detalle | Al expandir: una tabla "Campo · Antes · Después" con `cambios`, los `datos` como pares clave y valor, y la IP. Los valores enmascarados se muestran tal cual |
| Paginación | "Ver más" con `siguienteCursor` |
| Vacío | "No hay registros para estos filtros" |
| Ubicación | `features/reportes/`, porque la bitácora es una consulta de control, como los reportes |
| Textos | `locales/es/reportes.json`, bajo `bitacora.*`, con una etiqueta por cada acción del catálogo |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: bitacora.dependencia_id, endpoints
CLAUDE.md
backend/
  src/
    app.ts                                             # middleware de contexto de solicitud
    container.ts
    domain/auditoria/acciones.ts
    domain/auditoria/saneamiento.ts
    domain/auditoria/auditoria.ts
    domain/auditoria/contexto-solicitud.ts
    domain/repositories/bitacora-lectura-repository.ts
    application/services/bitacora.service.ts
    application/services/*.service.ts                  # llamadas a auditoria.registrar (ver Puntos de registro)
    infrastructure/
      database/migrations/0034_bitacora_alcance.ts
      auditoria/knex-auditoria.ts
      auditoria/contexto-solicitud-als.ts
      repositories/knex-bitacora-lectura-repository.ts
    presentation/
      middlewares/contexto-solicitud.ts
      validators/bitacora.validators.ts
      controllers/bitacora.controller.ts
      routes/bitacora.routes.ts
  tests/
    unit/auditoria/saneamiento.test.ts
    unit/auditoria/acciones.test.ts
    unit/auditoria/bitacora.service.test.ts
    db/schema.test.ts                                  # 0034
    db/auditoria.test.ts                               # registrar, rollback, IP, inmutabilidad
    db/bitacora-integracion.test.ts                    # cada acción de esta spec deja su registro
    db/bitacora.api.test.ts                            # consulta y alcance
frontend/
  src/
    shared/auth/rutas.ts
    app/router.tsx
    features/reportes/api/bitacora-api.ts
    features/reportes/bitacora/BitacoraPage.tsx
    features/reportes/bitacora/RegistroBitacora.tsx
    locales/es/reportes.json  locales/es/comun.json
  tests/
    features/reportes/bitacora-page.test.tsx
    app/router.test.tsx
```

## Plan de implementación

1. Crear `domain/auditoria/acciones.ts` y `saneamiento.ts`, con sus pruebas. Casos:
   - `calcularCambios` devuelve solo los campos distintos.
   - Se eliminan `password_hash` y `tokenHash`, también anidados.
   - El DPI, el teléfono y el correo se enmascaran.
   - Un texto de 250 caracteres queda en 200 más `…`.
   - Todas las claves del catálogo cumplen el formato `^[a-z_]+\.[a-z_]+$`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0034_bitacora_alcance.ts` y ampliar `tests/db/schema.test.ts`:
   - Existen la columna, el `CHECK` y los 3 índices.
   - `accion = 'Ticket Aceptar'` es rechazada.
   - Los triggers de SPEC 03 siguen impidiendo `UPDATE`, `DELETE` y `TRUNCATE`.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Crear el puerto `Auditoria`, `ContextoSolicitud`, `KnexAuditoria`, `contexto-solicitud-als.ts` y el middleware, y registrar el middleware en `app.ts`. Crear `tests/db/auditoria.test.ts`. Casos:
   - Un registro dentro de una petición guarda la IP. Desde un job, guarda `NULL`.
   - Una acción fuera del catálogo lanza un error.
   - Si la transacción se revierte, no queda registro.
   - El detalle llega saneado.

   Verificación: `npm run test:db` pasa.
4. Integrar las acciones sobre quejas: SPEC 12, 13, 19, 20, 21, 22, 23, 27 y 39. Crear `tests/db/bitacora-integracion.test.ts`. En cada caso, la acción deja exactamente un registro con su `accion`, `entidad_id`, `usuario_id`, `dependencia_id` (según la tabla) y `cambios`. Un `409` (por ejemplo, una transición inválida) no deja registro. Verificación: `npm run test:db` pasa, y las pruebas de esas specs siguen pasando.
5. Integrar los jobs: el escalamiento (SPEC 32) y el cierre automático (SPEC 33), con `usuario_id` e `ip` en `NULL`. Ampliar `bitacora-integracion.test.ts`. Verificación: `npm run test:db` pasa.
6. Integrar la administración: SPEC 10, 13, 14, 15, 29 y 40. Ampliar `bitacora-integracion.test.ts`. Casos:
   - Editar un usuario deja el teléfono enmascarado en `cambios`.
   - Reemplazar el SLA deja los cambios por prioridad, con la dependencia de la categoría.
   - Desactivar una zona deja `activa` en `cambios`, con `dependencia_id` en `NULL`.

   Verificación: `npm run test:db` pasa.
7. Crear `BitacoraLecturaRepository`, `BitacoraService`, los validadores, el controlador y las rutas `GET /bitacora` y `/bitacora/acciones`. Crear `tests/db/bitacora.api.test.ts`. Casos:
   - El supervisor ve todos los registros. El coordinador solo los de su dependencia, sin los globales.
   - El técnico, el receptor y el vecino → `403`. Sin sesión → `401`.
   - Cada filtro funciona: las fechas en Guatemala, la acción, la entidad, el usuario y el número.
   - Un rango de 93 días → `400`.
   - El cursor no repite ni salta registros.
   - `ticketNumero` y `usuario: null` para el sistema son correctos.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Frontend: agregar `/bitacora` a `rutas.ts` y `router.tsx`, y crear `bitacora-api.ts`, `BitacoraPage.tsx` y `RegistroBitacora.tsx`. Crear `bitacora-page.test.tsx` y ampliar `router.test.tsx`. Casos:
   - Solo el coordinador, el supervisor y el administrador ven "Bitácora" en el menú.
   - Los filtros cambian la consulta y la URL.
   - Al expandir un registro se ve la tabla de cambios.
   - El sistema aparece como "VozMuni".
   - "Ver más" usa el cursor.
   - El enlace de una queja lleva a `/tickets/:id`.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
9. Actualizar la sección 6 del documento de definición (`bitacora.dependencia_id`, `GET /api/v1/bitacora` y `/acciones`) y `CLAUDE.md`:
   - Cada caso de uso de escritura llama a `auditoria.registrar` en su transacción.
   - El catálogo de acciones es la única lista válida.
   - El saneamiento.
   - La IP por `AsyncLocalStorage`.
   - El alcance por `dependencia_id`.
   - Lo que queda para SPEC 42.

   Verificación manual con el backend y `seed:dev`: `supervisor@vozmuni.test` acepta una queja de `Baches`, `coordinador@vozmuni.test` la asigna y `administrador@vozmuni.test` renombra una zona. En `/bitacora`, el supervisor ve las 3 acciones. El coordinador ve la aceptación y la asignación, pero no la zona. Al expandir la asignación se ven los técnicos.

## Criterios de aceptación

- [ ] La migración `0034_bitacora_alcance` agrega `bitacora.dependencia_id`, el `CHECK` del formato de `accion` y los 3 índices, y la tabla sigue siendo solo de inserción.
- [ ] Cada acción sobre quejas y de administración de la tabla de puntos de registro deja exactamente un registro en su misma transacción, con la acción, la entidad, el id, el usuario, la dependencia, la IP y el detalle.
- [ ] Una acción revertida, o rechazada con `403` o `409`, no deja registro. Un fallo al registrar revierte la acción.
- [ ] El escalamiento y el cierre automático quedan registrados con `usuario_id` e `ip` en `NULL`.
- [ ] El detalle solo guarda los campos que cambiaron, nunca contiene contraseñas, tokens ni hashes, enmascara el DPI, el teléfono y el correo, y trunca los textos a 200 caracteres.
- [ ] Solo se aceptan las acciones del catálogo `ACCIONES_BITACORA`.
- [ ] `GET /api/v1/bitacora` devuelve los registros del alcance de `bitacora.ver` (el coordinador solo su dependencia y sin los globales, y el supervisor y el administrador todos), con los filtros por fechas en Guatemala, acción, entidad, usuario y número de queja, paginados por cursor.
- [ ] El técnico, el receptor y el vecino reciben `403`, y un rango de fechas de más de 92 días responde `400`.
- [ ] La pantalla `/bitacora` aparece en el menú del coordinador, el supervisor y el administrador, filtra con la URL, muestra cada registro con la fecha en `America/Guatemala` y la acción traducida, y al expandirlo muestra los cambios.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol: el alcance sale de `bitacora.ver`.
- [ ] A 360 px de ancho, `/bitacora` no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan la columna, los endpoints, el catálogo, el saneamiento y la división de RF-42.

## Decisiones

- **Sí:** RF-42 se divide. Esta spec cubre la base, la consulta, las quejas y la administración. La autenticación, los comentarios y los adjuntos van en SPEC 42.
- **Sí:** cada caso de uso escribe la bitácora en su propia transacción, con un puerto `Auditoria`. Tiene el actor, la IP y el significado de la acción, y si se revierte no deja registro.
- **No:** triggers por tabla, que no conocen al actor ni el significado, ni un middleware HTTP, que no ve los jobs ni el resultado.
- **Sí:** se guardan los cambios `antes` y `despues`, saneados (sin secretos, con datos personales enmascarados y textos truncados), como pide RNF-12.
- **No:** guardar solo el estado final.
- **Sí:** la columna `dependencia_id` con la dependencia del momento. Así un traslado posterior no cambia lo que el coordinador ve del pasado.
- **No:** calcular la dependencia uniendo con la queja actual.
- **Sí:** solo se registran las acciones realizadas. Los intentos rechazados no.
- **Sí:** los jobs registran con actor `sistema` (`usuario_id` `NULL`). Las alertas, la purga y los correos no se registran, porque no cambian datos de negocio.
- **Sí:** la API y la pantalla `/bitacora`, de solo lectura, en `features/reportes/`.
- **Sí:** un fallo al escribir la bitácora revierte la acción. Una auditoría que puede perder registros no cumple RF-42.
- **Sí:** la IP sale de un contexto de solicitud con `AsyncLocalStorage`, que pone un middleware, en lugar de cambiar las firmas de unos 20 servicios. Es una propuesta de esta spec, y el puerto `ContextoSolicitud` mantiene el dominio libre de Express.
- **Sí:** un catálogo cerrado de acciones con el formato `entidad.verbo`, validado en el código y en la base, para que la consulta y las traducciones sean confiables.
- **Sí:** la retención de 5 años (RNF-13) se cumple sin purga. La tabla es solo de inserción.
- **No:** una cadena de hashes contra alteraciones directas en la base. Va más allá de RNF-13 ("desde la aplicación").
- **Sí:** el tope del rango (92 días), el tamaño de página (50, máximo 100), el largo de truncado (200) y los textos los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Toca los casos de uso de unas 15 specs, varias en Borrador | Se integra por bloques (quejas, jobs y administración), con una prueba por acción y las pruebas de cada spec sin cambios. Si una spec cambia antes, se revisa la tabla de puntos de registro. |
| Un caso de uso nuevo se olvida de registrar | `CLAUDE.md` lo vuelve obligatorio, y `bitacora-integracion.test.ts` cubre cada acción del catálogo. Una acción nueva sin prueba se nota en la revisión. |
| El saneamiento omite un campo sensible nuevo | Las reglas son por nombre de clave, incluidas las que terminan en `_hash`. Un campo nuevo con datos personales debe agregarse a la lista. |
| La tabla crece sin límite durante 5 años | Hay índices por fecha, por dependencia, por usuario y por acción, y la consulta exige un rango de 92 días como máximo. El particionado queda para cuando el volumen lo pida. |
| `AsyncLocalStorage` pierde el contexto en algún flujo asíncrono | El registro guarda `ip` en `NULL` en ese caso, sin fallar. El paso 3 prueba el caso normal. |
| La IP de los vecinos es un dato personal visible para el coordinador | Solo la ven los roles con `bitacora.ver`. Enmascararla queda como posible ajuste al revisar la spec. |

## Lo que **no** está en esta spec

- Autenticación, comentarios y adjuntos (SPEC 42).
- Intentos rechazados y errores.
- Alertas, purga de notificaciones y correos.
- Exportación, archivado y cadena de hashes.
- Reconstrucción de estados desde la bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
