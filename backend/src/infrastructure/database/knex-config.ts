import path from 'node:path';
import type { Knex } from 'knex';

interface PgConnection {
  query(sql: string, callback: (error: Error | null) => void): void;
}

// Única configuración de Knex para la app, la CLI y las pruebas.
export function buildKnexConfig(url: string): Knex.Config {
  return {
    client: 'pg',
    connection: url,
    pool: {
      // RNF-23: la sesión trabaja en UTC sin depender de la configuración del servidor.
      afterCreate: (connection: PgConnection, done: (error: Error | null, connection: PgConnection) => void) => {
        connection.query("SET TIME ZONE 'UTC'", (error) => done(error, connection));
      },
    },
    migrations: {
      directory: path.join(__dirname, 'migrations'),
      // Ignora los .d.ts y .map que emite tsc junto a cada migración.
      loadExtensions: ['.js'],
      tableName: 'knex_migrations',
    },
  };
}
