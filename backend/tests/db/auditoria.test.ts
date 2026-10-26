import type { Knex } from 'knex';
import type { AccionBitacora } from '../../src/domain/auditoria/acciones';
import { ContextoSolicitudAls } from '../../src/infrastructure/auditoria/contexto-solicitud-als';
import { KnexAuditoria } from '../../src/infrastructure/auditoria/knex-auditoria';
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
    await expect(registrar('sesion.renovar' as AccionBitacora)).rejects.toThrow('Acción de bitácora desconocida');
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

  describe('registrarIndependiente (SPEC 42)', () => {
    it('se confirma aunque la transacción del llamador se revierta, con la IP del contexto', async () => {
      await expect(
        contexto.ejecutar('10.9.9.9', () =>
          transaccion.ejecutar(async ({ auditoria }) => {
            await auditoria.registrarIndependiente({
              accion: 'sesion.fallar',
              entidadId: 3,
              usuarioId: null,
              dependenciaId: null,
              datos: { motivo: 'password_incorrecta', intentos: 2 },
            });
            throw new Error('revertir');
          }),
        ),
      ).rejects.toThrow('revertir');

      expect(await ultimo()).toMatchObject({
        accion: 'sesion.fallar',
        entidad: 'usuario',
        entidad_id: '3',
        ip: '10.9.9.9',
        detalle: { datos: { motivo: 'password_incorrecta', intentos: 2 } },
      });
    });

    it('con la base de la bitácora fallando no lanza y escribe en el log', async () => {
      const caida = createTestKnex();
      await caida.destroy();
      const errores: string[] = [];
      const auditoria = new KnexAuditoria(caida, contexto, caida, (mensaje) => errores.push(mensaje));

      await expect(
        auditoria.registrarIndependiente({ accion: 'sesion.bloquear', entidadId: 3, usuarioId: 3, dependenciaId: null }),
      ).resolves.toBeUndefined();
      expect(errores).toHaveLength(1);
      expect(errores[0]).toMatch(/^No se pudo registrar sesion\.bloquear en la bitácora \(usuario 3\)/);
    });
  });
});
