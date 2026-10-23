# SPEC 18 — Formulario de registro de queja

> **Estado:** Borrador
> **Depende de:** SPEC 12, SPEC 13, SPEC 14, SPEC 15, SPEC 16, SPEC 17
> **Fecha:** 2026-10-22
> **Objetivo:** Reemplazar el placeholder de `/tickets/nueva` por un formulario por pasos, usable desde 360 px, con el que el vecino registra su queja y el receptor o supervisor la registra a nombre de un vecino, con campos adicionales por categoría y mapa opcional, verificado con pruebas e2e de Playwright.

## Por qué existe esta spec

RF-06 es la acción principal del portal ciudadano, y RNF-14 pide que funcione en celular desde 360 px y que un vecino registre una queja sin ayuda.
El backend ya está especificado en varias specs: el registro en SPEC 12, el alta y la búsqueda de vecinos en SPEC 12 y 13, los campos adicionales en SPEC 14 y las coordenadas en SPEC 15. SPEC 17 pone la sesión real. Esta spec construye la pantalla que los usa.
Los adjuntos (hasta 5) no tienen backend todavía, así que este formulario registra la queja sin archivos. La spec de adjuntos agregará el selector en esta misma pantalla.

## Alcance

**Incluido:**

- Página `/tickets/nueva` en `features/tickets/registro/`, con pasos cortos, barra de progreso y resumen final.
- Flujo del vecino: 3 pasos y el resumen. El canal es siempre `portal`.
- Flujo de ventanilla para el receptor y el supervisor:
  - Un paso previo "Solicitante": buscar al vecino (`GET /vecinos`), elegirlo o darlo de alta (`POST /vecinos`), y elegir el canal.
  - Después, los mismos 3 pasos y el resumen.
- Campos adicionales dinámicos de la categoría elegida (SPEC 14), con un input por tipo y validación en el cliente.
- Mapa opcional con Leaflet y teselas de OpenStreetMap, centrado en la caja del municipio (SPEC 15):
  - Se marca el punto tocando el mapa, o con el botón "Usar mi ubicación".
  - Se carga de forma diferida.
  - Se oculta si la caja no está configurada.
- Pantalla de éxito con el número destacado, un botón para copiarlo y las acciones siguientes.
- Traducción de los errores del backend a mensajes en el paso y el campo correspondientes.
- Reglas de datos personales en `shared/validacion/` (DPI, teléfono y correo), compartidas con el registro de SPEC 16.
- Playwright con un viewport de 360×740 y el script `npm run test:e2e`.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Adjuntos: el selector de archivos y la subida.
- Borrador guardado entre recargas: recargar la página pierde lo escrito.
- La prueba con usuarios de RNF-14 (registro en menos de 3 minutos). Solo se verifica de forma automática el diseño a 360 px y el flujo.
- Auditoría formal de WCAG 2.1 AA (RNF-15) y medición de RNF-02 (LCP). Solo se aplican sus prácticas básicas.
- Aviso de posibles duplicados (RF-11).
- Geocodificación de la dirección.
- Ejecutar Playwright en CI (SPEC 07).
- Editar una queja después de registrarla.

## Modelo de datos

Esta spec no crea datos en el backend. Usa los contratos de SPEC 12 a 15.

### Estado del formulario (`features/tickets/registro/estado-registro.ts`)

```ts
export type Paso = 'solicitante' | 'categoria' | 'descripcion' | 'ubicacion' | 'resumen';

export interface EstadoRegistro {
  solicitante: { id: number; nombre: string; email: string | null; telefono: string | null } | null; // solo ventanilla, datos enmascarados
  canal: 'ventanilla' | 'telefono' | 'redes' | 'correo' | null;                                       // solo ventanilla
  categoriaId: number | null;
  datosExtra: Record<string, string | number | boolean>;
  titulo: string;
  descripcion: string;
  zonaId: number | null;
  direccion: string;
  ubicacion: { lat: number; lng: number } | null;
}

// Pasos según el rol de la sesión (SPEC 17):
// vecino:                 categoria → descripcion → ubicacion → resumen
// receptor, supervisor:   solicitante → categoria → descripcion → ubicacion → resumen
export function pasosPara(rol: Rol): Paso[];
```

El estado vive en memoria (React Hook Form), y no se guarda en `localStorage` ni en `sessionStorage`. Cambiar de categoría vacía `datosExtra`.

### Pasos

| Paso | Campos | Datos que carga | Validación antes de avanzar |
| --- | --- | --- | --- |
| Solicitante (ventanilla) | Buscar por correo, teléfono o DPI (un selector y un texto). Elegir de los resultados, o "Registrar vecino nuevo" (nombre, DPI, correo, teléfono). Canal | `GET /vecinos`, `POST /vecinos` | Hay un vecino elegido y un canal |
| Categoría | Lista de categorías, un radio por categoría con su nombre. Debajo, los `camposExtra` de la elegida, ordenados por `orden` | `GET /categorias` | Categoría elegida. Los campos extra cumplen las reglas de SPEC 14 |
| Descripción | Título (contador de 5 a 150) y descripción (multilínea, de 10 a 4000) | — | Los límites de SPEC 12, sobre el texto recortado |
| Ubicación | Zona (Autocomplete agrupado por tipo: zona, colonia, aldea), dirección (5 a 300) y mapa opcional | `GET /zonas`, `GET /parametros/limites-municipio` | Zona y dirección. El punto, si se marcó, dentro de la caja |
| Resumen | Todo lo anterior en solo lectura, con un "Editar" por sección que vuelve a su paso. Botón "Registrar queja" | — | — |

- "Atrás" nunca pierde datos.
- Al avanzar, el foco va al título del paso siguiente.
- La barra de progreso indica "Paso N de M" con `aria-valuenow`.

### Inputs de campos adicionales (`features/tickets/registro/campos-extra/`)

| Tipo (SPEC 14) | Componente MUI | Notas |
| --- | --- | --- |
| `texto` | `TextField` | `inputProps.maxLength = max`, más un contador |
| `numero` | `TextField` con `inputMode="decimal"`, o `"numeric"` si es `entero` | Se envía como número JSON |
| `fecha` | `TextField type="date"` | Respeta `min`, `max` y `noFutura`. Para `noFutura`, `hoy` se calcula en `America/Guatemala` |
| `seleccion` | `RadioGroup` hasta 5 opciones, `Select` si hay más | — |
| `si_no` | `RadioGroup` con Sí y No | Se envía como booleano |

- `etiqueta` y `ayuda` se muestran tal como vienen de la base. Son datos del administrador, no textos de la interfaz.
- Las reglas se replican en `features/tickets/registro/validar-datos-extra.ts`. El backend sigue siendo la fuente de verdad.

### Mapa (`features/tickets/registro/MapaUbicacion.tsx`)

- Usa `leaflet` y `react-leaflet`, y se carga con `React.lazy` solo al llegar al paso Ubicación. No entra en el bundle inicial (RNF-02).
- Las teselas son `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, con la atribución "© OpenStreetMap contributors" visible.
- El mapa se centra en el medio de la caja de `limites_municipio`, con `maxBounds` igual a la caja.
- Tocar el mapa pone el marcador, y otro toque lo mueve. El botón "Quitar ubicación" lo borra.
- "Usar mi ubicación" llama a `navigator.geolocation.getCurrentPosition`. Si el punto cae fuera de la caja, o el permiso se niega, muestra un mensaje y no marca nada.
- Si `GET /parametros/limites-municipio` devuelve `{ limites: null }`, el mapa y el botón no se muestran, y `lat` y `lng` no se envían.
- Si las teselas no cargan, el resto del paso sigue funcionando. Marcar el mapa es opcional.

### Envío

`POST /api/v1/tickets` (SPEC 12) con:

- **Vecino:** `{ categoriaId, zonaId, titulo, descripcion, direccion, datosExtra?, lat?, lng? }`.
- **Ventanilla:** lo mismo, más `solicitanteId` y `canal`.

`datosExtra` se omite si está vacío, y `lat` y `lng` se omiten si no se marcó un punto. El botón se deshabilita mientras el envío está en curso.

Errores del backend y dónde se muestran:

| `codigo` | Lleva al paso | Se muestra en |
| --- | --- | --- |
| `CATEGORIA_INVALIDA` | Categoría | Aviso "La categoría ya no está disponible", y se recargan las categorías |
| `DATOS_EXTRA_INVALIDOS` | Categoría | Cada `detalles[].campo` en su input |
| `TITULO_INVALIDO`, `DESCRIPCION_INVALIDA` | Descripción | En el campo |
| `ZONA_INVALIDA`, `DIRECCION_INVALIDA` | Ubicación | En el campo |
| `UBICACION_FUERA_DEL_MUNICIPIO`, `UBICACION_NO_CONFIGURADA`, `UBICACION_INCOMPLETA`, `UBICACION_INVALIDA` | Ubicación | Bajo el mapa |
| `SOLICITANTE_INVALIDO` | Solicitante | Aviso, y se limpia la selección |
| `EMAIL_DUPLICADO`, `DPI_DUPLICADO` (alta de vecino) | Solicitante | "Ya existe un vecino con ese correo o DPI; búscalo" |
| `RED_NO_DISPONIBLE`, `TIEMPO_AGOTADO`, otro código | Resumen | Aviso general, sin perder los datos |

### Pantalla de éxito

| Rol | Contenido |
| --- | --- |
| Vecino | "Registramos tu queja", el número en grande, un botón "Copiar número" (`navigator.clipboard`, con un aviso si no está disponible), "Te enviamos el número a tu correo", "Ver mis quejas" (`/tickets`) y "Registrar otra" (formulario vacío) |
| Receptor, supervisor | El número en grande para dictarlo al vecino, "Copiar número" y "Registrar otra" |

### Reglas de datos personales (`shared/validacion/datos-personales.ts`)

```ts
export function validarDpi(valor: string): 'DPI_INVALIDO' | null;          // 13 dígitos, se aceptan espacios
export function validarTelefono(valor: string): 'TELEFONO_INVALIDO' | null; // 8 dígitos, se aceptan espacios y guiones
export function validarEmail(valor: string): 'EMAIL_INVALIDO' | null;
```

**Cambio sobre SPEC 16:** `features/auth/validacion-registro.ts` importa estas tres funciones desde `shared/validacion/`, en lugar de definirlas. Así `features/tickets` las usa sin romper la regla `feature-no-otra-feature` de SPEC 06. Si SPEC 16 ya está implementada, el paso 2 de esta spec hace la mudanza.

### Comportamiento por rol en `/tickets/nueva`

La ruta ya admite a `vecino`, `receptor` y `supervisor` (SPEC 06), y los demás roles reciben `/403`. Esta spec no cambia la tabla de rutas.

### Playwright (`frontend/e2e/`)

- Dependencia de desarrollo `@playwright/test`. El navegador se instala con `npx playwright install chromium`, porque npm en este entorno bloquea los scripts de instalación.
- `playwright.config.ts`: proyecto `chromium-360` con viewport de 360×740, `baseURL` el servidor de Vite (`webServer: npm run dev`).
- Las pruebas simulan la API con `page.route('**/api/v1/**', …)`, sin backend ni base de datos.
- La sesión se inyecta poniendo un `refreshToken` en `localStorage` y respondiendo `/auth/refresh` con un usuario del rol deseado.
- Las teselas de OpenStreetMap también se simulan, con una imagen vacía, para que las pruebas no dependan de internet.
- Script: `"test:e2e": "playwright test"`. No forma parte de `npm test`.

### Archivos nuevos o modificados

```text
CLAUDE.md
frontend/
  package.json                                        # leaflet, react-leaflet, @types/leaflet, @playwright/test; script test:e2e
  playwright.config.ts
  .gitignore                                          # test-results/, playwright-report/
  src/
    shared/validacion/datos-personales.ts
    features/auth/validacion-registro.ts              # importa de shared/validacion (cambio de SPEC 16)
    features/tickets/pages/NuevoTicketPage.tsx        # monta el formulario
    features/tickets/api/registro-api.ts              # categorias, zonas, limites, vecinos, crear vecino, crear ticket
    features/tickets/registro/estado-registro.ts
    features/tickets/registro/FormularioQueja.tsx      # pasos, progreso y navegación
    features/tickets/registro/PasoSolicitante.tsx
    features/tickets/registro/PasoCategoria.tsx
    features/tickets/registro/PasoDescripcion.tsx
    features/tickets/registro/PasoUbicacion.tsx
    features/tickets/registro/PasoResumen.tsx
    features/tickets/registro/ExitoRegistro.tsx
    features/tickets/registro/MapaUbicacion.tsx        # carga diferida
    features/tickets/registro/campos-extra/CampoExtraInput.tsx
    features/tickets/registro/validar-datos-extra.ts
    features/tickets/registro/errores-registro.ts      # tabla código → paso y campo
    locales/es/tickets.json
  tests/
    shared/datos-personales.test.ts
    features/tickets/estado-registro.test.ts
    features/tickets/validar-datos-extra.test.ts
    features/tickets/errores-registro.test.ts
    features/tickets/formulario-queja.test.tsx         # flujo del vecino con fetch simulado
    features/tickets/paso-solicitante.test.tsx         # flujo de ventanilla
    features/tickets/campo-extra-input.test.tsx
  e2e/
    registro-vecino.spec.ts
    registro-ventanilla.spec.ts
```

## Plan de implementación

1. Crear `features/tickets/api/registro-api.ts` y `estado-registro.ts` con `pasosPara`, y `estado-registro.test.ts`. Casos: el vecino tiene 4 pasos sin "solicitante", y el receptor y el supervisor tienen 5. Verificación: `npm test` y `npm run lint:deps` pasan en `frontend/`.
2. Crear `shared/validacion/datos-personales.ts` con sus pruebas, y cambiar `features/auth/validacion-registro.ts` (SPEC 16) para que la importe. Verificación: `npm test`, incluidas las pruebas de SPEC 16, y `npm run lint:deps` pasan.
3. Crear `FormularioQueja.tsx` con la navegación de pasos y la barra de progreso, más `PasoDescripcion.tsx` y `PasoResumen.tsx`, y montarlo en `NuevoTicketPage`. Textos en `tickets.json`. Crear `formulario-queja.test.tsx`. Casos:
   - Avanzar con un título de 4 caracteres muestra el error y no avanza.
   - "Atrás" conserva lo escrito.
   - El resumen muestra los datos.
   - "Editar" vuelve al paso.
   - El foco va al título del paso nuevo.

   Verificación: `npm test` pasa.
4. Crear `PasoCategoria.tsx`, `CampoExtraInput.tsx` y `validar-datos-extra.ts`, con sus pruebas. Casos:
   - Cada uno de los 5 tipos genera su input y envía el tipo JSON correcto (número como `number`, sí/no como `boolean`).
   - Un campo requerido vacío bloquea el avance.
   - El `patron` se aplica.
   - Una fecha futura con `noFutura` se rechaza.
   - Cambiar de categoría vacía `datosExtra`.
   - Sin categorías, se muestra un aviso.

   Verificación: `npm test` pasa.
5. Crear `PasoUbicacion.tsx` y `MapaUbicacion.tsx` con carga diferida. Instalar `leaflet`, `react-leaflet` y `@types/leaflet`. Ampliar las pruebas, con el mapa simulado en jsdom. Casos:
   - Zona y dirección son obligatorias.
   - Con `limites: null` no se muestra el mapa ni se envían coordenadas.
   - "Usar mi ubicación" con un punto dentro marca el punto, y con uno fuera muestra un aviso.
   - "Quitar ubicación" lo borra.

   Verificación: `npm test` y `npm run build` pasan, y el chunk de Leaflet sale separado del bundle principal en la salida de Vite.
6. Crear `errores-registro.ts` con su prueba (cada código de la tabla lleva a su paso y su campo) y `ExitoRegistro.tsx`. Ampliar `formulario-queja.test.tsx` con el envío completo del vecino. Casos:
   - Llama a `POST /api/v1/tickets` sin `solicitanteId` ni `canal`.
   - Muestra el número y "Copiar número".
   - `DATOS_EXTRA_INVALIDOS` vuelve al paso Categoría con el error en el campo.
   - Un error de red conserva los datos.
   - El botón se deshabilita durante el envío.

   Verificación: `npm test` pasa.
7. Crear `PasoSolicitante.tsx` y `paso-solicitante.test.tsx`. Casos:
   - Buscar por teléfono muestra los resultados enmascarados, y elegir uno habilita el canal.
   - "Registrar vecino nuevo" valida el DPI, exige correo o teléfono y llama a `POST /vecinos`, y el vecino creado queda elegido. Si `invitacionEnviada` es `false`, se avisa.
   - `DPI_DUPLICADO` muestra "búscalo".
   - El envío final incluye `solicitanteId` y el `canal` elegido.
   - El vecino no ve este paso.

   Verificación: `npm test` pasa.
8. Instalar `@playwright/test`, crear `playwright.config.ts` y el script `test:e2e`, y escribir `e2e/registro-vecino.spec.ts` y `e2e/registro-ventanilla.spec.ts` con la API simulada. A 360×740 deben comprobar:
   - Los flujos completos hasta la pantalla de éxito.
   - `document.documentElement.scrollWidth <= clientWidth` en cada paso y en la pantalla de éxito.
   - Que los botones "Siguiente" y "Registrar queja" son visibles sin scroll horizontal.
   - Que un campo extra requerido bloquea el avance.

   Verificación: `npx playwright install chromium` y `npm run test:e2e` pasan.
9. Actualizar `CLAUDE.md`: el script `npm run test:e2e` y cómo instalar el navegador, que el formulario no guarda borrador, y que los adjuntos se agregarán en este mismo formulario. Verificación manual con el backend en `3000`, `seed:dev`, una categoría con campos extra y `limites_municipio` configurado:
   - `vecino@vozmuni.test` registra una queja desde un celular o con DevTools a 360 px, marca un punto en el mapa y ve el número.
   - `receptor@vozmuni.test` da de alta un vecino por teléfono y registra su queja con canal "teléfono".

## Criterios de aceptación

- [ ] `/tickets/nueva` muestra el formulario por pasos con su barra de progreso, en lugar del placeholder.
- [ ] El vecino completa 3 pasos y el resumen, y su envío no incluye `solicitanteId` ni `canal`.
- [ ] El receptor y el supervisor ven antes el paso "Solicitante", buscan por correo, teléfono o DPI, eligen un vecino o lo dan de alta, eligen un canal distinto de `portal`, y su envío incluye `solicitanteId` y `canal`.
- [ ] Ningún paso avanza con datos que el backend rechazaría por formato: los límites de título, descripción y dirección, los campos extra de SPEC 14, y el DPI, el teléfono y el correo del vecino nuevo.
- [ ] Al elegir una categoría aparecen sus campos adicionales, con un input por tipo. Los números se envían como `number` y los sí/no como `boolean`, y cambiar de categoría vacía los valores.
- [ ] "Atrás" y "Editar" no pierden datos, y el resumen muestra todo lo que se enviará.
- [ ] Con la caja del municipio configurada, el mapa aparece en el paso Ubicación. Se puede marcar, mover y quitar el punto, y "Usar mi ubicación" solo marca puntos dentro de la caja. Sin caja configurada, el mapa no aparece y no se envían coordenadas.
- [ ] Leaflet se carga en un chunk aparte, solo al llegar al paso Ubicación.
- [ ] Cada código de error del backend de la tabla lleva al paso y al campo indicados, sin perder lo escrito.
- [ ] Al registrar, se ve el número `Q-AAAA-NNNNNN` en grande con "Copiar número". El vecino ve además "Ver mis quejas" y "Registrar otra", y el receptor, "Registrar otra".
- [ ] El botón de envío se deshabilita mientras la petición está en curso.
- [ ] El formulario no guarda nada en `localStorage` ni en `sessionStorage`.
- [ ] Ningún texto de la interfaz está fijo en un componente: todos están en `locales/es/tickets.json`. Las etiquetas de los campos extra vienen de la base.
- [ ] Cada campo tiene una etiqueta asociada, los errores se anuncian con `role="alert"`, y al cambiar de paso el foco va al título del paso.
- [ ] `npm run test:e2e` recorre a 360×740 los flujos del vecino y de ventanilla hasta la pantalla de éxito, sin scroll horizontal en ningún paso.
- [ ] `features/tickets` no importa nada de `features/auth`, y las reglas de DPI, teléfono y correo viven en `shared/validacion/`.
- [ ] En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] `CLAUDE.md` documenta `test:e2e`, la instalación del navegador, y que los adjuntos se agregan en este formulario.

## Decisiones

- **Sí:** la misma pantalla sirve al vecino y a la ventanilla, como eligió el usuario. La ventanilla tiene un paso previo "Solicitante", que el vecino no ve, así que su formulario sigue igual de corto.
- **No:** una pantalla aparte para el solicitante, ni que solo el vecino use el formulario.
- **Sí:** sin adjuntos en esta spec. La spec de adjuntos agregará el selector aquí y completará RF-06.
- **No:** escribir antes la spec de adjuntos, ni mostrar un selector deshabilitado.
- **Sí:** los campos adicionales dinámicos de SPEC 14 entran. Sin ellos, una categoría con campos requeridos no se podría registrar desde el portal.
- **Sí:** mapa opcional con Leaflet y OpenStreetMap, con carga diferida y el botón "Usar mi ubicación". Se oculta sin la caja configurada.
- **No:** solo geolocalización, ni dejar el mapa fuera.
- **Sí:** pasos cortos, con progreso y resumen. Cada paso cabe en 360 px y los errores quedan a la vista (RNF-14).
- **No:** una sola página larga.
- **Sí:** sin borrador. Recargar pierde lo escrito, como eligió el usuario. Así no quedan datos de vecinos en dispositivos compartidos.
- **No:** un borrador en `sessionStorage` o en `localStorage`.
- **Sí:** pantalla de éxito con el número destacado, "Copiar número" y las acciones siguientes.
- **Sí:** la verificación de RNF-14 es automática, con Playwright a 360×740, como eligió el usuario. **La meta de "menos de 3 minutos en prueba con usuarios" queda sin verificar**, y RNF-14 se cumple solo en su parte de diseño.
- **No:** un protocolo de prueba con usuarios, ni una revisión manual con DevTools.
- **Sí:** Playwright con la API y las teselas simuladas, para que las pruebas e2e no necesiten backend ni internet. Queda fuera de `npm test` y de CI por ahora.
- **Sí:** las reglas de DPI, teléfono y correo se mudan a `shared/validacion/`, lo que cambia el archivo de SPEC 16. Es necesario por la regla `feature-no-otra-feature` de SPEC 06.
- **Sí:** los detalles de diseño los propone esta spec y el usuario puede ajustarlos al revisarla:
  - un radio por categoría;
  - la zona en un Autocomplete agrupado por tipo;
  - Radio o Select según cuántas opciones tenga una selección;
  - el contador de caracteres;
  - el orden de los pasos;
  - los textos.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| La meta de RNF-14 de "registro en menos de 3 minutos sin ayuda" no se mide | Es una decisión explícita. Se recomienda una prueba con 5 vecinos antes de publicar el portal, en una spec o tarea aparte. |
| Las teselas públicas de OpenStreetMap tienen una política de uso y no garantizan disponibilidad | El mapa es opcional y, si falla, el resto del paso funciona. Con mucho tráfico, una spec de despliegue debe pasar a un proveedor de teselas propio o contratado. |
| Las reglas del cliente (campos extra, límites, DPI) divergen del backend | El backend es la fuente de verdad, y cada error del servidor se muestra en su campo. Las pruebas de ambos lados usan los mismos casos. |
| Leaflet agrega peso a la app | Se carga de forma diferida, solo en el paso Ubicación. RNF-02 se mide en la pantalla inicial. |
| Sin borrador, un vecino que recarga por error pierde lo escrito | Es una decisión del usuario. Los pasos son cortos, y la pérdida es como mucho de unos minutos. |
| Esta spec depende de 6 specs en Borrador (12 a 17) | Se implementa al final de esa cadena. Si cambian sus contratos, se revisa esta antes de aprobarla. |
| Playwright necesita descargar un navegador, y npm aquí bloquea los scripts de instalación | El navegador se instala de forma explícita con `npx playwright install chromium`, documentado en `CLAUDE.md`. |

## Lo que **no** está en esta spec

- Adjuntos.
- Borrador entre recargas.
- Prueba con usuarios de RNF-14, auditoría WCAG y medición de LCP.
- Aviso de duplicados y geocodificación.
- Playwright en CI.
- Edición de la queja registrada.

Cada uno de estos temas, cuando llegue, va en su propia spec.
