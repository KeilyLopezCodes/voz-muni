import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import type { Knex } from 'knex';
import request from 'supertest';
import { createApp } from '../../src/app';
import { buildContainer, type Container } from '../../src/container';
import type { EnviadorCorreo } from '../../src/domain/notificaciones/enviador-correo';
import { cumplimientoResolucion, cumplimientoRespuesta } from '../../src/domain/reportes/cumplimiento';
import type { EstadoTicket } from '../../src/domain/ticket/estado-ticket';
import { createTestKnex, envDePrueba, reiniciarEsquema } from './knex-test';

const PASSWORD = 'Clave-de-prueba-1';
const sinCorreo: EnviadorCorreo = { enviar: async () => {} };
const SEPTIEMBRE = '?desde=2026-09-01&hasta=2026-09-30';
const FUTURO = '2027-06-01T15:00:00.000Z';

// Fixture del tablero (SPEC 43). Dependencias A y B, categorías Baches (A) y Agua (B), zonas Z1 y Z2.
// | Queja | Registro (UTC)        | Dep. | Cat.   | Zona | Estado      | Respuesta | Resolución | Min. resp. | Min. resol. |
// | T1    | 2026-09-10 15:00      | A    | Baches | Z1   | en_proceso  | cumple    | incumple   | 120        | —           |
// | T2    | 2026-09-12 15:00      | A    | Baches | Z2   | cerrada     | incumple  | cumple     | 600        | 300         |
// | T3    | 2026-09-15 15:00      | B    | Agua   | Z1   | en_espera   | cumple    | incumple   | —          | —           |
// | T4    | 2026-09-20 15:00      | —    | Baches | Z1   | en_revision | no_aplica | no_aplica  | —          | —           |
// | T5    | 2026-09-25 15:00      | A    | Baches | Z1   | asignada    | pendiente | pendiente  | —          | —           |
// | T6    | 2026-09-01 05:30 (31/8 en GT) | B | Agua | Z1 | asignada | fuera del rango |
// | T7    | 2026-10-01 05:30 (30/9 en GT) | B | Agua | Z2 | rechazada | no_aplica | no_aplica |
describe('GET /api/v1/reportes/resumen (SPEC 43)', () => {
  let db: Knex;
  let container: Container;
  let app: Express;
  const ids: Record<string, number> = {};
  const tokens: Record<string, string> = {};
  let correlativo = 1;

  beforeAll(async () => {
    db = createTestKnex();
    container = buildContainer(envDePrueba(), { enviadorCorreo: sinCorreo });
    app = createApp(container);
    await reiniciarEsquema(db);
    await db.migrate.latest();

    for (const [clave, nombre] of [
      ['A', 'Dirección de Obras'],
      ['B', 'Agua Potable'],
    ] as const) {
      ids[clave] = Number((await db('dependencias').insert({ nombre }).returning('id'))[0].id);
    }
    ids.baches = Number((await db('categorias').insert({ nombre: 'Baches', dependencia_id: ids.A }).returning('id'))[0].id);
    ids.agua = Number((await db('categorias').insert({ nombre: 'Agua', dependencia_id: ids.B }).returning('id'))[0].id);
    ids.Z1 = Number((await db('zonas').insert({ nombre: 'Zona 1', tipo: 'zona' }).returning('id'))[0].id);
    ids.Z2 = Number((await db('zonas').insert({ nombre: 'El Mirador', tipo: 'colonia' }).returning('id'))[0].id);

    const hash = await bcrypt.hash(PASSWORD, 4);
    const usuarios: [string, string, number | null][] = [
      ['vecino', 'vecino', null],
      ['receptor', 'receptor', null],
      ['tecnicoA', 'tecnico', ids.A],
      ['tecnicoB', 'tecnico', ids.B],
      ['coordinadorA', 'coordinador', ids.A],
      ['supervisor', 'supervisor', null],
      ['administrador', 'administrador', null],
    ];
    for (const [clave, rol, dependenciaId] of usuarios) {
      const { id: rolId } = await db('roles').where({ nombre: rol }).first('id');
      const email = `${clave.toLowerCase()}@reportes.test`;
      const [fila] = await db('usuarios')
        .insert({ nombre: `Usuario ${clave}`, email, rol_id: rolId, password_hash: hash, correo_verificado_en: new Date(), dependencia_id: dependenciaId })
        .returning('id');
      ids[clave] = Number(fila.id);
      tokens[clave] = (await request(app).post('/api/v1/auth/login').send({ email, password: PASSWORD })).body.accessToken;
    }

    await queja('T1', '2026-09-10T15:00:00Z', 'A', 'baches', 'Z1', 'en_proceso', {
      asignado_a: ids.tecnicoA,
      vence_respuesta: '2026-09-11T15:00:00Z',
      primera_respuesta_en: '2026-09-10T18:00:00Z',
      minutos_respuesta: 120,
      sla_inicio_resolucion: '2026-09-10T15:00:00Z',
      vence_resolucion: '2026-09-15T15:00:00Z',
      escalado: true,
      escalado_en: '2026-09-15T15:00:00Z',
      escalado_por: 'resolucion',
    });
    await queja('T2', '2026-09-12T15:00:00Z', 'A', 'baches', 'Z2', 'cerrada', {
      asignado_a: ids.tecnicoA,
      vence_respuesta: '2026-09-12T17:00:00Z',
      primera_respuesta_en: '2026-09-14T15:00:00Z',
      minutos_respuesta: 600,
      sla_inicio_resolucion: '2026-09-12T15:00:00Z',
      vence_resolucion: '2026-09-20T15:00:00Z',
      resuelto_en: '2026-09-18T15:00:00Z',
      cerrado_en: '2026-09-25T15:00:00Z',
      minutos_resolucion: 300,
      escalado: true,
      escalado_en: '2026-09-13T15:00:00Z',
      escalado_por: 'respuesta',
    });
    await queja('T3', '2026-09-15T15:00:00Z', 'B', 'agua', 'Z1', 'en_espera', {
      asignado_a: ids.tecnicoB,
      vence_respuesta: FUTURO,
      primera_respuesta_en: '2026-09-15T16:00:00Z',
      sla_inicio_resolucion: '2026-09-15T15:00:00Z',
      vence_resolucion: null,
      sla_pausado_desde: '2026-09-20T15:00:00Z',
      sla_restante_minutos: 0,
    });
    await queja('T4', '2026-09-20T15:00:00Z', null, 'baches', 'Z1', 'en_revision', { prioridad: null });
    await queja('T5', '2026-09-25T15:00:00Z', 'A', 'baches', 'Z1', 'asignada', {
      asignado_a: ids.tecnicoA,
      prioridad: 'alta',
      vence_respuesta: FUTURO,
      sla_inicio_resolucion: '2026-09-25T15:00:00Z',
      vence_resolucion: FUTURO,
    });
    await queja('T6', '2026-09-01T05:30:00Z', 'B', 'agua', 'Z1', 'asignada', { vence_respuesta: FUTURO, vence_resolucion: FUTURO });
    await queja('T7', '2026-10-01T05:30:00Z', 'B', 'agua', 'Z2', 'rechazada', { prioridad: null });
  });

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await container.dispose();
      await db.destroy();
    }
  });

  async function queja(
    nombre: string,
    creadoEn: string,
    dependencia: 'A' | 'B' | null,
    categoria: 'baches' | 'agua',
    zona: 'Z1' | 'Z2',
    estado: EstadoTicket,
    cambios: Record<string, unknown> = {},
  ): Promise<void> {
    const [fila] = await db('tickets')
      .insert({
        numero: `Q-2026-${String(correlativo++).padStart(6, '0')}`,
        solicitante_id: ids.vecino,
        registrado_por: ids.vecino,
        categoria_id: ids[categoria],
        dependencia_id: dependencia === null ? null : ids[dependencia],
        zona_id: ids[zona],
        canal: 'portal',
        titulo: `Queja ${nombre}`,
        descripcion: 'Una descripción suficientemente larga',
        direccion: '5a avenida 3-20',
        estado,
        prioridad: 'media',
        creado_en: creadoEn,
        ...cambios,
      })
      .returning('id');
    ids[nombre] = Number(fila.id);
  }

  const resumen = (quien: string, query = SEPTIEMBRE) =>
    request(app).get(`/api/v1/reportes/resumen${query}`).set('Authorization', `Bearer ${tokens[quien]}`);
  const sumar = (lista: { cantidad: number }[]) => lista.reduce((s, x) => s + x.cantidad, 0);

  it('el supervisor ve los conteos por estado, categoría, dependencia y zona, que suman el total', async () => {
    const res = await resumen('supervisor');
    expect(res.status).toBe(200);
    const r = res.body;
    expect(r.rango).toEqual({ desde: '2026-09-01', hasta: '2026-09-30' });
    expect(r.total).toBe(6);
    expect(r.porEstado).toHaveLength(8);
    expect(Object.fromEntries(r.porEstado.map((e: { estado: string; cantidad: number }) => [e.estado, e.cantidad]))).toEqual({
      nueva: 0,
      en_revision: 1,
      rechazada: 1,
      asignada: 1,
      en_proceso: 1,
      en_espera: 1,
      resuelta: 0,
      cerrada: 1,
    });
    expect(r.porCategoria).toEqual([
      { id: ids.baches, nombre: 'Baches', cantidad: 4 },
      { id: ids.agua, nombre: 'Agua', cantidad: 2 },
    ]);
    expect(r.porDependencia).toEqual([
      { id: ids.A, nombre: 'Dirección de Obras', cantidad: 3 },
      { id: ids.B, nombre: 'Agua Potable', cantidad: 2 },
      { id: null, nombre: null, cantidad: 1 },
    ]);
    expect(r.porZona).toEqual([
      { id: ids.Z1, nombre: 'Zona 1', tipo: 'zona', cantidad: 4 },
      { id: ids.Z2, nombre: 'El Mirador', tipo: 'colonia', cantidad: 2 },
    ]);
    for (const lista of [r.porEstado, r.porCategoria, r.porDependencia, r.porZona]) {
      expect(sumar(lista)).toBe(r.total);
    }
    expect(Date.parse(r.generadoEn)).not.toBeNaN();
    expect((await resumen('administrador')).body.total).toBe(6);
  });

  it('los indicadores: promedios sin los NULL, cumplimiento con la abierta vencida como incumplida y escaladas abiertas', async () => {
    const { indicadores } = (await resumen('supervisor')).body;
    expect(indicadores).toEqual({
      cantidad: 6,
      horasPromedioRespuesta: 6, // (120 + 600) / 2 minutos
      horasPromedioResolucion: 5, // 300 minutos
      cumplimientoRespuesta: { cumple: 2, incumple: 1, pendiente: 1, porcentaje: 66.7 },
      cumplimientoResolucion: { cumple: 1, incumple: 2, pendiente: 1, porcentaje: 33.3 },
      escaladasAbiertas: 1, // T2 está cerrada
    });
  });

  it('el cumplimiento coincide con domain/reportes/cumplimiento.ts sobre el mismo fixture', async () => {
    const ahora = new Date();
    const filas = await db('tickets')
      .where('creado_en', '>=', '2026-09-01T06:00:00Z')
      .where('creado_en', '<', '2026-10-01T06:00:00Z')
      .select('estado', 'vence_respuesta', 'primera_respuesta_en', 'vence_resolucion', 'resuelto_en', 'sla_pausado_desde', 'sla_restante_minutos');
    const contar = (resultados: string[]) => ({
      cumple: resultados.filter((x) => x === 'cumple').length,
      incumple: resultados.filter((x) => x === 'incumple').length,
      pendiente: resultados.filter((x) => x === 'pendiente').length,
    });
    const respuesta = contar(
      filas.map((f) =>
        cumplimientoRespuesta({ venceRespuesta: f.vence_respuesta, primeraRespuestaEn: f.primera_respuesta_en, estado: f.estado }, ahora),
      ),
    );
    const resolucion = contar(
      filas.map((f) =>
        cumplimientoResolucion(
          {
            venceResolucion: f.vence_resolucion,
            resueltoEn: f.resuelto_en,
            estado: f.estado,
            slaPausadoDesde: f.sla_pausado_desde,
            slaRestanteMinutos: f.sla_restante_minutos,
          },
          ahora,
        ),
      ),
    );

    const { indicadores } = (await resumen('supervisor')).body;
    expect(indicadores.cumplimientoRespuesta).toMatchObject(respuesta);
    expect(indicadores.cumplimientoResolucion).toMatchObject(resolucion);
  });

  it('los indicadores por dependencia y por categoría suman los totales', async () => {
    const r = (await resumen('supervisor')).body;
    expect(r.indicadoresPorCategoria.map((g: { nombre: string; cantidad: number }) => [g.nombre, g.cantidad])).toEqual([
      ['Baches', 4],
      ['Agua', 2],
    ]);
    expect(sumar(r.indicadoresPorCategoria)).toBe(r.total);
    // Las quejas sin dependencia (en revisión) no tienen fila por dependencia.
    expect(sumar(r.indicadoresPorDependencia)).toBe(r.total - 1);
    const a = r.indicadoresPorDependencia.find((g: { id: number }) => g.id === ids.A);
    expect(a).toMatchObject({
      nombre: 'Dirección de Obras',
      cantidad: 3,
      horasPromedioRespuesta: 6,
      horasPromedioResolucion: 5,
      cumplimientoResolucion: { cumple: 1, incumple: 1, pendiente: 1, porcentaje: 50 },
      escaladasAbiertas: 1,
    });
    const b = r.indicadoresPorDependencia.find((g: { id: number }) => g.id === ids.B);
    expect(b).toMatchObject({ cantidad: 2, horasPromedioRespuesta: null, horasPromedioResolucion: null });
  });

  it('el borde del día se resuelve en hora de Guatemala', async () => {
    // T6 (31/8 en Guatemala) no entra en septiembre y T7 (30/9 en Guatemala) sí.
    const agosto = (await resumen('supervisor', '?desde=2026-08-31&hasta=2026-08-31')).body;
    expect(agosto.total).toBe(1);
    const fin = (await resumen('supervisor', '?desde=2026-09-30&hasta=2026-09-30')).body;
    expect(fin.porEstado.find((e: { estado: string }) => e.estado === 'rechazada').cantidad).toBe(1);
    expect(fin.total).toBe(1);
  });

  it('el coordinador de A solo cuenta las de A, y con dependenciaId de B recibe todo en 0', async () => {
    const propia = (await resumen('coordinadorA')).body;
    expect(propia.total).toBe(3);
    expect(propia.porDependencia).toEqual([{ id: ids.A, nombre: 'Dirección de Obras', cantidad: 3 }]);

    const ajena = await resumen('coordinadorA', `${SEPTIEMBRE}&dependenciaId=${ids.B}`);
    expect(ajena.status).toBe(200);
    expect(ajena.body.total).toBe(0);
    expect(ajena.body.porCategoria).toEqual([]);
    expect(ajena.body.indicadores).toMatchObject({ cantidad: 0, horasPromedioRespuesta: null });
    expect(ajena.body.indicadores.cumplimientoRespuesta.porcentaje).toBeNull();
  });

  it('el técnico solo cuenta sus asignadas', async () => {
    expect((await resumen('tecnicoA')).body.total).toBe(3); // T1, T2 y T5
    expect((await resumen('tecnicoB')).body.total).toBe(1); // T3
  });

  it('los filtros de categoría, zona y prioridad reducen el resultado', async () => {
    expect((await resumen('supervisor', `${SEPTIEMBRE}&categoriaId=${ids.agua}`)).body.total).toBe(2);
    expect((await resumen('supervisor', `${SEPTIEMBRE}&zonaId=${ids.Z2}`)).body.total).toBe(2);
    expect((await resumen('supervisor', `${SEPTIEMBRE}&prioridad=alta`)).body.total).toBe(1);
  });

  it('el vecino y el receptor → 403; sin sesión → 401', async () => {
    expect((await resumen('vecino')).status).toBe(403);
    expect((await resumen('receptor')).status).toBe(403);
    expect((await request(app).get('/api/v1/reportes/resumen')).status).toBe(401);
  });

  it('un rango de 400 días o invertido → 400 RANGO_INVALIDO; un parámetro desconocido → 400 VALIDACION', async () => {
    const largo = await resumen('supervisor', '?desde=2025-08-01&hasta=2026-09-04');
    expect(largo.status).toBe(400);
    expect(largo.body.codigo).toBe('RANGO_INVALIDO');
    expect((await resumen('supervisor', '?desde=2026-09-30&hasta=2026-09-01')).body.codigo).toBe('RANGO_INVALIDO');
    expect((await resumen('supervisor', `${SEPTIEMBRE}&otro=1`)).body.codigo).toBe('VALIDACION');
  });

  it('sin parámetros cubre los últimos 30 días de Guatemala', async () => {
    const res = await resumen('supervisor', '');
    expect(res.status).toBe(200);
    const { desde, hasta } = res.body.rango;
    expect((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000).toBe(29);
  });
});
