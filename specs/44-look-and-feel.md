# SPEC 44 — Nuevo look & feel: tema índigo y coral, modo oscuro y layouts renovados

> **Estado:** Implementada
> **Depende de:** SPEC 06, SPEC 16, SPEC 17
> **Fecha:** 2026-10-23
> **Objetivo:** Dar a la SPA un aspecto moderno y cálido con un tema MUI propio (índigo y coral, Nunito Sans autoalojada, modo claro y oscuro con selector), una pantalla dividida para las páginas públicas y un layout interno con menú con iconos y menú de usuario, sin reescribir las pantallas de negocio.

## Por qué existe esta spec

Desde SPEC 06 el frontend usa el tema por defecto de MUI: azul estándar, la fuente Roboto (que ni siquiera se carga), botones en mayúsculas y ninguna identidad.
Las pantallas públicas (`/login`, `/registro`, `/verificar`, `/recuperar`, `/restablecer`, `/consulta`) repiten cada una el mismo `Container` simple. El menú interno no tiene iconos y "Cerrar sesión" es un botón suelto en la barra (SPEC 17).
Esta spec cambia la "piel" de toda la aplicación desde un solo lugar, el tema y los dos marcos (público e interno), para que las pantallas de negocio de SPEC 18 a 23 hereden el cambio sin tocarlas.

## Alcance

**Incluido:**

- Tema MUI propio en `shared/theme/theme.ts`:
  - Esquemas de color claro y oscuro (`colorSchemes`) con variables CSS.
  - Paleta índigo (principal) y coral (secundario), con fondos cálidos.
  - Tipografía Nunito Sans y formas redondeadas.
  - Ajustes de componentes: botones sin mayúsculas, tarjetas, campos, alertas, menú y barra.
- Nunito Sans autoalojada con `@fontsource/nunito-sans`, dentro del build.
- Selector de tema **Claro / Oscuro / Sistema**:
  - El valor por defecto es "Sistema" (`prefers-color-scheme`).
  - La elección se guarda en `localStorage['vozmuni.tema']`.
  - Está en el menú de usuario y como botón en las pantallas públicas.
- Logotipo genérico de VozMuni en SVG hecho en código (`shared/marca/Logo.tsx`).
- Iconos de `@mui/icons-material`, importados uno por uno.
- `PantallaPublica` (`shared/layout/PantallaPublica.tsx`), una pantalla dividida:
  - En escritorio, un panel de marca índigo con el logo, el lema, 3 beneficios con iconos y formas abstractas en SVG, y a su lado el contenido.
  - En móvil, solo el contenido con el logo arriba.
  - La usan `/login`, `/registro`, `/verificar`, `/recuperar`, `/restablecer` y `/consulta`.
- `AppLayout` renovado:
  - Conserva la estructura de barra arriba, menú lateral fijo desde `md` y cajón en móvil.
  - El menú lleva el logo, un icono por ruta y el ítem activo resaltado.
  - En la barra, un avatar con las iniciales abre el `MenuUsuario`, con el nombre, el rol, el selector de tema y "Cerrar sesión".
- `Session` agrega `nombre`, tomado de `RespuestaSesion.usuario.nombre`, para mostrarlo en el menú de usuario.
- Las páginas 403 y 404 se rediseñan como un estado vacío simple, con un icono grande, el título, la descripción y el botón "Volver al inicio", sin panel de marca.
- Todos los textos nuevos van en `locales/es/comun.json`: lema, beneficios, tema, roles y menú de usuario.
- Actualización de las pruebas existentes que dependan del layout, y pruebas nuevas de los componentes nuevos.
- Actualización de `CLAUDE.md`.

**Fuera de alcance (para specs futuras):**

- Marca configurable por municipalidad (color principal, logo, nombre) desde administración, como un parámetro de `parametros`.
- Rediseño de las pantallas de negocio una por una: bandejas, paneles y formulario de queja. Solo heredan el tema.
- Ilustraciones o imágenes externas.
- Verificación automática de contraste (prueba de contraste, axe). En esta spec la verificación es una revisión visual manual.
- Mapa en modo oscuro: las teselas de OpenStreetMap se ven igual en los dos modos.
- Animaciones y transiciones más allá de las de MUI.
- Una barra de navegación inferior en móvil.
- Más idiomas además del español.

## Modelo de datos

Esta spec no crea datos en el backend. Introduce estos elementos en el cliente.

### Tema (`shared/theme/theme.ts`)

Se usa el soporte de esquemas de color de MUI (`colorSchemes` + `cssVariables`), que guarda la elección y evita el parpadeo al cargar.

```ts
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: 'class' },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: '#4F46E5' },          // índigo
        secondary: { main: '#F26B5B' },        // coral: acentos, no texto pequeño
        background: { default: '#FBF8F4', paper: '#FFFFFF' }, // crema cálido
      },
    },
    dark: {
      palette: {
        primary: { main: '#A5B4FC' },          // índigo claro sobre fondo oscuro
        secondary: { main: '#FF9B8F' },
        background: { default: '#14131F', paper: '#1E1D2B' },
      },
    },
  },
  typography: { fontFamily: '"Nunito Sans", system-ui, sans-serif', button: { textTransform: 'none', fontWeight: 700 } },
  shape: { borderRadius: 12 },
  components: { /* MuiButton, MuiCard, MuiTextField, MuiAlert, MuiAppBar, MuiListItemButton… */ },
})
```

- Los valores exactos de la paleta pueden ajustarse durante la implementación para que el texto normal tenga un contraste de al menos 4.5:1. Se verifica a ojo con las capturas del último paso.
- El coral nunca se usa como color de texto pequeño sobre fondo claro.

### Preferencia de tema

| Dato | Dónde | Valores |
| --- | --- | --- |
| Modo elegido | `localStorage['vozmuni.tema']` (vía `modeStorageKey` de MUI) | `light`, `dark`, `system` (por defecto) |

- No es un dato personal, así que puede vivir en `localStorage`, a diferencia del borrador del formulario de SPEC 18.
- Si `localStorage` está bloqueado, el modo cae a "Sistema" sin errores.
- `index.html` incluye el script de inicio de MUI (`InitColorSchemeScript`), o su equivalente, para aplicar el modo antes del primer pintado.

### `Session` (`shared/auth/session.ts`, SPEC 17)

```ts
export interface Session {
  usuarioId: number
  nombre: string        // nuevo: para el menú de usuario
  rol: Rol
  dependenciaId: number | null
}
```

`AuthProvider` lo toma de `RespuestaSesion.usuario.nombre`, que el backend ya devuelve (SPEC 08). No hay cambios en el backend.

### Componentes nuevos o modificados

| Componente | Ubicación | Contenido |
| --- | --- | --- |
| `Logo` | `shared/marca/Logo.tsx` | Globo de diálogo en SVG con el nombre "VozMuni". Variantes `completo` (icono y nombre) y `icono`. Con `aria-label` traducido |
| `SelectorTema` | `shared/theme/SelectorTema.tsx` | Usa `useColorScheme()` de MUI. Muestra "Claro / Oscuro / Sistema" como opciones de menú (en `MenuUsuario`) o como botón con menú (en `PantallaPublica`) |
| `PantallaPublica` | `shared/layout/PantallaPublica.tsx` | Props `titulo` y `children`. Dos columnas desde `md`: panel de marca (logo, lema, 3 beneficios, formas SVG) y columna de contenido con el `h1` "VozMuni", el `h2` del título y el contenido en una tarjeta. En móvil, solo la columna de contenido con el logo arriba. El `SelectorTema` va arriba a la derecha |
| `AppLayout` | `shared/layout/AppLayout.tsx` | Logo en el menú, `ICONO_POR_RUTA` (un icono por ruta de `RUTAS_PROTEGIDAS`), ítem activo resaltado y `MenuUsuario` en la barra |
| `MenuUsuario` | `shared/layout/MenuUsuario.tsx` | Avatar con las iniciales del nombre. Al abrirse muestra el nombre, el rol traducido, el `SelectorTema` y "Cerrar sesión" (`useCerrarSesion`) |
| `NoAutorizadoPage`, `NoEncontradoPage` | `shared/pages/` | Estado vacío: icono grande, título (`h1`), descripción y botón "Volver al inicio" |

- `PantallaPublica` conserva la estructura de encabezados que ya prueban `router.test.tsx` y las pruebas de cada página: un solo `h1` con "VozMuni" y un `h2` con el título de la página.
- Las 6 páginas públicas reemplazan su `Container` por `<PantallaPublica titulo={…}>` y no cambian su lógica.
- `ICONO_POR_RUTA` vive en `AppLayout`, no en `shared/auth/rutas.ts`, para que las guardas no dependan de los iconos. Una prueba exige que cada ruta con `enMenu` tenga su icono.

### Textos nuevos (`locales/es/comun.json`)

```json
{
  "marca": {
    "logo": "VozMuni",
    "lema": "Tu voz mejora tu municipio",
    "beneficios": {
      "registra": "Registra tu queja en minutos, desde tu celular.",
      "sigue": "Sigue su avance en cada etapa.",
      "respuesta": "Recibe respuesta de la dependencia responsable."
    }
  },
  "tema": { "etiqueta": "Tema", "claro": "Claro", "oscuro": "Oscuro", "sistema": "Sistema" },
  "menuUsuario": { "abrir": "Abrir menú de usuario" },
  "roles": {
    "vecino": "Vecino", "receptor": "Receptor", "tecnico": "Técnico",
    "coordinador": "Coordinador", "supervisor": "Supervisor", "administrador": "Administrador"
  }
}
```

Los textos son una propuesta de esta spec y se pueden ajustar al revisarla.

### Archivos nuevos o modificados

```text
CLAUDE.md
frontend/
  package.json                                     # @fontsource/nunito-sans, @mui/icons-material (misma versión mayor que @mui/material)
  index.html                                       # script de inicio del modo de color
  src/
    main.tsx                                       # importa la fuente
    app/App.tsx                                    # ThemeProvider con modeStorageKey y defaultMode="system"
    shared/theme/theme.ts
    shared/theme/SelectorTema.tsx
    shared/marca/Logo.tsx
    shared/layout/PantallaPublica.tsx
    shared/layout/AppLayout.tsx
    shared/layout/MenuUsuario.tsx
    shared/auth/session.ts                         # Session.nombre
    shared/pages/NoAutorizadoPage.tsx
    shared/pages/NoEncontradoPage.tsx
    features/auth/AuthProvider.tsx                 # guarda el nombre en la sesión
    features/auth/pages/LoginPage.tsx  RegistroPage.tsx  VerificarPage.tsx
    features/auth/pages/RecuperarPage.tsx  RestablecerPage.tsx
    features/tickets/pages/ConsultaPage.tsx
    locales/es/comun.json
  tests/
    shared/selector-tema.test.tsx
    shared/pantalla-publica.test.tsx
    shared/app-layout.test.tsx                     # iconos, ítem activo, menú de usuario
    shared/menu-usuario.test.tsx
    (las pruebas que construyen una Session agregan `nombre`)
```

## Plan de implementación

1. Instalar `@fontsource/nunito-sans` y `@mui/icons-material` y reescribir `theme.ts`:
   - Esquemas claro y oscuro, tipografía y forma.
   - Ajustes de componentes.

   Importar la fuente en `main.tsx` y configurar en `App.tsx` el `ThemeProvider` con `modeStorageKey="vozmuni.tema"` y `defaultMode="system"`, más el script de inicio en `index.html`. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan, y la app carga con la fuente y los colores nuevos.
2. Crear `SelectorTema.tsx` y `selector-tema.test.tsx`. Casos:
   - Muestra las 3 opciones traducidas.
   - Elegir "Oscuro" guarda `dark` en `localStorage['vozmuni.tema']`.
   - Sin nada guardado, la opción marcada es "Sistema".
   - Un `localStorage` que lanza no rompe el selector.

   Verificación: `npm test` pasa.
3. Crear `Logo.tsx` y `PantallaPublica.tsx`, con sus textos en `comun.json`, y `pantalla-publica.test.tsx`. Casos:
   - Hay un solo `h1` ("VozMuni") y un `h2` con el título.
   - Muestra el lema y los 3 beneficios.
   - Incluye el selector de tema.
   - Renderiza el contenido recibido.

   Verificación: `npm test` pasa.
4. Pasar las 6 páginas públicas (`/login`, `/registro`, `/verificar`, `/recuperar`, `/restablecer`, `/consulta`) a `PantallaPublica`, sin cambiar su lógica. Verificación: `npm test` pasa sin cambiar las aserciones de comportamiento de esas páginas, y `npm run build` pasa.
5. Agregar `nombre` a `Session` y llenarlo en `AuthProvider`. Ajustar las pruebas que construyen una `Session`. Verificación: `npm test`, `npm run build` y `npm run lint:deps` pasan.
6. Renovar `AppLayout` (logo, `ICONO_POR_RUTA`, ítem activo) y crear `MenuUsuario` con el nombre, el rol, el `SelectorTema` y "Cerrar sesión". Mover "Cerrar sesión" de la barra al menú de usuario y ajustar `app-layout.test.tsx`. Crear `menu-usuario.test.tsx`. Casos:
   - Cada ruta con `enMenu` tiene icono.
   - El ítem de la ruta actual queda marcado como activo (`aria-current="page"`).
   - El avatar muestra las iniciales.
   - El menú muestra el nombre y el rol traducido.
   - "Cerrar sesión" desde el menú sigue limpiando todo y llevando a `/login` (las pruebas de SPEC 17 se adaptan a abrir el menú primero).

   Verificación: `npm test` pasa.
7. Rediseñar `NoAutorizadoPage` y `NoEncontradoPage` como estado vacío. Verificación: `npm test` pasa con las pruebas del router sin cambios de comportamiento.
8. Actualizar `CLAUDE.md`: dónde vive el tema, la regla de usar colores del tema (nunca un color fijo en un componente), la clave `vozmuni.tema`, y que las pantallas públicas usan `PantallaPublica`. Verificación final:
   - En `frontend/`, `npm test`, `npm run build` y `npm run lint:deps` pasan.
   - `npm run test:e2e` pasa: las pruebas de SPEC 18 se ajustan solo si un selector cambió por el layout.
   - **Revisión visual manual:** con el backend en `3000` y `seed:dev`, capturas en claro y en oscuro, a 360 px y a 1280 px, de `/login`, `/registro`, `/tickets/nueva` (vecino), `/triage` (supervisor), el menú de usuario abierto y una página 404. El usuario las revisa y confirma que se leen bien y que no hay scroll horizontal.

## Criterios de aceptación

- [ ] La app usa Nunito Sans, servida desde el propio build, sin peticiones a Google Fonts ni a otro tercero.
- [ ] Los botones principales, la navegación y los enlaces usan el índigo del tema, y los acentos usan el coral. Ningún componente nuevo o modificado tiene un color fijo fuera de `theme.ts`.
- [ ] Los botones no están en mayúsculas y los componentes tienen esquinas redondeadas.
- [ ] El selector ofrece "Claro", "Oscuro" y "Sistema". Por defecto sigue la preferencia del sistema operativo, y la elección se guarda en `localStorage['vozmuni.tema']` y se conserva al recargar sin un parpadeo del modo anterior.
- [ ] El selector está en el menú de usuario y en las pantallas públicas.
- [ ] En escritorio, `/login`, `/registro`, `/verificar`, `/recuperar`, `/restablecer` y `/consulta` muestran el panel de marca (logo, lema y 3 beneficios con iconos) junto al contenido. En 360 px muestran solo el contenido con el logo arriba.
- [ ] Las páginas públicas mantienen un solo `h1` ("VozMuni") y un `h2` con su título, y su comportamiento no cambia: sus pruebas existentes pasan.
- [ ] El menú interno muestra el logo, un icono por ruta y el ítem activo resaltado con `aria-current="page"`.
- [ ] En la barra, el avatar con las iniciales abre un menú con el nombre del usuario, su rol, el selector de tema y "Cerrar sesión", que sigue funcionando como en SPEC 17.
- [ ] Las páginas 403 y 404 se muestran como un estado vacío con icono, título, descripción y "Volver al inicio".
- [ ] Todos los textos nuevos están en `locales/es/comun.json`, y ningún texto visible nuevo está fijo en un componente.
- [ ] Las pantallas de negocio (formulario de queja y bandejas de SPEC 18 a 23) se ven con el tema nuevo sin cambios en su código.
- [ ] En la revisión visual manual, el texto se lee bien en claro y en oscuro, y no hay scroll horizontal a 360 px en las pantallas revisadas.
- [ ] En `frontend/`, `npm test`, `npm run build`, `npm run lint:deps` y `npm run test:e2e` terminan con código 0.
- [ ] `CLAUDE.md` documenta el tema, la clave `vozmuni.tema`, la regla de no fijar colores en componentes y el uso de `PantallaPublica`.

## Decisiones

- **Sí:** tema y layout, como eligió el usuario. Las pantallas heredan el cambio desde el tema y los dos marcos.
- **No:** solo el tema, ni rediseñar cada pantalla en esta spec.
- **Sí:** estilo moderno y cálido con índigo de principal y coral de acento, como eligió el usuario. El índigo da contraste con el texto blanco; el coral solo se usa en acentos.
- **No:** el estilo institucional sobrio, naranja con azul marino, ni verde esmeralda.
- **Sí:** la marca queda fija en el tema, con un logotipo genérico de VozMuni. La spec queda solo en el frontend.
- **No:** marca configurable por municipalidad en esta spec. Se registra para una spec futura con `parametros`.
- **Sí:** modo claro y oscuro con selector Claro / Oscuro / Sistema, "Sistema" por defecto, en el menú de usuario y en las pantallas públicas.
- **No:** solo el modo claro, ni el modo oscuro automático sin selector.
- **Sí:** se usan los `colorSchemes` de MUI con `modeStorageKey="vozmuni.tema"`, en lugar de un estado propio, porque MUI ya guarda la elección, sigue la preferencia del sistema y evita el parpadeo. Lo propone esta spec.
- **Sí:** Nunito Sans autoalojada con `@fontsource`, sin depender de Google ni exponer a los vecinos a un tercero.
- **No:** Plus Jakarta Sans, ni la fuente del sistema.
- **Sí:** pantalla dividida para las públicas, con logo, lema y 3 beneficios sobre fondo índigo con formas SVG hechas en código, como eligió el usuario.
- **No:** tarjeta centrada, ilustración temática ni solo logo y lema.
- **Sí:** iconos de `@mui/icons-material` importados uno por uno, y un logotipo SVG propio.
- **No:** copiar a mano el path de cada icono.
- **Sí:** se mantiene la estructura del layout interno, con el menú renovado y un menú de usuario con nombre, rol, tema y "Cerrar sesión". Por eso `Session` agrega `nombre`, que SPEC 17 había dejado fuera de alcance.
- **No:** dejar la barra igual, ni una navegación inferior en móvil (el supervisor tiene 7 rutas).
- **Sí:** las páginas 403 y 404 son un estado vacío simple, sin panel de marca.
- **No:** usar `PantallaPublica` en las páginas de error.
- **Sí:** verificación por revisión visual manual, como eligió el usuario.
- **No:** la prueba automática de contraste ni axe en esta spec. Queda registrado como riesgo.
- **Sí:** los valores de la paleta, los textos del lema y los beneficios, el logotipo y los nombres de componentes los propone esta spec. El usuario puede ajustarlos al revisarla.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| **Sin verificación automática de contraste, un color del tema puede no llegar a WCAG 2.1 AA (RNF-15), sobre todo en modo oscuro o en las alertas** | La revisión visual del último paso cubre claro y oscuro. Los valores de la paleta pueden ajustarse ahí mismo. Una spec futura puede agregar la prueba de contraste y axe. |
| El coral sobre fondo claro no alcanza contraste para texto pequeño | La spec prohíbe usarlo como color de texto pequeño. Solo va en acentos, iconos o fondos con texto oscuro. |
| El modo oscuro deja partes sin adaptar: el mapa de Leaflet o colores fijos en pantallas de SPEC 18 a 23 | El mapa queda fuera de alcance. Durante la revisión visual se anota cualquier color fijo, que se corrige en esta spec solo si está en `shared/`; si está en una feature, va a una spec aparte. |
| Mover "Cerrar sesión" al menú de usuario rompe las pruebas y los e2e que hacían clic en el botón | El paso 6 adapta las pruebas para abrir el menú primero, y el paso 8 corre `test:e2e`. |
| `@mui/icons-material` aumenta mucho el tamaño del paquete | Los iconos se importan uno por uno (`@mui/icons-material/Home`), así el build incluye solo los usados. |
| La fuente autoalojada pesa en la primera carga en celular | Solo se incluyen los pesos usados (400, 600, 700 y 800) y el subconjunto latino. |
| Agregar `nombre` a `Session` obliga a cambiar todas las pruebas que construyen una sesión | Es un cambio mecánico en el paso 5, separado del cambio visual. |
| `localStorage` bloqueado | El modo cae a "Sistema" y el selector sigue funcionando durante la visita. |

## Lo que **no** está en esta spec

- Marca configurable por municipalidad.
- Rediseño individual de bandejas, paneles y formulario de queja.
- Ilustraciones externas.
- Prueba automática de contraste y axe.
- Mapa en modo oscuro.
- Navegación inferior en móvil.
- Otros idiomas.

Cada uno de estos temas, cuando llegue, va en su propia spec.
