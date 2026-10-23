# SPEC 34 — Bandeja de salida de correos con reintentos

> **Estado:** Borrador
> **Depende de:** SPEC 03, SPEC 09, SPEC 10, SPEC 12, SPEC 13, SPEC 16, SPEC 19, SPEC 22, SPEC 27, SPEC 33
> **Fecha:** 2026-10-23
> **Objetivo:** Hacer que todo correo del sistema se encole ya renderizado en la tabla `correos_salientes`, dentro de la misma transacción del caso de uso, se intente enviar en cuanto se confirma y, si falla, lo reintente el job `correos.job.ts` hasta completar 3 intentos, conservando después solo los metadatos.

## Por qué existe esta spec

RF-31 pide avisar al vecino por correo al registrar, asignar, solicitar información, resolver y cerrar su queja. Las specs anteriores ya crearon 11 plantillas, pero todas envían igual: sin esperar, y si el SMTP falla, el error solo queda en el log. El correo se pierde y no queda registro de que se intentó.
Antes de agregar más correos (spec siguiente), esta spec da a todos un único camino de envío, confiable y con registro.

### División de RF-31

El usuario decidió dividir RF-31 en dos specs:

1. **Esta spec (34):** la bandeja de salida y la migración de los envíos existentes.
2. **La siguiente (35):** los correos `informacion_solicitada`, `tecnico_asignado`, `comentario_publico` y `queja_trasladada`, ya sobre la bandeja. Para `comentario_publico` ya está decidido: como máximo un correo por queja cada 30 minutos (parámetro), con un único "Tienes N comentarios nuevos" si hay varios en la ventana, y nunca por los comentarios del propio vecino.

## Alcance

**Incluido:**

- Migración `0029_correos_salientes`: tabla `correos_salientes` con estado, intentos, próximo intento, vencimiento opcional y cuerpo temporal.
- Reglas del ciclo de un correo en el dominio (`domain/notificaciones/correo-saliente.ts`): 3 intentos en total, el primero inmediato, después a los 5 minutos y a los 30.
- `NotificadorCorreo` (`application/`):
  - `encolar` renderiza la plantilla y escribe la fila en la transacción del caso de uso.
  - `despachar` intenta el envío en cuanto se confirma la transacción.
- `DespachoCorreosService.procesar(ahora)`: reintenta los pendientes con `FOR UPDATE SKIP LOCKED`.
- El job `infrastructure/jobs/correos.job.ts`, cada minuto, con `CORREOS_JOB_CRON` y `CORREOS_JOB_ACTIVO`.
- Migración de los envíos de las 11 plantillas existentes, tanto las de cuenta como las de quejas, a `NotificadorCorreo`.
- Los correos con un enlace de token vencido se descartan en lugar de enviarse.
- Al terminar un correo (enviado, fallido o descartado), se borran el texto y el html, y quedan solo los metadatos.
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `.env.example`.

**Fuera de alcance (para specs futuras):**

- Los 4 correos nuevos de RF-31 y la agrupación de comentarios (SPEC 35).
- Una pantalla o un endpoint para ver los correos fallidos. Solo quedan en el log.
- Reenviar a mano un correo fallido.
- Purgar los metadatos antiguos de `correos_salientes`.
- Preferencias del vecino para desactivar correos. Son avisos transaccionales.
- SMS y WhatsApp (RF-34).
- Editar las plantillas (RF-33).
- Detectar rebotes, aperturas o clics.

## Modelo de datos

### Migración `backend/src/infrastructure/database/migrations/0029_correos_salientes.ts`

| Columna | Tipo | Restricciones |
| --- | --- | --- |
| `id` | bigint identity | PK |
| `plantilla_clave` | text | NOT NULL |
| `para` | text | NOT NULL |
| `asunto` | text | NOT NULL |
| `texto` | text | NULL |
| `html` | text | NULL |
| `ticket_id` | bigint | NULL, FK `tickets` ON DELETE RESTRICT |
| `usuario_id` | bigint | NULL, FK `usuarios` ON DELETE RESTRICT (el destinatario, si es un usuario) |
| `estado` | text | NOT NULL, DEFAULT `'pendiente'`, CHECK `IN ('pendiente', 'enviado', 'fallido', 'descartado')` |
| `intentos` | integer | NOT NULL, DEFAULT 0, CHECK `BETWEEN 0 AND 3` |
| `proximo_intento_en` | timestamptz | NOT NULL, DEFAULT now() |
| `expira_en` | timestamptz | NULL (el vencimiento del token del enlace, si lleva uno) |
| `ultimo_error` | text | NULL |
| `creado_en` | timestamptz | NOT NULL, DEFAULT now() |
| `terminado_en` | timestamptz | NULL |

`CHECK`s:

- `correos_salientes_cuerpo_solo_pendiente`: `(estado = 'pendiente') = (texto IS NOT NULL AND html IS NOT NULL)`. El cuerpo, que puede llevar tokens y datos personales, solo existe mientras el correo está pendiente.
- `correos_salientes_terminado`: `(estado = 'pendiente') = (terminado_en IS NULL)`.

Índice parcial `correos_salientes_pendientes_idx` sobre `(proximo_intento_en) WHERE estado = 'pendiente'`. El `down` borra la tabla.

### Reglas (`backend/src/domain/notificaciones/correo-saliente.ts`)

```ts
export const MAX_INTENTOS = 3;
// Espera después del intento 1 y del intento 2.
export const ESPERAS_REINTENTO_MIN = [5, 30] as const;

export type EstadoCorreo = 'pendiente' | 'enviado' | 'fallido' | 'descartado';

// Después de un fallo: el próximo intento, o null si ya no quedan (pasa a 'fallido').
export function proximoIntento(intentosHechos: number, ahora: Date): Date | null;

// true si el enlace del correo ya venció y no tiene sentido enviarlo.
export function debeDescartarse(expiraEn: Date | null, ahora: Date): boolean;
```

| Intento | Cuándo | Si falla |
| --- | --- | --- |
| 1 | En cuanto se confirma la transacción del caso de uso | Pendiente, con el próximo intento a los 5 min |
| 2 | Lo hace el job, a partir de `+5 min` | Pendiente, con el próximo intento a los 30 min |
| 3 | Lo hace el job, a partir de `+30 min` | `fallido`, con `ultimo_error` y aviso en el log |

- Son constantes técnicas del canal de envío, no valores municipales.
- Si `expira_en < ahora` al momento de enviar, el correo pasa a `descartado` sin enviarse. Por ejemplo, un enlace de recuperación de 30 minutos (SPEC 09) que no salió a tiempo.

### Puertos

```ts
// backend/src/domain/repositories/correo-saliente-repository.ts
export interface NuevoCorreo {
  plantillaClave: string;
  para: string;
  asunto: string;
  texto: string;
  html: string;
  ticketId: number | null;
  usuarioId: number | null;
  expiraEn: Date | null;
}

export interface CorreoReclamado extends NuevoCorreo { id: number; intentos: number }

export interface CorreoSalienteRepository {
  insertar(correo: NuevoCorreo, trx): Promise<number>;
  // SELECT … FOR UPDATE SKIP LOCKED: los ids pedidos que sigan pendientes (para el envío inmediato).
  reclamarPorId(ids: number[], trx): Promise<CorreoReclamado[]>;
  // SELECT … FOR UPDATE SKIP LOCKED: pendientes con proximo_intento_en <= ahora, hasta `limite`.
  reclamarVencidos(ahora: Date, limite: number, trx): Promise<CorreoReclamado[]>;
  marcarEnviado(id: number, ahora: Date, trx): Promise<void>;         // borra texto y html
  marcarDescartado(id: number, ahora: Date, trx): Promise<void>;      // borra texto y html
  registrarFallo(id: number, error: string, proximo: Date | null, ahora: Date, trx): Promise<void>;
  // proximo = null → 'fallido' y borra texto y html
}
```

`EnviadorCorreo` (SPEC 09) no cambia: solo lo usa el despacho.

### `NotificadorCorreo` (`backend/src/application/services/notificador-correo.service.ts`)

```ts
export interface DestinoCorreo {
  para: string;
  usuarioId?: number;
  ticketId?: number;
  expiraEn?: Date;
}

export class NotificadorCorreo {
  // Renderiza la plantilla (SPEC 09) e inserta la fila en `trx`. Devuelve el id.
  // Si la plantilla no existe, registra el error en el log y devuelve null: el caso de uso sigue.
  encolar(clave: string, variables: Record<string, string>, destino: DestinoCorreo, trx): Promise<number | null>;

  // Se llama después de confirmar la transacción y no se espera.
  // Reclama los ids, intenta el envío 1 y registra el resultado.
  despachar(ids: number[]): void;
}
```

El patrón de cada caso de uso que envía correos queda así:

1. Dentro de su transacción, el caso de uso llama a `encolar`. Si la transacción se revierte, el correo tampoco existe. Así no se avisa de cosas que no ocurrieron.
2. Después de confirmar, llama a `despachar(ids)` sin esperar. La respuesta HTTP no se demora por el SMTP.
3. Un fallo de envío nunca cambia la respuesta del caso de uso, como antes.

En `NODE_ENV=test`, `container.ts` acepta la opción `despachoSincronico: true`. Con ella, `despachar` se espera, y las pruebas pueden comprobar los mensajes del `EnviadorCorreo` falso sin depender de tiempos.

### `DespachoCorreosService` y job

```ts
export class DespachoCorreosService {
  // Por lotes de 50: reclama los vencidos, descarta, envía o registra el fallo. Devuelve cuántos procesó.
  procesar(ahora: Date): Promise<number>;
}
```

- `infrastructure/jobs/correos.job.ts` lo programa con node-cron (dependencia de SPEC 31). Es independiente de `sla.job.ts`, porque necesita otra frecuencia. Como el job de SLA, salta la corrida si la anterior sigue en curso, registra los errores sin detenerse, y `server.ts` lo inicia y lo detiene.
- Variables nuevas en `env.ts`:

  | Variable | Por defecto |
  | --- | --- |
  | `CORREOS_JOB_ACTIVO` | `true` (`false` en `NODE_ENV=test`) |
  | `CORREOS_JOB_CRON` | `* * * * *` |

- `SKIP LOCKED` evita que el envío inmediato y el job, o dos instancias, envíen el mismo correo.
- Un correo que pasa a `fallido` se registra en el log con el destinatario enmascarado (`a***@dominio`, el formato de SPEC 12), la plantilla, el `ticket_id` y el error.

### Migración de los envíos existentes

Cada caso de uso reemplaza su llamada directa a `EnviadorCorreo` por `encolar` y `despachar`:

| Plantilla | Caso de uso | Spec | `expiraEn` | `ticketId` |
| --- | --- | --- | --- | --- |
| `recuperacion_password` | Pedir la recuperación | SPEC 09 | vencimiento del enlace | — |
| `invitacion_usuario` | Invitar a un usuario interno | SPEC 10 | vencimiento de la invitación | — |
| `invitacion_vecino` | Alta de vecino en ventanilla | SPEC 13 | vencimiento de la invitación | — |
| `verificacion_correo` | Registro del vecino | SPEC 16 | vencimiento del enlace | — |
| `queja_registrada` | Registrar una queja | SPEC 12 | — | sí |
| `queja_aceptada`, `queja_rechazada` | Aceptar o rechazar en el triage | SPEC 19 | — | sí |
| `queja_resuelta` | Resolver | SPEC 22 (y SPEC 33) | — | sí |
| `queja_cerrada`, `queja_reabierta` | Confirmar o reabrir | SPEC 27 | — | sí |
| `queja_cerrada_automaticamente` | Cierre automático | SPEC 33 | — | sí |

- Los asuntos, los cuerpos y las variables de las plantillas no cambian.
- Las pruebas existentes que comprueban el `EnviadorCorreo` falso siguen pasando con `despachoSincronico`.
- El cierre automático (SPEC 33) encola dentro de la transacción de cada lote y despacha después de confirmarla.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: tabla correos_salientes, job
CLAUDE.md
backend/
  .env.example                                         # CORREOS_JOB_ACTIVO, CORREOS_JOB_CRON
  src/
    server.ts                                          # inicia y detiene correos.job
    container.ts                                       # NotificadorCorreo, despachoSincronico
    infrastructure/config/env.ts
    domain/
      notificaciones/correo-saliente.ts
      repositories/correo-saliente-repository.ts
    application/services/
      notificador-correo.service.ts
      despacho-correos.service.ts
      # migración de envíos (los nombres son los de cada spec):
      recuperacion.service.ts  usuarios.service.ts  vecinos.service.ts  registro-vecinos.service.ts
      registro-tickets.service.ts  triage.service.ts  atencion.service.ts
      confirmacion.service.ts  cierre-automatico.service.ts
    infrastructure/
      database/migrations/0029_correos_salientes.ts
      repositories/knex-correo-saliente-repository.ts
      jobs/correos.job.ts
  tests/
    unit/notificaciones/correo-saliente.test.ts
    unit/notificaciones/notificador-correo.test.ts
    unit/notificaciones/despacho-correos.service.test.ts
    unit/jobs/correos.job.test.ts
    unit/env.test.ts
    db/schema.test.ts                                  # 0029
    db/correos-salientes.test.ts                       # encolado transaccional, reintentos, concurrencia
```

## Plan de implementación

1. Crear `domain/notificaciones/correo-saliente.ts` y su prueba. Casos:
   - Después del intento 1, el próximo es a los 5 min. Después del 2, a los 30. Después del 3, `null`.
   - `debeDescartarse` es `true` solo si `expiraEn` es anterior a `ahora`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
2. Crear la migración `0029_correos_salientes.ts` y ampliar `tests/db/schema.test.ts`:
   - La tabla, sus `CHECK` y el índice existen.
   - Un `enviado` con `texto` viola `correos_salientes_cuerpo_solo_pendiente`.
   - `intentos = 4` es rechazado.
   - El `down` la elimina.

   Verificación: `npm run test:db` pasa, y `migrate:rollback` seguido de `migrate:latest` funciona.
3. Crear `CorreoSalienteRepository`, `KnexCorreoSalienteRepository`, `NotificadorCorreo` y `DespachoCorreosService`, con pruebas unitarias con falsos. Crear `tests/db/correos-salientes.test.ts`. Casos:
   - `encolar` dentro de una transacción revertida no deja filas.
   - `despachar` con el enviador funcionando deja `enviado`, `intentos = 1` y el cuerpo en `NULL`.
   - Con el enviador fallando: queda pendiente para `+5 min`, luego `+30 min`, y en el tercer fallo pasa a `fallido`, con `ultimo_error`, el cuerpo en `NULL` y el aviso en el log con el correo enmascarado.
   - Con `expira_en` vencido, el correo queda `descartado` sin llamar al enviador.
   - Una plantilla inexistente devuelve `null` y no interrumpe la transacción.
   - El envío inmediato y `procesar` simultáneos envían el correo una sola vez.
   - Más de 50 pendientes se procesan en varios lotes.

   Verificación: `npm test` y `npm run test:db` pasan.
4. Agregar las variables a `env.ts` y `.env.example`, crear `jobs/correos.job.ts` y `correos.job.test.ts`, e iniciarlo y detenerlo en `server.ts`. Casos:
   - Programa con la expresión configurada.
   - Salta una corrida si la anterior sigue en curso.
   - Un error no lo detiene.
   - En `test` está desactivado por defecto.

   Verificación: `npm test`, `npm run typecheck` y `npm run lint:deps` pasan, y `npm start` registra el job programado.
5. Migrar los envíos de cuenta: SPEC 09, 10, 13 y 16, con `expiraEn` del token. Activar `despachoSincronico` en las pruebas. Verificación: las pruebas de `test:db` de recuperación, invitaciones y registro pasan sin cambios en sus aserciones sobre los mensajes. Además, cada envío deja una fila `enviado` con `plantilla_clave` y `usuario_id`.
6. Migrar los envíos de quejas: SPEC 12, 19, 22, 27 y 33, con `ticketId`. Verificación: sus pruebas de `test:db` pasan sin cambios en sus aserciones. Además, una transición revertida (por ejemplo, un `409`) no deja correos, y cada envío deja una fila con su `ticket_id`.
7. Comprobar que no queda ninguna llamada directa a `EnviadorCorreo.enviar` fuera de `NotificadorCorreo` y `DespachoCorreosService`, y agregar una regla a `.dependency-cruiser.cjs` o una prueba que lo verifique. Verificación: `npm run lint:deps` pasa.
8. Actualizar la sección 6 del documento de definición (tabla `correos_salientes` y job de correos). Actualizar `CLAUDE.md`:
   - Que todo correo se envía con `NotificadorCorreo.encolar` dentro de la transacción y `despachar` después del commit.
   - Los 3 intentos y el descarte por token vencido.
   - Que el cuerpo se borra al terminar.
   - Las variables del job.

   Verificación manual con el backend y `seed:dev`: con `SMTP_HOST` apuntando a un puerto cerrado, `vecino@vozmuni.test` registra una queja. La fila de `queja_registrada` queda pendiente para `+5 min`. Se restaura el SMTP de Ethereal, y en la corrida siguiente al `proximo_intento_en` el correo sale, con el enlace de vista previa en el log y la fila `enviado` sin cuerpo.

## Criterios de aceptación

- [ ] La migración `0029_correos_salientes` crea la tabla con sus `CHECK` (el cuerpo solo mientras está `pendiente`, y `intentos` de 0 a 3) y el índice de pendientes. Su `down` la elimina.
- [ ] Todo correo del sistema se escribe en `correos_salientes` dentro de la transacción del caso de uso. Si la transacción se revierte, no queda fila ni se envía nada.
- [ ] Después de confirmar la transacción, el correo se intenta enviar de inmediato sin demorar la respuesta HTTP. Si falla, se reintenta a los 5 minutos y a los 30. Después del tercer fallo queda `fallido`, con `ultimo_error` y un aviso en el log con el destinatario enmascarado.
- [ ] Un correo con `expira_en` vencido pasa a `descartado` sin enviarse.
- [ ] Al pasar a `enviado`, `fallido` o `descartado`, `texto` y `html` quedan en `NULL`, y se conservan la plantilla, el destinatario, el ticket, el usuario, el estado, los intentos y las fechas.
- [ ] Ningún correo se envía dos veces, ni entre el envío inmediato y el job, ni entre instancias.
- [ ] El job `correos.job.ts` corre cada minuto por defecto, salta una corrida si la anterior sigue en curso, sobrevive a errores, no corre en `NODE_ENV=test` y se detiene al cerrar el servidor.
- [ ] Las 11 plantillas existentes se envían por `NotificadorCorreo`, sin cambios en sus asuntos, cuerpos ni variables, y las pruebas de sus specs siguen pasando.
- [ ] Fuera de `NotificadorCorreo` y `DespachoCorreosService`, ningún archivo de `src/` llama a `EnviadorCorreo.enviar`, y una regla o prueba lo verifica.
- [ ] Una plantilla inexistente no interrumpe el caso de uso.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición, `CLAUDE.md` y `.env.example` documentan la tabla, el patrón encolar/despachar, los reintentos y las variables del job.

## Decisiones

- **Sí:** RF-31 se divide en dos specs. Esta define la bandeja y migra los envíos existentes. La 35 agrega los 4 correos nuevos sobre la bandeja. Así cada una se revisa y se prueba por separado.
- **Sí:** todos los correos pasan por la bandeja, incluidos los de cuenta (recuperación, verificación e invitaciones). Hay un solo camino de envío.
- **No:** dejar los correos de cuenta con el envío directo.
- **Sí:** se guarda el mensaje ya renderizado. Lo que se envía coincide con la plantilla del momento del evento, aunque después se edite (RF-33).
- **No:** guardar la clave y las variables, y renderizar al enviar.
- **Sí:** el primer intento es inmediato, después del commit y sin esperarlo, y el job hace de respaldo. La recuperación de contraseña no espera al minuto del job.
- **No:** enviar solo desde el job.
- **Sí:** 3 intentos en total (inmediato, `+5 min` y `+30 min`), como eligió el usuario. Un correo queda `fallido` en unos 35 minutos.
- **Sí:** los correos con un enlace de token vencido se descartan. No tiene sentido enviar un enlace que ya no funciona. Es una propuesta de esta spec, ligada a guardar `expira_en`.
- **Sí:** al terminar se borran el texto y el html, y quedan los metadatos como registro. El cuerpo puede llevar tokens y datos personales.
- **No:** conservar el cuerpo completo.
- **Sí:** los correos fallidos solo se ven en el log, con el destinatario enmascarado.
- **No:** un endpoint o una pantalla de administración por ahora.
- **Sí:** encolar dentro de la transacción del caso de uso, para no avisar de algo que se revirtió. Antes, algunos envíos ocurrían aunque la acción hubiera fallado después.
- **Sí:** un job propio para los correos, `correos.job.ts`, cada minuto. Es independiente de `sla.job.ts`, que corre cada 5 minutos y tiene otro propósito.
- **Sí:** `despachoSincronico` en las pruebas, para que las aserciones sobre el enviador falso no dependan de tiempos.
- **Sí:** se mantiene la regla de que un fallo de correo nunca cambia la respuesta del caso de uso, igual que antes.
- **Sí:** el tamaño de los lotes (50) y los nombres de los estados los propone esta spec. El usuario puede ajustarlos al revisarla.
- **Sí:** las esperas y el máximo de intentos son constantes del dominio y no parámetros, porque son técnicas del canal y no valores municipales.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Toca los casos de uso de 9 specs, varias todavía en Borrador | Se migra en dos pasos (cuenta y quejas). Las pruebas de cada spec deben pasar sin cambiar sus aserciones. Si una spec cambia antes de esta, se revisa la tabla de migración. |
| Si el proceso se cae entre el commit y el envío inmediato, el correo queda pendiente | El job lo envía en la siguiente corrida, porque `proximo_intento_en` ya pasó. Es justamente lo que esta spec resuelve. |
| Un SMTP caído más de 35 minutos deja correos `fallido` sin reenvío | Quedan en el log y con sus metadatos. El reenvío manual y la pantalla de fallidos quedan para otra spec. |
| La tabla crece sin límite | Los cuerpos se borran al terminar. La purga de metadatos queda pendiente. |
| El job de correos y el de SLA corren en el mismo proceso | Cada uno tiene su bandera de corrida en curso y su propio interruptor. |
| Un token de recuperación de 30 minutos puede vencer antes del tercer intento | Se descarta en lugar de enviarse. El usuario puede pedir otro enlace. |

## Lo que **no** está en esta spec

- Los 4 correos nuevos y la agrupación de comentarios (SPEC 35).
- Pantalla, endpoint y reenvío de fallidos.
- Purga de metadatos.
- Preferencias del vecino.
- SMS, WhatsApp, edición de plantillas y seguimiento de rebotes.

Cada uno de estos temas, cuando llegue, va en su propia spec.
