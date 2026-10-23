import type { Knex } from 'knex';

// Invitaciones de usuarios internos (RF-04, SPEC 10): reutilizan restablecimientos con un tipo propio.
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'invitacion_usuario',
    asunto: 'VozMuni: activa tu cuenta',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'La municipalidad creó tu cuenta de VozMuni con el rol {{rol}}.',
      'Abre este enlace en las próximas 24 horas para definir tu contraseña:',
      '',
      '{{enlace}}',
      '',
      'Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>La municipalidad creó tu cuenta de VozMuni con el rol {{rol}}.<br>',
      'Abre este enlace en las próximas 24 horas para definir tu contraseña:</p>',
      '<p><a href="{{enlace}}">{{enlace}}</a></p>',
      '<p>Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.</p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'cuenta_desactivada',
    asunto: 'VozMuni: tu cuenta fue desactivada',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Tu cuenta de VozMuni fue desactivada y se cerraron todas tus sesiones.',
      'Si crees que es un error, comunícate con el administrador del sistema.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Tu cuenta de VozMuni fue desactivada y se cerraron todas tus sesiones.<br>',
      'Si crees que es un error, comunícate con el administrador del sistema.</p>',
      '',
    ].join('\n'),
  },
];

export async function up(knex: Knex): Promise<void> {
  // recuperacion vence en 30 min y avisa al usarse; invitacion vence en 24 h y no avisa.
  await knex.raw(`
    ALTER TABLE restablecimientos
      ADD COLUMN tipo text NOT NULL DEFAULT 'recuperacion' CHECK (tipo IN ('recuperacion', 'invitacion'))
  `);

  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex.raw('ALTER TABLE restablecimientos DROP COLUMN tipo');
}
