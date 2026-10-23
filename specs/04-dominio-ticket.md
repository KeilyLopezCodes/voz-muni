# SPEC 04 — Dominio del ticket: estados y transiciones

> **Estado:**  Aprobado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-22
> **Objetivo:** Modelar en `domain/ticket` una entidad `Ticket` inmutable que aplica la máquina de estados de la sección 3 del documento de definición, con sus reglas de datos obligatorios, sin depender de Express ni de la base de datos.

## Por qué existe esta spec

El ciclo de vida es la regla de negocio central de VozMuni, y CLAUDE.md exige que el dominio rechace cualquier transición que no esté en la tabla.
Modelarlo primero, como TypeScript puro y probado, permite que las specs de registro, atención, SLA y autorización lo usen sin duplicar reglas.
No necesita la base de datos, así que puede implementarse antes que las SPEC 02 y 03.

## Alcance

**Incluido:**

- Tipos `EstadoTicket` y `Prioridad`, con los mismos valores que la SPEC 03.
- Tabla de transiciones `TRANSICIONES` y función `puedeTransicionar()`.
- Entidad inmutable `Ticket` con un método por acción del ciclo de vida. Cada método devuelve el ticket nuevo y su `RegistroHistorial`.
- Precondiciones de datos: motivo, descripción de resolución, dependencia, prioridad, técnico asignado y plazo de confirmación.
- Marca `escalado` (solo marcarla; cuándo se marca lo decide la spec de SLA).
- Errores tipados en `domain/errors/`.
- Pruebas unitarias del dominio.

**Fuera de alcance (para specs futuras):**

- Quién puede ejecutar cada transición según rol y dependencia (spec de autorización, RF-05).
- Creación de un ticket nuevo, número `Q-AAAA-NNNNNN` y su primer registro de historial (spec de registro de quejas).
- Solicitud y aprobación de traslados (RF-15). Aquí solo existe el efecto de un traslado ya aprobado.
- Vincular duplicados (RF-17).
- Cálculo de vencimientos en horas o días hábiles, alertas y escalamiento automático (spec de SLA).
- Repositorios, servicios de aplicación, endpoints y traducción de errores a HTTP.
- Campos del ticket ajenos al ciclo de vida: solicitante, categoría, ubicación, `datos_extra`, canal y vencimientos.
- Comentarios, adjuntos, notificaciones y encuestas.

## Modelo de datos

### Archivos

```text
backend/src/domain/
  errors/
    domain-error.ts                 # DomainError (abstracta, con codigo)
    invalid-transition-error.ts     # InvalidTransitionError
    regla-de-negocio-error.ts       # ReglaDeNegocioError
  ticket/
    estado-ticket.ts                # ESTADOS_TICKET, EstadoTicket, ESTADOS_FINALES, esFinal()
    prioridad.ts                    # PRIORIDADES, Prioridad, esPrioridad()
    transiciones.ts                 # TRANSICIONES, puedeTransicionar()
    contexto-transicion.ts          # ContextoTransicion
    registro-historial.ts           # RegistroHistorial, ResultadoTransicion
    ticket.ts                       # Ticket
backend/tests/unit/ticket/
  errors.test.ts
  transiciones.test.ts
  ticket.test.ts
```

Los `.gitkeep` de `domain/errors/` y `domain/ticket/` se eliminan.

### Tipos

```ts
// estado-ticket.ts — mismos valores y orden que el enum estado_ticket de SPEC 03
export const ESTADOS_TICKET = [
  'nueva', 'en_revision', 'rechazada', 'asignada',
  'en_proceso', 'en_espera', 'resuelta', 'cerrada',
] as const;
export type EstadoTicket = (typeof ESTADOS_TICKET)[number];
export const ESTADOS_FINALES: readonly EstadoTicket[] = ['rechazada', 'cerrada'];

// prioridad.ts — mismos valores que el CHECK de SPEC 03
export const PRIORIDADES = ['baja', 'media', 'alta', 'urgente'] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

// contexto-transicion.ts
export interface ContextoTransicion {
  actorId: number | null; // null = sistema
  ahora: Date;            // UTC
}

// registro-historial.ts — se corresponde con una fila de ticket_historial
export interface RegistroHistorial {
  ticketId: number;
  estadoAnterior: EstadoTicket;
  estadoNuevo: EstadoTicket;
  usuarioId: number | null;
  motivo: string | null;
  creadoEn: Date;
}
export interface ResultadoTransicion {
  ticket: Ticket;
  historial: RegistroHistorial;
}

// ticket.ts — propiedades readonly; la instancia se congela con Object.freeze
export interface TicketProps {
  id: number;
  numero: string;
  estado: EstadoTicket;
  dependenciaId: number | null;
  asignadoA: number | null;
  prioridad: Prioridad | null;
  escalado: boolean;
  resueltoEn: Date | null;
  cerradoEn: Date | null;
}
// Ticket.reconstituir(props: TicketProps): Ticket  — sin validar, los datos vienen de la persistencia
```

### Tabla de transiciones (`TRANSICIONES`)

| Desde | Hacia |
| --- | --- |
| `nueva` | `en_revision` |
| `en_revision` | `asignada`, `rechazada` |
| `asignada` | `en_proceso`, `en_revision` |
| `en_proceso` | `en_espera`, `resuelta`, `en_revision` |
| `en_espera` | `en_proceso` |
| `resuelta` | `cerrada`, `en_proceso` |
| `rechazada` | — (final) |
| `cerrada` | — (final) |

Son 11 transiciones. `puedeTransicionar(desde, hacia)` devuelve `true` solo para ellas.

### Métodos de `Ticket` que cambian de estado

Todos reciben `ctx: ContextoTransicion` y devuelven `ResultadoTransicion`. El `RegistroHistorial` copia `ctx.actorId` en `usuarioId` y `ctx.ahora` en `creadoEn`.

| Método | Desde | Hacia | Exige | Efectos sobre el ticket | `motivo` del historial |
| --- | --- | --- | --- | --- | --- |
| `enviarARevision(ctx)` | `nueva` | `en_revision` | — | — | `null` |
| `rechazar(ctx, motivo)` | `en_revision` | `rechazada` | motivo | — | motivo |
| `asignar(ctx, dependenciaId, prioridad)` | `en_revision` | `asignada` | `dependenciaId` entero > 0; prioridad válida | fija `dependenciaId` y `prioridad` | `null` |
| `iniciar(ctx)` | `asignada` | `en_proceso` | `asignadoA ≠ null` | — | `null` |
| `ponerEnEspera(ctx, motivo)` | `en_proceso` | `en_espera` | motivo (información solicitada) | — | motivo |
| `reanudar(ctx)` | `en_espera` | `en_proceso` | — | — | `null` |
| `resolver(ctx, descripcion)` | `en_proceso` | `resuelta` | descripción | `resueltoEn = ctx.ahora` | descripción |
| `confirmarSolucion(ctx, confirmacionVenceEn)` | `resuelta` | `cerrada` | `actorId ≠ null`; `ahora ≤ confirmacionVenceEn` | `cerradoEn = ctx.ahora` | `null` |
| `cerrarPorVencimiento(ctx, confirmacionVenceEn)` | `resuelta` | `cerrada` | `actorId = null`; `ahora > confirmacionVenceEn` | `cerradoEn = ctx.ahora` | `null` |
| `reabrir(ctx, motivo, confirmacionVenceEn)` | `resuelta` | `en_proceso` | motivo; `ahora ≤ confirmacionVenceEn` | `resueltoEn = null`, `escalado = false`; conserva `asignadoA` | motivo |
| `trasladar(ctx, motivo)` | `asignada`, `en_proceso` | `en_revision` | motivo | `dependenciaId = null`, `asignadoA = null` | motivo |

### Métodos de `Ticket` que no cambian de estado

No generan historial y devuelven solo el `Ticket` nuevo.

| Método | Permitido en | Efecto |
| --- | --- | --- |
| `asignarTecnico(tecnicoId)` | `asignada`, `en_proceso` | `asignadoA = tecnicoId` (entero > 0) |
| `marcarEscalado()` | cualquier estado no final | `escalado = true`. Es idempotente. |

### Orden de validación

1. Si el estado actual no está en la columna "Desde" del método, se lanza `InvalidTransitionError(estadoActual, destino)`.
2. Si falta un dato o no se cumple una condición, se lanza `ReglaDeNegocioError` con su código.
3. Si todo es válido, se devuelve un ticket nuevo. El ticket original no cambia.

Un motivo o descripción es válido si, después de `trim()`, no queda vacío. Se guarda ya recortado.

### Errores (`domain/errors/`)

```ts
abstract class DomainError extends Error { readonly codigo: string }
class InvalidTransitionError extends DomainError {  // codigo 'TRANSICION_INVALIDA'
  readonly desde: EstadoTicket; readonly hacia: EstadoTicket;
}
class ReglaDeNegocioError extends DomainError {}    // codigo variable
```

| Código de `ReglaDeNegocioError` | Cuándo |
| --- | --- |
| `MOTIVO_REQUERIDO` | `rechazar`, `ponerEnEspera`, `reabrir` o `trasladar` sin motivo |
| `DESCRIPCION_REQUERIDA` | `resolver` sin descripción |
| `DEPENDENCIA_INVALIDA` | `asignar` con un `dependenciaId` que no es entero > 0 |
| `PRIORIDAD_INVALIDA` | `asignar` con una prioridad fuera de `PRIORIDADES` |
| `TECNICO_REQUERIDO` | `iniciar` con `asignadoA = null` |
| `TECNICO_INVALIDO` | `asignarTecnico` con un id que no es entero > 0 |
| `PLAZO_CONFIRMACION_VENCIDO` | `confirmarSolucion` o `reabrir` con `ahora > confirmacionVenceEn` |
| `PLAZO_CONFIRMACION_VIGENTE` | `cerrarPorVencimiento` con `ahora ≤ confirmacionVenceEn` |
| `ACTOR_REQUERIDO` | `confirmarSolucion` con `actorId = null` |
| `SOLO_SISTEMA` | `cerrarPorVencimiento` con `actorId ≠ null` |
| `OPERACION_NO_PERMITIDA` | `asignarTecnico` fuera de `asignada`/`en_proceso`, o `marcarEscalado` en un estado final |

## Plan de implementación

1. Crear `domain-error.ts`, `invalid-transition-error.ts` y `regla-de-negocio-error.ts` en `src/domain/errors/`, y quitar su `.gitkeep`. Crear `tests/unit/ticket/errors.test.ts`, que comprueba `instanceof DomainError`, `codigo`, `desde`/`hacia` y `name`. Verificación: `npm test` pasa.
2. Crear `estado-ticket.ts`, `prioridad.ts` y `transiciones.ts`, y quitar el `.gitkeep` de `domain/ticket/`. Crear `tests/unit/ticket/transiciones.test.ts`, que recorre los 64 pares origen-destino y comprueba que exactamente los 11 de la tabla devuelven `true`. También comprueba que los estados finales no tienen salidas. Verificación: `npm test` pasa.
3. Crear `contexto-transicion.ts`, `registro-historial.ts` y `ticket.ts`. `ticket.ts` incluye `TicketProps`, `Ticket.reconstituir()`, los getters, `Object.freeze` y un helper privado que aplica el orden de validación y arma el historial. Implementar `enviarARevision`, `rechazar` y `asignar`. Crear `tests/unit/ticket/ticket.test.ts` con los casos válidos, el estado inválido, el motivo vacío o solo espacios, una dependencia o prioridad inválida, y la inmutabilidad del original. Verificación: `npm test` pasa.
4. Implementar `iniciar`, `asignarTecnico`, `ponerEnEspera`, `reanudar` y `trasladar`, con sus pruebas. Las pruebas cubren que `trasladar` limpia la dependencia y el técnico, y que `reanudar` sobre `resuelta` lanza `InvalidTransitionError`. Verificación: `npm test` pasa.
5. Implementar `resolver`, `confirmarSolucion`, `cerrarPorVencimiento` y `reabrir`, con sus pruebas, usando fechas fijas. Las pruebas cubren el límite `ahora = confirmacionVenceEn`, donde se permite confirmar y reabrir pero no cerrar por vencimiento. También cubren que `reabrir` conserva `asignadoA` y pone `resueltoEn = null` y `escalado = false`. Verificación: `npm test` pasa.
6. Implementar `marcarEscalado`. Agregar una prueba de consistencia: cada par (Desde, Hacia) de los métodos existe en `TRANSICIONES`, y cada una de las 11 transiciones la produce al menos un método. Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.

## Criterios de aceptación

- [ ] `puedeTransicionar` devuelve `true` exactamente para las 11 transiciones de la tabla y `false` para los otros 53 pares.
- [ ] `ESTADOS_TICKET` y `PRIORIDADES` tienen los mismos valores, en el mismo orden, que el enum y el `CHECK` de la SPEC 03.
- [ ] Llamar cualquier método que cambia de estado desde un estado fuera de su columna "Desde" lanza `InvalidTransitionError` con `desde` y `hacia` correctos.
- [ ] `reanudar` sobre un ticket `resuelta` lanza `InvalidTransitionError`, aunque `resuelta → en_proceso` esté en la tabla.
- [ ] `rechazar`, `ponerEnEspera`, `reabrir` y `trasladar` con motivo `''` o `'   '` lanzan `ReglaDeNegocioError` con código `MOTIVO_REQUERIDO`.
- [ ] `resolver` sin descripción lanza `DESCRIPCION_REQUERIDA`. Con descripción, el historial lleva la descripción recortada como `motivo` y el ticket tiene `resueltoEn = ctx.ahora`.
- [ ] `asignar` con prioridad `'critica'` lanza `PRIORIDAD_INVALIDA`, y con `dependenciaId = 0` lanza `DEPENDENCIA_INVALIDA`.
- [ ] `iniciar` sin técnico asignado lanza `TECNICO_REQUERIDO`.
- [ ] Con `ahora = confirmacionVenceEn`, `confirmarSolucion` y `reabrir` funcionan, y `cerrarPorVencimiento` lanza `PLAZO_CONFIRMACION_VIGENTE`.
- [ ] Un milisegundo después de `confirmacionVenceEn`, `confirmarSolucion` y `reabrir` lanzan `PLAZO_CONFIRMACION_VENCIDO`, y `cerrarPorVencimiento` con `actorId = null` funciona.
- [ ] `cerrarPorVencimiento` con `actorId ≠ null` lanza `SOLO_SISTEMA`, y `confirmarSolucion` con `actorId = null` lanza `ACTOR_REQUERIDO`.
- [ ] `trasladar` deja `dependenciaId` y `asignadoA` en `null`. `reabrir` conserva `asignadoA` y deja `resueltoEn = null` y `escalado = false`.
- [ ] `marcarEscalado` es idempotente en estados no finales y lanza `OPERACION_NO_PERMITIDA` en `rechazada` y `cerrada`.
- [ ] Después de llamar a cualquier método, el ticket original conserva todos sus valores, y `Object.isFrozen(ticket)` es `true`.
- [ ] Cada `RegistroHistorial` tiene `ticketId`, `estadoAnterior`, `estadoNuevo`, `usuarioId = ctx.actorId` y `creadoEn = ctx.ahora`.
- [ ] `npx jest tests/unit/ticket --coverage --collectCoverageFrom='src/domain/**/*.ts'` reporta al menos 90 % de líneas cubiertas en `src/domain/ticket/` y `src/domain/errors/`.
- [ ] `npm test`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] Ningún archivo de `src/domain/ticket/` ni de `src/domain/errors/` importa algo fuera de `src/domain/`.

## Decisiones

- **Sí:** entidad `Ticket` con un método por acción. Las reglas de cada acción (motivo, descripción, plazos) viven junto a la transición, no repartidas en servicios.
- **No:** solo la máquina de estados. Dejaría las reglas de datos para la aplicación.
- **No:** permisos por rol dentro del dominio. La autorización es otra preocupación (RF-05) y tiene su propia spec.
- **Sí:** entidad inmutable que devuelve `{ ticket, historial }`. Las pruebas son simples y la aplicación persiste ambos en una transacción. Así se cumple "cada transición escribe una fila en `ticket_historial`".
- **No:** entidad mutable con historial pendiente.
- **Sí:** solo los campos del ciclo de vida. Los demás llegan con la spec de registro de quejas.
- **Sí:** precondiciones estrictas: dependencia y prioridad para asignar (RF-12, RF-13), técnico para iniciar, descripción para resolver (RF-23) y motivo para rechazar, reabrir y trasladar (sección 3).
- **Sí:** `ponerEnEspera` exige motivo, que es la información solicitada al vecino (RF-21). Esta decisión no estaba en la sección 3: se tomó para dejar trazabilidad, y puede relajarse si la spec de atención lo pide.
- **Sí:** cada método valida su propio estado de origen, no solo la tabla. Así se evita que `reanudar` sobre `resuelta` pase por la transición `resuelta → en_proceso`, que pertenece a `reabrir`.
- **Sí:** un traslado aprobado limpia la dependencia y el técnico. El supervisor reasigna desde cero. La reapertura, en cambio, conserva el técnico (sección 3).
- **Sí:** la reapertura y la confirmación reciben `ahora` y `confirmacionVenceEn`. El dominio solo compara fechas, y el cálculo en días hábiles es de la spec de SLA.
- **Sí:** dos métodos de cierre, `confirmarSolucion` (vecino, dentro del plazo) y `cerrarPorVencimiento` (sistema, fuera del plazo). Son simétricos con `reabrir`. El límite exacto `ahora = vencimiento` cuenta como dentro del plazo.
- **Sí:** `ContextoTransicion { actorId, ahora }` en lugar de un `Clock` inyectado. La entidad no tiene dependencias, y `null` representa al sistema.
- **Sí:** la descripción de la resolución se guarda como `motivo` del historial de `en_proceso → resuelta`. Cabe en `ticket_historial.motivo` sin cambiar el esquema de SPEC 03.
- **Sí:** la marca `escalado` con `marcarEscalado()` sin historial, porque no es un cambio de estado. `reabrir` la limpia, porque el plazo de resolución se reinicia.
- **Sí:** `rechazar` no fija `cerradoEn`. La sección 6 reserva `cerrado_en` para el cierre.
- **Sí:** errores como excepciones tipadas con `codigo`. La presentación las traducirá a HTTP en otra spec.
- **No:** `Result<T, E>`.
- **Sí:** `Ticket.reconstituir()` no valida invariantes. Los datos vienen de la persistencia, que ya los escribió el dominio. Crear un ticket nuevo pertenece a la spec de registro.
- **Sí:** valores de estado y prioridad iguales a los de SPEC 03, en `snake_case`. Las etiquetas visibles van en los archivos de traducción.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| `ESTADOS_TICKET` y el enum `estado_ticket` de SPEC 03 divergen | Un criterio de aceptación exige que coincidan. La spec de repositorios debe agregar una prueba en `test:db` que compare ambos. |
| `pg` devuelve las columnas `bigint` como `string`, y el dominio usa `number` | La conversión es responsabilidad del repositorio. Los ids no superarán 2^53 en este sistema. |
| La lista fija de prioridades contradice RF-41 (catálogo administrable) | Ya está registrada como vacío en SPEC 03. Si se convierte en catálogo, `Prioridad` pasa a ser un id y `asignar` cambia de firma. |
| La aplicación persiste el ticket pero no el historial | La entidad devuelve ambos juntos. La spec de servicios debe guardarlos en una transacción. |

## Lo que **no** está en esta spec

- Permisos por rol y dependencia.
- Creación de tickets y generación de `numero`.
- Solicitud y aprobación de traslados, y duplicados.
- Cálculo de SLA, vencimientos y escalamiento automático.
- Repositorios, servicios, endpoints y errores HTTP.
- Comentarios, adjuntos, notificaciones y encuestas.

Cada uno de estos temas, cuando llegue, va en su propia spec.
