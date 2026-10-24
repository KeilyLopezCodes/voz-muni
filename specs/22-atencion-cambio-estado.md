# SPEC 22 — Atención de la queja: cambios de estado internos

> **Estado:** Implementado
> **Depende de:** SPEC 04, SPEC 08, SPEC 11, SPEC 17, SPEC 19, SPEC 20, SPEC 21
> **Fecha:** 2026-10-22
> **Objetivo:** Agregar a `POST /api/v1/tickets/:id/transiciones` las acciones `iniciar`, `poner_en_espera`, `reanudar` y `resolver`, para el técnico asignado, el coordinador de la dependencia y el supervisor, con una bandeja `GET /api/v1/tickets/atencion` y la pantalla `/atencion`.

## Por qué existe esta spec

RF-18 pide que el técnico cambie el estado de la queja según las transiciones permitidas. RF-21 (pasar a "en espera") y RF-23 (resolver con descripción obligatoria) son parte del mismo trabajo.
SPEC 04 ya implementa en el dominio `iniciar`, `ponerEnEspera`, `reanudar` y `resolver`, pero nadie puede llamarlos. SPEC 08 dejó para esta spec qué transiciones puede hacer cada rol con `tickets.cambiar_estado`.
Hoy el técnico no tiene ninguna pantalla. Esta spec le da una bandeja de atención, desde la que también puede solicitar un traslado (SPEC 21).

## Alcance

**Incluido:**

- Cuatro acciones nuevas en `POST /api/v1/tickets/:id/transiciones` (SPEC 19):

  | Acción | De → a | Dominio (SPEC 04) |
  | --- | --- | --- |
  | `iniciar` | `asignada` → `en_proceso` | `iniciar` |
  | `poner_en_espera` | `en_proceso` → `en_espera`, con motivo | `ponerEnEspera` |
  | `reanudar` | `en_espera` → `en_proceso` | `reanudar` |
  | `resolver` | `en_proceso` → `resuelta`, con descripción | `resolver` |

- Regla de quién puede hacerlas: los alcances `asignadas` (técnico), `dependencia` (coordinador) y `todas` (supervisor) de `tickets.cambiar_estado`. El alcance `propia` (vecino) no puede.
- **Cambio sobre SPEC 19:** el permiso de `/transiciones` se verifica por acción, ya no con un middleware fijo para todo el endpoint.
- `GET /api/v1/tickets/atencion`: bandeja de quejas en `asignada`, `en_proceso` o `en_espera` dentro del alcance del usuario.
- Bloqueo de fila al transicionar, como en SPEC 19.
- Frontend: ruta `/atencion` para el técnico, el coordinador y el supervisor, con un panel que muestra las acciones según el estado e incluye "Solicitar traslado" (SPEC 21).
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Las transiciones del vecino: confirmar la solución y reabrir (RF-24). Necesitan el plazo de confirmación en días hábiles.
- Cierre automático por vencimiento (RF-30, job).
- La respuesta del vecino a la solicitud de información (RF-22), que requiere comentarios.
- Avisos al vecino al poner en espera o al resolver (RF-31). Van con su spec y con RF-24.
- Pausa del SLA mientras la queja está en espera y cálculo de vencimientos (RF-26 y RF-27). Los tiempos ya quedan en `ticket_historial` para calcularlos después.
- Evidencias adjuntas a la resolución (RF-20).
- Comentarios y notas internas (RF-19).
- Detalle completo con línea de tiempo (RF-25).
- Bitácora (RF-42).

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones, y no cambia permisos. Usa `tickets.cambiar_estado` de SPEC 08 y la tabla `ticket_historial` de SPEC 03.

### Quién puede cada acción (`domain/atencion/acciones-atencion.ts`)

```ts
export const ACCIONES_ATENCION = ['iniciar', 'poner_en_espera', 'reanudar', 'resolver'] as const;
export type AccionAtencion = (typeof ACCIONES_ATENCION)[number];

// Alcances de tickets.cambiar_estado que habilitan las acciones de atención.
export const ALCANCES_ATENCION: readonly Alcance[] = ['asignadas', 'dependencia', 'todas'];

export function puedeAtender(alcance: Alcance | undefined): boolean;   // ALCANCES_ATENCION.includes(alcance)
```

La regla no menciona roles: depende del alcance que cada rol tiene en `roles.permisos` (SPEC 08). Con la matriz actual queda así:

| Rol | `tickets.cambiar_estado` | Acciones de atención |
| --- | --- | --- |
| técnico | `asignadas` | sí, sobre sus quejas asignadas |
| coordinador | `dependencia` | sí, sobre las quejas de su dependencia |
| supervisor | `todas` | sí, sobre todas |
| vecino | `propia` | no (`403`). Sus acciones (confirmar y reabrir) llegan con RF-24 |
| receptor, administrador | — | no (`403`) |

El filtro sobre el ticket es la intersección de `tickets.cambiar_estado` con `tickets.ver` (SPEC 11). Fuera de alcance responde `404`.

### Cambio sobre SPEC 19: permiso por acción

`POST /api/v1/tickets/:id/transiciones` ya no usa `requierePermiso('tickets.triage')` como middleware del endpoint. Usa `autenticar`, y el controlador elige el permiso según `accion`:

| `accion` | Permiso | Condición adicional |
| --- | --- | --- |
| `tomar`, `aceptar`, `rechazar` (SPEC 19) | `tickets.triage` | — |
| `iniciar`, `poner_en_espera`, `reanudar`, `resolver` | `tickets.cambiar_estado` | `puedeAtender(alcance)` |

Si el rol no tiene el permiso o no cumple la condición, responde `403 PERMISO_DENEGADO`. Así se valida antes de buscar el ticket, y no se revela si existe. El comportamiento de las 3 acciones de SPEC 19 no cambia.

### Cuerpos de las acciones nuevas

Es la unión discriminada por `accion` de SPEC 19, ampliada (Zod `strict`):

| `accion` | Cuerpo | Reglas |
| --- | --- | --- |
| `iniciar` | `{ accion: 'iniciar' }` | La queja necesita técnico asignado; si no, `400 TECNICO_REQUERIDO` (SPEC 04) |
| `poner_en_espera` | `{ accion: 'poner_en_espera', motivo }` | El motivo es la información que falta, de 1 a 1000 caracteres. Sin él, `400 MOTIVO_REQUERIDO` |
| `reanudar` | `{ accion: 'reanudar' }` | — |
| `resolver` | `{ accion: 'resolver', descripcion }` | Descripción de la solución, de 1 a 4000 caracteres. Sin ella, `400 DESCRIPCION_REQUERIDA` |

Pasos, en una transacción, iguales a SPEC 19:

1. Se lee el ticket con `SELECT … FOR UPDATE` y el filtro de alcance.
2. Se reconstituye y se llama al método de dominio, con `ctx = { actorId: usuario.id, ahora }`.
3. Se guardan el estado (y `resuelto_en` en `resolver`) y la fila de `ticket_historial`. El motivo o la descripción, recortados, van como `motivo` del historial.

Responde `200` con `{ id, numero, estado, asignadoA, resueltoEn }`. Una transición desde un estado no permitido responde `409 TRANSICION_INVALIDA` (SPEC 19). Estas acciones no envían correos.

Si la queja tiene una solicitud de traslado pendiente (SPEC 21), las acciones funcionan igual. La solicitud quedará `sin_efecto` si se aprueba después de que la queja salga de `asignada` o `en_proceso`.

### `GET /api/v1/tickets/atencion`

Protegido por `autenticar` y `requierePermiso('tickets.cambiar_estado')`, con `puedeAtender(alcance)` (si no, `403`) y el filtro de SPEC 11.

- Query:
  - `estado`: `asignada`, `en_proceso`, `en_espera` o `todas` (por defecto `todas`, que incluye los tres).
  - `pagina` (≥ 1) y `tamano` (1–50, por defecto 20).
- Orden: prioridad (`urgente`, `alta`, `media`, `baja`), luego `creado_en ASC` e `id ASC`.
- Respuesta `200`: `{ datos: TicketAtencion[], pagina, tamano, total }`.

```ts
export interface TicketAtencion {
  id: number;
  numero: string;
  estado: 'asignada' | 'en_proceso' | 'en_espera';
  prioridad: Prioridad;
  titulo: string;
  descripcion: string;
  categoria: { id: number; nombre: string };
  dependencia: { id: number; nombre: string };
  zona: { id: number; nombre: string; tipo: string };
  direccion: string;
  datosExtra: Record<string, unknown>;
  ubicacion: { lat: number; lng: number } | null;
  tecnico: { id: number; nombre: string } | null;
  motivoEspera: string | null;        // motivo de la última transición a en_espera, si está en espera
  trasladoPendiente: boolean;         // hay una solicitud pendiente (SPEC 21)
  creadoEn: string;
}
```

Sin datos de contacto ni DPI del solicitante (RNF-12). Lo implementa `AtencionLecturaRepository`, de solo lectura.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/atencion` en `RUTAS_PROTEGIDAS`: `roles: ['tecnico', 'coordinador', 'supervisor']`, `enMenu: true`, `etiqueta: 'comun:menu.atencion'` |
| Página | `features/tickets/atencion/AtencionPage.tsx`: un filtro por estado (Todas / Asignadas / En proceso / En espera), y tarjetas con el número, el título, la prioridad, el estado, la categoría, la zona, el técnico (para el coordinador y el supervisor), una marca "Traslado pendiente" y la antigüedad. Paginación |
| Panel | `PanelAtencion.tsx`: un `Drawer` a pantalla completa en celular y un panel lateral en escritorio. Muestra la descripción, la dirección, los datos adicionales y la ubicación como texto. Si está en espera, muestra "Información solicitada: …" |
| Acciones por estado | `asignada`: "Iniciar", deshabilitado sin técnico con el aviso "Asigna un técnico primero". `en_proceso`: "Poner en espera" (motivo obligatorio: "¿Qué información falta?") y "Resolver" (descripción obligatoria y confirmación). `en_espera`: "Reanudar" |
| Traslado | "Solicitar traslado" (SPEC 21), con motivo y dependencia sugerida, para el técnico y el coordinador en `asignada` o `en_proceso`, si no hay uno pendiente. El supervisor ve "Trasladar" |
| Después de actuar | Se invalida la bandeja y aparece un aviso. Un `409 TRANSICION_INVALIDA` muestra "La queja cambió de estado" y recarga |
| Textos | `locales/es/tickets.json` y `comun.json`. Las etiquetas de los estados salen de los archivos de traducción (RNF-16) |

`inicioPorRol` (SPEC 06) no cambia: el técnico sigue entrando a `/tickets`, y `/atencion` aparece en su menú.

### Archivos nuevos o modificados

```text
CLAUDE.md
backend/
  src/
    app.ts                                             # ruta de la bandeja de atención
    container.ts
    domain/atencion/acciones-atencion.ts
    domain/repositories/atencion-lectura-repository.ts
    application/services/atencion.service.ts          # iniciar, poner en espera, reanudar, resolver, listar
    infrastructure/
      repositories/knex-atencion-lectura-repository.ts
      repositories/knex-ticket-escritura-repository.ts # guarda resuelto_en (de SPEC 19)
    presentation/
      validators/transiciones.validators.ts            # 4 acciones nuevas
      controllers/transiciones.controller.ts           # permiso por acción (cambio de SPEC 19)
      routes/transiciones.routes.ts                    # sin requierePermiso fijo; + GET /tickets/atencion
  tests/
    unit/atencion/acciones-atencion.test.ts
    unit/atencion/atencion.service.test.ts
    db/atencion.api.test.ts                            # Supertest contra Postgres real
    db/triage.api.test.ts                              # las acciones de SPEC 19 siguen igual
frontend/
  src/
    shared/auth/rutas.ts                               # /atencion
    app/router.tsx
    features/tickets/api/atencion-api.ts
    features/tickets/atencion/AtencionPage.tsx
    features/tickets/atencion/PanelAtencion.tsx
    locales/es/tickets.json  locales/es/comun.json
  tests/
    features/tickets/atencion-page.test.tsx
    features/tickets/panel-atencion.test.tsx
    app/router.test.tsx
    shared/app-layout.test.tsx
```

## Plan de implementación

1. Crear `domain/atencion/acciones-atencion.ts` y su prueba: `puedeAtender` es `true` para `asignadas`, `dependencia` y `todas`, y `false` para `propia`, `undefined` y el resto. Verificación: `npm test` y `npm run lint:deps` pasan.
2. Aplicar el cambio de SPEC 19: quitar el `requierePermiso` fijo de `/transiciones` y elegir el permiso por acción en el controlador. Ampliar el validador con las 4 acciones nuevas. Comprobar que `tests/db/triage.api.test.ts` (SPEC 19) sigue pasando sin cambios. Verificación: `npm run test:db` pasa.
3. Crear `AtencionService` con las 4 transiciones, reutilizando `TicketEscrituraRepository` (SPEC 19), y `atencion.service.test.ts` con falsos. Casos:
   - `iniciar` con técnico pasa a `en_proceso`; sin técnico lanza `TECNICO_REQUERIDO`.
   - `poner_en_espera` sin motivo lanza `MOTIVO_REQUERIDO`; con motivo deja el historial con el motivo recortado.
   - `reanudar` vuelve a `en_proceso`.
   - `resolver` sin descripción lanza `DESCRIPCION_REQUERIDA`; con descripción fija `resueltoEn` y guarda la descripción en el historial.
   - Una acción desde un estado no permitido lanza `InvalidTransitionError`.

   Verificación: `npm test` pasa.
4. Crear `AtencionLecturaRepository` y su implementación Knex (con `motivoEspera` desde el último historial a `en_espera`, y `trasladoPendiente` desde `solicitudes_traslado`), y la ruta `GET /tickets/atencion`. Crear `tests/db/atencion.api.test.ts`. Casos:
   - El técnico asignado: `iniciar` → `200`, `poner_en_espera` → `200`, `reanudar` → `200`, `resolver` → `200`. Hay 4 filas en `ticket_historial` con sus motivos, y `resuelto_en` lleno.
   - Un técnico no asignado → `404`.
   - El coordinador de la dependencia resuelve → `200`. El de otra dependencia → `404`.
   - El supervisor inicia cualquiera → `200`.
   - El vecino (`propia`), el receptor y el administrador → `403`.
   - `iniciar` sin técnico → `400 TECNICO_REQUERIDO`. `reanudar` en `en_proceso` → `409`. `resolver` sin descripción → `400 VALIDACION`.
   - Dos `iniciar` simultáneos: uno → `200` y el otro → `409`.
   - La bandeja: el técnico ve solo sus asignadas, el filtro por estado funciona, el orden es por prioridad y antigüedad, `motivoEspera` y `trasladoPendiente` son correctos, y no hay datos de contacto.
   - El vecino pide la bandeja → `403`.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
5. Frontend: agregar `/atencion` a `rutas.ts` y `router.tsx`, y crear `atencion-api.ts` y `AtencionPage.tsx`. Ampliar `router.test.tsx` y `app-layout.test.tsx` (técnico, coordinador y supervisor). Crear `atencion-page.test.tsx`: el filtro cambia la consulta, las tarjetas muestran el estado y la prioridad traducidos y la marca de traslado, y la paginación funciona. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Crear `PanelAtencion.tsx` y `panel-atencion.test.tsx`. Casos:
   - Cada estado muestra solo sus acciones.
   - "Iniciar" sin técnico está deshabilitado.
   - "Poner en espera" exige motivo, y "Resolver" exige descripción y confirmación.
   - "Solicitar traslado" se oculta si ya hay uno pendiente.
   - Un `409` muestra el aviso y recarga.
   - Después de actuar se invalida la bandeja.

   Verificación: `npm test` y `npm run build` pasan.
7. Actualizar `CLAUDE.md`:
   - Las acciones de atención y la regla `puedeAtender` por alcance (sin nombres de rol en el código).
   - Que `/transiciones` verifica el permiso por acción.
   - Que las transiciones del vecino llegan con RF-24.

   Verificación manual con el backend y `seed:dev`, después del triage y la asignación: `tecnico@vozmuni.test` abre `/atencion`, inicia la queja, la pone en espera indicando qué falta, la reanuda y la resuelve con una descripción. `ticket_historial` muestra las 4 transiciones.

## Criterios de aceptación

- [x] `POST /api/v1/tickets/:id/transiciones` acepta `iniciar`, `poner_en_espera`, `reanudar` y `resolver`, que llaman a los métodos de SPEC 04 y escriben su fila de `ticket_historial`.
- [x] `poner_en_espera` exige motivo y `resolver` exige descripción, y los dos se guardan recortados en el historial. `resolver` fija `resuelto_en`.
- [x] `iniciar` sin técnico asignado responde `400 TECNICO_REQUERIDO`, y una acción desde un estado no permitido responde `409 TRANSICION_INVALIDA`.
- [x] El técnico asignado, el coordinador de la dependencia y el supervisor pueden ejecutar las 4 acciones dentro de su alcance. Fuera de alcance reciben `404`.
- [x] El vecino, el receptor y el administrador reciben `403 PERMISO_DENEGADO` en las 4 acciones.
- [x] Las acciones `tomar`, `aceptar` y `rechazar` de SPEC 19 siguen funcionando igual, con sus mismos permisos y respuestas.
- [x] Dos transiciones simultáneas sobre la misma queja dejan exactamente una aplicada, y la otra responde `409`.
- [x] `GET /api/v1/tickets/atencion` devuelve las quejas en `asignada`, `en_proceso` y `en_espera` dentro del alcance del usuario, filtradas por estado, ordenadas por prioridad y antigüedad, paginadas con `total`, con `motivoEspera` y `trasladoPendiente`, y sin datos de contacto del solicitante.
- [x] Ningún archivo nuevo del backend compara el nombre de un rol: el permiso sale del alcance en `roles.permisos`.
- [x] En el frontend, el técnico, el coordinador y el supervisor ven "Atención" en el menú y pueden abrir `/atencion`, y los demás roles no.
- [x] El panel muestra solo las acciones válidas para el estado de la queja. "Poner en espera" exige motivo. "Resolver" exige descripción y confirmación. "Iniciar" se deshabilita sin técnico.
- [x] Desde `/atencion`, el técnico y el coordinador pueden solicitar un traslado (SPEC 21) si no hay uno pendiente.
- [ ] A 360 px de ancho, `/atencion` y el panel no producen scroll horizontal, y ningún texto de la interfaz está fijo en un componente. (pendiente de comprobar a 360 px en el navegador: Chromium de Playwright no está instalado; los textos sí están todos en las traducciones)
- [x] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [x] `CLAUDE.md` documenta las acciones de atención, la regla por alcance y el permiso por acción de `/transiciones`.

## Decisiones

- **Sí:** esta spec cubre las 4 transiciones de atención interna: RF-18, la parte de estado de RF-21, y RF-23.
- **No:** confirmar y reabrir (RF-24), ni el cierre automático (RF-30). Necesitan el plazo de confirmación en días hábiles y un job.
- **Sí:** el técnico asignado, el coordinador de la dependencia y el supervisor pueden hacer las 4 acciones, literal a la matriz ("todos los de su dependencia" y "todos").
- **No:** solo el técnico asignado.
- **Sí:** la regla se expresa por alcance (`asignadas`, `dependencia`, `todas`) y no por nombre de rol. Así respeta el núcleo genérico de `CLAUDE.md`: la matriz vive en `roles.permisos`. Es una consecuencia que no se preguntó explícitamente.
- **Sí:** `/transiciones` verifica el permiso por acción. Es un cambio sobre SPEC 19, necesario para que el mismo endpoint sirva al triage y a la atención, como pide el documento.
- **Sí:** sin correos al vecino al poner en espera ni al resolver, como eligió el usuario. Van con RF-31 y RF-24.
- **No:** el correo `informacion_solicitada`, ni `queja_resuelta`.
- **Sí:** la bandeja `/atencion` para el técnico, el coordinador y el supervisor, con el mismo patrón que `/triage` y `/asignacion`. Es la primera pantalla del técnico.
- **No:** solo backend.
- **Sí:** la bandeja muestra el motivo de la espera y si hay un traslado pendiente, para que quien atiende sepa qué falta y qué está en curso.
- **Sí:** las acciones funcionan aunque haya un traslado pendiente, coherente con SPEC 21 ("la queja sigue su curso").
- **Sí:** sin migración ni cambios de permisos. `tickets.cambiar_estado` ya tiene los alcances necesarios desde SPEC 08.
- **Sí:** los largos máximos (motivo de 1000 y descripción de 4000), los textos del panel y la confirmación al resolver los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Sin aviso, el vecino no sabe que se le pidió información, y la queja puede quedar en espera indefinidamente | Es una decisión explícita. La spec de RF-31 y la de RF-22 (respuesta con comentarios) deben llegar antes de publicar el portal. El supervisor puede ver las quejas en espera en `/atencion`. |
| Sin aviso de resolución, el plazo de confirmación de RF-24 no tiene un punto de partida comunicado | La spec de RF-24 debe enviar el aviso con el plazo al implementar la confirmación. `resuelto_en` ya marca el inicio. |
| El tiempo en espera no se descuenta todavía del SLA | Los cambios de estado quedan en `ticket_historial` con su fecha, y la spec de SLA los usa para calcularlo. |
| El coordinador o el supervisor resuelven quejas en nombre del técnico sin que este lo sepa | El historial registra quién hizo cada transición (`usuario_id`). |
| Mover el permiso de `/transiciones` al controlador puede dejar una acción sin protección | El paso 2 conserva las pruebas de SPEC 19, y el paso 4 prueba el `403` de cada acción nueva por rol. |
| Depende de 7 specs, 6 de ellas en Borrador | Se implementa después de SPEC 21. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Confirmar, reabrir y cierre automático.
- Respuesta del vecino y avisos al vecino.
- Pausa del SLA y vencimientos.
- Evidencias, comentarios y línea de tiempo.
- Bitácora.

Cada uno de estos temas, cuando llegue, va en su propia spec.
