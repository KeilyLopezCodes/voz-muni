import path from 'node:path';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

// Seeds de desarrollo compilados, como los ejecuta `npm run seed:dev`.
const seedsDesarrolloDir = path.resolve(__dirname, '../../dist/infrastructure/database/seeds-desarrollo');

const ROLES = ['vecino', 'receptor', 'tecnico', 'coordinador', 'supervisor', 'administrador'];

describe('Usuarios de desarrollo (seeds-desarrollo/06_usuarios)', () => {
  let db: Knex;
  let container: Container;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba());
    await reiniciarEsquema(db);
    await db.migrate.latest();
    // Dos ejecuciones: la segunda no debe fallar ni duplicar usuarios.
    await db.seed.run({ directory: seedsDesarrolloDir });
    await db.seed.run({ directory: seedsDesarrolloDir });
  });

  // No deja usuarios: así las demás suites pueden revertir 0006_roles.
  afterAll(async () => {
    try {
      await db('sesiones').delete();
      await db('usuarios').delete();
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  it('hay 6 usuarios, uno por rol, con correo <rol>@vozmuni.test', async () => {
    const filas: { email: string; rol: string; activo: boolean }[] = await db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .select('u.email', 'r.nombre as rol', 'u.activo')
      .orderBy('r.id');

    expect(filas).toEqual(ROLES.map((rol) => ({ email: `${rol}@vozmuni.test`, rol, activo: true })));
  });

  it('tecnico y coordinador están en Dirección de Obras y los demás sin dependencia', async () => {
    const filas: { rol: string; dependencia: string | null }[] = await db('usuarios as u')
      .join('roles as r', 'r.id', 'u.rol_id')
      .leftJoin('dependencias as d', 'd.id', 'u.dependencia_id')
      .select('r.nombre as rol', 'd.nombre as dependencia')
      .orderBy('r.id');

    expect(Object.fromEntries(filas.map((fila) => [fila.rol, fila.dependencia]))).toEqual({
      vecino: null,
      receptor: null,
      tecnico: 'Dirección de Obras',
      coordinador: 'Dirección de Obras',
      supervisor: null,
      administrador: null,
    });
  });

  it('el vecino tiene teléfono y ninguna dependencia queda con coordinador', async () => {
    expect(await db('usuarios').where({ email: 'vecino@vozmuni.test' }).first('telefono')).toEqual({
      telefono: '55550000',
    });
    expect(await db('dependencias').whereNotNull('coordinador_id')).toEqual([]);
  });

  it('las contraseñas se guardan con bcrypt de costo 12, nunca en claro', async () => {
    const hashes: { password_hash: string }[] = await db('usuarios').select('password_hash');

    for (const { password_hash: hash } of hashes) {
      expect(hash).toMatch(/^\$2[aby]\$12\$/);
    }
  });

  it.each(ROLES)('%s inicia sesión con Desarrollo2026', async (rol) => {
    const res = await request(createApp(container))
      .post('/api/v1/auth/login')
      .send({ email: `${rol}@vozmuni.test`, password: 'Desarrollo2026' });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe(rol);
  });
});
