import type { Knex } from 'knex';

// Los 6 roles con la matriz de permisos de la sección 2 (SPEC 08). Reemplaza al seed 01_roles de SPEC 03.
// Los datos van literales: una migración aplicada no cambia de comportamiento si cambia domain/.
const ROLES: Record<string, Record<string, string>> = {
  vecino: {
    'tickets.crear': 'propia',
    'tickets.ver': 'propia',
    'tickets.cambiar_estado': 'propia',
    'comentarios.publico': 'si',
  },
  receptor: {
    'tickets.crear': 'a_nombre_de_vecino',
    'tickets.ver': 'registradas',
    'tickets.clasificar': 'todas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
  },
  tecnico: {
    'tickets.ver': 'asignadas',
    'tickets.trasladar': 'solicitar',
    'tickets.cambiar_estado': 'asignadas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'propia',
  },
  coordinador: {
    'tickets.ver': 'dependencia',
    'tickets.clasificar': 'todas',
    'tickets.asignar': 'dependencia',
    'tickets.trasladar': 'solicitar',
    'tickets.cambiar_estado': 'dependencia',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'dependencia',
    'bitacora.ver': 'dependencia',
  },
  supervisor: {
    'tickets.crear': 'todas',
    'tickets.ver': 'todas',
    'tickets.clasificar': 'todas',
    'tickets.asignar': 'todas',
    'tickets.trasladar': 'todas',
    'tickets.cambiar_estado': 'todas',
    'comentarios.publico': 'si',
    'comentarios.interno': 'si',
    'reportes.ver': 'todas',
    'bitacora.ver': 'todas',
  },
  administrador: {
    'tickets.ver': 'todas',
    'reportes.ver': 'todas',
    'admin.catalogos': 'si',
    'bitacora.ver': 'todas',
  },
};

export async function up(knex: Knex): Promise<void> {
  // DO UPDATE: en las bases donde ya corrió el seed 01_roles, los roles existen con permisos = '{}'.
  await knex('roles')
    .insert(Object.entries(ROLES).map(([nombre, permisos]) => ({ nombre, permisos: JSON.stringify(permisos) })))
    .onConflict('nombre')
    .merge(['permisos']);
}

export async function down(knex: Knex): Promise<void> {
  // Falla por ON DELETE RESTRICT si algún usuario tiene uno de estos roles: hay que borrarlo antes.
  await knex('roles').whereIn('nombre', Object.keys(ROLES)).delete();
}
