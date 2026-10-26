import type { Knex } from 'knex';
import type { AccionBitacora } from '../../src/domain/auditoria/acciones';
import { ContextoSolicitudAls } from '../../src/infrastructure/auditoria/contexto-solicitud-als';
import { KnexTransaccion } from '../../src/infrastructure/repositories/knex-transaccion';
import { createTestKnex, reiniciarEsquema } from './knex-test';

// El puerto Auditoria contra PostgreSQL (SPEC 41): IP del contexto, catálogo, transacción y saneamiento.
describe('Auditoria (SPEC 41)', () => {
  let db: Knex;
  let contexto: ContextoSolicitudAls;
  let transaccion: KnexTransaccion;

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();
    contexto = new ContextoSolicitudAls();
    transaccion = new KnexTransaccion(db, contexto);
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  });

  const ultimo = () => db('bitacora').orderBy('id', 'desc').first('accion', 'entidad', 'entidad_id', 'usuario_id', 'dependencia_id', 'ip', 'detalle');
  const registrar = (accion: AccionBitacora, extra: Record<string, unknown> = {}) =>
    transaccion.ejecutar(({ auditoria }) =>
      auditoria.registrar({ accion, entidadId: 7, usuarioId: null, dependenciaId: null, ...extra }),
    );

  it('dentro de una petición guarda la IP; fuera (un job) guarda NULL', async () => {
    await contexto.ejecutar('10.1.2.3', () => registrar('zona.crear'));
    expect(await ultimo()).toMatchObject({ accion: 'zona.crear', entidad: 'zona', entidad_id: '7', ip: '10.1.2.3' });

    await registrar('ticket.escalar');
    expect(await ultimo()).toMatchObject({ accion: 'ticket.escalar', entidad: 'ticket', ip: null, usuario_id: null });
  });

  it('una acción fuera del catálogo lanza un error y no guarda nada', async () => {
    const antes = await db('bitacora').count({ total: '*' });
    await expect(registrar('sesion.iniciar' as AccionBitacora)).rejects.toThrow('Acción de bitácora desconocida');
    expect(await db('bitacora').count({ total: '*' })).toEqual(antes);
  });

  it('si la transacción se revierte, no queda registro', async () => {
    const antes = await db('bitacora').count({ total: '*' });
    await expect(
      transaccion.ejecutar(async ({ auditoria }) => {
        await auditoria.registrar({ accion: 'zona.editar', entidadId: 1, usuarioId: null, dependenciaId: null });
        throw new Error('revertir');
      }),
    ).rejects.toThrow('revertir');
    expect(await db('bitacora').count({ total: '*' })).toEqual(antes);
  });

  it('el detalle llega saneado: sin secretos, con datos personales enmascarados y textos truncados', async () => {
    await registrar('usuario.editar', {
      cambios: {
        telefono: { antes: '55550000', despues: '44443333' },
        password_hash: { antes: 'a', despues: 'b' },
      },
      datos: { motivo: 'x'.repeat(250), token: 'secreto' },
    });

    const { detalle } = await ultimo();
    expect(detalle).toEqual({
      cambios: { telefono: { antes: '****0000', despues: '****3333' } },
      datos: { motivo: `${'x'.repeat(200)}…` },
    });
    expect(JSON.stringify(detalle)).not.toContain('secreto');
  });
});
