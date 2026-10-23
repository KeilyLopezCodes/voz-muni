import type { Knex } from 'knex';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher';

// Datos ficticios de desarrollo (SPEC 08): un usuario por rol. La guarda de knexfile-desarrollo.ts
// impide cargarlos en producción. dependencias.coordinador_id no se toca: SPEC 05 exige que quede null.
const PASSWORD_DESARROLLO = 'Desarrollo2026';
const DEPENDENCIA_DESARROLLO = 'Dirección de Obras';

const USUARIOS = [
  { rol: 'vecino', nombre: 'Vecino de desarrollo', telefono: '55550000', enDependencia: false },
  { rol: 'receptor', nombre: 'Receptor de desarrollo', telefono: null, enDependencia: false },
  { rol: 'tecnico', nombre: 'Técnico de desarrollo', telefono: null, enDependencia: true },
  { rol: 'coordinador', nombre: 'Coordinador de desarrollo', telefono: null, enDependencia: true },
  { rol: 'supervisor', nombre: 'Supervisor de desarrollo', telefono: null, enDependencia: false },
  { rol: 'administrador', nombre: 'Administrador de desarrollo', telefono: null, enDependencia: false },
];

export async function seed(knex: Knex): Promise<void> {
  // Las FK se resuelven por nombre: los ids dependen del orden de inserción de cada base.
  const roles: { id: string; nombre: string }[] = await knex('roles').select('id', 'nombre');
  const rolPorNombre = new Map(roles.map((rol) => [rol.nombre, rol.id]));
  const dependencia: { id: string } | undefined = await knex('dependencias')
    .where({ nombre: DEPENDENCIA_DESARROLLO })
    .first('id');
  if (!dependencia) {
    throw new Error(`No existe la dependencia '${DEPENDENCIA_DESARROLLO}' para los usuarios de desarrollo`);
  }

  const passwordHash = await new BcryptPasswordHasher().hash(PASSWORD_DESARROLLO);
  const filas = USUARIOS.map(({ rol, nombre, telefono, enDependencia }) => {
    const rolId = rolPorNombre.get(rol);
    if (rolId === undefined) {
      throw new Error(`No existe el rol '${rol}'; ejecuta migrate:latest antes de seed:dev`);
    }
    return {
      nombre,
      email: `${rol}@vozmuni.test`,
      telefono,
      password_hash: passwordHash,
      rol_id: rolId,
      dependencia_id: enDependencia ? dependencia.id : null,
      activo: true,
    };
  });

  // Idempotente sobre el índice único lower(email), que Knex no expresa con onConflict().
  const insercion = knex('usuarios').insert(filas).toSQL();
  await knex.raw(`${insercion.sql} ON CONFLICT ((lower(email))) DO NOTHING`, insercion.bindings);
}
