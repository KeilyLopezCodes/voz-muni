import type { Knex } from 'knex';
import type { UsuarioAutenticado } from '../../src/application/dto/auth.dto';
import { ReportesService } from '../../src/application/services/reportes.service';
import { SystemClock } from '../../src/infrastructure/clock/system-clock';
import { KnexReporteLecturaRepository } from '../../src/infrastructure/repositories/knex-reporte-lectura-repository';
import { createTestKnex, reiniciarEsquema } from './knex-test';

const QUEJAS = 500_000;
const LLAMADAS = 20;
const P95_MAXIMO_MS = 500;

// Rendimiento del tablero (SPEC 43, RNF-01 y RNF-04): 500 000 quejas sintéticas y un rango de 366 días como
// supervisor. No forma parte de `npm run test:db`; se ejecuta a pedido con `npm run test:rendimiento`.
describe('rendimiento de GET /reportes/resumen (SPEC 43)', () => {
  let db: Knex;

  beforeAll(async () => {
    db = createTestKnex();
    await reiniciarEsquema(db);
    await db.migrate.latest();

    const dependencias = await db('dependencias')
      .insert(Array.from({ length: 10 }, (_, i) => ({ nombre: `Dependencia ${i + 1}` })))
      .returning('id');
    const categorias = await db('categorias')
      .insert(Array.from({ length: 20 }, (_, i) => ({ nombre: `Categoría ${i + 1}`, dependencia_id: dependencias[i % 10].id })))
      .returning('id');
    const zonas = await db('zonas')
      .insert(Array.from({ length: 30 }, (_, i) => ({ nombre: `Zona ${i + 1}`, tipo: 'zona' })))
      .returning('id');
    const { id: rolId } = await db('roles').where({ nombre: 'vecino' }).first('id');
    const [vecino] = await db('usuarios').insert({ nombre: 'Vecino', email: 'vecino@rendimiento.test', rol_id: rolId }).returning('id');

    // Estados, prioridades, fechas y minutos repartidos por módulo: abiertas, resueltas y cerradas, dentro y fuera
    // de plazo, a lo largo de 400 días.
    await db.raw(
      `
      INSERT INTO tickets (
        numero, solicitante_id, registrado_por, categoria_id, dependencia_id, zona_id, canal, titulo, descripcion,
        direccion, estado, prioridad, creado_en, vence_respuesta, primera_respuesta_en, sla_inicio_resolucion,
        vence_resolucion, resuelto_en, cerrado_en, minutos_respuesta, minutos_resolucion
      )
      SELECT
        'Q-2026-' || lpad(g::text, 6, '0'), ?, ?,
        (?::bigint[])[1 + g % 20], (?::bigint[])[1 + (g % 20) % 10], (?::bigint[])[1 + g % 30],
        'portal', 'Queja sintética de rendimiento', 'Descripción de una queja sintética de rendimiento',
        'Dirección sintética',
        (ARRAY['asignada', 'en_proceso', 'resuelta', 'cerrada'])[1 + g % 4]::estado_ticket,
        (ARRAY['baja', 'media', 'alta', 'urgente'])[1 + g % 4],
        c.creado, c.creado + interval '8 hours', c.creado + (g % 16) * interval '1 hour', c.creado,
        c.creado + interval '48 hours',
        CASE WHEN g % 4 >= 2 THEN c.creado + (g % 72) * interval '1 hour' END,
        CASE WHEN g % 4 = 3 THEN c.creado + interval '100 hours' END,
        (g % 900), CASE WHEN g % 4 >= 2 THEN (g % 2800) END
      FROM generate_series(1, ?) AS g
      CROSS JOIN LATERAL (SELECT now() - (g % 400) * interval '1 day' - (g % 1440) * interval '1 minute' AS creado) AS c
      `,
      [
        vecino.id,
        vecino.id,
        categorias.map((c: { id: string }) => c.id),
        dependencias.map((d: { id: string }) => d.id),
        zonas.map((z: { id: string }) => z.id),
        QUEJAS,
      ],
    );
    await db.raw('ANALYZE tickets');
  }, 600_000);

  afterAll(async () => {
    try {
      await reiniciarEsquema(db);
    } finally {
      await db.destroy();
    }
  }, 600_000);

  it(`el p95 de ${LLAMADAS} resúmenes de 366 días es menor a ${P95_MAXIMO_MS} ms`, async () => {
    const servicio = new ReportesService(new KnexReporteLecturaRepository(db), new SystemClock());
    const supervisor: UsuarioAutenticado = {
      id: 1,
      nombre: 'Supervisor',
      rol: 'supervisor',
      dependenciaId: null,
      permisos: { 'reportes.ver': 'todas' },
    };
    const hasta = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
    const desde = new Date(Date.parse(`${hasta}T00:00:00Z`) - 365 * 86_400_000).toISOString().slice(0, 10);

    const tiempos: number[] = [];
    let total = 0;
    for (let i = 0; i < LLAMADAS; i++) {
      const inicio = performance.now();
      total = (await servicio.resumen(supervisor, { desde, hasta })).total;
      tiempos.push(performance.now() - inicio);
    }
    tiempos.sort((a, b) => a - b);
    const p95 = tiempos[Math.ceil(tiempos.length * 0.95) - 1];
    console.info(`Resumen de ${total} quejas en 366 días: p50 ${tiempos[LLAMADAS / 2].toFixed(0)} ms, p95 ${p95.toFixed(0)} ms`);

    expect(total).toBeGreaterThan(400_000);
    expect(p95).toBeLessThan(P95_MAXIMO_MS);
  }, 600_000);
});
