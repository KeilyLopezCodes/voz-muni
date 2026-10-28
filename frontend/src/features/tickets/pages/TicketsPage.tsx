import { useSession } from '../../../shared/auth/session'
import { ListadoInterno } from '../listado/ListadoInterno'
import { MisQuejas } from '../mis-quejas/MisQuejas'

// El vecino ve "Mis quejas" (SPEC 25 y 38); los demás roles, el listado de consulta de su alcance (SPEC 45).
export function TicketsPage() {
  const session = useSession()
  return session?.rol === 'vecino' ? <MisQuejas /> : <ListadoInterno />
}
