# SPEC 40 — Administración de dependencias, categorías y zonas

> **Estado:** Implementado
> **Depende de:** SPEC 03, SPEC 05, SPEC 08, SPEC 12, SPEC 14, SPEC 19, SPEC 21, SPEC 29
> **Fecha:** 2026-10-23
> **Objetivo:** Permitir que el administrador cree, renombre, active y desactive dependencias, categorías (con su dependencia, que es la regla de asignación) y zonas, sin borrar nunca, mediante `/api/v1/admin/{dependencias,categorias,zonas}` y las pantallas `/admin/dependencias`, `/admin/categorias` y `/admin/zonas`.

## Por qué existe esta spec

RF-41 pide que el administrador gestione los catálogos: dependencias, categorías, reglas de asignación, prioridades, SLA, zonas, motivos de rechazo, calendario laboral y campos adicionales. `CLAUDE.md` exige que los conceptos municipales sean datos administrables y nunca código.
Las tablas `dependencias`, `categorias` y `zonas` existen desde SPEC 03 y solo se cargan con `seed:dev` (SPEC 05). En producción no hay forma de crearlas.

### División de RF-41

El usuario decidió dividir RF-41 así:

| Catálogo | Dónde |
| --- | --- |
| SLA | SPEC 29 (ya existe) |
| Campos adicionales | SPEC 14 (API). El editor visual va en otra spec |
| Dependencias, categorías y zonas | **Esta spec** |
| Reglas de asignación | **Esta spec**: la regla es "la categoría define la dependencia" (SPEC 19), y se administra al editar la categoría |
| Calendario laboral | La siguiente spec |
| Motivos de rechazo | Una spec posterior |
| Prioridades | Quedan fijas (ver el conflicto abajo) |

### Conflicto con el documento de definición

RF-41 incluye las "prioridades" como catálogo administrable. Pero las 4 prioridades (`baja`, `media`, `alta` y `urgente`) son parte del modelo de SLA: están en el `CHECK` de `tickets` y de `politicas_sla` (SPEC 03), en `PRIORIDADES` (SPEC 04) y en la regla de monotonía de la matriz (SPEC 29).
Por decisión del usuario, siguen fijas. Sus etiquetas se ajustan en los archivos de traducción. El conflicto queda registrado aquí y en `CLAUDE.md`.

## Alcance

**Incluido:**

- Migración `0033_catalogos_admin`:
  - `zonas.activa`.
  - `CHECK` del largo de los nombres.
  - Unicidad sin distinguir mayúsculas.
  - `dependencias.coordinador_id` marcado como obsoleto con un `COMMENT`.
- Reglas en el dominio (`domain/catalogos/`): nombres, desactivación de dependencias y activación de categorías.
- API de administración, protegida por `admin.catalogos` (SPEC 08), para las 3 tablas: listar, crear y editar (nombre, relaciones y `activa`). No hay `DELETE`.
- Desactivar una dependencia con categorías activas responde `409 DEPENDENCIA_EN_USO`.
- Una categoría nueva nace inactiva. Activarla sin SLA completo (SPEC 29) responde `409 SLA_INCOMPLETO`.
- Cambiar la dependencia de una categoría solo afecta a las aceptaciones futuras.
- **Cambio sobre SPEC 14:** `GET /api/v1/zonas` devuelve solo las zonas activas, y registrar una queja con una zona inactiva se rechaza.
- Frontend: tres pantallas de administración y sus tarjetas en el índice `/admin` (SPEC 29).
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- El calendario laboral (la siguiente spec de RF-41).
- Los motivos de rechazo como catálogo.
- Las prioridades configurables.
- Reglas de asignación por zona, o autoasignación de técnicos.
- El editor visual de campos adicionales (SPEC 14 sigue solo por API).
- Administrar `dependencias.coordinador_id`, o quitar la columna.
- Mover las quejas abiertas al cambiar la dependencia de una categoría. Se trasladan una por una (SPEC 21).
- Cambiar los tipos de zona, que siguen fijos en el `CHECK`.
- Borrar registros.
- Registrar los cambios en la bitácora (RF-42).
- Importar catálogos desde archivos.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0033_catalogos_admin.ts`

```sql
ALTER TABLE zonas ADD COLUMN activa boolean NOT NULL DEFAULT true;

ALTER TABLE dependencias ADD CONSTRAINT dependencias_nombre_largo CHECK (char_length(nombre) BETWEEN 1 AND 120);
ALTER TABLE categorias   ADD CONSTRAINT categorias_nombre_largo   CHECK (char_length(nombre) BETWEEN 1 AND 120);
ALTER TABLE zonas        ADD CONSTRAINT zonas_nombre_largo        CHECK (char_length(nombre) BETWEEN 1 AND 120);

CREATE UNIQUE INDEX dependencias_nombre_ci_uq ON dependencias (lower(nombre));
CREATE UNIQUE INDEX categorias_nombre_ci_uq   ON categorias (lower(nombre));
CREATE UNIQUE INDEX zonas_nombre_tipo_ci_uq   ON zonas (lower(nombre), tipo);

COMMENT ON COLUMN dependencias.coordinador_id IS
  'Obsoleto: los coordinadores se identifican por permiso y dependencia (SPEC 31, 36, 40). No se administra.';
```

- Los datos de `seed:dev` (SPEC 05) cumplen las restricciones.
- El `down` deshace todo en orden inverso.
- No hay tablas nuevas.

### Reglas (`backend/src/domain/catalogos/`)

```ts
// nombre.ts
// Recorta, colapsa espacios internos repetidos y valida de 1 a 120 caracteres.
// Lanza ReglaDeNegocioError NOMBRE_INVALIDO.
export function normalizarNombre(nombre: string): string;

// dependencia.ts
// Lanza DEPENDENCIA_EN_USO, con las categorías activas como detalles, si se intenta desactivar con categorías activas.
export function exigirDesactivable(categoriasActivas: { id: number; nombre: string }[]): void;

// categoria.ts
// Lanza SLA_INCOMPLETO si se activa sin las 4 prioridades en politicas_sla (SPEC 29).
// Lanza DEPENDENCIA_INACTIVA si su dependencia está inactiva.
export function exigirActivable(slaCompleto: boolean, dependenciaActiva: boolean): void;
```

| Regla | Código | HTTP |
| --- | --- | --- |
| Nombre vacío o de más de 120 caracteres | `NOMBRE_INVALIDO` | 400 |
| Nombre repetido (sin distinguir mayúsculas; en las zonas, dentro del mismo tipo) | `NOMBRE_DUPLICADO` | 409 |
| Desactivar una dependencia con categorías activas | `DEPENDENCIA_EN_USO` (con `detalles`) | 409 |
| Crear o mover una categoría a una dependencia inactiva | `DEPENDENCIA_INACTIVA` | 409 |
| Activar una categoría sin SLA completo | `SLA_INCOMPLETO` | 409 |
| Activar una categoría cuya dependencia está inactiva | `DEPENDENCIA_INACTIVA` | 409 |
| Id inexistente | `NO_ENCONTRADO` | 404 |

- Desactivar una dependencia no depende de sus usuarios ni de sus quejas abiertas. Las quejas siguen su curso, y los usuarios conservan su dependencia.
- Una dependencia inactiva no aparece en `GET /dependencias` (SPEC 21), y sus categorías no aparecen en `GET /categorias` (SPEC 14).
- Desactivar una categoría la oculta del registro (SPEC 14 y 18) y del triage (SPEC 19, `CATEGORIA_INVALIDA`). Las quejas ya registradas con esa categoría no cambian.
- Cambiar la dependencia de una categoría no toca `tickets`. Las quejas ya aceptadas conservan su `dependencia_id`, y solo las aceptaciones posteriores usan la nueva (SPEC 19).

### Endpoints

Todos usan `autenticar` y `requierePermiso('admin.catalogos')`, y los cuerpos se validan con Zod `strict`.

| Endpoint | Cuerpo | Respuesta |
| --- | --- | --- |
| `GET /api/v1/admin/dependencias` | — | `200 { datos: DependenciaAdminDto[] }`, ordenadas por `nombre` |
| `POST /api/v1/admin/dependencias` | `{ nombre }` | `201` con el DTO, `activa: true` |
| `PATCH /api/v1/admin/dependencias/:id` | `{ nombre?, activa? }` (al menos uno) | `200` con el DTO |
| `GET /api/v1/admin/categorias` | — | `200 { datos: CategoriaAdminDto[] }`, ordenadas por `nombre` |
| `POST /api/v1/admin/categorias` | `{ nombre, dependenciaId }` | `201` con el DTO, `activa: false` y `camposExtra: []` |
| `PATCH /api/v1/admin/categorias/:id` | `{ nombre?, dependenciaId?, activa? }` (al menos uno) | `200` con el DTO |
| `GET /api/v1/admin/zonas` | — | `200 { datos: ZonaAdminDto[] }`, ordenadas por `tipo` y `nombre` |
| `POST /api/v1/admin/zonas` | `{ nombre, tipo }` | `201` con el DTO, `activa: true` |
| `PATCH /api/v1/admin/zonas/:id` | `{ nombre?, tipo?, activa? }` (al menos uno) | `200` con el DTO |

```ts
export interface DependenciaAdminDto {
  id: number;
  nombre: string;
  activa: boolean;
  categoriasActivas: number;
  usuariosActivos: number;
  quejasAbiertas: number;          // estados no finales
}

export interface CategoriaAdminDto {
  id: number;
  nombre: string;
  activa: boolean;
  dependencia: { id: number; nombre: string; activa: boolean };
  camposExtra: number;             // cantidad de campos definidos (SPEC 14)
  slaCompleto: boolean;            // SPEC 29
}

export interface ZonaAdminDto {
  id: number;
  nombre: string;
  tipo: 'zona' | 'colonia' | 'aldea';
  activa: boolean;
}
```

- Los listados de administración incluyen los registros activos e inactivos.
- Cada `PATCH` corre en una transacción con `SELECT … FOR UPDATE` del registro. Para una dependencia, también se bloquean sus categorías antes de comprobar `DEPENDENCIA_EN_USO`, para que no se active una categoría al mismo tiempo.
- Un `UNIQUE` violado se traduce a `409 NOMBRE_DUPLICADO`.
- Lo implementan `CatalogosAdminService` (`application/services/catalogos-admin.service.ts`) y `CatalogosAdminRepository`, con su implementación Knex.

### Cambio sobre SPEC 14 y SPEC 12: zonas inactivas

- `GET /api/v1/zonas` devuelve solo las zonas con `activa = true`.
- `POST /api/v1/tickets` (SPEC 12) rechaza una zona inactiva con el mismo error que una zona inexistente.
- Las quejas existentes con una zona que se desactiva no cambian, y la siguen mostrando.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Índice `/admin` | El índice de SPEC 29 suma las tarjetas "Dependencias", "Categorías" y "Zonas", con su descripción |
| Rutas | `/admin/dependencias`, `/admin/categorias` y `/admin/zonas` en `RUTAS_PROTEGIDAS`, con `roles: ['administrador']` y `enMenu: false` |
| Páginas | `features/admin/catalogos/DependenciasPage.tsx`, `CategoriasPage.tsx` y `ZonasPage.tsx`: una tabla (o tarjetas en celular), un interruptor "Mostrar inactivas" (apagado por defecto) y el botón "Nueva …" |
| Dependencias | Columnas: nombre, estado, categorías activas, usuarios y quejas abiertas. Acciones: "Editar nombre" y "Desactivar" o "Activar". Un `409 DEPENDENCIA_EN_USO` lista las categorías activas, cada una con un enlace a editarla |
| Categorías | Columnas: nombre, dependencia (con "Inactiva" si corresponde), estado, la etiqueta "Sin SLA" (enlace a `/admin/sla`) y "N campos adicionales". El diálogo de crear o editar tiene el nombre y un selector de dependencia que solo muestra las activas. "Activar" muestra el error `SLA_INCOMPLETO` con el enlace a `/admin/sla` |
| Aviso al mover | Al cambiar la dependencia de una categoría: "Las quejas ya aceptadas siguen en su dependencia actual. Solo las nuevas irán a <nueva>" |
| Zonas | Columnas: nombre, tipo (con la etiqueta traducida) y estado. El diálogo tiene el nombre y el tipo (los 3 valores fijos) |
| Confirmaciones | Desactivar pide confirmación: "<nombre> dejará de estar disponible para quejas nuevas" |
| Errores | `NOMBRE_DUPLICADO` se muestra en el campo del nombre. Los demás `409` se muestran en un aviso dentro del diálogo |
| Textos | `locales/es/admin.json` y `comun.json`. Las etiquetas de los tipos de zona y de las prioridades salen de las traducciones |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: zonas.activa, endpoints admin, conflicto de prioridades
CLAUDE.md
backend/
  src/
    app.ts
    container.ts
    domain/catalogos/nombre.ts
    domain/catalogos/dependencia.ts
    domain/catalogos/categoria.ts
    domain/repositories/catalogos-admin-repository.ts
    application/services/catalogos-admin.service.ts
    application/errors/error-de-aplicacion.ts                # códigos nuevos
    infrastructure/
      database/migrations/0033_catalogos_admin.ts
      repositories/knex-catalogos-admin-repository.ts
      repositories/knex-catalogo-lectura-repository.ts       # GET /zonas solo activas (SPEC 14)
      repositories/knex-registro-ticket-repository.ts        # rechaza zona inactiva (SPEC 12)
    presentation/
      validators/catalogos-admin.validators.ts
      controllers/catalogos-admin.controller.ts
      routes/catalogos-admin.routes.ts
      middlewares/manejador-errores.ts
  tests/
    unit/catalogos/nombre.test.ts
    unit/catalogos/reglas-catalogos.test.ts
    unit/catalogos/catalogos-admin.service.test.ts
    db/schema.test.ts                                        # 0033
    db/catalogos-admin.api.test.ts                           # Supertest contra Postgres real
    db/campos-extra.api.test.ts                              # GET /zonas solo activas (SPEC 14)
    db/tickets.api.test.ts                                   # zona inactiva (SPEC 12)
frontend/
  src/
    shared/auth/rutas.ts
    app/router.tsx
    features/admin/pages/AdminPage.tsx                       # 3 tarjetas nuevas
    features/admin/api/catalogos-admin-api.ts
    features/admin/catalogos/DependenciasPage.tsx
    features/admin/catalogos/CategoriasPage.tsx
    features/admin/catalogos/ZonasPage.tsx
    features/admin/catalogos/DialogoCatalogo.tsx
    locales/es/admin.json  locales/es/comun.json
  tests/
    features/admin/dependencias-page.test.tsx
    features/admin/categorias-page.test.tsx
    features/admin/zonas-page.test.tsx
    features/admin/admin-page.test.tsx
    app/router.test.tsx
```

## Plan de implementación

1. Crear `domain/catalogos/` con `normalizarNombre`, `exigirDesactivable` y `exigirActivable`, y sus pruebas. Casos:
   - `"  Agua   potable "` pasa a `"Agua potable"`. Un nombre vacío o de 121 caracteres lanza `NOMBRE_INVALIDO`.
   - Desactivar con 2 categorías activas lanza `DEPENDENCIA_EN_USO` con las dos en los detalles.
   - Activar sin SLA lanza `SLA_INCOMPLETO`, y con la dependencia inactiva lanza `DEPENDENCIA_INACTIVA`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0033_catalogos_admin.ts` y ampliar `tests/db/schema.test.ts`:
   - Existen `zonas.activa`, los `CHECK`, los índices sin distinguir mayúsculas y el comentario.
   - `"agua potable"` choca con `"Agua potable"`.
   - El `down` lo elimina todo.

   Verificación: `npm run test:db` pasa, `migrate:rollback` seguido de `migrate:latest` funciona, y `seed:dev` sigue cargando sus datos.
3. Crear `CatalogosAdminRepository`, su implementación Knex y `CatalogosAdminService`, y las rutas de dependencias. Crear `tests/db/catalogos-admin.api.test.ts`. Casos:
   - Listar muestra los contadores.
   - Crear → `201`. Un nombre repetido en otro uso de mayúsculas → `409 NOMBRE_DUPLICADO`.
   - Renombrar → `200`.
   - Desactivar con categorías activas → `409 DEPENDENCIA_EN_USO` con los detalles. Sin categorías activas → `200`, y desaparece de `GET /dependencias` (SPEC 21).
   - Las quejas abiertas no bloquean.
   - Los roles sin `admin.catalogos` → `403`. Sin sesión → `401`.

   Verificación: `npm run test:db` pasa.
4. Agregar las rutas de categorías. Ampliar las pruebas. Casos:
   - Crear nace inactiva y con `camposExtra: []`. Con una dependencia inactiva → `409 DEPENDENCIA_INACTIVA`.
   - Activar sin SLA → `409 SLA_INCOMPLETO`. Después de definir el SLA (SPEC 29) → `200`, y aparece en `GET /categorias` (SPEC 14).
   - Mover a otra dependencia no cambia el `dependencia_id` de las quejas existentes, y una aceptación posterior (SPEC 19) usa la nueva.
   - Desactivar la oculta de `GET /categorias`.

   Verificación: `npm run test:db` pasa.
5. Agregar las rutas de zonas, y los cambios en `GET /zonas` (SPEC 14) y en el registro (SPEC 12). Ampliar las pruebas. Casos:
   - Crear, renombrar y cambiar el tipo.
   - El mismo nombre con otro tipo se permite. Con el mismo tipo → `409`.
   - Desactivar la oculta de `GET /zonas`, y registrar una queja con ella falla igual que con una zona inexistente.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan, y las pruebas de SPEC 12 y 14 siguen pasando.
6. Frontend: agregar las 3 rutas y tarjetas, `catalogos-admin-api.ts` y `DialogoCatalogo.tsx`, y crear `DependenciasPage`. Crear `dependencias-page.test.tsx` y ampliar `router.test.tsx` y `admin-page.test.tsx`. Casos:
   - Solo el administrador entra.
   - "Mostrar inactivas" filtra.
   - Crear, renombrar y desactivar (con confirmación) funcionan.
   - El `409 DEPENDENCIA_EN_USO` lista las categorías con sus enlaces.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
7. Crear `CategoriasPage` y `ZonasPage` con sus pruebas. Casos:
   - El selector de dependencia solo ofrece las activas.
   - "Sin SLA" enlaza a `/admin/sla`.
   - Activar sin SLA muestra el error con el enlace.
   - El aviso al mover la categoría aparece.
   - `NOMBRE_DUPLICADO` se muestra en el campo.
   - El tipo de zona se elige entre los 3 valores traducidos.

   Verificación: `npm test` y `npm run build` pasan.
8. Actualizar la sección 6 del documento de definición (`zonas.activa`, los endpoints de administración y el conflicto de prioridades) y `CLAUDE.md`:
   - Los catálogos se desactivan y nunca se borran.
   - Una categoría nace inactiva y se activa con SLA completo.
   - La regla de asignación es "la categoría define la dependencia", y cambiarla no mueve las quejas existentes.
   - `coordinador_id` es obsoleto.
   - Las prioridades son fijas.
   - La división de RF-41.

   Verificación manual con el backend y `seed:dev`: `administrador@vozmuni.test` crea la dependencia "Dirección de Parques" y la categoría "Árboles caídos" (nace inactiva). Intenta activarla y ve "Sin SLA". Define su SLA en `/admin/sla` y la activa. `vecino@vozmuni.test` la ve en el formulario de registro. Al desactivar "Dirección de Parques", aparece el error con la categoría activa listada. A 360 px, las pantallas no producen scroll horizontal.

## Criterios de aceptación

- [ ] La migración `0033_catalogos_admin` agrega `zonas.activa`, los `CHECK` de 1 a 120 caracteres en los nombres, la unicidad sin distinguir mayúsculas y el comentario de obsoleto en `dependencias.coordinador_id`. Su `down` lo deshace y `seed:dev` sigue funcionando.
- [ ] El administrador lista, crea y edita (nombre, relaciones y `activa`) dependencias, categorías y zonas. Ningún endpoint borra registros.
- [ ] Los nombres se recortan y se normalizan, y un nombre repetido (sin distinguir mayúsculas, y en las zonas dentro del mismo tipo) responde `409 NOMBRE_DUPLICADO`.
- [ ] Desactivar una dependencia con categorías activas responde `409 DEPENDENCIA_EN_USO` con esas categorías. Los usuarios y las quejas abiertas no lo impiden.
- [ ] Una categoría se crea inactiva y con `camposExtra: []`. Activarla sin SLA completo responde `409 SLA_INCOMPLETO`, y crearla, moverla o activarla con una dependencia inactiva responde `409 DEPENDENCIA_INACTIVA`.
- [ ] Cambiar la dependencia de una categoría no modifica ninguna fila de `tickets`, y las aceptaciones posteriores usan la nueva dependencia.
- [ ] `GET /api/v1/zonas` solo devuelve las zonas activas, y registrar una queja con una zona inactiva se rechaza igual que con una zona inexistente.
- [ ] Los roles sin `admin.catalogos` reciben `403` en todos los endpoints de administración, y las peticiones sin sesión `401`.
- [ ] `/admin` muestra las tarjetas de Dependencias, Categorías y Zonas, y solo el administrador abre sus pantallas.
- [ ] Las pantallas muestran los contadores, las etiquetas "Inactiva" y "Sin SLA" con texto, los errores `409` con sus enlaces, la confirmación al desactivar y el aviso al mover una categoría.
- [ ] Ningún archivo nuevo o modificado contiene nombres de dependencias, categorías o zonas en la lógica, ni compara nombres de rol.
- [ ] A 360 px de ancho, las pantallas y los diálogos no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan los endpoints, las reglas, el conflicto de prioridades y la división de RF-41.

## Decisiones

- **Sí:** RF-41 se divide. Esta spec cubre la estructura organizativa (dependencias, categorías y zonas). El calendario laboral va en la siguiente, y los motivos de rechazo después.
- **Sí:** las prioridades siguen fijas, como decidió el usuario, porque son parte del modelo de SLA. El conflicto con RF-41 queda registrado.
- **No:** convertir las prioridades en un catálogo.
- **Sí:** la "regla de asignación" de RF-41 es "la categoría define la dependencia" (SPEC 19), y se administra al editar la categoría.
- **No:** reglas por zona o autoasignación, que irían en una spec propia si se piden.
- **Sí:** solo se desactiva, nunca se borra. Las quejas históricas referencian estos registros.
- **Sí:** desactivar una dependencia con categorías activas se bloquea con `409` y la lista de las categorías.
- **No:** desactivar en cascada.
- **Sí:** se agrega `zonas.activa`, y los 3 tipos de zona siguen fijos en el `CHECK`.
- **No:** tipos de zona administrables.
- **Sí:** `dependencias.coordinador_id` no se administra y se marca obsoleto. Los coordinadores se identifican por permiso y dependencia (SPEC 31 y 36), así que habría dos fuentes de verdad.
- **No:** administrarlo como "responsable", ni quitar la columna ahora.
- **Sí:** una categoría nace inactiva y solo se activa con SLA completo. Así nunca se acepta una queja sin plazo (SPEC 30).
- **Sí:** cambiar la dependencia de una categoría solo afecta a las aceptaciones futuras.
- **No:** mover las quejas abiertas.
- **Sí:** el editor de campos adicionales queda para otra spec. La pantalla solo muestra cuántos campos tiene cada categoría.
- **Sí:** la unicidad sin distinguir mayúsculas y la normalización de espacios, para evitar duplicados como "Agua potable" y "agua  potable". Es una propuesta de esta spec.
- **Sí:** los contadores de uso de cada dependencia (categorías, usuarios y quejas abiertas), para que el administrador vea el impacto antes de desactivar. Es una propuesta de esta spec.
- **Sí:** los textos, el largo máximo (120) y la disposición de las pantallas los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una base con nombres que solo difieren en mayúsculas hace fallar la migración | `seed:dev` no los tiene, y no hay datos de producción. El error nombra el índice que falla. |
| Desactivar una zona usada por muchas quejas confunde a quien las consulta | Las quejas existentes siguen mostrando la zona. Solo se oculta del registro. |
| Un administrador mueve una categoría y espera que las quejas abiertas la sigan | El diálogo lo avisa, y las quejas se trasladan con SPEC 21. |
| Sin bitácora, no se sabe quién desactivó un catálogo | RF-42 lo agrega. Mientras tanto, la acción queda restringida a `admin.catalogos`. |
| Toca contratos de SPEC 12 y SPEC 14 (Borrador) | Las pruebas de esas specs deben seguir pasando. El paso 5 las vuelve a ejecutar. |

## Lo que **no** está en esta spec

- Calendario laboral y motivos de rechazo.
- Prioridades configurables y reglas de asignación por zona.
- Editor de campos adicionales.
- Administración o eliminación de `coordinador_id`.
- Mover quejas abiertas al cambiar la dependencia de una categoría.
- Tipos de zona configurables, borrado, bitácora e importación.

Cada uno de estos temas, cuando llegue, va en su propia spec.
