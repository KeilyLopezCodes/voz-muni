import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

export function TicketsPage() {
  const { t } = useTranslation(['tickets', 'comun'])
  return (
    <>
      <Typography variant="h4" component="h1" gutterBottom>
        {t('tickets:listado.titulo')}
      </Typography>
      <Typography>{t('comun:placeholder.proximamente')}</Typography>
    </>
  )
}
