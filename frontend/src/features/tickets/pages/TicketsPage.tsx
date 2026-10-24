import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../../shared/auth/session'
import { MisQuejas } from '../mis-quejas/MisQuejas'

// El vecino ve "Mis quejas" (SPEC 25). Los internos trabajan en /triage, /asignacion y /atencion: su listado
// llega con RF-36.
export function TicketsPage() {
  const { t } = useTranslation(['tickets', 'comun'])
  const session = useSession()
  if (session?.rol === 'vecino') {
    return <MisQuejas />
  }
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('tickets:listado.titulo')}
      </Typography>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </>
  )
}
