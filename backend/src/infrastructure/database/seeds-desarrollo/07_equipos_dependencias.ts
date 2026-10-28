import type { Knex } from 'knex';
import { BcryptPasswordHasher } from '../../auth/bcrypt-password-hasher';

// Datos ficticios de desarrollo: un coordinador y dos técnicos por cada dependencia que exista al correr el seed
// (también las creadas por el administrador), para atender quejas de cualquier dependencia, y dos vecinos más.
// Los correos salen del nombre: 'Dirección de Agua Potable' → coordinador.agua-potable@vozmuni.test.
const PASSWORD_DESARROLLO = 'Desarrollo2026';

const VECINOS = [
  { nombre: 'María López (vecina de desarrollo)', email: 'vecina2@vozmuni.test', telefono: '55550002' },
  { nombre: 'José Pérez (vecino de desarrollo)', email: 'vecino3@vozmuni.test', telefono: '55550003' },
];

function sufijo(nombreDependencia: string): string {
  return nombreDependencia
    .replace(/^Direcci[oó]n\s+(de\s+la\s+|del\s+|de\s+)?/i, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function seed(knex: Knex): Promise<void> {
  // Las FK se resuelven por nombre: los ids dependen del orden de inserción de cada base.
  const roles: { id: string; nombre: string }[] = await knex('roles').select('id', 'nombre');
  const rolPorNombre = new Map(roles.map((rol) => [rol.nombre, rol.id]));
  const rol = (nombre: string): string => {
    const id = rolPorNombre.get(nombre);
    if (id === undefined) {
      throw new Error(`No existe el rol '${nombre}'; ejecuta migrate:latest antes de seed:dev`);
    }
    return id;
  };
  const dependencias: { id: string; nombre: string }[] = await knex('dependencias')
    .where({ activa: true })
    .orderBy('id')
    .select('id', 'nombre');

  const passwordHash = await new BcryptPasswordHasher().hash(PASSWORD_DESARROLLO);
  const comunes = {
    password_hash: passwordHash,
    activo: true,
    // SPEC 16: sin correo verificado no se inicia sesión.
    correo_verificado_en: knex.fn.now(),
  };

  const internos = dependencias.flatMap(({ id, nombre }) => {
    const clave = sufijo(nombre);
    const equipo = nombre.replace(/^Direcci[oó]n\s+(de\s+la\s+|del\s+|de\s+)?/i, '');
    return [
      { rol: 'coordinador', nombre: `Coordinación de ${equipo}`, email: `coordinador.${clave}@vozmuni.test` },
      { rol: 'tecnico', nombre: `Técnico 1 de ${equipo}`, email: `tecnico1.${clave}@vozmuni.test` },
      { rol: 'tecnico', nombre: `Técnico 2 de ${equipo}`, email: `tecnico2.${clave}@vozmuni.test` },
    ].map((usuario) => ({
      nombre: usuario.nombre,
      email: usuario.email,
      telefono: null,
      rol_id: rol(usuario.rol),
      dependencia_id: id,
      ...comunes,
    }));
  });
  const vecinos = VECINOS.map((vecino) => ({ ...vecino, rol_id: rol('vecino'), dependencia_id: null, ...comunes }));

  const filas = [...internos, ...vecinos];
  if (filas.length === 0) {
    return;
  }
  // Idempotente sobre el índice único lower(email), que Knex no expresa con onConflict().
  const insercion = knex('usuarios').insert(filas).toSQL();
  await knex.raw(`${insercion.sql} ON CONFLICT ((lower(email))) DO NOTHING`, insercion.bindings);
}
