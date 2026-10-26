import type { Knex } from 'knex';

// Encuesta de satisfacción al cerrar (RF-37, SPEC 39). La tabla encuestas existe desde 0003 (una por queja): aquí se
// acota el comentario y se cargan el plazo para calificar y el umbral de la alerta a los coordinadores.
const PARAMETROS = [
  { clave: 'encuesta_plazo_dias', valor: 30 },
  { clave: 'encuesta_umbral_alerta', valor: 2 },
];

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    'ALTER TABLE encuestas ADD CONSTRAINT encuestas_comentario_largo CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 1000)',
  );
  for (const { clave, valor } of PARAMETROS) {
    await knex.raw('INSERT INTO parametros (clave, valor) VALUES (?, ?::jsonb) ON CONFLICT (clave) DO NOTHING', [
      clave,
      JSON.stringify(valor),
    ]);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex('parametros')
    .whereIn(
      'clave',
      PARAMETROS.map((p) => p.clave),
    )
    .delete();
  await knex.raw('ALTER TABLE encuestas DROP CONSTRAINT encuestas_comentario_largo');
}
