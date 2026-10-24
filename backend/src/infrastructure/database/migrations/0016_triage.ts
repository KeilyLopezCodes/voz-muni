import type { Knex } from 'knex';

// Triage del supervisor (RF-12, RF-13, SPEC 19): acción tickets.triage y los correos al solicitante.
// Los textos van literales: una migración aplicada no cambia de comportamiento si cambia el código.
const PLANTILLAS = [
  {
    clave: 'queja_aceptada',
    asunto: 'VozMuni: tu queja {{numero}} fue aceptada',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Revisamos tu queja "{{titulo}}" ({{numero}}) y la enviamos a {{dependencia}}, que se encargará de atenderla.',
      'Puedes seguir su avance en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Revisamos tu queja "{{titulo}}" ({{numero}}) y la enviamos a {{dependencia}}, que se encargará de atenderla.<br>',
      'Puedes seguir su avance en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'queja_rechazada',
    asunto: 'VozMuni: tu queja {{numero}} no fue aceptada',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Revisamos tu queja "{{titulo}}" ({{numero}}) y no pudimos aceptarla por este motivo:',
      '',
      '{{motivo}}',
      '',
      'Si crees que es un error, puedes registrar una nueva queja con más detalles. Consulta en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Revisamos tu queja "{{titulo}}" ({{numero}}) y no pudimos aceptarla por este motivo:</p>',
      '<p>{{motivo}}</p>',
      '<p>Si crees que es un error, puedes registrar una nueva queja con más detalles. Consulta en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`UPDATE roles SET permisos = permisos || '{"tickets.triage": "todas"}' WHERE nombre = 'supervisor'`);
  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex.raw(`UPDATE roles SET permisos = permisos - 'tickets.triage' WHERE nombre = 'supervisor'`);
}
