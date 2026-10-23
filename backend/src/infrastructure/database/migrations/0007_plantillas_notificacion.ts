import type { Knex } from 'knex';

// Plantillas de correo como datos (RF-33, SPEC 09). El administrador las podrá editar sin desplegar.
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'recuperacion_password',
    asunto: 'VozMuni: restablece tu contraseña',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Recibimos una solicitud para restablecer tu contraseña de VozMuni.',
      'Abre este enlace en los próximos 30 minutos para elegir una nueva:',
      '',
      '{{enlace}}',
      '',
      'Si no pediste el cambio, ignora este correo. Tu contraseña actual sigue funcionando.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Recibimos una solicitud para restablecer tu contraseña de VozMuni.<br>',
      'Abre este enlace en los próximos 30 minutos para elegir una nueva:</p>',
      '<p><a href="{{enlace}}">{{enlace}}</a></p>',
      '<p>Si no pediste el cambio, ignora este correo. Tu contraseña actual sigue funcionando.</p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'password_cambiado',
    asunto: 'VozMuni: tu contraseña fue cambiada',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'La contraseña de tu cuenta de VozMuni se cambió y se cerraron todas tus sesiones.',
      'Si no fuiste tú, comunícate con la municipalidad.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>La contraseña de tu cuenta de VozMuni se cambió y se cerraron todas tus sesiones.<br>',
      'Si no fuiste tú, comunícate con la municipalidad.</p>',
      '',
    ].join('\n'),
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE plantillas_notificacion (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      clave text NOT NULL UNIQUE CHECK (clave ~ '^[a-z][a-z0-9_]*$'),
      asunto text NOT NULL,
      cuerpo_texto text NOT NULL,
      cuerpo_html text NOT NULL,
      actualizado_en timestamptz NOT NULL DEFAULT now()
    )
  `);

  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP TABLE plantillas_notificacion');
}
