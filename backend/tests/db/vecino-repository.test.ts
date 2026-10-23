import type { Knex } from 'knex';
import { KnexVecinoRepository } from '../../src/infrastructure/repositories/knex-vecino-repository';
import { createTestKnex, reiniciarEsquema } from './knex-test';

describe('KnexVecinoRepository.crear (SPEC 13)', () => {
  let db: Knex;
  let repo: KnexVecinoRepository;

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
    repo = new KnexVecinoRepository(db);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  });

  beforeEach(async () => {
    await db('usuarios').delete();
  });

  const vecino = (cambios: Partial<{ nombre: string; dpi: string; email: string | null; telefono: string | null }> = {}) => ({
    nombre: 'María López',
    dpi: '2547123450101',
    email: 'maria@correo.gt',
    telefono: '55550000',
    ...cambios,
  });

  it('crea un vecino activo, sin contraseña ni dependencia', async () => {
    const { id } = await repo.crear(vecino());

    const fila = await db('usuarios as u').join('roles as r', 'r.id', 'u.rol_id').where('u.id', id).first();
    expect(fila).toMatchObject({
      nombre: 'vecino',
      activo: true,
      password_hash: null,
      dependencia_id: null,
      dpi: '2547123450101',
      telefono: '55550000',
    });
    expect(await repo.obtenerActivo(id)).toEqual({ id, nombre: 'María López', email: 'maria@correo.gt', telefono: '55550000' });
  });

  it('dos vecinos pueden compartir el teléfono', async () => {
    await repo.crear(vecino());
    await repo.crear(vecino({ dpi: '2547123450102', email: null }));

    expect(await repo.buscarActivos({ telefono: '55550000' }, 10)).toHaveLength(2);
  });

  it('el mismo correo en mayúsculas → EMAIL_DUPLICADO', async () => {
    await repo.crear(vecino());

    await expect(repo.crear(vecino({ dpi: '2547123450102', email: 'MARIA@Correo.GT' }))).rejects.toMatchObject({
      codigo: 'EMAIL_DUPLICADO',
    });
  });

  it('el mismo DPI → DPI_DUPLICADO, aunque el existente sea un usuario interno', async () => {
    const { id: rolId } = await db('roles').where({ nombre: 'receptor' }).first('id');
    await db('usuarios').insert({ nombre: 'Receptor', email: 'receptor@x.gt', dpi: '2547123450101', rol_id: rolId });

    await expect(repo.crear(vecino())).rejects.toMatchObject({ codigo: 'DPI_DUPLICADO' });
  });
});
