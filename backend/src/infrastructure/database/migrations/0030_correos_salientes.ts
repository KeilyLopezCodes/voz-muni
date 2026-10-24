import type { Knex } from 'knex';

// Bandeja de salida de correos con reintentos (RF-31, SPEC 34) y los correos nuevos al vecino (SPEC 35). El cuerpo
// solo existe mientras el correo está pendiente: al terminar quedan los metadatos.
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
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE correos_salientes (
      id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plantilla_clave text NOT NULL,
      para text NOT NULL,
      asunto text NOT NULL,
      texto text NULL,
      html text NULL,
      ticket_id bigint NULL REFERENCES tickets (id) ON DELETE RESTRICT,
      usuario_id bigint NULL REFERENCES usuarios (id) ON DELETE RESTRICT,
      estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'enviado', 'fallido', 'descartado')),
      intentos integer NOT NULL DEFAULT 0 CHECK (intentos BETWEEN 0 AND 3),
      proximo_intento_en timestamptz NOT NULL DEFAULT now(),
      expira_en timestamptz NULL,
      ultimo_error text NULL,
      creado_en timestamptz NOT NULL DEFAULT now(),
      terminado_en timestamptz NULL,
      CONSTRAINT correos_salientes_cuerpo_solo_pendiente
        CHECK ((estado = 'pendiente') = (texto IS NOT NULL AND html IS NOT NULL)),
      CONSTRAINT correos_salientes_terminado CHECK ((estado = 'pendiente') = (terminado_en IS NULL))
    )
  `);
  await knex.raw(
    `CREATE INDEX correos_salientes_pendientes_idx ON correos_salientes (proximo_intento_en) WHERE estado = 'pendiente'`,
  );
  await knex.raw(`
    ALTER TABLE tickets
      ADD COLUMN aviso_comentario_en timestamptz NULL
  `);
  await knex('parametros')
    .insert({ clave: 'aviso_comentarios_ventana_minutos', valor: JSON.stringify(30) })
    .onConflict('clave')
    .ignore();
  await knex('plantillas_notificacion').insert(PLANTILLAS).onConflict('clave').ignore();
}

export async function down(knex: Knex): Promise<void> {
  await knex('plantillas_notificacion')
    .whereIn(
      'clave',
      PLANTILLAS.map((plantilla) => plantilla.clave),
    )
    .delete();
  await knex('parametros').where({ clave: 'aviso_comentarios_ventana_minutos' }).delete();
  await knex.raw('ALTER TABLE tickets DROP COLUMN aviso_comentario_en');
  await knex.raw('DROP TABLE correos_salientes');
}
