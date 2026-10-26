import type { Knex } from 'knex';
import { buildContainer, type Container } from '../../src/container';
import { TAMANO_LOTE_CORREOS } from '../../src/application/services/despacho-correos.service';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { KnexCorreoSalienteRepository } from '../../src/infrastructure/repositories/knex-correo-saliente-repository';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const MINUTO = 60_000;

class EnviadorControlado implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallar = false;
  demoraMs = 0;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.demoraMs > 0) {
      await new Promise((resolver) => setTimeout(resolver, this.demoraMs));
    }
    if (this.fallar) {
      throw new Error('ECONNREFUSED smtp.invalid');
    }
    this.enviados.push(mensaje);
  }
}

// La bandeja de salida contra PostgreSQL (SPEC 34): transacciones, reintentos, descarte y bloqueo de filas.
describe('Bandeja de salida correos_salientes', () => {
  let db: Knex;
  let container: Container;
  let enviador: EnviadorControlado;

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorControlado();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador, despachoSincronico: true });
    await reiniciarEsquema(db);
    await db.migrate.latest();
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  beforeEach(async () => {
    enviador.enviados.length = 0;
    enviador.fallar = false;
    enviador.demoraMs = 0;
    await db('correos_salientes').delete();
  });

  afterEach(() => jest.restoreAllMocks());

  const encolar = (destino: { para: string; expiraEn?: Date } = { para: 'ana@vozmuni.test' }, correos?: KnexCorreoSalienteRepository) =>
    container.notificadorCorreo.encolar(
      'recuperacion_password',
      { nombre: 'Ana', enlace: 'http://localhost:5173/restablecer?token=secreto' },
      destino,
      correos,
    );

  const fila = (id: number) =>
    db('correos_salientes')
      .where({ id })
      .first('estado', 'intentos', 'texto', 'html', 'proximo_intento_en', 'ultimo_error', 'terminado_en', 'plantilla_clave', 'para');

  it('encolar dentro de una transacción revertida no deja filas', async () => {
    await expect(
      db.transaction(async (trx) => {
        expect(await encolar(undefined, new KnexCorreoSalienteRepository(trx))).toEqual(expect.any(Number));
        throw new Error('revertir');
      }),
    ).rejects.toThrow('revertir');
    expect(await db('correos_salientes')).toEqual([]);
  });

  it('despachar con el enviador funcionando deja enviado, intentos = 1 y el cuerpo en NULL', async () => {
    const id = (await encolar())!;
    expect((await fila(id)).estado).toBe('pendiente');

    await container.notificadorCorreo.despachar([id]);

    expect(enviador.enviados).toHaveLength(1);
    expect(enviador.enviados[0].texto).toContain('token=secreto');
    expect(await fila(id)).toMatchObject({
      estado: 'enviado',
      intentos: 1,
      texto: null,
      html: null,
      terminado_en: expect.any(Date),
      // Los metadatos se conservan.
      plantilla_clave: 'recuperacion_password',
      para: 'ana@vozmuni.test',
    });
  });

  it('con el enviador fallando: +5 min, luego +30 min, y al tercer fallo fallido con el aviso enmascarado', async () => {
    const errores = jest.spyOn(console, 'error').mockImplementation(() => {});
    enviador.fallar = true;
    const id = (await encolar())!;
    const ahora = new Date();

    expect(await container.despachoCorreosService.despacharIds([id], ahora)).toBe(false);
    const primero = await fila(id);
    expect(primero).toMatchObject({ estado: 'pendiente', intentos: 1, ultimo_error: 'ECONNREFUSED smtp.invalid' });
    expect(primero.proximo_intento_en.getTime()).toBe(ahora.getTime() + 5 * MINUTO);

    const segundo = new Date(ahora.getTime() + 5 * MINUTO);
    expect(await container.despachoCorreosService.procesar(segundo)).toBe(1);
    const tras2 = await fila(id);
    expect(tras2).toMatchObject({ estado: 'pendiente', intentos: 2 });
    expect(tras2.proximo_intento_en.getTime()).toBe(segundo.getTime() + 30 * MINUTO);

    expect(await container.despachoCorreosService.procesar(new Date(segundo.getTime() + 30 * MINUTO))).toBe(1);
    expect(await fila(id)).toMatchObject({
      estado: 'fallido',
      intentos: 3,
      texto: null,
      html: null,
      ultimo_error: 'ECONNREFUSED smtp.invalid',
    });
    const avisos = errores.mock.calls.map(([mensaje]) => String(mensaje));
    expect(avisos.at(-1)).toContain('Quedó fallido tras 3 intentos (para a***@vozmuni.test');
    expect(avisos.join(' ')).not.toContain('secreto');
    expect(avisos.join(' ')).not.toContain('ana@vozmuni.test');
  });

  it('con expira_en vencido queda descartado sin llamar al enviador', async () => {
    const id = (await encolar({ para: 'ana@vozmuni.test', expiraEn: new Date(Date.now() - MINUTO) }))!;

    await container.notificadorCorreo.despachar([id]);

    expect(enviador.enviados).toEqual([]);
    expect(await fila(id)).toMatchObject({ estado: 'descartado', intentos: 0, texto: null, html: null });
  });

  it('una plantilla inexistente devuelve null y no interrumpe la transacción', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await db.transaction(async (trx) => {
      const correos = new KnexCorreoSalienteRepository(trx);
      expect(await container.notificadorCorreo.encolar('no_existe', {}, { para: 'ana@vozmuni.test' }, correos)).toBeNull();
      await encolar(undefined, correos);
    });
    expect(await db('correos_salientes').select('plantilla_clave')).toEqual([{ plantilla_clave: 'recuperacion_password' }]);
  });

  it('el envío inmediato y procesar simultáneos envían el correo una sola vez', async () => {
    const id = (await encolar())!;
    enviador.demoraMs = 200;

    await Promise.all([
      container.despachoCorreosService.despacharIds([id], new Date()),
      container.despachoCorreosService.procesar(new Date(Date.now() + MINUTO)),
    ]);

    expect(enviador.enviados).toHaveLength(1);
    expect(await fila(id)).toMatchObject({ estado: 'enviado', intentos: 1 });
  });

  it(`más de ${TAMANO_LOTE_CORREOS} pendientes se procesan en varios lotes`, async () => {
    const total = TAMANO_LOTE_CORREOS + 3;
    for (let i = 0; i < total; i++) {
      await encolar({ para: `vecino${i}@vozmuni.test` });
    }

    expect(await container.despachoCorreosService.procesar(new Date(Date.now() + MINUTO))).toBe(total);

    expect(enviador.enviados).toHaveLength(total);
    expect(await db('correos_salientes').where({ estado: 'enviado' }).count({ n: '*' })).toEqual([{ n: String(total) }]);
  });
});
