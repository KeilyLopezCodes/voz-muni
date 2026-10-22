// Fronteras entre features (SPEC 06): solo app/ une las features.
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'feature-no-otra-feature',
      comment: 'Una feature no importa otra feature; lo común va en shared/.',
      severity: 'error',
      from: { path: '^src/features/([^/]+)/' },
      to: { path: '^src/features/', pathNot: '^src/features/$1/' },
    },
    {
      name: 'shared-no-features',
      comment: 'shared/ no conoce ninguna feature.',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/features' },
    },
    {
      name: 'shared-no-app',
      comment: 'shared/ no depende de la composición de la app.',
      severity: 'error',
      from: { path: '^src/shared' },
      to: { path: '^src/app' },
    },
    {
      name: 'features-no-app',
      comment: 'Las features no dependen de la composición de la app.',
      severity: 'error',
      from: { path: '^src/features' },
      to: { path: '^src/app' },
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
    // Incluye los `import type`, que también acoplan módulos.
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.app.json' },
  },
}
