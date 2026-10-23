import type { Knex } from 'knex';

// Verificación de correo del vecino que se registra en el portal (RF-01, SPEC 16).
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'verificacion_correo',
    asunto: 'VozMuni: confirma tu correo',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Gracias por registrarte en VozMuni. Confirma tu correo abriendo este enlace',
      'en las próximas 24 horas:',
      '',
      '{{enlace}}',
      '',
      'Si no fuiste tú, ignora este correo y la cuenta no se activará.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Gracias por registrarte en VozMuni. Confirma tu correo abriendo este enlace',
      'en las próximas 24 horas:</p>',
      '<p><a href="{{enlace}}">{{enlace}}</a></p>',
      '<p>Si no fuiste tú, ignora este correo y la cuenta no se activará.</p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'cuenta_existente',
    asunto: 'VozMuni: ya tienes una cuenta',
    cuerpo_texto: [
      'Hola:',
      '',
      'Alguien intentó crear una cuenta de VozMuni con este correo, pero ya existe una.',
      'Si fuiste tú y no recuerdas tu contraseña, usa "Olvidé mi contraseña" en el portal.',
      'Si no fuiste tú, ignora este correo.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola:</p>',
      '<p>Alguien intentó crear una cuenta de VozMuni con este correo, pero ya existe una.<br>',
      'Si fuiste tú y no recuerdas tu contraseña, usa "Olvidé mi contraseña" en el portal.<br>',
      'Si no fuiste tú, ignora este correo.</p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'registro_no_completado',
    asunto: 'VozMuni: no pudimos crear tu cuenta',
    cuerpo_texto: [
      'Hola:',
      '',
      'No pudimos crear tu cuenta de VozMuni con los datos ingresados.',
      'Si ya registraste una queja en la municipalidad, usa "Olvidé mi contraseña" con el',
      'correo que diste en ventanilla, o acércate a la municipalidad para revisar tus datos.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola:</p>',
      '<p>No pudimos crear tu cuenta de VozMuni con los datos ingresados.<br>',
      'Si ya registraste una queja en la municipalidad, usa "Olvidé mi contraseña" con el',
      'correo que diste en ventanilla, o acércate a la municipalidad para revisar tus datos.</p>',
      '',
    ].join('\n'),
  },
];

export async function up(knex: Knex): Promise<void> {
  // Sin verificar no se inicia sesión: quienes ya tienen contraseña quedan verificados para no bloquearlos.
  await knex.raw('ALTER TABLE usuarios ADD COLUMN correo_verificado_en timestamptz NULL');
  await knex.raw(
    'UPDATE usuarios SET correo_verificado_en = now() WHERE password_hash IS NOT NULL AND email IS NOT NULL',
  );

  await knex.raw(`
    ALTER TABLE restablecimientos
      DROP CONSTRAINT restablecimientos_tipo_check,
      ADD CONSTRAINT restablecimientos_tipo_check CHECK (tipo IN ('recuperacion', 'invitacion', 'verificacion'))
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
  await knex('restablecimientos').where({ tipo: 'verificacion' }).delete();
  await knex.raw(`
    ALTER TABLE restablecimientos
      DROP CONSTRAINT restablecimientos_tipo_check,
      ADD CONSTRAINT restablecimientos_tipo_check CHECK (tipo IN ('recuperacion', 'invitacion'))
  `);
  await knex.raw('ALTER TABLE usuarios DROP COLUMN correo_verificado_en');
}
