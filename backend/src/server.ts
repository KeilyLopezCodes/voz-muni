import { createApp } from './app';
import { buildContainer } from './container';

const container = buildContainer();

const server = createApp(container).listen(container.port, () => {
  console.log(`VozMuni backend escuchando en el puerto ${container.port}`);
});

// Cierra primero HTTP y luego Knex, para no dejar conexiones colgadas en Postgres.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} recibido, cerrando VozMuni backend`);
  server.close(async () => {
    await container.dispose();
    process.exit(0);
  });
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
