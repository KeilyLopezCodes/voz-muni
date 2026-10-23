import type { Knex } from 'knex';

// Registro de quejas (RF-06, RF-08, SPEC 12). Los textos van literales: una migración aplicada no cambia si cambia el código.
const PLANTILLA = {
  clave: 'queja_registrada',
  asunto: 'VozMuni: recibimos tu queja {{numero}}',
  cuerpo_texto: [
    'Hola {{nombre}}:',
    '',
    'Registramos tu queja "{{titulo}}" con el número {{numero}}.',
    'Guarda este número: con él y tu correo o teléfono puedes consultar el avance en',
    '',
    '{{enlace}}',
    '',
    'Te avisaremos por correo cuando cambie de estado.',
    '',
  ].join('\n'),
  cuerpo_html: [
    '<p>Hola {{nombre}}:</p>',
    '<p>Registramos tu queja "{{titulo}}" con el número <strong>{{numero}}</strong>.<br>',
    'Guarda este número: con él y tu correo o teléfono puedes consultar el avance en</p>',
    '<p><a href="{{enlace}}">{{enlace}}</a></p>',
    '<p>Te avisaremos por correo cuando cambie de estado.</p>',
    '',
  ].join('\n'),
};

export async function up(knex: Knex): Promise<void> {
  // Sin DEFAULT: falla si ya hay tickets, y ningún código los crea antes de esta spec.
  // Los límites de tamaño también se validan en el dominio y en Zod.
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN titulo text NOT NULL CHECK (char_length(titulo) BETWEEN 5 AND 150),
      ADD COLUMN descripcion text NOT NULL CHECK (char_length(descripcion) BETWEEN 10 AND 4000)
  `);

  // Último correlativo usado por año (en America/Guatemala). Se incrementa en la transacción del ticket: sin huecos.
  await knex.raw(`
    CREATE TABLE correlativos (
      anio smallint PRIMARY KEY CHECK (anio BETWEEN 2000 AND 9999),
      ultimo integer NOT NULL CHECK (ultimo BETWEEN 0 AND 999999)
    )
  `);

  await knex('plantillas_notificacion').insert(PLANTILLA).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion').where({ clave: PLANTILLA.clave }).delete();
  await knex.raw('DROP TABLE correlativos');
  await knex.raw('ALTER TABLE tickets DROP COLUMN descripcion, DROP COLUMN titulo');
}
