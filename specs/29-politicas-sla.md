# SPEC 29 — Administración de las políticas de SLA por categoría y prioridad

> **Estado:** Aprobado
> **Depende de:** SPEC 03, SPEC 05, SPEC 06, SPEC 08, SPEC 14, SPEC 17
> **Fecha:** 2026-10-23
> **Objetivo:** Permitir que el administrador consulte y reemplace, completa y validada, la matriz de plazos de primera respuesta y de resolución (en horas hábiles) de cada categoría para las 4 prioridades, mediante `GET /api/v1/admin/politicas-sla`, `PUT /api/v1/admin/categorias/:id/politicas-sla` y la pantalla `/admin/sla`.

## Por qué existe esta spec

RF-26 pide que cada combinación de categoría y prioridad tenga un plazo de primera respuesta y uno de resolución, en horas hábiles. RF-41 pide que el administrador gestione esos SLA como catálogo.
La tabla `politicas_sla` existe desde SPEC 03, y `seed:dev` carga 16 filas de ejemplo (SPEC 05). Pero no hay ninguna forma de administrarla: hoy solo se cambia con SQL. `CLAUDE.md` exige que los SLA sean datos editables por el administrador y nunca valores fijos en el código.
Esta spec cubre solo la administración de las políticas. No calcula vencimientos.

### Lo que queda para las siguientes specs de SLA

- Calcular `vence_respuesta` y `vence_resolucion` en horas hábiles contra `calendario_laboral` (RF-27). Eso requiere definir una jornada laboral, que hoy no existe (SPEC 05 ya señaló el vacío).
- Pausar el plazo en `en_espera`, y reiniciarlo al reabrir (SPEC 27) y al trasladar (SPEC 21).
- La alerta del 80 % (RF-28) y el escalamiento (RF-29).

Esas specs leerán `politicas_sla` tal como queda aquí.

## Alcance

**Incluido:**

- Migración `0024_politicas_sla`: columnas `actualizado_en` y `actualizado_por`, y el `CHECK` "respuesta ≤ resolución".
- Reglas de dominio de la matriz (`domain/sla/politica-sla.ts`): las 4 prioridades exactas, horas enteras positivas, respuesta ≤ resolución y monotonía por prioridad.
- `GET /api/v1/admin/politicas-sla`: todas las categorías con su matriz, la marca de completa y la última actualización.
- `PUT /api/v1/admin/categorias/:id/politicas-sla`: reemplaza las 4 filas de la categoría en una transacción.
- Los dos endpoints están protegidos por `admin.catalogos`.
- Frontend:
  - `/admin` deja de ser un placeholder y pasa a ser un índice con el enlace "Políticas de SLA".
  - La pantalla `/admin/sla` muestra la tabla de categorías, la marca "Sin SLA" y un diálogo de edición de la matriz.
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- El cálculo de vencimientos, la jornada laboral, la pausa, el reinicio, el 80 % y el escalamiento (RF-27, RF-28, RF-29).
- Recalcular los vencimientos de las quejas abiertas al cambiar una política. Una política nueva solo aplica a los cálculos posteriores.
- Que otros roles lean las políticas, por ejemplo el supervisor al elegir la prioridad en el triage.
- El historial completo de cambios y su registro en `bitacora` (RF-42). Esta spec solo guarda la última actualización.
- Borrar la matriz de una categoría.
- Una política por defecto para las categorías sin matriz.
- Un tope máximo de horas.
- El CRUD de categorías, dependencias, calendario y demás catálogos (RF-41).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0024_politicas_sla.ts`

```sql
ALTER TABLE politicas_sla
  ADD COLUMN actualizado_en timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN actualizado_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
  ADD CONSTRAINT politicas_sla_respuesta_no_mayor CHECK (horas_respuesta <= horas_resolucion);
```

- `actualizado_por` es `NULL` en las filas que no cargó el administrador, como las de `seed:dev`.
- El `CHECK` se valida sobre las filas existentes. Las 16 de `seed:dev` lo cumplen. Si una base tuviera filas que lo violan, la migración falla y hay que corregirlas antes.
- La monotonía entre prioridades no se expresa como `CHECK`, porque compara varias filas. La garantiza el dominio.
- El `down` borra el `CHECK` y las dos columnas.
- No hay tablas nuevas.

### Reglas (`backend/src/domain/sla/politica-sla.ts`)

```ts
import { PRIORIDADES, type Prioridad } from '../ticket/prioridad';

export interface PlazoSla {
  prioridad: Prioridad;
  horasRespuesta: number;    // horas hábiles hasta la primera respuesta
  horasResolucion: number;   // horas hábiles hasta la resolución
}

// Las 4 prioridades, en el orden de PRIORIDADES.
export type MatrizSla = readonly PlazoSla[];

export type ProblemaMatriz =
  | 'PRIORIDAD_FALTANTE'
  | 'PRIORIDAD_DUPLICADA'
  | 'HORAS_INVALIDAS'                    // no es un entero ≥ 1
  | 'RESPUESTA_MAYOR_QUE_RESOLUCION'
  | 'NO_MONOTONA';                       // una prioridad más alta tiene más horas que una más baja

export interface DetalleMatriz {
  prioridad: Prioridad;
  campo: 'horasRespuesta' | 'horasResolucion' | null;
  problema: ProblemaMatriz;
}

// Devuelve la matriz ordenada por PRIORIDADES. Si no es válida, lanza
// ReglaDeNegocioError('MATRIZ_SLA_INVALIDA') con todos los DetalleMatriz encontrados.
export function validarMatriz(plazos: readonly PlazoSla[]): MatrizSla;
```

Reglas, todas evaluadas para reportar todos los problemas a la vez:

| Regla | Problema |
| --- | --- |
| Están `urgente`, `alta`, `media` y `baja`, cada una una sola vez | `PRIORIDAD_FALTANTE`, `PRIORIDAD_DUPLICADA` |
| `horasRespuesta` y `horasResolucion` son enteros ≥ 1 y caben en `integer` | `HORAS_INVALIDAS` |
| `horasRespuesta ≤ horasResolucion` en cada prioridad | `RESPUESTA_MAYOR_QUE_RESOLUCION` |
| `urgente ≤ alta ≤ media ≤ baja`, por separado en las dos columnas. Se permiten valores iguales | `NO_MONOTONA`, en la prioridad que rompe el orden |

- El orden de las prioridades sale de `PRIORIDADES` (`domain/ticket/prioridad.ts`), que va de `baja` a `urgente`. No se escribe de nuevo. En ese orden, la monotonía exige horas que no crecen: `baja ≥ media ≥ alta ≥ urgente`.
- `validarMatriz` es pura y no importa Knex ni Express.
- Las horas son horas hábiles. Esta spec no las convierte a fechas.

### Puerto (`backend/src/domain/repositories/politica-sla-repository.ts`)

```ts
export interface CategoriaConSla {
  categoria: { id: number; nombre: string; activa: boolean };
  dependencia: { id: number; nombre: string };
  plazos: PlazoSla[];          // las filas que existan, en el orden de PRIORIDADES (0 a 4)
  completa: boolean;           // tiene las 4 prioridades
  actualizadoEn: Date | null;  // el máximo de sus filas
  actualizadoPor: { id: number; nombre: string } | null;  // el autor de la fila más reciente
}

export interface PoliticaSlaRepository {
  listarPorCategoria(): Promise<CategoriaConSla[]>;
  obtenerCategoria(categoriaId: number): Promise<CategoriaConSla | null>;
  // En la transacción del servicio: bloquea la categoría y hace upsert de las 4 filas.
  reemplazar(categoriaId: number, matriz: MatrizSla, usuarioId: number, ahora: Date): Promise<void>;
}
```

`KnexPoliticaSlaRepository` implementa `reemplazar` con `SELECT … FROM categorias WHERE id = ? FOR UPDATE` y un `INSERT … ON CONFLICT (categoria_id, prioridad) DO UPDATE` de las 4 filas. Así una categoría con filas sueltas (cargadas por SQL) queda completa, y dos `PUT` simultáneos se aplican uno después del otro.

### Endpoints

| Endpoint | Protección | Cuerpo | Respuesta | Errores |
| --- | --- | --- | --- | --- |
| `GET /api/v1/admin/politicas-sla` | `autenticar` + `requierePermiso('admin.catalogos')` | — | `200 { datos: CategoriaSlaDto[] }`, todas las categorías (activas e inactivas), ordenadas por `nombre` | `401`, `403` |
| `PUT /api/v1/admin/categorias/:id/politicas-sla` | `autenticar` + `requierePermiso('admin.catalogos')` | `{ plazos: PlazoSla[] }` (Zod `strict`, exactamente 4 elementos) | `200` con el `CategoriaSlaDto` actualizado | `400 VALIDACION`, `400 MATRIZ_SLA_INVALIDA` con `detalles`, `404 NO_ENCONTRADO`, `401`, `403` |

```ts
export interface CategoriaSlaDto {
  categoria: { id: number; nombre: string; activa: boolean };
  dependencia: { id: number; nombre: string };
  plazos: PlazoSla[];
  completa: boolean;
  actualizadoEn: string | null;   // ISO 8601 en UTC
  actualizadoPor: { id: number; nombre: string } | null;
}
```

- `MATRIZ_SLA_INVALIDA` usa el campo opcional `detalles` del cuerpo de error (SPEC 14): `{ codigo, mensaje, detalles: DetalleMatriz[] }`.
- Se puede definir la matriz de una categoría inactiva, para dejarla lista antes de activarla.
- No hay `DELETE`. Una vez definida, la matriz solo se reemplaza completa.
- Cambiar una política no toca `tickets`. Los vencimientos ya calculados no cambian.
- Lo orquesta `PoliticasSlaService` (`application/services/politicas-sla.service.ts`): valida con `validarMatriz`, comprueba que la categoría exista y reemplaza la matriz en una transacción.

### Frontend

| Elemento | Detalle |
| --- | --- |
| `/admin` | `AdminPage` deja el placeholder y muestra un índice con una tarjeta "Políticas de SLA", con su descripción y un enlace a `/admin/sla`. Las demás secciones de administración se agregarán ahí |
| Ruta | `/admin/sla` en `RUTAS_PROTEGIDAS`: `roles: ['administrador']`, `enMenu: false`, `etiqueta: 'comun:menu.adminSla'` |
| Página | `features/admin/sla/PoliticasSlaPage.tsx`: una tabla con la categoría, la dependencia, la marca "Inactiva", un resumen de la matriz (respuesta / resolución por prioridad), la última actualización ("<fecha> por <nombre>", en `America/Guatemala`) y "Editar". En celular, cada categoría es una tarjeta |
| Sin SLA | Las categorías activas con `completa = false` llevan la etiqueta textual "Sin SLA" (no solo color) y aparecen primero. Arriba, un aviso: "N categorías activas no tienen SLA completo" |
| Diálogo | `DialogoMatrizSla.tsx`, con React Hook Form: 4 filas (una por prioridad, con la etiqueta traducida) y 2 campos numéricos por fila, "Primera respuesta (horas hábiles)" y "Resolución (horas hábiles)". Se precarga con los valores existentes, o vacío si no hay |
| Validación en el cliente | Las mismas 4 reglas, con mensajes en el campo. Las reglas del servidor siguen siendo las que deciden: un `400 MATRIZ_SLA_INVALIDA` muestra cada `detalle` en su campo |
| Aviso | En el diálogo: "Los cambios aplican a los plazos que se calculen a partir de ahora. Las quejas abiertas conservan sus plazos" |
| Después de guardar | Se invalida la lista, se cierra el diálogo y aparece "Guardamos el SLA de <categoría>" |
| Textos | `locales/es/admin.json` y `comun.json`. Las etiquetas de las prioridades salen de los archivos de traducción (RNF-16) |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas y 2 endpoints
CLAUDE.md
backend/
  src/
    app.ts
    container.ts
    domain/sla/politica-sla.ts
    domain/repositories/politica-sla-repository.ts
    application/services/politicas-sla.service.ts
    application/errors/error-de-aplicacion.ts         # MATRIZ_SLA_INVALIDA
    infrastructure/
      database/migrations/0024_politicas_sla.ts
      repositories/knex-politica-sla-repository.ts
    presentation/
      validators/politicas-sla.validators.ts
      controllers/politicas-sla.controller.ts
      routes/politicas-sla.routes.ts
      middlewares/manejador-errores.ts                # MATRIZ_SLA_INVALIDA → 400
  tests/
    unit/sla/politica-sla.test.ts
    unit/sla/politicas-sla.service.test.ts
    db/schema.test.ts                                 # 0024
    db/politicas-sla.api.test.ts                      # Supertest contra Postgres real
frontend/
  src/
    shared/auth/rutas.ts                              # /admin/sla
    app/router.tsx
    features/admin/pages/AdminPage.tsx                # índice
    features/admin/api/politicas-sla-api.ts
    features/admin/sla/PoliticasSlaPage.tsx
    features/admin/sla/DialogoMatrizSla.tsx
    features/admin/sla/validar-matriz.ts              # reglas del cliente
    locales/es/admin.json  locales/es/comun.json
  tests/
    features/admin/admin-page.test.tsx
    features/admin/politicas-sla-page.test.tsx
    features/admin/dialogo-matriz-sla.test.tsx
    app/router.test.tsx
```

## Plan de implementación

1. Crear `domain/sla/politica-sla.ts` y `tests/unit/sla/politica-sla.test.ts`. Casos:
   - La matriz de `seed:dev` (urgente 2/24, alta 8/48, media 24/72, baja 48/120) es válida y sale en el orden de `PRIORIDADES` (de `baja` a `urgente`), aunque llegue desordenada.
   - Si falta `baja`, el detalle es `PRIORIDAD_FALTANTE`. Si `alta` aparece dos veces, `PRIORIDAD_DUPLICADA`.
   - `0`, `-1`, `1.5` y `2147483648` dan `HORAS_INVALIDAS`.
   - `media` con 80/72 da `RESPUESTA_MAYOR_QUE_RESOLUCION`.
   - `alta` con más horas de resolución que `media` da `NO_MONOTONA` en `media`, con `campo: 'horasResolucion'`.
   - Los valores iguales entre prioridades son válidos.
   - Varios problemas a la vez se reportan todos.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0024_politicas_sla.ts` y ampliar `tests/db/schema.test.ts`:
   - Existen `actualizado_en` (NOT NULL) y `actualizado_por` (NULL, referencia a `usuarios`).
   - Un `INSERT` con `horas_respuesta > horas_resolucion` viola `politicas_sla_respuesta_no_mayor`.
   - El `down` elimina las columnas y el `CHECK`.

   Verificación: `npm run test:db` pasa, `migrate:rollback` seguido de `migrate:latest` funciona, y `seed:dev` sigue cargando las 16 filas.
3. Crear `PoliticaSlaRepository`, `KnexPoliticaSlaRepository` y `PoliticasSlaService`, con `politicas-sla.service.test.ts` y un repositorio falso. Casos:
   - Una matriz inválida lanza `MATRIZ_SLA_INVALIDA` sin llamar a `reemplazar`.
   - Una categoría inexistente lanza `NO_ENCONTRADO`.
   - Una matriz válida llama a `reemplazar` con el usuario y `ahora`.

   Verificación: `npm test` pasa.
4. Crear el validador, el controlador y las rutas, y conectarlos en `container.ts` y `app.ts`. Mapear `MATRIZ_SLA_INVALIDA` a `400` con `detalles`. Crear `tests/db/politicas-sla.api.test.ts`. Casos:
   - El administrador lista las categorías → `200`, con las 4 de `seed:dev` completas y `actualizadoPor: null`.
   - Una categoría sin políticas aparece con `completa: false` y `plazos: []`.
   - Una categoría con 2 filas sueltas, reemplazada con `PUT`, queda con 4 filas, `actualizado_por` del administrador y `completa: true`.
   - `PUT` con 3 plazos o con un campo extra → `400 VALIDACION`.
   - `PUT` no monótono → `400 MATRIZ_SLA_INVALIDA` con `detalles`, y la base no cambia.
   - `PUT` a una categoría inexistente → `404`.
   - `PUT` a una categoría inactiva → `200`.
   - El vecino, el técnico, el coordinador y el supervisor → `403` en los dos endpoints. Sin sesión → `401`.
   - `PUT` no modifica ninguna fila de `tickets`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
5. Frontend: convertir `AdminPage` en el índice con la tarjeta "Políticas de SLA". Agregar `/admin/sla` a `rutas.ts` y `router.tsx`. Ampliar `router.test.tsx`: el administrador abre `/admin/sla`, y los demás roles van a `/403`. Crear `admin-page.test.tsx`. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Crear `politicas-sla-api.ts`, `PoliticasSlaPage.tsx` y `politicas-sla-page.test.tsx`. Casos:
   - Muestra el resumen de cada matriz.
   - Las categorías activas incompletas aparecen primero con "Sin SLA", y el aviso las cuenta.
   - Las inactivas llevan "Inactiva".
   - La última actualización aparece en `America/Guatemala`.

   Verificación: `npm test` y `npm run build` pasan.
7. Crear `validar-matriz.ts`, `DialogoMatrizSla.tsx` y `dialogo-matriz-sla.test.tsx`. Casos:
   - Se precarga con los valores existentes.
   - Bloquea guardar con un campo vacío, con respuesta mayor que resolución o con una matriz no monótona, y muestra el mensaje en el campo.
   - Un `400 MATRIZ_SLA_INVALIDA` del servidor se muestra en el campo de cada `detalle`.
   - Al guardar se invalida la lista y aparece el aviso.
   - Muestra el aviso de que las quejas abiertas conservan sus plazos.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
8. Actualizar la sección 6 del documento de definición: la fila `politicas_sla` con `actualizado_en` y `actualizado_por`, y los 2 endpoints. Actualizar `CLAUDE.md`:
   - Que las políticas se administran por matriz completa por categoría.
   - Las 4 reglas de la matriz.
   - Que un cambio no recalcula las quejas abiertas.
   - Que el cálculo en horas hábiles queda para RF-27.

   Verificación manual con el backend y `seed:dev`: `administrador@vozmuni.test` abre `/admin`, entra a "Políticas de SLA", edita `Baches` con `media` en 80/72 y ve el error en el campo. La corrige a 24/96, guarda y ve "<fecha> por Administrador de desarrollo". `supervisor@vozmuni.test` intenta abrir `/admin/sla` y va a `/403`.

## Criterios de aceptación

- [ ] La migración `0024_politicas_sla` agrega `actualizado_en`, `actualizado_por` y el `CHECK` `horas_respuesta <= horas_resolucion`, y su `down` los elimina. `seed:dev` sigue funcionando después.
- [ ] `GET /api/v1/admin/politicas-sla` devuelve todas las categorías, ordenadas por nombre, con su dependencia, sus plazos en el orden de prioridad, `completa` y la última actualización.
- [ ] `PUT /api/v1/admin/categorias/:id/politicas-sla` reemplaza las 4 prioridades de la categoría en una transacción y guarda `actualizado_en` y `actualizado_por`.
- [ ] Una matriz que no tiene exactamente las 4 prioridades, con horas que no son enteros ≥ 1, con respuesta mayor que resolución o no monótona (urgente ≤ alta ≤ media ≤ baja) responde `400 MATRIZ_SLA_INVALIDA` con todos los `detalles`, y no cambia ninguna fila.
- [ ] Una categoría inexistente responde `404`. Los roles sin `admin.catalogos` reciben `403` y las peticiones sin sesión `401`, en los dos endpoints.
- [ ] Ningún endpoint borra políticas, y reemplazar una matriz no modifica ninguna fila de `tickets`.
- [ ] Ningún archivo nuevo o modificado contiene horas de SLA, nombres de categorías ni nombres de rol en la lógica, y el orden de prioridades sale de `PRIORIDADES`.
- [ ] `/admin` muestra el índice con "Políticas de SLA", y `/admin/sla` solo la abre el administrador.
- [ ] `/admin/sla` marca con el texto "Sin SLA" las categorías activas incompletas, las muestra primero y las cuenta en un aviso.
- [ ] El diálogo valida las 4 reglas en el cliente, muestra en su campo los `detalles` de un `400 MATRIZ_SLA_INVALIDA`, y avisa que las quejas abiertas conservan sus plazos.
- [ ] A 360 px de ancho, `/admin/sla` y el diálogo no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las columnas, los endpoints, las reglas de la matriz y que el cálculo queda para RF-27.

## Decisiones

- **Sí:** esta spec cubre solo la administración de las políticas (RF-26 y la parte de SLA de RF-41). El cálculo en horas hábiles, la pausa, el reinicio y el escalamiento van en las siguientes specs de SLA.
- **No:** incluir el cálculo de vencimientos, porque requiere definir una jornada laboral y tocar SPEC 19, 21, 22 y 27.
- **Sí:** la matriz se reemplaza completa por categoría, con las 4 prioridades juntas. Una categoría nunca queda a medias desde la API.
- **No:** el CRUD fila por fila, ni una política por defecto.
- **Sí:** un cambio de política solo aplica a los cálculos futuros. Es coherente con SPEC 27: un plazo ya comunicado no se mueve.
- **No:** recalcular las quejas abiertas, porque podría escalar o desescalar quejas de golpe.
- **Sí:** las reglas "respuesta ≤ resolución" y "monotonía por prioridad", como eligió el usuario. La primera también es un `CHECK` en la base. La segunda vive en el dominio, porque compara filas.
- **No:** un tope máximo de horas. Solo se exige que el valor quepa en `integer`.
- **Sí:** se permiten valores iguales entre prioridades (`≤`, no `<`). Una municipalidad puede tratar igual dos prioridades en una categoría. Es una propuesta de esta spec.
- **Sí:** se reportan todos los problemas a la vez en `detalles`, con el mismo formato que SPEC 14, para que el diálogo los muestre en cada campo.
- **Sí:** la pantalla `/admin/sla`, con un índice en `/admin`. Es la primera pantalla de administración del proyecto.
- **No:** solo API.
- **Sí:** solo el administrador lee las políticas. Los plazos se verán en cada queja cuando exista el cálculo.
- **No:** un endpoint de lectura para quien clasifica.
- **Sí:** las columnas `actualizado_en` y `actualizado_por`. El historial completo llega con la bitácora (RF-42).
- **No:** escribir en `bitacora` antes de que RF-42 defina su formato.
- **Sí:** no se puede borrar una matriz: solo se reemplaza. Se puede definir la de una categoría inactiva.
- **Sí:** las categorías activas sin SLA completo se marcan y se listan primero, para que el administrador vea los huecos que bloquearán el cálculo de RF-27.
- **Sí:** los textos, los códigos de problema y la disposición de la pantalla los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Una base con filas que violan "respuesta ≤ resolución" hace fallar la migración | Las 16 filas de `seed:dev` lo cumplen, y no hay datos de producción. El error de Postgres nombra el `CHECK` que falla. |
| Las categorías creadas por SQL o por una spec futura de catálogos nacen sin SLA, y el cálculo de RF-27 no tendrá plazo para ellas | `/admin/sla` las marca "Sin SLA" y las cuenta. La spec de RF-27 debe definir qué pasa al aceptar una queja sin política. |
| Sin historial, no se sabe qué valores tenía una política antes de un cambio | Queda la última actualización. RF-42 agrega la bitácora. |
| La validación del cliente diverge de la del servidor | El servidor decide. El diálogo muestra los `detalles` del `400`, y el paso 7 lo prueba. |
| "Horas hábiles" no tiene todavía una jornada definida, y el administrador puede interpretar mal las unidades | Las etiquetas dicen "horas hábiles". La spec de RF-27 define la jornada y debe actualizar el texto de ayuda si hace falta. |
| Depende de SPEC 14 y SPEC 17, que están en Borrador (el campo `detalles` y el login del frontend) | Se implementa después de las dos. Si cambia el formato de `detalles`, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Cálculo de vencimientos y jornada laboral (RF-27).
- Pausa, reinicio, alerta del 80 % y escalamiento (RF-28, RF-29).
- Recalcular las quejas abiertas.
- Lectura de las políticas para otros roles.
- Bitácora e historial de cambios (RF-42).
- Borrado de matrices, política por defecto y tope de horas.
- CRUD de los demás catálogos (RF-41).

Cada uno de estos temas, cuando llegue, va en su propia spec.
