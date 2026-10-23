import { defineConfig } from '@playwright/test'

// Pruebas e2e del formulario de queja (SPEC 18) a 360×740 (RNF-14). La API y las teselas del mapa
// se simulan con page.route, así que no necesitan backend, base de datos ni internet.
// El navegador se instala aparte: npx playwright install chromium.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-360',
      use: { browserName: 'chromium', viewport: { width: 360, height: 740 }, isMobile: false, hasTouch: true },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
