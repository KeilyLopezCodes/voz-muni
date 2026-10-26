import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';
import { prepararSla } from './sla-fixtures';

const PASSWORD = 'Clave-de-prueba-1';
const DIA = 24 * 60 * 60 * 1000;
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };

interface FilaBitacora {
  accion: string;
  entidad: string;
  entidad_id: string | null;
  usuario_id: string | null;
  dependencia_id: string | null;
  ip: string | null;
  detalle: { cambios?: Record<string, { antes: unknown; despues: unknown }>; datos?: Record<string, unknown> };
}

// Cada acción de SPEC 41 deja exactamente un registro, en su transacción y con su dependencia (RF-42).
describe('Bitácora: cada acción sobre quejas y de administración (SPEC 41)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  // Lejos del correlativo real: la primera prueba registra una queja por la API (Q-2026-000001).
  let correlativo = 900000;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    for (const [clave, nombre] of [
      ['obras', 'Dirección de Obras'],
      ['agua', 'Agua Potable'],
    ] as const) {
      const [fila] = await db('dependencias').insert({ nombre }).returning('id');
      ids[clave] = Number(fila.id);
    }
    const [baches] = await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.obras }).returning('id');
    ids.baches = Number(baches.id);
    await prepararSla(db, [ids.baches]);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['vecino', 'vecino', null],
      ['receptor', 'receptor', null],
      ['tecnico', 'tecnico', ids.obras],
      ['otroTecnico', 'tecnico', ids.obras],
      ['coordinador', 'coordinador', ids.obras],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave.toLowerCase()}@bitacora.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${clave}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date(), dependencia_id: dependenciaId })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
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

  const auth = (quien: string) => ({ Authorization: `Bearer ${tokens[quien]}` });
  const api = {
    post: (ruta: string, cuerpo: object, quien: string) => request(app).post(`/api/v1${ruta}`).set(auth(quien)).send(cuerpo),
    patch: (ruta: string, cuerpo: object, quien: string) => request(app).patch(`/api/v1${ruta}`).set(auth(quien)).send(cuerpo),
    put: (ruta: string, cuerpo: object, quien: string) => request(app).put(`/api/v1${ruta}`).set(auth(quien)).send(cuerpo),
  };
  const transicion = (id: number, cuerpo: object, quien: string) => api.post(`/tickets/${id}/transiciones`, cuerpo, quien);

  // Los registros que dejó `accion`: se compara contra el último id antes de ejecutarla.
  async function registrosDe(accion: () => Promise<{ status: number }>, estado = 200): Promise<FilaBitacora[]> {
    const [{ max }] = await db('bitacora').max({ max: 'id' });
    const res = await accion();
    expect(res.status).toBe(estado);
    return db('bitacora')
      .where('id', '>', max ?? 0)
      .orderBy('id')
      .select('accion', 'entidad', 'entidad_id', 'usuario_id', 'dependencia_id', 'ip', 'detalle');
  }

  async function queja(estado: EstadoTicket, cambios: Record<string, unknown> = {}): Promise<number> {
    const enRevision = estado === 'nueva' || estado === 'en_revision';
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        dependencia_id: enRevision ? null : ids.obras,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Un bache grande que ya dañó dos carros',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        prioridad: enRevision ? null : 'media',
        asignado_a: enRevision ? null : ids.tecnico,
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const id = (clave: string) => String(ids[clave]);

  describe('quejas', () => {
    it('registrar: sin dependencia, con el canal y la IP de la petición', async () => {
      const [fila, ...otras] = await registrosDe(
        () =>
          api.post(
            '/tickets',
            { categoriaId: ids.baches, zonaId: ids.zona, titulo: 'Bache en la esquina', descripcion: 'Un bache profundo en la esquina', direccion: '3a calle 4-10' },
            'vecino',
          ),
        201,
      );
      expect(otras).toEqual([]);
      expect(fila).toMatchObject({ accion: 'ticket.registrar', entidad: 'ticket', usuario_id: id('vecino'), dependencia_id: null });
      expect(fila.ip).toEqual(expect.stringContaining('127.0.0.1'));
      expect(fila.detalle).toEqual({
        cambios: { estado: { antes: null, despues: 'nueva' } },
        datos: { canal: 'portal', categoriaId: ids.baches },
      });
    });

    it('tomar, aceptar y rechazar; un 409 no deja registro', async () => {
      const ticket = await queja('nueva');
      const [tomar] = await registrosDe(() => transicion(ticket, { accion: 'tomar' }, 'supervisor'));
      expect(tomar).toMatchObject({ accion: 'ticket.tomar', entidad_id: String(ticket), dependencia_id: null });
      expect(await registrosDe(() => transicion(ticket, { accion: 'tomar' }, 'supervisor'), 409)).toEqual([]);

      const [aceptar] = await registrosDe(() => transicion(ticket, { accion: 'aceptar', prioridad: 'alta' }, 'supervisor'));
      expect(aceptar).toMatchObject({ accion: 'ticket.aceptar', usuario_id: id('supervisor'), dependencia_id: id('obras') });
      expect(aceptar.detalle.cambios).toMatchObject({
        estado: { antes: 'en_revision', despues: 'asignada' },
        prioridad: { antes: null, despues: 'alta' },
        dependenciaId: { antes: null, despues: ids.obras },
      });

      const otra = await queja('en_revision');
      const [rechazar] = await registrosDe(() => transicion(otra, { accion: 'rechazar', motivo: 'Fuera del municipio' }, 'supervisor'));
      expect(rechazar).toMatchObject({ accion: 'ticket.rechazar', dependencia_id: null });
      expect(rechazar.detalle.datos).toEqual({ motivo: 'Fuera del municipio' });
    });

    it('asignar, iniciar, poner en espera, la respuesta del vecino, resolver y confirmar', async () => {
      const ticket = await queja('asignada', { asignado_a: null });
      const [asignar] = await registrosDe(() => api.patch(`/tickets/${ticket}/asignacion`, { tecnicoId: ids.tecnico }, 'coordinador'));
      expect(asignar).toMatchObject({ accion: 'ticket.asignar', usuario_id: id('coordinador'), dependencia_id: id('obras') });
      expect(asignar.detalle.datos).toMatchObject({ tecnicoAnterior: null, tecnicoNuevo: ids.tecnico });

      expect((await registrosDe(() => transicion(ticket, { accion: 'iniciar' }, 'tecnico'))).map((f) => f.accion)).toEqual(['ticket.iniciar']);
      const [espera] = await registrosDe(() => transicion(ticket, { accion: 'poner_en_espera', motivo: 'Una foto' }, 'tecnico'));
      expect(espera).toMatchObject({ accion: 'ticket.poner_en_espera', usuario_id: id('tecnico') });
      expect(espera.detalle.datos).toEqual({ motivo: 'Una foto' });

      // El comentario en sí es de SPEC 42: aquí solo el cambio de estado, a nombre del vecino.
      const [reanudar] = await registrosDe(() => api.post(`/tickets/${ticket}/comentarios`, { cuerpo: 'Aquí va', interno: false }, 'vecino'), 201);
      expect(reanudar).toMatchObject({ accion: 'ticket.reanudar', usuario_id: id('vecino'), dependencia_id: id('obras') });

      const [resolver] = await registrosDe(() => transicion(ticket, { accion: 'resolver', descripcion: 'Se rellenó' }, 'tecnico'));
      expect(resolver.detalle.cambios).toMatchObject({ estado: { antes: 'en_proceso', despues: 'resuelta' } });

      const [confirmar] = await registrosDe(() => transicion(ticket, { accion: 'confirmar' }, 'vecino'));
      expect(confirmar).toMatchObject({ accion: 'ticket.confirmar', usuario_id: id('vecino') });

      const [encuesta] = await registrosDe(() => api.post(`/tickets/${ticket}/encuesta`, { calificacion: 4 }, 'vecino'), 201);
      expect(encuesta).toMatchObject({ accion: 'encuesta.registrar', entidad: 'encuesta', entidad_id: String(ticket), dependencia_id: id('obras') });
      expect(encuesta.detalle.datos).toEqual({ calificacion: 4 });
    });

    it('reabrir', async () => {
      const ticket = await queja('resuelta', {
        resuelto_en: new Date(),
        resolucion: 'Se rellenó',
        resuelto_por: ids.tecnico,
        confirmacion_vence_en: new Date(Date.now() + 3 * DIA),
      });
      const [reabrir] = await registrosDe(() => transicion(ticket, { accion: 'reabrir', motivo: 'Sigue el hoyo' }, 'vecino'));
      expect(reabrir).toMatchObject({ accion: 'ticket.reabrir', usuario_id: id('vecino') });
      expect(reabrir.detalle.cambios).toMatchObject({ reaperturas: { antes: 0, despues: 1 } });
    });

    it('traslados: solicitar, aprobar (con la dependencia de antes), rechazar, retirar y directo', async () => {
      const ticket = await queja('en_proceso');
      const [solicitar] = await registrosDe(() => api.post(`/tickets/${ticket}/traslados`, { motivo: 'Es una fuga' }, 'tecnico'), 201);
      expect(solicitar).toMatchObject({ accion: 'traslado.solicitar', entidad: 'traslado', dependencia_id: id('obras') });
      const solicitudId = Number(solicitar.entidad_id);

      const [trasladar] = await registrosDe(() => api.post(`/traslados/${solicitudId}/aprobacion`, {}, 'supervisor'));
      expect(trasladar).toMatchObject({ accion: 'ticket.trasladar', entidad_id: String(ticket), dependencia_id: id('obras') });
      expect(trasladar.detalle.cambios).toMatchObject({ estado: { despues: 'en_revision' }, dependenciaId: { antes: ids.obras, despues: null } });

      const otra = await queja('en_proceso');
      const rechazable = (await api.post(`/tickets/${otra}/traslados`, { motivo: 'Revisar' }, 'tecnico')).body.solicitud.id;
      const [rechazar] = await registrosDe(() => api.post(`/traslados/${rechazable}/rechazo`, { motivo: 'Es un bache' }, 'supervisor'));
      expect(rechazar).toMatchObject({ accion: 'traslado.rechazar', entidad_id: String(rechazable), dependencia_id: id('obras') });

      const retirable = (await api.post(`/tickets/${otra}/traslados`, { motivo: 'Revisar' }, 'tecnico')).body.solicitud.id;
      const [retirar] = await registrosDe(() => api.post(`/traslados/${retirable}/retiro`, {}, 'tecnico'));
      expect(retirar).toMatchObject({ accion: 'traslado.retirar', usuario_id: id('tecnico') });

      const directa = await queja('asignada');
      const [directo] = await registrosDe(() => api.post(`/tickets/${directa}/traslados`, { motivo: 'Es de Agua' }, 'supervisor'));
      expect(directo).toMatchObject({ accion: 'ticket.trasladar', dependencia_id: id('obras') });
    });
  });

  describe('jobs (sistema)', () => {
    it('escalar y cerrar automáticamente quedan con usuario_id e ip en NULL', async () => {
      const vencida = await queja('en_proceso', { vence_resolucion: new Date(Date.now() - DIA) });
      const antes = Number((await db('bitacora').max({ max: 'id' }))[0].max ?? 0);
      await container.escalamientoService.procesar(new Date());
      const escalar = await db('bitacora').where('id', '>', antes).where({ entidad_id: String(vencida) }).select('accion', 'usuario_id', 'ip', 'detalle', 'dependencia_id');
      expect(escalar).toEqual([
        expect.objectContaining({ accion: 'ticket.escalar', usuario_id: null, ip: null, dependencia_id: id('obras'), detalle: expect.objectContaining({ datos: { plazo: 'resolucion' } }) }),
      ]);

      const porCerrar = await queja('resuelta', {
        resuelto_en: new Date(Date.now() - 10 * DIA),
        resolucion: 'Se rellenó',
        confirmacion_vence_en: new Date(Date.now() - DIA),
      });
      await container.cierreAutomaticoService.procesar(new Date());
      const cerrar = await db('bitacora').where({ entidad_id: String(porCerrar), accion: 'ticket.cerrar_automatico' }).select('usuario_id', 'ip');
      expect(cerrar).toEqual([{ usuario_id: null, ip: null }]);
    });
  });

  describe('administración', () => {
    it('usuarios: crear, editar (teléfono enmascarado), desactivar, activar y desbloquear', async () => {
      const [crear] = await registrosDe(
        () => api.post('/admin/usuarios', { nombre: 'Nuevo Técnico', email: 'nuevo@bitacora.test', dpi: '1234567890101', rol: 'tecnico', dependenciaId: ids.agua }, 'administrador'),
        201,
      );
      expect(crear).toMatchObject({ accion: 'usuario.crear', entidad: 'usuario', usuario_id: id('administrador'), dependencia_id: id('agua') });
      expect(crear.detalle.cambios).toMatchObject({ dpi: { antes: null, despues: '*********0101' }, email: { despues: 'n***@bitacora.test' } });
      const nuevo = Number(crear.entidad_id);

      const [editar] = await registrosDe(() => api.patch(`/admin/usuarios/${nuevo}`, { telefono: '5555-1234' }, 'administrador'));
      expect(editar.detalle.cambios).toEqual({ telefono: { antes: null, despues: '****1234' } });

      const acciones = [];
      for (const [ruta, accion] of [
        ['desactivacion', 'usuario.desactivar'],
        ['activacion', 'usuario.activar'],
        ['desbloqueo', 'usuario.desbloquear'],
      ]) {
        const [fila] = await registrosDe(() => api.post(`/admin/usuarios/${nuevo}/${ruta}`, {}, 'administrador'));
        acciones.push(fila.accion);
        expect(fila.accion).toBe(accion);
      }
      expect(acciones).toHaveLength(3);
      expect(JSON.stringify(await db('bitacora').where({ entidad: 'usuario' }).select('detalle'))).not.toMatch(/password|token/i);
    });

    it('vecino de ventanilla: usuario.crear sin dependencia', async () => {
      const [fila] = await registrosDe(() => api.post('/vecinos', { nombre: 'Doña Rosa', dpi: '1234567890102', telefono: '44443333' }, 'receptor'), 201);
      expect(fila).toMatchObject({ accion: 'usuario.crear', usuario_id: id('receptor'), dependencia_id: null });
      expect(fila.detalle.cambios).toMatchObject({ telefono: { despues: '****3333' }, rol: { despues: 'vecino' } });
    });

    it('campos adicionales, parámetro y SLA (por prioridad, con la dependencia de la categoría)', async () => {
      const campo = { clave: 'profundidad', etiqueta: '¿Es profundo?', requerido: false, orden: 0, tipo: 'si_no' };
      const [campos] = await registrosDe(() => api.put(`/admin/categorias/${ids.baches}/campos-extra`, { campos: [campo] }, 'administrador'));
      expect(campos).toMatchObject({ accion: 'categoria.campos_extra', dependencia_id: id('obras') });
      expect(campos.detalle).toEqual({ cambios: { campos: { antes: [], despues: ['profundidad'] } }, datos: { cantidadCampos: 1 } });

      const limites = { latMin: 14.5, latMax: 14.7, lngMin: -90.6, lngMax: -90.4 };
      const [parametro] = await registrosDe(() => api.put('/admin/parametros/limites-municipio', limites, 'administrador'));
      expect(parametro).toMatchObject({ accion: 'parametro.actualizar', entidad: 'parametro', entidad_id: 'limites_municipio', dependencia_id: null });

      const plazos = [
        { prioridad: 'baja', horasRespuesta: 48, horasResolucion: 120 },
        { prioridad: 'media', horasRespuesta: 24, horasResolucion: 72 },
        { prioridad: 'alta', horasRespuesta: 8, horasResolucion: 48 },
        { prioridad: 'urgente', horasRespuesta: 1, horasResolucion: 24 },
      ];
      const [sla] = await registrosDe(() => api.put(`/admin/categorias/${ids.baches}/politicas-sla`, { plazos }, 'administrador'));
      expect(sla).toMatchObject({ accion: 'politica_sla.reemplazar', entidad: 'categoria', dependencia_id: id('obras') });
      expect(sla.detalle.cambios).toEqual({
        urgente: { antes: { horasRespuesta: 2, horasResolucion: 24 }, despues: { horasRespuesta: 1, horasResolucion: 24 } },
      });
    });

    it('dependencias, categorías y zonas; desactivar una zona deja activa en cambios y sin dependencia', async () => {
      const [dependencia] = await registrosDe(() => api.post('/admin/dependencias', { nombre: 'Parques' }, 'administrador'), 201);
      expect(dependencia).toMatchObject({ accion: 'dependencia.crear', dependencia_id: dependencia.entidad_id });
      const parques = Number(dependencia.entidad_id);
      const [renombrar] = await registrosDe(() => api.patch(`/admin/dependencias/${parques}`, { nombre: 'Parques y Jardines' }, 'administrador'));
      expect(renombrar.detalle.cambios).toEqual({ nombre: { antes: 'Parques', despues: 'Parques y Jardines' } });

      const [categoria] = await registrosDe(() => api.post('/admin/categorias', { nombre: 'Árboles caídos', dependenciaId: parques }, 'administrador'), 201);
      expect(categoria).toMatchObject({ accion: 'categoria.crear', dependencia_id: String(parques) });
      const [mover] = await registrosDe(() => api.patch(`/admin/categorias/${categoria.entidad_id}`, { dependenciaId: ids.agua }, 'administrador'));
      expect(mover).toMatchObject({ accion: 'categoria.editar', dependencia_id: id('agua') });

      const [zona] = await registrosDe(() => api.post('/admin/zonas', { nombre: 'El Mirador', tipo: 'colonia' }, 'administrador'), 201);
      expect(zona).toMatchObject({ accion: 'zona.crear', dependencia_id: null });
      const [desactivar] = await registrosDe(() => api.patch(`/admin/zonas/${zona.entidad_id}`, { activa: false }, 'administrador'));
      expect(desactivar).toMatchObject({ accion: 'zona.editar', dependencia_id: null });
      expect(desactivar.detalle.cambios).toEqual({ activa: { antes: true, despues: false } });

      // Un 409 no deja registro.
      expect(await registrosDe(() => api.post('/admin/zonas', { nombre: 'el mirador', tipo: 'colonia' }, 'administrador'), 409)).toEqual([]);
    });
  });
});
