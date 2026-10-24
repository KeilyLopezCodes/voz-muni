import type { Knex } from 'knex';

// Confirmar o reabrir la solución (RF-24, SPEC 27): plazo guardado al resolver, contador de reaperturas,
// parámetros municipales y correos al solicitante.
// Los textos y valores van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'queja_cerrada',
    asunto: 'VozMuni: tu queja {{numero}} fue cerrada',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Tu queja "{{titulo}}" ({{numero}}) quedó cerrada con la solución confirmada. Gracias por ayudarnos a mejorar.',
      'Puedes consultarla en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Tu queja "{{titulo}}" ({{numero}}) quedó cerrada con la solución confirmada. Gracias por ayudarnos a mejorar.<br>',
      'Puedes consultarla en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'queja_reabierta',
    asunto: 'VozMuni: reabrimos tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Reabrimos tu queja "{{titulo}}" ({{numero}}) por este motivo:',
      '',
      '{{motivo}}',
      '',
      'El mismo equipo la volverá a atender. Puedes seguir su avance en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Reabrimos tu queja "{{titulo}}" ({{numero}}) por este motivo:</p>',
      '<p>{{motivo}}</p>',
      '<p>El mismo equipo la volverá a atender. Puedes seguir su avance en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
];

const PARAMETROS = [
  { clave: 'plazo_confirmacion_dias_habiles', valor: 5 },
  { clave: 'max_reaperturas', valor: 2 },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN confirmacion_vence_en timestamptz NULL,
      ADD COLUMN reaperturas integer NOT NULL DEFAULT 0 CONSTRAINT tickets_reaperturas_no_negativas CHECK (reaperturas >= 0)
  `);

  for (const { clave, valor } of PARAMETROS) {
    await knex.raw('INSERT INTO parametros (clave, valor) VALUES (?, ?::jsonb) ON CONFLICT (clave) DO NOTHING', [
      clave,
      JSON.stringify(valor),
    ]);
  }
  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();

  // Cada paso de resuelta a en_proceso en el historial es una reapertura.
  await knex.raw(`
    UPDATE tickets t
       SET reaperturas = h.cantidad
      FROM (
        SELECT ticket_id, count(*) AS cantidad
          FROM ticket_historial
         WHERE estado_anterior = 'resuelta' AND estado_nuevo = 'en_proceso'
         GROUP BY ticket_id
      ) h
     WHERE h.ticket_id = t.id
  `);

  // Misma regla que calcularVencimientoConfirmacion: fin (23:59:59.999 en Guatemala) del N-ésimo día hábil
  // posterior a la fecha local de resuelto_en. Sin días hábiles suficientes, queda NULL.
  await knex.raw(`
    WITH plazo AS (
      SELECT (valor #>> '{}')::integer AS dias FROM parametros WHERE clave = 'plazo_confirmacion_dias_habiles'
    ),
    vencimientos AS (
      SELECT t.id,
             (SELECT c.fecha
                FROM calendario_laboral c
               WHERE c.es_habil
                 AND c.fecha > (t.resuelto_en AT TIME ZONE 'America/Guatemala')::date
               ORDER BY c.fecha
              OFFSET (SELECT dias - 1 FROM plazo)
               LIMIT 1) AS fecha
        FROM tickets t
       WHERE t.estado IN ('resuelta', 'cerrada') AND t.resuelto_en IS NOT NULL
    )
    UPDATE tickets t
       SET confirmacion_vence_en = (v.fecha + time '23:59:59.999') AT TIME ZONE 'America/Guatemala'
      FROM vencimientos v
     WHERE v.id = t.id AND v.fecha IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex('parametros')
    .whereIn(
      'clave',
      PARAMETROS.map((parametro) => parametro.clave),
    )
    .delete();
  await knex.raw(`
    ALTER TABLE tickets
      DROP COLUMN reaperturas,
      DROP COLUMN confirmacion_vence_en
  `);
}
