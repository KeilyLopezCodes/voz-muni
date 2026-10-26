import type { Knex } from 'knex';

// Correos nuevos al vecino (RF-31, SPEC 35): información solicitada, primer técnico asignado, traslado y comentarios
// públicos, con el estado de la ventana de avisos de comentarios en tickets y su parámetro.
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'informacion_solicitada',
    asunto: 'VozMuni: necesitamos información sobre tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Para continuar con tu queja "{{titulo}}" ({{numero}}) necesitamos esta información:',
      '',
      '{{informacion}}',
      '',
      'Inicia sesión en VozMuni y responde desde "Mis quejas". Mientras esperamos tu respuesta, el plazo de atención queda en pausa.',
      'Consulta el estado en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Para continuar con tu queja "{{titulo}}" ({{numero}}) necesitamos esta información:</p>',
      '<p>{{informacion}}</p>',
      '<p>Inicia sesión en VozMuni y responde desde "Mis quejas". Mientras esperamos tu respuesta, el plazo de atención queda en pausa.<br>',
      'Consulta el estado en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'tecnico_asignado',
    asunto: 'VozMuni: ya atendemos tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Un técnico de {{dependencia}} ya está atendiendo tu queja "{{titulo}}" ({{numero}}).',
      'Consulta el estado en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Un técnico de {{dependencia}} ya está atendiendo tu queja "{{titulo}}" ({{numero}}).<br>',
      'Consulta el estado en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'queja_trasladada',
    asunto: 'VozMuni: tu queja {{numero}} cambió de área',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Tu queja "{{titulo}}" ({{numero}}) se envió a revisión para que la atienda el área que corresponde.',
      'Consulta el estado en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Tu queja "{{titulo}}" ({{numero}}) se envió a revisión para que la atienda el área que corresponde.<br>',
      'Consulta el estado en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'comentario_publico',
    asunto: 'VozMuni: tienes un comentario nuevo en tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'La municipalidad dejó un comentario en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlo en "Mis quejas".',
      'Consulta el estado en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>La municipalidad dejó un comentario en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlo en "Mis quejas".<br>',
      'Consulta el estado en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'comentarios_publicos_agrupados',
    asunto: 'VozMuni: tienes {{cantidad}} comentarios nuevos en tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'La municipalidad dejó {{cantidad}} comentarios en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlos en "Mis quejas".',
      'Consulta el estado en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>La municipalidad dejó {{cantidad}} comentarios en tu queja "{{titulo}}" ({{numero}}). Inicia sesión en VozMuni para leerlos en "Mis quejas".<br>',
      'Consulta el estado en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
];

const VENTANA = { clave: 'aviso_comentarios_ventana_minutos', valor: 30 };

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN aviso_comentario_en timestamptz NULL,
      ADD COLUMN avisos_comentario_pendientes integer NOT NULL DEFAULT 0
        CONSTRAINT tickets_avisos_comentario_pendientes_no_negativo CHECK (avisos_comentario_pendientes >= 0)
  `);
  await knex.raw(
    'CREATE INDEX tickets_avisos_comentario_pendientes_idx ON tickets (aviso_comentario_en) WHERE avisos_comentario_pendientes > 0',
  );
  await knex.raw('INSERT INTO parametros (clave, valor) VALUES (?, ?::jsonb) ON CONFLICT (clave) DO NOTHING', [
    VENTANA.clave,
    JSON.stringify(VENTANA.valor),
  ]);
  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex('parametros').where({ clave: VENTANA.clave }).delete();
  await knex.raw('DROP INDEX tickets_avisos_comentario_pendientes_idx');
  await knex.raw('ALTER TABLE tickets DROP COLUMN avisos_comentario_pendientes, DROP COLUMN aviso_comentario_en');
}
