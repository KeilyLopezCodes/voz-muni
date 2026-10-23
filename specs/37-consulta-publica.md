# SPEC 37 — Consulta pública del estado de una queja

> **Estado:** Borrador
> **Depende de:** SPEC 06, SPEC 08, SPEC 12, SPEC 13, SPEC 17, SPEC 23, SPEC 26, SPEC 27, SPEC 28, SPEC 33
> **Fecha:** 2026-10-23
> **Objetivo:** Permitir que cualquier persona, sin iniciar sesión, consulte en `/consulta` el estado, la solución, el plazo, la línea de tiempo pública y los comentarios públicos de una queja con su número y el correo o teléfono registrado, mediante `GET /api/v1/public/tickets/:numero?contacto=`, sin exponer datos personales y con un límite por IP.

## Por qué existe esta spec

RF-35 pide que cualquier persona consulte el estado de una queja con su número y el correo o teléfono registrado, sin iniciar sesión. La sección 2 agrega que el visitante no ve los comentarios internos, y la sección 6 define `GET /api/v1/public/tickets/:numero`.
La página `/consulta` existe desde SPEC 06, pero es un placeholder. Los correos de SPEC 12, 19 y 35 ya enlazan a `/consulta?numero=…`.
Varias specs dejaron cosas para RF-35:

- SPEC 26: mostrar la solución.
- SPEC 27: mostrar el plazo de confirmación.
- SPEC 28: mostrar la línea de tiempo.
- SPEC 35: que el vecino sepa cómo responder.

## Alcance

**Incluido:**

- `GET /api/v1/public/tickets/:numero?contacto=`, sin sesión, como define la sección 6 del documento.
- Verificación del contacto contra el solicitante: un correo (sin distinguir mayúsculas) o un teléfono normalizado a 8 dígitos (`normalizarTelefono` de SPEC 13).
- La misma respuesta `404 CONSULTA_NO_ENCONTRADA` si el número no existe o si el contacto no coincide.
- Límite de 10 consultas por IP cada 15 minutos (`CONSULTA_LIMITE_POR_VENTANA`).
- Contenido de la respuesta:
  - El estado y las fechas.
  - La solución y el plazo de confirmación (SPEC 26 y 27), y si el cierre fue automático (SPEC 33).
  - La línea de tiempo pública, solo con los cambios de estado (SPEC 28).
  - Los comentarios públicos, con autor "Municipalidad" o "Vecino".
- Ningún dato personal: ni nombre, ni contacto, ni dirección exacta, ni coordenadas, ni técnico.
- La query de esta ruta nunca se escribe en los logs del backend.
- Frontend `/consulta`:
  - Un formulario con el número (precargado desde `?numero=`) y el contacto.
  - El resultado se guarda solo en memoria.
  - Un botón contextual al portal ("Inicia sesión para responder o confirmar").
- Actualización de la sección 6 del documento de definición, de `CLAUDE.md` y de `.env.example`.

**Fuera de alcance (para specs futuras):**

- Responder, confirmar o reabrir desde la consulta pública. Requiere sesión (SPEC 25 y 27).
- Ver los adjuntos públicos.
- Un token de consulta para recargar sin volver a escribir el contacto.
- CAPTCHA, o un bloqueo por número después de varios intentos fallidos.
- La documentación OpenAPI del endpoint (RNF-19, sin spec todavía).
- Configurar Nginx para que no registre la query string. Llega con la spec de despliegue.
- Consultar varias quejas por contacto ("todas mis quejas" sin sesión).

## Modelo de datos

Esta spec no crea tablas, columnas ni migraciones. Lee `tickets`, `usuarios` (el solicitante), `categorias`, `zonas`, `ticket_historial` y `comentarios`.

### `GET /api/v1/public/tickets/:numero`

Sin `autenticar`. Protegido por `limitePorIp(CONSULTA_LIMITE_POR_VENTANA)`.

- `:numero`: formato `Q-AAAA-NNNNNN`. Se acepta en minúsculas y se normaliza a mayúsculas. Un formato inválido responde `400 VALIDACION`.
- `contacto` (query, obligatorio, de 1 a 254 caracteres):
  - Si contiene `@`, se compara con `usuarios.email` del solicitante, recortado y en minúsculas.
  - Si no, se normaliza con `normalizarTelefono` (SPEC 13) y se compara con `usuarios.telefono`. Un teléfono mal formado responde `400 VALIDACION`. No revela nada de la queja.
- Si el número no existe, o si el contacto no coincide con el solicitante, responde `404 CONSULTA_NO_ENCONTRADA` con el mensaje "No encontramos una queja con esos datos". Es la misma respuesta en los dos casos, para no revelar si un número existe.
- Responde `200` con `ConsultaPublicaDto`.
- La respuesta lleva `Cache-Control: no-store`.

```ts
export type ActorPublico = 'vecino' | 'municipalidad' | 'sistema';

export interface ConsultaPublicaDto {
  numero: string;
  titulo: string;
  estado: EstadoTicket;
  categoria: string;
  zona: string;                          // solo el nombre de la zona, sin dirección ni coordenadas
  creadoEn: string;                      // ISO 8601 en UTC
  resueltoEn: string | null;
  cerradoEn: string | null;
  cierreAutomatico: boolean;             // SPEC 33
  esperaRespuesta: boolean;              // estado === 'en_espera'
  solucion: { descripcion: string; resueltaEn: string } | null;   // SPEC 26, en resuelta o cerrada
  confirmacion: { venceEn: string; vencida: boolean } | null;     // SPEC 27, solo en resuelta
  lineaTiempo: Array<{
    ocurridoEn: string;
    actor: ActorPublico;
    estadoAnterior: EstadoTicket | null;
    estadoNuevo: EstadoTicket;
    motivo: string | null;               // solo si motivoEsPublico (SPEC 28)
  }>;
  comentarios: Array<{
    cuerpo: string;
    autor: Exclude<ActorPublico, 'sistema'>;
    creadoEn: string;
    editadoEn: string | null;
  }>;
}
```

Reglas del contenido:

- `lineaTiempo` contiene solo los eventos `estado` de la vista pública de SPEC 28, del más reciente al más antiguo, con un máximo de 200. Usa la regla `motivoEsPublico`. Sin asignaciones, traslados, adjuntos ni escalamiento.
- `comentarios` contiene solo los públicos (`interno = false`), en orden cronológico, con un máximo de los 100 más recientes. Nunca incluye notas internas.
- Actor de `lineaTiempo` y autor de `comentarios`:
  - `vecino` si el usuario es el solicitante.
  - `municipalidad` si es cualquier otro usuario.
  - `sistema` si `usuario_id` es `NULL`, solo en `lineaTiempo`.
- Nunca incluye: el nombre, el correo, el teléfono ni el DPI del solicitante, la dirección, `lat`/`lng`, `datos_extra`, la dependencia, la prioridad, el técnico, los ids internos, los vencimientos de SLA ni el escalamiento.

Lo implementa `ConsultaPublicaService` (`application/services/consulta-publica.service.ts`) con un `ConsultaPublicaRepository` de solo lectura. Reutiliza `motivoEsPublico` (SPEC 28), `normalizarTelefono` (SPEC 13) y las lecturas de comentarios públicos (SPEC 23).

### Límite por IP

- `presentation/middlewares/limite-por-ip.ts`: `limitePorIp(limite, mensaje)` generaliza `limiteLogin` de SPEC 08. `limiteLogin` pasa a usarlo, sin cambiar su comportamiento.
- La ventana es de 15 minutos y cuenta todas las peticiones de la IP, igual que el login. Al pasarse responde `429 DEMASIADAS_PETICIONES`.
- Variable nueva en `env.ts`: `CONSULTA_LIMITE_POR_VENTANA`, un entero positivo, por defecto 10.

### Logs sin el contacto

El contacto viaja en la query string, como define la sección 6. Para no dejarlo en los registros:

- Ningún log del backend escribe la query de `/api/v1/public/*`. Esto incluye el manejador de errores (SPEC 08) y cualquier registro de peticiones futuro (RNF-21).
- El frontend no lo pone en la URL del navegador: `/consulta` solo lleva `?numero=`, y el contacto se envía desde el estado del formulario.

### Frontend

| Elemento | Detalle |
| --- | --- |
| Ruta | `/consulta` (pública, SPEC 06). `ConsultaPage` deja el placeholder |
| Formulario | React Hook Form: "Número de queja" (precargado desde `?numero=`, con el formato `Q-AAAA-NNNNNN` como ayuda) y "Correo o teléfono con que la registraste", y el botón "Consultar". Validación en el cliente del formato del número y del contacto obligatorio |
| Errores | `404`: "No encontramos una queja con esos datos. Revisa el número y el correo o teléfono". `429`: "Hiciste demasiadas consultas. Espera unos minutos". `400`: el mensaje en el campo |
| Resultado | Se muestra debajo del formulario, solo en memoria. No se guarda nada en `localStorage`, `sessionStorage` ni cookies. Recargar la página vuelve al formulario |
| Encabezado | El número, el título, el estado (etiqueta traducida, con texto y no solo color), la categoría, la zona y las fechas en `America/Guatemala` |
| Solución | Si hay `solucion`, un bloque "Solución" en texto plano con sus saltos de línea. Si hay `confirmacion`: "Tienes hasta el <fecha> para confirmar la solución o reabrir la queja en el portal", o "El plazo para confirmar venció". Si `cierreAutomatico`: "Cerrada automáticamente porque venció el plazo de confirmación" |
| Historial | Cada cambio de estado con la fecha, el actor ("Vecino", "Municipalidad" o "VozMuni") y el motivo público, si tiene |
| Comentarios | Lista de solo lectura, con el autor ("Municipalidad" o "Vecino"), la fecha y "editado" si corresponde. Sin caja para comentar |
| Botón al portal | Si `esperaRespuesta`: "Inicia sesión para responder". Si hay `confirmacion` vigente: "Inicia sesión para confirmar o reabrir". En cualquier otro caso: "Ver en Mis quejas". Todos llevan a `/login` con `state.desde = '/tickets'` (SPEC 17) |
| Accesibilidad | El resultado se anuncia con `aria-live="polite"`. Los mensajes de error están asociados a sus campos |
| Textos | `locales/es/tickets.json`, bajo `consulta.*` |

El botón al portal lleva a `/tickets` ("Mis quejas") y no a `/tickets/:id`, porque la respuesta pública no expone el id interno.

### Archivos nuevos o modificados

```text
Sistema de Gestión de Quejas Municipales — Definición de la Solución.md   # sección 6: parámetros y respuesta del endpoint público
CLAUDE.md
backend/
  .env.example                                        # CONSULTA_LIMITE_POR_VENTANA
  src/
    app.ts
    container.ts
    infrastructure/config/env.ts
    domain/repositories/consulta-publica-repository.ts
    application/services/consulta-publica.service.ts
    infrastructure/repositories/knex-consulta-publica-repository.ts
    presentation/
      middlewares/limite-por-ip.ts                    # generaliza limite-login.ts
      middlewares/limite-login.ts
      middlewares/manejador-errores.ts                # no registra la query de /public
      validators/consulta-publica.validators.ts
      controllers/consulta-publica.controller.ts
      routes/consulta-publica.routes.ts
  tests/
    unit/consulta/consulta-publica.service.test.ts
    unit/presentation/limite-por-ip.test.ts
    unit/env.test.ts
    db/consulta-publica.api.test.ts                   # Supertest contra Postgres real
frontend/
  src/
    features/tickets/api/consulta-publica-api.ts
    features/tickets/pages/ConsultaPage.tsx
    features/tickets/consulta/FormularioConsulta.tsx
    features/tickets/consulta/ResultadoConsulta.tsx
    locales/es/tickets.json
  tests/
    features/tickets/consulta-page.test.tsx
```

## Plan de implementación

1. Crear `limite-por-ip.ts` y hacer que `limiteLogin` lo use. Agregar `CONSULTA_LIMITE_POR_VENTANA` a `env.ts` y `.env.example`. Crear `limite-por-ip.test.ts` y ampliar `env.test.ts`. Verificación: `npm test` pasa, y `tests/db/auth.api.test.ts` (SPEC 08) sigue pasando sin cambios.
2. Crear `ConsultaPublicaRepository`, su implementación Knex y `ConsultaPublicaService`, con `consulta-publica.service.test.ts` y falsos. Casos:
   - Un correo con mayúsculas y espacios coincide.
   - Un teléfono `5555-0000` coincide con `55550000`.
   - Un contacto que no es del solicitante y un número inexistente lanzan el mismo `CONSULTA_NO_ENCONTRADA`.
   - Los actores y los autores se traducen a `vecino`, `municipalidad` y `sistema`.
   - Un motivo no público llega como `null`.
   - `solucion` aparece solo en `resuelta` y `cerrada`, y `confirmacion` solo en `resuelta`.

   Verificación: `npm test` y `npm run lint:deps` pasan.
3. Crear el validador, el controlador y la ruta, conectarlos en `container.ts` y `app.ts`, y mapear `CONSULTA_NO_ENCONTRADA` a `404`. Asegurar que el manejador de errores no registre la query de `/api/v1/public/*`. Crear `tests/db/consulta-publica.api.test.ts`. Casos:
   - Con el correo correcto → `200` con el contenido completo y `Cache-Control: no-store`.
   - Con el teléfono de un vecino de ventanilla sin correo → `200`.
   - Con un contacto incorrecto y con un número inexistente → los dos `404` con el mismo cuerpo.
   - Un número en minúsculas funciona. Un formato inválido → `400`.
   - La respuesta no contiene el nombre, el correo, el teléfono, el DPI, la dirección, las coordenadas, el técnico, la dependencia, la prioridad, las notas internas ni los eventos de asignación o traslado.
   - El motivo de un rechazo y la información solicitada aparecen, y el motivo de un traslado no.
   - La consulta 11 desde la misma IP → `429`.
   - Un error provocado en la ruta no deja el contacto en el log capturado.

   Verificación: `npm run test:db`, `npm run typecheck` y `npm run lint:deps` pasan.
4. Frontend: crear `consulta-publica-api.ts`, `FormularioConsulta.tsx`, `ResultadoConsulta.tsx` y la nueva `ConsultaPage`. Crear `consulta-page.test.tsx`. Casos:
   - `?numero=` precarga el número.
   - El formulario exige el formato y el contacto.
   - El contacto nunca aparece en la URL del navegador.
   - Un `200` muestra el estado, la solución, el plazo, el historial con los actores traducidos y los comentarios.
   - El botón al portal cambia según `esperaRespuesta` y `confirmacion`.
   - El `404` y el `429` muestran sus mensajes.
   - Recargar no conserva el resultado.
   - Una solución con `<b>` se muestra como texto.

   Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan en `frontend/`.
5. Actualizar la sección 6 del documento de definición: `GET /api/v1/public/tickets/:numero` con `?contacto=`, la respuesta pública y el `404` único. Actualizar `CLAUDE.md`:
   - La verificación del contacto y la respuesta única.
   - El límite por IP.
   - Los campos que nunca se exponen.
   - Que la query de `/public` no se registra en los logs.

   Verificación manual con el backend y `seed:dev`: `vecino@vozmuni.test` registra una queja, y en una ventana privada se abre el enlace del correo `queja_registrada` (`/consulta?numero=…`). Con el correo del vecino se ve el estado "Nueva". Con otro correo aparece "No encontramos una queja con esos datos". A 360 px de ancho la página no produce scroll horizontal.

## Criterios de aceptación

- [ ] `GET /api/v1/public/tickets/:numero?contacto=` responde sin sesión, con `Cache-Control: no-store`.
- [ ] El contacto coincide con el correo del solicitante sin distinguir mayúsculas, o con su teléfono normalizado a 8 dígitos.
- [ ] Un número inexistente y un contacto incorrecto responden el mismo `404 CONSULTA_NO_ENCONTRADA`, con el mismo cuerpo.
- [ ] Más de `CONSULTA_LIMITE_POR_VENTANA` consultas (10 por defecto) desde una IP en 15 minutos responden `429 DEMASIADAS_PETICIONES`, y el límite del login sigue funcionando igual.
- [ ] La respuesta incluye el estado, el título, la categoría, la zona, las fechas, la solución (en `resuelta` y `cerrada`), el plazo de confirmación (en `resuelta`) y `cierreAutomatico`.
- [ ] La línea de tiempo pública solo trae cambios de estado, con el motivo únicamente en las transiciones dirigidas al vecino (SPEC 28).
- [ ] La respuesta solo trae comentarios públicos, con autor `vecino` o `municipalidad`, y nunca notas internas.
- [ ] La respuesta nunca incluye el nombre, el correo, el teléfono ni el DPI del solicitante, la dirección, las coordenadas, los datos adicionales, la dependencia, la prioridad, el técnico, los ids internos, los vencimientos ni el escalamiento.
- [ ] Ningún log del backend contiene la query de `/api/v1/public/*`, y el frontend nunca pone el contacto en la URL del navegador.
- [ ] `/consulta` precarga el número desde `?numero=`, muestra el resultado solo en memoria y ofrece el botón al portal según el estado de la queja.
- [ ] A 360 px de ancho, `/consulta` no produce scroll horizontal, y ningún texto de la interfaz está fijo en un componente.
- [ ] En `backend/`, `npm test`, `npm run test:db`, `npm run typecheck` y `npm run lint:deps` terminan con código 0. En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` terminan con código 0.
- [ ] La sección 6 del documento de definición, `CLAUDE.md` y `.env.example` documentan el endpoint, la verificación, el límite y la regla de los logs.

## Decisiones

- **Sí:** `GET /api/v1/public/tickets/:numero?contacto=`, literal a la sección 6 del documento, como eligió el usuario.
- **No:** un `POST` con el contacto en el cuerpo.
- **Sí:** para compensar que el contacto viaja en la URL, el backend no registra la query de `/public`, y el frontend no pone el contacto en la URL del navegador. Es una consecuencia de la elección anterior. Nginx queda para la spec de despliegue.
- **Sí:** la consulta muestra el estado y las fechas, la solución y el plazo, la línea de tiempo pública y los comentarios públicos, como eligió el usuario. Cierra lo que dejaron pendiente SPEC 26, 27 y 28.
- **Sí:** la línea de tiempo de la consulta solo tiene los cambios de estado. Los comentarios ya se muestran aparte, y los adjuntos no se eligieron. Es una propuesta de esta spec.
- **No:** los adjuntos públicos.
- **Sí:** una respuesta única para "no existe" y "el contacto no coincide", y un límite de 10 consultas por IP cada 15 minutos, como el login.
- **No:** un bloqueo por número, porque permitiría a un atacante bloquear la consulta de un vecino, ni un CAPTCHA.
- **Sí:** ningún dato personal en la respuesta (RNF-12). Solo la zona, sin la dirección.
- **No:** el nombre enmascarado.
- **Sí:** los autores aparecen como "Municipalidad" o "Vecino", coherente con la vista pública de SPEC 28.
- **Sí:** el resultado solo en memoria, sin tokens ni almacenamiento del navegador.
- **No:** un token de consulta de 30 minutos.
- **Sí:** un botón contextual al portal, que resuelve el riesgo de SPEC 35 (el vecino que recibe `informacion_solicitada` ahora sabe cómo responder). Lleva a `/tickets` y no a `/tickets/:id`, porque la respuesta pública no expone ids internos.
- **Sí:** `limitePorIp` generaliza el limitador del login, sin cambiar el comportamiento de SPEC 08.
- **Sí:** los topes (200 eventos y 100 comentarios), los textos y la disposición de la página los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| El contacto en la query string puede quedar en los logs de Nginx o de un proxy | El backend no lo registra, y el frontend no lo pone en la URL del navegador. La spec de despliegue debe excluir la query de `/api/v1/public/` en los logs de Nginx. Queda registrado como requisito para esa spec. |
| Un atacante con muchas IP puede probar contactos para un número conocido | El límite por IP frena la mayoría de los casos, y la respuesta no distingue el motivo del `404`. Un bloqueo por número queda descartado por el riesgo de denegación al vecino. |
| Quien conoce el número y el correo de otra persona ve los comentarios públicos de su queja | Es lo que define RF-35. Los comentarios públicos ya están pensados para el vecino, y no se muestra ningún dato personal. |
| Detrás de Nginx, todas las peticiones llegan desde la misma IP y el límite se vuelve global | Es el mismo riesgo que el login (SPEC 08). La spec de despliegue configura `trust proxy`. |
| Depende de varias specs en Borrador (23, 26, 27, 28 y 33) | Se implementa después de SPEC 33. Si cambian sus contratos, se revisa esta antes de aprobarla. |

## Lo que **no** está en esta spec

- Responder, confirmar o reabrir sin sesión.
- Adjuntos públicos.
- Token de consulta, CAPTCHA y bloqueo por número.
- OpenAPI del endpoint y configuración de Nginx.
- Consulta de varias quejas por contacto.

Cada uno de estos temas, cuando llegue, va en su propia spec.
