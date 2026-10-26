import 'dotenv/config';

import type { Server } from 'node:http';
import { createApp } from './app';
import { buildContainer } from './container';

const container = buildContainer();
let server: Server | undefined;
let detenerAlertas: (() => void) | undefined;

// La carpeta de adjuntos debe existir antes de recibir subidas (SPEC 24).
async function iniciar(): Promise<void> {
  await container.prepararAlmacen();

  server = createApp(container).listen(container.port, () => {
    console.log(`VozMuni backend escuchando en el puerto ${container.port}`);
    // El job no lo inicia app.ts: así Supertest nunca lo dispara (SPEC 31).
    if (container.alertasSlaActivo) {
      detenerAlertas = container.iniciarAlertasSla();
    } else {
      console.log('Alertas de SLA desactivadas (SLA_ALERTAS_ACTIVO=false)');
    }
  });
}

// Detiene el job, cierra HTTP y luego Knex.
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} recibido, cerrando VozMuni backend`);
  detenerAlertas?.();

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