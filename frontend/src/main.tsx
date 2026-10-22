import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App.tsx'
import { SessionProvider } from './shared/auth/SessionProvider.tsx'

// Sin autenticación todavía: la sesión es siempre null en el navegador.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider session={null}>
      <App />
    </SessionProvider>
  </StrictMode>,
)
