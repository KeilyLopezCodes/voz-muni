// Nunito Sans autoalojada (SPEC 44): solo el subconjunto latino y los pesos que usa el tema.
import '@fontsource/nunito-sans/latin-400.css'
import '@fontsource/nunito-sans/latin-600.css'
import '@fontsource/nunito-sans/latin-700.css'
import '@fontsource/nunito-sans/latin-800.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App, { queryClient, router } from './app/App.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'

// AuthProvider recupera y mantiene la sesión real (SPEC 17) y la entrega a SessionProvider.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider queryClient={queryClient} irALogin={() => void router.navigate('/login')}>
      <App />
    </AuthProvider>
  </StrictMode>,
)
