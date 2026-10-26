import { ContextoSolicitudAls } from '../../src/infrastructure/auditoria/contexto-solicitud-als';
import { KnexTransaccion } from '../../src/infrastructure/repositories/knex-transaccion';
import type { Knex } from 'knex';
import { ParametrosService } from '../../src/application/services/parametros.service';
import { KnexParametroRepository } from '../../src/infrastructure/repositories/knex-parametro-repository';
import { createTestKnex, reiniciarEsquema } from './knex-test';

// Cajas de prueba: datos de la prueba, no configuración del sistema.
const CAJA = { latMin: 14.55, latMax: 14.7, lngMin: -90.6, lngMax: -90.45 };
const OTRA = { latMin: 14.5, latMax: 14.8, lngMin: -90.7, lngMax: -90.4 };

describe('KnexParametroRepository y ParametrosService (SPEC 15)', () => {
  let db: Knex;
  let repo: KnexParametroRepository;
  let servicio: ParametrosService;
  let actorId: number;

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
    repo = new KnexParametroRepository(db);
    servicio = new ParametrosService(repo, new KnexTransaccion(db, new ContextoSolicitudAls()));
    // El administrador que guarda: la bitácora registra su id (SPEC 41).
    const { id: rolId } = await db('roles').where({ nombre: 'administrador' }).first('id');
    const [admin] = await db('usuarios').insert({ nombre: 'Admin', email: 'admin@parametros.test', rol_id: rolId }).returning('id');
    actorId = Number(admin.id);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  });

  it('una clave inexistente devuelve null', async () => {
    expect(await repo.obtener('no_existe')).toBeNull();
    expect(await servicio.obtenerLimites()).toBeNull();
  });

  it('guarda limites_municipio y lo vuelve a leer', async () => {
    await expect(servicio.guardarLimites(actorId, CAJA)).resolves.toEqual(CAJA);

    expect(await servicio.obtenerLimites()).toEqual(CAJA);
  });

  it('un segundo guardado reemplaza el valor (upsert) y actualiza actualizado_en', async () => {
    const antes = await db('parametros').where({ clave: 'limites_municipio' }).first('actualizado_en');

    await servicio.guardarLimites(actorId, OTRA);

    const despues = await db('parametros').where({ clave: 'limites_municipio' }).first('valor', 'actualizado_en');
    expect(despues.valor).toEqual(OTRA);
    expect(despues.actualizado_en.getTime()).toBeGreaterThanOrEqual(antes.actualizado_en.getTime());
    expect(await db('parametros').where({ clave: 'limites_municipio' }).count({ total: '*' })).toEqual([{ total: '1' }]);
  });

  it('una caja inválida lanza LIMITES_INVALIDOS sin guardar', async () => {
    await expect(servicio.guardarLimites(actorId, { ...CAJA, latMin: 15 })).rejects.toMatchObject({
      name: 'ErrorDeAplicacion',
      codigo: 'LIMITES_INVALIDOS',
    });
    expect(await servicio.obtenerLimites()).toEqual(OTRA);
  });
});
