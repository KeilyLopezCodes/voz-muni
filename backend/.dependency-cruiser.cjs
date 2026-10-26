// Reglas de dependencia entre capas (RNF-17).
// presentation → application → domain ← infrastructure; container.ts compone todo.
const FRAMEWORKS = '^node_modules/(@types/)?(express|knex|pg)(/|$)';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'domain-no-capas-externas',
      comment: 'El dominio no depende de ninguna otra capa ni de los puntos de entrada.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^src/(application|presentation|infrastructure)|^src/(container|app|server)\\.ts$' },
    },
    {
      name: 'domain-no-frameworks',
      comment: 'El dominio no conoce Express ni la base de datos.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'domain-no-npm',
      comment: 'El dominio es TypeScript puro: ningún paquete de node_modules.',
      severity: 'error',
      from: { path: '^src/domain' },
      to: { path: '^node_modules' },
    },
    {
      name: 'correo-solo-por-la-bandeja',
      comment:
        'Todo correo pasa por la bandeja de salida (SPEC 34): solo NotificadorCorreo y DespachoCorreosService usan ' +
        'EnviadorCorreo, además del adaptador que lo implementa y del contenedor que lo conecta.',
      severity: 'error',
      from: {
        path: '^src/',
        pathNot:
          '^src/(application/services/(notificador-correo|despacho-correos)\\.service|infrastructure/mail/nodemailer-enviador-correo|container|domain/notificaciones/enviador-correo)\\.ts$',
      },
      to: { path: '^src/domain/notificaciones/enviador-correo\\.ts$' },
    },
    {
      name: 'application-no-capas-externas',
      comment: 'La aplicación usa puertos del dominio, no adaptadores ni HTTP.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: '^src/(presentation|infrastructure)' },
    },
    {
      name: 'application-no-frameworks',
      comment: 'La aplicación no conoce Express ni la base de datos.',
      severity: 'error',
      from: { path: '^src/application' },
      to: { path: FRAMEWORKS },
    },
    {
      name: 'presentation-no-infrastructure',
      comment: 'Los controllers reciben servicios desde container.ts, no adaptadores.',
      severity: 'error',
      from: { path: '^src/presentation' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'infrastructure-no-presentation',
      severity: 'error',
      from: { path: '^src/infrastructure' },
      to: { path: '^src/presentation' },
    },
    {
      name: 'infrastructure-application-solo-jobs',
      comment: 'Solo los jobs llaman a servicios de aplicación, para no duplicar reglas.',
      severity: 'error',
      from: { path: '^src/infrastructure', pathNot: '^src/infrastructure/jobs' },
      to: { path: '^src/application' },
    },
    {
      name: 'entrada-no-infrastructure',
      comment: 'app.ts y server.ts obtienen los adaptadores a través de container.ts.',
      severity: 'error',
      from: { path: '^src/(app|server)\\.ts$' },
      to: { path: '^src/infrastructure' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: { path: '^src' },
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Incluye los `import type`, que también acoplan capas.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
