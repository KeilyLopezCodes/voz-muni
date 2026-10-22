import { useQuery } from '@tanstack/react-query'
import { rootClient } from './http-client'

export type EstadoServidor = 'verificando' | 'disponible' | 'no-disponible'

// /health responde 503 con la base caída (SPEC 02): eso también cuenta como no disponible.
export function useEstadoServidor(): EstadoServidor {
  const { isPending, isError } = useQuery({
    queryKey: ['estado-servidor'],
    queryFn: () => rootClient.get<unknown>('/health'),
    retry: false,
  })
  if (isPending) return 'verificando'
  return isError ? 'no-disponible' : 'disponible'
}
