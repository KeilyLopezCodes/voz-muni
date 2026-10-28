import { useSession } from '../../../shared/auth/session'
import { ListadoGestion } from '../gestion/ListadoGestion'
import { MisQuejas } from '../mis-quejas/MisQuejas'

// El vecino ve "Mis quejas" (SPEC 25). Los internos, el listado de las quejas de su alcance (SPEC 45).
export function TicketsPage() {
  const session = useSession()
  return session?.rol === 'vecino' ? <MisQuejas /> : <ListadoGestion />
}
