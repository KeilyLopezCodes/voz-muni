import type { Knex } from 'knex';

// Cierre automático de las quejas resueltas (RF-30, SPEC 33) y el aviso al resolver, que tiene que llegar antes de
// que el sistema cierre. Los textos van literales: una migración aplicada no cambia si cambia el código.
const PLANTILLAS = [
  {
    clave: 'queja_resuelta',
    asunto: 'VozMuni: resolvimos tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Resolvimos tu queja "{{titulo}}" ({{numero}}). Esta es la solución:',
      '',
      '{{solucion}}',
      '',
      'Tienes hasta el {{fecha_limite}} para confirmar la solución o reabrir la queja en {{enlace}}',
      'Si no respondes antes de esa fecha, la cerraremos.',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Resolvimos tu queja "{{titulo}}" ({{numero}}). Esta es la solución:</p>',
      '<p>{{solucion}}</p>',
      '<p>Tienes hasta el {{fecha_limite}} para confirmar la solución o reabrir la queja en <a href="{{enlace}}">{{enlace}}</a><br>',
      'Si no respondes antes de esa fecha, la cerraremos.</p>',
      '',
    ].join('\n'),
  },
  {
    clave: 'queja_cerrada_automaticamente',
    asunto: 'VozMuni: cerramos tu queja {{numero}}',
    cuerpo_texto: [
      'Hola {{nombre}}:',
      '',
      'Cerramos tu queja "{{titulo}}" ({{numero}}) porque venció el plazo para confirmar la solución.',
      'Puedes consultarla en {{enlace}}',
      '',
    ].join('\n'),
    cuerpo_html: [
      '<p>Hola {{nombre}}:</p>',
      '<p>Cerramos tu queja "{{titulo}}" ({{numero}}) porque venció el plazo para confirmar la solución.<br>',
      'Puedes consultarla en <a href="{{enlace}}">{{enlace}}</a></p>',
      '',
    ].join('\n'),
  },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE INDEX tickets_confirmacion_pendiente_idx ON tickets (confirmacion_vence_en) WHERE estado = 'resuelta'`,
  );
  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex.raw('DROP INDEX tickets_confirmacion_pendiente_idx');
}
