# Sistema de Gestión de Quejas Municipales — Definición de la Solución

Oct 8, 2026 · @Charlie

## 1. Definición de la solución

**VozMuni** es un sistema web para que los vecinos presenten quejas a la municipalidad y para que esta las registre, asigne, atienda y cierre con trazabilidad completa y tiempos de respuesta medibles. Cada queja es un ticket con número único, responsable, estado y fecha límite.

### Problema que resuelve

Hoy las quejas llegan por ventanilla, teléfono, redes sociales y notas en papel. Se pierden entre dependencias, nadie sabe cuánto tardan en resolverse y el vecino no tiene forma de consultar el avance. La municipalidad tampoco cuenta con datos para priorizar recursos por zona o tipo de problema.

### Objetivos

- Centralizar en un solo registro todas las quejas, sin importar el canal de ingreso.
- Asignar cada queja a la dependencia responsable con un tiempo máximo de atención (SLA).
- Permitir al vecino consultar el estado de su queja con su número de ticket.
- Generar indicadores de volumen, tiempos y satisfacción por dependencia, categoría y zona.

### Alcance

Incluye: registro de quejas (portal ciudadano y ventanilla), clasificación, asignación, seguimiento, comunicación con el vecino, escalamiento por vencimiento, cierre con encuesta de satisfacción, reportes y administración de catálogos y usuarios.

Fuera de alcance en la primera versión: app móvil nativa, integración con sistemas contables o de catastro, y pagos en línea.

### Núcleo genérico, configuración municipal

El núcleo es un gestor de tickets genérico; la municipalidad es su primera configuración. Ningún concepto municipal está fijo en el código: categorías, dependencias, SLA, campos adicionales y plantillas de notificación son datos administrables. Así el mismo producto puede servir a una mesa de ayuda de TI o a atención al cliente cambiando solo la configuración.

| Concepto genérico | Término en la municipalidad | Ejemplo |
| --- | --- | --- |
| Ticket | Queja | Q-2026-000123 |
| Solicitante | Vecino | Persona que reporta una fuga |
| Equipo | Dependencia municipal | Dirección de Agua Potable |
| Categoría | Tipo de queja | Alumbrado, basura, baches, agua |
| Agente | Técnico o funcionario de la dependencia | Inspector de obras |
| Ubicación | Zona, colonia o aldea | Zona 1, Barrio El Centro |
| SLA | Plazo de respuesta | 72 horas para baches |

## 2. Roles de usuario

El sistema maneja seis roles. Los permisos se asignan por rol y, para los roles internos, se limitan a la dependencia del usuario (un técnico de Alumbrado no ve quejas de Agua Potable).

| Rol | Quién es | Responsabilidad principal |
| --- | --- | --- |
| Vecino | Ciudadano registrado en el portal | Presentar quejas, dar seguimiento, responder solicitudes de información y calificar la atención |
| Receptor | Personal de ventanilla o call center | Registrar quejas recibidas en persona o por teléfono a nombre del vecino, y clasificarlas |
| Técnico | Funcionario de una dependencia | Atender las quejas asignadas, registrar avances y evidencias, proponer la resolución |
| Coordinador de dependencia | Jefe de una dirección municipal | Asignar quejas a técnicos, reasignar, aprobar resoluciones y rechazos de su dependencia |
| Supervisor general | Oficina de Atención al Vecino | Triage inicial, traslado entre dependencias, atención de escalamientos y reportes globales |
| Administrador | Personal de TI | Gestionar usuarios, roles, dependencias, categorías, SLA, plantillas y parámetros |

Cualquier visitante sin cuenta puede consultar el estado de una queja con su número de ticket y el correo o teléfono con que se registró; no ve comentarios internos.

### Matriz de permisos

| Acción | Vecino | Receptor | Técnico | Coordinador | Supervisor | Admin |
| --- | --- | --- | --- | --- | --- | --- |
| Crear queja | Propia | A nombre de vecino | No | No | Sí | No |
| Ver quejas | Propias | Las que registró | Asignadas a él | Su dependencia | Todas | Todas |
| Clasificar y priorizar | No | Sí | No | Sí | Sí | No |
| Asignar o reasignar técnico | No | No | No | Su dependencia | Sí | No |
| Trasladar a otra dependencia | No | No | Solicitar | Solicitar | Sí | No |
| Cambiar estado | Reabrir, cerrar | No | En proceso, en espera, resuelta | Todos los de su dependencia | Todos | No |
| Comentario público | Sí | Sí | Sí | Sí | Sí | No |
| Nota interna | No | Sí | Sí | Sí | Sí | No |
| Ver reportes | No | No | Propios | Su dependencia | Globales | Globales |
| Administrar catálogos y usuarios | No | No | No | No | No | Sí |
| Ver bitácora de auditoría | No | No | No | Su dependencia | Sí | Sí |

## 3. Ciclo de vida del ticket

Una queja pasa por ocho estados, de los cuales solo Cerrada y Rechazada son finales. Cualquier transición fuera de este diagrama la rechaza la capa de dominio.

&#91;embedded content: ciclo de vida de una queja · 8 estados, 2 finales\]

El flujo principal baja por el centro; a la derecha están el rechazo en el triage y la espera de información, y a la izquierda los dos retrocesos: traslado de dependencia (también posible desde En proceso) y reapertura.

| Estado | Significado | Quién lo activa | Pasa a |
| --- | --- | --- | --- |
| Nueva | Registrada, aún sin revisar | Sistema, al crear la queja | En revisión |
| En revisión | El supervisor valida, clasifica y prioriza | Supervisor | Asignada, Rechazada |
| Rechazada | No procede, duplicada o fuera de competencia; motivo obligatorio | Supervisor | Ninguno (final) |
| Asignada | Tiene dependencia; el coordinador asigna técnico | Supervisor o regla de asignación | En proceso, En revisión |
| En proceso | El técnico atiende la queja | Técnico | En espera, Resuelta, En revisión |
| En espera | Falta información del vecino o de un tercero | Técnico | En proceso |
| Resuelta | Solución registrada, pendiente de confirmación del vecino | Técnico | Cerrada, En proceso |
| Cerrada | Solución confirmada o plazo vencido | Vecino o sistema | Ninguno (final) |

### Reglas del ciclo

- **Escalada no es un estado**: es una marca que se activa al vencer el SLA en cualquier estado activo y notifica al supervisor.
- **Primera respuesta**: el plazo corre desde el registro hasta que la queja pasa a En proceso.
- **Resolución**: el plazo corre desde el registro hasta Resuelta, descontando el tiempo en En espera.
- **Confirmación**: el vecino tiene 5 días hábiles (parámetro) para confirmar o reabrir; sin respuesta, el sistema cierra la queja.
- **Reapertura**: solo desde Resuelta y dentro del plazo de confirmación, con motivo obligatorio; vuelve al mismo técnico y reinicia el plazo de resolución.
- **Traslado**: lo solicita el técnico o el coordinador; al aprobarlo el supervisor, la queja regresa a En revisión.
- **Historial**: cada transición guarda estado anterior, estado nuevo, usuario, fecha y motivo.

## 4. Requerimientos funcionales

Son 42 requerimientos en 9 módulos. Prioridad según MoSCoW: **M** = imprescindible para la primera versión, **S** = debería estar, **C** = deseable si hay tiempo.

### 4.1 Autenticación y usuarios

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-01 | El vecino puede registrarse con nombre, DPI, correo y teléfono, y verificar su correo. | M |
| RF-02 | Todo usuario inicia sesión con correo y contraseña; el sistema emite un token de acceso y uno de renovación. | M |
| RF-03 | El usuario puede recuperar su contraseña mediante un enlace enviado a su correo. | M |
| RF-04 | El administrador crea usuarios internos, les asigna rol y dependencia, y puede desactivarlos. | M |
| RF-05 | El sistema restringe cada pantalla y cada endpoint según el rol y la dependencia del usuario. | M |

### 4.2 Registro de quejas

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-06 | El vecino registra una queja con categoría, título, descripción, ubicación (zona y dirección) y hasta 5 archivos adjuntos. | M |
| RF-07 | El receptor registra una queja a nombre de un vecino existente o nuevo, indicando el canal (ventanilla, teléfono, redes, correo). | M |
| RF-08 | El sistema asigna un número único con formato Q-AAAA-NNNNNN y lo muestra y envía al vecino. | M |
| RF-09 | El formulario muestra campos adicionales según la categoría (por ejemplo, número de contador para quejas de agua). | S |
| RF-10 | El vecino puede marcar la ubicación en un mapa. | C |
| RF-11 | El sistema advierte posibles duplicados (misma categoría y zona en los últimos 7 días) antes de guardar. | S |

### 4.3 Clasificación y asignación

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-12 | El supervisor revisa las quejas nuevas, corrige categoría, define prioridad (baja, media, alta, urgente) y las acepta o rechaza con motivo. | M |
| RF-13 | Al aceptar, el sistema asigna la dependencia según la regla configurada para la categoría (`categorias.dependencia_id` de la categoría final). | M |
| RF-14 | El coordinador asigna la queja a un técnico de su dependencia y puede reasignarla. | M |
| RF-15 | El técnico o coordinador solicita traslado a otra dependencia con justificación; el supervisor lo aprueba. | M |
| RF-16 | El sistema puede asignar técnico automáticamente al de menor carga de la dependencia. | C |
| RF-17 | El supervisor puede vincular una queja duplicada con la original y rechazarla como duplicada. | S |

### 4.4 Atención y seguimiento

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-18 | El técnico cambia el estado de la queja según las transiciones permitidas del ciclo de vida. | M |
| RF-19 | Los usuarios internos agregan comentarios públicos (visibles al vecino) o notas internas. | M |
| RF-20 | El técnico adjunta evidencias (fotos, documentos) de la atención realizada. | M |
| RF-21 | El técnico solicita información al vecino; la queja pasa a En espera y el SLA se pausa. | M |
| RF-22 | El vecino responde la solicitud desde el portal o el correo; la queja vuelve a En proceso. | M |
| RF-23 | El técnico registra la resolución con descripción obligatoria; la queja pasa a Resuelta. | M |
| RF-24 | El vecino confirma la solución (cierra) o la rechaza (reabre) dentro del plazo configurado. | M |
| RF-25 | Cada queja muestra una línea de tiempo con todos sus cambios de estado, asignaciones y comentarios. | M |

### 4.5 SLA y escalamiento

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-26 | Cada combinación de categoría y prioridad tiene un plazo de primera respuesta y un plazo de resolución, en horas hábiles. | M |
| RF-27 | El sistema calcula los vencimientos usando el calendario laboral municipal (días hábiles y asuetos). | M |
| RF-28 | Al llegar al 80 % del plazo, el sistema alerta al técnico y al coordinador. | S |
| RF-29 | Al vencer el plazo, la queja se marca como escalada y se notifica al supervisor. | M |
| RF-30 | Las quejas resueltas sin respuesta del vecino se cierran automáticamente al vencer el plazo de confirmación. | M |

### 4.6 Notificaciones

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-31 | El sistema notifica al vecino por correo al registrar, asignar, solicitar información, resolver y cerrar su queja. | M |
| RF-32 | Los usuarios internos reciben notificaciones en la aplicación de asignaciones, comentarios y alertas de SLA. | M |
| RF-33 | El administrador edita las plantillas de cada notificación. | S |
| RF-34 | El sistema envía notificaciones por SMS o WhatsApp. | C |

### 4.7 Consulta ciudadana

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-35 | Cualquier persona consulta el estado de una queja con su número y el correo o teléfono registrado, sin iniciar sesión. | M |
| RF-36 | El vecino ve en su panel todas sus quejas, filtradas por estado. | M |
| RF-37 | Al cerrar, el vecino califica la atención de 1 a 5 y deja un comentario opcional. | S |

### 4.8 Reportes y tableros

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-38 | Tablero con quejas por estado, categoría, dependencia y zona, filtrable por rango de fechas. | M |
| RF-39 | Indicadores de tiempo promedio de respuesta y resolución, y porcentaje de cumplimiento de SLA. | M |
| RF-40 | Exportación de listados y reportes a Excel y PDF. | S |

### 4.9 Administración y auditoría

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-41 | El administrador gestiona catálogos: dependencias, categorías, reglas de asignación, prioridades, SLA, zonas, motivos de rechazo, calendario laboral y campos adicionales. | M |
| RF-42 | El sistema registra en una bitácora inmutable quién hizo qué acción, sobre qué registro y cuándo. | M |

## 5. Requerimientos no funcionales

Cada requerimiento tiene una métrica verificable; los valores son metas iniciales y se ajustan con la municipalidad según su volumen real.

| ID | Atributo | Requerimiento | Métrica de aceptación |
| --- | --- | --- | --- |
| RNF-01 | Rendimiento | Las consultas y operaciones comunes de la API responden rápido bajo carga normal. | p95 < 500 ms con 100 usuarios concurrentes |
| RNF-02 | Rendimiento | Las pantallas principales del frontend cargan rápido en conexiones móviles. | Carga inicial < 3 s en 4G; LCP < 2.5 s |
| RNF-03 | Escalabilidad | El backend no guarda estado de sesión en memoria, para poder ejecutar varias instancias detrás de un balanceador. | Escalar de 1 a 3 instancias sin cambios de código |
| RNF-04 | Escalabilidad | La base de datos soporta el volumen de varios años sin degradación. | 500 000 quejas con listados paginados p95 < 500 ms |
| RNF-05 | Disponibilidad | El sistema está disponible en horario municipal y el portal ciudadano todo el día. | 99.5 % mensual; mantenimientos fuera de horario hábil |
| RNF-06 | Respaldo | La base de datos y los adjuntos se respaldan automáticamente. | Respaldo diario, retención 30 días; RPO 24 h, RTO 4 h |
| RNF-07 | Seguridad | Toda la comunicación viaja cifrada. | HTTPS con TLS 1.2 o superior; HSTS activo |
| RNF-08 | Seguridad | Las contraseñas se almacenan con hash fuerte y se exige una política mínima. | bcrypt o argon2; mínimo 8 caracteres con letras y números |
| RNF-09 | Seguridad | La autenticación usa tokens de vida corta y protege contra fuerza bruta. | JWT de 15 min, refresh de 7 días; bloqueo tras 5 intentos fallidos |
| RNF-10 | Seguridad | La API está protegida contra las vulnerabilidades del OWASP Top 10. | Validación de entrada, consultas parametrizadas, rate limiting; cero hallazgos críticos en escaneo |
| RNF-11 | Seguridad | Los adjuntos se validan antes de guardarse. | Solo PDF, JPG, PNG, DOCX; máximo 10 MB por archivo |
| RNF-12 | Privacidad | Los datos personales del vecino (DPI, teléfono) solo los ven roles autorizados y se enmascaran en reportes. | Verificado por pruebas de autorización por rol |
| RNF-13 | Auditoría | La bitácora de acciones no puede modificarse ni borrarse desde la aplicación. | Tabla solo de inserción; retención mínima 5 años |
| RNF-14 | Usabilidad | El portal ciudadano funciona en celular y un vecino registra una queja sin ayuda. | Diseño responsive desde 360 px; registro en < 3 min en prueba con usuarios |
| RNF-15 | Accesibilidad | El portal cumple pautas de accesibilidad web. | WCAG 2.1 nivel AA |
| RNF-16 | Idioma | La interfaz está en español y preparada para agregar otros idiomas. | Textos externalizados en archivos de traducción |
| RNF-17 | Mantenibilidad | El backend respeta la arquitectura en capas y el dominio no depende del framework ni de la base de datos. | Reglas de dependencias verificadas en CI |
| RNF-18 | Mantenibilidad | El código tiene pruebas automatizadas. | Cobertura ≥ 70 % en servicios y dominio |
| RNF-19 | Mantenibilidad | La API está documentada y versionada. | OpenAPI 3 publicado; rutas con prefijo /api/v1 |
| RNF-20 | Portabilidad | Todos los componentes se ejecutan en contenedores. | Docker y docker-compose para levantar el entorno completo |
| RNF-21 | Observabilidad | El sistema registra logs estructurados y expone su estado de salud. | Logs JSON con id de correlación; endpoint /health |
| RNF-22 | Configurabilidad | Los conceptos de negocio se parametrizan sin desplegar código. | Categorías, SLA, dependencias y plantillas editables desde administración |
| RNF-23 | Zona horaria | Las fechas se guardan en UTC y se muestran en hora de Guatemala. | timestamptz en PostgreSQL; presentación en America/Guatemala |

## 6. Arquitectura

Una SPA en React consume una API REST en Node.js organizada en cuatro capas, que persiste en PostgreSQL. Las capas superiores solo dependen de las inferiores, y el dominio no conoce Express ni la base de datos: define interfaces de repositorio que la infraestructura implementa. Así el núcleo de tickets se prueba sin base de datos y se reutiliza fuera del contexto municipal.

&#91;embedded content: arquitectura de contenedores y capas del backend\]

Las tareas programadas (alertas al 80 % del SLA, escalamiento y cierre automático) corren dentro del backend y llaman a los mismos servicios de aplicación que la API, para que las reglas vivan en un solo lugar.

### Stack tecnológico

| Componente | Tecnología | Uso |
| --- | --- | --- |
| Lenguaje | TypeScript en backend y frontend | Tipos compartidos y menos errores en contratos |
| Backend | Node.js LTS + Express | API REST |
| Validación | Zod | Esquemas de entrada en la capa de presentación |
| Acceso a datos | Knex + node-postgres | Consultas, transacciones y migraciones versionadas |
| Base de datos | PostgreSQL | Persistencia; enum para estados, jsonb para campos variables |
| Seguridad | jsonwebtoken, bcrypt, helmet, express-rate-limit | Autenticación, hash de contraseñas, cabeceras y límite de peticiones |
| Archivos | Multer + disco local o almacenamiento S3 compatible | Adjuntos y evidencias |
| Correo y tareas | Nodemailer, node-cron | Notificaciones y control de SLA |
| Observabilidad | Pino | Logs estructurados con id de correlación |
| Pruebas | Jest + Supertest | Unitarias de dominio e integración de API |
| Documentación | OpenAPI 3 + Swagger UI | Contrato de la API |
| Frontend | React + Vite, React Router, TanStack Query, React Hook Form | SPA, rutas protegidas por rol, caché de datos, formularios |
| UI | MUI, Recharts, Leaflet | Componentes, gráficas del tablero, mapa de ubicación |
| Despliegue | Docker, docker-compose, Nginx | Contenedores y proxy inverso con HTTPS |

### Estructura del backend

```text
backend/src/
  presentation/
    routes/            # tickets.routes.ts, auth.routes.ts, admin.routes.ts
    controllers/       # traducen HTTP <-> DTO, sin lógica de negocio
    middlewares/       # auth, autorización por rol, manejo de errores
    validators/        # esquemas Zod
  application/
    services/          # TicketService, AssignmentService, SlaService, ReportService
    dto/
  domain/
    ticket/            # Ticket, TicketStatus, transiciones permitidas
    sla/               # cálculo de vencimientos con calendario laboral
    repositories/      # interfaces: TicketRepository, UserRepository...
    errors/            # InvalidTransitionError, ForbiddenError...
  infrastructure/
    database/          # knexfile, migrations/, seeds/
    repositories/      # implementaciones PostgreSQL de las interfaces
    mail/              # adaptador Nodemailer (solo lo usa el despacho de la bandeja de salida)
    storage/           # adaptador de archivos
    jobs/              # tareas node-cron de SLA y cierre automático (sla.job.ts, cada 5 minutos: alertas al umbral, escalamiento al vencer y cierre automático de las resueltas con el plazo de confirmación vencido; correos.job.ts, cada minuto: avisos agrupados de comentarios públicos y reintentos de la bandeja de salida correos\_salientes)
  container.ts         # composición: instancia repositorios y servicios
  app.ts
  server.ts
```

El frontend se organiza por funcionalidad: `features/auth`, `features/tickets`, `features/reportes` y `features/admin`, más `shared/` con el cliente HTTP, componentes y guardas de ruta por rol.

### Modelo de datos

| Tabla | Columnas principales |
| --- | --- |
| usuarios | id, nombre, email, telefono, dpi, password\_hash, rol\_id, dependencia\_id, activo, intentos\_fallidos, bloqueado\_hasta, correo\_verificado\_en (nulo hasta que el usuario usa un enlace enviado a su correo; sin verificar no inicia sesión) |
| sesiones | id, usuario\_id, token\_hash (SHA-256 del token de renovación, único), expira\_en, revocada\_en, reemplazada\_por, creado\_en |
| roles | id, nombre, permisos (jsonb) |
| dependencias | id, nombre, coordinador\_id, activa |
| categorias | id, nombre, dependencia\_id, campos\_extra (jsonb), activa |
| politicas\_sla | id, categoria\_id, prioridad, horas\_respuesta, horas\_resolucion (horas hábiles, respuesta ≤ resolución), actualizado\_en, actualizado\_por (nulo en lo que no cargó el administrador). Una fila por categoría y prioridad; el administrador reemplaza las 4 de una categoría juntas |
| zonas | id, nombre, tipo (zona, colonia, aldea) |
| tickets | id, numero (único), titulo, descripcion, solicitante\_id, categoria\_id, dependencia\_id, asignado\_a, estado, prioridad, canal, zona\_id, direccion, lat, lng, datos\_extra (jsonb), vence\_respuesta, vence\_resolucion, escalado, creado\_en, resuelto\_en, cerrado\_en, registrado\_por (usuario que la registró: el propio vecino o el receptor de ventanilla), resolucion (descripción de la resolución vigente, RF-23) y resuelto\_por (usuario que la resolvió); las dos vuelven a nulo al reabrir, y el historial conserva cada resolución anterior; confirmacion\_vence\_en (fin del plazo para confirmar o reabrir, calculado al resolver: las 23:59:59.999 en America/Guatemala del N-ésimo día hábil de calendario\_laboral posterior al día de la resolución) y reaperturas (cuántas veces se reabrió, nunca disminuye); seguimiento del SLA en horas hábiles: primera\_respuesta\_en (la primera vez que pasó a En proceso), sla\_inicio\_resolucion (el registro o la última reapertura), sla\_pausa\_minutos (minutos hábiles acumulados en En espera), sla\_pausado\_desde y sla\_restante\_minutos (solo en En espera, cuando vence\_resolucion es nulo); alerta\_respuesta\_en y alerta\_resolucion\_en (cuándo se llega al umbral del plazo, precalculado con el vencimiento; nulos cuando no corresponde alertar) y alerta\_respuesta\_enviada\_en y alerta\_resolucion\_enviada\_en (cuándo se envió cada alerta; se reinician al aceptar y al reabrir); escalado\_en y escalado\_por (`respuesta` o `resolucion`: cuándo y por qué plazo vencido se escaló; con valor solo si escalado es verdadero, y solo reabrir los limpia); aviso\_comentario\_en (cuándo se encoló el último aviso de comentarios públicos al vecino) y avisos\_comentario\_pendientes (comentarios públicos llegados dentro de esa ventana y todavía sin avisar, nunca negativo) |
| ticket\_historial | id, ticket\_id, estado\_anterior, estado\_nuevo, usuario\_id, motivo, creado\_en |
| ticket\_asignaciones | id, ticket\_id, tecnico\_anterior (nulo en la primera asignación), tecnico\_nuevo, asignado\_por, motivo, creado\_en. Solo de inserción; registra cada asignación y reasignación de técnico para la línea de tiempo |
| solicitudes\_traslado | id, ticket\_id, solicitado\_por, dependencia\_origen\_id, dependencia\_sugerida\_id (opcional), motivo, estado (pendiente, aprobada, rechazada, retirada, sin\_efecto), resuelto\_por, motivo\_resolucion, creado\_en, resuelto\_en. Como máximo una pendiente por queja |
| comentarios | id, ticket\_id, autor\_id, cuerpo (1 a 4000 caracteres), es\_interno, creado\_en, editado\_en (el autor puede editar durante 5 minutos; no se guardan versiones) |
| adjuntos | id, ticket\_id, comentario\_id, nombre, ruta, tipo\_mime, tamano\_bytes (hasta 10 MB), subido\_por, creado\_en, interno, origen (registro o atencion; los del registro siempre son públicos) |
| encuestas | id, ticket\_id, calificacion, comentario, creado\_en |
| notificaciones | id, usuario\_id, ticket\_id, tipo, leida, creado\_en, datos (jsonb con lo que necesita el texto; la frase la arma la interfaz con las traducciones). Tipos: `sla_alerta_respuesta` y `sla_alerta_resolucion`, con `{ vence, umbral }`, y `sla_escalamiento`, con `{ plazo, vence }` |
| calendario\_laboral | fecha, es\_habil, descripcion |
| bitacora | id, usuario\_id, accion, entidad, entidad\_id, detalle (jsonb), ip, creado\_en, dependencia\_id (para la bitácora por dependencia; nulo en acciones sin dependencia) |
| plantillas\_notificacion | id, clave (única), asunto, cuerpo\_texto, cuerpo\_html, actualizado\_en. Entre otras: `queja_resuelta` (al resolver: la solución, la fecha límite para confirmar y el enlace al detalle) y `queja_cerrada_automaticamente` (al cerrar por vencimiento del plazo de confirmación), `informacion_solicitada` (al poner en espera, con la información pedida), `tecnico_asignado` (primera asignación de técnico, con la dependencia y sin el nombre del técnico), `queja_trasladada` (al aprobar un traslado o en el traslado directo, sin el motivo), `comentario_publico` y `comentarios_publicos_agrupados` (comentarios públicos de la municipalidad, sin su texto) |
| correos\_salientes | id, plantilla\_clave, para, asunto, texto, html (el mensaje ya renderizado; texto y html solo mientras está pendiente y se borran al terminar), ticket\_id, usuario\_id, estado (pendiente, enviado, fallido, descartado), intentos (0 a 3), proximo\_intento\_en, expira\_en (vencimiento del enlace que lleva, si lleva uno), ultimo\_error, creado\_en, terminado\_en. Bandeja de salida: todo correo se escribe aquí en la transacción del caso de uso, se intenta enviar al confirmarla y se reintenta a los 5 y a los 30 minutos; tras el tercer fallo queda fallido, y un correo cuyo enlace venció se descarta sin enviarse |
| parametros | clave (PK), valor (jsonb), actualizado\_en: parámetros municipales que configura el administrador, como `limites_municipio`, `plazo_confirmacion_dias_habiles` (5, de 1 a 30) `max_reaperturas` (2, de 0 a 10) `jornada_laboral` (`{ inicio: '08:00', fin: '16:00' }`, la misma para todos los días hábiles de calendario\_laboral, en America/Guatemala) y `sla_umbral_alerta` (80, el porcentaje del plazo en que se avisa, de 1 a 99) y `aviso_comentarios_ventana_minutos` (30, de 1 a 1440: como máximo un correo de comentarios por queja en cada ventana) |
| correlativos | anio (PK), ultimo: último correlativo del año (en America/Guatemala) para el número Q-AAAA-NNNNNN |
| restablecimientos | id, usuario\_id, token\_hash (SHA-256 del token, único), tipo (recuperacion, invitacion, verificacion), expira\_en, usado\_en, invalidado\_en, creado\_en |

Índices clave: `tickets(estado, dependencia_id)`, `tickets(asignado_a, estado)`, `tickets(vence_resolucion)` para las tareas de SLA y `tickets(numero)` para la consulta pública.

Ubicación de la queja (RF-10):

- `tickets.lat` y `tickets.lng` van juntas o ninguna (CHECK `tickets_ubicacion_completa`).
- Solo se aceptan si caen dentro de la caja del municipio, guardada en `parametros` con la clave `limites_municipio` y la forma `{ latMin, latMax, lngMin, lngMax }`. Sin esa caja configurada no se aceptan coordenadas.

Campos adicionales por categoría (RF-09):

- `categorias.campos_extra` es una lista de hasta 20 definiciones `{ clave, etiqueta, ayuda?, requerido, orden, tipo, … }`. Los tipos son `texto` (`min`, `max`, `patron`), `numero` (`min`, `max`, `entero`), `fecha` (`min`, `max`, `noFutura`), `seleccion` (`opciones` con `valor` y `etiqueta`) y `si_no`. `'[]'` significa que la categoría no tiene campos.
- `tickets.datos_extra` guarda los valores por `clave`: texto recortado, número, fecha `AAAA-MM-DD`, el `valor` de la opción o un booleano. Solo se guardan los campos presentes.
- En una categoría que ya tiene quejas, el administrador solo puede hacer cambios que no invaliden los datos guardados: cambiar etiquetas, ayuda u orden, quitar `requerido`, ampliar límites, agregar opciones o agregar campos opcionales.

### Endpoints principales

| Método y ruta | Uso | Roles |
| --- | --- | --- |
| POST /api/v1/auth/registro, /login, /refresh, /logout | Registro del vecino, inicio, renovación y cierre de sesión | Público |
| POST /api/v1/auth/verificar | Verificar el correo con el enlace enviado al registrarse | Público |
| GET /api/v1/auth/sesion | Usuario de la sesión y permisos de su rol | Autenticado |
| POST /api/v1/auth/recuperar, /restablecer | Pedir el enlace de recuperación y definir la contraseña nueva | Público |
| GET /api/v1/vecinos | Buscar un vecino por correo, teléfono o DPI exactos, con el contacto enmascarado | Receptor, Supervisor |
| POST /api/v1/vecinos | Alta de un vecino nuevo en ventanilla (nombre, DPI y correo o teléfono), con invitación si da correo | Receptor, Supervisor |
| GET /api/v1/public/tickets/:numero | Consulta de estado con dato de contacto | Público |
| POST /api/v1/tickets | Registrar queja | Vecino, Receptor, Supervisor |
| GET /api/v1/tickets | Listado filtrado y paginado, limitado por rol. Primera versión (SPEC 25): paginado, sin filtros, con las quejas En espera primero; RF-36 agrega los filtros | Internos, Vecino |
| GET /api/v1/tickets/triage | Bandeja de quejas en `nueva` y `en_revision`, de la más antigua a la más reciente | Supervisor |
| GET /api/v1/tickets/:id | Detalle. Datos básicos, la información solicitada si está En espera, la solución (SPEC 26) y el plazo de confirmación (SPEC 27), sin datos del solicitante; se amplía agregando campos sin quitar ni renombrar los existentes | Según visibilidad |
| GET /api/v1/tickets/escaladas | Quejas escaladas en Asignada, En proceso, En espera o En revisión, de la escalada más antigua a la más reciente, filtrables por dependencia y paginadas, sin datos del solicitante | Supervisor (`tickets.triage`) |
| GET /api/v1/notificaciones | Las 20 notificaciones más recientes del propio usuario y el total de no leídas | Cualquier usuario autenticado |
| PATCH /api/v1/notificaciones/:id | Marcar como leída una notificación propia (`{ leida: true }`); una ajena responde 404 | Cualquier usuario autenticado |
| POST /api/v1/notificaciones/marcar-leidas | Marcar todas las propias como leídas | Cualquier usuario autenticado |
| GET /api/v1/tickets/:id/linea-tiempo | Línea de tiempo paginada por cursor (`cursor`, `tamano` de 1 a 100, 50 por defecto), de la más reciente a la más antigua: cambios de estado, asignaciones, solicitudes de traslado, comentarios y adjuntos (RF-25, SPEC 28). El vecino ve solo los estados, con el motivo cuando va dirigido a él, y sus comentarios y adjuntos públicos, con los internos como "Municipalidad"; las notas y los adjuntos internos solo para quien tiene `comentarios.interno`. No copia el texto de los comentarios | Según visibilidad |
| POST /api/v1/tickets/:id/transiciones | Cambiar estado con motivo. Campo `accion`: `tomar` (nueva → en_revision), `aceptar` (en_revision → asignada, con prioridad y categoría final) y `rechazar` (en_revision → rechazada, con motivo); `confirmar` (resuelta → cerrada, con motivo obligatorio si no es el vecino) y `reabrir` (resuelta → en_proceso, con motivo) dentro del plazo de confirmación y hasta `max_reaperturas` | Según matriz de permisos (triage: Supervisor; confirmar y reabrir: Vecino solicitante, Coordinador de la dependencia, Supervisor) |
| GET /api/v1/tickets/por-asignar | Bandeja de quejas sin técnico (o abiertas), por prioridad y antigüedad | Coordinador, Supervisor |
| PATCH /api/v1/tickets/:id/asignacion | Asignar o reasignar técnico. Cuerpo `{ tecnicoId, motivo? }`; el motivo es obligatorio al reasignar | Coordinador, Supervisor |
| GET /api/v1/dependencias/:id/tecnicos | Técnicos activos de la dependencia con su carga de quejas abiertas | Coordinador, Supervisor |
| POST /api/v1/tickets/:id/traslados | El técnico asignado o el coordinador solicitan el traslado (`{ motivo, dependenciaSugeridaId? }`); el supervisor traslada directamente | Técnico, Coordinador, Supervisor |
| GET /api/v1/traslados | Bandeja de solicitudes de traslado, por estado | Supervisor |
| POST /api/v1/traslados/:id/aprobacion | Aprobar: la queja vuelve a En revisión sin dependencia ni técnico | Supervisor |
| POST /api/v1/traslados/:id/rechazo | Rechazar con motivo | Supervisor |
| POST /api/v1/traslados/:id/retiro | Retirar la solicitud propia | Quien la solicitó |
| GET /api/v1/dependencias | Dependencias activas, para sugerir el destino de un traslado | Técnico, Coordinador, Supervisor |
| POST /api/v1/tickets/:id/comentarios | Comentario público o nota interna (`{ cuerpo, interno }`). Un comentario público del solicitante en una queja En espera la devuelve a En proceso (RF-22) | Según matriz de permisos |
| GET /api/v1/tickets/:id/comentarios | Hilo de comentarios; las notas internas solo para quien tiene `comentarios.interno` | Según visibilidad |
| PATCH /api/v1/tickets/:id/comentarios/:comentarioId | El autor corrige el texto durante 5 minutos | Autor del comentario |
| POST /api/v1/tickets/:id/adjuntos | Subir de 1 a 5 archivos (multipart: `archivos`, `interno`). Origen `registro` (solicitante o quien registró, mientras la queja está en Nueva) u `atencion` (internos con permiso de comentar); hasta 5 por origen | Vecino, internos |
| GET /api/v1/tickets/:id/adjuntos | Lista de adjuntos; los internos solo para quien tiene `comentarios.interno` | Según visibilidad |
| GET /api/v1/tickets/:id/adjuntos/:adjuntoId/contenido | Descargar el archivo | Según visibilidad |
| DELETE /api/v1/tickets/:id/adjuntos/:adjuntoId | El autor borra su adjunto durante 5 minutos | Autor del adjunto |
| POST /api/v1/tickets/:id/encuesta | Calificar la atención | Vecino |
| GET /api/v1/reportes/resumen | Indicadores del tablero | Coordinador, Supervisor, Admin |
| GET /api/v1/admin/usuarios | Listado paginado de usuarios internos con filtros por rol, dependencia, estado y búsqueda | Admin |
| GET /api/v1/admin/usuarios/:id | Detalle de un usuario interno | Admin |
| POST /api/v1/admin/usuarios | Alta de usuario interno con invitación por correo | Admin |
| PATCH /api/v1/admin/usuarios/:id | Editar nombre, teléfono, rol y dependencia | Admin |
| POST /api/v1/admin/usuarios/:id/desactivacion | Desactivar usuario y cerrar sus sesiones | Admin |
| POST /api/v1/admin/usuarios/:id/activacion | Reactivar usuario | Admin |
| POST /api/v1/admin/usuarios/:id/desbloqueo | Quitar el bloqueo por intentos fallidos | Admin |
| GET /api/v1/categorias | Categorías activas (con dependencia activa) y sus campos adicionales, para el formulario | Vecino, Receptor, Supervisor |
| GET /api/v1/zonas | Zonas para el formulario | Vecino, Receptor, Supervisor |
| GET /api/v1/parametros/limites-municipio | Caja geográfica del municipio para el mapa del formulario | Vecino, Receptor, Supervisor |
| PUT /api/v1/admin/parametros/limites-municipio | Configurar la caja geográfica del municipio | Admin |
| PUT /api/v1/admin/categorias/:id/campos-extra | Reemplazar los campos adicionales de una categoría | Admin |
| GET /api/v1/admin/politicas-sla | Todas las categorías con su matriz de SLA, si está completa y su última actualización | Admin |
| PUT /api/v1/admin/categorias/:id/politicas-sla | Reemplazar la matriz de SLA de una categoría: las 4 prioridades, horas enteras ≥ 1, respuesta ≤ resolución y urgente ≤ alta ≤ media ≤ baja. No recalcula las quejas abiertas | Admin |
| /api/v1/admin/\* | CRUD de catálogos | Admin |
