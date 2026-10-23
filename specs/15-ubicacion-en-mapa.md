# SPEC 15 — Coordenadas de la queja y límites del municipio

> **Estado:** Borrador
> **Depende de:** SPEC 08, SPEC 12
> **Fecha:** 2026-10-22
> **Objetivo:** Permitir que el registro de una queja incluya latitud y longitud opcionales, validadas contra la caja geográfica del municipio que configura el administrador en una tabla genérica de parámetros, y exponer esa caja al formulario.

## Por qué existe esta spec

RF-10 (**C**) pide que el vecino pueda marcar la ubicación de la queja en un mapa. SPEC 03 ya tiene `tickets.lat` y `tickets.lng`, y SPEC 12 hoy las rechaza hasta que esta spec defina su validación.
El mapa Leaflet va con la spec del formulario de queja, que todavía no existe. Esta spec prepara el backend: acepta coordenadas y las valida.
Para no fijar un valor territorial en el código (`CLAUDE.md`: núcleo genérico), los límites del municipio son un parámetro administrable. Esto introduce la tabla genérica `parametros`, que también resuelve parte del vacío "parámetros configurables" de SPEC 02.

## Alcance

**Incluido:**

- Actualización de la sección 6 del documento de definición antes de la migración.
- Migración `0014_parametros`: tabla genérica `parametros` y `CHECK` de "ambas coordenadas o ninguna" en `tickets`.
- Reglas en `domain/ubicacion/`: validación de la caja del municipio y de un punto contra ella.
- `PUT /api/v1/admin/parametros/limites-municipio`, protegido por `admin.catalogos`.
- `GET /api/v1/parametros/limites-municipio`, para el formulario, con sesión y el permiso `tickets.crear`.
- **Cambio sobre SPEC 12:** `POST /api/v1/tickets` acepta `lat` y `lng` opcionales, para los tres roles que registran, y las valida.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Componente de mapa Leaflet y teselas en el frontend.
- Geocodificación, que traduce una dirección a coordenadas o al revés.
- Geometría de las zonas, y comprobar que el punto cae en la zona elegida.
- Polígono exacto del municipio. Aquí solo hay una caja rectangular.
- Otros parámetros, como el plazo de confirmación de 5 días, y una pantalla genérica de parámetros (RF-41).
- Cajas que cruzan el antimeridiano (longitud ±180).
- Mostrar las coordenadas en el detalle o en la consulta pública.
- Editar las coordenadas de un ticket ya registrado.

## Modelo de datos

### Cambios en el documento de definición

Antes de la migración se actualiza la sección 6 del documento, como pide la decisión de SPEC 03:

- Tabla nueva `parametros`.
- `tickets`: `lat` y `lng` van juntas o no van.
- Endpoints: `GET /api/v1/parametros/limites-municipio` (Vecino, Receptor, Supervisor) y `PUT /api/v1/admin/parametros/limites-municipio` (Admin).

En la tabla de vacíos de SPEC 02, la fila "Sección 3: parámetros configurables" queda resuelta en parte. Ya existe la tabla, pero el plazo de confirmación sigue pendiente.

### `0014_parametros`

| Tabla | Columna | Tipo | Restricciones |
| --- | --- | --- | --- |
| `parametros` | `clave` | text | PK, CHECK `~ '^[a-z][a-z0-9_]{0,49}$'` |
| | `valor` | jsonb | NOT NULL |
| | `actualizado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `tickets` | — | — | CHECK `tickets_ubicacion_completa`: `(lat IS NULL) = (lng IS NULL)` |

- La migración **no** inserta `limites_municipio`. Hasta que el administrador lo configure, no se aceptan coordenadas.
- El `down` borra el `CHECK` y la tabla.
- Con esta spec el esquema pasa de 18 a 19 tablas.

### Parámetro `limites_municipio`

```ts
// domain/ubicacion/limites-municipio.ts
export interface LimitesMunicipio {
  latMin: number; latMax: number;   // -90 ≤ latMin < latMax ≤ 90
  lngMin: number; lngMax: number;   // -180 ≤ lngMin < lngMax ≤ 180 (sin cruzar el antimeridiano)
}

// Lanza ReglaDeNegocioError LIMITES_INVALIDOS si no cumple los rangos.
export function validarLimites(valor: unknown): LimitesMunicipio;

// Devuelve { lat, lng } redondeados a 6 decimales, o null si no vino ninguna.
// Lanza ReglaDeNegocioError con el código de la tabla de abajo.
export function validarUbicacion(
  limites: LimitesMunicipio | null,
  lat: number | undefined,
  lng: number | undefined,
): { lat: number; lng: number } | null;
```

Se guarda como `parametros.valor` con la forma de `LimitesMunicipio`. Ejemplo:

```json
{ "latMin": 14.55, "latMax": 14.70, "lngMin": -90.60, "lngMax": -90.45 }
```

Reglas de `validarUbicacion`, en este orden:

| Caso | Resultado |
| --- | --- |
| No vienen `lat` ni `lng` | `null`. La queja se registra sin coordenadas |
| Viene solo una | `UBICACION_INCOMPLETA` |
| Alguna no es un número finito, `lat` está fuera de -90..90 o `lng` fuera de -180..180 | `UBICACION_INVALIDA` |
| `limites` es `null` (no configurado) | `UBICACION_NO_CONFIGURADA` |
| El punto queda fuera de la caja (los bordes cuentan como dentro) | `UBICACION_FUERA_DEL_MUNICIPIO` |
| Válida | `{ lat, lng }` redondeados a 6 decimales, la precisión de `numeric(9,6)` |

Las coordenadas deben llegar como números JSON. Un string, como `"14.6"`, responde `400 VALIDACION` en el esquema Zod.

### Endpoints

| Método y ruta | Permiso | Entrada | Respuesta correcta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/v1/parametros/limites-municipio` | `autenticar` + `requierePermiso('tickets.crear')` | — | `200` `{ limites: LimitesMunicipio \| null }` | `401`, `403` |
| `PUT /api/v1/admin/parametros/limites-municipio` | `autenticar` + `requierePermiso('admin.catalogos')` | `LimitesMunicipio` | `200` `{ limites: LimitesMunicipio }` | `400 LIMITES_INVALIDOS`, `401`, `403` |

- El `PUT` hace un upsert (`INSERT … ON CONFLICT (clave) DO UPDATE`) y actualiza `actualizado_en`.
- Cambiar la caja no afecta a los tickets ya registrados: sus coordenadas se conservan aunque queden fuera de la caja nueva.

### Cambios en specs anteriores

| Spec | Punto | Cambio |
| --- | --- | --- |
| SPEC 12 | Cuerpo de `POST /api/v1/tickets` | Acepta `lat?: number` y `lng?: number` para el vecino, el receptor y el supervisor. Se validan con `validarUbicacion`, con los límites leídos de `parametros` en la misma petición, y se guardan en `tickets.lat` y `tickets.lng`. Sin coordenadas, siguen en `null`. |
| SPEC 12 | Reglas que rechazan `lat` y `lng`, y su criterio | Se quitan `lat` y `lng` de la lista de campos rechazados. `prioridad` y `estado` (y `datosExtra` según SPEC 14) mantienen su regla. |

Códigos nuevos en el manejador de errores, todos 400: `UBICACION_INCOMPLETA`, `UBICACION_INVALIDA`, `UBICACION_NO_CONFIGURADA`, `UBICACION_FUERA_DEL_MUNICIPIO` y `LIMITES_INVALIDOS`.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6 y vacíos
CLAUDE.md
backend/
  src/
    app.ts                                             # rutas de parámetros
    container.ts
    domain/ubicacion/limites-municipio.ts
    domain/repositories/parametro-repository.ts        # obtener(clave), guardar(clave, valor)
    application/services/parametros.service.ts         # obtener y guardar limites_municipio
    application/services/registro-tickets.service.ts   # valida lat/lng (cambio de SPEC 12)
    infrastructure/
      repositories/knex-parametro-repository.ts
      repositories/knex-registro-ticket-repository.ts  # guarda lat/lng
      database/migrations/0014_parametros.ts
    presentation/
      validators/tickets.validators.ts                 # + lat, lng
      validators/parametros.validators.ts
      controllers/parametros.controller.ts
      routes/parametros.routes.ts
      middlewares/manejador-errores.ts                 # 5 códigos nuevos
  tests/
    unit/ubicacion/limites-municipio.test.ts
    unit/tickets/registro-tickets.service.test.ts      # casos con coordenadas
    db/schema.test.ts                                  # parametros y CHECK de ubicación; 19 tablas
    db/parametros.api.test.ts                          # Supertest contra Postgres real
    db/tickets.api.test.ts                             # casos con coordenadas
```

## Plan de implementación

1. Actualizar la sección 6 del documento de definición con la tabla `parametros`, la regla de `lat` y `lng` juntas y los 2 endpoints, y la tabla de vacíos de SPEC 02. Verificación: revisión del diff.
2. Crear `0014_parametros.ts`. Ampliar `schema.test.ts`:
   - Columnas de `parametros`.
   - Una `clave` con mayúsculas es rechazada.
   - Un ticket con `lat` y sin `lng` viola `tickets_ubicacion_completa`, y con ambas o ninguna se acepta.
   - El rollback completo contempla 19 tablas.

   Verificación: `npm run test:db` pasa.
3. Crear `domain/ubicacion/limites-municipio.ts` y `limites-municipio.test.ts`. Casos:
   - `validarLimites`: el ejemplo es válido; `latMin ≥ latMax`, `lat` fuera de -90..90, `lngMin > lngMax` y una propiedad faltante son inválidos.
   - `validarUbicacion`: sin coordenadas devuelve `null`; solo `lat` → `UBICACION_INCOMPLETA`; `lat = 91` → `UBICACION_INVALIDA`; `NaN` → `UBICACION_INVALIDA`; límites `null` con coordenadas → `UBICACION_NO_CONFIGURADA`; un punto fuera → `UBICACION_FUERA_DEL_MUNICIPIO`; un punto exactamente en el borde se acepta; `14.6012345` se redondea a `14.601235`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
4. Crear `ParametroRepository`, `knex-parametro-repository.ts` y `ParametrosService`. Probar en `test:db` el upsert y la lectura de `limites_municipio`, y que `obtener` de una clave inexistente devuelve `null`. Verificación: `npm run test:db` pasa.
5. Aplicar el cambio de SPEC 12: `lat` y `lng` en el validador de tickets, la validación en `RegistroTicketsService` y el guardado en el repositorio. Ampliar `registro-tickets.service.test.ts`: con límites configurados y un punto dentro se guardan las coordenadas; sin límites y con coordenadas lanza `UBICACION_NO_CONFIGURADA` y no se crea el ticket; sin coordenadas el registro funciona igual con o sin límites. Verificación: `npm test` pasa.
6. Crear el validador, el controlador y las rutas de parámetros, agregar los 5 códigos al manejador y conectar todo. Crear `parametros.api.test.ts` y ampliar `tickets.api.test.ts`. Casos:
   - `GET` sin configurar → `{ limites: null }`.
   - `PUT` como administrador → `200`, y el `GET` siguiente devuelve la caja.
   - `PUT` como vecino → `403`; con una caja inválida → `400 LIMITES_INVALIDOS`.
   - El vecino registra con un punto dentro → `201`, con `lat` y `lng` guardadas.
   - Con un punto fuera → `400 UBICACION_FUERA_DEL_MUNICIPIO`.
   - Con `lat` en string → `400 VALIDACION`.
   - El receptor registra con coordenadas → `201`.
   - Cambiar la caja no modifica los tickets existentes.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
7. Actualizar `CLAUDE.md`: la tabla `parametros` como lugar para los parámetros municipales (nunca constantes en el código), la clave `limites_municipio` y su forma, y que sin ella no se aceptan coordenadas. Verificación: revisión del diff.

## Criterios de aceptación

- [ ] La sección 6 del documento de definición incluye la tabla `parametros`, la regla de `lat` y `lng` juntas y los 2 endpoints, y la tabla de vacíos refleja lo resuelto.
- [ ] `npm run migrate:latest` crea `parametros` y el `CHECK` `tickets_ubicacion_completa`, sin insertar `limites_municipio`, y un rollback completo no deja ninguna de las 19 tablas.
- [ ] El administrador guarda los límites con `PUT /api/v1/admin/parametros/limites-municipio`, y cualquier otro rol recibe `403`.
- [ ] Una caja con `latMin ≥ latMax`, `lngMin ≥ lngMax`, valores fuera de los rangos del planeta o propiedades faltantes responde `400 LIMITES_INVALIDOS`.
- [ ] `GET /api/v1/parametros/limites-municipio` devuelve `{ limites: null }` sin configuración y la caja guardada después del `PUT`. Exige sesión y `tickets.crear`.
- [ ] Sin `limites_municipio` configurado, una queja con coordenadas responde `400 UBICACION_NO_CONFIGURADA`, y una queja sin coordenadas se registra.
- [ ] Con límites configurados, un punto dentro de la caja (incluidos los bordes) se guarda redondeado a 6 decimales, y un punto fuera responde `400 UBICACION_FUERA_DEL_MUNICIPIO`.
- [ ] Solo `lat` o solo `lng` responde `400 UBICACION_INCOMPLETA`, y la base rechaza un ticket con una sola coordenada.
- [ ] Coordenadas en string, `NaN` o fuera de -90..90 / -180..180 son rechazadas.
- [ ] El vecino, el receptor y el supervisor pueden enviar coordenadas al registrar.
- [ ] Cambiar los límites no modifica las coordenadas de los tickets ya registrados.
- [ ] Ningún valor geográfico del municipio está escrito en `src/`, en las migraciones ni en los seeds.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] `CLAUDE.md` documenta la tabla `parametros`, la clave `limites_municipio` y la regla sin configuración.

## Decisiones

- **Sí:** solo backend. El mapa Leaflet va con la spec del formulario de queja.
- **No:** un componente de mapa aislado, ni descartar RF-10 por ser prioridad C.
- **Sí:** las coordenadas se validan contra una caja del municipio configurable, como eligió el usuario. Respeta la regla de `CLAUDE.md` de no fijar valores municipales.
- **No:** solo los rangos del planeta, ni una caja fija de Guatemala en el código.
- **Sí:** tabla genérica `parametros (clave, valor jsonb)` reutilizable por otras specs, con un endpoint de administración solo para `limites_municipio`.
- **No:** editar solo por SQL, ni una tabla `municipio` con columnas.
- **Sí:** sin la caja configurada, cualquier coordenada se rechaza con `UBICACION_NO_CONFIGURADA`, como eligió el usuario. La queja se puede registrar sin coordenadas, así que el registro no se bloquea.
- **No:** aceptar con los rangos del planeta, ni cargar una caja inicial en la migración.
- **Sí:** `lat` y `lng` van juntas o no van, con un `CHECK` en la base.
- **Sí:** las coordenadas las pueden enviar el vecino, el receptor y el supervisor.
- **No:** solo el vecino.
- **Sí:** `GET /api/v1/parametros/limites-municipio` con sesión, para que el formulario centre el mapa o lo oculte si no hay configuración.
- **Sí:** los bordes de la caja cuentan como dentro, las coordenadas se redondean a 6 decimales, y no se admiten cajas que crucen el antimeridiano. Son detalles que propone esta spec y que no afectan a Guatemala.
- **Sí:** cambiar la caja no reescribe los tickets existentes. Igual que en SPEC 14, la configuración aplica al registrar.
- **Sí:** los nombres de los 5 códigos de error y la forma de `LimitesMunicipio` los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una caja rectangular acepta puntos de municipios vecinos que caen dentro del rectángulo | Es una aproximación suficiente para RF-10 (prioridad C). Un polígono exacto, con PostGIS o GeoJSON, sería otra spec. |
| El administrador olvida configurar la caja y ningún formulario puede enviar coordenadas | El `GET` devuelve `null`, y el formulario puede ocultar el mapa. `CLAUDE.md` lo documenta como parte de la puesta en marcha. |
| La tabla genérica `parametros` acumula valores sin esquema | Cada clave tiene su validador en el dominio, como `validarLimites`, y se escribe solo por endpoints que lo aplican. |
| SPEC 12 y 14 también cambian el cuerpo de `POST /tickets`, y los tres cambios pueden chocar | Cada spec lista su cambio. Al implementarlas en orden (12, 14, 15), cada una parte del validador anterior. |
| La numeración `0014` supone que las migraciones de SPEC 08 a 13 se aplicaron antes | Si el orden cambia, se renumera al implementarla, antes de llegar a `main`. |

## Lo que **no** está en esta spec

- Mapa Leaflet y teselas.
- Geocodificación.
- Geometría de zonas y polígono del municipio.
- Otros parámetros y su pantalla.
- Mostrar o editar coordenadas después del registro.

Cada uno de estos temas, cuando llegue, va en su propia spec.
