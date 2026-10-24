import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { createBrowserRouter, RouterProvider } from 'react-router'
import i18n from '../shared/i18n/i18n'
import { CLAVE_MODO, theme } from '../shared/theme/theme'
import { rutasApp } from './router'

// main.tsx los entrega a AuthProvider: limpia la caché al cerrar sesión y navega a /login.
export const queryClient = new QueryClient()
export const router = createBrowserRouter(rutasApp)

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* El modo (claro, oscuro o sistema) se guarda en localStorage[CLAVE_MODO]; por defecto sigue al sistema (SPEC 44). */}
      <ThemeProvider theme={theme} defaultMode="system" modeStorageKey={CLAVE_MODO} disableTransitionOnChange>
        <CssBaseline />
        <I18nextProvider i18n={i18n}>
          <RouterProvider router={router} />
        </I18nextProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
