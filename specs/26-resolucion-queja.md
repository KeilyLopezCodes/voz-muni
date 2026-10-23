# SPEC 26 — Resolución de la queja como dato propio y visible

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 04, SPEC 11, SPEC 22, SPEC 25
> **Fecha:** 2026-10-23
> **Objetivo:** Guardar la descripción de la resolución (RF-23) y quién la registró en las columnas nuevas `tickets.resolucion` y `tickets.resuelto_por`, y mostrarla como "Solución" en el detalle `GET /api/v1/tickets/:id` y en la pantalla `/tickets/:id`, para el vecino y para los internos.

## Por qué existe esta spec

RF-23 pide que el técnico registre la resolución con descripción obligatoria y que la queja pase a `Resuelta`. SPEC 22 ya define esa transición: la acción `resolver` de `POST /api/v1/tickets/:id/transiciones` exige una descripción de 1 a 4000 caracteres, fija `resuelto_en` y guarda la descripción como `motivo` de `ticket_historial`.
Lo que falta es que la resolución sea un dato de la queja. Hoy solo vive en el historial, nadie la muestra, y el vecino no puede saber qué se hizo antes de confirmar o reabrir (RF-24).
Esta spec no cambia la acción `resolver` ni sus reglas. Agrega dónde se guarda la resolución y quién la ve.

### Conflicto en el documento de definición

La tabla de roles (sección 2) dice que el técnico "propone la resolución" y que el coordinador "aprueba resoluciones". RF-23 y la tabla del ciclo de vida (sección 3) dicen que el técnico pasa la queja directamente a `Resuelta`.
Esta spec sigue RF-23 y la tabla del ciclo de vida: no hay aprobación del coordinador. El conflicto queda registrado en Decisiones, y la sección 2 del documento no se modifica.

## Alcance

**Incluido:**

- Migración `0021_resolucion`: columnas `tickets.resolucion` y `tickets.resuelto_por`, con relleno desde `ticket_historial` para las quejas ya resueltas o cerradas.
- Dominio (SPEC 04): `Ticket` incorpora `resolucion` y `resueltoPor`. `resolver` los fija y `reabrir` los limpia, igual que hoy hace con `resueltoEn`.
- `TicketEscrituraRepository` (SPEC 19, ampliado en SPEC 22) guarda las dos columnas.
- `GET /api/v1/tickets/:id` (SPEC 25) agrega el campo `resolucion` a `TicketDetalle`.
- Frontend: el bloque "Solución" en `DetalleQueja` (SPEC 25), visible para el vecino y para los internos.
- Actualización de la sección 6 del documento de definición (fila `tickets` del modelo de datos) y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Aprobación de la resolución por el coordinador. Contradice RF-23. Si se pide, va en su propia spec.
- Mostrar la solución en la consulta pública `GET /api/v1/public/tickets/:numero` y en `/consulta` (RF-35). Esa spec debe incluir la resolución.
- Editar o corregir la resolución después de registrarla. Se corrige con un comentario público (SPEC 23).
- El correo `queja_resuelta` al vecino (RF-31). Va con RF-24, porque debe informar el plazo de confirmación.
- Confirmar, reabrir y cierre automático (RF-24, RF-30). Esta spec solo deja `reabrir` limpiando las columnas en el dominio.
- Mostrar la solución en las bandejas `/atencion`, `/asignacion` y `/triage`.
- Exigir evidencias para resolver (RF-20, SPEC 24).
- La línea de tiempo con todas las resoluciones anteriores (RF-25).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0021_resolucion.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN resolucion text NULL,
  ADD COLUMN resuelto_por bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT;
```

- `resolucion`: la descripción de la resolución vigente, ya recortada.
- `resuelto_por`: el usuario que ejecutó `resolver`. Puede ser el técnico, el coordinador o el supervisor (SPEC 22).
- Las dos columnas son `NULL` mientras la queja no está resuelta, y vuelven a `NULL` al reabrirla.
- No se agrega un `CHECK` que exija `resolucion` en `resuelta` o `cerrada`. La regla la garantiza el dominio, y un `CHECK` haría fallar la migración si hubiera filas antiguas sin descripción en el historial.

Relleno en el mismo `up`, para las quejas en `resuelta` o `cerrada`: se toma la última fila de `ticket_historial` con `estado_nuevo = 'resuelta'` (por `creado_en DESC, id DESC`) y se copian su `motivo` a `resolucion` y su `usuario_id` a `resuelto_por`.

El `down` elimina las dos columnas.

### Dominio (`backend/src/domain/ticket/ticket.ts`)

```ts
// Se agregan a las props del Ticket (SPEC 04).
readonly resolucion: string | null;
readonly resueltoPor: number | null;
```

| Método | Cambios que se agregan |
| --- | --- |
| `resolver(ctx, descripcion)` | `resolucion`: la descripción recortada (la misma que va como `motivo` del historial). `resueltoPor`: `ctx.actorId` |
| `reabrir(ctx, motivo, …)` | `resolucion: null`, `resueltoPor: null`, junto con el `resueltoEn: null` que ya limpia |

`resolver` sigue rechazando una descripción vacía con `DESCRIPCION_REQUERIDA`, y sigue exigiendo un estado de origen `en_proceso`. Las reglas de consistencia de SPEC 04 no cambian.

### Escritura

`KnexTicketEscrituraRepository` persiste `resolucion` y `resuelto_por` con los demás cambios de la transición, en la misma transacción que la fila de `ticket_historial`. Al reconstituir el ticket, lee las dos columnas.

La respuesta de `resolver` en `/transiciones` no cambia: `{ id, numero, estado, asignadoA, resueltoEn }` (SPEC 22).

### Lectura: `GET /api/v1/tickets/:id`

Se agrega un campo a `TicketDetalle` (SPEC 25). El resto del contrato no cambia.

```ts
export interface ResolucionDetalle {
  descripcion: string;
  resueltaEn: string;                              // ISO 8601 en UTC (tickets.resuelto_en)
  resueltaPor: { id: number; nombre: string } | null;
}

export interface TicketDetalle {
  // … campos de SPEC 25
  resolucion: ResolucionDetalle | null;
}
```

Reglas:

- `resolucion` es distinto de `null` solo si el estado es `resuelta` o `cerrada` y `tickets.resolucion` no es `NULL`. En cualquier otro estado es `null`.
- `resueltaPor` es `null` cuando el alcance de `tickets.ver` del usuario es `propia` (el vecino). Así se respeta SPEC 25, que no expone el técnico al vecino. La regla depende del alcance, no del nombre del rol.
- `resueltaPor` también es `null` si `tickets.resuelto_por` es `NULL`.
- La descripción es texto plano. No se interpreta como HTML ni como Markdown.

Lo implementa `obtenerDetalle` de `KnexTicketLecturaRepository` (SPEC 25), con un `LEFT JOIN usuarios` sobre `resuelto_por`.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Bloque "Solución" | En `DetalleQueja.tsx` (SPEC 25), debajo del encabezado y antes del hilo, solo si `detalle.resolucion` no es `null`. Muestra el título "Solución", la descripción con saltos de línea respetados (`white-space: pre-wrap`), "Resuelta el <fecha>" en `America/Guatemala` y, si hay `resueltaPor`, "por <nombre>" |
| Vecino en `resuelta` | Debajo de la solución, el texto "Revisa la solución. Pronto podrás confirmarla o reabrir la queja." La acción de confirmar o reabrir llega con RF-24 |
| Internos | El mismo bloque, con el nombre de quien resolvió |
| Accesibilidad | El bloque es una `section` con `aria-labelledby` apuntando al título "Solución" |
| Textos | `locales/es/tickets.json`, bajo `detalle.solucion.*` |

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: fila tickets con resolucion y resuelto_por
CLAUDE.md
backend/
  src/
    domain/ticket/ticket.ts                                    # props resolucion y resueltoPor; resolver y reabrir
    domain/repositories/ticket-lectura-repository.ts           # TicketDetalle.resolucion
    infrastructure/
      database/migrations/0021_resolucion.ts
      repositories/knex-ticket-escritura-repository.ts         # guarda y reconstituye las columnas
      repositories/knex-ticket-lectura-repository.ts           # obtenerDetalle con resolucion
    application/services/consulta-tickets.service.ts           # resueltaPor null con alcance propia
  tests/
    unit/ticket/transiciones.test.ts                           # resolver y reabrir con las columnas nuevas
    unit/autorizacion/consulta-tickets.service.test.ts         # resueltaPor según alcance
    db/schema.test.ts                                          # columnas y relleno de 0021
    db/atencion.api.test.ts                                    # resolver guarda las columnas (SPEC 22)
    db/tickets-lectura.api.test.ts                             # detalle con resolucion (SPEC 25)
frontend/
  src/
    features/tickets/api/tickets-api.ts                        # tipo ResolucionDetalle
    features/tickets/mis-quejas/DetalleQueja.tsx
    features/tickets/mis-quejas/SolucionQueja.tsx
    locales/es/tickets.json
  tests/
    features/tickets/solucion-queja.test.tsx
    features/tickets/detalle-queja.test.tsx
```

## Plan de implementación

1. Crear la migración `0021_resolucion.ts` con las dos columnas, el relleno desde `ticket_historial` y el `down`. Ampliar `tests/db/schema.test.ts`:
   - Las columnas existen, son `NULL` por defecto y `resuelto_por` referencia a `usuarios`.
   - Una queja en `resuelta` creada antes de la migración queda con la descripción y el usuario de su última fila de historial a `resuelta`.
   - El `down` elimina las columnas.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
2. Agregar `resolucion` y `resueltoPor` al `Ticket` del dominio. `resolver` los fija y `reabrir` los limpia. Ampliar `tests/unit/ticket/transiciones.test.ts`:
   - `resolver` deja `resolucion` con la descripción recortada y `resueltoPor` con el actor.
   - `resolver` con una descripción vacía o de solo espacios sigue lanzando `DESCRIPCION_REQUERIDA`.
   - `reabrir` deja `resolucion`, `resueltoPor` y `resueltoEn` en `null`.

   Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
3. Ampliar `KnexTicketEscrituraRepository` para persistir y reconstituir las dos columnas. Ampliar `tests/db/atencion.api.test.ts` (SPEC 22): después de `resolver`, `tickets.resolucion` coincide con el `motivo` del historial y `tickets.resuelto_por` es el usuario que resolvió, también cuando resuelve el coordinador. Verificación: `npm run test:db` pasa.
4. Agregar `resolucion` a `TicketDetalle`, a `obtenerDetalle` y a `ConsultaTicketsService`, con `resueltaPor` en `null` para el alcance `propia`. Ampliar `consulta-tickets.service.test.ts` y `tests/db/tickets-lectura.api.test.ts`:
   - Una queja `en_proceso` → `resolucion: null`.
   - Una queja `resuelta`, pedida por el técnico, el coordinador o el supervisor → `resolucion` con la descripción, `resueltaEn` y `resueltaPor`.
   - La misma queja pedida por su vecino → `resolucion` con la descripción y `resueltaEn`, y `resueltaPor: null`.
   - Una queja `cerrada` mantiene la resolución.
   - El detalle sigue sin datos de contacto ni DPI.

   Verificación: `npm run test:db`, `npm test`, `npm run typecheck` y `npm run lint:deps` pasan.
5. Frontend: agregar el tipo `ResolucionDetalle` a `tickets-api.ts`, crear `SolucionQueja.tsx` y usarlo en `DetalleQueja.tsx`. Agregar los textos a `tickets.json`. Crear `solucion-queja.test.tsx` y ampliar `detalle-queja.test.tsx`:
   - Sin `resolucion`, el bloque no aparece.
   - Con `resolucion`, muestra la descripción con sus saltos de línea y la fecha en `America/Guatemala`.
   - "por <nombre>" aparece solo si hay `resueltaPor`.
   - El vecino en `resuelta` ve el texto sobre confirmar o reabrir.
   - Una descripción con `<b>` se muestra como texto, sin interpretarse.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
6. Actualizar la fila `tickets` de la sección 6 del documento de definición con `resolucion` y `resuelto_por`. Actualizar `CLAUDE.md`:
   - La resolución vigente vive en `tickets.resolucion` y `tickets.resuelto_por`, y el historial conserva cada versión.
   - `reabrir` limpia las dos columnas en el dominio.
   - El conflicto "el coordinador aprueba resoluciones" se resolvió siguiendo RF-23.

   Verificación manual con el backend y `seed:dev`, después del triage, la asignación y la atención: `tecnico@vozmuni.test` resuelve una queja desde `/atencion` con una descripción de dos líneas. `vecino@vozmuni.test` abre `/tickets/:id` y ve "Solución" con la descripción y la fecha, sin el nombre del técnico. `coordinador@vozmuni.test` abre la misma queja y ve también "por Técnico de desarrollo".

## Criterios de aceptación

- [ ] La migración `0021_resolucion` agrega `tickets.resolucion` (`text NULL`) y `tickets.resuelto_por` (`bigint NULL`, referencia a `usuarios`), y su `down` las elimina.
- [ ] Después de la migración, cada queja en `resuelta` o `cerrada` tiene en `resolucion` y `resuelto_por` el `motivo` y el `usuario_id` de su última fila de historial con `estado_nuevo = 'resuelta'`.
- [ ] La acción `resolver` de SPEC 22 guarda la descripción recortada en `tickets.resolucion` y el usuario que resolvió en `tickets.resuelto_por`, en la misma transacción que la fila de `ticket_historial`.
- [ ] `resolver` sin descripción sigue respondiendo `400`, y su respuesta `200` sigue siendo `{ id, numero, estado, asignadoA, resueltoEn }`.
- [ ] El método `reabrir` del dominio deja `resolucion`, `resueltoPor` y `resueltoEn` en `null`.
- [ ] `GET /api/v1/tickets/:id` devuelve `resolucion: null` para las quejas que no están en `resuelta` ni en `cerrada`.
- [ ] Para una queja en `resuelta` o `cerrada`, `GET /api/v1/tickets/:id` devuelve `resolucion` con `descripcion` y `resueltaEn`. `resueltaPor` trae `{ id, nombre }` para los internos y es `null` para el vecino.
- [ ] Ningún archivo nuevo o modificado del backend compara el nombre de un rol: el ocultamiento de `resueltaPor` depende del alcance `propia`.
- [ ] En `/tickets/:id`, el bloque "Solución" aparece solo cuando hay resolución, muestra la descripción como texto plano con sus saltos de línea y la fecha en `America/Guatemala`, y muestra "por <nombre>" solo a los internos.
- [ ] A 360 px de ancho, el bloque "Solución" no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las columnas nuevas y la decisión sobre la aprobación del coordinador.

## Decisiones

- **Sí:** esta spec complementa SPEC 22, que ya implementa la transición de RF-23. La acción `resolver` y sus reglas no cambian.
- **No:** mover RF-23 desde SPEC 22 a esta spec. Rompería una spec ya escrita sin ganar nada.
- **Sí:** seguir RF-23 y la tabla del ciclo de vida. El técnico (o el coordinador o el supervisor, según SPEC 22) resuelve sin aprobación. La tabla de roles de la sección 2 contradice esto ("aprueba resoluciones"), y el conflicto queda registrado aquí y en `CLAUDE.md`.
- **No:** un paso de aprobación del coordinador, ni con estado nuevo ni con una marca. Si se pide, va en su propia spec.
- **Sí:** columnas `resolucion` y `resuelto_por` en `tickets`. La lectura es directa, y el historial conserva cada resolución anterior.
- **No:** dejar la resolución solo en `ticket_historial`. Cada lectura tendría que buscar la última fila.
- **No:** una tabla `resoluciones`. Solo hace falta con aprobaciones o varias resoluciones vigentes, y no hay ninguna de las dos.
- **Sí:** `resuelto_por` además de la descripción. Permite mostrar quién resolvió a los internos sin consultar el historial. Es una propuesta de esta spec, derivada de mostrar "quién resolvió" en el detalle.
- **Sí:** el dominio fija y limpia las columnas, como ya hace con `resueltoEn`. Así la regla vive en un solo lugar, y RF-24 no tiene que recordarla.
- **Sí:** la resolución es inmutable. Se corrige con un comentario público, y solo se reemplaza al reabrir y volver a resolver.
- **No:** edición por el autor durante 5 minutos, ni por el coordinador o el supervisor.
- **Sí:** el vecino ve la solución, pero no el nombre de quien resolvió, coherente con SPEC 25. Los internos ven el nombre.
- **Sí:** un solo lugar para mostrarla: el detalle `/tickets/:id`, el mismo para todos los roles.
- **No:** mostrarla en `/atencion`, `/asignacion` o `/triage`. Las quejas resueltas no están en esas bandejas.
- **Sí:** la consulta pública queda para la spec de RF-35, que debe mostrar la solución. El dato ya queda listo.
- **Sí:** sin correo `queja_resuelta`, coherente con SPEC 22. Va con RF-24, que define el plazo de confirmación que el aviso debe informar.
- **Sí:** sin `CHECK` en la base de datos. La regla la garantiza el dominio, y el `CHECK` haría fallar el relleno si hubiera datos antiguos incompletos.
- **Sí:** el texto del vecino sobre confirmar o reabrir, y la ubicación del bloque, los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Depende de SPEC 11, 22 y 25, que están en Borrador. Si cambian sus contratos (`TicketEscrituraRepository`, `TicketDetalle`), esta spec queda desalineada | Se implementa después de SPEC 25. Si alguna cambia, se revisa esta antes de aprobarla. |
| La columna y el historial pueden divergir si alguien escribe una sin la otra | Las dos se escriben en la misma transacción, desde el mismo resultado del dominio. El paso 3 prueba que coinciden. |
| El vecino ve "Pronto podrás confirmarla" y no tiene la acción | Es un texto temporal. La spec de RF-24 lo reemplaza por los botones de confirmar y reabrir. |
| El vecino no se entera de que su queja se resolvió hasta que entra al portal | Es una decisión explícita. La spec de RF-24 y RF-31 debe enviar `queja_resuelta` antes de publicar el portal. |
| Una descripción con HTML o scripts se interpreta en el navegador | Se muestra como texto plano (React escapa el contenido), y el paso 5 lo prueba. |

## Lo que **no** está en esta spec

- Aprobación de la resolución por el coordinador.
- Consulta pública (RF-35).
- Edición de la resolución.
- Correo `queja_resuelta` (RF-31).
- Confirmar, reabrir y cierre automático (RF-24, RF-30).
- Evidencias obligatorias y línea de tiempo (RF-20, RF-25).

Cada uno de estos temas, cuando llegue, va en su propia spec.
