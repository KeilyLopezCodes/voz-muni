# SPEC 12 — Registro de queja (API, sin adjuntos)

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 08, SPEC 09, SPEC 11
> **Fecha:** 2026-10-22
> **Objetivo:** Exponer `POST /api/v1/tickets` para que un vecino registre su queja, o un receptor o supervisor la registre a nombre de un vecino existente, con categoría, título, descripción, zona y dirección, asignando el número `Q-AAAA-NNNNNN`, guardando el historial inicial y enviando el número por correo.

## Por qué existe esta spec

RF-06 (registrar una queja) y RF-08 (número único que se muestra y se envía) son requerimientos **M** y la puerta de entrada de todo el ciclo de vida.
SPEC 04 dejó para esta spec la creación del ticket, el número y su primer historial. SPEC 02 registró como vacíos `tickets.titulo` y `tickets.descripcion` y el mecanismo del correlativo.
Esta spec cubre la API sin adjuntos. Los adjuntos (hasta 5 archivos, RNF-11) y el formulario del frontend van en specs propias. También adelanta la parte de RF-07 que registra a nombre de un vecino **existente**.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0012_registro_tickets`:
  - Columnas `tickets.titulo` y `tickets.descripcion`.
  - Tabla `correlativos`.
  - Plantilla `queja_registrada`.
- Dominio:
  - `Ticket.registrar()`, que valida los datos y devuelve el ticket en `nueva` con su historial de creación.
  - Formato del número.
  - Ampliación de `RegistroHistorial.estadoAnterior` a `EstadoTicket | null`, un cambio sobre SPEC 04.
- Correlativo anual sin huecos, generado en la misma transacción del ticket. El año se calcula en `America/Guatemala`.
- `POST /api/v1/tickets` para tres roles:
  - El vecino, para sí mismo, con canal `portal`.
  - El receptor y el supervisor, a nombre de un vecino existente, con canal `ventanilla`, `telefono`, `redes` o `correo`.
- `GET /api/v1/vecinos?email=|telefono=|dpi=`, para que el receptor y el supervisor encuentren al vecino, con los datos de contacto enmascarados.
- Validación de que la categoría esté activa y su dependencia también, de que la zona exista, y de que el solicitante sea un vecino activo.
- `tickets.registrado_por` lleno con el usuario que registra (SPEC 11).
- Correo `queja_registrada` al solicitante con el número, enviado después del commit, sin esperar.
- Actualización de los helpers de prueba de SPEC 03 y SPEC 11 que insertan tickets.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Adjuntos (hasta 5, validación de tipo y tamaño, almacenamiento) y su endpoint.
- Formulario del portal y pantalla de ventanilla en el frontend.
- Alta de un vecino **nuevo** en ventanilla (resto de RF-07).
- Campos adicionales por categoría (RF-09): `datos_extra` siempre es `'{}'`.
- Ubicación en mapa (RF-10): `lat` y `lng` siempre son `null`.
- Aviso de posibles duplicados (RF-11).
- Cálculo de `vence_respuesta` y `vence_resolucion` (spec de SLA). Quedan en `null`, porque la prioridad se define en la revisión.
- Límite de quejas por vecino.
- Notificaciones internas al supervisor (RF-32).
- Registro en `bitacora` (spec de RF-42).
- Consulta pública por número (RF-35) y listados (RF-36).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- `tickets`: se agregan `titulo` y `descripcion`.
- Tabla nueva `correlativos`.
- Endpoints: se agrega `GET /api/v1/vecinos` (Receptor, Supervisor). La fila `POST /api/v1/tickets` queda igual.

En la tabla de vacíos de SPEC 02, quedan resueltas la fila de RF-06 (`titulo` y `descripcion`) y la de RF-08 (el correlativo).

### `0012_registro_tickets`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `tickets` | `titulo` | text | NOT NULL, CHECK `char_length(titulo) BETWEEN 5 AND 150` |
| | `descripcion` | text | NOT NULL, CHECK `char_length(descripcion) BETWEEN 10 AND 4000` |
| `correlativos` | `anio` | smallint | PK, CHECK `BETWEEN 2000 AND 9999` |
| | `ultimo` | integer | NOT NULL, CHECK `BETWEEN 0 AND 999999` |

- Las dos columnas de `tickets` se agregan sin `DEFAULT`. La migración falla si ya existen tickets, y eso es aceptable porque ningún código crea tickets antes de esta spec.
- El `up` también inserta la plantilla `queja_registrada` en `plantillas_notificacion` (SPEC 09), con `ON CONFLICT (clave) DO NOTHING`.
- El `down` borra esa plantilla, la tabla `correlativos` y las dos columnas.
- Con esta spec el esquema pasa de 17 a 18 tablas.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `queja_registrada` | `VozMuni: recibimos tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{enlace}}` |

```text
Hola {{nombre}}:

Registramos tu queja "{{titulo}}" con el número {{numero}}.
Guarda este número: con él y tu correo o teléfono puedes consultar el avance en

{{enlace}}

Te avisaremos por correo cuando cambie de estado.
```

`{{enlace}}` es `APP_URL + '/consulta?numero=' + numero`. La ruta `/consulta` ya existe en el frontend (SPEC 06).

### Número (`domain/ticket/numero-ticket.ts`)

```ts
export const MAX_CORRELATIVO = 999_999;
// formatearNumero(2026, 123) === 'Q-2026-000123'; lanza ReglaDeNegocioError CORRELATIVO_AGOTADO si n > 999999
export function formatearNumero(anio: number, correlativo: number): string;
// Año calendario de `instante` en America/Guatemala (Intl.DateTimeFormat, sin dependencias npm).
export function anioGuatemala(instante: Date): number;
```

### Correlativo

`infrastructure/repositories/knex-correlativo-repository.ts`, dentro de la transacción del registro:

```sql
INSERT INTO correlativos (anio, ultimo) VALUES (?, 1)
ON CONFLICT (anio) DO UPDATE SET ultimo = correlativos.ultimo + 1
RETURNING ultimo
```

La fila del año queda bloqueada hasta el commit. Dos registros simultáneos reciben números consecutivos, y un rollback no deja huecos.

### Registro en el dominio (`domain/ticket/ticket.ts`)

```ts
export interface DatosRegistro {
  solicitanteId: number;
  registradoPor: number;
  categoriaId: number;
  zonaId: number;
  canal: Canal;               // 'portal' | 'ventanilla' | 'telefono' | 'redes' | 'correo' (SPEC 03)
  titulo: string;
  descripcion: string;
  direccion: string;
}
export interface TicketRegistrado {
  datos: DatosRegistro;       // con titulo, descripcion y direccion ya recortados
  estado: 'nueva';
  historial: Omit<RegistroHistorial, 'ticketId'>;   // estadoAnterior null, estadoNuevo 'nueva'
}
// Ticket.registrar(datos, ctx): TicketRegistrado
```

Validaciones de `registrar`, con los textos recortados:

| Campo | Regla | Código de `ReglaDeNegocioError` |
| --- | --- | --- |
| `titulo` | 5 a 150 caracteres | `TITULO_INVALIDO` |
| `descripcion` | 10 a 4000 caracteres | `DESCRIPCION_INVALIDA` |
| `direccion` | 5 a 300 caracteres | `DIRECCION_INVALIDA` |
| ids | enteros > 0 | `DATO_INVALIDO` |

El historial de creación lleva `usuarioId = ctx.actorId` (quien registra), `motivo = null` y `creadoEn = ctx.ahora`.

El repositorio inserta el ticket y obtiene su `id`, y después inserta el historial con ese `ticketId`. `TicketProps` y `Ticket.reconstituir()` de SPEC 04 no cambian.

**Cambio en SPEC 04:** `RegistroHistorial.estadoAnterior` pasa de `EstadoTicket` a `EstadoTicket | null`. Los métodos de transición siguen devolviendo siempre un estado anterior.

### `POST /api/v1/tickets`

Protegido por `autenticar` y `requierePermiso('tickets.crear')` (SPEC 08). El cuerpo depende del alcance del permiso:

| Alcance de `tickets.crear` | Rol | Cuerpo | Solicitante | `canal` |
| --- | --- | --- | --- | --- |
| `propia` | vecino | `{ categoriaId, zonaId, titulo, descripcion, direccion }` | el usuario autenticado | `portal` (fijo) |
| `a_nombre_de_vecino` | receptor | lo anterior + `{ solicitanteId, canal }` | `solicitanteId` | `ventanilla`, `telefono`, `redes` o `correo` |
| `todas` | supervisor | igual que el receptor | `solicitanteId` | igual que el receptor |

Reglas:

- Un vecino que envía `solicitanteId` o `canal` recibe `400 VALIDACION`. Un receptor o supervisor que los omite, o que envía `canal: 'portal'`, también.
- Cualquier campo extra, como `datosExtra`, `lat`, `lng`, `prioridad` o `estado`, responde `400 VALIDACION` (esquema Zod `strict`).
- `solicitanteId` debe ser un usuario activo con rol `vecino`. Si no, responde `400 SOLICITANTE_INVALIDO`.
- `categoriaId` debe existir con `activa = true` y su dependencia también con `activa = true`. Si no, responde `400 CATEGORIA_INVALIDA`.
- `zonaId` debe existir. Si no, responde `400 ZONA_INVALIDA`.
- `registrado_por` es el usuario autenticado. El vecino que registra para sí queda con `registrado_por = solicitante_id`.

Transacción, en este orden:

1. Se toma el siguiente correlativo del año en Guatemala y se forma el `numero`.
2. Se inserta el ticket: `estado = 'nueva'`, `dependencia_id`, `asignado_a`, `prioridad`, `lat`, `lng` y los vencimientos en `null`, `datos_extra = '{}'`, `escalado = false`.
3. Se inserta su historial de creación.

Después del commit:

- Responde `201` con `{ id, numero, estado: 'nueva', creadoEn }` y el encabezado `Location: /api/v1/tickets/<id>`.
- Si el solicitante tiene `email`, se envía `queja_registrada` sin esperar. Un fallo se registra en el log y no afecta la respuesta. Un vecino sin correo no recibe nada.

| Error | Status |
| --- | --- |
| `VALIDACION` | 400 |
| `TITULO_INVALIDO`, `DESCRIPCION_INVALIDA`, `DIRECCION_INVALIDA`, `DATO_INVALIDO`, `SOLICITANTE_INVALIDO`, `CATEGORIA_INVALIDA`, `ZONA_INVALIDA` | 400 |
| `NO_AUTENTICADO`, `TOKEN_INVALIDO` | 401 |
| `PERMISO_DENEGADO` (técnico, coordinador, administrador) | 403 |
| `CORRELATIVO_AGOTADO` | 500 |

### `GET /api/v1/vecinos`

Protegido por `autenticar` y `requierePermiso('tickets.crear')`. Además, el alcance debe ser `a_nombre_de_vecino` o `todas`; el vecino (`propia`) recibe `403 PERMISO_DENEGADO`.

- Query: **exactamente uno** de `email` (comparado en minúsculas), `telefono` o `dpi` (13 dígitos, se aceptan espacios). La coincidencia es exacta. Ninguno o más de uno responde `400 VALIDACION`.
- Busca solo usuarios activos con rol `vecino`.
- Respuesta `200`: `{ datos: VecinoEncontrado[] }`, con como máximo 10 resultados.

```ts
export interface VecinoEncontrado {
  id: number;
  nombre: string;
  email: string | null;      // enmascarado: 'a***@dominio.gt' (primer carácter + *** + @dominio)
  telefono: string | null;   // enmascarado: '****0000' (solo los 4 últimos dígitos)
}
// El DPI nunca se devuelve (RNF-12).
```

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6 y vacíos
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas /api/v1/tickets y /api/v1/vecinos
    container.ts                                       # repositorios y servicios nuevos
    domain/ticket/numero-ticket.ts
    domain/ticket/canal.ts                             # CANALES, Canal
    domain/ticket/ticket.ts                            # Ticket.registrar, DatosRegistro, TicketRegistrado
    domain/ticket/registro-historial.ts                # estadoAnterior: EstadoTicket | null
    domain/repositories/registro-ticket-repository.ts  # interfaz: registrar en transacción, devuelve id, numero, creadoEn
    domain/repositories/catalogo-lectura-repository.ts # categoría activa con dependencia activa, zona existente
    domain/repositories/vecino-repository.ts           # buscar por email/telefono/dpi, obtener activo
    application/dto/registro-ticket.dto.ts
    application/services/registro-tickets.service.ts
    application/services/vecinos.service.ts            # búsqueda con enmascarado
    infrastructure/
      repositories/knex-registro-ticket-repository.ts  # correlativo + ticket + historial en una transacción
      repositories/knex-catalogo-lectura-repository.ts
      repositories/knex-vecino-repository.ts
      database/migrations/0012_registro_tickets.ts
    presentation/
      validators/tickets.validators.ts
      validators/vecinos.validators.ts
      controllers/tickets.controller.ts
      controllers/vecinos.controller.ts
      routes/tickets.routes.ts
      routes/vecinos.routes.ts
      middlewares/manejador-errores.ts                 # códigos nuevos
  tests/
    unit/ticket/numero-ticket.test.ts
    unit/ticket/registrar.test.ts
    unit/ticket/consistencia.test.ts                   # sin cambios de comportamiento; compila con el tipo nuevo
    unit/tickets/registro-tickets.service.test.ts      # con repositorios y enviador falsos
    unit/tickets/vecinos.service.test.ts
    db/schema.test.ts                                  # columnas, correlativos, plantilla; helper insertTicket con titulo/descripcion
    db/alcance.test.ts                                 # fixture de SPEC 11 con titulo/descripcion
    db/registro-ticket.test.ts                         # correlativo y concurrencia
    db/tickets.api.test.ts                             # Supertest contra Postgres real, enviador falso
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con `tickets.titulo`, `tickets.descripcion`, la tabla `correlativos` y `GET /api/v1/vecinos`, y marcar como resueltas las filas de RF-06 y RF-08 en los vacíos de SPEC 02. Verificación: revisión del diff.
2. Crear `0012_registro_tickets.ts`. Actualizar el helper `insertTicket` de `schema.test.ts` y el fixture de `alcance.test.ts` (SPEC 11) para que inserten `titulo` y `descripcion`. Ampliar `schema.test.ts`:
   - Columnas nuevas y la tabla `correlativos`.
   - Un `titulo` de 4 caracteres es rechazado.
   - Una `descripcion` de 4001 caracteres es rechazada.
   - `correlativos.ultimo = 1000000` es rechazado.
   - Existe la plantilla `queja_registrada`.
   - El rollback completo contempla 18 tablas.

   Verificación: `npm run test:db` pasa.
3. Crear `numero-ticket.ts` y `canal.ts`, ampliar `RegistroHistorial.estadoAnterior` a `null` y agregar `Ticket.registrar()`. Crear `numero-ticket.test.ts` y `registrar.test.ts`. Casos:
   - `formatearNumero(2026, 123)` devuelve `Q-2026-000123`, y `1000000` lanza `CORRELATIVO_AGOTADO`.
   - `anioGuatemala(2027-01-01T05:59:59Z)` devuelve 2026, y `2027-01-01T06:00:00Z` devuelve 2027.
   - `registrar` recorta los textos, devuelve `estado = 'nueva'` y un historial con `estadoAnterior = null`, y rechaza cada límite de la tabla de validaciones.

   Verificación: `npm test` (incluidas las pruebas de SPEC 04) y `npm run lint:deps` pasan.
4. Crear las interfaces `RegistroTicketRepository` y `CatalogoLecturaRepository`, `knex-registro-ticket-repository.ts` y `knex-catalogo-lectura-repository.ts`. Crear `tests/db/registro-ticket.test.ts`. Casos:
   - El primer registro del año es `Q-2026-000001`, y el segundo, `-000002`.
   - 20 registros en paralelo reciben los números del 1 al 20 sin repetir.
   - Si falla el insert del historial, se revierte la transacción y el siguiente registro reutiliza el número (sin huecos).
   - Una categoría inactiva, una categoría con la dependencia inactiva y una zona inexistente se detectan.

   Verificación: `npm run test:db` pasa.
5. Crear `RegistroTicketsService` y `registro-tickets.service.test.ts` con falsos. Casos:
   - El vecino registra para sí con `canal = 'portal'` y `registrado_por = solicitante_id`.
   - El receptor registra a nombre de un vecino con `canal = 'ventanilla'` y `registrado_por` igual a su id.
   - Un `solicitanteId` que no es vecino, o que es un vecino inactivo, lanza `SOLICITANTE_INVALIDO`.
   - Se lanzan `CATEGORIA_INVALIDA` y `ZONA_INVALIDA` en sus casos.
   - El correo `queja_registrada` lleva el número y el enlace `APP_URL/consulta?numero=…`. Un vecino sin correo no recibe nada, y un fallo del enviador no cambia el resultado.

   Verificación: `npm test` y `npm run lint:deps` pasan.
6. Crear `VecinoRepository`, `knex-vecino-repository.ts`, `VecinosService` y `vecinos.service.test.ts`. Casos:
   - El enmascarado del correo y del teléfono.
   - El DPI nunca aparece en la respuesta.
   - Solo devuelve vecinos activos, como máximo 10.

   Verificación: `npm test` pasa.
7. Crear los validadores, controladores y rutas de `/api/v1/tickets` y `/api/v1/vecinos`, agregar los códigos al manejador de errores y conectar todo en `container.ts` y `app.ts`. Crear `tests/db/tickets.api.test.ts` con el enviador falso. Casos:
   - El vecino registra → `201`, con `Location`, `numero` con formato `Q-AAAA-NNNNNN`, una fila en `ticket_historial` con `estado_anterior` null, y el correo capturado.
   - El vecino envía `solicitanteId` → `400`.
   - El receptor registra a nombre de un vecino con `canal: 'telefono'` → `201`, con `registrado_por` del receptor.
   - El receptor sin `canal`, o con `canal: 'portal'` → `400`.
   - El técnico → `403`.
   - Sin token → `401`.
   - Con `datosExtra` → `400`.
   - Con una categoría inactiva → `400 CATEGORIA_INVALIDA`.
   - `GET /vecinos?email=` como receptor → `200` con datos enmascarados; como vecino → `403`; con `email` y `telefono` a la vez → `400`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Actualizar `CLAUDE.md`: el endpoint de registro y quién puede usarlo, el formato y el origen del número (tabla `correlativos`, año en Guatemala), y que `registrado_por` siempre es el usuario autenticado. Verificación manual con Ethereal y los usuarios de `seed:dev` (SPEC 05 y 08): `vecino@vozmuni.test` registra una queja con `POST /api/v1/tickets`, recibe `Q-2026-000001`, y el correo `queja_registrada` aparece en Ethereal.

## Criterios de aceptación

- [x] La sección 6 del documento de definición incluye `tickets.titulo`, `tickets.descripcion`, `correlativos` y `GET /api/v1/vecinos`, y los vacíos de RF-06 y RF-08 figuran como resueltos.
- [x] `npm run migrate:latest` crea las columnas, la tabla `correlativos` y la plantilla `queja_registrada`, y un rollback completo no deja ninguna de las 18 tablas.
- [x] Un vecino autenticado registra una queja con `POST /api/v1/tickets` y recibe `201` con `id`, `numero`, `estado: 'nueva'`, `creadoEn` y el encabezado `Location`.
- [x] El ticket creado tiene `solicitante_id` y `registrado_por` iguales al vecino, `canal = 'portal'`, `datos_extra = '{}'`, `escalado = false`, y `dependencia_id`, `asignado_a`, `prioridad`, `lat`, `lng` y los vencimientos en `null`.
- [x] Cada registro escribe una fila en `ticket_historial` con `estado_anterior = null`, `estado_nuevo = 'nueva'` y `usuario_id` igual a quien registra.
- [x] El primer número de cada año es `Q-AAAA-000001`, y 20 registros simultáneos reciben 20 números consecutivos distintos.
- [x] Un registro que falla después de tomar el número no deja huecos: el siguiente registro usa ese número.
- [x] Una queja registrada el 31 de diciembre de 2026 a las 23:30 hora de Guatemala recibe un número `Q-2026-…`.
- [x] Un receptor y un supervisor registran a nombre de un vecino activo existente con un canal distinto de `portal`, y el ticket queda con `registrado_por` igual a su id.
- [x] Técnico, coordinador y administrador reciben `403 PERMISO_DENEGADO` al registrar.
- [x] El título (5–150), la descripción (10–4000) y la dirección (5–300) se validan sobre el texto recortado y se guardan recortados.
- [x] Una categoría inactiva, o cuya dependencia está inactiva, responde `400 CATEGORIA_INVALIDA`, y una zona inexistente responde `400 ZONA_INVALIDA`.
- [x] Un `solicitanteId` que no es un vecino activo responde `400 SOLICITANTE_INVALIDO`.
- [x] Un cuerpo con `datosExtra`, `lat`, `lng`, `prioridad` o `estado` responde `400 VALIDACION`.
- [x] El solicitante con correo recibe `queja_registrada` con su número y el enlace `APP_URL/consulta?numero=<numero>`. Un fallo del envío no impide el `201`.
- [x] `GET /api/v1/vecinos` encuentra por correo, teléfono o DPI exactos solo a vecinos activos, enmascara el correo y el teléfono, nunca devuelve el DPI, y responde `403` al vecino.
- [x] Las pruebas de SPEC 04 siguen pasando con `estadoAnterior: EstadoTicket | null`.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta el endpoint de registro, el correlativo y la regla de `registrado_por`.

## Decisiones

- **Sí:** esta spec cubre la API sin adjuntos. Los adjuntos (RNF-11, almacenamiento) y el formulario del frontend van en specs propias.
- **No:** API con adjuntos, ni todo junto con la pantalla.
- **Sí:** correlativo con la tabla `correlativos (anio, ultimo)` e `INSERT … ON CONFLICT DO UPDATE … RETURNING`, en la misma transacción del ticket. No deja huecos y es seguro con concurrencia.
- **No:** una `SEQUENCE` por año, ni `MAX(numero) + 1`.
- **Sí:** el año del número se calcula en `America/Guatemala`, que es el año que ve el vecino (RNF-23).
- **No:** UTC.
- **Sí:** título de 5 a 150 caracteres y descripción de 10 a 4000, validados en el dominio, en Zod y con `CHECK` en la base, como eligió el usuario. Es una excepción a la decisión de SPEC 03 de no poner reglas de negocio en la base, justificada porque son límites de tamaño de los datos y no reglas configurables.
- **Sí:** la dirección de 5 a 300 caracteres es una propuesta de esta spec, validada solo en el dominio.
- **Sí:** `lat` y `lng` quedan en `null` y `datos_extra` en `'{}'`. Las specs de RF-10 y RF-09 definen su validación. Si llegan en el cuerpo, se rechazan para no guardar datos sin validar.
- **Sí:** la categoría debe estar activa y su dependencia también, y la zona debe existir.
- **No:** aceptar categorías desactivadas.
- **Sí:** `Ticket.registrar()` en el dominio. La regla "nace en `nueva` con su historial de creación" vive con el resto del ciclo de vida. Requiere **ampliar `RegistroHistorial.estadoAnterior` de SPEC 04** a `EstadoTicket | null`.
- **No:** crear el ticket solo en el servicio de aplicación.
- **Sí:** `Ticket.registrar()` devuelve `TicketRegistrado` sin `id`. El id lo asigna la base, y `TicketProps` y `reconstituir()` de SPEC 04 no cambian.
- **Sí:** el correo `queja_registrada` va en esta spec, porque cierra RF-08 ("lo muestra y envía"). Se envía después del commit sin esperar, como en SPEC 09: la queja no depende del correo.
- **No:** esperar a la spec de RF-31.
- **Sí:** sin límite de quejas por vecino en esta spec.
- **Sí:** el receptor y el supervisor registran a nombre de un vecino **existente**, como eligió el usuario. Adelanta la parte de RF-07 que no requiere crear vecinos. El alta de vecinos nuevos en ventanilla queda para RF-07.
- **Sí:** el supervisor registra igual que el receptor (`todas` incluye `a_nombre_de_vecino`), y no registra quejas propias por el portal.
- **Sí:** `canal = 'portal'` está reservado para el vecino que registra para sí. Los registros internos usan `ventanilla`, `telefono`, `redes` o `correo`.
- **Sí:** `GET /api/v1/vecinos` con búsqueda exacta por correo, teléfono o DPI, y contacto enmascarado. Sin él, el receptor no tiene cómo conocer el id del vecino. El DPI nunca se devuelve (RNF-12).
- **No:** identificar al vecino dentro del mismo `POST`, ni dejar la búsqueda fuera.
- **Sí:** el formato del enmascarado (`a***@dominio`, `****0000`), el máximo de 10 resultados, los códigos de error y el texto de la plantilla los propone esta spec. El usuario puede ajustarlos al revisarla.
- **Sí:** los vencimientos de SLA quedan en `null`. Se calculan cuando hay prioridad (RF-12, RF-26).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Agregar `titulo` y `descripcion` como `NOT NULL` sin valor por defecto falla en una base con tickets | Ningún código crea tickets antes de esta spec. Si una base de desarrollo tiene tickets de prueba, se recrea con `docker compose down -v`. |
| El fixture de SPEC 11 y los helpers de SPEC 03 dejan de funcionar al exigir `titulo` y `descripcion` | El paso 2 los actualiza en el mismo cambio. |
| La fila de `correlativos` del año se vuelve un punto de contención con muchos registros simultáneos | El bloqueo dura solo la transacción del registro, de milisegundos. RNF-01 pide 100 usuarios concurrentes, y una sola fila lo soporta. |
| Superar 999 999 quejas en un año | Se lanza `CORRELATIVO_AGOTADO` (500) en vez de generar un número inválido. Si alguna municipalidad lo alcanza, el formato cambia en una spec propia. |
| La búsqueda de vecinos permite a un receptor comprobar si un correo o un DPI está registrado | Es necesario para su trabajo. El endpoint exige `a_nombre_de_vecino` o `todas`, y queda en la bitácora cuando llegue RF-42. |
| Esta spec depende de cuatro specs en Borrador (04 está implementada; 08, 09 y 11 no) | Se implementa después de ellas. Si cambian, se revisa esta antes de aprobarla. |
| El enlace `/consulta?numero=` lleva a una página que todavía no consulta nada | La página existe (SPEC 06) como placeholder. RF-35 la completa. |

## Lo que **no** está en esta spec

- Adjuntos y su almacenamiento.
- Formularios del frontend.
- Alta de vecinos nuevos en ventanilla.
- Campos adicionales, mapa y aviso de duplicados.
- Cálculo de vencimientos de SLA.
- Notificaciones internas y bitácora.
- Consulta pública y listados.

Cada uno de estos temas, cuando llegue, va en su propia spec.
