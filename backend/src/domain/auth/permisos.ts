// Acciones de la matriz de la sección 2 (RF-05). Los permisos de cada rol viven en roles.permisos.
export const ACCIONES = [
  'tickets.crear',
  'tickets.ver',
  'tickets.clasificar',
  'tickets.asignar',
  'tickets.trasladar',
  'tickets.cambiar_estado',
  'comentarios.publico',
  'comentarios.interno',
  'reportes.ver',
  'admin.catalogos',
  'admin.usuarios',
  'bitacora.ver',
] as const;

export type Accion = (typeof ACCIONES)[number];

// Hasta dónde llega un permiso. Aplicarlo al recurso es tarea del servicio de cada caso de uso.
export const ALCANCES = [
  'propia',
  'a_nombre_de_vecino',
  'registradas',
  'asignadas',
  'dependencia',
  'todas',
  'solicitar',
  'si',
] as const;

export type Alcance = (typeof ALCANCES)[number];

// Si una acción no aparece, el rol no tiene ese permiso.
export type Permisos = Partial<Record<Accion, Alcance>>;
