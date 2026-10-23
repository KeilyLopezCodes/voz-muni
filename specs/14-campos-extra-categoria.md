# SPEC 14 — Campos adicionales por categoría

> **Estado:** Implementado.
> **Depende de:** SPEC 08, SPEC 12
> **Fecha:** 2026-10-22
> **Objetivo:** Definir el esquema de `categorias.campos_extra` (campos de tipo texto, número, fecha, selección y sí/no con sus reglas), permitir que el administrador lo edite sin romper los datos de quejas existentes, exponer las categorías y zonas al formulario, y validar `datosExtra` al registrar una queja.

## Por qué existe esta spec

RF-09 (**S**) pide que el formulario muestre campos adicionales según la categoría, por ejemplo el número de contador en las quejas de agua.
SPEC 03 dejó preparadas las columnas, `categorias.campos_extra` (`'[]'`) y `tickets.datos_extra` (`'{}'`), y dejó su forma para esta spec. SPEC 12 rechaza hoy `datosExtra` para no guardar datos sin validar.
Siguiendo el núcleo genérico de `CLAUDE.md`, los campos son datos que edita el administrador, no código.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición: la forma de `campos_extra` y `datos_extra`, y los endpoints nuevos.
- Esquema de definiciones en `domain/categorias/`: 5 tipos (`texto`, `numero`, `fecha`, `seleccion`, `si_no`), `requerido` y límites por tipo.
- Validación pura de `datosExtra` contra la definición de su categoría.
- Regla de compatibilidad: en una categoría con quejas, solo se permiten cambios que no invaliden los datos ya guardados.
- `PUT /api/v1/admin/categorias/:id/campos-extra`, protegido por `admin.catalogos` (SPEC 08).
- `GET /api/v1/categorias` y `GET /api/v1/zonas`, para el formulario, con sesión y el permiso `tickets.crear`.
- **Cambio sobre SPEC 12:** `POST /api/v1/tickets` acepta `datosExtra` y lo valida.
- **Cambio sobre SPEC 08:** el cuerpo de error admite un campo opcional `detalles`.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Formulario dinámico en el frontend.
- El resto del CRUD de categorías (nombre, dependencia, activa) y de zonas (RF-41).
- Versionado de definiciones.
- Qué pasa con `datos_extra` cuando el supervisor corrige la categoría en la revisión (spec de RF-12).
- Tipos `seleccion_multiple`, `texto_largo` o archivo, y campos condicionales.
- Mostrar `datos_extra` en el detalle del ticket (spec de detalle, RF-25).
- Campos de ejemplo en `seeds-desarrollo/` (SPEC 05 exige `campos_extra = '[]'`).
- Traducción de las etiquetas de los campos a otros idiomas: son datos en español, editados por el administrador.

## Modelo de datos

Esta spec no crea tablas ni columnas, y no tiene migración. Define el contenido de `categorias.campos_extra` y `tickets.datos_extra`.

### Cambios en el documento de definición

Antes de implementar se actualiza la sección 6 del documento:

- Se agrega la forma de `categorias.campos_extra` (lista de definiciones) y de `tickets.datos_extra` (valores por `clave`).
- Endpoints: `GET /api/v1/categorias` y `GET /api/v1/zonas` (Vecino, Receptor, Supervisor), y `PUT /api/v1/admin/categorias/:id/campos-extra` (Admin).

### Definición de campos (`domain/categorias/campo-extra.ts`)

```ts
export const TIPOS_CAMPO = ['texto', 'numero', 'fecha', 'seleccion', 'si_no'] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

interface CampoBase {
  clave: string;          // ^[a-z][a-z0-9_]{0,49}$, única dentro de la categoría
  etiqueta: string;       // 1–100 caracteres
  ayuda?: string;         // 0–300 caracteres
  requerido: boolean;
  orden: number;          // entero ≥ 0; la lista se devuelve ordenada por orden y luego clave
}
export type CampoExtra =
  | (CampoBase & { tipo: 'texto'; min?: number; max: number; patron?: string })
  | (CampoBase & { tipo: 'numero'; min?: number; max?: number; entero: boolean })
  | (CampoBase & { tipo: 'fecha'; min?: string; max?: string; noFutura: boolean })   // fechas 'AAAA-MM-DD'
  | (CampoBase & { tipo: 'seleccion'; opciones: { valor: string; etiqueta: string }[] })
  | (CampoBase & { tipo: 'si_no' });

// Lanza ReglaDeNegocioError DEFINICION_INVALIDA con la lista de problemas en `detalles`.
export function validarDefinicion(campos: unknown): CampoExtra[];
```

Reglas de `validarDefinicion`:

| Regla | Valor |
| --- | --- |
| Campos por categoría | 0 a 20 |
| `clave` | `^[a-z][a-z0-9_]{0,49}$`, sin repetir |
| `texto.max` | obligatorio, de 1 a 500. `min` va de 0 a `max` |
| `texto.patron` | de 1 a 200 caracteres. Se compila con `new RegExp(patron, 'u')` y, si no compila, es inválido |
| `numero` | `min` ≤ `max` si vienen los dos, ambos finitos |
| `fecha` | `min` y `max` son fechas válidas `AAAA-MM-DD`, con `min` ≤ `max` |
| `seleccion.opciones` | de 1 a 50. `valor` cumple `^[a-z0-9_]{1,50}$` y no se repite. `etiqueta` tiene de 1 a 100 caracteres |
| Propiedades desconocidas | inválidas |

Ejemplo, para la categoría Agua potable:

```json
[
  { "clave": "numero_contador", "etiqueta": "Número de contador", "tipo": "texto",
    "requerido": true, "orden": 1, "min": 4, "max": 20, "patron": "^[0-9-]+$" },
  { "clave": "tipo_problema", "etiqueta": "Tipo de problema", "tipo": "seleccion",
    "requerido": true, "orden": 2,
    "opciones": [{ "valor": "fuga", "etiqueta": "Fuga" }, { "valor": "sin_servicio", "etiqueta": "Sin servicio" }] }
]
```

### Valores (`domain/categorias/datos-extra.ts`)

```ts
export type ValorCampo = string | number | boolean;
export type DatosExtra = Record<string, ValorCampo>;

// Devuelve los datos normalizados o lanza ReglaDeNegocioError DATOS_EXTRA_INVALIDOS con `detalles`.
// `hoy` es la fecha 'AAAA-MM-DD' en America/Guatemala, para la regla noFutura.
export function validarDatosExtra(campos: CampoExtra[], datos: unknown, hoy: string): DatosExtra;
```

| Tipo | Valor aceptado | Se guarda como |
| --- | --- | --- |
| `texto` | string. Se recorta, y un texto vacío cuenta como ausente. Largo entre `min` y `max`, y debe cumplir `patron` | string recortado |
| `numero` | número JSON finito (no string), entre `min` y `max`, y entero si `entero` | number |
| `fecha` | string `AAAA-MM-DD` válido, entre `min` y `max`, y no posterior a `hoy` si `noFutura` | string |
| `seleccion` | string igual a un `valor` de `opciones` | string |
| `si_no` | boolean | boolean |

Reglas generales:

- `datos` debe ser un objeto plano. `undefined` cuenta como `{}`.
- Una clave que no está en la definición es un error.
- Un campo `requerido` ausente, `null` o vacío es un error. Un campo opcional ausente no se guarda.
- Los errores se acumulan: se devuelven todos a la vez, no solo el primero.

`detalles` es una lista `{ campo: string; problema: string }[]`. `problema` es uno de `REQUERIDO`, `TIPO_INVALIDO`, `MUY_CORTO`, `MUY_LARGO`, `PATRON`, `MENOR_AL_MINIMO`, `MAYOR_AL_MAXIMO`, `NO_ENTERO`, `FECHA_FUTURA`, `OPCION_INVALIDA` o `CAMPO_DESCONOCIDO`.

### Compatibilidad (`domain/categorias/compatibilidad.ts`)

```ts
// Lista de cambios incompatibles entre la definición actual y la nueva; vacía si son compatibles.
export function cambiosIncompatibles(actual: CampoExtra[], nueva: CampoExtra[]): { campo: string; problema: string }[];
```

Solo se aplica si la categoría tiene **al menos un ticket**, cualquiera sea su estado. Sin tickets, se acepta cualquier definición válida.

| Cambio sobre un campo existente (misma `clave`) | Permitido |
| --- | --- |
| `etiqueta`, `ayuda`, `orden` | sí |
| Quitar `requerido` (de `true` a `false`) | sí |
| Ampliar límites: bajar o quitar `min`, subir o quitar `max`, `entero` de `true` a `false`, `noFutura` de `true` a `false`, quitar `patron` | sí |
| Agregar opciones a una `seleccion`, o cambiar la `etiqueta` de una opción | sí |
| Agregar un campo nuevo **opcional** | sí |
| Quitar un campo (`CAMPO_ELIMINADO`) | no |
| Cambiar el `tipo` (`TIPO_CAMBIADO`) | no |
| Volver `requerido` (`AHORA_REQUERIDO`) | no |
| Agregar un campo nuevo requerido (`NUEVO_REQUERIDO`) | no |
| Estrechar límites: subir `min`, bajar `max`, `entero` de `false` a `true`, `noFutura` de `false` a `true` (`LIMITE_ESTRECHADO`) | no |
| Agregar o cambiar `patron` (`PATRON_CAMBIADO`) | no |
| Quitar una opción (`OPCION_ELIMINADA`) | no |

Una `clave` que no aparece en la definición nueva cuenta como eliminada. Renombrar un campo equivale a quitar uno y agregar otro.

### Endpoints

| Método y ruta | Permiso | Respuesta correcta | Errores |
| --- | --- | --- | --- |
| `GET /api/v1/categorias` | `autenticar` + `requierePermiso('tickets.crear')` | `200` `[{ id, nombre, camposExtra }]`, solo las categorías activas con dependencia activa, ordenadas por `nombre` | `401`, `403` |
| `GET /api/v1/zonas` | `autenticar` + `requierePermiso('tickets.crear')` | `200` `[{ id, nombre, tipo }]`, ordenadas por `tipo` y `nombre` | `401`, `403` |
| `PUT /api/v1/admin/categorias/:id/campos-extra` | `autenticar` + `requierePermiso('admin.catalogos')` | `200` `{ id, nombre, camposExtra }` | `400 DEFINICION_INVALIDA`, `404 NO_ENCONTRADO`, `409 CAMBIO_INCOMPATIBLE`, `401`, `403` |

- El `PUT` recibe `{ campos: CampoExtra[] }` y **reemplaza** la lista completa.
- Funciona también sobre categorías inactivas.
- La lectura de "tiene tickets" y la escritura van en una transacción con `SELECT … FOR UPDATE` sobre la fila de la categoría, para que no se registre una queja en medio del cambio.

### Cambios en specs anteriores

| Spec | Punto | Cambio |
| --- | --- | --- |
| SPEC 12 | Cuerpo de `POST /api/v1/tickets` | Acepta `datosExtra?: object`. Se valida con `validarDatosExtra` contra los `campos_extra` de la categoría, leídos en la misma transacción del registro, y se guarda en `tickets.datos_extra`. Sin `datosExtra`, se guarda `'{}'` si la categoría no tiene campos requeridos; si los tiene, responde `400 DATOS_EXTRA_INVALIDOS`. |
| SPEC 12 | Prueba "con `datosExtra` → `400`" y criterio correspondiente | Se reemplazan por los casos de esta spec. `lat`, `lng`, `prioridad` y `estado` siguen rechazados. |
| SPEC 08 | Cuerpo de error | `{ codigo, mensaje, detalles? }`. `detalles` solo aparece en `DEFINICION_INVALIDA`, `DATOS_EXTRA_INVALIDOS` y `CAMBIO_INCOMPATIBLE`. El cliente HTTP de SPEC 06 sigue leyendo `codigo` y puede ignorar `detalles`. |

Códigos nuevos en el manejador de errores: `DEFINICION_INVALIDA` y `DATOS_EXTRA_INVALIDOS` (400), y `CAMBIO_INCOMPATIBLE` (409).

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas de categorías, zonas y admin de campos
    container.ts
    domain/categorias/campo-extra.ts
    domain/categorias/datos-extra.ts
    domain/categorias/compatibilidad.ts
    domain/repositories/catalogo-lectura-repository.ts # + listar categorías activas y zonas, campos de una categoría
    domain/repositories/categoria-admin-repository.ts  # obtener para actualizar, tiene tickets, guardar campos
    application/errors/error-de-aplicacion.ts          # + detalles opcional
    application/services/catalogos.service.ts          # listar categorías y zonas
    application/services/campos-extra.service.ts       # actualizar definición
    application/services/registro-tickets.service.ts   # valida datosExtra (cambio de SPEC 12)
    infrastructure/repositories/
      knex-catalogo-lectura-repository.ts
      knex-categoria-admin-repository.ts
      knex-registro-ticket-repository.ts               # guarda datos_extra
    presentation/
      validators/tickets.validators.ts                 # + datosExtra
      validators/campos-extra.validators.ts
      controllers/catalogos.controller.ts
      controllers/campos-extra.controller.ts
      routes/catalogos.routes.ts
      routes/campos-extra.routes.ts
      middlewares/manejador-errores.ts                 # 3 códigos y detalles
  tests/
    unit/categorias/campo-extra.test.ts
    unit/categorias/datos-extra.test.ts
    unit/categorias/compatibilidad.test.ts
    unit/categorias/campos-extra.service.test.ts
    unit/tickets/registro-tickets.service.test.ts      # casos con datosExtra
    db/campos-extra.api.test.ts                        # Supertest contra Postgres real
    db/tickets.api.test.ts                             # casos con datosExtra
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con la forma de `campos_extra` y `datos_extra` y los 3 endpoints. Verificación: revisión del diff.
2. Crear `campo-extra.ts` con `validarDefinicion` y `campo-extra.test.ts`. Casos:
   - El ejemplo de Agua potable es válido.
   - Una `clave` con mayúscula, una repetida, 21 campos, `texto` sin `max`, `max = 501`, un `patron` que no compila, `numero` con `min > max`, `seleccion` sin opciones o con un valor repetido, y una propiedad desconocida son inválidos, cada uno con su detalle.

   Verificación: `npm test` y `npm run lint:deps` pasan.
3. Crear `datos-extra.ts` con `validarDatosExtra` y `datos-extra.test.ts`. Casos por tipo:
   - Texto: recorte, `min`, `max` y `patron`.
   - Número: un string `'5'` es rechazado, `entero` y `min`/`max`.
   - Fecha: un formato inválido, `2026-02-30` y `noFutura` contra `hoy` (`2026-10-23` con `hoy = 2026-10-22` → `FECHA_FUTURA`).
   - Selección: una opción inexistente.
   - Sí/no: `'true'` es rechazado.
   - Además: requerido ausente, opcional ausente no guardado, clave desconocida, y varios errores devueltos juntos.

   Verificación: `npm test` pasa.
4. Crear `compatibilidad.ts` y `compatibilidad.test.ts`, con al menos un caso por cada fila de la tabla de compatibilidad: las 5 filas permitidas y las 7 bloqueadas, cada bloqueada con su código. Verificación: `npm test` pasa.
5. Ampliar `CatalogoLecturaRepository` y crear `CategoriaAdminRepository` con sus implementaciones Knex: `listarCategoriasActivas`, `listarZonas`, `camposDeCategoria`, `obtenerParaActualizar` (con `FOR UPDATE`), `tieneTickets` y `guardarCampos`. Crear `CatalogosService` y `CamposExtraService`, con `campos-extra.service.test.ts` usando falsos. Casos: sin tickets acepta un cambio de tipo; con tickets lo rechaza con `CAMBIO_INCOMPATIBLE`; una definición inválida lanza `DEFINICION_INVALIDA`. Verificación: `npm test` y `npm run typecheck` pasan.
6. Aplicar los cambios de SPEC 08 y 12:
   - `detalles` opcional en `ErrorDeAplicacion` y en el manejador de errores.
   - `datosExtra` en el validador de tickets y en `RegistroTicketsService`.
   - El guardado de `datos_extra` en el repositorio.

   Ampliar `registro-tickets.service.test.ts`: con datos válidos se guardan normalizados; con datos inválidos lanza `DATOS_EXTRA_INVALIDOS` y no se crea el ticket ni se consume el correlativo; sin `datosExtra` y con un campo requerido, el registro es rechazado. Verificación: `npm test` pasa.
7. Crear los validadores, controladores y rutas de los 3 endpoints y conectarlos. Crear `tests/db/campos-extra.api.test.ts` y ampliar `tickets.api.test.ts`. Casos:
   - El administrador define los campos de Agua potable → `200`.
   - El vecino → `403`.
   - Una definición inválida → `400` con `detalles`.
   - `GET /categorias` como vecino devuelve `camposExtra` y omite las categorías inactivas.
   - `GET /zonas` devuelve las zonas ordenadas.
   - Un vecino registra en Agua potable con datos válidos → `201`, y `tickets.datos_extra` contiene `numero_contador` recortado.
   - Con `numero_contador` ausente → `400 DATOS_EXTRA_INVALIDOS` con `detalles: [{ campo: 'numero_contador', problema: 'REQUERIDO' }]`.
   - Con la categoría ya con quejas, quitar `tipo_problema` → `409 CAMBIO_INCOMPATIBLE`, y cambiar solo una etiqueta → `200`.
   - Una categoría inexistente → `404`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
8. Actualizar `CLAUDE.md`: el formato de `campos_extra` y `datos_extra`, qué cambios se bloquean en una categoría con quejas, y que el campo `detalles` del cuerpo de error existe. Verificación: revisión del diff.

## Criterios de aceptación

- [x] La sección 6 del documento de definición describe la forma de `campos_extra` y `datos_extra` y los 3 endpoints.
- [x] `validarDefinicion` acepta los 5 tipos con sus reglas y rechaza cada caso inválido de la tabla de reglas, con un detalle por problema.
- [x] `validarDatosExtra` aplica las reglas de cada tipo, rechaza las claves desconocidas, guarda solo los campos presentes, normaliza los textos recortados y devuelve todos los errores a la vez.
- [x] Una fecha con `noFutura` se compara contra el día actual en `America/Guatemala`.
- [x] El administrador reemplaza los campos de una categoría con `PUT /api/v1/admin/categorias/:id/campos-extra`, y cualquier otro rol recibe `403`.
- [x] En una categoría sin quejas se acepta cualquier definición válida. En una con quejas, cada cambio bloqueado de la tabla responde `409 CAMBIO_INCOMPATIBLE` con su detalle, y cada cambio permitido responde `200`.
- [x] `GET /api/v1/categorias` devuelve solo las categorías activas con dependencia activa, con sus `camposExtra`, y `GET /api/v1/zonas` devuelve todas las zonas. Los dos exigen sesión y `tickets.crear`.
- [x] `POST /api/v1/tickets` con `datosExtra` válido guarda los valores normalizados en `tickets.datos_extra`.
- [x] `POST /api/v1/tickets` con `datosExtra` inválido, o sin él en una categoría con campos requeridos, responde `400 DATOS_EXTRA_INVALIDOS` con `detalles`, no crea el ticket y no consume un número.
- [x] `lat`, `lng`, `prioridad` y `estado` siguen rechazados en `POST /api/v1/tickets`.
- [x] Los errores `DEFINICION_INVALIDA`, `DATOS_EXTRA_INVALIDOS` y `CAMBIO_INCOMPATIBLE` incluyen `detalles: [{ campo, problema }]`, y el resto de los errores conserva la forma `{ codigo, mensaje }`.
- [x] Ningún archivo de `src/domain/categorias/` importa algo fuera de `src/domain/`.
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta el formato de los campos, la regla de compatibilidad y el campo `detalles`.

## Decisiones

- **Sí:** solo backend. El formulario dinámico va con la spec del formulario de queja.
- **Sí:** 5 tipos (`texto`, `numero`, `fecha`, `seleccion`, `si_no`). Cubren el ejemplo del documento y los casos típicos sin volverse un constructor de formularios.
- **No:** solo texto y número, ni agregar selección múltiple o texto largo.
- **Sí:** reglas `requerido` y límites por tipo, incluido un `patron` de regex para texto, como eligió el usuario.
- **Sí:** el `patron` se limita a 200 caracteres, se compila al guardar la definición, y solo se aplica a textos de 500 caracteres como máximo. Reduce el riesgo de una expresión regular costosa (ReDoS). Es una mitigación que propone esta spec.
- **Sí:** endpoint de administración solo para `campos_extra`, protegido por `admin.catalogos`. El resto del CRUD de categorías queda para RF-41.
- **No:** editar solo por SQL, ni adelantar el CRUD completo.
- **Sí:** en una categoría con quejas se bloquean los cambios que invalidarían los datos guardados, como eligió el usuario. Se permiten los cambios de presentación y los que amplían lo aceptado.
- **No:** conservar cualquier cambio sin control, ni versionar las definiciones.
- **Sí:** "tiene quejas" significa al menos un ticket en cualquier estado. Es más simple y seguro que contar solo los abiertos.
- **Sí:** las claves de `datosExtra` que no están en la definición se rechazan con `400 DATOS_EXTRA_INVALIDOS`.
- **No:** ignorarlas.
- **Sí:** `GET /api/v1/categorias` y `GET /api/v1/zonas` con sesión y `tickets.crear`. Es lo que necesitan el portal y la ventanilla.
- **No:** catálogo público.
- **Sí:** el cuerpo de error gana un campo opcional `detalles`, para listar todos los problemas de un formulario a la vez. Es compatible con el cliente HTTP de SPEC 06. Es una extensión de SPEC 08 que no se preguntó explícitamente.
- **Sí:** la validación de `datosExtra` lee los campos de la categoría en la misma transacción del registro, y el `PUT` bloquea la fila de la categoría. Un cambio de definición y un registro simultáneos no se cruzan.
- **Sí:** los límites (20 campos, 500 caracteres, 50 opciones, el formato de `clave` y de `valor`) y los nombres de los códigos de problema los propone esta spec. El usuario puede ajustarlos al revisarla.
- **Sí:** sin migración. Las columnas ya existen desde SPEC 03, y el valor `'[]'` es una definición válida (ningún campo).

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una regex mal escrita por el administrador consume CPU al validar (ReDoS) | Se limitan el largo del patrón (200) y del texto (500), y se usa la bandera `u`. Si se detecta un caso real, una spec futura cambia a un motor sin backtracking. |
| Bloquear cambios incompatibles impide corregir un campo mal definido en una categoría con quejas | Se puede agregar un campo opcional nuevo con la definición correcta y dejar el viejo como opcional. Si hace falta más, se evalúa el versionado. |
| El supervisor cambia la categoría de una queja (RF-12) y sus `datos_extra` no corresponden a la nueva | Queda fuera de alcance. La spec de RF-12 debe decidir si los conserva, los descarta o los pide de nuevo. |
| Las etiquetas de los campos están en español en la base y no pasan por los archivos de traducción (RNF-16) | Son datos que edita el administrador, igual que los nombres de las categorías. RNF-16 aplica a los textos fijos de la interfaz. |
| SPEC 12 todavía está en Borrador, y esta spec cambia su cuerpo de registro | Se implementa después de SPEC 12. Si se aprueban juntas, se puede integrar el cambio en SPEC 12 antes de implementarla. |

## Lo que **no** está en esta spec

- Formulario dinámico en el frontend.
- CRUD completo de categorías y zonas.
- Versionado de definiciones.
- `datos_extra` al corregir la categoría.
- Tipos adicionales y campos condicionales.
- Mostrar `datos_extra` en el detalle.
- Campos de ejemplo en los seeds de desarrollo.

Cada uno de estos temas, cuando llegue, va en su propia spec.
