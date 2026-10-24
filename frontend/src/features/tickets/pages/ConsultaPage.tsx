import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { PantallaPublica } from '../../../shared/layout/PantallaPublica'

// Consulta pública del estado de una queja (RF-35).
export function ConsultaPage() {
  const { t } = useTranslation(['tickets', 'comun'])
  return (
    <PantallaPublica titulo={t('tickets:consulta.titulo')}>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </PantallaPublica>
  )
}
