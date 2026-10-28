# VozMuni — Recorrido de una queja con todos los roles

Guía paso a paso para probar el ciclo completo de una queja, desde que se registra hasta que se cierra y se califica, pasando por los 6 roles.

## Antes de empezar

- La aplicación debe estar corriendo: base de datos (`docker compose up -d`), backend (`npm start` en `backend/`) y frontend (`npm run dev` en `frontend/`). Se abre en http://localhost:5173.
- Los usuarios de desarrollo usan la contraseña `Desarrollo2026`:

  | Rol | Correo |
  | --- | --- |
  | Vecino | `vecino@vozmuni.test` |
  | Receptor | `receptor@vozmuni.test` |
  | Técnico (Dirección de Obras) | `tecnico@vozmuni.test` |
  | Coordinador (Dirección de Obras) | `coordinador@vozmuni.test` |
  | Supervisor | `supervisor@vozmuni.test` |
  | Administrador | `administrador@vozmuni.test` |

- **Un usuario por navegador.** La sesión se comparte entre pestañas del mismo navegador: si inicias sesión con otro usuario en otra pestaña, reemplaza a la anterior. Para cambiar de rol usa el menú del avatar → **Cerrar sesión**, o abre cada rol en una ventana privada o un perfil distinto.
- Usa una categoría de **Dirección de Obras** (por ejemplo *Baches*): el técnico y el coordinador de desarrollo pertenecen a esa dependencia, así que solo así la verán.
- Los correos al vecino no llegan a buzones reales: el log del backend escribe un enlace de vista previa de Ethereal por cada uno.

```
Receptor     Supervisor     Coordinador     Técnico            Vecino               Técnico      Vecino
registra  →  acepta      →  asigna       →  inicia y pide   →  responde          →  resuelve  →  confirma y califica
(Nueva)      (Asignada)     técnico         información        (vuelve a           (Resuelta)    (Cerrada)
                                            (En espera)        En proceso)
```

---

## Paso 0 — Administrador: revisar la configuración

Inicia sesión como **administrador**.

1. Ve a **Administración → Políticas de SLA** y confirma que *Baches* no tenga la marca "Sin SLA". Sin su matriz de plazos, el supervisor no podrá aceptar la queja.
2. Opcional: en **Administración → Categorías** verifica que *Baches* esté activa y pertenezca a *Dirección de Obras*.

Con `seed:dev` todo esto ya viene configurado; el paso sirve para saber dónde se revisa.

## Paso 1 — Receptor: registrar la queja en ventanilla (estado **Nueva**)

Inicia sesión como **receptor**. Simula que el vecino llega a la municipalidad.

1. Abre **Nueva queja**.
2. **Solicitante:** busca por correo `vecino@vozmuni.test` y elígelo. Elige el canal, por ejemplo *Ventanilla*. **Siguiente**.
3. **Categoría:** *Baches*. **Siguiente**.
4. **Descripción:** escribe título, descripción, zona y dirección. Puedes adjuntar hasta 5 archivos (PDF, JPG, PNG o DOCX). **Siguiente**.
5. **Ubicación:** opcional; marca un punto en el mapa si quieres. **Siguiente**.
6. **Resumen:** revisa y pulsa **Registrar queja**.
7. Anota el número que aparece, con forma `Q-2026-NNNNNN`.

Qué pasa: la queja queda **Nueva** y el vecino recibe el correo `queja_registrada`.

> Variante: el vecino también puede registrarla él mismo desde **Nueva queja** con su propia sesión (sin el paso Solicitante).

## Paso 2 — Vecino: consultar el estado (opcional)

Sin iniciar sesión, abre `/consulta`, escribe el número y `vecino@vozmuni.test`. Verás la queja como *Nueva*. Con sesión de **vecino**, también aparece en **Quejas** ("Mis quejas").

## Paso 3 — Supervisor: triage (estado **En revisión → Asignada**)

Inicia sesión como **supervisor**.

1. Ve a **Triage**. La queja aparece entre las *Nuevas*; ábrela.
2. Pulsa **Tomar**: pasa a **En revisión**.
3. Elige la **Prioridad** (por ejemplo *Alta*), revisa la **Categoría final** (el panel dice "Se enviará a: Dirección de Obras") y pulsa **Aceptar**.

Qué pasa: la queja queda **Asignada** a Dirección de Obras, se calculan sus plazos de SLA en horas hábiles y el vecino recibe `queja_aceptada`.

> Si en cambio pulsas **Rechazar** con un motivo, la queja termina ahí (*Rechazada*) y el vecino recibe el motivo.

## Paso 4 — Coordinador: asignar el técnico (sigue **Asignada**)

Inicia sesión como **coordinador**.

1. Ve a **Asignación**. Con la vista *Sin técnico* aparece la queja; ábrela.
2. Elige a *Técnico de desarrollo* (cada técnico muestra cuántas quejas abiertas tiene) y pulsa **Asignar**.

Qué pasa: el técnico recibe la notificación en la campana y el vecino el correo `tecnico_asignado`. El estado no cambia.

> Si la queja no fuera de Obras, el coordinador o el técnico pueden **Solicitar traslado**, y el supervisor lo aprueba en **Traslados**: la queja vuelve a *En revisión* para aceptarla de nuevo en otra dependencia.

## Paso 5 — Técnico: iniciar y pedir información (estado **En proceso → En espera**)

Inicia sesión como **técnico**. La campana muestra la asignación.

1. Ve a **Atención** y abre la queja.
2. Pulsa **Iniciar**: pasa a **En proceso** y se registra la primera respuesta (se cumple el plazo de respuesta).
3. Opcional: escribe un comentario o una nota interna en el hilo, o sube evidencias en los adjuntos.
4. Pulsa **Poner en espera** y escribe qué información falta, por ejemplo "¿Puede enviar una foto del bache?".

Qué pasa: la queja queda **En espera**, el plazo de resolución se pausa y el vecino recibe `informacion_solicitada`.

## Paso 6 — Vecino: responder (estado vuelve a **En proceso**)

Inicia sesión como **vecino**.

1. En **Quejas** ("Mis quejas") la queja aparece con la marca *Necesita tu respuesta*; ábrela.
2. En el recuadro "La municipalidad necesita…" pulsa **Responder**, escribe la respuesta y envíala.

Qué pasa: el comentario público del vecino **reanuda la queja automáticamente** (vuelve a *En proceso*), el plazo sigue corriendo y el técnico recibe `respuesta_vecino` en la campana.

## Paso 7 — Técnico: resolver (estado **Resuelta**)

Inicia sesión otra vez como **técnico**.

1. En **Atención** abre la queja (ya está *En proceso*).
2. Pulsa **Resolver**, describe la solución y confirma con **Sí, resolver**.

Qué pasa: la queja queda **Resuelta**, se guarda la solución y se calcula el plazo para que el vecino confirme (5 días hábiles por defecto). El vecino recibe `queja_resuelta` con la fecha límite.

## Paso 8 — Vecino: confirmar y calificar (estado **Cerrada**)

Inicia sesión como **vecino** y abre la queja desde **Quejas**.

1. En el bloque **Solución** verás lo que hizo la municipalidad y "Tienes hasta el …".
2. Pulsa **Confirmar solución**: la queja queda **Cerrada** y el vecino recibe `queja_cerrada`.
3. Aparece **Califica la atención**: elige de 1 a 5 estrellas, escribe un comentario opcional y pulsa **Enviar calificación**.

> Si la solución no sirve, **Reabrir** con un motivo la devuelve a *En proceso* con el mismo técnico (hasta 2 veces por defecto). Si el vecino no hace nada, el sistema la cierra solo al vencer el plazo.
>
> Una calificación de 2 o menos avisa al coordinador con la notificación `encuesta_baja`.

## Paso 9 — Seguimiento y auditoría

- **Coordinador:** en **Quejas** ve todas las de su dependencia, también las cerradas; en **Reportes**, los conteos y el cumplimiento de SLA de Obras.
- **Supervisor:** en **Quejas** puede filtrar por número, dependencia, técnico o estado; en **Escaladas**, las quejas con un plazo vencido; en **Reportes**, los indicadores de toda la municipalidad.
- **Supervisor o administrador:** en **Bitácora**, escribe el número de la queja para ver todo lo que pasó, quién lo hizo, cuándo y desde qué IP.
- **Cualquier rol con acceso:** el detalle de la queja (`/tickets/:id`) tiene la sección **Historial** con la línea de tiempo completa.

---

## Resumen por estado

| Estado | Quién la mueve | Acción | Pantalla |
| --- | --- | --- | --- |
| Nueva | Receptor, vecino o supervisor | Registrar queja | Nueva queja |
| En revisión | Supervisor | Tomar | Triage |
| Asignada | Supervisor (+ coordinador asigna técnico) | Aceptar / Asignar | Triage / Asignación |
| En proceso | Técnico | Iniciar | Atención |
| En espera | Técnico | Poner en espera | Atención |
| En proceso | Vecino (al responder) o técnico | Responder / Reanudar | Detalle / Atención |
| Resuelta | Técnico | Resolver | Atención |
| Cerrada | Vecino (o el sistema al vencer el plazo) | Confirmar solución | Detalle |
