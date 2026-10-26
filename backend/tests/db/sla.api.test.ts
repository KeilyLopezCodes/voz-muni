import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { Clock } from '../../src/domain/health/clock';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';
import { prepararSla } from './sla-fixtures';

const PASSWORD = 'Clave-de-prueba-1';

class EnviadorEnMemoria implements EnviadorCorreo {
  async enviar(): Promise<void> {}
}

// El reloj de la app se mueve a mano. Como también valida la sesión, cada petición inicia sesión de nuevo con la
// hora del reloj (ver tokenDe).
class RelojDePrueba implements Clock {
  actual = new Date();

  now(): Date {
    return this.actual;
  }
}

// Guatemala está en UTC−6 todo el año. Solo para armar los datos de prueba.
function gt(fecha: string, hora: string): Date {
  const [h, m] = hora.split(':').map(Number);
  const base = new Date(`${fecha}T00:00:00.000Z`).getTime();
  return new Date(base + ((h + 6) * 60 + m) * 60_000);
}

// Noviembre de 2026: el 1 es domingo; no hay asuetos entre el 2 y el 13. La matriz de prueba (sla-fixtures) da a
// `alta` 8 h de respuesta y 48 h de resolución; Alumbrado tiene su propia política.
const REGISTRO = gt('2026-11-02', '09:00');

describe('Vencimientos del SLA (SPEC 30)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const reloj = new RelojDePrueba();
  const ids: Record<string, number> = {};
  let correlativo = 1;

  async function tokenDe(rol: string): Promise<string> {
    const res = await request(app).post('/api/v1/auth/login').send({ email: `${rol}@sla.test`, password: PASSWORD });
    expect(res.status).toBe(200);
    return res.body.accessToken;
  }

  async function transicion(rol: string, id: number, cuerpo: object, ahora: Date) {
    reloj.actual = ahora;
    return request(app)
      .post(`/api/v1/tickets/${id}/transiciones`)
      .set('Authorization', `Bearer ${await tokenDe(rol)}`)
      .send(cuerpo);
  }

  async function obtener(rol: string, ruta: string, ahora: Date) {
    reloj.actual = ahora;
    return request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${await tokenDe(rol)}`);
  }

  async function ticket(estado: EstadoTicket, cambios: Record<string, unknown> = {}): Promise<number> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids.baches,
        zona_id: ids.zona,
        canal: 'portal',
        titulo: 'Bache frente a la escuela',
        descripcion: 'Hay un bache profundo que daña los vehículos',
        direccion: '5a avenida 3-20, zona 1',
        estado,
        creado_en: REGISTRO,
        ...cambios,
      })
      .returning('id');
    return Number(fila.id);
  }

  const sla = (id: number) =>
    db('tickets')
      .where({ id })
      .first(
        'estado',
        'vence_respuesta',
        'vence_resolucion',
        'primera_respuesta_en',
        'sla_inicio_resolucion',
        'sla_pausa_minutos',
        'sla_pausado_desde',
        'sla_restante_minutos',
      );

  // Acepta con prioridad alta y asigna al técnico, como harían el supervisor y el coordinador.
  async function aceptada(categoriaId = ids.baches, prioridad = 'alta'): Promise<number> {
    const id = await ticket('en_revision', { categoria_id: categoriaId });
    const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad }, gt('2026-11-02', '10:00'));
    expect(res.status).toBe(200);
    await db('tickets').where({ id }).update({ asignado_a: ids.tecnico });
    return id;
  }

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: new EnviadorEnMemoria(), reloj });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const [obras] = await db('dependencias').insert({ nombre: 'Dirección de Obras' }).returning('id');
    ids.obras = Number(obras.id);
    const [servicios] = await db('dependencias').insert({ nombre: 'Servicios Públicos' }).returning('id');
    ids.servicios = Number(servicios.id);
    for (const [clave, nombre, dependenciaId] of [
      ['baches', 'Baches', ids.obras],
      ['alumbrado', 'Alumbrado', ids.servicios],
      ['sinSla', 'Aceras', ids.obras],
    ] as const) {
      const [fila] = await db('categorias').insert({ nombre, dependencia_id: dependenciaId }).returning('id');
      ids[clave] = Number(fila.id);
    }
    await prepararSla(db, [ids.baches]);
    await db('politicas_sla').insert([
      { categoria_id: ids.alumbrado, prioridad: 'urgente', horas_respuesta: 1, horas_resolucion: 16 },
      { categoria_id: ids.alumbrado, prioridad: 'alta', horas_respuesta: 4, horas_resolucion: 24 },
      { categoria_id: ids.alumbrado, prioridad: 'media', horas_respuesta: 8, horas_resolucion: 48 },
      { categoria_id: ids.alumbrado, prioridad: 'baja', horas_respuesta: 16, horas_resolucion: 96 },
    ]);
    const [zona] = await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id');
    ids.zona = Number(zona.id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    for (const [rol, dependenciaId] of [
      ['vecino', null],
      ['tecnico', ids.obras],
      ['coordinador', ids.obras],
      ['supervisor', null],
    ] as const) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const [fila] = await db('usuarios')
        .insert({
          nombre: `Usuario ${rol}`,
          email: `${rol}@sla.test`,
          telefono: '55553030',
          rol_id: rolId,
          password_hash: hash,
          correo_verificado_en: new Date(),
          dependencia_id: dependenciaId,
        })
        .returning('id');
      ids[rol] = Number(fila.id);
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

  describe('aceptar (SPEC 19)', () => {
    it('guarda los dos vencimientos desde el registro según la política y la jornada', async () => {
      const id = await ticket('en_revision');
      const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2026-11-02', '10:00'));
      expect(res.status).toBe(200);
      // Lunes 09:00 + 8 h hábiles = martes 09:00; + 48 h (6 jornadas) = martes 10 a las 09:00.
      expect(res.body).toMatchObject({
        venceRespuesta: gt('2026-11-03', '09:00').toISOString(),
        venceResolucion: gt('2026-11-10', '09:00').toISOString(),
      });
      expect(await sla(id)).toEqual({
        estado: 'asignada',
        vence_respuesta: gt('2026-11-03', '09:00'),
        vence_resolucion: gt('2026-11-10', '09:00'),
        primera_respuesta_en: null,
        sla_inicio_resolucion: REGISTRO,
        sla_pausa_minutos: 0,
        sla_pausado_desde: null,
        sla_restante_minutos: null,
      });
    });

    it('en una categoría sin SLA → 409 SLA_NO_CONFIGURADO, y la queja sigue en en_revision', async () => {
      const id = await ticket('en_revision', { categoria_id: ids.sinSla });
      const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2026-11-02', '10:00'));
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('SLA_NO_CONFIGURADO');
      expect(await sla(id)).toMatchObject({ estado: 'en_revision', vence_respuesta: null, vence_resolucion: null });
      expect(await db('ticket_historial').where({ ticket_id: id })).toEqual([]);
    });

    it('con el calendario corto → 409 CALENDARIO_INCOMPLETO, y la queja no cambia', async () => {
      const id = await ticket('en_revision', { creado_en: gt('2027-12-31', '15:00') });
      const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2027-12-31', '15:30'));
      expect(res.status).toBe(409);
      expect(res.body.codigo).toBe('CALENDARIO_INCOMPLETO');
      expect(await sla(id)).toMatchObject({ estado: 'en_revision', vence_respuesta: null });
    });

    it('con la jornada inválida → 409 PARAMETRO_INVALIDO, y la queja no cambia', async () => {
      const id = await ticket('en_revision');
      const { valor } = await db('parametros').where({ clave: 'jornada_laboral' }).first('valor');
      await db('parametros').where({ clave: 'jornada_laboral' }).update({ valor: JSON.stringify({ inicio: '16:00', fin: '08:00' }) });
      try {
        const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2026-11-02', '10:00'));
        expect(res.status).toBe(409);
        expect(res.body.codigo).toBe('PARAMETRO_INVALIDO');
        expect(await sla(id)).toMatchObject({ estado: 'en_revision' });
      } finally {
        await db('parametros').where({ clave: 'jornada_laboral' }).update({ valor: JSON.stringify(valor) });
      }
    });
  });

  describe('atención (SPEC 22)', () => {
    it('iniciar fija primera_respuesta_en; espera congela; reanudar 2 h hábiles después corre la resolución 2 h', async () => {
      const id = await aceptada();

      expect((await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'))).status).toBe(200);
      expect(await sla(id)).toMatchObject({ primera_respuesta_en: gt('2026-11-02', '11:00') });

      const espera = await transicion(
        'tecnico',
        id,
        { accion: 'poner_en_espera', motivo: 'Envíe una foto del bache' },
        gt('2026-11-03', '10:00'),
      );
      expect(espera.status).toBe(200);
      // Del martes 3 a las 10:00 al martes 10 a las 09:00: 6 h + 4 jornadas + 1 h = 2340 min hábiles.
      expect(await sla(id)).toMatchObject({
        estado: 'en_espera',
        vence_resolucion: null,
        sla_pausado_desde: gt('2026-11-03', '10:00'),
        sla_restante_minutos: 2340,
      });

      expect((await transicion('tecnico', id, { accion: 'reanudar' }, gt('2026-11-03', '12:00'))).status).toBe(200);
      expect(await sla(id)).toMatchObject({
        estado: 'en_proceso',
        vence_respuesta: gt('2026-11-03', '09:00'),
        vence_resolucion: gt('2026-11-10', '11:00'),
        primera_respuesta_en: gt('2026-11-02', '11:00'),
        sla_pausa_minutos: 120,
        sla_pausado_desde: null,
        sla_restante_minutos: null,
      });
    });

    it('una espera que empieza fuera de la jornada solo descuenta el tiempo hábil', async () => {
      const id = await aceptada();
      await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'));
      await transicion('tecnico', id, { accion: 'poner_en_espera', motivo: 'Envíe una foto' }, gt('2026-11-03', '18:00'));
      // De las 18:00 del martes a las 09:00 del miércoles solo cuenta 1 h hábil.
      await transicion('tecnico', id, { accion: 'reanudar' }, gt('2026-11-04', '09:00'));
      expect(await sla(id)).toMatchObject({ sla_pausa_minutos: 60, vence_resolucion: gt('2026-11-10', '10:00') });
    });
  });

  describe('respuesta del vecino (SPEC 23)', () => {
    it('un comentario público del solicitante en espera recalcula igual que reanudar', async () => {
      const id = await aceptada();
      await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'));
      await transicion('tecnico', id, { accion: 'poner_en_espera', motivo: 'Envíe una foto' }, gt('2026-11-03', '10:00'));

      reloj.actual = gt('2026-11-03', '12:00');
      const res = await request(app)
        .post(`/api/v1/tickets/${id}/comentarios`)
        .set('Authorization', `Bearer ${await tokenDe('vecino')}`)
        .send({ cuerpo: 'Ya la subí', interno: false });
      expect(res.status).toBe(201);
      expect(res.body.ticket.estado).toBe('en_proceso');
      expect(await sla(id)).toMatchObject({
        vence_resolucion: gt('2026-11-10', '11:00'),
        sla_pausa_minutos: 120,
        sla_pausado_desde: null,
        sla_restante_minutos: null,
      });
    });
  });

  describe('reabrir (SPEC 27)', () => {
    it('reinicia la resolución desde la reapertura con la pausa en 0, sin tocar la primera respuesta', async () => {
      const id = await ticket('resuelta', {
        prioridad: 'alta',
        dependencia_id: ids.obras,
        asignado_a: ids.tecnico,
        resuelto_en: gt('2026-11-03', '15:00'),
        resuelto_por: ids.tecnico,
        resolucion: 'Se rellenó el bache',
        confirmacion_vence_en: gt('2026-11-10', '23:59'),
        vence_respuesta: gt('2026-11-03', '09:00'),
        vence_resolucion: gt('2026-11-10', '09:00'),
        primera_respuesta_en: gt('2026-11-02', '11:00'),
        sla_inicio_resolucion: REGISTRO,
        sla_pausa_minutos: 300,
      });
      const res = await transicion('vecino', id, { accion: 'reabrir', motivo: 'El bache volvió a abrirse' }, gt('2026-11-04', '10:00'));
      expect(res.status).toBe(200);
      // Miércoles 4 a las 10:00 + 48 h hábiles = jueves 12 a las 10:00.
      expect(await sla(id)).toMatchObject({
        estado: 'en_proceso',
        vence_resolucion: gt('2026-11-12', '10:00'),
        sla_inicio_resolucion: gt('2026-11-04', '10:00'),
        sla_pausa_minutos: 0,
        vence_respuesta: gt('2026-11-03', '09:00'),
        primera_respuesta_en: gt('2026-11-02', '11:00'),
      });
    });
  });

  describe('traslado y nueva aceptación (SPEC 21)', () => {
    it('recalcula los dos desde el registro con la política nueva y la pausa acumulada, y conserva la primera respuesta', async () => {
      const id = await aceptada();
      await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'));
      await transicion('tecnico', id, { accion: 'poner_en_espera', motivo: 'Envíe una foto' }, gt('2026-11-03', '10:00'));
      await transicion('tecnico', id, { accion: 'reanudar' }, gt('2026-11-03', '12:00'));

      reloj.actual = gt('2026-11-03', '13:00');
      const traslado = await request(app)
        .post(`/api/v1/tickets/${id}/traslados`)
        .set('Authorization', `Bearer ${await tokenDe('supervisor')}`)
        .send({ motivo: 'Es un poste caído, no un bache' });
      expect(traslado.status).toBe(200);
      expect(traslado.body.ticket.estado).toBe('en_revision');

      const res = await transicion(
        'supervisor',
        id,
        { accion: 'aceptar', prioridad: 'urgente', categoriaId: ids.alumbrado },
        gt('2026-11-03', '14:00'),
      );
      expect(res.status).toBe(200);
      // Lunes 09:00 + 1 h = 10:00. Resolución: 16 h + 120 min de pausa = 1080 min desde el lunes 09:00 = miércoles 11:00.
      expect(await sla(id)).toMatchObject({
        estado: 'asignada',
        vence_respuesta: gt('2026-11-02', '10:00'),
        vence_resolucion: gt('2026-11-04', '11:00'),
        sla_inicio_resolucion: REGISTRO,
        sla_pausa_minutos: 120,
        primera_respuesta_en: gt('2026-11-02', '11:00'),
      });
    });
  });

  describe('instantes de alerta (SPEC 31)', () => {
    const alertas = (id: number) =>
      db('tickets')
        .where({ id })
        .first('alerta_respuesta_en', 'alerta_resolucion_en', 'alerta_respuesta_enviada_en', 'alerta_resolucion_enviada_en');

    it('aceptar guarda los dos instantes al 80 % y deja las marcas en NULL', async () => {
      const id = await ticket('en_revision', { alerta_respuesta_enviada_en: REGISTRO, alerta_resolucion_enviada_en: REGISTRO });
      expect((await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2026-11-02', '10:00'))).status).toBe(200);
      // 80 % de 8 h = 6 h 24 min desde el lunes 09:00; 80 % de 48 h = 2304 min = viernes 6 a las 15:24.
      expect(await alertas(id)).toEqual({
        alerta_respuesta_en: gt('2026-11-02', '15:24'),
        alerta_resolucion_en: gt('2026-11-06', '15:24'),
        alerta_respuesta_enviada_en: null,
        alerta_resolucion_enviada_en: null,
      });
    });

    it('iniciar limpia la de respuesta; la espera limpia la de resolución y reanudar la recalcula', async () => {
      const id = await aceptada();
      await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'));
      expect(await alertas(id)).toMatchObject({ alerta_respuesta_en: null, alerta_resolucion_en: gt('2026-11-06', '15:24') });

      await transicion('tecnico', id, { accion: 'poner_en_espera', motivo: 'Envíe una foto' }, gt('2026-11-03', '10:00'));
      expect(await alertas(id)).toMatchObject({ alerta_resolucion_en: null });

      await transicion('tecnico', id, { accion: 'reanudar' }, gt('2026-11-03', '12:00'));
      // Faltaban 2340 min; al umbral faltan 576: la alerta queda a 1764 min de las 12:00 del martes.
      expect(await alertas(id)).toMatchObject({ alerta_resolucion_en: gt('2026-11-09', '09:24') });
    });

    it('con sla_umbral_alerta = 0, aceptar responde 409 PARAMETRO_INVALIDO y la queja no cambia', async () => {
      const id = await ticket('en_revision');
      await db('parametros').where({ clave: 'sla_umbral_alerta' }).update({ valor: JSON.stringify(0) });
      try {
        const res = await transicion('supervisor', id, { accion: 'aceptar', prioridad: 'alta' }, gt('2026-11-02', '10:00'));
        expect(res.status).toBe(409);
        expect(res.body.codigo).toBe('PARAMETRO_INVALIDO');
        expect(await sla(id)).toMatchObject({ estado: 'en_revision', vence_respuesta: null });
      } finally {
        await db('parametros').where({ clave: 'sla_umbral_alerta' }).update({ valor: JSON.stringify(80) });
      }
    });
  });

  describe('lectura (SPEC 20, 22 y 25)', () => {
    it('las bandejas y el detalle llevan sla para los internos; el vecino recibe sla: null en el detalle', async () => {
      const id = await aceptada();
      await transicion('tecnico', id, { accion: 'iniciar' }, gt('2026-11-02', '11:00'));
      await transicion('tecnico', id, { accion: 'poner_en_espera', motivo: 'Envíe una foto' }, gt('2026-11-03', '10:00'));
      const ahora = gt('2026-11-03', '11:00');
      const esperado = {
        venceRespuesta: gt('2026-11-03', '09:00').toISOString(),
        primeraRespuestaEn: gt('2026-11-02', '11:00').toISOString(),
        venceResolucion: null,
        pausado: true,
        restanteMinutosEnPausa: 2340,
      };

      const porAsignar = await obtener('coordinador', '/tickets/por-asignar?vista=abiertas&tamano=50', ahora);
      expect(porAsignar.status).toBe(200);
      expect(porAsignar.body.datos.find((t: { id: number }) => t.id === id).sla).toEqual(esperado);

      const atencion = await obtener('tecnico', '/tickets/atencion?estado=en_espera', ahora);
      expect(atencion.status).toBe(200);
      expect(atencion.body.datos.find((t: { id: number }) => t.id === id).sla).toEqual(esperado);

      expect((await obtener('coordinador', `/tickets/${id}`, ahora)).body.sla).toEqual(esperado);
      const vecino = await obtener('vecino', `/tickets/${id}`, ahora);
      expect(vecino.status).toBe(200);
      expect(vecino.body.sla).toBeNull();
    });
  });
});
