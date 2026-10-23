import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { useSession } from '../../../shared/auth/session'
import { FormularioQueja } from '../registro/FormularioQueja'

// La ruta solo admite a vecino, receptor y supervisor (SPEC 06); el rol decide los pasos.
export function NuevoTicketPage() {
  const { t } = useTranslation('tickets')
  const session = useSession()
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('nuevo.titulo')}
      </Typography>
      {session && <FormularioQueja rol={session.rol} />}
    </>
  )
}
