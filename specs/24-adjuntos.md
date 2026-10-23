# SPEC 24 — Adjuntos: archivos del registro y evidencias de la atención

> **Estado:** Borrador
> **Depende de:** SPEC 08, SPEC 11, SPEC 12, SPEC 17, SPEC 18, SPEC 19, SPEC 20, SPEC 22, SPEC 23
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir adjuntar a una queja hasta 5 archivos al registrarla y hasta 5 evidencias internas durante la atención, validados por contenido según RNF-11 (PDF, JPG, PNG o DOCX de hasta 10 MB), guardados en disco tras una interfaz de almacenamiento, descargables solo por quien puede ver la queja y borrables por su autor durante 5 minutos.

## Por qué existe esta spec

- **RF-06 (M):** el vecino registra su queja con "hasta 5 archivos adjuntos". El formulario de SPEC 18 registra sin archivos, a la espera de esta spec.
- **RF-20 (M):** el técnico adjunta evidencias de la atención.

Los dos requerimientos comparten la tabla `adjuntos` (SPEC 03), el endpoint del documento (`POST /api/v1/tickets/:id/adjuntos`) y las reglas de RNF-11, así que van en una sola spec. Es también la primera vez que el sistema guarda archivos, y por eso introduce el puerto de almacenamiento de `infrastructure/storage/`.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0020_adjuntos`: columnas `subido_por`, `creado_en`, `interno` y `origen`, con sus `CHECK`.
- Puerto `AlmacenArchivos` en `domain/` y un adaptador de disco en `infrastructure/storage/`, configurado con `ADJUNTOS_DIR`.
- Validación por firma de bytes y extensión: PDF, JPG, PNG o DOCX, de hasta 10 MB.
- `POST /api/v1/tickets/:id/adjuntos` (multipart, hasta 5 archivos por petición, todo o nada). Hay dos orígenes:
  - **Registro:** lo suben el solicitante o quien registró la queja, solo mientras la queja está en `nueva`. Son siempre públicos, y el máximo es 5 por queja.
  - **Atención:** lo suben los usuarios internos con permiso de comentar. Pueden ser públicos o internos, con un máximo de 5 por queja. En quejas finales solo se aceptan internos.
- `GET /api/v1/tickets/:id/adjuntos` (la lista) y `GET …/:adjuntoId/contenido` (la descarga). Las dos verifican el alcance y la visibilidad.
- `DELETE /api/v1/tickets/:id/adjuntos/:adjuntoId`: lo hace el autor durante 5 minutos, y borra la fila y el archivo.
- Frontend:
  - **Formulario de queja (SPEC 18):** selector de hasta 5 archivos, que se suben después de crear la queja, con reintento desde la pantalla de éxito.
  - **Paneles de `/triage`, `/asignacion` y `/atencion`:** componente `AdjuntosTicket`, con la lista, la descarga, la subida de evidencias (pública o interna) y el borrado durante 5 minutos.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Adaptador S3 y URL firmadas.
- Antivirus.
- Miniaturas, compresión y corrección de orientación de fotos.
- Adjuntos ligados a un comentario (`adjuntos.comentario_id` queda en `null`).
- Adjuntos del vecino después del registro: para responder en `en_espera` usa comentarios (SPEC 23).
- Pantalla del vecino para ver sus adjuntos (detalle de "Mis quejas", RF-25).
- Respaldo de `ADJUNTOS_DIR` (RNF-06, spec de despliegue).
- Borrado administrativo por datos sensibles.
- Bitácora (RF-42).

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento:

- `adjuntos`: se agregan `subido_por`, `creado_en`, `interno` y `origen`.
- Endpoints:
  - La fila `POST /api/v1/tickets/:id/adjuntos` documenta el multipart y los dos orígenes.
  - Se agregan `GET /api/v1/tickets/:id/adjuntos`, `GET …/:adjuntoId/contenido` y `DELETE …/:adjuntoId`.

### `0020_adjuntos`

| Columna nueva en `adjuntos` | Tipo | Restricciones |
| --- | --- | --- |
| `subido_por` | bigint | NOT NULL, FK `usuarios` ON DELETE RESTRICT |
| `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `interno` | boolean | NOT NULL, DEFAULT false |
| `origen` | text | NOT NULL, CHECK `IN ('registro', 'atencion')` |

`CHECK`s nuevos:

- `adjuntos_registro_publico`: `NOT (origen = 'registro' AND interno)`.
- `adjuntos_tamano_maximo`: `tamano_bytes <= 10485760`.
- `adjuntos_nombre_largo`: `char_length(nombre) BETWEEN 1 AND 255`.
- `UNIQUE (ruta)`.

Notas:

- Las columnas se agregan sin valor por defecto para `subido_por` y `origen`, así que la migración falla si ya existen adjuntos. Ningún código los crea antes de esta spec.
- El `down` borra los `CHECK`, el `UNIQUE` y las 4 columnas.
- No hay tablas nuevas: el esquema sigue en 21.

### Almacenamiento (`domain/adjuntos/almacen-archivos.ts`)

```ts
export interface AlmacenArchivos {
  guardar(contenido: Buffer): Promise<string>;   // devuelve la ruta relativa generada (UUID v4, sin extensión del usuario)
  leer(ruta: string): Promise<NodeJS.ReadableStream>;
  borrar(ruta: string): Promise<void>;           // idempotente
}
```

> `Buffer` y `NodeJS.ReadableStream` son tipos de Node, no un paquete npm, así que el dominio no importa nada de `node_modules` (regla `domain-no-npm` de SPEC 01).

El adaptador `infrastructure/storage/disco-almacen-archivos.ts`:

- Guarda en `ADJUNTOS_DIR/<aa>/<uuid>`, donde `aa` son los dos primeros caracteres del UUID, para no tener una sola carpeta enorme.
- Al leer o borrar, rechaza cualquier ruta que no coincida con `^[0-9a-f]{2}/[0-9a-f-]{36}$`. Así no se pueden recorrer otras carpetas.
- Escribe primero en un archivo temporal y lo renombra después. Un fallo a mitad de la escritura no deja un archivo parcial.

Variable de entorno nueva: `ADJUNTOS_DIR` (obligatoria; en `.env.example`, `./almacen/adjuntos`, carpeta que git ignora). El backend la crea al arrancar si no existe.

### Validación (`domain/adjuntos/tipo-archivo.ts`)

```ts
export const TAMANO_MAXIMO = 10 * 1024 * 1024;   // RNF-11
export const TIPOS_PERMITIDOS = ['pdf', 'jpg', 'png', 'docx'] as const;

// Detecta el tipo por los primeros bytes y lo cruza con la extensión del nombre.
// Devuelve el MIME a guardar, o lanza ReglaDeNegocioError ADJUNTO_INVALIDO con el motivo.
export function validarArchivo(nombre: string, cabecera: Uint8Array, tamano: number): { mime: string };
```

| Tipo | Extensiones aceptadas | Firma | MIME guardado |
| --- | --- | --- | --- |
| PDF | `.pdf` | `25 50 44 46 2D` (`%PDF-`) | `application/pdf` |
| JPG | `.jpg`, `.jpeg` | `FF D8 FF` | `image/jpeg` |
| PNG | `.png` | `89 50 4E 47 0D 0A 1A 0A` | `image/png` |
| DOCX | `.docx` | `50 4B 03 04`, más la entrada `[Content_Types].xml` con `wordprocessingml` en el ZIP | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |

Motivos de `ADJUNTO_INVALIDO`, en `detalles[].problema`: `TIPO_NO_PERMITIDO`, `CONTENIDO_NO_COINCIDE`, `MUY_GRANDE`, `VACIO` y `NOMBRE_INVALIDO`.

- El MIME que envía el navegador se ignora.
- El nombre original se guarda limpio: sin rutas y sin caracteres de control, con un máximo de 255 caracteres. Solo se usa para mostrarlo y para `Content-Disposition`.
- La verificación de DOCX abre el ZIP en memoria con una librería de lectura de ZIP de `infrastructure/`, inyectada al validador por una interfaz. El dominio sigue sin dependencias.

### Orígenes, permisos y límites (`domain/adjuntos/reglas-adjuntos.ts`)

| Origen | Quién sube | Cuándo | `interno` | Límite por queja |
| --- | --- | --- | --- | --- |
| `registro` | el solicitante, o el usuario de `registrado_por` (receptor o supervisor en ventanilla) | solo si la queja está en `nueva` | siempre `false` | 5 |
| `atencion` | usuarios con `comentarios.publico` (públicos) o `comentarios.interno` (internos), dentro del alcance de `tickets.ver` y que **no** sean el solicitante | cualquier estado no final. En `rechazada` o `cerrada` solo internos | elegido, `false` por defecto | 5 |

Reglas:

- El origen lo decide el backend, no el cliente. Si quien sube es el solicitante o el que registró, y la queja está en `nueva`, el origen es `registro`. Si no, es `atencion`.
- El solicitante (vecino) fuera de `nueva` recibe `409 ADJUNTOS_CERRADOS`.
- Un usuario sin el permiso del tipo elegido recibe `403`.
- Los límites se cuentan por origen, dentro de la transacción y con `SELECT … FOR UPDATE` sobre el ticket. Si la petición excede el cupo, responde `409 LIMITE_ADJUNTOS` (con el cupo restante en `detalles`) y no guarda nada.
- Un adjunto interno nunca aparece en la lista ni se descarga para quien no tiene `comentarios.interno`. Se filtra en la consulta.

### `POST /api/v1/tickets/:id/adjuntos`

Protegido por `autenticar`. Es `multipart/form-data`:

- El campo `archivos` admite de 1 a 5 archivos.
- El campo `interno` es `'true'` o `'false'`, solo en el origen `atencion`. En el origen `registro`, `interno='true'` responde `400 VALIDACION`.
- Multer usa `memoryStorage`, con `limits: { fileSize: 10 MB, files: 5 }`. Un archivo de más de 10 MB responde `400 ADJUNTO_INVALIDO` (`MUY_GRANDE`) sin terminar de leerse.

Pasos, con todos los archivos validados antes de guardar:

1. Se lee el ticket con `FOR UPDATE` y el filtro de `tickets.ver` (SPEC 11). Fuera de alcance responde `404`.
2. Se determina el origen y se aplican las reglas y los límites.
3. Se valida cada archivo. Si alguno falla, responde `400 ADJUNTO_INVALIDO` con un detalle por archivo, y no se guarda ninguno.
4. Se guarda cada contenido en `AlmacenArchivos` y se inserta su fila. Si algo falla después de escribir archivos, se borran los ya escritos y la transacción se revierte.

Responde `201 { adjuntos: AdjuntoDto[] }`.

### Lista, descarga y borrado

| Método y ruta | Permiso | Respuesta |
| --- | --- | --- |
| `GET /api/v1/tickets/:id/adjuntos` | `tickets.ver` (SPEC 11), y los internos solo con `comentarios.interno` | `200 { datos: AdjuntoDto[] }`, ordenado por `creado_en ASC` |
| `GET /api/v1/tickets/:id/adjuntos/:adjuntoId/contenido` | lo mismo | `200` con el archivo como stream. `Content-Type` es el MIME guardado. `Content-Disposition` es `inline` para JPG y PNG, y `attachment` para PDF y DOCX, con `filename*` en UTF-8. Incluye `X-Content-Type-Options: nosniff` y `Cache-Control: private, no-store` |
| `DELETE /api/v1/tickets/:id/adjuntos/:adjuntoId` | autor (`subido_por`) dentro del alcance; si no, `404` | Si pasaron más de 5 minutos desde `creado_en`, responde `409 EDICION_VENCIDA` (el código de SPEC 23). Si no, borra la fila y luego el archivo, y responde `204`. Si borrar el archivo falla, se registra en el log y la fila igual se borra |

```ts
export interface AdjuntoDto {
  id: number;
  nombre: string;
  mime: string;
  tamanoBytes: number;
  interno: boolean;
  origen: 'registro' | 'atencion';
  subidoPor: { id: number; nombre: string; rol: Rol };
  creadoEn: string;
  borrable: boolean;   // true si el usuario es el autor y no pasaron 5 min
}
```

Un adjunto que no pertenece al `:id` del ticket responde `404`. Códigos nuevos en el manejador: `ADJUNTO_INVALIDO` (400), `ADJUNTOS_CERRADOS` (409) y `LIMITE_ADJUNTOS` (409).

### Frontend

| Elemento | Detalle |
| --- | --- |
| Formulario de queja (SPEC 18) | En el paso Descripción, un selector "Agregar fotos o documentos" (`accept=".pdf,.jpg,.jpeg,.png,.docx"`, `capture` permitido en celular), de 1 a 5 archivos, con nombre, tamaño y "Quitar". Se valida en el cliente el tipo por extensión y el tamaño de 10 MB, y el backend vuelve a validar por contenido. Los archivos se listan en el resumen. Después de `POST /tickets`, se suben con `POST /adjuntos` |
| Pantalla de éxito (SPEC 18) | Si la subida falló, muestra "La queja se registró, pero no pudimos subir los archivos" y un botón "Reintentar", que solo funciona mientras la queja siga en `nueva`, sin volver a crear la queja |
| `AdjuntosTicket` (`features/tickets/adjuntos/`) | En `PanelTriage`, `PanelAsignacion` y `PanelAtencion`: lista con el ícono por tipo, el nombre, el tamaño, el autor, la marca "Interno" con texto, "Descargar" (y "Ver" para imágenes), y "Borrar" solo si `borrable`. Debajo, "Subir evidencia", con un selector "Público" / "Interno" (por defecto "Interno") y el cupo restante ("3 de 5") |
| Errores | `LIMITE_ADJUNTOS` muestra el cupo. `ADJUNTO_INVALIDO` muestra el problema por archivo. `ADJUNTOS_CERRADOS` muestra "Ya no se pueden agregar archivos al registro" |
| Textos | `locales/es/tickets.json` |

El cliente HTTP de SPEC 06 solo envía JSON, así que se agrega `apiClient.postForm(path, formData)`, que no fija `Content-Type`. También `apiClient.descargar(path)`, que devuelve un `Blob` con el token, para "Descargar" y "Ver". Las dos reutilizan `X-Request-Id`, el token y el reintento ante `401` (SPEC 17).

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
.gitignore                                             # backend/almacen/
backend/
  package.json                                         # multer (+ @types/multer), lector de ZIP (p. ej. yauzl + @types/yauzl)
  .env.example                                         # ADJUNTOS_DIR
  src/
    app.ts  container.ts
    infrastructure/config/env.ts                       # ADJUNTOS_DIR
    domain/adjuntos/almacen-archivos.ts
    domain/adjuntos/tipo-archivo.ts
    domain/adjuntos/reglas-adjuntos.ts
    domain/adjuntos/inspector-docx.ts                  # interfaz: ¿el ZIP es un DOCX?
    domain/repositories/adjunto-repository.ts
    application/services/adjuntos.service.ts           # subir, listar, descargar, borrar
    infrastructure/
      storage/disco-almacen-archivos.ts
      storage/zip-inspector-docx.ts
      repositories/knex-adjunto-repository.ts
      database/migrations/0020_adjuntos.ts
    presentation/
      middlewares/subida-adjuntos.ts                   # Multer con límites
      validators/adjuntos.validators.ts
      controllers/adjuntos.controller.ts
      routes/adjuntos.routes.ts
      middlewares/manejador-errores.ts                 # 3 códigos nuevos; MulterError → ADJUNTO_INVALIDO
  tests/
    unit/adjuntos/tipo-archivo.test.ts
    unit/adjuntos/reglas-adjuntos.test.ts
    unit/adjuntos/disco-almacen-archivos.test.ts       # carpeta temporal
    unit/adjuntos/adjuntos.service.test.ts
    fixtures/archivos/                                 # pdf, jpg, png, docx, exe renombrado, zip no docx
    db/schema.test.ts                                  # columnas y CHECK
    db/adjuntos.api.test.ts                            # Supertest contra Postgres real y carpeta temporal
frontend/
  src/
    shared/api/http-client.ts                          # postForm, descargar
    features/tickets/api/adjuntos-api.ts
    features/tickets/adjuntos/AdjuntosTicket.tsx
    features/tickets/registro/PasoDescripcion.tsx      # selector de archivos (SPEC 18)
    features/tickets/registro/PasoResumen.tsx
    features/tickets/registro/ExitoRegistro.tsx        # reintento
    features/tickets/triage/PanelTriage.tsx  features/tickets/asignacion/PanelAsignacion.tsx  features/tickets/atencion/PanelAtencion.tsx
    locales/es/tickets.json
  tests/
    shared/http-client.test.ts                         # postForm, descargar
    features/tickets/adjuntos-ticket.test.tsx
    features/tickets/formulario-queja.test.tsx         # casos con archivos
  e2e/registro-vecino.spec.ts                          # con un archivo, a 360 px
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con las columnas nuevas y los 4 endpoints. Verificación: revisión del diff.
2. Crear `0020_adjuntos.ts`. Ampliar `schema.test.ts`: existen las 4 columnas; un `origen = 'registro'` con `interno = true` es rechazado; `tamano_bytes = 10485761` es rechazado; una `ruta` repetida viola UNIQUE. Verificación: `npm run test:db` pasa.
3. Crear `tipo-archivo.ts` y el inspector de DOCX (la interfaz en el dominio y la implementación con el lector de ZIP), y los fixtures. Crear `tipo-archivo.test.ts`. Casos:
   - Los 4 tipos válidos pasan.
   - Un `.exe` renombrado a `.pdf` → `CONTENIDO_NO_COINCIDE`.
   - Un `.png` con contenido JPG → `CONTENIDO_NO_COINCIDE`.
   - Un ZIP con extensión `.docx` que no es Word → `CONTENIDO_NO_COINCIDE`.
   - Un `.gif` → `TIPO_NO_PERMITIDO`.
   - 0 bytes → `VACIO`.
   - Más de 10 MB → `MUY_GRANDE`.
   - Un nombre `../../etc/passwd.pdf` se limpia a `passwd.pdf`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `almacen-archivos.ts`, `disco-almacen-archivos.ts` y `ADJUNTOS_DIR` en `env.ts` y `.env.example`. Crear `disco-almacen-archivos.test.ts` con una carpeta temporal:
   - Guardar y leer devuelve el mismo contenido.
   - La ruta generada cumple el patrón.
   - `leer('../x')` y `borrar('/etc/passwd')` se rechazan.
   - Borrar dos veces no falla.
   - No quedan archivos temporales.

   Verificación: `npm test` pasa.
5. Crear `reglas-adjuntos.ts` y `reglas-adjuntos.test.ts`. Casos:
   - El origen se decide por quién sube y el estado.
   - El solicitante fuera de `nueva` → `ADJUNTOS_CERRADOS`.
   - El cupo de 5 se cuenta por origen.
   - En una queja final, solo internos.
   - Un `registro` con `interno` → `400`.

   Verificación: `npm test` pasa.
6. Crear `AdjuntoRepository` y `AdjuntosService` (con el borrado de archivos ya escritos si la transacción falla), con `adjuntos.service.test.ts` usando falsos. Verificación: `npm test` pasa.
7. Crear el middleware de Multer, el validador, el controlador y las rutas, y agregar los códigos y la traducción de `MulterError`. Crear `tests/db/adjuntos.api.test.ts` con `ADJUNTOS_DIR` en una carpeta temporal. Casos:
   - El vecino sube 3 archivos a su queja `nueva` → `201`, con `origen = 'registro'` y públicos. Luego 3 más → `409 LIMITE_ADJUNTOS`, sin guardar ninguno. Después de que el supervisor la toma, otro → `409 ADJUNTOS_CERRADOS`.
   - El receptor que registró en ventanilla sube mientras está en `nueva` → `registro`.
   - El técnico asignado sube una evidencia interna y una pública → `201`. El vecino lista: ve los públicos, no el interno, y descargar el interno → `404`.
   - Un `.exe` renombrado → `400 ADJUNTO_INVALIDO`, sin archivos en disco.
   - 11 MB → `400`.
   - 6 archivos en una petición → `400`.
   - La descarga devuelve el mismo contenido, con `nosniff` y la `Content-Disposition` correcta.
   - El autor borra a los 2 minutos → `204`, y el archivo desaparece del disco. Pasados 5 minutos → `409`. Otro usuario → `404`.
   - Una queja ajena → `404`. Sin token → `401`.
   - En una queja `cerrada`, un público → `409 QUEJA_FINALIZADA` y un interno → `201`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Frontend: agregar `postForm` y `descargar` a `http-client.ts`, con sus casos en `http-client.test.ts` (sin `Content-Type`, con token y con reintento ante `401`). Crear `adjuntos-api.ts` y `AdjuntosTicket.tsx` en los 3 paneles, con `adjuntos-ticket.test.tsx`. Casos:
   - La lista marca los internos con texto.
   - "Borrar" aparece solo si `borrable`.
   - El selector tiene "Interno" por defecto.
   - Se muestra el cupo.
   - Cada error tiene su mensaje.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
9. Agregar el selector de archivos al formulario de SPEC 18 (paso Descripción y resumen) y el reintento en la pantalla de éxito. Ampliar `formulario-queja.test.tsx`:
   - Más de 5 archivos o uno de más de 10 MB se rechazan en el cliente.
   - Después de crear la queja se suben los archivos.
   - Un fallo de subida muestra "Reintentar", que no vuelve a crear la queja.

   Ampliar `e2e/registro-vecino.spec.ts` con un archivo a 360×740. Verificación: `npm test` y `npm run test:e2e` pasan.
10. Actualizar `CLAUDE.md`:
    - `ADJUNTOS_DIR` y que nunca se sirve como carpeta pública.
    - La validación por contenido.
    - Los dos orígenes con sus límites.
    - Que todo acceso a archivos pasa por `AlmacenArchivos`.

    Verificación manual: `vecino@vozmuni.test` registra una queja con 2 fotos desde el celular o con DevTools a 360 px. `tecnico@vozmuni.test` ve las fotos en `/atencion`, sube un informe PDF interno y una foto pública del arreglo, y el vecino (por API) lista solo la foto pública.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye las columnas nuevas de `adjuntos` y los 4 endpoints.
- [ ] Después de `migrate:latest`, `adjuntos` tiene `subido_por`, `creado_en`, `interno` y `origen`, y la base rechaza un adjunto de registro interno y uno de más de 10 MB.
- [ ] Solo se aceptan PDF, JPG, PNG y DOCX validados por su contenido. Un archivo renombrado o con un contenido que no coincide con la extensión responde `400 ADJUNTO_INVALIDO`, y el MIME del navegador no influye.
- [ ] Un archivo de más de 10 MB, uno vacío o más de 5 archivos en una petición se rechazan, sin guardar nada.
- [ ] Si un archivo de la petición es inválido, no se guarda ninguno, ni en la base ni en el disco.
- [ ] El solicitante, o quien registró la queja, sube hasta 5 adjuntos públicos mientras la queja está en `nueva`. Después responde `409 ADJUNTOS_CERRADOS`, y superar el cupo responde `409 LIMITE_ADJUNTOS`.
- [ ] Los usuarios internos con permiso de comentar suben hasta 5 evidencias por queja, públicas o internas, dentro de su alcance. En quejas finales solo internas.
- [ ] Quien no tiene `comentarios.interno` no ve los adjuntos internos en la lista, y su descarga responde `404`.
- [ ] La descarga exige sesión y el alcance de la queja, devuelve el contenido exacto con el `Content-Type` guardado, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`, e `inline` solo para imágenes.
- [ ] Los archivos se guardan con un nombre aleatorio dentro de `ADJUNTOS_DIR`. El almacén rechaza rutas fuera del patrón, y ninguna ruta de Express sirve esa carpeta como estática.
- [ ] El autor borra su adjunto durante 5 minutos (`204`, y el archivo desaparece del disco). Después responde `409 EDICION_VENCIDA`, y otro usuario recibe `404`.
- [ ] El formulario de queja permite elegir hasta 5 archivos válidos, los sube después de registrar, y si la subida falla ofrece reintentar sin crear otra queja.
- [ ] Los paneles de `/triage`, `/asignacion` y `/atencion` muestran los adjuntos, con descarga y vista de imágenes, la subida de evidencias con el selector "Público" / "Interno" (por defecto interno) y el cupo restante, y el borrado durante 5 minutos.
- [ ] A 360 px de ancho, el selector y la lista de adjuntos no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] `CLAUDE.md` documenta `ADJUNTOS_DIR`, la validación por contenido, los orígenes y los límites.

## Decisiones

- **Sí:** una sola spec para los adjuntos del registro (RF-06) y las evidencias (RF-20), porque comparten tabla, endpoint y reglas. Cierra RF-06.
- **No:** solo las evidencias del técnico.
- **Sí:** disco local detrás del puerto `AlmacenArchivos`, con nombres aleatorios. Un adaptador S3 se agrega después sin tocar los servicios.
- **No:** S3 con MinIO desde ya.
- **Sí:** validación por firma de bytes cruzada con la extensión. Para DOCX se verifica además que el ZIP sea un documento de Word. El MIME del navegador se ignora.
- **No:** confiar en la extensión y el MIME declarado.
- **Sí:** 5 adjuntos del registro y 5 internos por queja, como eligió el usuario.
- **No:** 20 internos, ni un tope total de 5.
- **Sí:** cada adjunto es público o interno, con los mismos permisos que los comentarios (SPEC 23). Los del registro son siempre públicos.
- **No:** que todos sean visibles.
- **Sí:** descarga por un endpoint autenticado que verifica el alcance y la visibilidad, con cabeceras que impiden que el navegador ejecute el contenido.
- **No:** URL firmadas.
- **Sí:** el autor puede borrar su adjunto durante 5 minutos, como eligió el usuario. Se borran la fila y el archivo. Reutiliza `EDICION_VENCIDA` de SPEC 23.
- **No:** no permitir el borrado, ni permitirlo mientras la queja esté abierta.
- **Sí:** el vecino adjunta solo al registrar, como eligió el usuario. El backend lo traduce a "mientras la queja siga en `nueva`", porque el formulario sube los archivos en otra petición después de crearla. Para responder en `en_espera`, el vecino usa comentarios.
- **No:** subir después del registro, una ventana de 30 minutos, ni un registro multipart.
- **Sí:** el receptor o el supervisor que registraron en ventanilla también suben como `registro` mientras la queja está en `nueva`. No se preguntó explícitamente: es lo coherente con "al registrar".
- **Sí:** el origen lo decide el backend, no el cliente, para que nadie se salte los cupos.
- **Sí:** todo o nada por petición. Más simple de entender, y no quedan subidas a medias.
- **Sí:** se agregan `subido_por` y `creado_en` a `adjuntos`, que SPEC 03 no tenía. Hacen falta para el borrado del autor y para la línea de tiempo.
- **Sí:** el cliente HTTP gana `postForm` y `descargar`, porque el de SPEC 06 solo envía JSON.
- **Sí:** las elecciones de implementación las propone esta spec, y el usuario puede ajustarlas al revisarla:
  - el lector de ZIP (`yauzl`);
  - la estructura de carpetas `aa/uuid`;
  - el valor por defecto "Interno" en el selector;
  - `inline` solo para imágenes;
  - los códigos `ADJUNTO_INVALIDO`, `ADJUNTOS_CERRADOS` y `LIMITE_ADJUNTOS`.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Un archivo malicioso con una firma válida (por ejemplo, un PDF con JavaScript) llega a otros usuarios | Las descargas de PDF y DOCX usan `attachment` y `nosniff`, así que no se ejecutan en el contexto de la app. Un antivirus queda para una spec futura. |
| `ADJUNTOS_DIR` no entra en el respaldo diario (RNF-06) | La spec de despliegue debe montarla como volumen e incluirla en el respaldo. `CLAUDE.md` lo advierte. |
| Las fotos de celular de varios MB consumen ancho de banda y disco | El límite de 10 MB y 5 + 5 por queja acota el peor caso, unos 100 MB por queja. La compresión en el cliente queda para otra spec. |
| Multer con `memoryStorage` mantiene en memoria hasta 50 MB por petición | Está limitado por `files: 5` y `fileSize: 10 MB`. Con mucha concurrencia, una spec futura puede pasar a streaming a disco temporal. |
| Si borrar el archivo falla después de borrar la fila, queda un archivo huérfano | Se registra en el log. Un job de limpieza de huérfanos puede llegar con la spec de mantenimiento. |
| El vecino no ve todavía sus adjuntos después de registrar | La pantalla de éxito confirma la subida. El detalle de "Mis quejas" (RF-25) los mostrará. |
| Depende de 7 specs en Borrador | Se implementa después de SPEC 23. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- S3, URL firmadas y antivirus.
- Miniaturas y compresión.
- Adjuntos en comentarios.
- Adjuntos del vecino después del registro.
- Pantalla del vecino con sus adjuntos.
- Respaldo de los archivos y borrado administrativo.
- Bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
