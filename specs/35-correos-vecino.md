# SPEC 35 — Correos nuevos al vecino sobre la bandeja de salida

> **Estado:** Implementado
> **Depende de:** SPEC 12, SPEC 15, SPEC 20, SPEC 21, SPEC 22, SPEC 23, SPEC 34
> **Fecha:** 2026-10-23
> **Objetivo:** Avisar al vecino por correo, a través de la bandeja de salida de SPEC 34, cuando se le pide información, cuando se asigna el primer técnico, cuando se traslada su queja y cuando recibe comentarios públicos (como máximo un correo por queja en cada ventana configurable de 30 minutos).

## Por qué existe esta spec

RF-31 pide avisar al vecino por correo al registrar, asignar, solicitar información, resolver y cerrar su queja. Las specs anteriores ya cubren el registro (SPEC 12), la aceptación y el rechazo (SPEC 19), la resolución (SPEC 33), y el cierre y la reapertura (SPEC 27 y 33).
Faltan la solicitud de información, que SPEC 22 y SPEC 25 dejaron pendiente, y la asignación del técnico. El usuario también eligió avisar de los traslados y de los comentarios públicos.
SPEC 34 dividió RF-31 en dos partes: la bandeja de salida y estos correos nuevos. Esta spec cierra RF-31.

## Alcance

**Incluido:**

- Migración `0030_correos_vecino`:
  - Plantillas `informacion_solicitada`, `tecnico_asignado`, `queja_trasladada`, `comentario_publico` y `comentarios_publicos_agrupados`.
  - Columnas `tickets.aviso_comentario_en` y `tickets.avisos_comentario_pendientes`, con un índice parcial.
  - Parámetro `aviso_comentarios_ventana_minutos = 30`.
- Envíos nuevos, todos con `NotificadorCorreo.encolar` dentro de la transacción y `despachar` después (SPEC 34), al solicitante si tiene correo:

  | Correo | Cuándo | Spec del caso de uso |
  | --- | --- | --- |
  | `informacion_solicitada` | `poner_en_espera` | SPEC 22 |
  | `tecnico_asignado` | Asignación con `tecnico_anterior` en `NULL` (primera asignación, también después de un traslado) | SPEC 20 |
  | `queja_trasladada` | Aprobación de un traslado o traslado directo del supervisor | SPEC 21 |
  | `comentario_publico` | Primer comentario público de otra persona fuera de la ventana | SPEC 23 |
  | `comentarios_publicos_agrupados` | Al cerrar la ventana, si llegaron más comentarios durante ella | job de correos |

- `AvisosComentariosService.procesar(ahora)`, como primer paso de `correos.job.ts` (cambio sobre SPEC 34).
- Actualización de la sección 6 del documento de definición y de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Incluir el texto de los comentarios en el correo.
- Avisar cada reasignación de técnico.
- La consulta pública que muestre el estado y permita responder sin sesión (RF-35).
- Preferencias del vecino para desactivar correos.
- Correos a los internos (RF-32), y SMS o WhatsApp (RF-34).
- Una pantalla para editar `aviso_comentarios_ventana_minutos`, y editar las plantillas (RF-33).

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0030_correos_vecino.ts`

```sql
ALTER TABLE tickets
  ADD COLUMN aviso_comentario_en          timestamptz NULL,
  ADD COLUMN avisos_comentario_pendientes integer NOT NULL DEFAULT 0
    CHECK (avisos_comentario_pendientes >= 0);

CREATE INDEX tickets_avisos_comentario_pendientes_idx
  ON tickets (aviso_comentario_en) WHERE avisos_comentario_pendientes > 0;
```

- `aviso_comentario_en`: cuándo se envió (se encoló) el último aviso de comentarios de la queja.
- `avisos_comentario_pendientes`: los comentarios públicos que llegaron después de ese aviso, dentro de la ventana, y que todavía no se avisaron.

El `up` también inserta (con `ON CONFLICT DO NOTHING`):

- En `parametros`: `aviso_comentarios_ventana_minutos` con valor `30`.
- En `plantillas_notificacion`, las 5 plantillas de la tabla de abajo.

El `down` borra las plantillas, el parámetro, el índice y las columnas.

### Plantillas

En todas, `{{enlace}}` es `APP_URL/consulta?numero=<numero>`, como en SPEC 12 y SPEC 19.

| `clave` | `asunto` | Variables |
| --- | --- | --- |
| `informacion_solicitada` | `VozMuni: necesitamos información sobre tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{informacion}}`, `{{enlace}}` |
| `tecnico_asignado` | `VozMuni: ya atendemos tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{dependencia}}`, `{{enlace}}` |
| `queja_trasladada` | `VozMuni: tu queja {{numero}} cambió de área` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{enlace}}` |
| `comentario_publico` | `VozMuni: tienes un comentario nuevo en tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{enlace}}` |
| `comentarios_publicos_agrupados` | `VozMuni: tienes {{cantidad}} comentarios nuevos en tu queja {{numero}}` | `{{nombre}}`, `{{numero}}`, `{{titulo}}`, `{{cantidad}}`, `{{enlace}}` |

```text
informacion_solicitada:
Hola {{nombre}}:

Para continuar con tu queja "{{titulo}}" ({{numero}}) necesitamos esta información:

{{informacion}}

Inicia sesión en VozMuni y responde desde "Mis quejas". Mientras esperamos tu respuesta, el plazo de atención queda en pausa.
Consulta el estado en {{enlace}}

tecnico_asignado:
Hola {{nombre}}:

Un técnico de {{dependencia}} ya está atendiendo tu queja "{{titulo}}" ({{numero}}).
Consulta el estado en {{enlace}}

queja_trasladada:
Hola {{nombre}}:

Tu queja "{{titulo}}" ({{numero}}) se envió a revisión para que la atienda el área que corresponde.
Consulta el estado en {{enlace}}

comentario_publico:
Hola {{nombre}}:

La municipalidad dejó un comentario en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlo en "Mis quejas".
Consulta el estado en {{enlace}}

comentarios_publicos_agrupados:
Hola {{nombre}}:

La municipalidad dejó {{cantidad}} comentarios en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlos en "Mis quejas".
Consulta el estado en {{enlace}}
```

- `{{informacion}}` es el motivo de `poner_en_espera`, ya recortado (SPEC 22). Es público para el vecino (SPEC 28). `renderizar` lo escapa en la versión html (SPEC 09).
- `tecnico_asignado` no nombra al técnico, coherente con SPEC 25. `{{dependencia}}` es el nombre de la dependencia de la queja.
- `queja_trasladada` no incluye el motivo ni las dependencias, porque el motivo del traslado es interno (SPEC 28).
- Los comentarios no se copian en ningún correo.

### Reglas de los avisos de comentarios (`backend/src/domain/notificaciones/aviso-comentarios.ts`)

```ts
export interface EstadoAvisoComentarios {
  avisoComentarioEn: Date | null;
  pendientes: number;
}

export type DecisionAviso =
  | { tipo: 'enviar_ahora'; nuevoEstado: EstadoAvisoComentarios }   // aviso de 1 comentario
  | { tipo: 'acumular'; nuevoEstado: EstadoAvisoComentarios };

// Un comentario público nuevo de alguien que no es el solicitante.
export function alComentar(estado: EstadoAvisoComentarios, ahora: Date, ventanaMin: number): DecisionAviso;

// true si la ventana del último aviso terminó y hay comentarios pendientes.
export function debeEnviarAgrupado(estado: EstadoAvisoComentarios, ahora: Date, ventanaMin: number): boolean;
```

| Situación | Resultado |
| --- | --- |
| Sin aviso previo, o `ahora >= aviso_comentario_en + ventana` | Se encola `comentario_publico` enseguida. `aviso_comentario_en = ahora` y `pendientes = 0` |
| Dentro de la ventana del último aviso | No se envía nada. `pendientes += 1` |
| El job, con `pendientes > 0` y `ahora >= aviso_comentario_en + ventana` | Se encola `comentarios_publicos_agrupados` con `cantidad = pendientes`. `aviso_comentario_en = ahora` y `pendientes = 0` |

- Solo cuentan los comentarios con `interno = false` cuyo autor no es el solicitante de la queja. Las notas internas y los comentarios del propio vecino nunca generan avisos.
- Editar un comentario (SPEC 23) no genera avisos.
- Un aviso agrupado también abre una ventana nueva. Así, una conversación activa recibe como máximo un correo cada 30 minutos.
- La regla se aplica en la transacción de `crear` comentario (SPEC 23), con el ticket ya bloqueado (`FOR UPDATE`), para que dos comentarios simultáneos no envíen dos avisos.
- Si el solicitante no tiene correo, las columnas se actualizan igual y no se encola nada.
- `aviso_comentarios_ventana_minutos` se lee con `ParametroRepository` (SPEC 15). Si falta o no es un entero de 1 a 1440, se registra un error en el log y se usa el aviso inmediato sin agrupar. El comentario nunca falla por un correo.

### `AvisosComentariosService` (cambio sobre SPEC 34: primer paso del job de correos)

```ts
export class AvisosComentariosService {
  // Reclama con FOR UPDATE SKIP LOCKED los tickets con pendientes > 0 y la ventana cerrada,
  // encola el agrupado y reinicia el estado, en lotes de 100. Devuelve cuántos encoló.
  procesar(ahora: Date): Promise<number>;
}
```

`correos.job.ts` (SPEC 34) ejecuta en cada corrida, con el mismo `ahora`:

1. `AvisosComentariosService.procesar`, que encola los agrupados y los despacha después de cada lote.
2. `DespachoCorreosService.procesar`, que hace los reintentos (SPEC 34).

Un error en el primer paso se registra en el log y no impide el segundo.

### Puntos de envío en los casos de uso existentes

| Spec | Caso de uso | Condición | Variables |
| --- | --- | --- | --- |
| SPEC 22 | `poner_en_espera` (técnico, coordinador o supervisor) | Siempre | `informacion` = motivo recortado |
| SPEC 20 | Asignar técnico | La fila nueva de `ticket_asignaciones` tiene `tecnico_anterior` en `NULL` | `dependencia` = nombre de la dependencia |
| SPEC 21 | Aprobar un traslado, o traslado directo del supervisor | La queja pasó a `en_revision` | — |
| SPEC 23 | Crear un comentario | `interno = false` y el autor no es el solicitante | según `alComentar` |

- En todos los casos el destinatario es el solicitante, con `usuarioId` y `ticketId` en la fila de la bandeja (SPEC 34).
- Si el caso de uso se revierte (por ejemplo, un `409`), no queda correo, por el diseño de SPEC 34.
- Una solicitud de traslado rechazada o retirada no avisa al vecino: la queja no cambió.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: columnas, parámetro, plantillas
CLAUDE.md
backend/
  src/
    container.ts
    domain/notificaciones/aviso-comentarios.ts
    application/services/
      avisos-comentarios.service.ts
      atencion.service.ts                     # informacion_solicitada (SPEC 22)
      asignacion.service.ts                   # tecnico_asignado (SPEC 20)
      traslados.service.ts                    # queja_trasladada (SPEC 21)
      comentarios.service.ts                  # avisos de comentario (SPEC 23)
    infrastructure/
      database/migrations/0030_correos_vecino.ts
      repositories/knex-avisos-comentarios-repository.ts
      repositories/knex-ticket-escritura-repository.ts   # columnas de aviso
      jobs/correos.job.ts                     # primer paso (SPEC 34)
  tests/
    unit/notificaciones/aviso-comentarios.test.ts
    unit/notificaciones/avisos-comentarios.service.test.ts
    unit/jobs/correos.job.test.ts
    db/schema.test.ts                         # 0030
    db/correos-vecino.test.ts                 # los 4 correos contra Postgres real
```

## Plan de implementación

1. Crear `domain/notificaciones/aviso-comentarios.ts` y su prueba, con `ventanaMin = 30`. Casos:
   - Sin aviso previo, se envía ahora.
   - A los 10 minutos, se acumula (`pendientes = 1`, luego 2).
   - A los 30 minutos exactos, la ventana está cerrada y se envía ahora.
   - `debeEnviarAgrupado` es `true` solo con pendientes y la ventana cerrada.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0030_correos_vecino.ts` y ampliar `tests/db/schema.test.ts`: existen las columnas, el índice, el parámetro y las 5 plantillas, `avisos_comentario_pendientes = -1` es rechazado, y el `down` lo elimina todo. Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Encolar `informacion_solicitada` en `poner_en_espera` (SPEC 22) y `queja_trasladada` en la aprobación y el traslado directo (SPEC 21). Crear `tests/db/correos-vecino.test.ts`, con `despachoSincronico` y el enviador falso. Casos:
   - Poner en espera envía el correo con la información escapada en el html y el enlace `/consulta?numero=`.
   - Aprobar un traslado y el traslado directo envían `queja_trasladada` sin el motivo.
   - Rechazar o retirar una solicitud no envía nada.
   - Un solicitante sin correo no recibe nada.

   Verificación: `npm run test:db` pasa.
4. Encolar `tecnico_asignado` en la asignación (SPEC 20). Ampliar `correos-vecino.test.ts`:
   - La primera asignación envía el correo con la dependencia y sin el nombre del técnico.
   - Una reasignación no envía nada.
   - Después de un traslado, volver a aceptar y asignar envía de nuevo.

   Verificación: `npm run test:db` pasa.
5. Aplicar `alComentar` en la creación de comentarios (SPEC 23), con el ticket bloqueado. Ampliar `correos-vecino.test.ts`:
   - El primer comentario público del técnico envía `comentario_publico` sin el texto.
   - Dos más a los 5 y 10 minutos no envían y dejan `pendientes = 2`.
   - Una nota interna y un comentario del vecino no cuentan.
   - Editar no avisa.
   - Dos comentarios simultáneos fuera de la ventana envían un solo aviso.
   - Con el parámetro inválido, se avisa al instante y se registra el error.

   Verificación: `npm run test:db` pasa.
6. Crear `AvisosComentariosService`, `knex-avisos-comentarios-repository.ts` y su prueba unitaria, y agregarlo como primer paso de `correos.job.ts`. Ampliar `correos.job.test.ts` y `correos-vecino.test.ts`:
   - Al cerrarse la ventana, el job encola `comentarios_publicos_agrupados` con `cantidad = 2` y reinicia el estado.
   - Antes de que cierre, no encola.
   - Dos corridas simultáneas encolan un solo agrupado.
   - Un error en este paso no impide el despacho.

   Verificación: `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
7. Actualizar la sección 6 del documento de definición (columnas, parámetro y plantillas) y `CLAUDE.md`:
   - La tabla de RF-31 completa, con cada momento y su plantilla.
   - La regla de la ventana de comentarios.
   - Que `correos.job.ts` tiene dos pasos.

   Verificación manual con el backend, `seed:dev` y el SMTP de Ethereal: `tecnico@vozmuni.test` pone en espera una queja de `vecino@vozmuni.test`, y el log muestra la vista previa de `informacion_solicitada` con la información pedida. Después deja 3 comentarios públicos seguidos: llega un `comentario_publico`, y a los 30 minutos (o con `aviso_comentario_en` adelantado por SQL) llega `comentarios_publicos_agrupados` con "2 comentarios nuevos".

## Criterios de aceptación

- [ ] La migración `0030_correos_vecino` agrega las 5 plantillas, las 2 columnas con su `CHECK` e índice, y el parámetro `aviso_comentarios_ventana_minutos = 30`. Su `down` los elimina.
- [ ] `poner_en_espera` encola `informacion_solicitada` al solicitante, con la información pedida y el enlace `APP_URL/consulta?numero=`.
- [ ] La asignación con `tecnico_anterior` en `NULL` encola `tecnico_asignado`, con la dependencia y sin el nombre del técnico. Una reasignación no encola nada.
- [ ] La aprobación de un traslado y el traslado directo encolan `queja_trasladada` sin el motivo. Un rechazo o un retiro no encolan nada.
- [ ] Un comentario público de alguien que no es el solicitante encola `comentario_publico` si no hubo aviso en la ventana. Si hubo, suma a `avisos_comentario_pendientes`.
- [ ] Al cerrarse la ventana con pendientes, el job encola `comentarios_publicos_agrupados` con la cantidad y reinicia el estado. Una queja con conversación activa recibe como máximo un correo de comentarios por ventana.
- [ ] Las notas internas, los comentarios del propio vecino y las ediciones nunca generan avisos, y ningún correo incluye el texto de un comentario.
- [ ] Ningún aviso se encola dos veces, ni con comentarios simultáneos ni con corridas simultáneas del job.
- [ ] Todos los envíos nuevos pasan por `NotificadorCorreo` dentro de la transacción del caso de uso. Si el caso de uso se revierte, no queda correo, y un fallo de correo nunca cambia su respuesta.
- [ ] Ningún asunto ni cuerpo de correo está escrito en `src/` fuera de la migración `0030_correos_vecino`, y la ventana no está fija en el código.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición y `CLAUDE.md` documentan las plantillas, las columnas, el parámetro y la tabla completa de RF-31.

## Decisiones

- **Sí:** esta spec agrega `informacion_solicitada`, `tecnico_asignado`, `queja_trasladada` y los avisos de comentarios públicos, y con eso cierra RF-31 junto con SPEC 34.
- **Sí:** los avisos de comentarios se agrupan en ventanas de 30 minutos (el parámetro `aviso_comentarios_ventana_minutos`). El primero sale al instante, y los siguientes de la ventana se juntan en un correo al cerrarla, como decidió el usuario en SPEC 34 y en esta.
- **No:** un correo por comentario, ni esperar siempre al cierre de la ventana.
- **Sí:** el aviso de comentarios necesita dos plantillas (`comentario_publico` y `comentarios_publicos_agrupados`). Así el singular y el plural quedan en la base y no en el código. Es una consecuencia de la regla de SPEC 09 de no escribir textos de correo en `src/`.
- **Sí:** los correos no copian el texto de los comentarios. Pueden editarse durante 5 minutos (SPEC 23), y el vecino los lee en el portal.
- **Sí:** `tecnico_asignado` sale solo en la primera asignación (`tecnico_anterior` en `NULL`), y también en la primera asignación después de un traslado.
- **No:** avisar cada reasignación.
- **Sí:** el enlace de los 4 correos es `APP_URL/consulta?numero=`, como eligió el usuario, coherente con SPEC 12 y SPEC 19.
- **Sí:** como la consulta pública no permite responder, el texto de `informacion_solicitada` y de los comentarios le indica al vecino que inicie sesión en "Mis quejas". Es una consecuencia del enlace elegido.
- **No:** `APP_URL/tickets/:id`, que es el enlace de `queja_resuelta` (SPEC 33).
- **Sí:** `queja_trasladada` no incluye el motivo ni las dependencias, porque el motivo es interno (SPEC 28).
- **Sí:** el agrupado lo envía el primer paso de `correos.job.ts`, que corre cada minuto. Es un cambio sobre SPEC 34.
- **No:** usar `sla.job.ts`, que no tiene relación con los correos.
- **Sí:** si el parámetro de la ventana es inválido, se avisa al instante en lugar de fallar el comentario. Un correo nunca bloquea un caso de uso (SPEC 34).
- **Sí:** el texto de las plantillas, el rango del parámetro (1 a 1440 minutos) y el tamaño de los lotes (100) los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El enlace lleva a `/consulta`, que hoy es un placeholder (SPEC 06) y no permite responder, así que el vecino al que se le pide información puede no saber cómo hacerlo | El correo dice explícitamente que inicie sesión y responda en "Mis quejas". RF-35 completará la consulta pública. Si se prefiere, cambiar el enlace es editar una plantilla. |
| Un vecino de ventanilla sin cuenta activa (SPEC 13) no puede iniciar sesión para responder | La invitación de SPEC 13 le permite activar su cuenta. El receptor puede registrar su respuesta por teléfono como comentario. |
| Las columnas de aviso agregan estado de notificación a `tickets` | Son dos columnas acotadas, con su `CHECK`. Moverlas a una tabla propia es posible si RF-32 suma más agrupaciones. |
| Un comentario y el job pueden competir por la misma queja | El comentario bloquea el ticket con `FOR UPDATE`, y el job usa `SKIP LOCKED`. El paso 6 lo prueba. |
| Toca los casos de uso de SPEC 20, 21, 22 y 23, en Borrador | Se implementa después de SPEC 34. Las pruebas de cada spec deben seguir pasando. |

## Lo que **no** está en esta spec

- El texto de los comentarios en el correo.
- Avisos de cada reasignación.
- La consulta pública con respuesta (RF-35).
- Preferencias, correos internos, SMS y WhatsApp.
- Edición de la ventana y de las plantillas.

Cada uno de estos temas, cuando llegue, va en su propia spec.
