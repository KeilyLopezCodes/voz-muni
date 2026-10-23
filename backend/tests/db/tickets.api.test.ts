import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo, MensajeCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { anioGuatemala } from '../../src/domain/ticket/numero-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';

class EnviadorEnMemoria implements EnviadorCorreo {
  readonly enviados: MensajeCorreo[] = [];
  fallar = false;

  async enviar(mensaje: MensajeCorreo): Promise<void> {
    if (this.fallar) {
      throw new Error('ECONNREFUSED smtp');
    }
    this.enviados.push(mensaje);
  }
}

async function esperarCorreos(enviador: EnviadorEnMemoria, cantidad: number): Promise<MensajeCorreo[]> {
  for (let intento = 0; intento < 100 && enviador.enviados.length < cantidad; intento++) {
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
  return enviador.enviados;
}

describe('API de registro de quejas /api/v1/tickets y /api/v1/vecinos', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  let enviador: EnviadorEnMemoria;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    db = createTestKnex();
    enviador = new EnviadorEnMemoria();
    container = buildContainer(envDePrueba(), { enviadorCorreo: enviador });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [activa, inactiva] = (
      await db('dependencias')
        .insert([
          { nombre: 'Obras', activa: true },
          { nombre: 'Cerrada', activa: false },
        ])
        .returning('id')
    ).map((f) => Number(f.id));
    const categorias = await db('categorias')
      .insert([
        { nombre: 'Baches', dependencia_id: activa, activa: true },
        { nombre: 'Vieja', dependencia_id: activa, activa: false },
        { nombre: 'De dependencia cerrada', dependencia_id: inactiva, activa: true },
      ])
      .returning('id');
    [ids.categoria, ids.categoriaInactiva, ids.categoriaDependenciaInactiva] = categorias.map((f) => Number(f.id));
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, Record<string, unknown>][] = [
      ['vecino', 'vecino', { email: 'vecino@quejas.test', telefono: '55550000', dpi: '2547123450101' }],
      ['vecinoSinCorreo', 'vecino', { email: null, telefono: '55551111' }],
      ['vecinoInactivo', 'vecino', { email: 'inactivo@quejas.test', activo: false }],
      ['receptor', 'receptor', { email: 'receptor@quejas.test' }],
      ['supervisor', 'supervisor', { email: 'supervisor@quejas.test' }],
      ['tecnico', 'tecnico', { email: 'tecnico@quejas.test', dependencia_id: activa }],
      ['coordinador', 'coordinador', { email: 'coordinador@quejas.test', dependencia_id: activa }],
      ['administrador', 'administrador', { email: 'administrador@quejas.test' }],
    ];
    for (const [nombre, rol, extra] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${nombre}`, rol_id: rolId, password_hash: hash, ...extra })
        .returning('id');
      ids[nombre] = Number(fila.id);
      if (extra.email && extra.activo !== false) {
        const res = await request(app).post('/api/v1/auth/login').send({ email: extra.email, password: PASSWORD });
        tokens[nombre] = res.body.accessToken;
      }
    }
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
  });

  const cuerpo = () => ({
    categoriaId: ids.categoria,
    zonaId: ids.zona,
    titulo: '  Bache en la 5a avenida  ',
    descripcion: 'Hay un bache profundo frente a la escuela',
    direccion: '5a avenida 3-20, zona 1',
  });

  const registrar = (quien: string | null, datos: object) => {
    const peticion = request(app).post('/api/v1/tickets');
    return (quien ? peticion.set('Authorization', `Bearer ${tokens[quien]}`) : peticion).send(datos);
  };

  describe('POST /tickets', () => {
    it('el vecino registra: 201 con Location, número, historial y correo', async () => {
      const res = await registrar('vecino', cuerpo());

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(Number),
        numero: expect.stringMatching(/^Q-\d{4}-\d{6}$/),
        estado: 'nueva',
        creadoEn: expect.any(String),
      });
      expect(res.body.numero.startsWith(`Q-${anioGuatemala(new Date())}-`)).toBe(true);
      expect(res.headers.location).toBe(`/api/v1/tickets/${res.body.id}`);

      const ticket = await db('tickets').where({ id: res.body.id }).first();
      expect(ticket).toMatchObject({
        solicitante_id: String(ids.vecino),
        registrado_por: String(ids.vecino),
        canal: 'portal',
        titulo: 'Bache en la 5a avenida',
        datos_extra: {},
        escalado: false,
        dependencia_id: null,
        asignado_a: null,
        prioridad: null,
        lat: null,
        lng: null,
        vence_respuesta: null,
        vence_resolucion: null,
      });
      expect(await db('ticket_historial').where({ ticket_id: res.body.id })).toEqual([
        expect.objectContaining({ estado_anterior: null, estado_nuevo: 'nueva', usuario_id: String(ids.vecino) }),
      ]);

      const [correo] = await esperarCorreos(enviador, 1);
      expect(correo.para).toBe('vecino@quejas.test');
      expect(correo.asunto).toBe(`VozMuni: recibimos tu queja ${res.body.numero}`);
      expect(correo.texto).toContain(`http://localhost:5173/consulta?numero=${res.body.numero}`);
    });

    it('los números siguen el correlativo del año', async () => {
      const primero = (await registrar('vecino', cuerpo())).body.numero as string;
      const segundo = (await registrar('vecino', cuerpo())).body.numero as string;

      expect(Number(segundo.slice(-6))).toBe(Number(primero.slice(-6)) + 1);
    });

    it.each(['receptor', 'supervisor'])('el %s registra a nombre de un vecino con canal telefono', async (quien) => {
      const res = await registrar(quien, { ...cuerpo(), solicitanteId: ids.vecino, canal: 'telefono' });

      expect(res.status).toBe(201);
      expect(await db('tickets').where({ id: res.body.id }).first('solicitante_id', 'registrado_por', 'canal')).toEqual({
        solicitante_id: String(ids.vecino),
        registrado_por: String(ids[quien]),
        canal: 'telefono',
      });
      expect(await db('ticket_historial').where({ ticket_id: res.body.id }).first('usuario_id')).toEqual({
        usuario_id: String(ids[quien]),
      });
    });

    it.each([
      ['el vecino envía solicitanteId', 'vecino', () => ({ solicitanteId: ids.vecino })],
      ['el receptor sin canal', 'receptor', () => ({ solicitanteId: ids.vecino })],
      ['el receptor con canal portal', 'receptor', () => ({ solicitanteId: ids.vecino, canal: 'portal' })],
      ['lat y lng', 'vecino', () => ({ lat: 14.6, lng: -90.5 })],
      ['prioridad', 'vecino', () => ({ prioridad: 'alta' })],
      ['estado', 'vecino', () => ({ estado: 'asignada' })],
    ])('%s → 400 VALIDACION', async (_caso, quien, extra) => {
      const res = await registrar(quien, { ...cuerpo(), ...extra() });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ codigo: 'VALIDACION', mensaje: expect.any(String) });
    });

    it.each([
      ['título corto', () => ({ titulo: '   Hoyo   ' }), 'TITULO_INVALIDO'],
      ['descripción corta', () => ({ descripcion: 'Corta' }), 'DESCRIPCION_INVALIDA'],
      ['dirección corta', () => ({ direccion: 'x' }), 'DIRECCION_INVALIDA'],
      ['categoría inactiva', () => ({ categoriaId: ids.categoriaInactiva }), 'CATEGORIA_INVALIDA'],
      ['categoría de dependencia inactiva', () => ({ categoriaId: ids.categoriaDependenciaInactiva }), 'CATEGORIA_INVALIDA'],
      ['zona inexistente', () => ({ zonaId: 999999 }), 'ZONA_INVALIDA'],
    ])('%s → 400 %s', async (_caso, extra, codigo) => {
      const res = await registrar('vecino', { ...cuerpo(), ...extra() });

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe(codigo);
    });

    it('datosExtra se valida contra la categoría (SPEC 14): una clave desconocida → 400 DATOS_EXTRA_INVALIDOS', async () => {
      const res = await registrar('vecino', { ...cuerpo(), datosExtra: { color: 'rojo' } });

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        codigo: 'DATOS_EXTRA_INVALIDOS',
        mensaje: expect.any(String),
        detalles: [{ campo: 'color', problema: 'CAMPO_DESCONOCIDO' }],
      });
      expect((await registrar('vecino', { ...cuerpo(), datosExtra: {} })).status).toBe(201);
    });

    it.each([
      ['un vecino inactivo', () => ids.vecinoInactivo],
      ['un usuario interno', () => ids.tecnico],
      ['un id inexistente', () => 999999],
    ])('el receptor a nombre de %s → 400 SOLICITANTE_INVALIDO', async (_caso, solicitante) => {
      const res = await registrar('receptor', { ...cuerpo(), solicitanteId: solicitante(), canal: 'ventanilla' });

      expect(res.status).toBe(400);
      expect(res.body.codigo).toBe('SOLICITANTE_INVALIDO');
    });

    it.each(['tecnico', 'coordinador', 'administrador'])('el %s recibe 403', async (quien) => {
      const res = await registrar(quien, cuerpo());

      expect(res.status).toBe(403);
      expect(res.body.codigo).toBe('PERMISO_DENEGADO');
    });

    it('sin token responde 401', async () => {
      expect((await registrar(null, cuerpo())).status).toBe(401);
    });

    it('un vecino sin correo no recibe nada, y un fallo del envío no impide el 201', async () => {
      const sinCorreo = await registrar('receptor', { ...cuerpo(), solicitanteId: ids.vecinoSinCorreo, canal: 'redes' });
      expect(sinCorreo.status).toBe(201);

      enviador.fallar = true;
      const consola = jest.spyOn(console, 'error').mockImplementation(() => {});
      try {
        expect((await registrar('vecino', cuerpo())).status).toBe(201);
        await new Promise((resolver) => setTimeout(resolver, 150));
        expect(enviador.enviados).toEqual([]);
        expect(consola).toHaveBeenCalledWith(expect.stringContaining('queja_registrada'));
      } finally {
        consola.mockRestore();
      }
    });
  });

  describe('GET /vecinos', () => {
    const buscar = (quien: string, query: string) =>
      request(app).get(`/api/v1/vecinos?${query}`).set('Authorization', `Bearer ${tokens[quien]}`);

    it('el receptor encuentra por correo con el contacto enmascarado y sin DPI', async () => {
      const res = await buscar('receptor', 'email=VECINO@quejas.test');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        datos: [{ id: ids.vecino, nombre: 'Usuario vecino', email: 'v***@quejas.test', telefono: '****0000' }],
      });
      expect(JSON.stringify(res.body)).not.toContain('2547123450101');
    });

    it('encuentra por teléfono y por DPI con espacios, solo vecinos activos', async () => {
      expect((await buscar('supervisor', 'telefono=55550000')).body.datos.map((v: { id: number }) => v.id)).toEqual([
        ids.vecino,
      ]);
      expect((await buscar('receptor', 'dpi=2547%2012345%200101')).body.datos).toHaveLength(1);
      expect((await buscar('receptor', 'email=inactivo@quejas.test')).body.datos).toEqual([]);
      expect((await buscar('receptor', 'email=tecnico@quejas.test')).body.datos).toEqual([]);
    });

    it('el vecino recibe 403 y el técnico también', async () => {
      expect((await buscar('vecino', 'email=vecino@quejas.test')).status).toBe(403);
      expect((await buscar('tecnico', 'email=vecino@quejas.test')).status).toBe(403);
    });

    it('ninguno o más de un criterio responde 400 VALIDACION', async () => {
      expect((await buscar('receptor', 'email=vecino@quejas.test&telefono=55550000')).body.codigo).toBe('VALIDACION');
      expect((await buscar('receptor', '')).body.codigo).toBe('VALIDACION');
    });
  });
});
