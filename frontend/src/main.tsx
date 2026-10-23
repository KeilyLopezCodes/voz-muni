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
