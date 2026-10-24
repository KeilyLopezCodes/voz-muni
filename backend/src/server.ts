import type { Server } from 'node:http';
import { createApp } from './app';
import { buildContainer } from './container';

const container = buildContainer();
let server: Server | undefined;

// La carpeta de adjuntos debe existir antes de recibir subidas (SPEC 24).
async function iniciar(): Promise<void> {
  await container.prepararAlmacen();
  server = createApp(container).listen(container.port, () => {
    console.log(`VozMuni backend escuchando en el puerto ${container.port}`);
  });
}

// Cierra primero HTTP y luego Knex, para no dejar conexiones colgadas en Postgres.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} recibido, cerrando VozMuni backend`);
  const cerrarBase = async () => {
    await container.dispose();
    process.exit(0);
  };
  if (server) {
    server.close(() => void cerrarBase());
  } else {
    void cerrarBase();
  }
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

iniciar().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
