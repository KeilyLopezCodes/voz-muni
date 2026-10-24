import type { ChipProps } from '@mui/material/Chip'
import type { EstadoTicket } from '../api/tickets-api'

// El color acompaña a la etiqueta, que siempre se muestra: el estado no se distingue solo por el color.
export const COLOR_ESTADO: Record<EstadoTicket, ChipProps['color']> = {
  nueva: 'default',
  en_revision: 'info',
  asignada: 'info',
  en_proceso: 'primary',
  en_espera: 'warning',
  resuelta: 'success',
  cerrada: 'default',
  rechazada: 'error',
}
