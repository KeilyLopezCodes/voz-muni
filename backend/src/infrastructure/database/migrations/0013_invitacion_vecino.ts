import type { Knex } from 'knex';

// Invitación al vecino dado de alta en ventanilla (RF-07, SPEC 13).
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLA = {
  clave: 'invitacion_vecino',
  asunto: 'VozMuni: sigue tus quejas en el portal',
  cuerpo_texto: [
    'Hola {{nombre}}:',
    '',
    'La municipalidad te registró en VozMuni para atender tu queja.',
    'Si quieres seguirla y presentar nuevas quejas desde el portal, define tu contraseña',
    'con este enlace en las próximas 24 horas:',
    '',
    '{{enlace}}',
    '',
    'Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.',
    'Sin contraseña también puedes consultar tus quejas con su número y tu correo o teléfono.',
    '',
  ].join('\n'),
  cuerpo_html: [
    '<p>Hola {{nombre}}:</p>',
    '<p>La municipalidad te registró en VozMuni para atender tu queja.<br>',
    'Si quieres seguirla y presentar nuevas quejas desde el portal, define tu contraseña',
    'con este enlace en las próximas 24 horas:</p>',
    '<p><a href="{{enlace}}">{{enlace}}</a></p>',
    '<p>Si el enlace vence, usa "Olvidé mi contraseña" con este mismo correo.<br>',
    'Sin contraseña también puedes consultar tus quejas con su número y tu correo o teléfono.</p>',
    '',
  ].join('\n'),
};

export async function up(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion').insert(PLANTILLA).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion').where({ clave: PLANTILLA.clave }).delete();
}
