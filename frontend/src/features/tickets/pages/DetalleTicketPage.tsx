import { useParams } from 'react-router'
import { DetalleQueja } from '../mis-quejas/DetalleQueja'

// /tickets/:id (SPEC 25). Un id que no es un número se trata como una queja que no existe.
export function DetalleTicketPage() {
  const { id } = useParams()
  const numero = Number(id)
  return <DetalleQueja ticketId={Number.isInteger(numero) && numero > 0 ? numero : null} />
}
